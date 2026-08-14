import { createApiClient } from '../api/client.js';
import { createUiStore } from './store.js';
import { renderAppState } from './router.js';

const PARTY_STORAGE_KEY = 'rus.party_id';
const THEME_STORAGE_KEY = 'rus.theme';

export function bootstrapGameWeb({
  root = document.querySelector('[data-game-root]'),
  api = createApiClient(),
  store = createUiStore(),
  storage
} = {}) {
  if (!root) throw new TypeError('game root element is required.');
  const partyStorage = storage ?? availableLocalStorage();
  store.setRememberedPartyId(partyStorage?.getItem?.(PARTY_STORAGE_KEY));
  store.setTheme(storedTheme(partyStorage) ?? preferredTheme());

  const render = () => {
    const state = store.getState();
    root.ownerDocument.documentElement.dataset.theme = state.theme;
    root.innerHTML = renderAppState(state);
  };
  store.subscribe(render);
  render();
  api.listScenarios()
    .then((catalog) => store.setScenarios(catalog.scenarios))
    .catch(() => store.setScenarios([]));

  root.addEventListener('submit', async (event) => {
    const form = event.target;
    const FormElement = root.ownerDocument.defaultView.HTMLFormElement;
    if (!(form instanceof FormElement)) return;
    event.preventDefault();
    if (form.matches('[data-new-game-form]')) {
      const raw = String(new root.ownerDocument.defaultView.FormData(form)
        .get('start_text') ?? '');
      store.setDraft('new_game', raw);
      const startText = raw.trim();
      if (!startText) {
        store.setError(uiError('START_TEXT_REQUIRED', 'Опиши начало истории.'));
        return;
      }
      await startParty({ start_text: startText });
      return;
    }
    if (form.matches('[data-turn-form]')) {
      const raw = String(new root.ownerDocument.defaultView.FormData(form)
        .get('raw_text') ?? '');
      store.setDraft('turn', raw);
      if (!raw.trim()) {
        store.setError(uiError('TURN_INPUT_REQUIRED', 'Сформулируй действие.'));
        return;
      }
      await submitTurn({ raw_text: raw.trim() });
    }
  });

  root.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey
      && event.target.matches?.('[data-turn-form] textarea')) {
      event.preventDefault();
      event.target.form?.requestSubmit();
      return;
    }
    if (event.key === 'Escape' && store.getState().activeOverlay) {
      event.preventDefault();
      closeOverlay();
      return;
    }
    if (event.key === 'Tab' && store.getState().activeOverlay) {
      trapOverlayFocus(event, root);
    }
  });

  root.addEventListener('click', async (event) => {
    const target = event.target;
    if (target.closest?.('[data-start-new-game]')) return store.showNewGame();
    if (target.closest?.('[data-return-start]')) return store.showLanding();
    if (target.closest?.('[data-theme-toggle]')) return toggleTheme();
    if (target.closest?.('[data-dismiss-error]')) return store.clearError();
    if (target.closest?.('[data-continue-party]')) return continueParty();
    if (target.closest?.('[data-retry-opening-ack]')) return acknowledgeOpening();

    const overlayButton = target.closest?.('[data-overlay-open]');
    if (overlayButton && !overlayButton.disabled) {
      store.openOverlay(overlayButton.dataset.overlayOpen);
      root.querySelector('[data-overlay-panel]')?.focus();
      return;
    }
    const backdrop = target.closest?.('[data-overlay-backdrop]');
    if (target.closest?.('[data-overlay-close]')
      || (backdrop && target === backdrop)) {
      closeOverlay();
      return;
    }
    const scenarioButton = target.closest?.('[data-scenario-id]');
    if (scenarioButton && !scenarioButton.disabled) {
      await startParty({ scenario_id: scenarioButton.dataset.scenarioId });
      return;
    }
    const actionButton = target.closest?.('[data-action-id]');
    if (actionButton && !actionButton.disabled) {
      await submitTurn({
        selected_action_option_id: actionButton.dataset.actionId
      });
    }
  });

  async function startParty(input) {
    try {
      store.setLoading();
      const result = await api.startNewGame(input);
      partyStorage?.setItem?.(PARTY_STORAGE_KEY, result.party_id);
      store.setRememberedPartyId(result.party_id);
      store.clearDraft('new_game');
      const clientAckId = `web:${result.party_id}:${Date.now()}`;
      store.setScreen(result.screen, {
        openingStatus: 'pending', clientAckId
      });
      await acknowledgeOpening();
    } catch (error) {
      if (store.getState().opening.status === 'pending') {
        store.setOpeningFailed(error);
      } else {
        store.setError(error);
      }
    }
  }

  async function acknowledgeOpening() {
    const state = store.getState();
    if (!state.partyId || !state.opening.clientAckId) return;
    try {
      if (state.opening.status === 'failed') {
        store.setScreen(state.screen, {
          openingStatus: 'pending',
          clientAckId: state.opening.clientAckId
        });
      }
      await api.acknowledgeOpening(state.partyId, {
        client_ack_id: state.opening.clientAckId
      });
      store.setOpeningAcknowledged();
    } catch (error) {
      store.setOpeningFailed(error);
    }
  }

  async function continueParty() {
    const partyId = store.getState().rememberedPartyId;
    if (!partyId) return;
    try {
      store.setLoading();
      const result = await api.getPartyScreen(partyId);
      store.setScreen(result.screen, { openingStatus: 'acknowledged' });
    } catch (error) {
      if (error?.httpStatus === 404 || error?.code === 'PARTY_NOT_FOUND') {
        partyStorage?.removeItem?.(PARTY_STORAGE_KEY);
        store.setRememberedPartyId(null);
      }
      store.setError(error);
    }
  }

  async function submitTurn(input) {
    try {
      store.setLoading();
      const result = await api.submitTurn(store.getState().partyId, input);
      store.clearDraft('turn');
      store.setScreen(result.screen, { openingStatus: 'acknowledged' });
    } catch (error) {
      store.setError(error);
    }
  }

  function toggleTheme() {
    const next = store.getState().theme === 'dark' ? 'light' : 'dark';
    partyStorage?.setItem?.(THEME_STORAGE_KEY, next);
    store.setTheme(next);
  }

  function closeOverlay() {
    const kind = store.getState().activeOverlay;
    store.closeOverlay();
    root.querySelector(`[data-overlay-open="${kind}"]`)?.focus();
  }

  return Object.freeze({ api, store, render });
}

function trapOverlayFocus(event, root) {
  const panel = root.querySelector('[data-overlay-panel]');
  if (!panel) return;
  const focusable = [...panel.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && root.ownerDocument.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && root.ownerDocument.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function storedTheme(storage) {
  const value = storage?.getItem?.(THEME_STORAGE_KEY);
  return value === 'light' || value === 'dark' ? value : null;
}
function preferredTheme() {
  try {
    return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}
function availableLocalStorage() {
  try { return globalThis.localStorage; }
  catch { return null; }
}
function uiError(code, message) {
  return Object.assign(new Error(message), { code });
}
