import { findOverlappingPresenceRules } from '../../packages/materialization/src/presence-rule-conflicts.js';
import { presenceDiscoveryModeConfiguration } from '../../packages/materialization/src/presence-rules-first-arrival.js';
import { validateNpcRoutineProfile } from '@rus/npc-runtime';
import { SCHEDULE_DAY_TYPES } from '../../scripts/generate-m2c-npc-wave-datasets.mjs';

const SEASON_MONTHS = Object.freeze({
  winter: [12, 1, 2],
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
});
const COMPOSITION_SUBJECT_KINDS = new Set(['occupation', 'social_role', 'household_member']);

export const M2C_NPC_WAVE_TABLE_SET = Object.freeze([
  'place_families',
  'spatial_node_place_family_bindings',
  'presence_rules',
  'npc_relationship_materialization_rules',
  'speech_address_forms',
  'household_composition_profiles',
  'slot_instance_variants',
  'water_body_presence_facets',
  'fauna_phase_activity_rules',
  'npc_schedule_routine_rules',
  'place_population_composition_rules',
]);
const WAVE_TABLES = new Set(M2C_NPC_WAVE_TABLE_SET);

export function manifestIncludesWaveTables(manifest) {
  const tables = new Set((manifest?.datasets ?? []).map((dataset) => dataset.table));
  return M2C_NPC_WAVE_TABLE_SET.some((table) => tables.has(table));
}

export function bundleIncludesWaveTables(manifest, datasets) {
  if (manifestIncludesWaveTables(manifest)) return true;
  return M2C_NPC_WAVE_TABLE_SET.some((table) => datasets?.has(table));
}

export function validateM2cNpcWaveBundle(manifest, datasets, errors) {
  if (!bundleIncludesWaveTables(manifest, datasets)) return;
  if (manifest.bundle_kind !== 'dependency_closure') {
    errors.push(issue('M2C_WAVE_BUNDLE_KIND_INVALID', String(manifest.bundle_kind ?? '')));
  }
  if ((manifest.data_gaps ?? []).length) {
    errors.push(issue('M2C_WAVE_DATA_GAPS_NONEMPTY', String(manifest.data_gaps.length)));
  }
  const placeFamilyIds = new Set((datasets.get('place_families') ?? []).map((row) => row.id));
  for (const rule of datasets.get('presence_rules') ?? []) {
    validateWaveRowRevision(manifest, 'presence_rules', rule, rule.rule_id, errors);
    validateWaveRowProvenance('presence_rules', rule, rule.rule_id, errors);
    validatePresenceRuleVariants(rule, errors);
    const discoveryMode = presenceDiscoveryModeConfiguration(rule);
    if (!discoveryMode.ok) {
      const code = {
        modes: 'M2C_WAVE_PRESENCE_DISCOVERY_MODE_INVALID',
        weights: 'M2C_WAVE_PRESENCE_DISCOVERY_WEIGHTS_INVALID',
        non_item_fields: 'M2C_WAVE_NON_ITEM_DISCOVERY_FIELDS_FORBIDDEN',
      }[discoveryMode.reason] ?? 'M2C_WAVE_PRESENCE_DISCOVERY_MODE_INVALID';
      errors.push(issue(code, rule.rule_id));
    }
    if (rule.scope_kind === 'place_family' && !placeFamilyIds.has(rule.scope_ref)) {
      errors.push(issue('M2C_WAVE_PRESENCE_SCOPE_UNKNOWN', `${rule.rule_id}:${rule.scope_ref}`));
    }
    if ((rule.subject_kind === 'occupation' || rule.subject_kind === 'social_role')
      && Array.isArray(rule.allowed_times) && rule.allowed_times.length > 0) {
      errors.push(issue('M2C_WAVE_PEOPLE_ALLOWED_TIMES_FORBIDDEN', `${rule.rule_id}:${rule.subject_kind}`));
    }
  }
  for (const table of WAVE_TABLES) {
    if (table === 'presence_rules') continue;
    for (const row of datasets.get(table) ?? []) {
      const rowRef = waveRowRef(table, row);
      validateWaveRowRevision(manifest, table, row, rowRef, errors);
      validateWaveRowProvenance(table, row, rowRef, errors);
    }
  }
  const overlaps = findOverlappingPresenceRules(datasets.get('presence_rules') ?? []);
  for (const message of overlaps) errors.push(issue('M2C_WAVE_PRESENCE_C4_CONFLICT', message));
  validateCompositionPresencePriority(datasets, errors);
  validateScheduleRoutineRules(datasets, placeFamilyIds, errors);
  validatePlacePopulationCompositionRules(datasets, placeFamilyIds, errors);
  const bindings = datasets.get('spatial_node_place_family_bindings') ?? [];
  const nodeRows = datasets.get('spatial_v3_nodes');
  if (bindings.length && (!nodeRows || nodeRows.length === 0)) {
    errors.push(issue('M2C_WAVE_NODES_DATASET_REQUIRED', 'spatial_v3_nodes'));
  }
  const nodeKeys = new Set((nodeRows ?? []).map((row) => `${row.id}|${row.version}`));
  const primaryByNode = new Map();
  for (const binding of bindings) {
    const bindingNodeKey = `${binding.node_id}|${binding.node_version}`;
    if (!nodeKeys.has(bindingNodeKey)) {
      errors.push(issue('M2C_WAVE_BINDING_NODE_NOT_IN_CLOSURE', bindingNodeKey));
    }
    if (binding.binding_role !== 'primary') {
      errors.push(issue('M2C_WAVE_BINDING_ROLE_INVALID', `${binding.node_id}:${binding.binding_role}`));
      continue;
    }
    const nodeKey = `${binding.world_revision_id}|${binding.node_id}|${binding.node_version}`;
    if (primaryByNode.has(nodeKey)) {
      errors.push(issue('M2C_WAVE_BINDING_PRIMARY_DUPLICATE', nodeKey));
    }
    primaryByNode.set(nodeKey, binding.place_family_id);
  }
  for (const table of WAVE_TABLES) {
    if (!datasets.has(table)) errors.push(issue('M2C_WAVE_DATASET_MISSING', table));
  }
}

