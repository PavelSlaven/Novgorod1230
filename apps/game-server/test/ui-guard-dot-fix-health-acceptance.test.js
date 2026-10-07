import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { createHttpHandler } from '../src/http/handler.js';

// D102: authored before the health envelope fix; pin this file.
// Production DTO shape: composition/production-spatial-v3.js health();
// readiness statuses: infrastructure/postgres/spatial-v3-production-readiness.js.
const readiness = {
  status: 'ok',
  composition: 'spatial_v3_production',
  activation: 'sole_owner',
  world_readiness: {
    status: 'ready', world_revision_id: 'world-health-fixture',
    runtime_catalog_activation_event_id: 'activation-health-fixture',
    historical_activation_count: 1
  },
  migration_readiness: {
    party_count: 1, incompatible_party_count: 0,
    historical_pin_count: 1, status: 'ready'
  },
  dependencies: {
    world_database: { label: 'world_base', ok: true, duration_ms: 1,
      database_name: 'world_fixture', user_name: 'fixture' },
    party_database: { label: 'party_runtime', ok: true, duration_ms: 1,
      database_name: 'party_fixture', user_name: 'fixture' }
  }
};
const requestId = 'health-acceptance';

async function get(root, url) {
  const request = Readable.from([]);
  Object.assign(request, { method: 'GET', url,
    headers: { host: 'localhost', 'x-request-id': requestId } });
  const response = {
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(value) { this.body = JSON.parse(value); }
  };
  await createHttpHandler({ root })(request, response);
  return response;
}

for (const [name, data] of [
  ['world readiness alone', { status: 'ok', world_readiness: { status: 'ready' } }],
  ['production-shaped nested readiness', readiness]
]) {
  test(`health: ${name} preserves the operational success envelope`, async (t) => {
    const failures = [];
    t.mock.method(console, 'error', (_message, error) => {
      failures.push({ code: error?.code, details: error?.details });
    });
    const before = structuredClone(data);
    const response = await get({ health: () => data }, '/api/v1/health');
    assert.equal(response.status, 200, JSON.stringify(failures));
    assert.deepEqual(response.body, {
      version: 1, schema: 'rus_api_success', ok: true,
      request_id: requestId, data: before
    });
    assert.deepEqual(data, before, 'operational DTO must not be mutated');
    assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.deepEqual(failures, []);
  });
}

for (const [name, screen] of [
  ['the same nested readiness DTO', readiness],
  ['the same status in player prose', {
    main_prose: 'В записке сказано: «status: ready».', screen_status: 'ready'
  }]
]) {
  test(`health exception stays route-specific: game screen rejects ${name}`, async (t) => {
    const failures = [];
    t.mock.method(console, 'error', (_message, error) => failures.push(error));
    const response = await get({ getPartyScreen: () => screen },
      '/api/v1/parties/party-health/screen');
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, {
      version: 1, schema: 'rus_api_error', ok: false, request_id: requestId,
      error: { code: 'TEMPORARY_ACTION_UNAVAILABLE',
        message: 'Действие временно недоступно. Попробуйте ещё раз.' }
    });
    assert.equal(failures.length, 1);
    assert.equal(failures[0].code, 'PUBLIC_PAYLOAD_SERVICE_TEXT');
    assert.equal(failures[0].details.category, 'data_status');
    assert.equal(Object.hasOwn(response.body, 'data'), false);
    assert.doesNotMatch(JSON.stringify(response.body), /ready|PUBLIC_PAYLOAD_SERVICE_TEXT/u);
  });
}

test('health exception leaves a valid player screen envelope unchanged', async () => {
  const screen = { screen_status: 'ready', main_prose: 'Перед вами деревянный настил.' };
  const response = await get({ getPartyScreen: () => screen },
    '/api/v1/parties/party-health/screen');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    version: 1, schema: 'rus_api_success', ok: true, request_id: requestId, data: screen
  });
});
