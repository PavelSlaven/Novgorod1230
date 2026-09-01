import { subtractGameTimestamp } from '@rus/time-events-history';
import { applyApprovedTraceRouteBodyEffect } from
  './lower-dvina-trace-route-body-effects.js';
import { tracePhase7FireEnvironmentSatisfied } from
  './lower-dvina-trace-phase-7-contracts.js';
import { serverError } from '../errors.js';

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
      if (!tracePhase7FireEnvironmentSatisfied(
        input.committed_state, contracts)) {
        throw serverError('TRACE_PHASE_7_FIRE_ENVIRONMENT_MISMATCH',
          'The approved rest environment is not active.', {
            status: 409, public_exposure: 'internal'
          });
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
        return overlayCurrentScene(input, {
          fallbackScene: 'Отдых у огня прервался.',
          changes: ['Отдых прервался до истечения получаса.'],
          sensory: ['Огонь ещё греет, но пауза оборвала отдых.'],
          known: ['Получасовой отдых ещё не завершён.'],
          doNotImply: [
            'rest_completed',
            'clothes_fully_dry',
            'hidden_truth'
          ]
        });
      }
      const body = input.body_update;
      if (body?.applied !== true) {
        throw serverError('TRACE_PHASE_7_BODY_EFFECT_MISSING',
          'The completed rest has no approved body effect.', {
            status: 409, public_exposure: 'internal'
          });
      }
      const transitions = body.proposal?.condition_transitions ?? [];
      const companionOutcomes = input.consequence.turn10_kind
        === 'companion_request'
        ? (input.consequence.conversation?.semantic_exchange?.npc_outcomes
          ?? []).filter(({ applied, outcome }) => applied
            && outcome?.kind === 'route_participation')
        : [];
      const companionRoles = companionOutcomes.map(
        ({ outcome }) => outcome.role);
      return overlayCurrentScene(input, {
        fallbackScene: companionOutcomes.length === 0
          ? 'У костра прошло полчаса. Одежда немного подсохла, стало теплее.'
          : 'У костра прошло полчаса. После разговора определилось, кто пойдёт к Жданко, а кто останется с Онисимом.',
        changes: [
          'Прошло полчаса.',
          ...transitions.flatMap(({ outcome }) => ({
            clothing_partially_dried: ['Одежда немного подсохла.'],
            shivering_reduced: ['Озноб ослаб.']
          })[outcome] ?? []),
          ...companionRoles.map((role) => role === 'guide'
            ? 'Еремей согласился идти к Жданко.'
            : 'Рыбак согласился остаться с Онисимом.')
        ],
        sensory: ['Тепло огня постепенно отгоняет озноб.'],
        npcStatuses: new Map(companionOutcomes.map(({ npc_ref: npcRef,
          outcome }) => [npcRef.entity_id, visibleCompanionStatus(outcome.role)])),
        known: ['Одежда остаётся сырой и не высохла полностью.'],
        doNotImply: [
          'headache_cured',
          'shoulder_bruise_cured',
          'clothes_fully_dry',
          'hidden_truth'
        ]
      });
    }
  });
}

function overlayCurrentScene(input, {
  fallbackScene, changes, sensory, known, doNotImply, npcStatuses = new Map()
}) {
  const current = input?.retrieved_state?.current_visible_context;
  const base = current?.schema === 'visible_context_package'
    ? structuredClone(current)
    : {
        version: 1, schema: 'visible_context_package',
        visible_scene: fallbackScene,
        visible_changes: [], sensory_details: [], visible_npc: [],
        visible_objects: [], known_context: [], uncertainties: [],
        allowed_tensions: [], do_not_imply: []
      };
  return {
    ...base,
    visible_changes: unique([...base.visible_changes, ...changes]),
    sensory_details: unique([...base.sensory_details, ...sensory]),
    visible_npc: base.visible_npc.map((npc) => {
      const status = npcStatuses.get(npc?.entity_ref?.entity_id);
      return status == null ? npc : { ...npc, visible_status: status };
    }),
    known_context: unique([...base.known_context, ...known]),
    do_not_imply: unique([...base.do_not_imply, ...doNotImply])
  };
}

function visibleCompanionStatus(role) {
  return role === 'guide'
    ? 'согласился вести группу'
    : role === 'escort'
      ? 'согласился идти с группой'
      : 'останется с Онисимом';
}

function unique(values) {
  return [...new Set(values)];
}
