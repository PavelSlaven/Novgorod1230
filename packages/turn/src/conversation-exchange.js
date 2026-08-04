import { deepFreeze } from '@rus/kernel';
import { validatePlayerConversationInput } from '@rus/npc-runtime';
import { turnFailure } from './errors.js';
import { requestNpcSemanticDecision } from './npc-semantic-decision.js';
import { requestPlayerConversationContribution } from './player-conversation.js';
import { decisionPairKey, normalizeNpcBatch } from
  './conversation-exchange-npc-batch.js';

const DEFAULT_EXCHANGE_LIMIT = 8;
const MAX_EXCHANGE_LIMIT = 32;
const SESSION_STATUSES = new Set(['active', 'suspended', 'ended']);
const INPUT_KEYS = new Set([
  'playerRequest',
  'initialWorkingState',
  'maxContributionsPerExchange',
  'timeBudget'
]);
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

function causeMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

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

function clonePlainRecord(value, code, message) {
  if (!plainRecord(value)) fail(code, message);
  return clone(value, code, message);
}

function normalizeInput(input) {
  if (!plainRecord(input)
    || Object.keys(input).some((key) => !INPUT_KEYS.has(key))
    || !Object.hasOwn(input, 'playerRequest')
    || !Object.hasOwn(input, 'initialWorkingState')
    || !validatePlayerConversationInput(input.playerRequest)) {
    fail(
      'TURN_CONVERSATION_EXCHANGE_INPUT_INVALID',
      'Conversation exchange input must contain an exact formal player request and working state'
    );
  }

  const maxContributionsPerExchange = input.maxContributionsPerExchange
    ?? DEFAULT_EXCHANGE_LIMIT;
  if (!Number.isSafeInteger(maxContributionsPerExchange)
    || maxContributionsPerExchange < 1
    || maxContributionsPerExchange > MAX_EXCHANGE_LIMIT) {
    fail(
      'TURN_CONVERSATION_EXCHANGE_INPUT_INVALID',
      'maxContributionsPerExchange must be a positive safe integer no greater than 32'
    );
  }

  const timeBudget = input.timeBudget;
  if (!exactKeys(timeBudget, ['total_minutes', 'contribution_slots'])
      || !Number.isSafeInteger(timeBudget.total_minutes)
      || timeBudget.total_minutes < 1
      || !Number.isSafeInteger(timeBudget.contribution_slots)
      || timeBudget.contribution_slots < 1
      || timeBudget.contribution_slots > maxContributionsPerExchange
      || timeBudget.contribution_slots > timeBudget.total_minutes) {
    fail(
      'TURN_CONVERSATION_EXCHANGE_INPUT_INVALID',
      'timeBudget must define one positive whole-exchange budget and bounded contribution slots'
    );
  }

  return {
    playerRequest: clone(input.playerRequest,
      'TURN_CONVERSATION_EXCHANGE_INPUT_INVALID',
      'playerRequest must be cloneable'),
    initialWorkingState: clonePlainRecord(
      input.initialWorkingState,
      'TURN_CONVERSATION_EXCHANGE_INPUT_INVALID',
      'initialWorkingState must be a plain cloneable object'
    ),
    maxContributionsPerExchange,
    timeBudget: structuredClone(timeBudget)
  };
}

