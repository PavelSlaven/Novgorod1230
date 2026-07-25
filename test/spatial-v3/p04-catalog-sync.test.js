import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { validateP04CatalogProjection } from '../../tools/spatial-v3/check-p04.mjs';

const root = process.cwd();
const spatialRoot = resolve(root, 'data/world-catalogs/novgorod/spatial-v3');

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function loadEvidence() {
  const catalog = await readFile(resolve(root, 'data/world-catalogs/novgorod/G1_SEMANTIC_CATALOG.md'), 'utf8');
  const rootManifest = await readJson(resolve(spatialRoot, 'manifest.json'));
  const sourceGapStatus = await readJson(resolve(
    spatialRoot,
    'source-approval/p12_novgorod_source_approval_001/data/gap-status.json'
  ));
  const datasetArtifacts = await Promise.all(rootManifest.datasets.map(async (entry) => ({
    entry,
    bytes: await readFile(resolve(spatialRoot, entry.file))
  })));
  const targetDatasets = Object.fromEntries(datasetArtifacts.map(({ entry, bytes }) => [
    entry.table,
    JSON.parse(bytes.toString('utf8'))
  ]));
  const sourceDataRoot = resolve(
    spatialRoot,
    'source-approval/p12_novgorod_source_approval_001/data'
  );
  const sourceEvidence = Object.fromEntries(await Promise.all([
    ['physicalExitPairs', 'physical-exit-source-pairs.json'],
    ['edgeMappings', 'legacy-edge-mapping-bindings.json'],
    ['g4HostSectors', 'g4-host-sectors.json'],
    ['canonicalG5', 'canonical-g5-inventory.json'],
    ['sceneAssignments', 'scene-profile-assignments.json']
  ].map(async ([key, file]) => [key, (await readJson(resolve(sourceDataRoot, file))).records])));

  return {
    catalog,
    rootManifest,
    sourceGapStatus,
    datasetArtifacts,
    targetDatasets,
    sourceEvidence
  };
}

test('P04 catalog reflects the approved P12 compilation and completed versioned cutover', async () => {
  const evidence = await loadEvidence();
  assert.doesNotThrow(() => validateP04CatalogProjection(evidence));
});

test('P04 catalog validation rejects stale authoring-gap statuses', async () => {
  const evidence = await loadEvidence();
  for (const staleStatus of ['mapping_not_performed', 'bindings_unverified']) {
    assert.throws(
      () => validateP04CatalogProjection({ ...evidence, catalog: `${evidence.catalog}\n${staleStatus}` }),
      /stale P04 authoring status/u
    );
  }
});

test('P04 catalog validation preserves the production and versioned cutover boundary', async () => {
  const evidence = await loadEvidence();
  const stalePreCutoverCatalog = evidence.catalog
    .replace('Production import: `performed`', 'Production import: `not_performed`')
    .replace('runtime visibility: `verified`', 'runtime visibility: `not_verified`')
    .replace(
      '`versioned production activation cutover`: `performed`',
      '`versioned production activation cutover`: `not_performed`'
    );
  assert.throws(
    () => validateP04CatalogProjection({
      ...evidence,
      catalog: stalePreCutoverCatalog
    }),
    /production boundary|contradictory/u
  );
});

test('P04 catalog validation rejects an additive contradictory activation status', async () => {
  const evidence = await loadEvidence();
  const contradictoryCatalog = `${evidence.catalog}\nProduction import: not_performed; runtime visibility: not_verified; versioned production activation cutover: not_performed.\n`;
  assert.throws(
    () => validateP04CatalogProjection({ ...evidence, catalog: contradictoryCatalog }),
    /contradictory|exactly one structured status/u
  );
});

test('P04 catalog validation derives the exact physical decomposition from approved source rows', async () => {
  const evidence = await loadEvidence();
  const intraG4 = evidence.sourceEvidence.physicalExitPairs.filter(
    (row) => row.target_mapping_kind === 'intra_g4_site_connection_source'
  );
  const otherPairs = evidence.sourceEvidence.physicalExitPairs.filter(
    (row) => row.target_mapping_kind !== 'intra_g4_site_connection_source'
  );
  const forgedIntraG4 = Array.from({ length: 999 }, (_, index) => ({
    ...intraG4[index % intraG4.length],
    physical_exit_pair_id: `forged-intra-g4-${index}`
  }));
  assert.throws(
    () => validateP04CatalogProjection({
      ...evidence,
      sourceEvidence: {
        ...evidence.sourceEvidence,
        physicalExitPairs: [...forgedIntraG4, ...otherPairs]
      }
    }),
    /intra-G4 physical pairs/u
  );
  assert.throws(
    () => validateP04CatalogProjection({
      ...evidence,
      catalog: evidence.catalog.replace('227 intra-G4', '999 intra-G4')
    }),
    /227 intra-G4/u
  );
});

test('P04 catalog validation rejects forty blocked boundaries instead of the approved four', async () => {
  const evidence = await loadEvidence();
  let promoted = 0;
  const canonicalG5 = evidence.sourceEvidence.canonicalG5.map((row) => {
    if (row.external_route_availability !== 'normal' || promoted >= 36) return row;
    promoted += 1;
    return { ...row, external_route_availability: 'blocked_pending_external_boundary' };
  });
  assert.throws(
    () => validateP04CatalogProjection({
      ...evidence,
      sourceEvidence: { ...evidence.sourceEvidence, canonicalG5 }
    }),
    /blocked external boundaries/u
  );
  assert.throws(
    () => validateP04CatalogProjection({
      ...evidence,
      catalog: evidence.catalog.replace('четыре boundary sites', 'сорок boundary sites')
    }),
    /четыре boundary sites/u
  );
});

test('P04 catalog validation verifies every manifest SHA against raw dataset bytes', async () => {
  const evidence = await loadEvidence();
  const rootManifest = structuredClone(evidence.rootManifest);
  rootManifest.datasets[0].sha256 = '0'.repeat(64);
  assert.throws(
    () => validateP04CatalogProjection({ ...evidence, rootManifest }),
    /dataset SHA-256 mismatch/u
  );
});

test('P04 catalog validation proves zero compounds and the exact approved G3-to-G4 projection', async () => {
  const evidence = await loadEvidence();
  const canonicalG5 = evidence.sourceEvidence.canonicalG5.map((row, index) => (
    index === 0 ? { ...row, class_id: 'spatial.g5.compound' } : row
  ));
  assert.throws(
    () => validateP04CatalogProjection({
      ...evidence,
      sourceEvidence: { ...evidence.sourceEvidence, canonicalG5 }
    }),
    /canonical G5 compounds/u
  );

  assert.throws(
    () => validateP04CatalogProjection({
      ...evidence,
      sourceEvidence: {
        ...evidence.sourceEvidence,
        g4HostSectors: evidence.sourceEvidence.g4HostSectors.slice(1)
      }
    }),
    /approved source G4 host sectors/u
  );
});
