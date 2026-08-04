import { buildNpcBoundary } from
  './lower-dvina-trace-m2-conversation-decision.js';
import { pendingNpcConversationBatchKey } from
  './lower-dvina-trace-m2-conversation-signals.js';
import { conversationNpcContext } from
  './lower-dvina-trace-m2-conversation-participants.js';

export function buildNpcResponseBoundaryBatch(context, working, input) {
  const directNpcRefs = (input.latestContribution.intended_addressee_refs ?? [])
    .filter(({ entity_kind: entityKind }) => entityKind === 'npc');
  const processed = new Set(input.processedBoundaryIds);
  const candidates = [
    ...input.pendingBoundaries.map((boundary) => ({
      targetRef: boundary.npc_ref,
      batchKey: boundary.same_time_batch_ref.entity_id
    })),
    ...input.pendingResponderRefs.map((targetRef) => ({
      targetRef,
      batchKey: input.resumedBatchRef?.entity_id ?? null
    })),
    ...context.actualNpcActors.map(({ instance_id: instanceId }) => ({
      targetRef: { entity_kind: 'npc', entity_id: instanceId },
      batchKey: null
    }))
  ];
  const candidateKeys = new Set();
  const boundaries = candidates.flatMap(({ targetRef, batchKey }) => {
    const targetContext = conversationNpcContext(context, targetRef);
    const resolvedBatchKey = batchKey
      ?? pendingNpcConversationBatchKey(targetContext, working);
    if (resolvedBatchKey === null) return [];
    const candidateKey = `${targetRef.entity_id}\u0000${resolvedBatchKey}`;
    if (candidateKeys.has(candidateKey)) return [];
    candidateKeys.add(candidateKey);
    const boundary = buildNpcBoundary(
      { ...targetContext, batchKey: resolvedBatchKey }, working
    );
    return boundary === null || processed.has(boundary.boundary_id)
      ? [] : [boundary];
  });
  return { boundaries, direct_addressee_refs: directNpcRefs };
}
