import { escapeHtml } from '../../shared/escape-html.js';
export function renderActions(screen, { disabled = false, draft = '', pendingTurn = null } = {}) {
  const actions = screen.action_panel?.suggested_actions ?? screen.actions ?? [];
  const buttons = actions.map((item) => `<button class="action-chip" type="button" data-action-id="${escapeHtml(item.option_id ?? item.id ?? '')}"${disabled || pendingTurn ? ' disabled' : ''}>${escapeHtml(item.label ?? item.text ?? item.title ?? 'Действовать')}</button>`).join('');
  const placeholder = screen.action_panel?.free_text_input?.placeholder
    ?? screen.input_panel?.placeholder
    ?? 'Что ты делаешь?';
  return `<section class="actions" aria-label="Следующее действие">${buttons ? `<div class="suggested-actions" aria-label="Возможные действия">${buttons}</div>` : ''}${pendingTurn ? `<p role="status">Сначала восстановим результат предыдущего хода. Новый текст останется в поле.</p>` : ''}<form data-turn-form><label class="input-label" for="turn-intent">Твоё действие</label><textarea id="turn-intent" name="raw_text" aria-label="Действие" placeholder="${escapeHtml(placeholder)}"${disabled ? ' disabled' : ''}>${escapeHtml(draft)}</textarea><div class="action-submit"><span>Enter — отправить · Shift+Enter — новая строка</span><button class="button-primary" type="submit"${disabled ? ' disabled' : ''}>${pendingTurn ? 'Восстановить прежний ход' : 'Совершить'}</button></div></form></section>`;
}
