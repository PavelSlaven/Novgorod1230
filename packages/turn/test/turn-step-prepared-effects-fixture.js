import { createTurnStepExecutionRegistry } from '../src/turn-step-loop.js';

export function preparedRegistry({
  extraDomain = {},
  extraDirect = {},
  counters = null,
  semanticDuration = 1,
  semanticBoundary = true
} = {}) {
  return createTurnStepExecutionRegistry({
    direct: extraDirect,
    domain: {
      request_movement: async ({ plan,
        working_projection: projection }) => {
        increment(counters, 'routeHandler');
        return {
          working_projection: {
            ...projection, position: 'camp', clock: at(8)
          },
          summary: 'route',
          write_fragments: [],
          prepared_effect: effect({
            step: plan.step_index,
            kind: 'domain_command',
            owner: 'route_owner',
            operation: 'request_movement',
            availability: available(),
            duration: 8,
            before: 0,
            after: 8
          })
        };
      },
      ...extraDomain
    },
    applySemanticActivity: async ({ plan,
      working_projection: projection }) => {
      increment(counters, 'semanticActivityHandler');
      const before = Number(projection.clock.whole_minutes);
      return {
        working_projection: {
          ...projection, clock: at(before + semanticDuration)
        },
        summary: 'direct activity',
        write_fragments: [],
        consequence_fragment: { duration_minutes: semanticDuration },
        player_response_boundary: semanticBoundary,
        prepared_effect: effect({
          step: plan.step_index,
          kind: 'semantic_activity',
          owner: 'moment_none',
          operation: 'activity:2',
          availability: null,
          duration: semanticDuration,
          before,
          after: before + semanticDuration
        })
      };
    }
  });
}

export function effect({ step, kind, owner, operation, availability, duration,
  before, after }) {
  return {
    step_index: step,
    effect_kind: kind,
    owner_ref: owner,
    operation_ref: operation,
    availability,
    consequence: { duration_minutes: duration },
    time_update: {
      version: 2,
      schema: 'turn_time_update',
      owner: '@rus/time-events-history',
      clock_before: at(before),
      clock_after: at(after),
      exact_elapsed: minutes(duration),
      nearest_boundary: null
    },
    body_update: {
      version: 1,
      schema: 'turn_body_update',
      owner: '@rus/body-state',
      applied: false,
      proposal: null,
      state_after: body()
    },
    body_state_before: body()
  };
}

export function input() {
  return {
    requestId: 'request-1',
    rootTurnId: 'turn-1',
    committedStateVersion: 7,
    rootPlayerAction: 'идти к стану и осмотреться',
    actor: { actor_id: 'actor-1' },
    initialWorkingProjection: {
      actor_id: 'actor-1', position: 'shore', destination_refs: ['camp'],
      clock: at(0),
      visible_entities: [
        { entity_ref: 'fire-1', kind: 'local_world_process' },
        { entity_ref: 'fuel-1', kind: 'item' }
      ]
    },
    maxInternalSteps: 8
  };
}

export function ports(overrides) {
  return {
    projectPlayerSafeState: async ({ working_projection: value }) =>
      structuredClone(value),
    revalidateCommittedState: async () => ({ state_version: 7 }),
    ...overrides
  };
}

export function routePlan(request) {
  return plan(request, {
    resolution: 'domain_request',
    goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{ op: 'request_movement', actor_ref: 'actor-1',
      movement_kind: 'local', target_ref: 'camp' }],
    continuation: { remaining_intent: 'осмотреться', depends_on_refs: ['camp'] }
  });
}

export function followup() {
  return { op: 'request_movement', actor_ref: 'actor-1',
    movement_kind: 'local', target_ref: 'camp' };
}

export function preparedFollowupOperation() {
  return {
    op: 'request_world_process', actor_ref: 'actor-1', process_action: 'affect',
    process_ref: 'fire-1', process_kind: 'fire', source_refs: ['fuel-1'],
    target_refs: [], description: 'положить топливо в огонь'
  };
}

export function directPlan(request, overrides = {}) {
  return plan(request, {
    resolution: 'direct',
    goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    ...overrides
  });
}

export function directOperationPlan(request) {
  return directPlan(request, {
    operations: [{ op: 'move_entity', entity_ref: 'camp',
      placement: { relation: 'held_by', target_ref: 'actor-1' } }]
  });
}

export function clarificationPlan(request) {
  return plan(request, {
    resolution: 'clarification_required',
    goal_result: 'pending',
    operations: [],
    clarification: {
      question: 'Где именно осматриваться?', target_refs: ['camp']
    }
  });
}

export function secondDomainPlan(request) {
  return plan(request, {
    resolution: 'domain_request',
    goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{ op: 'request_activity', actor_ref: 'actor-1',
      activity_kind: 'wait', target_refs: [], description: 'ждать' }]
  });
}

export function worldProcessPlan(request) {
  return plan(request, {
    resolution: 'domain_request',
    goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{
      op: 'request_world_process',
      actor_ref: 'actor-1',
      process_action: 'affect',
      process_ref: 'fire-1',
      process_kind: 'fire',
      source_refs: ['fuel-1'],
      target_refs: [],
      description: 'положить топливо в огонь'
    }],
    continuation: {
      remaining_intent: 'осмотреть результат',
      depends_on_refs: ['fire-1']
    }
  });
}

export function genericPlan(request) {
  const branch = {
    goal_result: 'achieved', additional_activity: null,
    operations: [], continuation: null
  };
  return plan(request, {
    resolution: 'generic_check',
    goal_result: 'pending',
    check: {
      purpose: 'осмотреться', attribute_ref: 'actor-1', skill_ref: null,
      difficulty_id: 'ordinary',
      outcomes: Object.fromEntries([
        'clean_success', 'success', 'success_with_cost',
        'failure_with_consequence', 'severe_failure'
      ].map((band) => [band, branch]))
    }
  });
}

export function plan(request, overrides) {
  return {
    schema: 'turn_step_plan_v1',
    request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    step_index: request.step_index,
    interpretation: { player_goal: request.root_player_action,
      grounded_attempt: request.remaining_intent, adaptation: 'literal' },
    resolution: 'direct', goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    operations: [], check: null, continuation: null, clarification: null,
    reason_code: 'test_prepared_effect', reason: 'test',
    ...overrides
  };
}

export function available() {
  return { version: 1, schema: 'turn_availability_decision',
    status: 'available', can_attempt: true, reasons: [], check_requests: [] };
}

export function at(minutes) {
  return { whole_minutes: String(minutes), subminute_numerator: '0',
    subminute_denominator: '1' };
}

export function minutes(value) {
  return { exact_minutes: { numerator: String(value), denominator: '1' } };
}

export function body() {
  return { health: 100, satiety: 100, energy: 100,
    active_conditions: [] };
}

export function increment(counters, key) {
  if (counters != null) counters[key] += 1;
}
