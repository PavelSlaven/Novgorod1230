import {
  formatPortraitSpecV1Errors,
  validatePortraitSpecV1
} from './contract.js';

export class PortraitInputError extends Error {
  constructor(code, message, validationErrors = []) {
    super(message);
    this.name = 'PortraitInputError';
    this.code = code;
    this.validationErrors = validationErrors;
  }
}

export async function resolvePortraitInput(rawInput, { normalizeText } = {}) {
  const input = String(rawInput ?? '').trim();
  if (!input) {
    throw new PortraitInputError('PORTRAIT_INPUT_REQUIRED', 'Введите описание или JSON портрета.');
  }

  if (looksLikeJson(input)) {
    let parsed;
    try {
      parsed = JSON.parse(input);
    } catch (error) {
      throw new PortraitInputError(
        'PORTRAIT_JSON_INVALID',
        `Некорректный JSON: ${String(error?.message ?? error)}`
      );
    }
    assertValidSpec(parsed, 'PORTRAIT_JSON_SCHEMA_INVALID');
    return Object.freeze({ source: 'json', spec: parsed });
  }

  if (typeof normalizeText !== 'function') {
    throw new TypeError('normalizeText is required for natural-language input.');
  }
  const result = await normalizeText(input);
  const spec = result?.spec ?? result;
  assertValidSpec(spec, 'PORTRAIT_SPEC_SERVER_INVALID');
  return Object.freeze({ source: 'text', spec });
}

function looksLikeJson(input) {
  return input.startsWith('{') || input.startsWith('[');
}

function assertValidSpec(spec, code) {
  const errors = validatePortraitSpecV1(spec);
  if (errors.length === 0) return;
  throw new PortraitInputError(
    code,
    formatPortraitSpecV1Errors(errors),
    errors
  );
}
