import { escapeHtml } from '../../shared/escape-html.js';
export function renderPeoplePanel(screen) {
  const panel = screen.panels?.people;
  if (!panel?.visible) return '';
  return `<section class="panel panel-people"><h2>Люди</h2><pre>${escapeHtml(JSON.stringify(panel.data ?? {}, null, 2))}</pre></section>`;
}
