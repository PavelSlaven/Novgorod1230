import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialV3GeneratedExpansionAdapter } from '../src/infrastructure/postgres/spatial-v3-generated-expansion-adapter.js';

test('generated expansion requires a committed party snapshot in its P16 transaction', async () => {
  const queries = [];
  const transaction = { query: async (sql, params) => {
    queries.push({ sql, params });
    return queries.length === 1 ? { rows: [{}] } : { rows: [] };
  } };
  const adapter = createSpatialV3GeneratedExpansionAdapter({
    worldBaseReader: { readPinnedG4ExpansionClosure: async () => ({ ok: true, value: {
      expansion_rule_sets: [], slots: [], directional_exits: [] } }) },
    committer: { prepareExpansion: async ({ prepare }) => prepare({ transaction }) },
    admitGeneration: async () => { throw new Error('must not admit without current state'); },
    projectVisible: async () => { throw new Error('must not project without current state'); }
  });
  const result = await adapter.prepareExpansion({ party_id: 'party', g4: { id: 'g4', version: 1,
    world_revision_id: 'world' }, profile: { id: 'profile', version: 1 },
  slot_ref: { id: 'slot', version: 1 }, directional_exit: { id: 'exit', version: 1 },
  candidate_ordinal: 0, source_site_id: 'site', source_position_id: 'position',
  materializer_version: 'v1' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'visible_package_persistence_gap', JSON.stringify(result.error));
  assert.equal(result.error.diagnostics.reason, 'committed_party_state_required');
  assert.match(queries[1].sql, /party_runtime\.party_state_snapshots/u);
  assert.deepEqual(queries[1].params, ['party']);
});

test('visible owner receives exact expansion facts and missing policy blocks P16', async () => {
  const g4 = { id: 'g4', version: 4, world_revision_id: 'world' };
  const profile = { id: 'profile', version: 7, world_revision_id: 'world', status: 'approved' };
  const expansion_rule_sets = [['adjacency_rule_set', 'adjacency', 'through_same_exit'],
    ['connectivity_rule_set', 'connectivity', 'existing_exit_reachable'],
    ['seed_policy', 'seed', 'mulberry32_v1']].map(([role, rule_kind, strategy]) => {
    profile[`${role}_id`] = role; profile[`${role}_version`] = 2;
    return { id: role, version: 2, dependency_role: role, rule_kind, strategy,
      status: 'approved', world_revision_id: 'world', canonical_digest: 'digest',
      authoring_digest: 'digest', canonical_ordinal: 0 };
  });
  const slot = { id: 'slot', version: 3, profile_id: profile.id, profile_version: profile.version,
    world_revision_id: 'world', g4_id: g4.id, g4_version: g4.version, status: 'approved',
    continuation_role: 'through', directional_exit_id: 'exit', directional_exit_version: 2,
    max_instances: 3, terminal_policy_id: 'terminal', terminal_policy_version: 1,
    continuation_length_rule_id: 'length', continuation_length_rule_version: 1 };
  const exit = { id: 'exit', version: 2, g4_id: g4.id, g4_version: g4.version,
    status: 'approved', exit_canonical_g5_id: 'target', exit_canonical_g5_version: 1 };
  const closure = { profile, expansion_rule_sets, slots: [slot], directional_exits: [exit],
    terminal_policies: [{ id: 'terminal', version: 1, status: 'approved',
      policy_kind: 'world_route_exit', target_directional_exit_id: exit.id,
      target_directional_exit_version: exit.version }],
    continuation_length_rules: [{ id: 'length', version: 1, status: 'approved', selection_kind: 'fixed' }],
    continuation_length_candidates: [{ rule_id: 'length', rule_version: 1, terminal_ordinal: 0,
      weight: 1 }], entry_endpoint_bindings: [{ id: 'entry', version: 1,
      canonical_g5_id: 'source', canonical_g5_version: 1,
      departure_scene_endpoint_slot_key: 'out' }],
    entry_slot_rules: [{ entry_binding_id: 'entry', entry_binding_version: 1,
      slot_id: slot.id, slot_version: slot.version }],
    connection_profiles: [{ status: 'approved', passage_type_id: 'path', cost_kind: 'time',
      action_units: 1, baseline_movement_method_id: 'walk', base_minutes: 1, capacity: 1 }] };
  const snapshot = { ledgers: [], sites: [
    { id: 'source-site', parent_g4_id: g4.id, origin: 'canonical', status: 'active',
      canonical_g5_ref: { entity_id: 'source', authoring_version: '1' } },
    { id: 'target-site', parent_g4_id: g4.id, origin: 'canonical', status: 'active',
      canonical_g5_ref: { entity_id: 'target', authoring_version: '1' } }],
  chains: [], frontiers: [], reservations: [], bindings: [], site_connections: [],
  scene_baselines: [
    { id: 'source-baseline', host_kind: 'g5_site', host_id: 'source-site', status: 'active',
      scene_template_ref: { entity_id: 'source-scene', authoring_version: '1' } },
    { id: 'target-baseline', host_kind: 'g5_site', host_id: 'target-site', status: 'active',
      scene_template_ref: { entity_id: 'target-scene', authoring_version: '1' } }],
  g6_instances: [
    { id: 'source-g6', scene_baseline_id: 'source-baseline', status: 'active' },
    { id: 'target-g6', scene_baseline_id: 'target-baseline', status: 'active' }],
  scene_positions: [
    { id: 'source-position', g6_instance_id: 'source-g6', status: 'active',
      template_slot_key: 'departure', template_instance_ordinal: 0 },
    { id: 'target-position', g6_instance_id: 'target-g6', status: 'active',
      template_slot_key: 'arrival', template_instance_ordinal: 0 }] };
  const transaction = { query: async (sql) => String(sql).includes('WITH sites')
    ? { rows: [snapshot] } : { rows: [{ state_version: '6', last_turn_id: 'turn-5' }] } };
  let visibleInput;
  const adapter = createSpatialV3GeneratedExpansionAdapter({
    worldBaseReader: {
      readPinnedG4ExpansionClosure: async () => ({ ok: true, value: closure }),
      readPinnedSceneTemplateClosure: async ({ id }) => ({ ok: true, value: {
        endpoint_slots: id === 'source-scene'
          ? [{ slot_key: 'out', endpoint_role: 'departure', required_position_slot_key: 'departure',
            required_position_instance_ordinal: 0 }]
          : [{ slot_key: 'in', endpoint_role: 'arrival', required_position_slot_key: 'arrival',
            required_position_instance_ordinal: 0 }] } }) },
    committer: { prepareExpansion: async ({ prepare }) => prepare({ transaction }) },
    admitGeneration: async () => ({ ok: true, validation_report: { status: 'pass' },
      commit_rechecks: [], recheck: async () => ({ ok: true }) }),
    projectVisible: async (input) => { visibleInput = input; return { ok: true, envelope: {} }; }
  });
  const result = await adapter.prepareExpansion({ party_id: 'party', g4, profile,
    slot_ref: { id: slot.id, version: slot.version },
    directional_exit: { id: exit.id, version: exit.version }, candidate_ordinal: 0,
    entry_binding: { id: 'entry', version: 1 }, source_site_id: 'source-site',
    source_position_id: 'source-position', materializer_version: 'v1' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'visible_package_persistence_gap', JSON.stringify(result.error));
  assert.equal(result.error.diagnostics.reason, 'approved_projection_policy_ref_required');
  assert.equal(visibleInput.transaction, transaction);
  assert.equal(visibleInput.closure, closure);
  assert.equal(visibleInput.current_state_version, '6');
  assert.equal(visibleInput.current_turn_id, 'turn-5');
  assert.equal(visibleInput.firstEntry.ok, true);
  assert.ok(visibleInput.dependency_pins.pins.some((pin) =>
    pin.entity_ref.entity_kind === 'expansion_terminal_policy'));
  assert.equal(visibleInput.package_id, `visible:${visibleInput.change_set_id}`);
});
