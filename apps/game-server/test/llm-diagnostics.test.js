import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLlmTurnReport, createLlmDiagnostics } from '../src/runtime/llm-diagnostics.js';
import { createLlmTurnBudget } from '../src/runtime/llm-turn-budget.js';
import { createLlmRoleRunnerAdapter } from '../src/adapters/llm-role-runner.js';
import { createGameHttpServer, listen } from '../src/index.js';

test('buildLlmTurnReport makes deterministic waterfall and aggregates', () => {
  const report = buildLlmTurnReport({ party_id: 'party-1', request_id: 'turn-1', calls: [
    { role: 'intent_router', provider: 'deepseek', model: 'm', durationMs: 10, status: 'ok', configHash: 'a', outputContractMode: 'json_object', tokenUsage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } },
    { role: 'turn_step_planner_repair', provider: 'openai_compatible', model: 'm2', durationMs: 30, status: 'parse_error', errorCategory: 'json_parse_failed', configHash: 'b', tokenUsage: { input_tokens: 5, output_tokens: 7, totalTokens: 13 } },
    { role: 'narrator', provider: 'deepseek', model: 'm', durationMs: 20, status: 'ok', configHash: 'a' }
  ] });
  assert.deepEqual(report.waterfall.map(({ sequence, role, repair }) => [sequence, role, repair]), [[1, 'intent_router', false], [2, 'turn_step_planner_repair', true], [3, 'narrator', false]]);
  assert.deepEqual(report.waterfall[0].usage, { input_tokens: 3, output_tokens: 2, total_tokens: 5 });
  assert.equal(report.waterfall[0].output_contract_mode, 'json_object');
  assert.equal(report.aggregate.llm_total_ms, 60);
  assert.equal(report.aggregate.llm_total_duration_ms, 60);
  assert.equal(report.aggregate.slowest_llm_call_ms, 30);
  assert.equal(report.aggregate.llm_calls, 3);
  assert.equal(report.aggregate.repair_calls, 1);
});

test('diagnostics accepts telemetry shape, shares turn start, and unions parallel intervals', async () => {
  let now = 100;
  const budget = createLlmTurnBudget({ now: () => now });
  const diagnostics = createLlmDiagnostics({ now: () => now, turnBudget: budget });
  await assert.rejects(diagnostics.runTurn({ party_id: 'party-2', request_id: 'turn-2' }, async () => {
    assert.equal(budget.current().started_at, 100);
    diagnostics.telemetry.onCall({ role: 'first', status: 'ok', started_at_ms: 100, duration_ms: 30 });
    diagnostics.telemetry.onCall({ role: 'second_repair', status: 'ok', started_at_ms: 120, duration_ms: 30 });
    now = 150;
    const error = new Error('secret prompt');
    error.code = 'LLM_TURN_BUDGET_EXHAUSTED';
    error.budget_exhausted = true;
    throw error;
  }), { code: 'LLM_TURN_BUDGET_EXHAUSTED' });
  const report = diagnostics.report({ party_id: 'party-2' });
  assert.equal(report.turn_duration_ms, 50);
  assert.equal(report.aggregate.llm_total_duration_ms, 60);
  assert.equal(report.aggregate.llm_active_wall_ms, 50);
  assert.equal(report.aggregate.budget_exhausted, true);
  assert.equal(JSON.stringify(report).includes('secret prompt'), false);
});

test('report marks elapsed whole-turn deadline without budget incident', () => {
  const report = buildLlmTurnReport({ turn_duration_ms: 30_000, turn_deadline_ms: 30_000 });
  assert.equal(report.aggregate.deadline_exceeded, true);
});

