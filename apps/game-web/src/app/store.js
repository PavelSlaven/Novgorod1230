import { validatePublicScreen } from '../api/contracts.js';

export function createUiStore(initial = {}) {
  let state = freeze({
    status: 'idle',
    view: 'landing',
    screen: null,
    partyId: null,
    rememberedPartyId: text(initial.rememberedPartyId),
    scenarios: [],
    error: null,
    developerMode: initial.developerMode === true,
    activeOverlay: null,
    theme: theme(initial.theme),
    newGameDraft: '',
    turnDraft: '',
    llmSettings: null,
    llmSettingsDraft: null,
    llmSettingsMessage: null,
    opening: freeze({ status: 'idle', clientAckId: null, acknowledgedAt: null })
  });
  const listeners = new Set();
  const publish = () => listeners.forEach((listener) => listener(state));
  return Object.freeze({
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setLoading() { state = freeze({ ...state, status: 'loading', error: null }); publish(); },
    setScenarios(scenarios) {
      state = freeze({
        ...state,
        scenarios: Array.isArray(scenarios)
          ? structuredClone(scenarios)
          : []
      });
      publish();
    },
    setScreen(screen, {
      openingStatus = 'acknowledged', clientAckId = null,
      acknowledgedAt = null
    } = {}) {
      const validated = validatePublicScreen(screen);
      state = freeze({
        ...state,
        status: 'ready',
        view: 'game',
        screen: structuredClone(validated),
        partyId: validated.party_id,
        error: null,
        activeOverlay: null,
        opening: freeze({ status: openingStatus, clientAckId, acknowledgedAt })
      });
      publish();
    },
    setError(error) { state = freeze({ ...state, status: 'error', error: { code: error?.code ?? 'UNKNOWN', message: error?.message ?? 'Request failed.' } }); publish(); },
    showLanding() {
      state = freeze({
        ...state,
        status: 'idle',
        view: 'landing',
        screen: null,
        partyId: null,
        error: null,
        activeOverlay: null,
        opening: freeze({ status: 'idle', clientAckId: null, acknowledgedAt: null })
      });
      publish();
    },
    showNewGame() {
      state = freeze({ ...state, status: 'idle', view: 'new_game', error: null, activeOverlay: null });
      publish();
    },
    setRememberedPartyId(value) {
      state = freeze({ ...state, rememberedPartyId: text(value) });
      publish();
    },
    setTheme(value) {
      state = freeze({ ...state, theme: theme(value) });
      publish();
    },
    setLlmSettings(settings, message = null) {
      state = freeze({ ...state, llmSettings: settings ? structuredClone(settings) : null, llmSettingsMessage: message });
      publish();
    },
    setLlmSettingsDraft(settings) {
      state = freeze({ ...state, llmSettingsDraft: settings ? structuredClone(settings) : null });
      publish();
    },
    setLlmSettingsMessage(message) {
      state = freeze({ ...state, llmSettingsMessage: message });
      publish();
    },
    openOverlay(kind) {
      state = freeze({ ...state, activeOverlay: text(kind) });
      publish();
    },
    closeOverlay() {
      state = freeze({ ...state, activeOverlay: null });
      publish();
    },
    setOpeningAcknowledged() {
      state = freeze({
        ...state,
        status: 'ready',
        error: null,
        opening: freeze({
          status: 'acknowledged', clientAckId: null, acknowledgedAt: null
        })
      });
      publish();
    },
    setOpeningFailed(error) {
      state = freeze({
        ...state,
        status: 'error',
        error: { code: error?.code ?? 'OPENING_ACK_FAILED', message: error?.message ?? 'Не удалось подтвердить вступление.' },
        opening: freeze({ ...state.opening, status: 'failed' })
      });
      publish();
    },
    clearError() {
      state = freeze({
        ...state,
        status: state.screen ? 'ready' : 'idle',
        error: null
      });
      publish();
    },
    setDraft(kind, value) {
      const key = kind === 'new_game' ? 'newGameDraft' : 'turnDraft';
      state = freeze({ ...state, [key]: String(value ?? '') });
    },
    clearDraft(kind) {
      const key = kind === 'new_game' ? 'newGameDraft' : 'turnDraft';
      state = freeze({ ...state, [key]: '' });
    },
    clear() {
      state = freeze({
        ...state,
        status: 'idle', view: 'landing', screen: null, partyId: null,
        error: null, activeOverlay: null,
        opening: freeze({ status: 'idle', clientAckId: null, acknowledgedAt: null })
      });
      publish();
    }
  });
}
function freeze(value) { return Object.freeze(value); }
function text(value) { return String(value ?? '').trim() || null; }
function theme(value) { return value === 'dark' ? 'dark' : 'light'; }
