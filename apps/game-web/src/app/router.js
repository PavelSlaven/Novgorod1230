import { renderProse } from '../features/prose/render.js';
import { renderActions } from '../features/actions/render.js';
import { renderCharacterPanel } from '../features/character/render.js';
import { renderInventoryPanel } from '../features/inventory/render.js';
import { renderPeoplePanel } from '../features/people/render.js';
import { renderRoutesPanel } from '../features/routes/render.js';
import { renderMapPanel } from '../features/map/render.js';
import { renderJournalPanel } from '../features/journal/render.js';
import { renderDiagnostics } from '../features/diagnostics/render.js';
import { escapeHtml } from '../shared/escape-html.js';

export function renderScreen(screen, options = {}) {
  if (!screen) return renderLanding();
  return `<main class="game-screen" data-screen-schema="${escapeHtml(screen.schema)}">${renderProse(screen)}<aside class="panels">${renderCharacterPanel(screen)}${renderInventoryPanel(screen)}${renderPeoplePanel(screen)}${renderRoutesPanel(screen)}${renderMapPanel(screen)}${renderJournalPanel(screen)}${renderDiagnostics(screen, options)}</aside>${renderActions(screen)}</main>`;
}
export function renderAppState(state) {
  if (state.status === 'loading') return '<main><p>Загрузка…</p></main>';
  if (state.status === 'error') return `<main><p class="error">${escapeHtml(state.error?.message)}</p>${renderLanding()}</main>`;
  return renderScreen(state.screen, { developerMode: state.developerMode });
}
function renderLanding() { return '<section class="landing"><h1>Русь</h1><form data-new-game-form><textarea name="start_text" required placeholder="Опишите начало игры"></textarea><input name="player_name" placeholder="Имя персонажа"><button type="submit">Начать игру</button></form></section>'; }
