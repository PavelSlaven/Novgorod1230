import { escapeHtml } from '../../shared/escape-html.js';
export function renderRoutesPanel(screen) {
  const panel = screen.panels?.route;
  if (!panel?.visible) return '';
  return `<section class="panel panel-routes"><h2>Маршруты</h2><pre>${escapeHtml(JSON.stringify(panel.data ?? {}, null, 2))}</pre></section>`;
}
