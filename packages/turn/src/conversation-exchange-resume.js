import { requestNpcSemanticDecision } from './npc-semantic-decision.js';
import {
  normalizeNpcBoundaryBatch,
  normalizeNpcDecision
} from './conversation-exchange-npc-batch.js';

export async function resumePendingNpcExecution(normalized, ports, helpers) {
  const { callPort, fail, immutableClone, normalizeApplyResult,
    progressAndProject, stopAfterApply } = helpers;
  const pending = normalized.pendingNpcExecution;
  const firstApplied = normalizeApplyResult(await callPort(
    ports.applyPendingNpcContribution,
    { working_state: normalized.initialWorkingState, plan: pending.plan,
      contribution_index: pending.contribution_index },
    'TURN_CONVERSATION_NPC_APPLY_FAILED',
    'Persisted NPC conversation contribution could not be resumed'
  ), 'TURN_CONVERSATION_NPC_APPLY_INVALID');
  const firstProgress = await progressAndProject({
    ports, applied: firstApplied, plan: pending.plan,
    contributionIndex: pending.contribution_index,
    plannedMinutes: pending.remaining_minutes,
    perceptionPort: ports.projectNpcContributionPerception,
    proposal: { plan: pending.plan, signal_ids_to_consume: [] }
  });
  let workingState = firstProgress.applied.working_state;
  let sessionStatus = firstProgress.applied.session_status;
  let handoff = firstProgress.applied.handoff;
  let elapsedMinutes = firstProgress.elapsedMinutes;
  let completedCount = firstProgress.completed ? 1 : 0;
  let appliedCount = firstProgress.completed && !firstProgress.interrupted
    ? 1 : 0;
  const contributions = appliedCount === 1
    ? [firstProgress.applied.contribution_event] : [];
  const npcDecisions = [];
  const temporalBoundaryRefs = [...firstProgress.temporalBoundaryRefs];
  const processedBoundaryIds = [pending.boundary_id];
  const processedNpcRefs = [pending.plan.speaker_ref];
  let remainingRefs = [...pending.remaining_responder_refs];
  let nextPending = firstProgress.interrupted ? pendingRecord({
    pending,
    plan: pending.plan,
    boundaryId: pending.boundary_id,
    contributionIndex: pending.contribution_index,
    remainingMinutes: pending.remaining_minutes - firstProgress.elapsedMinutes,
    remainingExchangeMinutes:
      pending.remaining_exchange_minutes - firstProgress.elapsedMinutes,
    remainingRefs
  }) : null;
  let stopReason = firstProgress.interrupted
    ? 'temporal_boundary' : stopAfterApply(firstProgress.applied);

  if (!firstProgress.interrupted
      && [null, 'player_response'].includes(stopReason)) {
    let queuedMinutes = pending.remaining_exchange_minutes
      - pending.remaining_minutes;
    let latestContribution = firstProgress.applied.contribution_event;
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
      ), new Set(processedBoundaryIds), new Set());
      const requiredKeys = new Set(remainingRefs.map(refKey));
      const availableKeys = new Set(batch.boundaries.map(
        ({ npc_ref: npcRef }) => refKey(npcRef)));
      if ([...requiredKeys].some((key) => !availableKeys.has(key))) {
        fail('TURN_CONVERSATION_PENDING_NPC_QUEUE_INVALID',
          'Pending NPC responders must rebuild one exact boundary each');
      }
      if (batch.boundaries.length === 0) {
        remainingRefs = [];
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
        validatePlan: ports.validateNpcPlan ?? null
      });
      const contributionIndex = pending.contribution_index
        + contributions.length;
      const plannedMinutes = plannedNpcMinutes({
        remainingMinutes: queuedMinutes,
        queuedBoundaries,
        plan: proposal.plan,
        processedNpcRefs
      });
      const applied = normalizeApplyResult(await callPort(
        ports.applyNpcContribution,
        { working_state: workingState, boundary: decision.boundary,
          request: decision.request, proposal,
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
    pending_npc_execution: nextPending
  });
}

function pendingRecord({ pending, plan, boundaryId, contributionIndex,
  remainingMinutes, remainingExchangeMinutes, remainingRefs,
  sourceDecisionTraceRef = pending.source_decision_trace_ref }) {
  return {
    plan,
    boundary_id: boundaryId,
    contribution_index: contributionIndex,
    remaining_minutes: remainingMinutes,
    remaining_exchange_minutes: remainingExchangeMinutes,
    remaining_responder_refs: remainingRefs,
    same_time_batch_ref: pending.same_time_batch_ref,
    source_decision_trace_ref: sourceDecisionTraceRef
  };
}

function plannedNpcMinutes({
  remainingMinutes,
  queuedBoundaries,
  plan,
  processedNpcRefs
}) {
  const queuedKeys = new Set(queuedBoundaries.map(({ npc_ref: npcRef }) =>
    refKey(npcRef)));
  const processedKeys = new Set(processedNpcRefs.map(refKey));
  const expectedRefs = plan.speech?.response_expectation?.kind === 'none'
    ? [] : plan.speech?.response_expectation?.target_refs ?? [];
  let recurrentResponse = false;
  for (const reference of expectedRefs) {
    queuedKeys.add(refKey(reference));
    if (processedKeys.has(refKey(reference))) recurrentResponse = true;
  }
  return Math.max(recurrentResponse ? 0 : 1, remainingMinutes - Math.min(
    queuedKeys.size,
    Math.max(0, remainingMinutes - (recurrentResponse ? 0 : 1))
  ));
}

function refKey(reference) {
  return `${reference.entity_kind}\u0000${reference.entity_id}`;
}
