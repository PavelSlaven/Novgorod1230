import { isDeepStrictEqual } from 'node:util';
import { deepFreeze } from '@rus/kernel';
import { canonicalDigest } from '@rus/materialization';
import {
  validateConversationContributionPlan,
  validateNpcActionDecisionRequest,
  validateNpcCombatDecisionRequest,
  validateNpcCombatIntentPlan,
  validateNpcConversationResponseRequest,
  validateNpcDecisionBoundary,
  validateNpcSemanticDecisionTrace,
  validateNpcStepPlan
} from '@rus/npc-runtime';
import { turnFailure } from './errors.js';

const inFlightDecisions = new Map();
const MAX_STALE_REBUILDS = 8;

function fail(code, message, details = {}) {
  throw turnFailure(code, message, details);
}

function requestMode(request) {
  if (request?.schema === 'npc_action_decision_request_v1') return 'autonomous';
  if (request?.schema === 'npc_conversation_response_request_v1') return 'conversation';
  if (request?.schema === 'npc_combat_decision_request_v1') return 'combat';
  return null;
}

function requestStateVersion(request, mode) {
  return mode === 'autonomous'
    ? request.committed_state_version
    : Number(request.state_version);
}

function requestNpcId(request, mode) {
  return mode === 'autonomous'
    ? request.npc_ref
    : request.npc_ref.entity_id;
}

function sameReferenceList(left, right) {
  return left.length === right.length
    && left.every((reference, index) => reference.entity_kind === right[index].entity_kind
      && reference.entity_id === right[index].entity_id);
}

function validateRequestForMode(request, mode) {
  return mode === 'autonomous' ? validateNpcActionDecisionRequest(request) : mode === 'combat' ? validateNpcCombatDecisionRequest(request) : validateNpcConversationResponseRequest(request);
}

function validatePlanForMode(plan, request, mode) {
  return mode === 'autonomous' ? validateNpcStepPlan(plan, request) : mode === 'combat' ? validateNpcCombatIntentPlan(plan, request) : validateConversationContributionPlan(plan, request);
}

function requireBoundaryRequestIdentity(boundary, request, mode) {
  const expectedStateVersion = requestStateVersion(request, mode);
  const reasons = request.decision_reasons;
  const matching = boundary.decision_mode === mode
    && boundary.boundary_id === request.boundary_id
    && boundary.npc_ref.entity_id === requestNpcId(request, mode)
    && boundary.state_version === String(expectedStateVersion)
    && boundary.significance === reasons.significance
    && boundary.categories.length === reasons.categories.length
    && boundary.categories.every((category, index) => category === reasons.categories[index])
    && sameReferenceList(boundary.signal_refs, reasons.signal_refs);

  if (!matching) {
    fail(
      'TURN_NPC_IDENTITY_MISMATCH',
      'NPC decision boundary and semantic request must have exact matching identity',
      { boundary_id: boundary.boundary_id, request_id: request.request_id }
    );
  }
}

function immutable(value) {
  return deepFreeze(structuredClone(value));
}

function safeModelOutput(rawPlan) {
  try {
    return structuredClone(rawPlan);
  } catch {
    // A non-cloneable response is structurally invalid and is represented as null.
    return null;
  }
}

function repairContext(rawPlan) {
  return immutable({
    original_output: safeModelOutput(rawPlan),
    validation_errors: [{
      code: 'conversation_contribution_schema_invalid',
      path: '$',
      message: 'Response must match the requested NPC semantic plan schema exactly.'
    }]
  });
}

function decisionContext(boundary, request, orderedSignals) {
  return immutable({
    boundary,
    request,
    ordered_signals: orderedSignals
  });
}

function replayProposal(trace, boundary, request, orderedSignals) {
  return immutable({
    status: 'replayed',
    plan: trace.plan,
    trace,
    signal_ids_to_consume: [],
    decision_context: decisionContext(boundary, request, orderedSignals)
  });
}

