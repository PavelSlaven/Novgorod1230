import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { prepareTrackedBundle } from './prepare-rus13-staging.js';
import { loadNovgorodG1G4GraphRecords } from './import-novgorod-g1-g4-graph.js';
import {
  buildCatalogEditorialReadinessReport,
  buildG4ItemContainerCoverageReport,
  compileItemContainerG4Projection,
  compileV5CanonicalCatalog,
  digestValue,
  MATERIALIZATION_FOREIGN_KEYS
} from '../tools/world-catalog-workflow/src/index.js';

const root = resolve(import.meta.dirname, '..');
const outputRoot = resolve(root, 'data/knowledge-source/imports/item-container-120-v5/candidate');
const sourceSnapshotPath = resolve(root, 'data/knowledge-source/imports/item-container-120-v5/source/V5_SOURCE_SNAPSHOT.json');
const baseBundleRoot = resolve(root, 'data/knowledge-source/imports/universal-category-classification-2026-07-15/stage-3b1/bundle');
const mappingPath = resolve(root, 'docs/implementation/item-container-120-approval-audit/evidence/G4_DEPENDENCY_APPROVAL_REQUEST.json');
const legacySnapshotPath = resolve(root, 'docs/implementation/item-container-120-approval-audit/evidence/OPERATOR_LEGACY_INVENTORY_SNAPSHOT.json');
const check = process.argv.includes('--check');

