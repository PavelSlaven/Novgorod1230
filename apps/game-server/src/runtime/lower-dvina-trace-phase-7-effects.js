import { subtractGameTimestamp } from '@rus/time-events-history';
import { applyApprovedTraceRouteBodyEffect } from
  './lower-dvina-trace-route-body-effects.js';

export function createTracePhase7TemporalAdvance({ fallback }) {
  return async (input) => {
    if (input.consequence?.phase7_kind !== 'fire_rest') {
      return fallback(input);
    }
    const phase7 = input.consequence.phase7;
    const schedule = phase7.schedule_temporal;
    const clockBefore = structuredClone(input.clock_before);
    const clockAfter = structuredClone(schedule.result.clock_after);
    const exact = subtractGameTimestamp(clockAfter, clockBefore);
    return {
      clock_before: clockBefore,
      clock_after: clockAfter,
      exact_elapsed: {
        exact_minutes: {
          numerator: exact.numerator,
          denominator: exact.denominator
        }
      },
      nearest_boundary: {
        scheduled_at: structuredClone(
          phase7.autonomous.boundary.scheduled_at
        ),
        boundary_ids: [phase7.autonomous.boundary.boundary_id]
      },
      boundary_trace: {
        owner: '@rus/turn/temporal-advance',
        policy: schedule.result.temporal_status === 'paused'
          ? 'same_time_batch_then_autonomous_handoff_paused'
          : 'same_time_batch_then_autonomous_handoff',
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
      const parentCompleted = input.consequence?.parent_activity_completion
        ?.status === 'completed';
      if (input.consequence?.phase7_kind !== 'fire_rest'
          && !parentCompleted) {
        return fallback.apply(input);
      }
      const schedule = input.consequence.phase7?.schedule_temporal;
      if (!parentCompleted && schedule?.rest_completed !== true) {
        return {
          owner: '@rus/body-state',
          applied: false,
          proposal: null,
          state_after: structuredClone(input.committed_state.body_state)
        };
      }
      return applyApprovedTraceRouteBodyEffect({
        ...input,
        ...(parentCompleted ? {
          time_update: {
            ...structuredClone(input.time_update),
            exact_elapsed: {
              exact_minutes: { numerator: '30', denominator: '1' }
            }
          }
        } : {}),
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
      const schedule = input.consequence.phase7.schedule_temporal;
      const parentCompleted = input.consequence.parent_activity_completion;
      if (schedule.rest_completed !== true
          && parentCompleted?.status !== 'completed') {
        return {
          version: 1,
          schema: 'visible_context_package',
          visible_scene:
            'Отдых у огня прерван. Время ещё не дошло до конца получаса.',
          visible_changes: ['phase7_rest_paused'],
          sensory_details: ['Огонь ещё греет, но пауза оборвала отдых.'],
          visible_npc: [],
          visible_objects: [],
          known_context: ['Получасовой отдых ещё не завершён.'],
          uncertainties: [],
          allowed_tensions: [],
          do_not_imply: [
            'rest_completed',
            'clothes_fully_dry',
            'hidden_truth'
          ]
        };
      }
      const body = input.body_update;
      const transitions = body.proposal?.condition_transitions ?? [];
      const companionOutcomes = input.consequence.turn10_kind
        === 'companion_request'
        ? (input.consequence.conversation?.semantic_exchange?.npc_outcomes
          ?? []).filter(({ applied, outcome }) => applied
            && outcome?.kind === 'route_participation')
        : [];
      const companionRoles = companionOutcomes.map(
        ({ outcome }) => outcome.role);
      return {
        version: 1,
        schema: 'visible_context_package',
        visible_scene: companionOutcomes.length === 0
          ? 'У костра прошло полчаса. Одежда немного подсохла, стало теплее.'
          : 'У костра прошло полчаса. После разговора определилось, кто пойдёт к Жданко, а кто останется с Онисимом.',
        visible_changes: [
          'elapsed_30_minutes',
          ...transitions.map(({ outcome }) => outcome),
          ...companionRoles.map((role) => `npc_commitment:${role}`)
        ],
        sensory_details: ['Тепло огня постепенно отгоняет озноб.'],
        visible_npc: companionOutcomes.map(({ npc_ref: npcRef, outcome }) => ({
          entity_ref: structuredClone(npcRef),
          display_label: outcome.role === 'guide' ? 'Еремей' : 'Рыбак',
          recognition: 'known',
          visible_status: visibleCompanionStatus(outcome.role)
        })),
        visible_objects: [],
        known_context: ['Одежда остаётся сырой и не высохла полностью.'],
        uncertainties: [],
        allowed_tensions: [],
        do_not_imply: [
          'headache_cured',
          'shoulder_bruise_cured',
          'clothes_fully_dry',
          'hidden_truth'
        ]
      };
    }
  });
}

function visibleCompanionStatus(role) {
  return role === 'guide'
    ? 'согласился вести группу'
    : role === 'escort'
      ? 'согласился идти с группой'
      : 'останется с Онисимом';
}
