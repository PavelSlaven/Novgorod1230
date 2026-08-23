import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const CONTENT = `${ROOT}/phase-m11-content`;

export async function loadLowerDvinaTraceRevision23Bundle({ rootDir,
  historicalBundle, fail = (code) => { throw new Error(code); },
  freezeDeep = Object.freeze, validateDefinitionPins = () => {} } = {}) {
  const paths = { manifest: `${CONTENT}/manifest.json`,
    definition: `${CONTENT}/definition.json`,
    local_fire_profile: `${CONTENT}/local-fire-profile.json`,
    spatial_semantic_profile: `${CONTENT}/spatial-semantic-profile.json`,
    phase_1a_manifest: `${ROOT}/phase-1a-v19/manifest.json`,
    materialization_bindings:
      `${ROOT}/phase-1a-v19/materialization-bindings.json` };
  const loaded = Object.fromEntries(await Promise.all(Object.entries(paths)
    .map(async ([key, path]) => [key, await read(rootDir, path)])));
  if (!validLowerDvinaTraceRevision23Bundle(historicalBundle, loaded, paths)) {
    return fail('TRACE_REVISION_23_CONTENT_INVALID',
      'Revision 23 S1 content is stale or incomplete.');
  }
  const bindings = { ...structuredClone(historicalBundle.materialization_bindings),
    ...structuredClone(loaded.materialization_bindings.value),
    action_production_materialization:
      structuredClone(historicalBundle.materialization_bindings
        .action_production_materialization),
    local_fire_materialization:
      structuredClone(historicalBundle.materialization_bindings
        .local_fire_materialization) };
  const bundle = { ...structuredClone(historicalBundle), definition_revision: 23,
    manifest_digest: loaded.phase_1a_manifest.digest,
    phase_1a_manifest: loaded.phase_1a_manifest.value,
    m11_content_manifest_digest: loaded.manifest.digest,
    definition: loaded.definition.value,
    local_fire_profile: structuredClone(historicalBundle.local_fire_profile),
    spatial_semantic_profile: loaded.spatial_semantic_profile.value,
    materialization_bindings: bindings,
    artifact_pins: { ...historicalBundle.artifact_pins } };
  for (const [key, artifact, path] of [
    ['phase_1a_manifest', bundle.phase_1a_manifest, paths.phase_1a_manifest],
    ['materialization_bindings', bindings, paths.materialization_bindings],
    ['definition', bundle.definition, paths.definition],
    ['spatial_semantic_profile', bundle.spatial_semantic_profile,
      paths.spatial_semantic_profile]
  ]) bundle.artifact_pins[key] = { key, path, digest: loaded[key].digest,
    canonical_digest: canonicalDigest(artifact), schema: artifact.schema,
    revision: artifact.revision };
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
  return [historical?.definition_revision === 22,
    manifest?.schema === 'rus.lower_dvina_trace_m11_content_manifest.v1',
    manifest.scenario_definition_revision === 23,
    manifest.superseded_package_ref?.digest === historical.m10_content_manifest_digest,
    manifest.superseded_definition_ref?.digest === historical.artifact_pins.definition.digest,
    exact(manifest.files, files), manifest.content_digest === digestFileMap(files),
    exactRef(manifest.content_refs?.definition, loaded.definition,
      'definition.json', 'lower_dvina_trace_v1', 23),
    exactRef(manifest.content_refs?.local_fire_profile,
      loaded.local_fire_profile, 'local-fire-profile.json',
      'lower_dvina_trace_f1_local_exact_fire_profile_v1', 1, 'profile_id'),
    exactRef(manifest.content_refs?.spatial_semantic_profile,
      loaded.spatial_semantic_profile, 'spatial-semantic-profile.json',
      'lower_dvina_trace_s1_spatial_semantic_profile_v1', 1, 'profile_id'),
    loaded.definition.value?.supersedes_definition_ref?.digest
      === historical.artifact_pins.definition.digest,
    phase1a?.package_id === 'lower_dvina_trace_phase_1a_v19',
    phase1a.scenario_definition_revision === 23,
    phase1a.superseded_package_ref?.digest
      === historical.artifact_pins.phase_1a_manifest.digest,
    phase1a.base_definition_ref?.digest === loaded.manifest.digest,
    exactRef(phase1a.content_refs?.materialization_bindings,
      loaded.materialization_bindings, paths.materialization_bindings,
      'lower_dvina_trace_phase_1a_materialization_bindings_v19', 19,
      'binding_set_id'),
    bindings?.scenario_definition_revision === 23,
    bindings.superseded_binding_ref?.digest
      === historical.artifact_pins.materialization_bindings.digest,
    bindings.local_fire_materialization?.profile_ref?.digest
      === loaded.local_fire_profile.digest,
    bindings.spatial_semantic_materialization?.profile_ref?.digest
      === loaded.spatial_semantic_profile.digest,
    bindings.spatial_semantic_materialization?.fallback_policy === 'forbidden'
  ].every(Boolean);
}

