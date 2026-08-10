import {
  exactKeys,
  freeze,
  record,
  stableId,
  uniqueStableIds
} from './internal.js';
import {
  validateConversationContributionPlan,
  validateNpcConversationResponseRequest
} from './conversation-contracts.js';
import {
  validateNpcCombatDecisionRequest,
  validateNpcCombatIntentPlan
} from './combat-decision-contracts.js';
import { matchesOperationContract } from './operation-contract-match.js';
import {
  ADAPTATIONS,
  DIRECT_OPERATIONS,
  DIFFICULTIES,
  DOMAIN_OPERATIONS,
  DURATION_CLASSES,
  EFFORTS,
  GOAL_RESULTS,
  OUTCOME_KEYS,
  PLAN_KEYS,
  RESOLUTIONS,
  SUPPORTED_OPERATIONS,
  TRACE_KEYS,
  enumValue,
  finiteInteger,
  jsonSafe,
  nullableStableId,
  nullableText,
  text,
  validateNpcActionDecisionRequest
} from './semantic-decision-request-contract.js';

export {
  buildNpcActionDecisionRequest,
  validateNpcActionDecisionRequest
} from './semantic-decision-request-contract.js';
export {
  buildNpcActionDecisionRequestFromSnapshots,
  projectNpcSafeResourceSnapshots
} from
  './npc-safe-request-projector.js';

function validateInterpretation(value) {
  return exactKeys(value, ['npc_goal', 'grounded_attempt', 'adaptation'])
    && text(value.npc_goal)
    && text(value.grounded_attempt)
    && enumValue(value.adaptation, ADAPTATIONS);
}

function validateSemanticActivity(value) {
  return exactKeys(value, ['owner', 'duration_class', 'effort'])
    && value.owner === 'semantic'
    && enumValue(value.duration_class, DURATION_CLASSES)
    && enumValue(value.effort, EFFORTS);
}

function validateDomainActivity(value) {
  return exactKeys(value, ['owner', 'duration_class', 'effort'])
    && value.owner === 'domain'
    && value.duration_class === null
    && value.effort === null;
}

function validateAdditionalActivity(value) {
  return value === null || (exactKeys(value, ['duration_class', 'effort'])
    && enumValue(value.duration_class, DURATION_CLASSES)
    && enumValue(value.effort, EFFORTS));
}

function validatePlacement(value) {
  return exactKeys(value, ['relation', 'target_ref'])
    && enumValue(value.relation, ['held_by', 'worn_by', 'inside', 'located_at', 'attached_to'])
    && stableId(value.target_ref);
}

function validateMechanics(value) {
  return exactKeys(value, [
    'mass_grams',
    'external_hand_cost',
    'carry_form',
    'packing_slot_cost',
    'quantity',
    'container'
  ])
    && finiteInteger(value.mass_grams)
    && [0, 1, 2].includes(value.external_hand_cost)
    && enumValue(value.carry_form, ['compact', 'regular', 'long', 'bulky'])
    && finiteInteger(value.packing_slot_cost)
    && jsonSafe(value.quantity)
    && jsonSafe(value.container);
}

function validateFact(value) {
  return exactKeys(value, ['temp_ref', 'text'])
    && stableId(value.temp_ref)
    && text(value.text);
}

