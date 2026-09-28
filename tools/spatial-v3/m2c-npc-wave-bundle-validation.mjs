import { findOverlappingPresenceRules } from '../../packages/materialization/src/presence-rule-conflicts.js';

const WAVE_BUNDLE_ID = 'novgorod_m2c_npc_wave_v1';
const WAVE_TABLES = new Set([
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
    if (rule.scope_kind === 'place_family' && !placeFamilyIds.has(rule.scope_ref)) {
      errors.push(issue('M2C_WAVE_PRESENCE_SCOPE_UNKNOWN', `${rule.rule_id}:${rule.scope_ref}`));
    }
  }
  const overlaps = findOverlappingPresenceRules(datasets.get('presence_rules') ?? []);
  for (const message of overlaps) errors.push(issue('M2C_WAVE_PRESENCE_C4_CONFLICT', message));
  const bindings = datasets.get('spatial_node_place_family_bindings') ?? [];
  const primaryByNode = new Map();
  for (const binding of bindings) {
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
