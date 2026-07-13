import { createHash } from 'node:crypto';
import {
  buildStage26Approval,
  computeStage26Digest,
  STAGE26_RESULT_SCHEMA,
  validateStage26ToStage27Handoff
} from '../stages/stage26-first-game-screen.js';

export const FIRST_SCREEN_DELIVERY_ATTEMPT_SCHEMA = 'party_first_screen_delivery_attempt';
export const FIRST_SCREEN_DELIVERY_ACK_SCHEMA = 'first_screen_delivery_ack';
export const FIRST_SCREEN_DELIVERY_ACK_RESULT_SCHEMA = 'first_screen_delivery_ack_result';
export const STAGE27_INPUT_SCHEMA = 'first_turn_pipeline_input';
export const PLAYER_FIRST_TURN_INPUT_SCHEMA = 'player_first_turn_input';

export function createFirstScreenDeliveryAttempt({ stage26_result, existing_attempt = null, created_at = new Date().toISOString() } = {}) {
  const concerns = validateStage26ToStage27Handoff(stage26_result);
  if (concerns.length > 0) throw deliveryError('DELIVERY_STAGE26_INVALID', concerns);
  const screen = stage26_result.first_game_screen;
  const messageId = text(screen.delivery_state?.message_id);
  const screenDigest = stage26_result.screen_digest;
  if (!messageId) throw deliveryError('DELIVERY_MESSAGE_ID_MISSING');
  if (screenDigest !== computeStage26Digest(screen)) throw deliveryError('DELIVERY_SCREEN_DIGEST_MISMATCH');

  if (existing_attempt != null) {
    const issues = validateDeliveryAttempt(existing_attempt, stage26_result);
    if (issues.length > 0) throw deliveryError('DELIVERY_ATTEMPT_CONFLICT', issues);
    return deepFreeze(clone(existing_attempt));
  }

  return deepFreeze({
    version: 1,
    schema: FIRST_SCREEN_DELIVERY_ATTEMPT_SCHEMA,
    request_id: stage26_result.request_id,
    delivery_attempt_id: deterministicAttemptId(stage26_result.party_id, messageId, screenDigest),
    party_id: stage26_result.party_id,
    transaction_id: stage26_result.transaction_id,
    message_id: messageId,
    screen_digest: screenDigest,
    attempt_number: 1,
    status: 'pending',
    created_at,
    sent_at: null,
    awaiting_client_ack: true,
    opening_scene_presented: false
  });
}

export function markFirstScreenDeliverySent(attempt, { sent_at = new Date().toISOString() } = {}) {
  const issues = validateDeliveryAttempt(attempt);
  if (issues.length > 0) throw deliveryError('DELIVERY_ATTEMPT_INVALID', issues);
  if (attempt.status === 'acknowledged') return deepFreeze(clone(attempt));
  return deepFreeze({
    ...clone(attempt),
    status: 'sent',
    sent_at,
    awaiting_client_ack: true,
    opening_scene_presented: false
  });
}

export function validateDeliveryAttempt(attempt = {}, stage26Result = null) {
  const issues = [];
  if (!isObject(attempt) || attempt.version !== 1 || attempt.schema !== FIRST_SCREEN_DELIVERY_ATTEMPT_SCHEMA) issues.push(issue('DELIVERY_ATTEMPT_INVALID', `Expected ${FIRST_SCREEN_DELIVERY_ATTEMPT_SCHEMA} version 1.`, 'delivery_attempt'));
  for (const key of ['request_id', 'delivery_attempt_id', 'party_id', 'transaction_id', 'message_id', 'screen_digest']) if (!text(attempt?.[key])) issues.push(issue('DELIVERY_ATTEMPT_INVALID', `${key} is required.`, `delivery_attempt.${key}`));
  if (!['pending', 'sent', 'acknowledged', 'failed'].includes(attempt?.status)) issues.push(issue('DELIVERY_ATTEMPT_INVALID', 'Unsupported delivery status.', 'delivery_attempt.status'));
  if (attempt?.attempt_number !== 1) issues.push(issue('DELIVERY_ATTEMPT_INVALID', 'Opening delivery attempt_number must remain 1.', 'delivery_attempt.attempt_number'));
  if (stage26Result) {
    if (attempt.request_id !== stage26Result.request_id || attempt.party_id !== stage26Result.party_id || attempt.transaction_id !== stage26Result.transaction_id) issues.push(issue('DELIVERY_ATTEMPT_CONFLICT', 'Delivery identifiers differ from Stage 26.', 'delivery_attempt'));
    if (attempt.message_id !== stage26Result.first_game_screen?.delivery_state?.message_id || attempt.screen_digest !== stage26Result.screen_digest) issues.push(issue('DELIVERY_ATTEMPT_CONFLICT', 'Delivery message/screen binding differs from Stage 26.', 'delivery_attempt'));
  }
  return issues;
}

