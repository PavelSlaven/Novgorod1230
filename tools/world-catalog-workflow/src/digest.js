import { createHash } from 'node:crypto';

export function stableStringify(value) {
  return JSON.stringify(sortValue(value));
}

export function digestValue(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
