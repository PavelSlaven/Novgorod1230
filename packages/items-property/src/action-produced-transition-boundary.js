export function snapshotActionProducedBoundary(value) {
  try { return copy(value, new WeakSet()); } catch { return null; }
}

export function exactActionProducedFunctionOption(value, key) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || Object.getOwnPropertySymbols(value).length !== 0
      || Object.getOwnPropertyNames(value).length !== 1) fail();
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor, 'value')
      || typeof descriptor.value !== 'function') fail();
  return descriptor.value;
}

export function frozenActionProducedDataProperty(value, key) {
  const descriptor = value && typeof value === 'object'
    ? Object.getOwnPropertyDescriptor(value, key) : null;
  return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value')
    && deeplyFrozen(descriptor.value, new WeakSet());
}

export function nextActionProducedStateVersion(value) {
  if (!/^[1-9]\d*$/u.test(value)) fail();
  const current = Number(value);
  if (!Number.isSafeInteger(current) || current === Number.MAX_SAFE_INTEGER) {
    fail();
  }
  return String(current + 1);
}

function deeplyFrozen(value, seen) {
  if (value === null || typeof value !== 'object') return true;
  if (seen.has(value) || !Object.isFrozen(value)) return false;
  seen.add(value);
  for (const key of Object.getOwnPropertyNames(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor, 'value')
        || !deeplyFrozen(descriptor.value, seen)) return false;
  }
  return true;
}

function copy(value, seen) {
  if (value === null || typeof value === 'string'
      || typeof value === 'boolean'
      || typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object' || seen.has(value)) fail();
  seen.add(value);
  const array = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (array
    ? Array.prototype : Object.prototype)
      || Object.getOwnPropertySymbols(value).length !== 0) fail();
  const names = Object.getOwnPropertyNames(value);
  const result = array ? [] : {};
  if (array && (names.length !== value.length + 1
    || !names.includes('length'))) fail();
  for (const key of names) {
    if (array && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.enumerable !== true
        || !Object.hasOwn(descriptor, 'value')) fail();
    const copied = copy(descriptor.value, seen);
    if (array) {
      if (key !== String(result.length)) fail();
      result.push(copied);
    } else result[key] = copied;
  }
  return result;
}

function fail() {
  throw Object.assign(new TypeError('ITEM_ACTION_PRODUCED_TRANSITION_INVALID'),
    { code: 'ITEM_ACTION_PRODUCED_TRANSITION_INVALID' });
}
