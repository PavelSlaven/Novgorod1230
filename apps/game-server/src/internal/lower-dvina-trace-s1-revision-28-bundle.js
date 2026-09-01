import { canonicalDigest } from '@rus/materialization';
import { ROOT, readBundleArtifact } from './lower-dvina-trace-s1-bundle-utils.js';
import { TRACE_SCENE_PRESENTATION_DIGEST } from
  './lower-dvina-trace-scene-presentation.js';

const DEFINITION_PATH = `${ROOT}/phase-m16-content/definition.json`;
const DEFINITION_DIGEST =
  '77b2814ad4b871279c0b88e45e3d3da8c1754784c1acc3da1b444b78157b3a2c';
const PRESENTATION_PATH = `${ROOT}/phase-1b-v23/scene-presentation-v1.json`;

export async function loadLowerDvinaTraceRevision28Bundle({ rootDir,
  historicalBundle, fail = (code) => { throw new Error(code); },
  freezeDeep = Object.freeze, validateDefinitionPins = () => {} } = {}) {
  const [definition, presentation] = await Promise.all([
    readBundleArtifact(rootDir, DEFINITION_PATH),
    readBundleArtifact(rootDir, PRESENTATION_PATH)
  ]);
  if (historicalBundle?.definition_revision !== 27
      || definition.digest !== DEFINITION_DIGEST
      || definition.value?.revision !== 28
      || presentation.digest !== TRACE_SCENE_PRESENTATION_DIGEST
      || definition.value?.immutable_content_refs?.scene_presentation?.digest
        !== presentation.digest) {
    return fail('TRACE_REVISION_28_CONTENT_INVALID');
  }
  const bundle = { ...structuredClone(historicalBundle), definition_revision: 28,
    definition: definition.value, scene_presentation: presentation.value,
    artifact_pins: { ...historicalBundle.artifact_pins,
      definition: pin('definition', DEFINITION_PATH, definition),
      scene_presentation: pin('scene_presentation', PRESENTATION_PATH, presentation) } };
  validateDefinitionPins(bundle);
  return freezeDeep(bundle);
}

function pin(key, path, loaded) {
  return { key, path, digest: loaded.digest,
    canonical_digest: canonicalDigest(loaded.value), schema: loaded.value.schema,
    revision: loaded.value.revision };
}
