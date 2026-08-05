export function validateSupportingOperationPerceptions(
  values,
  { fail, record, text }
) {
  if (!Array.isArray(values) || values.some((value) =>
    !record(value)
      || value.schema !== 'conversation_supporting_operation_perception_v1'
      || !text(value.perception_id)
      || !text(value.conversation_id)
      || !text(value.exchange_id)
      || value.observer_ref?.entity_kind !== 'npc'
      || !text(value.observer_ref?.entity_id)
      || value.source_event_ref?.entity_kind !== 'evidence_presentation'
      || !text(value.source_event_ref?.entity_id)
      || value.subject_ref?.entity_kind !== 'item'
      || !text(value.subject_ref?.entity_id)
      || !['not_perceived', 'perceived_partial', 'recognized']
        .includes(value.result_kind)
      || !record(value.occurred_at))) {
    fail(
      'TRACE_M2_SUPPORTING_OPERATION_PERCEPTION_INVALID',
      'Supporting-operation perception must be one exact factual result.'
    );
  }
  return structuredClone(values);
}
