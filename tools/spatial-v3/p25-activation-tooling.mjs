import { createHash } from 'node:crypto';

const PROFILES = new Set(['production_v2', 'shadow_v3']);
const OBSERVATION_KEYS = Object.freeze(['endpoints', 'time', 'visibility', 'errors', 'migration_classifications']);
const forbiddenShadowKeys = new Set(['write_plan', 'writePlan', 'commit', 'commit_result', 'target_write', 'targetWrite', 'sql']);
const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
const freeze = (value) => Object.freeze(value);
const issue = (code, subject_ref, details = {}) => freeze({ code, subject_ref, ...canonical(details) });
const text = (value) => typeof value === 'string' && value.trim().length > 0;

/**
 * P25 composition profiles are deliberately narrower than P28 activation.
 * A target v3 request can only observe shadow data; it cannot become a
 * production writer before the separately authorised atomic activation phase.
 */
/**
 * Resolve a request owner from the immutable composition input.  The caller
 * supplies the complete request-profile set for the composition pass; this
 * function deliberately keeps no process-global registry.  Therefore a
 * production request and a shadow request can never silently claim the same
 * `(party_id, request_id)` within that input.
 */
export function bindSpatialV3RequestProfile({ party_id, request_id, profile, request_profiles } = {}) {
  const errors = [];
  if (!Array.isArray(request_profiles)) return freeze({ ok: false, errors: freeze([issue('composition_profile_bindings_required', `${party_id ?? 'unknown'}:${request_id ?? 'unknown'}`)]) });
  const normalized = request_profiles.map((entry) => ({ party_id: entry?.party_id, request_id: entry?.request_id, profile: entry?.profile }));
  const bindings = normalized.filter((entry) => entry.party_id === party_id && entry.request_id === request_id);
  if (bindings.length === 0) errors.push(issue('composition_profile_binding_missing', `${party_id ?? 'unknown'}:${request_id ?? 'unknown'}`));
  if (bindings.length > 1) errors.push(issue('composition_profile_binding_conflict', `${party_id ?? 'unknown'}:${request_id ?? 'unknown'}`, { profiles: bindings.map((entry) => entry.profile).sort() }));
  if (bindings.length === 1 && bindings[0].profile !== profile) errors.push(issue('composition_profile_binding_mismatch', `${party_id ?? 'unknown'}:${request_id ?? 'unknown'}`, { bound_profile: bindings[0].profile, requested_profile: profile }));
  if (errors.length) return freeze({ ok: false, errors: freeze(errors) });
  return freeze({ ok: true, binding: freeze({ party_id, request_id, profile }) });
}

export function createSpatialV3CompositionProfile({ party_id, request_id, profile, request_profiles, reader_schema_version, writer_schema_version, target_state_writes = false } = {}) {
  const errors = [];
  if (!text(party_id)) errors.push(issue('composition_identity_invalid', 'party_id'));
  if (!text(request_id)) errors.push(issue('composition_identity_invalid', 'request_id'));
  if (!PROFILES.has(profile)) errors.push(issue('composition_profile_invalid', String(profile)));
  const binding = bindSpatialV3RequestProfile({ party_id, request_id, profile, request_profiles });
  if (!binding.ok) errors.push(...binding.errors);
  const expectedVersion = profile === 'production_v2' ? 2 : 3;
  if (reader_schema_version !== expectedVersion || writer_schema_version !== expectedVersion) errors.push(issue('composition_schema_owner_mismatch', `${party_id ?? 'unknown'}:${request_id ?? 'unknown'}`));
  if (profile === 'shadow_v3' && target_state_writes) errors.push(issue('dual_writer_forbidden', `${party_id ?? 'unknown'}:${request_id ?? 'unknown'}`));
  if (errors.length) return freeze({ ok: false, errors: freeze(errors) });
  return freeze({
    ok: true,
    party_id,
    request_id,
    profile,
    runtime_owner: profile === 'production_v2' ? 'materialization_v2' : 'spatial_v3_shadow',
    reader_schema_version,
    writer_schema_version,
    target_state_writes: false,
    production_default: 'production_v2',
    activation_permitted: false
  });
}

