const INTERLOCUTOR_KEYS = new Set([
  'entity_ref', 'display_label', 'role_label'
]);
const ENTITY_REF_KEYS = new Set(['entity_kind', 'entity_id']);

export function sceneAffordancePanelErrors(panels) {
  if (!plain(panels)) return [];
  const errors = [];
  const journal = panels.journal?.data;
  if (plain(journal) && Object.hasOwn(journal, 'current_task')
      && !nonEmptyText(journal.current_task)) {
    errors.push('journal current_task must be a non-empty string');
  }
  const people = panels.people?.data;
  if (plain(people) && Object.hasOwn(people, 'active_interlocutor')
      && !validActiveInterlocutor(people.active_interlocutor)) {
    errors.push('people active_interlocutor is invalid');
  }
  return errors;
}

export function assertJournalPanelAffordances(data) {
  if (!plain(data)) return;
  if (Object.hasOwn(data, 'current_task') && !nonEmptyText(data.current_task)) {
    throw presentationError(
      'PRESENTATION_CURRENT_TASK_INVALID',
      'Journal current_task must be a non-empty string.'
    );
  }
}

export function assertPeoplePanelAffordances(data) {
  if (!plain(data)) return;
  if (Object.hasOwn(data, 'active_interlocutor')
      && !validActiveInterlocutor(data.active_interlocutor)) {
    throw presentationError(
      'PRESENTATION_ACTIVE_INTERLOCUTOR_INVALID',
      'People active_interlocutor must use the exact player-safe shape.'
    );
  }
}

function validActiveInterlocutor(value) {
  if (!plain(value)) return false;
  const keys = Object.keys(value);
  if (keys.some((key) => !INTERLOCUTOR_KEYS.has(key))
      || !keys.includes('entity_ref')
      || !keys.includes('display_label')
      || !exactEntityRef(value.entity_ref)
      || !nonEmptyText(value.display_label)) {
    return false;
  }
  return !Object.hasOwn(value, 'role_label')
    || nonEmptyText(value.role_label);
}

function exactEntityRef(value) {
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

function presentationError(code, message) {
  return Object.assign(new TypeError(message), { code });
}
