import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialV3GeneratedExpansionAdapter } from '../src/infrastructure/postgres/spatial-v3-generated-expansion-adapter.js';
import { SPATIAL_V3_CURRENT_VISIBLE_PROJECTION_POLICY_REF } from '../src/runtime/spatial-v3-current-visible-context.js';

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
  let visibleEnvelope = {};
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
    projectVisible: async (input) => { visibleInput = input; return { ok: true, envelope: visibleEnvelope }; }
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
  assert.equal(visibleInput.envelopeInput.turn_id, visibleInput.change_set_id);
  assert.equal(visibleInput.envelopeInput.committed_state_version, '6');
  assert.equal(visibleInput.envelopeInput.idempotency_record_id,
    `idem:${visibleInput.change_set_id}`);
  assert.deepEqual(visibleInput.envelopeInput.dependency_pins, visibleInput.dependency_pins);
  assert.deepEqual(visibleInput.expected_state_versions, visibleInput.proposal.expected_state_versions);
  assert.deepEqual(visibleInput.factual_writes,
    [...visibleInput.proposal.inserts, ...visibleInput.proposal.updates]);
  assert.ok(visibleInput.dependency_pins.pins.some((pin) =>
    pin.entity_ref.entity_kind === 'expansion_terminal_policy'));
  assert.equal(visibleInput.package_id, `visible:${visibleInput.change_set_id}`);
  visibleEnvelope = { projection_policy_ref: SPATIAL_V3_CURRENT_VISIBLE_PROJECTION_POLICY_REF };
  const malformed = await adapter.prepareExpansion({ party_id: 'party', g4, profile,
    slot_ref: { id: slot.id, version: slot.version },
    directional_exit: { id: exit.id, version: exit.version }, candidate_ordinal: 0,
    entry_binding: { id: 'entry', version: 1 }, source_site_id: 'source-site',
    source_position_id: 'source-position', materializer_version: 'v1' });
  assert.equal(malformed.error.code, 'visible_package_persistence_gap');
  assert.equal(malformed.error.diagnostics.reason, 'visible_envelope_identity_or_digest_mismatch');

  slot.entry_line_name = 'лесная дорога';
  const partialLineBinding = await adapter.prepareExpansion({ party_id: 'party', g4, profile,
    slot_ref: { id: slot.id, version: slot.version },
    directional_exit: { id: exit.id, version: exit.version }, candidate_ordinal: 0,
    entry_binding: { id: 'entry', version: 1 }, source_site_id: 'source-site',
    source_position_id: 'source-position', materializer_version: 'v1' });
  assert.equal(partialLineBinding.ok, false);
  assert.equal(partialLineBinding.error.code, 'authoring_dependency_pin_missing');
  assert.equal(partialLineBinding.error.diagnostics.reason, 'approved_generated_entry_line_binding_required');
  assert.equal(visibleInput.package_id, `visible:${visibleInput.change_set_id}`,
    'partial line data fails before a new visible projection');
});

