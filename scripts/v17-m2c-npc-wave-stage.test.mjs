import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  WAVE_DIR,
  assertWaveAttestation,
  assertWaveInputs,
  buildWaveImportSql,
  computeWaveRequestDigest,
  readWaveRequest,
  WAVE_ATTESTATION_SCHEMA,
} from './v17-m2c-npc-wave-stage.mjs';

const root = new URL('..', import.meta.url).pathname;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('wave request digest covers its body', async () => {
  const request = await readWaveRequest(root);
  assert.equal(request.request_digest, computeWaveRequestDigest(request));
  assert.notEqual(computeWaveRequestDigest({ ...request, activation: 'auto' }), request.request_digest);
});

test('wave request pins the reviewed files, datasets and the excluded environment rules', async () => {
  const request = await readWaveRequest(root);
  await assertWaveInputs({ root, request });
  const rules = JSON.parse(await readFile(`${root}${WAVE_DIR}/datasets/presence_rules.json`, 'utf8'));
  assert.equal(request.approved_data.excluded_environment_presence_rules, 1236);
  assert.ok(rules.every((rule) => ['category', 'social_role', 'occupation'].includes(rule.subject_kind)));
  assert.equal(request.approved_data.datasets.find((row) => row.table === 'presence_rules').rows, rules.length);
});

test('tampered pins are rejected', async () => {
  const request = await readWaveRequest(root);
  const redigest = (value) => ({ ...value, request_digest: computeWaveRequestDigest(value) });
  const bad = structuredClone(request);
  bad.approved_data.manifest_sha256 = 'f'.repeat(64);
  await assert.rejects(assertWaveInputs({ root, request: bad }), /V17_M2C_WAVE_REQUEST_DIGEST_MISMATCH/u);
  await assert.rejects(assertWaveInputs({ root, request: redigest(bad) }), /V17_M2C_WAVE_PIN_MISMATCH:manifest/u);
  const badDataset = structuredClone(request);
  badDataset.approved_data.datasets[0].sha256 = '0'.repeat(64);
  await assert.rejects(assertWaveInputs({ root, request: redigest(badDataset) }), /V17_M2C_WAVE_PIN_MISMATCH:dataset/u);
  const badSql = structuredClone(request);
  badSql.sql.commit_sha256 = '1'.repeat(64);
  await assert.rejects(assertWaveInputs({ root, request: redigest(badSql) }), /V17_M2C_WAVE_SQL_MISMATCH:commit/u);
});

test('the stage opens the gate only in a temporary copy: the repository manifest stays draft', async () => {
  const before = await readFile(`${root}${WAVE_DIR}/manifest.json`);
  assert.equal(JSON.parse(before).status, 'draft');
  const first = await buildWaveImportSql({ root });
  const second = await buildWaveImportSql({ root });
  assert.equal(sha256(first.commit), sha256(second.commit), 'SQL does not depend on the temporary directory');
  assert.match(first.commit, /COMMIT;\n$/u);
  assert.match(first.rollback, /ROLLBACK;\n$/u);
  assert.equal(first.commit.slice(0, -'COMMIT;\n'.length), first.rollback.slice(0, -'ROLLBACK;\n'.length));
  assert.deepEqual(await readFile(`${root}${WAVE_DIR}/manifest.json`), before);
});

test('only an approving attestation of this exact request is accepted', async () => {
  const request = await readWaveRequest(root);
  const good = { schema: WAVE_ATTESTATION_SCHEMA, verdict: 'APPROVE', request_digest: request.request_digest };
  assert.equal(assertWaveAttestation(request, good), good);
  for (const [patch, code] of [
    [{ schema: 'other' }, 'V17_M2C_WAVE_ATTESTATION_SCHEMA_MISMATCH'],
    [{ verdict: 'REJECT' }, 'V17_M2C_WAVE_ATTESTATION_VERDICT_REJECTED'],
    [{ request_digest: '2'.repeat(64) }, 'V17_M2C_WAVE_ATTESTATION_DIGEST_MISMATCH'],
  ]) assert.throws(() => assertWaveAttestation(request, { ...good, ...patch }), new RegExp(code, 'u'));
  assert.throws(() => assertWaveAttestation(request, null), /V17_M2C_WAVE_ATTESTATION_REQUIRED/u);
});