function issue(code, subject_ref) {
  return Object.freeze({ code, subject_ref, dependency_pins: Object.freeze([]) });
}

function waveRowRef(table, row) {
  if (table === 'presence_rules') return row?.rule_id ?? 'unknown';
  if (table === 'spatial_node_place_family_bindings') return row?.node_id ?? 'unknown';
  if (table === 'npc_schedule_routine_rules') return row?.schedule_id ?? 'unknown';
  if (table === 'place_population_composition_rules') return row?.composition_id ?? 'unknown';
  return row?.id ?? row?.rule_id ?? 'unknown';
}

function validateWaveRowRevision(manifest, table, row, rowRef, errors) {
  if (!row || !Object.hasOwn(row, 'world_revision_id')) return;
  if (row.world_revision_id !== manifest.world_revision_id) {
    errors.push(issue('M2C_WAVE_WORLD_REVISION_MISMATCH', `${table}:${rowRef}`));
  }
}

function validateWaveRowProvenance(table, row, rowRef, errors) {
  if (!row || !Object.hasOwn(row, 'provenance_ref')) return;
  if (!String(row.provenance_ref ?? '').trim()) {
    errors.push(issue('M2C_WAVE_ROW_PROVENANCE_INVALID', `${table}:${rowRef}`));
  }
}

function validatePresenceRuleVariants(rule, errors) {
  if (!Array.isArray(rule?.variants)) {
    errors.push(issue('M2C_WAVE_VARIANTS_NOT_ARRAY', rule?.rule_id ?? ''));
    return;
  }
  if (rule.variants.length > 0
      && (typeof rule.item_ref !== 'string' || !rule.item_ref.trim())) {
    errors.push(issue('M2C_WAVE_VARIANTS_REQUIRE_BASE_ITEM_REF', rule.rule_id));
  }
  for (const entry of rule.variants) {
    if (entry === null) {
      errors.push(issue('M2C_WAVE_VARIANTS_NULL_ELEMENT', rule.rule_id));
    } else if (typeof entry === 'string') {
      errors.push(issue('M2C_WAVE_VARIANTS_STRING_FORBIDDEN', rule.rule_id));
    } else if (typeof entry !== 'object' || Array.isArray(entry)
        || typeof entry.item_ref !== 'string' || !entry.item_ref.trim()) {
      errors.push(issue('M2C_WAVE_VARIANT_ITEM_REF_INVALID', rule.rule_id));
    }
  }
}

function validateCompositionPresencePriority(datasets, errors) {
  const compositionSubjects = new Set();
  for (const row of datasets.get('place_population_composition_rules') ?? []) {
    for (const group of row.population_groups ?? []) {
      if (!Array.isArray(group?.weighted_subjects)) continue;
      for (const subject of group.weighted_subjects) {
        if (!subject?.subject_kind || !subject?.subject_ref) continue;
        compositionSubjects.add(`${row.place_family_id}|${subject.subject_kind}|${subject.subject_ref}`);
      }
    }
  }
  for (const rule of datasets.get('presence_rules') ?? []) {
    if (rule.scope_kind !== 'place_family') continue;
    if (rule.subject_kind !== 'occupation' && rule.subject_kind !== 'social_role') continue;
    if ((rule.presence_probability_ppm ?? 0) <= 0) continue;
    const key = `${rule.scope_ref}|${rule.subject_kind}|${rule.subject_ref}`;
    if (!compositionSubjects.has(key)) continue;
    const owner = rule.authoring_payload?.creation_owner;
    if (owner !== 'composition') {
      errors.push(issue('M2C_WAVE_COMPOSITION_PRESENCE_CONFLICT', `${rule.rule_id}:${key}`));
    }
  }
}

