import { findOverlappingPresenceRules } from '../../packages/materialization/src/presence-rule-conflicts.js';
import { validateNpcRoutineProfile } from '@rus/npc-runtime';

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
  if (!Array.isArray(rule?.variants)) return;
  for (const entry of rule.variants) {
    if (entry === null) {
      errors.push(issue('M2C_WAVE_VARIANTS_NULL_ELEMENT', rule.rule_id));
    } else if (typeof entry === 'string') {
      errors.push(issue('M2C_WAVE_VARIANTS_STRING_FORBIDDEN', rule.rule_id));
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

function validateScheduleRoutineRules(datasets, placeFamilyIds, errors) {
  for (const row of datasets.get('npc_schedule_routine_rules') ?? []) {
    if (row.scope_kind === 'place_family' && !placeFamilyIds.has(row.scope_ref)) {
      errors.push(issue('M2C_WAVE_SCHEDULE_SCOPE_UNKNOWN', `${row.schedule_id}:${row.scope_ref}`));
    }
    if (!Array.isArray(row.months) && row.months != null) {
      errors.push(issue('M2C_WAVE_SCHEDULE_MONTHS_INVALID', row.schedule_id));
    }
    if (Array.isArray(row.months)) {
      for (const month of row.months) {
        if (!Number.isInteger(month) || month < 1 || month > 12) {
          errors.push(issue('M2C_WAVE_SCHEDULE_MONTHS_INVALID', row.schedule_id));
          break;
        }
      }
    }
    try {
      validateNpcRoutineProfile(row.routine_profile);
    } catch {
      errors.push(issue('M2C_WAVE_SCHEDULE_ROUTINE_PROFILE_INVALID', row.schedule_id));
    }
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
    for (const absence of row.scheduled_absences ?? []) {
      if (absence.seasons === undefined) continue;
      if (!Array.isArray(absence.seasons) || absence.seasons.length === 0) {
        errors.push(issue('M2C_WAVE_COMPOSITION_ABSENCE_SEASONS_INVALID', `${row.composition_id}:${absence.subject_ref ?? 'unknown'}`));
      }
    }
  }
}
