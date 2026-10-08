import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildImportWithReadbackSql } from '../tools/spatial-v3/p12-authoring-importer.mjs';

const ROOT = resolve(import.meta.dirname, '..');
export const LINES_IMPORT_ATTESTATION_SCHEMA = 'rus.m2c_lines_v1_v17_import_approval.v1';
export const LINES_IMPORT_REQUEST_ID = 'novgorod_m2c_lines_v1_v17_import_001';
export const LINES_IMPORT_EXPECTED_ROWS = Object.freeze({
  source_records: 1,
  spatial_v3_authoring_versions: 471,
  spatial_v3_transition_environment_profiles: 1,
  spatial_v3_movement_method_cost_profiles: 8,
  spatial_v3_movement_method_cost_options: 11,
  spatial_v3_line_kind_profiles: 8,
  spatial_v3_line_kind_alternative_methods: 3,
  spatial_v3_canonical_g5_connection_bindings: 454,
  spatial_v3_authoring_dependency_edges: 1394
});

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonicalize = (value) => value === null || typeof value !== 'object' ? value
  : Array.isArray(value) ? value.map(canonicalize)
    : Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
export const computeLinesImportRequestDigest = (request) => {
  const { request_digest: _claimed, ...body } = request;
  return sha256(JSON.stringify(canonicalize(body)));
};

export async function buildLinesImportRequest({ root = ROOT, manifestPath,
  manifestSha256, approvalPath, expectedRows = LINES_IMPORT_EXPECTED_ROWS } = {}) {
  if (typeof manifestPath !== 'string' || typeof manifestSha256 !== 'string'
      || typeof approvalPath !== 'string') throw new Error('V17_LINES_IMPORT_PINS_REQUIRED');
  const manifestBytes = await readFile(resolve(root, manifestPath));
  if (sha256(manifestBytes) !== manifestSha256) throw new Error('V17_LINES_IMPORT_PIN_MISMATCH:manifest');
  const approvalBytes = await readFile(resolve(root, approvalPath));
  const approval = JSON.parse(approvalBytes);
  if (approval.schema !== 'rus.m2c_lines_v1_authoring_approval.v1'
      || approval.decision !== 'APPROVE_WITH_LIMITS'
      || approval.import_authorized !== false || approval.activation_authorized !== false
      || approval.import_manifest_sha256 !== manifestSha256) {
    throw new Error('V17_LINES_IMPORT_AUTHORING_APPROVAL_MISMATCH');
  }
  const manifest = JSON.parse(manifestBytes);
  const sql = await buildImportWithReadbackSql({ root, manifestPath,
    temporaryTablePrefix: 'm2c_lines_v17', readbackTemporaryTablePrefix: 'm2c_lines_v17_readback' });
  if (!sql.endsWith('COMMIT;\n')) throw new Error('V17_LINES_IMPORT_SQL_SHAPE_INVALID');
  const rollback = `${sql.slice(0, -'COMMIT;\n'.length)}ROLLBACK;\n`;
  const request = {
    schema: 'rus.m2c_lines_v1_v17_import_request.v1',
    request_id: LINES_IMPORT_REQUEST_ID,
    status: 'pending_independent_review',
    operation: 'insert_only',
    transaction: 'single_world_base_transaction',
    target: { database: 'novgorod_world_v17', schema: 'world_base',
      created_by: 'scripts/bootstrap-live-world-v17.mjs (fresh pair only)' },
    approved_data: {
      manifest_path: manifestPath, manifest_sha256: manifestSha256,
      manifest_status_in_repository: manifest.status,
      authoring_approval_path: approvalPath, authoring_approval_sha256: sha256(approvalBytes),
      world_revision_id: manifest.world_revision_id,
      datasets: await Promise.all(manifest.datasets.map(async ({ table, file, sha256: digest }) => ({ table, file,
        sha256: digest, rows: JSON.parse((await requireDatasetBytes(root, manifestPath, file)).toString()).length })))
    },
    sql: { builder_path: 'scripts/v17-m2c-lines-import-stage.mjs',
      importer_path: 'tools/spatial-v3/p12-authoring-importer.mjs',
      wrapper: 'buildImportWithReadbackSql; repository manifest remains draft',
      commit_sha256: sha256(Buffer.from(sql)), commit_bytes: Buffer.byteLength(sql),
      rollback_sha256: sha256(Buffer.from(rollback)), rollback_bytes: Buffer.byteLength(rollback) },
    expected_readback: { scope: 'rows added by line-wave import after P12 and temporal-v4',
      by_table: { ...expectedRows } },
    stage: { name: 'm2c_lines_import', order: ['rollback probe', 'independent import attestation',
      'commit', 'exact readback', 'idempotent re-import (rollback)'] },
    activation: 'none',
    authority: 'approved line data availability only; authoring approval does not authorize this import',
    independent_import_attestation: null
  };
  return { request: { ...request, request_digest: computeLinesImportRequestDigest(request) }, commit: sql, rollback };
}

