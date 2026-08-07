
import {
  exactKeys,
  freeze,
  normalizeTimestamp,
  record,
  stableId,
  uniqueStableIds
} from './internal.js';
import {
  validateConversationContributionPlan,
  validateNpcConversationResponseRequest
} from './conversation-contracts.js';

const REQUEST_KEYS = [
  'schema',
  'request_id',
  'root_turn_id',
  'boundary_id',
  'committed_state_version',
  'working_revision',
  'decision_index',
  'occurred_at',
  'npc_ref',
  'decision_reasons',
  'historical_context',
  'npc',
  'perception',
  'knowledge',
  'memory',
  'decision_scope'
];

const PLAN_KEYS = [
  'schema',
  'request_id',
  'root_turn_id',
  'boundary_id',
  'committed_state_version',
  'working_revision',
  'decision_index',
  'npc_ref',
  'interpretation',
  'resolution',
  'goal_result',
  'activity',
  'operations',
  'check',
  'reason_code',
  'reason'
];

const TRACE_KEYS = [
  'schema',
  'request_id',
  'root_turn_id',
  'boundary_id',
  'npc_ref',
  'committed_state_version',
  'working_revision',
  'plan',
  'applied_change_set_id',
  'status'
];

const DECISION_CATEGORIES = ['self', 'others', 'environment', 'objective', 'communication'];
const ADAPTATIONS = ['literal', 'reality_limited', 'make_believe'];
const RESOLUTIONS = ['direct', 'generic_check', 'domain_request'];
const GOAL_RESULTS = ['pending', 'achieved', 'partially_achieved', 'not_achieved'];
const DURATION_CLASSES = ['moment', 'brief', 'short', 'extended'];
const EFFORTS = ['none', 'light', 'moderate', 'heavy', 'extreme'];
const DIFFICULTIES = ['trivial', 'ordinary', 'risky', 'dangerous', 'limit', 'nearly_impossible'];
const OUTCOME_KEYS = [
  'clean_success',
  'success',
  'success_with_cost',
  'failure_with_consequence',
  'severe_failure'
];
const DIRECT_OPERATIONS = new Set([
  'create_entity',
  'move_entity',
  'change_entity_facts',
  'set_entity_mechanics',
  'retire_entity',
  'apply_body_event'
]);
const DOMAIN_OPERATIONS = new Set([
  'request_discovery',
  'request_container_access',
  'request_movement',
  'request_item_use',
  'request_activity',
  'emit_interaction',
  'request_conversation',
  'request_combat'
]);
const SUPPORTED_OPERATIONS = new Set([...DIRECT_OPERATIONS, ...DOMAIN_OPERATIONS]);

function finiteInteger(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function nullableText(value) {
  return value === null || text(value);
}

function nullableStableId(value) {
  return value === null || stableId(value);
}

function contractEntityRef(value, expectedKind = null) {
  return exactKeys(value, ['entity_kind', 'entity_id'])
    && stableId(value.entity_kind)
    && stableId(value.entity_id)
    && (expectedKind === null || value.entity_kind === expectedKind);
}

function enumValue(value, allowed) {
  return allowed.includes(value);
}

function jsonSafe(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;

  const nextAncestors = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    return value.every((entry) => jsonSafe(entry, nextAncestors));
  }
  if (!record(value) || (Object.getPrototypeOf(value) !== Object.prototype
    && Object.getPrototypeOf(value) !== null)) {
    return false;
  }
  return Object.entries(value).every(([key, entry]) => key.length > 0
    && entry !== undefined
    && jsonSafe(entry, nextAncestors));
}

function textArray(value) {
  return Array.isArray(value) && value.every(text);
}

function jsonArray(value) {
  return Array.isArray(value) && value.every((entry) => jsonSafe(entry));
}

function canonicalCategoryArray(value) {
  if (!Array.isArray(value) || value.length === 0) return false;
  let previous = -1;
  for (const category of value) {
    const current = DECISION_CATEGORIES.indexOf(category);
    if (current <= previous) return false;
    previous = current;
  }
  return true;
}

function canonicalSignalRefs(value) {
  if (!Array.isArray(value) || value.length === 0) return false;
  let previous = null;
  for (const reference of value) {
    if (!contractEntityRef(reference, 'npc_decision_signal')) return false;
    const current = `${reference.entity_kind}\u0000${reference.entity_id}`;
    if (previous !== null && current <= previous) return false;
    previous = current;
  }
  return true;
}

function validateTimestamp(value) {
  if (!exactKeys(value, ['whole_minutes', 'subminute_numerator', 'subminute_denominator'])
    || typeof value.whole_minutes !== 'string'
    || !/^-?(?:0|[1-9][0-9]*)$/u.test(value.whole_minutes)
    || typeof value.subminute_numerator !== 'string'
    || !/^(?:0|[1-9][0-9]*)$/u.test(value.subminute_numerator)
    || typeof value.subminute_denominator !== 'string'
    || !/^[1-9][0-9]*$/u.test(value.subminute_denominator)) {
    return false;
  }
  const normalized = normalizeTimestamp(value);
  return normalized !== null
    && normalized.whole_minutes === value.whole_minutes
    && normalized.subminute_numerator === value.subminute_numerator
    && normalized.subminute_denominator === value.subminute_denominator;
}

function validateDecisionReasons(value) {
  return exactKeys(value, ['significance', 'categories', 'signal_refs', 'perceived_changes'])
    && enumValue(value.significance, ['material', 'critical'])
    && canonicalCategoryArray(value.categories)
    && canonicalSignalRefs(value.signal_refs)
    && textArray(value.perceived_changes)
    && value.perceived_changes.length > 0;
}

