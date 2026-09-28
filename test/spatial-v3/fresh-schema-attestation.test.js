import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  assertV17FreshSchemaAttestation,
  computeFreshSchemaRequestDigest,
  loadFreshSchemaAttestationFromRepo
} from '../../scripts/bootstrap-live-world-v17.mjs';

const REQUEST_PATH =
  'data/world-catalogs/novgorod/live-world-runtime-v17/fresh-schema-request.json';
const REQUEST_FILE = resolve(REQUEST_PATH);

test('fresh-schema attestation gate refuses missing, ambiguous and mismatched digest', async () => {
  const requestBytes = await readFile(REQUEST_FILE);
  const requestDigest = computeFreshSchemaRequestDigest(requestBytes);
  const valid = {
    schema: 'rus.live_world_runtime_v17_fresh_schema_approval.v1',
    verdict: 'APPROVE_CONDITIONAL',
    request_path: REQUEST_PATH,
    request_digest: requestDigest
  };
  assert.throws(
    () => assertV17FreshSchemaAttestation({ requestDigest, attestation: null }),
    /V17_FRESH_SCHEMA_ATTESTATION_REQUIRED/u
  );
  assert.throws(
    () => assertV17FreshSchemaAttestation({
      requestDigest,
      attestation: { ...valid, request_digest: 'b'.repeat(64) }
    }),
    /V17_FRESH_SCHEMA_ATTESTATION_DIGEST_MISMATCH/u
  );
  assert.throws(
    () => assertV17FreshSchemaAttestation({
      requestDigest,
      attestation: { ...valid, verdict: 'REJECT' }
    }),
    /V17_FRESH_SCHEMA_ATTESTATION_VERDICT_REJECTED/u
  );
  assert.throws(
    () => assertV17FreshSchemaAttestation({
      requestDigest,
      attestation: { ...valid, request_path: 'other/path.json' }
    }),
    /V17_FRESH_SCHEMA_ATTESTATION_REQUEST_PATH_MISMATCH/u
  );
  assertV17FreshSchemaAttestation({ requestDigest, attestation: valid });

  const emptyDir = await mkdtemp(join(tmpdir(), 'novgorod-fresh-attest-empty-'));
  await assert.rejects(
    () => loadFreshSchemaAttestationFromRepo({
      requestDigest,
      catalogDir: emptyDir
    }),
    /V17_FRESH_SCHEMA_ATTESTATION_REQUIRED/u
  );
  await rm(emptyDir, { recursive: true, force: true });

  const catalogDir = await mkdtemp(join(tmpdir(), 'novgorod-fresh-attest-'));
  const writeAttestation = async (name, digest) => writeFile(
    join(catalogDir, name),
    `${JSON.stringify({ ...valid, request_digest: digest }, null, 2)}\n`
  );
  await writeAttestation('fresh-schema-approval-attestation-a.json', requestDigest);
  await writeAttestation('fresh-schema-approval-attestation-b.json', requestDigest);
  await assert.rejects(
    () => loadFreshSchemaAttestationFromRepo({ requestDigest, catalogDir }),
    /V17_FRESH_SCHEMA_ATTESTATION_AMBIGUOUS/u
  );
  await rm(catalogDir, { recursive: true, force: true });

  const v2Digest = createHash('sha256').update('historical-request').digest('hex');
  const repoDir = resolve('data/world-catalogs/novgorod/live-world-runtime-v17');
  await assert.rejects(
    () => loadFreshSchemaAttestationFromRepo({
      requestDigest: v2Digest,
      catalogDir: repoDir
    }),
    /V17_FRESH_SCHEMA_ATTESTATION_REQUIRED/u,
    'committed v2 attestation must not match a different request digest'
  );
});

test('fresh-schema attestation positive match in temp catalog dir', async () => {
  const requestBytes = await readFile(REQUEST_FILE);
  const requestDigest = computeFreshSchemaRequestDigest(requestBytes);
  const catalogDir = await mkdtemp(join(tmpdir(), 'novgorod-fresh-attest-ok-'));
  await writeFile(join(catalogDir, 'fresh-schema-approval-attestation-test.json'),
    `${JSON.stringify({
      schema: 'rus.live_world_runtime_v17_fresh_schema_approval.v1',
      verdict: 'APPROVE',
      request_path: REQUEST_PATH,
      request_digest: requestDigest
    }, null, 2)}\n`);
  const attestation = await loadFreshSchemaAttestationFromRepo({
    requestDigest,
    catalogDir
  });
  assertV17FreshSchemaAttestation({ requestDigest, attestation });
  await rm(catalogDir, { recursive: true, force: true });
});
