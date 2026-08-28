import {
  exactKeys,
  freeze,
  normalizeTimestamp,
  refKey,
  stableId,
  uniqueStableIds
} from './internal.js';
import { validateAllowedContributionReferences, validateContributionReferences } from './conversation-reference-contracts.js';
import { matchesContributionRequirement, sameRequiredCheck,
  validateContributionRequirement } from
  './conversation-contribution-requirements.js';
import { CHECK_OUTCOMES, DELIVERY_QUALITY_BY_OUTCOME,
  validateSocialDeliveryResult } from
  './conversation-social-delivery-contract.js';
const SESSION_STATUSES = new Set(['active', 'suspended', 'ended']);
const CONTRIBUTION_KINDS = new Set([
  'speech',
  'silence',
  'leave_conversation',
  'action_handoff',
  'combat_handoff'
]);
const INPUT_MODES = new Set(['verbatim', 'intent_paraphrase']);
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
const ADAPTATIONS = new Set([
  'literal',
  'historical_equivalent',
  'reality_limited',
  'make_believe'
]);
const RESOLUTIONS = new Set(['automatic', 'check_required']);
const DURATION_CLASSES = new Set(['moment', 'brief', 'short', 'domain_owned']);
const DECISION_SIGNIFICANCE = new Set(['material', 'critical']);
const DECISION_CATEGORIES = Object.freeze([
  'self',
  'others',
  'environment',
  'objective',
  'communication'
]);
const DECISION_CATEGORY_SET = new Set(DECISION_CATEGORIES);
function plainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function jsonSafe(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;
  if (!Array.isArray(value) && !plainRecord(value)) return false;

  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry) => jsonSafe(entry, ancestors))
    : Object.entries(value).every(([key, entry]) => stableId(key) && jsonSafe(entry, ancestors));
  ancestors.delete(value);
  return valid;
}

function nonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stateVersion(value) {
  return Number.isSafeInteger(value) && value >= 1;
}

function contractEntityRef(value, expectedKind = null) {
  return exactKeys(value, ['entity_kind', 'entity_id'])
    && stableId(value.entity_kind)
    && stableId(value.entity_id)
    && (expectedKind === null || value.entity_kind === expectedKind);
}

function uniqueContractEntityRefs(values, expectedKind = null) {
  return Array.isArray(values)
    && values.every((value) => contractEntityRef(value, expectedKind))
    && new Set(values.map(refKey)).size === values.length;
}

function nullableEntityRef(value, expectedKind = null) {
  return value === null || contractEntityRef(value, expectedKind);
}

