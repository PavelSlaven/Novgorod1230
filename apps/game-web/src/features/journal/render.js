import { escapeHtml } from '../../shared/escape-html.js';
export function renderJournalPanel(screen) {
  const panel = screen.panels?.journal;
  if (!panel?.visible) return '';
  return `<section class="panel panel-journal"><h2>Журнал</h2><pre>${escapeHtml(JSON.stringify(panel.data ?? {}, null, 2))}</pre></section>`;
}
