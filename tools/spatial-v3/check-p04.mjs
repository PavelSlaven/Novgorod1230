import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const files = {
  world: 'data/knowledge-source/corpus/DOCUMENTS/world_generation_and_turns.txt',
  ux: 'data/knowledge-source/corpus/DOCUMENTS/interface_ux.md',
  catalog: 'data/world-catalogs/novgorod/G1_SEMANTIC_CATALOG.md',
  navigation: 'data/knowledge-source/corpus/DOCUMENTS/llm_documentation_navigation.md',
  registry: 'docs/migration/spatial-v3/target-registries.md'
};
const staleAuthoringStatuses = ['mapping_not_performed', 'bindings_unverified'];

function requireExactCount(actual, expected, label) {
  if (actual !== expected) throw new Error(`P04 approved projection count mismatch: ${label}=${actual}, expected ${expected}`);
}

function requireSameIds(actualRows, expectedRows, actualKey, expectedKey, label) {
  const actual = [...new Set(actualRows.map((row) => row[actualKey]))].sort();
  const expected = [...new Set(expectedRows.map((row) => row[expectedKey]))].sort();
  if (actual.length !== actualRows.length || expected.length !== expectedRows.length ||
      actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
    throw new Error(`P04 approved projection identity mismatch: ${label}`);
  }
}

function countKind(rows, kind) {
  return rows.filter((row) => row.target_mapping_kind === kind).length;
}

function requireSameRelations(actualRows, expectedRows, actualKeys, expectedKeys, label) {
  const serialize = (row, keys) => keys.map((key) => row[key]).join('\u0000');
  const actual = actualRows.map((row) => serialize(row, actualKeys)).sort();
  const expected = expectedRows.map((row) => serialize(row, expectedKeys)).sort();
  if (actual.length !== expected.length || actual.some((relation, index) => relation !== expected[index])) {
    throw new Error(`P04 approved projection relation mismatch: ${label}`);
  }
}

function requireApproved(rows, label) {
  if (rows.some((row) => row.status !== 'approved')) {
    throw new Error(`P04 approved projection contains non-approved ${label}`);
  }
}

