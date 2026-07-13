const DEFAULT_IGNORED_KEYS = new Set(['prose', 'main_prose', 'openingText', 'text']);

export function compareStructuralObservations(legacy, modular, options = {}) {
  const ignored = new Set([...(options.ignored_keys ?? DEFAULT_IGNORED_KEYS)]);
  const differences = [];
  walk(legacy, modular, '$', ignored, differences);
  return Object.freeze({
    equivalent: differences.length === 0,
    differences: Object.freeze(differences)
  });
}

function walk(left, right, path, ignored, differences) {
  if (ignored.has(lastKey(path))) return;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return push(differences, path, 'type_mismatch', left, right);
    if (left.length !== right.length) push(differences, path, 'array_length_mismatch', left.length, right.length);
    const length = Math.min(left.length, right.length);
    for (let index = 0; index < length; index += 1) walk(left[index], right[index], `${path}[${index}]`, ignored, differences);
    return;
  }
  if (isObject(left) || isObject(right)) {
    if (!isObject(left) || !isObject(right)) return push(differences, path, 'type_mismatch', left, right);
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of [...keys].sort()) {
      if (ignored.has(key)) continue;
      if (!(key in left)) push(differences, `${path}.${key}`, 'missing_in_legacy', undefined, right[key]);
      else if (!(key in right)) push(differences, `${path}.${key}`, 'missing_in_modular', left[key], undefined);
      else walk(left[key], right[key], `${path}.${key}`, ignored, differences);
    }
    return;
  }
  if (!Object.is(left, right)) push(differences, path, 'value_mismatch', left, right);
}

function push(target, path, kind, legacy, modular) { target.push(Object.freeze({ path, kind, legacy, modular })); }
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function lastKey(path) { return String(path).split('.').at(-1)?.replace(/\[\d+\]$/u, '') ?? ''; }
