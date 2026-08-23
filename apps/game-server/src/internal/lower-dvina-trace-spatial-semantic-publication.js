import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertLowerDvinaTracePhase1BWorldLineage } from
  './lower-dvina-trace-phase-1b-world-lineage.js';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const MANIFEST_PATH = `${ROOT}/phase-1b-v19/manifest.json`;
const BINDING_PATH = `${ROOT}/phase-1b-v19/publication-binding.json`;
const PHASE_1A_PATH = `${ROOT}/phase-1a-v20/manifest.json`;
const DEFINITION_PATH = `${ROOT}/phase-m12-content/definition.json`;
const SUPERSEDED_MANIFEST_PATH = `${ROOT}/phase-1b-v18/manifest.json`;
const SUPERSEDED_BINDING_PATH = `${ROOT}/phase-1b-v18/publication-binding.json`;
const SUPERSEDED_PHASE_1A_PATH = `${ROOT}/phase-1a-v19/manifest.json`;

export const TRACE_SPATIAL_SEMANTIC_PHASE_1A_MANIFEST_DIGEST =
  '1e61d7a555f82643eda5773cd232755e5072d2fae4fd2edd442e2173f8fe469f';
export const TRACE_SPATIAL_SEMANTIC_REVISION23_PHASE_1A_MANIFEST_DIGEST =
  '97616177c25fe0e0507afb3df5d7fd9bdc4298cede54f0a8626ce5cfc271586a';
const MANIFEST_DIGEST = '3258cd3cf534811db77d7be7b9845ee52013e7cd4f295ce9543934aecd0ce955';
const BINDING_DIGEST = '1732780a7f9f68523830269cf2a8c05368464ee5154ccee4ccee947af47857a4';
const DEFINITION_DIGEST = '28274bf6d6978a1187c777c26d76bea0716b508ccfa6d8d2262f1c6592a4210f';

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
      || manifest.value?.package_id !== 'lower_dvina_trace_phase_1b_v19'
      || manifest.value.revision !== 19 || manifest.value.status !== 'approved'
      || manifest.value.publication_status !== 'public'
      || !exactRef(manifest.value.content_refs?.publication_binding, binding,
        BINDING_PATH, 'lower_dvina_trace_phase_1b_publication_v19', 19)
      || binding.value?.scenario_id !== 'lower_dvina_trace_v1'
      || binding.value.materializer_binding_id
        !== 'lower_dvina_trace_phase_1a_materialization_bindings_v20'
      || binding.value.execution_identity?.scenario_definition_revision !== 24
      || binding.value.execution_identity?.phase_1a_manifest_digest !== phase1a.digest
      || binding.value.execution_identity?.scenario_definition_digest !== definition.digest
      || !exactRef(binding.value.phase_1a_manifest_ref, phase1a, PHASE_1A_PATH,
        'lower_dvina_trace_phase_1a_v20', 20, 'package_id')
      || !exactRef(binding.value.scenario_definition_ref, definition,
        DEFINITION_PATH, 'lower_dvina_trace_v1', 24, 'scenario_id')
      || !exactRef(manifest.value.superseded_package_ref, supersededManifest,
        SUPERSEDED_MANIFEST_PATH, 'lower_dvina_trace_phase_1b_v18', 18,
        'package_id')
      || !exactRef(binding.value.superseded_binding_ref, supersededBinding,
        SUPERSEDED_BINDING_PATH, 'lower_dvina_trace_phase_1b_publication_v18', 18)
      || !exactRef(phase1a.value.superseded_package_ref, supersededPhase1a,
        SUPERSEDED_PHASE_1A_PATH, 'lower_dvina_trace_phase_1a_v19', 19,
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

export async function loadLowerDvinaTraceRevision23SpatialSemanticPublication({
  rootDir = process.cwd(), phase1AManifestDigest = null
} = {}) {
  if (phase1AManifestDigest !== TRACE_SPATIAL_SEMANTIC_REVISION23_PHASE_1A_MANIFEST_DIGEST) {
    fail('TRACE_PHASE_1B_PUBLICATION_IDENTITY_UNKNOWN');
  }
  const root = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
  const [manifest, binding, phase1a, definition] = await Promise.all([
    readJson(rootDir, `${root}/phase-1b-v18/manifest.json`),
    readJson(rootDir, `${root}/phase-1b-v18/publication-binding.json`),
    readJson(rootDir, `${root}/phase-1a-v19/manifest.json`),
    readJson(rootDir, `${root}/phase-m11-content/definition.json`)
  ]);
  if (manifest.digest !== '4f4d39587992415ddc258423eaa7e5228b8c2260d3505b2d0b9db7840e3838f0'
      || binding.digest !== '99febe4b34ae1c179f9cc1aa890bd42762be3b0abb5e1fa8ca97c66c7aeeb369'
      || phase1a.digest !== TRACE_SPATIAL_SEMANTIC_REVISION23_PHASE_1A_MANIFEST_DIGEST
      || definition.digest !== '8f1f4e331738243ab26da5d1e280e89b2086e837c1f167e03d806da162083810'
      || manifest.value?.package_id !== 'lower_dvina_trace_phase_1b_v18'
      || binding.value?.binding_id !== 'lower_dvina_trace_phase_1b_publication_v18'
      || binding.value.phase_1a_manifest_ref?.digest !== phase1a.digest
      || binding.value.scenario_definition_ref?.digest !== definition.digest) {
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
