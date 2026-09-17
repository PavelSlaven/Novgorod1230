import { canonicalDigest } from '@rus/materialization';
import { mergeItemContainerSet } from './lower-dvina-trace-character-appearance-bundle.js';
import { ROOT, readBundleArtifact } from './lower-dvina-trace-s1-bundle-utils.js';

const artifacts = {
  definition: ['phase-m23-content/definition.json',
    '807596c419fc6a0f9d676d7c57daba6672c6f95d1b1ead767bee6c7e28aced6f'],
  item_container_set: ['phase-m23-content/item-container-set-overlay.json',
    '4c3fbca207e5c0a924b945a257dc09652c15091d5fbb125c33c3943a6fbb344d'],
  phase_1a_manifest: ['phase-1a-v25/manifest.json',
    '986fd4fa149997ed9581924b13f502b6f9eafff640b31d390b4347f113c500e6'],
  materialization_bindings: ['phase-1a-v25/materialization-bindings.json',
    '328cb8f90994c3cfabf359073233ca4bb834fda44778cfc8133c16d91c86965d']
};

export async function loadLowerDvinaTraceRevision35Bundle({ rootDir,
  historicalBundle, fail, freezeDeep, validateDefinitionPins }) {
  if (historicalBundle?.definition_revision !== 34) {
    return fail('TRACE_REVISION_35_CONTENT_INVALID');
  }
  const bundle = structuredClone(historicalBundle);
  for (const [key, [relative, digest]] of Object.entries(artifacts)) {
    const path = `${ROOT}/${relative}`;
    const loaded = await readBundleArtifact(rootDir, path);
    if (loaded.digest !== digest) return fail('TRACE_REVISION_35_CONTENT_INVALID');
    bundle[key] = key === 'item_container_set'
      ? mergeItemContainerSet(bundle[key], loaded.value, fail)
      : key === 'materialization_bindings'
        ? { ...bundle[key], ...loaded.value } : loaded.value;
    bundle.artifact_pins[key] = { key, path, digest,
      canonical_digest: canonicalDigest(bundle[key]), schema: bundle[key].schema,
      revision: bundle[key].revision };
  }
  if (bundle.definition?.revision !== 35
      || bundle.definition.immutable_content_refs?.item_container_set?.digest
        !== artifacts.item_container_set[1]
      || bundle.materialization_bindings?.scenario_definition_revision !== 35) {
    return fail('TRACE_REVISION_35_CONTENT_INVALID');
  }
  bundle.definition_revision = 35;
  bundle.manifest_digest = artifacts.phase_1a_manifest[1];
  validateDefinitionPins(bundle);
  return freezeDeep(bundle);
}
