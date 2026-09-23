import assert from 'node:assert/strict';
import test from 'node:test';
import { createSpatialV3LocalSceneRuntime } from
  '../src/runtime/spatial-v3-local-scene-runtime.js';
import { createTraceLocalSceneCommands } from
  '../src/runtime/lower-dvina-trace-local-scene-commands.js';
import { applyS1LocalPositionTransition } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-commit-projections.js';

const positions = ['arrival', 'focus', 'departure'];
const edges = positions.flatMap((from, index) => [index > 0
  ? [from, positions[index - 1]] : null,
index < positions.length - 1 ? [from, positions[index + 1]] : null])
  .filter(Boolean).map(([from, to]) => ({
    journey_location_id: 'journey', journey_state_version: 1,
    edge_id: `${from}:${to}`, reverse_edge_id: `${to}:${from}`,
    from_position_ref: from, to_position_ref: to, cost_kind: 'action',
    action_units: 1, base_minutes: null, edge_capacity: 1,
    edge_state_version: 1, reverse_edge_state_version: 1,
    source_node_state_version: 1, destination_node_state_version: 1,
    destination_capacity: 2, destination_occupancy: 0,
    destination_slot_key: to, scene_baseline_id: 'baseline', site_id: 'site',
    transition_environment_profile_ref: null,
    movement_orientation_profile_ref: null,
    baseline_movement_method_id: null,
    movement_method_cost_profile_ref: null,
    dynamic_recheck_policy_ref: null
  }));

function state(position) {
  return { party_id: 'party', actor_id: 'actor', party_state: { state_version: 1 },
    position: { position_id: position }, journey_location: { id: 'journey',
      scene_position_id: position, state_version: 1 } };
}

test('local movement follows only committed directed edges; P16 changes exact position', async () => {
  let committed = state('arrival');
  const pool = { async query(_sql, [partyId, actorId, positionId]) {
    assert.deepEqual([partyId, actorId], ['party', 'actor']);
    return { rows: edges.filter(({ from_position_ref: from }) => from === positionId) };
  } };
  const runtime = createSpatialV3LocalSceneRuntime({ pool,
    readVisibleLocalEdgeRefs: async ({ state: current }) => edges
      .filter(({ from_position_ref: from }) => from === current.position.position_id)
      .map(({ edge_id: id }) => id) });
  const initial = await runtime.listLocalOptions({ partyId: 'party', actorId: 'actor', state: committed });
  assert.deepEqual(initial.map(({ edge_id: id }) => id), ['arrival:focus']);
  await assert.rejects(runtime.prepareLocalMovement({ partyId: 'party', actorId: 'actor',
    state: committed, edgeId: 'focus:departure', playerInput: {}, inputDigest: 'digest' }),
  { code: 'SPATIAL_V3_LOCAL_EDGE_UNAVAILABLE' });
  for (const [from, to] of [['arrival', 'focus'], ['focus', 'departure']]) {
    const result = await runtime.prepareLocalMovement({ partyId: 'party', actorId: 'actor',
      state: committed, edgeId: `${from}:${to}`, playerInput: {}, inputDigest: 'digest' });
    assert.equal(result.duration_minutes, 0);
    assert.equal(result.position_transition.movement_edge_ref, `${from}:${to}`);
    const snapshot = structuredClone(committed);
    applyS1LocalPositionTransition({ snapshot, state: committed,
      transition: result.position_transition });
    assert.equal(snapshot.position.position_id, to);
    committed = state(to);
  }
  assert.deepEqual((await runtime.listLocalOptions({ partyId: 'party', actorId: 'actor',
    state: committed })).map(({ edge_id: id }) => id), ['departure:focus']);
});

test('local command binds exact current edge and rejects stale state', async () => {
  const committed = state('arrival');
  const runtime = { async listLocalOptions() { return [{ edge_id: 'arrival:focus',
    display_label: 'Перейти к соседнему месту 1', action_units: 1 }]; },
  async prepareLocalMovement() { return { schema: 'turn_consequence_package',
    status: 'resolved', duration_minutes: 0, visible_seed: {}, hidden_update: {},
    state_changes: [], suggested_actions: [] }; } };
  const [command] = await createTraceLocalSceneCommands({ state: committed,
    inputDigest: 'digest', spatialLocalSceneRuntime: runtime });
  assert.equal(command.semantic_binding.operation_dto.target_ref, 'arrival:focus');
  assert.equal(command.availability({ retrievedState: committed }).can_attempt, true);
  const stale = { ...committed, position: { position_id: 'focus' } };
  assert.equal(command.availability({ retrievedState: stale }).can_attempt, false);
  await assert.rejects(command.consequence({ retrievedState: stale, playerInput: {} }),
    { code: 'SPATIAL_V3_LOCAL_SOURCE_STALE' });
});

test('full destination or changed journey version denies local movement', async () => {
  let occupied = true;
  const pool = { async query() { return { rows: [{ ...edges.find((edge) =>
    edge.edge_id === 'arrival:focus'), destination_occupancy: occupied ? 2 : 0 }] }; } };
  const runtime = createSpatialV3LocalSceneRuntime({ pool,
    readVisibleLocalEdgeRefs: async () => ['arrival:focus'] });
  const source = state('arrival');
  assert.deepEqual(await runtime.listLocalOptions({ partyId: 'party', actorId: 'actor',
    state: source }), []);
  occupied = false;
  const stale = structuredClone(source);
  stale.journey_location.state_version = 2;
  await assert.rejects(runtime.prepareLocalMovement({ partyId: 'party', actorId: 'actor',
    state: stale, edgeId: 'arrival:focus', playerInput: {}, inputDigest: 'digest' }),
  { code: 'SPATIAL_V3_LOCAL_EDGE_UNAVAILABLE' });
});

test('topology alone grants no player-facing local movement', async () => {
  const runtime = createSpatialV3LocalSceneRuntime({ pool: { async query() {
    throw new Error('topology must not be read without visibility proof');
  } } });
  assert.deepEqual(await runtime.listLocalOptions({ partyId: 'party', actorId: 'actor',
    state: state('arrival') }), []);
  await assert.rejects(runtime.prepareLocalMovement({ partyId: 'party', actorId: 'actor',
    state: state('arrival'), edgeId: 'arrival:focus', playerInput: {},
    inputDigest: 'digest' }), { code: 'SPATIAL_V3_LOCAL_VISIBILITY_DATA_GAP' });
});
