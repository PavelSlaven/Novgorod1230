import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialV3ExpansionRuntime, eligibleCanonicalConnections } from '../src/runtime/spatial-v3-expansion-runtime.js';

const binding = (id, to) => ({ id, version: 2, parent_g4_id: 'g4', parent_g4_version: 4,
  from_canonical_g5_id: 'g5a', from_canonical_g5_version: 1, to_canonical_g5_id: to, to_canonical_g5_version: 1,
  connection_profile_id: 'prof', connection_profile_version: 2, from_scene_endpoint_slot_key: 'out',
  to_scene_endpoint_slot_key: 'in', line_name: 'бродом', line_discriminator: id === 'b-yard' ? 'у мельницы' : null,
  status: 'approved' });
const profile = { id: 'prof', version: 2, profile_scope: 'site_connection', status: 'approved',
  availability_condition_set_ref: null, cost_kind: 'action', action_units: 1 };

function context() {
  const position = { id: 'departure-position', template_slot_key: 'departure', template_instance_ordinal: 0 };
  return { partyId: 'party', actorId: 'actor', g4: { id: 'g4', version: 4, world_revision_id: 'world' },
    profile: { id: 'p', version: 1 }, position,
    site: { id: 'site-a', origin: 'canonical', parent_g4_id: 'g4', canonical_g5_ref: { entity_id: 'g5a', authoring_version: '1' } },
    scene: { positions: [position], movement_edges: [], endpoint_slots: [{ slot_key: 'out', endpoint_role: 'departure',
      required_position_slot_key: 'departure', required_position_instance_ordinal: 0 }] },
    snapshot: { sites: [], site_connections: [], endpoint_bindings: [] },
    closure: { slots: [], directional_exits: [], connection_profiles: [] },
    canonical_connections: [{ binding: binding('b-water', 'g5w'), profile }, { binding: binding('b-yard', 'g5y'), profile }] };
}
const labels = { 'b-water': 'игнорируется', 'b-yard': 'игнорируется' };
const disclose = async ({ connections }) => connections.map(({ binding: { id } }) => ({
  connection_binding_id: id, knowledge_state: 'visible', display_label: labels[id] }));
const identity = { partyId: 'party', actorId: 'actor' };
const runtimeFor = (current, extra = {}) => createSpatialV3ExpansionRuntime({ readContext: async () => current,
  readConnectionDisclosure: disclose, materializerVersion: 'version', ...extra });

test('a place offers its connections only at the departure position named by the binding', () => {
  const current = context();
  assert.deepEqual(eligibleCanonicalConnections(current).map((row) => row.binding.id), ['b-water', 'b-yard']);
  const elsewhere = { ...current, position: { id: 'focus', template_slot_key: 'focus', template_instance_ordinal: 0 } };
  assert.deepEqual(eligibleCanonicalConnections(elsewhere), []);
  const generated = { ...current, site: { ...current.site, origin: 'generated' } };
  assert.deepEqual(eligibleCanonicalConnections(generated), []);
});

test('a binding with a missing named source slot fails closed as a typed data gap', () => {
  const current = context();
  const moved = { ...current, canonical_connections: [{
    binding: { ...binding('x', 'g5x'), from_scene_endpoint_slot_key: 'other' }, profile
  }] };

  assert.throws(() => eligibleCanonicalConnections(moved), (error) =>
    error.code === 'LIVE_WORLD_EXPANSION_DATA_GAP'
      && error.details.reason === 'canonical_connection_source_endpoint_required');
});

test('line options use the world-base line label after disclosure admits the connection', async () => {
  const current = context();
  const runtime = runtimeFor(current, { readConnectionDisclosure: async ({ connections }) => disclose({
    connections: connections.filter(({ binding: { id } }) => id === 'b-yard') }) });
  assert.deepEqual(await runtime.listConnectionOptions(identity),
    [{ kind: 'connection', connection_binding_id: 'b-yard', display_label: 'бродом · у мельницы' }]);
  const undisclosed = runtimeFor(current, { readConnectionDisclosure: async () => [] });
  assert.deepEqual(await undisclosed.listConnectionOptions(identity), []);
});

