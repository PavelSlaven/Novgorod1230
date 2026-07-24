import { deepFreeze } from '@rus/kernel';
import { validateSpatialV3Contract } from '@rus/contracts/spatial-v3/registry';
import {
  addElapsedTime,
  compareGameTimestamp,
  compareRationalMinutes,
  computeTemporalDigest,
  normalizeElapsedTime,
  normalizeGameTimestamp,
  normalizeRationalMinutes,
  subtractGameTimestamp
} from '@rus/time-events-history';

const PROCESS_KINDS = Object.freeze(['rumor', 'order', 'alarm', 'pursuit', 'fire', 'shortage', 'weather_front', 'historical_pressure']);
const stable = (value) => typeof value === 'string' && value.trim() === value && value.length > 0;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = (value) => structuredClone(value);
const freeze = (value) => deepFreeze(clone(value));
const equal = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : object(value)
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const refKey = (ref) => `${ref.entity_kind}\u0000${ref.entity_id}`;
const exactKeys = (value, allowed) => object(value) && Object.keys(value).every((key) => allowed.includes(key));
const textOrder = (a, b) => String(a).localeCompare(String(b), 'en');
const valid = (name, value) => validateSpatialV3Contract(name, value).length === 0;
const positive = (rational) => BigInt(normalizeRationalMinutes(rational).numerator) > 0n;
const sameVersionedRef = (left, right) => equal(left, right);

function sealed(value) {
  if (!object(value) || !stable(value.canonical_digest)) return false;
  const { canonical_digest, ...payload } = value;
  return canonical_digest === computeTemporalDigest(payload);
}

function pinSetContains(pinSet, reference) {
  return pinSet.pins.some((pin) => equal(pin.entity_ref, reference.entity_ref)
    && pin.version_pin.pin_kind === 'authoring_version'
    && pin.version_pin.authoring_version === reference.authoring_version);
}

function pinSetIncludes(pinSet, requiredPinSet) {
  return requiredPinSet.pins.every((required) => pinSet.pins.some((candidate) => equal(candidate, required)));
}

function pinSetContainsEntity(pinSet, entityRef) {
  return pinSet.pins.some((pin) => equal(pin.entity_ref, entityRef));
}

function containsRef(values, expected) {
  return values.some((value) => sameVersionedRef(value, expected));
}

function digestAggregate(aggregate) {
  const { canonical_digest, ...withoutDigest } = aggregate;
  return computeTemporalDigest(withoutDigest);
}

function formalFailure(aggregate, code, diagnostics) {
  const state = freeze(aggregate);
  const result = freeze({
    status: 'blocked',
    clock_before: state.last_updated_at,
    clock_after: state.last_updated_at,
    aggregate_state: state,
    proposed_change_set: { factual: [], player_visible: [], activation_handoff: null },
    trace: { blocked: true, typed_error_code: code, diagnostics: canonical(diagnostics) },
    applied_process_refs: [],
    deferred_work_refs: []
  });
  if (!valid('remote_catch_up_result', result)) throw new TypeError('Cannot represent blocked result as remote_catch_up_result');
  return result;
}

