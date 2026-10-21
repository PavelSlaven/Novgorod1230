import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { resolveLlmExecutionConfig } from '@rus/llm-runtime';
import { createLlmSettingsOwner } from '@rus/game-server';
import { requestTurnStepPlanWithRepair } from '@rus/turn';
import { request as sampleRequest, plan as samplePlan } from '../../packages/turn/test/turn-step-contracts-fixture.js';
import { createLowerDvinaTraceTurnStepModel } from '../../apps/game-server/src/runtime/lower-dvina-trace-phase-2-llm.js';
import { createLowerDvinaTraceNpcSemanticModel } from '../../apps/game-server/src/runtime/lower-dvina-trace-conversation-llm.js';
import { turnStepOperationChoices } from '../../apps/game-server/src/runtime/lower-dvina-trace-turn-step-operation-choices.js';
import { createP3AttemptBudget, createP3EvidenceRun, createP3OperationEnvelope,
  applyP3CoordinatorSpeech,
  buildP3NpcRequest, requestP3TurnPlan, requireP3CaseId, resolveP3EffectiveConfig, sanitizeP3Evidence,
  applyP3NativeSpeech, runP3NpcBoundary, buildP3NativeNpcDecisionInput,
  runP3NativeNpcFlow,
  buildP3TurnOperations, createP3NativeFileAdapter, createP3NativeProcessAdapter,
  mapP3TurnOperationToNative,
  createP3RoleRuntime, readP3NativeObservation, requireP3NativeSeam, runP3TurnStep,
  loadP3QwenSettingsOwner,
  runP3SealedPackage, createP3NativeSpeechOwnerFixture,
  validateP3Readback, validateP3SealedCasePack,
  writeP3OperationRequest, runP3NativeNpcReply } from './p3-boundary.js';
import { validateNpcConversationResponseRequest,
  validateNpcConversationResponseSubject } from '@rus/npc-runtime';
import { requireLiveObservation } from './p3-live-socket.js';
import { loadP3NpcProfile } from './p3-npc-profile.js';
import { projectP3NpcWire } from './p3-npc-subject.js';
import { heardRecord, npcProjection, playerSpeechReadback, replyFrame, saidRecord,
  silencePlan, silenceRecord, speechPlan, visibleItem } from './p3-test-frames.js';

const qwenSettingsOwner = () => createLlmSettingsOwner({ initialRecord: {
  version: 2, settings: { mode: 'custom', compatibility: 'openai_compatible',
    base_url: 'http://127.0.0.1:8000/v1', model: 'qwen3.8-27b-uncensored-w4a16-tp2', api_key: 'test-secret' }
} });

const observation = { turn: 4, revision: 4, actors: [{ actor_ref: 'actor', actor_id: 'avatar' }],
  items: [{ item_ref: 'item', item_uid: 'uid:9' }], targets: [{ target_ref: 'target' }] };

test('one shared budget counts calls across role wrappers before transport', async () => {
  let sent = 0;
  const events = [];
  const budget = createP3AttemptBudget({ budget: 2, onAttempt: event => events.push(event) });
  const a = budget.wrap({ async run(value) { sent++; return value; } });
  const b = budget.wrap({ async run(value) { sent++; return value; } });
  await a.run({ role: 'planner' });
  await b.run({ role: 'repair' });
  await assert.rejects(a.run({ role: 'too-many' }), { code: 'P3_GLOBAL_ATTEMPT_BUDGET_EXHAUSTED' });
  assert.equal(budget.calls, 2);
  assert.equal(sent, 2);
  assert.deepEqual(events.map(({ phase, attempt }) => [phase, attempt]),
    [['before', 1], ['after', 1], ['before', 2], ['after', 2]]);
  assert.throws(() => createP3AttemptBudget({ budget: 73 }), /between 1 and 72/);
  assert.throws(() => budget.beginTurn(), /turn scope/);
});

test('turn budget passes the seventh call and refuses the eighth in one turn', async () => {
  let sent = 0;
  const budget = createP3AttemptBudget({ scope: 'turn', budget: 7 });
  const runner = budget.wrap({ async run(value) { sent++; return value; } });
  budget.beginTurn();
  for (let call = 1; call <= 7; call++) await runner.run({ call });
  await assert.rejects(runner.run({ call: 8 }), { code: 'P3_TURN_CALL_BUDGET_EXHAUSTED' });
  assert.equal(sent, 7);
  assert.equal(budget.turnCalls, 7);
  budget.beginTurn();
  assert.equal(budget.turnCalls, 0);
  await runner.run({ call: 1 });
  assert.equal(budget.calls, 8);
  assert.throws(() => createP3AttemptBudget({ scope: 'session' }), /scope/);
});

test('turn budget has no process limit across a hundred full turns', async () => {
  const budget = createP3AttemptBudget({ scope: 'turn', budget: 7 });
  const runner = budget.wrap({ async run(value) { return value; } });
  for (let turn = 0; turn < 100; turn++) {
    budget.beginTurn();
    for (let call = 0; call < 7; call++) await runner.run({ turn, call });
  }
  assert.equal(budget.calls, 700);
});

test('failed provider call records its exact request before transport and error after', async () => {
  const events = [];
  const input = { role: 'planner', request: { intent: 'speak' } };
  const budget = createP3AttemptBudget({ onAttempt: event => events.push(event) });
  const runner = budget.wrap({ async run() { throw Object.assign(new Error('offline'), { code: 'OFFLINE' }); } });
  await assert.rejects(runner.run(input), /offline/);
  assert.equal(events.length, 2);
  assert.deepEqual(events[0], { phase: 'before', attempt: 1, input, output: null, error: null });
  assert.equal(events[1].phase, 'after');
  assert.deepEqual(events[1].input, input);
  assert.equal(events[1].error.code, 'OFFLINE');
});

test('runner accepts only P3 acceptance-matrix case identities', () => {
  assert.equal(requireP3CaseId('T10'), 'T10');
  assert.throws(() => requireP3CaseId('model-selected-filter'), /P3_CASE_NOT_IN_ACCEPTANCE_MATRIX/);
});

test('operation envelope resolves only references in current observation and registered primitive', () => {
  const request = createP3OperationEnvelope({ observation, actorRef: 'actor', primitive: 'move',
    registeredPrimitives: ['move'], args: { route_ref: 'road' },
    references: { items: 'item', targets: 'target' }, operationId: 'op-1' });
  assert.equal(request.actor_id, 'avatar');
  assert.equal(request.references.items.id, 'uid:9');
  assert.equal(request.references.targets.id, 'target');
  assert.equal(request.expected_native_observation.turn, 4);
  assert.equal(request.expected_native_observation.revision, 4);
  assert.throws(() => createP3OperationEnvelope({ observation: { ...observation, turn: 5 },
    actorRef: 'actor', primitive: 'move', registeredPrimitives: ['move'], args: {} }),
  /P3_NATIVE_OBSERVATION_TURN_REVISION_MISMATCH/);
  assert.equal(Object.isFrozen(request.args), true);
  assert.throws(() => createP3OperationEnvelope({ observation, actorRef: 'missing', primitive: 'move',
    registeredPrimitives: ['move'], args: {}, operationId: 'op-2' }), /P3_ACTOR_REFERENCE_UNRESOLVED/);
  assert.throws(() => createP3OperationEnvelope({ observation, actorRef: 'actor', primitive: 'shell',
    registeredPrimitives: ['move'], args: {}, operationId: 'op-3' }), /P3_NATIVE_PRIMITIVE_NOT_REGISTERED/);
  assert.throws(() => createP3OperationEnvelope({ observation, actorRef: 'actor', primitive: 'move',
    registeredPrimitives: ['move'], args: {}, references: { items: 'stale' }, operationId: 'op-4' }),
  /P3_ITEMS_REFERENCE_UNRESOLVED/);
  assert.throws(() => createP3OperationEnvelope({ observation, actorRef: 'actor', primitive: 'move',
    registeredPrimitives: ['move'], args: { shell: 'arbitrary' }, operationId: 'op-5' }),
  /P3_UNTRUSTED_NATIVE_CONTROL_FIELD/);
});

test('mock readback schema enforces identity and actual before/after; does not prove native execution', () => {
  const request = { operation_id: 'op-1' };
  const readback = { schema: 'p3_native_operation_readback_v1', operation_id: 'op-1',
    status: 'applied', effect_status: 'achieved', before: { position: 'west' },
    after: { position: 'east' }, native_detail: { turn: 9 } };
  assert.equal(validateP3Readback(request, readback).after.position, 'east');
  assert.deepEqual(validateP3Readback(request, readback).native_detail, { turn: 9 });
  assert.throws(() => validateP3Readback(request, { ...readback, operation_id: 'op-2' }),
    /P3_NATIVE_READBACK_IDENTITY_MISMATCH/);
  assert.throws(() => validateP3Readback(request, { ...readback, after: null }),
    /P3_NATIVE_ACTUAL_BEFORE_AFTER_REQUIRED/);
  assert.equal(validateP3Readback(request, { ...readback, status: 'refused', effect_status: 'not_achieved',
    refusal: { code: 'blocked' } }).status, 'refused');
  assert.throws(() => validateP3Readback(request, { ...readback, status: 'refused',
    refusal: { code: 'blocked' } }), /P3_NATIVE_REFUSAL_EFFECT_MISMATCH/);
  assert.throws(() => validateP3Readback(request, { ...readback, effect_status: 'unknown-effect' }),
    /P3_NATIVE_EFFECT_STATUS_INVALID/);
});

test('native seam is explicitly unsupported until a native adapter is handed off', () => {
  assert.throws(() => requireP3NativeSeam(null), { code: 'P3_NATIVE_SEAM_UNAVAILABLE' });
  assert.equal(requireP3NativeSeam({ writeOperationRequest() {}, readOperationReadback() {} }) != null, true);
});

test('native file adapter reads current observation and correlates actual readback identity', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'p3-native-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { writeFile } = await import('node:fs/promises');
  const current = { schema: 'p3_native_observation_v1', turn: 3, revision: 3,
    actors: [{ actor_ref: 'avatar', actor_id: '7', position: [60, 60, 0] }],
    items: [{ item_ref: 'item:8', item_uid: '8', type: 'rock' }],
    targets: [{ target_ref: '60,59,0', position: [60, 59, 0] }] };
  await writeFile(path.join(root, 'novgorod-p3-observation.json'), JSON.stringify(current));
  const observation = await readP3NativeObservation(root);
  const request = createP3OperationEnvelope({ observation, actorRef: 'avatar', primitive: 'move',
    args: { direction: [0, -1] }, registeredPrimitives: ['move'], operationId: 'adapter-op' });
  const adapter = createP3NativeFileAdapter({ userDir: root, pollIntervalMs: 2, timeoutMs: 40 });
  await adapter.writeOperationRequest(request);
  await writeFile(path.join(root, 'novgorod-p3-operation-readback.json'), JSON.stringify({
    schema: 'p3_native_operation_readback_v1', operation_id: 'adapter-op', status: 'applied',
    effect_status: 'achieved',
    before: { turn: 3 }, after: { turn: 3 }
  }));
  assert.equal((await adapter.readOperationReadback(request)).status, 'applied');
  await assert.rejects(readP3NativeObservation(path.join(root, 'missing')), { code: 'ENOENT' });
});

test('native process transport passes fixed arguments to execFile with shell disabled', async () => {
  let invocation;
  const adapter = createP3NativeProcessAdapter({ binary: '/home/cdda/build/tests/cata_test',
    nativeRoot: '/home/cdda', nativeUserDir: '/tmp/p3/reset-1', hostUserDir: '/tmp/p3/reset-1',
    world: 'novgorod',
    wslDistribution: 'Ubuntu', execFileImpl: async (file, args, options) => {
      invocation = { file, args, options }; return { stdout: '', stderr: '' };
    } });
  await adapter.runNative('apply');
  assert.equal(invocation.options.shell, false);
  assert.equal(invocation.options.windowsHide, true);
  if (process.platform === 'win32') {
    assert.equal(invocation.file, 'wsl.exe');
    assert.deepEqual(invocation.args, ['--distribution', 'Ubuntu', '--cd', '/home/cdda',
      '--exec', '/usr/bin/env', 'NOVGOROD_P4_MODE=apply', 'NOVGOROD_P4_WORLD=novgorod',
      '/home/cdda/build/tests/cata_test', '--rng-seed', '17', '--user-dir=/tmp/p3/reset-1',
      '[novgorod_semantic]']);
    assert.equal(invocation.options.cwd, undefined);
    assert.equal(invocation.options.env, undefined);
  } else {
    assert.equal(invocation.file, '/home/cdda/build/tests/cata_test');
    assert.deepEqual(invocation.args, ['--rng-seed', '17', '--user-dir=/tmp/p3/reset-1',
      '[novgorod_semantic]']);
    assert.equal(invocation.options.cwd, '/home/cdda');
    assert.equal(invocation.options.env.NOVGOROD_P4_MODE, 'apply');
    assert.equal(invocation.options.env.NOVGOROD_P4_WORLD, 'novgorod');
  }
  await assert.rejects(adapter.runNative(' arbitrary'), /P3_NATIVE_MODE_INVALID/);
});

test('native refresh requires a new observation from the successful read process', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'p3-refresh-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const observation = { schema: 'p3_native_observation_v1', revision: 1, turn: 1,
    actors: [], items: [], targets: [], native_snapshot: { turn: 1 } };
  const observationPath = path.join(root, 'novgorod-p3-observation.json');
  await writeFile(observationPath, JSON.stringify(observation));
  const staleAdapter = createP3NativeProcessAdapter({ binary: '/native/cata_test',
    nativeRoot: '/native', nativeUserDir: root, hostUserDir: root, world: 'novgorod',
    execFileImpl: async () => ({ stdout: '' }) });
  await assert.rejects(staleAdapter.refreshObservation(), { code: 'ENOENT' });
  const freshAdapter = createP3NativeProcessAdapter({ binary: '/native/cata_test',
    nativeRoot: '/native', nativeUserDir: root, hostUserDir: root, world: 'novgorod',
    execFileImpl: async (_file, args, options) => {
      const mode = options.env?.NOVGOROD_P4_MODE ?? args.find(arg => arg.startsWith('NOVGOROD_P4_MODE='));
      if (mode === 'read' || mode === 'NOVGOROD_P4_MODE=read') {
        await writeFile(observationPath, JSON.stringify(observation));
      }
      return { stdout: '' };
    } });
  assert.deepEqual(await freshAdapter.refreshObservation(), observation);
});

