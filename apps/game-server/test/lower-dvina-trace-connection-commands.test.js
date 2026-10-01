import assert from 'node:assert/strict';
import test from 'node:test';
import { createTraceExpansionCommands } from '../src/runtime/lower-dvina-trace-expansion-commands.js';
import { createTraceLocalSceneCommands } from '../src/runtime/lower-dvina-trace-local-scene-commands.js';
import { packageBase } from '../src/runtime/lower-dvina-trace-phase-3-command-shared.js';

const state = { party_id: 'party:walk', actor_id: 'actor:walker', party_state: { state_version: 4 },
  position: { g5_anchor_id: 'site:yard', location_ref: 'yard' } };
const localOption = (edge_id, destination_status = 'open') => ({ edge_id, display_label: 'Дальше',
  action_units: 1, destination_status });
const localScene = (extra = {}) => ({ listLocalOptions: async () => [localOption('edge:1')],
  prepareLocalMovement: async () => packageBase({ inputDigest: 'a'.repeat(64), duration: 1, kind: 'movement' }), ...extra });
const commands = (runtime, scene = localScene()) => createTraceExpansionCommands({ state, requestId: 'r',
  inputDigest: 'd', spatialExpansionRuntime: { listExpansionOptions: async () => [],
    listApproachOptions: async () => [], ...runtime }, spatialLocalSceneRuntime: scene });
const crossing = { kind: 'connection', connection_binding_id: 'binding:water', display_label: 'бродом' };
const approach = { kind: 'approach', connection_binding_id: 'binding:water', edge_id: 'edge:1',
  ordered_local_edge_path: [{ edge_id: 'edge:1', from_position_id: 'p0', to_position_id: 'p1' }],
  display_label: 'бродом' };

test('a runtime without connections yields exactly the exit commands as before', async () => {
  assert.deepEqual(await commands({}), []);
});

test('a canonical connection is one exact route operation named by its approved label', async () => {
  const [command] = await commands({ listConnectionOptions: async (input) => {
    assert.deepEqual(input, { partyId: state.party_id, actorId: state.actor_id });
    return [crossing]; } });
  assert.equal(command.command_id, 'live_world.follow_canonical_connection:binding:water');
  assert.equal(command.label, 'бродом');
  assert.deepEqual(command.semantic_binding.operation_dto, { op: 'request_movement', actor_ref: state.actor_id,
    target_ref: 'binding:water', movement_kind: 'route', route_ref: 'binding:water', description: 'бродом' });
  assert.equal(command.semantic_binding.matches({ operation: { ...command.semantic_binding.operation_dto,
    description: 'echoed differently' } }), true);
  assert.equal(command.semantic_binding.matches({ operation: { ...command.semantic_binding.operation_dto,
    route_ref: 'binding:other' } }), false);
});

test('the connection commits its topology first, then travels, and a refused travel says the way stayed prepared', async () => {
  const seen = [];
  const consequence = packageBase({ inputDigest: 'a'.repeat(64), duration: 1, kind: 'movement' });
  const runtime = (travel) => ({ listConnectionOptions: async () => [crossing],
    async prepareConnection(input) { seen.push(['prepare', input]); return { ok: true, connection_id: 'canconn:x',
      source_position_id: 'p' }; },
    prepareConnectionTraversal: travel });
  const [ok] = await commands(runtime(async (input) => { seen.push(['travel', input]); return consequence; }));
  assert.equal(await ok.consequence({ retrievedState: state, playerInput: { idempotency_key: 'k' } }), consequence);
  assert.deepEqual(seen.map(([name]) => name), ['prepare', 'travel']);
  assert.equal(seen[0][1].connectionBindingId, 'binding:water');
  assert.equal(seen[1][1].expansion.connection_id, 'canconn:x');
  const [denied] = await commands(runtime(async () => { throw Object.assign(new Error('no'), { code: 'X' }); }));
  await assert.rejects(denied.consequence({ retrievedState: state, playerInput: {} }),
    (error) => error.code === 'LIVE_WORLD_TOPOLOGY_COMMITTED_MOVEMENT_DENIED'
      && error.details.actor_moved === false && error.details.time_advanced === false);
  await assert.rejects(ok.consequence({ retrievedState: { ...state, party_state: { state_version: 9 } },
    playerInput: {} }), { code: 'LIVE_WORLD_EXPANSION_SOURCE_STALE' });
});

test('an off-departure line remains one route request and carries hidden ordered approach path', async () => {
  const path = [{ edge_id: 'edge:1', from_position_id: 'p0', to_position_id: 'p1' },
    { edge_id: 'edge:2', from_position_id: 'p1', to_position_id: 'p2' }];
  const calls = [];
  const scene = localScene({ prepareLocalLineApproach: async (_input) => ['verified-path'] });
  const [command] = await commands({ listConnectionOptions: async () => [],
    listConnectionApproachOptions: async (input) => {
      assert.deepEqual(input.firstStepEdgeIds, ['edge:1']);
      return [{ ...approach, ordered_local_edge_path: path }];
    },
    async prepareConnection(input) { calls.push(['prepare', input]); return { ok: true,
      connection_id: 'connection:water', source_position_id: 'p2' }; },
    async prepareConnectionTraversal(input) { calls.push(['traverse', input]);
      return packageBase({ inputDigest: 'a'.repeat(64), duration: 1, kind: 'movement' }); }
  }, scene);
  assert.equal(command.command_id, 'live_world.follow_canonical_connection:binding:water');
  assert.equal(command.label, 'бродом');
  const operation = command.semantic_binding.operation_dto;
  assert.deepEqual([operation.movement_kind, operation.target_ref, operation.route_ref],
    ['route', 'binding:water', 'binding:water']);
  const result = await command.consequence({ retrievedState: state, playerInput: 'p' });
  assert.equal(result.duration_minutes, 1);
  assert.deepEqual(calls.map(([name]) => name), ['prepare', 'traverse']);
  assert.deepEqual(calls[0][1].ordered_local_edge_path, path);
  assert.deepEqual(calls[1][1].ordered_local_edge_path, path);
  assert.deepEqual(calls[1][1].local_edge_path_proofs, ['verified-path']);
  assert.equal(calls[1][1].expansion.connection_id, 'connection:water');
});

