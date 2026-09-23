import { SPATIAL_V3_PRODUCTION_RELEASE as historicalRelease } from
  './production-spatial-v3-release-v16.js';
import { assertTargetCatalogActivationReadiness, withRuntimeCatalogActivationLock } from
  '../infrastructure/postgres/spatial-v3-production-readiness.js';
import { serverError } from '../errors.js';

const { scenario_binding_id, scenario_profile_exact_pins,
  parent_release_exact_pins, ...sharedReleaseContract } = historicalRelease;

export const SPATIAL_V3_TARGET_PRODUCTION_RELEASE = Object.freeze({
  ...sharedReleaseContract,
  release_id: 'spatial-v3-production-v17',
  activation_scope: 'new_production_parties_only',
  world_revision_id: 'novgorod_spatial_v3_target_contract_approval_001',
  world_catalog_digest: '0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e',
  world_catalog_manifest_sha256: '4056b93acc2a3c7ed4c76c18182d74b7ef5b9f5fc9c31f206670f11a6283192e',
  runtime_catalog_revision_id: 'item_container_spatial_v3_target_001',
  actor_base_attributes_catalog_revision_id: 'actor_base_attributes_spatial_v3_target_001'
});

// This factory is deliberately not the default release selector. All operational
// evidence comes from the existing catalog owners and the supplied database.
export async function createSpatialV3TargetProductionRelease({
  worldPool, itemApproval, actorApproval
} = {}) {
  const compatibleDigest = itemApproval?.request?.compatible_world_pin_manifest_digest;
  if (!/^[a-f0-9]{64}$/u.test(compatibleDigest ?? '') || !worldPool?.query) {
    throw serverError('SPATIAL_V3_TARGET_ACTIVATION_APPROVAL_REQUIRED',
      'Target release requires issued approvals and a world database readback.');
  }
  const candidate = Object.freeze({ ...SPATIAL_V3_TARGET_PRODUCTION_RELEASE,
    compatible_world_pin_manifest_digest: compatibleDigest });
  if (!actorApproval?.attestation || !itemApproval?.attestation) {
    throw serverError('SPATIAL_V3_TARGET_ACTIVATION_APPROVAL_REQUIRED',
      'Target release requires both issued catalog activation attestations.');
  }
  await withRuntimeCatalogActivationLock(worldPool, (client) =>
    assertTargetCatalogActivationReadiness(client, {
      release: candidate, itemApproval, actorApproval
    }));
  throw serverError('SPATIAL_V3_TARGET_START_BINDING_REQUIRED',
    'Verified target catalogs require an independently approved target start/scenario binding before production composition.');
}
