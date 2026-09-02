import { deepFreeze } from '@rus/kernel';

export function collectKnownRefs(request) {
  const found = new Set();
  const visit = (value, key = '') => {
    if (typeof value === 'string'
        && /(^refs?$|_refs?$|^id$|_id$)/u.test(key) && value.trim()) {
      found.add(value);
    } else if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, key));
    } else if (plain(value)) {
      Object.entries(value).forEach(([name, entry]) => visit(entry, name));
    }
  };
  if (plain(request)) {
    visit(request.actor);
    visit(request.player_safe_state);
    visit(request.available_domain_operations);
    visit(request.prepared_followup_candidates);
    collectCanonicalMapRefs(request.actor?.attributes, found);
    collectCanonicalMapRefs(request.actor?.skills, found);
  }
  return found;
}

export function knownRef(value, path, errors, trace) {
  requiredText(value, path, errors);
  if (typeof value !== 'string' || !value.trim() || !trace) return;
  if (!trace.knownRefs.has(value)) {
    add(errors, path, 'unknown_ref',
      'must reference request data or an earlier temp_ref');
  }
  if (trace.retired.has(value)) {
    add(errors, path, 'retired_ref', 'retired entity cannot be used again');
  }
}

export function mutableRef(value, path, errors, trace) {
  knownRef(value, path, errors, trace);
  if (trace?.retired.has(value)) {
    add(errors, path, 'post_retire',
      'entity cannot be changed after retirement');
  }
}

export function newTemp(value, path, errors, trace) {
  requiredText(value, path, errors);
  if (typeof value !== 'string' || !value.trim()) return;
  if (trace.knownRefs.has(value) || trace.allTempRefs.has(value)) {
    add(errors, path, 'duplicate_temp_ref',
      'must be unique and must not shadow a permanent ref');
  }
  trace.tempRefs.add(value);
  trace.allTempRefs.add(value);
}

export function refs(value, path, errors, trace, {
  min = 0,
  allowEmpty = false
} = {}) {
  if (!Array.isArray(value)) {
    add(errors, path, 'type', 'must be an array');
    return;
  }
  if (!allowEmpty && value.length < min) {
    add(errors, path, 'min_items',
      `must contain at least ${min} reference(s)`);
  }
  const seen = new Set();
  value.forEach((entry, index) => {
    if (seen.has(entry)) {
      add(errors, `${path}[${index}]`, 'unique', 'duplicate reference');
    }
    seen.add(entry);
    if (trace) knownRef(entry, `${path}[${index}]`, errors, trace);
    else requiredText(entry, `${path}[${index}]`, errors);
  });
}

export function jsonProjection(value, path, errors) {
  if (!plain(value)) {
    add(errors, path, 'type', 'must be a JSON object projection');
    return;
  }
  if (!isJsonData(value, new Set())) {
    add(errors, path, 'json_data',
      'must contain only finite acyclic JSON data');
  }
}

export function cloneTrace(trace) {
  return {
    knownRefs: new Set(trace.knownRefs),
    tempRefs: new Set(trace.tempRefs),
    allTempRefs: trace.allTempRefs,
    retired: new Set(trace.retired),
    placements: new Map(trace.placements),
    inside: new Map(trace.inside)
  };
}

export function strict(value, path, keys, errors, { optional = [] } = {}) {
  if (!plain(value)) {
    add(errors, path, 'type', 'must be an object');
    return false;
  }
  const allowed = new Set([...keys, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      add(errors, `${path}.${key}`, 'additional_property', 'is forbidden');
    }
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) {
      add(errors, `${path}.${key}`, 'required', 'is required');
    }
  }
  return true;
}

export function plain(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function requiredText(value, path, errors) {
  if (typeof value !== 'string' || !value.trim()) {
    add(errors, path, 'type', 'must be a non-empty string');
  }
}

export function integer(value, minimum, path, errors) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    add(errors, path, 'range', `must be a safe integer >= ${minimum}`);
  }
}

export function enumValue(value, allowed, path, errors) {
  if (!allowed.includes(value)) {
    add(errors, path, 'enum', `must be one of: ${allowed.join(', ')}`);
  }
}

export function constant(value, expected, path, errors) {
  if (value !== expected) {
    add(errors, path, 'const', `must equal ${JSON.stringify(expected)}`);
  }
}

export function requireNull(value, path, errors) {
  if (value !== null) add(errors, path, 'resolution', 'must be null');
}

export function add(errors, path, code, message) {
  errors.push({ path, code, message });
}

export function result(errors) {
  return deepFreeze({
    ok: errors.length === 0,
    errors: structuredClone(errors)
  });
}

export function contractError(code, errors) {
  const error = new Error(`${code}: ${errors.map(
    ({ path, message }) => `${path} ${message}`
  ).join('; ')}`);
  error.code = code;
  error.details = deepFreeze({ errors: structuredClone(errors) });
  return error;
}

function collectCanonicalMapRefs(value, found) {
  if (!plain(value)) return;
  for (const key of Object.keys(value)) {
    if (key.trim()) found.add(key);
  }
}

function isJsonData(value, ancestors) {
  if (value === null || typeof value === 'string'
      || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) {
    if (ancestors.has(value)) return false;
    const next = new Set(ancestors).add(value);
    return value.every((entry) => isJsonData(entry, next));
  }
  if (!plain(value) || ancestors.has(value)) return false;
  const next = new Set(ancestors).add(value);
  return Object.values(value).every((entry) => isJsonData(entry, next));
}