function normalizeConfiguration(configuration) {
  if (!object(configuration) || !Array.isArray(configuration.approved_process_profiles) || !object(configuration.safety_limits)
    || !Number.isSafeInteger(configuration.safety_limits.max_processes) || configuration.safety_limits.max_processes < 1
    || !Number.isSafeInteger(configuration.safety_limits.max_boundaries) || configuration.safety_limits.max_boundaries < 1) {
    throw new TypeError('World-process engine requires explicit numeric safety limits and sealed approved process profiles.');
  }
  const profiles = new Map();
  for (const profile of configuration.approved_process_profiles) {
    if (!exactKeys(profile, [
      'process_kind',
      'status',
      'profile_ref',
      'effect_ref',
      'visibility_policy_ref',
      'termination_policy_ref',
      'coarse_interval',
      'max_lifetime',
      'termination_policy',
      'player_visible',
      'provenance_ref',
      'applicable_scope_modes',
      'applicable_scope_refs',
      'dependency_pins',
      'canonical_digest'
    ]) || !PROCESS_KINDS.includes(profile.process_kind) || profile.status !== 'approved_sealed'
      || !valid('versioned_ref', profile.profile_ref) || !valid('versioned_ref', profile.effect_ref)
      || !valid('versioned_ref', profile.visibility_policy_ref) || !valid('versioned_ref', profile.termination_policy_ref)
      || !valid('entity_ref', profile.provenance_ref)
      || !valid('dependency_pin_set', profile.dependency_pins)
      || !sealed(profile)
      || !Array.isArray(profile.applicable_scope_modes) || profile.applicable_scope_modes.length === 0
      || !profile.applicable_scope_modes.every((value) => stable(value))
      || new Set(profile.applicable_scope_modes).size !== profile.applicable_scope_modes.length
      || !Array.isArray(profile.applicable_scope_refs) || profile.applicable_scope_refs.length === 0
      || !profile.applicable_scope_refs.every((value) => valid('entity_ref', value))
      || new Set(profile.applicable_scope_refs.map(refKey)).size !== profile.applicable_scope_refs.length
      || ![profile.profile_ref, profile.effect_ref, profile.visibility_policy_ref, profile.termination_policy_ref]
        .every((reference) => pinSetContains(profile.dependency_pins, reference))
      || !positive(profile.coarse_interval) || !positive(profile.max_lifetime)
      || profile.termination_policy !== 'terminate_at_max_lifetime' || profiles.has(profile.process_kind)) {
      throw new TypeError('Every sealed process profile needs provenance, applicable scope, fully pinned versioned refs, and exact finite limits.');
    }
    profiles.set(profile.process_kind, freeze({ ...profile, coarse_interval: normalizeRationalMinutes(profile.coarse_interval), max_lifetime: normalizeRationalMinutes(profile.max_lifetime) }));
  }
  if (profiles.size !== PROCESS_KINDS.length) throw new TypeError('Exactly one approved sealed profile is required for each propagation process kind.');
  return freeze({ profiles: Object.fromEntries(profiles), safety_limits: configuration.safety_limits });
}

function assertFormalRequest(request) {
  if (!valid('remote_catch_up_request', request)) throw new TypeError('World-process runtime accepts exactly remote_catch_up_request.');
  if (!valid('remote_aggregate_state', request.aggregate_state)) throw new TypeError('remote_catch_up_request aggregate_state must be formal remote_aggregate_state.');
  for (const process of [...request.aggregate_state.aggregate_process_refs, ...request.incoming_process_refs]) {
    if (!valid('propagation_process_ref', process)) throw new TypeError('Every process input must be formal propagation_process_ref.');
  }
}

function compatibleProcess(process, aggregate, request, profile) {
  if (!equal(process.scope_ref, aggregate.scope_ref) || !equal(process.rule_pins, request.rule_pins)
    || !pinSetIncludes(request.rule_pins, profile.dependency_pins)
    || (process.path_ref != null && !pinSetContainsEntity(request.rule_pins, process.path_ref))
    || !profile.applicable_scope_modes.includes(aggregate.scope_mode)
    || !profile.applicable_scope_refs.some((scopeRef) => equal(scopeRef, aggregate.scope_ref))
    || !containsRef(aggregate.coarse_rule_versions, profile.profile_ref)
    || !equal(process.visibility_policy_ref, profile.visibility_policy_ref)
    || !equal(process.termination_policy_ref, profile.termination_policy_ref)
    || !stable(process.idempotency_key) || !['pending', 'active', 'completed', 'terminated'].includes(process.status)) return false;
  return true;
}

