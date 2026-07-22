import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const EXPECTED_ARCHIVE_SHA256 = 'dc95ee730beea3f4ae7e153cd30fb505ea7b7285a765ea2b7b56979446075fc3';
const EXPECTED_PACKAGE_ID = 'item_container_120_historical_gameplay_v5_2026-07-22';
const DEFAULT_OUTPUT = 'data/knowledge-source/imports/item-container-120-v5/source/V5_SOURCE_SNAPSHOT.json';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
const sourceRoot = resolve(required('--source'));
const archivePath = resolve(required('--archive'));
const outputPath = resolve(args.get('--output') ?? DEFAULT_OUTPUT);
const archiveDigest = sha256(readFileSync(archivePath));
if (archiveDigest !== EXPECTED_ARCHIVE_SHA256) throw new Error(`V5 archive digest mismatch: ${archiveDigest}`);

const manifest = readJson(resolve(sourceRoot, 'MANIFEST.json'));
if (manifest.package_id !== EXPECTED_PACKAGE_ID) throw new Error(`Unexpected V5 package: ${manifest.package_id}`);
const sourceDatasets = manifest.datasets.filter((entry) => entry.path.startsWith('data/')).sort((left, right) => left.path.localeCompare(right.path));
const datasets = {};
for (const entry of sourceDatasets) {
  const fullPath = resolve(sourceRoot, ...entry.path.split('/'));
  const bytes = readFileSync(fullPath);
  const digest = sha256(bytes);
  if (digest !== entry.sha256) throw new Error(`V5 dataset digest mismatch: ${entry.path}`);
  const parsed = JSON.parse(bytes.toString('utf8'));
  const records = Object.values(parsed).find(Array.isArray);
  if (!records || records.length !== entry.record_count) throw new Error(`V5 dataset count mismatch: ${entry.path}`);
  datasets[entry.path.slice('data/'.length, -'.json'.length).toLowerCase()] = parsed;
}

const snapshot = {
  schema_version: 'rus.pr17.v5_source_snapshot.v1',
  package_id: manifest.package_id,
  archive: { filename: 'ITEM_CONTAINER_120_HISTORICAL_GAMEPLAY_V5_2026-07-22.zip', sha256: archiveDigest },
  historical_attestation_path: 'docs/implementation/item-container-120-approval-audit/evidence/HISTORICAL_REVIEW_ATTESTATION.json',
  datasets: Object.fromEntries(Object.entries(datasets).sort(([left], [right]) => left.localeCompare(right)))
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ output: outputPath, archive_sha256: archiveDigest, dataset_count: sourceDatasets.length }, null, 2)}\n`);

function required(name) { const value = args.get(name); if (!value) throw new Error(`${name} is required`); return value; }
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
