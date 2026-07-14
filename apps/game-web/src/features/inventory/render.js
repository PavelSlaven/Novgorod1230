import { escapeHtml } from '../../shared/escape-html.js';
export function renderInventoryPanel(screen) {
  const panel = screen.panels?.inventory;
  if (!panel?.visible) return '';
  return `<section class="panel panel-inventory"><h2>Инвентарь</h2><pre>${escapeHtml(JSON.stringify(panel.data ?? {}, null, 2))}</pre></section>`;
}
