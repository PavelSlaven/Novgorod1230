import { deepFreeze } from '@rus/kernel';
import { validateConversationStatementEvent } from
  './conversation-statement-validation.js';

const INPUT_KEYS = ['statement', 'listener_results'];
const LISTENER_RESULT_KEYS = [
  'listener_ref',
  'perception_result_ref',
  'perception_result',
  'perceived_at',
  'same_time_batch_ref',
  'comprehension',
  'speaker_recognized'
];
const REF_KEYS = ['entity_kind', 'entity_id'];
const LISTENER_KINDS = new Set(['npc', 'player_character']);
const PERCEPTION_REF_KINDS = new Set(['perception_result']);
const TEMPORAL_BATCH_KINDS = new Set(['temporal_batch']);
const PERCEPTION_RESULTS = new Set([
  'not_perceived',
  'perceived_unidentified',
  'perceived_partial',
  'recognized',
  'misinterpreted'
]);
const COMPREHENSION_LEVELS = new Set(['full', 'partial', 'none']);
const ERROR_CODE = 'CONVERSATION_AUDIENCE_INPUT_INVALID';

function invalid() {
  throw Object.assign(
    new TypeError('Conversation audience input must be a strict cloneable contract'),
    { code: ERROR_CODE }
  );
}

function plainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactRecord(value, keys) {
  return plainRecord(value)
    && Reflect.ownKeys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function exactText(value) {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

function exactRef(value, expectedKinds) {
  return exactRecord(value, REF_KEYS)
    && expectedKinds.has(value.entity_kind)
    && exactText(value.entity_id);
}

function refKey(value) {
  return `${value.entity_kind}\u0000${value.entity_id}`;
}

export function projectConversationReceivedClaims(claims) {
  if (!Array.isArray(claims)) invalid();
  return claims.map((claim) => ({
    claim_id: claim.claim_id,
    content_summary: claim.content_summary,
    form: claim.form,
    mentioned_entity_refs: claim.mentioned_entity_refs
  }));
}

function validListenerResult(value) {
  if (!(exactRecord(value, LISTENER_RESULT_KEYS)
    && exactRef(value.listener_ref, LISTENER_KINDS)
    && exactRef(value.perception_result_ref, PERCEPTION_REF_KINDS)
    && exactRef(value.same_time_batch_ref, TEMPORAL_BATCH_KINDS)
    && exactTimestamp(value.perceived_at)
    && PERCEPTION_RESULTS.has(value.perception_result)
    && COMPREHENSION_LEVELS.has(value.comprehension)
    && typeof value.speaker_recognized === 'boolean')) {
    return false;
  }
  if (value.perception_result === 'not_perceived') {
    return value.comprehension === 'none'
      && value.speaker_recognized === false;
  }
  if (value.perception_result === 'perceived_unidentified'
      && value.speaker_recognized) {
    return false;
  }
  return value.perception_result !== 'recognized'
    || value.speaker_recognized;
}

function exactTimestamp(value) {
  return exactRecord(value, [
    'whole_minutes', 'subminute_numerator', 'subminute_denominator'
  ]) && /^\d+$/u.test(value.whole_minutes)
    && /^\d+$/u.test(value.subminute_numerator)
    && /^[1-9]\d*$/u.test(value.subminute_denominator);
}

function formalInput(input) {
  if (!exactRecord(input, INPUT_KEYS)
    || !validateConversationStatementEvent(input.statement)
    || !Array.isArray(input.listener_results)
    || input.listener_results.some((result) => !validListenerResult(result))) {
    return null;
  }

  const listenerKeys = input.listener_results.map(({ listener_ref }) => refKey(listener_ref));
  const perceptionKeys = input.listener_results.map(
    ({ perception_result_ref }) => refKey(perception_result_ref)
  );
  if (new Set(listenerKeys).size !== listenerKeys.length
    || new Set(perceptionKeys).size !== perceptionKeys.length) {
    return null;
  }

  return input;
}

function validateInput(input) {
  if (formalInput(input) === null) return null;

  let clone;
  try {
    clone = structuredClone(input);
  } catch {
    return null;
  }

  return formalInput(clone);
}

export function projectConversationAudience(input = {}) {
  let validated;
  try {
    validated = validateInput(input);
  } catch {
    invalid();
  }
  if (validated === null) invalid();

  const { statement, listener_results: listenerResults } = validated;
  const statementRef = {
    entity_kind: 'conversation_statement',
    entity_id: statement.statement_id
  };
  const deliveryCues = statement.social_delivery_result?.observable_effects ?? [];
  const actualListeners = listenerResults
    .filter(({ perception_result, comprehension }) =>
      perception_result !== 'not_perceived' && comprehension !== 'none')
    .sort((left, right) => refKey(left.listener_ref).localeCompare(
      refKey(right.listener_ref),
      'en'
    ));

  return deepFreeze({
    schema: 'conversation_audience_projection_v1',
    statement_ref: statementRef,
    actual_listener_refs: actualListeners.map(({ listener_ref }) => listener_ref),
    received_messages: actualListeners.map((result) => ({
      source_statement_ref: statementRef,
      listener_ref: result.listener_ref,
      perception_result_ref: result.perception_result_ref,
      perception_result: result.perception_result,
      perceived_at: result.perceived_at,
      same_time_batch_ref: result.same_time_batch_ref,
      comprehension: result.comprehension,
      speaker_ref: result.speaker_recognized ? statement.speaker_ref : null,
      utterance_text: result.comprehension === 'full' ? statement.utterance_text : null,
      claims: result.comprehension === 'full'
        && result.perception_result !== 'misinterpreted'
        ? projectConversationReceivedClaims(statement.claims)
        : [],
      delivery_cues: deliveryCues
    })),
    witness_candidate_refs: actualListeners
      .filter((result) => result.speaker_recognized
        && result.comprehension === 'full'
        && result.perception_result !== 'misinterpreted')
      .map(({ listener_ref }) => listener_ref)
  });
}

export function projectConversationNonverbalAudience(input = {}) {
  const contribution = input?.contribution;
  const observerResults = input?.observer_results;
  if (!exactRecord(input, ['contribution', 'observer_results'])
      || !exactRecord(contribution, [
        'schema', 'contribution_id', 'conversation_id', 'exchange_id',
        'speaker_ref', 'contribution_kind', 'handoff', 'nonverbal_audience'
      ])
      || contribution.schema
        !== 'conversation_non_statement_contribution_v1'
      || contribution.contribution_kind !== 'silence'
      || !exactText(contribution.contribution_id)
      || !exactText(contribution.conversation_id)
      || !exactText(contribution.exchange_id)
      || !exactRef(contribution.speaker_ref,
        new Set(['npc', 'player_character']))
      || contribution.handoff !== null
      || contribution.nonverbal_audience !== null
      || !Array.isArray(observerResults)
      || observerResults.some((result) => !validNonverbalObserver(result))) {
    invalid();
  }
  const observerKeys = observerResults.map(({ observer_ref: observerRef }) =>
    refKey(observerRef));
  const perceptionKeys = observerResults.map(
    ({ perception_result_ref: perceptionRef }) => refKey(perceptionRef)
  );
  if (new Set(observerKeys).size !== observerKeys.length
      || new Set(perceptionKeys).size !== perceptionKeys.length) {
    invalid();
  }
  const contributionRef = {
    entity_kind: 'conversation_contribution',
    entity_id: contribution.contribution_id
  };
  const actualObservers = observerResults
    .filter(({ perception_result: result }) => result !== 'not_perceived')
    .sort((left, right) => refKey(left.observer_ref).localeCompare(
      refKey(right.observer_ref), 'en'
    ));
  return deepFreeze({
    schema: 'conversation_nonverbal_audience_projection_v1',
    contribution_ref: contributionRef,
    actual_observer_refs: actualObservers.map(
      ({ observer_ref: observerRef }) => observerRef
    ),
    observations: actualObservers.map((result) => ({
      source_contribution_ref: contributionRef,
      observer_ref: result.observer_ref,
      perception_result_ref: result.perception_result_ref,
      perception_result: result.perception_result,
      perceived_at: result.perceived_at,
      same_time_batch_ref: result.same_time_batch_ref,
      speaker_ref: result.speaker_recognized
        ? contribution.speaker_ref : null,
      observed_kind: 'silence'
    })),
    witness_candidate_refs: actualObservers
      .filter(({ speaker_recognized: speakerRecognized }) => speakerRecognized)
      .map(({ observer_ref: observerRef }) => observerRef)
  });
}

function validNonverbalObserver(value) {
  return exactRecord(value, [
    'observer_ref', 'perception_result_ref', 'perception_result',
    'perceived_at', 'same_time_batch_ref', 'speaker_recognized'
  ])
    && exactRef(value.observer_ref, LISTENER_KINDS)
    && exactRef(value.perception_result_ref, PERCEPTION_REF_KINDS)
    && exactRef(value.same_time_batch_ref, TEMPORAL_BATCH_KINDS)
    && exactTimestamp(value.perceived_at)
    && ['not_perceived', 'perceived_partial', 'recognized']
      .includes(value.perception_result)
    && typeof value.speaker_recognized === 'boolean'
    && (value.perception_result !== 'not_perceived'
      || value.speaker_recognized === false);
}
