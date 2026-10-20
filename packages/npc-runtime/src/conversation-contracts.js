import { isDeepStrictEqual } from 'node:util';
import {
  allowedKeys,
  exactKeys,
  freeze,
  normalizeTimestamp,
  refKey,
  stableId,
  uniqueStableIds
} from './internal.js';
import {
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
} from './conversation-contract-core.js';
import { validateNpc } from './npc-safe-subject-contract.js';
import { validateContributionRequirement } from
  './conversation-contribution-requirements.js';
import { validateAllowedContributionReferences } from
  './conversation-reference-contracts.js';

export {
  buildConversationSession,
  buildConversationStatementEvent,
  diagnoseConversationPlanDominantAct,
  buildPlayerConversationContributionPlan,
  buildPlayerConversationInput,
  validateConversationSession,
  validateConversationStatementEvent,
  validatePlayerConversationContributionPlan,
  validatePlayerConversationInput,
} from './conversation-contract-core.js';
export { buildSocialDeliveryResult, validateSocialDeliveryResult } from
  './conversation-social-delivery-contract.js';

function validateDecisionReasons(value) {
  return exactKeys(value, ['significance', 'categories', 'signal_refs', 'perceived_changes'])
    && DECISION_SIGNIFICANCE.has(value.significance)
    && canonicalCategories(value.categories)
    && uniqueRefsOfKind(value.signal_refs, 'npc_decision_signal')
    && value.signal_refs.length > 0
    && canonicalRefs(value.signal_refs)
    && Array.isArray(value.perceived_changes)
    && value.perceived_changes.length > 0
    && value.perceived_changes.every(nonEmptyText);
}

function validatePerceivedMessage(value) {
  return exactKeys(value, ['source_statement_ref', 'perception_result_ref'])
    && contractEntityRef(value.source_statement_ref, 'conversation_statement')
    && contractEntityRef(value.perception_result_ref, 'perception_result');
}

function validateDecisionScope(value) {
  const keys = [
    'conversation_mode',
    'action_handoff_available',
    'combat_handoff_available',
    'allowed_attribute_refs',
    'allowed_skill_refs',
    'allowed_check_profile_refs',
    'allowed_duration_classes',
    'operation_contract'
  ];
  return plainRecord(value)
    && keys.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => keys.includes(key)
      || ['required_resolution', 'required_check',
        'required_supporting_operation', 'allowed_contribution_kinds'].includes(key))
    && value.conversation_mode === true
    && typeof value.action_handoff_available === 'boolean'
    && typeof value.combat_handoff_available === 'boolean'
    && uniqueStableIds(value.allowed_attribute_refs)
    && uniqueStableIds(value.allowed_skill_refs)
    && uniqueStableIds(value.allowed_check_profile_refs)
    && Array.isArray(value.allowed_duration_classes)
    && value.allowed_duration_classes.length > 0
    && value.allowed_duration_classes.every((durationClass) =>
      ['moment', 'brief', 'short', 'domain_owned'].includes(durationClass))
    && new Set(value.allowed_duration_classes).size
      === value.allowed_duration_classes.length
    && plainRecord(value.operation_contract)
    && (value.allowed_contribution_kinds === undefined
      || Array.isArray(value.allowed_contribution_kinds)
        && value.allowed_contribution_kinds.length > 0
        && value.allowed_contribution_kinds.every((kind) =>
          ['speech', 'silence', 'leave_conversation', 'action_handoff',
            'combat_handoff'].includes(kind)))
    && validateContributionRequirement(value, value.operation_contract)
    && (value.required_check === undefined
      || value.allowed_attribute_refs.includes(value.required_check.attribute_ref)
        && value.allowed_skill_refs.includes(value.required_check.skill_ref)
        && value.allowed_check_profile_refs.includes(
          value.required_check.difficulty_band))
    && jsonSafe(value.operation_contract);
}

function validateAllowedReferences(value, npcRef, decisionScope) {
  if (!validateAllowedContributionReferences(value)) {
    return false;
  }
  const actorKeys = new Set(value.actor_refs.map(refKey));
  return actorKeys.has(refKey(npcRef))
    && value.combat_target_refs.every((reference) =>
      actorKeys.has(refKey(reference)))
    && (decisionScope.combat_handoff_available
      ? value.combat_target_refs.length > 0
      : value.combat_target_refs.length === 0);
}

