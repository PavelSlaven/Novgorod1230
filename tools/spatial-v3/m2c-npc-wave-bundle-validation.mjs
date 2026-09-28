import { findOverlappingPresenceRules } from '../../packages/materialization/src/presence-rule-conflicts.js';

const WAVE_BUNDLE_ID = 'novgorod_m2c_npc_wave_v1';
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
]);
const WAVE_TABLES = new Set(M2C_NPC_WAVE_TABLE_SET);

export function isM2cNpcWaveManifest(manifest) {
  return manifest?.bundle_id === WAVE_BUNDLE_ID;
}

export function validateM2cNpcWaveBundle(manifest, datasets, errors) {
  if (!isM2cNpcWaveManifest(manifest)) return;
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
  const bindings = datasets.get('spatial_node_place_family_bindings') ?? [];
  const nodeKeys = new Set((datasets.get('spatial_v3_nodes') ?? []).map((row) => `${row.id}|${row.version}`));
  const primaryByNode = new Map();
  for (const binding of bindings) {
    const bindingNodeKey = `${binding.node_id}|${binding.node_version}`;
    if (nodeKeys.size && !nodeKeys.has(bindingNodeKey)) {
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
  return row?.id ?? 'unknown';
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
