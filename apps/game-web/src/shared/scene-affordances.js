const INTERLOCUTOR_KEYS = new Set([
  'entity_ref', 'display_label', 'role_label'
]);
const ENTITY_REF_KEYS = new Set(['entity_kind', 'entity_id']);

export function validCurrentTask(value) {
  return nonEmptyText(value);
}

export function validActiveInterlocutor(value) {
  if (!plain(value)) return false;
  const keys = Object.keys(value);
  if (keys.some((key) => !INTERLOCUTOR_KEYS.has(key))
      || !keys.includes('entity_ref')
      || !keys.includes('display_label')
      || !exactNpcRef(value.entity_ref)
      || !nonEmptyText(value.display_label)) {
    return false;
  }
  return !Object.hasOwn(value, 'role_label')
    || nonEmptyText(value.role_label);
}

function exactNpcRef(value) {
  return plain(value)
    && Object.keys(value).length === ENTITY_REF_KEYS.size
    && Object.keys(value).every((key) => ENTITY_REF_KEYS.has(key))
    && value.entity_kind === 'npc'
    && nonEmptyText(value.entity_id);
}

function nonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function plain(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