function validateOperationShape(value) {
  if (!record(value) || !SUPPORTED_OPERATIONS.has(value.op)) return false;
  switch (value.op) {
    case 'create_entity':
      return exactKeys(value, [
        'op', 'temp_ref', 'semantic_type', 'name', 'origin', 'facts', 'mechanics', 'placement'
      ])
        && stableId(value.temp_ref)
        && stableId(value.semantic_type)
        && text(value.name)
        && exactKeys(value.origin, ['kind', 'source_refs'])
        && enumValue(value.origin.kind, ['direct_partition', 'ambient_ordinary', 'crafted'])
        && uniqueStableIds(value.origin.source_refs)
        && Array.isArray(value.facts)
        && value.facts.every(validateFact)
        && validateMechanics(value.mechanics)
        && validatePlacement(value.placement);
    case 'move_entity':
      return exactKeys(value, ['op', 'entity_ref', 'placement'])
        && stableId(value.entity_ref)
        && validatePlacement(value.placement);
    case 'change_entity_facts':
      return exactKeys(value, ['op', 'entity_ref', 'remove_fact_refs', 'add_facts'])
        && stableId(value.entity_ref)
        && uniqueStableIds(value.remove_fact_refs)
        && Array.isArray(value.add_facts)
        && value.add_facts.every(validateFact);
    case 'set_entity_mechanics':
      return exactKeys(value, ['op', 'entity_ref', 'mechanics', 'reason'])
        && stableId(value.entity_ref)
        && validateMechanics(value.mechanics)
        && text(value.reason);
    case 'retire_entity':
      return exactKeys(value, ['op', 'entity_ref', 'reason'])
        && stableId(value.entity_ref)
        && text(value.reason);
    case 'apply_body_event':
      return exactKeys(value, [
        'op', 'actor_ref', 'mechanism', 'severity', 'body_part_ref', 'description'
      ])
        && stableId(value.actor_ref)
        && enumValue(value.mechanism, [
          'impact', 'cut', 'puncture', 'burn', 'strain', 'crush', 'fall', 'cold', 'heat',
          'suffocation', 'poison', 'other'
        ])
        && enumValue(value.severity, ['minor', 'moderate', 'severe', 'critical'])
        && nullableStableId(value.body_part_ref)
        && text(value.description);
    case 'request_discovery':
      return exactKeys(value, ['op', 'actor_ref', 'discovery_kind', 'target_refs', 'query'])
        && stableId(value.actor_ref)
        && enumValue(value.discovery_kind, ['look', 'inspect', 'search', 'listen', 'remember', 'dig'])
        && uniqueStableIds(value.target_refs)
        && text(value.query);
    case 'request_container_access':
      return exactKeys(value, ['op', 'actor_ref', 'container_ref', 'access_kind'])
        && stableId(value.actor_ref)
        && stableId(value.container_ref)
        && enumValue(value.access_kind, ['open', 'close', 'unlock', 'force', 'open_and_view']);
    case 'request_movement':
      return exactKeys(value, ['op', 'actor_ref', 'target_ref', 'movement_kind'])
        && stableId(value.actor_ref)
        && stableId(value.target_ref)
        && enumValue(value.movement_kind, ['local', 'route', 'long_course']);
    case 'request_item_use':
      return exactKeys(value, ['op', 'actor_ref', 'item_ref', 'use_kind', 'target_refs'])
        && stableId(value.actor_ref)
        && stableId(value.item_ref)
        && enumValue(value.use_kind, ['consume', 'apply', 'operate', 'equip', 'unequip', 'other'])
        && uniqueStableIds(value.target_refs);
    case 'request_activity':
      return exactKeys(value, ['op', 'actor_ref', 'activity_kind', 'target_refs', 'description'])
        && stableId(value.actor_ref)
        && enumValue(value.activity_kind, ['wait', 'sleep', 'work', 'recover', 'carry', 'guard', 'observe', 'other'])
        && uniqueStableIds(value.target_refs)
        && text(value.description);
    case 'emit_interaction':
      return exactKeys(value, [
        'op', 'actor_ref', 'target_actor_refs', 'interaction_kind', 'content', 'instrument_refs'
      ])
        && stableId(value.actor_ref)
        && uniqueStableIds(value.target_actor_refs)
        && value.target_actor_refs.length > 0
        && enumValue(value.interaction_kind, ['gesture', 'offer', 'request', 'threat_display', 'aid', 'other'])
        && text(value.content)
        && uniqueStableIds(value.instrument_refs);
    case 'request_conversation':
      return exactKeys(value, ['op', 'actor_ref', 'target_actor_refs', 'conversation_goal'])
        && stableId(value.actor_ref)
        && uniqueStableIds(value.target_actor_refs)
        && value.target_actor_refs.length > 0
        && text(value.conversation_goal);
    case 'request_combat':
      return exactKeys(value, ['op', 'actor_ref', 'target_actor_refs', 'combat_intent'])
        && stableId(value.actor_ref)
        && uniqueStableIds(value.target_actor_refs)
        && value.target_actor_refs.length > 0
        && text(value.combat_intent);
    default:
      return false;
  }
}

function operationRefs(operation) {
  switch (operation.op) {
    case 'create_entity':
      return [...operation.origin.source_refs, operation.placement.target_ref];
    case 'move_entity':
      return [operation.entity_ref, operation.placement.target_ref];
    case 'change_entity_facts':
      return [operation.entity_ref, ...operation.remove_fact_refs];
    case 'set_entity_mechanics':
    case 'retire_entity':
      return [operation.entity_ref];
    case 'apply_body_event':
      return [operation.actor_ref, ...(operation.body_part_ref === null ? [] : [operation.body_part_ref])];
    case 'request_discovery':
      return [operation.actor_ref, ...operation.target_refs];
    case 'request_container_access':
      return [operation.actor_ref, operation.container_ref];
    case 'request_movement':
      return [operation.actor_ref, operation.target_ref];
    case 'request_item_use':
      return [operation.actor_ref, operation.item_ref, ...operation.target_refs];
    case 'request_activity':
      return [operation.actor_ref, ...operation.target_refs];
    case 'emit_interaction':
      return [operation.actor_ref, ...operation.target_actor_refs, ...operation.instrument_refs];
    case 'request_conversation':
    case 'request_combat':
      return [operation.actor_ref, ...operation.target_actor_refs];
    default:
      return [];
  }
}

