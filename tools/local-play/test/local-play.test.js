import assert from 'node:assert/strict';
import test from 'node:test';

import { assertReadiness, buildServerEnv, startLocalPlay, validateLocalPlay } from '../local-play.js';

const digest = 'a'.repeat(64);

test('buildServerEnv fixes v14 settings and removes legacy variables', () => {
  const env = buildServerEnv({ env: { RUS_RUNTIME_BINDINGS_MODULE: 'old', RUS_RUN_PARTY_MIGRATIONS: '1', KEEP: 'yes' }, worldUrl: 'world', partyUrl: 'party', pinManifestDigest: digest, port: 3001 });
  assert.equal(env.RUS_CUTOVER_STAGE, '13');
  assert.equal(env.RUS_SPATIAL_V3_BINDINGS_MODULE, 'builtin:spatial-v3-production-v14');
  assert.equal(env.RUS_RUNTIME_BINDINGS_MODULE, undefined);
  assert.equal(env.RUS_RUN_PARTY_MIGRATIONS, undefined);
  assert.equal(env.RUS_TURN_DECISION_SECRET, 'novgorod1230-local-play-decision-secret-v1');
  assert.equal(env.KEEP, 'yes');
});

test('readiness rejects wrong release, activation, and unavailable scenario', async () => {
  await assert.rejects(assertReadiness({ baseUrl: 'http://test', attempts: 1, fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, data: { status: 'ok' } }) }) }), { code: 'LOCAL_PLAY_READINESS_FAILED' });
  const health = { status: 'ok', release_id: 'spatial-v3-production-v14', activation: 'sole_owner', authoritative_reads: 'spatial_v3_only', authoritative_writes: 'spatial_v3_only', runtime_fallback: 'forbidden', production_activation: true, runtime_selectable_in_canonical_production: true };
  await assert.rejects(assertReadiness({ baseUrl: 'http://test', attempts: 1, fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, data: { ...health, activation: 'legacy' } }) }) }), { code: 'LOCAL_PLAY_READINESS_FAILED' });
  let calls = 0;
  await assert.rejects(assertReadiness({ baseUrl: 'http://test', attempts: 1, fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, data: calls++ ? { scenarios: [] } : health }) }) }), { code: 'LOCAL_PLAY_SCENARIO_UNAVAILABLE' });
});

test('validation and preflight fail before PostgreSQL setup', async () => {
  assert.throws(() => validateLocalPlay({ env: { DEEPSEEK_API_KEY: 'x', RUS_SERVER_PORT: '0' }, nodeVersion: '22.0.0' }), { code: 'LOCAL_PLAY_PORT_INVALID' });
  let postgresCalled = false;
  const order = [];
  await assert.rejects(startLocalPlay({ env: { DEEPSEEK_API_KEY: 'x' }, checkDocker: () => order.push('docker'), providerProbe: async () => { order.push('provider'); return { ok: false }; }, ensurePostgres: async () => { postgresCalled = true; }, isPortAvailable: async () => { order.push('port'); return true; } }), { code: 'LOCAL_PLAY_PROVIDER_UNAVAILABLE' });
  assert.equal(postgresCalled, false);
  assert.deepEqual(order, ['docker', 'port', 'provider']);
});

test('occupied port fails before provider preflight and PostgreSQL setup', async () => {
  let providerCalled = false;
  let postgresCalled = false;
  await assert.rejects(startLocalPlay({
    env: { DEEPSEEK_API_KEY: 'x' },
    checkDocker: () => {},
    isPortAvailable: async () => false,
    providerProbe: async () => { providerCalled = true; return { ok: true }; },
    ensurePostgres: async () => { postgresCalled = true; }
  }), { code: 'LOCAL_PLAY_PORT_UNAVAILABLE' });
  assert.equal(providerCalled, false);
  assert.equal(postgresCalled, false);
});

test('provider preflight classifies unauthorized safely', async () => {
  await assertProviderFailure('http_401', 'LOCAL_PLAY_PROVIDER_UNAUTHORIZED');
  await assertProviderFailure('http_403', 'LOCAL_PLAY_PROVIDER_UNAUTHORIZED');
});

test('provider preflight classifies timeout safely', async () => {
  await assertProviderFailure('timeout', 'LOCAL_PLAY_PROVIDER_TIMEOUT');
});

test('provider preflight classifies unavailable safely', async () => {
  await assertProviderFailure('transport_error', 'LOCAL_PLAY_PROVIDER_UNAVAILABLE');
});

test('readiness reports server exit', async () => {
  await assert.rejects(assertReadiness({ baseUrl: 'http://test', attempts: 1, child: { exitCode: 1 } }), { code: 'LOCAL_PLAY_SERVER_EXITED' });
});

async function assertProviderFailure(providerCode, expectedCode) {
  const cause = new Error('provider response body and key must not be printed');
  cause.code = providerCode;
  await assert.rejects(startLocalPlay({
    env: { DEEPSEEK_API_KEY: 'secret' },
    checkDocker: () => {},
    providerProbe: async () => { throw cause; },
    isPortAvailable: async () => true
  }), (error) => error.code === expectedCode
    && !error.message.includes(cause.message)
    && !error.message.includes('secret')
    && error.cause === undefined);
}
