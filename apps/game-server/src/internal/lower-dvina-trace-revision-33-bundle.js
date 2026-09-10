import { canonicalDigest } from '@rus/materialization';
import { validateNpcRoutineProfile } from '@rus/npc-runtime';
import { ROOT, readBundleArtifact } from './lower-dvina-trace-s1-bundle-utils.js';

export const TRACE_REVISION33_PHASE_1A_MANIFEST_DIGEST =
  '6b6351c6cec4a814966691e123887d8e96ab2b2ee3189c2ac2a754bb049fb80e';
export const TRACE_REVISION33_DEFINITION_DIGEST =
  'e3f9ed3adf251dc6b55e1d55df7fb42af11761d10db9e04672203b8ad50d8872';
const artifacts = {
  definition: ['phase-m21-content/definition.json', TRACE_REVISION33_DEFINITION_DIGEST],
  initial_npc_schedule_profile: ['phase-m21-content/initial-npc-schedule-profile.json',
    'c52d9eaa4c1fe27b6f5a3bc0908671f482f7abf82f82ef3451c9b04a76f89aca'],
  phase_1a_manifest: ['phase-1a-v24/manifest.json', TRACE_REVISION33_PHASE_1A_MANIFEST_DIGEST],
  materialization_bindings: ['phase-1a-v24/materialization-bindings.json',
    '13fb9ab93681a491d3629d574e88d951ecd6cd936b008d5fd3cace357710ff00']
};
export async function loadLowerDvinaTraceRevision33Bundle({ rootDir,
  historicalBundle, fail, freezeDeep, validateDefinitionPins }) {
  if (historicalBundle?.definition_revision !== 32) return fail('TRACE_REVISION_33_CONTENT_INVALID');
  const bundle = structuredClone(historicalBundle);
  for (const [key, [relative, digest]] of Object.entries(artifacts)) {
    const path = `${ROOT}/${relative}`;
    const loaded = await readBundleArtifact(rootDir, path);
    if (loaded.digest !== digest) return fail('TRACE_REVISION_33_CONTENT_INVALID');
    bundle[key] = key === 'materialization_bindings'
      ? { ...bundle[key], ...loaded.value } : loaded.value;
    bundle.artifact_pins[key] = { key, path, digest,
      canonical_digest: canonicalDigest(bundle[key]), schema: loaded.value.schema,
      revision: loaded.value.revision };
  }
  const schedules = bundle.initial_npc_schedule_profile;
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
