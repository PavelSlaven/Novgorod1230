import { escapeHtml } from '../../shared/escape-html.js';
export function renderCharacterPanel(screen) {
  const panel = screen.panels?.character;
  if (!panel?.visible) return '';
  return `<section class="panel panel-character"><h2>Персонаж</h2><pre>${escapeHtml(JSON.stringify(panel.data ?? {}, null, 2))}</pre></section>`;
}
