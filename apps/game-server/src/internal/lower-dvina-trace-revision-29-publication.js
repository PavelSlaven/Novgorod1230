import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertLowerDvinaTracePhase1BWorldLineage } from './lower-dvina-trace-phase-1b-world-lineage.js';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
export const TRACE_REVISION29_PHASE_1A_MANIFEST_DIGEST = '6c77be86edc484d291a8f944c7886b61fe41f76287d1810efb70ff8e033c7101';
const PINS = Object.freeze({ manifest: '216f6334a856dc1968b91694725c2a8310fc86574fddc0fe2184de1eaad8f823', binding: '3b598565d3742e3d2d05715c44f7605b1396eb4b373ad4c8f2d1db47499cfb7e', definition: '43ce9853e0d5f4d1d5a966814732bbd2f030817a6ad9867085dcc70f010ee4a7', presentation: '3f502cb872f662c74fdace184111b1ded2f3af286ce258a6707d4940ddd2d347', priorBinding: 'd2db8d1567499fc53645cd0728ddd9148f37bd0af4618f73173b0b4fda096be4' });

export async function loadLowerDvinaTraceRevision29Publication({ rootDir = process.cwd(), phase1AManifestDigest = null } = {}) {
  if (phase1AManifestDigest != null && phase1AManifestDigest !== TRACE_REVISION29_PHASE_1A_MANIFEST_DIGEST) fail();
  const paths = { manifest: `${ROOT}/phase-1b-v24/manifest.json`, binding: `${ROOT}/phase-1b-v24/publication-binding.json`, phase1a: `${ROOT}/phase-1a-v23/manifest.json`, definition: `${ROOT}/phase-m17-content/definition.json`, presentation: `${ROOT}/phase-1b-v23/scene-presentation-v1.json`, prior: `${ROOT}/phase-1b-v23/publication-binding.json`, compatibility: `${ROOT}/phase-1b-v22/publication-binding.json` };
  const loaded = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readJson(rootDir, path)])));
  const { manifest, binding, phase1a, definition, presentation, prior, compatibility } = loaded;
  if (manifest.digest !== PINS.manifest || binding.digest !== PINS.binding || phase1a.digest !== TRACE_REVISION29_PHASE_1A_MANIFEST_DIGEST || definition.digest !== PINS.definition || presentation.digest !== PINS.presentation || prior.digest !== PINS.priorBinding || manifest.value?.content_refs?.publication_binding?.digest !== binding.digest || binding.value?.superseded_binding_ref?.digest !== prior.digest || binding.value?.phase_1a_manifest_ref?.digest !== phase1a.digest || binding.value?.scenario_definition_ref?.digest !== definition.digest || binding.value?.content_refs?.scene_presentation?.digest !== presentation.digest || binding.value?.execution_identity?.scenario_definition_revision !== 29) fail();
  await assertLowerDvinaTracePhase1BWorldLineage({ rootDir, compatibility: compatibility.value.world_compatibility, readJson });
  return Object.freeze({ manifest: manifest.value, manifest_digest: manifest.digest, binding: { ...binding.value, world_compatibility: structuredClone(compatibility.value.world_compatibility) }, binding_digest: binding.digest, phase_1a_manifest: phase1a.value, definition: definition.value, scene_presentation: presentation.value, public_projection: { scenario_id: binding.value.scenario_id, public_metadata: structuredClone(binding.value.public_metadata), opening_projection: structuredClone(binding.value.opening_projection) } });
}
async function readJson(rootDir, path) { const raw = await readFile(resolve(rootDir, path)); return { value: JSON.parse(raw), digest: createHash('sha256').update(raw).digest('hex') }; }
function fail() { throw Object.assign(new Error('TRACE_REVISION_29_PUBLICATION_INVALID'), { code: 'TRACE_REVISION_29_PUBLICATION_INVALID', status: 409 }); }
