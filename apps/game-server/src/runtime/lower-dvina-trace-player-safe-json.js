export function assertAllowedKeys(value, allowed, path, code) {
  if (!plain(value)) throw projectionError(code, `${path} must be an object.`);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) {
    throw projectionError(code, `${path}.${unknown} is not player-safe.`);
  }
  return value;
}

export function assertJson(value) {
  validateJson(value, '$', new Set());
  return value;
}

export function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, nested]) =>
    nested !== undefined && nested !== ''));
}

export function finite(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function freezeJson(value) {
  validateJson(value, '$', new Set());
  return freezeDeep(structuredClone(value));
}

export function plain(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function projectionError(code, message, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), {
    code
  });
}

export function scalarRecord(value, { strict = false, path = 'record',
  code = 'TRACE_PLAYER_SAFE_WORKING_PROJECTION_INVALID', allowedKeys } = {}) {
  if (!plain(value)) return undefined;
  if (!(allowedKeys instanceof Set)) {
    throw new TypeError('scalarRecord requires an explicit allowedKeys set.');
  }
  if (strict) assertAllowedKeys(value, allowedKeys, path, code);
  const result = {};
  for (const [key, nested] of Object.entries(value)) {
    if (!allowedKeys.has(key)) continue;
    if (typeof nested === 'string' || typeof nested === 'boolean'
        || nested === null) {
      result[key] = nested;
    } else if (typeof nested === 'number' && Number.isFinite(nested)) {
      result[key] = nested;
    } else if (strict) {
      throw projectionError(code, `${path}.${key} must be a JSON scalar.`);
    }
  }
  return result;
}

export function text(value) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function textArray(value, { strict = false, path = 'array',
  code = 'TRACE_PLAYER_SAFE_WORKING_PROJECTION_INVALID' } = {}) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    if (strict) throw projectionError(code, `${path} must be an array.`);
    return undefined;
  }
  if (strict && value.some((entry) => text(entry) === undefined)) {
    throw projectionError(code, `${path} must contain only text refs.`);
  }
  return value.map(text).filter(Boolean);
}

function validateJson(value, path, ancestors) {
  if (value === null || typeof value === 'string'
      || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return;
    throw projectionError('TRACE_PLAYER_SAFE_PROJECTION_NOT_JSON',
      `${path} contains a non-finite number.`);
  }
  if (typeof value !== 'object') {
    throw projectionError('TRACE_PLAYER_SAFE_PROJECTION_NOT_JSON',
      `${path} contains a non-JSON value.`);
  }
  if (ancestors.has(value)) {
    throw projectionError('TRACE_PLAYER_SAFE_PROJECTION_NOT_JSON',
      `${path} contains a cyclic value.`);
  }
  if (!Array.isArray(value) && !plain(value)) {
    throw projectionError('TRACE_PLAYER_SAFE_PROJECTION_NOT_JSON',
      `${path} contains a non-plain object.`);
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((nested, index) =>
      validateJson(nested, `${path}[${index}]`, ancestors));
  } else {
    Object.entries(value).forEach(([key, nested]) =>
      validateJson(nested, `${path}.${key}`, ancestors));
  }
  ancestors.delete(value);
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
}
