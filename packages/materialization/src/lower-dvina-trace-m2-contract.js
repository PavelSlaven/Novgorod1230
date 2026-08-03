import { assertLowerDvinaTracePhase5InitialBindings } from
  './lower-dvina-trace-phase-5-contract.js';
import { canonicalDigest } from './core.js';

const SCENARIO_ID = 'lower_dvina_trace_v1';
const M1_DEFINITION_DIGEST =
  'cef9ad459b2ceb3f3d4edbe93926332cb22782d03e30622d74301f21aba025ef';
const M2_DEFINITION_DIGEST =
  'e5a3a6d937458dbefa651b0d7eae4c526df6f4e10f406657c7c4ee3d01cb437f';
const M2_CONTENT_MANIFEST_DIGEST =
  '524419db0d21b1885e6036e1b00435a5e10866321bfe60ffba064c0798b5881c';
const PHASE_1A_V9_MANIFEST_DIGEST =
  'fd4d6cbc5dfdef71b16e8277fdfbd9b88f03d5d0c8c40218a25b89e361858ea0';
const PHASE_1A_V9_BINDINGS_DIGEST =
  '3449ae2336d896aa8c633f666351e58f67c86bbd12bf5a8bdb9f25640387d74b';
const PHASE_1A_V10_MANIFEST_DIGEST =
  '34f4c5b683ac3035df5d4176bfa273f08ac7ba269570b886271caac75f07ebe5';
const PHASE_1A_V10_BINDINGS_DIGEST =
  '6e5a025f918124bb557fff6d261539afbeccd3e0ab04404111d3bbbe1c545854';
const SEMANTIC_BINDINGS_DIGEST =
  'f8483ced332cf000c81a7bc432b331762cca3c0a5b3e906628b924b8d71742c0';

