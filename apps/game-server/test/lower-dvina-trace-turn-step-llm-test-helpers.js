export function request(overrides = {}) {
  return {
    schema: 'turn_step_request_v1',
    request_id: 'turn-request-42',
    root_turn_id: 'turn-42',
    committed_state_version: 17,
    working_revision: 0,
    step_index: 1,
    max_internal_steps: 8,
    root_player_action: 'открываю сундук',
    remaining_intent: 'открыть сундук',
    completed_steps: [],
    actor: { actor_ref: 'actor_mikula' },
    player_safe_state: { visible_entities: [{ entity_ref: 'chest_1' }] },
    ...overrides
  };
}

export function output() {
  return {
    schema: 'turn_step_plan_v1',
    request_id: 'turn-request-42'
  };
}

export function groundedPlan(input, current) {
  return {
    schema: 'turn_step_plan_v1',
    request_id: input.request_id,
    committed_state_version: input.committed_state_version,
    working_revision: input.working_revision,
    step_index: input.step_index,
    interpretation: {
      player_goal: input.root_player_action,
      grounded_attempt: current.groundedAttempt,
      adaptation: current.adaptation
    },
    resolution: 'direct',
    goal_result: 'not_achieved',
    activity: {
      owner: 'semantic',
      duration_class: 'moment',
      effort: current.effort
    },
    operations: [],
    check: null,
    continuation: null,
    clarification: null,
    reason_code: current.reasonCode,
    reason: 'Фактическая попытка не создаёт невозможный результат.'
  };
}

export function worldProcessRequest() {
  return {
    schema: 'world_process_step_request_v1', request_id: 'world-process-42',
    party_state_version: 7, process_state_version: 2,
    process_mode: 'local_exact', process_kind: 'fire',
    process: { process_ref: 'fire:1', scope_ref: 'shore:1',
      causal_basis_ref: 'hearth:1', status: 'active',
      started_at: { whole_minutes: '0', subminute_numerator: '0', subminute_denominator: '1' },
      next_boundary_at: { whole_minutes: '1', subminute_numerator: '0', subminute_denominator: '1' },
      fuel_bindings: [{ fuel_ref: 'wood:1', fuel_class: 'ordinary_solid_fuel_unit' }] },
    current_timestamp: { whole_minutes: '0', subminute_numerator: '0', subminute_denominator: '1' },
    trigger: 'actor_affected', subject_state: { source_refs: ['water:1'] },
    environment_state: { scope_ref: 'shore:1' },
    outcome_contract: [
      { process_outcome: 'no_effect', reason_code: 'affect_no_effect',
        applicability: 'input does not materially change process' },
      { process_outcome: 'continue', reason_code: 'affect_continues_process',
        applicability: 'input changes process without ending it' },
      { process_outcome: 'complete', reason_code: 'affect_completes_process',
        applicability: 'input ends process' }
    ]
  };
}