function uniqueRefsOfKind(values, expectedKind = null) {
  return uniqueContractEntityRefs(values, expectedKind);
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
  return Array.isArray(value) && value.every((reference, index) => index === 0
    || refKey(value[index - 1]) < refKey(reference));
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

function validateResponseExpectation(value) {
  return exactKeys(value, ['kind', 'target_refs'])
    && stableId(value.kind)
    && uniqueContractEntityRefs(value.target_refs)
    && (value.kind !== 'none' || value.target_refs.length === 0);
}

function validateSpeech(value) {
  return exactKeys(value, [
    'utterance_text',
    'dominant_act',
    'interaction_tags',
    'topic_refs',
    'claims',
    'response_expectation'
  ])
    && nonEmptyText(value.utterance_text)
    && DOMINANT_ACTS.has(value.dominant_act)
    && uniqueStableIds(value.interaction_tags)
    && uniqueStableIds(value.topic_refs)
    && Array.isArray(value.claims)
    && value.claims.every(validateClaim)
    && new Set(value.claims.map(({ claim_id }) => claim_id)).size === value.claims.length
    && validateResponseExpectation(value.response_expectation);
}

export function diagnoseConversationPlanDominantAct(value) {
  if (value?.contribution_kind !== 'speech' || !plainRecord(value.speech)
    || DOMINANT_ACTS.has(value.speech.dominant_act)) return [];
  return freeze([{
    code: 'invalid_enum',
    path: '$.speech.dominant_act',
    message: 'dominant_act must be one of the allowed values.',
    allowed_values: [...DOMINANT_ACTS]
  }]);
}

function validateInterpretation(value) {
  return exactKeys(value, ['intent', 'grounded_contribution', 'adaptation'])
    && nonEmptyText(value.intent)
    && nonEmptyText(value.grounded_contribution)
    && ADAPTATIONS.has(value.adaptation);
}

function validateActivity(value) {
  return exactKeys(value, ['duration_class', 'effort'])
    && DURATION_CLASSES.has(value.duration_class)
    && stableId(value.effort);
}

function validateAllowedDurationClasses(value) {
  return Array.isArray(value)
    && value.length > 0
    && value.every((durationClass) => DURATION_CLASSES.has(durationClass))
    && new Set(value).size === value.length;
}

function validateCheckOutcome(value, outcome) {
  return exactKeys(value, ['delivery_quality', 'observable_effects'])
    && value.delivery_quality === DELIVERY_QUALITY_BY_OUTCOME[outcome]
    && uniqueStableIds(value.observable_effects);
}

function validateCheck(value, allowedAttributeRefs = null,
  allowedSkillRefs = null, allowedCheckProfileRefs = null) {
  return exactKeys(value, ['purpose', 'attribute_ref', 'skill_ref', 'difficulty_band', 'outcomes'])
    && nonEmptyText(value.purpose)
    && stableId(value.attribute_ref)
    && stableId(value.skill_ref)
    && stableId(value.difficulty_band)
    && exactKeys(value.outcomes, CHECK_OUTCOMES)
    && CHECK_OUTCOMES.every((outcome) => validateCheckOutcome(value.outcomes[outcome], outcome))
    && (allowedAttributeRefs === null || allowedAttributeRefs.includes(value.attribute_ref))
    && (allowedSkillRefs === null || allowedSkillRefs.includes(value.skill_ref))
    && (allowedCheckProfileRefs === null
      || allowedCheckProfileRefs.includes(value.difficulty_band));
}

function validateHandoff(value, contributionKind) {
  if (contributionKind === 'action_handoff') {
    return exactKeys(value, ['kind', 'intent'])
      && value.kind === 'actor_step'
      && nonEmptyText(value.intent);
  }
  if (contributionKind === 'combat_handoff') {
    return exactKeys(value, ['kind', 'intent', 'target_actor_refs'])
      && value.kind === 'combat'
      && nonEmptyText(value.intent)
      && uniqueContractEntityRefs(value.target_actor_refs)
      && value.target_actor_refs.length > 0;
  }
  return value === null;
}

function validateSupportingOperations(value, contributionKind, operationContract = null) {
  return Array.isArray(value)
    && value.length <= 1
    && value.every((operation) => plainRecord(operation)
      && stableId(operation.op)
      && jsonSafe(operation)
      && (operationContract === null || Object.hasOwn(operationContract, operation.op)))
    && (contributionKind === 'speech' || value.length === 0);
}

function validateContributionBody(value, request = null) {
  const operationContract = request?.schema === 'player_conversation_input_v1'
    ? request.operation_contract
    : request?.schema === 'npc_conversation_response_request_v1'
      ? request.decision_scope.operation_contract
      : null;
  const allowedAttributeRefs = request?.schema === 'npc_conversation_response_request_v1'
    ? request.decision_scope.allowed_attribute_refs
    : null;
  const allowedSkillRefs = request?.schema === 'npc_conversation_response_request_v1'
    ? request.decision_scope.allowed_skill_refs
    : null;
  const allowedCheckProfileRefs = request?.schema
      === 'npc_conversation_response_request_v1'
    ? request.decision_scope.allowed_check_profile_refs
    : null;
  const allowedDurationClasses = request?.schema
      === 'npc_conversation_response_request_v1'
    ? request.decision_scope.allowed_duration_classes
    : request?.schema === 'player_conversation_input_v1'
      ? request.player_safe_context.allowed_duration_classes
      : null;
  if (!CONTRIBUTION_KINDS.has(value.contribution_kind)
    || !nullableEntityRef(value.primary_addressee_ref)
    || !uniqueContractEntityRefs(value.intended_addressee_refs)
    || !uniqueContractEntityRefs(value.affected_actor_refs)
    || (value.primary_addressee_ref !== null
      && !value.intended_addressee_refs.some((reference) => refKey(reference) === refKey(value.primary_addressee_ref)))
    || !validateInterpretation(value.interpretation)
    || !validateActivity(value.activity)
    || (allowedDurationClasses !== null
      && !allowedDurationClasses.includes(value.activity.duration_class))
    || !validateSupportingOperations(
      value.supporting_operations,
      value.contribution_kind,
      operationContract
    )
    || !matchesContributionRequirement(value, request, operationContract)
    || !RESOLUTIONS.has(value.resolution)
    || !validateHandoff(value.handoff, value.contribution_kind)) {
    return false;
  }

  const allowedReferences = request?.schema === 'player_conversation_input_v1'
    ? request.player_safe_context.allowed_references
    : request?.schema === 'npc_conversation_response_request_v1' ? request.allowed_references : null;
  if (allowedReferences !== null && !validateContributionReferences(value, allowedReferences)) return false;

  if (value.contribution_kind === 'speech') {
    if (!validateSpeech(value.speech)) return false;
  } else if (value.speech !== null) {
    return false;
  }

  return value.resolution === 'automatic'
    ? value.check === null
    : validateCheck(value.check, allowedAttributeRefs, allowedSkillRefs,
      allowedCheckProfileRefs);
}

function validateRequiredIntendedAddressees(context) {
  const required = context.required_intended_addressee_refs;
  return required === undefined || uniqueContractEntityRefs(required)
    && required.length > 0 && required.every((reference) =>
      context.allowed_references.actor_refs.some((allowed) =>
        refKey(allowed) === refKey(reference)));
}

function matchesRequiredIntendedAddressees(plan, request) {
  const required = request.player_safe_context.required_intended_addressee_refs;
  return required === undefined || plan.intended_addressee_refs.length
    === required.length && required.every((reference) =>
      plan.intended_addressee_refs.some((intended) =>
        refKey(intended) === refKey(reference)));
}

function buildValidated(value, validator, contractName) {
  if (!validator(value)) {
    throw new TypeError(`${contractName} must be an exact JSON-safe contract`);
  }
  return freeze(value);
}

export function validateConversationSession(value) {
  return exactKeys(value, [
    'schema',
    'conversation_id',
    'state_version',
    'status',
    'started_at',
    'location_ref',
    'initiator_ref',
    'active_participant_refs',
    'last_contribution_ref',
    'topic_refs',
    'status_reason'
  ])
    && value.schema === 'conversation_session_v1'
    && stableId(value.conversation_id)
    && stateVersion(value.state_version)
    && SESSION_STATUSES.has(value.status)
    && normalizeTimestamp(value.started_at) !== null
    && contractEntityRef(value.location_ref, 'location')
    && contractEntityRef(value.initiator_ref)
    && uniqueContractEntityRefs(value.active_participant_refs)
    && value.active_participant_refs.length > 0
    && value.active_participant_refs.some((reference) => refKey(reference) === refKey(value.initiator_ref))
    && nullableEntityRef(value.last_contribution_ref)
    && uniqueStableIds(value.topic_refs)
    && (value.status_reason === null || nonEmptyText(value.status_reason))
    && jsonSafe(value);
}

export function buildConversationSession(value) {
  return buildValidated(value, validateConversationSession, 'conversation_session_v1');
}

export function validatePlayerConversationInput(value) {
  return exactKeys(value, [
    'schema',
    'request_id',
    'conversation_id',
    'state_version',
    'speaker_ref',
    'raw_text',
    'received_at',
    'player_safe_context',
    'operation_contract'
  ])
    && value.schema === 'player_conversation_input_v1'
    && stableId(value.request_id)
    && stableId(value.conversation_id)
    && stateVersion(value.state_version)
    && contractEntityRef(value.speaker_ref, 'player_character')
    && nonEmptyText(value.raw_text)
    && stableId(value.received_at)
    && plainRecord(value.player_safe_context)
    && validateAllowedDurationClasses(
      value.player_safe_context.allowed_duration_classes)
    && validateAllowedContributionReferences(
      value.player_safe_context.allowed_references)
    && validateRequiredIntendedAddressees(value.player_safe_context)
    && plainRecord(value.operation_contract)
    && validateContributionRequirement(
      value.player_safe_context, value.operation_contract)
    && (value.player_safe_context.required_check === undefined
      || value.player_safe_context.available_check === undefined
      || sameRequiredCheck(value.player_safe_context.required_check,
        value.player_safe_context.available_check))
    && jsonSafe(value);
}

export function buildPlayerConversationInput(value) {
  return buildValidated(value, validatePlayerConversationInput, 'player_conversation_input_v1');
}

export function validatePlayerConversationContributionPlan(value, request = null) {
  if (!exactKeys(value, [
    'schema',
    'request_id',
    'conversation_id',
    'state_version',
    'speaker_ref',
    'input_mode',
    'contribution_kind',
    'primary_addressee_ref',
    'intended_addressee_refs',
    'affected_actor_refs',
    'speech',
    'interpretation',
    'resolution',
    'activity',
    'supporting_operations',
    'check',
    'handoff'
  ])
    || value.schema !== 'player_conversation_contribution_plan_v1'
    || !stableId(value.request_id)
    || !stableId(value.conversation_id)
    || !stateVersion(value.state_version)
    || !contractEntityRef(value.speaker_ref, 'player_character')
    || !INPUT_MODES.has(value.input_mode)
    || (value.input_mode === 'verbatim' && value.interpretation?.adaptation === 'historical_equivalent')
    || !validateContributionBody(value)
    || !jsonSafe(value)) {
    return false;
  }

  return request === null || (validatePlayerConversationInput(request)
    && value.request_id === request.request_id
    && value.conversation_id === request.conversation_id
    && value.state_version === request.state_version
    && refKey(value.speaker_ref) === refKey(request.speaker_ref)
    && matchesRequiredIntendedAddressees(value, request)
    && validateContributionBody(value, request));
}

export function buildPlayerConversationContributionPlan(value, request = null) {
  return buildValidated(
    value,
    (plan) => validatePlayerConversationContributionPlan(plan, request),
    'player_conversation_contribution_plan_v1'
  );
}

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
    && new Set(value.claims.map(({ claim_id }) => claim_id)).size === value.claims.length
    && value.message_completeness === 'complete'
    && normalizeTimestamp(value.spoken_at) !== null
    && plainRecord(value.duration)
    && jsonSafe(value.duration)
    && (value.social_delivery_result === null
      || validateSocialDeliveryResult(value.social_delivery_result))
    && contractEntityRef(value.source_plan_ref, 'semantic_plan')
    && jsonSafe(value);
}

export function buildConversationStatementEvent(value) {
  return buildValidated(value, validateConversationStatementEvent, 'conversation_statement_event_v1');
}

export {
  DECISION_CATEGORIES,
  DECISION_CATEGORY_SET,
  DECISION_SIGNIFICANCE,
  buildValidated,
  canonicalCategories,
  canonicalRefs,
  contractEntityRef,
  jsonSafe,
  nonEmptyText,
  plainRecord,
  stateVersion,
  uniqueRefsOfKind,
  validateContributionBody
};
