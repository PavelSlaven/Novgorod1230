import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLlmTurnReport, createLlmDiagnostics } from '../src/runtime/llm-diagnostics.js';
import { createLlmTurnBudget } from '../src/runtime/llm-turn-budget.js';
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
        code: 'visible_package_persistence_gap',
        diagnostics: {
          stage: 'narration_approval',
          reason: 'TRACE_PHASE_2_NARRATION_REJECTED',
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
    detail_code: 'visible_package_persistence_gap',
    stage: 'narration_approval',
    reason: 'TRACE_PHASE_2_NARRATION_REJECTED'
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
