import { deepFreeze } from '@rus/kernel';
import { MaterializationError } from './core.js';
import {
  applyOrdinaryAggregateTransition,
  assertAndNormalizeOrdinaryAggregate
} from './ordinary-materialization-foundation.js';

const SCHEMA = 'ordinary_materialization_working_projection_v1';

/**
 * Internal server-only handoff for the next turn working-projection refresh.
 * It deliberately carries no player-facing capability and performs no effects.
 */
export function createOrdinaryMaterializationWorkingProjection(input = {}) {
  const { ordinary_aggregate } = assertExactInput(input, ['ordinary_aggregate'], 'ORDINARY_WORKING_PROJECTION_CREATE_INPUT_INVALID');
  return deepFreeze({
    schema: SCHEMA,
    ordinary_aggregate: assertAndNormalizeOrdinaryAggregate(ordinary_aggregate)
  });
}

/**
 * Applies one ordinary logical transition through the aggregate reducer.
 * Runtime composition will supply the fragment/commit boundary in a later phase.
 */
export function refreshOrdinaryMaterializationWorkingProjection(input = {}) {
  const { working_projection, ordinary_transition } = assertExactInput(input, ['working_projection', 'ordinary_transition'], 'ORDINARY_WORKING_PROJECTION_REFRESH_INPUT_INVALID');
  const current = assertWorkingProjection(working_projection);
  const nextAggregate = applyOrdinaryAggregateTransition({
    aggregate: current.ordinary_aggregate,
    transition: ordinary_transition
  });
  return createOrdinaryMaterializationWorkingProjection({
    ordinary_aggregate: nextAggregate
  });
}

function assertExactInput(value, keys, code) {
  const values = plainDataRecord(value);
  if (!values || Object.keys(values).length !== keys.length
    || keys.some((key) => !Object.hasOwn(values, key))) {
    throw new MaterializationError(code, 'Working projection input must have the exact closed shape.');
  }
  return values;
}

function assertWorkingProjection(value) {
  const fields = plainDataRecord(value);
  if (!fields || Object.keys(fields).length !== 2
    || fields.schema !== SCHEMA
    || !Object.hasOwn(fields, 'ordinary_aggregate')) {
    throw new MaterializationError(
      'ORDINARY_WORKING_PROJECTION_INVALID',
      'Ordinary working projection must have the exact internal shape.'
    );
  }
  assertAndNormalizeOrdinaryAggregate(fields.ordinary_aggregate);
  return fields;
}

function plainDataRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    || Object.getOwnPropertySymbols(value).length !== 0) return null;
  const names = Object.getOwnPropertyNames(value);
  const fields = {};
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
    fields[name] = descriptor.value;
  }
  return fields;
}
