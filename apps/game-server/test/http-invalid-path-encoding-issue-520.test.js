import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { createHttpHandler, matchApiRoute } from '../src/http/handler.js';

const requestId = 'issue-520-http-request';
const malformedSegments = ['%E0%A4%A', '%', '%FF'];
const partyRoutes = [
  { name: 'developer report latest', method: 'GET', path: (segment) => `/api/v1/developer/llm-turn-reports/${segment}` },
  { name: 'developer report specific', method: 'GET', path: (segment) => `/api/v1/developer/llm-turn-reports/${segment}/request-1` },
  { name: 'party screen', method: 'GET', path: (segment) => `/api/v1/parties/${segment}/screen` },
  { name: 'turn progress party', method: 'GET', path: (segment) => `/api/v1/parties/${segment}/turns/request-1/progress` },
  { name: 'opening ack', method: 'POST', path: (segment) => `/api/v1/parties/${segment}/opening-ack`, body: { client_ack_id: 'ack-1' } },
  { name: 'turn', method: 'POST', path: (segment) => `/api/v1/parties/${segment}/turns`, body: { raw_text: 'Осмотреться' } },
  { name: 'presentation recovery', method: 'POST', path: (segment) => `/api/v1/parties/${segment}/presentation-recovery`, body: { request_id: 'request-1' } }
];
const optionalRequestRoutes = [
  { name: 'developer report specific request', method: 'GET', path: (segment) => `/api/v1/developer/llm-turn-reports/party-1/${segment}` },
  { name: 'turn progress request', method: 'GET', path: (segment) => `/api/v1/parties/party-1/turns/${segment}/progress` }
];

function fixture(t, developerMode) {
  const rootCalls = [];
  const failures = [];
  const root = Object.fromEntries([
    ['getLlmTurnReport', (input) => { rootCalls.push({ method: 'getLlmTurnReport', input }); return null; }],
    ['getPartyScreen', (partyId) => { rootCalls.push({ method: 'getPartyScreen', partyId }); return null; }],
    ['getTurnProgress', (input) => { rootCalls.push({ method: 'getTurnProgress', input }); return null; }],
    ['acknowledgeOpening', (partyId, input) => { rootCalls.push({ method: 'acknowledgeOpening', partyId, input }); return null; }],
    ['submitTurn', (partyId, input) => { rootCalls.push({ method: 'submitTurn', partyId, input }); return null; }],
    ['recoverPendingPresentation', (partyId, input) => { rootCalls.push({ method: 'recoverPendingPresentation', partyId, input }); return null; }]
  ]);
  t.mock.method(console, 'error', (...args) => {
    failures.push(args.map((arg) => arg instanceof Error
      ? { name: arg.name, message: arg.message }
      : arg));
  });
  return {
    rootCalls,
    failures,
    async send(method, url, body = null) {
      const request = Readable.from(body == null ? [] : [Buffer.from(JSON.stringify(body))]);
      Object.assign(request, { method, url, headers: { host: 'localhost', 'x-request-id': requestId } });
      const response = {
        writeHead(status, headers) { this.status = status; this.headers = headers; },
        end(value) { this.body = JSON.parse(value); }
      };
      await createHttpHandler({ root, developerMode })(request, response);
      return { status: response.status, body: response.body };
    }
  };
}

function expectedNotFound() {
  return {
    status: 404,
    body: {
      version: 1,
      schema: 'rus_api_error',
      ok: false,
      request_id: requestId,
      error: { code: 'ROUTE_NOT_FOUND', message: 'Адрес не найден.' }
    }
  };
}

for (const route of partyRoutes) {
  for (const malformed of malformedSegments) {
    for (const developerMode of [false, true]) {
      test(`ожидаемо красный, issue #520: ${route.name} party segment ${malformed}, developerMode=${developerMode}`, async (t) => {
        const run = fixture(t, developerMode);
        const response = await run.send(route.method, route.path(malformed), route.body);
        assert.deepEqual({ ...response, failures: run.failures, rootCalls: run.rootCalls }, {
          ...expectedNotFound(), failures: [], rootCalls: []
        });
      });
    }
  }
}

for (const route of optionalRequestRoutes) {
  for (const malformed of malformedSegments) {
    for (const developerMode of [false, true]) {
      test(`ожидаемо красный, issue #520: ${route.name} segment ${malformed}, developerMode=${developerMode}`, async (t) => {
        const run = fixture(t, developerMode);
        const response = await run.send(route.method, route.path(malformed));
        assert.deepEqual({ ...response, failures: run.failures, rootCalls: run.rootCalls }, {
          ...expectedNotFound(), failures: [], rootCalls: []
        });
      });
    }
  }
}

test('ожидаемо красный, issue #520: disabled developer route gives same response for malformed and valid party paths', async (t) => {
  const run = fixture(t, false);
  const malformed = await run.send('GET', '/api/v1/developer/llm-turn-reports/%E0%A4%A');
  const valid = await run.send('GET', '/api/v1/developer/llm-turn-reports/party-1');
  assert.deepEqual({ malformed, valid, failures: run.failures, rootCalls: run.rootCalls }, {
    malformed: expectedNotFound(), valid: expectedNotFound(), failures: [], rootCalls: []
  });
});

test('control issue #520: matcher decodes valid encoded party and request IDs', () => {
  assert.deepEqual(matchApiRoute('GET', '/api/v1/developer/llm-turn-reports/party%3A1/request%3A1'), {
    id: 'llm_turn_report', partyId: 'party:1', requestId: 'request:1', status: 200
  });
  assert.deepEqual(matchApiRoute('GET', '/api/v1/parties/party%3A1/turns/request%3A1/progress'), {
    id: 'turn_progress', partyId: 'party:1', requestId: 'request:1', status: 200
  });
});

test('control issue #520: valid developer report URL remains unavailable when developer mode is disabled', async (t) => {
  const run = fixture(t, false);
  const response = await run.send('GET', '/api/v1/developer/llm-turn-reports/party-1/request-1');
  assert.deepEqual({ ...response, failures: run.failures, rootCalls: run.rootCalls }, {
    ...expectedNotFound(), failures: [], rootCalls: []
  });
});