function plannedProposal(boundary, request, orderedSignals, plan) {
  return immutable({
    status: 'planned',
    plan,
    trace: null,
    signal_ids_to_consume: boundary.signal_refs.map(
      ({ entity_id }) => entity_id),
    decision_context: decisionContext(boundary, request, orderedSignals)
  });
}

function domainRejectedProposal(boundary, request, orderedSignals, plan,
  domainResult) {
  return immutable({
    status: 'domain_rejected',
    plan,
    trace: null,
    domain_result: domainResult,
    signal_ids_to_consume: [],
    decision_context: decisionContext(boundary, request, orderedSignals)
  });
}

function staleDiscardedProposal(boundary, request, orderedSignals) {
  return immutable({
    status: 'stale_discarded',
    plan: null,
    trace: null,
    signal_ids_to_consume: [],
    decision_context: decisionContext(boundary, request, orderedSignals)
  });
}

async function requestFreshDecision({ boundary, request, orderedSignals,
  semanticModel, revalidateStateVersion, rebuildDecisionContext, mode,
  validatePlan }) {
  if (typeof semanticModel !== 'function') {
    fail('TURN_NPC_MODEL_MISSING', 'semanticModel must be a function');
  }
  if (typeof revalidateStateVersion !== 'function') {
    fail(
      'TURN_NPC_STATE_REVALIDATOR_MISSING',
      'revalidateStateVersion must be a function'
    );
  }

  let currentBoundary = boundary;
  let currentRequest = request;
  let currentSignals = orderedSignals;
  let staleRebuilds = 0;
  decisionLoop: while (true) {
    const safeRequest = immutable(currentRequest);
    let repair = null;
    let rawPlan;
    while (true) {
      try {
        rawPlan = await semanticModel(safeRequest, immutable({
          boundary: currentBoundary,
          repair
        }));
      } catch (error) {
        throw turnFailure('TURN_NPC_MODEL_FAILED',
          repair === null
            ? 'NPC semantic model request failed'
            : 'NPC format repair request failed', {
          request_id: currentRequest.request_id,
          boundary_id: currentBoundary.boundary_id,
          cause: error instanceof Error ? error.message : String(error)
        });
      }

      const expectedStateVersion = requestStateVersion(currentRequest, mode);
      const revalidationRequest = immutable({
        request_id: currentRequest.request_id,
        boundary_id: currentBoundary.boundary_id,
        expected_state_version: expectedStateVersion
      });
      let currentStateVersion;
      try {
        currentStateVersion = await revalidateStateVersion(
          revalidationRequest);
      } catch (error) {
        throw turnFailure(
          'TURN_NPC_STATE_REVALIDATION_FAILED',
          'NPC state version could not be revalidated after semantic planning',
          {
            request_id: currentRequest.request_id,
            boundary_id: currentBoundary.boundary_id,
            cause: error instanceof Error ? error.message : String(error)
          }
        );
      }

      if (!Number.isSafeInteger(currentStateVersion)
          || currentStateVersion < 1) {
        fail(
          'TURN_NPC_STATE_REVALIDATION_INVALID',
          'revalidateStateVersion must return a positive safe integer',
          { request_id: currentRequest.request_id,
            boundary_id: currentBoundary.boundary_id }
        );
      }
      if (currentStateVersion !== expectedStateVersion) {
        const rebuilt = await rebuildStaleDecision({
          boundary: currentBoundary,
          request: currentRequest,
          rawPlan,
          currentStateVersion,
          rebuildDecisionContext
        });
        if (rebuilt === null) {
          return staleDiscardedProposal(
            currentBoundary, currentRequest, currentSignals);
        }
        staleRebuilds += 1;
        if (staleRebuilds > MAX_STALE_REBUILDS) {
          fail('TURN_NPC_STATE_REBUILD_LIMIT',
            'NPC decision context changed too many times before application', {
              boundary_id: currentBoundary.boundary_id,
              rebuild_count: staleRebuilds
            });
        }
        validateRebuiltDecision(rebuilt, mode, currentBoundary);
        currentBoundary = immutable(rebuilt.boundary);
        currentRequest = immutable(rebuilt.request);
        currentSignals = immutable(rebuilt.ordered_signals);
        continue decisionLoop;
      }

      if (validatePlanForMode(rawPlan, safeRequest, mode)) break;
      if (repair !== null) {
        fail(
          'TURN_NPC_PLAN_INVALID',
          'NPC semantic response and its format repair must match the request',
          { request_id: currentRequest.request_id,
            boundary_id: currentBoundary.boundary_id }
        );
      }
      repair = repairContext(rawPlan);
    }

    const domainResult = planDomainResult(rawPlan, safeRequest, validatePlan);
    if (domainResult !== null && domainResult.pass === false) {
      return domainRejectedProposal(currentBoundary, currentRequest,
        currentSignals, rawPlan, domainResult);
    }
    return plannedProposal(
      currentBoundary, currentRequest, currentSignals, rawPlan);
  }
}

