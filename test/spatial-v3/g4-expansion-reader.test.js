import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialV3WorldBaseReader } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-world-base-reader.js';

const digest = 'a'.repeat(64);
const pins = {
  g4: { id: 'g4', version: 1, world_revision_id: 'target', canonical_digest: digest },
  profile: { id: 'profile', version: 1, canonical_digest: digest }
};
const exit = { id: 'exit', version: 1, g4_id: 'g4', g4_version: 1, direction_context_id: 'north', exit_kind: 'world_route_exit', exit_canonical_g5_id: 'canonical-g5', exit_canonical_g5_version: 1, status: 'approved', canonical_digest: digest, authoring_version_digest: digest };
const slot = {
  id: 'slot', version: 1, world_revision_id: 'target', profile_id: 'profile', profile_version: 1,
  g4_id: 'g4', g4_version: 1, continuation_role: 'through', direction_context_id: 'north',
  directional_exit_id: 'exit', directional_exit_version: 1, max_instances: 2,
  continuation_length_rule_id: 'length', continuation_length_rule_version: 1,
  terminal_policy_id: 'terminal', terminal_policy_version: 1, status: 'approved',
  canonical_digest: digest, exit_g4_id: 'g4', exit_g4_version: 1, exit_kind: 'physical_boundary', exit_status: 'approved',
  terminal_status: 'approved', policy_kind: 'physical_boundary', length_status: 'approved', selection_kind: 'fixed', authoring_status: 'approved', authoring_digest: digest
};
const slotTemplate = { slot_id: 'slot', slot_version: 1, template_id: 'generation', template_version: 1,
  selection_weight: 1, template_world_revision_id: 'target', g5_class_id: 'spatial.g5.parcel',
  regional_template_id: 'regional', regional_template_version: 1, scene_materialization_profile_id: 'scene-profile',
  scene_materialization_profile_version: 1, template_status: 'approved', template_digest: digest, template_authoring_digest: digest };
const scene = { id: 'scene-profile', version: 1, world_revision_id: 'target', source_kind: 'g5_generation_template',
  selection_rule_id: 'select', selection_rule_version: 1, applicability_rule_id: 'apply', applicability_rule_version: 1,
  source_entity_id: 'generation', source_entity_version: 1, status: 'approved', canonical_digest: digest, profile_authoring_digest: digest,
  scene_template_id: 'scene', scene_template_version: 1, weight: 1, scene_status: 'approved', scene_digest: digest, scene_authoring_digest: digest,
  scene_basis_status: 'approved', scene_basis_digest: digest };
const successor = { g5_template_id: 'generation', g5_template_version: 1, ordinal: 0,
  source_expansion_slot_id: 'slot', source_expansion_slot_version: 1, successor_kind: 'through_successor',
  target_expansion_slot_id: 'slot', target_expansion_slot_version: 1, terminal_policy_id: 'terminal',
  terminal_policy_version: 1, scene_endpoint_slot_key: 'departure' };
