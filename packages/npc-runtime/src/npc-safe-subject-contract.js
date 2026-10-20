import { exactKeys, record, stableId } from './internal.js';

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function nullableText(value) {
  return value === null || text(value);
}

function nullableStableId(value) {
  return value === null || stableId(value);
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

function jsonArray(value) {
  return Array.isArray(value) && value.every((entry) => jsonSafe(entry));
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
  const keys = [
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
  return exactKeys(value, keys)
    && (value.profile_level === null
      || enumValue(value.profile_level, ['background', 'scene', 'key']))
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

export {
  enumValue,
  jsonArray,
  jsonSafe,
  nullableStableId,
  nullableText,
  text,
  validateNpc
};
