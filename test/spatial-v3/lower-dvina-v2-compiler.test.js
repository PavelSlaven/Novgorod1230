import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildDependencyResolutionBundle,
  compileDataset,
  digest,
  PARENT_WORLD_REVISION,
  OUTPUT_WORLD_REVISION,
  validateDependencyResolutionBundle
} from '../../tools/spatial-v3/lower-dvina-v2-compiler.mjs';
import { validateLowerDvinaV2 } from '../../tools/spatial-v3/lower-dvina-v2-validator.mjs';

const exactHead = 'd4be6a6014b80ceae937b3900dad6cbe7c1e787d';
const parentManifestSha256 = 'a'.repeat(64);
const parentAuthoringVersions = [
  {
    entity_kind: 'spatial_node',
    entity_id: 'node_a',
    version: 3,
    world_revision_id: PARENT_WORLD_REVISION,
    status: 'approved',
    canonical_digest: 'b'.repeat(64)
  },
  {
    entity_kind: 'external_dependency',
    entity_id: 'navigation_zone',
    version: 1,
    world_revision_id: PARENT_WORLD_REVISION,
    status: 'approved',
    canonical_digest: 'c'.repeat(64)
  }
];

test('dependency bundle is sealed and selects no runtime latest', () => {
  const bundle = buildDependencyResolutionBundle({
    exactHead,
    parentManifestSha256,
    parentAuthoringVersions
  });

  assert.equal(validateDependencyResolutionBundle(bundle), true);
  assert.equal(bundle.selections[0].dependency_id, 'navigation_zone');
  assert.equal(bundle.selections[0].dependency_version, 1);
  assert.doesNotMatch(JSON.stringify(bundle), /runtime.*latest/iu);

  const tampered = structuredClone(bundle);
  tampered.selections[0].dependency_version = 2;
  assert.throws(() => validateDependencyResolutionBundle(tampered),
    /dependency_resolution_bundle_digest_mismatch/u);
});

test('version allocation is literal parent plus one and external remains exact', () => {
  const bundle = buildDependencyResolutionBundle({
    exactHead,
    parentManifestSha256,
    parentAuthoringVersions
  });
  const rows = compileDataset({
    table: 'spatial_v3_authoring_versions',
    rows: parentAuthoringVersions,
    parentAuthoringVersions,
    dependencyBundle: bundle
  });

  assert.deepEqual(rows.map(({ entity_kind, entity_id, version, world_revision_id }) => ({
    entity_kind,
    entity_id,
    version,
    world_revision_id
  })), [{
    entity_kind: 'spatial_node',
    entity_id: 'node_a',
    version: 4,
    world_revision_id: OUTPUT_WORLD_REVISION
  }]);
});

test('external dependency edge is pinned to registry and has no revision-local proxy', () => {
  const bundle = buildDependencyResolutionBundle({
    exactHead,
    parentManifestSha256,
    parentAuthoringVersions
  });
  const [edge] = compileDataset({
    table: 'spatial_v3_authoring_dependency_edges',
    rows: [{
      source_entity_kind: 'spatial_node',
      source_entity_id: 'node_a',
      source_version: 3,
      world_revision_id: PARENT_WORLD_REVISION,
      dependency_role: 'primary_function',
      target_entity_kind: 'external_dependency',
      target_entity_id: 'navigation_zone',
      target_version: 1,
      canonical_ordinal: 0,
      provenance_ref: 'source'
    }],
    parentAuthoringVersions,
    dependencyBundle: bundle
  });

  assert.equal(edge.source_version, 4);
  assert.equal(edge.target_version, 1);
  assert.equal(edge.target_registry_id, 'spatial_v3_external_dependencies');
  assert.equal(edge.target_dependency_digest, 'c'.repeat(64));
});

test('boundary staging candidate is not a production route record', async () => {
  const staging = JSON.parse(await readFile(
    'data/world-catalogs/novgorod/spatial-v3/staging/lower-dvina-boundary-v2/staging-candidate.json',
    'utf8'
  ));

  assert.equal(staging.semantic_ready, false);
  assert.equal(staging.runtime_selectable, false);
  assert.equal(staging.execution_allowed, false);
  assert.equal(staging.compiler_policy.production_contract_rows_emitted, false);
  assert.equal(digest(staging).length, 64);
});

test('generated full snapshot is closed and explicitly not active', async () => {
  const result = await validateLowerDvinaV2();

  assert.equal(result.pass, true, JSON.stringify(result.errors));
  assert.equal(result.dataset_count, 39);
  assert.equal(result.external_dependency_count, 99);
  assert.equal(result.production_activation, false);
});
