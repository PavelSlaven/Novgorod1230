import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertLowerDvinaTracePhase1BWorldLineage } from './lower-dvina-trace-phase-1b-world-lineage.js';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
export const TRACE_REVISION26_PHASE_1A_MANIFEST_DIGEST = 'cf14a61a55662181ecc0203e5e0cb9d5f2c37902c256a4eca0169e1ec33d5a21';
const PINS = { manifest: 'fa422bdb2a9508305a66207b9139ea8a1734e157f9a4ccb929c7244bb0a69138', binding: '3542dea91324bc1077fda3baf095769f795017ec798b6877f533e35b2695c0d8', definition: 'f8b83e3bb3a3050d3a5c4daf7efe04b731dda134b83346e0a40c710e06d3134a' };

export async function loadLowerDvinaTraceRevision26Publication({ rootDir = process.cwd(), phase1AManifestDigest = null } = {}) {
  if (phase1AManifestDigest != null && phase1AManifestDigest !== TRACE_REVISION26_PHASE_1A_MANIFEST_DIGEST) fail();
  const paths = { manifest: `${ROOT}/phase-1b-v21/manifest.json`, binding: `${ROOT}/phase-1b-v21/publication-binding.json`, phase1a: `${ROOT}/phase-1a-v22/manifest.json`, definition: `${ROOT}/phase-m14-content/definition.json`, priorManifest: `${ROOT}/phase-1b-v20/manifest.json`, priorBinding: `${ROOT}/phase-1b-v20/publication-binding.json` };
  const loaded = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readJson(rootDir, path)])));
  const { manifest, binding, phase1a, definition, priorManifest, priorBinding } = loaded;
  if (manifest.digest !== PINS.manifest || binding.digest !== PINS.binding || phase1a.digest !== TRACE_REVISION26_PHASE_1A_MANIFEST_DIGEST || definition.digest !== PINS.definition || manifest.value?.package_id !== 'lower_dvina_trace_phase_1b_v21' || manifest.value.revision !== 21 || binding.value?.binding_id !== 'lower_dvina_trace_phase_1b_publication_v21' || binding.value.revision !== 21 || binding.value.materializer_binding_id !== 'lower_dvina_trace_phase_1a_materialization_bindings_v22' || binding.value.execution_identity?.scenario_definition_revision !== 26 || binding.value.phase_1a_manifest_ref?.digest !== phase1a.digest || binding.value.scenario_definition_ref?.digest !== definition.digest || manifest.value.superseded_package_ref?.digest !== priorManifest.digest || binding.value.superseded_binding_ref?.digest !== priorBinding.digest) fail();
  await assertLowerDvinaTracePhase1BWorldLineage({ rootDir, compatibility: binding.value.world_compatibility, readJson });
  return Object.freeze({ manifest: manifest.value, manifest_digest: manifest.digest, binding: binding.value, binding_digest: binding.digest, phase_1a_manifest: phase1a.value, definition: definition.value, public_projection: { scenario_id: binding.value.scenario_id, public_metadata: structuredClone(binding.value.public_metadata), opening_projection: structuredClone(binding.value.opening_projection) } });
}
async function readJson(rootDir, path) { const raw = await readFile(resolve(rootDir, path)); return { value: JSON.parse(raw), digest: createHash('sha256').update(raw).digest('hex') }; }
function fail() { throw Object.assign(new Error('TRACE_REVISION_26_PUBLICATION_INVALID'), { code: 'TRACE_REVISION_26_PUBLICATION_INVALID', status: 409 }); }