function mergeProcesses(request, profiles, limits) {
  const byRef = new Map();
  const byKey = new Map();
  for (const raw of [...request.aggregate_state.aggregate_process_refs, ...request.incoming_process_refs]) {
    const process = freeze(raw);
    const profile = profiles[process.process_kind];
    if (!profile || !compatibleProcess(process, request.aggregate_state, request, profile)) return { code: 'propagation_rule_gap', diagnostics: { process_ref: process.process_ref } };
    const key = refKey(process.process_ref);
    const existingRef = byRef.get(key);
    const existingIdempotency = byKey.get(process.idempotency_key);
    if ((existingRef && !equal(existingRef, process)) || (existingIdempotency && refKey(existingIdempotency.process_ref) !== key)) {
      return { code: 'propagation_rule_gap', diagnostics: { process_ref: process.process_ref, idempotency_key: process.idempotency_key } };
    }
    byRef.set(key, process);
    byKey.set(process.idempotency_key, process);
  }
  if (byRef.size > limits.max_processes) return { code: 'remote_catch_up_rule_gap', diagnostics: { limit: 'max_processes' } };
  return { processes: [...byRef.values()].sort((a, b) => textOrder(refKey(a.process_ref), refKey(b.process_ref))) };
}

function nextBoundaryAfter(startedAt, interval, after, limit) {
  let boundary = normalizeGameTimestamp(startedAt);
  for (let count = 0; count <= limit; count += 1) {
    boundary = addElapsedTime(boundary, { exact_minutes: interval });
    if (compareGameTimestamp(boundary, after) > 0) return boundary;
  }
  return null;
}

function processToActivation(process, profile, from, activation, maxBoundaries) {
  if (process.status === 'completed' || process.status === 'terminated') {
    return process.next_boundary_at == null
      ? { process, factual: [] }
      : { code: 'propagation_rule_gap', diagnostics: { process_ref: process.process_ref, reason: 'terminal_process_has_boundary' } };
  }
  const terminatesAt = addElapsedTime(process.started_at, { exact_minutes: profile.max_lifetime });
  const startToFrom = compareGameTimestamp(process.started_at, from);
  const startToActivation = compareGameTimestamp(process.started_at, activation);
  if (process.status === 'pending' && startToActivation > 0) {
    return {
      process: freeze({ ...process, status: 'pending', next_boundary_at: normalizeGameTimestamp(process.started_at) }),
      factual: []
    };
  }
  if ((process.status === 'pending' && startToFrom < 0)
    || (process.status === 'active' && startToFrom > 0)
    || compareGameTimestamp(terminatesAt, from) <= 0) {
    return { code: 'propagation_rule_gap', diagnostics: { process_ref: process.process_ref, reason: 'persisted_process_lifecycle_invalid' } };
  }
  let boundary = nextBoundaryAfter(process.started_at, profile.coarse_interval, from, maxBoundaries);
  if (!boundary) return { code: 'remote_catch_up_rule_gap', diagnostics: { process_ref: process.process_ref } };
  const factual = [];
  while (compareGameTimestamp(boundary, terminatesAt) < 0 && compareGameTimestamp(boundary, activation) <= 0) {
    factual.push({ kind: 'process_boundary', process_ref: process.process_ref, process_kind: process.process_kind, occurred_at: boundary, effect_ref: profile.effect_ref, causal_basis_ref: process.causal_basis_ref });
    if (factual.length > maxBoundaries) return { code: 'remote_catch_up_rule_gap', diagnostics: { process_ref: process.process_ref } };
    boundary = addElapsedTime(boundary, { exact_minutes: profile.coarse_interval });
  }
  if (compareGameTimestamp(terminatesAt, from) > 0 && compareGameTimestamp(terminatesAt, activation) <= 0) {
    factual.push({ kind: 'process_terminated', process_ref: process.process_ref, process_kind: process.process_kind, occurred_at: terminatesAt, effect_ref: profile.effect_ref, causal_basis_ref: process.causal_basis_ref });
    const { next_boundary_at, ...terminated } = process;
    return { process: freeze({ ...terminated, status: 'terminated' }), factual };
  }
  const next = compareGameTimestamp(boundary, terminatesAt) < 0 ? boundary : undefined;
  return { process: freeze({ ...process, status: 'active', ...(next ? { next_boundary_at: next } : {}) }), factual };
}

