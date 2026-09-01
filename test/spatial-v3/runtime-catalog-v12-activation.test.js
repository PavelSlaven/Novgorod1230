import assert from 'node:assert/strict';
import test from 'node:test';

import { SPATIAL_V3_PRODUCTION_V12_RELEASE } from
  '../../tools/runtime-catalog-activation/src/spatial-v3-production-v12-activation.js';
import { buildS1AuthoringV5ImportSql, buildS1AuthoringV6ImportSql } from
  '../../tools/spatial-v3/s1-authoring-v5-importer.mjs';

test('v12 activation registry pins runtime catalog to v6 world manifest', () => {
  assert.deepEqual(SPATIAL_V3_PRODUCTION_V12_RELEASE, {
    releaseId: 'spatial-v3-production-v12',
    baselineRevision:
      'world_revision_novgorod_1230_runtime_catalog_baseline_v12_001',
    domainRevision: 'runtime_catalog_lower_dvina_spatial_v3_v12_001',
    worldRevision: 'novgorod_spatial_v3_production_v6_candidate_001',
    worldCatalogDigest:
      '6e6cd611042ff86229c73409816893ea4e983c01722dd4699bac346acfb846ad',
    worldManifestSha256:
      '776ab6989f5c8bb6c49858eb27b3bb9ac637a674e314f1c7e956a35cdbe569eb',
    worldSchemaFingerprint:
      'd5bb566dd7d22d34d06fcff0c3db961294c619753ce93557c4e91adae6375541',
    candidateDirectory: 'spatial-v3-production-v6',
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

test('v6 loader imports the canonical drying-shed S1 closure', async () => {
  const sql = await buildS1AuthoringV6ImportSql({ rollback: true });
  assert.match(sql, /novgorod_spatial_v3_production_v6_candidate_001/u);
  assert.match(sql, /trace_ld_v1_g5_old_drying_shed/u);
  assert.match(sql, /trace_ld_v1_tpl_old_drying_shed/u);
});
