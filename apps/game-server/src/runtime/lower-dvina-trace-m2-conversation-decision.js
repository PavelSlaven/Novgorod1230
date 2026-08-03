import {
  buildNpcConversationResponseRequest,
  buildNpcDecisionSignal,
  evaluateNpcDecisionSignals
} from '@rus/npc-runtime';
import {
  ownKnowledgeProjection,
  ownMemoryProjection,
  ownNpcProjection,
  perceivedChanges
} from './lower-dvina-trace-m2-conversation-projections.js';
import {
  fail,
  plainRecord,
  ref,
  sameRef
} from './lower-dvina-trace-m2-conversation-shared.js';

export function buildNpcDecision(context, working, playerStatement) {
  const resolvedRecords = [
    ...pendingCurrentBatchRecords(context),
    ...working.new_signal_records
  ];
  const evaluation = evaluateNpcDecisionSignals({
    npc_ref: context.targetRef,
    active_mode: 'conversation',
    current_intent: null,
    decision_capability: true,
    resolved_signals: resolvedRecords.map(({ signal }) => signal),
    consumed_signal_ids:
      structuredClone(context.state.consumed_npc_decision_signal_ids ?? []),
    same_time_batch_ref: ref('temporal_batch', context.batchKey),
    state_version: String(context.stateVersion)
  });
  if (!evaluation.boundary) {
    fail(
      'TRACE_M2_CONVERSATION_BOUNDARY_MISSING',
      'The current exchange must produce one common NPC boundary.'
    );
  }
  const playerAudience = working.audiences[0];
  const perceivedMessage = playerAudience.received_messages.find(
    ({ listener_ref: listenerRef }) => sameRef(listenerRef, context.targetRef)
  );
  const request = buildNpcConversationResponseRequest({
    schema: 'npc_conversation_response_request_v1',
    request_id: `npc-conversation-request:${context.inputDigest}`,
    boundary_id: evaluation.boundary.boundary_id,
    conversation_id: context.conversationId,
    exchange_id: context.exchangeId,
    state_version: context.stateVersion,
    requested_at: structuredClone(context.state.clock),
    npc_ref: context.targetRef,
    decision_reasons: {
      significance: evaluation.boundary.significance,
      categories: structuredClone(evaluation.boundary.categories),
      signal_refs: structuredClone(evaluation.boundary.signal_refs),
      perceived_changes: perceivedChanges(resolvedRecords)
    },
    npc: ownNpcProjection(context.targetActor),
    perceived_message: {
      source_statement_ref: perceivedMessage.source_statement_ref,
      perception_result_ref: perceivedMessage.perception_result_ref
    },
    public_conversation_history: publicConversationHistory(
      context,
      perceivedMessage
    ),
    knowledge: ownKnowledgeProjection(context.targetActor),
    memory: ownMemoryProjection(
      context.targetActor,
      context.state,
      context.targetRef
    ),
    social_context: {
      delivery_cues: structuredClone(perceivedMessage.delivery_cues),
      claims_are_speaker_assertions_not_objective_truth: true,
      ...(context.phase === 'phase_3' && context.evidencePresented
        ? { presented_evidence_ref: context.contracts.ids.evidence }
        : {}),
      ...(context.phase === 'phase_4' && context.offerStage
        ? {
            offer_stage_ref: context.offerStage.fact_id,
            offer_policy_ref: context.contracts.promisePolicy.policy_id
          }
        : {})
    },
    available_resources: context.phase === 'phase_4'
      ? [{
          resource_ref: context.contracts.knifeTransition
            .transition_profile_id,
          current_access: 'self_controlled_until_committed_surrender'
        }]
      : [],
    decision_scope: {
      conversation_mode: true,
      action_handoff_available:
        context.npcDecisionScope.action_handoff_available,
      combat_handoff_available:
        context.npcDecisionScope.combat_handoff_available,
      allowed_attribute_refs: [],
      allowed_skill_refs: [],
      operation_contract: context.npcOperationContract
    }
  });
  const persistedTrace = (context.state.npc_semantic_decision_traces ?? [])
    .find(({ boundary_id: boundaryId }) =>
      boundaryId === evaluation.boundary.boundary_id) ?? null;
  return {
    boundary: evaluation.boundary,
    request,
    persisted_trace: persistedTrace
  };
}

function publicConversationHistory(context, currentMessage) {
  const receivedByTarget = new Map(
    (context.state.received_messages ?? [])
      .filter(({ listener_ref: listenerRef }) =>
        sameRef(listenerRef, context.targetRef))
      .map((message) => [message.source_statement_ref?.entity_id, message])
  );
  const history = (context.state.conversation_statements ?? [])
    .filter(({ conversation_id: conversationId }) =>
      conversationId === context.conversationId)
    .flatMap((statement) => {
      if (sameRef(statement.speaker_ref, context.targetRef)) {
        return [structuredClone(statement)];
      }
      const received = receivedByTarget.get(statement.statement_id);
      return received ? [structuredClone(received)] : [];
    });
  history.push(structuredClone(currentMessage));
  return history;
}

export function currentSignalRecords(
  context,
  playerStatement,
  communicationPerceptionRef
) {
  return context.mapping.signal_descriptors.map((descriptor) => {
    const communication = descriptor.category === 'communication';
    const sourceEventRef = communication
      ? ref('conversation_statement', playerStatement.statement_id)
      : context.evidencePresentation === null
        ? fail(
            'TRACE_M2_EVIDENCE_PRESENTATION_MISSING',
            'An environment evidence signal requires an executed operation.'
          )
        : ref(
            'evidence_presentation',
            context.evidencePresentation.event_id
          );
    // The evidence presentation is part of the same actually perceived
    // player contribution. Reuse that committed perception result instead of
    // inventing a second perception identity that has no persisted owner.
    const sourcePerceptionRef = communicationPerceptionRef;
    const signal = buildNpcDecisionSignal({
      occurred_at: structuredClone(context.state.clock),
      category: descriptor.category,
      significance: descriptor.significance,
      source_event_ref: sourceEventRef,
      subject_ref: context.targetRef,
      scope_refs: [],
      perception_required: true,
      source_perception_ref: sourcePerceptionRef,
      causal_parent_refs: []
    });
    return Object.freeze({
      signal,
      same_time_batch_key: context.batchKey
    });
  });
}

function pendingCurrentBatchRecords(context) {
  return (context.state.npc_decision_signals ?? []).filter((record) =>
    plainRecord(record)
      && plainRecord(record.signal)
      && record.same_time_batch_key === context.batchKey
      && sameRef(record.signal.subject_ref, context.targetRef)
  );
}
