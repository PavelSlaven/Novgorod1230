import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLlmTurnReport, createLlmDiagnostics } from '../src/runtime/llm-diagnostics.js';
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
  assert.deepEqual(report.aggregate, { calls: 3, success_rate: 2 / 3, parse_or_schema_failure_rate: 1 / 3, repair_rate: 1 / 3, llm_total_ms: 60, p50_ms: 20, p95_ms: 30, usage: { input_tokens: 8, output_tokens: 9, total_tokens: 18 } });
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
