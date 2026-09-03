import { requestNpcSemanticDecision } from './npc-semantic-decision.js';
import {
  decisionPairKey,
  normalizeNpcBoundaryBatch,
  normalizeNpcDecision
} from './conversation-exchange-npc-batch.js';
import { resolveNpcContributionSocialCheck } from
  './conversation-exchange-social-check.js';

export async function resumePendingNpcExecution(normalized, ports, helpers) {
  const { callPort, fail, immutableClone, normalizeApplyResult,
    progressAndProject, stopAfterApply } = helpers;
  const pending = normalized.pendingNpcExecution;
  const eligible = await callPort(
    ports.revalidatePendingNpcContribution,
    { working_state: normalized.initialWorkingState, plan: pending.plan,
      boundary_id: pending.boundary_id,
      same_time_batch_ref: pending.same_time_batch_ref,
      source_decision_trace_ref: pending.source_decision_trace_ref },
    'TURN_CONVERSATION_PENDING_NPC_REVALIDATION_FAILED',
    'Persisted NPC conversation contribution could not be revalidated'
  );
  if (typeof eligible !== 'boolean') {
    fail('TURN_CONVERSATION_PENDING_NPC_REVALIDATION_INVALID',
      'Pending NPC contribution revalidation must return a boolean');
  }
  let firstProgress = null;
  let workingState;
  let sessionStatus;
  let handoff = null;
  let elapsedMinutes = 0;
  let completedCount = 0;
  let appliedCount = 0;
  const contributions = [];
  const npcDecisions = [];
  const temporalBoundaryRefs = [];
  const processedBoundaryIds = [pending.boundary_id];
  const processedNpcRefs = [pending.plan.speaker_ref];
  const processedDecisionPairs = new Set([decisionPairKey({
    npc_ref: pending.plan.speaker_ref,
    same_time_batch_ref: pending.same_time_batch_ref
  })]);
  let remainingRefs = [...pending.remaining_responder_refs];
  let nextPending = null;
  let stopReason;

  if (eligible) {
    const firstApplied = normalizeApplyResult(await callPort(
      ports.applyPendingNpcContribution,
      { working_state: normalized.initialWorkingState, plan: pending.plan,
        contribution_index: pending.contribution_index,
        check_result: pending.check_result,
        social_delivery_result: pending.social_delivery_result },
      'TURN_CONVERSATION_NPC_APPLY_FAILED',
      'Persisted NPC conversation contribution could not be resumed'
    ), 'TURN_CONVERSATION_NPC_APPLY_INVALID');
    firstProgress = await progressAndProject({
      ports, applied: firstApplied, plan: pending.plan,
      contributionIndex: pending.contribution_index,
      plannedMinutes: pending.remaining_minutes,
      elapsedAlreadyComplete: pending.remaining_minutes === 0,
      perceptionPort: ports.projectNpcContributionPerception,
      proposal: { plan: pending.plan, signal_ids_to_consume: [] }
    });
    workingState = firstProgress.applied.working_state;
    sessionStatus = firstProgress.applied.session_status;
    handoff = firstProgress.applied.handoff;
    elapsedMinutes = firstProgress.elapsedMinutes;
    completedCount = firstProgress.completed ? 1 : 0;
    appliedCount = firstProgress.completed && !firstProgress.interrupted
      ? 1 : 0;
    if (appliedCount === 1) {
      contributions.push(firstProgress.applied.contribution_event);
    }
    temporalBoundaryRefs.push(...firstProgress.temporalBoundaryRefs);
    nextPending = firstProgress.interrupted ? pendingRecord({
      pending,
      plan: pending.plan,
      boundaryId: pending.boundary_id,
      contributionIndex: pending.contribution_index,
      remainingMinutes: pending.remaining_minutes - firstProgress.elapsedMinutes,
      remainingExchangeMinutes:
        pending.remaining_exchange_minutes - firstProgress.elapsedMinutes,
      remainingRefs
    }) : null;
    stopReason = firstProgress.interrupted
      ? 'temporal_boundary' : stopAfterApply(firstProgress.applied);
  } else {
    const terminal = await applyTerminalNpcOutcomes(
      ports,
      callPort,
      fail,
      normalized.initialWorkingState,
      [pendingUnavailableOutcome(pending)]
    );
    workingState = terminal.workingState;
    sessionStatus = terminal.sessionStatus;
    stopReason = sessionStatus === 'ended' ? 'npc_unavailable' : null;
  }

  if (!firstProgress?.interrupted
      && [null, 'player_response'].includes(stopReason)) {
    let queuedMinutes = pending.remaining_exchange_minutes
      - pending.remaining_minutes;
    let latestContribution = firstProgress?.applied.contribution_event ?? null;
    while (queuedMinutes > 0
        && [null, 'player_response'].includes(stopReason)) {
      const completedExchangeContributions = pending.contribution_index - 1
        + contributions.length;
      if (completedExchangeContributions
          >= normalized.maxContributionsPerExchange) {
        stopReason = 'exchange_limit';
        break;
      }
      const batch = normalizeNpcBoundaryBatch(await callPort(
        ports.buildNpcResponseBoundaries,
        { working_state: workingState,
          latest_contribution: latestContribution,
          processed_boundary_ids: processedBoundaryIds,
          pending_responder_refs: remainingRefs,
          same_time_batch_ref: pending.same_time_batch_ref },
        'TURN_CONVERSATION_NPC_BATCH_BUILD_FAILED',
        'NPC response boundary batch could not be built'
      ), new Set(processedBoundaryIds), processedDecisionPairs);
      const requiredKeys = new Set(remainingRefs.map(refKey));
      const availableKeys = new Set(batch.boundaries.map(
        ({ npc_ref: npcRef }) => refKey(npcRef)));
      const terminalKeys = new Set(batch.terminal_outcomes.map(
        ({ npc_ref: npcRef }) => refKey(npcRef)));
      if (batch.terminal_outcomes.some(({ npc_ref: npcRef }) =>
        !requiredKeys.has(refKey(npcRef)))
          || [...requiredKeys].some((key) =>
            !availableKeys.has(key) && !terminalKeys.has(key))) {
        fail('TURN_CONVERSATION_PENDING_NPC_QUEUE_INVALID',
          'Pending NPC responders require one boundary or terminal outcome');
      }
      if (batch.terminal_outcomes.length > 0) {
        const terminal = await applyTerminalNpcOutcomes(
          ports, callPort, fail, workingState, batch.terminal_outcomes
        );
        workingState = terminal.workingState;
        sessionStatus = terminal.sessionStatus;
        remainingRefs = remainingRefs.filter((reference) =>
          !terminalKeys.has(refKey(reference)));
      }
      if (batch.boundaries.length === 0) {
        stopReason = 'player_response';
        break;
      }
      const [boundary, ...queuedBoundaries] = batch.boundaries;
      remainingRefs = queuedBoundaries.map(({ npc_ref: npcRef }) => npcRef);
      const decision = normalizeNpcDecision(await callPort(
        ports.buildNpcResponseDecision,
        { working_state: workingState,
          latest_contribution: latestContribution,
          boundary },
        'TURN_CONVERSATION_NPC_DECISION_BUILD_FAILED',
        'NPC response decision could not be built'
      ), boundary);
      const proposal = await requestNpcSemanticDecision({
        boundary: decision.boundary,
        request: decision.request,
        semanticModel: ports.npcSemanticModel,
        persistedTrace: decision.persisted_trace,
        revalidateStateVersion: ports.revalidateNpcStateVersion,
        validatePlan: ports.validateNpcPlan ?? null,
        validateFreshPlan: ports.validateFreshNpcPlan ?? null
      });
      const npcCheck = await resolveNpcContributionSocialCheck({
        plan: proposal.plan,
        request: decision.request,
        boundary: decision.boundary,
        resolver: ports.resolveNpcContributionCheck
      });
      const contributionIndex = pending.contribution_index
        + contributions.length;
      const plannedMinutes = plannedNpcMinutes({
        remainingMinutes: queuedMinutes,
        queuedBoundaries,
        plan: proposal.plan,
        priorNpcDecisionCount: processedNpcRefs.length
      });
      const applied = normalizeApplyResult(await callPort(
        ports.applyNpcContribution,
        { working_state: workingState, boundary: decision.boundary,
          request: decision.request, proposal,
          check_result: npcCheck.check_result,
          social_delivery_result: npcCheck.social_delivery_result,
          contribution_index: contributionIndex },
        'TURN_CONVERSATION_NPC_APPLY_FAILED',
        'NPC conversation contribution could not be applied'
      ), 'TURN_CONVERSATION_NPC_APPLY_INVALID');
      const progress = await progressAndProject({
        ports, applied, plan: proposal.plan, contributionIndex,
        plannedMinutes,
        perceptionPort: ports.projectNpcContributionPerception,
        request: decision.request, proposal
      });
      workingState = progress.applied.working_state;
      latestContribution = progress.applied.contribution_event;
      sessionStatus = progress.applied.session_status;
      handoff = progress.applied.handoff;
      elapsedMinutes += progress.elapsedMinutes;
      queuedMinutes -= progress.elapsedMinutes;
      if (progress.completed) completedCount += 1;
      if (progress.completed && !progress.interrupted) {
        appliedCount += 1;
        contributions.push(progress.applied.contribution_event);
      }
      npcDecisions.push({ boundary: decision.boundary,
        request: decision.request, proposal });
      processedBoundaryIds.push(decision.boundary.boundary_id);
      processedNpcRefs.push(decision.request.npc_ref);
      processedDecisionPairs.add(decisionPairKey(decision.boundary));
      remainingRefs = remainingRefs.filter((reference) =>
        refKey(reference) !== refKey(decision.request.npc_ref));
      temporalBoundaryRefs.push(...progress.temporalBoundaryRefs);
      stopReason = stopAfterApply(progress.applied);
      if (progress.interrupted) {
        nextPending = pendingRecord({ pending, plan: proposal.plan,
          boundaryId: decision.boundary.boundary_id, contributionIndex,
          remainingMinutes: plannedMinutes - progress.elapsedMinutes,
          remainingExchangeMinutes:
            pending.remaining_exchange_minutes - elapsedMinutes,
          remainingRefs,
          checkResult: npcCheck.check_result,
          socialDeliveryResult: npcCheck.social_delivery_result,
          sourceDecisionTraceRef: {
            entity_kind: 'npc_decision_trace',
            entity_id: decision.request.request_id
          } });
        stopReason = 'temporal_boundary';
        break;
      }
      if (![null, 'player_response'].includes(stopReason)) break;
      if (stopReason === 'player_response') stopReason = null;
    }
  }
  if ([null, 'player_response'].includes(stopReason)
      && pending.contribution_index - 1 + contributions.length
        >= normalized.maxContributionsPerExchange) {
    stopReason = 'exchange_limit';
  }
  const finalBudgetMinutes = stopReason === 'temporal_boundary'
    ? pending.remaining_exchange_minutes : elapsedMinutes;
  return immutableClone({
    schema: 'conversation_exchange_result_v1',
    status: sessionStatus === 'ended' ? 'resolved'
      : 'player_response_required',
    stop_reason: stopReason ?? 'player_response',
    working_state: workingState,
    contributions,
    npc_decisions: npcDecisions,
    processed_boundary_ids: processedBoundaryIds,
    temporal_boundary_refs: temporalBoundaryRefs,
    time_budget: {
      total_minutes: finalBudgetMinutes,
      elapsed_minutes: elapsedMinutes,
      remaining_minutes: finalBudgetMinutes - elapsedMinutes,
      status: stopReason === 'temporal_boundary' ? 'paused' : 'completed'
    },
    completed_contribution_count: completedCount,
    applied_contribution_count: appliedCount,
    handoff,
    session_status: sessionStatus,
    pending_player_execution: null,
    pending_npc_execution: nextPending
  });
}

