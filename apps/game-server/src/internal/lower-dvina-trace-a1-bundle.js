import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const CONTENT = `${ROOT}/phase-m9-content`;

export async function loadLowerDvinaTraceRevision21Bundle({ rootDir,
  historicalBundle, fail = (code) => { throw new Error(code); },
  freezeDeep = Object.freeze, validateDefinitionPins = () => {} } = {}) {
  const paths = {
    manifest: `${CONTENT}/manifest.json`,
    definition: `${CONTENT}/definition.json`,
    action_production_profile: `${CONTENT}/action-production-profile.json`,
    phase_1a_manifest: `${ROOT}/phase-1a-v17/manifest.json`,
    materialization_bindings:
      `${ROOT}/phase-1a-v17/materialization-bindings.json`
  };
  const loaded = Object.fromEntries(await Promise.all(Object.entries(paths)
    .map(async ([key, path]) => [key, await read(rootDir, path)])));
  if (!validLowerDvinaTraceRevision21Bundle(
    historicalBundle, loaded, paths)) {
    return fail('TRACE_REVISION_21_CONTENT_INVALID',
      'Revision 21 A1 content is stale or incomplete.');
  }
  const materializationBindings = {
    ...structuredClone(historicalBundle.materialization_bindings),
    ...structuredClone(loaded.materialization_bindings.value)
  };
  const bundle = {
    ...structuredClone(historicalBundle),
    definition_revision: 21,
    manifest_digest: loaded.phase_1a_manifest.digest,
    phase_1a_manifest: loaded.phase_1a_manifest.value,
    m9_content_manifest_digest: loaded.manifest.digest,
    definition: loaded.definition.value,
    action_production_profile: loaded.action_production_profile.value,
    materialization_bindings: materializationBindings,
    artifact_pins: { ...historicalBundle.artifact_pins }
  };
  for (const [key, artifact, path] of [
    ['phase_1a_manifest', bundle.phase_1a_manifest, paths.phase_1a_manifest],
    ['materialization_bindings', materializationBindings,
      paths.materialization_bindings],
    ['definition', bundle.definition, paths.definition],
    ['action_production_profile', bundle.action_production_profile,
      paths.action_production_profile]
  ]) bundle.artifact_pins[key] = { key, path, digest: loaded[key].digest,
    canonical_digest: canonicalDigest(artifact), schema: artifact.schema,
    revision: artifact.revision };
  validateDefinitionPins(bundle);
  return freezeDeep(bundle);
}

function validLowerDvinaTraceRevision21Bundle(
  historical, loaded, paths) {
  return Object.values(revision21Checks(historical, loaded, paths))
    .every(Boolean);
}

function revision21Checks(historical, loaded, paths) {
  const manifest = loaded.manifest.value;
  const phase1a = loaded.phase_1a_manifest.value;
  const bindings = loaded.materialization_bindings.value;
  const profile = loaded.action_production_profile.value;
  const files = {
    'action-production-profile.json': loaded.action_production_profile.digest,
    'definition.json': loaded.definition.digest
  };
  const checks = {
    historical: historical?.definition_revision === 20,
    manifest_schema:
      manifest?.schema === 'rus.lower_dvina_trace_m9_content_manifest.v1',
    manifest_revision: manifest.scenario_definition_revision === 21,
    superseded_content: manifest.superseded_package_ref?.digest
      === historical.m8_content_manifest_digest,
    files: exact(manifest.files, files),
    content_digest: manifest.content_digest
      === '9557533b5f5676c575bf51f7fe36c06a7e380ab34f05c269b94526b96687b13a',
    definition_ref: exactRef(manifest.content_refs?.definition,
      loaded.definition, 'definition.json', 'lower_dvina_trace_v1', 21),
    profile_ref: exactRef(manifest.content_refs?.action_production_profile,
      loaded.action_production_profile, 'action-production-profile.json',
      'lower_dvina_trace_a1_open_physical_action_profile_v1', 1, 'profile_id'),
    definition_revision: loaded.definition.value?.revision === 21,
    superseded_definition:
      loaded.definition.value.supersedes_definition_ref?.digest
        === historical.artifact_pins.definition.digest,
    profile: validProfile(profile),
    phase1a_id: phase1a?.package_id === 'lower_dvina_trace_phase_1a_v17',
    phase1a_revision: phase1a.scenario_definition_revision === 21,
    superseded_phase1a: phase1a.superseded_package_ref?.digest
      === historical.artifact_pins.phase_1a_manifest.digest,
    phase1a_content: phase1a.base_definition_ref?.digest
      === loaded.manifest.digest,
    bindings_ref: exactRef(phase1a.content_refs?.materialization_bindings,
      loaded.materialization_bindings, paths.materialization_bindings,
      'lower_dvina_trace_phase_1a_materialization_bindings_v17', 17,
      'binding_set_id'),
    bindings_revision: bindings?.scenario_definition_revision === 21,
    superseded_bindings: bindings.superseded_binding_ref?.digest
      === historical.artifact_pins.materialization_bindings.digest,
    bindings_profile:
      bindings.action_production_materialization?.profile_ref?.digest
        === loaded.action_production_profile.digest,
    fallback: bindings.action_production_materialization?.fallback_policy
      === 'forbidden'
  };
  return checks;
}

