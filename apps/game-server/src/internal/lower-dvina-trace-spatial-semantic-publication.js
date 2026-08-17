import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertLowerDvinaTracePhase1BWorldLineage } from
  './lower-dvina-trace-phase-1b-world-lineage.js';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const MANIFEST_PATH = `${ROOT}/phase-1b-v18/manifest.json`;
const BINDING_PATH = `${ROOT}/phase-1b-v18/publication-binding.json`;
const PHASE_1A_PATH = `${ROOT}/phase-1a-v19/manifest.json`;
const DEFINITION_PATH = `${ROOT}/phase-m11-content/definition.json`;
const SUPERSEDED_MANIFEST_PATH = `${ROOT}/phase-1b-v17/manifest.json`;
const SUPERSEDED_BINDING_PATH = `${ROOT}/phase-1b-v17/publication-binding.json`;
const SUPERSEDED_PHASE_1A_PATH = `${ROOT}/phase-1a-v18/manifest.json`;

export const TRACE_SPATIAL_SEMANTIC_PHASE_1A_MANIFEST_DIGEST =
  '3ced300f893f659c7a601f995d288ca5bef604e12e9c72352f6386cb9120d2d8';
const MANIFEST_DIGEST = '7a872ccd602cb83c56f4f717a6d424e4d79dbf6f4d1f9ca1ba31f6358c0a88bf';
const BINDING_DIGEST = '8efc7da30734ce05c357760bd62eb344e90b923825c0755652e61d0c7c156ee1';
const DEFINITION_DIGEST = '4336cdced9e93f7de53d6e3864b2848e010eff8057a59a1644e84fc5eef5ed54';

export async function loadLowerDvinaTraceSpatialSemanticPublication({
  rootDir = process.cwd(), phase1AManifestDigest = null
} = {}) {
  if (phase1AManifestDigest != null
      && phase1AManifestDigest !== TRACE_SPATIAL_SEMANTIC_PHASE_1A_MANIFEST_DIGEST) {
    fail('TRACE_PHASE_1B_PUBLICATION_IDENTITY_UNKNOWN');
  }
  const [manifest, binding, phase1a, definition, supersededManifest,
    supersededBinding, supersededPhase1a] = await Promise.all([
    readJson(rootDir, MANIFEST_PATH), readJson(rootDir, BINDING_PATH),
    readJson(rootDir, PHASE_1A_PATH), readJson(rootDir, DEFINITION_PATH),
    readJson(rootDir, SUPERSEDED_MANIFEST_PATH),
    readJson(rootDir, SUPERSEDED_BINDING_PATH),
    readJson(rootDir, SUPERSEDED_PHASE_1A_PATH)
  ]);
  if (manifest.digest !== MANIFEST_DIGEST) fail('TRACE_PHASE_1B_MANIFEST_ROOT_MISMATCH');
  if (binding.digest !== BINDING_DIGEST) fail('TRACE_PHASE_1B_CONTENT_REF_MISMATCH');
  if (phase1a.digest !== TRACE_SPATIAL_SEMANTIC_PHASE_1A_MANIFEST_DIGEST) fail('TRACE_PHASE_1B_PHASE_1A_REF_INVALID');
  if (definition.digest !== DEFINITION_DIGEST
      || manifest.value?.package_id !== 'lower_dvina_trace_phase_1b_v18'
      || manifest.value.revision !== 18 || manifest.value.status !== 'approved'
      || manifest.value.publication_status !== 'public'
      || !exactRef(manifest.value.content_refs?.publication_binding, binding,
        BINDING_PATH, 'lower_dvina_trace_phase_1b_publication_v18', 18)
      || binding.value?.scenario_id !== 'lower_dvina_trace_v1'
      || binding.value.materializer_binding_id
        !== 'lower_dvina_trace_phase_1a_materialization_bindings_v19'
      || binding.value.execution_identity?.scenario_definition_revision !== 23
      || binding.value.execution_identity?.phase_1a_manifest_digest !== phase1a.digest
      || binding.value.execution_identity?.scenario_definition_digest !== definition.digest
      || !exactRef(binding.value.phase_1a_manifest_ref, phase1a, PHASE_1A_PATH,
        'lower_dvina_trace_phase_1a_v19', 19, 'package_id')
      || !exactRef(binding.value.scenario_definition_ref, definition,
        DEFINITION_PATH, 'lower_dvina_trace_v1', 23, 'scenario_id')
      || !exactRef(manifest.value.superseded_package_ref, supersededManifest,
        SUPERSEDED_MANIFEST_PATH, 'lower_dvina_trace_phase_1b_v17', 17,
        'package_id')
      || !exactRef(binding.value.superseded_binding_ref, supersededBinding,
        SUPERSEDED_BINDING_PATH, 'lower_dvina_trace_phase_1b_publication_v17', 17)
      || !exactRef(phase1a.value.superseded_package_ref, supersededPhase1a,
        SUPERSEDED_PHASE_1A_PATH, 'lower_dvina_trace_phase_1a_v18', 18,
        'package_id') || definition.value.required_unresolved_refs?.length !== 0) {
    fail('TRACE_PHASE_1B_SPATIAL_SEMANTIC_INVALID');
  }
  await assertLowerDvinaTracePhase1BWorldLineage({ rootDir,
    compatibility: binding.value.world_compatibility, readJson });
  return freeze({ manifest: manifest.value, manifest_digest: manifest.digest,
    binding: binding.value, binding_digest: binding.digest,
    phase_1a_manifest: phase1a.value, definition: definition.value,
    public_projection: { scenario_id: binding.value.scenario_id,
      public_metadata: structuredClone(binding.value.public_metadata),
      opening_projection: structuredClone(binding.value.opening_projection) } });
}
function exactRef(ref, loaded, path, id, revision, idField = 'binding_id') {
  return ref?.path === path && ref.id === id && ref.revision === revision
    && ref.schema === loaded.value.schema && ref.digest === loaded.digest
    && loaded.value?.[idField] === id && loaded.value?.revision === revision;
}
async function readJson(rootDir, path) { const raw = await readFile(resolve(rootDir, path));
  return { value: JSON.parse(raw), digest: createHash('sha256').update(raw).digest('hex') }; }
function fail(code) { throw Object.assign(new Error(code), { code, status: 409 }); }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
