import assert from 'node:assert/strict';
import test from 'node:test';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { createTemporalPresentationPostgresStore } from '../../apps/game-server/src/infrastructure/postgres/temporal-presentation-store.js';

const pkg = { package_id: 'pkg', party_id: 'party', package_digest: 'd', visible_payload: { safe: true } };
const job = (overrides = {}) => ({ job_id: 'narration-job:pkg', party_id: 'party', package_id: 'pkg', idempotency_key: 'presentation:pkg:d', status: 'pending', next_attempt_ordinal: 0, active_attempt_id: null, claim_token: null, lease_expires_at: null, narration_output: null, output_digest: null, state_version: 1, ...overrides });
const narrationPayload = { party_id: 'party', kind: 'approved_narration', package_digest: 'd', text: 'x', dependency_pins: { pins: [], canonical_digest: 'a'.repeat(64) } };
const narration = { ...narrationPayload, canonical_digest: computeSpatialV3CanonicalDigest(narrationPayload) };
function mock(rows = []) { const calls = []; return { calls, async connect() { return { query: async (sql, params) => { calls.push({ sql, params }); if (/^(BEGIN|COMMIT|ROLLBACK)$/u.test(sql)) return { rows: [], rowCount: 0 }; const next = rows.shift(); return typeof next === 'function' ? next(sql, params) : (next ?? { rows: [], rowCount: 1 }); }, release() {} }; }, async query(sql, params) { calls.push({ sql, params }); return rows.shift() ?? { rows: [], rowCount: 0 }; } }; }
const input = { party_id: 'party', package_id: 'pkg', package_digest: 'd', presentation_idempotency_key: 'presentation:pkg:d' };

test('presentation store loads only the exact immutable visible package', async () => {
  const pool = mock([{ rows: [pkg], rowCount: 1 }]); const store = createTemporalPresentationPostgresStore({ pool });
  assert.deepEqual(await store.loadCommittedVisiblePackage(input), { ok: true, envelope: pkg });
  assert.match(pool.calls[0].sql, /package_digest=\$3/); assert.doesNotMatch(pool.calls[0].sql, /FOR UPDATE/);
});

test('claim serializes a live attempt and claims pending state with CAS', async () => {
  const live = mock([{},{ rows: [pkg], rowCount: 1 }, { rows: [job({ status: 'in_progress', active_attempt_id: 'a', lease_expires_at: '2030-01-01T00:00:01Z' })], rowCount: 1 }]);
  const store = createTemporalPresentationPostgresStore({ pool: live, now: () => new Date('2030-01-01T00:00:00Z') });
  assert.equal((await store.claimPresentationAttempt(input)).disposition, 'in_progress');
  const pending = mock([{},{ rows: [pkg], rowCount: 1 }, { rows: [job()], rowCount: 1 }, { rowCount: 1, rows: [] }]);
  const claimed = await createTemporalPresentationPostgresStore({ pool: pending, now: () => new Date('2030-01-01T00:00:00Z') }).claimPresentationAttempt(input);
  assert.deepEqual(claimed, { ok: true, disposition: 'claimed', attempt_id: 'narration-job:pkg:attempt:0', claim_token: 'claim:narration-job:pkg:0' });
  assert.ok(pending.calls.some(({ sql }) => /FOR KEY SHARE/.test(sql))); assert.ok(pending.calls.some(({ sql }) => /FOR UPDATE/.test(sql))); assert.ok(pending.calls.some(({ sql }) => /state_version=\$7/.test(sql)));
});

test('expired lease is audited and reclaimed with the next exact attempt ordinal', async () => {
  const expired = job({
    status: 'in_progress',
    next_attempt_ordinal: 1,
    active_attempt_id: 'narration-job:pkg:attempt:0',
    claim_token: 'claim:narration-job:pkg:0',
    lease_expires_at: '2029-12-31T23:59:59Z',
    state_version: '4'
  });
  const pool = mock([
    {},
    { rows: [pkg], rowCount: 1 },
    { rows: [expired], rowCount: 1 },
    { rowCount: 1, rows: [] },
    { rowCount: 1, rows: [] },
    { rowCount: 1, rows: [] }
  ]);
  const claimed = await createTemporalPresentationPostgresStore({
    pool,
    now: () => new Date('2030-01-01T00:00:00Z')
  }).claimPresentationAttempt(input);
  assert.deepEqual(claimed, {
    ok: true,
    disposition: 'claimed',
    attempt_id: 'narration-job:pkg:attempt:1',
    claim_token: 'claim:narration-job:pkg:1'
  });
  assert.ok(pool.calls.some(({ sql, params }) => /INSERT INTO party_runtime\.party_narration_attempts/u.test(sql) && params[2] === 0));
  assert.ok(pool.calls.some(({ sql, params }) => /status=\$6 AND state_version=\$7/u.test(sql) && params[6] === 5));
});

test('output persistence is a claim-token CAS and finalization appends the outcome', async () => {
  const inProgress = job({ status: 'in_progress', next_attempt_ordinal: 1, active_attempt_id: 'narration-job:pkg:attempt:0', claim_token: 'claim:narration-job:pkg:0' });
  const pool = mock([{},{ rows: [pkg], rowCount: 1 }, { rows: [inProgress], rowCount: 1 }, { rows: [{ next_attempt_ordinal: 1 }], rowCount: 1 }]);
  const store = createTemporalPresentationPostgresStore({ pool });
  const output = await store.persistNarrationOutput({ ...input, attempt_id: inProgress.active_attempt_id, claim_token: inProgress.claim_token, narration_result: narration, output_digest: narration.canonical_digest });
  assert.equal(output.disposition, 'output_ready'); assert.ok(pool.calls.some(({ sql }) => /claim_token=\$5/.test(sql)));
  const ready = job({ status: 'output_ready', next_attempt_ordinal: 1, narration_output: narration, output_digest: narration.canonical_digest });
  const finalizedPool = mock([{},{ rows: [pkg], rowCount: 1 }, { rows: [ready], rowCount: 1 }, { rowCount: 1, rows: [] }, { rowCount: 1, rows: [] }]);
  const finalized = await createTemporalPresentationPostgresStore({ pool: finalizedPool }).finalizePresentationAttempt({ ...input, attempt_id: 'narration-job:pkg:attempt:0', presentation_status: 'delivered', output_digest: narration.canonical_digest });
  assert.equal(finalized.presentation_status, 'delivered'); assert.ok(finalizedPool.calls.some(({ sql }) => /party_narration_attempts/.test(sql)));
});

test('mutation rolls back when the locked job disappears', async () => {
  const pool = mock([{},{ rows: [pkg], rowCount: 1 }, { rows: [], rowCount: 0 }]);
  await assert.rejects(() => createTemporalPresentationPostgresStore({ pool }).persistNarrationOutput({ ...input, attempt_id: 'a', claim_token: 't', narration_result: narration, output_digest: narration.canonical_digest }));
  assert.ok(pool.calls.some(({ sql }) => sql === 'ROLLBACK'));
});