test('free player intent crosses turn-step repair and typed registry before native mapping', async () => {
  const seen = [];
  const current = { schema: 'p3_native_observation_v1', turn: 3, revision: 3,
    actors: [{ actor_ref: 'avatar', actor_id: '7', position: [60, 60, 0] },
      { actor_ref: 'npc:8', actor_id: '8', position: [61, 60, 0], visible: true }],
    items: [{ item_ref: 'item:8', item_uid: '8', type: 'rock', holder: '7',
      use_methods: ['activate'] }],
    targets: [{ target_ref: '60,59,0', position: [60, 59, 0] },
      { target_ref: '61,60,0', position: [61, 60, 0], openable: true }] };
  const adapter = { writeOperationRequest: async request => { seen.push(request); },
    readOperationReadback: async request => ({ schema: 'p3_native_operation_readback_v1',
      status: 'applied', effect_status: 'achieved', operation_id: request.operation_id,
      before: { turn: 3 }, after: { turn: 3 } }) };
  const result = await runP3TurnStep({ intent: 'Иди на запад', observation: current,
    nativeAdapter: adapter, operationId: 'typed-turn-1', turnStepModel: async request => {
      const operation = request.available_domain_operations.find(({ op }) => op === 'request_movement');
      return { schema: 'turn_step_plan_v1', request_id: request.request_id,
        committed_state_version: request.committed_state_version,
        working_revision: request.working_revision, step_index: request.step_index,
        interpretation: { player_goal: request.remaining_intent,
          grounded_attempt: request.remaining_intent, adaptation: 'literal' },
        resolution: 'domain_request', goal_result: 'pending',
        activity: { owner: 'domain', duration_class: null, effort: null },
        operations: [operation], check: null, continuation: null, clarification: null,
        direct_result_kind: null, reason_code: 'domain_request', reason: 'move to visible tile' };
    } });
  assert.equal(result.status, 'resolved');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].primitive, 'move');
  assert.deepEqual(seen[0].args.direction, [0, -1]);
  const operations = buildP3TurnOperations(current);
  assert.equal(operations.some(({ op }) => op === 'request_item_use'), true);
  const useOperation = operations.find(({ op }) => op === 'request_item_use');
  assert.throws(() => mapP3TurnOperationToNative(useOperation, { ...current,
    items: [{ ...current.items[0], use_methods: ['activate', 'eat'] }] }),
    /P3_ITEM_USE_METHOD_AMBIGUOUS/);
  const oneMethod = { ...current, items: [{ ...current.items[0], use_methods: ['activate'] }] };
  assert.equal(mapP3TurnOperationToNative(useOperation, oneMethod).args.method, 'activate');
  const targeted = mapP3TurnOperationToNative({ ...useOperation, target_refs: ['60,59,0'] }, oneMethod);
  assert.deepEqual(targeted.args.target_direction, [0, -1]);
  assert.equal(targeted.references.targets, '60,59,0');
  const operationsByKind = Object.fromEntries(buildP3TurnOperations(current).map(op => [op.op, op]));
  assert.equal(operationsByKind.request_item_use.use_kind, 'operate');
  assert.equal(buildP3TurnOperations(current).some(({ op }) => op === 'emit_interaction'), false);
  const openOperation = operationsByKind.request_container_access;
  assert.equal(mapP3TurnOperationToNative(openOperation, current).primitive, 'open');
  assert.deepEqual(mapP3TurnOperationToNative(openOperation, current).args.direction, [1, 0]);
  assert.equal(mapP3TurnOperationToNative(operationsByKind.request_activity, current).primitive, 'wait');
  const speechOperation = { op: 'emit_interaction', actor_ref: 'avatar',
    target_actor_refs: ['npc:8'], interaction_kind: 'speech', content: 'Привет, сосед!' };
  const mappedSpeech = mapP3TurnOperationToNative(speechOperation, current);
  assert.equal(mappedSpeech.primitive, 'speak');
  assert.equal(mappedSpeech.args.utterance, 'Привет, сосед!');
  assert.deepEqual(mappedSpeech.references.actors, ['npc:8']);
  assert.throws(() => mapP3TurnOperationToNative({ ...speechOperation,
    target_actor_refs: ['hidden'] }, current), /P3_TYPED_VISIBLE_LISTENER_UNRESOLVED/);
});

test('move_entity pickup intent reaches native for one observed UID only', async () => {
  const current = { schema: 'p3_native_observation_v1', turn: 3, revision: 3,
    actors: [{ actor_ref: 'avatar', actor_id: '7', position: [60, 60, 0] }],
    items: [{ item_ref: 'item:18', item_uid: 'uid:18', type: 'rock', position: [60, 61, 0] }],
    targets: [] };
  const operation = { op: 'move_entity', entity_ref: 'uid:18',
    placement: { relation: 'held_by', target_ref: 'avatar' } };
  const mapped = mapP3TurnOperationToNative(operation, current);
  assert.equal(mapped.primitive, 'pickup');
  assert.deepEqual(mapped.references, { items: 'item:18' });
  for (const placement of [
    { relation: 'inside', target_ref: 'box' },
    { relation: 'worn_by', target_ref: 'avatar' },
    { relation: 'held_by', target_ref: 'someone-else' }
  ]) assert.throws(() => mapP3TurnOperationToNative({ ...operation, placement }, current),
    /P3_PICKUP_INTENT_UNSUPPORTED/);
  assert.throws(() => mapP3TurnOperationToNative(operation, { ...current,
    items: [{ ...current.items[0], position: [63, 60, 0] }] }), /P3_TYPED_GROUND_ITEM_UNRESOLVED/);
  assert.throws(() => mapP3TurnOperationToNative(operation, { ...current,
    items: [...current.items, { ...current.items[0], item_ref: 'item:19' }] }),
  /P3_TYPED_GROUND_ITEM_UNRESOLVED/);

  const requests = [];
  const result = await runP3TurnStep({ intent: 'Подними камень', observation: current,
    operationId: 'pickup-selected-uid', nativeAdapter: { writeOperationRequest: async () => {},
      readOperationReadback: async () => {}, execute: async envelope => {
      requests.push(envelope);
      return { schema: 'p3_native_operation_readback_v1', operation_id: envelope.operation_id,
        status: 'applied', effect_status: 'achieved', before: { turn: 3 }, after: { turn: 3 } };
    } }, turnStepModel: async request => ({ schema: 'turn_step_plan_v1',
      request_id: request.request_id, committed_state_version: request.committed_state_version,
      working_revision: request.working_revision, step_index: request.step_index,
      interpretation: { player_goal: request.remaining_intent, grounded_attempt: request.remaining_intent,
        adaptation: 'literal' }, resolution: 'direct', goal_result: 'achieved',
      activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' },
      operations: [operation], check: null, continuation: null, clarification: null,
      direct_result_kind: null, reason_code: 'pickup_intent', reason: 'pick up selected item' }) });
  assert.equal(result.status, 'resolved');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].primitive, 'pickup');
  assert.deepEqual(requests[0].references.items, { ref: 'item:18', id: 'uid:18' });
  assert.equal(result.working_projection.native_goal_result, 'achieved');
});

test('current native readback projects goal and effect separately while legacy result stays compatible', async () => {
  const scenarios = [
    { name: 'pickup', kind: 'pickup', goal: 'achieved', effect: 'confirmed', expected: 'achieved' },
    { name: 'flashlight use', kind: 'item', itemType: 'flashlight', goal: 'achieved',
      effect: 'confirmed', expected: 'achieved' },
    { name: 'speech', kind: 'speech', goal: 'achieved', effect: 'confirmed', expected: 'achieved' },
    { name: 'firestarter progress', kind: 'item', itemType: 'firestarter', goal: 'in_progress',
      effect: 'progressing', expected: 'partially_achieved' },
    { name: 'no effect', kind: 'item', itemType: 'flashlight', goal: 'not_achieved',
      effect: 'none', expected: 'not_achieved' },
    { name: 'refusal', kind: 'item', itemType: 'firestarter', goal: 'refused',
      effect: 'refused', status: 'refused', expected: 'not_achieved' },
    { name: 'confirmed effect without goal', kind: 'item', itemType: 'flashlight',
      effect: 'confirmed', expectedError: 'P3_NATIVE_GOAL_RESULT_MISSING' }
  ];
  for (const [index, scenario] of scenarios.entries()) {
    const current = { schema: 'p3_native_observation_v1', turn: 3, revision: 3,
      actors: [{ actor_ref: 'avatar', actor_id: '7', position: [60, 60, 0] },
        ...(scenario.kind === 'speech' ? [{ actor_ref: 'npc:8', actor_id: '8',
          position: [61, 60, 0], visible: true }] : [])],
      items: scenario.kind === 'pickup' ? [{ item_ref: 'item:18', item_uid: 'uid:18',
        type: 'rock', position: [60, 61, 0] }] : scenario.kind === 'item'
        ? [{ item_ref: 'item:9', item_uid: 'uid:9', type: scenario.itemType,
          holder: '7', use_methods: ['activate'] }] : [], targets: [] };
    const readback = { schema: 'p3_native_operation_readback_v1', status: scenario.status ?? 'applied',
      ...(scenario.goal ? { goal_result: scenario.goal } : {}),
      native_effect: { effect_status: scenario.effect,
        ...(scenario.kind === 'speech' ? { speakerId: '7', utterance: 'Привет',
          actualHeardListenerIds: [] } : {}) }, before: {}, after: {},
      ...(scenario.status === 'refused' ? { refusal: { code: 'blocked' } } : {}) };
    const result = runP3TurnStep({ intent: scenario.name, observation: current,
      operationId: `current-readback-${index}`, nativeAdapter: {
        writeOperationRequest: async () => {}, readOperationReadback: async () => ({}),
        execute: async envelope => ({ ...readback, operation_id: envelope.operation_id })
      }, turnStepModel: async request => {
        const operation = scenario.kind === 'pickup'
          ? { op: 'move_entity', entity_ref: 'uid:18',
            placement: { relation: 'held_by', target_ref: 'avatar' } }
          : scenario.kind === 'speech'
            ? { op: 'emit_interaction', actor_ref: 'avatar', target_actor_refs: ['npc:8'],
              interaction_kind: 'speech', content: 'Привет', instrument_refs: [] }
            : request.available_domain_operations.find(({ op }) => op === 'request_item_use');
        return { schema: 'turn_step_plan_v1', request_id: request.request_id,
          committed_state_version: request.committed_state_version,
          working_revision: request.working_revision, step_index: request.step_index,
          interpretation: { player_goal: request.remaining_intent,
            grounded_attempt: request.remaining_intent, adaptation: 'literal' },
          resolution: scenario.kind === 'pickup' ? 'direct' : 'domain_request', goal_result: 'pending',
          activity: { owner: scenario.kind === 'pickup' ? 'semantic' : 'domain',
            duration_class: scenario.kind === 'pickup' ? 'brief' : null,
            effort: scenario.kind === 'pickup' ? 'light' : null }, operations: [operation], check: null,
          continuation: null, clarification: null, direct_result_kind: null,
          reason_code: 'native_readback_fixture', reason: 'project native result' };
      } });
    if (scenario.expectedError) {
      await assert.rejects(result, { message: scenario.expectedError });
      continue;
    }
    const projected = await result;
    assert.equal(projected.working_projection.native_goal_result, scenario.expected, scenario.name);
    assert.equal(projected.working_projection.native_readback.native_effect.effect_status,
      scenario.effect, scenario.name);
  }
});

test('real turn owner validates injected model response; this is not a native execution assertion', async () => {
  let calls = 0;
  const result = await requestP3TurnPlan({ request: sampleRequest(),
    async turnStepModel() { calls++; return samplePlan(); } });
  assert.equal(result.plan.schema, 'turn_step_plan_v1');
  assert.equal(calls, 1);
  assert.equal(result.repaired, false);
});

test('generic turn loop dispatches open, wait, and exact speech through native envelopes', async () => {
  const current = { schema: 'p3_native_observation_v1', turn: 3, revision: 3,
    actors: [{ actor_ref: 'avatar', actor_id: '7', position: [60, 60, 0] },
      { actor_ref: 'npc:8', actor_id: '8', position: [61, 60, 0], visible: true }],
    items: [{ item_ref: 'item:9', item_uid: '9', type: 'rock', holder: '7', use_methods: ['activate'] }],
    targets: [{ target_ref: '61,60,0', position: [61, 60, 0], openable: true }] };
  const calls = [];
  const nativeAdapter = {
    writeOperationRequest: async () => {}, readOperationReadback: async () => ({}),
    execute: async envelope => {
      calls.push(envelope);
      return { schema: 'p3_native_operation_readback_v1', operation_id: envelope.operation_id,
        status: 'applied', effect_status: envelope.primitive === 'wait' ? 'unknown' : 'unknown',
        ...(envelope.primitive === 'speak' ? { native_effect: { speakerId: '7',
          utterance: envelope.args.utterance, actualHeardListenerIds: [] } } : {}),
        before: { turn: 3 }, after: { turn: 3 }, native_trace: { primitive: envelope.primitive } };
    }
  };
  for (const [opName, expectedPrimitive] of [
    ['request_item_use', 'use_item'], ['request_container_access', 'open'],
    ['request_activity', 'wait']
  ]) {
    const result = await runP3TurnStep({ intent: 'Do the operation', observation: current,
      nativeAdapter, operationId: `typed-${opName}`, turnStepModel: async request => {
        const offered = request.available_domain_operations.find(({ op }) => op === opName);
        const operation = offered;
        return { schema: 'turn_step_plan_v1', request_id: request.request_id,
          committed_state_version: request.committed_state_version,
          working_revision: request.working_revision, step_index: request.step_index,
          interpretation: { player_goal: request.remaining_intent,
            grounded_attempt: request.remaining_intent, adaptation: 'literal' },
          resolution: 'domain_request', goal_result: 'pending',
          activity: { owner: 'domain', duration_class: null, effort: null },
          operations: [operation], check: null, continuation: null, clarification: null,
          direct_result_kind: null, reason_code: 'domain_request', reason: 'typed native request' };
      } });
    const envelope = calls.at(-1);
    assert.equal(envelope.primitive, expectedPrimitive);
    assert.equal(result.working_projection.native_readback.native_trace.primitive, expectedPrimitive);
    if (opName === 'request_item_use') assert.equal(envelope.args.method, 'activate');
    if (opName === 'request_activity') {
      assert.equal(result.working_projection.native_readback.status, 'applied');
      assert.equal(result.working_projection.native_goal_result, 'partially_achieved');
    } else assert.equal(result.working_projection.native_goal_result, 'not_achieved');
  }
});

