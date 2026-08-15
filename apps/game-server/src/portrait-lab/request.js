import { serverError } from '../errors.js';

export const PORTRAIT_TEXT_MAX_LENGTH = 4000;

export function validatePortraitSpecRequest(body) {
  if (!plainObject(body)) {
    throw serverError('REQUEST_BODY_INVALID', 'JSON object body is required.', { status: 400 });
  }
  const unknown = Object.keys(body).filter((key) => key !== 'text');
  if (unknown.length) {
    throw serverError(
      'PORTRAIT_REQUEST_FIELD_UNKNOWN',
      `Unknown portrait request field: ${unknown[0]}.`,
      { status: 400 }
    );
  }
  if (typeof body.text !== 'string') {
    throw serverError(
      'PORTRAIT_TEXT_TYPE_INVALID',
      'text must be a string.',
      { status: 400 }
    );
  }
  const text = body.text.trim();
  if (!text) {
    throw serverError('PORTRAIT_TEXT_REQUIRED', 'text is required.', { status: 400 });
  }
  if (text.length > PORTRAIT_TEXT_MAX_LENGTH) {
    throw serverError(
      'PORTRAIT_TEXT_TOO_LONG',
      `text must not exceed ${PORTRAIT_TEXT_MAX_LENGTH} characters.`,
      { status: 400 }
    );
  }
  return Object.freeze({ text });
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