const rules = {
  spatial_v3_nodes: [{ id: 'g4', version: 1, world_revision_id: 'target', spatial_level: 'G4', status: 'approved', canonical_digest: digest, authoring_version_digest: digest }],
  spatial_v3_g4_expansion_profiles: [{ id: 'profile', version: 1, world_revision_id: 'target', g4_id: 'g4', g4_version: 1,
    adjacency_rule_set_id: 'adjacency', adjacency_rule_set_version: 1, connectivity_rule_set_id: 'connectivity', connectivity_rule_set_version: 1,
    seed_policy_id: 'seed-policy', seed_policy_version: 1, status: 'approved', canonical_digest: digest,
    authoring_version_digest: digest, source_entity_kind: 'spatial_node', source_entity_id: 'g4', source_version: 1,
    dependency_role: 'g4_expansion_profile', target_entity_kind: 'g4_expansion_profile', target_entity_id: 'profile', target_version: 1,
    canonical_ordinal: 0, edge_provenance_ref: 'source' }],
  spatial_v3_expansion_rule_sets: [
    { dependency_role: 'adjacency_rule_set', canonical_ordinal: 0, id: 'adjacency', version: 1, rule_kind: 'adjacency', strategy: 'through_same_exit', status: 'approved', canonical_digest: digest, authoring_digest: digest },
    { dependency_role: 'connectivity_rule_set', canonical_ordinal: 0, id: 'connectivity', version: 1, rule_kind: 'connectivity', strategy: 'existing_exit_reachable', status: 'approved', canonical_digest: digest, authoring_digest: digest },
    { dependency_role: 'seed_policy', canonical_ordinal: 0, id: 'seed-policy', version: 1, rule_kind: 'seed', strategy: 'mulberry32_v1', status: 'approved', canonical_digest: digest, authoring_digest: digest }
  ],
  spatial_v3_canonical_g5_connection_profiles: [{ id: 'connection', version: 1, status: 'approved', canonical_digest: digest,
    authoring_version_digest: digest, canonical_ordinal: 0, edge_provenance_ref: 'source' }],
  spatial_v3_expansion_slots: [slot], spatial_v3_g4_directional_exits: [exit],
  spatial_v3_expansion_slot_templates: [slotTemplate], spatial_v3_expansion_profile_template_limits: [{ profile_id: 'profile', profile_version: 1, template_id: 'generation', template_version: 1, max_count: 2 }],
  spatial_v3_scene_materialization_candidates: [scene], spatial_v3_g5_successor_frontier_rules: [successor],
  spatial_v3_continuation_length_candidates: [{ rule_id: 'length', rule_version: 1, terminal_ordinal: 1, weight: 1,
    world_revision_id: 'target', selection_kind: 'fixed', status: 'approved', provenance_ref: 'source', canonical_digest: digest, authoring_digest: digest }],
  spatial_v3_terminal_policies: [{ id: 'terminal', version: 1, world_revision_id: 'target', policy_kind: 'physical_boundary', status: 'approved', canonical_digest: digest, authoring_digest: digest }],
  spatial_v3_g4_entry_endpoint_bindings: [{ id: 'entry', version: 1, g4_id: 'g4', g4_version: 1, canonical_g5_id: 'canonical-g5', canonical_g5_version: 1,
    arrival_scene_endpoint_slot_key: 'arrival', departure_scene_endpoint_slot_key: 'departure', source_pair_id: 'pair', source_pair_version: 1,
    status: 'approved', provenance_ref: 'source', canonical_digest: digest, source_payload_sha256: digest, g5_world_revision_id: 'target', g5_status: 'approved', g5_digest: digest, g5_authoring_digest: digest }],
  spatial_v3_authoring_dependency_edges: [{ entry_binding_id: 'entry', entry_binding_version: 1, slot_id: 'slot', slot_version: 1, canonical_ordinal: 0,
    provenance_ref: 'source', slot_digest: digest, slot_canonical_digest: digest, slot_authoring_status: 'approved', slot_status: 'approved', profile_id: 'profile', profile_version: 1, g4_id: 'g4', g4_version: 1 }]
};

