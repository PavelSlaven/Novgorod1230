export function phase3SemanticInteractions({
  semantic,
  conversation,
  npcRef,
  npcStatements,
  state,
  factual,
  turnNumber
}) {
  if (semantic.exchange.applied_contribution_count < 1) return [];
  const evidencePresentation = semantic.evidence_presentation ?? null;
  const firstContribution = semantic.exchange.contributions[0];
  const npcContributionApplied = semantic.exchange.contributions.some(
    ({ speaker_ref: speaker }) => sameRef(speaker, npcRef)
  );
  const environmentSignals = semantic.new_signal_records.filter(
    ({ signal }) => signal.category === 'environment'
  );
  const evidencePerceptions =
    semantic.supporting_operation_perceptions ?? [];
  const evidencePerception = evidencePerceptions[0] ?? null;
  const evidencePerceived = evidencePerception !== null
    && evidencePerception.result_kind !== 'not_perceived';
  const presentedItem = evidencePresentation === null ? null
    : state.items?.find(({ item_id: itemId }) =>
        itemId === evidencePresentation.entity_ref?.entity_id) ?? null;
  if ((evidencePresentation === null
        && (environmentSignals.length !== 0
          || evidencePerceptions.length !== 0))
      || (evidencePresentation !== null
        && (evidencePresentation.schema
            !== 'conversation_supporting_operation_event_v1'
          || evidencePresentation.op !== 'emit_interaction'
          || evidencePresentation.interaction_kind
            !== 'present_item_as_evidence'
          || evidencePresentation.conversation_id
            !== firstContribution.conversation_id
          || evidencePresentation.exchange_id
            !== firstContribution.exchange_id
          || evidencePresentation.evidence_ref
            !== conversation.evidence_input_ref
          || !sameRef(evidencePresentation.actor_ref, {
            entity_kind: 'player_character', entity_id: state.actor_id
          })
          || !sameRef(evidencePresentation.target_ref, npcRef)
          || evidencePresentation.entity_ref?.entity_kind !== 'item'
          || presentedItem?.state?.evidence_ref
            !== evidencePresentation.evidence_ref
          || presentedItem.placement?.holder_character_id !== state.actor_id
          || evidencePerceptions.length !== 1
          || evidencePerception.schema
            !== 'conversation_supporting_operation_perception_v1'
          || evidencePerception.observer_ref?.entity_kind !== npcRef.entity_kind
          || evidencePerception.observer_ref?.entity_id !== npcRef.entity_id
          || evidencePerception.source_event_ref?.entity_kind
            !== 'evidence_presentation'
          || evidencePerception.source_event_ref.entity_id
            !== evidencePresentation.event_id
          || evidencePerception.subject_ref?.entity_kind !== 'item'
          || evidencePerception.subject_ref.entity_id
            !== evidencePresentation.entity_ref.entity_id
          || !['not_perceived', 'perceived_partial', 'recognized']
            .includes(evidencePerception.result_kind)
          || environmentSignals.length !== (evidencePerceived ? 1 : 0)
          || environmentSignals.some(({ signal }) =>
            signal.source_event_ref?.entity_kind
              !== 'evidence_presentation'
            || signal.source_event_ref.entity_id
              !== evidencePresentation.event_id
            || signal.source_perception_ref?.entity_kind
              !== 'perception_result'
            || signal.source_perception_ref.entity_id
              !== evidencePerception.perception_id)))) {
    semanticFail('TRACE_M2_PHASE_3_EVIDENCE_EVENT_INVALID');
  }
  const statement = npcStatements[0] ?? null;
  const audience = statement === null ? null : semantic.audiences.find(
    ({ statement_ref: statementRef }) =>
      statementRef.entity_kind === 'conversation_statement'
        && statementRef.entity_id === statement.statement_id);
  if (statement !== null && !audience) {
    semanticFail('TRACE_M2_PHASE_3_SEMANTIC_SHAPE_INVALID');
  }
  const lastContribution = semantic.exchange.contributions.at(-1);
  const contributionRef = lastContribution?.schema
    === 'conversation_statement_event_v1'
    ? lastContribution.statement_id
    : lastContribution?.contribution_id;
  if (typeof contributionRef !== 'string' || !contributionRef) {
    semanticFail('TRACE_M2_PHASE_3_SEMANTIC_SHAPE_INVALID');
  }
  const supportingInteractions = evidencePresentation === null ? [] : [{
      interaction_id: evidencePresentation.event_id,
      activity_ref: conversation.activity_ref,
      npc_id: npcRef.entity_id,
      interaction_kind: evidencePresentation.interaction_kind,
      actor_ref: structuredClone(evidencePresentation.actor_ref),
      target_ref: structuredClone(evidencePresentation.target_ref),
      entity_ref: structuredClone(evidencePresentation.entity_ref),
      evidence_ref: evidencePresentation.evidence_ref,
      occurred_at: structuredClone(evidencePresentation.occurred_at)
    }];
  if (!npcContributionApplied) return supportingInteractions;
  return [
    ...supportingInteractions,
    {
      interaction_id:
        `interaction:${state.party_id}:trace-phase3:${turnNumber}`,
      activity_ref: conversation.activity_ref,
      npc_id: npcRef.entity_id,
      contribution_kind: semantic.decision_plan?.contribution_kind
        ?? semantic.resumed_npc_execution?.plan?.contribution_kind
        ?? lastContribution.contribution_kind
        ?? 'speech',
      contribution_ref: contributionRef,
      statement_ref: statement?.statement_id ?? null,
      supporting_operation_event_ref:
        evidencePresentation?.event_id ?? null,
      utterance_text: statement?.utterance_text ?? null,
      dominant_act: statement?.dominant_act ?? null,
      interaction_tags: structuredClone(statement?.interaction_tags ?? []),
      topic_refs: structuredClone(statement?.topic_refs ?? []),
      claims: structuredClone(statement?.claims ?? []),
      actual_listener_refs: structuredClone(
        audience?.actual_listener_refs ?? []
      ),
      truth_projection: 'speaker_statement_only',
      objective_truth_write: 'forbidden',
      started_at: structuredClone(factual.time_update.clock_before),
      occurred_at: structuredClone(factual.time_update.clock_after)
    }
  ];
}

function sameRef(left, right) {
  return left?.entity_kind === right?.entity_kind
    && left?.entity_id === right?.entity_id;
}

function semanticFail(code) {
  throw Object.assign(new Error(
    'The Phase 3 semantic conversation projection is incomplete.'), { code });
}
