import { deepFreeze } from '@rus/kernel';

export function freezeOutput(value) {
  return deepFreeze(structuredClone(value));
}

export function text(value) {
  return String(value ?? '').trim();
}

export function ensureObject(value, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const error = new TypeError(message);
    error.code = code;
    throw error;
  }
  return value;
}
