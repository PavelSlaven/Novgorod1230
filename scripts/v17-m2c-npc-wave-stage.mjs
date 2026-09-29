import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildImportWithReadbackSql } from '../tools/spatial-v3/p12-authoring-importer.mjs';

const ROOT = resolve(import.meta.dirname, '..');
export const WAVE_DIR = 'data/world-catalogs/novgorod/m2c-npc-wave/v1';
export const WAVE_REQUEST_PATH = `${WAVE_DIR}/v17-import-request.json`;
export const WAVE_ATTESTATION_SCHEMA = 'rus.m2c_npc_wave_v17_import_approval.v1';
const WAVE_ATTESTATION_VERDICTS = new Set(['APPROVE', 'APPROVE_CONDITIONAL']);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonicalize = (value) => value === null || typeof value !== 'object' ? value
  : Array.isArray(value) ? value.map(canonicalize)
    : Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));

export function computeWaveRequestDigest(request) {
  const { request_digest: _claimed, ...body } = request;
  return sha256(JSON.stringify(canonicalize(body)));
}

export async function readWaveRequest(root = ROOT) {
  return JSON.parse(await readFile(resolve(root, WAVE_REQUEST_PATH), 'utf8'));
}

/**
 * The repository manifest stays `draft`; the gate is opened only in a temporary copy that this
 * stage imports (D27). The approval file is validated by the importer as for any wave import.
 */
export async function buildWaveImportSql({ root = ROOT } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'm2c-npc-wave-v17-'));
  try {
    await cp(resolve(root, WAVE_DIR), directory, { recursive: true });
    const manifestFile = join(directory, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
    manifest.status = 'approved';
    await writeFile(manifestFile, JSON.stringify(manifest));
    const commit = await buildImportWithReadbackSql({ root, manifestPath: manifestFile,
      m2cWaveApprovalPath: join(directory, 'approval.json') });
    if (!commit.endsWith('COMMIT;\n')) throw new Error('V17_M2C_WAVE_SQL_SHAPE_INVALID');
    return { commit, rollback: `${commit.slice(0, -'COMMIT;\n'.length)}ROLLBACK;\n` };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export async function assertWaveInputs({ root = ROOT, request }) {
  if (request?.schema !== 'rus.m2c_npc_wave_v17_import_request.v1') throw new Error('V17_M2C_WAVE_REQUEST_SCHEMA_MISMATCH');
  if (request.request_digest !== computeWaveRequestDigest(request)) throw new Error('V17_M2C_WAVE_REQUEST_DIGEST_MISMATCH');
  const data = request.approved_data;
  const file = (path) => readFile(resolve(root, path));
  const manifestBytes = await file(data.manifest_path);
  if (sha256(manifestBytes) !== data.manifest_sha256) throw new Error('V17_M2C_WAVE_PIN_MISMATCH:manifest');
  if (sha256(await file(data.approval_path)) !== data.approval_sha256) throw new Error('V17_M2C_WAVE_PIN_MISMATCH:approval');
  const manifest = JSON.parse(manifestBytes);
  const pinned = new Map(data.datasets.map((row) => [row.table, row]));
  if (pinned.size !== manifest.datasets.length
      || manifest.datasets.some(({ table }) => !pinned.has(table))) throw new Error('V17_M2C_WAVE_PIN_MISMATCH:dataset_set');
  for (const dataset of manifest.datasets) {
    const bytes = await readFile(resolve(root, WAVE_DIR, dataset.file));
    const pin = pinned.get(dataset.table);
    if (sha256(bytes) !== pin.sha256 || dataset.sha256 !== pin.sha256
        || JSON.parse(bytes).length !== pin.rows) throw new Error(`V17_M2C_WAVE_PIN_MISMATCH:dataset:${dataset.table}`);
  }
  const sql = await buildWaveImportSql({ root });
  for (const kind of ['commit', 'rollback']) {
    const bytes = Buffer.from(sql[kind]);
    if (sha256(bytes) !== request.sql[`${kind}_sha256`] || bytes.length !== request.sql[`${kind}_bytes`]) {
      throw new Error(`V17_M2C_WAVE_SQL_MISMATCH:${kind}`);
    }
  }
  return sql;
}

export function assertWaveAttestation(request, attestation) {
  if (!attestation) throw new Error('V17_M2C_WAVE_ATTESTATION_REQUIRED');
  if (attestation.schema !== WAVE_ATTESTATION_SCHEMA) throw new Error('V17_M2C_WAVE_ATTESTATION_SCHEMA_MISMATCH');
  if (!WAVE_ATTESTATION_VERDICTS.has(attestation.verdict)) throw new Error('V17_M2C_WAVE_ATTESTATION_VERDICT_REJECTED');
  if (attestation.request_digest !== request.request_digest) throw new Error('V17_M2C_WAVE_ATTESTATION_DIGEST_MISMATCH');
  return attestation;
}

async function tableCounts(world, tables) {
  const counts = {};
  for (const table of tables) {
    if (!/^[a-z_0-9]+$/u.test(table)) throw new Error(`V17_M2C_WAVE_TABLE_INVALID:${table}`);
    counts[table] = Number((await world.query(`SELECT count(*) FROM world_base.${table}`)).rows[0].count);
  }
  return counts;
}

const sameCounts = (a, b) => Object.keys(a).every((table) => a[table] === b[table]);

/** Rollback probe, independent attestation, commit, exact readback, idempotent re-import. */
export async function runWaveImportStage({ world, root = ROOT, requireAttestation }) {
  const request = await readWaveRequest(root);
  const sql = await assertWaveInputs({ root, request });
  const expected = request.expected_readback.by_table;
  const tables = Object.keys(expected);
  const before = await tableCounts(world, tables);
  await world.query(sql.rollback);
  if (!sameCounts(before, await tableCounts(world, tables))) throw new Error('V17_M2C_WAVE_ROLLBACK_MISMATCH');
  assertWaveAttestation(request, await requireAttestation('m2c_npc_wave_import', request));
  await world.query(sql.commit);
  const after = await tableCounts(world, tables);
  for (const table of tables) {
    if (after[table] - before[table] !== expected[table]) {
      throw new Error(`V17_M2C_WAVE_READBACK_MISMATCH:${table}:${after[table] - before[table]}!=${expected[table]}`);
    }
  }
  // Repeating the import compares every pinned row with the committed one and adds nothing.
  await world.query(sql.rollback);
  if (!sameCounts(after, await tableCounts(world, tables))) throw new Error('V17_M2C_WAVE_IDEMPOTENCY_MISMATCH');
  return { request_id: request.request_id, added: expected, rollback: 'pass', readback: 'exact' };
}
