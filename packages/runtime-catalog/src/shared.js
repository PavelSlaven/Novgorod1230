export class RuntimeCatalogError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RuntimeCatalogError';
    this.code = code;
    this.details = deepFreeze(structuredClone(details));
  }
}

export function isDigest(value) {
  return typeof value === 'string'
    && /^(?:sha256:)?[a-f0-9]{64}$/iu.test(value);
}

export function isIsoDate(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/u.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function rowsFrom(result) {
  if (!result || !Array.isArray(result.rows)) {
    fail('RUNTIME_CATALOG_IMPORT_AUDIT_INVALID',
      'World-base reader returned an invalid row set.');
  }
  return result.rows;
}

export function fail(code, message, details) {
  throw new RuntimeCatalogError(code, message, details);
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}
