import assert from 'node:assert/strict';
import test from 'node:test';
import { createTraceExpansionCommands } from
  '../src/runtime/lower-dvina-trace-expansion-commands.js';
import { createTraceLocalSceneCommands } from
  '../src/runtime/lower-dvina-trace-local-scene-commands.js';
import { createSpatialV3LocalSceneRuntime } from
  '../src/runtime/spatial-v3-local-scene-runtime.js';
import { packageBase } from '../src/runtime/lower-dvina-trace-phase-3-command-shared.js';

const state = { party_id: 'party:expansion', actor_id: 'actor:traveller',
  party_state: { state_version: 4 },
  position: { position_id: 'position:shore', g5_anchor_id: 'site:shore', location_ref: 'shore' },
  journey_location: { id: 'journey:shore', scene_position_id: 'position:shore', state_version: 1 } };
const departurePositionId = 'position:exit-departure';

const localOption = (edgeId, destination_status = 'open') => ({ edge_id: edgeId,
  from_position_id: 'position:shore', to_position_id: departurePositionId,
  display_label: 'Проход 1', action_units: 1, destination_status });
const approachOption = (directionalExitId, edgeId, displayLabel) => ({
  directional_exit_id: directionalExitId, edge_id: edgeId, display_label: displayLabel,
  ordered_local_edge_path: [{ edge_id: edgeId, from_position_id: 'position:shore',
    to_position_id: departurePositionId }]
});

// Use the real local movement owner: only its database read is a fixture.
function movementScene({ occupancy = () => 0, disclosedStatus = 'open' } = {}) {
  const rows = ['edge:1', 'edge:2'].map((edge_id, index) => ({
    journey_location_id: state.journey_location.id, journey_state_version: 1,
    scene_baseline_id: 'baseline:shore', site_id: 'site:shore',
    edge_id, reverse_edge_id: `${edge_id}:reverse`,
    from_position_ref: state.position.position_id,
    to_position_ref: index === 0 ? departurePositionId : 'position:side',
    destination_slot_key: index === 0 ? 'departure' : 'side',
    cost_kind: 'action', action_units: 1, base_minutes: null, edge_capacity: 1,
    edge_state_version: 1, reverse_edge_state_version: 1,
    source_node_state_version: 1, destination_node_state_version: 1,
    destination_capacity: 2
  }));
  return createSpatialV3LocalSceneRuntime({
    pool: { async query(sql, [partyId, actorId, positionId]) {
      assert.match(sql, /^SELECT\b/, 'approach admission only reads; it cannot write or move');
      assert.deepEqual([partyId, actorId], [state.party_id, state.actor_id]);
      return { rows: rows.filter((row) => row.from_position_ref === positionId)
        .map((row) => ({ ...row, destination_occupancy: row.edge_id === 'edge:1' ? occupancy() : 0 })) };
    } },
    readLocalEdgeDisclosure: async () => [localOption('edge:1', disclosedStatus), localOption('edge:2')]
  });
}

function crossingOwner(calls, consequence, extra = {}) {
  const prepare = async (input) => { calls.push(['prepare', input]); return { ok: true }; };
  const traverse = async (input) => { calls.push(['traverse', input]); return consequence; };
  return { listExpansionOptions: async () => [], listApproachOptions: async () => [],
    prepareExpansion: prepare, prepareTraversal: traverse,
    prepareConnection: prepare, prepareConnectionTraversal: traverse, ...extra };
}

test('the exit asks only about owner-listed first steps and an occupied first step refuses without writes (D49/F3)',
  async () => {
    let asked = null;
    const calls = [];
    const before = structuredClone(state);
    const localScene = movementScene({ occupancy: () => 2, disclosedStatus: 'occupied' });
    const commandList = await createTraceExpansionCommands({ state, requestId: 'r', inputDigest: 'd',
      spatialExpansionRuntime: crossingOwner(calls, null, {
        listApproachOptions: async (input) => {
          asked = input;
          return [approachOption('exit:channel', 'edge:1', 'к руслу')]; } }),
      spatialLocalSceneRuntime: localScene });
    assert.deepEqual(asked.firstStepEdgeIds, ['edge:1', 'edge:2']);
    const [command] = commandList;
    assert.equal(command.command_id, 'live_world.follow_directional_exit:exit:channel');
    assert.equal(command.label, 'к руслу');
    await assert.rejects(command.consequence({ retrievedState: state, playerInput: 'иду к руслу' }),
      { code: 'SPATIAL_V3_LOCAL_EDGE_OCCUPIED' });
    assert.deepEqual(calls, [], 'neither topology nor traversal writer is entered');
    assert.deepEqual(state, before, 'refusal leaves the committed position and state unchanged');
  });