test('diagnostics keeps safe budget and provider failure incidents', async () => {
  const diagnostics = createLlmDiagnostics();
  await assert.rejects(diagnostics.runTurn({ party_id: 'party-safe', request_id: 'turn-safe' }, async () => {
    diagnostics.telemetry.onCall({ roleId: 'intent_router', provider: 'deepseek', model: 'm',
      configHash: 'hash', status: 'transport_error', errorCategory: 'timeout', durationMs: 1 });
    const error = new Error('secret prompt');
    Object.assign(error, { code: 'LLM_TURN_BUDGET_EXHAUSTED', role_id: 'turn_step_planner',
      provider: 'deepseek', model: 'm', config_hash: 'hash', budget_exhausted: true,
      remaining_llm_budget_ms: 50, remaining_turn_deadline_ms: 5050 });
    throw error;
  }), { code: 'LLM_TURN_BUDGET_EXHAUSTED' });
  const incidents = diagnostics.report({ party_id: 'party-safe' }).aggregate.incidents;
  assert.deepEqual(incidents.map(({ role_id, error_category }) => [role_id, error_category]),
    [['intent_router', 'timeout'], ['turn_step_planner', 'LLM_TURN_BUDGET_EXHAUSTED']]);
  assert.equal(JSON.stringify(incidents).includes('secret prompt'), false);
});

test('failed turn diagnostics retain only the safe write-plan cause', async () => {
  const diagnostics = createLlmDiagnostics();
  await assert.rejects(diagnostics.runTurn({ party_id: 'party-safe',
    request_id: 'turn-write-plan' }, async () => {
    const error = new Error('secret prose');
    Object.assign(error, {
      code: 'TRACE_TURN_STEP_WRITE_PLAN_REJECTED',
      details: {
        code: 'lock_order_violation',
        diagnostics: {
          stage: 'write_plan_invariant',
          reason: 'physical_lock_key_missing',
          hidden_state: 'secret'
        },
        subject_ref: { entity_id: 'hidden-party-ref' }
      }
    });
    throw error;
  }), { code: 'TRACE_TURN_STEP_WRITE_PLAN_REJECTED' });
  const report = diagnostics.report({ party_id: 'party-safe' });
  assert.deepEqual(report.failure, {
    code: 'TRACE_TURN_STEP_WRITE_PLAN_REJECTED',
    detail_code: 'lock_order_violation',
    stage: 'write_plan_invariant',
    reason: 'physical_lock_key_missing'
  });
  assert.equal(JSON.stringify(report).includes('secret'), false);
  assert.equal(JSON.stringify(report).includes('hidden-party-ref'), false);
});

test('failed turn diagnostics reject unlisted write-plan identifiers', () => {
  const report = buildLlmTurnReport({ failure: {
    code: 'TRACE_TURN_STEP_WRITE_PLAN_REJECTED',
    detail_code: 'generated_schema_mismatch',
    stage: 'write_plan_invariant',
    reason: 'hidden_party_42'
  } });
  assert.equal(report.failure, null);
  assert.equal(JSON.stringify(report).includes('hidden_party_42'), false);
});

test('failed narration diagnostics retain only allowlisted audit categories', () => {
  const report = buildLlmTurnReport({ failure: {
    code: 'TRACE_PHASE_2_NARRATION_REJECTED',
    details: {
      phase: 'final_audit_failed',
      concern_count: 2,
      concern_kinds: ['unsupported_fact', 'unsupported_success',
        'hidden-party-42'],
      concerns: [{ reason: 'secret repaired prose' }],
      prompt: 'secret prompt',
      hidden_state: { entity_id: 'hidden-ref' }
    }
  } });
  assert.deepEqual(report.failure, {
    code: 'TRACE_PHASE_2_NARRATION_REJECTED',
    phase: 'final_audit_failed',
    concern_count: 2,
    concern_kinds: ['unsupported_fact', 'unsupported_success']
  });
  const serialized = JSON.stringify(report.failure);
  assert.equal(serialized.includes('secret'), false);
  assert.equal(serialized.includes('hidden-party-42'), false);
  assert.equal(serialized.includes('hidden-ref'), false);
});

