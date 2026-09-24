import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTransactionalImportSql } from '../tools/spatial-v3/p12-authoring-importer.mjs';
import { buildTargetAppearanceTransferV3ImportSql } from '../tools/spatial-v3/character-appearance-v1-importer.mjs';

const root = resolve(import.meta.dirname, '..');
const v17 = 'data/world-catalogs/novgorod/live-world-runtime-v17';
const gate1 = 'data/world-catalogs/novgorod/runtime-catalog/gate1-owner-data-v1';
const p12 = 'data/world-catalogs/novgorod/m2c-p12-v17-after-gate1-v1';

function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

async function exact(path, sha256, bytes) {
  const content = await readFile(resolve(root, path));
  if (digest(content) !== sha256 || (bytes !== undefined && content.length !== bytes))
    throw new Error(`V17_PIN_MISMATCH:${path}`);
  return content;
}

async function json(path) { return JSON.parse(await readFile(resolve(root, path), 'utf8')); }

export async function checkV17BootstrapInputs() {
  const schema = await json(`${v17}/fresh-schema-request.json`);
  for (const source of [schema.world_schema.entrypoint,
    ...schema.world_schema.ordered_parts,
    ...schema.party_schema.ordered_migrations]) {
    await exact(source.path, source.sha256, source.bytes);
  }

  const gate = await json(`${gate1}/v17-bootstrap-import-request.json`);
  for (const source of gate.approved_sources) await exact(source.path, source.sha256);
  const { execFileSync } = await import('node:child_process');
  const dryRun = JSON.parse(execFileSync(process.execPath,
    ['scripts/run-pr17-item-container-stage3c.mjs', '--mode', 'dry-run'],
    { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
  if (!dryRun.pass || dryRun.applied || Object.entries(gate.expected_plan)
    .filter(([key]) => key in dryRun)
    .some(([key, value]) => dryRun[key] !== value))
    throw new Error('V17_GATE1_PLAN_MISMATCH');

  const request = await json(`${p12}/request.json`);
  const sqlHash = createHash('sha256').update(request.sql_builder.concatenation.prefix);
  let sqlBytes = Buffer.byteLength(request.sql_builder.concatenation.prefix);
  for (const bundle of request.bundle_order) {
    await exact(bundle.manifest_path, bundle.manifest_sha256);
    await exact(bundle.approval_path, bundle.approval_sha256);
    const part = await buildTransactionalImportSql({ root,
      manifestPath: bundle.manifest_path, wrapTransaction: false,
      allowTypedGaps: false, temporaryTablePrefix: bundle.temporary_table_prefix });
    const content = Buffer.from(part);
    if (digest(content) !== bundle.sql_part_sha256 || content.length !== bundle.sql_part_bytes)
      throw new Error(`V17_P12_SQL_MISMATCH:${bundle.name}`);
    sqlHash.update(content);
    sqlBytes += content.length;
  }
  sqlHash.update(request.sql_builder.concatenation.suffix);
  sqlBytes += Buffer.byteLength(request.sql_builder.concatenation.suffix);
  if (sqlHash.digest('hex') !== request.sql_builder.combined_sql_sha256
      || sqlBytes !== request.sql_builder.combined_sql_bytes)
    throw new Error('V17_P12_COMBINED_SQL_MISMATCH');

  const appearance = await json(`${v17}/appearance-transfer-v3-v17-import-request.json`);
  const approved = appearance.approved_data;
  for (const [path, sha256] of [
    [approved.candidate_path, approved.candidate_sha256],
    [approved.data_approval_path, approved.data_approval_sha256],
    [approved.manifest_path, approved.manifest_sha256]
  ]) await exact(path, sha256);
  for (const dataset of approved.dataset_order) await exact(
    `${v17}/appearance-transfer-v3-datasets/${dataset.table}.json`, dataset.sha256);
  for (const rollback of [true, false]) {
    const sql = Buffer.from(await buildTargetAppearanceTransferV3ImportSql({ root, rollback }));
    const kind = rollback ? 'rollback' : 'commit';
    if (digest(sql) !== appearance.sql[`${kind}_sha256`]
        || sql.length !== appearance.sql[`${kind}_bytes`])
      throw new Error(`V17_APPEARANCE_SQL_MISMATCH:${kind}`);
  }
  return { schema: 'exact', gate1: 'exact', p12: 'exact', appearance_v3: 'exact',
    database_mutated: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.stdout.write(`${JSON.stringify(await checkV17BootstrapInputs())}\n`);
