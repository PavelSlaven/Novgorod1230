import { resolveTracePhase7AutonomousDecision } from
  './lower-dvina-trace-phase-7-autonomous.js';
import { advanceTemporalNpcDecisionBoundary } from
  '@rus/turn/temporal-advance';
import {
  createTracePhase7ActorStepRuntime,
  executeTracePhase7SchedulePlan,
  finalizeTracePhase7ScheduleExecution
} from
  './lower-dvina-trace-phase-7-schedule-execution.js';
import { resolveTracePhase7ScheduleTemporalAdvance } from
  './lower-dvina-trace-phase-7-schedule-temporal.js';
import { resolveTracePhase7RestTemporalAdvance } from
  './lower-dvina-trace-phase-7-temporal.js';
import { tracePhase7StateIsActionable } from
  './lower-dvina-trace-phase-7-applicability.js';

const PRECONDITION = 'phase7_fire_rest_admission';

const EXACT = new Set([
  'отдохнуть у огня полчаса и подсушить одежду.',
  'отдохнуть у огня полчаса и подсушить одежду'
]);

export function createTracePhase7FireRestCommand({
  contracts,
  continuationTargetRefs = [],
  inputDigest,
  npcAutonomousModel,
  semanticActivityScheduleOwner,
  genericCheckContextOwner,
  randomSource,
  temporalAdvanceOwner,
  revalidateStateVersion,
  npcSemanticRemainderOwner = null
}) {
  return Object.freeze({
    command_id: 'lower_dvina_trace.rest_by_fire_and_dry_clothing',
    option_id: 'rest_by_fire_and_dry_clothing',
    label: 'Отдохнуть у огня полчаса и подсушить одежду',
    target_id: contracts.campLocationRef,
    approved_record: contracts.activityPin,
    preconditions: [{ kind: PRECONDITION }],
    expected_cost: { kind: 'exact_time', value: 30 },
    known_risks: [],
    reason_visible_to_actor:
      'После переноски у огня можно немного обсохнуть и восстановить силы.',
    mode: {
      selected_primary_mode: 'body_recovery',
      secondary_modes: ['time_progression', 'npc_interaction'],
      resolution_plan: {
        subsystems: [
          'body_state', 'time_progression', 'npc_interaction',
          'movement', 'item_access', 'visible_context_projection'
        ],
        checks_to_run: ['physical_access', 'body_state', 'time_cost'],
        expected_writes: [
          'party_state', 'party_npcs', 'party_items',
          'party_visible_context_package'
        ],
        state_blocks_to_load: [
          'party_state', 'current_position', 'clock_weather_light',
          'relevant_items', 'relevant_npcs', 'relevant_events',
          'recent_changes_log'
        ]
      }
    },
    matches({ raw_text: rawText }) {
      return EXACT.has(String(rawText ?? '').trim().toLowerCase()
        .replace(/\s+/gu, ' '));
    },
    availability(context) {
      const state = context.committed_state ?? context.retrievedState;
      return available(admitted(state, contracts));
    },
    async consequence({ retrievedState: state, playerInput,
      semanticPlan = null,
      modeResolution = null, rootTurnId = null }) {
      if (!admitted(state, contracts)) fail('TRACE_PHASE_7_ADMISSION_FAILED');
      const actualRootTurnId = modeResolution?.turn_id ?? rootTurnId;
      const expectedRootTurnId = [
        'turn', state.party_id, state.party_state.turn_number + 1
      ].join(':');
      if (typeof actualRootTurnId !== 'string'
          || actualRootTurnId !== expectedRootTurnId) {
        fail('TRACE_PHASE_7_ROOT_TURN_ID_INVALID');
      }
      let actorStepRuntime = null;
      const deferRestCompletion = continuationTargetsMatch(
        semanticPlan?.continuation, continuationTargetRefs
      );
      const flow = await advanceTemporalNpcDecisionBoundary({
        advanceToBoundary: () => resolveTracePhase7RestTemporalAdvance({
          state,
          contracts,
          temporalAdvanceOwner,
          commandIdempotencyKey: playerInput.idempotency_key,
          rootTurnId: actualRootTurnId
        }),
        decisionSignalState: {
          factual_state: state,
          npc_ref: {
            entity_kind: 'npc',
            entity_id: contracts.zhdanko.instance_id
          },
          active_mode: 'autonomous',
          current_intent: null,
          decision_capability: true
        },
        async resolveDecision({ temporal, signal_batch: signalBatch }) {
          actorStepRuntime = createTracePhase7ActorStepRuntime({
            state, contracts, temporal, semanticActivityScheduleOwner,
            genericCheckContextOwner, randomSource,
            npcSemanticRemainderOwner
          });
          const autonomous = await resolveTracePhase7AutonomousDecision({
            state,
            contracts,
            temporal,
            signalBatch,
            operationContract:
              actorStepRuntime.registry.operationContract(),
            npcAutonomousModel,
            revalidateStateVersion,
            rootTurnId: actualRootTurnId
          });
          return { boundary: autonomous.boundary, autonomous };
        },
        executeActorStep: ({ temporal, decision }) =>
          executeTracePhase7SchedulePlan({
            state,
            contracts,
            temporal,
            autonomous: decision.autonomous,
            actorStepRuntime
          }),
        continueAdvance: ({ temporal, actor_step: actorStep }) =>
          resolveTracePhase7ScheduleTemporalAdvance({
            state,
            temporal,
            actorStep,
            temporalAdvanceOwner,
            commandIdempotencyKey: playerInput.idempotency_key,
            rootTurnId: actualRootTurnId,
            restLimitTimestamp: deferRestCompletion
              ? temporal.result.clock_after : null
          })
      });
      if (flow.unresolved_domain_rejection !== null) {
        return blockedDomainResult(
          flow.unresolved_domain_rejection.actor_step.domain_result
        );
      }
      const temporal = flow.temporal;
      const autonomous = flow.decision.autonomous;
      const scheduleTemporal = flow.continuation;
      const scheduleExecution = finalizeTracePhase7ScheduleExecution({
        actorStep: flow.actor_step,
        scheduleTemporal
      });
      const restCompleted = scheduleTemporal.rest_completed === true;
      return {
        version: 1,
        schema: 'turn_consequence_package',
        status: 'resolved',
        phase7_kind: 'fire_rest',
        activity_attempt_id:
          `activity:${state.party_id}:trace-phase7:fire-rest`,
        body_effect_ref: restCompleted
          ? contracts.bodyEffect.effect_profile_id
          : null,
        duration_minutes: restCompleted
          ? 30
          : scheduleTemporal.elapsed_after_decision
            + temporal.elapsed_before_decision,
        phase7: {
          input_digest: inputDigest,
          temporal,
          autonomous,
          actor_step: flow.actor_step.result,
          actor_step_check: flow.actor_step.check,
          schedule_temporal: scheduleTemporal,
          schedule_execution: scheduleExecution
        },
        ...(flow.actor_step.npc_actor_step_handoff == null ? {} : {
          npc_actor_step_handoff: flow.actor_step.npc_actor_step_handoff
        }),
        visible_seed: {},
        hidden_update: {},
        state_changes: [],
        suggested_actions: []
      };
    },
    writeTargets(input) {
      return [{
        target: 'party_state',
        value: {
          player_input: input.playerInput,
          mode_resolution: input.modeResolution,
          availability: input.availability,
          consequence: input.consequence,
          time_update: input.timeUpdate,
          body_update: input.bodyUpdate,
          hidden_update: input.hiddenUpdate
        }
      }, {
        target: 'party_visible_context_package',
        value: input.visibleContext
      }];
    }
  });
}

