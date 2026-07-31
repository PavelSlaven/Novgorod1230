import { assertLowerDvinaTracePhase5InitialBindings } from './lower-dvina-trace-phase-5-contract.js';

const SCENARIO_ID = 'lower_dvina_trace_v1';

export function assertLowerDvinaTracePhase6Cutover(bundle, fail) {
  const manifest = bundle.phase_1a_manifest;
  const bindings = bundle.materialization_bindings;
  const definition = bundle.definition;
  const inventory = bindings?.sealed_selection_inventory;
  const pins = bundle.artifact_pins;
  if (manifest?.package_id !== 'lower_dvina_trace_phase_1a_v8'
    || manifest.revision !== 8
    || manifest.scenario_definition_revision !== 12
    || manifest.superseded_package_ref?.id !== 'lower_dvina_trace_phase_1a_v7'
    || manifest.superseded_package_ref?.revision !== 7
    || manifest.base_definition_ref?.package_id !== 'lower_dvina_trace_phase_6_content_v1'
    || manifest.base_definition_ref?.revision !== 1
    || manifest.content_refs?.materialization_bindings?.digest
      !== pins.materialization_bindings.digest
    || bindings?.binding_set_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v8'
    || bindings.revision !== 8
    || bindings.scenario_definition_revision !== 12
    || bindings.superseded_binding_ref?.id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v7'
    || bindings.superseded_binding_ref?.revision !== 7
    || bindings.reused_immutable_binding_ref?.id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v7'
    || bindings.reused_immutable_binding_ref?.revision !== 7
    || bindings.binding_resolution_policy
      !== 'reuse_exact_superseded_initial_materialization_bindings_or_fail_closed'
    || definition?.scenario_id !== SCENARIO_ID
    || definition.revision !== 12
    || definition.supersedes_definition_ref?.revision !== 11
    || definition.immutable_content_refs?.item_container_set?.revision !== 4
    || definition.immutable_content_refs.item_container_set.digest
      !== pins.item_container_set.digest
    || definition.resolved_policy_refs?.activity_check_consequence_profiles
      ?.digest !== pins.activity_check_consequence_profiles.digest
    || definition.resolved_policy_refs?.movement_bindings?.digest
      !== pins.movement_bindings.digest
    || definition.resolved_policy_refs?.body_environment_profiles?.digest
      !== pins.body_environment_profiles.digest
    || inventory?.inventory_id
      !== 'lower_dvina_trace_phase_1a_sealed_selection_inventory_v8'
    || inventory.source_artifact_digests?.activity_check_consequence_profiles
      !== pins.activity_check_consequence_profiles.digest
    || inventory.source_artifact_digests?.movement_bindings
      !== pins.movement_bindings.digest
    || inventory.source_artifact_digests?.body_environment_profiles
      !== pins.body_environment_profiles.digest
    || inventory.source_artifact_digests?.item_container_set
      !== pins.item_container_set.digest
    || bindings.phase_4_initial_state_binding?.onisim_injury_rope_binding
      ?.inventory_profile_ref
      !== 'trace_ld_v1_inventory_profile_ratsha_binding_rope') {
    fail('TRACE_PHASE_6_CUTOVER_IDENTITY_INVALID',
      'Phase 6 must exact-supersede revision 11 while pinning the revision 12 overlays.');
  }
  assertLowerDvinaTracePhase5InitialBindings(bundle, fail, {
    waterProfileRef:
      'trace_ld_v1_inventory_profile_eremey_drinking_water_vessel'
  });
}
