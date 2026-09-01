import { canonicalDigest } from '@rus/materialization';
import { ROOT, readBundleArtifact } from './lower-dvina-trace-s1-bundle-utils.js';

const PATH = `${ROOT}/phase-1a-v22/materialization-bindings.json`;
const DIGEST = '83c221c8554316512e547c68498a7b9a3b352d1c70807dad5468a9cd7e413548';
const MANIFEST_PATH = `${ROOT}/phase-1a-v22/manifest.json`;
const MANIFEST_DIGEST = 'cf14a61a55662181ecc0203e5e0cb9d5f2c37902c256a4eca0169e1ec33d5a21';
const SHED_PATH = `${ROOT}/phase-1a-v22/spatial-s1-shed-authoring.json`;
const SHED_DIGEST = '7da4cbe81345f89f44978af1a576b776add9a8929352f39f58aad287845418e8';
const DEFINITION_PATH = `${ROOT}/phase-m14-content/definition.json`;
const DEFINITION_DIGEST = 'f8b83e3bb3a3050d3a5c4daf7efe04b731dda134b83346e0a40c710e06d3134a';

export async function loadLowerDvinaTraceRevision26Bundle({ rootDir, historicalBundle,
  fail = (code) => { throw new Error(code); }, freezeDeep = Object.freeze,
  validateDefinitionPins = () => {} } = {}) {
  const [manifest, loaded, shed, definition] = await Promise.all([
    readBundleArtifact(rootDir, MANIFEST_PATH), readBundleArtifact(rootDir, PATH),
    readBundleArtifact(rootDir, SHED_PATH), readBundleArtifact(rootDir, DEFINITION_PATH)
  ]);
  const bindings = loaded.value;
  if (historicalBundle?.definition_revision !== 25 || loaded.digest !== DIGEST
      || manifest.digest !== MANIFEST_DIGEST || !validManifest(manifest.value, loaded)
      || shed.digest !== SHED_DIGEST || !validBindings(bindings, historicalBundle)
      || definition.digest !== DEFINITION_DIGEST || definition.value?.revision !== 26
      || !validShedAuthoring(shed.value)) return fail(
    'TRACE_REVISION_26_CONTENT_INVALID',
    'Revision 26 prepared-member authoring is stale or incomplete.');
  const mergedBindings = { ...structuredClone(historicalBundle.materialization_bindings),
    ...structuredClone(bindings) };
  const bundle = { ...structuredClone(historicalBundle), definition_revision: 26,
    manifest_digest: manifest.digest, phase_1a_manifest: manifest.value, definition: definition.value,
    materialization_bindings: mergedBindings,
    s1_old_drying_shed_authoring: shed.value,
    artifact_pins: { ...historicalBundle.artifact_pins } };
  bundle.artifact_pins.materialization_bindings = {
    key: 'materialization_bindings', path: PATH, digest: loaded.digest,
    canonical_digest: canonicalDigest(mergedBindings), schema: bindings.schema,
    revision: bindings.revision
  };
  bundle.artifact_pins.phase_1a_manifest = { key: 'phase_1a_manifest',
    path: MANIFEST_PATH, digest: manifest.digest,
    canonical_digest: canonicalDigest(manifest.value), schema: manifest.value.schema,
    revision: manifest.value.revision };
  bundle.artifact_pins.definition = { key: 'definition', path: DEFINITION_PATH,
    digest: definition.digest, canonical_digest: canonicalDigest(definition.value),
    schema: definition.value.schema, revision: definition.value.revision };
  validateDefinitionPins(bundle);
  return freezeDeep(bundle);
}

function validManifest(value, bindings) {
  return value?.schema === 'rus.lower_dvina_trace_phase_1a_manifest.v1'
    && value.package_id === 'lower_dvina_trace_phase_1a_v22'
    && value.revision === 22 && value.status === 'approved'
    && value.scenario_definition_revision === 26
    && value.content_refs?.materialization_bindings?.digest === bindings.digest
    && value.fallback_policy === 'forbidden';
}

function validShedAuthoring(value) {
  return value?.schema === 'rus.lower_dvina_trace_s1_prepared_scene_authoring.v1'
    && value.authoring_id === 'lower_dvina_trace_s1_old_drying_shed_v1'
    && value.status === 'approved'
    && value.canonical_g5?.id === 'trace_ld_v1_g5_old_drying_shed'
    && value.canonical_g5?.parent_id
      === 'g4v3__gn_nov_g3_xp017_yp026_r2_vikhtuy_resource_edge'
    && value.scene_materialization_profile?.id === 'trace_ld_v1_smp_old_drying_shed'
    && value.scene_materialization_profile?.scene_template_id
      === 'trace_ld_v1_tpl_old_drying_shed'
    && value.base_position?.slot_key === 'shed_approach'
    && value.base_position?.access_policy_ref === 'trace_ld_v1_access_old_drying_shed'
    && value.base_position?.capacity_contract_ref === 'trace_ld_v1_capacity_old_drying_shed'
    && value.s1_topology?.g6_slot_key === 's1_enclosed_space';
}

function validBindings(value, historical) {
  const members = value?.first_entry_preparation?.members;
  const [camp, shed] = members ?? [];
  return value?.schema === 'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1'
    && value.binding_set_id === 'lower_dvina_trace_phase_1a_materialization_bindings_v22'
    && value.revision === 22 && value.status === 'approved'
    && value.scenario_definition_revision === 26
    && value.superseded_binding_ref?.digest
      === historical.artifact_pins.materialization_bindings.digest
    && value.fallback_policy === 'forbidden' && members?.length === 2
    && camp?.ordinal === 0 && camp.binding?.route_ref === 'trace_ld_v1_route_wreck_to_camp'
    && camp.binding.destination?.location_profile_ref === 'trace_ld_v1_loc_fishing_camp'
    && shed?.ordinal === 1 && shed.binding?.route_ref === 'trace_ld_v1_route_camp_to_shed'
    && shed.binding.destination?.location_profile_ref === 'trace_ld_v1_loc_old_drying_shed'
    && shed.binding.destination?.g5?.canonical_ref?.authoring_version === '1'
    && shed.binding.destination?.g5?.canonical_ref?.entity_ref?.entity_kind
      === 'canonical_spatial_node'
    && shed.binding.destination?.g5?.canonical_ref?.entity_ref?.entity_id
      === 'trace_ld_v1_g5_old_drying_shed'
    && shed.binding.destination?.g5?.materialization_profile_ref?.entity_ref?.entity_id
      === 'trace_ld_v1_smp_old_drying_shed'
    && shed.binding.destination?.g6?.scene_template_ref
      === 'trace_ld_v1_tpl_old_drying_shed';
}
