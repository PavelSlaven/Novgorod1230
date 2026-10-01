import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest } from '../src/core.js';
import { materializeSpatialV3CanonicalConnection, materializeSpatialV3Expansion } from '../src/spatial-v3.js';

const ref = (id, version) => ({ entity_id: id, authoring_version: String(version) });
const G4 = { id: 'g4', version: 1 };

function input(override = {}) {
  const site = (id, canonical) => ({ id, party_id: 'p', origin: 'canonical', parent_g4_id: 'g4',
    canonical_g5_ref: ref(canonical, 1), status: 'active', state_version: 1 });
  const binding = { id: 'bind', version: 2, parent_g4_id: 'g4', parent_g4_version: 1,
    from_canonical_g5_id: 'g5a', from_canonical_g5_version: 1, to_canonical_g5_id: 'g5b',
    to_canonical_g5_version: 1, connection_profile_id: 'prof', connection_profile_version: 2,
    line_kind_profile_id: 'line.path', line_kind_profile_version: 1,
    line_name: 'лесной тропой', line_discriminator: 'у старого дуба', line_direction_id: 'east',
    line_toponym: 'Вихтуй', base_minutes: 24, canonical_digest: 'a'.repeat(64),
    from_scene_endpoint_slot_key: 'departure', to_scene_endpoint_slot_key: 'arrival', status: 'approved' };
  const profile = { id: 'prof', version: 2, profile_scope: 'site_connection', status: 'approved',
    passage_type_id: 'passage.local', transition_environment_profile_id: 'env', transition_environment_profile_version: 1,
    movement_orientation_profile_id: 'ori', movement_orientation_profile_version: 1,
    movement_orientation_profile_ref: ref('orientation.local', 1), cost_kind: 'time',
    action_units: null, line_kind_id: 'line.path', line_kind_profile_ref: ref('line.path', 1),
    baseline_movement_method_id: 'movement.walk', movement_method_cost_profile_id: 'cost.path',
    movement_method_cost_profile_version: 1, movement_method_cost_profile_ref: ref('cost.path', 1),
    dynamic_recheck_policy_ref: ref('recheck.30m', 1), base_minutes: 24,
    dynamic_recheck_policy_id: 'recheck.30m', dynamic_recheck_policy_version: 1,
    capacity: null, risk_profile_ref: 'risk.local_conditional@1',
    availability_condition_set_ref: null };
  const line_binding = { site_connection_id: 'bind', authoring_version: 2,
    canonical_digest: 'a'.repeat(64), line_name: 'лесной тропой', line_discriminator: 'у старого дуба',
    line_kind_profile_ref: 'line.path@1',
    base_minutes: 24, movement_method_id: 'movement.walk',
    method_factor: { numerator: '1', denominator: '1' },
    environment_factor: { numerator: '1', denominator: '1' } };
  return { party_id: 'p', change_set_id: 'cs', materialization_trace_id: 'trace', dependency_pins: { pins: [] },
    snapshot: { sites: [site('siteA', 'g5a')], scene_positions: [{ id: 'posA', g6_instance_id: 'g6a',
      template_slot_key: 'departure', status: 'active' }], g6_instances: [{ id: 'g6a', scene_baseline_id: 'blA',
      status: 'active' }], scene_baselines: [{ id: 'blA', host_id: 'siteA', status: 'active' }], site_connections: [] },
    source: { site_id: 'siteA', position_id: 'posA', departure_endpoint_slot_key: 'departure',
      departure_position_slot_key: 'departure' },
    binding, profile, line_binding,
    terminal_target: { canonical_g5_id: 'g5b', canonical_g5_version: 1, site_id: 'siteB',
      position_id: 'posB', slot_key: 'arrival' },
    terminal_writes: [{ target_table: 'party_g5_sites', id: 'siteB', record: site('siteB', 'g5b') }],
    ...override };
}

test('writes the connection and both endpoints beside the prepared terminal, and no frontier rows', () => {
  const result = materializeSpatialV3CanonicalConnection(input());
  assert.equal(result.ok, true);
  const { proposal } = result;
  assert.equal(proposal.connection_id, 'canconn:p:bind');
  assert.equal(proposal.target_site_id, 'siteB');
  assert.equal(proposal.target_position_id, 'posB');
  assert.equal(proposal.moves_traveller, false);
  assert.deepEqual(proposal.updates, []);
  assert.deepEqual(proposal.inserts.map((row) => row.target_table), ['party_g5_sites',
    'g5_site_connections', 'party_site_connection_endpoint_bindings', 'party_site_connection_endpoint_bindings']);
  const [connection, from, to] = proposal.inserts.slice(1).map((row) => row.record);
  assert.equal(connection.from_site_id, 'siteA');
  assert.equal(connection.to_site_id, 'siteB');
  assert.deepEqual({ cost_kind: connection.cost_kind, action_units: connection.action_units,
    base_minutes: connection.base_minutes, line_kind_id: connection.line_kind_id,
    line_kind_profile_ref: connection.line_kind_profile_ref, line_name: connection.line_name,
    line_discriminator: connection.line_discriminator, line_direction_id: connection.line_direction_id,
    line_toponym: connection.line_toponym, source_canonical_connection_ref: connection.source_canonical_connection_ref },
  { cost_kind: 'time', action_units: null, base_minutes: 24, line_kind_id: 'line.path',
    line_kind_profile_ref: ref('line.path', 1), line_name: 'лесной тропой',
    line_discriminator: 'у старого дуба', line_direction_id: 'east', line_toponym: 'Вихтуй',
    source_canonical_connection_ref: ref('bind', 2) });
  assert.equal(connection.availability_condition_set_ref, null);
  assert.deepEqual(connection.risk_profile_ref, ref('risk.local_conditional', 1));
  assert.deepEqual([from.endpoint_role, from.g5_site_id, from.position_id, from.source_slot_key],
    ['from', 'siteA', 'posA', 'departure']);
  assert.deepEqual([to.endpoint_role, to.g5_site_id, to.position_id, to.source_slot_key],
    ['to', 'siteB', 'posB', 'arrival']);
});

