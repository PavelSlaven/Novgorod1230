import {
  orderNpcConversationDecisionRequests,
  validateNpcConversationResponseRequest,
  validateNpcDecisionBoundary,
  validateNpcSemanticDecisionTrace
} from '@rus/npc-runtime';
import { turnFailure } from './errors.js';

const exactKeys = (value, keys) => value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key));
const record = (value) => value !== null && typeof value === 'object'
  && !Array.isArray(value);
const sameRef = (left, right) => left?.entity_kind === right?.entity_kind
  && left?.entity_id === right?.entity_id;
const sameRefs = (left, right) => left.length === right.length
  && left.every((reference, index) => sameRef(reference, right[index]));

function clone(value) {
  try {
    return structuredClone(value);
  } catch {
    throw turnFailure(
      'TURN_CONVERSATION_NPC_BATCH_INVALID',
      'NPC response batch must be cloneable'
    );
  }
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

export function decisionPairKey(boundary) {
  return `${boundary.npc_ref.entity_kind}\u0000${boundary.npc_ref.entity_id}`
    + `\u0000${boundary.same_time_batch_ref.entity_kind}`
    + `\u0000${boundary.same_time_batch_ref.entity_id}`;
}

export function normalizeNpcBatch(value, processedBoundaryIds,
  processedDecisionPairs) {
  const batch = clone(value);
  if (!exactKeys(batch, ['decisions', 'direct_addressee_refs'])
      || !Array.isArray(batch.decisions)
      || !Array.isArray(batch.direct_addressee_refs)) {
    throw turnFailure(
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
          || (record(decision.persisted_trace)
            && validateNpcSemanticDecisionTrace(
              decision.persisted_trace, decision.request)))) {
      throw turnFailure(
        'TURN_CONVERSATION_NPC_BATCH_INVALID',
        'Every NPC response decision must be formal and exactly linked'
      );
    }
    const { boundary_id: boundaryId } = decision.boundary;
    const { request_id: requestId } = decision.request;
    if (boundaryIds.has(boundaryId) || requestIds.has(requestId)) {
      throw turnFailure(
        'TURN_CONVERSATION_NPC_BATCH_DUPLICATE',
        'NPC response batch contains a duplicate boundary or request'
      );
    }
    if (processedBoundaryIds.has(boundaryId)) {
      throw turnFailure(
        'TURN_CONVERSATION_NPC_BOUNDARY_REPLAYED',
        'NPC response batch returned an already processed boundary',
        { boundary_id: boundaryId }
      );
    }
    const pairKey = decisionPairKey(decision.boundary);
    if (batchDecisionPairs.has(pairKey) || processedDecisionPairs.has(pairKey)) {
      throw turnFailure(
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
      { cause: error instanceof Error ? error.message : String(error) }
    );
  }
  const decisionsByRequestId = new Map(batch.decisions.map(
    (decision) => [decision.request.request_id, decision]
  ));
  return {
    decisions: orderedRequests.map((request) =>
      decisionsByRequestId.get(request.request_id)),
    direct_addressee_refs: batch.direct_addressee_refs
  };
}