test('one exit command keeps the disclosed label without a separate approach suffix (D49/F4)',
  async () => {
    const localScene = { listLocalOptions: async () => [localOption('edge:1')],
      prepareLocalMovement: async () => null };
    const labelWith = async (display_label) => (await createTraceExpansionCommands({
      state, requestId: 'r', inputDigest: 'd',
      spatialExpansionRuntime: { listExpansionOptions: async () => [],
        listApproachOptions: async () => [approachOption('exit:x', 'edge:1', display_label)] },
      spatialLocalSceneRuntime: localScene }))[0].label;
    assert.equal(await labelWith('к руслу'), 'к руслу');
    assert.equal(await labelWith('в лес'), 'в лес');
  });

test('exit and G5 following recheck real first-step occupancy despite an open disclosed label (D49/F6)',
  async () => {
    for (const canonical of [false, true]) {
      let occupancy = 0;
      const calls = [];
      const before = structuredClone(state);
      const exitOption = approachOption('exit:channel', 'edge:1', 'к руслу');
      const { directional_exit_id, ...pathOption } = exitOption;
      const option = canonical ? { ...pathOption, connection_binding_id: 'binding:channel' } : exitOption;
      const consequence = packageBase({ inputDigest: 'a'.repeat(64), duration: 1, kind: 'movement' });
      const list = await createTraceExpansionCommands({ state, requestId: 'r', inputDigest: 'd',
        spatialExpansionRuntime: crossingOwner(calls, consequence, canonical
          ? { listConnectionApproachOptions: async () => [option] }
          : { listApproachOptions: async () => [option] }),
        spatialLocalSceneRuntime: movementScene({ occupancy: () => occupancy }) });
      assert.equal(list.length, 1, 'one follow command, no separate approach');
      const [command] = list;
      assert.equal(command.command_id, canonical
        ? 'live_world.follow_canonical_connection:binding:channel'
        : 'live_world.follow_directional_exit:exit:channel');
      assert.equal(command.label, 'к руслу');
      assert.equal(command.semantic_binding.operation_dto.movement_kind, 'route');
      assert.equal(command.semantic_binding.operation_dto.target_ref, canonical ? 'binding:channel' : directional_exit_id);
      assert.equal(command.semantic_binding.operation_dto.route_ref, command.target_id);
      occupancy = 2;
      assert.equal(await command.attemptRefusal({ committed_state: state }), true,
        'the local owner classifies a hidden occupied first step without returning a reason code');
      await assert.rejects(command.consequence({ retrievedState: state, playerInput: 'иду к руслу' }),
        { code: 'SPATIAL_V3_LOCAL_EDGE_OCCUPIED' });
      assert.deepEqual(calls, [], 'full occupancy refuses before either writer is entered');
      assert.deepEqual(state, before);
      occupancy = 0;
      assert.equal(await command.consequence({ retrievedState: state, playerInput: 'иду к руслу' }), consequence);
      assert.deepEqual(calls.map(([name]) => name), ['prepare', 'traverse']);
      for (const [, input] of calls) {
        assert.deepEqual(input.ordered_local_edge_path, option.ordered_local_edge_path);
        assert.equal(input.local_edge_path_proofs[0].movement_admission.destination_status, 'open');
        assert.equal(input.local_edge_path_proofs[0].movement_admission.destination_occupancy, 0);
      }
    }
  });

test('a route refusal owner that cannot classify the current first edge returns a typed gap',
  async () => {
    const localScene = { ...movementScene(),
      async localEdgeAttemptStatus() { return null; } };
    const [command] = await createTraceExpansionCommands({ state, requestId: 'r', inputDigest: 'd',
      spatialExpansionRuntime: crossingOwner([], null, {
        listApproachOptions: async () => [approachOption('exit:channel', 'edge:1', 'к руслу')] }),
      spatialLocalSceneRuntime: localScene });
    await assert.rejects(command.attemptRefusal({ committed_state: state }),
      { code: 'SPATIAL_V3_LOCAL_LINE_APPROACH_EDGE_UNAVAILABLE' });
  });

test('an approach whose first step the local-scene owner does not list is a typed gap, not a command (F3)',
  async () => {
    await assert.rejects(createTraceExpansionCommands({ state, requestId: 'r', inputDigest: 'd',
      spatialExpansionRuntime: { listExpansionOptions: async () => [],
        listApproachOptions: async () => [approachOption('exit:channel', 'edge:ghost', 'к руслу')] },
      spatialLocalSceneRuntime: { listLocalOptions: async () => [localOption('edge:1')],
        prepareLocalMovement: async () => null } }),
    { code: 'LIVE_WORLD_EXPANSION_OPTIONS_INVALID' });
  });

