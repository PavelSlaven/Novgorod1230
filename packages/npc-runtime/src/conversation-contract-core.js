import { exactKeys, normalizeTimestamp, refKey, stableId, uniqueStableIds } from './internal.js';
import {
  DOMINANT_ACTS, buildValidated, contractEntityRef, jsonSafe, nonEmptyText,
  plainRecord, stateVersion, uniqueContractEntityRefs, validateAllowedDurationClasses,
  validateClaim, validateContributionBody, validateRequiredIntendedAddressees,
  matchesRequiredIntendedAddressees
} from './conversation-contribution-contract.js';
import { sameRequiredCheck, validateContributionRequirement } from './conversation-contribution-requirements.js';
import { validateAllowedContributionReferences } from './conversation-reference-contracts.js';
import { validateSocialDeliveryResult } from './conversation-social-delivery-contract.js';

const SESSION_STATUSES = new Set(['active', 'suspended', 'ended']);
const INPUT_MODES = new Set(['verbatim', 'intent_paraphrase']);
const DECISION_SIGNIFICANCE = new Set(['material', 'critical']);
const DECISION_CATEGORIES = Object.freeze(['self', 'others', 'environment', 'objective', 'communication']);
const DECISION_CATEGORY_SET = new Set(DECISION_CATEGORIES);

export { diagnoseConversationPlanDominantAct } from './conversation-contribution-contract.js';

export function validateConversationSession(value) {
  return exactKeys(value, ['schema', 'conversation_id', 'state_version', 'status', 'started_at', 'location_ref', 'initiator_ref', 'active_participant_refs', 'last_contribution_ref', 'topic_refs', 'status_reason'])
    && value.schema === 'conversation_session_v1' && stableId(value.conversation_id)
    && stateVersion(value.state_version) && SESSION_STATUSES.has(value.status)
    && normalizeTimestamp(value.started_at) !== null && contractEntityRef(value.location_ref, 'location')
    && contractEntityRef(value.initiator_ref) && uniqueContractEntityRefs(value.active_participant_refs)
    && value.active_participant_refs.length > 0 && value.active_participant_refs.some((reference) => refKey(reference) === refKey(value.initiator_ref))
    && (value.last_contribution_ref === null || contractEntityRef(value.last_contribution_ref))
    && uniqueStableIds(value.topic_refs) && (value.status_reason === null || nonEmptyText(value.status_reason))
    && jsonSafe(value);
}
export function buildConversationSession(value) {
  return buildValidated(value, validateConversationSession, 'conversation_session_v1');
}

export function validatePlayerConversationInput(value) {
  return exactKeys(value, ['schema', 'request_id', 'conversation_id', 'state_version', 'speaker_ref', 'raw_text', 'received_at', 'player_safe_context', 'operation_contract'])
    && value.schema === 'player_conversation_input_v1' && stableId(value.request_id)
    && stableId(value.conversation_id) && stateVersion(value.state_version)
    && contractEntityRef(value.speaker_ref, 'player_character') && nonEmptyText(value.raw_text)
    && stableId(value.received_at) && plainRecord(value.player_safe_context)
    && validateAllowedDurationClasses(value.player_safe_context.allowed_duration_classes)
    && validateAllowedContributionReferences(value.player_safe_context.allowed_references)
    && validateRequiredIntendedAddressees(value.player_safe_context)
    && plainRecord(value.operation_contract)
    && validateContributionRequirement(value.player_safe_context, value.operation_contract)
    && (value.player_safe_context.required_check === undefined || value.player_safe_context.available_check === undefined || sameRequiredCheck(value.player_safe_context.required_check, value.player_safe_context.available_check))
    && jsonSafe(value);
}
export function buildPlayerConversationInput(value) {
  return buildValidated(value, validatePlayerConversationInput, 'player_conversation_input_v1');
}

