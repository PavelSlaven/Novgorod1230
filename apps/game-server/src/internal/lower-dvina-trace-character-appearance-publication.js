import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertLowerDvinaTracePhase1BWorldLineage } from
  './lower-dvina-trace-phase-1b-world-lineage.js';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const MANIFEST_PATH = `${ROOT}/phase-1b-v14/manifest.json`;
const BINDING_PATH = `${ROOT}/phase-1b-v14/publication-binding.json`;
const PHASE_1A_PATH = `${ROOT}/phase-1a-v15/manifest.json`;
const DEFINITION_PATH = `${ROOT}/phase-m7-content/definition.json`;
const SUPERSEDED_MANIFEST_PATH = `${ROOT}/phase-1b-v13/manifest.json`;
const SUPERSEDED_BINDING_PATH = `${ROOT}/phase-1b-v13/publication-binding.json`;
const SUPERSEDED_PHASE_1A_PATH = `${ROOT}/phase-1a-v14/manifest.json`;

export const TRACE_CHARACTER_APPEARANCE_PHASE_1A_MANIFEST_DIGEST =
  '3e12b8aacb7b45fd17cdd00c6baf69dc4c7053ffca58e3bc312e4376b1a76be3';
const MANIFEST_DIGEST =
  'fa618512b184668b8fba72c0ff964d6b981b782575cd882858ca288df5311bfb';
const BINDING_DIGEST =
  'e29a8230daea086c527384f3828d52e1a645760a2ea20415a687546ad7d0f568';
const DEFINITION_DIGEST =
  'a2bc08aa214da499777517bfb724c9fe7e64b887fad14c65458a517ba9c228f4';

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
  if (manifest.value?.package_id !== 'lower_dvina_trace_phase_1b_v14'
    || manifest.value.revision !== 14
    || manifest.value.status !== 'approved'
    || manifest.value.publication_status !== 'public'
    || !exactRef(manifest.value.content_refs?.publication_binding, binding,
      BINDING_PATH, 'lower_dvina_trace_phase_1b_publication_v14', 14)
    || binding.value?.scenario_id !== 'lower_dvina_trace_v1'
    || binding.value.materializer_binding_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v15'
    || binding.value.execution_identity?.scenario_definition_revision !== 19
    || !exactRef(binding.value.phase_1a_manifest_ref, phase1a,
      PHASE_1A_PATH, 'lower_dvina_trace_phase_1a_v15', 15, 'package_id')
    || !exactRef(binding.value.scenario_definition_ref, definition,
      DEFINITION_PATH, 'lower_dvina_trace_v1', 19, 'scenario_id')
    || definition.value.required_unresolved_refs?.length !== 0) {
    fail('TRACE_PHASE_1B_CHARACTER_APPEARANCE_INVALID');
  }
  if (!exactRef(manifest.value.superseded_package_ref, supersededManifest,
    SUPERSEDED_MANIFEST_PATH, 'lower_dvina_trace_phase_1b_v13', 13,
    'package_id')
    || !exactRef(binding.value.superseded_binding_ref, supersededBinding,
      SUPERSEDED_BINDING_PATH, 'lower_dvina_trace_phase_1b_publication_v13', 13)
    || !exactRef(phase1a.value.superseded_package_ref, supersededPhase1a,
      SUPERSEDED_PHASE_1A_PATH, 'lower_dvina_trace_phase_1a_v14', 14,
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
