import { mergeItemContainerSet } from './lower-dvina-trace-character-appearance-bundle.js';
import { canonicalDigest } from '@rus/materialization';
import { TRACE_SCENE_PRESENTATION_V3_DIGEST } from './lower-dvina-trace-scene-presentation.js';
import { validateNpcRoutineProfile } from '@rus/npc-runtime';
import { ROOT, readBundleArtifact } from './lower-dvina-trace-s1-bundle-utils.js';

export const TRACE_REVISION33_PHASE_1A_MANIFEST_DIGEST =
  'c1c6feaa072bc334a12703df17fe97df057c741cebc0ce0cf078527df87ee66b';
export const TRACE_REVISION33_DEFINITION_DIGEST =
  '220b872de6b470c8482c982019f9e20e23422927018357fca2a2f07cc2308d5c';
const ITEM_DISPLAY_OVERLAY_DIGEST = 'ff8c3cd970bbe27fcff3b4ead470d68b1855e976047c31c1fae1a690a46bcb50';
const artifacts = {
  scene_presentation: ['phase-1b-v28/scene-presentation-v3.json', TRACE_SCENE_PRESENTATION_V3_DIGEST],
  item_container_set: ['phase-m21-content/item-container-set-overlay.json', ITEM_DISPLAY_OVERLAY_DIGEST],
  definition: ['phase-m21-content/definition.json', TRACE_REVISION33_DEFINITION_DIGEST],
  initial_npc_schedule_profile: ['phase-m21-content/initial-npc-schedule-profile.json',
    'c52d9eaa4c1fe27b6f5a3bc0908671f482f7abf82f82ef3451c9b04a76f89aca'],
  phase_1a_manifest: ['phase-1a-v24/manifest.json', TRACE_REVISION33_PHASE_1A_MANIFEST_DIGEST],
  materialization_bindings: ['phase-1a-v24/materialization-bindings.json',
    '485a7f2fc1048ae37c88ed40ca8bfc4c8058aa97fdba2a46900536d03143f2fb']
};
export async function loadLowerDvinaTraceRevision33Bundle({ rootDir,
  historicalBundle, fail, freezeDeep, validateDefinitionPins }) {
  if (historicalBundle?.definition_revision !== 32) return fail('TRACE_REVISION_33_CONTENT_INVALID');
  const bundle = structuredClone(historicalBundle);
  for (const [key, [relative, digest]] of Object.entries(artifacts)) {
    const path = `${ROOT}/${relative}`;
    const loaded = await readBundleArtifact(rootDir, path);
    if (loaded.digest !== digest) return fail('TRACE_REVISION_33_CONTENT_INVALID');
    bundle[key] = key === 'item_container_set'
      ? mergeItemContainerSet(bundle[key], loaded.value, fail)
      : key === 'materialization_bindings'
        ? { ...bundle[key], ...loaded.value } : loaded.value;
    bundle.artifact_pins[key] = { key, path, digest,
      canonical_digest: canonicalDigest(bundle[key]), schema: bundle[key].schema,
      revision: bundle[key].revision };
  }
  const schedules = bundle.initial_npc_schedule_profile;
  for (const presentation of bundle.scene_presentation.route_presentations) {
    const route = bundle.movement_bindings.route_bindings.find(value => value.route_id === presentation.route_ref);
    const endpoint = id => bundle.location_topology_set.endpoints.find(value => value.endpoint_id === id)?.location_profile_id;
    if (!route || endpoint(route.source_endpoint) !== presentation.from_ref
        || endpoint(route.destination_endpoint) !== presentation.to_ref
        || typeof presentation.label !== 'string'
        || presentation.initial_perception_requirement != null
          && (presentation.initial_perception_requirement !== 'source_location_perception'
            || route.knowledge_state !== 'visible_from_start'
            || !route.knowledge_unlock_conditions.includes('start_location_perception')
            || typeof presentation.perceived_label !== 'string' || typeof presentation.perceived_cue !== 'string')) {
      return fail('TRACE_REVISION_33_ROUTE_PRESENTATION_INVALID');
    }
  }
  if (schedules.schema !== 'rus.lower_dvina_trace_initial_npc_schedule_profile.v2'
      || schedules.scenario_definition_revision !== 33
      || schedules.entries.length !== historicalBundle.initial_npc_schedule_profile.entries.length
      || !Array.isArray(schedules.routine_profiles)) return fail('TRACE_REVISION_33_CONTENT_INVALID');
  for (const profile of schedules.routine_profiles) validateNpcRoutineProfile(profile);
  for (const entry of schedules.entries) {
    if (schedules.routine_profiles.filter(({ profile_id }) =>
      profile_id === entry.routine_profile_ref).length !== 1) return fail('TRACE_REVISION_33_CONTENT_INVALID');
  }
  bundle.definition_revision = 33;
  bundle.manifest_digest = TRACE_REVISION33_PHASE_1A_MANIFEST_DIGEST;
  validateDefinitionPins(bundle);
  return freezeDeep(bundle);
}