test('production operation choice hydrates one observed item target into the native envelope', async () => {
  const current = { schema: 'p3_native_observation_v1', turn: 3, revision: 3,
    actors: [{ actor_ref: 'avatar', actor_id: '7', position: [60, 60, 0] }],
    items: [{ item_ref: 'item:firestarter', item_uid: 'uid:firestarter', type: 'firestarter',
      holder: '7', use_methods: ['activate'] }],
    targets: [{ target_ref: 'target:left', position: [59, 60, 0] },
      { target_ref: 'target:right', position: [61, 60, 0] },
      { target_ref: 'target:far', position: [64, 60, 0] }] };
  const itemChoices = buildP3TurnOperations(current)
    .filter(({ op, item_ref }) => op === 'request_item_use' && item_ref === 'item:firestarter');
  assert.deepEqual(itemChoices.map(({ target_refs }) => target_refs),
    [[], ['target:left'], ['target:right']]);
  let providerCalls = 0;
  let nativeCalls = 0;
  let captured;
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: { async run(call) {
    providerCalls++;
    assert.equal(call.role_id, 'turn_step_planner');
    const request = JSON.parse(call.messages[1].content);
    const selected = turnStepOperationChoices(request).find(({ operation }) =>
      operation.op === 'request_item_use' && operation.item_ref === 'item:firestarter'
        && operation.target_refs[0] === 'target:right');
    assert.ok(selected);
    return { output: { interpretation: { player_goal: request.remaining_intent,
      grounded_attempt: request.remaining_intent, adaptation: 'literal' },
      resolution: 'domain_request', goal_result: 'pending',
      activity: { owner: 'domain', duration_class: null, effort: null },
      direct_result_kind: null, operation_family: 'request_item_use',
      operation_choice: selected.choice_id, operations: [], check: null,
      continuation: null, clarification: null, reason_code: 'targeted_item_use',
      reason: 'Use the held firestarter on the observed adjacent target.' } };
  } } });
  const result = await runP3TurnStep({ intent: 'Используй кресало на правой цели',
    observation: current, operationId: 'production-targetful-item-use', nativeAdapter: {
      writeOperationRequest: async () => {}, readOperationReadback: async () => ({}),
      async execute(envelope) { nativeCalls++; captured = envelope;
        return { schema: 'p3_native_operation_readback_v1', operation_id: envelope.operation_id,
          status: 'applied', goal_result: 'achieved',
          native_effect: { effect_status: 'confirmed' }, before: {}, after: {} };
      }
    }, turnStepModel: model });
  assert.equal(providerCalls, 1);
  assert.equal(nativeCalls, 1);
  assert.equal(captured.primitive, 'use_item');
  assert.deepEqual(captured.args, { method: 'activate', target_direction: [1, 0] });
  assert.equal(captured.references.targets.ref, 'target:right');
  assert.equal(result.working_projection.native_goal_result, 'achieved');
});

test('production player_utterance reaches native speech and conversation owner exactly once', async () => {
  const text = 'Приходи до рассвета!';
  const intent = `Скажи дословно: «${text}»`;
  const current = { schema: 'p3_native_observation_v1', turn: 120, revision: 120,
    actors: [{ actor_ref: 'avatar', actor_id: '7', position: [60, 60, 0] },
      { actor_ref: 'npc:8', actor_id: '8', position: [61, 60, 0], visible: true },
      { actor_ref: 'npc:9', actor_id: '9', position: [60, 61, 0], visible: false }],
    items: [], targets: [] };
  const output = (request, delivery = { loudness: 2, duration_class: 'brief' },
    speakerRef = 'avatar') => ({ interpretation: { player_goal: request.remaining_intent,
      grounded_attempt: text, adaptation: 'literal' }, resolution: 'direct',
    goal_result: 'achieved', activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    direct_result_kind: 'player_utterance', utterance: { speaker_ref: speakerRef,
      utterance_text: text, input_mode: 'verbatim', delivery }, operation_family: null,
    operation_choice: null, operations: [], check: null, continuation: null,
    clarification: null, reason_code: 'player_utterance', reason: 'Speak the supplied words.' });
  const validatedPlan = (request, delivery, speakerRef) => ({
    schema: 'turn_step_plan_v1', request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision, step_index: request.step_index,
    interpretation: { player_goal: request.remaining_intent,
      grounded_attempt: text, adaptation: 'literal' },
    resolution: 'direct', goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    operations: [], check: null, continuation: null, clarification: null,
    direct_result_kind: 'player_utterance', utterance: { speaker_ref: speakerRef,
      utterance_text: text, input_mode: 'verbatim', delivery },
    reason_code: 'player_utterance', reason: 'Speak the supplied words.'
  });
  let providerCalls = 0;
  let nativeCalls = 0;
  let captured;
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: { async run(call) {
    providerCalls++;
    assert.equal(call.role_id, 'turn_step_planner');
    const request = JSON.parse(call.messages[1].content);
    assert.equal(request.remaining_intent, intent);
    return { output: output(request) };
  } } });
  const nativeAdapter = { writeOperationRequest: async () => {},
    readOperationReadback: async () => ({}),
    async execute(envelope) {
      nativeCalls++;
      captured = envelope;
      return { schema: 'p3_native_operation_readback_v1', operation_id: envelope.operation_id,
        status: 'applied', goal_result: 'achieved',
        before: { turn: 120, clock: { native_turn: 120, seconds_since_world_start: 3600 } },
        after: { turn: 123, clock: { native_turn: 123, seconds_since_world_start: 3603 } },
        native_effect: { effect_status: 'confirmed', speakerId: '7', utterance: text,
          actualHeardListenerIds: ['8'], elapsedSeconds: 3 } };
    } };
  const result = await runP3TurnStep({ intent, observation: current,
    operationId: 'production-player-utterance', nativeAdapter, turnStepModel: model,
    conversationOwnerForSpeech: async ({ operation, readback }) => ({
      ...createP3NativeSpeechOwnerFixture({ observation: current, readback, operation }),
      replay: new Map()
    }) });
  assert.equal(providerCalls, 1);
  assert.equal(nativeCalls, 1);
  assert.equal(captured.primitive, 'speak');
  assert.equal(captured.args.utterance, text);
  assert.deepEqual(captured.references.actors.map(({ ref }) => ref), ['npc:8']);
  assert.equal(result.working_projection.native_readback.native_effect.utterance, text);
  assert.equal(result.working_projection.conversation_outcome.contribution_event.utterance_text, text);
  assert.deepEqual(result.working_projection.conversation_outcome.native_speech.actual_heard_listener_ids,
    ['8']);
  assert.equal(result.working_projection.conversation_outcome.native_speech.elapsed_seconds, 3);

  assert.deepEqual(captured.args.delivery, { loudness: 2, duration_class: 'brief' });
  for (const loudness of [1, 2, 3, 4]) {
    for (const duration_class of ['instant', 'brief']) {
      const delivery = { loudness, duration_class };
      await runP3TurnStep({ intent, observation: current,
        operationId: `supported-speech-${loudness}-${duration_class}`,
        nativeAdapter, turnStepModel: async request => validatedPlan(request, delivery, 'avatar'),
        conversationOwnerForSpeech: async ({ operation, readback }) => {
          assert.equal(Object.hasOwn(operation, 'delivery'), false);
          return { ...createP3NativeSpeechOwnerFixture({ observation: current, readback, operation }),
            replay: new Map() };
        }
      });
      assert.deepEqual(captured.args.delivery, delivery);
      assert.equal(captured.args.utterance, text);
    }
    await assert.rejects(runP3TurnStep({ intent, observation: current,
      operationId: `unsupported-speech-${loudness}-sustained`, nativeAdapter,
      turnStepModel: async request => validatedPlan(request,
        { loudness, duration_class: 'sustained' }, 'avatar'),
      conversationOwnerForSpeech: async () => { throw new Error('must not reach owner'); }
    }), { message: 'P3_PLAYER_UTTERANCE_DELIVERY_UNSUPPORTED' });
  }
  const callsBeforeInvalid = nativeCalls;
  for (const delivery of [undefined, null, {}, { loudness: 2 }, { duration_class: 'brief' },
    { loudness: 0, duration_class: 'brief' }, { loudness: 5, duration_class: 'brief' },
    { loudness: 1.5, duration_class: 'brief' }, { loudness: '2', duration_class: 'brief' },
    { loudness: 2, duration_class: 'long' }, { loudness: 2, duration_class: 'brief', extra: true }]) {
    await assert.rejects(runP3TurnStep({ intent, observation: current,
      operationId: 'malformed-speech-delivery', nativeAdapter,
      turnStepModel: async request => validatedPlan(request, delivery, 'avatar')
    }), { code: 'TURN_STEP_PLAN_INVALID' });
  }
  assert.equal(nativeCalls, callsBeforeInvalid);
  await assert.rejects(runP3TurnStep({ intent, observation: current,
    operationId: 'wrong-speech-speaker', nativeAdapter,
    turnStepModel: async request => validatedPlan(request,
      { loudness: 2, duration_class: 'brief' }, 'npc:9'),
    conversationOwnerForSpeech: async () => { throw new Error('must not reach owner'); }
  }), { code: 'TURN_STEP_PLAN_INVALID' });
  assert.equal(nativeCalls, 9);
});

test('sealed package shares one attempt budget and evidence root across all reset mocks', async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'p3-sealed-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const casePack = { schema: 'p3_sealed_case_pack_v1', package_id: 'acceptance-2026-01',
    cases: ['T06', 'T06', 'T07', 'T08', 'T09', 'T10'].map((case_id, index) => ({ case_id,
      variant_id: case_id === 'T06' ? (index === 0 ? 'safe' : 'alternate') : case_id.toLowerCase(),
      intent: `Intent ${case_id} variant ${index}`, reset_count: 3 })) };
  assert.equal(validateP3SealedCasePack(casePack), casePack);
  assert.throws(() => validateP3SealedCasePack({ ...casePack,
    cases: casePack.cases.map((item, index) => index === 0 ? { ...item, reset_count: 2 } : item) }),
  /P3_SEALED_CASE_RESET_SET_INVALID/);
  const observation = { schema: 'p3_native_observation_v1', turn: 3, revision: 3,
    actors: [{ actor_ref: 'avatar', actor_id: '7', position: [60, 60, 0] }], items: [], targets: [] };
  let roleRunnerCreations = 0;
  let nativePreflights = 0;
  let providerCalls = 0;
  let npcProviderCalls = 0;
  let nativeNpcOperations = 0;
  const rolesUsed = new Set();
  const nativeConfigs = [];
  const operationIds = [];
  const roleConfigs = Array.from({ length: 6 }, (_, index) => ({ role_id: `role-${index}`,
    provider: 'openai_compatible', model: 'qwen3.8-27b-uncensored-w4a16-tp2', temperature: 0, top_p: 1,
    max_tokens: 20_000, context_window_tokens: 65_536, input_limit_tokens: 45_536,
    timeout_ms: 120_000, api_key_present: true,
    api_key: 'must-not-persist' }));
  const result = await runP3SealedPackage({ casePack, roleConfigs, nativeConfig: {
    evidence_root: path.join(temp, 'evidence'), nativeUserDir: '/native/users',
    hostUserDir: path.join(temp, 'users'), world: 'fixture', binary: '/native/cata', nativeRoot: '/native'
  }, createRuntime: async ({ budget }) => {
    assert.deepEqual(JSON.parse(await readFile(path.join(temp, 'evidence', 'case-pack.json'), 'utf8')),
      casePack);
    const savedRoles = JSON.parse(await readFile(path.join(temp, 'evidence', 'role-config.json'), 'utf8'));
    assert.equal(savedRoles.length, 6);
    assert.equal(JSON.stringify(savedRoles).includes('must-not-persist'), false);
    roleRunnerCreations++;
    const runPlan = async request => {
      providerCalls++;
      const operation = request.available_domain_operations.find(({ op }) => op === 'request_activity');
      return { schema: 'turn_step_plan_v1', request_id: request.request_id,
        committed_state_version: request.committed_state_version,
        working_revision: request.working_revision, step_index: request.step_index,
        interpretation: { player_goal: request.remaining_intent,
          grounded_attempt: request.remaining_intent, adaptation: 'literal' },
        resolution: 'domain_request', goal_result: 'pending',
        activity: { owner: 'domain', duration_class: null, effort: null }, operations: [operation],
        check: null, continuation: null, clarification: null, direct_result_kind: null,
        reason_code: 'domain_request', reason: 'wait' };
    };
    const planner = budget.wrap({ run: async request => { rolesUsed.add('planner'); return runPlan(request); } });
    const repair = budget.wrap({ run: async request => { rolesUsed.add('repair'); return runPlan(request); } });
    const npcRunner = budget.wrap({ run: async request => {
      npcProviderCalls++;
      return { schema: 'npc_step_plan_v1', request_id: request.request_id,
        root_turn_id: request.root_turn_id, boundary_id: request.boundary_id,
        committed_state_version: request.committed_state_version,
        working_revision: request.working_revision, decision_index: request.decision_index,
        npc_ref: request.npc_ref,
        interpretation: { npc_goal: 'continue duty', grounded_attempt: 'walk to observed tile',
          adaptation: 'literal' }, resolution: 'domain_request', goal_result: 'pending',
        activity: { owner: 'domain', duration_class: null, effort: null },
        operations: [{ op: 'request_movement', actor_ref: request.npc_ref,
          target_ref: 'target:61:62:0', movement_kind: 'local' }], check: null,
        reason_code: 'continue_duty', reason: 'Observed target supports duty.' };
    } });
    return { turnStepModel: request => (providerCalls % 2 ? repair : planner).run(request),
      npcAutonomousModel: request => npcRunner.run(request) };
  }, nativeAdapterFactory: config => {
    nativeConfigs.push(config);
    const npcProjection = { actor_id: '8', native_turn: 3, assignment_id: '',
      assignment_status: '', activity_id: 'ACT_WORK', visible_actors: [], visible_items: [],
      visible_targets: [{ target_ref: 'target:61:62:0', position: [61, 62, 0],
        terrain: 't_dirt', openable: false }] };
    const npcObservation = { ...observation,
      actors: [...observation.actors, { actor_ref: 'npc:8', actor_id: '8', position: [60, 62, 0] }],
      npc_projections: [npcProjection] };
    return { async preflight() { nativePreflights++; return npcObservation; },
      async refreshObservation() { return npcObservation; },
      async writeOperationRequest() {}, async readOperationReadback() {},
      async execute(envelope) { operationIds.push(envelope.operation_id);
        if (envelope.primitive === 'npc_move') nativeNpcOperations++;
        return { schema: 'p3_native_operation_readback_v1',
        operation_id: envelope.operation_id, status: 'applied', effect_status: 'achieved',
        ...(envelope.primitive === 'npc_move' ? { goal_result: 'in_progress',
          native_effect: { effect_status: 'progressing' } } : {}),
        before: { turn: 3 }, after: { turn: 3 }, native_trace: { operation: envelope.primitive } }; } };
  } });
  assert.equal(result.provider_calls, 18);
  assert.equal(providerCalls, 15);
  assert.equal(npcProviderCalls, 3);
  assert.equal(nativeNpcOperations, 3);
  assert.equal(roleRunnerCreations, 1);
  assert.deepEqual([...rolesUsed].sort(), ['planner', 'repair']);
  assert.equal(nativePreflights, 18);
  assert.equal(new Set(nativeConfigs.map(({ world }) => world)).size, 18);
  assert.equal(result.reset_results.length, 18);
  assert.equal(new Set(operationIds).size, 16);
  assert.equal(result.acceptance, 'not_evaluated');
  assert.ok(result.reset_results.filter(({ case_id }) => case_id !== 'T09')
    .every(({ native_goal_result }) => native_goal_result === 'partially_achieved'));
  const t09 = result.reset_results.filter(({ case_id }) => case_id === 'T09');
  assert.equal(t09.length, 3);
  assert.ok(t09.every(({ effect_status }) => effect_status === 'progressing'));
  assert.ok(t09.every(({ npc_semantic_decision_count, npc_replay_decision_count,
    npc_semantic_provider_calls, npc_native_operation_count, npc_replay_native_operation_count,
    npc_boundary, npc_replay }) => npc_semantic_decision_count === 1
      && npc_replay_decision_count === 0 && npc_semantic_provider_calls === 1
      && npc_native_operation_count === 1 && npc_replay_native_operation_count === 0
      && npc_boundary.boundary_id === npc_replay.boundary_id));
  const events = (await readFile(path.join(result.evidence_directory, 'run.jsonl'), 'utf8'))
    .trim().split('\n').map(line => JSON.parse(line));
  assert.equal(events.filter(({ event }) => event === 'native_preflight').length, 18);
  assert.equal(events.filter(({ event }) => event === 'native_turn_result').length, 15);
  assert.equal(events.filter(({ event }) => event === 'native_npc_boundary_replay').length, 3);
  assert.equal(events.find(({ event }) => event === 'native_turn_result').result
    .working_projection.native_readback.native_trace.operation, 'wait');
  await assert.rejects(runP3SealedPackage({ casePack, roleConfigs, nativeConfig: {
    evidence_root: path.join(temp, 'evidence'), nativeUserDir: '/native/users',
    hostUserDir: path.join(temp, 'users'), world: 'fixture', binary: '/native/cata', nativeRoot: '/native'
  }, createRuntime() { throw new Error('must not restart the package'); } }), { code: 'EEXIST' });
});

