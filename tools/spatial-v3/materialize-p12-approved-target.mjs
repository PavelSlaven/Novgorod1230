import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileP12V11PhysicalRows } from './p12-v1_1-physical-projection.mjs';
import { validateP12TargetMaterializationApprovalV11 } from './p12-target-materialization-approval-v1_1.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const OUTPUT_MANIFEST = 'data/world-catalogs/novgorod/spatial-v3/manifest.json';
const CLOSURE_ROOT = 'data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/dependency-closure/v1';
const PROVENANCE = 'data/world-catalogs/novgorod/spatial-v3/source-approval/index.json#p12_novgorod_source_approval_001+target-materialization-approval/P12_TARGET_MATERIALIZATION_APPROVAL_V1_1.zip';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export async function materializeP12ApprovedTarget({ root = ROOT, manifestPath = OUTPUT_MANIFEST, validateTargetApproval = validateP12TargetMaterializationApprovalV11 } = {}) {
  const projectRoot = resolve(root);
  const approval = await validateTargetApproval({ root: projectRoot });
  if (!approval.ok || approval.materialization_authorized !== false || approval.p28_activation !== 'not_authorized') {
    const codes = (approval.errors ?? []).map((entry) => entry.code ?? entry).join(',');
    throw new Error(`P12_TARGET_APPROVAL_INVALID:${codes || 'approval_state'}`);
  }
  const outputManifest = resolve(projectRoot, manifestPath);
  const outputRoot = dirname(outputManifest);
  const datasetRoot = join(outputRoot, 'datasets');
  const closureRoot = resolve(projectRoot, CLOSURE_ROOT);
  const closureManifest = JSON.parse(await readFile(join(closureRoot, 'import-manifest.json'), 'utf8'));
  const registry = JSON.parse(await readFile(resolve(projectRoot, 'data/contracts/spatial-v3/world-base-import-registry.v1.json'), 'utf8'));
  const compiled = await compileP12V11PhysicalRows({ root: projectRoot });
  const rowsByTable = new Map();
  const metadataByTable = new Map();

  for (const dataset of closureManifest.datasets) {
    rowsByTable.set(dataset.table, JSON.parse(await readFile(join(closureRoot, dataset.file), 'utf8')));
    metadataByTable.set(dataset.table, dataset);
  }
  for (const [table, rows] of compiled.rows) rowsByTable.set(table, [...(rowsByTable.get(table) ?? []), ...rows]);

  const rank = new Map(registry.dependency_order.flat().map((table, index) => [table, index]));
  const tables = [...rowsByTable.keys()].toSorted((left, right) =>
    (rank.get(left) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right) ?? Number.MAX_SAFE_INTEGER)
      || Buffer.compare(Buffer.from(left), Buffer.from(right))
  );
  await mkdir(datasetRoot, { recursive: true });
  const datasets = [];
  for (const table of tables) {
    const content = `${JSON.stringify(rowsByTable.get(table), null, 2)}\n`;
    const file = `datasets/${table}.json`;
    await writeFile(join(outputRoot, file), content, 'utf8');
    datasets.push({
      table,
      file,
      sha256: sha256(content),
      status: 'approved',
      provenance_ref: PROVENANCE,
      delete_policy: 'forbid',
      depends_on: metadataByTable.get(table)?.depends_on ?? []
    });
  }
  const manifest = {
    schema_version: 'rus.spatial-v3.world-base-authoring-bundle.v1',
    bundle_id: 'novgorod-spatial-v3-p12-approved-target-001',
    world_revision_id: 'novgorod_spatial_v3_target_contract_approval_001',
    status: 'approved',
    provenance_ref: PROVENANCE,
    delete_policy: 'forbid',
    datasets,
    data_gaps: []
  };
  await writeFile(outputManifest, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return Object.freeze({
    manifest: relative(projectRoot, outputManifest).replaceAll('\\', '/'),
    dataset_counts: Object.freeze(Object.fromEntries(tables.map((table) => [table, rowsByTable.get(table).length])))
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await materializeP12ApprovedTarget(), null, 2)}\n`);
}
