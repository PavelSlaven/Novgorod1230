import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertLowerDvinaTracePhase1BWorldLineage } from
  './lower-dvina-trace-phase-1b-world-lineage.js';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const MANIFEST_PATH = `${ROOT}/phase-1b-v16/manifest.json`;
const BINDING_PATH = `${ROOT}/phase-1b-v16/publication-binding.json`;
const PHASE_1A_PATH = `${ROOT}/phase-1a-v17/manifest.json`;
const DEFINITION_PATH = `${ROOT}/phase-m9-content/definition.json`;
const SUPERSEDED_MANIFEST_PATH = `${ROOT}/phase-1b-v15/manifest.json`;
const SUPERSEDED_BINDING_PATH = `${ROOT}/phase-1b-v15/publication-binding.json`;
const SUPERSEDED_PHASE_1A_PATH = `${ROOT}/phase-1a-v16/manifest.json`;

export const TRACE_ACTION_PRODUCTION_PHASE_1A_MANIFEST_DIGEST =
  'e22a36d9dc0f35eaee5c73274eb6888ee87af8f4c7f4f89162f7557fa223e3b5';
const MANIFEST_DIGEST =
  '2d29a67c739df83938c917af5d6aeae144a23726cb625204ccf2ad24f9e61a08';
const BINDING_DIGEST =
  'd8239ffe73f8f940cdf55a30f193a7b11f48140b91889375be8a92d08b047268';
const DEFINITION_DIGEST =
  '74a7c41a20c2f823cc44cf9f20332a197f94503fd7857e254fc953991817c240';

export async function loadLowerDvinaTraceActionProductionPublication({
  rootDir = process.cwd(), phase1AManifestDigest = null
} = {}) {
  if (phase1AManifestDigest != null
      && phase1AManifestDigest
        !== TRACE_ACTION_PRODUCTION_PHASE_1A_MANIFEST_DIGEST) {
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
  if (manifest.digest !== MANIFEST_DIGEST) {
    fail('TRACE_PHASE_1B_MANIFEST_ROOT_MISMATCH');
  }
  if (binding.digest !== BINDING_DIGEST) {
    fail('TRACE_PHASE_1B_CONTENT_REF_MISMATCH');
  }
  if (phase1a.digest !== TRACE_ACTION_PRODUCTION_PHASE_1A_MANIFEST_DIGEST) {
    fail('TRACE_PHASE_1B_PHASE_1A_REF_INVALID');
  }
  if (definition.digest !== DEFINITION_DIGEST
      || manifest.value?.package_id !== 'lower_dvina_trace_phase_1b_v16'
      || manifest.value.revision !== 16
      || manifest.value.status !== 'approved'
      || manifest.value.publication_status !== 'public'
      || !exactRef(manifest.value.content_refs?.publication_binding, binding,
        BINDING_PATH, 'lower_dvina_trace_phase_1b_publication_v16', 16)
      || binding.value?.scenario_id !== 'lower_dvina_trace_v1'
      || binding.value.materializer_binding_id
        !== 'lower_dvina_trace_phase_1a_materialization_bindings_v17'
      || binding.value.execution_identity?.scenario_definition_revision !== 21
      || !exactRef(binding.value.phase_1a_manifest_ref, phase1a,
        PHASE_1A_PATH, 'lower_dvina_trace_phase_1a_v17', 17, 'package_id')
      || !exactRef(binding.value.scenario_definition_ref, definition,
        DEFINITION_PATH, 'lower_dvina_trace_v1', 21, 'scenario_id')
      || !exactRef(manifest.value.superseded_package_ref, supersededManifest,
        SUPERSEDED_MANIFEST_PATH, 'lower_dvina_trace_phase_1b_v15', 15,
        'package_id')
      || !exactRef(binding.value.superseded_binding_ref, supersededBinding,
        SUPERSEDED_BINDING_PATH,
        'lower_dvina_trace_phase_1b_publication_v15', 15)
      || !exactRef(phase1a.value.superseded_package_ref, supersededPhase1a,
        SUPERSEDED_PHASE_1A_PATH, 'lower_dvina_trace_phase_1a_v16', 16,
        'package_id')
      || definition.value.required_unresolved_refs?.length !== 0) {
    fail('TRACE_PHASE_1B_ACTION_PRODUCTION_INVALID');
  }
  await assertLowerDvinaTracePhase1BWorldLineage({ rootDir,
    compatibility: binding.value.world_compatibility, readJson });
  return freeze({
    manifest: manifest.value, manifest_digest: manifest.digest,
    binding: binding.value, binding_digest: binding.digest,
    phase_1a_manifest: phase1a.value, definition: definition.value,
    public_projection: {
      scenario_id: binding.value.scenario_id,
      public_metadata: structuredClone(binding.value.public_metadata),
      opening_projection: structuredClone(binding.value.opening_projection)
    }
  });
}

function exactRef(ref, loaded, path, id, revision, idField = 'binding_id') {
  return ref?.path === path && ref.id === id && ref.revision === revision
    && ref.schema === loaded.value.schema && ref.digest === loaded.digest
    && loaded.value?.[idField] === id && loaded.value?.revision === revision;
}
async function readJson(rootDir, path) {
  const raw = await readFile(resolve(rootDir, path));
  return { value: JSON.parse(raw),
    digest: createHash('sha256').update(raw).digest('hex') };
}
function fail(code) {
  throw Object.assign(new Error(code), { code, status: 409 });
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