export function assertLowerDvinaTraceM2Cutover(bundle, fail) {
  const manifest = bundle.phase_1a_manifest;
  const bindings = bundle.materialization_bindings;
  const definition = bundle.definition;
  const semantic = bundle.conversation_semantic_bindings;
  const inventory = bindings?.sealed_selection_inventory;
  const pins = bundle.artifact_pins;
  const previousBindingRef = {
    path: 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v9/materialization-bindings.json',
    id: 'lower_dvina_trace_phase_1a_materialization_bindings_v9',
    revision: 9,
    schema: 'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1',
    digest: PHASE_1A_V9_BINDINGS_DIGEST
  };

  if (pins?.phase_1a_manifest?.path
      !== 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v10/manifest.json'
    || pins.phase_1a_manifest.digest !== PHASE_1A_V10_MANIFEST_DIGEST
    || pins.materialization_bindings?.path
      !== 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v10/materialization-bindings.json'
    || pins.materialization_bindings.digest
      !== PHASE_1A_V10_BINDINGS_DIGEST
    || pins.definition?.path
      !== 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m2-content/definition.json'
    || pins.definition.digest !== M2_DEFINITION_DIGEST
    || pins.conversation_semantic_bindings?.path
      !== 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m2-content/conversation-semantic-bindings.json'
    || pins.conversation_semantic_bindings.digest
      !== SEMANTIC_BINDINGS_DIGEST
    || bundle.m2_content_manifest_digest !== M2_CONTENT_MANIFEST_DIGEST
    || manifest?.package_id !== 'lower_dvina_trace_phase_1a_v10'
    || manifest.revision !== 10
    || manifest.status !== 'approved'
    || manifest.scenario_id !== SCENARIO_ID
    || manifest.scenario_definition_revision !== 14
    || manifest.fallback_policy !== 'forbidden'
    || !exactRef(manifest.superseded_package_ref, {
      path: 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v9/manifest.json',
      id: 'lower_dvina_trace_phase_1a_v9',
      revision: 9,
      schema: 'rus.lower_dvina_trace_phase_1a_manifest.v1',
      digest: PHASE_1A_V9_MANIFEST_DIGEST
    })
    || !exactRef(manifest.base_definition_ref, {
      path: 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m2-content/manifest.json',
      package_id: 'lower_dvina_trace_m2_content_v1',
      revision: 1,
      schema: 'rus.lower_dvina_trace_m2_content_manifest.v1',
      digest: M2_CONTENT_MANIFEST_DIGEST
    })
    || !exactRef(manifest.content_refs?.materialization_bindings, {
      path: 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v10/materialization-bindings.json',
      id: 'lower_dvina_trace_phase_1a_materialization_bindings_v10',
      revision: 10,
      schema: 'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1',
      digest: PHASE_1A_V10_BINDINGS_DIGEST
    })
    || bindings?.binding_set_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v10'
    || bindings.revision !== 10
    || bindings.status !== 'approved'
    || bindings.scenario_id !== SCENARIO_ID
    || bindings.scenario_definition_revision !== 14
    || !exactRef(bindings.superseded_binding_ref, previousBindingRef)
    || !exactRef(bindings.reused_immutable_binding_ref, previousBindingRef)
    || bindings.binding_resolution_policy
      !== 'reuse_exact_superseded_initial_materialization_bindings_or_fail_closed'
    || bindings.fallback_policy !== 'forbidden'
    || bindings.normalization_policy !== 'forbidden'
    || Object.keys(bindings.binding_overrides ?? {}).length !== 0
    || bindings.sealed_selection_inventory_ref?.path
      !== previousBindingRef.path
    || bindings.sealed_selection_inventory_ref.id
      !== 'lower_dvina_trace_phase_1a_sealed_selection_inventory_v9'
    || bindings.sealed_selection_inventory_ref.digest
      !== PHASE_1A_V9_BINDINGS_DIGEST
    || definition?.scenario_id !== SCENARIO_ID
    || definition.revision !== 14
    || !exactRef(definition.supersedes_definition_ref, {
      path: 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m1-content/definition.json',
      id: SCENARIO_ID,
      revision: 13,
      digest: M1_DEFINITION_DIGEST
    })
    || !exactRef(definition.resolved_policy_refs
      ?.conversation_semantic_bindings, {
      owner: '@rus/turn',
      schema: 'rus.lower_dvina_trace_conversation_semantic_bindings.v1',
      id: 'lower_dvina_trace_conversation_semantic_bindings_v1',
      revision: 1,
      digest: SEMANTIC_BINDINGS_DIGEST
    })
    || inventory?.inventory_id
      !== 'lower_dvina_trace_phase_1a_sealed_selection_inventory_v8'
    || inventory.source_artifact_digests
      ?.activity_check_consequence_profiles
      !== pins.activity_check_consequence_profiles.digest
    || inventory.source_artifact_digests?.movement_bindings
      !== pins.movement_bindings.digest
    || inventory.source_artifact_digests?.body_environment_profiles
      !== pins.body_environment_profiles.digest
    || inventory.source_artifact_digests?.item_container_set
      !== pins.item_container_set.digest
    || bindings.phase_4_initial_state_binding?.onisim_injury_rope_binding
      ?.inventory_profile_ref
      !== 'trace_ld_v1_inventory_profile_ratsha_binding_rope'
    || !exactM1MechanicPins(bundle)
    || !exactSemanticBindings(semantic, pins)) {
    fail('TRACE_M2_CUTOVER_IDENTITY_INVALID',
      'M2 must exact-supersede M1 and reuse the immutable revision 13 mechanics.');
  }
  assertLowerDvinaTracePhase5InitialBindings(bundle, fail, {
    waterProfileRef:
      'trace_ld_v1_inventory_profile_eremey_drinking_water_vessel'
  });
}