test('an off-departure generated exit is one named route request with local proof before P16', async () => {
  const path = [{ edge_id: 'edge:1', from_position_id: 'p0', to_position_id: 'p1' }];
  const calls = [];
  const scene = localScene({
    prepareLocalLineApproach: async () => { calls.push(['proof']); return ['verified-path']; },
    prepareLocalMovement: async () => { calls.push(['local-move']); return null; }
  });
  const [command] = await commands({ listExpansionOptions: async () => [],
    listApproachOptions: async () => [{ kind: 'approach', directional_exit_id: 'exit:wood', edge_id: 'edge:1',
      ordered_local_edge_path: path, display_label: 'к лесной дороге' }],
    async prepareExpansion(input) { calls.push(['prepare', input]);
      return { ok: true, connection_id: 'generated:wood', source_position_id: 'p1' }; },
    async prepareTraversal(input) { calls.push(['traverse', input]);
      return packageBase({ inputDigest: 'a'.repeat(64), duration: 5, kind: 'movement' }); }
  }, scene);
  assert.equal(command.command_id, 'live_world.follow_directional_exit:exit:wood');
  assert.equal(command.label, 'к лесной дороге');
  assert.equal(command.semantic_binding.operation_dto.movement_kind, 'route');
  await command.consequence({ retrievedState: state, playerInput: 'лесная дорога' });
  assert.deepEqual(calls.map(([name]) => name), ['proof', 'prepare', 'traverse']);
  assert.deepEqual(calls[1][1].ordered_local_edge_path, path);
  assert.deepEqual(calls[2][1].ordered_local_edge_path, path);
  assert.deepEqual(calls[2][1].local_edge_path_proofs, ['verified-path']);
  assert.equal(calls.filter(([name]) => name === 'local-move').length, 0);
});

test('a stale direct generated-exit option resolves the current local approach before P16', async () => {
  const path = [{ edge_id: 'edge:1', from_position_id: 'p0', to_position_id: 'p1' }];
  const calls = [];
  let approachReads = 0;
  const scene = localScene({ prepareLocalLineApproach: async (_input) => ['verified-path'] });
  const [command] = await commands({ listExpansionOptions: async () => [
    { directional_exit_id: 'exit:wood', display_label: 'к лесной дороге' }
  ], listApproachOptions: async ({ firstStepEdgeIds }) => {
    assert.deepEqual(firstStepEdgeIds, ['edge:1']);
    approachReads += 1;
    return approachReads === 1 ? [] : [{ directional_exit_id: 'exit:wood', edge_id: 'edge:1',
      ordered_local_edge_path: path, display_label: 'к лесной дороге' }];
  }, async prepareExpansion(input) { calls.push(['prepare', input]); return { ok: true }; },
  async prepareTraversal(input) { calls.push(['traverse', input]);
    return packageBase({ inputDigest: 'a'.repeat(64), duration: 5, kind: 'movement' }); }
  }, scene);
  await command.consequence({ retrievedState: state, playerInput: 'лесная дорога' });
  assert.equal(approachReads, 2);
  assert.deepEqual(calls[0][1].ordered_local_edge_path, path);
  assert.deepEqual(calls[1][1].local_edge_path_proofs, ['verified-path']);
});

test('line, generated exit approach and plain local edge never claim one another\'s operation', async () => {
  const scene = localScene();
  const list = [...await commands({ listConnectionApproachOptions: async () => [approach],
    listConnectionOptions: async () => [],
    listExpansionOptions: async () => [],
    listApproachOptions: async () => [{ directional_exit_id: 'exit:x', edge_id: 'edge:1',
      ordered_local_edge_path: approach.ordered_local_edge_path, display_label: 'к руслу' }] }, scene),
  ...await createTraceLocalSceneCommands({ state, inputDigest: 'd', spatialLocalSceneRuntime: scene })];
  assert.equal(list.length, 3);
  const bindings = list.map((command) => command.semantic_binding);
  for (const own of bindings) {
    const claiming = bindings.filter((binding) => binding.matches({ operation: own.operation_dto }));
    assert.deepEqual(claiming, [own]);
  }
});

test('an unlisted first step, a blank label or a repeated binding is a typed gap, not a command', async () => {
  await assert.rejects(commands({ listConnectionApproachOptions: async () => [{ ...approach, edge_id: 'edge:ghost' }] }),
    { code: 'LIVE_WORLD_EXPANSION_OPTIONS_INVALID' });
  await assert.rejects(commands({ listConnectionOptions: async () => [{ ...crossing, display_label: ' ' }] }),
    { code: 'LIVE_WORLD_EXPANSION_OPTIONS_INVALID' });
  await assert.rejects(commands({ listConnectionOptions: async () => [crossing, crossing] }),
    { code: 'LIVE_WORLD_EXPANSION_OPTIONS_INVALID' });
});
