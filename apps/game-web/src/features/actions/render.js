import { escapeHtml } from '../../shared/escape-html.js';
export function renderActions(screen) {
  const actions = screen.action_panel?.suggested_actions ?? screen.actions ?? [];
  const buttons = actions.map((item) => `<button type="button" data-action-id="${escapeHtml(item.option_id ?? item.id ?? '')}">${escapeHtml(item.label ?? item.text ?? item.title ?? 'Действовать')}</button>`).join('');
  return `<section class="actions"><div class="suggested-actions">${buttons}</div><form data-turn-form><textarea name="raw_text" aria-label="Действие" placeholder="Что вы делаете?"></textarea><button type="submit">Продолжить</button></form></section>`;
}
