import { buildNpcDecisionSignal } from '@rus/npc-runtime';
import { fail, plainRecord, ref, refKey, sameRef } from
  './lower-dvina-trace-m2-conversation-shared.js';

export function pendingNpcConversationBatchKey(context, working) {
  const consumed = new Set([
    ...(context.state.consumed_npc_decision_signal_ids ?? []),
    ...(working.consumed_signal_ids ?? [])
  ]);
  const currentBatchKey = [...(working.new_signal_records ?? [])]
    .reverse()
    .find(({ signal, same_time_batch_key: batchKey }) =>
      sameRef(signal.subject_ref, context.targetRef)
        && !consumed.has(signal.signal_id)
        && batchKey === context.batchKey)
    ?.same_time_batch_key;
  if (currentBatchKey !== undefined) return currentBatchKey;
  return (context.state.npc_decision_signals ?? []).find((record) =>
    persistedNpcFollowUpMatches(context, record, consumed))
    ?.same_time_batch_key ?? null;
}

export function playerSignalRecords(
  context,
  playerStatement,
  communicationPerceptionRef,
  evidencePerceptionRef
) {
  return context.mapping.signal_descriptors.flatMap((descriptor) => {
    const communication = descriptor.category === 'communication';
    const sourcePerceptionRef = communication
      ? communicationPerceptionRef
      : evidencePerceptionRef;
    if (sourcePerceptionRef === null) return [];
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
    return [signalRecord(context, descriptor, sourceEventRef,
      sourcePerceptionRef)];
  });
}

export function npcResponseSignalRecords(context, statement, audience, plan) {
  const expectation = plan.speech?.response_expectation;
  if (expectation?.kind === 'none') return [];
  const intendedKeys = new Set(statement.intended_addressee_refs.map(refKey));
  const expectedKeys = new Set((expectation?.target_refs ?? []).map(refKey));
  const eligibleNpcIds = new Set(context.actualNpcActors
    .filter(({ machine_state: machineState }) =>
      !['unconscious', 'incapacitated'].includes(machineState?.status))
    .map(({ instance_id: instanceId }) => instanceId));
  return audience.received_messages.flatMap((message) => {
    const listenerRef = message.listener_ref;
    if (listenerRef.entity_kind !== 'npc'
        || !eligibleNpcIds.has(listenerRef.entity_id)
        || !intendedKeys.has(refKey(listenerRef))
        || !expectedKeys.has(refKey(listenerRef))) {
      return [];
    }
    return [signalRecord(context, {
      category: 'communication', significance: 'material'
    }, ref('conversation_statement', statement.statement_id),
    message.perception_result_ref, listenerRef)];
  });
}

export function npcSilenceSignalRecords(
  context,
  contribution,
  audience,
  request
) {
  const perceivedStatementRef = request?.perceived_message
    ?.source_statement_ref;
  const priorSpeakerRef = request?.public_conversation_history?.find(
    ({ source_statement_ref: statementRef }) =>
      sameRef(statementRef, perceivedStatementRef)
  )?.speaker_ref;
  if (priorSpeakerRef?.entity_kind !== 'npc') return [];
  const observation = audience.observations.find(
    ({ observer_ref: observerRef, speaker_ref: speakerRef }) =>
      sameRef(observerRef, priorSpeakerRef) && speakerRef !== null
  );
  if (observation === undefined) return [];
  return [signalRecord(context, {
    category: 'others', significance: 'material'
  }, ref('conversation_contribution', contribution.contribution_id),
  observation.perception_result_ref, priorSpeakerRef)];
}

function signalRecord(
  context,
  descriptor,
  sourceEventRef,
  sourcePerceptionRef,
  subjectRef = context.targetRef
) {
  const signal = buildNpcDecisionSignal({
    occurred_at: structuredClone(context.state.clock),
    category: descriptor.category,
    significance: descriptor.significance,
    source_event_ref: sourceEventRef,
    subject_ref: subjectRef,
    scope_refs: [],
    perception_required: true,
    source_perception_ref: sourcePerceptionRef,
    causal_parent_refs: []
  });
  return Object.freeze({ signal, same_time_batch_key: context.batchKey });
}

function persistedNpcFollowUpMatches(context, record, consumed) {
  const signal = record?.signal;
  if (!plainRecord(record)
      || !plainRecord(signal)
      || consumed.has(signal.signal_id)
      || signal.significance !== 'material'
      || !sameRef(signal.subject_ref, context.targetRef)) {
    return false;
  }
  if (signal.category === 'others'
      && signal.source_event_ref?.entity_kind
        === 'conversation_contribution') {
    return persistedNonverbalFollowUpMatches(context, signal);
  }
  if (signal.category !== 'communication'
      || signal.source_event_ref?.entity_kind !== 'conversation_statement') {
    return false;
  }
  const statement = [
    ...(context.state.conversation_contributions ?? []),
    ...(context.state.conversation_statements ?? [])
  ].find(({ statement_id: statementId }) =>
    statementId === signal.source_event_ref.entity_id);
  if (statement?.conversation_id !== context.conversationId
      || statement.speaker_ref?.entity_kind !== 'npc'
      || !(statement.intended_addressee_refs ?? []).some((reference) =>
        sameRef(reference, context.targetRef))) {
    return false;
  }
  const messages = [
    ...(context.state.received_messages ?? []),
    ...(context.state.conversation_audiences ?? []).flatMap(
      ({ received_messages: receivedMessages }) => receivedMessages ?? []
    )
  ];
  return messages.some((message) =>
    sameRef(message.source_statement_ref, signal.source_event_ref)
      && sameRef(message.listener_ref, context.targetRef)
      && sameRef(message.perception_result_ref, signal.source_perception_ref));
}

function persistedNonverbalFollowUpMatches(context, signal) {
  const contribution = (context.state.conversation_contributions ?? []).find(
    ({ contribution_id: contributionId }) =>
      contributionId === signal.source_event_ref.entity_id
  );
  return contribution?.conversation_id === context.conversationId
    && contribution.contribution_kind === 'silence'
    && contribution.speaker_ref?.entity_kind === 'npc'
    && contribution.nonverbal_audience?.observations?.some((observation) =>
      sameRef(observation.observer_ref, context.targetRef)
        && sameRef(observation.speaker_ref, contribution.speaker_ref)
        && sameRef(observation.source_contribution_ref,
          signal.source_event_ref)
        && sameRef(observation.perception_result_ref,
          signal.source_perception_ref));
}
