export function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function hasOwnRecursive(value, key) {
  if (!value || typeof value !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(value, key) && value[key] != null) return true;
  if (Array.isArray(value)) return value.some((item) => hasOwnRecursive(item, key));
  return Object.values(value).some((item) => hasOwnRecursive(item, key));
}

export function dedupeConcerns(concerns) {
  const seen = new Set();
  const result = [];
  for (const item of concerns) {
    const key = `${item.code}:${item.field ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function concern(code, message, extra = {}) { return { code, message, ...extra }; }