async function applyTerminalNpcOutcomes(
  ports,
  callPort,
  fail,
  workingState,
  terminalOutcomes
) {
  if (typeof ports.applyNpcTerminalOutcomes !== 'function') {
    fail('TURN_CONVERSATION_PORT_MISSING',
      'Terminal NPC outcomes require one application port');
  }
  const next = await callPort(
    ports.applyNpcTerminalOutcomes,
    { working_state: workingState, terminal_outcomes: terminalOutcomes },
    'TURN_CONVERSATION_NPC_TERMINAL_APPLY_FAILED',
    'Terminal NPC outcomes could not be applied'
  );
  if (next === null || typeof next !== 'object' || Array.isArray(next)
      || next.working_state === null
      || typeof next.working_state !== 'object'
      || Array.isArray(next.working_state)
      || !['active', 'ended'].includes(next.session_status)) {
    fail('TURN_CONVERSATION_NPC_TERMINAL_APPLY_INVALID',
      'Terminal NPC outcomes must return working state and session status');
  }
  return {
    workingState: next.working_state,
    sessionStatus: next.session_status
  };
}

function pendingUnavailableOutcome(pending) {
  return {
    npc_ref: pending.plan.speaker_ref,
    same_time_batch_ref: pending.same_time_batch_ref,
    outcome: 'npc_unavailable',
    signal_ids_to_consume: [],
    source_decision_trace_ref: pending.source_decision_trace_ref
  };
}

