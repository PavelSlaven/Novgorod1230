import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { connect } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createLlmSettingsOwner } from '@rus/game-server';
import { loadP3DevConfig, startP3LiveCoordinator } from './p3-live-coordinator.mjs';
import { createP3RoleRuntime } from './p3-boundary.js';
import { createP3LiveChannel, createP3NativeSocketAdapter } from './p3-live-socket.js';
import { matchesP3WireModelId } from './p3-wire-smoke.mjs';
import { npcProjection, speechPlan } from './p3-test-frames.js';

const withNpcs = (base, npcs) => ({ ...base, actors: [...base.actors, ...npcs],
  npc_projections: npcs.map(({ actor_id: actorId, position, name }) =>
    npcProjection(actorId, { position, name })) });

const observation = { schema: 'p3_native_observation_v1', turn: 10, revision: 10,
  actors: [{ actor_ref: 'avatar', actor_id: '7', position: [60, 60, 0] }],
  items: [], targets: [{ target_ref: 'tile:east', position: [61, 60, 0] }] };

test('wire accepts the requested model id or the backend id of the configured alias only', () => {
  const alias = 'qwen3.8-27b-uncensored-w4a16-tp2';
  assert.equal(matchesP3WireModelId(alias, alias), true);
  assert.equal(matchesP3WireModelId('qwen3.8-27b', alias), true);
  assert.equal(matchesP3WireModelId('qwen3.8-27b', 'other-model'), false);
  assert.equal(matchesP3WireModelId('qwen3.8-27b-other', alias), false);
  assert.equal(matchesP3WireModelId('qwen3.8-72b', alias), false);
  assert.equal(matchesP3WireModelId('other-model', 'other-model'), true);
});

function plan(request, operation) {
  return { schema: 'turn_step_plan_v1', request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision, step_index: request.step_index,
    interpretation: { player_goal: request.remaining_intent,
      grounded_attempt: request.remaining_intent, adaptation: 'literal' },
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [operation], check: null, continuation: null, clarification: null,
    direct_result_kind: null, reason_code: 'native_action', reason: 'Attempt a native action.' };
}

async function fixture(t, decide, decideNpc = null, execute = null, config = null,
  auditNpc = () => true) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'p3-live-'));
  const socketPath = process.platform === 'win32' ? `\\\\.\\pipe\\p3-live-${randomUUID()}`
    : path.join(dir, 'p3.sock');
  const settingsOwner = createLlmSettingsOwner({ initialRecord: { version: 2,
    settings: { mode: 'custom', compatibility: 'openai_compatible',
      base_url: 'http://127.0.0.1:11437/v1', model: 'qwen3.8-27b-uncensored-w4a16-tp2',
      api_key: 'synthetic-test' } } });
  let calls = 0;
  const roles = [];
  const journal = [];
  const coordinator = await startP3LiveCoordinator({ socketPath, settingsOwner, env: {},
    journal: record => journal.push(record),
    ...(execute ? { execute } : {}), ...(config ? { config } : {}),
    runtimeFactory: execute ? createP3RoleRuntime : ({ budget }) => {
      const runner = budget.wrap({ async run({ role_id, request }) {
        calls++;
        roles.push(role_id);
        if (role_id === 'npc_conversation_grounding_auditor') return auditNpc(request, calls);
        return role_id?.startsWith('npc_') ? decideNpc(request, calls) : decide(request, calls);
      } });
      const npcConversationModel = decideNpc && ((request, context) =>
        runner.run({ role_id: context.repair ? 'npc_conversation_responder_format_repair'
          : 'npc_conversation_responder', request }));
      if (npcConversationModel) npcConversationModel.validateFreshPlan = (_plan, request) =>
        runner.run({ role_id: 'npc_conversation_grounding_auditor', request });
      return { turnStepModel: request => runner.run({ role_id: 'turn_step_planner', request }),
        npcConversationModel };
    } });
  t.after(async () => { await coordinator.close(); await rm(dir, { recursive: true, force: true }); });
  return { coordinator, get calls() { return calls; }, get roles() { return [...roles]; },
    get journal() { return [...journal]; }, async client() {
    const socket = connect(socketPath);
    const channel = createP3LiveChannel(socket);
    await once(socket, 'connect');
    return { socket, channel };
  } };
}

test('resident socket handles readiness and repeated intents without a process adapter', async t => {
  const scene = await fixture(t, request => plan(request, { op: 'request_movement',
    actor_ref: 'avatar', target_ref: 'tile:east', movement_kind: 'local' }));
  const ready = await scene.client();
  ready.socket.end();
  assert.equal(scene.calls, 0);
  for (const id of ['1', '2']) {
    const { socket, channel } = await scene.client();
    channel.bind(id);
    channel.send({ type: 'intent', intent: 'Шаг на восток', observation });
    assert.deepEqual(await channel.receive(), { type: 'role_phase', id,
      role_id: 'turn_step_planner', timeout_ms: 120_000 });
    const operation = await channel.receive();
    assert.equal(operation.type, 'operation');
    assert.equal(operation.request.primitive, 'move');
    assert.deepEqual(operation.request.args, { direction: [1, 0] });
    assert.equal(JSON.stringify(operation).includes('userdir'), false);
    channel.send({ type: 'readback', readback: { schema: 'p3_native_operation_readback_v1',
      operation_id: operation.request.operation_id, status: 'applied', goal_result: 'achieved',
      native_effect: { effect_status: 'confirmed' }, before: { turn: 10 }, after: { turn: 11 } },
      observation: { ...observation, turn: 11, revision: 11 } });
    const result = await channel.receive();
    assert.equal(result.id, id);
    assert.equal(result.status, 'completed');
    assert.equal(Object.hasOwn(result, 'message'), false);
    assert.equal(result.applied_operations, 1);
    socket.end();
  }
  assert.equal(scene.calls, 2);
});

test('empty input and hidden snapshot are rejected before planning', async t => {
  const scene = await fixture(t, () => { throw new Error('must not plan'); });
  for (const input of [
    { intent: '', observation },
    { intent: 'Осмотрись', observation: { ...observation, native_snapshot: {} } }
  ]) {
    const { socket, channel } = await scene.client();
    channel.bind('3');
    channel.send({ type: 'intent', ...input });
    const result = await channel.receive();
    assert.equal(result.status, 'refused');
    assert.equal(result.applied_operations, 0);
    socket.end();
  }
  assert.equal(scene.calls, 0);
});

test('model failure and malformed output cannot send native operations', async t => {
  const scene = await fixture(t, (_request, calls) => {
    if (calls === 1) throw new Error('private URL and token must not leak');
    return {};
  });
  for (const id of ['4', '5']) {
    const { socket, channel } = await scene.client();
    channel.bind(id);
    channel.send({ type: 'intent', intent: 'Неизвестное действие', observation });
    let result;
    do { result = await channel.receive(); } while (result.type === 'role_phase');
    assert.equal(result.type, 'result');
    assert.equal(result.status, 'refused');
    assert.equal(result.applied_operations, 0);
    assert.equal(JSON.stringify(result).includes('private URL'), false);
    if (id === '5') assert.equal(Object.hasOwn(result, 'message'), false);
    socket.end();
  }
});

test('native refusal preserves the reason and stale wire id cannot confirm success', async t => {
  const scene = await fixture(t, request => plan(request, { op: 'request_activity',
    actor_ref: 'avatar', activity_kind: 'wait', target_refs: [], description: 'wait' }));
  for (const stale of [false, true]) {
    const { socket, channel } = await scene.client();
    channel.bind('6');
    channel.send({ type: 'intent', intent: 'Подожди', observation });
    await channel.receive();
    const operation = await channel.receive();
    const message = { type: 'readback', id: stale ? 'old' : '6', readback: {
      schema: 'p3_native_operation_readback_v1', operation_id: operation.request.operation_id,
      status: 'refused', goal_result: 'refused', native_effect: { effect_status: 'refused' },
      refusal: { code: 'P3_NATIVE_STALE_REFERENCE' }, before: {}, after: {} } };
    socket.write(`${JSON.stringify(message)}\n`);
    const result = await channel.receive();
    assert.equal(result.status, 'refused');
    assert.equal(result.code, stale ? 'P3_LIVE_INTENT_IDENTITY_MISMATCH' : 'P3_NATIVE_STALE_REFERENCE');
    assert.equal(result.applied_operations, stale ? null : 0);
    assert.equal(Object.hasOwn(result, 'message'), false);
    socket.end();
  }
});