test('an off-departure exit follows once with the local owner proof before topology and traversal (D49/A-B1-06)',
  async () => {
    const route = approachOption('exit:channel', 'edge:1', 'к руслу');
    const calls = [];
    const consequence = packageBase({ inputDigest: 'a'.repeat(64), duration: 1, kind: 'movement' });
    const [command] = await createTraceExpansionCommands({ state,
      requestId: 'request:walk', inputDigest: 'input:digest',
      spatialExpansionRuntime: crossingOwner(calls, consequence, { listApproachOptions: async () => [route] }),
      spatialLocalSceneRuntime: { listLocalOptions: async () => [localOption('edge:1')],
        async prepareLocalLineApproach(input) { calls.push(['proof', input]); return ['verified-path']; },
        prepareLocalMovement: async () => assert.fail('G4 cannot execute a separate local approach') } });
    assert.equal(command.label, route.display_label);
    assert.equal(command.target_id, route.directional_exit_id);
    assert.deepEqual(command.semantic_binding.operation_dto, {
      op: 'request_movement', actor_ref: state.actor_id,
      target_ref: route.directional_exit_id, movement_kind: 'route',
      route_ref: route.directional_exit_id, description: route.display_label
    });
    const result = await command.consequence({ retrievedState: state, playerInput: 'иду к руслу' });
    assert.equal(result, consequence);
    assert.deepEqual(calls.map(([name]) => name), ['proof', 'prepare', 'traverse']);
    assert.deepEqual(calls[0][1].orderedLocalEdgePath, route.ordered_local_edge_path);
    for (const [, input] of calls) {
      assert.equal(input.partyId, state.party_id);
      assert.equal(input.actorId, state.actor_id);
    }
    for (const [, input] of calls.slice(1)) {
      assert.deepEqual(input.ordered_local_edge_path, route.ordered_local_edge_path);
      assert.deepEqual(input.local_edge_path_proofs, ['verified-path']);
    }
  });

test('the local edge and its disclosed exit remain distinct planner operations', async () => {
  const consequence = packageBase({ inputDigest: 'a'.repeat(64), duration: 1, kind: 'movement' });
  const localScene = { async listLocalOptions() { return [{ edge_id: 'edge:1', display_label: 'Проход 1',
    action_units: 1, destination_status: 'open' }]; }, prepareLocalMovement: async () => consequence };
  const [route] = await createTraceExpansionCommands({ state, requestId: 'r', inputDigest: 'd',
    spatialExpansionRuntime: { listExpansionOptions: async () => [],
      listApproachOptions: async () => [approachOption('exit:channel', 'edge:1', 'к руслу')] },
    spatialLocalSceneRuntime: localScene });
  const [local] = await createTraceLocalSceneCommands({ state, inputDigest: 'd', spatialLocalSceneRuntime: localScene });
  assert.equal(route.semantic_binding.operation_dto.movement_kind, 'route');
  assert.equal(local.semantic_binding.operation_dto.movement_kind, 'local');
  assert.equal(route.semantic_binding.matches({ operation: route.semantic_binding.operation_dto }), true);
  assert.equal(local.semantic_binding.matches({ operation: route.semantic_binding.operation_dto }), false);
  assert.equal(route.semantic_binding.matches({ operation: local.semantic_binding.operation_dto }), false);
  assert.equal(local.semantic_binding.matches({ operation: local.semantic_binding.operation_dto }), true);
});

test('an off-departure exit offers the G4 crossing alone instead of a first-hop approach', async () => {
  const route = approachOption('exit:channel', 'edge:1', 'к руслу');
  const list = await createTraceExpansionCommands({ state,
    requestId: 'request:walk', inputDigest: 'input:digest',
    spatialExpansionRuntime: { listExpansionOptions: async () => [],
      listApproachOptions: async () => [route] },
    spatialLocalSceneRuntime: { listLocalOptions: async () => [localOption('edge:1')],
      prepareLocalMovement: async () => packageBase({
        inputDigest: 'a'.repeat(64), duration: 1, kind: 'movement' }) } });
  assert.deepEqual(list.map(({ label, command_id }) => ({ label, command_id })),
    [{ label: 'к руслу', command_id: 'live_world.follow_directional_exit:exit:channel' }]);
  const [command] = list;
  assert.equal(command.semantic_binding.operation_dto.movement_kind, 'route');
  assert.equal(command.semantic_binding.operation_dto.target_ref, route.directional_exit_id);
});
