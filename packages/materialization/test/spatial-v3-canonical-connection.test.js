import assert from 'node:assert/strict';
import test from 'node:test';
import { materializeSpatialV3CanonicalConnection } from '../src/spatial-v3.js';

const ref = (id, version) => ({ entity_id: id, authoring_version: String(version) });
const G4 = { id: 'g4', version: 1 };

function input(override = {}) {
  const site = (id, canonical) => ({ id, party_id: 'p', origin: 'canonical', parent_g4_id: 'g4',
    canonical_g5_ref: ref(canonical, 1), status: 'active', state_version: 1 });
  const binding = { id: 'bind', version: 2, parent_g4_id: 'g4', parent_g4_version: 1,
    from_canonical_g5_id: 'g5a', from_canonical_g5_version: 1, to_canonical_g5_id: 'g5b',
    to_canonical_g5_version: 1, connection_profile_id: 'prof', connection_profile_version: 2,
    from_scene_endpoint_slot_key: 'departure', to_scene_endpoint_slot_key: 'arrival', status: 'approved' };
  const profile = { id: 'prof', version: 2, profile_scope: 'site_connection', status: 'approved',
    passage_type_id: 'passage.local', transition_environment_profile_id: 'env', transition_environment_profile_version: 1,
    movement_orientation_profile_id: 'ori', movement_orientation_profile_version: 1, cost_kind: 'action',
    action_units: 1, baseline_movement_method_id: null, movement_method_cost_profile_id: null,
    movement_method_cost_profile_version: null, base_minutes: null, dynamic_recheck_policy_id: null,
    dynamic_recheck_policy_version: null, capacity: null, risk_profile_ref: 'risk.local_conditional@1',
    availability_condition_set_ref: null };
  return { party_id: 'p', change_set_id: 'cs', materialization_trace_id: 'trace', dependency_pins: { pins: [] },
    snapshot: { sites: [site('siteA', 'g5a')], scene_positions: [{ id: 'posA', g6_instance_id: 'g6a',
      template_slot_key: 'departure', status: 'active' }], g6_instances: [{ id: 'g6a', scene_baseline_id: 'blA',
      status: 'active' }], scene_baselines: [{ id: 'blA', host_id: 'siteA', status: 'active' }], site_connections: [] },
    source: { site_id: 'siteA', position_id: 'posA', departure_endpoint_slot_key: 'departure',
      departure_position_slot_key: 'departure' },
    binding, profile,
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
  assert.ok(rejected({ profile: { ...base.profile, status: 'retired' } }), 'unapproved profile');
  assert.ok(rejected({ profile: { ...base.profile, id: 'wrong' } }), 'profile is not the binding profile');
  assert.ok(rejected({ snapshot: { ...base.snapshot, site_connections: [{ id: 'canconn:p:bind' }] } }), 'already committed');
  assert.ok(rejected({ terminal_writes: [] }), 'target site neither committed nor prepared');
});
