import { canonicalDigest } from '@rus/materialization';
import { serverError } from '../errors.js';

/** Publish the exact loaded target start through the existing authored-start API. */
export function createTargetAuthoredStartCatalog({ runtime, release, historicalCatalog = null,
  turnProfile = null, ordinaryProfiles = null } = {}) {
  const profile = runtime?.profile; const start = profile?.canonical_start?.start;
  if (!start || release?.scenario_binding_id !== profile.scenario_id
    || release.world_revision_id !== start.world_pin.world_revision_id
    || release.world_catalog_digest !== start.world_pin.world_catalog_digest
    || release.scenario_profile_exact_pins?.phase_1a_manifest_digest !== profile.manifest_digest
    || release.scenario_profile_exact_pins?.scenario_definition_revision !== 1) {
    throw serverError('SPATIAL_V3_TARGET_START_BINDING_REQUIRED', 'Exact target start publication pins are required.');
  }
  const runtimeBinding = Object.freeze({ catalog_id: 'novgorod_live_world_runtime_v17', revision: 1,
    status: 'approved', scenario_id: profile.scenario_id, materializer_binding_id: 'target_canonical_authored_start_v1',
    materializer_version: 'code_materializer_v3', snapshot_schema: 'rus.authored_start_initial_party_snapshot.v3' });
  const metadata = Object.freeze({ ...profile.public_metadata,
    available: release.production_activation === true && release.runtime_selectable_in_canonical_production === true });
  const world = start.world_pin;
  const binding = Object.freeze({ schema: 'rus.live_world_runtime.authored_start_binding.v1',
    binding_id: `${profile.scenario_id}@1`, revision: 1, status: 'approved', scenario_id: profile.scenario_id,
    publication_availability: 'public', fallback_policy: 'forbidden', public_metadata: metadata,
    materializer_binding_id: runtimeBinding.materializer_binding_id,
    phase_1a_manifest_ref: { digest: profile.manifest_digest },
    scenario_definition_ref: { revision: 1, digest: profile.manifest_digest },
    execution_identity: { materializer_version: runtimeBinding.materializer_version, rng_algorithm_id: 'mulberry32_v1',
      seed_context: `authored_start:${profile.scenario_id}:v1`, trigger: 'new_game', occurrence: 0 },
    world_compatibility: { source_world_revision_id: world.world_revision_id, source_world_catalog_digest: world.world_catalog_digest,
      source_status: 'approved', production_world_revision_id: world.world_revision_id,
      production_world_catalog_digest: world.world_catalog_digest, lineage: [] },
    runtime_binding: { catalog_id: runtimeBinding.catalog_id, revision: runtimeBinding.revision } });
  const date = start.initial_environment_inputs.calendar_date;
  const publication = Object.freeze({
    manifest_digest: canonicalDigest({ source_pins: profile.canonical_start.policy_profile_pins, world_pin: world }),
    binding, binding_digest: canonicalDigest(binding), materialization_profile: profile,
    public_projection: { scenario_id: profile.scenario_id, public_metadata: metadata,
      opening_projection: { version: 1, schema: 'first_game_screen',
        visible_field_allowlist: ['party_id', 'player.name', 'player.social_status', 'position', 'timestamp', 'body', 'environment'],
        place_label: metadata.title, calendar_label: `${date.day}.${date.month}.${date.year}`, opening_prose: '' } } });
  return Object.freeze({ actor_catalog: profile.actor_catalog, turn_profile: turnProfile,
    ordinary_profiles: ordinaryProfiles, runtime_binding: binding.runtime_binding,
    listPublic: () => [{ scenario_id: profile.scenario_id, ...metadata }],
    hasScenario: (scenarioId) => metadata.available && scenarioId === profile.scenario_id,
    resolveProfile: (scenarioId) => scenarioId === profile.scenario_id ? profile : historicalCatalog?.resolveProfile(scenarioId) ?? null,
    loadPublication: async (scenarioId, { bindingRevision = 1 } = {}) => {
      if (scenarioId === profile.scenario_id) return bindingRevision == null || bindingRevision === 1 ? publication : null;
      return historicalCatalog?.loadPublication(scenarioId, { bindingRevision }) ?? null;
    },
    resolveRuntimeBinding: (ref) => ref?.catalog_id === runtimeBinding.catalog_id && ref.revision === runtimeBinding.revision
      ? runtimeBinding : historicalCatalog?.resolveRuntimeBinding(ref) ?? null });
}
