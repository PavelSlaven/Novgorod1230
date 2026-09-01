import {
  applyFirstPlayableV2ActivationBundle,
  buildFirstPlayableV2ActivationBundle
} from './first-playable-v2-activation.js';

export const SPATIAL_V3_PRODUCTION_V12_RELEASE = Object.freeze({
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

export function buildSpatialV3ProductionV12ActivationBundle(options) {
  return buildFirstPlayableV2ActivationBundle({
    ...options,
    release: SPATIAL_V3_PRODUCTION_V12_RELEASE
  });
}

export function applySpatialV3ProductionV12ActivationBundle(options) {
  return applyFirstPlayableV2ActivationBundle({
    ...options,
    release: SPATIAL_V3_PRODUCTION_V12_RELEASE
  });
}