function blockedDomainResult(domainResult) {
  return {
    version: 1,
    schema: 'turn_consequence_package',
    status: 'blocked',
    duration_minutes: 0,
    visible_seed: {},
    hidden_update: {
      npc_autonomous_domain_result: structuredClone(domainResult)
    },
    state_changes: [],
    suggested_actions: []
  };
}

export function tracePhase7PreconditionSatisfied(
  precondition,
  state,
  contracts
) {
  return precondition?.kind === PRECONDITION && admitted(state, contracts);
}

function continuationTargetsMatch(continuation, requiredRefs) {
  if (continuation == null || requiredRefs.length === 0
      || typeof continuation.remaining_intent !== 'string'
      || continuation.remaining_intent.length === 0) {
    return false;
  }
  const declared = new Set(continuation.depends_on_refs ?? []);
  return requiredRefs.every((ref) => declared.has(ref));
}

function admitted(state, contracts) {
  return tracePhase7StateIsActionable(state, contracts);
}

function available(ok) {
  return {
    version: 1,
    schema: 'turn_availability_decision',
    status: ok ? 'available' : 'blocked',
    can_attempt: ok,
    reasons: ok ? [] : ['phase7_fire_rest_precondition_failed'],
    check_requests: []
  };
}

function fail(code) {
  throw Object.assign(new Error(code), { code });
}
