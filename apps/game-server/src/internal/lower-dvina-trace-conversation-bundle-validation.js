export function assertRevision14Package({ historical, manifest, definition,
  conversationBindings, phase1a, bindings, reused, fail }) {
  const manifestValue = manifest.value;
  const definitionValue = definition.value;
  const semanticValue = conversationBindings.value;
  const phase1aValue = phase1a.value;
  const bindingValue = bindings.value;
  if (manifestValue?.schema
      !== 'rus.lower_dvina_trace_m2_content_manifest.v1'
    || manifestValue.package_id !== 'lower_dvina_trace_m2_content_v1'
    || manifestValue.revision !== 1
    || manifestValue.scenario_definition_revision !== 14
    || manifestValue.status !== 'approved'
    || manifestValue.fallback_policy !== 'forbidden'
    || manifestValue.superseded_package_ref?.digest
      !== historical.m1_content_manifest_digest
    || manifestValue.superseded_definition_ref?.digest
      !== historical.artifact_pins.definition.digest
    || manifestValue.files?.['definition.json'] !== definition.digest
    || manifestValue.files?.['conversation-semantic-bindings.json']
      !== conversationBindings.digest
    || manifestValue.content_refs?.definition?.digest !== definition.digest
    || manifestValue.content_refs?.conversation_semantic_bindings?.digest
      !== conversationBindings.digest
    || definitionValue?.revision !== 14
    || definitionValue.supersedes_definition_ref?.digest
      !== historical.artifact_pins.definition.digest
    || definitionValue.resolved_policy_refs
      ?.conversation_semantic_bindings?.digest !== conversationBindings.digest
    || phase1aValue?.package_id !== 'lower_dvina_trace_phase_1a_v10'
    || phase1aValue.revision !== 10
    || phase1aValue.scenario_definition_revision !== 14
    || phase1aValue.superseded_package_ref?.digest
      !== historical.artifact_pins.phase_1a_manifest.digest
    || phase1aValue.base_definition_ref?.digest !== manifest.digest
    || phase1aValue.content_refs?.materialization_bindings?.digest
      !== bindings.digest
    || bindingValue?.binding_set_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v10'
    || bindingValue.revision !== 10
    || bindingValue.scenario_definition_revision !== 14
    || bindingValue.superseded_binding_ref?.digest !== reused.digest
    || bindingValue.reused_immutable_binding_ref?.digest !== reused.digest
    || bindingValue.sealed_selection_inventory_ref?.digest !== reused.digest
    || bindingValue.binding_resolution_policy
      !== 'reuse_exact_superseded_initial_materialization_bindings_or_fail_closed'
    || bindingValue.fallback_policy !== 'forbidden'
    || bindingValue.normalization_policy !== 'forbidden'
    || reused.digest !== historical.artifact_pins.materialization_bindings.digest
    || reused.value?.binding_set_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v9') {
    fail('TRACE_M2_CONTENT_INVALID',
      'Exact approved M2 conversation content and cutover are required.');
  }
  assertConversationBindings(semanticValue, fail);
}

function assertConversationBindings(value, fail) {
  const expectedContracts = [
    'npc_decision_signal_v1',
    'npc_decision_boundary_v1',
    'player_conversation_contribution_plan_v1',
    'conversation_contribution_plan_v1'
  ];
  const expectedMappings = new Map([
    ['trace_ld_v1_phase_3_eremey_question_signal_v1',
      [['communication', 'material'], 'perception_required']],
    ['trace_ld_v1_phase_3_eremey_blue_wool_request_signal_v1',
      [['environment,communication', 'material'], 'perception_required']],
    ['trace_ld_v1_phase_4_group_appears_to_ratsha_signal_v1',
      [['others', 'material'], 'perception_required']],
    ['trace_ld_v1_phase_4_ratsha_waiting_invalidated_signal_v1',
      [['objective', 'material'], 'perception_not_required']],
    ['trace_ld_v1_phase_4_ratsha_promise_surrender_signal_v1',
      [['communication', 'material'], 'perception_required']],
    ['trace_ld_v1_phase_4_ratsha_loses_knife_access_signal_v1',
      [['self', 'material'], 'perception_not_required']],
    ['trace_ld_v1_phase_4_observed_ratsha_knife_loss_signal_v1',
      [['others', 'material'], 'perception_required']]
  ]);
  const mappings = value?.signal_mappings;
  if (value?.schema
      !== 'rus.lower_dvina_trace_conversation_semantic_bindings.v1'
    || value.binding_set_id
      !== 'lower_dvina_trace_conversation_semantic_bindings_v1'
    || value.revision !== 1
    || value.status !== 'approved'
    || value.scenario_definition_revision !== 14
    || value.fallback_policy !== 'forbidden'
    || value.legacy_bounded_production_path !== 'forbidden'
    || JSON.stringify(value.contract_refs) !== JSON.stringify(expectedContracts)
    || JSON.stringify(value.decision_modes)
      !== JSON.stringify(['autonomous', 'conversation'])
    || value.combat_policy?.handoff !== 'required'
    || value.combat_policy?.conversation_resolver !== 'forbidden'
    || JSON.stringify(value.decision_signal_policy?.categories)
      !== JSON.stringify([
        'self', 'others', 'environment', 'objective', 'communication'
      ])
    || JSON.stringify(value.decision_signal_policy?.significance)
      !== JSON.stringify(['material', 'critical'])
    || value.max_contributions_per_exchange !== 8
    || value.closed_npc_option_sets !== 'forbidden'
    || value.participant_refs?.eremey !== 'eremey_fisher'
    || value.participant_refs?.ratsha !== 'ratsha_storehouse_helper'
    || !Array.isArray(mappings)
    || mappings.length !== expectedMappings.size
    || mappings.some((mapping) => {
      const expected = expectedMappings.get(mapping.mapping_id);
      const categories = mapping.signal_descriptors
        ?.map(({ category }) => category).join(',');
      const significance = new Set(mapping.signal_descriptors
        ?.map(({ significance }) => significance));
      return expected == null
        || categories !== expected[0][0]
        || significance.size !== 1
        || !significance.has(expected[0][1])
        || mapping.perception_requirement !== expected[1];
    })
    || mappings.some((mapping) => Object.hasOwn(mapping, 'option_set'))) {
    fail('TRACE_M2_CONTENT_INVALID',
      'M2 semantic descriptors must match the approved Phase 3/4 plan.');
  }
  assertMechanicsRefs(value, mappings, fail);
}