function validateHistoricalContext(value) {
  return exactKeys(value, ['year', 'season', 'region', 'applicable_norms', 'known_local_customs'])
    && (value.year === null || finiteInteger(value.year, 1))
    && (value.season === null || stableId(value.season))
    && (value.region === null || text(value.region))
    && jsonArray(value.applicable_norms)
    && jsonArray(value.known_local_customs);
}

function validateIdentity(value) {
  return exactKeys(value, ['name_or_label', 'age_range', 'origin'])
    && nullableText(value.name_or_label)
    && nullableStableId(value.age_range)
    && nullableText(value.origin);
}

function validateSocialRole(value) {
  return exactKeys(value, ['role_ref', 'status', 'authority', 'dependencies'])
    && nullableStableId(value.role_ref)
    && nullableText(value.status)
    && jsonArray(value.authority)
    && jsonArray(value.dependencies);
}

function validateRatedRef(value, refKey) {
  return exactKeys(value, [refKey, 'label', 'value'])
    && stableId(value[refKey])
    && text(value.label)
    && Number.isFinite(value.value);
}

function validateNpc(value) {
  const legacyKeys = [
    'profile_level',
    'identity',
    'social_role',
    'attributes',
    'skills',
    'body_state',
    'mood',
    'temperament',
    'values',
    'goals',
    'fears',
    'obligations',
    'relationships',
    'current_activity',
    'available_resources'
  ];
  const keys = Object.keys(value ?? {});
  return (exactKeys(value, legacyKeys)
      || exactKeys(value, [...legacyKeys, 'profile_ref', 'current_location']))
    && (value.profile_level === null
      || enumValue(value.profile_level, ['background', 'scene', 'key']))
    && (!keys.includes('profile_ref') || nullableStableId(value.profile_ref))
    && validateIdentity(value.identity)
    && validateSocialRole(value.social_role)
    && Array.isArray(value.attributes)
    && value.attributes.every((entry) => validateRatedRef(entry, 'attribute_ref'))
    && new Set(value.attributes.map((entry) => entry.attribute_ref)).size === value.attributes.length
    && Array.isArray(value.skills)
    && value.skills.every((entry) => validateRatedRef(entry, 'skill_ref'))
    && new Set(value.skills.map((entry) => entry.skill_ref)).size === value.skills.length
    && exactKeys(value.body_state, ['summary', 'conditions'])
    && nullableText(value.body_state.summary)
    && jsonArray(value.body_state.conditions)
    && (value.mood === null
      || (exactKeys(value.mood, ['state', 'intensity'])
        && text(value.mood.state)
        && stableId(value.mood.intensity)))
    && jsonArray(value.temperament)
    && jsonArray(value.values)
    && jsonArray(value.goals)
    && jsonArray(value.fears)
    && jsonArray(value.obligations)
    && jsonArray(value.relationships)
    && (!keys.includes('current_location')
      || (exactKeys(value.current_location, ['location_ref', 'zone_ref'])
        && nullableStableId(value.current_location.location_ref)
        && nullableStableId(value.current_location.zone_ref)))
    && exactKeys(value.current_activity, [
      'activity_ref',
      'summary',
      'status',
      'can_continue_automatically'
    ])
    && nullableStableId(value.current_activity.activity_ref)
    && nullableText(value.current_activity.summary)
    && stableId(value.current_activity.status)
    && typeof value.current_activity.can_continue_automatically === 'boolean'
    && jsonArray(value.available_resources);
}

function validatePerception(value) {
  return exactKeys(value, [
    'visible_scene',
    'perceived_changes',
    'heard',
    'felt',
    'present_actors',
    'visible_objects',
    'known_routes_and_exits',
    'uncertainties'
  ]) && Object.values(value).every(jsonArray);
}

function validateKnowledge(value) {
  return exactKeys(value, ['known_facts', 'beliefs', 'hypotheses'])
    && Object.values(value).every(jsonArray);
}

function validateMemory(value) {
  return exactKeys(value, ['recent_events', 'relevant_long_term_events', 'previous_decisions'])
    && Object.values(value).every(jsonArray);
}

function validateOperationContract(value) {
  return record(value)
    && Object.keys(value).every((operation) => SUPPORTED_OPERATIONS.has(operation))
    && Object.values(value).every((entry) => jsonSafe(entry));
}

function validateDecisionScope(value) {
  return exactKeys(value, [
    'mode',
    'allowed_attribute_refs',
    'allowed_skill_refs',
    'operation_contract'
  ])
    && value.mode === 'autonomous_action'
    && uniqueStableIds(value.allowed_attribute_refs)
    && uniqueStableIds(value.allowed_skill_refs)
    && validateOperationContract(value.operation_contract);
}

export function validateNpcActionDecisionRequest(value) {
  return exactKeys(value, REQUEST_KEYS)
    && value.schema === 'npc_action_decision_request_v1'
    && stableId(value.request_id)
    && stableId(value.root_turn_id)
    && stableId(value.boundary_id)
    && finiteInteger(value.committed_state_version, 1)
    && finiteInteger(value.working_revision)
    && finiteInteger(value.decision_index, 1)
    && validateTimestamp(value.occurred_at)
    && stableId(value.npc_ref)
    && validateDecisionReasons(value.decision_reasons)
    && validateHistoricalContext(value.historical_context)
    && validateNpc(value.npc)
    && validatePerception(value.perception)
    && validateKnowledge(value.knowledge)
    && validateMemory(value.memory)
    && validateDecisionScope(value.decision_scope)
    && jsonSafe(value);
}

export function buildNpcActionDecisionRequest(value) {
  if (!validateNpcActionDecisionRequest(value)) {
    throw new TypeError('NPC action decision request must match npc_action_decision_request_v1');
  }
  return freeze(value);
}

export {
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
  text
};
