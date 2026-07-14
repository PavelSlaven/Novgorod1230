import { createApiClient } from '../api/client.js';
import { createUiStore } from './store.js';
import { renderAppState } from './router.js';

export function bootstrapGameWeb({ root = document.querySelector('[data-game-root]'), api = createApiClient(), store = createUiStore() } = {}) {
  if (!root) throw new TypeError('game root element is required.');
  const render = () => { root.innerHTML = renderAppState(store.getState()); };
  store.subscribe(render); render();
  root.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    try {
      store.setLoading();
      if (form.matches('[data-new-game-form]')) {
        const data = Object.fromEntries(new FormData(form));
        const result = await api.startNewGame(data);
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
