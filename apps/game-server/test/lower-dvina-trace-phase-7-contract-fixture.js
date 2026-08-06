const digest = 'a'.repeat(64);

export function approvedPhase7Contracts(state) {
  const zhdanko = state.npcs.find(
    ({ participant_slot_ref: slot }) =>
      slot === 'zhdanko_storehouse_controller'
  );
  const wait = execution('wait', 'trace_ld_v1_activity_zhdanko_wait');
  const move = execution('move_bag',
    'trace_ld_v1_activity_zhdanko_move_bag');
  return {
    autonomous: {
      target_npc_ref: 'zhdanko_storehouse_controller',
      signal_descriptor: { category: 'objective', significance: 'material' },
      available_resource_refs: ['trace_ld_v1_container_road_bag'],
      known_route_refs: [
        'trace_ld_v1_local_transition_storehouse_to_river_access'
      ]
    },
    restActivity: {
      profile_id: 'trace_ld_v1_activity_fire_rest', version: 1,
      duration_minutes: 30
    },
    waitActivity: {
      profile_id: 'trace_ld_v1_activity_zhdanko_wait', version: 1
    },
    bodyEffect: {
      effect_profile_id: 'trace_ld_v1_body_fire_rest_30m',
      elapsed_minutes: 30,
      exact_deltas: { health: 0, energy: 2, satiety: -1 },
      selection_policy: 'fixed_approved_effect',
      rng_consumption: 'forbidden',
      condition_outcomes: [
        outcome('trace_ld_v1_condition_wet_clothing', 'wet', 'damp',
          'clothing_partially_dried'),
        outcome('trace_ld_v1_condition_cold_shivering', 'strong_shivering',
          'mild_shivering', 'shivering_reduced'),
        outcome('trace_ld_v1_condition_headache', 'headache', 'headache',
          'headache_persists'),
        outcome('trace_ld_v1_condition_shoulder_bruise', 'shoulder_bruise',
          'shoulder_bruise', 'shoulder_bruise_persists')
      ]
    },
    npcPolicy: {
      goals: ['protect_storehouse_property'],
      fears: ['loss_of_property'],
      relations_and_obligations: ['responsible_for_storehouse']
    },
    schedulePolicy: {
      schedule_policy_id: 'trace_ld_v1_zhdanko_autonomous_schedule',
      version: 1
    },
    roadBag: { item_ref: 'trace_ld_v1_container_road_bag' },
    bagTransition: bagTransition(),
    localTransition: localTransition(move),
    bagConcealTransition: bagConcealTransition(),
    scheduleExecutions: { wait, moveBag: move },
    scheduleActivityProfiles: [
      activityProfile(wait.activity_profile_ref, 'autonomous_wait', []),
      activityProfile(move.activity_profile_ref,
        'autonomous_local_property_transfer',
        ['trace_ld_v1_container_road_bag'])
    ],
    semanticActivityProfiles: [{
      profile_ref: 'trace_ld_v1_semantic_activity:moment:none',
      profile_pin: {
        artifact_id: 'trace_ld_v1_turn_step_owner_profiles',
        revision: 1,
        digest
      },
      body_effect_profile_ref:
        'trace_ld_v1_semantic_activity:body:moment:none',
      duration_class: 'moment', duration_minutes: 1, effort: 'none',
      exact_deltas: { health: 0, satiety: 0, energy: 0 },
      condition_outcomes: []
    }],
    zhdanko,
    waitingBoundary: { elapsed_minutes: 25 },
    campLocationRef: 'trace_ld_v1_loc_fishing_camp',
    activityPin: { id: 'trace_ld_v1_activity_fire_rest', version: 1,
      digest }
  };
}

export function phase7ItemPlan(request) {
  return {
    schema: 'npc_step_plan_v1',
    request_id: request.request_id,
    root_turn_id: request.root_turn_id,
    boundary_id: request.boundary_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    decision_index: request.decision_index,
    npc_ref: request.npc_ref,
    interpretation: {
      npc_goal: 'скрыть имущество',
      grounded_attempt: 'спрятать дорожную сумку в клети',
      adaptation: 'literal'
    },
    resolution: 'domain_request',
    goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{
      op: 'request_item_use', actor_ref: request.npc_ref,
      item_ref: 'trace_ld_v1_container_road_bag', use_kind: 'operate',
      target_refs: ['storehouse_inside']
    }],
    check: null,
    reason_code: 'protect_property',
    reason: 'Ратша не вернулся к ожидаемому сроку.'
  };
}

