import { deepFreeze } from '@rus/kernel';

const CONTAINER = ['container_ref', 'commit_state', 'template_id',
  'mechanics_profile_ref'];
const ACCESS = ['pass'];
const POLICY = ['schema', 'version', 'unresolved_ordinary_contents',
  'technical_limits'];
const AUTHORITY = ['status'];

// O2b's pre-routing boundary. It deliberately accepts no query, desired item,
// player text or candidate seed: those values cannot influence eligibility.
export function classifyExistingContainerContents(input = {}) {
  const outer = record(input, ['container', 'access', 'ordinary_policy',
    'authoritative_contents']);
  if (!outer) return denied('ITEM_CONTAINER_ORDINARY_INPUT_INVALID');
  const { container, access, ordinary_policy: policy,
    authoritative_contents: authoritative } = outer;
  const c = record(container, CONTAINER);
  const a = record(access, ACCESS);
  const h = record(authoritative, AUTHORITY);
  if (!c || !a || !h) return denied('ITEM_CONTAINER_ORDINARY_INPUT_INVALID');
  if (!text(c.container_ref)) return denied('ITEM_CONTAINER_ORDINARY_INPUT_INVALID');
  if (c.commit_state !== 'committed') return denied('ITEM_CONTAINER_NOT_COMMITTED');
  if (!text(c.template_id) || !text(c.mechanics_profile_ref)) {
    return denied('ITEM_CONTAINER_ORDINARY_MECHANICS_GAP');
  }
  if (a.pass !== true) return denied('ITEM_CONTAINER_ORDINARY_ACCESS_DENIED');
  if (h.status === 'present') {
    return result('authoritative', c.container_ref);
  }
  if (h.status !== 'absent') {
    return denied('ITEM_CONTAINER_AUTHORITATIVE_CLASSIFICATION_INVALID');
  }
  const p = record(policy, POLICY);
  if (!p || !validPolicy(p)) return denied('ITEM_CONTAINER_ORDINARY_POLICY_REQUIRED');
  return p.unresolved_ordinary_contents === true
    ? result('ordinary_unresolved', c.container_ref)
    : denied('ITEM_CONTAINER_ORDINARY_POLICY_DENIED');
}

function validPolicy(value) {
  const limits = record(value.technical_limits,
    ['schema','version','max_new_entities']);
  return value.schema === 'rus.items.existing_container_ordinary_policy.v2'
    && value.version === 2
    && typeof value.unresolved_ordinary_contents === 'boolean'
    && limits?.schema === 'rus.items.existing_container_ordinary_limits.v1'
    && limits.version === 1
    && Number.isSafeInteger(limits.max_new_entities)
    && limits.max_new_entities >= 1 && limits.max_new_entities <= 8;
}
function result(route, ref) { return deepFreeze({ pass: true, route,
  container_ref: ref, errors: [] }); }
function denied(code) { return deepFreeze({ pass: false, route: 'denied',
  container_ref: null, errors: [{ code, category: 'data_gap', retryable: false,
    message: code, details: {} }] }); }
function text(value) { return typeof value === 'string' && value.trim() === value && value.length > 0; }
function record(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getOwnPropertySymbols(value).length > 0
      || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== keys.length || keys.some((key) => !names.includes(key))) return null;
  const copy = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
    copy[key] = descriptor.value;
  }
  return copy;
}
