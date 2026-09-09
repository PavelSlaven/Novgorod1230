export function request(overrides = {}) {
  return {
    schema: 'turn_step_request_v1', request_id: 'turn-request-42',
    root_turn_id: 'turn-42', committed_state_version: 17, working_revision: 0,
    step_index: 1, max_internal_steps: 8,
    root_player_action: 'открываю сундук и беру меч',
    remaining_intent: 'открыть сундук и взять меч', completed_steps: [],
    actor: { actor_ref: 'actor_mikula', attributes: [{ attribute_ref: 'strength' }],
      skills: [{ skill_ref: 'athletics' }] },
    player_safe_state: { visible_entities: [
      { entity_ref: 'chest_1', kind: 'container' },
      { entity_ref: 'sand_bank', kind: 'environment' },
      { entity_ref: 'npc_1', kind: 'actor' }
    ], positions: [{ location_ref: 'shore' }] },
    ...overrides
  };
}

export function plan(overrides = {}) {
  return {
    schema: 'turn_step_plan_v1', request_id: 'turn-request-42',
    committed_state_version: 17, working_revision: 0, step_index: 1,
    interpretation: { player_goal: 'открыть сундук и взять меч',
      grounded_attempt: 'открыть сундук', adaptation: 'literal' },
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{ op: 'request_container_access', actor_ref: 'actor_mikula',
      container_ref: 'chest_1', access_kind: 'open_and_view' }], check: null,
    continuation: { remaining_intent: 'взять меч, если он окажется внутри',
      depends_on_refs: ['chest_1'] }, clarification: null, direct_result_kind: null,
    reason_code: 'container_contents_not_visible',
    reason: 'содержимое закрытого сундука ещё неизвестно', ...overrides
  };
}

export function directPlan(overrides = {}) {
  return plan({ resolution: 'direct', goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' },
    operations: [], continuation: null, reason_code: 'direct_step',
    reason: 'шаг имеет непосредственный фактический результат', ...overrides });
}

function outcome(overrides = {}) {
  return { goal_result: 'achieved', additional_activity: null, operations: [],
    continuation: null, ...overrides };
}

export function genericPlan(overrides = {}) {
  return directPlan({ resolution: 'generic_check', goal_result: 'pending', check: {
    purpose: 'удалось ли удержаться на ногах', attribute_ref: 'strength',
    skill_ref: 'athletics', difficulty_id: 'risky', outcomes: {
      clean_success: outcome(), success: outcome(),
      success_with_cost: outcome({ additional_activity: { duration_class: 'brief', effort: 'light' } }),
      failure_with_consequence: outcome({ goal_result: 'not_achieved' }),
      severe_failure: outcome({ goal_result: 'not_achieved' })
    }
  }, reason_code: 'generic_uncertainty', reason: 'исход возможной попытки не определён', ...overrides });
}
