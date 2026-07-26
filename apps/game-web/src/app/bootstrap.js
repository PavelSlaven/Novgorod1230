import { createApiClient } from '../api/client.js';
import { createUiStore } from './store.js';
import { renderAppState } from './router.js';

const PARTY_STORAGE_KEY = 'rus.party_id';

export function bootstrapGameWeb({
  root = document.querySelector('[data-game-root]'),
  api = createApiClient(),
  store = createUiStore(),
  storage
} = {}) {
  if (!root) throw new TypeError('game root element is required.');
  const partyStorage = storage ?? availableLocalStorage();
  const render = () => { root.innerHTML = renderAppState(store.getState()); };
  store.subscribe(render); render();
  api.listScenarios()
    .then((catalog) => store.setScenarios(catalog.scenarios))
    .catch(() => store.setScenarios([]));
  const persistedPartyId = partyStorage?.getItem?.(PARTY_STORAGE_KEY);
  if (persistedPartyId) {
    api.getPartyScreen(persistedPartyId)
      .then((result) => store.setScreen(result.screen))
      .catch((error) => {
        if (error?.httpStatus === 404 || error?.code === 'PARTY_NOT_FOUND') {
          partyStorage?.removeItem?.(PARTY_STORAGE_KEY);
        }
      });
  }
  root.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    try {
      store.setLoading();
      if (form.matches('[data-new-game-form]')) {
        const data = Object.fromEntries(new FormData(form));
        const result = await api.startNewGame(data);
        partyStorage?.setItem?.(PARTY_STORAGE_KEY, result.party_id);
        store.setScreen(result.screen);
        await api.acknowledgeOpening(result.party_id, { client_ack_id: `web:${Date.now()}` });
      } else if (form.matches('[data-turn-form]')) {
        const data = Object.fromEntries(new FormData(form));
        const result = await api.submitTurn(store.getState().partyId, { raw_text: data.raw_text });
        store.setScreen(result.screen);
      }
    } catch (error) { store.setError(error); }
  });
  root.addEventListener('click', async (event) => {
    const scenariosToggle = event.target.closest?.('[data-scenarios-toggle]');
    if (scenariosToggle) {
      const panel = root.querySelector('[data-scenarios-panel]');
      const expanded = scenariosToggle.getAttribute('aria-expanded') === 'true';
      scenariosToggle.setAttribute('aria-expanded', String(!expanded));
      if (panel) panel.hidden = expanded;
      return;
    }
    const scenarioButton = event.target.closest?.('[data-scenario-id]');
    if (scenarioButton) {
      try {
        store.setLoading();
        const result = await api.startNewGame({
          scenario_id: scenarioButton.dataset.scenarioId
        });
        partyStorage?.setItem?.(PARTY_STORAGE_KEY, result.party_id);
        store.setScreen(result.screen);
        await api.acknowledgeOpening(result.party_id, {
          client_ack_id: `web:${Date.now()}`
        });
      } catch (error) {
        store.setError(error);
      }
      return;
    }
    const button = event.target.closest?.('[data-action-id]');
    if (!button) return;
    try {
      store.setLoading();
      const result = await api.submitTurn(store.getState().partyId, { selected_action_option_id: button.dataset.actionId });
      store.setScreen(result.screen);
    } catch (error) { store.setError(error); }
  });
  return Object.freeze({ api, store, render });
}

function availableLocalStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}
