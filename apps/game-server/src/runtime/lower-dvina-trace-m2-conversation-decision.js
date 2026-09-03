import {
  buildNpcConversationResponseRequest,
  evaluateNpcDecisionSignals
} from '@rus/npc-runtime';
import {
  allowedNpcContributionReferences,
  ownKnowledgeProjection,
  ownMemoryProjection,
  ownNpcProjection,
  perceivedChanges,
  receivedConversationMessage,
  visibleConversationContributionFor
} from './lower-dvina-trace-m2-conversation-projections.js';
import {
  fail,
  plainRecord,
  ref,
  sameRef
} from './lower-dvina-trace-m2-conversation-shared.js';
import { fullyPerceivedCurrentOffer } from
  './lower-dvina-trace-m2-conversation-offer-privacy.js';
import { npcConversationDecisionCapability } from
  './lower-dvina-trace-m2-conversation-participants.js';

export function buildNpcBoundary(context, working) {
  const resolvedRecords = allSignalRecords(context, working).filter(
    ({ same_time_batch_key: batchKey }) => batchKey === context.batchKey
  );
  const evaluation = evaluateNpcDecisionSignals({
    npc_ref: context.targetRef,
    active_mode: 'conversation',
    current_intent: null,
    decision_capability: npcConversationDecisionCapability(context),
    resolved_signals: resolvedRecords.map(({ signal }) => signal),
    consumed_signal_ids: [
      ...(context.state.consumed_npc_decision_signal_ids ?? []),
      ...(working.consumed_signal_ids ?? [])
    ],
    same_time_batch_ref: ref('temporal_batch', context.batchKey),
    state_version: String(context.stateVersion)
  });
  return evaluation.boundary;
}

export function buildNpcDecision(context, working, boundary,
  latestContribution = null) {
  const signalIds = new Set(boundary.signal_refs.map(
    ({ entity_id: entityId }) => entityId
  ));
  const resolvedRecords = allSignalRecords(context, working).filter(
    ({ signal }) => signalIds.has(signal.signal_id)
  );
  const presentedEvidenceRecognized = resolvedRecords.some(({ signal }) =>
    recognizedPresentedEvidenceSignal(context, working, signal));
  const requiredSupportingOperation = context.phase === 'phase_3'
    && !presentedEvidenceRecognized
    ? undefined
    : latestContribution?.speaker_ref?.entity_kind !== 'player_character'
      ? undefined
      : context.npcDecisionScope.required_supporting_operation;
  const perceivedMessage = perceivedBoundaryMessage(
    context, working, resolvedRecords
  );
  const currentOfferPerceived = fullyPerceivedCurrentOffer(
    context, perceivedMessage
  );
  const socialCheckProfile = context.npcSocialCheckProfile ?? null;
  const request = buildNpcConversationResponseRequest({
    schema: 'npc_conversation_response_request_v1',
    request_id: `npc-conversation-request:${boundary.boundary_id}:${
      context.exchangeId}`,
    boundary_id: boundary.boundary_id,
    conversation_id: context.conversationId,
    exchange_id: context.exchangeId,
    state_version: context.stateVersion,
    requested_at: structuredClone(context.state.clock),
    npc_ref: context.targetRef,
    decision_reasons: {
      significance: boundary.significance,
      categories: structuredClone(boundary.categories),
      signal_refs: structuredClone(boundary.signal_refs),
      perceived_changes: perceivedChanges(resolvedRecords, {
        presentedEvidenceRecognized
      })
    },
    npc: ownNpcProjection(context.targetActor),
    perceived_message: perceivedMessage === undefined ? null : {
      source_statement_ref: perceivedMessage.source_statement_ref,
      perception_result_ref: perceivedMessage.perception_result_ref
    },
    public_conversation_history: publicConversationHistory(
      context,
      working,
      perceivedMessage,
      latestContribution
    ),
    knowledge: ownKnowledgeProjection(context.targetActor),
    memory: ownMemoryProjection(
      context.targetActor,
      context.state,
      context.targetRef
    ),
    social_context: {
      delivery_cues: structuredClone(perceivedMessage?.delivery_cues ?? []),
      claims_are_speaker_assertions_not_objective_truth: true,
      ...(context.phase === 'phase_3' && presentedEvidenceRecognized
        ? { presented_evidence_ref: context.contracts.ids.evidence }
        : {}),
      ...(currentOfferPerceived
        ? {
            offer_stage_ref: context.offerStage.fact_id,
            offer_policy_ref: context.contracts.promisePolicy.policy_id
          }
        : {})
    },
    available_resources: context.phase === 'phase_4'
      && context.targetRef.entity_id === context.contracts.actors
        ?.ratsha_storehouse_helper?.instance_id
      ? [{
          resource_ref: context.contracts.knifeTransition
            .transition_profile_id,
          current_access: 'self_controlled_until_committed_surrender'
      }]
      : [],
    allowed_references: allowedNpcContributionReferences(context, {
      entityRefs: presentedEvidenceRecognized
        ? [ref('evidence', context.contracts.ids.evidence)] : []
    }),
    decision_scope: {
      conversation_mode: true,
      action_handoff_available:
        context.npcDecisionScope.action_handoff_available,
      combat_handoff_available:
        context.npcDecisionScope.combat_handoff_available,
      allowed_attribute_refs: socialCheckProfile === null
        ? [] : [socialCheckProfile.attribute_ref],
      allowed_skill_refs: socialCheckProfile === null
        ? [] : [socialCheckProfile.skill_ref],
      allowed_check_profile_refs: socialCheckProfile === null
        ? [] : [socialCheckProfile.profile_id],
      allowed_duration_classes: ['domain_owned'],
      operation_contract: context.npcOperationContract,
      ...(context.npcDecisionScope.allowed_contribution_kinds === undefined
        ? {} : { allowed_contribution_kinds: structuredClone(
          context.npcDecisionScope.allowed_contribution_kinds) }),
      ...(context.npcDecisionScope.required_resolution === undefined ? {} : {
        required_resolution: context.npcDecisionScope.required_resolution,
        required_check: structuredClone(context.npcDecisionScope.required_check)
      }),
      ...(requiredSupportingOperation === undefined
        ? {} : { required_supporting_operation: structuredClone(
          requiredSupportingOperation) })
    }
  });
  const persistedTrace = (context.state.npc_semantic_decision_traces ?? [])
    .find(({ boundary_id: boundaryId }) =>
      boundaryId === boundary.boundary_id) ?? null;
  return {
    boundary,
    request,
    persisted_trace: persistedTrace
  };
}

