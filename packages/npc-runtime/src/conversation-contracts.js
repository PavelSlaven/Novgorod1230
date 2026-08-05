import {
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
import { validateAllowedContributionReferences } from
  './conversation-reference-contracts.js';

export {
  buildConversationSession,
  buildConversationStatementEvent,
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
  return exactKeys(value, [
    'conversation_mode',
    'action_handoff_available',
    'combat_handoff_available',
    'allowed_attribute_refs',
    'allowed_skill_refs',
    'allowed_check_profile_refs',
    'operation_contract'
  ])
    && value.conversation_mode === true
    && typeof value.action_handoff_available === 'boolean'
    && typeof value.combat_handoff_available === 'boolean'
    && uniqueStableIds(value.allowed_attribute_refs)
    && uniqueStableIds(value.allowed_skill_refs)
    && uniqueStableIds(value.allowed_check_profile_refs)
    && plainRecord(value.operation_contract)
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
    && jsonSafe(value);
}

export function buildNpcConversationResponseRequest(value) {
  return buildValidated(value, validateNpcConversationResponseRequest, 'npc_conversation_response_request_v1');
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
    && validateContributionBody(value, request));
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