test('NPC requests fail closed through the existing safe snapshot projector', () => {
  assert.throws(() => buildP3NpcRequest({}), /P3|NPC|snapshot|boundary/i);
});

test('native speech validates current conversation identity and unique heard listeners before replay', () => {
  const context = { conversationId: 'conversation-1', exchangeId: 'exchange-1',
    stateVersion: 7, nativeSpeakerActorId: 'native-7',
    playerActorRef: { entity_id: 'player-1' }, actualNpcActors: [] };
  const plan = { speaker_ref: { entity_id: 'player-1' }, speech: { utterance_text: 'Точное слово' } };
  const replay = new Map([['speech-op', { digest: 'previous', outcome: { statement: 'cached' } }]]);
  const base = { opId: 'speech-op', conversationId: 'conversation-1', exchangeId: 'exchange-1',
    stateVersion: 7, speakerId: 'native-7', utterance: 'Точное слово',
    actualHeardListenerIds: ['native-8'], elapsedSeconds: 3,
    beforeTime: { native_turn: 10, seconds_since_world_start: 10 },
    nativeTime: { native_turn: 13, seconds_since_world_start: 13 } };
  assert.throws(() => applyP3NativeSpeech({ ...context, conversationId: 'stale' }, {}, plan,
    base, replay), /P3_NATIVE_SPEECH_IDENTITY_MISMATCH/);
  assert.throws(() => applyP3NativeSpeech(context, {}, plan,
    { ...base, actualHeardListenerIds: ['native-8', 'native-8'] }, replay),
  /P3_NATIVE_SPEECH_HEARD_SET_INVALID/);
  assert.throws(() => applyP3NativeSpeech(context, {}, plan,
    { ...base, actualHeardListenerIds: ['native-7'] }, replay),
  /P3_NATIVE_SPEECH_HEARD_SET_INVALID/);
});

test('native speech rejects either deaf listener in a two-listener heard set', () => {
  const plan = { speaker_ref: { entity_id: 'player-1' }, speech: { utterance_text: 'Точное слово' } };
  const base = { conversationId: 'conversation-1', exchangeId: 'exchange-1', stateVersion: 7,
    nativeSpeakerActorId: 'native-7', playerActorRef: { entity_id: 'player-1' } };
  const native = { opId: 'speech-op', conversationId: 'conversation-1', exchangeId: 'exchange-1',
    stateVersion: 7, speakerId: 'native-7', utterance: 'Точное слово',
    actualHeardListenerIds: ['native-8', 'native-9'], elapsedSeconds: 3,
    beforeTime: { native_turn: 10, seconds_since_world_start: 10 },
    nativeTime: { native_turn: 13, seconds_since_world_start: 13 } };
  for (const deafId of native.actualHeardListenerIds) {
    const actualNpcActors = native.actualHeardListenerIds.map((native_actor_id, index) => ({
      native_actor_id, instance_id: `npc-${index}`, machine_state: {
        hearing_capability: native_actor_id === deafId ? 'none' : 'normal'
      }
    }));
    assert.throws(() => applyP3NativeSpeech({ ...base, actualNpcActors }, {}, plan,
      native, new Map()), /P3_NATIVE_SPEECH_LISTENER_ID_UNRESOLVED/);
  }
});

test('T09 NPC boundary replays the committed semantic checkpoint without another decision call', async () => {
  const replay = new Map();
  let decisions = 0;
  const input = { nativeProjection: { actor_id: 'npc-8', assignment_id: 'duty-2',
    assignment_status: 'decision_required' }, snapshots: {},
  decision: { boundary: { boundary_id: 'boundary-2' } }, semanticModel: async () => ({}), replay,
  buildRequest: () => ({ schema: 'npc_action_decision_request_v1', request_id: 'request-2' }),
  requestDecision: async request => { decisions++; assert.equal(request.request.request_id, 'request-2');
    return { trace: { boundary_id: 'boundary-2', plan: { operation: 'continue duty' } } }; } };
  const first = await runP3NpcBoundary(input);
  const second = await runP3NpcBoundary(input);
  assert.deepEqual(second, first);
  assert.equal(decisions, 1);
  assert.equal(first.native_projection.assignment_id, 'duty-2');
  assert.deepEqual(first.decision.trace.plan, { operation: 'continue duty' });
});

test('T09 native NPC CLI flow builds safe request, validates decision, applies npc_move once, and replays', async () => {
  const projection = { actor_id: '8', native_turn: 120, assignment_id: 'duty-2',
    assignment_status: 'interrupted_waiting_for_semantic_decision',
    interrupt_cause: 'native_movement_not_applied',
    native_snapshot: { private_world_snapshot_marker: 'must-not-reach-owner' },
    activity_id: 'ACT_WORK', visible_actors: [],
    visible_items: [{ item_ref: 'item:41', item_uid: '41', type: 'hammer', position: [4, 4, 0] }],
    visible_targets: [{ target_ref: 'target:5:4:0', position: [5, 4, 0],
      terrain: 't_dirt', openable: false }] };
  const observation = { schema: 'p3_native_observation_v1', revision: 120, turn: 120,
    actors: [{ actor_ref: 'npc:8', actor_id: '8', position: [4, 4, 0] }],
    items: [], targets: [], npc_projections: [projection] };
  let semanticCalls = 0;
  let nativeCalls = 0;
  const evidenceEvents = [];
  const evidence = { async record(event) { evidenceEvents.push(event); } };
  const nativeAdapter = {
    async refreshObservation() { return observation; },
    async execute(envelope) {
      nativeCalls++;
      assert.equal(envelope.primitive, 'npc_move');
      assert.deepEqual(envelope.args, { direction: [1, 0], assignment_id: 'duty-2',
        intent: 'walk to the observed patch' });
      return { schema: 'p3_native_operation_readback_v1', operation_id: envelope.operation_id,
        status: 'applied', goal_result: 'in_progress', native_effect: {
          effect_status: 'progressing' }, before: {}, after: {} };
    }
  };
  const replay = new Map();
  const semanticModel = async request => {
    semanticCalls++;
    assert.equal(request.schema, 'npc_action_decision_request_v1');
    assert.equal(request.npc_ref, 'npc-8');
    assert.equal(JSON.stringify(request).includes('hidden'), false);
    return { schema: 'npc_step_plan_v1', request_id: request.request_id,
      root_turn_id: request.root_turn_id, boundary_id: request.boundary_id,
      committed_state_version: request.committed_state_version,
      working_revision: request.working_revision, decision_index: request.decision_index,
      npc_ref: request.npc_ref,
      interpretation: { npc_goal: 'continue assigned duty',
        grounded_attempt: 'walk to the observed patch', adaptation: 'literal' },
      resolution: 'domain_request', goal_result: 'pending',
      activity: { owner: 'domain', duration_class: null, effort: null },
      operations: [{ op: 'request_movement', actor_ref: request.npc_ref,
        target_ref: 'target:5:4:0', movement_kind: 'local' }], check: null,
      reason_code: 'continue_duty', reason: 'Observed target supports duty movement.' };
  };
  const first = await runP3NativeNpcFlow({ nativeAdapter, actorId: '8', semanticModel, replay, evidence });
  const second = await runP3NativeNpcFlow({ nativeAdapter, actorId: '8', semanticModel, replay, evidence });
  assert.equal(buildP3NativeNpcDecisionInput(projection).request.schema,
    'npc_action_decision_request_v1');
  assert.equal(first.request.npc_ref, 'npc-8');
  assert.equal(first.request.npc.current_activity.status,
    'interrupted_waiting_for_semantic_decision');
  assert.match(first.request.decision_reasons.perceived_changes[0], /Duty duty-2/);
  assert.match(first.request.decision_reasons.perceived_changes[0], /native_movement_not_applied/);
  assert.equal(JSON.stringify(first.request).includes('must-not-reach-owner'), false);
  const uninterrupted = buildP3NativeNpcDecisionInput({ ...projection,
    assignment_status: 'decision_required' });
  assert.equal(uninterrupted.request.decision_reasons.perceived_changes[0],
    'Duty duty-2 requires a decision.');
  assert.deepEqual(second, first);
  assert.equal(semanticCalls, 1);
  assert.equal(nativeCalls, 1);
  assert.equal(first.native_readback.native_effect.effect_status, 'progressing');
  assert.equal(evidenceEvents.length, 2);
  assert.equal(evidenceEvents[0].checkpoint.request.request_id, first.request.request_id);
  assert.equal(evidenceEvents[0].checkpoint.native_readback.operation_id,
    first.native_readback.operation_id);
});

test('T10 applies exact native speech, heard actors, and elapsed native time once through conversation owner', () => {
  const ownerContext = { conversationId: 'conversation-1', exchangeId: 'exchange-1',
    stateVersion: 7, nativeSpeakerActorId: 'native-7',
    playerActorRef: { entity_id: 'player-1' },
    state: { clock: { whole_minutes: '10', subminute_numerator: '0', subminute_denominator: '1' } },
    actualNpcActors: [{ native_actor_id: 'native-8', instance_id: 'npc-8' }] };
  const plan = { speaker_ref: { entity_id: 'player-1' }, speech: { utterance_text: 'Скажи это точно' } };
  const native = { opId: 'speech-op', conversationId: 'conversation-1', exchangeId: 'exchange-1',
    stateVersion: 7, speakerId: 'native-7', utterance: 'Скажи это точно',
    actualHeardListenerIds: ['native-8'], elapsedSeconds: 3,
    beforeTime: { native_turn: 10, seconds_since_world_start: 10 },
    nativeTime: { native_turn: 13, seconds_since_world_start: 13 } };
  const replay = new Map();
  let ownerWrites = 0;
  const conversationOwner = {
    projectAudience(statement, listeners) {
      assert.equal(statement.schema, undefined); // the mock isolates this owner boundary
      assert.equal(listeners[0].perception_result, 'perceived_unidentified');
      assert.equal(listeners[0].comprehension, 'full');
      assert.equal(listeners[0].speaker_recognized, false);
      return { schema: 'conversation_audience_projection_v1',
        statement_ref: { entity_kind: 'conversation_statement', entity_id: 'mock-statement' },
        actual_listener_refs: [{ entity_kind: 'npc', entity_id: 'npc-8' }],
        received_messages: [], witness_candidate_refs: [] };
    },
    applyPlayerPlan(context, working, validatedPlan) {
      ownerWrites++;
      assert.equal(validatedPlan.speech.utterance_text, 'Скажи это точно');
      assert.deepEqual(context.actualNpcActors.map(actor => actor.instance_id), ['npc-8']);
      assert.deepEqual(context.state.clock,
        { whole_minutes: '10', subminute_numerator: '1', subminute_denominator: '20' });
      return { working_state: working, contribution_event: { statement: validatedPlan.speech.utterance_text } };
    },
    projectPlayerStatementAudience(context, working, statement, validatedPlan, audience) {
      return { working_state: { ...working, audiences: [audience] } };
    }
  };
  const first = applyP3NativeSpeech(ownerContext, { statements: [] }, plan, native, replay, conversationOwner);
  const second = applyP3NativeSpeech(ownerContext, { statements: [] }, plan, native, replay, conversationOwner);
  assert.deepEqual(second, first);
  assert.equal(ownerWrites, 1);
  assert.equal(first.contribution_event.statement, 'Скажи это точно');
  assert.deepEqual(first.native_speech.actual_heard_listener_ids, ['native-8']);
  assert.deepEqual(first.native_speech.clock,
    { whole_minutes: '10', subminute_numerator: '1', subminute_denominator: '20' });
});

