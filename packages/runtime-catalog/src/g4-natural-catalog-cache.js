import { canonicalStringify } from './canonical-records.js';

const catalogs = new WeakMap();

export function getCachedG4NaturalCatalog(verifiedCatalog, pin, stage) {
  const entries = catalogs.get(verifiedCatalog);
  if (!entries) return undefined;
  let pinKey;
  try { pinKey = canonicalStringify(pin); } catch { return undefined; }
  return entries.get(pinKey)?.[stage];
}

export function cacheG4NaturalCatalog(verifiedCatalog, pin, stage, result) {
  let entries = catalogs.get(verifiedCatalog);
  if (!entries) {
    if (!isDeeplyFrozen(verifiedCatalog)) return result;
    entries = new Map();
    catalogs.set(verifiedCatalog, entries);
  }
  const pinKey = canonicalStringify(pin);
  const cached = entries.get(pinKey) ?? {};
  cached[stage] = result;
  entries.set(pinKey, cached);
  return result;
}

function isDeeplyFrozen(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && 'value' in descriptor && isDeeplyFrozen(descriptor.value, seen);
  });
}