test('refuses inputs that do not match the approved binding', () => {
  const rejected = (change) => materializeSpatialV3CanonicalConnection(input(change)).ok === false;
  const base = input();
  assert.ok(rejected({ source: { ...base.source, departure_endpoint_slot_key: 'arrival' } }), 'wrong departure slot');
  assert.ok(rejected({ terminal_target: { ...base.terminal_target, canonical_g5_id: 'other' } }), 'wrong target G5');
  assert.ok(rejected({ terminal_target: { ...base.terminal_target, slot_key: 'departure' } }), 'wrong arrival slot');
  assert.ok(rejected({ binding: { ...base.binding, from_canonical_g5_id: 'other' } }), 'source G5 is not the binding source');
  assert.ok(rejected({ binding: { ...base.binding, parent_g4_id: 'elsewhere' } }), 'different G4');
  assert.ok(rejected({ profile: { ...base.profile, availability_condition_set_ref: 'availability.x@1' } }), 'conditional profile');
  assert.ok(rejected({ profile: { ...base.profile, cost_kind: 'action' } }), 'action profile');
  assert.ok(rejected({ line_binding: undefined }), 'binding@3 line metadata is required');
  assert.ok(rejected({ binding: { ...base.binding, canonical_digest: 'b'.repeat(64) } }), 'line metadata must pin the same binding digest');
  assert.ok(rejected({ profile: { ...base.profile, status: 'retired' } }), 'unapproved profile');
  assert.ok(rejected({ profile: { ...base.profile, id: 'wrong' } }), 'profile is not the binding profile');
  assert.ok(rejected({ snapshot: { ...base.snapshot, site_connections: [{ id: 'canconn:p:bind' }] } }), 'already committed');
  assert.ok(rejected({ terminal_writes: [] }), 'target site neither committed nor prepared');
});

test('generated expansion without an approved entry line fails closed', () => {
  const sourceSite = { id: 'source', origin: 'canonical', parent_g4_id: 'g4', status: 'active',
    canonical_g5_ref: ref('g5a', 1) };
  const targetSite = { id: 'target', origin: 'canonical', parent_g4_id: 'g4', status: 'active',
    canonical_g5_ref: ref('g5b', 1) };
  const profile = { id: 'expansion', version: 1 };
  const slot = { id: 'slot', version: 1, g4_id: 'g4', direction_context_id: 'direction',
    continuation_length_rule_id: 'length', continuation_length_rule_version: 1 };
  const pins = [{ dependency_role: 'source_authoring',
    entity_ref: { entity_kind: 'g4_expansion_profile', entity_id: 'expansion' },
    version_pin: { pin_kind: 'authoring_version', authoring_version: '1' } }];
  const actionConnection = { status: 'approved', passage_type_id: 'passage.local', cost_kind: 'action',
    action_units: 1, transition_environment_profile_id: 'environment',
    transition_environment_profile_version: 1 };
  const result = materializeSpatialV3Expansion({ party_id: 'p', change_set_id: 'cs',
    closure: { profile, connection_profiles: [actionConnection],
      entry_endpoint_bindings: [{ id: 'entry', version: 1, canonical_g5_id: 'g5a', canonical_g5_version: 1,
        departure_scene_endpoint_slot_key: 'departure' }], continuation_length_candidates: [] },
    snapshot: { sites: [sourceSite, targetSite], scene_positions: [{ id: 'source-position',
      g6_instance_id: 'source-g6', template_slot_key: 'departure', status: 'active' }],
      g6_instances: [{ id: 'source-g6', scene_baseline_id: 'source-baseline', status: 'active' }],
      scene_baselines: [{ id: 'source-baseline', host_id: 'source', status: 'active' }],
      frontiers: [], chains: [], bindings: [], ledgers: [], site_connections: [] },
    selection: { ok: true, status: 'terminal', slot, directional_exit: { id: 'exit',
      exit_canonical_g5_id: 'g5b', exit_canonical_g5_version: 1 }, terminal_ordinal: 0 },
    source: { site_id: 'source', position_id: 'source-position', entry_binding: { id: 'entry', version: 1 },
      departure_endpoint_slot_key: 'departure', departure_position_slot_key: 'departure' },
    candidate_ordinal: 0, dependency_pins: { pins, canonical_digest: canonicalDigest(pins) }, now: 0,
    terminal_target: { site_id: 'target', canonical_g5_id: 'g5b', canonical_g5_version: 1,
      position_id: 'target-position', slot_key: 'arrival' }, materialization_trace_id: 'trace' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'authoring_dependency_pin_missing');
  assert.equal(result.error.diagnostics.reason, 'approved_generated_entry_line_binding_required');
  assert.equal(result.error.diagnostics.invalid_dependency_pins, undefined);
});
