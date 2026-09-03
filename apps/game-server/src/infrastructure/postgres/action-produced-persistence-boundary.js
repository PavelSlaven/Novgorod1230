export const INVALID_ACTION_PRODUCED_DATA = Symbol('invalid action data');
const OMIT_ACTION_PRODUCED_DATA = Symbol('omit optional action data');

export function snapshotActionProducedPersistenceData(value) {
  const seen = new WeakSet();
  function visit(input, arrayValue = false) {
    if (input === undefined) return arrayValue
      ? INVALID_ACTION_PRODUCED_DATA : OMIT_ACTION_PRODUCED_DATA;
    if (input === null || typeof input === 'string'
        || typeof input === 'boolean') return input;
    if (typeof input === 'number') return Number.isFinite(input)
      ? input : INVALID_ACTION_PRODUCED_DATA;
    if (!input || typeof input !== 'object' || seen.has(input)
        || Object.getOwnPropertySymbols(input).length !== 0) {
      return INVALID_ACTION_PRODUCED_DATA;
    }
    const array = Array.isArray(input);
    if (Object.getPrototypeOf(input)
        !== (array ? Array.prototype : Object.prototype)) {
      return INVALID_ACTION_PRODUCED_DATA;
    }
    const names = Object.getOwnPropertyNames(input);
    if (array && (names.length !== input.length + 1
        || !names.includes('length'))) return INVALID_ACTION_PRODUCED_DATA;
    seen.add(input);
    const output = array ? [] : {};
    for (const key of names) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')
          || (array && key !== String(output.length))) {
        return INVALID_ACTION_PRODUCED_DATA;
      }
      const child = visit(descriptor.value, array);
      if (child === INVALID_ACTION_PRODUCED_DATA) return child;
      if (child === OMIT_ACTION_PRODUCED_DATA) continue;
      if (array) output.push(child); else output[key] = child;
    }
    return output;
  }
  const snapshot = visit(value);
  return snapshot === OMIT_ACTION_PRODUCED_DATA
    ? INVALID_ACTION_PRODUCED_DATA : snapshot;
}

export function deepFreezeActionProducedPersistenceData(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreezeActionProducedPersistenceData(child);
    }
    Object.freeze(value);
  }
  return value;
}

export function exactActionProducedRecord(value, keys) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

export function actionProducedText(value) {
  return typeof value === 'string' && value.length > 0
    && value.trim() === value;
}

export function failActionProducedPersistence(code) {
  throw Object.assign(new TypeError(code), { code });
}