export function buildFirstScreenDeliveryAck({ attempt, client_ack_id, acknowledged_at = new Date().toISOString() } = {}) {
  const issues = validateDeliveryAttempt(attempt);
  if (issues.length > 0) throw deliveryError('DELIVERY_ATTEMPT_INVALID', issues);
  if (!text(client_ack_id)) throw deliveryError('DELIVERY_ACK_ID_MISSING');
  return deepFreeze({
    version: 1,
    schema: FIRST_SCREEN_DELIVERY_ACK_SCHEMA,
    request_id: attempt.request_id,
    party_id: attempt.party_id,
    transaction_id: attempt.transaction_id,
    message_id: attempt.message_id,
    screen_digest: attempt.screen_digest,
    client_ack_id: text(client_ack_id),
    acknowledged_at
  });
}

export function acknowledgeFirstScreenDelivery({ attempt, acknowledgement, existing_ack_result = null } = {}) {
  const attemptIssues = validateDeliveryAttempt(attempt);
  if (attemptIssues.length > 0) throw deliveryError('DELIVERY_ATTEMPT_INVALID', attemptIssues);
  const ackIssues = validateDeliveryAcknowledgement(acknowledgement, attempt);
  if (ackIssues.length > 0) throw deliveryError('DELIVERY_ACK_INVALID', ackIssues);

  if (existing_ack_result != null) {
    const prior = existing_ack_result.acknowledgement;
    if (canonical(prior) === canonical(acknowledgement)) return deepFreeze(clone(existing_ack_result));
    throw deliveryError('DELIVERY_ACK_CONFLICT', [issue('DELIVERY_ACK_CONFLICT', 'A conflicting acknowledgement already exists.', 'existing_ack_result')]);
  }

  const updatedAttempt = {
    ...clone(attempt),
    status: 'acknowledged',
    awaiting_client_ack: false,
    opening_scene_presented: true,
    shown_at: acknowledgement.acknowledged_at,
    client_ack_id: acknowledgement.client_ack_id
  };
  return deepFreeze({
    version: 1,
    schema: FIRST_SCREEN_DELIVERY_ACK_RESULT_SCHEMA,
    request_id: attempt.request_id,
    pass: true,
    party_id: attempt.party_id,
    transaction_id: attempt.transaction_id,
    message_id: attempt.message_id,
    screen_digest: attempt.screen_digest,
    delivery_attempt: updatedAttempt,
    acknowledgement: clone(acknowledgement),
    party_state_patch: {
      opening_scene_presented: true,
      opening_scene_presented_at: acknowledgement.acknowledged_at,
      current_phase: 'awaiting_player_input'
    },
    evidence: ['Client acknowledgement matches persisted message ID and immutable screen digest.']
  });
}

export function validateDeliveryAcknowledgement(ack = {}, attempt = {}) {
  const issues = [];
  if (!isObject(ack) || ack.version !== 1 || ack.schema !== FIRST_SCREEN_DELIVERY_ACK_SCHEMA) return [issue('DELIVERY_ACK_INVALID', `Expected ${FIRST_SCREEN_DELIVERY_ACK_SCHEMA} version 1.`, 'acknowledgement')];
  for (const key of ['request_id', 'party_id', 'transaction_id', 'message_id', 'screen_digest', 'client_ack_id', 'acknowledged_at']) if (!text(ack[key])) issues.push(issue('DELIVERY_ACK_INVALID', `${key} is required.`, `acknowledgement.${key}`));
  for (const key of ['request_id', 'party_id', 'transaction_id', 'message_id', 'screen_digest']) if (ack[key] !== attempt[key]) issues.push(issue('DELIVERY_ACK_BINDING_MISMATCH', `Acknowledgement ${key} mismatch.`, `acknowledgement.${key}`));
  return issues;
}