async function rebuildStaleDecision({ boundary, request, rawPlan,
  currentStateVersion, rebuildDecisionContext }) {
  if (typeof rebuildDecisionContext !== 'function') {
    fail('TURN_NPC_STATE_REBUILDER_MISSING',
      'A stale NPC response requires a current decision-context rebuilder', {
        request_id: request.request_id,
        boundary_id: boundary.boundary_id,
        current_state_version: currentStateVersion
      });
  }
  try {
    return await rebuildDecisionContext(immutable({
      stale_boundary: boundary,
      stale_request: request,
      discarded_plan: safeModelOutput(rawPlan),
      current_state_version: currentStateVersion
    }));
  } catch (error) {
    throw turnFailure('TURN_NPC_STATE_REBUILD_FAILED',
      'Current NPC decision context could not be rebuilt', {
        request_id: request.request_id,
        boundary_id: boundary.boundary_id,
        cause: error instanceof Error ? error.message : String(error)
      });
  }
}

function validateRebuiltDecision(value, mode, staleBoundary) {
  if (value === null) return;
  if (value === undefined || typeof value !== 'object'
      || Array.isArray(value)
      || !validateNpcDecisionBoundary(value.boundary)
      || requestMode(value.request) !== mode
      || !validateRequestForMode(value.request, mode)
      || !Array.isArray(value.ordered_signals)
      || value.ordered_signals.some(
        (signal) => typeof signal?.signal_id !== 'string')) {
    fail('TURN_NPC_STATE_REBUILD_INVALID',
      'Rebuilt NPC decision context must contain a current boundary and request');
  }
  requireBoundaryRequestIdentity(value.boundary, value.request, mode);
  const sameBoundary = value.boundary.boundary_id
      === staleBoundary.boundary_id
    && value.boundary.decision_mode === staleBoundary.decision_mode
    && value.boundary.npc_ref.entity_id
      === staleBoundary.npc_ref.entity_id;
  const signalIds = value.ordered_signals.map(({ signal_id: id }) => id);
  const boundarySignalIds = value.boundary.signal_refs.map(
    ({ entity_id: id }) => id);
  if (!sameBoundary
      || signalIds.length !== boundarySignalIds.length
      || signalIds.some((id, index) => id !== boundarySignalIds[index])) {
    fail('TURN_NPC_STATE_REBUILD_IDENTITY_MISMATCH',
      'Rebuilt NPC decision context must preserve the applicable boundary and ordered signals', {
        stale_boundary_id: staleBoundary.boundary_id,
        rebuilt_boundary_id: value.boundary.boundary_id
      });
  }
}