function declaredTempRefs(operation) {
  switch (operation.op) {
    case 'create_entity':
      return [operation.temp_ref, ...operation.facts.map((fact) => fact.temp_ref)];
    case 'change_entity_facts':
      return operation.add_facts.map((fact) => fact.temp_ref);
    default:
      return [];
  }
}

function collectKnownRefs(value, refs = new Set(), key = '') {
  if (typeof value === 'string') {
    if (key.endsWith('_ref') || key.endsWith('_refs') || key === 'entity_id') refs.add(value);
    return refs;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectKnownRefs(entry, refs, key);
    return refs;
  }
  if (record(value)) {
    for (const [entryKey, entry] of Object.entries(value)) collectKnownRefs(entry, refs, entryKey);
  }
  return refs;
}

function validateOperations(operations, request, allowedKinds) {
  if (!Array.isArray(operations)) return false;
  const knownRefs = request === null ? null : collectKnownRefs(request);
  const declared = new Set();
  for (const operation of operations) {
    if (!validateOperationShape(operation)
      || !allowedKinds.has(operation.op)
      || (request !== null && !Object.hasOwn(request.decision_scope.operation_contract, operation.op))) {
      return false;
    }
    if (request !== null && 'actor_ref' in operation && operation.actor_ref !== request.npc_ref) return false;
    if (request !== null
        && !matchesOperationContract(
          operation,
          request.decision_scope.operation_contract[operation.op]
        )) {
      return false;
    }
    if (knownRefs !== null && operationRefs(operation).some((reference) => !knownRefs.has(reference)
      && !declared.has(reference))) {
      return false;
    }
    for (const tempRef of declaredTempRefs(operation)) {
      if (declared.has(tempRef) || (knownRefs !== null && knownRefs.has(tempRef))) return false;
      declared.add(tempRef);
    }
  }
  return true;
}

function validateOutcome(value, request) {
  return exactKeys(value, ['goal_result', 'additional_activity', 'operations'])
    && enumValue(value.goal_result, GOAL_RESULTS)
    && validateAdditionalActivity(value.additional_activity)
    && validateOperations(value.operations, request, DIRECT_OPERATIONS);
}

function validateCheck(value, request) {
  return exactKeys(value, [
    'purpose', 'attribute_ref', 'skill_ref', 'difficulty_id', 'outcomes'
  ])
    && text(value.purpose)
    && stableId(value.attribute_ref)
    && stableId(value.skill_ref)
    && enumValue(value.difficulty_id, DIFFICULTIES)
    && exactKeys(value.outcomes, OUTCOME_KEYS)
    && OUTCOME_KEYS.every((outcome) => validateOutcome(value.outcomes[outcome], request))
    && (request === null
      || (request.decision_scope.allowed_attribute_refs.includes(value.attribute_ref)
        && request.decision_scope.allowed_skill_refs.includes(value.skill_ref)));
}

function matchingIdentity(value, request) {
  return value.request_id === request.request_id
    && value.root_turn_id === request.root_turn_id
    && value.boundary_id === request.boundary_id
    && value.committed_state_version === request.committed_state_version
    && value.working_revision === request.working_revision
    && value.decision_index === request.decision_index
    && value.npc_ref === request.npc_ref;
}

function validateNpcStepPlanShape(value, request) {
  if (!exactKeys(value, PLAN_KEYS)
    || value.schema !== 'npc_step_plan_v1'
    || !stableId(value.request_id)
    || !stableId(value.root_turn_id)
    || !stableId(value.boundary_id)
    || !finiteInteger(value.committed_state_version, 1)
    || !finiteInteger(value.working_revision)
    || !finiteInteger(value.decision_index, 1)
    || !stableId(value.npc_ref)
    || !validateInterpretation(value.interpretation)
    || !enumValue(value.resolution, RESOLUTIONS)
    || !enumValue(value.goal_result, GOAL_RESULTS)
    || !stableId(value.reason_code)
    || !text(value.reason)
    || !jsonSafe(value)
    || (request !== null && !matchingIdentity(value, request))) {
    return false;
  }

  if (value.resolution === 'direct') {
    return validateSemanticActivity(value.activity)
      && value.check === null
      && validateOperations(value.operations, request, DIRECT_OPERATIONS);
  }
  if (value.resolution === 'generic_check') {
    return value.goal_result === 'pending'
      && validateSemanticActivity(value.activity)
      && Array.isArray(value.operations)
      && value.operations.length === 0
      && validateCheck(value.check, request);
  }
  return validateDomainActivity(value.activity)
    && value.check === null
    && validateOperations(value.operations, request, SUPPORTED_OPERATIONS)
    && value.operations.filter((operation) => DOMAIN_OPERATIONS.has(operation.op)).length === 1;
}

