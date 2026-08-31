import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertLowerDvinaTracePhase1BWorldLineage } from
  './lower-dvina-trace-phase-1b-world-lineage.js';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
export const TRACE_NPC_ACTOR_STEP_PHASE_1A_MANIFEST_DIGEST =
  '0baa2032acba1b72ad1c6144f7fce0a428a6d02fa03fc12d6a0b77303bf8af2c';
const PINS = Object.freeze({
  manifest: '9a11bf0d2976df85bd5f9d6871e8fed7793ba3cf89da8b57bcae529a425459ce',
  binding: '88e319f2e0b020c4eeb2c1cae3e287a2e1edb3a604859d3ad5c78efd035236a8',
  definition: '3d025b3fef625dfd41426dfc0f2862791ccc9bb5d7ad6659e16205f98da09711'
});

export async function loadLowerDvinaTraceNpcActorStepPublication({
  rootDir = process.cwd(), phase1AManifestDigest = null
} = {}) {
  if (phase1AManifestDigest != null
      && phase1AManifestDigest !== TRACE_NPC_ACTOR_STEP_PHASE_1A_MANIFEST_DIGEST) {
    fail('TRACE_PHASE_1B_PUBLICATION_IDENTITY_UNKNOWN');
  }
  const paths = {
    manifest: `${ROOT}/phase-1b-v20/manifest.json`,
    binding: `${ROOT}/phase-1b-v20/publication-binding.json`,
    phase1a: `${ROOT}/phase-1a-v21/manifest.json`,
    definition: `${ROOT}/phase-m13-content/definition.json`,
    profile: `${ROOT}/phase-m13-content/npc-actor-step-profile.json`,
    priorManifest: `${ROOT}/phase-1b-v19/manifest.json`,
    priorBinding: `${ROOT}/phase-1b-v19/publication-binding.json`
  };
  const loaded = Object.fromEntries(await Promise.all(Object.entries(paths)
    .map(async ([key, path]) => [key, await readJson(rootDir, path)])));
  const { manifest, binding, phase1a, definition, profile, priorManifest,
    priorBinding } = loaded;
  if (manifest.digest !== PINS.manifest || binding.digest !== PINS.binding
      || phase1a.digest !== TRACE_NPC_ACTOR_STEP_PHASE_1A_MANIFEST_DIGEST
      || definition.digest !== PINS.definition
      || manifest.value?.package_id !== 'lower_dvina_trace_phase_1b_v20'
      || manifest.value.revision !== 20 || manifest.value.status !== 'approved'
      || manifest.value.publication_status !== 'public'
      || binding.value?.binding_id !== 'lower_dvina_trace_phase_1b_publication_v20'
      || binding.value.revision !== 20 || binding.value.status !== 'approved'
      || binding.value.materializer_binding_id
        !== 'lower_dvina_trace_phase_1a_materialization_bindings_v21'
      || binding.value.execution_identity?.scenario_definition_revision !== 25
      || binding.value.execution_identity?.phase_1a_manifest_digest !== phase1a.digest
      || binding.value.execution_identity?.scenario_definition_digest !== definition.digest
      || !ref(manifest.value.content_refs?.publication_binding, binding,
        paths.binding, binding.value.binding_id, 20)
      || !ref(binding.value.phase_1a_manifest_ref, phase1a, paths.phase1a,
        'lower_dvina_trace_phase_1a_v21', 21, 'package_id')
      || !ref(binding.value.scenario_definition_ref, definition, paths.definition,
        'lower_dvina_trace_v1', 25, 'scenario_id')
      || !ref(manifest.value.superseded_package_ref, priorManifest,
        paths.priorManifest, 'lower_dvina_trace_phase_1b_v19', 19, 'package_id')
      || !ref(binding.value.superseded_binding_ref, priorBinding,
        paths.priorBinding, 'lower_dvina_trace_phase_1b_publication_v19', 19)
      || definition.value?.required_unresolved_refs?.length !== 0
      || profile.value?.status !== 'approved'
      || profile.value?.activation_boundary?.phase !== 'phase_7'
      || profile.value?.activation_boundary?.npc_participant_slot_ref
        !== 'zhdanko_storehouse_controller'
      || profile.value?.fallback_policy !== 'forbidden') fail('TRACE_NPC_ACTOR_STEP_PUBLICATION_INVALID');
  await assertLowerDvinaTracePhase1BWorldLineage({ rootDir,
    compatibility: binding.value.world_compatibility, readJson });
  return freeze({ manifest: manifest.value, manifest_digest: manifest.digest,
    binding: binding.value, binding_digest: binding.digest,
    phase_1a_manifest: phase1a.value, definition: definition.value,
    npc_actor_step_profile: profile.value, public_projection: {
      scenario_id: binding.value.scenario_id,
      public_metadata: structuredClone(binding.value.public_metadata),
      opening_projection: structuredClone(binding.value.opening_projection) } });
}
function ref(value, loaded, path, id, revision, idField = 'binding_id') {
  return value?.path === path && value.id === id && value.revision === revision
    && value.schema === loaded.value?.schema && value.digest === loaded.digest
    && loaded.value?.[idField] === id && loaded.value?.revision === revision;
}
async function readJson(rootDir, path) { const raw = await readFile(resolve(rootDir, path));
  return { value: JSON.parse(raw), digest: createHash('sha256').update(raw).digest('hex') }; }
function fail(code) { throw Object.assign(new Error(code), { code, status: 409 }); }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
