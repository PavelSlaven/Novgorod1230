import { validateApiEnvelope, validateTurnProgress } from './contracts.js';
import { webError } from '../shared/errors.js';

export function createApiClient({ baseUrl = '', fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl is required.');
  const request = async (path, options = {}, timeoutMs = 0) => {
    const requestOptions = {
      ...options,
      headers: { accept: 'application/json', ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers ?? {}) }
    };
    let response;
    if (timeoutMs > 0) {
      const controller = new AbortController();
      let timeout;
      const deadline = new Promise((_, reject) => {
        timeout = setTimeout(() => {
          reject(webError('TURN_REQUEST_TIMEOUT',
            'Ответ на ход не получен вовремя. Повторите отправку или восстановите результат предыдущего хода.'));
          controller.abort();
        }, timeoutMs);
      });
      try {
        response = await Promise.race([
          fetchImpl(`${baseUrl}${path}`, { ...requestOptions, signal: controller.signal }),
          deadline
        ]);
      } finally {
        clearTimeout(timeout);
      }
    } else {
      response = await fetchImpl(`${baseUrl}${path}`, requestOptions);
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true) {
      const error = webError(
        payload?.error?.code ?? 'HTTP_REQUEST_FAILED',
        payload?.error?.message ?? 'Запрос временно недоступен. Попробуйте ещё раз.'
      );
      error.httpStatus = response.status;
      if (payload?.error?.turn_commit_status === 'not_started') {
        error.turn_commit_status = 'not_started';
      }
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
    getTurnProgress: async (partyId, requestId) => validateTurnProgress(
      await request(`/api/v1/parties/${encodeURIComponent(partyId)}/turns/${encodeURIComponent(requestId)}/progress`)),
    recoverPendingPresentation: (partyId, requestId = null) => request(`/api/v1/parties/${encodeURIComponent(partyId)}/presentation-recovery`, post(requestId ? { request_id: requestId } : {})),
    acknowledgeOpening: (partyId, input) => request(`/api/v1/parties/${encodeURIComponent(partyId)}/opening-ack`, post(input)),
    submitTurn: (partyId, input) => request(
      `/api/v1/parties/${encodeURIComponent(partyId)}/turns`, post(input), 120_000)
  });
}
function post(body) { return { method: 'POST', body: JSON.stringify(body ?? {}) }; }
function put(body) { return { method: 'PUT', body: JSON.stringify(body ?? {}) }; }