test('T10 sealed fixture runs existing statement and audience owners with native heard IDs', () => {
  const readback = { operation_id: 'native-op', before: { turn: 10,
    clock: { native_turn: 10, seconds_since_world_start: 600 } },
  after: { clock: { native_turn: 13, seconds_since_world_start: 603 } },
  native_effect: { speakerId: 'player-native', utterance: 'Скажи это точно',
    actualHeardListenerIds: ['npc-native'], elapsedSeconds: 3 } };
  const owner = createP3NativeSpeechOwnerFixture({ observation: { actors: [
    { actor_id: 'player-native' }, { actor_id: 'npc-native' }] }, readback,
  operation: { primitive: 'speak' } });
  const replay = new Map();
  const outcome = applyP3NativeSpeech(owner.ownerContext, owner.working,
    owner.validatedPlan, { opId: 'native-op', conversationId: owner.ownerContext.conversationId,
      exchangeId: owner.ownerContext.exchangeId, stateVersion: 10,
      speakerId: 'player-native', utterance: 'Скажи это точно',
      actualHeardListenerIds: ['npc-native'], elapsedSeconds: 3,
      beforeTime: readback.before.clock, nativeTime: readback.after.clock }, replay);
  const repeated = applyP3NativeSpeech(owner.ownerContext, owner.working,
    owner.validatedPlan, { opId: 'native-op', conversationId: owner.ownerContext.conversationId,
      exchangeId: owner.ownerContext.exchangeId, stateVersion: 10,
      speakerId: 'player-native', utterance: 'Скажи это точно',
      actualHeardListenerIds: ['npc-native'], elapsedSeconds: 3,
      beforeTime: readback.before.clock, nativeTime: readback.after.clock }, replay);
  assert.deepEqual(repeated, outcome);
  assert.equal(replay.size, 1);
  assert.equal(outcome.working_state.statements.length, 1);
  assert.deepEqual(outcome.working_state.audiences[0].actual_listener_refs,
    [{ entity_kind: 'npc', entity_id: 'npc-native' }]);
  assert.equal(outcome.working_state.statements[0].utterance_text, 'Скажи это точно');
  assert.equal(outcome.audience_fixture.kind, 'synthetic_same_language_full_comprehension');
  assert.equal(outcome.audience_fixture.speaker_recognized, false);
});

test('coordinator speech uses refreshed native heard IDs and checks physical snapshots', async () => {
  const before = { turn: 10, clock: { native_turn: 10, seconds_since_world_start: 600 } };
  const after = { turn: 13, clock: { native_turn: 13, seconds_since_world_start: 603 } };
  const readback = { schema: 'p3_native_operation_readback_v1', operation_id: 'native-op',
    status: 'applied', before, after, native_effect: { speakerId: 'player-native',
      utterance: 'Скажи это точно', actualHeardListenerIds: ['npc-native'], elapsedSeconds: 3 } };
  const owner = createP3NativeSpeechOwnerFixture({ observation: { actors: [
    { actor_id: 'player-native' }, { actor_id: 'npc-native' }] }, readback,
  operation: { primitive: 'speak' } });
  assert.equal(owner.validatedPlan.state_version, owner.ownerContext.stateVersion);
  let reads = 0;
  let executions = 0;
  const adapter = { writeOperationRequest() {}, readOperationReadback() {}, async refreshObservation() {
    reads++;
    return reads === 1 ? { revision: 10, native_snapshot: before }
      : { revision: 13, native_snapshot: after };
  }, async execute() { executions++; return readback; } };
  const request = { schema: 'p3_p4_semantic_request_v1', operation_id: 'native-op',
    intent: 'Скажи это точно', observation_revision: 10, listener_ids: ['caller-selected'],
    native_operation: { schema: 'p3_native_operation_request_v1', operation_id: 'native-op',
      primitive: 'speak', expected_native_observation: { revision: 10 } },
    validated_semantic_input: { validated_plan: owner.validatedPlan,
      owner_context: owner.ownerContext, working_state: owner.working } };
  const result = await applyP3CoordinatorSpeech({ nativeAdapter: adapter, request });
  assert.equal(executions, 1);
  assert.equal('conversationId' in readback.native_effect, false);
  assert.equal('exchangeId' in readback.native_effect, false);
  assert.equal('stateVersion' in readback.native_effect, false);
  assert.deepEqual(result.conversation_outcome.working_state.audiences[0].actual_listener_refs,
    [{ entity_kind: 'npc', entity_id: 'npc-native' }]);
  assert.deepEqual(result.after_observation.native_snapshot, after);
});

test('coordinator speech rejects a stale observation before native apply', async () => {
  let executions = 0;
  const adapter = { writeOperationRequest() {}, readOperationReadback() {},
    async refreshObservation() { return { revision: 11, native_snapshot: {} }; },
    async execute() { executions++; throw new Error('must not execute'); } };
  const request = { schema: 'p3_p4_semantic_request_v1', operation_id: 'op', intent: 'speak',
    observation_revision: 10, native_operation: { schema: 'p3_native_operation_request_v1',
      operation_id: 'op', primitive: 'speak', expected_native_observation: { revision: 10 } },
    validated_semantic_input: { owner_context: { conversationId: 'conversation-1',
      exchangeId: 'exchange-1', stateVersion: 10 },
    validated_plan: { conversation_id: 'conversation-1', state_version: 10 }, working_state: {} } };
  await assert.rejects(applyP3CoordinatorSpeech({ nativeAdapter: adapter, request }),
    /P3_COORDINATOR_OBSERVATION_REVISION_MISMATCH/);
  assert.equal(executions, 0);
});

test('coordinator speech rejects canonical conversation or state mismatches before native apply', async () => {
  for (const mismatch of ['conversation', 'state']) {
    let refreshes = 0;
    let executions = 0;
    const adapter = { writeOperationRequest() {}, readOperationReadback() {},
      async refreshObservation() { refreshes++; return { revision: 10, native_snapshot: {} }; },
      async execute() { executions++; throw new Error('must not execute'); } };
    const ownerContext = { conversationId: 'conversation-1', exchangeId: 'exchange-1', stateVersion: 10 };
    const validatedPlan = { conversation_id: 'conversation-1', state_version: 10 };
    if (mismatch === 'conversation') validatedPlan.conversation_id = 'conversation-other';
    else validatedPlan.state_version = 11;
    const request = { schema: 'p3_p4_semantic_request_v1', operation_id: `op-${mismatch}`,
      intent: 'speak', observation_revision: 10,
      native_operation: { schema: 'p3_native_operation_request_v1', operation_id: `op-${mismatch}`,
        primitive: 'speak', expected_native_observation: { revision: 10 } },
      validated_semantic_input: { owner_context: ownerContext, validated_plan: validatedPlan,
        working_state: {} } };
    await assert.rejects(applyP3CoordinatorSpeech({ nativeAdapter: adapter, request }),
      /P3_COORDINATOR_SEMANTIC_IDENTITY_MISMATCH/);
    assert.equal(refreshes, 0);
    assert.equal(executions, 0);
  }
});

test('effective config reports only approved nonsecret fields and rejects token mismatch', () => {
  const settingsOwner = qwenSettingsOwner();
  const env = { DEEPSEEK_API_KEY: 'test-secret', TURN_STEP_PLANNER_HARD_INPUT_LIMIT_TOKENS: '600000' };
  const config = resolveP3EffectiveConfig({ roleId: 'turn_step_planner', env, settingsOwner });
  assert.deepEqual({ provider: config.provider, model: config.model, temperature: config.temperature,
    top_p: config.top_p, max_tokens: config.max_tokens, context_window_tokens: config.context_window_tokens,
    input_limit_tokens: config.input_limit_tokens, timeout_ms: config.timeout_ms,
    api_key_present: config.api_key_present }, { provider: 'openai_compatible', model: 'qwen3.8-27b-uncensored-w4a16-tp2',
    temperature: 0, top_p: 1, max_tokens: 20_000, context_window_tokens: 65_536,
    input_limit_tokens: 45_536, timeout_ms: 120_000, api_key_present: true });
  assert.equal(JSON.stringify(config).includes('test-secret'), false);
  assert.equal(resolveP3EffectiveConfig({ roleId: 'npc_conversation_responder',
    env: { DEEPSEEK_API_KEY: 'test-secret', NPC_CONVERSATION_RESPONDER_MAX_TOKENS: '2000' }, settingsOwner }).max_tokens, 1_000);
  assert.equal(resolveP3EffectiveConfig({ roleId: 'turn_step_planner',
    env: { DEEPSEEK_API_KEY: 'test-secret', TURN_STEP_PLANNER_MODEL: 'other-model' }, settingsOwner }).model,
  'qwen3.8-27b-uncensored-w4a16-tp2');
  for (const [roleId, tokens, inputLimit] of [
    ['turn_step_planner', 20_000, 45_536], ['turn_step_planner_repair', 20_000, 45_536],
    ['npc_autonomous_decider', 20_000, 45_536], ['npc_autonomous_decider_format_repair', 20_000, 45_536],
    ['npc_conversation_responder', 1_000, 64_536],
    ['npc_conversation_responder_format_repair', 1_000, 64_536],
    ['npc_conversation_grounding_auditor', 256, 65_280]
  ]) {
    const effective = resolveP3EffectiveConfig({ roleId, env, settingsOwner });
    assert.equal(effective.max_tokens, tokens, roleId);
    assert.equal(effective.context_window_tokens, 65_536, roleId);
    assert.equal(effective.input_limit_tokens, inputLimit, roleId);
  }
  assert.throws(() => resolveP3EffectiveConfig({ roleId: 'unrecognized_role', env }),
    /P3_ROLE_UNSUPPORTED/);
});

test('P3 role runtime uses existing provider adapter with fixed protocol overrides', async () => {
  let call;
  const executionConfigs = [];
  const settingsOwner = qwenSettingsOwner();
  const runtime = createP3RoleRuntime({ env: {}, settingsOwner,
    execute: async value => {
      call = value;
      executionConfigs.push(resolveLlmExecutionConfig({ scope: value.scope, roleId: value.roleId,
        env: value.env, overrides: value.overrides,
        runtimeProviderOverride: value.runtimeProviderOverride }).config);
      return { status: 'ok', parsed_json: { ok: true },
      provider: 'openai_compatible', model: 'qwen3.8-27b-uncensored-w4a16-tp2', scope: value.scope,
      role_id: value.roleId, durationMs: 1 }; } });
  const result = await runtime.roleRunner.run({ scope: 'turn_runtime',
    role_id: 'npc_conversation_responder_format_repair', messages: [],
    overrides: { maxTokens: 20_000, temperature: 0.8, topP: 0.5 } });
  assert.deepEqual(result.output, { ok: true });
  assert.equal(call.runtimeProviderOverride.model, 'qwen3.8-27b-uncensored-w4a16-tp2');
  assert.equal(call.runtimeProviderOverride.compatibility, 'openai_compatible');
  assert.equal(runtime.budget.calls, 1);
  assert.deepEqual({ temperature: call.overrides.temperature, topP: call.overrides.topP,
    maxTokens: call.overrides.maxTokens, requestTimeoutMs: call.overrides.requestTimeoutMs },
  { temperature: 0, topP: 1, maxTokens: 1_000, requestTimeoutMs: 120_000 });
  await runtime.roleRunner.run({ scope: 'turn_runtime', role_id: 'turn_step_planner', messages: [] });
  await runtime.roleRunner.run({ scope: 'turn_runtime',
    role_id: 'npc_conversation_grounding_auditor', messages: [] });
  assert.deepEqual(executionConfigs.map(({ contextBudget }) => contextBudget.hardInputLimitTokens),
    [64_536, 45_536, 65_280]);
});

test('P3 settings loader requires explicit file and private Qwen endpoint without applying settings', async () => {
  await assert.rejects(loadP3QwenSettingsOwner({ env: {} }), /P3_LLM_SETTINGS_PATH_REQUIRED/);
  const temp = await mkdtemp(path.join(os.tmpdir(), 'p3-settings-'));
  const file = path.join(temp, 'settings.json');
  const record = { version: 2, settings: { mode: 'custom', compatibility: 'openai_compatible',
    base_url: 'http://10.11.12.13:11437/v1', model: 'qwen3.8-27b-uncensored-w4a16-tp2',
    api_key: 'private-test-key' }, ordinary_materialization_identity: null, qualification_version: null };
  await writeFile(file, JSON.stringify(record));
  const settingsOwner = await loadP3QwenSettingsOwner({ env: { RUS_LLM_SETTINGS_PATH: file } });
  assert.equal(settingsOwner.providerSnapshot().model, record.settings.model);
  assert.equal(settingsOwner.providerSnapshot().baseUrl, record.settings.base_url);
  await assert.rejects(loadP3QwenSettingsOwner({ env: {} }), /P3_LLM_SETTINGS_PATH_REQUIRED/);
  await writeFile(file, JSON.stringify({ ...record, settings: { ...record.settings,
    base_url: 'https://api.example.com/v1' } }));
  await assert.rejects(loadP3QwenSettingsOwner({ env: { RUS_LLM_SETTINGS_PATH: file } }),
    /P3_QWEN_SETTINGS_REQUIRED/);
  await rm(temp, { recursive: true, force: true });
});

test('immutable operation handoff refuses overwrite; evidence run refuses restart and redacts secrets', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'p3-boundary-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const userDir = path.join(root, 'userdir');
  const request = createP3OperationEnvelope({ observation, actorRef: 'actor', primitive: 'move',
    registeredPrimitives: ['move'], args: {}, operationId: 'stable-op' });
  const file = await writeP3OperationRequest(userDir, request);
  const content = await readFile(file, 'utf8');
  assert.equal(JSON.parse(content).operation_id, 'stable-op');
  await assert.rejects(writeP3OperationRequest(userDir, request), { code: 'EEXIST' });
  const evidence = await createP3EvidenceRun(path.join(root, 'evidence'), { operationId: 'stable-op' });
  await evidence.record({ status: 'failed', input: { text: 'go' }, output: { text: 'Bearer abcdefgh123456' },
    error: { message: 'api_key=never-show' } });
  const log = await readFile(path.join(evidence.directory, 'run.jsonl'), 'utf8');
  assert.equal(log.includes('abcdefgh123456'), false);
  assert.equal(log.includes('never-show'), false);
  await assert.rejects(createP3EvidenceRun(path.join(root, 'evidence'), { operationId: 'stable-op' }),
    { code: 'EEXIST' });
});

