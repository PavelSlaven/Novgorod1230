import { escapeHtml } from '../../shared/escape-html.js';
export function renderDiagnostics(screen, { developerMode = false } = {}) {
  const panel = screen.panels?.diagnostic;
  if (!developerMode || !panel?.visible) return '';
  return `<section class="panel diagnostics"><h2>Diagnostics</h2><pre>${escapeHtml(JSON.stringify(panel.data ?? {}, null, 2))}</pre></section>`;
}
