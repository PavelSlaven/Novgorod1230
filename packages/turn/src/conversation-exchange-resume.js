import { requestNpcSemanticDecision } from './npc-semantic-decision.js';
import { normalizeNpcBatch } from './conversation-exchange-npc-batch.js';

export async function resumePendingNpcExecution(normalized, ports, helpers) {
  const { callPort, fail, immutableClone, normalizeApplyResult,
    normalizeTimeProgress, progressAndProject, stopAfterApply } = helpers;
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
      && remainingRefs.length > 0
      && [null, 'player_response'].includes(stopReason)) {
    const batch = normalizeNpcBatch(await callPort(
      ports.buildNpcResponseBatch,
      { working_state: workingState,
        latest_contribution: firstProgress.applied.contribution_event,
        processed_boundary_ids: processedBoundaryIds,
        same_time_batch_ref: pending.same_time_batch_ref },
      'TURN_CONVERSATION_NPC_BATCH_BUILD_FAILED',
      'NPC response batch could not be built'
    ), new Set(processedBoundaryIds), new Set());
    const remainingKeys = new Set(remainingRefs.map(refKey));
    const queue = batch.decisions.filter(({ request }) =>
      remainingKeys.has(refKey(request.npc_ref)));
    if (queue.length !== remainingKeys.size
        || new Set(queue.map(({ request }) => refKey(request.npc_ref))).size
          !== remainingKeys.size) {
      fail('TURN_CONVERSATION_PENDING_NPC_QUEUE_INVALID',
        'Pending NPC responders must rebuild one exact decision each');
    }
    const queuedMinutes = pending.remaining_exchange_minutes
      - pending.remaining_minutes;
    const slices = contributionSlices(queuedMinutes, queue.length);
    for (let index = 0; index < queue.length; index += 1) {
      const decision = queue[index];
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
        plannedMinutes: slices[index],
        perceptionPort: ports.projectNpcContributionPerception,
        request: decision.request, proposal
      });
      workingState = progress.applied.working_state;
      sessionStatus = progress.applied.session_status;
      handoff = progress.applied.handoff;
      elapsedMinutes += progress.elapsedMinutes;
      if (progress.completed) completedCount += 1;
      if (progress.completed && !progress.interrupted) {
        appliedCount += 1;
        contributions.push(progress.applied.contribution_event);
      }
      npcDecisions.push({ boundary: decision.boundary,
        request: decision.request, proposal });
      processedBoundaryIds.push(decision.boundary.boundary_id);
      remainingRefs = remainingRefs.filter((reference) =>
        refKey(reference) !== refKey(decision.request.npc_ref));
      temporalBoundaryRefs.push(...progress.temporalBoundaryRefs);
      stopReason = stopAfterApply(progress.applied);
      if (progress.interrupted) {
        nextPending = pendingRecord({ pending, plan: proposal.plan,
          boundaryId: decision.boundary.boundary_id, contributionIndex,
          remainingMinutes: slices[index] - progress.elapsedMinutes,
          remainingExchangeMinutes:
            pending.remaining_exchange_minutes - elapsedMinutes,
          remainingRefs });
        stopReason = 'temporal_boundary';
        break;
      }
      if (remainingRefs.length > 0 && stopReason === 'player_response') {
        stopReason = null;
      }
    }
  }

  const tailMinutes = pending.remaining_exchange_minutes - elapsedMinutes;
  if (stopReason !== 'temporal_boundary' && tailMinutes > 0) {
    const tail = normalizeTimeProgress(await callPort(
      ports.completeExchangeTime,
      { working_state: workingState,
        planned_duration_minutes: tailMinutes },
      'TURN_CONVERSATION_TIME_PROGRESS_FAILED',
      'Conversation exchange remaining time could not be advanced'
    ));
    workingState = tail.working_state;
    elapsedMinutes += tail.elapsed_minutes;
    temporalBoundaryRefs.push(...tail.temporal_boundary_refs);
    if (tail.interrupted) stopReason = 'temporal_boundary';
  }
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
      total_minutes: pending.remaining_exchange_minutes,
      elapsed_minutes: elapsedMinutes,
      remaining_minutes:
        pending.remaining_exchange_minutes - elapsedMinutes,
      status: elapsedMinutes === pending.remaining_exchange_minutes
        ? 'completed' : 'paused'
    },
    completed_contribution_count: completedCount,
    applied_contribution_count: appliedCount,
    handoff,
    session_status: sessionStatus,
    pending_npc_execution: nextPending
  });
}

function pendingRecord({ pending, plan, boundaryId, contributionIndex,
  remainingMinutes, remainingExchangeMinutes, remainingRefs }) {
  return {
    plan,
    boundary_id: boundaryId,
    contribution_index: contributionIndex,
    remaining_minutes: remainingMinutes,
    remaining_exchange_minutes: remainingExchangeMinutes,
    remaining_responder_refs: remainingRefs,
    same_time_batch_ref: pending.same_time_batch_ref,
    source_decision_trace_ref: pending.source_decision_trace_ref
  };
}

function contributionSlices(total, count) {
  if (count === 0) return [];
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, index) =>
    base + (index < total % count ? 1 : 0));
}

function refKey(reference) {
  return `${reference.entity_kind}\u0000${reference.entity_id}`;
}