export async function requestNpcSemanticDecision({
  boundary,
  request,
  semanticModel,
  persistedTrace = null,
  persistedInput = null,
  orderedSignals = [],
  revalidateStateVersion,
  rebuildDecisionContext = null,
  validatePlan = null
} = {}) {
  if (!validateNpcDecisionBoundary(boundary)) {
    fail('TURN_NPC_BOUNDARY_INVALID', 'boundary must match npc_decision_boundary_v1');
  }

  const mode = requestMode(request);
  if (mode === null || mode !== boundary.decision_mode || !validateRequestForMode(request, mode)) {
    fail(
      'TURN_NPC_REQUEST_INVALID',
      'request must be a formal semantic NPC request for the boundary decision mode'
    );
  }
  requireBoundaryRequestIdentity(boundary, request, mode);
  const historicalBoundaryId = `npc-decision:${
    boundary.same_time_batch_ref.entity_id}:${boundary.npc_ref.entity_id}`;
  if (boundary.boundary_id === historicalBoundaryId
      && persistedTrace === null) {
    fail(
      'TURN_NPC_LEGACY_BOUNDARY_REPLAY_REQUIRED',
      'A historical NPC boundary identity is valid only for committed replay',
      { request_id: request.request_id, boundary_id: boundary.boundary_id }
    );
  }

  if (persistedInput !== null) {
    if (persistedTrace === null
        || persistedInput.boundary_snapshot?.boundary_id !== boundary.boundary_id
        || persistedTrace.boundary_id !== boundary.boundary_id
        || (persistedInput.trace != null
          && canonicalDigest(persistedInput.trace)
            !== canonicalDigest(persistedTrace))) {
      fail(
        'TURN_NPC_TRACE_INPUT_MISMATCH',
        'Persisted NPC replay conflicts with the committed boundary identity',
        { request_id: request.request_id, boundary_id: boundary.boundary_id }
      );
    }
  }

  if (persistedTrace !== null) {
    if (!validateNpcSemanticDecisionTrace(persistedTrace, request)) {
      fail(
        'TURN_NPC_TRACE_INVALID',
        'persistedTrace must be a committed semantic trace matching the request',
        { request_id: request.request_id, boundary_id: boundary.boundary_id }
      );
    }
    const domainResult = planDomainResult(
      persistedTrace.plan, request, validatePlan
    );
    if (domainResult?.pass === false) {
      fail(
        'TURN_NPC_TRACE_INVALID',
        'persistedTrace must be a committed semantic trace matching the request',
        { request_id: request.request_id, boundary_id: boundary.boundary_id }
      );
    }
    return replayProposal(
      persistedTrace, boundary, request, orderedSignals);
  }

  const inFlightKey = boundary.boundary_id;
  const inputSnapshot = immutable({ boundary, request });
  const existing = inFlightDecisions.get(inFlightKey);
  if (existing) {
    if (!isDeepStrictEqual(existing.inputSnapshot, inputSnapshot)) {
      fail(
        'TURN_NPC_IDENTITY_MISMATCH',
        'Concurrent NPC requests reused one identity with different content',
        { boundary_id: boundary.boundary_id, request_id: request.request_id }
      );
    }
    return existing.pending;
  }

  const pending = requestFreshDecision({
    boundary: immutable(boundary),
    request: immutable(request),
    orderedSignals: immutable(orderedSignals),
    semanticModel,
    revalidateStateVersion,
    rebuildDecisionContext,
    mode,
    validatePlan
  });
  const inFlight = { inputSnapshot, pending };
  inFlightDecisions.set(inFlightKey, inFlight);
  try {
    return await pending;
  } finally {
    if (inFlightDecisions.get(inFlightKey) === inFlight) {
      inFlightDecisions.delete(inFlightKey);
    }
  }
}

function planDomainResult(plan, request, validatePlan) {
  if (validatePlan === null) return null;
  const result = validatePlan(plan, request);
  if (result === true) return null;
  if (result === false) {
    return immutable({
      pass: false,
      errors: [{
        code: 'TURN_NPC_PLAN_NOT_APPLICABLE',
        category: 'applicability',
        retryable: false
      }]
    });
  }
  if (result?.pass === true) return null;
  if (result?.pass === false && Array.isArray(result.errors)
      && result.errors.length > 0) {
    return immutable(result);
  }
  fail(
    'TURN_NPC_PLAN_VALIDATOR_INVALID',
    'validatePlan must return a boolean or typed domain result'
  );
}