test('completed post-commit turn can record a safe narration failure', async () => {
  const diagnostics = createLlmDiagnostics();
  await diagnostics.runTurn({ party_id: 'party-safe', request_id: 'turn-present' },
    async () => {
      diagnostics.recordFailure({
        code: 'TRACE_PHASE_2_NARRATION_REJECTED',
        details: {
          phase: 'final_audit_failed', concern_count: 1,
          concern_kinds: ['unsupported_fact'],
          prose: 'secret prose', prompt: 'secret prompt'
        }
      });
    });
  assert.deepEqual(diagnostics.report({ party_id: 'party-safe' }).failure, {
    code: 'TRACE_PHASE_2_NARRATION_REJECTED',
    phase: 'final_audit_failed', concern_count: 1,
    concern_kinds: ['unsupported_fact']
  });
});

test('failed combat diagnostics retain only allowlisted validation codes', () => {
  const report = buildLlmTurnReport({ failure: {
    code: 'TURN_NPC_PLAN_INVALID', details: { validation_errors: [
      { code: 'npc_combat_ref_choice_invalid', path: '$.operation',
        message: 'safe fixed message' },
      { code: 'hidden-party-42', path: '$.secret', message: 'secret output' }
    ], original_output: 'secret provider output', hidden_state: 'secret ref' }
  } });
  assert.deepEqual(report.failure, { code: 'TURN_NPC_PLAN_INVALID',
    validation_codes: ['npc_combat_ref_choice_invalid'] });
  assert.equal(JSON.stringify(report.failure).includes('secret'), false);
  assert.equal(JSON.stringify(report.failure).includes('hidden-party-42'), false);
});

test('failed autonomous diagnostics retain stable fields without model text', () => {
  const report = buildLlmTurnReport({ failure: {
    code: 'TURN_NPC_PLAN_INVALID', details: { validation_errors: [
      { code: 'npc_step_activity_invalid', path: '$.activity',
        message: 'secret provider output' },
      { code: 'hidden-party-42', path: '$.hidden', message: 'secret prompt' }
    ], original_output: 'secret output', hidden_state: 'secret state' }
  } });
  assert.deepEqual(report.failure, { code: 'TURN_NPC_PLAN_INVALID',
    validation_codes: ['npc_step_activity_invalid'],
    validation_scopes: ['activity'] });
  const serialized = JSON.stringify(report.failure);
  for (const secret of ['secret provider output', 'hidden-party-42',
    'secret prompt', 'secret output', 'secret state']) {
    assert.equal(serialized.includes(secret), false);
  }
});

test('failed NPC conversation diagnostics retain only allowlisted enum scope', async () => {
  const diagnostics = createLlmDiagnostics();
  await assert.rejects(diagnostics.runTurn({ party_id: 'party-safe',
    request_id: 'turn-safe' }, async () => { throw Object.assign(new Error('secret'), {
    code: 'TURN_NPC_PLAN_INVALID', details: { validation_errors: [
      { code: 'invalid_enum', path: '$.speech.dominant_act',
        message: 'secret provider output', allowed_values: ['secret-ref'] },
      { code: 'hidden-party-42', path: '$.hidden', message: 'secret prompt' }
    ], prose: 'secret prose', hidden_state: 'secret hidden state' }
  }); }));
  const report = diagnostics.report({ party_id: 'party-safe',
    request_id: 'turn-safe' });
  assert.deepEqual(report.failure, { code: 'TURN_NPC_PLAN_INVALID',
    validation_codes: ['invalid_enum'],
    validation_scopes: ['speech_dominant_act'] });
  const serialized = JSON.stringify(report);
  for (const secret of ['secret provider output', 'secret-ref', 'hidden-party-42',
    'secret prompt', 'secret prose', 'secret hidden state']) {
    assert.equal(serialized.includes(secret), false);
  }
});