export async function loadLowerDvinaTraceRevision24Bundle({ rootDir,
  historicalBundle, fail = (code) => { throw new Error(code); },
  freezeDeep = Object.freeze, validateDefinitionPins = () => {} } = {}) {
  const content = `${ROOT}/phase-m12-content`;
  const paths = { manifest: `${content}/manifest.json`,
    definition: `${content}/definition.json`,
    local_fire_profile: `${content}/local-fire-profile.json`,
    spatial_semantic_profile: `${content}/spatial-semantic-profile.json`,
    phase_1a_manifest: `${ROOT}/phase-1a-v20/manifest.json`,
    materialization_bindings: `${ROOT}/phase-1a-v20/materialization-bindings.json` };
  const loaded = Object.fromEntries(await Promise.all(Object.entries(paths)
    .map(async ([key, path]) => [key, await read(rootDir, path)])));
  const manifest = loaded.manifest.value;
  const phase1a = loaded.phase_1a_manifest.value;
  const bindings = loaded.materialization_bindings.value;
  const files = { 'definition.json': loaded.definition.digest,
    'local-fire-profile.json': loaded.local_fire_profile.digest,
    'spatial-semantic-profile.json': loaded.spatial_semantic_profile.digest };
  if (![historicalBundle?.definition_revision === 23,
    manifest?.schema === 'rus.lower_dvina_trace_m12_content_manifest.v1',
    manifest.scenario_definition_revision === 24,
    manifest.superseded_package_ref?.digest === historicalBundle.m11_content_manifest_digest,
    manifest.superseded_definition_ref?.digest === historicalBundle.artifact_pins.definition.digest,
    exact(manifest.files, files), manifest.content_digest === digestFileMap(files),
    exactRef(manifest.content_refs?.definition, loaded.definition,
      'definition.json', 'lower_dvina_trace_v1', 24),
    exactRef(manifest.content_refs?.local_fire_profile, loaded.local_fire_profile,
      'local-fire-profile.json', 'lower_dvina_trace_f1_local_exact_fire_profile_v1', 1, 'profile_id'),
    exactRef(manifest.content_refs?.spatial_semantic_profile, loaded.spatial_semantic_profile,
      'spatial-semantic-profile.json', 'lower_dvina_trace_s1_spatial_semantic_profile_v2', 2, 'profile_id'),
    phase1a?.package_id === 'lower_dvina_trace_phase_1a_v20',
    phase1a.scenario_definition_revision === 24,
    phase1a.superseded_package_ref?.digest === historicalBundle.artifact_pins.phase_1a_manifest.digest,
    phase1a.base_definition_ref?.digest === loaded.manifest.digest,
    exactRef(phase1a.content_refs?.materialization_bindings, loaded.materialization_bindings,
      paths.materialization_bindings, 'lower_dvina_trace_phase_1a_materialization_bindings_v20', 20, 'binding_set_id'),
    bindings?.scenario_definition_revision === 24,
    bindings.superseded_binding_ref?.digest === historicalBundle.artifact_pins.materialization_bindings.digest,
    bindings.local_fire_materialization?.profile_ref?.digest === loaded.local_fire_profile.digest,
    bindings.spatial_semantic_materialization?.profile_ref?.digest === loaded.spatial_semantic_profile.digest,
    bindings.spatial_semantic_materialization?.fallback_policy === 'forbidden'
  ].every(Boolean)) return fail('TRACE_REVISION_24_CONTENT_INVALID',
    'Revision 24 first-entry content is stale or incomplete.');
  const mergedBindings = { ...structuredClone(historicalBundle.materialization_bindings),
    ...structuredClone(bindings), action_production_materialization:
      structuredClone(historicalBundle.materialization_bindings.action_production_materialization),
    local_fire_materialization:
      structuredClone(historicalBundle.materialization_bindings.local_fire_materialization) };
  const bundle = { ...structuredClone(historicalBundle), definition_revision: 24,
    manifest_digest: loaded.phase_1a_manifest.digest, phase_1a_manifest: phase1a,
    m12_content_manifest_digest: loaded.manifest.digest, definition: loaded.definition.value,
    spatial_semantic_profile: loaded.spatial_semantic_profile.value,
    materialization_bindings: mergedBindings,
    artifact_pins: { ...historicalBundle.artifact_pins } };
  for (const [key, artifact, path] of [
    ['phase_1a_manifest', bundle.phase_1a_manifest, paths.phase_1a_manifest],
    ['materialization_bindings', mergedBindings, paths.materialization_bindings],
    ['definition', bundle.definition, paths.definition],
    ['spatial_semantic_profile', bundle.spatial_semantic_profile, paths.spatial_semantic_profile]
  ]) bundle.artifact_pins[key] = { key, path, digest: loaded[key].digest,
    canonical_digest: canonicalDigest(artifact), schema: artifact.schema, revision: artifact.revision };
  validateDefinitionPins(bundle);
  return freezeDeep(bundle);
}

async function read(rootDir, path) { const raw = await readFile(resolve(rootDir,path));
  return { value: JSON.parse(raw), digest: createHash('sha256').update(raw).digest('hex') }; }
function exactRef(ref, loaded, path, id, revision, idField='id') { return ref?.path===path
  && ref.id===id && ref.revision===revision && ref.schema===loaded.value.schema
  && ref.digest===loaded.digest && (idField==='id'||loaded.value[idField]===id); }
function exact(actual, expected) { return JSON.stringify(Object.keys(actual??{}).sort())
  ===JSON.stringify(Object.keys(expected).sort())
  && Object.entries(expected).every(([key,value])=>actual[key]===value); }
function digestFileMap(files) {
  const payload = ['definition.json', 'local-fire-profile.json',
    'spatial-semantic-profile.json']
    .map((name) => `${name}:${files[name]}`).join('\n').concat('\n');
  return createHash('sha256').update(payload).digest('hex');
}
