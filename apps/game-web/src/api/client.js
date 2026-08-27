import { validateApiEnvelope } from './contracts.js';
import { webError } from '../shared/errors.js';

export function createApiClient({ baseUrl = '', fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl is required.');
  const request = async (path, options = {}) => {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...options,
      headers: { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers ?? {}) }
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true) {
      const error = webError(
        payload?.error?.code ?? 'HTTP_REQUEST_FAILED',
        payload?.error?.message ?? `HTTP ${response.status}`
      );
      error.httpStatus = response.status;
      throw error;
    }
    return validateApiEnvelope(payload).data;
  };
  return Object.freeze({
    health: () => request('/api/v1/health'),
    getLlmSettings: () => request('/api/v1/llm-settings'),
    testLlmSettings: (input) => request('/api/v1/llm-settings/test', post(input)),
    applyLlmSettings: (input) => request('/api/v1/llm-settings', put(input)),
    resetLlmSettings: () => request('/api/v1/llm-settings', put({ mode: 'default' })),
    listScenarios: () => request('/api/v1/scenarios'),
    normalizePortraitSpec: (input) => request('/api/v1/portrait-spec', post(input)),
    startNewGame: (input) => request('/api/v1/new-games', post(input)),
    getPartyScreen: (partyId) => request(`/api/v1/parties/${encodeURIComponent(partyId)}/screen`),
    acknowledgeOpening: (partyId, input) => request(`/api/v1/parties/${encodeURIComponent(partyId)}/opening-ack`, post(input)),
    submitTurn: (partyId, input) => request(`/api/v1/parties/${encodeURIComponent(partyId)}/turns`, post(input))
  });
}
function post(body) { return { method: 'POST', body: JSON.stringify(body ?? {}) }; }
function put(body) { return { method: 'PUT', body: JSON.stringify(body ?? {}) }; }
