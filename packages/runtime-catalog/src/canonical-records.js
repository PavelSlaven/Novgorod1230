import { createHash } from 'node:crypto';

const NORMALIZERS = Object.freeze({
  boolean: normalizeBoolean,
  date: normalizeDate,
  integer_decimal: normalizeInteger,
  jsonb: normalizeJson,
  numeric_decimal: normalizeNumeric,
  text_nfc: normalizeText,
  timestamptz_microseconds: normalizeTimestamp
});

export function projectCanonicalRecord({ registryEntry, row }) {
  validateRegistryEntry(registryEntry);
  if (!isObject(row)) throw new TypeError('row must be an object.');

  const allowedColumns = new Set([
    ...registryEntry.canonical_columns,
    ...registryEntry.excluded_operational_columns
  ]);
  const unknownColumns = Object.keys(row).filter((column) => !allowedColumns.has(column));
  if (unknownColumns.length > 0) {
    throw new TypeError(
      `${registryEntry.table_name} row contains unregistered columns: ${unknownColumns.join(', ')}`
    );
  }

  const canonicalFields = {};
  for (const column of registryEntry.canonical_columns) {
    if (!Object.hasOwn(row, column)) {
      throw new TypeError(`${registryEntry.table_name}.${column} is required.`);
    }
    canonicalFields[column] = normalizeColumn(registryEntry, column, row[column]);
  }

  const recordKey = {};
  for (const column of registryEntry.primary_key_fields) {
    if (canonicalFields[column] == null) {
      throw new TypeError(`${registryEntry.table_name}.${column} primary key cannot be null.`);
    }
    recordKey[column] = canonicalFields[column];
  }

  return deepFreeze({
    schema: registryEntry.canonical_row_schema_version,
    table_name: registryEntry.table_name,
    record_key: recordKey,
    canonical_fields: canonicalFields
  });
}

export function canonicalRecordKey({ registryEntry, row }) {
  return canonicalStringify(
    projectCanonicalRecord({ registryEntry, row }).record_key
  );
}

export function computeCanonicalRecordDigest(projection) {
  if (!isObject(projection)
    || projection.schema !== 'rus.catalog_record_projection.v2'
    || typeof projection.table_name !== 'string'
    || !isObject(projection.record_key)
    || !isObject(projection.canonical_fields)) {
    throw new TypeError('Invalid canonical record projection.');
  }
  return sha256(canonicalStringify(projection));
}

export function computeRecordRegistryDigest(registry) {
  const document = Array.isArray(registry)
    ? {
      schema: 'rus.catalog_record_registry.v1',
      entries: registry
    }
    : registry;
  if (!isObject(document) || !Array.isArray(document.entries)) {
    throw new TypeError('Record registry must contain entries.');
  }
  for (const entry of document.entries) validateRegistryEntry(entry);
  return sha256(canonicalStringify(document));
}

export function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function normalizeColumn(registryEntry, column, value) {
  if (value === null) return null;
  const normalizerName = registryEntry.column_normalizers[column];
  const normalizer = NORMALIZERS[normalizerName];
  if (!normalizer) {
    throw new TypeError(
      `${registryEntry.table_name}.${column} has unknown normalizer ${normalizerName}.`
    );
  }
  return normalizer(value, `${registryEntry.table_name}.${column}`);
}

function normalizeBoolean(value, field) {
  if (typeof value !== 'boolean') throw new TypeError(`${field} must be boolean.`);
  return value;
}

function normalizeDate(value, field) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    value = value.toISOString().slice(0, 10);
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new TypeError(`${field} must be an ISO date.`);
  }
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) {
    throw new TypeError(`${field} must be a valid ISO date.`);
  }
  return value;
}

function normalizeInteger(value, field) {
  const text = typeof value === 'bigint'
    ? value.toString()
    : typeof value === 'number' && Number.isSafeInteger(value)
      ? String(value)
      : typeof value === 'string'
        ? value
        : null;
  if (text === null || !/^[+-]?\d+$/u.test(text)) {
    throw new TypeError(`${field} must be an exact integer.`);
  }
  const negative = text.startsWith('-');
  const digits = text.replace(/^[+-]/u, '').replace(/^0+(?=\d)/u, '');
  return digits === '0' ? '0' : `${negative ? '-' : ''}${digits}`;
}

function normalizeNumeric(value, field) {
  if (typeof value !== 'string' || !/^[+-]?\d+(?:\.\d+)?$/u.test(value)) {
    throw new TypeError(`${field} must be an exact non-exponent decimal string.`);
  }
  const negative = value.startsWith('-');
  const unsigned = value.replace(/^[+-]/u, '');
  const [rawInteger, rawFraction = ''] = unsigned.split('.');
  const integer = rawInteger.replace(/^0+(?=\d)/u, '');
  const fraction = rawFraction.replace(/0+$/u, '');
  const normalized = fraction.length > 0 ? `${integer}.${fraction}` : integer;
  return /^0(?:\.0*)?$/u.test(normalized)
    ? '0'
    : `${negative ? '-' : ''}${normalized}`;
}

function normalizeText(value, field) {
  if (typeof value !== 'string') throw new TypeError(`${field} must be text.`);
  return value.normalize('NFC');
}

function normalizeTimestamp(value, field) {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a timestamp.`);
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?Z$/u.exec(value);
  if (!match || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${field} must be UTC RFC3339.`);
  }
  return `${match[1]}.${(match[2] ?? '').padEnd(6, '0')}Z`;
}

function normalizeJson(value, field) {
  try {
    return canonicalize(value);
  } catch (error) {
    throw new TypeError(`${field} must be canonicalizable JSONB.`, { cause: error });
  }
}

function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return typeof value === 'string' ? value.normalize('NFC') : value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('JSON numbers must be finite.');
    if (Object.is(value, -0)) return 0;
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isObject(value)) throw new TypeError('Value is not canonical JSON.');
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key.normalize('NFC'), canonicalize(value[key])])
  );
}

function validateRegistryEntry(entry) {
  if (!isObject(entry)
    || typeof entry.table_name !== 'string'
    || !Array.isArray(entry.primary_key_fields)
    || entry.primary_key_fields.length === 0
    || !Array.isArray(entry.canonical_columns)
    || !Array.isArray(entry.excluded_operational_columns)
    || !isObject(entry.column_normalizers)
    || entry.canonical_row_schema_version !== 'rus.catalog_record_projection.v2') {
    throw new TypeError('Invalid canonical record registry entry.');
  }
  const canonicalColumns = new Set(entry.canonical_columns);
  if (canonicalColumns.size !== entry.canonical_columns.length
    || entry.primary_key_fields.some((field) => !canonicalColumns.has(field))
    || entry.excluded_operational_columns.some((field) => canonicalColumns.has(field))
    || entry.canonical_columns.some((field) => !NORMALIZERS[entry.column_normalizers[field]])) {
    throw new TypeError(`Invalid canonical columns for ${entry.table_name}.`);
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}
