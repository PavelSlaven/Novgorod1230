import assert from 'node:assert/strict';
import test from 'node:test';
import { createTraceExpansionCommands } from
  '../src/runtime/lower-dvina-trace-expansion-commands.js';
import { createTraceLocalSceneCommands } from
  '../src/runtime/lower-dvina-trace-local-scene-commands.js';
import { packageBase } from '../src/runtime/lower-dvina-trace-phase-3-command-shared.js';

const state = { party_id: 'party:expansion', actor_id: 'actor:traveller',
  party_state: { state_version: 4 },
  position: { g5_anchor_id: 'site:shore', location_ref: 'shore' } };

const localOption = (edgeId, destination_status = 'open') => ({ edge_id: edgeId,
  display_label: 'Проход 1', action_units: 1, destination_status });

test('the approach asks the expansion owner only about first steps the local-scene owner lists, and carries the first step status (F3)',
  async () => {
    let asked = null;
    const localScene = { listLocalOptions: async () => [localOption('edge:1', 'occupied'),
      localOption('edge:2')], prepareLocalMovement: async () => null };
    const commandList = await createTraceExpansionCommands({ state, requestId: 'r', inputDigest: 'd',
      spatialExpansionRuntime: { listExpansionOptions: async () => [],
        listApproachOptions: async (input) => {
          asked = input;
          return [{ directional_exit_id: 'exit:channel', edge_id: 'edge:1', display_label: 'к руслу' }]; } },
      spatialLocalSceneRuntime: localScene });
    assert.deepEqual(asked.firstStepEdgeIds, ['edge:1', 'edge:2']);
    const [approach] = commandList;
    assert.deepEqual(approach.semantic_grounding, { destination_status: 'occupied' });
    assert.match(approach.label, /\(проход занят\)$/);
    assert.match(approach.semantic_binding.operation_dto.description, /\(проход занят\)$/);
  });

test('the approach wording is the approved phrase the disclosure owner supplied, water or land (F4)',
  async () => {
    const localScene = { listLocalOptions: async () => [localOption('edge:1')],
      prepareLocalMovement: async () => null };
    const labelWith = async (approach_phrase, display_label) => (await createTraceExpansionCommands({
      state, requestId: 'r', inputDigest: 'd',
      spatialExpansionRuntime: { listExpansionOptions: async () => [],
        listApproachOptions: async () => [{ directional_exit_id: 'exit:x', edge_id: 'edge:1',
          display_label, approach_phrase }] },
      spatialLocalSceneRuntime: localScene }))[0].label;
    assert.equal(await labelWith('подход к переправе', 'к руслу'), 'к руслу — подход к переправе');
    assert.equal(await labelWith('подход по суше', 'в лес'), 'в лес — подход по суше');
    assert.ok(!(await labelWith('подход по суше', 'в лес')).includes('переправ'));
  });

test('the approach refuses before executing when the movement owner finds its first step full (F6)',
  async () => {
    const statusOf = (verdict) => createTraceExpansionCommands({ state, requestId: 'r', inputDigest: 'd',
      spatialExpansionRuntime: { listExpansionOptions: async () => [],
        listApproachOptions: async () => [{ directional_exit_id: 'exit:channel', edge_id: 'edge:1',
          display_label: 'к руслу' }] },
      spatialLocalSceneRuntime: { listLocalOptions: async () => [localOption('edge:1')],
        localEdgeAttemptStatus: async () => verdict, prepareLocalMovement: async () => null } })
      .then(([command]) => command.attemptRefusal({ committed_state: state }));
    assert.equal(await statusOf('occupied'), 'destination_occupied');
    assert.equal(await statusOf('open'), null);
  });