test('away from departure the selector returns the whole ordered path whose first edge was offered', async () => {
  const current = context();
  const departure = current.position;
  const focus = { id: 'focus-position', template_slot_key: 'focus', template_instance_ordinal: 0 };
  const middle = { id: 'middle-position', template_slot_key: 'middle', template_instance_ordinal: 0 };
  current.position = focus;
  current.scene = { ...current.scene, positions: [focus, middle, departure], movement_edges: [
    { id: 'edge-1', from_position_id: focus.id, to_position_id: middle.id, status: 'active' },
    { id: 'edge-2', from_position_id: middle.id, to_position_id: departure.id, status: 'active' }] };
  const runtime = runtimeFor(current);
  assert.deepEqual(await runtime.listConnectionOptions(identity), []);
  assert.deepEqual(await runtime.listConnectionApproachOptions({ ...identity, firstStepEdgeIds: [] }), []);
  assert.deepEqual(await runtime.listConnectionApproachOptions({ ...identity, firstStepEdgeIds: ['edge-1'] }), [
    { kind: 'approach', connection_binding_id: 'b-water', edge_id: 'edge-1',
      ordered_local_edge_path: [
        { edge_id: 'edge-1', from_position_id: focus.id, to_position_id: middle.id },
        { edge_id: 'edge-2', from_position_id: middle.id, to_position_id: departure.id }
      ], display_label: 'бродом' },
    { kind: 'approach', connection_binding_id: 'b-yard', edge_id: 'edge-1',
      ordered_local_edge_path: [
        { edge_id: 'edge-1', from_position_id: focus.id, to_position_id: middle.id },
        { edge_id: 'edge-2', from_position_id: middle.id, to_position_id: departure.id }
      ], display_label: 'бродом · у мельницы' }]);
});

test('connection traversal resolves and forwards an ordered off-departure local path once', async () => {
  const current = context();
  const departure = current.position;
  const focus = { id: 'focus-position', template_slot_key: 'focus', template_instance_ordinal: 0 };
  current.position = focus;
  current.scene = { ...current.scene, positions: [focus, departure], movement_edges: [
    { id: 'edge-1', from_position_id: focus.id, to_position_id: departure.id, status: 'active' }] };
  current.snapshot.site_connections = [{ id: 'canconn:party:b-water', status: 'active' }];
  const path = [{ edge_id: 'edge-1', from_position_id: focus.id, to_position_id: departure.id }];
  const calls = [];
  const runtime = runtimeFor(current, { prepareSiteTraversal: async (input) => {
    calls.push(input);
    return { ok: true };
  } });
  const expansion = await runtime.prepareConnection({ ...identity, connectionBindingId: 'b-water',
    ordered_local_edge_path: path });
  assert.equal(expansion.source_position_id, departure.id);
  const result = await runtime.prepareConnectionTraversal({ ...identity, connectionBindingId: 'b-water',
    ordered_local_edge_path: path, expansion });
  assert.deepEqual(result, { ok: true });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].ordered_local_edge_path, path);
  assert.equal(calls[0].context.approach_departure_position.id, departure.id);
  assert.equal(calls[0].context.position.id, focus.id);
});

test('preparing a connection asks the adapter once with the exact source; a committed connection replays without it', async () => {
  const current = context();
  const seen = [];
  const runtime = runtimeFor(current, { generatedExpansionAdapter: {
    prepareCanonicalConnection: async (request) => { seen.push(request); return { ok: true, topology_status: 'committed',
      connection_id: 'canconn:party:b-water' }; } } });
  const prepared = await runtime.prepareConnection({ ...identity, connectionBindingId: 'b-water', requestId: 'r' });
  assert.equal(prepared.ok, true);
  assert.deepEqual(seen.map(({ party_id, actor_id, binding_id, source_site_id, source_position_id, materializer_version }) =>
    [party_id, actor_id, binding_id, source_site_id, source_position_id, materializer_version]),
  [['party', 'actor', 'b-water', 'site-a', 'departure-position', 'version']]);
  assert.deepEqual(seen[0].g4, current.g4);
  await assert.rejects(runtime.prepareConnection({ ...identity, connectionBindingId: 'nope' }),
    (e) => e.details.reason === 'selected_connection_unavailable');

  current.snapshot.site_connections = [{ id: 'canconn:party:b-water', status: 'active', from_site_id: 'site-a' }];
  const replay = await runtime.prepareConnection({ ...identity, connectionBindingId: 'b-water' });
  assert.deepEqual([replay.ok, replay.replay, replay.connection_id, replay.moves_traveller, replay.advances_time],
    [true, true, 'canconn:party:b-water', false, false]);
  assert.equal(seen.length, 1);
});

test('canonical connection forwards the ordered local approach and its proofs into P16 admission', async () => {
  const current = context();
  const focus = { id: 'focus-position', template_slot_key: 'focus', template_instance_ordinal: 0 };
  const departure = current.position;
  current.position = focus;
  current.scene = { ...current.scene, positions: [focus, departure], movement_edges: [
    { id: 'edge-1', from_position_id: focus.id, to_position_id: departure.id, status: 'active' }] };
  const path = [{ edge_id: 'edge-1', from_position_id: focus.id, to_position_id: departure.id }];
  const proofs = [{ ...path[0], snapshot_version: 'v6' }];
  let received;
  const runtime = runtimeFor(current, { generatedExpansionAdapter: {
    prepareCanonicalConnection: async (request) => { received = request; return { ok: true }; }
  } });

  await runtime.prepareConnection({ ...identity, connectionBindingId: 'b-water',
    ordered_local_edge_path: path, local_edge_path_proofs: proofs });

  assert.equal(received.source_position_id, departure.id);
  assert.equal(received.approach_origin_position_id, focus.id);
  assert.deepEqual(received.ordered_local_edge_path, path);
  assert.deepEqual(received.local_edge_path_proofs, proofs);
});