export function phase7AutonomousPlan(request, option) {
  const move = option === 'move_bag';
  return {
    schema: 'npc_step_plan_v1',
    request_id: request.request_id,
    root_turn_id: request.root_turn_id,
    boundary_id: request.boundary_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    decision_index: request.decision_index,
    npc_ref: request.npc_ref,
    interpretation: {
      npc_goal: move ? 'подготовить имущество' : 'продолжить ожидание',
      grounded_attempt: move ? 'перенести сумку' : 'ждать ещё пять минут',
      adaptation: 'literal'
    },
    resolution: 'domain_request',
    goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{
      op: 'request_activity',
      actor_ref: request.npc_ref,
      activity_kind: move ? 'carry' : 'wait',
      target_refs: move ? [
        'trace_ld_v1_container_road_bag', 'river_access'
      ] : [],
      description: move
        ? 'Перенести дорожную сумку к речному выходу.' : 'Ждать ещё.'
    }],
    check: null,
    reason_code: move ? 'prepare_departure' : 'continue_waiting',
    reason: 'Ратша не вернулся к ожидаемому сроку.'
  };
}

export function phase7DirectPlan(request) {
  return {
    schema: 'npc_step_plan_v1',
    request_id: request.request_id,
    root_turn_id: request.root_turn_id,
    boundary_id: request.boundary_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    decision_index: request.decision_index,
    npc_ref: request.npc_ref,
    interpretation: {
      npc_goal: 'проверить, не слышно ли возвращения',
      grounded_attempt: 'остаться на месте и прислушаться',
      adaptation: 'literal'
    },
    resolution: 'direct',
    goal_result: 'not_achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    operations: [],
    check: null,
    reason_code: 'listen_for_return',
    reason: 'Жданко не услышал признаков возвращения Ратши.'
  };
}

function bagTransition() {
  return {
    transition_profile_id: 'trace_ld_v1_property_bag_to_river_access',
    schema: 'rus.items_property.approved_transition_profile.v1', version: 1,
    subject_ref: 'trace_ld_v1_container_road_bag',
    requires: {
      location_ref: 'trace_ld_v1_loc_storehouse',
      zone_ref: 'storehouse_inside',
      holder_ref: 'zhdanko_storehouse_controller',
      controller_ref: 'zhdanko_storehouse_controller'
    },
    writes: {
      location_ref: 'trace_ld_v1_loc_storehouse', zone_ref: 'river_access',
      holder_ref: 'zhdanko_storehouse_controller',
      controller_ref: 'zhdanko_storehouse_controller'
    },
    owner_change: 'forbidden',
    contained_item_effect:
      'inherit_parent_container_position_holder_and_controller'
  };
}

function localTransition(move) {
  return {
    transition_id: 'trace_ld_v1_local_transition_storehouse_to_river_access',
    schema: 'rus.trace_local_zone_transition.v1', version: 1,
    location_ref: 'trace_ld_v1_loc_storehouse',
    source_zone_candidates: ['storehouse_inside'],
    destination_zone_ref: 'river_access',
    admitted_subject_classes: ['actor', 'container'], duration_minutes: 5,
    elapsed_accounting: { parent_execution_roles: {
      [move.execution_binding_id]: {
        role: 'root_interval', clock_write: 'single'
      }
    } },
    terminal_outcome: 'same_materialized_location_new_zone'
  };
}

function bagConcealTransition() {
  return {
    transition_profile_id:
      'trace_ld_v1_property_bag_concealed_in_storehouse',
    schema: 'rus.items_property.approved_transition_profile.v1', version: 1,
    subject_ref: 'trace_ld_v1_container_road_bag',
    requires: {
      location_ref: 'trace_ld_v1_loc_storehouse',
      zone_ref: 'storehouse_inside',
      holder_ref: 'zhdanko_storehouse_controller',
      controller_ref: 'zhdanko_storehouse_controller'
    },
    writes: {
      location_ref: 'trace_ld_v1_loc_storehouse',
      zone_ref: 'storehouse_inside',
      visibility_state: 'concealed_requires_search'
    },
    owner_change: 'forbidden',
    contained_item_effect:
      'inherit_parent_container_position_holder_controller_and_visibility',
    write_targets: ['item_visibility_state', 'property_history']
  };
}

function execution(option, activity, minutes = 5) {
  return {
    execution_binding_id: `trace_ld_v1_schedule_execution_${option}`,
    schedule_option_id: option,
    activity_profile_ref: activity,
    time_profile_ref: `trace_ld_v1_time_${minutes}m`,
    movement_ref: option === 'move_bag'
      ? 'trace_ld_v1_local_transition_storehouse_to_river_access' : null,
    property_transition_refs: option === 'move_bag'
      ? ['trace_ld_v1_property_bag_to_river_access'] : [],
    elapsed_plan: { stages: [{ duration_minutes: minutes }] }
  };
}

function activityProfile(profileId, activityType, resourceRefs) {
  return {
    profile_id: profileId,
    activity_type: activityType,
    resource_refs: resourceRefs
  };
}

function outcome(conditionProfileRef, from, to, outcomeCode) {
  return { condition_profile_ref: conditionProfileRef, from, to,
    outcome: outcomeCode };
}
