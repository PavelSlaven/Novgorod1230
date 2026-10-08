import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialV3ExpansionRuntime, eligibleCanonicalConnections } from '../src/runtime/spatial-v3-expansion-runtime.js';

const binding = (id, to) => ({ id, version: 2, parent_g4_id: 'g4', parent_g4_version: 4,
  from_canonical_g5_id: 'g5a', from_canonical_g5_version: 1, to_canonical_g5_id: to, to_canonical_g5_version: 1,
  connection_profile_id: 'prof', connection_profile_version: 2, from_scene_endpoint_slot_key: 'out',
  to_scene_endpoint_slot_key: 'in', status: 'approved' });
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
const labels = { 'b-water': 'Проход 3', 'b-yard': 'Проход 4' };
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
  const moved = { ...current, canonical_connections: [{ binding: { ...binding('x', 'g5x'), from_scene_endpoint_slot_key: 'other' }, profile }] };
  assert.deepEqual(eligibleCanonicalConnections(moved), []);
});

test('listConnectionOptions keeps the connections the disclosure owner reveals, with its approved label', async () => {
  const current = context();
  const runtime = runtimeFor(current, { readConnectionDisclosure: async ({ connections }) => disclose({
    connections: connections.filter(({ binding: { id } }) => id === 'b-yard') }) });
  assert.deepEqual(await runtime.listConnectionOptions(identity),
    [{ kind: 'connection', connection_binding_id: 'b-yard', display_label: 'Проход 4' }]);
  const blank = runtimeFor(current, { readConnectionDisclosure: async () => [{
    connection_binding_id: 'b-yard', knowledge_state: 'visible', display_label: ' ' }] });
  await assert.rejects(blank.listConnectionOptions(identity), (e) => e.details.reason === 'approved_connection_disclosure_required');
});

test('away from departure the first local hop toward it is the approach, and only an offered edge counts', async () => {
  const current = context();
  const departure = current.position;
  current.position = { id: 'focus-position', template_slot_key: 'focus', template_instance_ordinal: 0 };
  current.scene = { ...current.scene, positions: [current.position, departure],
    movement_edges: [{ id: 'edge-1', from_position_id: 'focus-position', to_position_id: departure.id, status: 'active' }] };
  const runtime = runtimeFor(current);
  assert.deepEqual(await runtime.listConnectionOptions(identity), []);
  assert.deepEqual(await runtime.listConnectionApproachOptions({ ...identity, firstStepEdgeIds: [] }), []);
  assert.deepEqual(await runtime.listConnectionApproachOptions({ ...identity, firstStepEdgeIds: ['edge-1'] }), [
    { kind: 'approach', connection_binding_id: 'b-water', edge_id: 'edge-1', display_label: 'Проход 3' },
    { kind: 'approach', connection_binding_id: 'b-yard', edge_id: 'edge-1', display_label: 'Проход 4' }]);
});

test('preparing a connection asks the adapter once with the exact source; a committed connection replays without it', async () => {
  const current = context();
  const seen = [];
  const onLabelGapsOmitted = () => {};
  const runtime = runtimeFor(current, { generatedExpansionAdapter: {
    prepareCanonicalConnection: async (request, diagnostics) => { seen.push({ request, diagnostics }); return { ok: true, topology_status: 'committed',
      connection_id: 'canconn:party:b-water' }; } } });
  const prepared = await runtime.prepareConnection({ ...identity, connectionBindingId: 'b-water', requestId: 'r' },
    { onLabelGapsOmitted });
  assert.equal(prepared.ok, true);
  assert.deepEqual(seen.map(({ request: { party_id, actor_id, binding_id, source_site_id, source_position_id, materializer_version } }) =>
    [party_id, actor_id, binding_id, source_site_id, source_position_id, materializer_version]),
  [['party', 'actor', 'b-water', 'site-a', 'departure-position', 'version']]);
  assert.deepEqual(seen[0].request.g4, current.g4);
  assert.equal(seen[0].diagnostics.onLabelGapsOmitted, onLabelGapsOmitted);
  assert.equal(Object.hasOwn(seen[0].request, 'onLabelGapsOmitted'), false);
  await assert.rejects(runtime.prepareConnection({ ...identity, connectionBindingId: 'nope' }),
    (e) => e.details.reason === 'selected_connection_unavailable');

  current.snapshot.site_connections = [{ id: 'canconn:party:b-water', status: 'active', from_site_id: 'site-a' }];
  const replay = await runtime.prepareConnection({ ...identity, connectionBindingId: 'b-water' });
  assert.deepEqual([replay.ok, replay.replay, replay.connection_id, replay.moves_traveller, replay.advances_time],
    [true, true, 'canconn:party:b-water', false, false]);
  assert.equal(seen.length, 1);
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
