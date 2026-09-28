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

test('fresh-schema attestation gate selects v4 for current request digest', async () => {
  const requestBytes = await readFile(REQUEST_FILE);
  const requestDigest = computeFreshSchemaRequestDigest(requestBytes);
  assert.equal(requestDigest, 'ba989f536c7532dec5c0eee0aefeed75733e70f0b4f19fae48520978e3a091da');

  const legacyOnlyDir = await mkdtemp(join(tmpdir(), 'novgorod-fresh-gate-legacy-'));
  await copyFile(
    join(REPO_V17, 'fresh-schema-approval-attestation.json'),
    join(legacyOnlyDir, 'fresh-schema-approval-attestation.json')
  );
  await copyFile(
    join(REPO_V17, 'fresh-schema-approval-attestation-v2.json'),
    join(legacyOnlyDir, 'fresh-schema-approval-attestation-v2.json')
  );
  await copyFile(
    join(REPO_V17, 'fresh-schema-approval-attestation-v3.json'),
    join(legacyOnlyDir, 'fresh-schema-approval-attestation-v3.json')
  );
  await assert.rejects(
    () => loadFreshSchemaAttestationFromRepo({
      requestDigest,
      catalogDir: legacyOnlyDir
    }),
    /V17_FRESH_SCHEMA_ATTESTATION_REQUIRED/u,
    'historical v1–v3 must not authorize the current request digest'
  );
  await rm(legacyOnlyDir, { recursive: true, force: true });

  const v4Dir = await mkdtemp(join(tmpdir(), 'novgorod-fresh-gate-v4-'));
  await copyFile(
    join(REPO_V17, 'fresh-schema-approval-attestation-v4.json'),
    join(v4Dir, 'fresh-schema-approval-attestation-v4.json')
  );
  const selected = await loadFreshSchemaAttestationFromRepo({
    requestDigest,
    catalogDir: v4Dir
  });
  assert.equal(selected.request_digest, requestDigest);
  assert.equal(selected.verdict, 'APPROVE_CONDITIONAL');
  assert.equal(selected.scope.expected_world_base_tables, 219);
  await rm(v4Dir, { recursive: true, force: true });

  const ambiguousDir = await mkdtemp(join(tmpdir(), 'novgorod-fresh-gate-ambiguous-'));
  const v4Bytes = await readFile(join(REPO_V17, 'fresh-schema-approval-attestation-v4.json'), 'utf8');
  await writeFile(join(ambiguousDir, 'fresh-schema-approval-attestation-v4a.json'), v4Bytes);
  await writeFile(join(ambiguousDir, 'fresh-schema-approval-attestation-v4b.json'), v4Bytes);
  await assert.rejects(
    () => loadFreshSchemaAttestationFromRepo({ requestDigest, catalogDir: ambiguousDir }),
    /V17_FRESH_SCHEMA_ATTESTATION_AMBIGUOUS/u
  );
  await rm(ambiguousDir, { recursive: true, force: true });
});

test('checkV17BootstrapInputs passes fresh-schema gate on committed catalog', async () => {
  await checkV17BootstrapInputs();
});