const outputs = await buildOutputs();
if (check) {
  const mismatches = [];
  for (const [relativePath, content] of outputs) {
    const actual = await readFile(resolve(outputRoot, relativePath), 'utf8').catch(() => null);
    if (actual !== content) mismatches.push(relativePath);
  }
  if (mismatches.length) throw new Error(`PR17 generated candidate is stale: ${mismatches.join(', ')}`);
  process.stdout.write(`${JSON.stringify({ pass: true, mode: 'check', files: outputs.size }, null, 2)}\n`);
} else {
  for (const [relativePath, content] of outputs) {
    const target = resolve(outputRoot, relativePath);
    await mkdir(resolve(target, '..'), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  process.stdout.write(`${JSON.stringify({ pass: true, mode: 'write', files: outputs.size }, null, 2)}\n`);
}

async function buildOutputs() {
  const sourceSnapshot = JSON.parse(await readFile(sourceSnapshotPath, 'utf8'));
  const baseManifest = JSON.parse(await readFile(resolve(baseBundleRoot, 'manifest.json'), 'utf8'));
  const baseRecords = Object.fromEntries(await Promise.all(baseManifest.datasets.map(async (dataset) => [dataset.table, JSON.parse(await readFile(resolve(baseBundleRoot, dataset.path), 'utf8'))])));
  const semanticRequest = JSON.parse(await readFile(mappingPath, 'utf8'));
  const legacySnapshot = JSON.parse(await readFile(legacySnapshotPath, 'utf8'));
  const revisionId = baseManifest.world_revision_id;
  const regionId = sourceSnapshot.datasets.templates.templates[0].region_id;
  const catalog = compileV5CanonicalCatalog({ base_records_by_table: baseRecords, v5_datasets: sourceSnapshot.datasets, world_revision_id: revisionId, region_id: regionId });
  if (catalog.errors.length) throw new Error(`V5 canonical compilation failed: ${catalog.errors.join(', ')}`);

  const temporaryRoot = await mkdtemp(join(tmpdir(), 'pr17-rus13-'));
  let graphNodes;
  try {
    const stagingRoot = resolve(temporaryRoot, 'staging');
    await prepareTrackedBundle({ projectRoot: root, stagingRoot });
    graphNodes = loadNovgorodG1G4GraphRecords(resolve(stagingRoot, 'nov_region_audit/novgorod_full_graph_g1_g4_v6_game_ready_EXTRACTED/novgorod_full_graph_g1_g4_v6_game_ready/tsv_import'))
      .filter((entry) => entry.table === 'graph_nodes' && entry.row.scale_level === 'G4')
      .map((entry) => entry.row);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
  const spatial = compileItemContainerG4Projection({
    world_revision_id: revisionId,
    region_id: regionId,
    graph_nodes: graphNodes,
    context_profiles: sourceSnapshot.datasets.materialization_profiles.profiles,
    context_mappings: semanticRequest.profile_mappings,
    templates: sourceSnapshot.datasets.templates.templates,
    materialization_rules: sourceSnapshot.datasets.materialization_rules.rules,
    container_content_profiles: catalog.records_by_table.container_content_profiles
  });
  if (spatial.errors.length) throw new Error(`G4 projection compilation failed: ${spatial.errors.join(', ')}`);

  const records = mergeTables(catalog.records_by_table, spatial.records_by_table);
  for (const table of ['item_profile_sets','property_profiles','property_profile_rules','g4_item_materialization_rules','g4_container_materialization_rules']) {
    for (const record of records[table] ?? []) record.status = 'draft';
  }
  const approvedGraphNodes = graphNodes.map((node) => spatial.graph_node_status_transitions.some((transition) => transition.graph_node_id === node.id) ? { ...node, status: 'approved' } : node);
  const approvalView = structuredClone(records);
  for (const rows of Object.values(approvalView)) for (const record of rows ?? []) if (record.status === 'draft') record.status = 'approved';
  approvalView.graph_nodes = approvedGraphNodes;
  const coverage = buildG4ItemContainerCoverageReport(approvalView);
  if (!coverage.pass) throw new Error(`G4 coverage failed: ${coverage.concerns.slice(0, 20).map((entry) => entry.code).join(', ')}`);
  const readiness = buildCatalogEditorialReadinessReport({ template_catalog: sourceSnapshot.datasets.templates.templates, records_by_table: records, legacy_inventory_snapshot: legacySnapshot, target_revision_id: revisionId });
  if (!readiness.approval_cohort_ready) throw new Error(`Editorial readiness failed: ${JSON.stringify({ summary: readiness.summary, examples: readiness.templates.filter((row) => !row.fully_ready).slice(0, 5) })}`);

  const orderedTables = orderTables(Object.keys(records).filter((table) => records[table].length > 0), records);
  const datasets = orderedTables.map((table, dependencyOrder) => ({ table, path: `tables/${table}.json`, record_count: records[table].length, sha256: digestValue(records[table]), dependency_order: dependencyOrder }));
  const coreManifest = {
    schema_version: 'rus.pr17.item_container_candidate.v1',
    bundle_id: 'novgorod_1230_item_container_v5_candidate_001',
    world_revision_id: revisionId,
    approval: 'pending_approve_all_120',
    activation: 'not_requested',
    deletion_policy: 'none',
    provenance: {
      v5_package_id: sourceSnapshot.package_id,
      v5_archive_sha256: sourceSnapshot.archive.sha256,
      historical_attestation_path: sourceSnapshot.historical_attestation_path,
      g4_semantic_mapping_path: 'docs/implementation/item-container-120-approval-audit/evidence/G4_DEPENDENCY_APPROVAL_REQUEST.json',
      g4_semantic_mapping_sha256: digestValue(semanticRequest),
      parent_bundle_id: baseManifest.bundle_id,
      compiler: 'scripts/generate-pr17-item-container-candidate.mjs'
    },
    cohort: { template_count: 120, item_template_count: 102, container_template_count: 18, context_profile_count: 9, imported_g4_count: graphNodes.length },
    datasets
  };
  const manifest = { ...coreManifest, candidate_digest: digestValue(coreManifest) };
  const compilationReport = {
    schema_version: 'rus.pr17.item_container_compilation_report.v1',
    pass: true,
    candidate_digest: manifest.candidate_digest,
    projection_digest: spatial.digest,
    canonical_catalog_digest: catalog.digest,
    editorial_readiness_report_digest: readiness.report_digest,
    coverage_report_digest: digestValue(coverage),
    graph_node_status_transitions: spatial.graph_node_status_transitions,
    counts: Object.fromEntries(datasets.map((dataset) => [dataset.table, dataset.record_count])),
    activation_performed: false
  };
  const result = new Map();
  for (const dataset of datasets) result.set(dataset.path, json(records[dataset.table]));
  result.set('manifest.json', json(manifest));
  result.set('reports/COMPILATION_REPORT.json', json(compilationReport));
  result.set('reports/EDITORIAL_READINESS_REPORT.json', json(readiness));
  result.set('reports/G4_COVERAGE_REPORT.json', json(coverage));
  return result;
}

function mergeTables(...groups) {
  const result = {};
  for (const group of groups) for (const [table, rows] of Object.entries(group)) {
    const byId = new Map((result[table] ?? []).map((record) => [record.id ?? JSON.stringify(record), record]));
    for (const record of structuredClone(rows ?? [])) byId.set(record.id ?? JSON.stringify(record), record);
    result[table] = [...byId.values()].sort((left, right) => String(left.id ?? '').localeCompare(String(right.id ?? '')));
  }
  return result;
}
function orderTables(tables, records) {
  const tableSet = new Set(tables);
  const dependencies = new Map(tables.map((table) => [table, new Set()]));
  for (const [sourceTable, sourceColumn, targetTable] of MATERIALIZATION_FOREIGN_KEYS) {
    if (sourceTable === targetTable || !tableSet.has(sourceTable) || !tableSet.has(targetTable)) continue;
    if ((records[sourceTable] ?? []).some((record) => record[sourceColumn] != null)) dependencies.get(sourceTable).add(targetTable);
  }
  const explicit = {
    item_templates: ['world_revisions', 'universal_categories', 'source_records'],
    container_templates: ['world_revisions', 'universal_categories', 'source_records'],
    building_templates: [],
    record_sources: tables.filter((table) => table !== 'record_sources')
  };
  for (const [table, values] of Object.entries(explicit)) if (dependencies.has(table)) for (const dependency of values) if (tableSet.has(dependency)) dependencies.get(table).add(dependency);
  const remaining = new Set(tables);
  const result = [];
  while (remaining.size) {
    const ready = [...remaining].filter((table) => [...dependencies.get(table)].every((dependency) => !remaining.has(dependency))).sort();
    if (!ready.length) throw new Error(`Candidate dependency cycle: ${[...remaining].sort().join(', ')}`);
    for (const table of ready) { remaining.delete(table); result.push(table); }
  }
  return result;
}
function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }
