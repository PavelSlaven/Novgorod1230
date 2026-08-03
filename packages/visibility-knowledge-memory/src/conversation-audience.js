import { deepFreeze } from '@rus/kernel';
import { validateConversationStatementEvent } from
  './conversation-statement-validation.js';

const INPUT_KEYS = ['statement', 'listener_results'];
const LISTENER_RESULT_KEYS = [
  'listener_ref',
  'perception_result_ref',
  'perception_result',
  'comprehension',
  'speaker_recognized',
  'witness_policy_allows'
];
const REF_KEYS = ['entity_kind', 'entity_id'];
const LISTENER_KINDS = new Set(['npc', 'player_character']);
const PERCEPTION_REF_KINDS = new Set(['perception_result']);
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

function receivedClaim(claim) {
  return {
    claim_id: claim.claim_id,
    content_summary: claim.content_summary,
    form: claim.form,
    mentioned_entity_refs: claim.mentioned_entity_refs
  };
}

function validListenerResult(value) {
  if (!(exactRecord(value, LISTENER_RESULT_KEYS)
    && exactRef(value.listener_ref, LISTENER_KINDS)
    && exactRef(value.perception_result_ref, PERCEPTION_REF_KINDS)
    && PERCEPTION_RESULTS.has(value.perception_result)
    && COMPREHENSION_LEVELS.has(value.comprehension)
    && typeof value.speaker_recognized === 'boolean'
    && typeof value.witness_policy_allows === 'boolean')) {
    return false;
  }
  if (value.perception_result === 'not_perceived') {
    return value.comprehension === 'none'
      && value.speaker_recognized === false
      && value.witness_policy_allows === false;
  }
  if (value.perception_result === 'perceived_unidentified'
      && value.speaker_recognized) {
    return false;
  }
  return value.perception_result !== 'recognized'
    || value.speaker_recognized;
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
      comprehension: result.comprehension,
      speaker_ref: result.speaker_recognized ? statement.speaker_ref : null,
      utterance_text: result.comprehension === 'full' ? statement.utterance_text : null,
      claims: result.comprehension === 'full'
        && result.perception_result !== 'misinterpreted'
        ? statement.claims.map(receivedClaim)
        : [],
      delivery_cues: deliveryCues
    })),
    witness_candidate_refs: actualListeners
      .filter((result) => result.speaker_recognized
        && result.comprehension === 'full'
        && result.perception_result !== 'misinterpreted'
        && result.witness_policy_allows)
      .map(({ listener_ref }) => listener_ref)
  });
}