export function validateNpcConversationResponseRequest(value) {
  return exactKeys(value, [
    'schema',
    'request_id',
    'boundary_id',
    'conversation_id',
    'exchange_id',
    'state_version',
    'requested_at',
    'npc_ref',
    'decision_reasons',
    'npc',
    'perceived_message',
    'public_conversation_history',
    'knowledge',
    'memory',
    'social_context',
    'available_resources',
    'allowed_references',
    'decision_scope'
  ])
    && value.schema === 'npc_conversation_response_request_v1'
    && stableId(value.request_id)
    && stableId(value.boundary_id)
    && stableId(value.conversation_id)
    && stableId(value.exchange_id)
    && stateVersion(value.state_version)
    && normalizeTimestamp(value.requested_at) !== null
    && contractEntityRef(value.npc_ref, 'npc')
    && validateDecisionReasons(value.decision_reasons)
    && plainRecord(value.npc)
    && (value.decision_reasons.categories.includes('communication')
      ? validatePerceivedMessage(value.perceived_message)
      : value.perceived_message === null)
    && Array.isArray(value.public_conversation_history)
    && plainRecord(value.knowledge)
    && plainRecord(value.memory)
    && plainRecord(value.social_context)
    && Array.isArray(value.available_resources)
    && validateDecisionScope(value.decision_scope)
    && validateAllowedReferences(
      value.allowed_references,
      value.npc_ref,
      value.decision_scope
    )
    && jsonSafe(value)
    && validateNpcConversationResponseSubject(value);
}

export function buildNpcConversationResponseRequest(value) {
  return buildValidated(value, validateNpcConversationResponseRequest, 'npc_conversation_response_request_v1');
}

const SUBJECT_KNOWLEDGE_GROUPS = [
  ['known_facts', 'fact_ref', 'known_fact', ['source_event_ref', 'resource_ref',
    'process_ref', 'summary', 'state', 'confidence']],
  ['beliefs', 'belief_ref', 'belief',
    ['source_event_ref', 'summary', 'state', 'confidence']],
  ['hypotheses', 'hypothesis_ref', 'hypothesis',
    ['source_event_ref', 'summary', 'state', 'confidence']]
];
const SUBJECT_MEMORY_EVENT_GROUPS = ['recent_events', 'relevant_long_term_events'];
const SUBJECT_MEMORY_KEYS = [...SUBJECT_MEMORY_EVENT_GROUPS, 'previous_decisions',
  'current_observations', 'received_messages'];
const SUBJECT_LINK_FIELDS = ['source_event_ref', 'resource_ref', 'process_ref',
  'request_ref', 'boundary_ref'];
const SUBJECT_TEXT_FIELDS = ['summary', 'state', 'confidence'];

function subjectProjectedEntry(entry, allowed, required) {
  return plainRecord(entry)
    && allowedKeys(entry, allowed, required)
    && Object.entries(entry).every(([key, field]) => {
      if (SUBJECT_LINK_FIELDS.includes(key)) {
        return field === null || stableId(field) || contractEntityRef(field);
      }
      return !SUBJECT_TEXT_FIELDS.includes(key) || nonEmptyText(field);
    });
}

function validateSubjectKnowledge(value) {
  return exactKeys(value, SUBJECT_KNOWLEDGE_GROUPS.map(([group]) => group))
    && SUBJECT_KNOWLEDGE_GROUPS.every(([group, ownKey, kind, fields]) =>
      Array.isArray(value[group]) && value[group].every((entry) =>
        subjectProjectedEntry(entry, [ownKey, ...fields], [ownKey])
        && contractEntityRef(entry[ownKey], kind)));
}

function validateSubjectMemoryEvent(entry) {
  return subjectProjectedEntry(entry,
    ['event_ref', 'source_event_ref', 'summary', 'occurred_at'], ['event_ref'])
    && contractEntityRef(entry.event_ref, 'memory_event')
    && (!Object.hasOwn(entry, 'occurred_at')
      || normalizeTimestamp(entry.occurred_at) !== null);
}

function validateSubjectObservation(entry) {
  return plainRecord(entry)
    && exactKeys(entry, ['observation_ref', 'source_type', 'observed_at', 'fact_text'])
    && contractEntityRef(entry.observation_ref, 'perception_result')
    && entry.source_type === 'direct_perception'
    && normalizeTimestamp(entry.observed_at) !== null
    && nonEmptyText(entry.fact_text);
}