test('socket adapter refresh uses actor-safe observation and admits only one operation', async () => {
  const sent = [];
  const request = { operation_id: 'adapter-1' };
  const queue = [{ type: 'observation', observation }, { type: 'readback', readback: {
    schema: 'p3_native_operation_readback_v1', operation_id: request.operation_id,
    status: 'applied', goal_result: 'in_progress', native_effect: { effect_status: 'progressing' },
    before: {}, after: {} } }];
  const adapter = createP3NativeSocketAdapter({ observation,
    channel: { send: message => sent.push(message), receive: async () => queue.shift() } });
  assert.deepEqual(await adapter.refreshObservation(), observation);
  assert.equal((await adapter.execute(request)).goal_result, 'in_progress');
  await assert.rejects(adapter.execute(request), /P3_LIVE_ONE_OPERATION_BOUNDARY/);
  assert.deepEqual(sent.map(message => message.type), ['observe', 'operation']);
});

test('live literal speech needs no JS listener or conversation owner', async t => {
  const utterance = '<name>, слышишь?';
  const scene = await fixture(t, request => ({ ...plan(request, {}),
    resolution: 'direct', goal_result: 'achieved', operations: [],
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    direct_result_kind: 'player_utterance', utterance: { speaker_ref: 'avatar',
      utterance_text: utterance, input_mode: 'verbatim',
      delivery: { loudness: 2, duration_class: 'brief' } } }));
  const { socket, channel } = await scene.client();
  channel.bind('7');
  channel.send({ type: 'intent', intent: `Скажи дословно: ${utterance}`, observation });
  await channel.receive();
  const operation = await channel.receive();
  assert.equal(operation.type, 'operation');
  assert.equal(operation.request.primitive, 'speak');
  assert.deepEqual(operation.request.args, { utterance,
    delivery: { loudness: 2, duration_class: 'brief' } });
  assert.deepEqual(operation.request.references, {});
  channel.send({ type: 'readback', readback: { schema: 'p3_native_operation_readback_v1',
    operation_id: operation.request.operation_id, status: 'applied', goal_result: 'in_progress',
    native_effect: { effect_status: 'progressing', speakerId: '7', utterance,
      actualHeardListenerIds: ['native-listener-outside-visible-list'] },
    before: { turn: 10 }, after: { turn: 10 } } });
  const result = await channel.receive();
  assert.equal(result.status, 'completed');
  assert.equal(result.goal_result, 'partially_achieved');
  assert.equal(scene.calls, 1);
  socket.end();
});

test('live speech delivery matrix preserves eight modes and refuses sustained before native', async t => {
  for (const loudness of [1, 2, 3, 4]) {
    for (const duration_class of ['instant', 'brief', 'sustained']) {
      await t.test(`${loudness}/${duration_class}`, async t => {
        const utterance = 'Слышишь?';
        const delivery = { loudness, duration_class };
        const scene = await fixture(t, request => ({ ...plan(request, {}),
          resolution: 'direct', goal_result: 'achieved', operations: [],
          activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
          direct_result_kind: 'player_utterance', utterance: { speaker_ref: 'avatar',
            utterance_text: utterance, input_mode: 'verbatim', delivery } }));
        const { socket, channel } = await scene.client();
        channel.bind(String(100 + loudness * 3 + ['instant', 'brief', 'sustained'].indexOf(duration_class)));
        channel.send({ type: 'intent', intent: `Скажи дословно: ${utterance}`, observation });
        await channel.receive();
        const response = await channel.receive();
        if (duration_class === 'sustained') {
          assert.equal(response.type, 'result');
          assert.equal(response.status, 'refused');
          assert.equal(response.code, 'P3_PLAYER_UTTERANCE_DELIVERY_UNSUPPORTED');
          assert.equal(Object.hasOwn(response, 'message'), false);
          assert.equal(response.applied_operations, 0);
          assert.equal(response.goal_result, 'not_achieved');
        } else {
          assert.equal(response.type, 'operation');
          assert.deepEqual(response.request.args, { utterance, delivery });
          channel.send({ type: 'readback', readback: { schema: 'p3_native_operation_readback_v1',
            operation_id: response.request.operation_id, status: 'applied', goal_result: 'achieved',
            native_effect: { effect_status: 'confirmed', speakerId: '7', utterance,
              actualHeardListenerIds: [] }, before: { turn: 10 }, after: { turn: 11 } } });
          const result = await channel.receive();
          assert.equal(result.status, 'completed');
          assert.equal(result.applied_operations, 1);
        }
        assert.equal(scene.calls, 1);
        socket.end();
      });
    }
  }
});

test('witnesses, missing target, unheard target and vanished target do not call NPC model', async t => {
  const utterance = 'Слышите?';
  const npc8 = { actor_ref: 'npc:8', actor_id: '8', name: 'Жирко', visible: true,
    position: [61, 60, 0] };
  const npc9 = { actor_ref: 'npc:9', actor_id: '9', name: 'Ратибор', visible: true,
    position: [60, 61, 0] };
  const { actors, ...sceneBase } = withNpcs(observation, [npc8, npc9]);
  const sceneObservation = { ...sceneBase, actors };
  const scene = await fixture(t, request => ({ ...plan(request, {}), resolution: 'direct',
    goal_result: 'achieved', operations: [],
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    direct_result_kind: 'player_utterance', utterance: { speaker_ref: 'avatar',
      utterance_text: utterance, input_mode: 'verbatim',
      delivery: { loudness: 2, duration_class: 'brief' } } }), () => {
    throw new Error('NPC model must not be called');
  });
  const cases = [
    { target: undefined, heard: ['8', '9'], refs: {} },
    { target: 'npc:9', heard: ['8'], refs: { actors: [{ ref: 'npc:9', id: '9' }] } },
    { target: 'npc:9', heard: ['8'], refs: { actors: [{ ref: 'npc:9', id: '9' }] },
      reverseActors: true },
    { target: 'npc:404', heard: ['8', '9'], refs: {} },
    { target: 'invalid', heard: ['8', '9'], refs: {} },
    { target: 'npc:9', heard: ['9'], refs: { actors: [{ ref: 'npc:9', id: '9' }] }, vanished: true }
  ];
  for (const [index, entry] of cases.entries()) {
    const { socket, channel } = await scene.client();
    channel.bind(String(20 + index));
    channel.send({ type: 'intent', intent: utterance,
      observation: entry.reverseActors ? { ...sceneObservation,
        actors: [actors[0], npc9, npc8] } : sceneObservation,
      ...(entry.target ? { target_actor_ref: entry.target } : {}) });
    assert.equal((await channel.receive()).role_id, 'turn_step_planner');
    const operation = await channel.receive();
    assert.equal(operation.request.primitive, 'speak');
    assert.deepEqual(operation.request.references, entry.refs);
    channel.send({ type: 'readback', readback: { schema: 'p3_native_operation_readback_v1',
      operation_id: operation.request.operation_id, status: 'applied', goal_result: 'achieved',
      native_effect: { effect_status: 'confirmed', speakerId: '7', utterance,
        actualHeardListenerIds: entry.heard }, before: { turn: 10 }, after: { turn: 10 } } });
    const next = await channel.receive();
    if (entry.vanished) {
      assert.equal(next.type, 'observe');
      channel.send({ type: 'observation', observation: { ...sceneObservation,
        actors: [actors[0], npc8] } });
    } else {
      assert.equal(next.type, 'result');
    }
    const result = entry.vanished ? await channel.receive() : next;
    assert.equal(result.status, 'completed');
    assert.equal(result.applied_operations, 1);
    socket.end();
  }
  assert.equal(scene.calls, cases.length);
});