function canonicalConnectionFixture({ fromSlot = 'reverse-from', toSlot = 'reverse-to',
  sourceRequiredSlot = 'source-position-slot', targetRequiredSlot = 'target-position-slot' } = {}) {
  const g4 = { id: 'g4', version: 1, world_revision_id: 'world' };
  const profile = { id: 'line-profile', version: 1, status: 'approved', profile_scope: 'site_connection',
    cost_kind: 'time', action_units: null, availability_condition_set_ref: null,
    line_kind_id: 'path', line_kind_profile_ref: { entity_id: 'line-profile', authoring_version: '1' },
    baseline_movement_method_id: 'walk', base_minutes: 12,
    transition_environment_profile_ref: { entity_id: 'environment', authoring_version: '1' },
    movement_orientation_profile_ref: { entity_id: 'orientation', authoring_version: '1' },
    movement_method_cost_profile_ref: { entity_id: 'movement-cost', authoring_version: '1' },
    dynamic_recheck_policy_ref: { entity_id: 'recheck', authoring_version: '1' } };
  const binding = { id: 'line-binding', version: 2, canonical_digest: 'binding-digest', status: 'approved',
    parent_g4_id: g4.id, parent_g4_version: g4.version,
    from_canonical_g5_id: 'source-g5', from_canonical_g5_version: 1,
    to_canonical_g5_id: 'target-g5', to_canonical_g5_version: 1,
    from_scene_endpoint_slot_key: fromSlot, to_scene_endpoint_slot_key: toSlot,
    line_kind_profile_id: profile.id, line_kind_profile_version: profile.version,
    line_name: 'обратной дорогой', line_discriminator: null, base_minutes: 12 };
  const line_binding = { site_connection_id: binding.id, authoring_version: binding.version,
    canonical_digest: binding.canonical_digest, line_name: binding.line_name, line_discriminator: null,
    base_minutes: binding.base_minutes, line_kind_profile_ref: 'line-profile@1', movement_method_id: 'walk' };
  const snapshot = {
    ledgers: [], sites: [
      { id: 'source-site', parent_g4_id: g4.id, origin: 'canonical', status: 'active',
        canonical_g5_ref: { entity_id: 'source-g5', authoring_version: '1' } },
      { id: 'target-site', parent_g4_id: g4.id, origin: 'canonical', status: 'active',
        canonical_g5_ref: { entity_id: 'target-g5', authoring_version: '1' } }],
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
        template_slot_key: 'source-position-slot', template_instance_ordinal: 0 },
      { id: 'target-position', g6_instance_id: 'target-g6', status: 'active',
        template_slot_key: 'target-position-slot', template_instance_ordinal: 0 }],
    portals: [], movement_edges: [], visibility_modifiers: [], visibility_links: [],
    acoustic_profiles: [], acoustic_edges: [], placements: [], endpoint_bindings: [], journey_locations: []
  };
  const sourceEndpoints = [
    { slot_key: 'departure-first', endpoint_role: 'departure',
      required_position_slot_key: 'source-position-slot', required_position_instance_ordinal: 0 },
    { slot_key: 'reverse-from', endpoint_role: 'arrival',
      required_position_slot_key: sourceRequiredSlot, required_position_instance_ordinal: 0 }];
  const targetEndpoints = [
    { slot_key: 'arrival-first', endpoint_role: 'arrival',
      required_position_slot_key: 'target-position-slot', required_position_instance_ordinal: 0 },
    { slot_key: 'reverse-to', endpoint_role: 'departure',
      required_position_slot_key: targetRequiredSlot, required_position_instance_ordinal: 0 }];
  const transaction = { query: async (sql) => String(sql).includes('WITH sites')
    ? { rows: [snapshot] } : { rows: [{ state_version: '6', last_turn_id: 'turn-5' }] } };
  let projected;
  const adapter = createSpatialV3GeneratedExpansionAdapter({
    worldBaseReader: {
      readPinnedG4ExpansionClosure: async () => ({ ok: true, value: {} }),
      readApprovedCanonicalG5Connections: async () => ({ ok: true,
        value: [{ binding, profile, line_binding }] }),
      readPinnedSceneTemplateClosure: async ({ id }) => ({ ok: true, value: {
        endpoint_slots: id === 'source-scene' ? sourceEndpoints : targetEndpoints } })
    },
    committer: { prepareExpansion: async ({ prepare }) => prepare({ transaction }) },
    admitGeneration: async () => ({ ok: true, validation_report: { status: 'pass' },
      commit_rechecks: [], recheck: async () => ({ ok: true }) }),
    projectVisible: async (input) => { projected = input; return { ok: false }; }
  });
  return { adapter, binding, snapshot, get projected() { return projected; }, g4 };
}

test('canonical reverse line selects exact arrival source and departure target slots', async () => {
  const fixture = canonicalConnectionFixture();
  const result = await fixture.adapter.prepareCanonicalConnection({ party_id: 'party', g4: fixture.g4,
    profile: { id: 'g4-profile', version: 1 }, binding_id: fixture.binding.id,
    source_site_id: 'source-site', source_position_id: 'source-position', materializer_version: 'v1' });

  assert.equal(result.error?.diagnostics?.reason, 'visible_projection_required', JSON.stringify(result));
  const proposal = fixture.projected.proposal;
  assert.equal(proposal.source_position_id, 'source-position');
  assert.equal(proposal.target_position_id, 'target-position');
  const endpointRows = proposal.inserts.filter((row) => row.target_table === 'party_site_connection_endpoint_bindings');
  assert.equal(endpointRows.find((row) => row.record.endpoint_role === 'from').record.source_slot_key, 'reverse-from');
  assert.equal(endpointRows.find((row) => row.record.endpoint_role === 'to').record.source_slot_key, 'reverse-to');
});

test('canonical reverse line fails closed for absent endpoint slots and position mismatches', async (t) => {
  const cases = [
    ['missing source slot', { fromSlot: 'missing-source' }],
    ['missing target slot', { toSlot: 'missing-target' }],
    ['source slot position mismatch', { sourceRequiredSlot: 'wrong-source-position' }],
    ['target slot position mismatch', { targetRequiredSlot: 'wrong-target-position' }]
  ];
  for (const [name, options] of cases) await t.test(name, async () => {
    const fixture = canonicalConnectionFixture(options);
    const result = await fixture.adapter.prepareCanonicalConnection({ party_id: 'party', g4: fixture.g4,
      profile: { id: 'g4-profile', version: 1 }, binding_id: fixture.binding.id,
      source_site_id: 'source-site', source_position_id: 'source-position', materializer_version: 'v1' });
    assert.equal(result.ok, false);
    assert.equal(fixture.projected, undefined, 'bad endpoint must stop before P16 visible projection');
  });
});
