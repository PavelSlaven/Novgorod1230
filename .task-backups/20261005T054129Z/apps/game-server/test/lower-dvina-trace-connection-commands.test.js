import assert from 'node:assert/strict';
import test from 'node:test';
import { createTraceExpansionCommands } from '../src/runtime/lower-dvina-trace-expansion-commands.js';
import { createTraceLocalSceneCommands } from '../src/runtime/lower-dvina-trace-local-scene-commands.js';
import { packageBase } from '../src/runtime/lower-dvina-trace-phase-3-command-shared.js';

const state = { party_id: 'party:walk', actor_id: 'actor:walker', party_state: { state_version: 4 },
  position: { g5_anchor_id: 'site:yard', location_ref: 'yard' } };
const localOption = (edge_id, destination_status = 'open') => ({ edge_id, display_label: 'Проход 1',
  action_units: 1, destination_status });
const localScene = (extra = {}) => ({ listLocalOptions: async () => [localOption('edge:1')],
  prepareLocalMovement: async () => packageBase({ inputDigest: 'a'.repeat(64), duration: 1, kind: 'movement' }), ...extra });
const commands = (runtime, scene = localScene()) => createTraceExpansionCommands({ state, requestId: 'r',
  inputDigest: 'd', spatialExpansionRuntime: { listExpansionOptions: async () => [],
    listApproachOptions: async () => [], ...runtime }, spatialLocalSceneRuntime: scene });
const crossing = { kind: 'connection', connection_binding_id: 'binding:water', display_label: 'Проход 3' };

test('a runtime without connections yields exactly the exit commands as before', async () => {
  assert.deepEqual(await commands({}), []);
});

test('a canonical connection is one exact route operation named by its approved label', async () => {
  const [command] = await commands({ listConnectionOptions: async (input) => {
    assert.deepEqual(input, { partyId: state.party_id, actorId: state.actor_id, state,
      firstStepEdgeIds: ['edge:1'] });
    return [crossing]; } });
  assert.equal(command.command_id, 'live_world.follow_canonical_connection:binding:water');
  assert.equal(command.label, 'Проход 3');
  assert.deepEqual(command.semantic_binding.operation_dto, { op: 'request_movement', actor_ref: state.actor_id,
    target_ref: 'binding:water', movement_kind: 'route', route_ref: 'binding:water', description: 'Проход 3' });
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

test('a canonical route remains a single route choice from the current position', async () => {
  const list = await commands({ listConnectionOptions: async () => [crossing] });
  assert.equal(list.length, 1);
  assert.equal(list[0].semantic_binding.operation_dto.movement_kind, 'route');
  assert.equal(list[0].semantic_binding.operation_dto.target_ref, 'binding:water');
});

test('an unlisted first step, a blank label or a repeated binding is a typed gap, not a command', async () => {
  await assert.rejects(commands({ listConnectionOptions: async () => [{ ...crossing, display_label: ' ' }] }),
    { code: 'LIVE_WORLD_EXPANSION_OPTIONS_INVALID' });
  await assert.rejects(commands({ listConnectionOptions: async () => [crossing, crossing] }),
    { code: 'LIVE_WORLD_EXPANSION_OPTIONS_INVALID' });
});
