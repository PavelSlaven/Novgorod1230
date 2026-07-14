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
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = text(error?.code) || 'INTERNAL_SERVER_ERROR';
  const message = status >= 500 && !developerMode ? 'Internal server error.' : text(error?.message) || 'Request failed.';
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

export function validateNewGameRequest(body) {
  if (!plain(body)) throw serverError('REQUEST_BODY_INVALID', 'JSON object body is required.', { status: 400 });
  if (!text(body.start_text)) throw serverError('START_TEXT_REQUIRED', 'start_text is required.', { status: 400 });
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

function text(value) { return String(value ?? '').trim(); }
function plain(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
