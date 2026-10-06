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

test('fresh-schema attestation gate selects the approval matching the current request', async () => {
  const requestBytes = await readFile(REQUEST_FILE);
  const requestDigest = computeFreshSchemaRequestDigest(requestBytes);
  const request = JSON.parse(requestBytes);

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
  await copyFile(
    join(REPO_V17, 'fresh-schema-approval-attestation-v4.json'),
    join(legacyOnlyDir, 'fresh-schema-approval-attestation-v4.json')
  );
  await copyFile(
    join(REPO_V17, 'fresh-schema-approval-attestation-v5.json'),
    join(legacyOnlyDir, 'fresh-schema-approval-attestation-v5.json')
  );
  await copyFile(
    join(REPO_V17, 'fresh-schema-approval-attestation-v6.json'),
    join(legacyOnlyDir, 'fresh-schema-approval-attestation-v6.json')
  );
  await copyFile(
    join(REPO_V17, 'fresh-schema-approval-attestation-v7.json'),
    join(legacyOnlyDir, 'fresh-schema-approval-attestation-v7.json')
  );
  await assert.rejects(
    () => loadFreshSchemaAttestationFromRepo({
      requestDigest,
      catalogDir: legacyOnlyDir
    }),
    /V17_FRESH_SCHEMA_ATTESTATION_REQUIRED/u,
    'historical v1–v7 must not authorize the current request digest'
  );
  await rm(legacyOnlyDir, { recursive: true, force: true });

  // POST-SYNC REVIEW FOLLOW-UP: rebuild the request after the exact sync commit and
  // add the newly approved matching attestation before this success path can pass.
  const selected = await loadFreshSchemaAttestationFromRepo({ requestDigest });
  assert.equal(selected.request_digest, requestDigest);
  assert.equal(selected.verdict, 'APPROVE_CONDITIONAL');
  assert.equal(selected.scope.expected_world_base_tables, 224);
  assert.equal(selected.scope.expected_party_migrations_applied,
    request.party_schema.ordered_migrations.length);

  const ambiguousDir = await mkdtemp(join(tmpdir(), 'novgorod-fresh-gate-ambiguous-'));
  const selectedBytes = JSON.stringify(selected);
  await writeFile(join(ambiguousDir, 'fresh-schema-approval-attestation-current-a.json'), selectedBytes);
  await writeFile(join(ambiguousDir, 'fresh-schema-approval-attestation-current-b.json'), selectedBytes);
  await assert.rejects(
    () => loadFreshSchemaAttestationFromRepo({ requestDigest, catalogDir: ambiguousDir }),
    /V17_FRESH_SCHEMA_ATTESTATION_AMBIGUOUS/u
  );
  await rm(ambiguousDir, { recursive: true, force: true });
});

test('checkV17BootstrapInputs passes fresh-schema gate on committed catalog', async () => {
  await checkV17BootstrapInputs();
});