// Read bytes in-line, keeping manifest dataset paths anchored to the manifest directory.
async function requireDatasetBytes(root, manifestPath, file) {
  return readFile(resolve(dirname(resolve(root, manifestPath)), file));
}

export function assertLinesImportAttestation(request, attestation) {
  if (!attestation) throw new Error('V17_LINES_IMPORT_ATTESTATION_REQUIRED');
  if (typeof attestation.attested_by !== 'string' || !attestation.attested_by.trim()
      || typeof attestation.independence_basis !== 'string' || !attestation.independence_basis.trim()) {
    throw new Error('V17_LINES_IMPORT_ATTESTATION_INDEPENDENCE_REQUIRED');
  }
  if (attestation.schema !== LINES_IMPORT_ATTESTATION_SCHEMA) throw new Error('V17_LINES_IMPORT_ATTESTATION_SCHEMA_MISMATCH');
  if (attestation.decision !== 'APPROVE') throw new Error('V17_LINES_IMPORT_ATTESTATION_REJECTED');
  if (attestation.request_digest !== request.request_digest) throw new Error('V17_LINES_IMPORT_ATTESTATION_DIGEST_MISMATCH');
  if (attestation.import_authorized !== true || attestation.database_mutated !== false) {
    throw new Error('V17_LINES_IMPORT_ATTESTATION_AUTHORITY_MISMATCH');
  }
  return attestation;
}

async function tableCounts(world, tables) {
  const counts = {};
  for (const table of tables) {
    if (!/^[a-z_0-9]+$/u.test(table)) throw new Error(`V17_LINES_IMPORT_TABLE_INVALID:${table}`);
    counts[table] = Number((await world.query(`SELECT count(*) FROM world_base.${table}`)).rows[0].count);
  }
  return counts;
}

const sameCounts = (left, right) => Object.keys(left).every((table) => left[table] === right[table]);

export async function runLinesImportStage({ world, root = ROOT, manifestPath, manifestSha256,
  approvalPath, requireAttestation } = {}) {
  const prepared = await buildLinesImportRequest({ root, manifestPath, manifestSha256, approvalPath });
  const request = prepared.request;
  const expected = request.expected_readback.by_table;
  const tables = Object.keys(expected);
  const before = await tableCounts(world, tables);
  await world.query(prepared.rollback);
  if (!sameCounts(before, await tableCounts(world, tables))) throw new Error('V17_LINES_IMPORT_ROLLBACK_MISMATCH');
  const attestation = assertLinesImportAttestation(request,
    await requireAttestation('m2c_lines_import', request));
  await world.query(prepared.commit);
  const after = await tableCounts(world, tables);
  for (const table of tables) {
    if (after[table] - before[table] !== expected[table]) {
      throw new Error(`V17_LINES_IMPORT_READBACK_MISMATCH:${table}:${after[table] - before[table]}!=${expected[table]}`);
    }
  }
  await world.query(prepared.rollback);
  return { request_id: request.request_id, request_digest: request.request_digest,
    request,
    attestation, added: expected, rollback: 'pass', readback: 'exact' };
}
