import { assertPublicPayload } from '../public-boundary.js';
import { serverError } from '../errors.js';

export const HTTP_API_VERSION = 1;
export const API_SUCCESS_SCHEMA = 'rus_api_success';
export const API_ERROR_SCHEMA = 'rus_api_error';

export function successEnvelope(data, { requestId = null } = {}) {
  assertPublicPayload(data);
  return Object.freeze({
    version: HTTP_API_VERSION,
    schema: API_SUCCESS_SCHEMA,
    ok: true,
    request_id: requestId,
    data: structuredClone(data)
  });
}

export function errorEnvelope(error, { requestId = null, developerMode = false } = {}) {
  const unresolvedOrdinary = error?.code === 'TURN_ORDINARY_DISCOVERY_UNRESOLVED';
  const providerFailure = error?.llm_provider_failure === true
    ? publicProviderFailure(error?.code) : null;
  const status = unresolvedOrdinary ? 409
    : providerFailure ? 503
      : Number.isInteger(error?.status) ? error.status : 500;
  const internal = !providerFailure && (unresolvedOrdinary || status >= 500
    || error?.public_exposure === 'internal');
  const code = providerFailure?.code ?? (internal ? 'TEMPORARY_ACTION_UNAVAILABLE'
    : text(error?.code) || 'REQUEST_FAILED');
  const message = providerFailure?.message ?? (internal
    ? 'Действие временно недоступно. Попробуйте ещё раз.'
    : text(error?.message) || 'Request failed.');
  return Object.freeze({
    status,
    body: Object.freeze({
      version: HTTP_API_VERSION,
      schema: API_ERROR_SCHEMA,
      ok: false,
      request_id: requestId,
      error: Object.freeze({ code, message })
    })
  });
}

function publicProviderFailure(code) {
  const value = text(code);
  if (value === 'timeout') return providerError('LLM_PROVIDER_TIMEOUT',
    'Модель не ответила за 120 секунд. Ход не сохранён.');
  if (value === 'transport_error') return providerError(
    'LLM_PROVIDER_UNREACHABLE', 'Не удалось подключиться к выбранной модели. Ход не сохранён.');
  if (value === 'invalid_response' || value === 'json_parse_failed') {
    return providerError('LLM_PROVIDER_RESPONSE_INVALID',
      'Выбранная модель вернула неподдерживаемый ответ. Ход не сохранён.');
  }
  if (value === 'missing_api_key') return providerError(
    'LLM_PROVIDER_NOT_CONFIGURED', 'Настрой LLM перед началом игры. Ход не сохранён.');
  if (value === 'http_401' || value === 'http_403') return providerError(
    'LLM_PROVIDER_AUTH_FAILED', 'Выбранная модель отклонила API key. Ход не сохранён.');
  if (/^http_(?:400|404|409|422)$/u.test(value)) return providerError(
    'LLM_PROVIDER_MODEL_INVALID', 'Endpoint не принял выбранную модель или запрос. Ход не сохранён.');
  if (value === 'http_429') return providerError('LLM_PROVIDER_RATE_LIMITED',
    'Выбранная модель временно ограничила запросы. Ход не сохранён.');
  if (/^http_5\d\d$/u.test(value)) return providerError(
    'LLM_PROVIDER_UNAVAILABLE', 'Выбранная модель временно недоступна. Ход не сохранён.');
  return null;
}

function providerError(code, message) { return { code, message }; }

export function validateNewGameRequest(body) {
  if (!plain(body)) throw serverError('REQUEST_BODY_INVALID', 'JSON object body is required.', { status: 400 });
  if (!text(body.start_text) && !text(body.scenario_id)) {
    throw serverError(
      'NEW_GAME_START_REQUIRED',
      'start_text or scenario_id is required.',
      { status: 400 }
    );
  }
  return body;
}

export function validateOpeningAckRequest(body) {
  if (!plain(body) || !text(body.client_ack_id)) {
    throw serverError('CLIENT_ACK_ID_REQUIRED', 'client_ack_id is required.', { status: 400 });
  }
  return body;
}

export function validateTurnRequest(body) {
  if (!plain(body)) throw serverError('REQUEST_BODY_INVALID', 'JSON object body is required.', { status: 400 });
  if (!text(body.raw_text) && !text(body.selected_action_option_id)) {
    throw serverError('TURN_INPUT_REQUIRED', 'raw_text or selected_action_option_id is required.', { status: 400 });
  }
  return body;
}

export function validatePresentationRecoveryRequest(body) {
  if (!plain(body) || Object.keys(body).length !== 0) {
    throw serverError('REQUEST_BODY_INVALID', 'Presentation recovery body must be empty.', { status: 400 });
  }
  return body;
}

export function validateLlmSettingsRequest(body) {
  if (!plain(body)) throw serverError('LLM_SETTINGS_BODY_INVALID', 'LLM settings must be an object.', { status: 400 });
  return body;
}

export function validateLlmSettingsProbeRequest(body) {
  return validateLlmSettingsRequest(body);
}

function text(value) { return String(value ?? '').trim(); }
function plain(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