test('explicit validation scopes retain only stable allowlisted categories', () => {
  const npc = buildLlmTurnReport({ failure: {
    code: 'TURN_NPC_PLAN_INVALID', validation_codes: ['invalid_enum'],
    validation_scopes: ['speech_dominant_act', 'SECRET_PROVIDER_DATA']
  } });
  const turnStep = buildLlmTurnReport({ failure: {
    code: 'TURN_STEP_PLAN_INVALID', validation_codes: ['required'],
    validation_scopes: ['operation', 'SECRET_PROVIDER_DATA']
  } });
  assert.deepEqual(npc.failure, { code: 'TURN_NPC_PLAN_INVALID',
    validation_codes: ['invalid_enum'],
    validation_scopes: ['speech_dominant_act'] });
  assert.deepEqual(turnStep.failure, { code: 'TURN_STEP_PLAN_INVALID',
    validation_codes: ['required'], validation_scopes: ['operation'] });
  assert.equal(JSON.stringify({ npc, turnStep }).includes('SECRET_PROVIDER_DATA'), false);
});

test('failed turn-step diagnostics retain codes without model text', () => {
  const raw = {
    code: 'TURN_STEP_PLAN_INVALID',
    details: { errors: [
      { path: '$.operations', code: 'required', message: 'secret prose' },
      { path: '$.reason', code: 'provider_dump', message: 'raw output' }
    ], prompt: 'hidden prompt', original_output: { prose: 'hidden prose' } }
  };
  assert.deepEqual(buildLlmTurnReport({ failure: raw }).failure, {
    code: 'TURN_STEP_PLAN_INVALID', validation_codes: ['required'],
    validation_scopes: ['operation', 'plan']
  });
  const serialized = JSON.stringify(buildLlmTurnReport({ failure: raw }));
  for (const secret of ['secret prose', 'raw output', 'hidden prompt',
    'hidden prose', 'provider_dump']) assert.equal(serialized.includes(secret), false);
});

test('turn context retains sanitized turn-step codes after report assembly', async () => {
  const diagnostics = createLlmDiagnostics();
  await assert.rejects(diagnostics.runTurn({ party_id: 'party-1', request_id: 'turn-1' },
    async () => { throw Object.assign(new Error('secret'), {
      code: 'TURN_STEP_PLAN_INVALID', details: { errors: [
        { path: '$.interpretation.hidden-party-42', code: 'unknown_ref',
          message: 'hidden ref' },
        { path: '$.secret-provider-data', code: 'provider_dump', message: 'raw output' }
      ] }
    }); }));
  const report = diagnostics.report({ party_id: 'party-1', request_id: 'turn-1' });
  assert.deepEqual(report.failure, {
    code: 'TURN_STEP_PLAN_INVALID', validation_codes: ['unknown_ref'],
    validation_scopes: ['interpretation']
  });
  assert.equal(JSON.stringify(report).includes('hidden ref'), false);
  assert.equal(JSON.stringify(report).includes('raw output'), false);
});

test('turn context groups calls and excludes probe records', async () => {
  const diagnostics = createLlmDiagnostics();
  await diagnostics.runTurn({ party_id: 'party-1', request_id: 'turn-1' }, async () => {
    diagnostics.telemetry.onCall({ roleId: 'intent_router', status: 'ok', durationMs: 4, outputContractMode: 'json_object', tokenUsage: { total_tokens: 7 } });
    await Promise.resolve();
    diagnostics.telemetry.onCall({ roleId: 'probe', call_type: 'probe', status: 'ok', durationMs: 1 });
  });
  const report = diagnostics.report({ party_id: 'party-1', request_id: 'turn-1' });
  assert.equal(report.aggregate.calls, 1);
  assert.deepEqual(report.waterfall[0].usage, { input_tokens: 0, output_tokens: 0, total_tokens: 7 });
  assert.equal(report.waterfall[0].output_contract_mode, 'json_object');
  assert.equal(diagnostics.report({ party_id: 'party-1' }).request_id, 'turn-1');
  assert.equal(diagnostics.report({ party_id: 'party-1', request_id: 'other' }), null);
});

