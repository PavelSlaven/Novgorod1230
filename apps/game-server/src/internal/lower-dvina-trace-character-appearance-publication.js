import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertLowerDvinaTracePhase1BWorldLineage } from
  './lower-dvina-trace-phase-1b-world-lineage.js';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const MANIFEST_PATH = `${ROOT}/phase-1b-v15/manifest.json`;
const BINDING_PATH = `${ROOT}/phase-1b-v15/publication-binding.json`;
const PHASE_1A_PATH = `${ROOT}/phase-1a-v16/manifest.json`;
const DEFINITION_PATH = `${ROOT}/phase-m8-content/definition.json`;
const SUPERSEDED_MANIFEST_PATH = `${ROOT}/phase-1b-v14/manifest.json`;
const SUPERSEDED_BINDING_PATH = `${ROOT}/phase-1b-v14/publication-binding.json`;
const SUPERSEDED_PHASE_1A_PATH = `${ROOT}/phase-1a-v15/manifest.json`;

export const TRACE_CHARACTER_APPEARANCE_PHASE_1A_MANIFEST_DIGEST =
  'c4422cc17fc110bd486222377c0a262878077e9af9aef3da3977cfaed925cccd';
const MANIFEST_DIGEST =
  'a7306762a8f57e9f43bb30dc0d8a9b48780aa9e69adcb26a66029b4064f868b4';
const BINDING_DIGEST =
  'bb90c9ce8750641a258f84d8b7a7c0cdb417460da45f263b158d1ae0862f0c8c';
const DEFINITION_DIGEST =
  'd0e42ce7e1109ce5ef0d47fc9953f9d247cb5e7166137a4c31f2cacbdf258262';

export async function loadLowerDvinaTraceCharacterAppearancePublication({
  rootDir = process.cwd(),
  phase1AManifestDigest = null
} = {}) {
  if (phase1AManifestDigest != null
      && phase1AManifestDigest !== TRACE_CHARACTER_APPEARANCE_PHASE_1A_MANIFEST_DIGEST) {
    fail('TRACE_PHASE_1B_PUBLICATION_IDENTITY_UNKNOWN');
  }
  const [
    manifest,
    binding,
    phase1a,
    definition,
    supersededManifest,
    supersededBinding,
    supersededPhase1a
  ] = await Promise.all([
    readJson(rootDir, MANIFEST_PATH),
    readJson(rootDir, BINDING_PATH),
    readJson(rootDir, PHASE_1A_PATH),
    readJson(rootDir, DEFINITION_PATH),
    readJson(rootDir, SUPERSEDED_MANIFEST_PATH),
    readJson(rootDir, SUPERSEDED_BINDING_PATH),
    readJson(rootDir, SUPERSEDED_PHASE_1A_PATH)
  ]);
  if (manifest.digest !== MANIFEST_DIGEST) {
    fail('TRACE_PHASE_1B_MANIFEST_ROOT_MISMATCH');
  }
  if (binding.digest !== BINDING_DIGEST) {
    fail('TRACE_PHASE_1B_CONTENT_REF_MISMATCH');
  }
  if (phase1a.digest !== TRACE_CHARACTER_APPEARANCE_PHASE_1A_MANIFEST_DIGEST) {
    fail('TRACE_PHASE_1B_PHASE_1A_REF_INVALID');
  }
  if (definition.digest !== DEFINITION_DIGEST) {
    fail('TRACE_PHASE_1B_DEFINITION_REF_INVALID');
  }
  if (manifest.value?.package_id !== 'lower_dvina_trace_phase_1b_v15'
    || manifest.value.revision !== 15
    || manifest.value.status !== 'approved'
    || manifest.value.publication_status !== 'public'
    || !exactRef(manifest.value.content_refs?.publication_binding, binding,
      BINDING_PATH, 'lower_dvina_trace_phase_1b_publication_v15', 15)
    || binding.value?.scenario_id !== 'lower_dvina_trace_v1'
    || binding.value.materializer_binding_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v16'
    || binding.value.execution_identity?.scenario_definition_revision !== 20
    || !exactRef(binding.value.phase_1a_manifest_ref, phase1a,
      PHASE_1A_PATH, 'lower_dvina_trace_phase_1a_v16', 16, 'package_id')
    || !exactRef(binding.value.scenario_definition_ref, definition,
      DEFINITION_PATH, 'lower_dvina_trace_v1', 20, 'scenario_id')
    || definition.value.required_unresolved_refs?.length !== 0) {
    fail('TRACE_PHASE_1B_CHARACTER_APPEARANCE_INVALID');
  }
  if (!exactRef(manifest.value.superseded_package_ref, supersededManifest,
    SUPERSEDED_MANIFEST_PATH, 'lower_dvina_trace_phase_1b_v14', 14,
    'package_id')
    || !exactRef(binding.value.superseded_binding_ref, supersededBinding,
      SUPERSEDED_BINDING_PATH, 'lower_dvina_trace_phase_1b_publication_v14', 14)
    || !exactRef(phase1a.value.superseded_package_ref, supersededPhase1a,
      SUPERSEDED_PHASE_1A_PATH, 'lower_dvina_trace_phase_1a_v15', 15,
      'package_id')) {
    fail('TRACE_PHASE_1B_CONTENT_REF_MISMATCH');
  }
  await assertLowerDvinaTracePhase1BWorldLineage({
    rootDir,
    compatibility: binding.value.world_compatibility,
    readJson
  });
  const publicProjection = freezeDeep({
    scenario_id: binding.value.scenario_id,
    public_metadata: structuredClone(binding.value.public_metadata),
    opening_projection: structuredClone(binding.value.opening_projection)
  });
  return freezeDeep({
    manifest: manifest.value,
    manifest_digest: manifest.digest,
    binding: binding.value,
    binding_digest: binding.digest,
    phase_1a_manifest: phase1a.value,
    definition: definition.value,
    public_projection: publicProjection
  });
}

function exactRef(ref, loaded, path, id, revision, idField = 'binding_id') {
  return ref?.path === path && ref.id === id && ref.revision === revision
    && ref.schema === loaded.value.schema && ref.digest === loaded.digest
    && loaded.value?.[idField] === id && loaded.value?.revision === revision;
}
async function readJson(rootDir, path) {
  const raw = await readFile(resolve(rootDir, path));
  return { value: JSON.parse(raw), digest: createHash('sha256').update(raw).digest('hex') };
}
function fail(code) {
  throw Object.assign(new Error(code), { code, status: 409 });
}
function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}
