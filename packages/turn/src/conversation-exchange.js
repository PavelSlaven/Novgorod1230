import { deepFreeze } from '@rus/kernel';
import { turnFailure } from './errors.js';
import { requestNpcSemanticDecision } from './npc-semantic-decision.js';
import { startPlayerConversationContribution } from
  './conversation-exchange-player.js';
import { startNpcConversationContribution } from
  './conversation-exchange-npc-initial.js';
import {
  decisionPairKey,
  normalizeNpcBoundaryBatch,
  normalizeNpcDecision
} from
  './conversation-exchange-npc-batch.js';
import { normalizeConversationExchangeInput } from
  './conversation-exchange-input.js';
import { resumePendingNpcExecution } from
  './conversation-exchange-resume.js';
import { contributionSlices, plannedNpcContributionMinutes } from
  './conversation-exchange-time.js';
import { resolveNpcContributionSocialCheck } from
  './conversation-exchange-social-check.js';
const SESSION_STATUSES = new Set(['active', 'suspended', 'ended']);
const APPLY_RESULT_KEYS = [
  'working_state',
  'contribution_event',
  'player_response_boundary',
  'session_status',
  'handoff'
];
function fail(code, message, details = {}) {
  throw turnFailure(code, message, details);
}

function causeMessage(error) { return error instanceof Error ? error.message : String(error); }

function plainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys) {
  return plainRecord(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function clone(value, code, message) {
  try {
    return structuredClone(value);
  } catch {
    fail(code, message);
  }
}

function immutableClone(value) {
  return deepFreeze(structuredClone(value));
}

function requirePorts(ports, npcInitiated) {
  if (!plainRecord(ports)) {
    fail('TURN_CONVERSATION_PORT_MISSING', 'Conversation exchange ports are required');
  }
  const required = [
    'advanceContributionTime',
    'revalidateAfterContribution',
    'buildNpcResponseBoundaries',
    'buildNpcResponseDecision',
    'npcSemanticModel',
    'revalidateNpcStateVersion',
    'applyNpcContribution',
    'projectNpcContributionPerception'
  ];
  if (!npcInitiated) required.push(
    'conversationModel', 'revalidatePlayerStateVersion',
    'applyPlayerContribution', 'projectPlayerContributionPerception');
  for (const port of required) {
    if (typeof ports[port] !== 'function') {
      fail(
        'TURN_CONVERSATION_PORT_MISSING',
        `${port} must be an injected function`,
        { port }
      );
    }
  }
  for (const validator of ['validatePlayerPlan', 'validateNpcPlan']) {
    if (ports[validator] !== undefined
        && typeof ports[validator] !== 'function') {
      fail('TURN_CONVERSATION_PORT_MISSING',
        `${validator} must be an injected function when provided`,
        { port: validator });
    }
  }
  if (ports.resolveNpcContributionCheck !== undefined
      && typeof ports.resolveNpcContributionCheck !== 'function') {
    fail('TURN_CONVERSATION_PORT_MISSING',
      'resolveNpcContributionCheck must be an injected function when provided',
      { port: 'resolveNpcContributionCheck' });
  }
}

function normalizeTimeProgress(value) {
  if (!exactKeys(value, [
    'working_state', 'temporal_boundary_refs', 'session_status',
    'elapsed_minutes', 'completed', 'interrupted'
  ]) || !plainRecord(value.working_state)
      || !Array.isArray(value.temporal_boundary_refs)
      || !SESSION_STATUSES.has(value.session_status)
      || !Number.isSafeInteger(value.elapsed_minutes)
      || value.elapsed_minutes < 0
      || typeof value.completed !== 'boolean'
      || typeof value.interrupted !== 'boolean') {
    fail(
      'TURN_CONVERSATION_TIME_PROGRESS_INVALID',
      'Contribution time progress must return exact working state and boundaries'
    );
  }
  return immutableClone(value);
}

async function progressAndProject({
  ports,
  applied,
  plan,
  contributionIndex,
  perceptionPort,
  request = null,
  proposal = null,
  plannedMinutes,
  elapsedAlreadyComplete = false
}) {
  if (elapsedAlreadyComplete) {
    await callPort(
      ports.revalidateAfterContribution,
      {
        working_state: applied.working_state,
        contribution_event: applied.contribution_event,
        contribution_index: contributionIndex
      },
      'TURN_CONVERSATION_STALE_AFTER_TIME',
      'Conversation state changed before completed contribution perception'
    );
    const projected = normalizeApplyResult(await callPort(
      perceptionPort,
      {
        working_state: applied.working_state,
        contribution_event: applied.contribution_event,
        plan,
        contribution_index: contributionIndex,
        request,
        proposal
      },
      'TURN_CONVERSATION_PERCEPTION_FAILED',
      'Conversation contribution perception could not be projected'
    ), 'TURN_CONVERSATION_PERCEPTION_INVALID');
    return {
      applied: immutableClone(projected),
      temporalBoundaryRefs: [],
      elapsedMinutes: 0,
      completed: true,
      interrupted: false
    };
  }
  const progressed = normalizeTimeProgress(await callPort(
    ports.advanceContributionTime,
    {
      working_state: applied.working_state,
      contribution_event: applied.contribution_event,
      plan,
      contribution_index: contributionIndex,
      planned_duration_minutes: plannedMinutes
    },
    'TURN_CONVERSATION_TIME_PROGRESS_FAILED',
    'Conversation contribution time could not be advanced'
  ));
  await callPort(
    ports.revalidateAfterContribution,
    {
      working_state: progressed.working_state,
      contribution_event: applied.contribution_event,
      contribution_index: contributionIndex
    },
    'TURN_CONVERSATION_STALE_AFTER_TIME',
    'Conversation state changed while contribution time advanced'
  );
  if (!progressed.completed || progressed.interrupted) {
    return {
      applied: immutableClone({
        ...applied,
        working_state: progressed.working_state,
        session_status: progressed.session_status
      }),
      temporalBoundaryRefs: progressed.temporal_boundary_refs,
      elapsedMinutes: progressed.elapsed_minutes,
      completed: progressed.completed,
      interrupted: progressed.interrupted
    };
  }
  const projected = normalizeApplyResult(await callPort(
    perceptionPort,
    {
      working_state: progressed.working_state,
      contribution_event: applied.contribution_event,
      plan,
      contribution_index: contributionIndex,
      request,
      proposal
    },
    'TURN_CONVERSATION_PERCEPTION_FAILED',
    'Conversation contribution perception could not be projected'
  ), 'TURN_CONVERSATION_PERCEPTION_INVALID');
  return {
    applied: immutableClone({
      ...projected,
      session_status: progressed.interrupted
        ? progressed.session_status
        : projected.session_status
    }),
    temporalBoundaryRefs: progressed.temporal_boundary_refs,
    elapsedMinutes: progressed.elapsed_minutes,
    completed: progressed.completed,
    interrupted: progressed.interrupted
  };
}

function normalizeApplyResult(value, code) {
  if (!exactKeys(value, APPLY_RESULT_KEYS)
    || !plainRecord(value.working_state)
    || !plainRecord(value.contribution_event)
    || typeof value.player_response_boundary !== 'boolean'
    || !SESSION_STATUSES.has(value.session_status)
    || !(value.handoff === null || plainRecord(value.handoff))) {
    fail(code, 'Contribution applier returned an invalid result');
  }
  return clone(value, code, 'Contribution applier result must be cloneable');
}

async function callPort(port, argument, failureCode, failureMessage) {
  try {
    return await port(immutableClone(argument));
  } catch (error) {
    throw turnFailure(failureCode, failureMessage, { cause: causeMessage(error) });
  }
}

function stopAfterApply(applied) {
  if (applied.session_status === 'ended') return 'session_ended';
  if (applied.handoff !== null) return 'handoff';
  if (applied.session_status === 'suspended') return 'session_suspended';
  if (applied.player_response_boundary) return 'player_response';
  return null;
}

export async function runConversationExchange(input = {}, ports = {}) {
  const normalized = normalizeConversationExchangeInput(input);
  requirePorts(ports, normalized.initialNpcDecision !== null);
  if (normalized.pendingNpcExecution !== null) {
    if (typeof ports.applyPendingNpcContribution !== 'function'
        || typeof ports.revalidatePendingNpcContribution !== 'function') {
      fail(
        'TURN_CONVERSATION_PORT_MISSING',
        'Pending NPC resume requires revalidation and application ports'
      );
    }
    return resumePendingNpcExecution(normalized, ports, {
      callPort, fail, immutableClone, normalizeApplyResult,
      progressAndProject, stopAfterApply
    });
  }
  const timeSlices = contributionSlices(normalized.timeBudget);
  const totalBudgetMinutes = normalized.timeBudget.total_minutes;
  const sameTimestamp = normalized.timeBudget.mode === 'same_timestamp';
  let elapsedBudgetMinutes = 0;
  let completedContributionCount = 0;
  let appliedContributionCount = 0;
  const initialNpc = normalized.initialNpcDecision === null ? null
    : normalizeNpcDecision(normalized.initialNpcDecision,
      normalized.initialNpcDecision.boundary);
  const initial = initialNpc === null ? await startPlayerConversationContribution({
    normalized, ports, fail, callPort, normalizeApplyResult,
    progressAndProject, plannedMinutes: timeSlices[0]
  }) : await startNpcConversationContribution({
    decision: initialNpc, normalized, ports, callPort, normalizeApplyResult,
    progressAndProject, plannedMinutes: timeSlices[0]
  });
  const playerProgress = initial.progress ?? initial.playerProgress;
  const playerResult = playerProgress.applied;

  let workingState = playerResult.working_state;
  let latestContribution = playerResult.contribution_event;
  let handoff = playerResult.handoff;
  let sessionStatus = playerResult.session_status;
  let stopReason = stopAfterApply(playerResult);
  const contributions = playerProgress.completed && !playerProgress.interrupted
    ? [playerResult.contribution_event]
    : [];
  const npcDecisions = initialNpc === null ? [] : [initial.decision];
  const processedBoundaryIds = initialNpc === null ? []
    : [initial.decision.boundary.boundary_id];
  const processedBoundaryIdSet = new Set(processedBoundaryIds);
  const processedDecisionPairs = new Set(initialNpc === null ? []
    : [decisionPairKey(initial.decision.boundary)]);
  let queuedNpcBoundaries = [];
  let pendingPlayerExecution = null;
  let pendingNpcExecution = null;
  const temporalBoundaryRefs = [...playerProgress.temporalBoundaryRefs];
  elapsedBudgetMinutes += playerProgress.elapsedMinutes;
  if (playerProgress.completed) completedContributionCount += 1;
  if (playerProgress.completed && !playerProgress.interrupted) {
    appliedContributionCount += 1;
  }
  if (playerProgress.interrupted) {
    if (initialNpc !== null) {
      fail('TURN_CONVERSATION_NPC_INITIAL_INTERRUPTED',
        'NPC-initiated contribution cannot pause before its first committed contribution');
    }
    const plannedPlayerMinutes = initial.pendingPlayer?.remaining_minutes
      ?? timeSlices[0];
    pendingPlayerExecution = immutableClone({
      plan: initial.playerPlan,
      contribution_index: 1,
      remaining_minutes:
        plannedPlayerMinutes - playerProgress.elapsedMinutes,
      remaining_exchange_minutes:
        totalBudgetMinutes - elapsedBudgetMinutes
    });
    stopReason = 'temporal_boundary';
  }

  while (stopReason === null) {
    if (contributions.length >= normalized.maxContributionsPerExchange) {
      stopReason = 'exchange_limit';
      break;
    }
    const rawBatch = await callPort(
      ports.buildNpcResponseBoundaries,
      {
        working_state: workingState,
        latest_contribution: latestContribution,
        processed_boundary_ids: processedBoundaryIds,
        pending_boundaries: queuedNpcBoundaries
      },
      'TURN_CONVERSATION_NPC_BATCH_BUILD_FAILED',
      'NPC response boundary batch could not be built'
    );
    const batch = normalizeNpcBoundaryBatch(
      rawBatch,
      processedBoundaryIdSet,
      processedDecisionPairs
    );
    queuedNpcBoundaries = [...batch.boundaries];
    if (queuedNpcBoundaries.length === 0) {
      stopReason = 'player_response';
      break;
    }
    if (!sameTimestamp && elapsedBudgetMinutes >= totalBudgetMinutes) {
      stopReason = 'exchange_budget';
      break;
    }
    const boundary = queuedNpcBoundaries.shift();
    const decision = normalizeNpcDecision(await callPort(
      ports.buildNpcResponseDecision,
      {
        working_state: workingState,
        latest_contribution: latestContribution,
        boundary
      },
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
    const npcCheck = await resolveNpcContributionSocialCheck({
      plan: proposal.plan,
      request: decision.request,
      boundary: decision.boundary,
      resolver: ports.resolveNpcContributionCheck
    });
    const rawNpcResult = await callPort(
      ports.applyNpcContribution,
      {
        working_state: workingState,
        boundary: decision.boundary,
        request: decision.request,
        proposal,
        check_result: npcCheck.check_result,
        social_delivery_result: npcCheck.social_delivery_result,
        contribution_index: contributions.length + 1
      },
      'TURN_CONVERSATION_NPC_APPLY_FAILED',
      'NPC conversation contribution could not be applied'
    );
    const npcApplied = normalizeApplyResult(
      rawNpcResult,
      'TURN_CONVERSATION_NPC_APPLY_INVALID'
    );
    const remainingBudgetMinutes = totalBudgetMinutes
      - elapsedBudgetMinutes;
    const plannedMinutes = plannedNpcContributionMinutes({
      defaultMinutes: timeSlices[contributions.length]
        ?? remainingBudgetMinutes,
      remainingBudgetMinutes,
      queuedBoundaries: queuedNpcBoundaries,
      plan: proposal.plan,
      priorNpcDecisionCount: npcDecisions.length,
      sameTimestamp
    });
    const npcProgress = await progressAndProject({
      ports,
      applied: npcApplied,
      plan: proposal.plan,
      contributionIndex: contributions.length + 1,
      plannedMinutes,
      perceptionPort: ports.projectNpcContributionPerception,
      request: decision.request,
      proposal
    });
    const npcResult = npcProgress.applied;

    workingState = npcResult.working_state;
    latestContribution = npcResult.contribution_event;
    handoff = npcResult.handoff;
    sessionStatus = npcResult.session_status;
    if (npcProgress.completed && !npcProgress.interrupted) {
      contributions.push(npcResult.contribution_event);
    }
    npcDecisions.push({
      boundary: decision.boundary,
      request: decision.request,
      proposal
    });
    processedBoundaryIds.push(decision.boundary.boundary_id);
    processedBoundaryIdSet.add(decision.boundary.boundary_id);
    processedDecisionPairs.add(decisionPairKey(decision.boundary));
    stopReason = stopAfterApply(npcResult);
    temporalBoundaryRefs.push(...npcProgress.temporalBoundaryRefs);
    elapsedBudgetMinutes += npcProgress.elapsedMinutes;
    if (npcProgress.completed) completedContributionCount += 1;
    if (npcProgress.completed && !npcProgress.interrupted) {
      appliedContributionCount += 1;
    }
    if (npcProgress.interrupted) {
      pendingNpcExecution = immutableClone({
        plan: proposal.plan,
        boundary_id: decision.boundary.boundary_id,
        contribution_index: contributions.length + 1,
        remaining_minutes: plannedMinutes - npcProgress.elapsedMinutes,
        remaining_exchange_minutes:
          totalBudgetMinutes - elapsedBudgetMinutes,
        remaining_responder_refs: queuedNpcBoundaries.map(
          ({ npc_ref: npcRef }) => npcRef),
        same_time_batch_ref: decision.boundary.same_time_batch_ref,
        check_result: npcCheck.check_result,
        social_delivery_result: npcCheck.social_delivery_result,
        source_decision_trace_ref: {
          entity_kind: 'npc_decision_trace',
          entity_id: decision.request.request_id
        }
      });
      stopReason = 'temporal_boundary';
    } else if ([null, 'player_response'].includes(stopReason)) {
      stopReason = null;
    }
  }
  const finalBudgetMinutes = stopReason === 'temporal_boundary'
    ? totalBudgetMinutes : elapsedBudgetMinutes;

  return immutableClone({
    schema: 'conversation_exchange_result_v1',
    status: sessionStatus === 'ended' ? 'resolved' : 'player_response_required',
    stop_reason: stopReason,
    working_state: workingState,
    contributions,
    npc_decisions: npcDecisions,
    processed_boundary_ids: processedBoundaryIds,
    temporal_boundary_refs: temporalBoundaryRefs,
    time_budget: {
      total_minutes: finalBudgetMinutes,
      elapsed_minutes: elapsedBudgetMinutes,
      remaining_minutes: finalBudgetMinutes - elapsedBudgetMinutes,
      status: stopReason === 'temporal_boundary' ? 'paused' : 'completed'
    },
    completed_contribution_count: completedContributionCount,
    applied_contribution_count: appliedContributionCount,
    handoff,
    session_status: sessionStatus,
    pending_player_execution: pendingPlayerExecution,
    pending_npc_execution: pendingNpcExecution
  });
}
