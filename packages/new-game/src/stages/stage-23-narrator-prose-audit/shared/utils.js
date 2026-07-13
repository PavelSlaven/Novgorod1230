export function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
export function text(value) { return typeof value === 'string' && value.trim().length > 0; }
export function array(value) { return Array.isArray(value) ? value : []; }
export function safeClone(value) { try { return structuredClone(value); } catch { return null; } }
export function deepEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => deepEqual(item, right[index]));
  if (isObject(left) || isObject(right)) {
    if (!isObject(left) || !isObject(right)) return false;
    const a = Object.keys(left).sort(); const b = Object.keys(right).sort();
    return a.length === b.length && a.every((key, index) => key === b[index] && deepEqual(left[key], right[key]));
  }
  return false;
}

export function dedupe(items) { const seen = new Set(); return items.filter((item) => { const key = `${item.code}|${item.field}|${item.message}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
export function walk(value, visitor, path = 'root') { if (value == null || typeof value !== 'object') return; if (Array.isArray(value)) { value.forEach((child, index) => walk(child, visitor, `${path}[${index}]`)); return; } for (const [key, child] of Object.entries(value)) { visitor(key, child, `${path}.${key}`); walk(child, visitor, `${path}.${key}`); } }
export function findForbiddenKeys(value, forbidden) { const paths = []; walk(value, (key, child, path) => { if (forbidden.has(key) && child != null) paths.push(path); }); return paths; }
export function issue(code, message, field) { return { code, severity: 'hard_block', message, field }; }
export function stripJsonFence(value) { return String(value).trim().replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, ''); }
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export function extractRefs(entries) {
  return array(entries).map((entry) => typeof entry === 'string' ? entry : entry?.source_ref ?? entry?.ref_id ?? entry?.visible_context_ref).filter(text);
}
