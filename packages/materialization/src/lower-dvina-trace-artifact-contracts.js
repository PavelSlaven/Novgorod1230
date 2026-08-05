export const REQUIRED_ARTIFACTS = Object.freeze([
  'phase_1a_manifest',
  'materialization_bindings',
  'definition',
  'player_profile',
  'player_profile_definition',
  'player_profile_set',
  'approved_policy',
  'participant_profile_set',
  'location_topology_set',
  'item_container_set',
  'item_inventory_profiles',
  'hidden_truth_candidate_set',
  'clue_evidence_graph_set',
  'knowledge_lie_memory_rules',
  'activity_check_consequence_profiles',
  'npc_decision_schedule_policies',
  'movement_bindings',
  'location_access_policies',
  'location_capacity_contracts',
  'body_environment_profiles',
  'promise_policy',
  'completion_rules',
  'epilogue_rules',
  'calendar_profile',
  'spatial_manifest'
]);

export const M1_REQUIRED_ARTIFACTS = Object.freeze([
  ...REQUIRED_ARTIFACTS,
  'turn_step_bindings'
]);

export const M2_REQUIRED_ARTIFACTS = Object.freeze([
  ...M1_REQUIRED_ARTIFACTS,
  'conversation_semantic_bindings'
]);

export const M3_REQUIRED_ARTIFACTS = Object.freeze([
  ...M2_REQUIRED_ARTIFACTS,
  'autonomous_semantic_bindings'
]);

export const ARTIFACT_CONTRACTS = Object.freeze({
  phase_1a_manifest: ['rus.lower_dvina_trace_phase_1a_manifest.v1', 3],
  materialization_bindings: ['rus.lower_dvina_trace_phase_1a_materialization_bindings.v1', 3],
  definition: ['rus.trace_scenario_definition.v1', 7],
  player_profile: ['rus.trace_player_profile.v1', 1],
  player_profile_definition: ['rus.trace_scenario_definition.v1', 1],
  player_profile_set: ['rus.trace_player_profile_set.v1', 1],
  approved_policy: ['rus.trace_player_profile_policy.v1', 1],
  participant_profile_set: ['rus.trace_participant_profile_set.v1', 1],
  location_topology_set: ['rus.trace_location_topology_set.v1', 1],
  item_container_set: ['rus.trace_item_container_set.v1', 1],
  item_inventory_profiles: ['rus.item_template_inventory_profiles.v1', 1],
  hidden_truth_candidate_set: ['rus.trace_hidden_truth_candidate_set.v1', 1],
  clue_evidence_graph_set: ['rus.trace_clue_evidence_graph_set.v1', 1],
  knowledge_lie_memory_rules: ['rus.trace_knowledge_lie_memory_rules.v1', 1],
  activity_check_consequence_profiles: ['rus.trace_activity_check_consequence_profiles.v1', 1],
  npc_decision_schedule_policies: ['rus.trace_npc_decision_schedule_policies.v1', 1],
  movement_bindings: ['rus.trace_movement_bindings.v1', 1],
  location_access_policies: ['rus.trace_scene_access_policy_set.v1', 1],
  location_capacity_contracts: ['rus.trace_scene_capacity_contract_set.v1', 1],
  body_environment_profiles: ['rus.trace_body_environment_profiles.v2', 4],
  promise_policy: ['rus.trace_promise_policy.v1', 1],
  completion_rules: ['rus.trace_completion_rules.v1', 1],
  epilogue_rules: ['rus.trace_epilogue_rules.v1', 1],
  calendar_profile: ['rus.time.calendar_projection_profile.v1', 2],
  spatial_manifest: ['rus.spatial-v3.world-base-authoring-bundle.v1', 1]
});

export const PHASE_3_ARTIFACT_CONTRACT_OVERRIDES = Object.freeze({
  phase_1a_manifest: ['rus.lower_dvina_trace_phase_1a_manifest.v1', 4],
  materialization_bindings: ['rus.lower_dvina_trace_phase_1a_materialization_bindings.v1', 4],
  definition: ['rus.trace_scenario_definition.v1', 8],
  knowledge_lie_memory_rules: ['rus.trace_knowledge_lie_memory_rules.v1', 2],
  activity_check_consequence_profiles: ['rus.trace_activity_check_consequence_profiles.v1', 2],
  npc_decision_schedule_policies: ['rus.trace_npc_decision_schedule_policies.v1', 2]
});

