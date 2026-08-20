import { createHash } from 'node:crypto';

const DIRECT_SCHEMA =
  'rus.lower_dvina_trace_turn_step_direct_operation.v1';
export const ACTIVITY_SCHEMA =
  'rus.lower_dvina_trace_turn_step_semantic_activity.v1';

export function directFragment(identity, target, payload) {
  return {
    target,
    value: {
      version: 1,
      schema: DIRECT_SCHEMA,
      operation_id: identity.operation_id,
      root_turn_id: identity.root_turn_id,
      step_index: identity.step_index,
      operation_kind: identity.operation_kind,
      payload: structuredClone(payload)
    }
  };
}

export function visibleConsequence(identity, value) {
  return {
    visible_seed: { [visibleKey(identity)]: structuredClone(value) },
    state_changes: [{
      operation_id: identity.operation_id,
      operation_kind: identity.operation_kind
    }]
  };
}

export function visibleKey(identity) {
  return `turn_step_${String(
    identity.operation_id ?? identity.activity_id
  ).replaceAll(/[^a-zA-Z0-9_]/gu, '_')}`;
}

export function applied({ projection, summary, fragment, consequence,
  ordinaryPlan = null, boundary = false }) {
  return deepFreeze({
    working_projection: structuredClone(projection),
    summary,
    write_fragments: fragment ? [structuredClone(fragment)] : [],
    consequence_fragment: structuredClone(consequence),
    ...(ordinaryPlan == null ? {} : {
      ordinary_materialization_atomic_write_plan:
        structuredClone(ordinaryPlan)
    }),
    ...(boundary ? { player_response_boundary: true } : {})
  });
}

export function nextOperationIdentity(execution, state) {
  const rootTurnId = requiredText(execution.request?.root_turn_id,
    'TRACE_TURN_STEP_ROOT_TURN_ID_REQUIRED');
  const stepIndex = execution.request?.step_index;
  if (!Number.isInteger(stepIndex) || stepIndex < 1 || stepIndex > 8) {
    fail('TRACE_TURN_STEP_INDEX_INVALID');
  }
  const operationKind = requiredText(execution.operation?.op,
    'TRACE_TURN_STEP_OPERATION_KIND_REQUIRED');
  const counterKey = `${rootTurnId}:${stepIndex}:${operationKind}`;
  const ordinal = (state.operationOrdinals.get(counterKey) ?? 0) + 1;
  state.operationOrdinals.set(counterKey, ordinal);
  return {
    root_turn_id: rootTurnId,
    step_index: stepIndex,
    operation_kind: operationKind,
    operation_id: deterministicRef('turn-step-operation', {
      root_turn_id: rootTurnId,
      step_index: stepIndex,
      operation_kind: operationKind,
      ordinal
    })
  };
}

export function nextActivityIdentity(execution, state) {
  const rootTurnId = requiredText(execution.request?.root_turn_id,
    'TRACE_TURN_STEP_ROOT_TURN_ID_REQUIRED');
  const stepIndex = execution.request?.step_index;
  if (!Number.isInteger(stepIndex) || stepIndex < 1 || stepIndex > 8) {
    fail('TRACE_TURN_STEP_INDEX_INVALID');
  }
  const key = `${rootTurnId}:${stepIndex}`;
  const ordinal = (state.activityOrdinals.get(key) ?? 0) + 1;
  state.activityOrdinals.set(key, ordinal);
  return {
    root_turn_id: rootTurnId,
    step_index: stepIndex,
    activity_id: deterministicRef('turn-step-activity', {
      root_turn_id: rootTurnId,
      step_index: stepIndex,
      ordinal
    })
  };
}

export function collectCurrentRefs(execution) {
  const refs = new Set();
  collectRefs(execution.working_projection, refs);
  collectRefs(execution.request?.actor, refs);
  for (const map of [
    execution.request?.actor?.attributes,
    execution.request?.actor?.skills,
    execution.request?.actor?.body?.body_parts
  ]) {
    if (plain(map)) Object.keys(map).forEach((key) => refs.add(key));
  }
  return refs;
}

function collectRefs(value, refs, key = '') {
  if (typeof value === 'string'
      && /(?:^ref$|_ref$|_refs$|^id$|_id$|_ids$)/u.test(key)
      && value.trim()) {
    refs.add(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectRefs(entry, refs, key));
    return;
  }
  if (plain(value)) {
    Object.entries(value).forEach(([nestedKey, nested]) =>
      collectRefs(nested, refs, nestedKey));
  }
}

export function requireProjection(value) {
  if (!plain(value) || !text(value.actor_id)) {
    fail('TRACE_TURN_STEP_WORKING_PROJECTION_INVALID');
  }
}

export function requireRef(value, refs, field) {
  if (!text(value) || !refs.has(value)) {
    fail('TRACE_TURN_STEP_REF_NOT_CURRENT', {
      field,
      ref: text(value) || null
    });
  }
}

export function requireRefs(values, refs, field) {
  values.forEach((value) => requireRef(value, refs, field));
}

export function requireAbsentRef(value, refs) {
  if (!text(value) || refs.has(value)) {
    fail('TRACE_TURN_STEP_TEMP_REF_INVALID', { ref: text(value) || null });
  }
}

export function deterministicRef(prefix, value) {
  return `${prefix}:${sha256(value).slice(0, 32)}`;
}

function sha256(value) {
  const input = typeof value === 'string' ? value : stableStringify(value);
  return createHash('sha256').update(input).digest('hex');
}

function stableStringify(value) {
  return JSON.stringify(normalize(value));
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort()
      .map((key) => [key, normalize(value[key])]));
  }
  return value;
}

export function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

export function requiredText(value, code) {
  const normalized = text(value);
  if (!normalized) fail(code);
  return normalized;
}

export function text(value) {
  return typeof value === 'string' && value.trim() === value && value
    ? value
    : '';
}

export function plain(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function fail(code, details = {}) {
  throw Object.assign(new Error(code), {
    code,
    details: deepFreeze(structuredClone(details))
  });
}