test('confirmed native listener gets one NPC model reply and native speech', async t => {
  const utterance = 'Слышишь меня?';
  const npc = { actor_ref: 'npc:9', actor_id: '9', name: 'Жирко', visible: true,
    position: [61, 60, 0] };
  const witness = { actor_ref: 'npc:8', actor_id: '8', name: 'Ратибор', visible: true,
    position: [60, 61, 0] };
  const sceneObservation = withNpcs(observation, [witness, npc]);
  const scene = await fixture(t, request => ({ ...plan(request, {}), resolution: 'direct',
    goal_result: 'achieved', operations: [],
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    direct_result_kind: 'player_utterance', utterance: { speaker_ref: 'avatar',
      utterance_text: utterance, input_mode: 'verbatim',
      delivery: { loudness: 2, duration_class: 'brief' } } }), request => ({
    schema: 'conversation_contribution_plan_v1', request_id: request.request_id,
    boundary_id: request.boundary_id, conversation_id: request.conversation_id,
    exchange_id: request.exchange_id, state_version: request.state_version,
    speaker_ref: request.npc_ref, contribution_kind: 'speech',
    primary_addressee_ref: request.allowed_references.actor_refs[1],
    intended_addressee_refs: [request.allowed_references.actor_refs[1]],
    affected_actor_refs: [], speech: { utterance_text: 'Слышу.',
      dominant_act: 'answer', interaction_tags: [], topic_refs: [], claims: [],
      response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: 'ответить', grounded_contribution: 'Я слышу.',
      adaptation: 'literal' }, resolution: 'automatic',
    activity: { duration_class: 'brief', effort: 'none' },
    supporting_operations: [], check: null, handoff: null, reason: 'Ответ.' }));
  const { socket, channel } = await scene.client();
  channel.bind('10');
  channel.send({ type: 'intent', intent: utterance, observation: sceneObservation,
    target_actor_ref: 'npc:9' });
  assert.equal((await channel.receive()).role_id, 'turn_step_planner');
  const first = await channel.receive();
  assert.equal(first.request.primitive, 'speak');
  assert.deepEqual(first.request.references, { actors: [{ ref: 'npc:9', id: '9' }] });
  channel.send({ type: 'readback', readback: { schema: 'p3_native_operation_readback_v1',
    operation_id: first.request.operation_id, status: 'applied', goal_result: 'achieved',
    native_effect: { effect_status: 'confirmed', speakerId: '7', utterance,
      actualHeardListenerIds: ['8', '9'] }, before: { turn: 10 }, after: { turn: 10 } } });
  assert.equal((await channel.receive()).type, 'observe');
  channel.send({ type: 'observation', observation: sceneObservation });
  const npcPhase = await channel.receive();
  assert.equal(npcPhase.role_id, 'npc_conversation_responder', JSON.stringify(npcPhase));
  assert.equal((await channel.receive()).role_id, 'npc_conversation_grounding_auditor');
  const second = await channel.receive();
  assert.equal(second.request.primitive, 'speak');
  assert.equal(second.request.actor_id, '9');
  assert.deepEqual(second.request.args, { utterance: 'Слышу.' });
  assert.deepEqual(second.request.references, { actors: [{ ref: 'avatar', id: '7' }] });
  channel.send({ type: 'readback', readback: { schema: 'p3_native_operation_readback_v1',
    operation_id: second.request.operation_id, status: 'applied', goal_result: 'achieved',
    native_effect: { effect_status: 'confirmed', speakerId: '9', contribution_kind: 'speech',
      utterance: 'Слышу.', actualHeardListenerIds: ['7'] }, before: { turn: 10 }, after: { turn: 10 } } });
  const result = await channel.receive();
  assert.equal(result.status, 'completed');
  assert.equal(result.applied_operations, 2);
  assert.equal(scene.calls, 3);
  assert.equal(scene.journal.length, 1);
  const [phrase] = scene.journal;
  assert.deepEqual({ id: phrase.id, outcome: phrase.outcome, code: phrase.code,
    category: phrase.category, calls: phrase.calls }, { id: '10', outcome: 'ok', code: null,
    category: null, calls: 3 });
  assert.ok(Number.isInteger(phrase.t_enter) && phrase.t_native_reply >= phrase.t_enter);
  assert.equal(Object.hasOwn(phrase, 'script_respellings'), false);
  assert.deepEqual(scene.roles, ['turn_step_planner', 'npc_conversation_responder',
    'npc_conversation_grounding_auditor']);
  socket.end();
});

test('Latin lookalikes in the NPC reply are respelled before native speech and journaled with the phrase', async t => {
  const utterance = 'Слышишь меня?';
  const npc = { actor_ref: 'npc:9', actor_id: '9', name: 'Жирко', visible: true,
    position: [61, 60, 0] };
  const witness = { actor_ref: 'npc:8', actor_id: '8', name: 'Ратибор', visible: true,
    position: [60, 61, 0] };
  const sceneObservation = withNpcs(observation, [witness, npc]);
  const scene = await fixture(t, request => ({ ...plan(request, {}), resolution: 'direct',
    goal_result: 'achieved', operations: [],
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    direct_result_kind: 'player_utterance', utterance: { speaker_ref: 'avatar',
      utterance_text: utterance, input_mode: 'verbatim',
      delivery: { loudness: 2, duration_class: 'brief' } } }), request => ({
    schema: 'conversation_contribution_plan_v1', request_id: request.request_id,
    boundary_id: request.boundary_id, conversation_id: request.conversation_id,
    exchange_id: request.exchange_id, state_version: request.state_version,
    speaker_ref: request.npc_ref, contribution_kind: 'speech',
    primary_addressee_ref: request.allowed_references.actor_refs[1],
    intended_addressee_refs: [request.allowed_references.actor_refs[1]],
    affected_actor_refs: [], speech: { utterance_text: 'Здpавствуй.',
      dominant_act: 'answer', interaction_tags: [], topic_refs: [], claims: [],
      response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: 'ответить', grounded_contribution: 'Я слышу.',
      adaptation: 'literal' }, resolution: 'automatic',
    activity: { duration_class: 'brief', effort: 'none' },
    supporting_operations: [], check: null, handoff: null, reason: 'Ответ.' }));
  const { socket, channel } = await scene.client();
  channel.bind('10');
  channel.send({ type: 'intent', intent: utterance, observation: sceneObservation,
    target_actor_ref: 'npc:9' });
  assert.equal((await channel.receive()).role_id, 'turn_step_planner');
  const first = await channel.receive();
  assert.equal(first.request.primitive, 'speak');
  assert.deepEqual(first.request.references, { actors: [{ ref: 'npc:9', id: '9' }] });
  channel.send({ type: 'readback', readback: { schema: 'p3_native_operation_readback_v1',
    operation_id: first.request.operation_id, status: 'applied', goal_result: 'achieved',
    native_effect: { effect_status: 'confirmed', speakerId: '7', utterance,
      actualHeardListenerIds: ['8', '9'] }, before: { turn: 10 }, after: { turn: 10 } } });
  assert.equal((await channel.receive()).type, 'observe');
  channel.send({ type: 'observation', observation: sceneObservation });
  const npcPhase = await channel.receive();
  assert.equal(npcPhase.role_id, 'npc_conversation_responder', JSON.stringify(npcPhase));
  assert.equal((await channel.receive()).role_id, 'npc_conversation_grounding_auditor');
  const second = await channel.receive();
  assert.equal(second.request.primitive, 'speak');
  assert.equal(second.request.actor_id, '9');
  assert.deepEqual(second.request.args, { utterance: 'Здравствуй.' });
  assert.deepEqual(second.request.references, { actors: [{ ref: 'avatar', id: '7' }] });
  channel.send({ type: 'readback', readback: { schema: 'p3_native_operation_readback_v1',
    operation_id: second.request.operation_id, status: 'applied', goal_result: 'achieved',
    native_effect: { effect_status: 'confirmed', speakerId: '9', contribution_kind: 'speech',
      utterance: 'Здравствуй.', actualHeardListenerIds: ['7'] }, before: { turn: 10 }, after: { turn: 10 } } });
  const result = await channel.receive();
  assert.equal(result.status, 'completed');
  assert.equal(result.applied_operations, 2);
  assert.equal(scene.calls, 3);
  assert.equal(scene.journal.length, 1);
  const [phrase] = scene.journal;
  assert.deepEqual({ id: phrase.id, outcome: phrase.outcome, code: phrase.code,
    category: phrase.category, calls: phrase.calls }, { id: '10', outcome: 'ok', code: null,
    category: null, calls: 3 });
  assert.ok(Number.isInteger(phrase.t_enter) && phrase.t_native_reply >= phrase.t_enter);
  assert.deepEqual(phrase.script_respellings, [{ path: '$.speech.utterance_text',
    before: 'Здpавствуй', after: 'Здравствуй' }]);
  assert.deepEqual(scene.roles, ['turn_step_planner', 'npc_conversation_responder',
    'npc_conversation_grounding_auditor']);
  socket.end();
});

