import { TRACE_REVISION33_PHASE_1A_MANIFEST_DIGEST, TRACE_REVISION33_DEFINITION_DIGEST } from './lower-dvina-trace-revision-33-bundle.js';
import { TRACE_SCENE_PRESENTATION_V3_DIGEST } from './lower-dvina-trace-scene-presentation.js';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assertLowerDvinaTracePhase1BWorldLineage } from
  './lower-dvina-trace-phase-1b-world-lineage.js';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
export const TRACE_REVISION32_PHASE_1A_MANIFEST_DIGEST =
  '6c77be86edc484d291a8f944c7886b61fe41f76287d1810efb70ff8e033c7101';
const HISTORICAL_PINS = Object.freeze({
  manifest: 'bb05aff9ae0ec901063e4e5807e187d221aaa20fc709950270d1d8ced4895df1',
  binding: '83cd8eca17879484867262199970bf0f70152f2adb69d22d8900a1466045e88a',
  definition: '0c4b5d4992393ecde511cb35426933b01fb51b47552e0f5a859df2bfd359ab1f',
  presentation: 'b0e68dabf6541bc76b24294f797746c34d7d3ab28c6732d71cba79336369750c',
  priorBinding: '2bcb6c037926a662d2fc3707561038bdd988746904f235c1ad146c87e29a00bf'
});
const OPENING_PINS = Object.freeze({
  ...HISTORICAL_PINS,
  manifest: '23fa6c3bc5b2716b148a69c22bbbb6efdac9e88ebd068fe58782067a73e8aa6c',
  binding: '3311695c856a1d25a981838bc40fb38b26389ce274c74c9574481e1cf7635ffd',
  definition: TRACE_REVISION33_DEFINITION_DIGEST,
  presentation: TRACE_SCENE_PRESENTATION_V3_DIGEST,
  priorBinding: HISTORICAL_PINS.binding
});
const POST_ACTION_PINS = Object.freeze({
  ...OPENING_PINS,
  manifest: '4839c288013913d6a7c7aa91c58cb2c2431c6f8b2b255f3f36f8bc657131dc1b',
  binding: 'ecca45b05b55e8e893b5f8ee0a42b2d62cb75b78a7516b8512bca7df7945ac2a',
  definition: 'c04d7032bfbea2fb7e1458fb59014e8168a258a3a2890475628a983702568b0f',
  priorBinding: OPENING_PINS.binding
});

export function loadLowerDvinaTraceRevision32Publication(options = {}) {
  return loadPublication({ ...options, publicationRevision: 27 });
}
export function loadLowerDvinaTraceRevision33Publication(options = {}) {
  return loadPublication({ ...options, publicationRevision: 28 });
}
export function loadLowerDvinaTraceRevision34Publication(options = {}) {
  return loadPublication({ ...options, publicationRevision: 29 });
}
async function loadPublication({
  rootDir = process.cwd(), phase1AManifestDigest = null,
  publicationRevision = 27 } = {}) {
  if (![27, 28, 29].includes(publicationRevision)) fail();
  const scenarioRevision = publicationRevision === 29 ? 34
    : publicationRevision === 28 ? 33 : 32;
  const phase1aDigest = publicationRevision >= 28
    ? TRACE_REVISION33_PHASE_1A_MANIFEST_DIGEST
    : TRACE_REVISION32_PHASE_1A_MANIFEST_DIGEST;
  const pins = publicationRevision === 29 ? POST_ACTION_PINS
    : publicationRevision === 28 ? OPENING_PINS : HISTORICAL_PINS;
  if (phase1AManifestDigest != null
      && phase1AManifestDigest !== phase1aDigest) {
    fail();
  }
  const paths = {
    manifest: `${ROOT}/phase-1b-v${publicationRevision}/manifest.json`,
    binding: `${ROOT}/phase-1b-v${publicationRevision}/publication-binding.json`,
    phase1a: `${ROOT}/phase-1a-v${publicationRevision >= 28 ? 24 : 23}/manifest.json`,
    definition: `${ROOT}/phase-m${publicationRevision === 29 ? 22
      : publicationRevision === 28 ? 21 : 20}-content/definition.json`,
    presentation: publicationRevision >= 28 ? `${ROOT}/phase-1b-v28/scene-presentation-v3.json`
      : `${ROOT}/phase-1b-v26/scene-presentation-v2.json`,
    prior: `${ROOT}/phase-1b-v${publicationRevision - 1}/publication-binding.json`,
    compatibility: `${ROOT}/phase-1b-v22/publication-binding.json`
  };
  const loaded = Object.fromEntries(await Promise.all(Object.entries(paths)
    .map(async ([key, path]) => [key, await readJson(rootDir, path)])));
  const { manifest, binding, phase1a, definition, presentation, prior,
    compatibility } = loaded;
  if (manifest.digest !== pins.manifest
      || binding.digest !== pins.binding
      || phase1a.digest !== phase1aDigest
      || definition.digest !== pins.definition
      || presentation.digest !== pins.presentation
      || prior.digest !== pins.priorBinding
      || manifest.value?.content_refs?.publication_binding?.digest
        !== binding.digest
      || binding.value?.superseded_binding_ref?.digest !== prior.digest
      || binding.value?.phase_1a_manifest_ref?.digest !== phase1a.digest
      || binding.value?.scenario_definition_ref?.digest !== definition.digest
      || binding.value?.content_refs?.scene_presentation?.digest
        !== presentation.digest
      || binding.value?.execution_identity?.scenario_definition_revision
        !== scenarioRevision) fail();
  await assertLowerDvinaTracePhase1BWorldLineage({ rootDir,
    compatibility: compatibility.value.world_compatibility, readJson });
  return Object.freeze({
    manifest: manifest.value, manifest_digest: manifest.digest,
    binding: { ...binding.value,
      world_compatibility: structuredClone(
        compatibility.value.world_compatibility) },
    binding_digest: binding.digest, phase_1a_manifest: phase1a.value,
    definition: definition.value, scene_presentation: presentation.value,
    public_projection: {
      scenario_id: binding.value.scenario_id,
      public_metadata: structuredClone(binding.value.public_metadata),
      opening_projection: structuredClone(binding.value.opening_projection)
    }
  });
}
async function readJson(rootDir, path) {
  const raw = await readFile(resolve(rootDir, path));
  return { value: JSON.parse(raw),
    digest: createHash('sha256').update(raw).digest('hex') };
}
function fail() {
  throw Object.assign(new Error('TRACE_REVISION_32_PUBLICATION_INVALID'),
    { code: 'TRACE_REVISION_32_PUBLICATION_INVALID', status: 409 });
}
