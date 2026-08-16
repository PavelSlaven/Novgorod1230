import {
  applyFirstPlayableV2ActivationBundle,
  buildFirstPlayableV2ActivationBundle
} from './first-playable-v2-activation.js';

export const CHARACTER_APPEARANCE_V4_RELEASE = Object.freeze({
  releaseId: 'spatial-v3-production-v9',
  baselineRevision:
    'world_revision_novgorod_1230_runtime_catalog_baseline_v4_001',
  domainRevision:
    'runtime_catalog_lower_dvina_character_appearance_v4_001',
  worldRevision: 'novgorod_spatial_v3_production_v4_candidate_001',
  worldCatalogDigest:
    'acbcbba0ceae0b894e879aff097ed077a9b96e0d6d466c98d0d768ac6d3daf79',
  worldManifestSha256:
    '64511daaf22c234c1c8568c2674f162a23b3b4924e52135a45b05f698f8380cb',
  worldSchemaFingerprint:
    'd5bb566dd7d22d34d06fcff0c3db961294c619753ce93557c4e91adae6375541',
  candidateDirectory: 'spatial-v3-production-v4',
  bindingsFile: 'spatial-v3-production-v9-bindings.js',
  bundleSchema: 'rus.character_appearance_v4_activation_bundle.v1',
  bundleIdentitySchema:
    'rus.character_appearance_v4_activation_bundle_identity.v1',
  resultSchema: 'rus.character_appearance_v4_activation_result.v1',
  baselineTitle: 'Lower Dvina character appearance runtime catalog baseline v4',
  activationBasis:
    'canonical actor appearance revision 19 and first-playable catalog v2'
});

export function buildCharacterAppearanceV4ActivationBundle(options) {
  return buildFirstPlayableV2ActivationBundle({
    ...options,
    release: CHARACTER_APPEARANCE_V4_RELEASE
  });
}

export function applyCharacterAppearanceV4ActivationBundle(options) {
  return applyFirstPlayableV2ActivationBundle({
    ...options,
    release: CHARACTER_APPEARANCE_V4_RELEASE
  });
}
