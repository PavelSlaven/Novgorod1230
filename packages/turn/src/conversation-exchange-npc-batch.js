import {
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
const refKey = (reference) =>
  `${reference.entity_kind}\u0000${reference.entity_id}`;
const exactNpcRef = (reference) => exactKeys(
  reference, ['entity_kind', 'entity_id']
) && reference.entity_kind === 'npc'
  && typeof reference.entity_id === 'string'
  && reference.entity_id.length > 0
  && reference.entity_id === reference.entity_id.trim();

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
    + `\u0000${boundary.same_time_batch_ref.entity_id}`
    + `\u0000${boundary.decision_mode}`;
}

export function normalizeNpcBoundaryBatch(value, processedBoundaryIds,
  processedDecisionPairs) {
  const batch = clone(value);
  if (!exactKeys(batch, ['boundaries', 'direct_addressee_refs'])
      || !Array.isArray(batch.boundaries)
      || !Array.isArray(batch.direct_addressee_refs)) {
    throw turnFailure(
      'TURN_CONVERSATION_NPC_BATCH_INVALID',
      'NPC response batch must contain boundaries and direct_addressee_refs arrays'
    );
  }
  const boundaryIds = new Set();
  const batchDecisionPairs = new Set();
  const directKeys = new Set(batch.direct_addressee_refs.map(refKey));
  if (directKeys.size !== batch.direct_addressee_refs.length
      || batch.direct_addressee_refs.some((reference) =>
        !exactNpcRef(reference))) {
    throw turnFailure(
      'TURN_CONVERSATION_NPC_BATCH_INVALID',
      'NPC response batch direct addressees must be unique NPC refs'
    );
  }
  for (const boundary of batch.boundaries) {
    if (!validateNpcDecisionBoundary(boundary)) {
      throw turnFailure(
        'TURN_CONVERSATION_NPC_BATCH_INVALID',
        'Every NPC response boundary must be formal'
      );
    }
    const { boundary_id: boundaryId } = boundary;
    if (boundaryIds.has(boundaryId)) {
      throw turnFailure(
        'TURN_CONVERSATION_NPC_BATCH_DUPLICATE',
        'NPC response batch contains a duplicate boundary'
      );
    }
    if (processedBoundaryIds.has(boundaryId)) {
      throw turnFailure(
        'TURN_CONVERSATION_NPC_BOUNDARY_REPLAYED',
        'NPC response batch returned an already processed boundary',
        { boundary_id: boundaryId }
      );
    }
    const pairKey = decisionPairKey(boundary);
    if (batchDecisionPairs.has(pairKey) || processedDecisionPairs.has(pairKey)) {
      throw turnFailure(
        'TURN_CONVERSATION_NPC_DECISION_DUPLICATE',
        'An NPC may have at most one decision per same-time batch in an exchange',
        { boundary_id: boundaryId }
      );
    }
    boundaryIds.add(boundaryId);
    batchDecisionPairs.add(pairKey);
  }
  const boundaries = [...batch.boundaries].sort((left, right) => {
    const leftDirect = directKeys.has(refKey(left.npc_ref));
    const rightDirect = directKeys.has(refKey(right.npc_ref));
    return Number(rightDirect) - Number(leftDirect)
      || refKey(left.npc_ref).localeCompare(refKey(right.npc_ref), 'en')
      || left.boundary_id.localeCompare(right.boundary_id, 'en');
  });
  return {
    boundaries,
    direct_addressee_refs: batch.direct_addressee_refs
  };
}

export function normalizeNpcDecision(value, expectedBoundary) {
  const decision = clone(value);
  if (!exactKeys(decision, ['boundary', 'request', 'persisted_trace'])
      || !validateNpcDecisionBoundary(decision.boundary)
      || decision.boundary.boundary_id !== expectedBoundary.boundary_id
      || JSON.stringify(decision.boundary) !== JSON.stringify(expectedBoundary)
      || !validateNpcConversationResponseRequest(decision.request)
      || !exactBoundaryRequestLink(decision.boundary, decision.request)
      || !(decision.persisted_trace === null
        || (record(decision.persisted_trace)
          && validateNpcSemanticDecisionTrace(
            decision.persisted_trace, decision.request)))) {
    throw turnFailure(
      'TURN_CONVERSATION_NPC_DECISION_INVALID',
      'NPC response decision must be freshly built for the exact boundary'
    );
  }
  return decision;
}
