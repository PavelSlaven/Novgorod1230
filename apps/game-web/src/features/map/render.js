import { escapeHtml } from '../../shared/escape-html.js';
export function renderMapPanel(screen) {
  const panel = screen.panels?.map;
  if (!panel?.visible) return '';
  return `<section class="panel panel-map"><h2>Карта</h2><pre>${escapeHtml(JSON.stringify(panel.data ?? {}, null, 2))}</pre></section>`;
}
