import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { request as sampleRequest, plan as samplePlan } from '../../packages/turn/test/turn-step-contracts-fixture.js';
import { createP3AttemptBudget, createP3EvidenceRun, createP3OperationEnvelope,
  applyP3CoordinatorSpeech,
  buildP3NpcRequest, requestP3TurnPlan, requireP3CaseId, resolveP3EffectiveConfig, sanitizeP3Evidence,
  applyP3NativeSpeech, runP3NpcBoundary, buildP3NativeNpcDecisionInput,
  runP3NativeNpcFlow,
  buildP3TurnOperations, createP3NativeFileAdapter, createP3NativeProcessAdapter,
  mapP3TurnOperationToNative,
  createP3RoleRuntime, readP3NativeObservation, requireP3NativeSeam, runP3TurnStep,
  runP3SealedPackage, createP3NativeSpeechOwnerFixture,
  validateP3Readback, validateP3SealedCasePack,
  writeP3OperationRequest } from './p3-boundary.js';

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
  assert.equal(invocation.file, 'wsl.exe');
  assert.equal(invocation.options.shell, false);
  assert.equal(invocation.options.windowsHide, true);
  assert.equal(invocation.args.includes('NOVGOROD_P4_MODE=apply'), true);
  assert.equal(invocation.args.includes('NOVGOROD_P4_WORLD=novgorod'), true);
  assert.equal(invocation.args.includes('/home/cdda/build/tests/cata_test'), true);
  assert.equal(invocation.args.includes('[novgorod_semantic]'), true);
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
  const openOperation = operationsByKind.request_container_access;
  assert.equal(mapP3TurnOperationToNative(openOperation, current).primitive, 'open');
  assert.deepEqual(mapP3TurnOperationToNative(openOperation, current).args.direction, [1, 0]);
  assert.equal(mapP3TurnOperationToNative(operationsByKind.request_activity, current).primitive, 'wait');
  const speechOperation = { ...operationsByKind.emit_interaction, content: 'Привет, сосед!' };
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
        before: { turn: 3 }, after: { turn: 3 }, native_trace: { primitive: envelope.primitive } };
    }
  };
  for (const [opName, expectedPrimitive] of [
    ['request_item_use', 'use_item'], ['request_container_access', 'open'],
    ['request_activity', 'wait'], ['emit_interaction', 'speak']
  ]) {
    const result = await runP3TurnStep({ intent: 'Do the operation', observation: current,
      nativeAdapter, operationId: `typed-${opName}`, turnStepModel: async request => {
        const offered = request.available_domain_operations.find(({ op }) => op === opName);
        const operation = opName === 'emit_interaction'
          ? { ...offered, content: 'Точное сообщение' } : offered;
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
    if (opName === 'emit_interaction') {
      assert.equal(envelope.args.utterance, 'Точное сообщение');
      assert.deepEqual(envelope.references.actors, [{ ref: 'npc:8', id: '8' }]);
    }
    if (opName === 'request_item_use') assert.equal(envelope.args.method, 'activate');
    if (opName === 'request_activity') {
      assert.equal(result.working_projection.native_readback.status, 'applied');
      assert.equal(result.working_projection.native_goal_result, 'partially_achieved');
    } else assert.equal(result.working_projection.native_goal_result, 'not_achieved');
  }
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
    provider: 'deepseek', model: 'deepseek-v4-flash', temperature: 0, top_p: 1,
    max_tokens: 20_000, timeout_ms: 120_000, api_key_present: true,
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
  const projection = { actor_id: '8', native_turn: 120, assignment_id: '',
    assignment_status: '', activity_id: 'ACT_WORK', visible_actors: [],
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
      assert.deepEqual(envelope.args, { direction: [1, 0], assignment_id: 'p3-duty-8',
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
  Object.assign(readback.native_effect, { conversationId: owner.ownerContext.conversationId,
    exchangeId: owner.ownerContext.exchangeId, stateVersion: owner.ownerContext.stateVersion });
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
    validated_semantic_input: {} };
  await assert.rejects(applyP3CoordinatorSpeech({ nativeAdapter: adapter, request }),
    /P3_COORDINATOR_OBSERVATION_REVISION_MISMATCH/);
  assert.equal(executions, 0);
});

test('effective config reports only approved nonsecret fields and rejects token mismatch', () => {
  const env = { DEEPSEEK_API_KEY: 'test-secret' };
  const config = resolveP3EffectiveConfig({ roleId: 'turn_step_planner', env });
  assert.deepEqual({ provider: config.provider, model: config.model, temperature: config.temperature,
    top_p: config.top_p, max_tokens: config.max_tokens, timeout_ms: config.timeout_ms,
    api_key_present: config.api_key_present }, { provider: 'deepseek', model: 'deepseek-v4-flash',
    temperature: 0, top_p: 1, max_tokens: 20_000, timeout_ms: 120_000, api_key_present: true });
  assert.equal(JSON.stringify(config).includes('test-secret'), false);
  assert.equal(resolveP3EffectiveConfig({ roleId: 'npc_conversation_responder',
    env: { DEEPSEEK_API_KEY: 'test-secret', NPC_CONVERSATION_RESPONDER_MAX_TOKENS: '2000' } }).max_tokens, 1_000);
  assert.throws(() => resolveP3EffectiveConfig({ roleId: 'turn_step_planner',
    env: { DEEPSEEK_API_KEY: 'test-secret', TURN_STEP_PLANNER_MODEL: 'other-model' } }),
  /P3_ROLE_CONFIG_MISMATCH/);
  for (const [roleId, tokens] of [
    ['turn_step_planner', 20_000], ['turn_step_planner_repair', 20_000],
    ['npc_autonomous_decider', 20_000], ['npc_autonomous_decider_format_repair', 20_000],
    ['npc_conversation_responder', 1_000],
    ['npc_conversation_responder_format_repair', 1_000]
  ]) assert.equal(resolveP3EffectiveConfig({ roleId, env }).max_tokens, tokens, roleId);
  assert.throws(() => resolveP3EffectiveConfig({ roleId: 'unrecognized_role', env }),
    /P3_ROLE_UNSUPPORTED/);
});

test('P3 role runtime uses existing provider adapter with fixed protocol overrides', async () => {
  let call;
  const runtime = createP3RoleRuntime({ env: { DEEPSEEK_API_KEY: 'test-secret' },
    execute: async value => { call = value; return { status: 'ok', parsed_json: { ok: true },
      provider: 'deepseek', model: 'deepseek-v4-flash', scope: value.scope,
      role_id: value.roleId, durationMs: 1 }; } });
  const result = await runtime.roleRunner.run({ scope: 'turn_runtime',
    role_id: 'npc_conversation_responder_format_repair', messages: [],
    overrides: { maxTokens: 20_000, temperature: 0.8, topP: 0.5 } });
  assert.deepEqual(result.output, { ok: true });
  assert.equal(runtime.budget.calls, 1);
  assert.deepEqual({ temperature: call.overrides.temperature, topP: call.overrides.topP,
    maxTokens: call.overrides.maxTokens, requestTimeoutMs: call.overrides.requestTimeoutMs },
  { temperature: 0, topP: 1, maxTokens: 1_000, requestTimeoutMs: 120_000 });
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
});