test('evidence sanitizer removes secret-shaped fields and values', () => {
  assert.deepEqual(sanitizeP3Evidence({ apiKey: 'secret', reply: 'Authorization: Bearer abcdefgh123456' }),
    { apiKey: '[REDACTED]', reply: '[REDACTED]' });
  assert.deepEqual(sanitizeP3Evidence({ max_tokens: 20_000, usage: { input_tokens: 50,
    output_tokens: 12, total_tokens: 62 } }), { max_tokens: 20_000,
    usage: { input_tokens: 50, output_tokens: 12, total_tokens: 62 } });
});

const ref = (kind, id) => ({ entity_kind: kind, entity_id: id });

const zhirkoProfile = {
  template_id: 'zhirko',
  npc_snapshot: {
    profile_level: 'key', role_ref: { id: 'reeve' },
    temperament: [{ temperament_ref: 'calm', summary: 'сдержан', state: 'stable', intensity: 'low' }],
    values: [{ value_ref: 'honour', summary: 'держит слово', state: 'held', intensity: 'high' }],
    goals: [{ goal_ref: 'harvest', summary: 'собрать урожай', state: 'active', priority: 'high' }],
    fears: [{ fear_ref: 'raid', summary: 'набег', state: 'latent', intensity: 'medium' }]
  },
  knowledge_snapshot: {
    known_facts: [{ fact_ref: ref('known_fact', 'zhirko-fact'), source_event_ref: null,
      resource_ref: null, process_ref: null, summary: 'Двор стоит у реки.', state: 'known',
      confidence: 'high' }],
    beliefs: [{ belief_ref: ref('belief', 'zhirko-belief'), source_event_ref: null,
      summary: 'Сосед честен.', state: 'held', confidence: 'medium' }]
  }
};

async function withProfilesDir(run, { profile = zhirkoProfile } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'p3-profiles-'));
  try {
    if (profile) await writeFile(path.join(dir, `${profile.template_id}.json`),
      JSON.stringify(profile));
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function replyHarness({ frame, plan = speechPlan, nativeReadback, profilesDir }) {
  const state = { requests: [], envelopes: [] };
  const nativeAdapter = {
    refreshObservation: async () => structuredClone(frame),
    execute: async envelope => {
      state.envelopes.push(structuredClone(envelope));
      return nativeReadback(envelope);
    }
  };
  const semanticModel = async request => {
    state.requests.push(structuredClone(request));
    return plan(request);
  };
  state.run = (utterance = 'Здравствуй.', extra = {}) => runP3NativeNpcReply({
    nativeAdapter, observation: frame,
    playerReadback: playerSpeechReadback({ utterance }), semanticModel,
    targetActorRef: 'npc:9', profilesDir, ...extra });
  return state;
}

const npcSpeechReadback = envelope => ({ schema: 'p3_native_operation_readback_v1',
  operation_id: envelope.operation_id, status: 'applied',
  native_effect: { effect_status: 'confirmed', primitive: 'speak', actor_id: '9',
    speakerId: '9', contribution_kind: 'speech', utterance: envelope.args.utterance,
    actualHeardListenerIds: ['7'] },
  before: { turn: 10 }, after: { turn: 10 } });

const npcSilenceReadback = envelope => ({ schema: 'p3_native_operation_readback_v1',
  operation_id: envelope.operation_id, status: 'applied',
  native_effect: { effect_status: 'confirmed', primitive: 'speak', actor_id: '9',
    speakerId: '9', contribution_kind: 'silence',
    visible_behavior: envelope.args.visible_behavior, actualHeardListenerIds: [] },
  before: { turn: 10 }, after: { turn: 10 } });

const withEffect = (readback, changes) => envelope => {
  const base = readback(envelope);
  return { ...base, native_effect: { ...base.native_effect, ...changes } };
};

test('profile loader returns null for a missing file and a typed error for broken input', async () => {
  await withProfilesDir(async dir => {
    assert.deepEqual(await loadP3NpcProfile('zhirko', { profilesDir: dir }), zhirkoProfile);
    assert.equal(await loadP3NpcProfile('absent', { profilesDir: dir }), null);
    await writeFile(path.join(dir, 'broken.json'), '{not json');
    await writeFile(path.join(dir, 'other.json'), JSON.stringify({ template_id: 'zhirko' }));
    await writeFile(path.join(dir, 'array.json'), '[]');
    for (const id of ['broken', 'other', 'array', '../zhirko', 'Zhirko', '', 'a/b', 'a.b']) {
      await assert.rejects(loadP3NpcProfile(id, { profilesDir: dir }),
        { code: 'P3_NPC_PROFILE_INVALID' }, id);
    }
    await assert.rejects(loadP3NpcProfile(undefined, { profilesDir: dir }),
      { code: 'P3_NPC_PROFILE_INVALID' });
  });
});

test('NPC reply request passes the strict conversation validators and takes the profile', async () => {
  await withProfilesDir(async profilesDir => {
    const frame = replyFrame({ projections: [npcProjection('9', {
      visible_items: [visibleItem(33), visibleItem(34, { owner_faction_id: 'other' })] })] });
    const harness = replyHarness({ frame, nativeReadback: npcSpeechReadback, profilesDir });
    const result = await harness.run();
    assert.equal(result.native_readback.status, 'applied');
    const [request] = harness.requests;
    assert.equal(validateNpcConversationResponseRequest(request), true);
    assert.equal(validateNpcConversationResponseSubject(request), true);
    assert.equal(request.npc.temperament[0].temperament_ref, 'calm');
    assert.equal(request.npc.values[0].value_ref, 'honour');
    assert.equal(request.npc.goals[0].goal_ref, 'harvest');
    assert.equal(request.npc.fears[0].fear_ref, 'raid');
    assert.equal(request.npc.identity.name_or_label, 'Жирко');
    assert.equal(request.knowledge.known_facts.some(({ summary }) =>
      summary === 'Двор стоит у реки.'), true);
    assert.equal(request.knowledge.beliefs[0].summary, 'Сосед честен.');
    const ownership = request.knowledge.known_facts.filter(({ fact_ref: factRef }) =>
      factRef.entity_id.startsWith('p3-owns-'));
    assert.deepEqual(ownership.map(({ fact_ref: factRef }) => factRef.entity_id), ['p3-owns-33']);
    assert.equal(request.knowledge.known_facts.some(({ fact_ref: factRef }) =>
      factRef.entity_id === 'p3-own-gender-9'), true);
    assert.equal(request.npc.available_resources.length, 2);
    assert.deepEqual(request.available_resources, request.npc.available_resources);
    assert.deepEqual(request.allowed_references.entity_refs,
      [ref('item', '33'), ref('item', '34')]);
  });
});

test('committed dev-world master profile loads from the default directory into a valid reply request', async () => {
  const profile = JSON.parse(await readFile(fileURLToPath(new URL('./npc-profiles/novgorod_dev_master.json', import.meta.url)), 'utf8'));
  assert.deepEqual(await loadP3NpcProfile('novgorod_dev_master'), profile);
  const frame = replyFrame({ projections: [npcProjection('9', { template_id: 'novgorod_dev_master' })] });
  const harness = replyHarness({ frame, nativeReadback: npcSpeechReadback });
  const result = await harness.run();
  assert.equal(result.native_readback.status, 'applied');
  assert.equal(harness.requests.length, 1);
  const [request] = harness.requests;
  assert.equal(validateNpcConversationResponseRequest(request), true);
  assert.equal(validateNpcConversationResponseSubject(request), true);
  for (const [field, refKey] of [['temperament', 'temperament_ref'], ['values', 'value_ref'],
    ['goals', 'goal_ref'], ['fears', 'fear_ref']]) {
    assert.deepEqual(request.npc[field].map(item => item[refKey]),
      profile.npc_snapshot[field].map(item => item[refKey]));
    assert.deepEqual(request.npc[field].map(({ summary }) => summary),
      profile.npc_snapshot[field].map(({ summary }) => summary));
  }
  const requestFactIds = request.knowledge.known_facts.map(({ fact_ref: factRef }) => factRef.entity_id);
  for (const { fact_ref: factRef } of profile.knowledge_snapshot.known_facts) {
    assert.ok(requestFactIds.includes(factRef.entity_id));
  }
  assert.deepEqual(request.knowledge.beliefs.map(({ summary }) => summary),
    profile.knowledge_snapshot.beliefs.map(({ summary }) => summary));
});

test('NPC without a profile gets an empty personality and still its items and memory', async () => {
  await withProfilesDir(async profilesDir => {
    const frame = replyFrame({ projections: [npcProjection('9', { template_id: 'unknown_npc',
      visible_items: [visibleItem(33)], conversation_memory: [heardRecord('Привет.', 8),
        saidRecord('Здравствуй.', 8)] })] });
    const harness = replyHarness({ frame, nativeReadback: npcSpeechReadback, profilesDir });
    await harness.run('Как жизнь?');
    const [request] = harness.requests;
    assert.equal(validateNpcConversationResponseSubject(request), true);
    assert.deepEqual([request.npc.temperament, request.npc.values, request.npc.goals,
      request.npc.fears], [[], [], [], []]);
    assert.equal(request.npc.available_resources.length, 1);
    assert.equal(request.memory.recent_events.length, 2);
    assert.deepEqual(request.public_conversation_history.map(({ utterance_text: text }) => text),
      ['Привет.', 'Здравствуй.', 'Как жизнь?']);
  });
});

test('two phrases of one pair share conversation_id and the current phrase is not repeated', async () => {
  await withProfilesDir(async profilesDir => {
    const first = replyHarness({ frame: replyFrame({ turn: 10, projections: [npcProjection('9', {
      conversation_memory: [heardRecord('Здравствуй.', 10)] })] }),
    nativeReadback: npcSpeechReadback, profilesDir });
    await first.run('Здравствуй.');
    const second = replyHarness({ frame: replyFrame({ turn: 12, projections: [npcProjection('9', {
      conversation_memory: [heardRecord('Здравствуй.', 10), saidRecord('Слышу тебя.', 10),
        heardRecord('Как дела?', 12)] })] }), nativeReadback: npcSpeechReadback, profilesDir });
    await second.run('Как дела?', { playerReadback: playerSpeechReadback({
      utterance: 'Как дела?', operationId: 'op-2', turn: 12 }) });
    assert.equal(first.requests[0].conversation_id, 'p3-conversation-npc9-pc7');
    assert.equal(second.requests[0].conversation_id, first.requests[0].conversation_id);
    assert.deepEqual(first.requests[0].public_conversation_history.map(
      ({ utterance_text: text }) => text), ['Здравствуй.']);
    assert.deepEqual(second.requests[0].public_conversation_history.map(
      ({ utterance_text: text }) => text), ['Здравствуй.', 'Слышу тебя.', 'Как дела?']);
  });
});

test('the current phrase heard between the readback turns is removed once and an earlier same phrase stays', async () => {
  await withProfilesDir(async profilesDir => {
    const readback = { ...playerSpeechReadback({ utterance: 'Здравствуй.', turn: 12 }),
      before: { turn: 9 } };
    const history = request => request.public_conversation_history.map(
      ({ utterance_text: text }) => text);
    const first = replyHarness({ frame: replyFrame({ turn: 12, projections: [npcProjection('9', {
      conversation_memory: [heardRecord('Здравствуй.', 10)] })] }),
    nativeReadback: npcSpeechReadback, profilesDir });
    await first.run('Здравствуй.', { playerReadback: readback });
    const [meeting] = first.requests;
    assert.deepEqual(history(meeting), ['Здравствуй.']);
    assert.deepEqual(meeting.memory.recent_events, []);
    assert.deepEqual([meeting.npc.relationships[0].status, meeting.npc.relationships[0].relation],
      ['first_meeting', 'незнакомый человек']);
    const second = replyHarness({ frame: replyFrame({ turn: 12, projections: [npcProjection('9', {
      conversation_memory: [heardRecord('Здравствуй.', 5), saidRecord('Слышу тебя.', 6),
        heardRecord('Здравствуй.', 11)] })] }), nativeReadback: npcSpeechReadback, profilesDir });
    await second.run('Здравствуй.', { playerReadback: readback });
    const [again] = second.requests;
    assert.deepEqual(history(again), ['Здравствуй.', 'Слышу тебя.', 'Здравствуй.']);
    assert.equal(again.memory.recent_events.length, 2);
    assert.equal(again.npc.relationships[0].status, 'acquainted');
  });
});

test('a witness of another conversation meets the player as a stranger', async () => {
  await withProfilesDir(async profilesDir => {
    const frame = replyFrame({ turn: 12, projections: [npcProjection('9', {
      conversation_memory: [heardRecord('Здравствуй, мастер.', 5, '8'),
        heardRecord('Как жизнь?', 11)] })] });
    const harness = replyHarness({ frame, nativeReadback: npcSpeechReadback, profilesDir });
    const readback = { ...playerSpeechReadback({ utterance: 'Как жизнь?', turn: 12 }),
      before: { turn: 9 } };
    await harness.run('Как жизнь?', { playerReadback: readback });
    const [request] = harness.requests;
    assert.deepEqual([request.npc.relationships[0].status, request.npc.relationships[0].relation],
      ['first_meeting', 'незнакомый человек']);
    assert.match(request.memory.current_observations.at(-1).fact_text,
      /Говорящий: незнакомый человек/u);
    assert.equal(request.memory.recent_events.some(({ summary }) =>
      summary.startsWith('Чужая реплика')), true);
  });
});

test('a witness of another NPC speaking to the player is still a stranger', async () => {
  await withProfilesDir(async profilesDir => {
    const frame = replyFrame({ projections: [npcProjection('9', { conversation_memory: [{
      kind: 'heard', speaker_ref: 'npc:8', listener_ref: 'avatar',
      text: 'Проходи.', turn: 5 }] })] });
    const harness = replyHarness({ frame, nativeReadback: npcSpeechReadback, profilesDir });
    await harness.run('Как жизнь?');
    assert.equal(harness.requests[0].npc.relationships[0].status, 'first_meeting');
  });
});

test('a direct heard, said, or silent exchange establishes acquaintance', async () => {
  await withProfilesDir(async profilesDir => {
    for (const record of [saidRecord('Слышу тебя.', 6), silenceRecord(6),
      heardRecord('Здравствуй.', 5)]) {
      const frame = replyFrame({ projections: [npcProjection('9', {
        conversation_memory: [record] })] });
      const harness = replyHarness({ frame, nativeReadback: npcSpeechReadback, profilesDir });
      await harness.run('Как жизнь?');
      assert.equal(harness.requests[0].npc.relationships[0].status, 'acquainted', record.kind);
    }
  });
});

test('the native null activity reaches the NPC as idle and a real activity as in progress', async () => {
  await withProfilesDir(async profilesDir => {
    const activity = async activityId => {
      const harness = replyHarness({ frame: replyFrame({ projections: [npcProjection('9', {
        activity_id: activityId })] }), nativeReadback: npcSpeechReadback, profilesDir });
      await harness.run();
      return harness.requests[0].npc.current_activity;
    };
    assert.deepEqual(await activity('ACT_NULL'), { activity_ref: null, summary: null,
      status: 'idle', can_continue_automatically: false });
    assert.deepEqual(await activity('ACT_WAIT'), { activity_ref: 'ACT_WAIT', summary: null,
      status: 'in_progress', can_continue_automatically: false });
  });
});

test('speech plan sends the utterance with the avatar addressee and checks the readback', async () => {
  await withProfilesDir(async profilesDir => {
    const harness = replyHarness({ frame: replyFrame(), nativeReadback: npcSpeechReadback,
      profilesDir });
    await harness.run();
    const [envelope] = harness.envelopes;
    assert.equal(envelope.primitive, 'speak');
    assert.deepEqual(envelope.args, { utterance: 'Слышу тебя.' });
    assert.deepEqual(envelope.references.actors, [{ ref: 'avatar', id: '7' }]);
    for (const changes of [{ speakerId: '7' }, { utterance: 'Иное.' },
      { contribution_kind: 'silence' }]) {
      const wrong = replyHarness({ frame: replyFrame(), profilesDir,
        nativeReadback: withEffect(npcSpeechReadback, changes) });
      await assert.rejects(wrong.run(), /P3_NATIVE_SPEECH_READBACK_MISMATCH/);
    }
  });
});

test('silent plan sends speak with silence and the visible behavior, never a reason', async () => {
  await withProfilesDir(async profilesDir => {
    const harness = replyHarness({ frame: replyFrame(), plan: silencePlan,
      nativeReadback: npcSilenceReadback, profilesDir });
    const result = await harness.run();
    assert.equal(result.native_readback.status, 'applied');
    const [envelope] = harness.envelopes;
    assert.equal(envelope.primitive, 'speak');
    assert.deepEqual(envelope.args, { contribution_kind: 'silence',
      visible_behavior: 'Молча отводит взгляд.' });
    assert.deepEqual(envelope.references.actors, [{ ref: 'avatar', id: '7' }]);
    for (const changes of [{ visible_behavior: 'Иное.' }, { contribution_kind: 'speech' },
      { speakerId: '7' }]) {
      const wrong = replyHarness({ frame: replyFrame(), plan: silencePlan, profilesDir,
        nativeReadback: withEffect(npcSilenceReadback, changes) });
      await assert.rejects(wrong.run(), /P3_NATIVE_SPEECH_READBACK_MISMATCH/);
    }
  });
});

test('a missing projection and malformed memory are typed errors, never dropped', async () => {
  await withProfilesDir(async profilesDir => {
    const noProjection = replyHarness({ frame: { ...replyFrame(), npc_projections: [] },
      nativeReadback: npcSpeechReadback, profilesDir });
    await assert.rejects(noProjection.run(), { code: 'P3_NPC_PROJECTION_MISSING' });
    for (const bad of [
      { ...heardRecord('Привет.'), speaker_ref: 'player' },
      { ...heardRecord('Привет.'), listener_ref: 'npc:x' },
      { ...heardRecord('Привет.'), text: '   ' },
      { ...heardRecord('Привет.'), turn: -1 },
      { ...heardRecord('Привет.'), extra: 1 }
    ]) {
      const harness = replyHarness({ frame: replyFrame({ projections: [npcProjection('9', {
        conversation_memory: [bad] })] }), nativeReadback: npcSpeechReadback, profilesDir });
      await assert.rejects(harness.run('Иное.'), { code: 'P3_NPC_MEMORY_RECORD_INVALID' });
      assert.equal(harness.requests.length, 0);
    }
  });
});

test('silence records stay in memory events but not in the public history', async () => {
  await withProfilesDir(async profilesDir => {
    const harness = replyHarness({ frame: replyFrame({ projections: [npcProjection('9', {
      conversation_memory: [heardRecord('Эй.', 6), silenceRecord(6)] })] }),
    nativeReadback: npcSpeechReadback, profilesDir });
    await harness.run('Ну?');
    const [request] = harness.requests;
    assert.equal(request.memory.recent_events.length, 2);
    assert.deepEqual(request.public_conversation_history.map(({ utterance_text: text }) => text),
      ['Эй.', 'Ну?']);
  });
});

test('live observation validation types the NPC fields of the frame', () => {
  const good = replyFrame({ projections: [npcProjection('9', {
    visible_items: [visibleItem(33)], conversation_memory: [heardRecord('Привет.')] })] });
  assert.deepEqual(requireLiveObservation(good), good);
  for (const change of [
    frame => { delete frame.actors[1].name; },
    frame => { frame.actors[1].name = 5; },
    frame => { frame.actors[1].name = '  '; },
    frame => { frame.npc_projections[0].name = '  '; },
    frame => { frame.npc_projections[0].name = null; },
    frame => { delete frame.npc_projections[0].template_id; },
    frame => { frame.npc_projections[0].gender = 'other'; },
    frame => { frame.npc_projections[0].personality.bravery = 1.5; },
    frame => { delete frame.npc_projections[0].personality.altruism; },
    frame => { frame.npc_projections[0].faction_id = 3; },
    frame => { frame.npc_projections[0].opinion_of_avatar.trust = '1'; },
    frame => { frame.npc_projections[0].opinion_of_avatar = null; },
    frame => { frame.npc_projections[0].conversation_memory = {}; },
    frame => { frame.npc_projections[0].conversation_memory = ['x']; },
    frame => { frame.npc_projections[0].visible_items = null; },
    frame => { delete frame.npc_projections[0].visible_items[0].label; },
    frame => { frame.npc_projections[0].visible_items[0].placement = 'floor'; },
    frame => { frame.npc_projections[0].visible_items[0].owner_faction_id = null; }
  ]) {
    const frame = structuredClone(good);
    change(frame);
    assert.throws(() => requireLiveObservation(frame), /P3_LIVE_OBSERVATION_INVALID/);
  }
});

test('planner request names the selected interlocutor and offers speech only with a target', async () => {
  const current = replyFrame({ turn: 3 });
  const capture = async (frame, targetActorRef) => {
    const seen = [];
    await assert.rejects(runP3TurnStep({ intent: 'Скажи привет', observation: frame,
      nativeAdapter: { writeOperationRequest: async () => { throw new Error('unused'); },
        readOperationReadback: async () => { throw new Error('unused'); } },
      operationId: 'planner-1', nativeSpeechOnly: true, targetActorRef,
      turnStepModel: async request => { seen.push(request); throw new Error('stop'); } }));
    return seen[0];
  };
  const targeted = await capture(current, 'npc:9');
  assert.deepEqual(targeted.player_safe_state.active_interlocutor,
    { entity_ref: { entity_kind: 'npc', entity_id: 'npc:9' }, display_label: 'Жирко' });
  const speech = targeted.available_domain_operations.filter(({ op }) => op === 'emit_interaction');
  assert.deepEqual(speech, [{ op: 'emit_interaction', actor_ref: 'avatar',
    target_actor_refs: ['npc:9'], interaction_kind: 'speech', content: 'Скажи привет',
    instrument_refs: [] }]);
  assert.equal(targeted.available_domain_operations.at(-1).op, 'emit_interaction');
  const plain = await capture(current, null);
  assert.equal('active_interlocutor' in plain.player_safe_state, false);
  assert.equal(plain.available_domain_operations.some(({ op }) => op === 'emit_interaction'), false);
  assert.equal(buildP3TurnOperations(current, 'npc:9', 'Привет')
    .some(({ op }) => op === 'emit_interaction'), true);
});

test('planner sees the native items first, in frame order, with their use methods and no native type',
  async () => {
    const current = { ...replyFrame({ turn: 3 }), items: [
      { item_ref: 'item:21', item_uid: '21', type: 'flint_steel', label: 'кресало',
        placement: 'held', holder: '7', use_methods: ['firestarter'] },
      { item_ref: 'item:22', item_uid: '22', type: 'leather_belt', label: 'кожаный пояс',
        placement: 'held', holder: '7', use_methods: ['holster'] },
      { item_ref: 'item:23', item_uid: '23', type: 'ax', label: 'плотницкий топор',
        placement: 'held', holder: '7', use_methods: ['activate', 'chop'] }] };
    const seen = [];
    await assert.rejects(runP3TurnStep({ intent: 'Осмотрись', observation: current,
      nativeAdapter: { writeOperationRequest: async () => { throw new Error('unused'); },
        readOperationReadback: async () => { throw new Error('unused'); } },
      operationId: 'planner-items', nativeSpeechOnly: true, targetActorRef: null,
      turnStepModel: async request => { seen.push(request); throw new Error('stop'); } }));
    assert.deepEqual(seen[0].player_safe_state.visible_entities.slice(0, 3), [
      { item_ref: 'item:21', item_uid: '21', label: 'кресало', placement: 'held', holder: '7',
        use_methods: ['firestarter'], entity_ref: '21' },
      { item_ref: 'item:22', item_uid: '22', label: 'кожаный пояс', placement: 'held', holder: '7',
        use_methods: ['holster'], entity_ref: '22' },
      { item_ref: 'item:23', item_uid: '23', label: 'плотницкий топор', placement: 'held', holder: '7',
        use_methods: ['activate', 'chop'], entity_ref: '23' }]);
  });

function chosenOperationOutput(request, selected) {
  return { interpretation: { player_goal: request.remaining_intent,
    grounded_attempt: request.remaining_intent, adaptation: 'literal' },
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    direct_result_kind: null, operation_family: selected.operation.op,
    operation_choice: selected.choice_id, operations: [], check: null,
    continuation: null, clarification: null, reason_code: 'offered_operation',
    reason: 'Choose the offered operation.' };
}

test('production speech choice speaks the player words to the selected interlocutor', async () => {
  for (const [intent, words] of [
    ['Здравствуй, Жирко. Чей это двор?', 'Здравствуй, Жирко. Чей это двор?'],
    ['Скажи ему: «Приходи до рассвета!»', 'Приходи до рассвета!']
  ]) {
    let providerCalls = 0;
    let captured;
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: { async run(call) {
      providerCalls++;
      const request = JSON.parse(call.messages[1].content);
      const selected = turnStepOperationChoices(request)
        .find(({ operation }) => operation.op === 'emit_interaction');
      assert.ok(selected);
      return { output: chosenOperationOutput(request, selected) };
    } } });
    const result = await runP3TurnStep({ intent, observation: replyFrame({ turn: 3 }),
      operationId: 'production-speech-choice', nativeSpeechOnly: true, targetActorRef: 'npc:9',
      nativeAdapter: { writeOperationRequest: async () => {}, readOperationReadback: async () => ({}),
        async execute(envelope) {
          captured = envelope;
          return { schema: 'p3_native_operation_readback_v1', operation_id: envelope.operation_id,
            status: 'applied', goal_result: 'achieved', before: { turn: 3 }, after: { turn: 3 },
            native_effect: { effect_status: 'confirmed', speakerId: '7',
              utterance: envelope.args.utterance, actualHeardListenerIds: ['9'] } };
        } },
      turnStepModel: model });
    assert.equal(providerCalls, 1);
    assert.equal(captured.primitive, 'speak');
    assert.equal(captured.args.utterance, words);
    assert.deepEqual(captured.references.actors.map(({ ref }) => ref), ['npc:9']);
    assert.equal(result.working_projection.native_readback.status, 'applied');
  }
});

