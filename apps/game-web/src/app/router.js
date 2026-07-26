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
  if (!screen) return renderLanding(options.scenarios);
  return `<main class="game-screen" data-screen-schema="${escapeHtml(screen.schema)}">${renderProse(screen)}<aside class="panels">${renderCharacterPanel(screen)}${renderInventoryPanel(screen)}${renderPeoplePanel(screen)}${renderRoutesPanel(screen)}${renderMapPanel(screen)}${renderJournalPanel(screen)}${renderDiagnostics(screen, options)}</aside>${renderActions(screen)}</main>`;
}
export function renderAppState(state) {
  if (state.status === 'loading') return '<main><p>Загрузка…</p></main>';
  if (state.status === 'error') return `<main><p class="error">${escapeHtml(state.error?.message)}</p>${renderLanding(state.scenarios)}</main>`;
  return renderScreen(state.screen, {
    developerMode: state.developerMode,
    scenarios: state.scenarios
  });
}
function renderLanding(scenarios = []) {
  const scenarioButtons = scenarios.map((scenario) => {
    const unavailable = scenario.available === false;
    return `<button type="button" data-scenario-id="${escapeHtml(scenario.scenario_id)}"${unavailable ? ' disabled' : ''}>${escapeHtml(scenario.title)}</button><p>${escapeHtml(scenario.description)}</p>`;
  }).join('');
  return `<section class="landing"><h1>Русь</h1><form data-new-game-form><textarea name="start_text" required placeholder="Опишите начало игры"></textarea><input name="player_name" placeholder="Имя персонажа"><button type="submit">Начать игру</button></form><button type="button" data-scenarios-toggle aria-expanded="false">Сценарии</button><section class="scenarios" data-scenarios-panel hidden>${scenarioButtons}</section></section>`;
}
