import { applyApprovedTraceRouteBodyEffect } from
  './lower-dvina-trace-route-body-effects.js';

export function createTracePhase7TemporalAdvance({ fallback }) {
  return async (input) => {
    if (input.consequence?.phase7_kind !== 'fire_rest') {
      return fallback(input);
    }
    const phase7 = input.consequence.phase7;
    return {
      clock_before: structuredClone(input.clock_before),
      clock_after: structuredClone(phase7.schedule_execution.clock_after),
      exact_elapsed: {
        exact_minutes: { numerator: '30', denominator: '1' }
      },
      nearest_boundary: {
        scheduled_at: structuredClone(
          phase7.autonomous.boundary.scheduled_at
        ),
        boundary_ids: [phase7.autonomous.boundary.boundary_id]
      },
      boundary_trace: {
        owner: '@rus/turn/temporal-advance',
        policy: 'same_time_batch_then_autonomous_handoff',
        evaluated_candidate_count:
          phase7.temporal.result.trace.processed_boundary_ids.length,
        processed_boundary_ids: structuredClone(
          phase7.temporal.result.trace.processed_boundary_ids
        ),
        deferred_to_source_owner_ids: [],
        root_clock_write_count: 1
      }
    };
  };
}

export function createTracePhase7BodyEffect({ fallback, contracts }) {
  return Object.freeze({
    apply(input) {
      if (input.consequence?.phase7_kind !== 'fire_rest') {
        return fallback.apply(input);
      }
      return applyApprovedTraceRouteBodyEffect({
        ...input,
        effect: contracts.bodyEffect
      });
    }
  });
}

export function createTracePhase7VisibleProjector({ fallback }) {
  return Object.freeze({
    async project(input) {
      if (input.consequence?.phase7_kind !== 'fire_rest') {
        return fallback.project(input);
      }
      const body = input.body_update;
      const transitions = body.proposal?.condition_transitions ?? [];
      return {
        version: 1,
        schema: 'visible_context_package',
        visible_scene:
          'У костра прошло полчаса. Одежда немного подсохла, стало теплее.',
        visible_changes: [
          'elapsed_30_minutes',
          ...transitions.map(({ outcome }) => outcome)
        ],
        sensory_details: ['Тепло огня постепенно отгоняет озноб.'],
        visible_npc: [],
        visible_objects: [],
        known_context: ['Одежда остаётся сырой и не высохла полностью.'],
        uncertainties: [],
        allowed_tensions: [],
        do_not_imply: [
          'npc_decision_signal',
          'npc_action_decision_request',
          'zhdanko_plan',
          'road_bag_new_location',
          'headache_cured',
          'shoulder_bruise_cured',
          'clothes_fully_dry',
          'hidden_truth'
        ]
      };
    }
  });
}