function pendingRecord({ pending, plan, boundaryId, contributionIndex,
  remainingMinutes, remainingExchangeMinutes, remainingRefs,
  checkResult = pending.check_result,
  socialDeliveryResult = pending.social_delivery_result,
  sourceDecisionTraceRef = pending.source_decision_trace_ref }) {
  return {
    plan,
    boundary_id: boundaryId,
    contribution_index: contributionIndex,
    remaining_minutes: remainingMinutes,
    remaining_exchange_minutes: remainingExchangeMinutes,
    remaining_responder_refs: remainingRefs,
    same_time_batch_ref: pending.same_time_batch_ref,
    check_result: checkResult,
    social_delivery_result: socialDeliveryResult,
    source_decision_trace_ref: sourceDecisionTraceRef
  };
}

function plannedNpcMinutes({
  remainingMinutes,
  queuedBoundaries,
  plan,
  priorNpcDecisionCount
}) {
  const queuedKeys = new Set(queuedBoundaries.map(({ npc_ref: npcRef }) =>
    refKey(npcRef)));
  if (['leave_conversation', 'action_handoff', 'combat_handoff'].includes(
    plan.contribution_kind
  )) {
    queuedKeys.clear();
  }
  if (plan.contribution_kind === 'silence'
      && priorNpcDecisionCount > 0
      && remainingMinutes > 1) {
    return 1;
  }
  const expectedRefs = plan.speech?.response_expectation?.kind === 'none'
    ? [] : plan.speech?.response_expectation?.target_refs ?? [];
  for (const reference of expectedRefs) {
    queuedKeys.add(refKey(reference));
  }
  return queuedKeys.size > 0 ? 1 : remainingMinutes;
}

function refKey(reference) {
  return `${reference.entity_kind}\u0000${reference.entity_id}`;
}
