import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  checkV17BootstrapInputs,
  computeFreshSchemaRequestDigest,
  loadFreshSchemaAttestationFromRepo
} from '../../scripts/bootstrap-live-world-v17.mjs';

const REQUEST_PATH =
  'data/world-catalogs/novgorod/live-world-runtime-v17/fresh-schema-request.json';
const REQUEST_FILE = resolve(REQUEST_PATH);
const REPO_V17 = resolve('data/world-catalogs/novgorod/live-world-runtime-v17');

test('fresh-schema attestation gate on temp catalog dir (not committed v17 contents)', async () => {
  const requestBytes = await readFile(REQUEST_FILE);
  const requestDigest = computeFreshSchemaRequestDigest(requestBytes);

  const legacyOnlyDir = await mkdtemp(join(tmpdir(), 'novgorod-fresh-gate-legacy-'));
  await copyFile(
    join(REPO_V17, 'fresh-schema-approval-attestation.json'),
    join(legacyOnlyDir, 'fresh-schema-approval-attestation.json')
  );
  await copyFile(
    join(REPO_V17, 'fresh-schema-approval-attestation-v2.json'),
    join(legacyOnlyDir, 'fresh-schema-approval-attestation-v2.json')
  );
  await assert.rejects(
    () => loadFreshSchemaAttestationFromRepo({
      requestDigest,
      catalogDir: legacyOnlyDir
    }),
    /V17_FRESH_SCHEMA_ATTESTATION_REQUIRED/u,
    'v1+v2 history must not authorize the current request digest'
  );
  await rm(legacyOnlyDir, { recursive: true, force: true });

  const v3Dir = await mkdtemp(join(tmpdir(), 'novgorod-fresh-gate-v3-'));
  await copyFile(
    join(REPO_V17, 'fresh-schema-approval-attestation-v3.json'),
    join(v3Dir, 'fresh-schema-approval-attestation-v3.json')
  );
  const selected = await loadFreshSchemaAttestationFromRepo({
    requestDigest,
    catalogDir: v3Dir
  });
  assert.equal(selected.request_digest, requestDigest);
  assert.equal(selected.verdict, 'APPROVE_CONDITIONAL');
  await rm(v3Dir, { recursive: true, force: true });

  const ambiguousDir = await mkdtemp(join(tmpdir(), 'novgorod-fresh-gate-ambiguous-'));
  const v3Bytes = await readFile(join(REPO_V17, 'fresh-schema-approval-attestation-v3.json'), 'utf8');
  await writeFile(join(ambiguousDir, 'fresh-schema-approval-attestation-v3a.json'), v3Bytes);
  await writeFile(join(ambiguousDir, 'fresh-schema-approval-attestation-v3b.json'), v3Bytes);
  await assert.rejects(
    () => loadFreshSchemaAttestationFromRepo({ requestDigest, catalogDir: ambiguousDir }),
    /V17_FRESH_SCHEMA_ATTESTATION_AMBIGUOUS/u
  );
  await rm(ambiguousDir, { recursive: true, force: true });
});

test('checkV17BootstrapInputs passes fresh-schema gate on committed catalog', async () => {
  await checkV17BootstrapInputs();
});
