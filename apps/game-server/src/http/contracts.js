import { assertPublicPayload, findUnsafePlayerText, projectPublicPayload } from
  '../public-boundary.js';
import { serverError } from '../errors.js';

export const HTTP_API_VERSION = 1;
export const API_SUCCESS_SCHEMA = 'rus_api_success';
export const API_ERROR_SCHEMA = 'rus_api_error';
const PUBLIC_CLIENT_ERROR_CODES = new Set([
  'REQUEST_BODY_INVALID', 'NEW_GAME_START_REQUIRED', 'CLIENT_ACK_ID_REQUIRED',
  'TURN_INPUT_REQUIRED', 'PORTRAIT_REQUEST_FIELD_UNKNOWN',
  'PORTRAIT_TEXT_TYPE_INVALID', 'PORTRAIT_TEXT_REQUIRED',
  'PORTRAIT_TEXT_TOO_LONG', 'LLM_SETTINGS_BODY_INVALID',
  'LLM_SETTINGS_LOCAL_PROVIDER_RETIRED', 'LLM_SETTINGS_MODE_INVALID',
  'LLM_SETTINGS_COMPATIBILITY_INVALID', 'LLM_SETTINGS_MODEL_REQUIRED',
  'LLM_SETTINGS_API_KEY_INVALID', 'LLM_SETTINGS_BASE_URL_REQUIRED',
  'LLM_SETTINGS_BASE_URL_INVALID', 'LLM_SETTINGS_FIELD_UNKNOWN',
  'LIVE_WORLD_TOPOLOGY_COMMITTED_MOVEMENT_DENIED',
  'AUTHORED_OPENING_AUDIT_REJECTED'
]);

export function successEnvelope(data, { requestId = null } = {}) {
  assertPublicPayload(data);
  return Object.freeze({
    version: HTTP_API_VERSION,
    schema: API_SUCCESS_SCHEMA,
    ok: true,
    request_id: requestId,
    data: projectPublicPayload(data)
  });
}

export function errorEnvelope(error, { requestId = null, developerMode = false } = {}) {
  const unresolvedOrdinary = error?.code === 'TURN_ORDINARY_DISCOVERY_UNRESOLVED';
  const providerFailure = error?.llm_provider_failure === true
    ? publicProviderFailure(error?.code) : null;
  const catalogFailure = ['NEEDS_CHECK_BLOCKER_CATALOG_REQUIRED',
    'NEEDS_CHECK_BLOCKER_CATALOG_INVALID'].includes(error?.code)
    ? { code: 'WORLD_CATALOG_PIN_INVALID',
        message: 'Данные мира этой партии недоступны.' } : null;
  const publicTurnFailure = publicTurnFailureFor(error);
  const candidateMessage = publicTurnFailure?.message ?? providerFailure?.message
    ?? catalogFailure?.message ?? text(error?.message) ?? 'Request failed.';
  const publicClientCode = PUBLIC_CLIENT_ERROR_CODES.has(error?.code);
  const unsafeMessage = findUnsafePlayerText(candidateMessage) != null;
  const unsafePublicClientMessage = publicClientCode && unsafeMessage;
  const unsafeCode = !PUBLIC_CLIENT_ERROR_CODES.has(error?.code)
    && findUnsafePlayerText(error?.code) != null;
  const status = unresolvedOrdinary || publicTurnFailure ? 409
    : providerFailure || catalogFailure ? 503
      : Number.isInteger(error?.status) ? error.status : 500;
  const internal = !providerFailure && !catalogFailure && !publicTurnFailure
    && (unresolvedOrdinary || status >= 500
      || (unsafeMessage && !publicClientCode)
      || unsafeCode || error?.public_exposure === 'internal');
  const code = publicTurnFailure?.code ?? providerFailure?.code ?? catalogFailure?.code ?? (internal ? 'TEMPORARY_ACTION_UNAVAILABLE'
    : text(error?.code) || 'REQUEST_FAILED');
  const message = publicTurnFailure?.message ?? providerFailure?.message ?? catalogFailure?.message ?? (internal
    ? 'Действие временно недоступно. Попробуйте ещё раз.'
    : unsafePublicClientMessage ? 'Некорректный запрос.' : candidateMessage);
  return Object.freeze({
    status,
    body: Object.freeze({
      version: HTTP_API_VERSION,
      schema: API_ERROR_SCHEMA,
      ok: false,
      request_id: requestId,
      error: Object.freeze({ code, message,
        ...(code === 'LIVE_WORLD_TOPOLOGY_COMMITTED_MOVEMENT_DENIED'
          && error?.details?.topology_status === 'topology_committed'
          && error?.details?.movement_status === 'movement_denied'
          ? { turn_commit_status: 'topology_committed',
              topology_status: 'topology_committed',
              movement_status: 'movement_denied',
              actor_moved: false, time_advanced: false }
          : error?.turn_commit_status === 'not_started'
            ? { turn_commit_status: 'not_started' } : {}) })
    })
  });
}

// "Ход не сохранён" is true only when the turn owner reports nothing was committed.
function publicTurnFailureFor(error) {
  if (error?.turn_commit_status !== 'not_started') return null;
  const code = error.code;
  if (code === 'TURN_STEP_PLAN_INVALID') return {
    code: 'TURN_NOT_SAVED',
    message: 'Ход не сохранён. Попробуйте сформулировать действие иначе.'
  };
  if (code === 'M2C_TARGET_A1_APPLICABILITY_DATA_GAP') return {
    code: 'WORLD_ACTION_UNAVAILABLE',
    message: 'Ход не сохранён. Для этого действия не хватает данных мира.'
  };
  return null;
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
  if (!plain(body) || Object.keys(body).some((key) => key !== 'request_id')
      || (Object.hasOwn(body, 'request_id') && !text(body.request_id))) {
    throw serverError('REQUEST_BODY_INVALID', 'Presentation recovery accepts only request_id.', { status: 400 });
  }
  return Object.hasOwn(body, 'request_id')
    ? { request_id: text(body.request_id) } : {};
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
