import { canonicalDigest } from '@rus/materialization';
import { ROOT, readBundleArtifact } from './lower-dvina-trace-s1-bundle-utils.js';

const DEFINITION_PATH = `${ROOT}/phase-m17-content/definition.json`;
const BODY_PATH = `${ROOT}/phase-0d-v6/body-environment-profiles.json`;
const DEFINITION_DIGEST = '43ce9853e0d5f4d1d5a966814732bbd2f030817a6ad9867085dcc70f010ee4a7';
const BODY_DIGEST = 'fac0e95be64faf91f45daf95d96ce972541b1b244a6a3e6d2bbbaedaa6e22660';

export async function loadLowerDvinaTraceRevision29Bundle({ rootDir,
  historicalBundle, fail = (code) => { throw new Error(code); },
  freezeDeep = Object.freeze, validateDefinitionPins = () => {} } = {}) {
  const [definition, body] = await Promise.all([
    readBundleArtifact(rootDir, DEFINITION_PATH), readBundleArtifact(rootDir, BODY_PATH)
  ]);
  if (historicalBundle?.definition_revision !== 28
      || definition.digest !== DEFINITION_DIGEST || body.digest !== BODY_DIGEST
      || definition.value?.revision !== 29 || body.value?.revision !== 8
      || definition.value?.resolved_policy_refs?.body_environment_profiles?.digest
        !== body.digest) return fail('TRACE_REVISION_29_CONTENT_INVALID');
  const materializationBindings = revision29Bindings(
    historicalBundle.materialization_bindings, body.digest, fail);
  const bundle = { ...structuredClone(historicalBundle), definition_revision: 29,
    definition: definition.value, body_environment_profiles: body.value,
    materialization_bindings: materializationBindings,
    artifact_pins: { ...historicalBundle.artifact_pins,
      definition: pin('definition', DEFINITION_PATH, definition),
      materialization_bindings: { ...historicalBundle.artifact_pins.materialization_bindings,
        canonical_digest: canonicalDigest(materializationBindings) },
      body_environment_profiles: pin('body_environment_profiles', BODY_PATH, body) } };
  validateDefinitionPins(bundle);
  return freezeDeep(bundle);
}

function pin(key, path, loaded) {
  return { key, path, digest: loaded.digest,
    canonical_digest: canonicalDigest(loaded.value), schema: loaded.value.schema,
    revision: loaded.value.revision };
}

function revision29Bindings(historical, bodyDigest, fail) {
  const bindings = structuredClone(historical);
  const inventory = bindings?.sealed_selection_inventory;
  const body = inventory?.required_groups?.find((value) => value.selection_kind === 'body');
  if (bindings?.binding_set_id !== 'lower_dvina_trace_phase_1a_materialization_bindings_v23'
      || inventory?.inventory_id !== 'lower_dvina_trace_phase_1a_sealed_selection_inventory_v11'
      || body?.required_record_count !== 1) return fail('TRACE_REVISION_29_CONTENT_INVALID');
  inventory.inventory_id = 'lower_dvina_trace_phase_1a_sealed_selection_inventory_v12';
  inventory.source_artifact_digests.body_environment_profiles = bodyDigest;
  body.required_records_digest = '05e4304b57cde3d67dc347f2931b122ca5f3174f039b184f55cafecd2ecfd638';
  return bindings;
}