export const PHASE_3_PICKUP_ARTIFACT_CONTRACT_OVERRIDES = Object.freeze({
  ...PHASE_3_ARTIFACT_CONTRACT_OVERRIDES,
  phase_1a_manifest: ['rus.lower_dvina_trace_phase_1a_manifest.v1', 5],
  materialization_bindings: [
    'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1',
    5
  ],
  definition: ['rus.trace_scenario_definition.v1', 9],
  item_container_set: ['rus.trace_item_container_set.v1', 2]
});

export const PHASE_4_ARTIFACT_CONTRACT_OVERRIDES = Object.freeze({
  ...PHASE_3_PICKUP_ARTIFACT_CONTRACT_OVERRIDES,
  phase_1a_manifest: ['rus.lower_dvina_trace_phase_1a_manifest.v1', 6],
  materialization_bindings: ['rus.lower_dvina_trace_phase_1a_materialization_bindings.v1', 6],
  definition: ['rus.trace_scenario_definition.v1', 10],
  npc_decision_schedule_policies: ['rus.trace_npc_decision_schedule_policies.v1', 3]
});

export const PHASE_5_ARTIFACT_CONTRACT_OVERRIDES = Object.freeze({
  ...PHASE_4_ARTIFACT_CONTRACT_OVERRIDES,
  phase_1a_manifest: ['rus.lower_dvina_trace_phase_1a_manifest.v1', 7],
  materialization_bindings: [
    'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1',
    7
  ],
  definition: ['rus.trace_scenario_definition.v1', 11],
  item_container_set: ['rus.trace_item_container_set.v1', 3],
  activity_check_consequence_profiles: [
    'rus.trace_activity_check_consequence_profiles.v1',
    3
  ],
  npc_decision_schedule_policies: [
    'rus.trace_npc_decision_schedule_policies.v1',
    4
  ],
  body_environment_profiles: ['rus.trace_body_environment_profiles.v2', 5]
});

export const PHASE_6_ARTIFACT_CONTRACT_OVERRIDES = Object.freeze({
  ...PHASE_5_ARTIFACT_CONTRACT_OVERRIDES,
  phase_1a_manifest: ['rus.lower_dvina_trace_phase_1a_manifest.v1', 8],
  materialization_bindings: [
    'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1',
    8
  ],
  definition: ['rus.trace_scenario_definition.v1', 12],
  item_container_set: ['rus.trace_item_container_set.v1', 4],
  activity_check_consequence_profiles: [
    'rus.trace_activity_check_consequence_profiles.v1',
    4
  ],
  movement_bindings: ['rus.trace_movement_bindings.v1', 2],
  body_environment_profiles: ['rus.trace_body_environment_profiles.v2', 6]
});

export const M1_ARTIFACT_CONTRACT_OVERRIDES = Object.freeze({
  ...PHASE_6_ARTIFACT_CONTRACT_OVERRIDES,
  phase_1a_manifest: ['rus.lower_dvina_trace_phase_1a_manifest.v1', 9],
  materialization_bindings: [
    'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1',
    9
  ],
  definition: ['rus.trace_scenario_definition.v1', 13],
  turn_step_bindings: ['rus.lower_dvina_trace_turn_step_bindings.v1', 1]
});

export const M2_ARTIFACT_CONTRACT_OVERRIDES = Object.freeze({
  ...M1_ARTIFACT_CONTRACT_OVERRIDES,
  phase_1a_manifest: ['rus.lower_dvina_trace_phase_1a_manifest.v1', 10],
  materialization_bindings: [
    'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1',
    10
  ],
  definition: ['rus.trace_scenario_definition.v1', 14],
  conversation_semantic_bindings: [
    'rus.lower_dvina_trace_conversation_semantic_bindings.v1',
    1
  ]
});

export const M3_ARTIFACT_CONTRACT_OVERRIDES = Object.freeze({
  ...M2_ARTIFACT_CONTRACT_OVERRIDES,
  phase_1a_manifest: ['rus.lower_dvina_trace_phase_1a_manifest.v1', 11],
  materialization_bindings: [
    'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1',
    11
  ],
  definition: ['rus.trace_scenario_definition.v1', 15],
  activity_check_consequence_profiles: [
    'rus.trace_activity_check_consequence_profiles.v1',
    3
  ],
  body_environment_profiles: ['rus.trace_body_environment_profiles.v2', 5],
  movement_bindings: ['rus.trace_movement_bindings.v1', 3],
  turn_step_bindings: ['rus.lower_dvina_trace_turn_step_bindings.v1', 2],
  autonomous_semantic_bindings: [
    'rus.lower_dvina_trace_autonomous_semantic_bindings.v1',
    1
  ]
});
