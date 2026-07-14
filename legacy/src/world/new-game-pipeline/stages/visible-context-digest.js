export {
  computeCanonicalDigest as canonicalVisibleContextDigest,
  computeVisibleContextPackageDigest
} from '@rus/contracts';

export function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = sortValue(value[key]);
  return out;
}