export function validateP04CatalogProjection({
  catalog,
  rootManifest,
  sourceGapStatus,
  datasetArtifacts,
  targetDatasets,
  sourceEvidence
}) {
  for (const status of staleAuthoringStatuses) {
    if (catalog.includes(status)) throw new Error(`stale P04 authoring status: ${status}`);
  }

  const source = sourceGapStatus.source_data;
  if (!source || Object.values(source).some((entry) => entry.status !== 'resolved_in_package')) {
    throw new Error('P04 approved projection source gaps are not all resolved_in_package');
  }
  requireExactCount(source.canonical_g5_inventory.count, 195, 'source canonical G5');
  requireExactCount(source.physical_exit_source_pairs.count, 358, 'source physical exit pairs');
  requireExactCount(source.physical_exit_source_pairs.derived_directions, 716, 'source directed identities');
  requireExactCount(source.legacy_edge_mapping_bindings.count, 600, 'source typed edge mappings');
  requireExactCount(source.legacy_edge_mapping_bindings.hierarchy, 242, 'source hierarchy mappings');
  requireExactCount(source.legacy_edge_mapping_bindings.physical, 358, 'source physical mappings');
  requireExactCount(source.approved_scene_profiles.profile_families, 17, 'source scene families');
  requireExactCount(source.approved_scene_profiles.profiles, 195, 'source scene profiles');
  requireExactCount(source.approved_scene_profiles.candidates, 195, 'source scene candidates');

  if (rootManifest.status !== 'approved' || rootManifest.datasets.length !== 37 || rootManifest.data_gaps.length !== 0) {
    throw new Error('P04 approved projection root manifest must contain 37 approved datasets and zero data gaps');
  }
  if (rootManifest.datasets.some((dataset) => dataset.status !== 'approved' || !/^[0-9a-f]{64}$/u.test(dataset.sha256))) {
    throw new Error('P04 approved projection root manifest contains an unapproved or unpinned dataset');
  }
  requireExactCount(datasetArtifacts.length, 37, 'loaded dataset artifacts');
  for (const manifestEntry of rootManifest.datasets) {
    const artifact = datasetArtifacts.find(({ entry }) => (
      entry.table === manifestEntry.table && entry.file === manifestEntry.file
    ));
    if (!artifact) throw new Error(`P04 approved projection dataset bytes missing: ${manifestEntry.table}`);
    const actualSha256 = createHash('sha256').update(artifact.bytes).digest('hex');
    if (actualSha256 !== manifestEntry.sha256) {
      throw new Error(`P04 approved projection dataset SHA-256 mismatch: ${manifestEntry.table}`);
    }
  }

  const {
    physicalExitPairs,
    edgeMappings,
    g4HostSectors,
    canonicalG5,
    sceneAssignments
  } = sourceEvidence;
  requireApproved(physicalExitPairs, 'physical source pairs');
  requireApproved(edgeMappings, 'edge mappings');
  requireApproved(g4HostSectors, 'G4 host sectors');
  requireApproved(canonicalG5, 'canonical G5 rows');
  requireApproved(sceneAssignments, 'scene assignments');

  requireExactCount(countKind(physicalExitPairs, 'intra_g4_site_connection_source'), 227, 'intra-G4 physical pairs');
  requireExactCount(countKind(physicalExitPairs, 'host_entry_site_connection_source'), 32, 'host-entry physical pairs');
  requireExactCount(countKind(physicalExitPairs, 'cross_g4_world_route_source'), 43, 'direct-route physical pairs');
  requireExactCount(countKind(physicalExitPairs, 'corridor_to_host_route_context_source'), 32, 'corridor route-context physical pairs');
  requireExactCount(countKind(physicalExitPairs, 'world_route_segment_context_source'), 24, 'segment route-context physical pairs');
  requireExactCount(
    countKind(physicalExitPairs, 'corridor_to_host_route_context_source') +
      countKind(physicalExitPairs, 'world_route_segment_context_source'),
    56,
    'route-context physical pairs'
  );
  requireExactCount(physicalExitPairs.length, 358, 'approved source physical pairs');
  requireExactCount(edgeMappings.filter((row) => row.physical === false).length, 242, 'approved hierarchy mappings');
  requireExactCount(edgeMappings.filter((row) => row.physical === true).length, 358, 'approved physical mappings');
  requireExactCount(countKind(edgeMappings, 'retained_hierarchy_dependency'), 47, 'retained hierarchy mappings');
  requireExactCount(countKind(edgeMappings, 'canonical_g5_parent_dependency'), 195, 'canonical G5 parent mappings');
  requireExactCount(edgeMappings.length, 600, 'approved typed edge mappings');

  requireExactCount(g4HostSectors.length, 32, 'approved source G4 host sectors');
  requireExactCount(canonicalG5.length, 195, 'approved source canonical G5');
  requireExactCount(canonicalG5.filter((row) => row.class_id === 'spatial.g5.compound').length, 0, 'canonical G5 compounds');
  requireExactCount(
    canonicalG5.filter((row) => row.external_route_availability === 'blocked_pending_external_boundary').length,
    4,
    'blocked external boundaries'
  );
  requireExactCount(
    sceneAssignments.filter((row) => row.external_route_availability === 'blocked_pending_external_boundary').length,
    4,
    'blocked scene boundaries'
  );
  requireSameIds(
    sceneAssignments.filter((row) => row.external_route_availability === 'blocked_pending_external_boundary'),
    canonicalG5.filter((row) => row.external_route_availability === 'blocked_pending_external_boundary'),
    'canonical_g5_id',
    'id',
    'blocked boundary scene assignments'
  );

  const nodes = targetDatasets.spatial_v3_nodes;
  const targetG4 = nodes.filter((row) => row.spatial_level === 'G4');
  const targetG5 = nodes.filter((row) => row.spatial_level === 'G5');
  requireExactCount(targetG4.length, 32, 'target G4 sectors');
  requireExactCount(targetG5.length, 195, 'target canonical G5');
  requireSameIds(targetG4, g4HostSectors, 'id', 'id', 'target G4 directly compiled from approved G3 host evidence');
  if (targetG4.some((row) => row.primary_class_id !== 'spatial.g4.sector' || row.status !== 'approved')) {
    throw new Error('P04 approved projection target G4 class/status mismatch');
  }
  const targetG4Ids = new Set(targetG4.map((row) => row.id));
  const targetG4Parents = targetDatasets.spatial_v3_node_parents.filter((row) => targetG4Ids.has(row.child_id));
  requireSameRelations(
    targetG4Parents,
    g4HostSectors,
    ['child_id', 'parent_id'],
    ['id', 'parent_g3_id'],
    'target G4 parents directly compiled from approved retained G3 evidence'
  );
  requireSameIds(targetG5, canonicalG5, 'id', 'id', 'target G5 directly compiled from approved canonical source evidence');
  requireExactCount(targetG5.filter((row) => row.primary_class_id === 'spatial.g5.compound').length, 0, 'target G5 compounds');
  requireSameIds(
    targetDatasets.spatial_v3_approved_physical_source_pairs,
    physicalExitPairs,
    'id',
    'physical_exit_pair_id',
    'target physical source-pair registry'
  );
  requireExactCount(targetDatasets.spatial_v3_scene_templates.length, 17, 'target scene families');
  requireExactCount(targetDatasets.spatial_v3_scene_materialization_profiles.length, 195, 'target scene profiles');
  requireExactCount(targetDatasets.spatial_v3_scene_materialization_candidates.length, 195, 'target scene candidates');

  for (const token of [
    '32 target G4 sectors',
    '195 canonical G5',
    '358 physical exit pairs',
    '600 typed edge mappings',
    '17 scene families',
    '195 profiles/candidates',
    'source_approved; target_compilation_approved',
    '`datasets: 37`',
    '`data_gaps: 0`',
    '227 intra-G4, 32 host-entry, 43 cross-G4 route и 56 route-context pairs',
    'Ни один record не классифицирован как `compound`',
    'четыре boundary sites'
  ]) {
    if (!catalog.includes(token)) throw new Error(`Novgorod catalog approved P12 projection: ${token} missing`);
  }
  const structuredStatusPattern = /Production import:\s*`?([a-z_]+)`?;\s*runtime visibility:\s*`?([a-z_]+)`?;\s*P28 activation:\s*`?([a-z_]+)`?\./giu;
  const structuredStatuses = [...catalog.matchAll(structuredStatusPattern)];
  if (structuredStatuses.length !== 1) {
    throw new Error(`P04 catalog must contain exactly one structured status assertion; found ${structuredStatuses.length}`);
  }
  const [, productionImport, runtimeVisibility, p28Activation] = structuredStatuses[0];
  if (productionImport !== 'not_performed' || runtimeVisibility !== 'not_verified' || p28Activation !== 'not_performed') {
    throw new Error('P04 catalog contains a contradictory production/runtime/P28 status assertion');
  }
  for (const contradictoryStatus of [
    /Production import:\s*`?performed`?/iu,
    /runtime visibility:\s*`?verified`?/iu,
    /P28 activation:\s*`?performed`?/iu
  ]) {
    if (contradictoryStatus.test(catalog)) {
      throw new Error('P04 catalog contains a contradictory production/runtime/P28 status assertion');
    }
  }
  if (!catalog.includes('Production import: `not_performed`; runtime visibility: `not_verified`; P28 activation: `not_performed`.')) {
    throw new Error('P04 catalog production boundary is missing or was weakened');
  }
  if (sourceGapStatus.production_activation_allowed !== false) {
    throw new Error('P04 catalog production boundary conflicts with source approval');
  }
}

