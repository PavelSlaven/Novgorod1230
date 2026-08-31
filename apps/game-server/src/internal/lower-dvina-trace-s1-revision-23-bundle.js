import { canonicalDigest } from '@rus/materialization';
import { ROOT, digestFileMap, exact, exactRef, readBundleArtifact } from './lower-dvina-trace-s1-bundle-utils.js';

const CONTENT = `${ROOT}/phase-m11-content`;
const REVISION23_FROZEN_PARENT = Object.freeze({
  manifest: 'eff193c6e7348ff2e18593a00d3f4197934398629bd41f9880b141fc8f04c3ef',
  definition: '54b868f174a25f35525e9188848986889a481551be158d9494965fc47b0027fe',
  phase1a: 'daa33208e16e0bf77fdf9f2a11b4d25899a19f816f6d843fd9ea9977f3c5d48e',
  bindings: 'be5d71e21c11336c65b334617168b329f5ab277b1aedb134e5da035797722d35'
});
export async function loadLowerDvinaTraceRevision23Bundle({ rootDir, historicalBundle,
  fail = (code) => { throw new Error(code); }, freezeDeep = Object.freeze,
  validateDefinitionPins = () => {} } = {}) {
  const paths = { manifest: `${CONTENT}/manifest.json`, definition: `${CONTENT}/definition.json`,
    local_fire_profile: `${CONTENT}/local-fire-profile.json`,
    spatial_semantic_profile: `${CONTENT}/spatial-semantic-profile.json`,
    phase_1a_manifest: `${ROOT}/phase-1a-v19/manifest.json`,
    materialization_bindings: `${ROOT}/phase-1a-v19/materialization-bindings.json` };
  const loaded = Object.fromEntries(await Promise.all(Object.entries(paths)
    .map(async ([key, path]) => [key, await readBundleArtifact(rootDir, path)])));
  if (!validLowerDvinaTraceRevision23Bundle(historicalBundle, loaded, paths)) return fail(
    'TRACE_REVISION_23_CONTENT_INVALID', 'Revision 23 S1 content is stale or incomplete.');
  const bindings = { ...structuredClone(historicalBundle.materialization_bindings),
    ...structuredClone(loaded.materialization_bindings.value), action_production_materialization:
      structuredClone(historicalBundle.materialization_bindings.action_production_materialization),
    local_fire_materialization: structuredClone(historicalBundle.materialization_bindings.local_fire_materialization) };
  const bundle = { ...structuredClone(historicalBundle), definition_revision: 23,
    manifest_digest: loaded.phase_1a_manifest.digest, phase_1a_manifest: loaded.phase_1a_manifest.value,
    m11_content_manifest_digest: loaded.manifest.digest, definition: loaded.definition.value,
    local_fire_profile: structuredClone(historicalBundle.local_fire_profile),
    spatial_semantic_profile: loaded.spatial_semantic_profile.value, materialization_bindings: bindings,
    artifact_pins: { ...historicalBundle.artifact_pins } };
  for (const [key, artifact, path] of [
    ['phase_1a_manifest', bundle.phase_1a_manifest, paths.phase_1a_manifest],
    ['materialization_bindings', bindings, paths.materialization_bindings], ['definition', bundle.definition, paths.definition],
    ['spatial_semantic_profile', bundle.spatial_semantic_profile, paths.spatial_semantic_profile]
  ]) bundle.artifact_pins[key] = { key, path, digest: loaded[key].digest,
    canonical_digest: canonicalDigest(artifact), schema: artifact.schema, revision: artifact.revision };
  validateDefinitionPins(bundle);
  return freezeDeep(bundle);
}
export function validLowerDvinaTraceRevision23Bundle(historical, loaded, paths) {
  const manifest = loaded.manifest.value;
  const phase1a = loaded.phase_1a_manifest.value;
  const bindings = loaded.materialization_bindings.value;
  const files = { 'definition.json': loaded.definition.digest,
    'local-fire-profile.json': loaded.local_fire_profile.digest,
    'spatial-semantic-profile.json': loaded.spatial_semantic_profile.digest };
  return [historical?.definition_revision === 22, manifest?.schema === 'rus.lower_dvina_trace_m11_content_manifest.v1',
    manifest.scenario_definition_revision === 23,
    matchesCurrentOrFrozen(manifest.superseded_package_ref?.digest, historical.m10_content_manifest_digest,
      REVISION23_FROZEN_PARENT.manifest),
    matchesCurrentOrFrozen(manifest.superseded_definition_ref?.digest, historical.artifact_pins.definition.digest,
      REVISION23_FROZEN_PARENT.definition), exact(manifest.files, files), manifest.content_digest === digestFileMap(files),
    exactRef(manifest.content_refs?.definition, loaded.definition, 'definition.json', 'lower_dvina_trace_v1', 23),
    exactRef(manifest.content_refs?.local_fire_profile, loaded.local_fire_profile, 'local-fire-profile.json',
      'lower_dvina_trace_f1_local_exact_fire_profile_v1', 1, 'profile_id'),
    exactRef(manifest.content_refs?.spatial_semantic_profile, loaded.spatial_semantic_profile,
      'spatial-semantic-profile.json', 'lower_dvina_trace_s1_spatial_semantic_profile_v1', 1, 'profile_id'),
    matchesCurrentOrFrozen(loaded.definition.value?.supersedes_definition_ref?.digest,
      historical.artifact_pins.definition.digest, REVISION23_FROZEN_PARENT.definition),
    phase1a?.package_id === 'lower_dvina_trace_phase_1a_v19', phase1a.scenario_definition_revision === 23,
    matchesCurrentOrFrozen(phase1a.superseded_package_ref?.digest,
      historical.artifact_pins.phase_1a_manifest.digest, REVISION23_FROZEN_PARENT.phase1a),
    phase1a.base_definition_ref?.digest === loaded.manifest.digest,
    exactRef(phase1a.content_refs?.materialization_bindings, loaded.materialization_bindings,
      paths.materialization_bindings, 'lower_dvina_trace_phase_1a_materialization_bindings_v19', 19, 'binding_set_id'),
    bindings?.scenario_definition_revision === 23,
    matchesCurrentOrFrozen(bindings.superseded_binding_ref?.digest,
      historical.artifact_pins.materialization_bindings.digest, REVISION23_FROZEN_PARENT.bindings),
    bindings.local_fire_materialization?.profile_ref?.digest === loaded.local_fire_profile.digest,
    bindings.spatial_semantic_materialization?.profile_ref?.digest === loaded.spatial_semantic_profile.digest,
    bindings.spatial_semantic_materialization?.fallback_policy === 'forbidden'].every(Boolean);
}
function matchesCurrentOrFrozen(actual, current, frozen) { return actual === current || actual === frozen; }