function assertMechanicsRefs(value, mappings, fail) {
  const byId = Object.fromEntries(mappings.map(
    (mapping) => [mapping.mapping_id, mapping]
  ));
  const question = byId.trace_ld_v1_phase_3_eremey_question_signal_v1;
  const evidence =
    byId.trace_ld_v1_phase_3_eremey_blue_wool_request_signal_v1;
  const arrival =
    byId.trace_ld_v1_phase_4_group_appears_to_ratsha_signal_v1;
  const invalidated =
    byId.trace_ld_v1_phase_4_ratsha_waiting_invalidated_signal_v1;
  const surrender =
    byId.trace_ld_v1_phase_4_ratsha_promise_surrender_signal_v1;
  const knifeLoss =
    byId.trace_ld_v1_phase_4_ratsha_loses_knife_access_signal_v1;
  const observedKnifeLoss =
    byId.trace_ld_v1_phase_4_observed_ratsha_knife_loss_signal_v1;
  if (question.source_command_id
      !== 'lower_dvina_trace.ask_eremey_about_wreck'
    || question.target_npc_ref !== 'eremey_fisher'
    || question.mechanics_refs?.activity_id
      !== 'trace_ld_v1_activity_first_eremey_talk'
    || question.mechanics_refs?.check_id !== null
    || JSON.stringify(question.mechanics_refs?.statement_template_ids)
      !== JSON.stringify(['trace_ld_v1_statement_eremey_first_answer'])
    || question.mechanics_refs?.knowledge_scope_id
      !== 'trace_ld_v1_knowledge_scope_local_fisher_v1'
    || evidence.source_command_id
      !== 'lower_dvina_trace.show_clue_and_seek_eremey_cooperation'
    || evidence.target_npc_ref !== 'eremey_fisher'
    || evidence.mechanics_refs?.activity_id
      !== 'trace_ld_v1_activity_eremey_with_evidence'
    || evidence.mechanics_refs?.check_id
      !== 'trace_ld_v1_check_eremey_cooperation'
    || JSON.stringify(evidence.mechanics_refs?.statement_template_ids)
      !== JSON.stringify([
        'trace_ld_v1_statement_eremey_first_answer',
        'trace_ld_v1_statement_eremey_disclosure'
      ])
    || evidence.mechanics_refs?.knowledge_scope_id
      !== 'trace_ld_v1_knowledge_scope_local_fisher_v1'
    || arrival.source_activity_id
      !== 'trace_ld_v1_activity_route_to_drying_shed'
    || arrival.source_observation_profile_id
      !== 'trace_ld_v1_observation_onisim_alive_at_drying_shed'
    || arrival.target_npc_ref !== 'ratsha_storehouse_helper'
    || invalidated.source_activity_id
      !== 'trace_ld_v1_activity_route_to_drying_shed'
    || invalidated.applicability
      !== 'current_conversation_objective_invalidated'
    || invalidated.target_npc_ref !== 'ratsha_storehouse_helper'
    || surrender.source_command_id
      !== 'lower_dvina_trace.offer_conditional_protection_and_seek_surrender'
    || surrender.target_npc_ref !== 'ratsha_storehouse_helper'
    || surrender.mechanics_refs?.activity_id
      !== 'trace_ld_v1_activity_ratsha_negotiation'
    || surrender.mechanics_refs?.check_id
      !== 'trace_ld_v1_check_ratsha_surrender_attempt'
    || JSON.stringify(surrender.mechanics_refs?.statement_template_ids)
      !== JSON.stringify(['trace_ld_v1_statement_ratsha_confession'])
    || surrender.mechanics_refs?.knowledge_scope_id
      !== 'trace_ld_v1_knowledge_scope_storehouse_helper_v1'
    || surrender.mechanics_refs?.promise_policy_id
      !== 'trace_ld_v1_promise_no_summary_killing'
    || knifeLoss.source_fact_id
      !== 'ratsha_surrender_without_further_harm_committed'
    || knifeLoss.source_property_transition_id
      !== 'trace_ld_v1_property_ratsha_knife_surrendered_to_participating_fisher'
    || knifeLoss.target_npc_ref !== 'ratsha_storehouse_helper'
    || observedKnifeLoss.source_fact_id
      !== 'ratsha_surrender_without_further_harm_committed'
    || observedKnifeLoss.source_property_transition_id
      !== 'trace_ld_v1_property_ratsha_knife_surrendered_to_participating_fisher'
    || JSON.stringify(observedKnifeLoss.target_npc_refs)
      !== JSON.stringify([
        'eremey_fisher', 'trace_ld_v1_audience_slot_participating_fisher'
      ])
    || observedKnifeLoss.applicability !== 'approved_observer_policy_only'
    || JSON.stringify(value).includes('"option_set"')) {
    fail('TRACE_M2_CONTENT_INVALID',
      'M2 mechanics refs must reuse the exact approved Phase 3/4 IDs.');
  }
}
