import { canonicalDigest } from '@rus/materialization';
import { ROOT, digestNpcActorStepFileMap, exact, exactRef, hasOnlyNpcActorStepAuthorityDelta,
  readBundleArtifact } from './lower-dvina-trace-s1-bundle-utils.js';

export async function loadLowerDvinaTraceRevision25Bundle({ rootDir, historicalBundle,
  fail = (code) => { throw new Error(code); }, freezeDeep = Object.freeze,
  validateDefinitionPins = () => {} } = {}) {
  const content = `${ROOT}/phase-m13-content`;
  const paths = { manifest: `${content}/manifest.json`, definition: `${content}/definition.json`,
    npc_actor_step_profile: `${content}/npc-actor-step-profile.json`,
    local_fire_profile: `${ROOT}/phase-m10-content/local-fire-profile.json`,
    phase_1a_manifest: `${ROOT}/phase-1a-v21/manifest.json`,
    materialization_bindings: `${ROOT}/phase-1a-v21/materialization-bindings.json` };
  const loaded = Object.fromEntries(await Promise.all(Object.entries(paths)
    .map(async ([key, path]) => [key, await readBundleArtifact(rootDir, path)])));
  const manifest = loaded.manifest.value;
  const profile = loaded.npc_actor_step_profile.value;
  const phase1a = loaded.phase_1a_manifest.value;
  const bindings = loaded.materialization_bindings.value;
  const files = { 'definition.json': loaded.definition.digest,
    'npc-actor-step-profile.json': loaded.npc_actor_step_profile.digest };
  if (![historicalBundle?.definition_revision === 24,
    manifest?.schema === 'rus.lower_dvina_trace_m13_content_manifest.v1',
    manifest.scenario_definition_revision === 25,
    manifest.superseded_package_ref?.digest === historicalBundle.m12_content_manifest_digest,
    manifest.superseded_definition_ref?.digest === historicalBundle.artifact_pins.definition.digest,
    exact(manifest.files, files), manifest.content_digest === digestNpcActorStepFileMap(files),
    exactRef(manifest.content_refs?.definition, loaded.definition, 'definition.json', 'lower_dvina_trace_v1', 25),
    exactRef(manifest.content_refs?.npc_actor_step_profile, loaded.npc_actor_step_profile,
      'npc-actor-step-profile.json', 'lower_dvina_trace_npc_actor_step_profile_v1', 1, 'profile_id'),
    profile?.schema === 'rus.lower_dvina_trace_npc_actor_step_profile.v1', profile.status === 'approved',
    profile.revision === 1, profile.activation_boundary?.phase === 'phase_7',
    profile.activation_boundary?.npc_participant_slot_ref === 'zhdanko_storehouse_controller',
    canonicalDigest(profile.actor_mechanics_context) === canonicalDigest({
      attributes: [{ attribute_ref: 'strength', label: 'сила', value: 10 }]
    }), profile.fallback_policy === 'forbidden',
    phase1a?.package_id === 'lower_dvina_trace_phase_1a_v21', phase1a.scenario_definition_revision === 25,
    phase1a.superseded_package_ref?.digest === historicalBundle.artifact_pins.phase_1a_manifest.digest,
    phase1a.base_definition_ref?.digest === loaded.manifest.digest,
    exactRef(phase1a.content_refs?.materialization_bindings, loaded.materialization_bindings,
      paths.materialization_bindings, 'lower_dvina_trace_phase_1a_materialization_bindings_v21', 21, 'binding_set_id'),
    bindings?.scenario_definition_revision === 25,
    bindings.superseded_binding_ref?.digest === historicalBundle.artifact_pins.materialization_bindings.digest,
    exactRef(bindings.local_fire_materialization?.profile_ref, loaded.local_fire_profile, paths.local_fire_profile,
      'lower_dvina_trace_f1_local_exact_fire_profile_v1', 1, 'profile_id'),
    hasOnlyNpcActorStepAuthorityDelta(bindings, historicalBundle, loaded.local_fire_profile),
    bindings.npc_actor_step_activation?.profile_ref?.digest === loaded.npc_actor_step_profile.digest,
    bindings.npc_actor_step_activation?.fallback_policy === 'forbidden'].every(Boolean)) return fail(
    'TRACE_REVISION_25_CONTENT_INVALID', 'Revision 25 NPC actor-step content is stale or incomplete.');
  const mergedBindings = { ...structuredClone(historicalBundle.materialization_bindings), ...structuredClone(bindings) };
  const bundle = { ...structuredClone(historicalBundle), definition_revision: 25,
    manifest_digest: loaded.phase_1a_manifest.digest, phase_1a_manifest: phase1a,
    m13_content_manifest_digest: loaded.manifest.digest, definition: loaded.definition.value,
    npc_actor_step_profile: profile, local_fire_profile: loaded.local_fire_profile.value,
    materialization_bindings: mergedBindings, artifact_pins: { ...historicalBundle.artifact_pins } };
  for (const [key, artifact, path] of [
    ['phase_1a_manifest', bundle.phase_1a_manifest, paths.phase_1a_manifest],
    ['materialization_bindings', mergedBindings, paths.materialization_bindings], ['definition', bundle.definition, paths.definition],
    ['local_fire_profile', bundle.local_fire_profile, paths.local_fire_profile],
    ['npc_actor_step_profile', bundle.npc_actor_step_profile, paths.npc_actor_step_profile]
  ]) bundle.artifact_pins[key] = { key, path, digest: loaded[key].digest,
    canonical_digest: canonicalDigest(artifact), schema: artifact.schema, revision: artifact.revision };
  validateDefinitionPins(bundle);
  return freezeDeep(bundle);
}
