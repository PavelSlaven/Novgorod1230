export function phase3SemanticInteractions({
  semantic,
  conversation,
  npcRef,
  npcStatements,
  state,
  factual,
  turnNumber
}) {
  const evidencePresentation = semantic.evidence_presentation ?? null;
  const environmentSignals = semantic.new_signal_records.filter(
    ({ signal }) => signal.category === 'environment'
  );
  const presentedItem = evidencePresentation === null ? null
    : state.items?.find(({ item_id: itemId }) =>
        itemId === evidencePresentation.entity_ref?.entity_id) ?? null;
  if ((evidencePresentation === null) !== (environmentSignals.length === 0)
      || (evidencePresentation !== null
        && (evidencePresentation.schema
            !== 'conversation_supporting_operation_event_v1'
          || evidencePresentation.op !== 'emit_interaction'
          || evidencePresentation.interaction_kind
            !== 'present_item_as_evidence'
          || evidencePresentation.conversation_id
            !== semantic.decision_request.conversation_id
          || evidencePresentation.exchange_id
            !== semantic.decision_request.exchange_id
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
          || environmentSignals.some(({ signal }) =>
            signal.source_event_ref?.entity_kind
              !== 'evidence_presentation'
            || signal.source_event_ref.entity_id
              !== evidencePresentation.event_id)))) {
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
  return [
    ...(evidencePresentation === null ? [] : [{
      interaction_id: evidencePresentation.event_id,
      activity_ref: conversation.activity_ref,
      npc_id: npcRef.entity_id,
      interaction_kind: evidencePresentation.interaction_kind,
      actor_ref: structuredClone(evidencePresentation.actor_ref),
      target_ref: structuredClone(evidencePresentation.target_ref),
      entity_ref: structuredClone(evidencePresentation.entity_ref),
      evidence_ref: evidencePresentation.evidence_ref,
      occurred_at: structuredClone(evidencePresentation.occurred_at)
    }]),
    {
      interaction_id:
        `interaction:${state.party_id}:trace-phase3:${turnNumber}`,
      activity_ref: conversation.activity_ref,
      npc_id: npcRef.entity_id,
      contribution_kind: semantic.decision_plan.contribution_kind,
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