function readerWith(overrides = {}) {
  const calls = [];
  const reader = createSpatialV3WorldBaseReader({ query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('AS wanted(entity_kind,id,version)')) return { rows: overrides.scene_rules ?? [
      { entity_kind: 'scene_selection_rule', id: 'select', version: 1, status: 'approved', world_revision_id: 'target', canonical_digest: digest },
      { entity_kind: 'scene_applicability_rule', id: 'apply', version: 1, status: 'approved', world_revision_id: 'target', canonical_digest: digest }
    ] };
    if (sql.includes('FROM world_base.spatial_v3_nodes n')) return { rows: overrides.spatial_v3_nodes ?? rules.spatial_v3_nodes };
    if (sql.includes("dependency_role IN ('adjacency_rule_set'")) return { rows: rules.spatial_v3_expansion_rule_sets };
    if (sql.includes("dependency_role='g4_expansion_profile'")) return { rows: overrides.profileEdges ?? rules.spatial_v3_g4_expansion_profiles };
    if (sql.includes("dependency_role='expansion_site_connection_profile'")) return { rows: overrides.connectionProfiles ?? rules.spatial_v3_canonical_g5_connection_profiles };
    if (sql.includes("dependency_role='expansion_entry_slot'")) return { rows: rules.spatial_v3_authoring_dependency_edges };
    if (sql.includes('FROM world_base.spatial_v3_g4_directional_exits e')) return { rows: overrides.spatial_v3_g4_directional_exits ?? rules.spatial_v3_g4_directional_exits };
    if (sql.includes('AS binding_id')) return { rows: overrides.entryScenes ?? [{ binding_id: 'entry', binding_version: 1,
      profile_id: 'canonical-profile', profile_version: 1, profile_digest: digest, profile_authoring_digest: digest, profile_status: 'approved',
      scene_template_id: 'canonical-scene', scene_template_version: 1, scene_template_status: 'approved', scene_template_authoring_status: 'approved', scene_template_digest: digest, scene_authoring_digest: digest, arrival_slot_key: 'arrival',
      arrival_role: 'arrival', departure_slot_key: 'departure', departure_role: 'departure' }] };
    if (sql.includes('JOIN world_base.spatial_v3_scene_endpoint_slots e')) return { rows: [{ scene_template_id: 'scene', scene_template_version: 1, slot_key: 'departure', endpoint_role: 'departure' }] };
    if (sql.includes('FROM world_base.spatial_v3_g4_entry_endpoint_bindings b')) return { rows: rules.spatial_v3_g4_entry_endpoint_bindings };
    const table = Object.keys({ ...rules, ...overrides }).find((name) => sql.includes(`world_base.${name}`));
    return { rows: table ? (overrides[table] ?? rules[table]) : [] };
  } });
  return { reader, calls };
}

test('G4 expansion binding resolves one exact approved G4 and ordinal-zero profile edge', async () => {
  const { reader, calls } = readerWith();
  const result = await reader.readG4ExpansionBinding({ g4_id: 'g4',
    world_revision_id: 'target' });
  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.deepEqual(result.value, {
    g4: { id: 'g4', version: 1, world_revision_id: 'target',
      canonical_digest: digest },
    profile: { id: 'profile', version: 1, world_revision_id: 'target',
      canonical_digest: digest }
  });
  assert.deepEqual(calls.map(({ params }) => params), [
    ['g4', 'target'], ['g4', 1, 'target']
  ]);
  assert.match(calls[0].sql, /spatial_level='G4'/u);
  assert.match(calls[1].sql, /dependency_role='g4_expansion_profile'/u);
  assert.equal(Object.isFrozen(result.value.profile), true);
});

test('G4 expansion binding rejects missing, ambiguous, or unapproved pins', async () => {
  const invalidInput = readerWith();
  assert.equal((await invalidInput.reader.readG4ExpansionBinding({
    g4_id: 'g4' })).ok, false);
  assert.equal(invalidInput.calls.length, 0);

  for (const overrides of [
    { spatial_v3_nodes: [] },
    { spatial_v3_nodes: [...rules.spatial_v3_nodes,
      { ...rules.spatial_v3_nodes[0], version: 2 }] },
    { profileEdges: [] },
    { profileEdges: [...rules.spatial_v3_g4_expansion_profiles,
      { ...rules.spatial_v3_g4_expansion_profiles[0], id: 'second-profile' }] },
    { profileEdges: [{ ...rules.spatial_v3_g4_expansion_profiles[0],
      canonical_ordinal: 1 }] },
    { profileEdges: [{ ...rules.spatial_v3_g4_expansion_profiles[0],
      authoring_version_digest: 'b'.repeat(64) }] }
  ]) {
    const { reader } = readerWith(overrides);
    assert.equal((await reader.readG4ExpansionBinding({ g4_id: 'g4',
      world_revision_id: 'target' })).ok, false);
  }
});