test('private party log report retains full LLM request and response', async () => {
  const diagnostics = createLlmDiagnostics();
  const runner = createLlmRoleRunnerAdapter({
    telemetry: diagnostics.telemetry,
    turnBudget: diagnostics.turnBudget,
    execute: async () => ({
      status: 'ok', parsed_json: { action: 'look' }, raw_text: '{"action":"look"}',
      provider: 'fixture', model: 'fixture', durationMs: 3,
      config_hash: 'config-1', usage: { total_tokens: 9 }
    })
  });
  await diagnostics.runTurn({ party_id: 'party-log', request_id: 'turn-log' },
    () => runner.run({
      scope: 'turn_runtime', role_id: 'turn_step_planner',
      request_identity: 'turn-log:step-1',
      messages: [{ role: 'user', content: 'Осмотреться' }]
    }));

  const privateReport = diagnostics.takeLogReport({ party_id: 'party-log' });
  assert.equal(privateReport.calls[0].request.messages[0].content, 'Осмотреться');
  assert.equal(privateReport.calls[0].response.parsed_json.action, 'look');
  assert.equal(diagnostics.takeLogReport({ party_id: 'party-log' }), null);
  assert.equal(JSON.stringify(diagnostics.report({ party_id: 'party-log' }))
    .includes('Осмотреться'), false);
});

test('private party log retains provider reasoning content', async () => {
  const originalFetch = globalThis.fetch;
  let providerRequest;
  globalThis.fetch = async (_url, init) => {
    providerRequest = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => ({ choices: [{ message: {
        content: '{"action":"look"}', reasoning_content: 'hidden reasoning'
      } }] })
    };
  };
  try {
    const diagnostics = createLlmDiagnostics();
    const runner = createLlmRoleRunnerAdapter({
      env: { DEEPSEEK_API_KEY: 'test-key' },
      telemetry: diagnostics.telemetry,
      turnBudget: diagnostics.turnBudget
    });
    await diagnostics.runTurn({ party_id: 'party-reasoning',
      request_id: 'turn-reasoning' }, () => runner.run({
      scope: 'turn_runtime', role_id: 'turn_step_planner',
      request_identity: 'turn-reasoning:step-1',
      messages: [{ role: 'user', content: 'Осмотреться' }]
    }));
    const report = diagnostics.takeLogReport({ party_id: 'party-reasoning' });
    assert.deepEqual(report.calls[0].request.messages, providerRequest.messages);
    assert.equal(report.calls[0].response.reasoning_content, 'hidden reasoning');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('private reports preserve concurrent turns for one party', async () => {
  const diagnostics = createLlmDiagnostics();
  let finishFirst;
  let finishSecond;
  const firstGate = new Promise((resolve) => { finishFirst = resolve; });
  const secondGate = new Promise((resolve) => { finishSecond = resolve; });
  const first = diagnostics.runTurn({ party_id: 'party-concurrent',
    request_id: 'turn-1' }, () => firstGate);
  const second = diagnostics.runTurn({ party_id: 'party-concurrent',
    request_id: 'turn-2' }, () => secondGate);

  finishSecond();
  await second;
  finishFirst();
  await first;

  assert.equal(diagnostics.takeLogReport({ party_id: 'party-concurrent',
    request_id: 'turn-1' }).request_id, 'turn-1');
  assert.equal(diagnostics.takeLogReport({ party_id: 'party-concurrent' })
    .request_id, 'turn-2');
});

test('developer report route is unavailable outside developer mode', async (t) => {
  const report = buildLlmTurnReport({ party_id: 'party-1', request_id: 'turn-1' });
  const root = { getLlmTurnReport: () => report };
  const normal = createGameHttpServer({ root });
  const developer = createGameHttpServer({ root, developerMode: true });
  const [normalAddress, developerAddress] = await Promise.all([
    listen(normal, { host: '127.0.0.1', port: 0 }),
    listen(developer, { host: '127.0.0.1', port: 0 })
  ]);
  t.after(() => { normal.close(); developer.close(); });
  const path = '/api/v1/developer/llm-turn-reports/party-1';
  assert.equal((await fetch(`http://127.0.0.1:${normalAddress.port}${path}`)).status, 404);
  const response = await fetch(`http://127.0.0.1:${developerAddress.port}${path}`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.data.aggregate.llm_total_ms, 0);
  assert.equal(JSON.stringify(payload).includes('Authorization'), false);
});