export function validLowerDvinaTraceActionProductionProfile(value) {
  return validProfile(value);
}

function validProfile(value) {
  return exact(value, ['schema', 'profile_id', 'revision', 'status',
    'context_ref', 'policy_ref', 'policy_version', 'max_new_entities',
    'allowed_access_states', 'allowed_identity_modes', 'allowed_origins',
    'allowed_result_classes', 'allowed_output_classes', 'source_policy',
    'tool_policy', 'execution_policy', 'model_authority',
    'mechanics_owner', 'persistence_owner', 'fallback_policy'])
    && value.schema === 'rus.lower_dvina_trace_action_production_profile.v1'
    && value.profile_id === 'lower_dvina_trace_a1_open_physical_action_profile_v1'
    && value.revision === 1 && value.status === 'approved'
    && value.policy_version === 1 && value.max_new_entities === 4
    && same(value.allowed_access_states, ['immediate', 'quick'])
    && same(value.allowed_identity_modes,
      ['preserve_source', 'independent_outputs', 'no_useful_result'])
    && same(value.allowed_origins, ['direct_partition', 'crafted'])
    && same(value.allowed_result_classes,
      ['ordinary_physical_result', 'partial_transformation',
        'nonworking_construction', 'waste', 'written_carrier',
        'no_useful_result'])
    && same(value.allowed_output_classes, ['ordinary_mundane',
      'weapon_capable', 'money_like_token', 'written_carrier'])
    && value.source_policy
      === 'one_to_many_visible_accessible_non_container_items'
    && value.tool_policy
      === 'zero_to_many_visible_accessible_non_container_items'
    && value.execution_policy
      === 'existing_turn_step_generic_check_and_semantic_activity'
    && value.model_authority === 'primary_turn_step_plan_qualitative_only'
    && value.mechanics_owner === '@rus/items-property'
    && value.persistence_owner === 'P16_combined_atomic_committer'
    && value.fallback_policy === 'forbidden'
    ;
}

async function read(rootDir, path) {
  const raw = await readFile(resolve(rootDir, path));
  return { value: JSON.parse(raw),
    digest: createHash('sha256').update(raw).digest('hex') };
}
function exactRef(ref, loaded, path, id, revision, idField = 'id') {
  return ref?.path === path && ref.id === id && ref.revision === revision
    && ref.schema === loaded.value.schema && ref.digest === loaded.digest
    && (idField === 'id' || loaded.value[idField] === id);
}
function exact(actual, expected) {
  if (Array.isArray(expected)) return actual != null
    && typeof actual === 'object' && !Array.isArray(actual)
    && Object.keys(actual).length === expected.length
    && expected.every((key) => Object.hasOwn(actual, key));
  return JSON.stringify(Object.keys(actual ?? {}).sort())
    === JSON.stringify(Object.keys(expected).sort())
    && Object.entries(expected).every(([key, value]) => actual[key] === value);
}
function same(left, right) { return Array.isArray(left)
  && left.length === right.length
  && left.every((value, index) => value === right[index]); }