function requirePorts(ports) {
  if (!plainRecord(ports)) {
    fail('TURN_CONVERSATION_PORT_MISSING', 'Conversation exchange ports are required');
  }
  const required = [
    'conversationModel',
    'revalidatePlayerStateVersion',
    'applyPlayerContribution',
    'advanceContributionTime',
    'completeExchangeTime',
    'revalidateAfterContribution',
    'projectPlayerContributionPerception',
    'buildNpcResponseBatch',
    'npcSemanticModel',
    'revalidateNpcStateVersion',
    'applyNpcContribution',
    'projectNpcContributionPerception'
  ];
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
  plannedMinutes
}) {
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

function contributionSlices({ total_minutes: total, contribution_slots: slots }) {
  const quotient = Math.floor(total / slots);
  const remainder = total % slots;
  return Array.from({ length: slots }, (_, index) =>
    quotient + (index < remainder ? 1 : 0));
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
  const normalized = normalizeInput(input);
  requirePorts(ports);
  const timeSlices = contributionSlices(normalized.timeBudget);
  let elapsedBudgetMinutes = 0;
  let completedContributionCount = 0;
  let appliedContributionCount = 0;

  const playerDecision = await requestPlayerConversationContribution({
    request: normalized.playerRequest,
    conversationModel: ports.conversationModel,
    revalidateStateVersion: ports.revalidatePlayerStateVersion,
    validatePlan: ports.validatePlayerPlan ?? null
  });
  const rawPlayerResult = await callPort(
    ports.applyPlayerContribution,
    {
      working_state: normalized.initialWorkingState,
      plan: playerDecision.plan,
      contribution_index: 1
    },
    'TURN_CONVERSATION_PLAYER_APPLY_FAILED',
    'Player conversation contribution could not be applied'
  );
  const playerApplied = normalizeApplyResult(
    rawPlayerResult,
    'TURN_CONVERSATION_PLAYER_APPLY_INVALID'
  );
  const playerProgress = await progressAndProject({
    ports,
    applied: playerApplied,
    plan: playerDecision.plan,
    contributionIndex: 1,
    plannedMinutes: timeSlices[0],
    perceptionPort: ports.projectPlayerContributionPerception
  });
  const playerResult = playerProgress.applied;

  let workingState = playerResult.working_state;
  let latestContribution = playerResult.contribution_event;
  let handoff = playerResult.handoff;
  let sessionStatus = playerResult.session_status;
  let stopReason = stopAfterApply(playerResult);
  const contributions = [playerResult.contribution_event];
  const npcDecisions = [];
  const processedBoundaryIds = [];
  const processedBoundaryIdSet = new Set();
  const processedDecisionPairs = new Set();
  const temporalBoundaryRefs = [...playerProgress.temporalBoundaryRefs];
  elapsedBudgetMinutes += playerProgress.elapsedMinutes;
  if (playerProgress.completed) completedContributionCount += 1;
  if (playerProgress.completed && !playerProgress.interrupted) {
    appliedContributionCount += 1;
  }
  if (playerProgress.interrupted) {
    stopReason = 'temporal_boundary';
  }

  while (stopReason === null) {
    if (contributions.length >= normalized.maxContributionsPerExchange) {
      stopReason = 'exchange_limit';
      break;
    }

    const rawBatch = await callPort(
      ports.buildNpcResponseBatch,
      {
        working_state: workingState,
        latest_contribution: latestContribution,
        processed_boundary_ids: processedBoundaryIds
      },
      'TURN_CONVERSATION_NPC_BATCH_BUILD_FAILED',
      'NPC response batch could not be built'
    );
    const batch = normalizeNpcBatch(
      rawBatch,
      processedBoundaryIdSet,
      processedDecisionPairs
    );
    if (batch.decisions.length === 0) {
      stopReason = 'player_response';
      break;
    }

    const decision = batch.decisions[0];
    const proposal = await requestNpcSemanticDecision({
      boundary: decision.boundary,
      request: decision.request,
      semanticModel: ports.npcSemanticModel,
      persistedTrace: decision.persisted_trace,
      revalidateStateVersion: ports.revalidateNpcStateVersion,
      validatePlan: ports.validateNpcPlan ?? null
    });
    const rawNpcResult = await callPort(
      ports.applyNpcContribution,
      {
        working_state: workingState,
        boundary: decision.boundary,
        request: decision.request,
        proposal,
        contribution_index: contributions.length + 1
      },
      'TURN_CONVERSATION_NPC_APPLY_FAILED',
      'NPC conversation contribution could not be applied'
    );
    const npcApplied = normalizeApplyResult(
      rawNpcResult,
      'TURN_CONVERSATION_NPC_APPLY_INVALID'
    );
    const npcProgress = await progressAndProject({
      ports,
      applied: npcApplied,
      plan: proposal.plan,
      contributionIndex: contributions.length + 1,
      plannedMinutes: timeSlices[contributions.length]
        ?? normalized.timeBudget.total_minutes - elapsedBudgetMinutes,
      perceptionPort: ports.projectNpcContributionPerception,
      request: decision.request,
      proposal
    });
    const npcResult = npcProgress.applied;

    workingState = npcResult.working_state;
    latestContribution = npcResult.contribution_event;
    handoff = npcResult.handoff;
    sessionStatus = npcResult.session_status;
    contributions.push(npcResult.contribution_event);
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
      stopReason = 'temporal_boundary';
    }
  }

  const remainingBudgetMinutes = normalized.timeBudget.total_minutes
    - elapsedBudgetMinutes;
  if (stopReason !== 'temporal_boundary' && remainingBudgetMinutes > 0) {
    const tail = normalizeTimeProgress(await callPort(
      ports.completeExchangeTime,
      {
        working_state: workingState,
        planned_duration_minutes: remainingBudgetMinutes
      },
      'TURN_CONVERSATION_TIME_PROGRESS_FAILED',
      'Conversation exchange remaining time could not be advanced'
    ));
    workingState = tail.working_state;
    sessionStatus = tail.session_status === 'suspended'
      ? 'suspended' : sessionStatus;
    elapsedBudgetMinutes += tail.elapsed_minutes;
    temporalBoundaryRefs.push(...tail.temporal_boundary_refs);
    if (tail.interrupted) {
      stopReason = 'temporal_boundary';
    }
  }

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
      total_minutes: normalized.timeBudget.total_minutes,
      elapsed_minutes: elapsedBudgetMinutes,
      remaining_minutes:
        normalized.timeBudget.total_minutes - elapsedBudgetMinutes,
      status: elapsedBudgetMinutes === normalized.timeBudget.total_minutes
        ? 'completed' : 'paused'
    },
    completed_contribution_count: completedContributionCount,
    applied_contribution_count: appliedContributionCount,
    handoff,
    session_status: sessionStatus
  });
}
