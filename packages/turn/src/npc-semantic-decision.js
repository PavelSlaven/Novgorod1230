import { isDeepStrictEqual } from 'node:util';
import { deepFreeze } from '@rus/kernel';
import { canonicalDigest } from '@rus/materialization';
import {
  validateConversationContributionPlan,
  validateNpcActionDecisionRequest,
  validateNpcConversationResponseRequest,
  validateNpcDecisionBoundary,
  validateNpcSemanticDecisionTrace,
  validateNpcStepPlan
} from '@rus/npc-runtime';
import { turnFailure } from './errors.js';

const inFlightDecisions = new Map();

function fail(code, message, details = {}) {
  throw turnFailure(code, message, details);
}

function requestMode(request) {
  if (request?.schema === 'npc_action_decision_request_v1') return 'autonomous';
  if (request?.schema === 'npc_conversation_response_request_v1') return 'conversation';
  return null;
}

function requestStateVersion(request, mode) {
  return mode === 'autonomous'
    ? request.committed_state_version
    : request.state_version;
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
  return mode === 'autonomous'
    ? validateNpcActionDecisionRequest(request)
    : validateNpcConversationResponseRequest(request);
}

function validatePlanForMode(plan, request, mode) {
  return mode === 'autonomous'
    ? validateNpcStepPlan(plan, request)
    : validateConversationContributionPlan(plan, request);
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

function repairContext(rawPlan) {
  let originalOutput = null;
  try {
    originalOutput = structuredClone(rawPlan);
  } catch {
    // A non-cloneable response is structurally invalid and is represented as null.
  }
  return immutable({
    original_output: originalOutput,
    validation_errors: [{
      code: 'conversation_contribution_schema_invalid',
      path: '$',
      message: 'Response must match the requested NPC semantic plan schema exactly.'
    }]
  });
}

function replayProposal(trace) {
  return immutable({
    status: 'replayed',
    plan: trace.plan,
    trace,
    signal_ids_to_consume: []
  });
}

function plannedProposal(boundary, plan) {
  return immutable({
    status: 'planned',
    plan,
    trace: null,
    signal_ids_to_consume: boundary.signal_refs.map(({ entity_id }) => entity_id)
  });
}

function domainRejectedProposal(plan, domainResult) {
  return immutable({
    status: 'domain_rejected',
    plan,
    trace: null,
    domain_result: domainResult,
    signal_ids_to_consume: []
  });
}

async function requestFreshDecision({ boundary, request, semanticModel, revalidateStateVersion, mode, validatePlan }) {
  if (typeof semanticModel !== 'function') {
    fail('TURN_NPC_MODEL_MISSING', 'semanticModel must be a function');
  }
  if (typeof revalidateStateVersion !== 'function') {
    fail(
      'TURN_NPC_STATE_REVALIDATOR_MISSING',
      'revalidateStateVersion must be a function'
    );
  }

  const safeRequest = immutable(request);
  let rawPlan;
  try {
    rawPlan = await semanticModel(safeRequest, immutable({ boundary, repair: null }));
  } catch (error) {
    throw turnFailure('TURN_NPC_MODEL_FAILED', 'NPC semantic model request failed', {
      request_id: request.request_id,
      boundary_id: boundary.boundary_id,
      cause: error instanceof Error ? error.message : String(error)
    });
  }

  if (!validatePlanForMode(rawPlan, safeRequest, mode)) {
    try {
      rawPlan = await semanticModel(safeRequest, immutable({
        boundary,
        repair: repairContext(rawPlan)
      }));
    } catch (error) {
      throw turnFailure('TURN_NPC_MODEL_FAILED', 'NPC format repair request failed', {
        request_id: request.request_id,
        boundary_id: boundary.boundary_id,
        cause: error instanceof Error ? error.message : String(error)
      });
    }
    if (!validatePlanForMode(rawPlan, safeRequest, mode)) {
      fail(
        'TURN_NPC_PLAN_INVALID',
        'NPC semantic response and its format repair must match the request',
        { request_id: request.request_id, boundary_id: boundary.boundary_id }
      );
    }
  }

  const domainResult = planDomainResult(rawPlan, safeRequest, validatePlan);
  if (domainResult !== null && domainResult.pass === false) {
    return domainRejectedProposal(rawPlan, domainResult);
  }

  const expectedStateVersion = requestStateVersion(request, mode);
  const revalidationRequest = immutable({
    request_id: request.request_id,
    boundary_id: boundary.boundary_id,
    expected_state_version: expectedStateVersion
  });
  let currentStateVersion;
  try {
    currentStateVersion = await revalidateStateVersion(revalidationRequest);
  } catch (error) {
    throw turnFailure(
      'TURN_NPC_STATE_REVALIDATION_FAILED',
      'NPC state version could not be revalidated after semantic planning',
      {
        request_id: request.request_id,
        boundary_id: boundary.boundary_id,
        cause: error instanceof Error ? error.message : String(error)
      }
    );
  }

  if (!Number.isSafeInteger(currentStateVersion) || currentStateVersion < 1) {
    fail(
      'TURN_NPC_STATE_REVALIDATION_INVALID',
      'revalidateStateVersion must return a positive safe integer',
      { request_id: request.request_id, boundary_id: boundary.boundary_id }
    );
  }
  if (currentStateVersion !== expectedStateVersion) {
    fail(
      'TURN_NPC_STATE_STALE',
      'NPC semantic plan was produced from a stale state version',
      {
        request_id: request.request_id,
        boundary_id: boundary.boundary_id,
        expected_state_version: expectedStateVersion,
        current_state_version: currentStateVersion
      }
    );
  }

  return plannedProposal(boundary, rawPlan);
}

export async function requestNpcSemanticDecision({
  boundary,
  request,
  semanticModel,
  persistedTrace = null,
  persistedInput = null,
  orderedSignals = [],
  revalidateStateVersion,
  validatePlan = null
} = {}) {
  if (!validateNpcDecisionBoundary(boundary)) {
    fail('TURN_NPC_BOUNDARY_INVALID', 'boundary must match npc_decision_boundary_v1');
  }
  if (boundary.decision_mode === 'combat') {
    fail('TURN_NPC_MODE_UNSUPPORTED', 'Combat semantic decisions are outside the M2 boundary');
  }

  const mode = requestMode(request);
  if (mode === null || mode !== boundary.decision_mode || !validateRequestForMode(request, mode)) {
    fail(
      'TURN_NPC_REQUEST_INVALID',
      'request must be a formal semantic NPC request for the boundary decision mode'
    );
  }
  requireBoundaryRequestIdentity(boundary, request, mode);

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
    return replayProposal(persistedTrace);
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
    semanticModel,
    revalidateStateVersion,
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