/** A deterministic, no-write comparison of the approved P25 structural surface. */
export function runSpatialV3StructuralShadow({ legacy, target, expected_divergences = [] } = {}) {
  const errors = [];
  if (containsForbiddenShadowWrite(legacy) || containsForbiddenShadowWrite(target)) errors.push(issue('shadow_write_forbidden', 'shadow_observation'));
  const legacySurface = structuralSurface(legacy, errors, 'legacy');
  const targetSurface = structuralSurface(target, errors, 'target');
  const registered = new Map();
  const registeredPaths = new Set();
  for (const entry of expected_divergences) {
    const validValues = Object.hasOwn(entry ?? {}, 'legacy') && Object.hasOwn(entry ?? {}, 'target');
    if (!text(entry?.id) || !text(entry?.path) || !text(entry?.reason) || !validValues) errors.push(issue('shadow_divergence_registry_invalid', entry?.id ?? 'unknown'));
    else if (registered.has(entry.id) || registeredPaths.has(entry.path)) errors.push(issue('shadow_divergence_registry_duplicate', entry.id, { path: entry.path }));
    else { registered.set(entry.id, entry); registeredPaths.add(entry.path); }
  }
  if (errors.length) return freeze({ ok: false, errors: freeze(errors), writes: freeze([]) });
  const differences = compare(legacySurface, targetSurface);
  const consumed = new Set();
  const classified = differences.map((difference) => {
    const match = [...registered.values()].find((entry) => entry.path === difference.path && same(entry.legacy, difference.legacy) && same(entry.target, difference.target));
    if (match) consumed.add(match.id);
    return freeze({ ...difference, classification: match ? 'registered_intentional' : 'unregistered', divergence_id: match?.id ?? null });
  });
  for (const entry of registered.values()) if (!consumed.has(entry.id)) errors.push(issue('shadow_divergence_registry_unconsumed', entry.id, { path: entry.path }));
  const report = {
    schema: 'rus.spatial_v3_shadow_report.v1',
    legacy_surface_digest: digest(legacySurface),
    target_surface_digest: digest(targetSurface),
    expected_divergence_digest: digest([...registered.values()]),
    differences: freeze(classified),
    parity: errors.length === 0 && classified.filter((entry) => entry.classification === 'unregistered').length === 0,
    target_state_writes: 0
  };
  return freeze({ ok: report.parity, ...(errors.length ? { errors: freeze(errors) } : {}), report: freeze({ ...report, digest: digest(report) }), writes: freeze([]) });
}

/**
 * Rehearsal-only state machine for P28.  It deliberately has no production
 * profile and calls no writer until every gate has passed.  Callers provide
 * isolated target DB handlers; production writes are rejected by contract.
 */
export async function runSpatialV3CutoverRehearsal({ mode, shadow_report, migration, startup_probes = [], smoke_tests = [], switch_target_schema, abort, write_target = null } = {}) {
  const events = [];
  const fail = async (code, subject_ref, details = {}) => {
    const error = issue(code, subject_ref, details);
    events.push(freeze({ step: 'abort', status: 'completed', error }));
    if (typeof abort === 'function') await abort(error);
    return freeze({ ok: false, error, events: freeze(events), production_writes: 0 });
  };
  if (mode !== 'target_rehearsal') return fail('cutover_mode_forbidden', String(mode ?? 'unknown'));
  if (shadow_report?.schema !== 'rus.spatial_v3_shadow_report.v1' || shadow_report?.parity !== true || shadow_report?.target_state_writes !== 0) return fail('cutover_shadow_gate_failed', 'shadow_report');
  if (migration?.ok !== true || migration?.target_only !== true || migration?.rollback_validated !== true) return fail('cutover_migration_gate_failed', 'migration');
  events.push(freeze({ step: 'preconditions', status: 'passed' }));
  for (const probe of startup_probes) {
    const result = await runGate(probe, 'startup_probe');
    events.push(result);
    if (result.status !== 'passed') return fail('cutover_startup_probe_failed', result.id);
  }
  if (typeof switch_target_schema !== 'function') return fail('cutover_switch_handler_missing', 'switch_target_schema');
  const switchResult = await switch_target_schema({ target_only: true, next_schema_version: 3 });
  if (switchResult?.ok !== true || switchResult?.production === true) return fail('cutover_schema_switch_failed', 'target_schema');
  events.push(freeze({ step: 'target_schema_switch', status: 'passed' }));
  for (const smoke of smoke_tests) {
    const result = await runGate(smoke, 'smoke_test');
    events.push(result);
    if (result.status !== 'passed') return fail('cutover_smoke_test_failed', result.id);
  }
  // P25 never invokes a production writer. An injected target writer is only
  // allowed to prove the isolated rehearsal transaction after all gates pass.
  if (write_target) {
    const result = await write_target({ target_only: true });
    if (result?.ok !== true || result?.production === true) return fail('cutover_target_rehearsal_write_failed', 'write_target');
    events.push(freeze({ step: 'target_rehearsal_write', status: 'passed' }));
  }
  return freeze({ ok: true, events: freeze(events), production_writes: 0, next_profile: 'production_v2', activation_permitted: false });
}

