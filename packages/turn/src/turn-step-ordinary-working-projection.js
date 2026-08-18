import { deepFreeze } from '@rus/kernel';
import { assertAndNormalizeOrdinaryAggregate } from '@rus/materialization';
import { turnFailure } from './errors.js';

export function applyOrdinaryAggregateToTurnWorkingProjection(input = {}) {
  const boundary = snapshotJson(input);
  if (!plain(boundary)
      || !exactKeys(boundary, ['working_projection', 'ordinary_aggregate'])
      || !plain(boundary.working_projection)) {
    throw turnFailure('TURN_ORDINARY_WORKING_PROJECTION_INPUT_INVALID',
      'Ordinary working-projection input must have the exact internal shape.');
  }
  const ordinaryAggregate = assertAndNormalizeOrdinaryAggregate(
    boundary.ordinary_aggregate);
  return deepFreeze({
    ...boundary.working_projection,
    ordinary_materialization_aggregate: ordinaryAggregate
  });
}

export function assertAndNormalizeTurnOrdinaryWorkingProjection(value) {
  const boundary = snapshotJson(value);
  if (!plain(boundary)
      || !Object.hasOwn(boundary, 'ordinary_materialization_aggregate')) {
    throw turnFailure('TURN_ORDINARY_WORKING_PROJECTION_INPUT_INVALID',
      'Turn working projection must contain its ordinary aggregate.');
  }
  const ordinaryAggregate = assertAndNormalizeOrdinaryAggregate(
    boundary.ordinary_materialization_aggregate);
  return deepFreeze({
    ...boundary,
    ordinary_materialization_aggregate: ordinaryAggregate
  });
}

function snapshotJson(root) {
  const seen = new Set();
  function visit(value) {
    if (value === null || typeof value === 'string'
        || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (Number.isFinite(value)) return value;
      return invalid();
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return invalid();
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (array ? prototype !== Array.prototype
      : prototype !== Object.prototype && prototype !== null) return invalid();
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key === 'symbol')) return invalid();
    seen.add(value);
    const output = array ? [] : {};
    for (const key of keys) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || descriptor.enumerable !== true
          || !Object.hasOwn(descriptor, 'value')) return invalid();
      output[key] = visit(descriptor.value);
    }
    seen.delete(value);
    return output;
  }
  return visit(root);
}

function invalid() {
  throw turnFailure('TURN_ORDINARY_WORKING_PROJECTION_INPUT_INVALID',
    'Ordinary working-projection input must contain strict JSON data.');
}

function exactKeys(value, keys) {
  return Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function plain(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null);
}