function exactM1MechanicPins(bundle) {
  const definition = bundle.definition;
  const pins = bundle.artifact_pins;
  const turnSteps = bundle.turn_step_bindings;
  const ownerProfiles = bundle.turn_step_owner_profiles;
  const immutableKeys = [
    'player_profile_set',
    'participant_profile_set',
    'location_topology_set',
    'item_container_set',
    'hidden_truth_candidate_set',
    'clue_evidence_graph_set',
    'knowledge_lie_memory_rules'
  ];
  const policyKeys = [
    'activity_check_consequence_profiles',
    'npc_decision_schedule_policies',
    'movement_bindings',
    'location_access_policies',
    'location_capacity_contracts',
    'body_environment_profiles',
    'promise_policy',
    'completion_rules',
    'epilogue_rules',
    'turn_step_bindings',
    'turn_step_owner_profiles'
  ];
  return immutableKeys.every((key) =>
    definition.immutable_content_refs?.[key]?.digest === pins[key]?.digest
  )
    && policyKeys.every((key) =>
      definition.resolved_policy_refs?.[key]?.digest === pins[key]?.digest
    )
    && pins.turn_step_bindings?.path
      === 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m1-content/turn-step-bindings.json'
    && pins.turn_step_bindings.digest
      === '83cf0f13fd4d4bdb3381ca86a4fe465bcd8734485a7e80df01a1d8a116610a2a'
    && pins.turn_step_owner_profiles?.path
      === 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m1-content/turn-step-owner-profiles.json'
    && pins.turn_step_owner_profiles.digest
      === '585409afc0b363ac47f98afdc5690067e645fffd63500587241fcce0d7ea5823'
    && canonicalDigest(ownerProfiles)
      === pins.turn_step_owner_profiles.canonical_digest
    && turnSteps?.binding_set_id
      === 'lower_dvina_trace_turn_step_bindings_v1'
    && turnSteps.revision === 1
    && turnSteps.status === 'approved'
    && turnSteps.scenario_definition_revision === 13
    && turnSteps.semantic_contract === 'turn_step_plan_v1'
    && turnSteps.max_internal_steps === 8
    && turnSteps.exact_fast_path === 'preserved'
    && turnSteps.legacy_bounded_fallback === 'forbidden'
    && turnSteps.fallback_policy === 'forbidden'
    && ownerProfiles?.profile_set_id
      === 'trace_ld_v1_turn_step_owner_profiles'
    && ownerProfiles.revision === 1
    && ownerProfiles.status === 'approved'
    && ownerProfiles.fallback_policy === 'forbidden';
}

function exactSemanticBindings(value, pins) {
  const mappings = value?.signal_mappings;
  if (value?.schema
      !== 'rus.lower_dvina_trace_conversation_semantic_bindings.v1'
    || value.binding_set_id
      !== 'lower_dvina_trace_conversation_semantic_bindings_v1'
    || value.revision !== 1
    || value.status !== 'approved'
    || value.scenario_id !== SCENARIO_ID
    || value.scenario_definition_revision !== 14
    || value.fallback_policy !== 'forbidden'
    || value.legacy_bounded_production_path !== 'forbidden'
    || JSON.stringify(value.contract_refs) !== JSON.stringify([
      'npc_decision_signal_v1',
      'npc_decision_boundary_v1',
      'player_conversation_contribution_plan_v1',
      'conversation_contribution_plan_v1'
    ])
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
    || pins.conversation_semantic_bindings?.digest
      !== SEMANTIC_BINDINGS_DIGEST
    || !Array.isArray(mappings)
    || mappings.length !== 7
    || JSON.stringify(value).includes('"option_set"')) {
    return false;
  }
  const byId = Object.fromEntries(mappings.map(
    (mapping) => [mapping.mapping_id, mapping]
  ));
  return exactSignal(
    byId.trace_ld_v1_phase_3_eremey_question_signal_v1,
    ['communication'], 'material', 'perception_required'
  )
    && exactSignal(
      byId.trace_ld_v1_phase_3_eremey_blue_wool_request_signal_v1,
      ['environment', 'communication'], 'material', 'perception_required'
    )
    && exactSignal(
      byId.trace_ld_v1_phase_4_group_appears_to_ratsha_signal_v1,
      ['others'], 'material', 'perception_required'
    )
    && exactSignal(
      byId.trace_ld_v1_phase_4_ratsha_waiting_invalidated_signal_v1,
      ['objective'], 'material', 'perception_not_required'
    )
    && exactSignal(
      byId.trace_ld_v1_phase_4_ratsha_promise_surrender_signal_v1,
      ['communication'], 'material', 'perception_required'
    )
    && exactSignal(
      byId.trace_ld_v1_phase_4_ratsha_loses_knife_access_signal_v1,
      ['self'], 'material', 'perception_not_required'
    )
    && exactSignal(
      byId.trace_ld_v1_phase_4_observed_ratsha_knife_loss_signal_v1,
      ['others'], 'material', 'perception_required'
    )
    && exactSemanticMechanicRefs(byId);
}