/** Explicit rollback boundary: no implicit reinterpretation of v3 state as v2. */
export async function runSpatialV3RollbackDrill({ first_v3_only_mutation, snapshot, mutate = null, restore_snapshot, reverse_migration = null } = {}) {
  if (typeof snapshot !== 'function') return freeze({ ok: false, error: issue('rollback_snapshot_missing', 'snapshot') });
  const captured = await snapshot();
  if (!first_v3_only_mutation) return freeze({ ok: true, mode: 'return_to_v2_before_v3_mutation', snapshot_digest: digest(captured), restored: false });
  const restore = typeof reverse_migration === 'function' ? reverse_migration : restore_snapshot;
  if (typeof restore !== 'function') return freeze({ ok: false, error: issue('rollback_restore_required', 'v3_only_mutation'), snapshot_digest: digest(captured) });
  if (mutate !== null && typeof mutate !== 'function') return freeze({ ok: false, error: issue('rollback_mutation_handler_invalid', 'mutate'), snapshot_digest: digest(captured) });
  if (mutate) {
    const mutation = await mutate();
    if (mutation?.ok !== true) return freeze({ ok: false, error: issue('rollback_mutation_failed', 'v3_only_mutation'), snapshot_digest: digest(captured) });
  }
  const restored = await restore(captured);
  if (restored?.ok !== true) return freeze({ ok: false, error: issue('rollback_restore_failed', 'v3_only_mutation'), snapshot_digest: digest(captured) });
  return freeze({ ok: true, mode: typeof reverse_migration === 'function' ? 'validated_reverse_migration' : 'snapshot_restore', snapshot_digest: digest(captured), restored: true });
}

function structuralSurface(input, errors, label) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) { errors.push(issue('shadow_observation_invalid', label)); return {}; }
  const unknown = Object.keys(input).filter((key) => !OBSERVATION_KEYS.includes(key));
  if (unknown.length) errors.push(issue('shadow_observation_invalid', label, { unknown_keys: unknown.sort() }));
  const missing = OBSERVATION_KEYS.filter((key) => input[key] === undefined);
  if (missing.length) errors.push(issue('shadow_observation_invalid', label, { missing_keys: missing }));
  return canonical(Object.fromEntries(OBSERVATION_KEYS.map((key) => [key, input[key]])));
}
function containsForbiddenShadowWrite(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsForbiddenShadowWrite);
  return Object.entries(value).some(([key, nested]) => forbiddenShadowKeys.has(key) || containsForbiddenShadowWrite(nested));
}
function compare(left, right, path = '$', output = []) {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) { output.push(freeze({ path, legacy: left, target: right })); return output; }
    left.forEach((value, index) => compare(value, right[index], `${path}[${index}]`, output)); return output;
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    keys.forEach((key) => compare(left[key], right[key], `${path}.${key}`, output)); return output;
  }
  if (!same(left, right)) output.push(freeze({ path, legacy: left, target: right }));
  return output;
}
function same(left, right) { return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right)); }
async function runGate(gate, type) {
  const id = gate?.id ?? 'unnamed';
  if (typeof gate?.run !== 'function') return freeze({ step: type, id, status: 'failed' });
  const result = await gate.run();
  return freeze({ step: type, id, status: result?.ok === true ? 'passed' : 'failed' });
}
