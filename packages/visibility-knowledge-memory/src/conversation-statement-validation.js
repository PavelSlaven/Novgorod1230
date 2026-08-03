const DOMINANT_ACTS = new Set([
  'greet',
  'farewell',
  'question',
  'answer',
  'inform',
  'request',
  'command',
  'offer',
  'accept',
  'refuse',
  'negotiate',
  'promise',
  'threaten',
  'accuse',
  'confess',
  'evade',
  'warn',
  'challenge',
  'apologize'
]);
const SPEAKER_POSTURES = new Set([
  'believed_true',
  'knowingly_false',
  'mixed',
  'uncertain',
  'withheld'
]);
const CHECK_OUTCOMES = [
  'clean_success',
  'success',
  'success_with_cost',
  'failure_with_consequence',
  'severe_failure'
];
const DELIVERY_QUALITIES = new Set([
  'compelling',
  'credible',
  'credible_with_visible_cost',
  'unconvincing',
  'transparently_manipulative'
]);
const DELIVERY_QUALITY_BY_OUTCOME = Object.freeze({
  clean_success: 'compelling',
  success: 'credible',
  success_with_cost: 'credible_with_visible_cost',
  failure_with_consequence: 'unconvincing',
  severe_failure: 'transparently_manipulative'
});
const DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)$/u;
const POSITIVE_DECIMAL_PATTERN = /^[1-9][0-9]*$/u;

export function validateConversationStatementEvent(value) {
  return exactKeys(value, [
    'schema',
    'statement_id',
    'conversation_id',
    'exchange_id',
    'speaker_ref',
    'intended_addressee_refs',
    'utterance_text',
    'dominant_act',
    'interaction_tags',
    'topic_refs',
    'claims',
    'message_completeness',
    'spoken_at',
    'duration',
    'social_delivery_result',
    'source_plan_ref'
  ])
    && value.schema === 'conversation_statement_event_v1'
    && stableId(value.statement_id)
    && stableId(value.conversation_id)
    && stableId(value.exchange_id)
    && contractEntityRef(value.speaker_ref)
    && uniqueContractEntityRefs(value.intended_addressee_refs)
    && nonEmptyText(value.utterance_text)
    && DOMINANT_ACTS.has(value.dominant_act)
    && uniqueStableIds(value.interaction_tags)
    && uniqueStableIds(value.topic_refs)
    && Array.isArray(value.claims)
    && value.claims.every(validateClaim)
    && new Set(value.claims.map(({ claim_id: claimId }) => claimId)).size
      === value.claims.length
    && value.message_completeness === 'complete'
    && validTimestamp(value.spoken_at)
    && plainRecord(value.duration)
    && jsonSafe(value.duration)
    && (value.social_delivery_result === null
      || validateSocialDeliveryResult(value.social_delivery_result))
    && contractEntityRef(value.source_plan_ref, 'semantic_plan')
    && jsonSafe(value);
}

function validateClaim(value) {
  return exactKeys(value, [
    'claim_id',
    'content_summary',
    'form',
    'speaker_posture',
    'source_knowledge_refs',
    'mentioned_entity_refs'
  ])
    && stableId(value.claim_id)
    && nonEmptyText(value.content_summary)
    && stableId(value.form)
    && SPEAKER_POSTURES.has(value.speaker_posture)
    && uniqueContractEntityRefs(value.source_knowledge_refs)
    && uniqueContractEntityRefs(value.mentioned_entity_refs);
}

function validateSocialDeliveryResult(value) {
  return exactKeys(value, [
    'schema',
    'check_resolution_id',
    'outcome_band',
    'delivery_quality',
    'observable_effects'
  ])
    && value.schema === 'social_delivery_result_v1'
    && stableId(value.check_resolution_id)
    && CHECK_OUTCOMES.includes(value.outcome_band)
    && DELIVERY_QUALITIES.has(value.delivery_quality)
    && value.delivery_quality ===
      DELIVERY_QUALITY_BY_OUTCOME[value.outcome_band]
    && uniqueStableIds(value.observable_effects)
    && jsonSafe(value);
}

function validTimestamp(value) {
  if (!exactKeys(value, [
    'whole_minutes',
    'subminute_numerator',
    'subminute_denominator'
  ])
      || typeof value.whole_minutes !== 'string'
      || !DECIMAL_PATTERN.test(value.whole_minutes)
      || typeof value.subminute_numerator !== 'string'
      || !DECIMAL_PATTERN.test(value.subminute_numerator)
      || typeof value.subminute_denominator !== 'string'
      || !POSITIVE_DECIMAL_PATTERN.test(value.subminute_denominator)) {
    return false;
  }
  return BigInt(value.subminute_numerator)
    < BigInt(value.subminute_denominator);
}

function contractEntityRef(value, expectedKind = null) {
  return exactKeys(value, ['entity_kind', 'entity_id'])
    && stableId(value.entity_kind)
    && stableId(value.entity_id)
    && (expectedKind === null || value.entity_kind === expectedKind);
}

function uniqueContractEntityRefs(values) {
  return Array.isArray(values)
    && values.every((value) => contractEntityRef(value))
    && new Set(values.map(refKey)).size === values.length;
}

function uniqueStableIds(values) {
  return Array.isArray(values)
    && values.every(stableId)
    && new Set(values).size === values.length;
}

function exactKeys(value, expectedKeys) {
  if (!record(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function stableId(value) {
  return typeof value === 'string'
    && value.trim() === value
    && value.length > 0;
}

function nonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function refKey(value) {
  return `${value.entity_kind}\u0000${value.entity_id}`;
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function plainRecord(value) {
  if (!record(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function jsonSafe(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string'
      || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;
  if (!Array.isArray(value) && !plainRecord(value)) return false;

  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry) => jsonSafe(entry, ancestors))
    : Object.entries(value).every(([key, entry]) =>
        stableId(key) && jsonSafe(entry, ancestors));
  ancestors.delete(value);
  return valid;
}