test('G4 expansion reader returns one exact approved immutable closure', async () => {
  const { reader, calls } = readerWith();
  const result = await reader.readPinnedG4ExpansionClosure(pins);
  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.equal(result.value.directional_exits.length, 1);
  assert.equal(result.value.directional_exits[0].direction_context_id, 'north');
  assert.equal(result.value.directional_exits[0].exit_canonical_g5_id,
    'canonical-g5');
  assert.equal(result.value.directional_exits[0].exit_canonical_g5_version, 1);
  assert.equal(result.value.scene_materialization_candidates[0].scene_template_id, 'scene');
  assert.equal(result.value.successor_frontier_rules.length, 1);
  assert.ok(Object.isFrozen(result.value.slots[0]));
  assert.deepEqual(calls[0].params, ['g4', 1, 'target', digest]);
  assert.equal(calls[0].sql.includes("spatial_level='G4'"), true);
});

test('G4 expansion reader accepts approved entry scene versions under one profile ID', async () => {
  const first = { binding_id: 'entry', binding_version: 1,
    profile_id: 'canonical-profile', profile_version: 1, profile_digest: digest,
    profile_authoring_digest: digest, profile_status: 'approved',
    scene_template_id: 'canonical-scene', scene_template_version: 1,
    scene_template_status: 'approved', scene_template_authoring_status: 'approved',
    scene_template_digest: digest, scene_authoring_digest: digest,
    arrival_slot_key: 'arrival', arrival_role: 'arrival',
    departure_slot_key: 'departure', departure_role: 'departure' };
  const { reader } = readerWith({ entryScenes: [first, { ...first,
    profile_version: 2, scene_template_version: 2 }] });
  const result = await reader.readPinnedG4ExpansionClosure(pins);
  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.deepEqual(result.value.entry_scene_endpoints.map((row) => row.profile_version), [1, 2]);

  const ambiguous = readerWith({ entryScenes: [first, { ...first,
    profile_id: 'different-profile', profile_version: 2, scene_template_version: 2 }] });
  const rejected = await ambiguous.reader.readPinnedG4ExpansionClosure(pins);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error?.diagnostics?.reason, 'g4_entry_scene_or_rule_closure_missing');
});

test('G4 expansion reader fails closed on missing profile pin and missing exit coverage', async () => {
  const missingPin = readerWith();
  assert.equal((await missingPin.reader.readPinnedG4ExpansionClosure({ g4: pins.g4 })).ok, false);
  assert.equal(missingPin.calls.length, 0);
  const missingExit = readerWith({ spatial_v3_g4_directional_exits: [] });
  assert.equal((await missingExit.reader.readPinnedG4ExpansionClosure(pins)).ok, false);
  const ambiguousProfile = readerWith({ profileEdges: [...rules.spatial_v3_g4_expansion_profiles, { ...rules.spatial_v3_g4_expansion_profiles[0], id: 'another-profile' }] });
  assert.equal((await ambiguousProfile.reader.readPinnedG4ExpansionClosure(pins)).ok, false);
  assert.equal((await readerWith({ scene_rules: [] }).reader.readPinnedG4ExpansionClosure(pins)).ok, false);
});

test('G4 expansion reader keeps approved connection profile row digest independent of its exact authoring-version identity digest', async () => {
  const { reader } = readerWith({ connectionProfiles: [{ ...rules.spatial_v3_canonical_g5_connection_profiles[0], authoring_version_digest: 'b'.repeat(64) }] });
  const result = await reader.readPinnedG4ExpansionClosure(pins);
  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.equal(result.value.connection_profiles[0].canonical_digest, digest);
  assert.equal(result.value.connection_profiles[0].authoring_version_digest, 'b'.repeat(64));
});