export function createWorldProcessEngine(configuration) {
  const engine = normalizeConfiguration(configuration);
  return Object.freeze({
    catchUp(request) {
      assertFormalRequest(request);
      const input = clone(request);
      const aggregate = input.aggregate_state;
      try {
        const activation = normalizeGameTimestamp(input.activation_timestamp);
        const elapsed = normalizeElapsedTime(input.exact_elapsed);
        if (compareGameTimestamp(activation, aggregate.last_updated_at) < 0 || compareRationalMinutes(elapsed.exact_minutes, subtractGameTimestamp(activation, aggregate.last_updated_at)) !== 0) {
          return formalFailure(aggregate, 'time_window_invalid', {});
        }
        if (aggregate.canonical_digest !== digestAggregate(aggregate)) return formalFailure(aggregate, 'remote_catch_up_rule_gap', { reason: 'aggregate_digest_mismatch' });
        const merged = mergeProcesses(input, engine.profiles, engine.safety_limits);
        if (merged.code) return formalFailure(aggregate, merged.code, merged.diagnostics);
        const factual = [];
        const processes = [];
        for (const process of merged.processes) {
          const updated = processToActivation(process, engine.profiles[process.process_kind], aggregate.last_updated_at, activation, engine.safety_limits.max_boundaries);
          if (updated.code) return formalFailure(aggregate, updated.code, updated.diagnostics);
          factual.push(...updated.factual);
          processes.push(updated.process);
        }
        if (factual.length > engine.safety_limits.max_boundaries) return formalFailure(aggregate, 'remote_catch_up_rule_gap', { limit: 'max_boundaries' });
        factual.sort((a, b) => compareGameTimestamp(a.occurred_at, b.occurred_at) || textOrder(refKey(a.process_ref), refKey(b.process_ref)) || textOrder(a.kind, b.kind));
        const playerVisible = factual.filter((entry) => engine.profiles[entry.process_kind].player_visible === true).map((entry) => ({ ...entry, visibility_policy_ref: engine.profiles[entry.process_kind].visibility_policy_ref }));
        const nextBoundary = processes.filter((process) => process.next_boundary_at).map((process) => process.next_boundary_at)
          .sort(compareGameTimestamp)[0];
        const base = { ...aggregate, last_updated_at: activation, aggregate_process_refs: processes, ...(nextBoundary ? { next_boundary_at: nextBoundary } : {}) };
        if (!nextBoundary) delete base.next_boundary_at;
        const changed = !equal({ ...aggregate, canonical_digest: undefined }, { ...base, canonical_digest: undefined });
        const nextAggregate = changed ? { ...base, state_version: (BigInt(aggregate.state_version) + 1n).toString() } : aggregate;
        const materialized = { ...nextAggregate };
        materialized.canonical_digest = digestAggregate(materialized);
        const result = freeze({
          status: 'completed', clock_before: aggregate.last_updated_at, clock_after: activation, aggregate_state: materialized,
          proposed_change_set: {
            factual,
            player_visible: playerVisible,
            activation_handoff: { aggregate_ref: { entity_kind: 'remote_aggregate_state', entity_id: aggregate.aggregate_id }, activation_timestamp: activation, after_exact_catch_up: true }
          },
          trace: { blocked: false, processed_boundary_count: factual.length, request_idempotency_key: input.idempotency_key },
          applied_process_refs: processes,
          deferred_work_refs: []
        });
        if (!valid('remote_catch_up_result', result)) throw new TypeError('World-process runtime produced a non-formal remote_catch_up_result.');
        return result;
      } catch (error) {
        if (error instanceof TypeError) throw error;
        return formalFailure(aggregate, 'remote_catch_up_rule_gap', { reason: 'unresolved_exact_temporal_data' });
      }
    }
  });
}
