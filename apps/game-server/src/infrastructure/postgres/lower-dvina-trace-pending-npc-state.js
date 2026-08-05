import {
  validateConversationContributionPlan,
  validatePlayerConversationContributionPlan
} from '@rus/npc-runtime';
import { fail } from './lower-dvina-trace-conversation-state-validation.js';

export function projectRepeatedPendingNpcExecution(next, semanticExchange) {
  return projectPendingNpcConversationExecution({
    next,
    semanticExchange,
    exchange: semanticExchange.exchange,
    traces: [],
    decisions: [],
    fail
  });
}

export function projectPendingNpcConversationExecution({
  next,
  semanticExchange,
  exchange,
  traces,
  decisions,
  fail
}) {
  projectPendingPlayerConversationExecution(next, semanticExchange, fail);
  const pending = semanticExchange.pending_npc_execution ?? null;
  if (pending === null) {
    if (exchange.session_status !== 'suspended') {
      delete next.pending_npc_conversation_execution;
    }
    return next;
  }
  const priorPending = next.pending_npc_conversation_execution ?? null;
  const resumedTraceRef = semanticExchange.resumed_npc_execution
    ?.decision_trace_ref ?? null;
  const pendingTrace = traces.find(
    ({ request_id: requestId }) => requestId === pending.plan?.request_id
  ) ?? (resumedTraceRef?.entity_id === pending.plan?.request_id
    ? { request_id: resumedTraceRef.entity_id } : undefined);
  const pendingRequest = decisions.find(({ request: candidate }) =>
    candidate.request_id === pending.plan?.request_id)?.request ?? (
    priorPending?.decision_trace_ref?.entity_id === pending.plan?.request_id
      ? {
          conversation_id: priorPending.conversation_id,
          exchange_id: priorPending.exchange_id,
          npc_ref: priorPending.npc_ref
        } : undefined
  );
  if (pendingTrace === undefined
      || pendingRequest === undefined
      || pending.plan?.conversation_id !== pendingRequest.conversation_id
      || pending.plan?.exchange_id !== pendingRequest.exchange_id
      || pending.contribution_index < 2
      || pending.remaining_minutes < 0
      || pending.remaining_exchange_minutes < pending.remaining_minutes
      || !Array.isArray(pending.remaining_responder_refs)
      || pending.same_time_batch_ref?.entity_kind !== 'temporal_batch'
      || typeof pending.same_time_batch_ref?.entity_id !== 'string'
      || (pending.plan.resolution === 'check_required'
        ? pending.check_result?.outcome?.band
            !== pending.social_delivery_result?.outcome_band
        : pending.check_result !== null
          || pending.social_delivery_result !== null)) {
    fail(
      'TRACE_M2_PENDING_NPC_EXECUTION_INVALID',
      'A suspended NPC contribution must reference its committed semantic decision.'
    );
  }
  next.pending_npc_conversation_execution = {
    schema: 'pending_npc_conversation_execution_v1',
    decision_trace_ref: {
      entity_kind: 'npc_decision_trace',
      entity_id: pendingTrace.request_id
    },
    conversation_id: pendingRequest.conversation_id,
    exchange_id: pendingRequest.exchange_id,
    source_input_digest: semanticExchange.input_digest,
    npc_ref: structuredClone(pendingRequest.npc_ref),
    contribution_index: pending.contribution_index,
    remaining_minutes: pending.remaining_minutes,
    remaining_exchange_minutes: pending.remaining_exchange_minutes,
    remaining_responder_refs:
      structuredClone(pending.remaining_responder_refs),
    same_time_batch_ref: structuredClone(pending.same_time_batch_ref),
    boundary_id: pending.boundary_id,
    check_result: structuredClone(pending.check_result),
    social_delivery_result:
      structuredClone(pending.social_delivery_result),
    ...(priorPending?.conversation_id === pendingRequest.conversation_id
      && priorPending?.exchange_id === pendingRequest.exchange_id
      ? preservedActivity(
          priorPending, semanticExchange.exchange.time_budget.elapsed_minutes
        ) : {})
  };
  return next;
}

function projectPendingPlayerConversationExecution(
  next,
  semanticExchange,
  failOwner
) {
  const pending = semanticExchange.pending_player_execution ?? null;
  if (pending === null) {
    if (semanticExchange.resumed_player_execution != null
        || semanticExchange.exchange.session_status !== 'suspended') {
      delete next.pending_player_conversation_execution;
    }
    return;
  }
  if (!validatePlayerConversationContributionPlan(pending.plan)
      || pending.plan.speaker_ref?.entity_kind !== 'player_character'
      || pending.plan.speaker_ref.entity_id !== next.actor_id
      || pending.plan.conversation_id !== pending.conversation_id
      || typeof pending.exchange_id !== 'string'
      || pending.exchange_id.length === 0
      || pending.contribution_index !== 1
      || !Number.isSafeInteger(pending.remaining_minutes)
      || pending.remaining_minutes < 0
      || !Number.isSafeInteger(pending.remaining_exchange_minutes)
      || pending.remaining_exchange_minutes < pending.remaining_minutes
      || (pending.plan.resolution === 'check_required'
        ? pending.check_result?.outcome?.band
            !== pending.social_delivery_result?.outcome_band
        : pending.check_result !== null
          || pending.social_delivery_result !== null)) {
    failOwner(
      'TRACE_M2_PENDING_PLAYER_EXECUTION_INVALID',
      'A suspended player contribution must preserve its exact semantic plan.'
    );
  }
  const prior = next.pending_player_conversation_execution ?? null;
  next.pending_player_conversation_execution = {
    schema: 'pending_player_conversation_execution_v1',
    plan: structuredClone(pending.plan),
    conversation_id: pending.conversation_id,
    exchange_id: pending.exchange_id,
    source_input_digest: semanticExchange.input_digest,
    contribution_index: 1,
    remaining_minutes: pending.remaining_minutes,
    remaining_exchange_minutes: pending.remaining_exchange_minutes,
    check_result: structuredClone(pending.check_result),
    social_delivery_result:
      structuredClone(pending.social_delivery_result),
    ...(pending.offer_stage === undefined ? {} : {
      offer_stage: structuredClone(pending.offer_stage)
    }),
    ...(pending.check_request === undefined ? {} : {
      check_request: structuredClone(pending.check_request)
    }),
    ...(prior?.conversation_id === pending.plan.conversation_id
      && prior?.exchange_id === pending.plan.exchange_id
      ? preservedActivity(
          prior, semanticExchange.exchange.time_budget.elapsed_minutes
        ) : {})
  };
}

function preservedActivity(pending, elapsedDelta) {
  return {
    ...Object.fromEntries([
    'activity_execution_id', 'total_minutes', 'elapsed_minutes', 'started_at',
    'option_id', 'originating_request_id', 'next_attempt_ordinal',
    'activity_state_version'
  ].filter((key) => pending[key] !== undefined)
      .map((key) => [key, structuredClone(pending[key])])),
    elapsed_minutes: pending.elapsed_minutes + elapsedDelta,
    next_attempt_ordinal: pending.next_attempt_ordinal + 1,
    activity_state_version: pending.activity_state_version + 1
  };
}