test('every offered P3 domain operation passes production plan validation when chosen', async () => {
  const current = { schema: 'p3_native_observation_v1', turn: 3, revision: 3,
    actors: [{ actor_ref: 'avatar', actor_id: '7', position: [60, 60, 0] },
      { actor_ref: 'npc:8', actor_id: '8', position: [61, 61, 0], visible: true, name: 'Жирко' }],
    items: [{ item_ref: 'item:9', item_uid: '9', type: 'rock', holder: '7', use_methods: ['activate'] }],
    targets: [{ target_ref: 'tile:east', position: [61, 60, 0], openable: true }] };
  let request;
  await assert.rejects(runP3TurnStep({ intent: 'Сделай что-нибудь', observation: current,
    nativeAdapter: { writeOperationRequest: async () => {}, readOperationReadback: async () => ({}) },
    operationId: 'offered-operations', nativeSpeechOnly: true, targetActorRef: 'npc:8',
    turnStepModel: async seen => { request = seen; throw new Error('stop'); } }), /stop/);
  const choices = turnStepOperationChoices(request);
  assert.equal(choices.length, request.available_domain_operations.length);
  assert.deepEqual([...new Set(choices.map(({ operation }) => operation.op))].sort(),
    ['emit_interaction', 'request_activity', 'request_container_access', 'request_item_use',
      'request_movement']);
  for (const selected of choices) {
    let calls = 0;
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: { async run() {
      calls++;
      return { output: chosenOperationOutput(request, selected) };
    } } });
    const result = await requestTurnStepPlanWithRepair({ request, turnStepModel: model })
      .catch(error => assert.fail(`${selected.choice_id}: ${error.message}`));
    assert.equal(calls, 1, selected.choice_id);
    assert.equal(result.repaired, false, selected.choice_id);
    assert.deepEqual(result.plan.operations, [selected.operation], selected.choice_id);
  }
});

const prototypeRoot = path.dirname(fileURLToPath(import.meta.url));

async function listFiles(dir, skip = new Set(['node_modules', 'runtime'])) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skip.has(entry.name)) found.push(...await listFiles(full, skip));
    } else found.push(full);
  }
  return found;
}

test('no NPC profile file ships inside the dev world folder', async () => {
  const files = await listFiles(path.join(prototypeRoot, 'dev-world'));
  assert.deepEqual(files.filter(file => /profile/iu.test(path.basename(file))
    && file.endsWith('.json')), []);
});

