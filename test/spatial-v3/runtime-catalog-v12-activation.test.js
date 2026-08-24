import assert from 'node:assert/strict';
import test from 'node:test';

import { SPATIAL_V3_PRODUCTION_V12_RELEASE } from
  '../../tools/runtime-catalog-activation/src/spatial-v3-production-v12-activation.js';
import { buildS1AuthoringV5ImportSql } from
  '../../tools/spatial-v3/s1-authoring-v5-importer.mjs';

test('v12 activation registry pins runtime catalog to v5 world manifest', () => {
  assert.deepEqual(SPATIAL_V3_PRODUCTION_V12_RELEASE, {
    releaseId: 'spatial-v3-production-v12',
    baselineRevision:
      'world_revision_novgorod_1230_runtime_catalog_baseline_v12_001',
    domainRevision: 'runtime_catalog_lower_dvina_spatial_v3_v12_001',
    worldRevision: 'novgorod_spatial_v3_production_v5_candidate_001',
    worldCatalogDigest:
      'aa62e775635c5ec17693f3c15f7ef0a7427a77733566f534afc1dd201c5a42a8',
    worldManifestSha256:
      '6ef44bce7192e00481a58a0dedaf2d661252f0d2c7cc707df3e85cdf02c10e1c',
    worldSchemaFingerprint:
      'd5bb566dd7d22d34d06fcff0c3db961294c619753ce93557c4e91adae6375541',
    candidateDirectory: 'spatial-v3-production-v5',
    bindingsFile: 'spatial-v3-production-v12-bindings.js',
    bundleSchema: 'rus.spatial_v3_production_v12_activation_bundle.v1',
    bundleIdentitySchema:
      'rus.spatial_v3_production_v12_activation_bundle_identity.v1',
    resultSchema: 'rus.spatial_v3_production_v12_activation_result.v1',
    baselineTitle: 'Spatial-v3 production v12 runtime catalog baseline',
    activationBasis: 'S1 production runtime acceptance'
  });
});

test('v5 loader imports exact S1 world revision before v12 activation', async () => {
  const sql = await buildS1AuthoringV5ImportSql({ rollback: true });
  assert.match(sql, /novgorod_spatial_v3_production_v5_candidate_001/u);
  assert.match(sql, /S1_AUTHORING_V5_IMPORT_READBACK_MISMATCH/u);
  assert.match(sql, /ROLLBACK;\s*$/u);
});
