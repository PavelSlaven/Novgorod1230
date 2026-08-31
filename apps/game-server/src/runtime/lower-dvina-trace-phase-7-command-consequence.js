import { resolveTracePhase7AutonomousDecision } from
  './lower-dvina-trace-phase-7-autonomous.js';
import { advanceTemporalNpcDecisionBoundary } from
  '@rus/turn/temporal-advance';
import {
  createTracePhase7ActorStepRuntime,
  executeTracePhase7SchedulePlan,
  finalizeTracePhase7ScheduleExecution
} from './lower-dvina-trace-phase-7-schedule-execution.js';
import { resolveTracePhase7ScheduleTemporalAdvance } from
  './lower-dvina-trace-phase-7-schedule-temporal.js';
import { resolveTracePhase7RestTemporalAdvance } from
  './lower-dvina-trace-phase-7-temporal.js';
import { projectTracePhase7CurrentBoundaryState } from
  './lower-dvina-trace-npc-actor-step-owner-capabilities.js';

export async function resolveTracePhase7FireRestConsequence({
  state, playerInput, semanticPlan, modeResolution, rootTurnId, contracts,
  preparedFollowupRef, inputDigest, npcAutonomousModel,
  semanticActivityScheduleOwner, genericCheckContextOwner, localFireProfile,
  worldProcessResolver, projectNpcWorldProcessCapability, npcOwnerCapabilities,
  directHandlers, directOperationContract,
  createBoundaryNpcOwnerCapabilities, randomSource, temporalAdvanceOwner,
  createBoundaryNpcDirectOperations,
  revalidateStateVersion, runNpcConversationExchange,
  conversationBindings, conversationActivity, admitted
}) {
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
    semanticPlan?.continuation, preparedFollowupRef
  );
  const flow = await advanceTemporalNpcDecisionBoundary({
    advanceToBoundary: () => resolveTracePhase7RestTemporalAdvance({
      state, contracts, temporalAdvanceOwner,
      commandIdempotencyKey: playerInput.idempotency_key,
      rootTurnId: actualRootTurnId
    }),
    decisionSignalState: {
      factual_state: state,
      npc_ref: { entity_kind: 'npc', entity_id: contracts.zhdanko.instance_id },
      active_mode: 'autonomous', current_intent: null, decision_capability: true
    },
    async resolveDecision({ temporal, signal_batch: signalBatch }) {
      const priorLocalFirePlans = temporalLocalFirePlans(temporal);
      const currentBoundaryState = projectTracePhase7CurrentBoundaryState({
        state, workingProjection: temporal.projection, priorLocalFirePlans
      });
      const activeNpcOwnerCapabilities =
        typeof createBoundaryNpcOwnerCapabilities !== 'function'
          ? npcOwnerCapabilities
          : await createBoundaryNpcOwnerCapabilities({
              state: currentBoundaryState, workingProjection: temporal.projection,
              priorLocalFirePlans, runNpcConversationExchange,
              conversationBindings, conversationActivity,
              parentTemporal: { execution_id: temporal.execution_id,
                limit_timestamp: structuredClone(temporal.limit_timestamp),
                projection: structuredClone(temporal.projection) }
            });
      const boundaryDirect = typeof createBoundaryNpcDirectOperations !== 'function'
        ? null : await createBoundaryNpcDirectOperations({
            state: currentBoundaryState, workingProjection: temporal.projection,
            priorLocalFirePlans
          });
      actorStepRuntime = createTracePhase7ActorStepRuntime({
        state: currentBoundaryState, contracts, temporal, semanticActivityScheduleOwner,
        genericCheckContextOwner, localFireProfile, worldProcessResolver,
        projectNpcWorldProcessCapability,
        npcOwnerCapabilities: activeNpcOwnerCapabilities, priorLocalFirePlans,
        directHandlers: { ...directHandlers, ...(boundaryDirect?.handlers ?? {}) },
        directOperationContract: { ...directOperationContract,
          ...(boundaryDirect?.operationContract ?? {}) },
        randomSource
      });
      const autonomous = await resolveTracePhase7AutonomousDecision({
        state: currentBoundaryState, contracts, temporal, signalBatch,
        operationContract: actorStepRuntime.registry.operationContract(),
        npcAutonomousModel, revalidateStateVersion, rootTurnId: actualRootTurnId
      });
      return { boundary: autonomous.boundary, autonomous };
    },
    executeActorStep: ({ temporal, decision }) => {
      const priorLocalFirePlans = temporalLocalFirePlans(temporal);
      return executeTracePhase7SchedulePlan({
        state: projectTracePhase7CurrentBoundaryState({
          state, workingProjection: temporal.projection, priorLocalFirePlans
        }),
        contracts, temporal, autonomous: decision.autonomous, actorStepRuntime,
        priorLocalFirePlans
      });
    },
    continueAdvance: ({ temporal, actor_step: actorStep }) =>
      resolveTracePhase7ScheduleTemporalAdvance({
        state, temporal, actorStep, temporalAdvanceOwner,
        commandIdempotencyKey: playerInput.idempotency_key,
        rootTurnId: actualRootTurnId,
        restLimitTimestamp: deferRestCompletion ? temporal.result.clock_after : null
      })
  });
  if (flow.unresolved_domain_rejection !== null) {
    return blockedDomainResult(
      flow.unresolved_domain_rejection.actor_step.domain_result
    );
  }
  const temporal = flow.temporal;
  const scheduleTemporal = flow.continuation;
  const scheduleExecution = finalizeTracePhase7ScheduleExecution({
    actorStep: flow.actor_step, scheduleTemporal
  });
  const restCompleted = scheduleTemporal.rest_completed === true;
  return {
    version: 1,
    schema: 'turn_consequence_package',
    status: 'resolved',
    phase7_kind: 'fire_rest',
    activity_attempt_id: `activity:${state.party_id}:trace-phase7:fire-rest`,
    body_effect_ref: restCompleted ? contracts.bodyEffect.effect_profile_id : null,
    duration_minutes: restCompleted
      ? 30
      : scheduleTemporal.elapsed_after_decision + temporal.elapsed_before_decision,
    phase7: {
      input_digest: inputDigest,
      temporal,
      autonomous: flow.decision.autonomous,
      actor_step: flow.actor_step.result,
      actor_step_owner_outputs: flow.actor_step.owner_outputs,
      actor_step_check: flow.actor_step.check,
      schedule_temporal: scheduleTemporal,
      schedule_execution: scheduleExecution
    },
    ...(!flow.actor_step.local_fire_atomic_write_plans?.length ? {} : {
      local_fire_atomic_write_plans: flow.actor_step.local_fire_atomic_write_plans
    }),
    visible_seed: {},
    hidden_update: {},
    state_changes: [],
    suggested_actions: []
  };
}

function temporalLocalFirePlans(temporal) {
  return temporal?.result?.combined_change_set?.proposals?.flatMap(
    (proposal) => proposal.local_fire_atomic_write_plans ?? []) ?? [];
}

function continuationTargetsMatch(continuation, preparedFollowupRef) {
  return typeof preparedFollowupRef === 'string'
    && continuation?.prepared_followup_ref === preparedFollowupRef;
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

function fail(code) {
  throw Object.assign(new Error(code), { code });
}
