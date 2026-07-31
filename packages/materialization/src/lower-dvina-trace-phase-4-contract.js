const SCENARIO_ID = 'lower_dvina_trace_v1';

export function assertLowerDvinaTracePhase4Cutover(bundle, fail) {
  const manifest = bundle.phase_1a_manifest;
  const bindings = bundle.materialization_bindings;
  const definition = bundle.definition;
  const policy = bundle.npc_decision_schedule_policies;
  if (manifest?.package_id !== 'lower_dvina_trace_phase_1a_v6'
    || manifest.revision !== 6
    || manifest.scenario_definition_revision !== 10
    || manifest.superseded_package_ref?.id !== 'lower_dvina_trace_phase_1a_v5'
    || manifest.superseded_package_ref.revision !== 5
    || manifest.superseded_package_ref.digest
      !== 'dc7e58dfa3382a2a91dd1954c645ad630c8de3b4fb42bdc68888cd72d5fff44f'
    || manifest.base_definition_ref?.package_id
      !== 'lower_dvina_trace_phase_4_content_v1'
    || manifest.base_definition_ref.revision !== 1
    || manifest.base_definition_ref.digest
      !== bundle.phase_4_content_manifest_digest
    || manifest.content_refs?.materialization_bindings?.digest
      !== bundle.artifact_pins.materialization_bindings.digest
    || bindings?.binding_set_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v6'
    || bindings.revision !== 6
    || bindings.scenario_definition_revision !== 10
    || bindings.superseded_binding_ref?.id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v5'
    || bindings.superseded_binding_ref.revision !== 5
    || bindings.superseded_binding_ref.digest
      !== 'd67e8543448872ee529893df60980771548fb07dada306303bb1003d0ffda0a3'
    || definition?.scenario_id !== SCENARIO_ID
    || definition.revision !== 10
    || definition.supersedes_definition_ref?.revision !== 9
    || definition.supersedes_definition_ref.digest
      !== 'f0cc939c6f8ebed70b2e02f5df5681d2988044012cc366209a4dd9ee763130f9'
    || definition.resolved_policy_refs?.npc_decision_schedule_policies?.revision !== 3
    || definition.resolved_policy_refs.npc_decision_schedule_policies.digest
      !== bundle.artifact_pins.npc_decision_schedule_policies.digest
    || policy?.set_id !== 'trace_ld_v1_npc_decision_schedule_policies'
    || policy.revision !== 3
    || policy.supersedes_ref?.revision !== 2
    || policy.supersedes_ref.digest
      !== '1a3d5d8a5225a5ff98882dd66ba133a1903d3ead4f6d6912d694e0ff672a5969') {
    fail(
      'TRACE_PHASE_4_CUTOVER_IDENTITY_INVALID',
      'Phase 4 must exact-supersede the immutable revision 9 chain.'
    );
  }
  assertPhase4InitialBinding(bindings.phase_4_initial_state_binding, fail);
  assertRatshaKnifeTransition(policy, fail);
}

function assertPhase4InitialBinding(binding, fail) {
  const spatial = binding?.drying_shed_spatial_binding;
  const participants = binding?.initial_participant_placements;
  const rope = binding?.onisim_injury_rope_binding;
  const promise = binding?.promise_initial_binding;
  const knife = binding?.ratsha_knife_initial_binding;
  if (spatial?.location_profile_ref !== 'trace_ld_v1_loc_old_drying_shed'
    || spatial.node_template_ref !== 'trace_ld_v1_tpl_old_drying_shed'
    || spatial.entry_route_ref !== 'trace_ld_v1_route_camp_to_shed'
    || spatial.entry_endpoint_ref !== 'trace_ld_v1_ep_drying_shed_ridge_to_camp'
    || spatial.anchor_template?.slot_key !== 'shed_approach'
    || !Array.isArray(participants)
    || participants.length !== 2
    || participants[0]?.participant_slot_ref !== 'onisim_boatman'
    || participants[1]?.participant_slot_ref !== 'ratsha_storehouse_helper'
    || rope?.condition_profile_ref !== 'trace_ld_v1_condition_onisim_injury'
    || rope.condition_state !== 'injured_unable_to_walk'
    || rope.holder_ref !== 'onisim_boatman'
    || rope.controller_ref !== 'ratsha_storehouse_helper'
    || rope.owner_ref !== null
    || promise?.policy_ref !== 'trace_ld_v1_promise_no_summary_killing'
    || promise.initial_state !== 'not_offered'
    || promise.initial_state_fact !== 'promise_current_not_offered'
    || knife?.item_template_ref !== 'trace_ld_v1_item_ratsha_knife'
    || knife.owner_ref !== 'ratsha_storehouse_helper'
    || knife.holder_ref !== 'ratsha_storehouse_helper'
    || knife.controller_ref !== 'ratsha_storehouse_helper'
    || knife.physical_position !== 'worn_quick'
    || knife.accessibility !== 'quick'
    || knife.inventory_profile_ref
      !== 'inventory_item_tpl_nov_utility_knife_v1') {
    fail(
      'TRACE_PHASE_4_INITIAL_BINDING_INVALID',
      'Phase 4 initial materialization binding is incomplete.'
    );
  }
}

function assertRatshaKnifeTransition(policy, fail) {
  const matches = (policy.property_transition_profiles ?? []).filter(
    (entry) => entry.transition_profile_id
      === 'trace_ld_v1_property_ratsha_knife_surrendered_to_participating_fisher'
  );
  const transition = matches[0];
  if (matches.length !== 1
    || transition.requires?.holder_ref !== 'ratsha_storehouse_helper'
    || transition.requires.controller_ref !== 'ratsha_storehouse_helper'
    || transition.requires.physical_position !== 'worn_quick'
    || transition.requires.accessibility !== 'quick'
    || transition.requires.admission_fact
      !== 'ratsha_surrender_without_further_harm_committed'
    || transition.writes?.holder_ref
      !== 'trace_ld_v1_audience_slot_participating_fisher'
    || transition.writes.controller_ref
      !== 'trace_ld_v1_audience_slot_participating_fisher'
    || transition.writes.physical_position !== 'hands'
    || transition.writes.accessibility
      !== 'secured_not_available_to_ratsha'
    || transition.owner_change !== 'forbidden'
    || !transition.write_targets?.includes('item_physical_position')) {
    fail(
      'TRACE_PHASE_4_RATSHA_KNIFE_TRANSITION_INVALID',
      'The approved Ratsha knife surrender transition is incomplete.'
    );
  }
}
