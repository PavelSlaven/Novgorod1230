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

export const M4_REQUIRED_ARTIFACTS = Object.freeze([
  ...M3_REQUIRED_ARTIFACTS,
  'combat_semantic_bindings'
]);

export const M5_REQUIRED_ARTIFACTS = Object.freeze([
  ...M4_REQUIRED_ARTIFACTS,
  'phase_9_bindings'
]);

export const M6_REQUIRED_ARTIFACTS = Object.freeze([
  ...M5_REQUIRED_ARTIFACTS,
  'phase_10_bindings'
]);

export const M7_REQUIRED_ARTIFACTS = M6_REQUIRED_ARTIFACTS;

export const M8_REQUIRED_ARTIFACTS = Object.freeze([
  ...M7_REQUIRED_ARTIFACTS,
  'initial_ordinary_container',
  'ordinary_container_contents_profile'
]);

export const M9_REQUIRED_ARTIFACTS = Object.freeze([
  ...M8_REQUIRED_ARTIFACTS,
  'action_production_profile'
]);

export const M10_REQUIRED_ARTIFACTS = Object.freeze([
  ...M9_REQUIRED_ARTIFACTS,
  'local_fire_profile'
]);
export const M11_REQUIRED_ARTIFACTS = Object.freeze([
  ...M10_REQUIRED_ARTIFACTS,
  'spatial_semantic_profile'
]);
export const M12_REQUIRED_ARTIFACTS = M11_REQUIRED_ARTIFACTS;

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
  movement_bindings: ['rus.trace_movement_bindings.v1', 3],
  turn_step_bindings: ['rus.lower_dvina_trace_turn_step_bindings.v1', 2],
  autonomous_semantic_bindings: [
    'rus.lower_dvina_trace_autonomous_semantic_bindings.v1',
    1
  ]
});

export const M4_ARTIFACT_CONTRACT_OVERRIDES = Object.freeze({
  ...M3_ARTIFACT_CONTRACT_OVERRIDES,
  phase_1a_manifest: ['rus.lower_dvina_trace_phase_1a_manifest.v1', 12],
  materialization_bindings: [
    'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1',
    12
  ],
  definition: ['rus.trace_scenario_definition.v1', 16],
  turn_step_bindings: ['rus.lower_dvina_trace_turn_step_bindings.v1', 3],
  combat_semantic_bindings: [
    'rus.lower_dvina_trace_combat_semantic_bindings.v1',
    1
  ]
});

export const M5_ARTIFACT_CONTRACT_OVERRIDES = Object.freeze({
  ...M4_ARTIFACT_CONTRACT_OVERRIDES,
  phase_1a_manifest: ['rus.lower_dvina_trace_phase_1a_manifest.v1', 13],
  materialization_bindings: [
    'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1',
    13
  ],
  definition: ['rus.trace_scenario_definition.v1', 17],
  turn_step_bindings: ['rus.lower_dvina_trace_turn_step_bindings.v1', 4],
  phase_9_bindings: ['rus.lower_dvina_trace_phase_9_bindings.v1', 1]
});

export const M6_ARTIFACT_CONTRACT_OVERRIDES = Object.freeze({
  ...M5_ARTIFACT_CONTRACT_OVERRIDES,
  phase_1a_manifest: ['rus.lower_dvina_trace_phase_1a_manifest.v1', 14],
  materialization_bindings: [
    'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1',
    14
  ],
  definition: ['rus.trace_scenario_definition.v1', 18],
  phase_10_bindings: [
    'rus.lower_dvina_trace_phase_10_bindings.v1',
    1
  ]
});

export const M7_ARTIFACT_CONTRACT_OVERRIDES = Object.freeze({
  ...M6_ARTIFACT_CONTRACT_OVERRIDES,
  phase_1a_manifest: ['rus.lower_dvina_trace_phase_1a_manifest.v1', 15],
  materialization_bindings: [
    'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1',
    15
  ],
  definition: ['rus.trace_scenario_definition.v1', 19],
  player_profile: ['rus.trace_player_profile.v1', 2],
  player_profile_set: ['rus.trace_player_profile_set.v1', 2],
  participant_profile_set: ['rus.trace_participant_profile_set.v1', 2],
  item_container_set: ['rus.trace_item_container_set.v1', 5]
});

export const M8_ARTIFACT_CONTRACT_OVERRIDES = Object.freeze({
  ...M7_ARTIFACT_CONTRACT_OVERRIDES,
  phase_1a_manifest: ['rus.lower_dvina_trace_phase_1a_manifest.v1', 16],
  materialization_bindings: [
    'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1',
    16
  ],
  definition: ['rus.trace_scenario_definition.v1', 20],
  initial_ordinary_container: ['rus.trace_initial_ordinary_container.v1', 1],
  ordinary_container_contents_profile: [
    'rus.lower_dvina_trace_o2b_existing_container_profile.v2',
    2
  ]
});

export const M9_ARTIFACT_CONTRACT_OVERRIDES = Object.freeze({
  ...M8_ARTIFACT_CONTRACT_OVERRIDES,
  phase_1a_manifest: ['rus.lower_dvina_trace_phase_1a_manifest.v1', 17],
  materialization_bindings: [
    'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1', 17
  ],
  definition: ['rus.trace_scenario_definition.v1', 21],
  action_production_profile: [
    'rus.lower_dvina_trace_action_production_profile.v1', 1
  ]
});

export const M10_ARTIFACT_CONTRACT_OVERRIDES = Object.freeze({
  ...M9_ARTIFACT_CONTRACT_OVERRIDES,
  phase_1a_manifest: ['rus.lower_dvina_trace_phase_1a_manifest.v1', 18],
  materialization_bindings: [
    'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1', 18
  ],
  definition: ['rus.trace_scenario_definition.v1', 22],
  local_fire_profile: ['rus.lower_dvina_trace_local_fire_profile.v1', 1]
});
export const M11_ARTIFACT_CONTRACT_OVERRIDES = Object.freeze({
  ...M10_ARTIFACT_CONTRACT_OVERRIDES,
  phase_1a_manifest: ['rus.lower_dvina_trace_phase_1a_manifest.v1', 19],
  materialization_bindings: [
    'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1', 19
  ],
  definition: ['rus.trace_scenario_definition.v1', 23],
  spatial_semantic_profile: [
    'rus.lower_dvina_trace_spatial_semantic_profile.v1', 1
  ]
});
export const M12_ARTIFACT_CONTRACT_OVERRIDES = Object.freeze({
  ...M11_ARTIFACT_CONTRACT_OVERRIDES,
  phase_1a_manifest: ['rus.lower_dvina_trace_phase_1a_manifest.v1', 20],
  materialization_bindings: [
    'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1', 20
  ],
  definition: ['rus.trace_scenario_definition.v1', 24],
  spatial_semantic_profile: [
    'rus.lower_dvina_trace_spatial_semantic_profile.v1', 3
  ]
});
