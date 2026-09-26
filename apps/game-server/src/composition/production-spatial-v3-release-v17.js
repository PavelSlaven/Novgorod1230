import { SPATIAL_V3_PRODUCTION_RELEASE as historicalRelease } from
  './production-spatial-v3-release-v16.js';
import { assertTargetCatalogActivationReadiness, withRuntimeCatalogActivationLock } from
  '../infrastructure/postgres/spatial-v3-production-readiness.js';
import { serverError } from '../errors.js';
import { loadTargetAuthoredStartRuntimes } from '../infrastructure/postgres/target-authored-start-runtime.js';
import { createSpatialV3WorldBaseReader } from '../infrastructure/postgres/spatial-v3-world-base-reader.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

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

export async function loadTargetCatalogActivationApprovals({ config = {}, env = process.env } = {}) {
  if (config.targetCatalogActivationApprovals != null) return config.targetCatalogActivationApprovals;
  const path = config.targetCatalogActivationApprovalsPath ?? env.RUS_SPATIAL_V3_TARGET_ACTIVATION_APPROVALS_PATH;
  if (!path) return {};
  return JSON.parse(await readFile(resolve(config.rootDir ?? process.cwd(), path), 'utf8'));
}

// This factory is deliberately not the default release selector. All operational
// evidence comes from the existing catalog owners and the supplied database.
export async function createSpatialV3TargetProductionRelease({
  worldPool, itemApproval, actorApproval, rootDir = process.cwd()
} = {}) {
  return (await loadSpatialV3TargetProductionRelease({ worldPool, itemApproval, actorApproval, rootDir })).release;
}

export async function loadSpatialV3TargetProductionRelease({
  worldPool, itemApproval, actorApproval, rootDir = process.cwd()
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
  return withRuntimeCatalogActivationLock(worldPool, async (client) => {
    const readback = await assertTargetCatalogActivationReadiness(client, {
      release: candidate, itemApproval, actorApproval
    });
    const starts = await loadTargetAuthoredStartRuntimes({ worldPool: client, itemPin: readback.item_pin,
      actorBinding: readback.actor_binding, rootDir });
    const pins = Object.fromEntries(starts.map(({ profile }) => [profile.scenario_id,
      Object.freeze({ scenario_definition_revision: 1,
        scenario_definition_digest: profile.manifest_digest,
        phase_1a_package_id: profile.canonical_start.start.candidate_id,
        phase_1a_manifest_digest: profile.manifest_digest })]));
    const release = Object.freeze({ ...candidate, scenario_binding_id: starts[0].profile.scenario_id,
      scenario_binding_ids: Object.freeze(starts.map(({ profile }) => profile.scenario_id)),
      scenario_profile_exact_pins: pins[starts[0].profile.scenario_id],
      scenario_profile_exact_pins_by_id: Object.freeze(pins),
      target_start_source_pins: starts[0].profile.canonical_start.policy_profile_pins });
    // Activation reads use the locked transaction. Later public reads must own
    // their connection through the pool, never retain that released client.
    const runtime = Object.freeze({ ...starts[0], starts: Object.freeze(starts.map((start) => Object.freeze({
      ...start, worldBaseReader: createSpatialV3WorldBaseReader({ query: worldPool.query.bind(worldPool), generatedTemplateVersion: 2 }) }))),
      worldBaseReader: createSpatialV3WorldBaseReader({ query: worldPool.query.bind(worldPool), generatedTemplateVersion: 2 }) });
    return Object.freeze({ release, readback, runtime });
  });
}
