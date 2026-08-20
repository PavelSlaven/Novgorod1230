import { deepFreeze } from '@rus/kernel';
import { turnFailure } from './errors.js';
import {
  validateTurnStepWriteFragment
} from './turn-step-operation-batch.js';

const GOAL_RESULTS = new Set([
  'pending', 'achieved', 'partially_achieved', 'not_achieved'
]);

export function collectTurnStepExecutionResult({
  applied,
  projection,
  boundary,
  progress,
  goalResult,
  continuation,
  summaries,
  writes,
  consequences,
  preparedEffects,
  ordinaryPlans,
  actionProducedPlans
}) {
  if (!plain(applied) || !plain(applied.working_projection)) {
    throw turnFailure('TURN_STEP_EXECUTION_RESULT_INVALID',
      'Step handler must return a working_projection object.');
  }
  if (applied.summary != null && typeof applied.summary !== 'string') {
    throw turnFailure('TURN_STEP_EXECUTION_RESULT_INVALID',
      'Step handler summary must be text.');
  }
  if (applied.goal_result != null && !GOAL_RESULTS.has(applied.goal_result)) {
    throw turnFailure('TURN_STEP_EXECUTION_RESULT_INVALID',
      'Step handler returned an invalid goal_result.');
  }
  if (applied.continuation !== undefined
      && applied.continuation !== null
      && (!plain(applied.continuation)
        || typeof applied.continuation.remaining_intent !== 'string'
        || !Array.isArray(applied.continuation.depends_on_refs))) {
    throw turnFailure('TURN_STEP_EXECUTION_RESULT_INVALID',
      'Step handler returned an invalid continuation.');
  }
  summaries.push(String(applied.summary ?? '').trim());
  writes.push(...writeFragments(applied.write_fragments));
  if (applied.consequence_fragment != null) {
    consequences.push(structuredClone(applied.consequence_fragment));
  }
  if (applied.prepared_effect != null) {
    if (!Array.isArray(preparedEffects)) {
      throw turnFailure('TURN_STEP_EXECUTION_RESULT_INVALID',
        'Prepared effect collection is unavailable.');
    }
    preparedEffects.push({
      effect: structuredClone(applied.prepared_effect),
      working_projection_before: structuredClone(projection),
      working_projection_after:
        structuredClone(applied.working_projection)
    });
  }
  if (applied.ordinary_materialization_atomic_write_plan != null) {
    if (!Array.isArray(ordinaryPlans) || ordinaryPlans.length !== 0) {
      throw turnFailure('TURN_STEP_EXECUTION_RESULT_INVALID',
        'A turn step can carry at most one ordinary atomic plan.');
    }
    ordinaryPlans.push(structuredClone(
      applied.ordinary_materialization_atomic_write_plan));
  }
  if (applied.action_production_atomic_write_plan != null) {
    if (!Array.isArray(actionProducedPlans)
        || actionProducedPlans.length !== 0) {
      throw turnFailure('TURN_STEP_EXECUTION_RESULT_INVALID',
        'A turn step can carry at most one action-production atomic plan.');
    }
    actionProducedPlans.push(structuredClone(
      applied.action_production_atomic_write_plan));
  }
  return {
    projection: structuredClone(applied.working_projection),
    boundary: boundary
      || applied.player_response_boundary === true
      || applied.visible_change_boundary === true
      || applied.interrupted === true,
    progress: progress && applied.progress !== false,
    goalResult: applied.goal_result ?? goalResult,
    continuation: applied.continuation === undefined
      ? continuation
      : structuredClone(applied.continuation)
  };
}

export function createTurnStepExecutionInput({
  plan,
  request,
  operation,
  projection,
  checkResult,
  preparedChainContext,
  preparedOrdinaryPlan = null
}) {
  return deepFreeze({
    plan: structuredClone(plan),
    request: structuredClone(request),
    operation: structuredClone(operation),
    working_projection: structuredClone(projection),
    check_result: checkResult == null ? null : structuredClone(checkResult),
    prepared_chain_context: preparedChainContext == null ? null
      : structuredClone(preparedChainContext),
    prepared_ordinary_materialization_atomic_write_plan:
      preparedOrdinaryPlan == null ? null
        : structuredClone(preparedOrdinaryPlan)
  });
}

function writeFragments(value) {
  if (value == null) return [];
  const rawFragments = strictDenseArrayValues(value);
  if (rawFragments == null) {
    throw turnFailure('TURN_STEP_EXECUTION_RESULT_INVALID',
      'write_fragments must be one strict dense JSON array.');
  }
  try {
    structuredClone(value);
  } catch {
    throw turnFailure('TURN_STEP_EXECUTION_RESULT_INVALID',
      'write_fragments must be cloneable JSON data.');
  }
  const fragments = [];
  for (let index = 0; index < rawFragments.length; index += 1) {
    fragments.push(validateTurnStepWriteFragment(rawFragments[index], index));
  }
  return fragments;
}

function strictDenseArrayValues(value) {
  if (!Array.isArray(value)
      || Object.getPrototypeOf(value) !== Array.prototype) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || !keys.includes('length')) {
    return null;
  }
  const values = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor?.enumerable !== true
        || !Object.hasOwn(descriptor, 'value')) return null;
    values.push(descriptor.value);
  }
  return values;
}

function plain(value) {
  return Boolean(value) && typeof value === 'object'
    && !Array.isArray(value);
}
