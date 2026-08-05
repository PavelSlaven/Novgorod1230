import { canonicalDigest } from '@rus/materialization';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';

export function statementContract(row) {
  return {
    schema: row.statement_schema,
    statement_id: row.statement_id,
    conversation_id: row.conversation_id,
    exchange_id: row.exchange_id,
    speaker_ref: row.speaker_ref,
    intended_addressee_refs: row.intended_addressee_refs,
    utterance_text: row.utterance_text,
    dominant_act: row.dominant_act,
    interaction_tags: row.interaction_tags,
    topic_refs: row.topic_refs,
    claims: row.claims,
    message_completeness: row.message_completeness,
    spoken_at: row.spoken_at,
    duration: row.duration,
    social_delivery_result: row.social_delivery_result,
    source_plan_ref: row.source_plan_ref
  };
}

export function timestampMatches(row, timestamp) {
  return row.perceived_at_whole_minutes === String(timestamp.whole_minutes)
    && row.perceived_at_subminute_numerator
      === String(timestamp.subminute_numerator)
    && row.perceived_at_subminute_denominator
      === String(timestamp.subminute_denominator)
    && row.scheduled_at_whole_minutes === String(timestamp.whole_minutes)
    && row.scheduled_at_subminute_numerator
      === String(timestamp.subminute_numerator)
    && row.scheduled_at_subminute_denominator
      === String(timestamp.subminute_denominator);
}

export function sorted(values, key) {
  if (!Array.isArray(values)) fail();
  return [...values].sort((left, right) => left[key].localeCompare(right[key]));
}

export function sortedAudiences(values) {
  if (!Array.isArray(values)) fail();
  return [...values].sort((left, right) =>
    left.statement_ref.entity_id.localeCompare(right.statement_ref.entity_id));
}

export function sortedMessages(values) {
  if (!Array.isArray(values)) fail();
  return [...values].sort((left, right) =>
    left.perception_result_ref.entity_id.localeCompare(
      right.perception_result_ref.entity_id
    ));
}

export function rowDigestInvalid(row, value, field) {
  return row[field] !== canonicalDigest(value);
}

export function refKey(value) {
  return `${value?.entity_kind ?? ''}\u0000${value?.entity_id ?? ''}`;
}

export function fail() {
  throw phase2IntegrityError();
}
