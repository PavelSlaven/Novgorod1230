import {
  applyFirstPlayableV2ActivationBundle,
  buildFirstPlayableV2ActivationBundle
} from './first-playable-v2-activation.js';

export const LOWER_DVINA_BOUNDARY_V3_RELEASE = Object.freeze({
  releaseId: 'spatial-v3-production-v3',
  baselineRevision:
    'world_revision_novgorod_1230_runtime_catalog_baseline_v3_001',
  domainRevision: 'runtime_catalog_lower_dvina_first_playable_v3_001',
  worldRevision: 'novgorod_spatial_v3_production_v3_candidate_001',
  worldCatalogDigest:
    '1cf914ed9a19801f94b8b1463a717dbb0be7f1d51ea2351e6d1d5a51c492215e',
  worldManifestSha256:
    '593ccb341084f7433ec4ae9d7d0b2ea8b1dea07833636ef385550ba5a295ecea',
  worldSchemaFingerprint:
    'e977fdd2e6a7f06fd801b32b23965f35106d057c63989200546f179c6193091d',
  candidateDirectory: 'spatial-v3-production-v3',
  bindingsFile: 'spatial-v3-production-v3-bindings.js',
  bundleSchema: 'rus.lower_dvina_boundary_v3_activation_bundle.v1',
  bundleIdentitySchema:
    'rus.lower_dvina_boundary_v3_activation_bundle_identity.v1',
  resultSchema: 'rus.lower_dvina_boundary_v3_activation_result.v1',
  baselineTitle: 'Lower Dvina boundary runtime catalog baseline v3',
  activationBasis:
    'APPROVE_LOWER_DVINA_BOUNDARY_AUTHORING_V1; user authorized deletion of the exact obsolete v2 party before first v3 launch'
});

export function buildLowerDvinaBoundaryV3ActivationBundle(options) {
  return buildFirstPlayableV2ActivationBundle({
    ...options,
    release: LOWER_DVINA_BOUNDARY_V3_RELEASE
  });
}

export function applyLowerDvinaBoundaryV3ActivationBundle(options) {
  return applyFirstPlayableV2ActivationBundle({
    ...options,
    release: LOWER_DVINA_BOUNDARY_V3_RELEASE
  });
}
