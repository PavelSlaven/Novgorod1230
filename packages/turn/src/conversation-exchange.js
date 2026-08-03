import { deepFreeze } from '@rus/kernel';
import {
  orderNpcConversationDecisionRequests,
  validateNpcConversationResponseRequest,
  validateNpcDecisionBoundary,
  validateNpcSemanticDecisionTrace,
  validatePlayerConversationInput
} from '@rus/npc-runtime';
import { turnFailure } from './errors.js';
import { requestNpcSemanticDecision } from './npc-semantic-decision.js';
import { requestPlayerConversationContribution } from './player-conversation.js';

const DEFAULT_EXCHANGE_LIMIT = 8;
const MAX_EXCHANGE_LIMIT = 32;
const SESSION_STATUSES = new Set(['active', 'suspended', 'ended']);
const INPUT_KEYS = new Set([
  'playerRequest',
  'initialWorkingState',
  'maxContributionsPerExchange'
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

  return {
    playerRequest: clone(input.playerRequest,
      'TURN_CONVERSATION_EXCHANGE_INPUT_INVALID',
      'playerRequest must be cloneable'),
    initialWorkingState: clonePlainRecord(
      input.initialWorkingState,
      'TURN_CONVERSATION_EXCHANGE_INPUT_INVALID',
      'initialWorkingState must be a plain cloneable object'
    ),
    maxContributionsPerExchange
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
}

function normalizeTimeProgress(value) {
  if (!exactKeys(value, [
    'working_state', 'temporal_boundary_refs', 'session_status'
  ]) || !plainRecord(value.working_state)
      || !Array.isArray(value.temporal_boundary_refs)
      || !SESSION_STATUSES.has(value.session_status)) {
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
  proposal = null
}) {
  const progressed = normalizeTimeProgress(await callPort(
    ports.advanceContributionTime,
    {
      working_state: applied.working_state,
      contribution_event: applied.contribution_event,
      plan,
      contribution_index: contributionIndex
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
      session_status: progressed.temporal_boundary_refs.length > 0
        ? progressed.session_status
        : projected.session_status
    }),
    temporalBoundaryRefs: progressed.temporal_boundary_refs
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

function sameRef(left, right) {
  return left?.entity_kind === right?.entity_kind
    && left?.entity_id === right?.entity_id;
}

function sameRefs(left, right) {
  return left.length === right.length
    && left.every((reference, index) => sameRef(reference, right[index]));
}

function exactBoundaryRequestLink(boundary, request) {
  return boundary.decision_mode === 'conversation'
    && boundary.boundary_id === request.boundary_id
    && sameRef(boundary.npc_ref, request.npc_ref)
    && boundary.state_version === String(request.state_version)
    && boundary.significance === request.decision_reasons.significance
    && boundary.categories.length === request.decision_reasons.categories.length
    && boundary.categories.every((category, index) =>
      category === request.decision_reasons.categories[index])
    && sameRefs(boundary.signal_refs, request.decision_reasons.signal_refs);
}

function decisionPairKey(boundary) {
  return `${boundary.npc_ref.entity_kind}\u0000${boundary.npc_ref.entity_id}`
    + `\u0000${boundary.same_time_batch_ref.entity_kind}`
    + `\u0000${boundary.same_time_batch_ref.entity_id}`;
}

function normalizeNpcBatch(value, processedBoundaryIds, processedDecisionPairs) {
  const batch = clone(value,
    'TURN_CONVERSATION_NPC_BATCH_INVALID',
    'NPC response batch must be cloneable');
  if (!exactKeys(batch, ['decisions', 'direct_addressee_refs'])
    || !Array.isArray(batch.decisions)
    || !Array.isArray(batch.direct_addressee_refs)) {
    fail(
      'TURN_CONVERSATION_NPC_BATCH_INVALID',
      'NPC response batch must contain decisions and direct_addressee_refs arrays'
    );
  }

  const boundaryIds = new Set();
  const requestIds = new Set();
  const batchDecisionPairs = new Set();
  for (const decision of batch.decisions) {
    if (!exactKeys(decision, ['boundary', 'request', 'persisted_trace'])
      || !validateNpcDecisionBoundary(decision.boundary)
      || !validateNpcConversationResponseRequest(decision.request)
      || !exactBoundaryRequestLink(decision.boundary, decision.request)
      || !(decision.persisted_trace === null
        || (plainRecord(decision.persisted_trace)
          && validateNpcSemanticDecisionTrace(decision.persisted_trace, decision.request)))) {
      fail(
        'TURN_CONVERSATION_NPC_BATCH_INVALID',
        'Every NPC response decision must be formal and exactly linked'
      );
    }

    const { boundary_id: boundaryId } = decision.boundary;
    const { request_id: requestId } = decision.request;
    if (boundaryIds.has(boundaryId) || requestIds.has(requestId)) {
      fail(
        'TURN_CONVERSATION_NPC_BATCH_DUPLICATE',
        'NPC response batch contains a duplicate boundary or request'
      );
    }
    if (processedBoundaryIds.has(boundaryId)) {
      fail(
        'TURN_CONVERSATION_NPC_BOUNDARY_REPLAYED',
        'NPC response batch returned an already processed boundary',
        { boundary_id: boundaryId }
      );
    }

    const pairKey = decisionPairKey(decision.boundary);
    if (batchDecisionPairs.has(pairKey) || processedDecisionPairs.has(pairKey)) {
      fail(
        'TURN_CONVERSATION_NPC_DECISION_DUPLICATE',
        'An NPC may have at most one decision per same-time batch in an exchange',
        { boundary_id: boundaryId }
      );
    }
    boundaryIds.add(boundaryId);
    requestIds.add(requestId);
    batchDecisionPairs.add(pairKey);
  }

  let orderedRequests;
  try {
    orderedRequests = orderNpcConversationDecisionRequests(
      batch.decisions.map(({ request }) => request),
      batch.direct_addressee_refs
    );
  } catch (error) {
    throw turnFailure(
      'TURN_CONVERSATION_NPC_BATCH_INVALID',
      'NPC response batch ordering inputs are invalid',
      { cause: causeMessage(error) }
    );
  }
  const decisionsByRequestId = new Map(
    batch.decisions.map((decision) => [decision.request.request_id, decision])
  );
  return {
    decisions: orderedRequests.map((request) =>
      decisionsByRequestId.get(request.request_id)),
    direct_addressee_refs: batch.direct_addressee_refs
  };
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

  const playerDecision = await requestPlayerConversationContribution({
    request: normalized.playerRequest,
    conversationModel: ports.conversationModel,
    revalidateStateVersion: ports.revalidatePlayerStateVersion
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
  if (temporalBoundaryRefs.length > 0) stopReason = 'temporal_boundary';

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
      revalidateStateVersion: ports.revalidateNpcStateVersion
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
    if (npcProgress.temporalBoundaryRefs.length > 0) {
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
    handoff,
    session_status: sessionStatus
  });
}
