import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const parentManifestPath = resolve(repositoryRoot, 'data/world-base-sources/rus13-base-v1.manifest.json');
const sourceRecordsPath = 'source_records_unified_v1.csv';

// Typed evidence bindings are authoritative for promotion review. The legacy
// record_sources ledger remains an audit input, never the sole source-ID list.
export function collectSupplementalParentSourceIds(recordsByTable = {}) {
  const localSourceIds = new Set((recordsByTable.source_records ?? []).map((record) => record?.id));
  const sourceIds = ['record_sources', 'item_template_source_bindings', 'container_template_source_bindings']
    .flatMap((table) => recordsByTable[table] ?? [])
    .map((record) => record?.source_id)
    .filter((id) => typeof id === 'string' && id && !localSourceIds.has(id));
  return Object.freeze([...new Set(sourceIds)]);
}

// Parent rows remain owned by the registered base archive. A supplemental bundle
// may reference them only after the archive and its source dataset are verified.
export function loadVerifiedParentSourceRecords(requiredIds) {
  const expectedIds = [...new Set(requiredIds ?? [])];
  if (expectedIds.length === 0 || expectedIds.some((id) => typeof id !== 'string' || !id)) throw new Error('PARENT_SOURCE_IDS_INVALID');
  const manifest = JSON.parse(readFileSync(parentManifestPath, 'utf8'));
  if (manifest.schema_version !== 'rus.world_base_source_bundle.v1') throw new Error('PARENT_SOURCE_MANIFEST_INVALID');
  const entry = manifest.files?.find((file) => file.path === sourceRecordsPath);
  if (!entry) throw new Error('PARENT_SOURCE_DATASET_MISSING');
  const archivePath = resolveRepositoryPath(manifest.archive?.path);
  const archive = statSync(archivePath);
  if (archive.size !== manifest.archive?.bytes || digest(readFileSync(archivePath)) !== manifest.archive?.sha256) throw new Error('PARENT_SOURCE_ARCHIVE_DIGEST_INVALID');
  const extracted = spawnSync('tar', ['-xOzf', archivePath, sourceRecordsPath], { encoding: null });
  if (extracted.status !== 0) throw new Error(`PARENT_SOURCE_EXTRACT_FAILED:${String(extracted.stderr ?? '').trim()}`);
  const bytes = Buffer.from(extracted.stdout ?? []);
  if (bytes.length !== entry.bytes || digest(bytes) !== entry.sha256) throw new Error('PARENT_SOURCE_DATASET_DIGEST_INVALID');
  const byId = new Map(parseCsv(bytes.toString('utf8')).map((record) => [record.id, record]));
  const records = expectedIds.map((id) => byId.get(id));
  if (records.some((record) => !record)) throw new Error(`PARENT_SOURCE_RECORD_MISSING:${expectedIds.filter((id) => !byId.has(id)).join(',')}`);
  return Object.freeze(records.map((record) => Object.freeze({ ...record })));
}

function resolveRepositoryPath(value) {
  if (typeof value !== 'string' || !value || value.includes('..')) throw new Error('PARENT_SOURCE_PATH_INVALID');
  const path = resolve(repositoryRoot, value);
  const pathRelative = relative(repositoryRoot, path);
  if (pathRelative === '..' || pathRelative.startsWith(`..${sep}`)) throw new Error('PARENT_SOURCE_PATH_INVALID');
  return path;
}

function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ',') { row.push(field); field = ''; }
    else if (character === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (character !== '\r') field += character;
  }
  if (quoted) throw new Error('PARENT_SOURCE_CSV_INVALID');
  if (field || row.length > 0) { row.push(field); rows.push(row); }
  const [header = [], ...values] = rows;
  if (header[0]?.replace(/^\uFEFF/u, '') !== 'id') throw new Error('PARENT_SOURCE_CSV_HEADER_INVALID');
  header[0] = 'id';
  return values.filter((value) => value.length === header.length && value[0]).map((value) => Object.fromEntries(header.map((key, index) => [key, value[index]])));
}

function digest(value) { return createHash('sha256').update(value).digest('hex'); }
