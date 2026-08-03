import { deepFreeze } from '@rus/kernel';
import { TURN_ALLOWED_WRITE_TARGETS } from './contracts.js';
import { turnFailure } from './errors.js';

export const TURN_STEP_OPERATION_BATCH_TARGET =
  'party_turn_step_operations';

const BATCH_SCHEMA = 'party_turn_step_operation_batch_v1';
const BATCH_KEYS = new Set([
  'version',
  'schema',
  'root_turn_id',
  'committed_state_version',
  'operations'
]);
const NON_PHYSICAL_WRITE_TARGETS = new Set([
  TURN_STEP_OPERATION_BATCH_TARGET,
  'party_narrator_output',
  'party_player_visible_message'
]);

export function validateTurnStepOperationBatch(value) {
  const snapshot = strictJsonSnapshot(value);
  if (snapshot == null) {
    return {
      ok: false,
      errors: ['batch must be one strict acyclic plain JSON object']
    };
  }
  return validateBatchSnapshot(snapshot);
}

function validateBatchSnapshot(value) {
  const errors = [];
  const keys = Reflect.ownKeys(value);
  if (keys.length !== BATCH_KEYS.size
      || keys.some((key) => !BATCH_KEYS.has(key))) {
    errors.push('batch must contain only the exact v1 fields');
  }
  if (value.version !== 1) errors.push('version must be 1');
  if (value.schema !== BATCH_SCHEMA) {
    errors.push(`schema must be ${BATCH_SCHEMA}`);
  }
  if (!validRootTurnId(value.root_turn_id)) {
    errors.push('root_turn_id must be non-empty canonical text');
  }
  if (!validStateVersion(value.committed_state_version)) {
    errors.push('committed_state_version must be a non-negative safe integer');
  }
  if (!Array.isArray(value.operations) || value.operations.length === 0) {
    errors.push('operations must be a non-empty ordered array');
  } else {
    for (let index = 0; index < value.operations.length; index += 1) {
      const operation = Object.getOwnPropertyDescriptor(
        value.operations,
        String(index)
      ).value;
      try {
        validateTurnStepWriteFragment(operation, index);
      } catch (error) {
        errors.push(error.message);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export function requireTurnStepOperationBatch(value) {
  const snapshot = strictJsonSnapshot(value);
  if (snapshot == null) {
    throwInvalidBatch([
      'batch must be one cloneable strict acyclic plain JSON object'
    ]);
  }
  const validation = validateBatchSnapshot(snapshot);
  if (!validation.ok) {
    throwInvalidBatch(validation.errors);
  }
  return deepFreeze(snapshot);
}

export function buildTurnStepOperationBatch(loopResult) {
  const fragments = loopResult?.write_fragments;
  if (!Array.isArray(fragments) || fragments.length === 0) {
    throw invalidWriteFragment(null,
      'Semantic write_fragments must be a non-empty array.');
  }
  return requireTurnStepOperationBatch({
    version: 1,
    schema: BATCH_SCHEMA,
    root_turn_id: loopResult.root_turn_id,
    committed_state_version: loopResult.committed_state_version,
    operations: fragments.map(validateTurnStepWriteFragment)
  });
}

export function validateTurnStepWriteFragment(fragment, index) {
  try {
    const keys = plainJsonObject(fragment) ? Object.keys(fragment) : [];
    const target = fragment?.target;
    const valid = plainJsonObject(fragment)
      && keys.length === 2
      && keys.includes('target')
      && keys.includes('value')
      && typeof target === 'string'
      && target.trim() === target
      && TURN_ALLOWED_WRITE_TARGETS.includes(target)
      && !NON_PHYSICAL_WRITE_TARGETS.has(target)
      && plainJsonObject(fragment.value)
      && isJsonValue(fragment.value, new Set());
    if (!valid) {
      throw invalidWriteFragment(index,
        `Semantic write fragment ${index} must be a physical JSON write.`);
    }
    return structuredClone(fragment);
  } catch (cause) {
    if (cause?.code === 'TURN_STEP_WRITE_FRAGMENT_INVALID') throw cause;
    throw invalidWriteFragment(index,
      `Semantic write fragment ${index} must be a physical JSON write.`);
  }
}

function plainJsonObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return typeof key === 'string'
      && descriptor?.enumerable === true
      && Object.hasOwn(descriptor, 'value');
  });
}

function validRootTurnId(value) {
  return typeof value === 'string'
    && value.trim() === value
    && value.length > 0;
}

function validStateVersion(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isJsonValue(value, ancestors) {
  if (value === null || typeof value === 'string'
      || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? isJsonArray(value, ancestors)
    : plainJsonObject(value)
      && Reflect.ownKeys(value).every((key) => isJsonValue(
        Object.getOwnPropertyDescriptor(value, key).value,
        ancestors
      ));
  ancestors.delete(value);
  return valid;
}

function isJsonArray(value, ancestors) {
  if (Object.getPrototypeOf(value) !== Array.prototype) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || !keys.includes('length')) return false;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor?.enumerable !== true
        || !Object.hasOwn(descriptor, 'value')
        || !isJsonValue(descriptor.value, ancestors)) return false;
  }
  return true;
}

function strictJsonSnapshot(value) {
  try {
    if (!plainJsonObject(value) || !isJsonValue(value, new Set())) return null;
    const snapshot = structuredClone(value);
    return plainJsonObject(snapshot) && isJsonValue(snapshot, new Set())
      ? snapshot
      : null;
  } catch {
    return null;
  }
}

function invalidWriteFragment(index, message) {
  return turnFailure(
    'TURN_STEP_WRITE_FRAGMENT_INVALID',
    message,
    { index }
  );
}

function throwInvalidBatch(errors) {
  throw turnFailure(
    'TURN_STEP_OPERATION_BATCH_INVALID',
    'Turn step operation batch is invalid.',
    { errors }
  );
}
