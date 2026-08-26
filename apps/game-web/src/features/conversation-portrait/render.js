import { escapeHtml } from '../../shared/escape-html.js';
import { validActiveInterlocutor } from
  '../../shared/scene-affordances.js';
import { supportsAuthoredPortrait } from './authored-portrait.js';

const SVG_FALLBACK = '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><circle class="portrait-medallion" cx="32" cy="32" r="30"></circle><circle class="portrait-head" cx="32" cy="24" r="10"></circle><path class="portrait-shoulders" d="M13 54c2-13 10-19 19-19s17 6 19 19z"></path></svg>';

export function renderConversationPortrait(screen) {
  const interlocutor = activeInterlocutor(screen);
  if (!interlocutor) return '';
  const role = Object.hasOwn(interlocutor, 'role_label')
    ? `<small>${escapeHtml(interlocutor.role_label.trim())}</small>` : '';
  const authored = supportsAuthoredPortrait(interlocutor.portrait_asset_id);
  const hasSpec = Object.hasOwn(interlocutor, 'portrait_spec_v1');
  const procedural = !authored && hasSpec;
  const canvas = '<canvas data-conversation-portrait-canvas width="768" height="768" aria-hidden="true"></canvas>';
  const visual = authored
    ? `${canvas}${hasSpec ? '' : SVG_FALLBACK.replace('<svg ', '<svg data-conversation-portrait-fallback hidden ')}`
    : procedural ? canvas : SVG_FALLBACK;
  return `<aside class="conversation-portrait${
    authored || procedural
      ? ' conversation-portrait--procedural' : ''
  }" data-conversation-portrait data-interlocutor-id="${
    escapeHtml(interlocutor.entity_ref.entity_id)
  }" aria-label="Собеседник: ${
    escapeHtml(interlocutor.display_label.trim())
  }">${visual}<div><strong>${
    escapeHtml(interlocutor.display_label.trim())
  }</strong>${role}</div></aside>`;
}

function activeInterlocutor(screen) {
  const panel = screen?.panels?.people;
  const interlocutor = panel?.data?.active_interlocutor;
  return panel?.visible === true && validActiveInterlocutor(interlocutor)
    ? interlocutor : null;
}