test('a rejected NPC reply keeps its respelling in the phrase journal', async t => {
  const utterance = 'Слышишь меня?';
  const npc = { actor_ref: 'npc:9', actor_id: '9', name: 'Жирко', visible: true,
    position: [61, 60, 0] };
  const sceneObservation = withNpcs(observation, [npc]);
  const scene = await fixture(t, request => ({ ...plan(request, {}),
    resolution: 'direct', goal_result: 'achieved', operations: [],
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    direct_result_kind: 'player_utterance', utterance: { speaker_ref: 'avatar',
      utterance_text: utterance, input_mode: 'verbatim',
      delivery: { loudness: 2, duration_class: 'brief' } } }), (request, calls) => ({
    schema: 'conversation_contribution_plan_v1', request_id: request.request_id,
    boundary_id: request.boundary_id, conversation_id: request.conversation_id,
    exchange_id: request.exchange_id, state_version: request.state_version,
    speaker_ref: request.npc_ref, contribution_kind: 'speech',
    primary_addressee_ref: request.allowed_references.actor_refs[1],
    intended_addressee_refs: [request.allowed_references.actor_refs[1]],
    affected_actor_refs: [], speech: { utterance_text: calls === 4
      ? 'Здравствуй.' : 'Здpавствуй.',
      dominant_act: 'answer', interaction_tags: [], topic_refs: [], claims: [],
      response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: 'ответить', grounded_contribution: 'Я слышу.',
      adaptation: 'literal' }, resolution: 'automatic',
    activity: { duration_class: 'brief', effort: 'none' },
    supporting_operations: [], check: null, handoff: null, reason: 'Ответ.'
  }), null, { turnCallBudget: 7, npcMaxRepairAttempts: 1 }, () => ({
    pass: false, errors: [{ code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED',
      category: 'semantic_grounding', retryable: true,
      path: '$.speech.utterance_text', quote: 'Здравствуй' }]
  }));
  const { socket, channel } = await scene.client();
  channel.bind('12');
  channel.send({ type: 'intent', intent: utterance, observation: sceneObservation,
    target_actor_ref: 'npc:9' });
  assert.equal((await channel.receive()).role_id, 'turn_step_planner');
  const first = await channel.receive();
  assert.equal(first.request.primitive, 'speak');
  channel.send({ type: 'readback', readback: { schema: 'p3_native_operation_readback_v1',
    operation_id: first.request.operation_id, status: 'applied', goal_result: 'achieved',
    native_effect: { effect_status: 'confirmed', speakerId: '7', utterance,
      actualHeardListenerIds: ['9'] }, before: { turn: 10 }, after: { turn: 10 } } });
  assert.equal((await channel.receive()).type, 'observe');
  channel.send({ type: 'observation', observation: sceneObservation });
  for (const role of ['npc_conversation_responder', 'npc_conversation_grounding_auditor',
    'npc_conversation_responder_format_repair', 'npc_conversation_grounding_auditor']) {
    assert.equal((await channel.receive()).role_id, role);
  }
  const result = await channel.receive();
  assert.equal(result.status, 'refused');
  assert.equal(result.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
  assert.equal(result.category, 'semantic');
  assert.equal(scene.journal.length, 1);
  const [phrase] = scene.journal;
  assert.equal(phrase.outcome, 'failure');
  assert.equal(phrase.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
  assert.equal(phrase.category, 'semantic');
  assert.deepEqual(phrase.script_respellings, [{ path: '$.speech.utterance_text',
    before: 'Здpавствуй', after: 'Здравствуй' }]);
  socket.end();
});

test('dev config is seven calls per turn and rejects the process budget key', async () => {
  assert.deepEqual(await loadP3DevConfig(), { turnCallBudget: 7, npcMaxRepairAttempts: 2 });
  for (const config of [{ modelCallBudget: 30, npcMaxRepairAttempts: 1 },
    { turnCallBudget: 7, modelCallBudget: 30, npcMaxRepairAttempts: 2 },
    { turnCallBudget: 0, npcMaxRepairAttempts: 2 }, { turnCallBudget: 73, npcMaxRepairAttempts: 2 },
    { turnCallBudget: 7, npcMaxRepairAttempts: 3 }]) {
    await assert.rejects(startP3LiveCoordinator({ socketPath: 'unused', config }),
      /P3_LIVE_CONFIG_INVALID/);
  }
});

test('turn call limit refuses the extra call with its own text and resets on the next intent', async t => {
  const utterance = 'Слышишь меня?';
  const npc = { actor_ref: 'npc:9', actor_id: '9', name: 'Жирко', visible: true,
    position: [61, 60, 0] };
  const sceneObservation = withNpcs(observation, [npc]);
  const scene = await fixture(t, request => request.remaining_intent === utterance
    ? { ...plan(request, {}), resolution: 'direct', goal_result: 'achieved', operations: [],
      activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
      direct_result_kind: 'player_utterance', utterance: { speaker_ref: 'avatar',
        utterance_text: utterance, input_mode: 'verbatim',
        delivery: { loudness: 2, duration_class: 'brief' } } }
    : plan(request, { op: 'request_movement', actor_ref: 'avatar', target_ref: 'tile:east',
      movement_kind: 'local' }), () => ({}), null, { turnCallBudget: 2, npcMaxRepairAttempts: 2 });
  const first = await scene.client();
  first.channel.bind('20');
  first.channel.send({ type: 'intent', intent: utterance, observation: sceneObservation,
    target_actor_ref: 'npc:9' });
  assert.equal((await first.channel.receive()).role_id, 'turn_step_planner');
  const speech = await first.channel.receive();
  first.channel.send({ type: 'readback', readback: { schema: 'p3_native_operation_readback_v1',
    operation_id: speech.request.operation_id, status: 'applied', goal_result: 'achieved',
    native_effect: { effect_status: 'confirmed', speakerId: '7', utterance,
      actualHeardListenerIds: ['9'] }, before: { turn: 10 }, after: { turn: 10 } } });
  assert.equal((await first.channel.receive()).type, 'observe');
  first.channel.send({ type: 'observation', observation: sceneObservation });
  assert.equal((await first.channel.receive()).role_id, 'npc_conversation_responder');
  const refused = await first.channel.receive();
  assert.equal(refused.type, 'result');
  assert.equal(refused.status, 'refused');
  assert.equal(refused.code, 'P3_TURN_CALL_BUDGET_EXHAUSTED');
  assert.equal(refused.applied_operations, 1);
  assert.equal(refused.goal_result, 'partially_achieved');
  assert.equal(Object.hasOwn(refused, 'message'), false);
  assert.equal(scene.calls, 2);
  assert.deepEqual(scene.journal.map(({ id, outcome, code, category, calls }) =>
    ({ id, outcome, code, category, calls })), [{ id: '20', outcome: 'failure',
    code: 'P3_TURN_CALL_BUDGET_EXHAUSTED', category: null, calls: 2 }]);
  first.socket.end();
  const second = await scene.client();
  second.channel.bind('21');
  second.channel.send({ type: 'intent', intent: 'Шаг на восток', observation });
  assert.equal((await second.channel.receive()).role_id, 'turn_step_planner');
  const move = await second.channel.receive();
  second.channel.send({ type: 'readback', readback: { schema: 'p3_native_operation_readback_v1',
    operation_id: move.request.operation_id, status: 'applied', goal_result: 'achieved',
    native_effect: { effect_status: 'confirmed' }, before: { turn: 10 }, after: { turn: 11 } },
    observation: { ...observation, turn: 11, revision: 11 } });
  assert.equal((await second.channel.receive()).status, 'completed');
  assert.equal(scene.coordinator.budget.turnCalls, 1);
  assert.equal(scene.calls, 3);
  second.socket.end();
});

test('two bad NPC replies stop after one repair without a native NPC operation', async t => {
  const utterance = 'Ответь';
  const npc = { actor_ref: 'npc:8', actor_id: '8', name: 'Жирко', visible: true,
    position: [61, 60, 0] };
  const sceneObservation = withNpcs(observation, [npc]);
  const scene = await fixture(t, request => ({ ...plan(request, {}), resolution: 'direct',
    goal_result: 'achieved', operations: [],
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    direct_result_kind: 'player_utterance', utterance: { speaker_ref: 'avatar',
      utterance_text: utterance, input_mode: 'verbatim',
      delivery: { loudness: 2, duration_class: 'brief' } } }), () => ({}));
  const { socket, channel } = await scene.client();
  channel.bind('11');
  channel.send({ type: 'intent', intent: utterance, observation: sceneObservation,
    target_actor_ref: 'npc:8' });
  await channel.receive();
  const first = await channel.receive();
  channel.send({ type: 'readback', readback: { schema: 'p3_native_operation_readback_v1',
    operation_id: first.request.operation_id, status: 'applied', goal_result: 'achieved',
    native_effect: { effect_status: 'confirmed', speakerId: '7', utterance,
      actualHeardListenerIds: ['8'] }, before: { turn: 10 }, after: { turn: 10 } } });
  assert.equal((await channel.receive()).type, 'observe');
  channel.send({ type: 'observation', observation: sceneObservation });
  assert.equal((await channel.receive()).role_id, 'npc_conversation_responder');
  assert.equal((await channel.receive()).role_id, 'npc_conversation_responder_format_repair');
  const result = await channel.receive();
  assert.equal(result.type, 'result');
  assert.equal(result.status, 'refused');
  assert.equal(result.applied_operations, 1);
  assert.equal(result.goal_result, 'partially_achieved');
  assert.equal(result.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
  assert.equal(result.category, 'format');
  assert.equal(Object.hasOwn(result, 'message'), false);
  assert.equal(scene.calls, 3);
  assert.deepEqual(scene.roles, ['turn_step_planner', 'npc_conversation_responder',
    'npc_conversation_responder_format_repair']);
  assert.deepEqual(scene.journal.map(({ outcome, code, category, calls, t_native_reply }) =>
    ({ outcome, code, category, calls, t_native_reply })), [{ outcome: 'failure',
    code: 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE', category: 'format', calls: 3,
    t_native_reply: null }]);
  socket.end();
});

test('another NPC failure after the player spoke names the listener and is not a contract verdict', async t => {
  for (const [name, speaker] of [['Жирко', 'Жирко']]) {
    await t.test(speaker, async t => {
      const utterance = 'Ответь';
      const npc = { actor_ref: 'npc:8', actor_id: '8', name,
        visible: true, position: [61, 60, 0] };
      const sceneObservation = withNpcs(observation, [npc]);
      const scene = await fixture(t, request => ({ ...plan(request, {}), resolution: 'direct',
        goal_result: 'achieved', operations: [],
        activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
        direct_result_kind: 'player_utterance', utterance: { speaker_ref: 'avatar',
          utterance_text: utterance, input_mode: 'verbatim',
          delivery: { loudness: 2, duration_class: 'brief' } } }), () => {
        throw new Error('backend down');
      });
      const { socket, channel } = await scene.client();
      channel.bind('12');
      channel.send({ type: 'intent', intent: utterance, observation: sceneObservation,
        target_actor_ref: 'npc:8' });
      await channel.receive();
      const first = await channel.receive();
      channel.send({ type: 'readback', readback: { schema: 'p3_native_operation_readback_v1',
        operation_id: first.request.operation_id, status: 'applied', goal_result: 'achieved',
        native_effect: { effect_status: 'confirmed', speakerId: '7', utterance,
          actualHeardListenerIds: ['8'] }, before: { turn: 10 }, after: { turn: 10 } } });
      assert.equal((await channel.receive()).type, 'observe');
      channel.send({ type: 'observation', observation: sceneObservation });
      assert.equal((await channel.receive()).role_id, 'npc_conversation_responder');
      const result = await channel.receive();
      assert.equal(result.code, 'TURN_NPC_MODEL_FAILED');
      assert.equal(Object.hasOwn(result, 'category'), false);
      assert.equal(Object.hasOwn(result, 'message'), false);
      assert.deepEqual(scene.journal.map(({ outcome, code, category }) =>
        ({ outcome, code, category })), [{ outcome: 'failure', code: 'TURN_NPC_MODEL_FAILED',
        category: null }]);
      socket.end();
    });
  }
});

test('registered NPC responder repairs grounding through the real role path', async t => {
  for (const repairAccepted of [true, false]) {
    await t.test(repairAccepted ? 'accepted repair speaks its exact words' : 'rejected repair stays silent', async t => {
      const utterance = 'На площади волк. Ты видел его раньше?';
      const npc = { actor_ref: 'npc:8', actor_id: '8', name: 'Жирко', visible: true,
        position: [61, 60, 0] };
      const witness = { actor_ref: 'npc:9', actor_id: '9', name: 'Ратибор', visible: true,
        position: [60, 61, 0] };
      const sceneObservation = withNpcs(observation, [npc, witness]);
      const roles = [];
      const responderInputs = [];
      const responderOutputs = [];
      const repairedUtterance = 'Что ты имеешь в виду?';
      let audits = 0;
      const scene = await fixture(t, null, null, async ({ roleId, messages }) => {
        roles.push(roleId);
        const payload = JSON.parse(messages.find(({ role }) => role === 'user').content);
        let output;
        if (roleId === 'turn_step_planner') {
          output = { ...plan(payload, {}), resolution: 'direct', goal_result: 'achieved',
            operations: [], activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
            direct_result_kind: 'player_utterance', utterance: { speaker_ref: 'avatar',
              utterance_text: utterance, input_mode: 'verbatim',
              delivery: { loudness: 2, duration_class: 'brief' } } };
        } else if (roleId === 'npc_conversation_grounding_auditor') {
          const pass = ++audits === 2 && repairAccepted;
          output = { pass, concerns: pass ? [] : [{
            kind: 'unsupported_past_observation', path: '$.speech.utterance_text',
            quote: audits === 1 ? 'Я видел его утром.' : repairedUtterance
          }] };
        } else {
          assert.ok(['npc_conversation_responder', 'npc_conversation_responder_format_repair'].includes(roleId));
          responderInputs.push(payload);
          const request = payload.request ?? payload;
          output = { contribution_kind: 'speech',
            primary_addressee_ref: request.allowed_references.actor_refs[1],
            intended_addressee_refs: [request.allowed_references.actor_refs[1]],
            affected_actor_refs: [], speech: {
              utterance_text: responderInputs.length === 1 ? 'Я видел его утром.' : repairedUtterance,
              dominant_act: 'answer', interaction_tags: [], topic_refs: [], claims: [],
              response_expectation: { kind: 'none', target_refs: [] } },
            interpretation: { intent: 'ответить', grounded_contribution: 'Ответить на вопрос.', adaptation: 'literal' },
            resolution: 'automatic', activity: { duration_class: 'brief', effort: 'none' },
            supporting_operations: [], check: null, handoff: null, reason: 'Ответ на услышанное.' };
          responderOutputs.push(structuredClone(output));
        }
        return { status: 'ok', parsed_json: output };
      });
      const { socket, channel } = await scene.client();
      channel.bind(repairAccepted ? '201' : '202');
      channel.send({ type: 'intent', intent: utterance, observation: sceneObservation,
        target_actor_ref: npc.actor_ref });
      assert.equal((await channel.receive()).role_id, 'turn_step_planner');
      const playerOperation = await channel.receive();
      assert.equal(playerOperation.type, 'operation');
      const playerReadback = { schema: 'p3_native_operation_readback_v1',
        operation_id: playerOperation.request.operation_id, status: 'applied', goal_result: 'achieved',
        native_effect: { effect_status: 'confirmed', speakerId: '7', utterance,
          actualHeardListenerIds: ['8', '9'] }, before: { turn: 10 }, after: { turn: 11 } };
      channel.send({ type: 'readback', readback: playerReadback });
      assert.equal((await channel.receive()).type, 'observe');
      channel.send({ type: 'observation', observation: { ...sceneObservation, turn: 11, revision: 11 } });
      for (const role of ['npc_conversation_responder', 'npc_conversation_grounding_auditor',
        'npc_conversation_responder_format_repair', 'npc_conversation_grounding_auditor']) {
        assert.equal((await channel.receive()).role_id, role);
      }
      const next = await channel.receive();
      if (repairAccepted) {
        assert.equal(next.type, 'operation');
        assert.equal(next.request.actor_id, '8');
        assert.equal(next.request.primitive, 'speak');
        assert.deepEqual(next.request.args, { utterance: repairedUtterance });
        assert.deepEqual(next.request.references, { actors: [{ ref: 'avatar', id: '7' }] });
        channel.send({ type: 'readback', readback: {
          schema: 'p3_native_operation_readback_v1', operation_id: next.request.operation_id,
          status: 'applied', goal_result: 'achieved', native_effect: { effect_status: 'confirmed',
            speakerId: '8', contribution_kind: 'speech', utterance: repairedUtterance,
            actualHeardListenerIds: ['7'] },
          before: { turn: 11 }, after: { turn: 12 } } });
      } else {
        assert.equal(next.type, 'result');
      }
      const result = repairAccepted ? await channel.receive() : next;
      assert.equal(result.type, 'result');
      assert.equal(result.status, repairAccepted ? 'completed' : 'refused');
      assert.equal(result.applied_operations, repairAccepted ? 2 : 1);
      if (!repairAccepted) {
        assert.equal(result.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
        assert.equal(result.category, 'semantic');
        assert.equal(result.goal_result, 'partially_achieved');
        assert.equal(Object.hasOwn(result, 'message'), false);
      }
      assert.deepEqual(roles, ['turn_step_planner', 'npc_conversation_responder',
        'npc_conversation_grounding_auditor', 'npc_conversation_responder_format_repair',
        'npc_conversation_grounding_auditor']);
      assert.equal(responderInputs.length, 2);
      assert.equal(audits, 2);
      assert.equal(scene.coordinator.budget.calls, 5);
      assert.equal(scene.journal.length, 1);
      const [phrase] = scene.journal;
      assert.equal(phrase.id, repairAccepted ? '201' : '202');
      assert.deepEqual(phrase.roles.map(({ role_id, repair_kind, ok }) =>
        ({ role_id, repair_kind, ok })), [['turn_step_planner', null],
        ['npc_conversation_responder', null], ['npc_conversation_grounding_auditor', null],
        ['npc_conversation_responder_format_repair', 'semantic'],
        ['npc_conversation_grounding_auditor', null]].map(([role_id, repair_kind]) =>
        ({ role_id, repair_kind, ok: true })));
      assert.ok(phrase.roles.every(({ ms }) => Number.isInteger(ms) && ms >= 0));
      assert.deepEqual({ outcome: phrase.outcome, code: phrase.code, category: phrase.category,
        calls: phrase.calls }, repairAccepted
        ? { outcome: 'repair', code: null, category: null, calls: 5 }
        : { outcome: 'failure', code: 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE',
          category: 'semantic', calls: 5 });
      assert.ok(Number.isInteger(phrase.t_enter));
      if (repairAccepted) assert.ok(phrase.t_native_reply >= phrase.t_enter);
      else assert.equal(phrase.t_native_reply, null);
      const perceptionRef = { entity_kind: 'perception_result',
        entity_id: `p3-heard-${playerOperation.request.operation_id}-8` };
      assert.deepEqual(responderInputs[0].npc_ref, { entity_kind: 'npc', entity_id: '8' });
      assert.deepEqual(responderInputs[0].memory, { current_observations: [{
        observation_ref: perceptionRef,
        fact_text: `Слышу реплику, обращённую ко мне. Говорящий: незнакомый человек. Слова: «${utterance}».`,
        observed_at: { whole_minutes: '0', subminute_numerator: '11', subminute_denominator: '60' },
        source_type: 'direct_perception' }], recent_events: [], relevant_long_term_events: [] });
      assert.deepEqual(responderInputs[0].perceived_message.perception_result_ref, perceptionRef);
      assert.deepEqual(responderInputs[0].allowed_references.knowledge_refs, [
        { entity_kind: 'known_fact', entity_id: 'p3-own-gender-8' },
        { entity_kind: 'npc_identity', entity_id: '8' }, perceptionRef]);
      assert.deepEqual(responderInputs[0].knowledge, { known_facts: [{
        fact_ref: { entity_kind: 'known_fact', entity_id: 'p3-own-gender-8' }, state: 'known',
        summary: 'Я мужчина.' }], beliefs: [] });
      assert.deepEqual(responderInputs[1].request, responderInputs[0]);
      assert.deepEqual(responderInputs[1].original_output.speech, responderOutputs[0].speech);
      assert.equal(responderInputs[1].validation_errors[0].category, 'semantic_grounding');
      assert.deepEqual(playerReadback.after, { turn: 11 });
      socket.end();
    });
  }
});

test('live NPC speech distinguishes unsupported assertions from lawful replies', async t => {
  const cases = [
    { name: 'future outcome asserted as a promise',
      player: 'Принесёшь мне завтра лодку?',
      unsupported: 'Обещаю: завтра лодка будет ждать тебя на берегу.',
      grounded: 'Не знаю, получится ли это.',
      concern: 'unsupported_future_outcome',
      path: '$.speech.claims[0]', quote: 'завтра лодка будет ждать тебя на берегу' },
    { name: 'unseen item asserted to be present',
      player: 'Что лежит в закрытом сундуке?',
      unsupported: 'В закрытом сундуке лежит серебряное кольцо.',
      grounded: 'Не знаю.',
      concern: 'unsupported_unseen_item',
      path: '$.speech.utterance_text', quote: 'В закрытом сундуке лежит серебряное кольцо.' },
    { name: 'past sighting invented from the player question',
      player: 'Ты видел волка утром?',
      unsupported: 'Да, утром я видел волка у реки.',
      grounded: 'Не помню, видел ли я волка утром.',
      concern: 'unsupported_past_observation',
      path: '$.speech.utterance_text', quote: 'Да, утром я видел волка у реки.' }
  ];
  for (const [caseIndex, entry] of cases.entries()) {
    for (const keepsQuote of [true, false]) {
      await t.test(`${entry.name}: ${keepsQuote ? 'repair keeps rejected quote' : 'repair removes rejected quote'}`, async t => {
        const npc = { actor_ref: 'npc:8', actor_id: '8', name: 'Жирко', visible: true,
          position: [61, 60, 0] };
        const sceneObservation = withNpcs(observation, [npc]);
        const providerCalls = [];
        const providerReplies = [];
        const scene = await fixture(t, null, null, async ({ roleId, messages }) => {
          const payload = JSON.parse(messages.find(({ role }) => role === 'user').content);
          providerCalls.push({ roleId, messages: structuredClone(messages), payload });
          let output;
          if (roleId === 'turn_step_planner') {
            output = { ...plan(payload, {}), resolution: 'direct', goal_result: 'achieved',
              operations: [], activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
              direct_result_kind: 'player_utterance', utterance: { speaker_ref: 'avatar',
                utterance_text: entry.player, input_mode: 'verbatim',
                delivery: { loudness: 2, duration_class: 'brief' } } };
          } else if (roleId === 'npc_conversation_grounding_auditor') {
            const firstAudit = providerCalls.filter(call =>
              call.roleId === 'npc_conversation_grounding_auditor').length === 1;
            output = { pass: !firstAudit, concerns: firstAudit ? [{ kind: entry.concern,
              path: entry.path, quote: entry.quote }] : [] };
          } else {
            assert.ok(['npc_conversation_responder',
              'npc_conversation_responder_format_repair'].includes(roleId));
            const request = payload.request ?? payload;
            output = speechPlan(request, roleId === 'npc_conversation_responder'
              || keepsQuote ? entry.unsupported : entry.grounded);
            if (entry.path === '$.speech.claims[0]' && (roleId === 'npc_conversation_responder'
                || keepsQuote)) {
              const sourceRef = request.allowed_references.knowledge_refs.find(ref =>
                ref.entity_kind === 'known_fact');
              assert.ok(sourceRef);
              output.speech.claims = [{ claim_id: 'boat-tomorrow',
                content_summary: roleId === 'npc_conversation_responder'
                  ? 'Завтра лодка будет ждать тебя на берегу.'
                  : 'Я намерен привести лодку завтра.',
                form: 'assertion', speaker_posture: 'believed_true',
                source_knowledge_refs: [structuredClone(sourceRef)],
                mentioned_entity_refs: [] }];
            }
          }
          providerReplies.push({ roleId, output: structuredClone(output) });
          return { status: 'ok', parsed_json: output };
        });
        const { socket, channel } = await scene.client();
        channel.bind(String(830 + caseIndex * 2 + (keepsQuote ? 0 : 1)));
        channel.send({ type: 'intent', intent: entry.player, observation: sceneObservation,
          target_actor_ref: npc.actor_ref });
        assert.equal((await channel.receive()).role_id, 'turn_step_planner');
        const playerOperation = await channel.receive();
        assert.equal(playerOperation.request.primitive, 'speak');
        channel.send({ type: 'readback', readback: {
          schema: 'p3_native_operation_readback_v1',
          operation_id: playerOperation.request.operation_id, status: 'applied',
          goal_result: 'achieved', native_effect: { effect_status: 'confirmed',
            speakerId: '7', utterance: entry.player, actualHeardListenerIds: ['8'] },
          before: { turn: 10 }, after: { turn: 11 } } });
        assert.equal((await channel.receive()).type, 'observe');
        channel.send({ type: 'observation', observation: { ...sceneObservation,
          turn: 11, revision: 11 } });
        const expectedRoles = ['npc_conversation_responder',
          'npc_conversation_grounding_auditor', 'npc_conversation_responder_format_repair'];
        for (const role of expectedRoles) assert.equal((await channel.receive()).role_id, role);
        let next = await channel.receive();
        if (keepsQuote) {
          while (next.type === 'role_phase') next = await channel.receive();
          socket.destroy();
          assert.equal(next.type, 'result');
          assert.equal(next.status, 'refused');
          assert.equal(next.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
          assert.equal(next.category, 'semantic');
          assert.equal(next.applied_operations, 1);
          assert.deepEqual(providerReplies.map(({ roleId }) => roleId),
            ['turn_step_planner', ...expectedRoles]);
          const repairInput = providerCalls.find(call =>
            call.roleId === 'npc_conversation_responder_format_repair').payload;
          const repairOutput = providerReplies.find(({ roleId }) =>
            roleId === 'npc_conversation_responder_format_repair').output;
          assert.equal(repairInput.original_output.speech.utterance_text, entry.unsupported);
          const expectedSpeech = structuredClone(repairInput.original_output.speech);
          if (entry.path === '$.speech.claims[0]') {
            assert.equal(expectedSpeech.claims[0].content_summary,
              'Завтра лодка будет ждать тебя на берегу.');
            expectedSpeech.claims[0].content_summary = 'Я намерен привести лодку завтра.';
          }
          assert.deepEqual(repairOutput.speech, expectedSpeech);
          return;
        }
        assert.equal(next.role_id, 'npc_conversation_grounding_auditor');
        const replyOperation = await channel.receive();
        assert.equal(replyOperation.type, 'operation');
        assert.equal(replyOperation.request.primitive, 'speak');
        assert.equal(replyOperation.request.actor_id, '8');
        assert.equal(replyOperation.request.args.utterance, entry.grounded);
        assert.notEqual(replyOperation.request.args.utterance, entry.unsupported);
        channel.send({ type: 'readback', readback: {
          schema: 'p3_native_operation_readback_v1',
          operation_id: replyOperation.request.operation_id, status: 'applied',
          goal_result: 'achieved', native_effect: { effect_status: 'confirmed',
            speakerId: '8', contribution_kind: 'speech', utterance: entry.grounded,
            actualHeardListenerIds: ['7'] }, before: { turn: 11 }, after: { turn: 12 } } });
        const result = await channel.receive();
        assert.equal(result.status, 'completed');
        assert.equal(result.applied_operations, 2);
        assert.deepEqual(providerReplies.map(({ roleId }) => roleId),
          ['turn_step_planner', ...expectedRoles, 'npc_conversation_grounding_auditor']);
        const audits = providerCalls.filter(call =>
          call.roleId === 'npc_conversation_grounding_auditor');
        assert.equal(audits[0].payload.plan.speech.utterance_text, entry.unsupported);
        assert.equal(audits[1].payload.plan.speech.utterance_text, entry.grounded);
        assert.deepEqual(providerReplies.filter(({ roleId }) =>
          roleId === 'npc_conversation_grounding_auditor').map(({ output }) => output.pass),
          [false, true]);
        socket.end();
      });
    }
  }
});

test('live NPC repair may add a permitted source while the auditor decides its meaning', async t => {
  for (const [index, auditAccepted] of [false, true].entries()) {
    await t.test(auditAccepted ? 'new source accepted by auditor reaches native speech'
      : 'new source rejected by auditor stays silent', async t => {
      const utterance = 'Ты мужчина?';
      const reply = 'Я мужчина.';
      const npc = { actor_ref: 'npc:8', actor_id: '8', name: 'Жирко', visible: true,
        position: [61, 60, 0] };
      const sceneObservation = withNpcs(observation, [npc]);
      const providerCalls = [];
      const scene = await fixture(t, null, null, async ({ roleId, messages }) => {
        const payload = JSON.parse(messages.find(({ role }) => role === 'user').content);
        providerCalls.push({ roleId, payload });
        let output;
        if (roleId === 'turn_step_planner') {
          output = { ...plan(payload, {}), resolution: 'direct', goal_result: 'achieved',
            operations: [], activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
            direct_result_kind: 'player_utterance', utterance: { speaker_ref: 'avatar',
              utterance_text: utterance, input_mode: 'verbatim',
              delivery: { loudness: 2, duration_class: 'brief' } } };
        } else if (roleId === 'npc_conversation_grounding_auditor') {
          const auditNumber = providerCalls.filter(call =>
            call.roleId === 'npc_conversation_grounding_auditor').length;
          const pass = auditNumber === 2 && auditAccepted;
          output = { pass, concerns: pass ? [] : [{ kind: 'unsupported_assertion',
            path: '$.speech.claims[0]', quote: reply }] };
        } else {
          assert.ok(['npc_conversation_responder',
            'npc_conversation_responder_format_repair'].includes(roleId));
          const request = payload.request ?? payload;
          const identityRef = request.allowed_references.knowledge_refs.find(ref =>
            ref.entity_kind === 'npc_identity');
          const factRef = request.allowed_references.knowledge_refs.find(ref =>
            ref.entity_kind === 'known_fact');
          assert.ok(identityRef && factRef);
          output = speechPlan(request, reply);
          output.speech.claims = [{ claim_id: 'own-gender', content_summary: reply,
            form: 'assertion', speaker_posture: 'believed_true',
            source_knowledge_refs: [structuredClone(identityRef),
              ...(roleId === 'npc_conversation_responder_format_repair'
                ? [structuredClone(factRef)] : [])],
            mentioned_entity_refs: [] }];
        }
        return { status: 'ok', parsed_json: output };
      });
      const { socket, channel } = await scene.client();
      channel.bind(String(836 + index));
      channel.send({ type: 'intent', intent: utterance, observation: sceneObservation,
        target_actor_ref: npc.actor_ref });
      assert.equal((await channel.receive()).role_id, 'turn_step_planner');
      const playerOperation = await channel.receive();
      assert.equal(playerOperation.request.primitive, 'speak');
      channel.send({ type: 'readback', readback: {
        schema: 'p3_native_operation_readback_v1',
        operation_id: playerOperation.request.operation_id, status: 'applied',
        goal_result: 'achieved', native_effect: { effect_status: 'confirmed',
          speakerId: '7', utterance, actualHeardListenerIds: ['8'] },
        before: { turn: 10 }, after: { turn: 11 } } });
      assert.equal((await channel.receive()).type, 'observe');
      channel.send({ type: 'observation', observation: { ...sceneObservation,
        turn: 11, revision: 11 } });
      for (const role of ['npc_conversation_responder', 'npc_conversation_grounding_auditor',
        'npc_conversation_responder_format_repair', 'npc_conversation_grounding_auditor']) {
        assert.equal((await channel.receive()).role_id, role);
      }
      const responder = providerCalls.find(call =>
        call.roleId === 'npc_conversation_responder').payload;
      const repair = providerCalls.find(call =>
        call.roleId === 'npc_conversation_responder_format_repair').payload;
      const audits = providerCalls.filter(call =>
        call.roleId === 'npc_conversation_grounding_auditor');
      assert.equal(repair.original_output.speech.utterance_text, reply);
      assert.equal(audits[0].payload.plan.speech.utterance_text, reply);
      assert.equal(audits[1].payload.plan.speech.utterance_text, reply);
      const initialClaim = audits[0].payload.plan.speech.claims[0];
      const repairedClaim = audits[1].payload.plan.speech.claims[0];
      const knownFactRef = responder.allowed_references.knowledge_refs.find(ref =>
        ref.entity_kind === 'known_fact');
      assert.deepEqual(repairedClaim, { ...initialClaim,
        source_knowledge_refs: [...initialClaim.source_knowledge_refs, knownFactRef] });
      assert.equal(repairedClaim.source_knowledge_refs.every(ref =>
        responder.allowed_references.knowledge_refs.some(allowed =>
          allowed.entity_kind === ref.entity_kind && allowed.entity_id === ref.entity_id)), true);
      const next = await channel.receive();
      if (!auditAccepted) {
        assert.equal(next.type, 'result');
        assert.equal(next.status, 'refused');
        assert.equal(next.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
        assert.equal(next.category, 'semantic');
        assert.equal(next.applied_operations, 1);
        socket.end();
        return;
      }
      assert.equal(next.type, 'operation');
      assert.equal(next.request.primitive, 'speak');
      assert.equal(next.request.actor_id, '8');
      assert.equal(next.request.args.utterance, reply);
      channel.send({ type: 'readback', readback: {
        schema: 'p3_native_operation_readback_v1',
        operation_id: next.request.operation_id, status: 'applied',
        goal_result: 'achieved', native_effect: { effect_status: 'confirmed',
          speakerId: '8', contribution_kind: 'speech', utterance: reply,
          actualHeardListenerIds: ['7'] }, before: { turn: 11 }, after: { turn: 12 } } });
      const result = await channel.receive();
      assert.equal(result.status, 'completed');
      assert.equal(result.applied_operations, 2);
      socket.end();
    });
  }
});

test('disconnect during planning cannot send an operation or kill the resident coordinator', async t => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const scene = await fixture(t, async (request, calls) => {
    if (calls === 1) await waiting;
    return plan(request, { op: 'request_activity', actor_ref: 'avatar',
      activity_kind: 'wait', target_refs: [], description: 'wait' });
  });
  const first = await scene.client();
  first.channel.bind('8');
  first.channel.send({ type: 'intent', intent: 'Подожди', observation });
  assert.equal((await first.channel.receive()).type, 'role_phase');
  first.socket.destroy();
  await once(first.socket, 'close');
  const abandoned = await scene.client();
  abandoned.channel.bind('9');
  abandoned.channel.send({ type: 'intent', intent: 'Ещё раз', observation });
  const busy = await abandoned.channel.receive();
  assert.equal(busy.code, 'P3_LIVE_BUSY');
  const busyHasMessage = Object.hasOwn(busy, 'message');
  assert.equal(busy.applied_operations, 0);
  abandoned.socket.end();
  release();
  await new Promise(setImmediate);
  const second = await scene.client();
  second.channel.bind('10');
  second.channel.send({ type: 'intent', intent: 'Подожди снова', observation });
  assert.equal((await second.channel.receive()).type, 'role_phase');
  assert.equal((await second.channel.receive()).type, 'operation');
  assert.equal(scene.calls, 2);
  second.socket.destroy();
  assert.equal(busyHasMessage, false);
  assert.equal(scene.journal.some(record => record.id === '9' && record.code === 'P3_LIVE_BUSY'), true);
});

test('unknown native readback reports a code without player text', async t => {
  const scene = await fixture(t, request => plan(request, { op: 'request_activity',
    actor_ref: 'avatar', activity_kind: 'wait', target_refs: [], description: 'wait' }));
  const { socket, channel } = await scene.client();
  channel.bind('200');
  channel.send({ type: 'intent', intent: 'Wait', observation });
  assert.equal((await channel.receive()).type, 'role_phase');
  assert.equal((await channel.receive()).type, 'operation');
  channel.send({ type: 'observation', observation });
  const result = await channel.receive();
  assert.equal(result.code, 'P3_LIVE_READBACK_REQUIRED');
  assert.equal(result.applied_operations, null);
  assert.equal(result.goal_result, 'unknown');
  assert.equal(Object.hasOwn(result, 'message'), false);
  socket.end();
});

test('error after applied player speech preserves the action without player text', async t => {
  const utterance = 'Speak to NPC';
  const npc = { actor_ref: 'npc:8', actor_id: '8', name: 'NPC', visible: true,
    position: [61, 60, 0] };
  const sceneObservation = withNpcs(observation, [npc]);
  const scene = await fixture(t, request => ({ ...plan(request, {}), resolution: 'direct',
    goal_result: 'achieved', operations: [],
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    direct_result_kind: 'player_utterance', utterance: { speaker_ref: 'avatar',
      utterance_text: utterance, input_mode: 'verbatim',
      delivery: { loudness: 2, duration_class: 'brief' } } }), () => ({}));
  const { socket, channel } = await scene.client();
  channel.bind('201');
  channel.send({ type: 'intent', intent: utterance, observation: sceneObservation,
    target_actor_ref: 'npc:8' });
  assert.equal((await channel.receive()).type, 'role_phase');
  const speech = await channel.receive();
  assert.equal(speech.type, 'operation');
  channel.send({ type: 'readback', readback: { schema: 'p3_native_operation_readback_v1',
    operation_id: speech.request.operation_id, status: 'applied', goal_result: 'achieved',
    native_effect: { effect_status: 'confirmed', speakerId: '7', utterance,
      actualHeardListenerIds: ['8'] }, before: { turn: 10 }, after: { turn: 10 } } });
  assert.equal((await channel.receive()).type, 'observe');
  channel.send({ type: 'observation', observation: {} });
  const result = await channel.receive();
  assert.equal(result.code, 'P3_LIVE_OBSERVATION_INVALID');
  assert.equal(result.applied_operations, 1);
  assert.equal(result.goal_result, 'partially_achieved');
  assert.equal(Object.hasOwn(result, 'message'), false);
  socket.end();
});

test('planner failure reports a code without player text', async t => {
  const scene = await fixture(t, () => { throw new Error('backend down'); });
  const { socket, channel } = await scene.client();
  channel.bind('202');
  channel.send({ type: 'intent', intent: 'Unknown action', observation });
  let result;
  do { result = await channel.receive(); } while (result.type === 'role_phase');
  assert.equal(result.code, 'P3_LIVE_REQUEST_FAILED');
  assert.equal(result.applied_operations, 0);
  assert.equal(Object.hasOwn(result, 'message'), false);
  socket.end();
});