test('no prototype test file contains a private LAN address', async () => {
  const lan = /\b(?:10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b/u;
  const tests = (await listFiles(prototypeRoot)).filter(file =>
    /(?:\.test\.js|[\\/]test_[^\\/]*\.(?:py|ps1))$/u.test(file));
  assert.equal(tests.length > 0, true);
  const allowed = { address: '10.11.12.13', file: 'p3-boundary.test.js' };
  const offenders = [];
  for (const file of tests) {
    const found = (await readFile(file, 'utf8')).match(new RegExp(lan.source, 'gu')) ?? [];
    for (const address of found) {
      if (address !== allowed.address || path.basename(file) !== allowed.file) {
        offenders.push(`${path.basename(file)} ${address}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

const wirePlayer = { entity_kind: 'player_character', entity_id: '7' };
const wireSpeechOutput = { contribution_kind: 'speech', primary_addressee_ref: wirePlayer,
  intended_addressee_refs: [wirePlayer], affected_actor_refs: [],
  speech: { utterance_text: 'Слышу тебя.', dominant_act: 'answer', interaction_tags: [],
    topic_refs: [], claims: [], response_expectation: { kind: 'none', target_refs: [] } },
  interpretation: { intent: 'ответить', grounded_contribution: 'Я слышу.', adaptation: 'literal' },
  resolution: 'automatic', activity: { duration_class: 'brief', effort: 'none' },
  supporting_operations: [], check: null, handoff: null, reason: 'Ответ.' };
const wireStop = () => { throw new Error('captured'); };
const toRepair = ({ roleId }) => roleId === 'npc_conversation_responder'
  ? { contribution_kind: 'speech' } : wireStop();
const toAudit = ({ roleId }) => roleId === 'npc_conversation_responder'
  ? wireSpeechOutput : wireStop();
const WIRE_SERVICE_KEYS = ['request_id', 'boundary_id', 'conversation_id', 'exchange_id',
  'state_version', 'requested_at', 'signal_refs', 'template_ref'];

// Each call is replayed through the shared model without a wire projection, so the test compares
// against the exact pre-projection user message of the same request.
async function captureNpcWire(respond, projectionOverrides = {}) {
  const sent = [];
  const unprojected = [];
  const requests = [];
  const runtime = createP3RoleRuntime({ env: {}, settingsOwner: qwenSettingsOwner(),
    execute: async value => {
      sent.push({ roleId: value.roleId, messages: structuredClone(value.messages) });
      return { status: 'ok', parsed_json: await respond(value),
        provider: 'openai_compatible', model: 'qwen3.8-27b-uncensored-w4a16-tp2',
        scope: value.scope, role_id: value.roleId, durationMs: 1 };
    } });
  const identity = createLowerDvinaTraceNpcSemanticModel({ roleRunner: { run: async value => {
    unprojected.push({ roleId: value.role_id, messages: structuredClone(value.messages) });
    return { output: await respond({ roleId: value.role_id }) };
  } } });
  const projected = runtime.npcConversationModel;
  const semanticModel = Object.assign(async (request, context) => {
    requests.push(structuredClone(request));
    await identity(request, context).catch(() => {});
    return projected(request, context);
  }, { originalOutputOf: projected.originalOutputOf,
    validateFreshPlan: async (plan, request) => {
      await identity.validateFreshPlan(plan, request).catch(() => {});
      return projected.validateFreshPlan(plan, request);
    } });
  const frame = replyFrame({ projections: [npcProjection('9', { template_id: '',
    visible_items: [visibleItem(31)], ...projectionOverrides })] });
  await runP3NativeNpcReply({ nativeAdapter: { refreshObservation: async () => structuredClone(frame) },
    observation: frame, playerReadback: playerSpeechReadback({ utterance: 'Здравствуй.', turn: 10 }),
    semanticModel, targetActorRef: 'npc:9', maxRepairAttempts: 2 }).catch(() => {});
  const message = (call, role) => call.messages.find(entry => entry.role === role).content;
  assert.equal(sent.length, unprojected.length);
  return { requests, calls: sent.map((call, index) => {
    assert.equal(call.roleId, unprojected[index].roleId);
    assert.equal(message(call, 'system'), message(unprojected[index], 'system'));
    return { roleId: call.roleId, system: message(call, 'system'),
      before: JSON.parse(message(unprojected[index], 'user')),
      after: JSON.parse(message(call, 'user')) };
  }) };
}

function lostNamedKeys(before, after, named, path = '') {
  if (Array.isArray(before)) {
    return before.flatMap((entry, index) => lostNamedKeys(entry, after?.[index], named,
      `${path}[${index}]`));
  }
  if (before === null || typeof before !== 'object') return [];
  return Object.entries(before).flatMap(([key, value]) => {
    // The frozen acceptance contract forbids service keys and a second copy of the resources.
    if (WIRE_SERVICE_KEYS.includes(key) || value === null
        || (key === 'available_resources' && path.endsWith('.npc'))) return [];
    if (!Object.hasOwn(after ?? {}, key)) return named.has(key) ? [`${path}.${key}`] : [];
    return lostNamedKeys(value, after[key], named, `${path}.${key}`);
  });
}

function namedEmptyKeys(value, named, path = '') {
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, entry]) => {
    const empty = entry !== null && typeof entry === 'object' && Object.keys(entry).length === 0;
    return [...(empty && named.has(key) ? [`${path}.${key}`] : []),
      ...namedEmptyKeys(entry, named, `${path}.${key}`)];
  });
}

function wireValuesOf(value, key) {
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([name, entry]) =>
    [...(name === key ? [entry] : []), ...wireValuesOf(entry, key)]);
}

test('P3 NPC wire keeps the base system messages byte for byte', async () => {
  const golden = {
    npc_conversation_responder: '3d6d8419b5212ab70b6c0e3980b8d885b858729f7e61478b242ad0ad6114351f',
    npc_conversation_responder_format_repair:
      '387d08dfd9faaa37dfbc52b40a5052f2d80a495fb8c8df588f75f34b559a8113',
    npc_conversation_grounding_auditor:
      '9834679d8245839d179b657edbdc2cf025f651696398c55b94258d7b49d3fbe5' };
  const repair = await captureNpcWire(toRepair);
  const audit = await captureNpcWire(toAudit);
  const calls = [repair.calls[0], repair.calls[1], audit.calls[1]];
  assert.deepEqual(calls.map(call => call.roleId), Object.keys(golden));
  for (const call of calls) {
    assert.equal(createHash('sha256').update(call.system).digest('hex'), golden[call.roleId],
      call.roleId);
  }
});

test('P3 NPC wire projects only the request and passes the rest of the repair message unchanged',
  async () => {
    const repair = await captureNpcWire(toRepair);
    const audit = await captureNpcWire(toAudit);
    for (const call of [repair.calls[0], repair.calls[1], audit.calls[1]]) {
      const named = new Set(call.system.match(/[A-Za-z0-9_]+/gu));
      if (call.roleId === 'npc_conversation_responder_format_repair') {
        const { request: beforeRequest, ...beforeRest } = call.before;
        const { request: afterRequest, ...afterRest } = call.after;
        assert.deepEqual(afterRequest, projectP3NpcWire(beforeRequest, call.system), call.roleId);
        assert.deepEqual(afterRest, beforeRest, call.roleId);
        assert.deepEqual(Object.keys(call.after), Object.keys(call.before), call.roleId);
      } else {
        assert.deepEqual(call.after, projectP3NpcWire(call.before, call.system), call.roleId);
      }
      assert.deepEqual(lostNamedKeys(call.before, call.after, named), [], call.roleId);
      assert.notDeepEqual(namedEmptyKeys(call.after, named), [], call.roleId);
    }
  });

test('P3 NPC repair receives the model own answer whole, with its null check and handoff',
  async () => {
    const { reason: _reason, ...formFailure } = wireSpeechOutput;
    const unsupported = { pass: false, concerns: [{ kind: 'unsupported_fact',
      path: '$.speech.utterance_text', quote: 'Слышу тебя' }] };
    for (const [answer, auditor, kind] of [
      [wireSpeechOutput, unsupported, 'MANDATORY SEMANTIC REPAIR'],
      [formFailure, null, 'MANDATORY FORMAT REPAIR']]) {
      const { calls } = await captureNpcWire(({ roleId }) => {
        if (roleId === 'npc_conversation_responder') return answer;
        if (roleId === 'npc_conversation_grounding_auditor' && auditor) return auditor;
        return wireStop();
      });
      const repair = calls.find(call => call.roleId === 'npc_conversation_responder_format_repair');
      assert.ok(repair, kind);
      assert.ok(repair.system.includes(kind), kind);
      assert.deepEqual(repair.after.original_output, JSON.parse(JSON.stringify(answer)), kind);
      assert.deepEqual(repair.after.request, projectP3NpcWire(repair.before.request, repair.system),
        kind);
      assert.deepEqual(repair.after.validation_errors, repair.before.validation_errors, kind);
      assert.deepEqual(Object.keys(repair.after), ['request', 'original_output', 'validation_errors'],
        kind);
    }
  });

async function resourcesSentToEachRole(visibleItems) {
  const repair = await captureNpcWire(toRepair, { visible_items: visibleItems });
  const audit = await captureNpcWire(toAudit, { visible_items: visibleItems });
  for (const request of [...repair.requests, ...audit.requests]) {
    assert.equal(validateNpcConversationResponseRequest(request), true);
    assert.deepEqual(request.npc.available_resources, request.available_resources);
  }
  return [repair.calls[0], repair.calls[1], audit.calls[1]].map(({ roleId, before, after }) => {
    const request = (value) => value.request ?? value;
    return { roleId, before: request(before).available_resources,
      after: request(after).available_resources };
  });
}

test('P3 NPC resources carry the perceived Russian label for held and ground items', async () => {
  const roles = await resourcesSentToEachRole([visibleItem(31),
    visibleItem(32, { type: 'chisel', label: 'долото', placement: 'carried' })]);
  const expected = {
    'item:31': ['огниво', 'firesteel', { location_ref: 'p3-scene', holder_npc_id: null }],
    'item:32': ['долото', 'chisel', { location_ref: null, holder_npc_id: 'npc:9' }] };
  assert.deepEqual(roles.map(role => role.roleId), ['npc_conversation_responder',
    'npc_conversation_responder_format_repair', 'npc_conversation_grounding_auditor']);
  for (const { roleId, before, after } of roles) {
    assert.deepEqual(after.map(resource => resource.resource_ref).sort(), ['item:31', 'item:32'],
      roleId);
    for (const resource of after) {
      const [label, type, branch] = expected[resource.resource_ref];
      const original = before.find(entry => entry.resource_ref === resource.resource_ref);
      assert.deepEqual({ location_ref: original.location_ref,
        holder_npc_id: original.holder_npc_id }, branch, roleId);
      assert.equal(resource.label, label, roleId);
      assert.match(resource.label, /\p{Script=Cyrillic}/u);
      assert.notEqual(resource.label, type);
      assert.notEqual(resource.label, original.template_ref);
      assert.notEqual(resource.label, resource.resource_ref);
    }
  }
});

test('P3 NPC resource without a Russian perceived name gets no label key', async () => {
  const roles = await resourcesSentToEachRole([
    visibleItem(33, { type: 'stick', label: 'stick' }), visibleItem(34, { label: '' })]);
  for (const { roleId, after } of roles) {
    assert.equal(after.length, 2, roleId);
    for (const resource of after) {
      assert.equal(Object.hasOwn(resource, 'label'), false, `${roleId} ${resource.resource_ref}`);
    }
  }
});

test('P3 NPC trust reaches the responder as a level and neutral trust is omitted', async () => {
  for (const [trust, expected] of [[0, []], [-3, ['low']], [3, ['medium']], [7, ['high']]]) {
    const { calls } = await captureNpcWire(toAudit, {
      opinion_of_avatar: { trust, fear: 0, value: 0, anger: 0 } });
    assert.deepEqual(wireValuesOf(calls[0].after, 'trust'), expected, String(trust));
  }
});

test('a witness first meeting reaches the responder model as a stranger', async () => {
  const { requests, calls } = await captureNpcWire(toAudit, {
    conversation_memory: [heardRecord('Здравствуй, мастер.', 5, '8')] });
  assert.equal(requests[0].npc.relationships[0].status, 'first_meeting');
  assert.equal(calls[0].roleId, 'npc_conversation_responder');
  const modelInput = JSON.stringify(calls[0].after);
  assert.match(modelInput, /незнакомый человек/u);
  assert.doesNotMatch(modelInput, /человек, с которым я уже говорил/u);
});

test('NPC opinion levels use native trust bands', async t => {
  for (const [trust, expected] of [[-3, ['low']], [-2, []], [0, []], [2, []],
    [3, ['medium']], [5, ['high']]]) {
    await t.test(`trust ${trust}`, async () => {
      const { calls } = await captureNpcWire(toAudit, {
        opinion_of_avatar: { trust, fear: 0, value: 0, anger: 0 } });
      assert.deepEqual(wireValuesOf(calls[0].after, 'trust'), expected);
    });
  }
});

test('NPC opinion levels use native anger bands', async t => {
  for (const [anger, expected] of [[2, ['none']], [3, ['mild']],
    [5, ['mild']], [6, ['strong']]]) {
    await t.test(`anger ${anger}`, async () => {
      const { calls } = await captureNpcWire(toAudit, {
        opinion_of_avatar: { trust: 0, fear: 0, value: 0, anger } });
      assert.deepEqual(wireValuesOf(calls[0].after, 'hostility'), expected);
    });
  }
});

test('shared NPC conversation model sends the request unchanged without a wire projection',
  async () => {
    const { requests, calls } = await captureNpcWire(toAudit);
    const [responder, auditor] = calls;
    assert.deepEqual(responder.before, JSON.parse(JSON.stringify(requests[0])));
    assert.deepEqual(auditor.before.request, responder.before);
    assert.deepEqual(Object.keys(auditor.before), ['request', 'plan']);
  });

test('shared NPC conversation model sends a request without a p3 frame unchanged', async () => {
  const targets = JSON.parse(await readFile(new URL(
    '../../apps/game-server/test/fixtures/npc-conversation-target-prompts.json',
    import.meta.url), 'utf8'));
  const users = [];
  const roleRunner = { run: async ({ messages }) => {
    users.push(messages[1].content);
    return { output: { pass: true, concerns: [] } };
  } };
  const model = createLowerDvinaTraceNpcSemanticModel({ roleRunner });
  const repairOf = (user, kind) => ({ repair: { kind, original_output: user.original_output,
    validation_errors: user.validation_errors } });
  await model(targets.responder.user).catch(() => {});
  await model(targets.format_repair.user.request, repairOf(targets.format_repair.user, 'format'))
    .catch(() => {});
  await model.validateFreshPlan(targets.auditor.user.plan, targets.auditor.user.request)
    .catch(() => {});
  const { request: _request, ...repairRest } = targets.format_repair.user;
  assert.deepEqual(users, [JSON.stringify(targets.responder.user),
    JSON.stringify({ request: targets.format_repair.user.request, ...repairRest }),
    JSON.stringify(targets.auditor.user)]);
});
