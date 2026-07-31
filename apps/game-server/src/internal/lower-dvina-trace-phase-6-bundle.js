import { canonicalDigest } from '@rus/materialization';
import {
  loadLowerDvinaTracePhase6Content,
  mergeLowerDvinaTracePhase6Content
} from './lower-dvina-trace-phase-6-content-loader.js';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const CONTENT_ROOT = `${ROOT}/phase-6-content`;

export async function loadLowerDvinaTraceRevision12Bundle({
  rootDir,
  historicalBundle,
  fail,
  freezeDeep,
  validateDefinitionPins
}) {
  const historical = structuredClone(historicalBundle);
  const content = await loadLowerDvinaTracePhase6Content({
    rootDir,
    historical,
    fail
  });
  const merged = mergeLowerDvinaTracePhase6Content({ historical, content, fail });
  historical.definition_revision = 12;
  historical.manifest_digest = content.phase1a.digest;
  historical.phase_6_content_manifest_digest = content.manifest.digest;
  historical.phase_1a_manifest = content.phase1a.value;
  historical.definition = content.definition.value;
  historical.item_container_set = merged.itemContainerSet;
  historical.activity_check_consequence_profiles = merged.activityProfiles;
  historical.body_environment_profiles = merged.bodyProfiles;
  historical.movement_bindings = merged.movementBindings;
  historical.materialization_bindings = merged.materializationBindings;
  for (const [key, loaded, path] of [
    ['phase_1a_manifest', content.phase1a, `${ROOT}/phase-1a-v8/manifest.json`],
    ['materialization_bindings', content.bindings,
      `${ROOT}/phase-1a-v8/materialization-bindings.json`],
    ['definition', content.definition, `${CONTENT_ROOT}/definition.json`],
    ['item_container_set', content.items,
      `${CONTENT_ROOT}/item-container-set-overlay.json`],
    ['activity_check_consequence_profiles', content.activity,
      `${CONTENT_ROOT}/activity-check-consequence-profiles.json`],
    ['body_environment_profiles', content.body,
      `${CONTENT_ROOT}/body-environment-profiles.json`],
    ['movement_bindings', content.movement, `${CONTENT_ROOT}/movement-bindings.json`]
  ]) {
    historical.artifact_pins[key] = {
      key,
      path,
      digest: loaded.digest,
      canonical_digest: [
        'materialization_bindings',
        'activity_check_consequence_profiles',
        'body_environment_profiles',
        'movement_bindings',
        'item_container_set'
      ].includes(key)
        ? canonicalDigest(historical[key])
        : canonicalDigest(loaded.value),
      schema: key === 'item_container_set'
        ? historical.item_container_set.schema
        : loaded.value.schema,
      revision: key === 'item_container_set'
        ? historical.item_container_set.revision
        : loaded.value.revision
    };
  }
  validateDefinitionPins(historical);
  return freezeDeep(historical);
}
