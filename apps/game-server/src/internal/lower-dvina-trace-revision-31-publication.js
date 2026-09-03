import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertLowerDvinaTracePhase1BWorldLineage } from './lower-dvina-trace-phase-1b-world-lineage.js';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
export const TRACE_REVISION31_PHASE_1A_MANIFEST_DIGEST = '6c77be86edc484d291a8f944c7886b61fe41f76287d1810efb70ff8e033c7101';
const PINS = Object.freeze({ manifest: '3b616e20b7b3512b0651d217b2650b3ed5a4ad0bcf6f10511dc3d8cde4dfe150', binding: '2bcb6c037926a662d2fc3707561038bdd988746904f235c1ad146c87e29a00bf', definition: '4494bde28c4b8ba74c8fcfe72c72356e50cd2fa03b0076c58fa5000f6498abfe', presentation: 'b0e68dabf6541bc76b24294f797746c34d7d3ab28c6732d71cba79336369750c', priorBinding: '9d56686a0ef04c10bc62ed79227b5171a9cdd8e5292d73a0a217cf46bb2e29bc' });

export async function loadLowerDvinaTraceRevision31Publication({ rootDir = process.cwd(), phase1AManifestDigest = null } = {}) {
  if (phase1AManifestDigest != null && phase1AManifestDigest !== TRACE_REVISION31_PHASE_1A_MANIFEST_DIGEST) fail();
  const paths = { manifest: `${ROOT}/phase-1b-v26/manifest.json`, binding: `${ROOT}/phase-1b-v26/publication-binding.json`, phase1a: `${ROOT}/phase-1a-v23/manifest.json`, definition: `${ROOT}/phase-m19-content/definition.json`, presentation: `${ROOT}/phase-1b-v26/scene-presentation-v2.json`, prior: `${ROOT}/phase-1b-v25/publication-binding.json`, compatibility: `${ROOT}/phase-1b-v22/publication-binding.json` };
  const loaded = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readJson(rootDir, path)])));
  const { manifest, binding, phase1a, definition, presentation, prior, compatibility } = loaded;
  if (manifest.digest !== PINS.manifest || binding.digest !== PINS.binding || phase1a.digest !== TRACE_REVISION31_PHASE_1A_MANIFEST_DIGEST || definition.digest !== PINS.definition || presentation.digest !== PINS.presentation || prior.digest !== PINS.priorBinding || manifest.value?.content_refs?.publication_binding?.digest !== binding.digest || binding.value?.superseded_binding_ref?.digest !== prior.digest || binding.value?.phase_1a_manifest_ref?.digest !== phase1a.digest || binding.value?.scenario_definition_ref?.digest !== definition.digest || binding.value?.content_refs?.scene_presentation?.digest !== presentation.digest || binding.value?.execution_identity?.scenario_definition_revision !== 31) fail();
  await assertLowerDvinaTracePhase1BWorldLineage({ rootDir, compatibility: compatibility.value.world_compatibility, readJson });
  return Object.freeze({ manifest: manifest.value, manifest_digest: manifest.digest, binding: { ...binding.value, world_compatibility: structuredClone(compatibility.value.world_compatibility) }, binding_digest: binding.digest, phase_1a_manifest: phase1a.value, definition: definition.value, scene_presentation: presentation.value, public_projection: { scenario_id: binding.value.scenario_id, public_metadata: structuredClone(binding.value.public_metadata), opening_projection: structuredClone(binding.value.opening_projection) } });
}
async function readJson(rootDir, path) { const raw = await readFile(resolve(rootDir, path)); return { value: JSON.parse(raw), digest: createHash('sha256').update(raw).digest('hex') }; }
function fail() { throw Object.assign(new Error('TRACE_REVISION_31_PUBLICATION_INVALID'), { code: 'TRACE_REVISION_31_PUBLICATION_INVALID', status: 409 }); }