function allSignalRecords(context, working) {
  return [
    ...(context.state.npc_decision_signals ?? []).filter((record) =>
      plainRecord(record)
        && plainRecord(record.signal)
        && sameRef(record.signal.subject_ref, context.targetRef)),
    ...(working.new_signal_records ?? []).filter(({ signal }) =>
      sameRef(signal.subject_ref, context.targetRef))
  ];
}

function perceivedBoundaryMessage(context, working, resolvedRecords) {
  const statementId = resolvedRecords.find(({ signal }) =>
    signal.category === 'communication'
      && signal.source_event_ref.entity_kind === 'conversation_statement')
    ?.signal.source_event_ref.entity_id;
  if (statementId === undefined) return undefined;
  const statement = [
    ...(context.state.conversation_contributions
      ?? context.state.conversation_statements
      ?? []),
    ...(working.statements ?? [])
  ].find(({ statement_id: candidateId }) => candidateId === statementId);
  if (statement === undefined) {
    fail('TRACE_M2_CONVERSATION_SIGNAL_STATEMENT_MISSING',
      'A communication boundary requires its exact perceived statement.');
  }
  return receivedConversationMessage(context, working, statement);
}

function recognizedPresentedEvidenceSignal(context, working, signal) {
  if (signal.category !== 'environment'
      || context.evidencePresentation === null
      || !sameRef(
        signal.source_event_ref,
        ref('evidence_presentation', context.evidencePresentation.event_id)
      )) {
    return false;
  }
  const perceptions = [
    ...(context.state.supporting_operation_perceptions ?? []),
    ...(working.supporting_operation_perceptions ?? [])
  ];
  return perceptions.some((perception) =>
    perception.result_kind === 'recognized'
      && signal.source_perception_ref?.entity_kind === 'perception_result'
      && perception.perception_id === signal.source_perception_ref.entity_id
      && sameRef(perception.observer_ref, context.targetRef)
      && sameRef(perception.source_event_ref, signal.source_event_ref)
      && sameRef(
        perception.subject_ref,
        context.evidencePresentation.entity_ref
      ));
}

function publicConversationHistory(
  context,
  working,
  currentMessage,
  latestContribution
) {
  const receivedByTarget = new Map(
    [
      ...(context.state.received_messages ?? []),
      ...(working.audiences ?? []).flatMap(
        ({ received_messages: messages }) => messages
      )
    ]
      .filter(({ listener_ref: listenerRef }) =>
        sameRef(listenerRef, context.targetRef))
      .map((message) => [message.source_statement_ref?.entity_id, message])
  );
  const priorContributions = [
    ...(context.state.conversation_contributions
      ?? context.state.conversation_statements
      ?? []),
    ...(working.statements ?? [])
  ];
  const history = priorContributions
    .filter(({ conversation_id: conversationId }) =>
      conversationId === context.conversationId)
    .flatMap((contribution) => {
      if (contribution.schema === 'conversation_non_statement_contribution_v1') {
        const visible = visibleConversationContributionFor(
          context,
          working,
          contribution
        );
        return visible === undefined ? [] : [structuredClone(visible)];
      }
      if (sameRef(contribution.speaker_ref, context.targetRef)) {
        return [structuredClone(contribution)];
      }
      const received = receivedByTarget.get(contribution.statement_id);
      return received ? [structuredClone(received)] : [];
    });
  if (currentMessage !== undefined && !history.some((entry) =>
    entry.source_statement_ref?.entity_id
      === currentMessage.source_statement_ref?.entity_id
      || entry.statement_id === currentMessage.source_statement_ref?.entity_id
  )) {
    history.push(structuredClone(currentMessage));
  }
  if (latestContribution !== null) {
    const latestVisible = visibleConversationContributionFor(
      context,
      working,
      latestContribution
    );
    const latestId = latestVisible?.source_statement_ref?.entity_id
      ?? latestVisible?.source_contribution_ref?.entity_id
      ?? latestVisible?.statement_id
      ?? latestVisible?.contribution_id;
    if (latestId !== undefined && !history.some((entry) =>
      entry.source_statement_ref?.entity_id === latestId
        || entry.source_contribution_ref?.entity_id === latestId
        || entry.statement_id === latestId
        || entry.contribution_id === latestId
    )) {
      history.push(structuredClone(latestVisible));
    }
  }
  return history;
}
