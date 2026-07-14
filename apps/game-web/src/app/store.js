import { validatePublicScreen } from '../api/contracts.js';

export function createUiStore(initial = {}) {
  let state = freeze({ status: 'idle', screen: null, partyId: null, error: null, developerMode: initial.developerMode === true });
  const listeners = new Set();
  const publish = () => listeners.forEach((listener) => listener(state));
  return Object.freeze({
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setLoading() { state = freeze({ ...state, status: 'loading', error: null }); publish(); },
    setScreen(screen) {
      const validated = validatePublicScreen(screen);
      state = freeze({ ...state, status: 'ready', screen: structuredClone(validated), partyId: validated.party_id, error: null });
      publish();
    },
    setError(error) { state = freeze({ ...state, status: 'error', error: { code: error?.code ?? 'UNKNOWN', message: error?.message ?? 'Request failed.' } }); publish(); },
    clear() { state = freeze({ status: 'idle', screen: null, partyId: null, error: null, developerMode: state.developerMode }); publish(); }
  });
}
function freeze(value) { return Object.freeze(value); }
