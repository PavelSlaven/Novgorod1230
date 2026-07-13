import { createHash } from 'node:crypto';

export function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

export function computeVisibleContextPackageDigest(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = sortValue(value[key]);
  return out;
}