async function loadProjectionEvidence(rootManifest) {
  const spatialRoot = 'data/world-catalogs/novgorod/spatial-v3';
  const datasetArtifacts = await Promise.all(rootManifest.datasets.map(async (entry) => ({
    entry,
    bytes: await readFile(resolve(spatialRoot, entry.file))
  })));
  const targetDatasets = Object.fromEntries(datasetArtifacts.map(({ entry, bytes }) => [
    entry.table,
    JSON.parse(bytes.toString('utf8'))
  ]));
  const sourceRoot = resolve(spatialRoot, 'source-approval/p12_novgorod_source_approval_001/data');
  const sourceEvidence = Object.fromEntries(await Promise.all([
    ['physicalExitPairs', 'physical-exit-source-pairs.json'],
    ['edgeMappings', 'legacy-edge-mapping-bindings.json'],
    ['g4HostSectors', 'g4-host-sectors.json'],
    ['canonicalG5', 'canonical-g5-inventory.json'],
    ['sceneAssignments', 'scene-profile-assignments.json']
  ].map(async ([key, file]) => [key, JSON.parse(await readFile(resolve(sourceRoot, file), 'utf8')).records])));
  return {
    datasetArtifacts,
    targetDatasets,
    sourceEvidence
  };
}

async function main() {
  const docs = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readFile(file, 'utf8')])));

  for (const [key, text] of Object.entries(docs)) {
    if (!text.includes('target') || !text.includes('P28')) throw new Error(`${key}: target/active boundary missing`);
  }
  for (const token of ['G3', 'G4', 'G5', 'G6', 'scene_position', 'typed data gap', 'NPC', 'items', 'candidate set']) {
    if (!docs.world.includes(token)) throw new Error(`world_generation_and_turns: ${token} missing`);
  }
  for (const token of ['mechanical_readiness', 'knowledge_visibility', 'hidden topology', 'layout', 'stranded', 'diagnostics']) {
    if (!docs.ux.includes(token)) throw new Error(`interface_ux: ${token} missing`);
  }
  for (const token of ['195 canonical G5', 'directional', 'Name-based migration запрещён', 'typed gap', 'not_verified']) {
    if (!docs.catalog.includes(token)) throw new Error(`Novgorod catalog: ${token} missing`);
  }
  for (const token of ['spatial_architecture_standard_g0_g6.md', 'world_generation_and_turns.txt', 'interface_ux.md']) {
    if (!docs.navigation.includes(token)) throw new Error(`navigation: ${token} missing`);
  }
  for (const token of ['generated target contract registry', '@rus/space-map', '@rus/movement-routes', '@rus/materialization', 'player-safe projection']) {
    if (!docs.registry.includes(token)) throw new Error(`target registry: ${token} missing`);
  }
  if (/automatic migration/i.test(docs.catalog) && !docs.catalog.includes('Name-based migration запрещён')) {
    throw new Error('Novgorod catalog: unsafe automatic migration assertion');
  }
  const rootManifest = JSON.parse(await readFile('data/world-catalogs/novgorod/spatial-v3/manifest.json', 'utf8'));
  const sourceGapStatus = JSON.parse(await readFile(
    'data/world-catalogs/novgorod/spatial-v3/source-approval/p12_novgorod_source_approval_001/data/gap-status.json',
    'utf8'
  ));
  const projectionEvidence = await loadProjectionEvidence(rootManifest);
  validateP04CatalogProjection({
    catalog: docs.catalog,
    rootManifest,
    sourceGapStatus,
    ...projectionEvidence
  });
  console.log('P04 checks passed: approved P12 authoring projection is synchronized while production/P28 and hidden-information boundaries remain closed.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