export function validateNpcStepPlan(value, request) {
  return validateNpcActionDecisionRequest(request)
    && validateNpcStepPlanShape(value, request);
}

export function buildNpcStepPlan(value, request) {
  if (!validateNpcStepPlan(value, request)) {
    throw new TypeError('NPC step plan must match npc_step_plan_v1 and its decision request');
  }
  return freeze(value);
}

export function validateNpcSemanticDecisionTrace(value, request = null) {
  if (!exactKeys(value, TRACE_KEYS)
    || value.schema !== 'npc_semantic_decision_trace_v1'
    || !stableId(value.request_id)
    || !stableId(value.root_turn_id)
    || !stableId(value.boundary_id)
    || !stableId(value.npc_ref)
    || !finiteInteger(value.committed_state_version, 1)
    || !finiteInteger(value.working_revision)
    || !stableId(value.applied_change_set_id)
    || value.status !== 'committed'
    || !semanticTracePlanValid(value.plan, request)
    || value.request_id !== value.plan.request_id
    || value.boundary_id !== value.plan.boundary_id
    || value.npc_ref !== semanticPlanNpcId(value.plan)
    || value.committed_state_version !== semanticPlanStateVersion(value.plan)
    || !semanticTraceLineageMatches(value, value.plan)
    || !jsonSafe(value)) {
    return false;
  }
  return request === null || semanticTraceRequestMatches(value, request);
}

export function buildNpcSemanticDecisionTrace({
  request,
  plan,
  root_turn_id = request?.root_turn_id,
  working_revision = request?.working_revision,
  applied_change_set_id,
  status = 'committed'
} = {}) {
  if (!semanticTracePlanValid(plan, request)) {
    throw new TypeError('Semantic decision trace requires a matching request and NPC step plan');
  }
  const trace = {
    schema: 'npc_semantic_decision_trace_v1',
    request_id: request.request_id,
    root_turn_id,
    boundary_id: request.boundary_id,
    npc_ref: semanticPlanNpcId(plan),
    committed_state_version: semanticPlanStateVersion(plan),
    working_revision,
    plan,
    applied_change_set_id,
    status
  };
  if (!validateNpcSemanticDecisionTrace(trace, request)) {
    throw new TypeError('NPC semantic decision trace must match npc_semantic_decision_trace_v1');
  }
  return freeze(trace);
}

function semanticTracePlanValid(plan, request) {
  if (plan?.schema === 'npc_step_plan_v1') {
    return request === null
      ? validateNpcStepPlanShape(plan, null)
      : validateNpcActionDecisionRequest(request)
        && validateNpcStepPlan(plan, request);
  }
  if (plan?.schema === 'conversation_contribution_plan_v1') {
    return request === null
      ? validateConversationContributionPlan(plan)
      : validateNpcConversationResponseRequest(request)
        && validateConversationContributionPlan(plan, request);
  }
  if (plan?.schema === 'npc_combat_intent_plan_v1') {
    return request === null
      ? validateNpcCombatIntentPlan(plan)
      : validateNpcCombatDecisionRequest(request)
        && validateNpcCombatIntentPlan(plan, request);
  }
  return false;
}

function semanticPlanNpcId(plan) {
  if (plan?.schema === 'npc_step_plan_v1') return plan.npc_ref;
  if (plan?.schema === 'npc_combat_intent_plan_v1') {
    return plan.npc_ref?.entity_id;
  }
  return plan?.speaker_ref?.entity_id;
}

function semanticPlanStateVersion(plan) {
  if (plan?.schema === 'npc_step_plan_v1') {
    return plan.committed_state_version;
  }
  return plan?.schema === 'npc_combat_intent_plan_v1'
    ? Number(plan.state_version) : plan?.state_version;
}

function semanticTraceLineageMatches(trace, plan) {
  return plan.schema === 'npc_step_plan_v1'
    ? trace.root_turn_id === plan.root_turn_id
      && trace.working_revision === plan.working_revision
    : true;
}

function semanticTraceRequestMatches(trace, request) {
  if (request.schema === 'npc_action_decision_request_v1') {
    return validateNpcActionDecisionRequest(request)
      && matchingIdentity(trace.plan, request)
      && trace.root_turn_id === request.root_turn_id
      && trace.working_revision === request.working_revision;
  }
  if (request.schema === 'npc_combat_decision_request_v1') {
    return validateNpcCombatDecisionRequest(request)
      && validateNpcCombatIntentPlan(trace.plan, request)
      && trace.npc_ref === request.npc_ref.entity_id
      && trace.committed_state_version === Number(request.state_version);
  }
  return validateNpcConversationResponseRequest(request)
    && validateConversationContributionPlan(trace.plan, request)
    && trace.npc_ref === request.npc_ref.entity_id
    && trace.committed_state_version === request.state_version;
}
