import { escapeHtml } from '../../shared/escape-html.js';
import { validActiveInterlocutor } from
  '../../shared/scene-affordances.js';

export function renderConversationPortrait(screen) {
  const panel = screen.panels?.people;
  const interlocutor = panel?.data?.active_interlocutor;
  if (panel?.visible !== true || !validActiveInterlocutor(interlocutor)) {
    return '';
  }
  const role = Object.hasOwn(interlocutor, 'role_label')
    ? `<small>${escapeHtml(interlocutor.role_label.trim())}</small>` : '';
  return `<aside class="conversation-portrait" data-conversation-portrait data-interlocutor-id="${escapeHtml(interlocutor.entity_ref.entity_id)}" aria-label="Собеседник: ${escapeHtml(interlocutor.display_label.trim())}"><svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><circle class="portrait-medallion" cx="32" cy="32" r="30"></circle><circle class="portrait-head" cx="32" cy="24" r="10"></circle><path class="portrait-shoulders" d="M13 54c2-13 10-19 19-19s17 6 19 19z"></path></svg><div><strong>${escapeHtml(interlocutor.display_label.trim())}</strong>${role}</div></aside>`;
}
