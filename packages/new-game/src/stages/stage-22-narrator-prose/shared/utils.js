export function requireObject(concerns, value, field, code) { if (!isObject(value)) concerns.push(issue(code, `${field} is required.`, field)); }
export function issue(code, message, field, expected = undefined, actual = undefined) { return { code, severity: 'hard_block', message, field, ...(expected !== undefined ? { expected } : {}), ...(actual !== undefined ? { actual } : {}) }; }
export function boundedInteger(value, min, max, fallback) { return Number.isInteger(value) && value >= min && value <= max ? value : fallback; }
export function paragraphCount(value) { return text(value) ? String(value).trim().split(/\n\s*\n/u).filter(Boolean).length : 0; }
export function stripJsonFence(value) { return String(value).trim().replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, ''); }
export function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
export function text(value) { return typeof value === 'string' && value.trim().length > 0; }
export function array(value) { return Array.isArray(value) ? value : []; }
export function safeClone(value) { try { return structuredClone(value); } catch { return null; } }
export function deepEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => deepEqual(value, right[index]));
  }
  if (isObject(left) || isObject(right)) {
    if (!isObject(left) || !isObject(right)) return false;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length || !leftKeys.every((key, index) => key === rightKeys[index])) return false;
    return leftKeys.every((key) => deepEqual(left[key], right[key]));
  }
  return false;
}

export function sorted(set) { return [...set].sort(); }
export function dedupe(items) { const seen = new Set(); return items.filter((item) => { const key = `${item.code}|${item.field}|${item.message}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
export function walk(value, visitor, path = 'root') { if (value == null || typeof value !== 'object') return; if (Array.isArray(value)) { value.forEach((child, index) => walk(child, visitor, `${path}[${index}]`)); return; } for (const [key, child] of Object.entries(value)) { visitor(key, child, `${path}.${key}`); walk(child, visitor, `${path}.${key}`); } }
export function findForbiddenKeys(value, forbidden) { const paths = []; walk(value, (key, child, path) => { if (forbidden.has(key) && child != null) paths.push(path); }); return paths; }