function scheduleMonthsOverlap(left, right) {
  const a = left ?? null;
  const b = right ?? null;
  if (!Array.isArray(a) || !Array.isArray(b)) return true;
  const setB = new Set(b);
  return a.some((month) => setB.has(month));
}

function validateScheduleRoutineRules(datasets, placeFamilyIds, errors) {
  const seen = [];
  for (const row of datasets.get('npc_schedule_routine_rules') ?? []) {
    if (row.scope_kind === 'place_family' && !placeFamilyIds.has(row.scope_ref)) {
      errors.push(issue('M2C_WAVE_SCHEDULE_SCOPE_UNKNOWN', `${row.schedule_id}:${row.scope_ref}`));
    }
    if (!SCHEDULE_DAY_TYPES.includes(row.day_type)) {
      errors.push(issue('M2C_WAVE_SCHEDULE_DAY_TYPE_INVALID', row.schedule_id));
    }
    if (!Array.isArray(row.months) || row.months.length < 1) {
      errors.push(issue('M2C_WAVE_SCHEDULE_MONTHS_INVALID', row.schedule_id));
    } else {
      const allowed = SEASON_MONTHS[row.season];
      for (const month of row.months) {
        if (!Number.isInteger(month) || month < 1 || month > 12) {
          errors.push(issue('M2C_WAVE_SCHEDULE_MONTHS_INVALID', row.schedule_id));
          break;
        }
        if (allowed && !allowed.includes(month)) {
          errors.push(issue('M2C_WAVE_SCHEDULE_SEASON_MONTHS_MISMATCH', row.schedule_id));
          break;
        }
      }
    }
    try {
      validateNpcRoutineProfile(row.routine_profile);
    } catch {
      errors.push(issue('M2C_WAVE_SCHEDULE_ROUTINE_PROFILE_INVALID', row.schedule_id));
    }
    const identity = `${row.scope_kind}|${row.scope_ref}|${row.subject_kind}|${row.subject_ref}|${row.season}|${row.day_type}`;
    for (const prior of seen) {
      if (prior.identity !== identity) continue;
      if (scheduleMonthsOverlap(prior.months, row.months)) {
        errors.push(issue('M2C_WAVE_SCHEDULE_SUBJECT_SEASON_CONFLICT', row.schedule_id));
        break;
      }
    }
    seen.push({ identity, months: row.months });
  }
}

function validatePlacePopulationCompositionRules(datasets, placeFamilyIds, errors) {
  const seenPf = new Set();
  for (const row of datasets.get('place_population_composition_rules') ?? []) {
    if (!placeFamilyIds.has(row.place_family_id)) {
      errors.push(issue('M2C_WAVE_COMPOSITION_PF_UNKNOWN', `${row.composition_id}:${row.place_family_id}`));
    }
    const pfKey = `${row.world_revision_id}|${row.place_family_id}|${row.composition_version}`;
    if (seenPf.has(pfKey)) {
      errors.push(issue('M2C_WAVE_COMPOSITION_PF_DUPLICATE', pfKey));
    }
    seenPf.add(pfKey);
    for (const group of row.population_groups ?? []) {
      const groupRef = group?.group_id ?? 'unknown';
      if (!Array.isArray(group?.weighted_subjects) || group.weighted_subjects.length === 0) {
        errors.push(issue('M2C_WAVE_COMPOSITION_GROUP_INVALID', `${row.composition_id}:${groupRef}`));
        continue;
      }
      for (const subject of group.weighted_subjects) {
        if (!COMPOSITION_SUBJECT_KINDS.has(subject?.subject_kind)) {
          errors.push(issue('M2C_WAVE_COMPOSITION_GROUP_INVALID', `${row.composition_id}:${groupRef}`));
          break;
        }
        if (!String(subject?.subject_ref ?? '').trim() || !(subject.weight > 0)) {
          errors.push(issue('M2C_WAVE_COMPOSITION_GROUP_INVALID', `${row.composition_id}:${groupRef}`));
          break;
        }
      }
    }
    for (const absence of row.scheduled_absences ?? []) {
      if (absence.seasons === undefined) continue;
      if (!Array.isArray(absence.seasons) || absence.seasons.length === 0) {
        errors.push(issue('M2C_WAVE_COMPOSITION_ABSENCE_SEASONS_INVALID', `${row.composition_id}:${absence.subject_ref ?? 'unknown'}`));
      }
    }
  }
}