test('traversal runs the shared site traversal with the binding profile and the committed connection', async () => {
  const current = context();
  const connection = { id: 'canconn:party:b-water', status: 'active', from_site_id: 'site-a' };
  current.snapshot.site_connections = [connection];
  const calls = [];
  const runtime = runtimeFor(current, { prepareSiteTraversal: async (input) => { calls.push(input); return { ok: 'moved' }; } });
  const expansion = { connection_id: connection.id, source_position_id: 'departure-position' };
  assert.deepEqual(await runtime.prepareConnectionTraversal({ ...identity, connectionBindingId: 'b-water', expansion }), { ok: 'moved' });
  assert.equal(calls[0].connection, connection);
  assert.deepEqual(calls[0].context.closure.connection_profiles, [profile]);
  await assert.rejects(runtime.prepareConnectionTraversal({ ...identity, connectionBindingId: 'b-water',
    expansion: { ...expansion, connection_id: 'other' } }), (e) => e.details.reason === 'committed_site_connection_required');
  await assert.rejects(runtime.prepareConnectionTraversal({ ...identity, connectionBindingId: 'b-yard', expansion }),
    (e) => e.details.reason === 'committed_site_connection_required');
});

test('a canonical connection is offered at the exact from slot even when its role is arrival', () => {
  const current = context();
  current.position = { id: 'arrival-position', template_slot_key: 'arrival', template_instance_ordinal: 0 };
  current.scene.endpoint_slots = [{ slot_key: 'arrival-slot', endpoint_role: 'arrival',
    required_position_slot_key: 'arrival', required_position_instance_ordinal: 0 }];
  current.canonical_connections = [{ binding: { ...binding('b-reverse', 'g5-origin'),
    from_scene_endpoint_slot_key: 'arrival-slot' }, profile }];

  assert.deepEqual(eligibleCanonicalConnections(current).map((row) => row.binding.id), ['b-reverse']);

  const wrongKey = { ...current, canonical_connections: [{ binding: { ...current.canonical_connections[0].binding,
    from_scene_endpoint_slot_key: 'other-slot' }, profile }], scene: { ...current.scene,
    endpoint_slots: [...current.scene.endpoint_slots, { slot_key: 'other-slot', endpoint_role: 'arrival',
      required_position_slot_key: 'somewhere-else', required_position_instance_ordinal: 0 }] } };
  assert.deepEqual(eligibleCanonicalConnections(wrongKey), []);

  const missingKey = { ...current, canonical_connections: [{ binding: { ...current.canonical_connections[0].binding,
    from_scene_endpoint_slot_key: 'missing-slot' }, profile }] };
  assert.throws(() => eligibleCanonicalConnections(missingKey), (error) =>
    error.code === 'LIVE_WORLD_EXPANSION_DATA_GAP'
      && error.details.reason === 'canonical_connection_source_endpoint_required');
});

test('a hidden local approach may end at the exact arrival source slot of a canonical connection', async () => {
  const current = context();
  const focus = { id: 'focus-position', template_slot_key: 'focus', template_instance_ordinal: 0 };
  const arrival = { id: 'arrival-position', template_slot_key: 'arrival', template_instance_ordinal: 0 };
  current.position = focus;
  current.scene = { ...current.scene, positions: [focus, arrival], endpoint_slots: [
    { slot_key: 'arrival-slot', endpoint_role: 'arrival', required_position_slot_key: 'arrival',
      required_position_instance_ordinal: 0 }], movement_edges: [
    { id: 'edge-arrival', from_position_id: focus.id, to_position_id: arrival.id, status: 'active' }] };
  current.canonical_connections = [{ binding: { ...binding('b-reverse', 'g5-origin'),
    from_scene_endpoint_slot_key: 'arrival-slot' }, profile }];
  const path = [{ edge_id: 'edge-arrival', from_position_id: focus.id, to_position_id: arrival.id }];
  const received = [];
  const runtime = runtimeFor(current, { generatedExpansionAdapter: {
    prepareCanonicalConnection: async (request) => { received.push(request); return { ok: true }; }
  } });

  assert.deepEqual(await runtime.listConnectionOptions(identity), []);
  assert.deepEqual(await runtime.listConnectionApproachOptions({ ...identity, firstStepEdgeIds: ['edge-arrival'] }), [
    { kind: 'approach', connection_binding_id: 'b-reverse', edge_id: 'edge-arrival',
      ordered_local_edge_path: path, display_label: 'бродом' }
  ]);
  assert.deepEqual(await runtime.prepareConnection({ ...identity, connectionBindingId: 'b-reverse',
    ordered_local_edge_path: path }), { ok: true });
  assert.equal(received.length, 1);
  assert.equal(received[0].source_position_id, arrival.id);
  assert.equal(received[0].approach_origin_position_id, focus.id);
  assert.deepEqual(received[0].ordered_local_edge_path, path);
});