function exactSemanticMechanicRefs(byId) {
  const question = byId.trace_ld_v1_phase_3_eremey_question_signal_v1;
  const evidence =
    byId.trace_ld_v1_phase_3_eremey_blue_wool_request_signal_v1;
  const arrival =
    byId.trace_ld_v1_phase_4_group_appears_to_ratsha_signal_v1;
  const invalidated =
    byId.trace_ld_v1_phase_4_ratsha_waiting_invalidated_signal_v1;
  const surrender =
    byId.trace_ld_v1_phase_4_ratsha_promise_surrender_signal_v1;
  const knife =
    byId.trace_ld_v1_phase_4_ratsha_loses_knife_access_signal_v1;
  const observed =
    byId.trace_ld_v1_phase_4_observed_ratsha_knife_loss_signal_v1;
  return question?.source_command_id
      === 'lower_dvina_trace.ask_eremey_about_wreck'
    && question.target_npc_ref === 'eremey_fisher'
    && question.mechanics_refs?.activity_id
      === 'trace_ld_v1_activity_first_eremey_talk'
    && question.mechanics_refs.check_id === null
    && JSON.stringify(question.mechanics_refs.statement_template_ids)
      === JSON.stringify(['trace_ld_v1_statement_eremey_first_answer'])
    && question.mechanics_refs.knowledge_scope_id
      === 'trace_ld_v1_knowledge_scope_local_fisher_v1'
    && evidence?.source_command_id
      === 'lower_dvina_trace.show_clue_and_seek_eremey_cooperation'
    && evidence.target_npc_ref === 'eremey_fisher'
    && evidence.mechanics_refs?.activity_id
      === 'trace_ld_v1_activity_eremey_with_evidence'
    && evidence.mechanics_refs.check_id
      === 'trace_ld_v1_check_eremey_cooperation'
    && JSON.stringify(evidence.mechanics_refs.statement_template_ids)
      === JSON.stringify([
        'trace_ld_v1_statement_eremey_first_answer',
        'trace_ld_v1_statement_eremey_disclosure'
      ])
    && evidence.mechanics_refs.knowledge_scope_id
      === 'trace_ld_v1_knowledge_scope_local_fisher_v1'
    && arrival?.source_activity_id
      === 'trace_ld_v1_activity_route_to_drying_shed'
    && arrival.source_boundary === 'terminal_position_committed'
    && arrival.source_observation_profile_id
      === 'trace_ld_v1_observation_onisim_alive_at_drying_shed'
    && arrival.target_npc_ref === 'ratsha_storehouse_helper'
    && invalidated?.source_activity_id
      === 'trace_ld_v1_activity_route_to_drying_shed'
    && invalidated.source_boundary === 'terminal_position_committed'
    && invalidated.applicability
      === 'current_conversation_objective_invalidated'
    && invalidated.target_npc_ref === 'ratsha_storehouse_helper'
    && surrender?.source_command_id
      === 'lower_dvina_trace.offer_conditional_protection_and_seek_surrender'
    && surrender.target_npc_ref === 'ratsha_storehouse_helper'
    && surrender.mechanics_refs?.activity_id
      === 'trace_ld_v1_activity_ratsha_negotiation'
    && surrender.mechanics_refs.check_id
      === 'trace_ld_v1_check_ratsha_surrender_attempt'
    && JSON.stringify(surrender.mechanics_refs.statement_template_ids)
      === JSON.stringify(['trace_ld_v1_statement_ratsha_confession'])
    && surrender.mechanics_refs.knowledge_scope_id
      === 'trace_ld_v1_knowledge_scope_storehouse_helper_v1'
    && surrender.mechanics_refs.promise_policy_id
      === 'trace_ld_v1_promise_no_summary_killing'
    && exactKnifeTransition(knife)
    && knife.target_npc_ref === 'ratsha_storehouse_helper'
    && exactKnifeTransition(observed)
    && JSON.stringify(observed.target_npc_refs) === JSON.stringify([
      'eremey_fisher', 'trace_ld_v1_audience_slot_participating_fisher'
    ])
    && observed.applicability === 'approved_observer_policy_only';
}

function exactSignal(mapping, categories, significance, perception) {
  return mapping != null
    && mapping.perception_requirement === perception
    && JSON.stringify(mapping.signal_descriptors) === JSON.stringify(
      categories.map((category) => ({ category, significance }))
    );
}

function exactKnifeTransition(mapping) {
  return mapping?.source_fact_id
      === 'ratsha_surrender_without_further_harm_committed'
    && mapping.source_property_transition_id
      === 'trace_ld_v1_property_ratsha_knife_surrendered_to_participating_fisher';
}

function exactRef(actual, expected) {
  return Object.entries(expected)
    .every(([key, value]) => actual?.[key] === value);
}