export function validatePlayerConversationContributionPlan(value, request = null) {
  if (!exactKeys(value, ['schema', 'request_id', 'conversation_id', 'state_version', 'speaker_ref', 'input_mode', 'contribution_kind', 'primary_addressee_ref', 'intended_addressee_refs', 'affected_actor_refs', 'speech', 'interpretation', 'resolution', 'activity', 'supporting_operations', 'check', 'handoff'])
    || value.schema !== 'player_conversation_contribution_plan_v1' || !stableId(value.request_id)
    || !stableId(value.conversation_id) || !stateVersion(value.state_version)
    || !contractEntityRef(value.speaker_ref, 'player_character') || !INPUT_MODES.has(value.input_mode)
    || (value.input_mode === 'verbatim' && value.interpretation?.adaptation === 'historical_equivalent')
    || !validateContributionBody(value) || !jsonSafe(value)) return false;
  return request === null || (validatePlayerConversationInput(request) && value.request_id === request.request_id
    && value.conversation_id === request.conversation_id && value.state_version === request.state_version
    && refKey(value.speaker_ref) === refKey(request.speaker_ref)
    && matchesRequiredIntendedAddressees(value, request)
    && validateContributionBody(value, request));
}
export function buildPlayerConversationContributionPlan(value, request = null) {
  return buildValidated(value, (plan) => validatePlayerConversationContributionPlan(plan, request), 'player_conversation_contribution_plan_v1');
}

export function validateConversationStatementEvent(value) {
  return exactKeys(value, ['schema', 'statement_id', 'conversation_id', 'exchange_id', 'speaker_ref', 'intended_addressee_refs', 'utterance_text', 'dominant_act', 'interaction_tags', 'topic_refs', 'claims', 'message_completeness', 'spoken_at', 'duration', 'social_delivery_result', 'source_plan_ref'])
    && value.schema === 'conversation_statement_event_v1' && stableId(value.statement_id)
    && stableId(value.conversation_id) && stableId(value.exchange_id) && contractEntityRef(value.speaker_ref)
    && uniqueContractEntityRefs(value.intended_addressee_refs) && nonEmptyText(value.utterance_text)
    && DOMINANT_ACTS.has(value.dominant_act) && uniqueStableIds(value.interaction_tags)
    && uniqueStableIds(value.topic_refs) && Array.isArray(value.claims) && value.claims.every(validateClaim)
    && new Set(value.claims.map(({ claim_id }) => claim_id)).size === value.claims.length
    && value.message_completeness === 'complete' && normalizeTimestamp(value.spoken_at) !== null
    && plainRecord(value.duration) && jsonSafe(value.duration)
    && (value.social_delivery_result === null || validateSocialDeliveryResult(value.social_delivery_result))
    && contractEntityRef(value.source_plan_ref, 'semantic_plan') && jsonSafe(value);
}
export function buildConversationStatementEvent(value) {
  return buildValidated(value, validateConversationStatementEvent, 'conversation_statement_event_v1');
}

function canonicalCategories(value) {
  if (!Array.isArray(value) || value.length === 0) return false;
  let previous = -1;
  for (const category of value) {
    const current = DECISION_CATEGORIES.indexOf(category);
    if (current <= previous || !DECISION_CATEGORY_SET.has(category)) return false;
    previous = current;
  }
  return true;
}
function canonicalRefs(value) {
  return Array.isArray(value) && value.every((reference, index) => index === 0 || refKey(value[index - 1]) < refKey(reference));
}
function uniqueRefsOfKind(values, expectedKind = null) {
  return uniqueContractEntityRefs(values, expectedKind);
}
export { DECISION_CATEGORIES, DECISION_CATEGORY_SET, DECISION_SIGNIFICANCE, buildValidated, canonicalCategories, canonicalRefs, contractEntityRef, jsonSafe, nonEmptyText, plainRecord, stateVersion, uniqueRefsOfKind, validateContributionBody };