export function buildStage27FirstTurnInput({
  stage26_result,
  delivery_attempt,
  delivery_ack_result,
  raw_text = '',
  selected_action_option_id = null,
  input_source = null,
  received_at = new Date().toISOString()
} = {}) {
  const issues = validateStage26ToStage27IntentHandoff({ stage26_result, delivery_attempt, delivery_ack_result, selected_action_option_id });
  if (issues.length > 0) throw deliveryError('STAGE27_HANDOFF_INVALID', issues);
  const screen = stage26_result.first_game_screen;
  const selected = text(selected_action_option_id) || null;
  const raw = text(raw_text);
  const source = input_source ?? (selected && raw ? 'mixed' : selected ? 'suggested_action' : 'free_text');
  if (!['free_text', 'suggested_action', 'mixed'].includes(source)) throw deliveryError('STAGE27_INPUT_SOURCE_INVALID');
  if (!raw && !selected) throw deliveryError('STAGE27_PLAYER_INPUT_EMPTY');
  return deepFreeze({
    version: 1,
    schema: STAGE27_INPUT_SCHEMA,
    request_id: stage26_result.request_id,
    stage26_screen_approval: buildStage26Approval(stage26_result),
    party_id: stage26_result.party_id,
    transaction_id: stage26_result.transaction_id,
    current_turn_number: 1,
    party_state: {
      status: 'ready',
      current_phase: 'awaiting_player_input'
    },
    current_position: clone(screen.position_panel.position_ref),
    last_visible_context_package_digest: stage26_result.visible_context_package_digest,
    last_narrator_output_id: screen.delivery_state.message_id,
    screen_digest: stage26_result.screen_digest,
    delivery_ack_id: delivery_ack_result.acknowledgement.client_ack_id,
    player_input: {
      version: 1,
      schema: PLAYER_FIRST_TURN_INPUT_SCHEMA,
      party_id: stage26_result.party_id,
      turn_number: 1,
      raw_text: raw,
      selected_action_option_id: selected,
      input_source: source,
      received_at,
      interpretation_status: 'pending',
      contract: 'intent_not_fact',
      input_contract: 'intent_not_fact'
    },
    turn_policy: {
      must_resolve_against_current_state: true,
      must_not_treat_player_words_as_world_facts: true,
      must_check_visibility_access_knowledge: true,
      must_check_time_cost: true,
      must_check_risk_if_needed: true,
      must_update_world_before_next_prose: true
    }
  });
}

export function validateStage26ToStage27IntentHandoff({ stage26_result, delivery_attempt, delivery_ack_result, selected_action_option_id = null } = {}) {
  const issues = validateStage26ToStage27Handoff(stage26_result);
  if (stage26_result?.schema !== STAGE26_RESULT_SCHEMA) issues.push(issue('STAGE27_STAGE26_RESULT_INVALID', 'Stage 26 result schema is invalid.', 'stage26_result'));
  issues.push(...validateDeliveryAttempt(delivery_attempt, stage26_result));
  if (delivery_attempt?.status !== 'acknowledged') issues.push(issue('STAGE27_DELIVERY_NOT_ACKNOWLEDGED', 'First-screen delivery must be acknowledged before first turn.', 'delivery_attempt.status'));
  if (!isObject(delivery_ack_result) || delivery_ack_result.version !== 1 || delivery_ack_result.schema !== FIRST_SCREEN_DELIVERY_ACK_RESULT_SCHEMA || delivery_ack_result.pass !== true) issues.push(issue('STAGE27_DELIVERY_NOT_ACKNOWLEDGED', 'Valid delivery acknowledgement result is required.', 'delivery_ack_result'));
  else {
    if (delivery_ack_result.screen_digest !== stage26_result?.screen_digest || delivery_ack_result.message_id !== stage26_result?.first_game_screen?.delivery_state?.message_id) issues.push(issue('STAGE27_DELIVERY_BINDING_MISMATCH', 'Delivery acknowledgement does not match Stage 26 screen.', 'delivery_ack_result'));
  }
  const selected = text(selected_action_option_id);
  if (selected) {
    const ids = new Set((stage26_result?.first_game_screen?.action_panel?.suggested_actions ?? []).map((item) => item.option_id));
    if (!ids.has(selected)) issues.push(issue('STAGE27_ACTION_OPTION_NOT_APPROVED', 'Selected action option is not part of approved Stage 26 screen.', 'selected_action_option_id'));
  }
  return issues;
}

function deterministicAttemptId(partyId, messageId, screenDigest) {
  const hash = createHash('sha256').update(`${partyId}|${messageId}|${screenDigest}`).digest('hex').slice(0, 24);
  return `first-screen-delivery:${hash}`;
}

function deliveryError(code, details = []) {
  const error = new Error(code);
  error.code = code;
  error.concerns = Array.isArray(details) ? details : [];
  return error;
}

function issue(code, message, path = null) {
  return { code, message, path };
}

function canonical(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}
