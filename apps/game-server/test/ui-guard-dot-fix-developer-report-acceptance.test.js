import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { createHttpHandler } from '../src/http/handler.js';
import { createLlmDiagnostics } from '../src/runtime/llm-diagnostics.js';

// D102: authored before the operational envelope fix; pin this file.
// Production getter: modular-entry.js:39-49 and
// runtime/releases/spatial-v3-production-binding-shared.js:269-272.
// Both delegate to llmDiagnostics.report; its waterfall is built in
// runtime/llm-diagnostics.js:120-138 from provider telemetry.
const partyId = 'party-devreport';
const turnRequestId = 'request-devreport';
const httpRequestId = 'devreport-acceptance';
const routes = [
  { url: `/api/v1/developer/llm-turn-reports/${partyId}`, request_id: null },
  { url: `/api/v1/developer/llm-turn-reports/${partyId}/${turnRequestId}`,
    request_id: turnRequestId }
];

async function reportFixture() {
  const diagnostics = createLlmDiagnostics({ developerMode: true });
  await diagnostics.runTurn({ party_id: partyId, request_id: turnRequestId }, async () => {
    // Recorded telemetry only: no provider or model is called.
    diagnostics.telemetry.onCall({ roleId: 'turn_step_planner',
      providerMode: 'openai_compatible', model: 'fixture-model',
      durationMs: 12, status: 'parse_error', errorCategory: 'json_parse_failed' });
    diagnostics.telemetry.onCall({ roleId: 'turn_step_planner_repair',
      providerMode: 'openai_compatible', model: 'fixture-model',
      durationMs: 8, status: 'ok', outputContractMode: 'json_object' });
  });
  return { diagnostics, report: diagnostics.report({ party_id: partyId }) };
}

async function get(root, developerMode, url) {
  const request = Readable.from([]);
  Object.assign(request, { method: 'GET', url,
    headers: { host: 'localhost', 'x-request-id': httpRequestId } });
  const response = {
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(value) { this.body = JSON.parse(value); }
  };
  await createHttpHandler({ root, developerMode })(request, response);
  return response;
}

for (const route of routes) {
  test(`developer report preserves production diagnostics: ${route.url}`, async (t) => {
    const { diagnostics, report } = await reportFixture();
    const before = structuredClone(report), inputs = [], failures = [];
    assert.deepEqual(report.waterfall.map(({ role, status }) => ({ role, status })), [
      { role: 'turn_step_planner', status: 'parse_error' },
      { role: 'turn_step_planner_repair', status: 'ok' }
    ]);
    t.mock.method(console, 'error', (_message, error) => {
      failures.push({ code: error?.code, details: error?.details });
    });
    const response = await get({ getLlmTurnReport(input) {
      inputs.push(input);
      return diagnostics.report(input);
    } }, true, route.url);
    assert.deepEqual(inputs, [{ party_id: partyId, request_id: route.request_id }]);
    assert.equal(response.status, 200, JSON.stringify(failures));
    assert.deepEqual(response.body, {
      version: 1, schema: 'rus_api_success', ok: true,
      request_id: httpRequestId, data: before
    });
    assert.deepEqual(report, before, 'diagnostic DTO must not be mutated');
    assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.deepEqual(failures, []);
  });

  test(`developer report remains unavailable outside developer mode: ${route.url}`, async () => {
    const { report } = await reportFixture();
    const inputs = [];
    const response = await get({ getLlmTurnReport(input) {
      inputs.push(input); return report;
    } }, false, route.url);
    assert.deepEqual(inputs, [], 'developer guard must run before reading diagnostics');
    assert.equal(response.status, 404);
    assert.deepEqual(response.body, {
      version: 1, schema: 'rus_api_error', ok: false, request_id: httpRequestId,
      error: { code: 'ROUTE_NOT_FOUND', message: 'Адрес не найден.' }
    });
  });

  test(`developer report still blocks hidden fields: ${route.url}`, async (t) => {
    const { report } = await reportFixture();
    const polluted = { ...report, hidden_state: { private_note: 'devreport-hidden' } };
    const before = structuredClone(polluted), failures = [];
    t.mock.method(console, 'error', (_message, error) => failures.push(error));
    const response = await get({ getLlmTurnReport: () => polluted }, true, route.url);
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, {
      version: 1, schema: 'rus_api_error', ok: false, request_id: httpRequestId,
      error: { code: 'TEMPORARY_ACTION_UNAVAILABLE',
        message: 'Действие временно недоступно. Попробуйте ещё раз.' }
    });
    assert.equal(failures.length, 1);
    assert.equal(failures[0].code, 'PUBLIC_PAYLOAD_HIDDEN_LEAK');
    assert.deepEqual(polluted, before);
    assert.doesNotMatch(JSON.stringify(response.body),
      /hidden_state|devreport-hidden|PUBLIC_PAYLOAD_HIDDEN_LEAK/u);
  });
}

test('unknown API route returns the same client 404 in both modes', async (t) => {
  for (const developerMode of [false, true]) {
    await t.test(`developerMode=${developerMode}`, async () => {
      const response = await get({}, developerMode, '/api/v1/no-such-route');
      assert.equal(response.status, 404);
      assert.deepEqual(response.body, {
        version: 1, schema: 'rus_api_error', ok: false, request_id: httpRequestId,
        error: { code: 'ROUTE_NOT_FOUND', message: 'Адрес не найден.' }
      });
    });
  }
});
