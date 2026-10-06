import assert from 'node:assert/strict';
import test from 'node:test';
import { createTraceExpansionCommands } from
  '../src/runtime/lower-dvina-trace-expansion-commands.js';
import { createTraceLocalSceneCommands } from
  '../src/runtime/lower-dvina-trace-local-scene-commands.js';
import { packageBase } from '../src/runtime/lower-dvina-trace-phase-3-command-shared.js';

const state = { party_id: 'party:expansion', actor_id: 'actor:traveller',
  party_state: { state_version: 4 }, position: { position_id: 'position:arrival' } };
const localOption = (edgeId) => ({ edge_id: edgeId,
  display_label: 'Проход 1', action_units: 1, destination_status: 'open' });

test('a disclosed exit is offered as one route operation with owner-admitted first steps', async () => {
  let requested = null;
  const firstSteps = [localOption('edge:1'), localOption('edge:2')];
  const route = { directional_exit_id: 'exit:channel', display_label: 'Уйти к руслу' };
  const localScene = { listLocalOptions: async () => firstSteps };
  const [command] = await createTraceExpansionCommands({ state, requestId: 'r', inputDigest: 'd',
    spatialExpansionRuntime: { listExpansionOptions: async (input) => {
      requested = input;
      return [route];
    }, listConnectionOptions: async () => [] }, spatialLocalSceneRuntime: localScene });

  assert.deepEqual(requested.firstStepEdgeIds, ['edge:1', 'edge:2']);
  assert.equal(command.label, route.display_label);
  assert.equal(command.target_id, route.directional_exit_id);
  assert.deepEqual(command.semantic_binding.operation_dto, {
    op: 'request_movement', actor_ref: state.actor_id,
    target_ref: route.directional_exit_id, movement_kind: 'route',
    route_ref: route.directional_exit_id, description: route.display_label
  });
});

test('the local edge and its disclosed exit remain distinct planner operations', async () => {
  const localScene = { listLocalOptions: async () => [localOption('edge:1')],
    prepareLocalMovement: async () => packageBase({ inputDigest: 'a'.repeat(64),
      duration: 1, kind: 'movement' }) };
  const [route] = await createTraceExpansionCommands({ state, requestId: 'r', inputDigest: 'd',
    spatialExpansionRuntime: { listExpansionOptions: async () => [
      { directional_exit_id: 'exit:channel', display_label: 'Уйти к руслу' }],
    listConnectionOptions: async () => [] }, spatialLocalSceneRuntime: localScene });
  const [local] = await createTraceLocalSceneCommands({ state, inputDigest: 'd',
    spatialLocalSceneRuntime: localScene });

  assert.equal(route.semantic_binding.operation_dto.movement_kind, 'route');
  assert.equal(local.semantic_binding.operation_dto.movement_kind, 'local');
  assert.equal(route.semantic_binding.matches({ operation: route.semantic_binding.operation_dto }), true);
  assert.equal(local.semantic_binding.matches({ operation: route.semantic_binding.operation_dto }), false);
  assert.equal(route.semantic_binding.matches({ operation: local.semantic_binding.operation_dto }), false);
  assert.equal(local.semantic_binding.matches({ operation: local.semantic_binding.operation_dto }), true);
});
