import { canonicalDigest } from '@rus/materialization';
import { ROOT, readBundleArtifact } from './lower-dvina-trace-s1-bundle-utils.js';

const DEFINITION_PATH = `${ROOT}/phase-m19-content/definition.json`;
const DEFINITION_DIGEST = '4494bde28c4b8ba74c8fcfe72c72356e50cd2fa03b0076c58fa5000f6498abfe';

export async function loadLowerDvinaTraceRevision31Bundle({ rootDir,
  historicalBundle, fail = (code) => { throw new Error(code); },
  freezeDeep = Object.freeze, validateDefinitionPins = () => {} } = {}) {
  const definition = await readBundleArtifact(rootDir, DEFINITION_PATH);
  if (historicalBundle?.definition_revision !== 30
      || definition.digest !== DEFINITION_DIGEST || definition.value?.revision !== 31
      || definition.value?.resolved_policy_refs?.body_environment_profiles?.digest
        !== historicalBundle.body_environment_profiles?.artifact_pins?.digest
          && definition.value?.resolved_policy_refs?.body_environment_profiles?.digest
            !== historicalBundle.artifact_pins?.body_environment_profiles?.digest) {
    return fail('TRACE_REVISION_31_CONTENT_INVALID');
  }
  const bundle = { ...structuredClone(historicalBundle), definition_revision: 31,
    definition: definition.value, artifact_pins: { ...historicalBundle.artifact_pins,
      definition: { key: 'definition', path: DEFINITION_PATH, digest: definition.digest,
        canonical_digest: canonicalDigest(definition.value), schema: definition.value.schema,
        revision: definition.value.revision } } };
  validateDefinitionPins(bundle);
  return freezeDeep(bundle);
}
