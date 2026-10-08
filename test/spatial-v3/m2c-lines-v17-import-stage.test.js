import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { assertLinesImportAttestation, buildLinesImportRequest,
  LINES_IMPORT_ATTESTATION_SCHEMA, runLinesImportStage } from '../../scripts/v17-m2c-lines-import-stage.mjs';

const manifestPath = 'data/world-catalogs/novgorod/m2c-lines-v1-import-manifest.json';
const manifestSha256 = '169c6f14fff46e39e1c88535c68b5adc4406b6db76528ffd67381632eb5aba65';
const approvalPath = 'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-lines-v1/approval-attestation.json';

test('line import request pins approved source but leaves import gate pending', async () => {
  const request = await buildLinesImportRequest({ manifestPath, manifestSha256, approvalPath });
  assert.equal(request.request.status, 'pending_independent_review');
  assert.equal(request.request.independent_import_attestation, null);
  assert.equal(request.request.approved_data.manifest_status_in_repository, 'draft');
  assert.equal(request.request.sql.commit_sha256.length, 64);
  assert.equal(request.request.sql.rollback_sha256.length, 64);
  assert.equal(request.request.expected_readback.by_table.spatial_v3_canonical_g5_connection_bindings, 454);
  assert.throws(() => assertLinesImportAttestation(request.request, null),
    /V17_LINES_IMPORT_ATTESTATION_REQUIRED/u);
  const authoringApproval = JSON.parse(await readFile(approvalPath, 'utf8'));
  assert.throws(() => assertLinesImportAttestation(request.request, authoringApproval),
    /V17_LINES_IMPORT_ATTESTATION_INDEPENDENCE_REQUIRED/u);

  const sql = [];
  let emitted;
  await assert.rejects(() => runLinesImportStage({ world: { async query(statement) {
    sql.push(statement);
    return statement.startsWith('SELECT count(*)') ? { rows: [{ count: '0' }] } : { rows: [] };
  } }, manifestPath, manifestSha256, approvalPath,
  requireAttestation: async (stage, value) => { assert.equal(stage, 'm2c_lines_import'); emitted = value; return undefined; } }),
  /V17_LINES_IMPORT_ATTESTATION_REQUIRED/u);
  assert.equal(emitted.status, 'pending_independent_review');
  assert.equal(sql.filter((statement) => statement.startsWith('BEGIN;')).length, 1,
    'only rollback probe ran before absent independent approval stopped cutover');
});

test('line import gate requires independent authorization for exact request digest', async () => {
  const request = await buildLinesImportRequest({ manifestPath, manifestSha256, approvalPath });
  const approved = { schema: LINES_IMPORT_ATTESTATION_SCHEMA, decision: 'APPROVE',
    request_digest: request.request.request_digest, attested_by: 'independent-reviewer',
    independence_basis: 'Reviewed exact import request', import_authorized: true, database_mutated: false };
  assert.equal(assertLinesImportAttestation(request.request, approved), approved);
  assert.throws(() => assertLinesImportAttestation(request.request, { ...approved, request_digest: '0'.repeat(64) }),
    /V17_LINES_IMPORT_ATTESTATION_DIGEST_MISMATCH/u);
  assert.throws(() => assertLinesImportAttestation(request.request, { ...approved, import_authorized: false }),
    /V17_LINES_IMPORT_ATTESTATION_AUTHORITY_MISMATCH/u);
});
