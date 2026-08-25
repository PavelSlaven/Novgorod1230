import { buildNpcBoundary } from
  './lower-dvina-trace-m2-conversation-decision.js';
import {
  pendingNpcConversationBatchKey,
  unconsumedNpcSignalIdsForBatch
} from
  './lower-dvina-trace-m2-conversation-signals.js';
import {
  conversationNpcContext,
  npcConversationDecisionCapability
} from
  './lower-dvina-trace-m2-conversation-participants.js';

export function buildNpcResponseBoundaryBatch(context, working, input) {
  const directNpcRefs = (input.latestContribution?.intended_addressee_refs ?? [])
    .filter(({ entity_kind: entityKind }) => entityKind === 'npc');
  const processed = new Set(input.processedBoundaryIds);
  const pendingResponderKeys = new Set(input.pendingResponderRefs.map(
    ({ entity_kind: kind, entity_id: id }) => `${kind}\u0000${id}`
  ));
  const terminalOutcomes = [];
  const candidates = [
    ...input.pendingBoundaries.map((boundary) => ({
      targetRef: boundary.npc_ref,
      batchKey: boundary.same_time_batch_ref.entity_id
    })),
    ...input.pendingResponderRefs.map((targetRef) => ({
      targetRef,
      batchKey: input.resumedBatchRef?.entity_id ?? null
    })),
    ...context.actualNpcActors.filter(({ instance_id: instanceId }) =>
      context.conversationActorRefs == null || context.conversationActorRefs.some(
        ({ entity_kind, entity_id }) => entity_kind === 'npc' && entity_id === instanceId
      )).map(({ instance_id: instanceId }) => ({
      targetRef: { entity_kind: 'npc', entity_id: instanceId },
      batchKey: null
    }))
  ];
  const candidateKeys = new Set();
  const boundaries = candidates.flatMap(({ targetRef, batchKey }) => {
    const targetKey = `${targetRef.entity_kind}\u0000${targetRef.entity_id}`;
    const targetActor = context.actualNpcActors.find(
      ({ instance_id: instanceId }) => instanceId === targetRef.entity_id
    );
    const resolvedBatchKey = batchKey
      ?? (targetActor === undefined ? null : pendingNpcConversationBatchKey(
        conversationNpcContext(context, targetRef), working
      ));
    if (resolvedBatchKey === null) return [];
    const candidateKey = `${targetRef.entity_id}\u0000${resolvedBatchKey}`;
    if (candidateKeys.has(candidateKey)) return [];
    candidateKeys.add(candidateKey);
    const targetContext = targetActor === undefined
      ? null : conversationNpcContext(context, targetRef);
    if (pendingResponderKeys.has(targetKey)
        && (targetContext === null
          || !npcConversationDecisionCapability(targetContext))) {
      const signalIds = unconsumedNpcSignalIdsForBatch(
        context, working, targetRef, resolvedBatchKey
      );
      if (signalIds.length > 0) terminalOutcomes.push({
        npc_ref: structuredClone(targetRef),
        same_time_batch_ref: {
          entity_kind: 'temporal_batch', entity_id: resolvedBatchKey
        },
        outcome: 'npc_unavailable',
        signal_ids_to_consume: signalIds
      });
      return [];
    }
    const boundary = buildNpcBoundary(
      { ...targetContext, batchKey: resolvedBatchKey }, working
    );
    return boundary === null || processed.has(boundary.boundary_id)
      ? [] : [boundary];
  });
  return { boundaries, direct_addressee_refs: directNpcRefs,
    terminal_outcomes: terminalOutcomes };
}