test('an approach whose first step the local-scene owner does not list is a typed gap, not a command (F3)',
  async () => {
    await assert.rejects(createTraceExpansionCommands({ state, requestId: 'r', inputDigest: 'd',
      spatialExpansionRuntime: { listExpansionOptions: async () => [],
        listApproachOptions: async () => [{ directional_exit_id: 'exit:channel', edge_id: 'edge:ghost',
          display_label: 'к руслу' }] },
      spatialLocalSceneRuntime: { listLocalOptions: async () => [localOption('edge:1')],
        prepareLocalMovement: async () => null } }),
    { code: 'LIVE_WORLD_EXPANSION_OPTIONS_INVALID' });
  });

test('a reachable-but-not-yet-at-departure exit offers its approach through the local-scene owner, not a second one (A-B1-06)',
  async () => {
    const approach = { directional_exit_id: 'exit:channel', edge_id: 'edge:1', display_label: 'к руслу' };
    let prepared = null;
    const consequence = packageBase({ inputDigest: 'a'.repeat(64), duration: 1, kind: 'movement' });
    const [command] = await createTraceExpansionCommands({ state,
      requestId: 'request:walk', inputDigest: 'input:digest',
      spatialExpansionRuntime: { listExpansionOptions: async () => [],
        listApproachOptions: async () => [approach] },
      spatialLocalSceneRuntime: { listLocalOptions: async () => [localOption('edge:1')],
        async prepareLocalMovement(input) { prepared = input; return consequence; } } });
    assert.equal(command.label, 'к руслу — подход');
    assert.equal(command.target_id, 'edge:1');
    const operation = command.semantic_binding.operation_dto;
    assert.equal(operation.movement_kind, 'local');
    assert.equal(operation.target_ref, 'edge:1');
    const result = await command.consequence({ retrievedState: state, playerInput: 'иду к руслу' });
    assert.equal(result, consequence);
    assert.equal(prepared.edgeId, 'edge:1');
    assert.equal(prepared.partyId, state.party_id);
    assert.equal(prepared.actorId, state.actor_id);
  });

test('the approach and the plain local command for the same edge never both claim one operation', async () => {
  const consequence = packageBase({ inputDigest: 'a'.repeat(64), duration: 1, kind: 'movement' });
  const localScene = { async listLocalOptions() { return [{ edge_id: 'edge:1', display_label: 'Проход 1',
    action_units: 1, destination_status: 'open' }]; }, prepareLocalMovement: async () => consequence };
  const [approach] = await createTraceExpansionCommands({ state, requestId: 'r', inputDigest: 'd',
    spatialExpansionRuntime: { listExpansionOptions: async () => [],
      listApproachOptions: async () => [{ directional_exit_id: 'exit:channel', edge_id: 'edge:1', display_label: 'к руслу' }] },
    spatialLocalSceneRuntime: localScene });
  const [plain] = await createTraceLocalSceneCommands({ state, inputDigest: 'd', spatialLocalSceneRuntime: localScene });
  const bindings = [approach, plain].map((command) => command.semantic_binding);
  for (const own of bindings) {
    const claiming = bindings.filter((binding) => binding.matches({ operation: own.operation_dto }));
    assert.equal(claiming.length, 1, 'exactly one binding must claim each operation');
    assert.equal(claiming[0], own);
  }
});

test('a candidate crossing is not offered while only an approach is reachable', async () => {
  const approach = { directional_exit_id: 'exit:channel', edge_id: 'edge:1', display_label: 'к руслу' };
  const commandList = await createTraceExpansionCommands({ state,
    requestId: 'request:walk', inputDigest: 'input:digest',
    spatialExpansionRuntime: { listExpansionOptions: async () => [],
      listApproachOptions: async () => [approach] },
    spatialLocalSceneRuntime: { listLocalOptions: async () => [localOption('edge:1')],
      prepareLocalMovement: async () => packageBase({
        inputDigest: 'a'.repeat(64), duration: 1, kind: 'movement' }) } });
  assert.equal(commandList.length, 1);
  assert.equal(commandList[0].command_id, 'live_world.approach_directional_exit:exit:channel');
});
