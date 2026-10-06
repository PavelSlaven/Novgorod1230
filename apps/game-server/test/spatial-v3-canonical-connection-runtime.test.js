import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialV3ExpansionRuntime, eligibleCanonicalConnections } from '../src/runtime/spatial-v3-expansion-runtime.js';
import { createSpatialV3CombinedAtomicCommitter } from
  '../src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';

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
  assert.deepEqual(await runtime.listConnectionOptions({ ...identity, state: { position: { position_id: 'departure-position' } } }),
    [{ kind: 'connection', connection_binding_id: 'b-yard', display_label: 'Проход 4' }]);
  const blank = runtimeFor(current, { readConnectionDisclosure: async () => [{
    connection_binding_id: 'b-yard', knowledge_state: 'visible', display_label: ' ' }] });
  await assert.rejects(blank.listConnectionOptions(identity), (e) => e.details.reason === 'approved_connection_disclosure_required');
});

test('from arrival a disclosed connection is available as one route only through an owner-admitted path', async () => {
  const current = context();
  const departure = current.position;
  current.position = { id: 'focus-position', template_slot_key: 'focus', template_instance_ordinal: 0 };
  current.scene = { ...current.scene, positions: [current.position, departure],
    movement_edges: [{ id: 'edge-1', from_position_id: 'focus-position', to_position_id: departure.id, status: 'active' }] };
  current.scene.endpoint_slots[0].required_position_slot_key = 'departure';
  const state = { position: { position_id: 'focus-position' } };
  const localSceneMovementRuntime = {
    async listAdmittedEdgesAt({ positionId }) {
      return positionId === 'focus-position' ? [{ movement_admission: { edge_id: 'edge-1',
        from_position_ref: 'focus-position', to_position_ref: departure.id, destination_status: 'open' } }] : [];
    },
    async prepareLocalApproachChain({ edgeIds }) { return { origin_position_ref: 'focus-position',
      terminal_position_ref: departure.id, edges: edgeIds }; }
  };
  const runtime = runtimeFor(current, { localSceneMovementRuntime });
  const disclosedRoutes = [
    { kind: 'connection', connection_binding_id: 'b-water', display_label: 'Проход 3' },
    { kind: 'connection', connection_binding_id: 'b-yard', display_label: 'Проход 4' }];
  assert.deepEqual(await runtime.listConnectionOptions({ ...identity, state, firstStepEdgeIds: [] }), disclosedRoutes);
  assert.deepEqual(await runtime.listConnectionOptions({ ...identity, state, firstStepEdgeIds: ['other'] }), disclosedRoutes);
  await assert.rejects(runtime.prepareConnection({ ...identity, state, firstStepEdgeIds: [],
    connectionBindingId: 'b-water' }), (error) => error.code === 'LIVE_WORLD_INTERNAL_PATH_UNAVAILABLE'
      && /нельзя пройти по доступным проходам/u.test(error.message));
  assert.deepEqual(await runtime.listConnectionOptions({ ...identity, state, firstStepEdgeIds: ['edge-1'] }), disclosedRoutes);
  const seen = [];
  const preparedRuntime = runtimeFor(current, { localSceneMovementRuntime,
    generatedExpansionAdapter: { async prepareCanonicalConnection(request) {
      seen.push(request); return { ok: true, connection_id: 'canconn:party:b-water' };
    } } });
  const expansion = await preparedRuntime.prepareConnection({ ...identity, state,
    firstStepEdgeIds: ['edge-1'], connectionBindingId: 'b-water' });
  assert.equal(expansion.source_position_id, departure.id);
  assert.equal(expansion.local_approach_chain.terminal_position_ref, departure.id);
  assert.equal(seen[0].source_position_id, departure.id);
  current.snapshot.site_connections = [{ id: expansion.connection_id, status: 'active', from_site_id: 'site-a' }];
  let traversalInput;
  const traversalRuntime = runtimeFor(current, { localSceneMovementRuntime,
    prepareSiteTraversal: async (input) => { traversalInput = input; return { ok: true }; } });
  await traversalRuntime.prepareConnectionTraversal({ ...identity, state,
    firstStepEdgeIds: ['edge-1'], connectionBindingId: 'b-water', expansion });
  assert.equal(traversalInput.state.position.position_id, departure.id);
  assert.equal(traversalInput.state.journey_location.scene_position_id, departure.id);
  assert.equal(traversalInput.origin_state.position.position_id, 'focus-position');
  assert.deepEqual(traversalInput.local_approach_chain, expansion.local_approach_chain);
});

test('preparing a connection asks the adapter once with the exact source; a committed connection replays without it', async () => {
  const current = context();
  const seen = [];
  const replayLocks = [];
  const runtime = runtimeFor(current, { generatedExpansionAdapter: {
    prepareCanonicalConnection: async (request) => { seen.push(request); return { ok: true, topology_status: 'committed',
      connection_id: 'canconn:party:b-water' }; },
    async lockExpansionReplay(request) { replayLocks.push(request); return { ok: true }; } } });
  const prepared = await runtime.prepareConnection({ ...identity, connectionBindingId: 'b-water', requestId: 'r' });
  assert.equal(prepared.ok, true);
  assert.deepEqual(seen.map(({ party_id, actor_id, binding_id, source_site_id, source_position_id, materializer_version }) =>
    [party_id, actor_id, binding_id, source_site_id, source_position_id, materializer_version]),
  [['party', 'actor', 'b-water', 'site-a', 'departure-position', 'version']]);
  assert.deepEqual(seen[0].g4, current.g4);
  await assert.rejects(runtime.prepareConnection({ ...identity, connectionBindingId: 'nope' }),
    (e) => e.details.reason === 'selected_connection_unavailable');

  current.snapshot.site_connections = [{ id: 'canconn:party:b-water', status: 'active', from_site_id: 'site-a' }];
  const transaction = { query() {} };
  const replay = await runtime.prepareConnection({ ...identity,
    connectionBindingId: 'b-water', transaction });
  assert.deepEqual([replay.ok, replay.replay, replay.connection_id, replay.moves_traveller, replay.advances_time],
    [true, true, 'canconn:party:b-water', false, false]);
  assert.deepEqual(replayLocks, [{ party_id: 'party', g4_id: 'g4', transaction }]);
  assert.equal(seen.length, 1);
});

test('connection replay acquires P16 scope locks before traversal recheck', async () => {
  const current = context();
  current.snapshot.site_connections = [{ id: 'canconn:party:b-water',
    status: 'active', from_site_id: 'site-a' }];
  const order = [];
  const transaction = { async query(statement, params) {
    if (statement.includes('pg_advisory_xact_lock')) {
      order.push({ kind: 'lock', keys: params[0] });
    }
    return { rows: [], rowCount: 0 };
  }};
  const committer = createSpatialV3CombinedAtomicCommitter({
    withTransaction: async (work) => work(transaction),
    recheck: async () => ({ ok: true })
  });
  const runtime = runtimeFor(current, {
    generatedExpansionAdapter: { lockExpansionReplay: (request) =>
      committer.lockExpansionReplay(request) },
    prepareSiteTraversal: async () => {
      order.push({ kind: 'traversal-recheck' });
      return { ok: true };
    }
  });
  const expansion = await runtime.prepareConnection({ ...identity,
    connectionBindingId: 'b-water', transaction });
  await runtime.prepareConnectionTraversal({ ...identity,
    connectionBindingId: 'b-water', expansion, transaction });
  assert.deepEqual(order, [
    { kind: 'lock', keys: ['00:g4:party:g4', '01:clock:party'] },
    { kind: 'traversal-recheck' }
  ]);
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
