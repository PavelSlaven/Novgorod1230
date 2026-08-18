import { canonicalDigest } from '@rus/materialization';
import {
  createOrdinaryWorldRuntimeInstanceMechanicsSnapshot,
  createRuntimeInstanceMechanicsSnapshot
} from '@rus/items-property';
import { serverError } from '../../errors.js';

export function attachTurnStepCommit({ snapshot, envelope, idemId }) {
  if (envelope == null) return snapshot;
  const next = structuredClone(snapshot);
  next.last_turn = {
    ...(next.last_turn ?? {}),
    turn_step_commit: structuredClone(envelope),
    turn_step_idempotency_record_id: idemId
  };
  return next;
}

export function emptyTurnStepPersistence(snapshot) {
  return {
    batch: null,
    snapshot,
    writes: { inserts: [], updates: [], appends: [], deletes: [] },
    physicalKeys: [],
    semanticDuration: 0
  };
}

export function mergeLowerDvinaTraceTurnStepWrites(base, extra) {
  return Object.fromEntries(['inserts', 'updates', 'appends', 'deletes']
    .map((mode) => [mode, [
      ...(base?.[mode] ?? []), ...(extra?.[mode] ?? [])
    ]]));
}

export function requireMechanics(value) {
  try {
    return structuredClone(createRuntimeInstanceMechanicsSnapshot(value));
  } catch (cause) {
    fail('TRACE_TURN_STEP_RUNTIME_MECHANICS_INVALID', {
      cause: cause?.code ?? cause?.message
    });
  }
}

export function requireCommittedMechanics(value) {
  try {
    return structuredClone(value?.schema ===
      'rus.items.runtime_instance_mechanics_snapshot.v2'
      ? createOrdinaryWorldRuntimeInstanceMechanicsSnapshot(value)
      : createRuntimeInstanceMechanicsSnapshot(value));
  } catch (cause) {
    fail('TRACE_TURN_STEP_RUNTIME_MECHANICS_INVALID', {
      cause: cause?.code ?? cause?.message
    });
  }
}

export function exact(value, fields, index = null) {
  if (!exactShape(value, fields)) {
    invalid(index, `exact fields: ${fields.join(',')}`);
  }
}

export function exactShape(value, fields) {
  return plain(value)
    && Object.keys(value).length === fields.length
    && fields.every((field) => Object.hasOwn(value, field));
}

export function uniqueTexts(value) {
  return Array.isArray(value) && value.every(text)
    && new Set(value).size === value.length;
}

export function step(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= 8;
}

export function text(value) {
  return typeof value === 'string' && value.length > 0
    && value === value.trim();
}

export function plain(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

export function invalid(index, reason) {
  fail('TRACE_TURN_STEP_OPERATION_SCHEMA_UNKNOWN', { index, reason });
}

export function fail(code, details = {}) {
  throw serverError(code,
    'Turn-step operation batch cannot be committed safely.', {
      status: 409,
      details: {
        ...structuredClone(details),
        persistence_digest: canonicalDigest({ code, details })
      }
    });
}