function validateSubjectMemory(value) {
  return exactKeys(value, SUBJECT_MEMORY_KEYS)
    && SUBJECT_MEMORY_EVENT_GROUPS.every((group) =>
      Array.isArray(value[group]) && value[group].every(validateSubjectMemoryEvent))
    && Array.isArray(value.previous_decisions)
    && value.previous_decisions.every((entry) =>
      subjectProjectedEntry(entry, ['request_ref', 'boundary_ref'], []))
    && Array.isArray(value.current_observations)
    && value.current_observations.every(validateSubjectObservation)
    && Array.isArray(value.received_messages)
    && value.received_messages.every(plainRecord);
}

function subjectKnowledgeRefs(request) {
  return [
    { entity_kind: 'npc_identity', entity_id: request.npc_ref.entity_id },
    ...SUBJECT_KNOWLEDGE_GROUPS.flatMap(([group, ownKey]) =>
      request.knowledge[group].map((entry) => entry[ownKey])),
    ...SUBJECT_MEMORY_EVENT_GROUPS.flatMap((group) =>
      request.memory[group].map(({ event_ref: reference }) => reference)),
    ...request.memory.current_observations.map(
      ({ observation_ref: reference }) => reference)
  ];
}

export function validateNpcConversationResponseSubject(request) {
  if (!plainRecord(request) || !contractEntityRef(request.npc_ref, 'npc')
    || !validateNpc(request.npc)
    || !validateSubjectKnowledge(request.knowledge)
    || !validateSubjectMemory(request.memory)
    || !isDeepStrictEqual(request.available_resources, request.npc.available_resources)
    || !plainRecord(request.allowed_references)) {
    return false;
  }
  const allowed = request.allowed_references.knowledge_refs;
  if (!Array.isArray(allowed) || !allowed.every((reference) =>
    contractEntityRef(reference))) {
    return false;
  }
  const allowedKeysSet = new Set(allowed.map(refKey));
  return subjectKnowledgeRefs(request).every((reference) =>
    allowedKeysSet.has(refKey(reference)));
}

export function validateConversationContributionPlan(value, request = null) {
  if (!exactKeys(value, [
    'schema',
    'request_id',
    'boundary_id',
    'conversation_id',
    'exchange_id',
    'state_version',
    'speaker_ref',
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
    'handoff',
    'reason'
  ])
    || value.schema !== 'conversation_contribution_plan_v1'
    || !stableId(value.request_id)
    || !stableId(value.boundary_id)
    || !stableId(value.conversation_id)
    || !stableId(value.exchange_id)
    || !stateVersion(value.state_version)
    || !contractEntityRef(value.speaker_ref, 'npc')
    || !validateContributionBody(value)
    || !nonEmptyText(value.reason)
    || !jsonSafe(value)) {
    return false;
  }

  return request === null || (validateNpcConversationResponseRequest(request)
    && value.request_id === request.request_id
    && value.boundary_id === request.boundary_id
    && value.conversation_id === request.conversation_id
    && value.exchange_id === request.exchange_id
    && value.state_version === request.state_version
    && refKey(value.speaker_ref) === refKey(request.npc_ref)
    && validateContributionBody(value, request)
    && (request.decision_scope.allowed_contribution_kinds === undefined
      || request.decision_scope.allowed_contribution_kinds.includes(
        value.contribution_kind)));
}

export function buildConversationContributionPlan(value, request = null) {
  return buildValidated(
    value,
    (plan) => validateConversationContributionPlan(plan, request),
    'conversation_contribution_plan_v1'
  );
}

export function orderNpcConversationDecisionRequests(requests, directAddresseeRefs = []) {
  if (!Array.isArray(requests)
    || requests.some((request) => !validateNpcConversationResponseRequest(request))
    || new Set(requests.map(({ request_id }) => request_id)).size !== requests.length
    || !uniqueRefsOfKind(directAddresseeRefs, 'npc')) {
    throw new TypeError('NPC conversation requests and direct addressees must be unique formal arrays');
  }

  const directKeys = new Set(directAddresseeRefs.map(refKey));
  return freeze([...requests].sort((left, right) => {
    const leftDirect = directKeys.has(refKey(left.npc_ref));
    const rightDirect = directKeys.has(refKey(right.npc_ref));
    return Number(rightDirect) - Number(leftDirect)
      || refKey(left.npc_ref).localeCompare(refKey(right.npc_ref), 'en')
      || left.boundary_id.localeCompare(right.boundary_id, 'en');
  }));
}
