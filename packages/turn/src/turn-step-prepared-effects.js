import { deepFreeze, sha256 } from '@rus/kernel';
import {
  compareRationalMinutes,
  normalizeElapsedTime,
  normalizeGameTimestamp,
  subtractGameTimestamp
} from '@rus/time-events-history';
import { turnFailure } from './errors.js';

const LEDGER_SCHEMA='turn_step_prepared_effect_ledger_v1',SLICE_SCHEMA='turn_step_prepared_effect_slice_v1';
const EFFECT_KINDS = new Set(['domain_command', 'semantic_activity']);
const RAW_KEYS = new Set([
  'step_index', 'effect_kind', 'owner_ref', 'operation_ref', 'availability',
  'consequence', 'time_update', 'body_update', 'body_state_before'
]);
const SLICE_KEYS = new Set([
  'version', 'schema', 'ordinal', 'step_index', 'effect_kind', 'owner_ref',
  'operation_ref', 'availability', 'consequence', 'time_update',
  'body_update', 'body_state_before_digest', 'projection_before_digest',
  'projection_after_digest', 'previous_slice_digest', 'slice_digest'
]);
const LEDGER_KEYS = new Set([
  'version', 'schema', 'root_turn_id', 'committed_state_version', 'slices',
  'ledger_digest'
]);
export function buildTurnStepPreparedChainContext({
  priorEffectCount,
  currentClock,
  currentBodyState
}) {
  if (!Number.isSafeInteger(priorEffectCount) || priorEffectCount < 0
      || priorEffectCount > 2 || !plain(currentClock)
      || !plain(currentBodyState)) {
    invalid('Prepared effect chain context is invalid.');
  }
  return deepFreeze({
    version: 1,
    schema: 'turn_step_prepared_chain_context_v1',
    prior_effect_count: priorEffectCount,
    current_clock: structuredClone(currentClock),
    current_body_state: structuredClone(currentBodyState)
  });
}
export async function orchestrateTurnStepPreparedEffect({
  request,
  applied,
  preparedChainContext,
  timeOwner,
  bodyOwner,
  projectionOwner = null
}) {
  if (!plain(applied) || !plain(applied.prepared_effect_request)) {
    return applied;
  }
  const context = buildTurnStepPreparedChainContext({
    priorEffectCount: preparedChainContext?.prior_effect_count,
    currentClock: preparedChainContext?.current_clock,
    currentBodyState: preparedChainContext?.current_body_state
  });
  if (typeof timeOwner !== 'function' || typeof bodyOwner !== 'function') {
    invalid('Prepared effects require injected time and body owners.');
  }
  const candidate = requirePreparedRequest(applied.prepared_effect_request);
  const ownerInput = {
    prepared_chain_context: structuredClone(context),
    consequence: structuredClone(candidate.consequence),
    effect_kind: candidate.effect_kind,
    owner_ref: candidate.owner_ref,
    operation_ref: candidate.operation_ref,
    root_turn_id: request?.root_turn_id,
    step_index: request?.step_index,
    working_projection: structuredClone(applied.working_projection),
    local_fire_atomic_write_plans: structuredClone(applied
      .local_fire_atomic_write_plans ?? [])
  };
  const timeUpdate = await timeOwner(deepFreeze(ownerInput));
  const bodyUpdate = await bodyOwner(deepFreeze({
    ...ownerInput,
    time_update: structuredClone(timeUpdate)
  }));
  const effect = {
    step_index: request?.step_index,
    effect_kind: candidate.effect_kind,
    owner_ref: candidate.owner_ref,
    operation_ref: candidate.operation_ref,
    availability: structuredClone(candidate.availability),
    consequence: structuredClone(candidate.consequence),
    time_update: structuredClone(timeUpdate),
    body_update: structuredClone(bodyUpdate),
    body_state_before: structuredClone(context.current_body_state)
  };
  requireRawEffect(effect);
  const { prepared_effect_request: _request, ...result } = applied;
  const advancedProjection = advanceWorkingClock(
    result.working_projection, timeUpdate.clock_after);
  const workingProjection = projectionOwner == null
    ? advancedProjection
    : await projectionOwner(deepFreeze({
        prepared_chain_context: structuredClone(context),
        working_projection: structuredClone(advancedProjection),
        prepared_effect: structuredClone(effect)
      }));
  return deepFreeze({
    ...structuredClone(result),
    local_fire_atomic_write_plans:[...structuredClone(result
      .local_fire_atomic_write_plans??[]),...structuredClone(timeUpdate
      .local_fire_atomic_write_plans??[])],
    working_projection: requireObject(
      workingProjection, 'prepared working projection'),
    prepared_effect: effect
  });
}

export function buildTurnStepPreparedEffectLedger({
  rootTurnId,
  committedStateVersion,
  effects
}) {
  if (!text(rootTurnId)
      || !Number.isSafeInteger(committedStateVersion)
      || committedStateVersion < 0
      || !Array.isArray(effects)
      || effects.length === 0) {
    invalid('Prepared effect ledger identity and effects are required.');
  }
  let previousSlice = null;
  const slices = effects.map((candidate, index) => {
    const raw = requireRawEffect(candidate?.effect);
    const projectionBefore = requireObject(
      candidate?.working_projection_before, 'working projection before');
    const projectionAfter = requireObject(
      candidate?.working_projection_after, 'working projection after');
    const ordinal = index + 1;
    const bodyStateBeforeDigest = sha256(raw.body_state_before);
    const projectionBeforeDigest = sha256(projectionBefore);
    const projectionAfterDigest = sha256(projectionAfter);
    if (previousSlice != null) {
      if (projectionBeforeDigest !== previousSlice.projection_after_digest
          || bodyStateBeforeDigest
            !== sha256(previousSlice.body_update.state_after)
          || !same(raw.time_update.clock_before,
            previousSlice.time_update.clock_after)) {
        invalid('Prepared effect slices do not form one ordered state chain.', {
          ordinal
        });
      }
    }
    const previousSliceDigest = previousSlice?.slice_digest ?? sha256({
      schema: 'turn_step_prepared_effect_chain_seed_v1',
      root_turn_id: rootTurnId,
      committed_state_version: committedStateVersion,
      projection_before_digest: projectionBeforeDigest,
      body_state_before_digest: bodyStateBeforeDigest,
      clock_before: raw.time_update.clock_before
    });
    const payload = {
      version: 1,
      schema: SLICE_SCHEMA,
      ordinal,
      step_index: raw.step_index,
      effect_kind: raw.effect_kind,
      owner_ref: raw.owner_ref,
      operation_ref: raw.operation_ref,
      availability: structuredClone(raw.availability),
      consequence: structuredClone(raw.consequence),
      time_update: structuredClone(raw.time_update),
      body_update: structuredClone(raw.body_update),
      body_state_before_digest: bodyStateBeforeDigest,
      projection_before_digest: projectionBeforeDigest,
      projection_after_digest: projectionAfterDigest,
      previous_slice_digest: previousSliceDigest
    };
    const slice = { ...payload, slice_digest: sha256(payload) };
    previousSlice = slice;
    return slice;
  });
  const payload = {
    version: 1,
    schema: LEDGER_SCHEMA,
    root_turn_id: rootTurnId,
    committed_state_version: committedStateVersion,
    slices
  };
  return requireTurnStepPreparedEffectLedger({
    ...payload,
    ledger_digest: sha256(payload)
  });
}

export function requireTurnStepPreparedEffectLedger(value) {
  let ledger;
  try {
    ledger = structuredClone(value);
  } catch {
    invalid('Prepared effect ledger must be detached JSON data.');
  }
  if (!exactKeys(ledger, LEDGER_KEYS)
      || ledger.version !== 1
      || ledger.schema !== LEDGER_SCHEMA
      || !text(ledger.root_turn_id)
      || !Number.isSafeInteger(ledger.committed_state_version)
      || ledger.committed_state_version < 0
      || !Array.isArray(ledger.slices)
      || ledger.slices.length === 0
      || !digest(ledger.ledger_digest)) {
    invalid('Prepared effect ledger has an invalid exact contract.');
  }
  let previous = null;
  for (const [index, slice] of ledger.slices.entries()) {
    validateSlice(slice, {
      ordinal: index + 1,
      rootTurnId: ledger.root_turn_id,
      committedStateVersion: ledger.committed_state_version,
      previous
    });
    previous = slice;
  }
  const { ledger_digest: actual, ...payload } = ledger;
  if (sha256(payload) !== actual) {
    invalid('Prepared effect ledger digest does not match its slices.');
  }
  return deepFreeze(ledger);
}

export function buildTurnStepPreparedTimeUpdate(value) {
  const ledger = requireTurnStepPreparedEffectLedger(value);
  const first = ledger.slices[0];
  const last = ledger.slices.at(-1);
  const duration = ledger.slices.reduce((sum, slice) =>
    sum + requireIntegralDuration(slice.consequence.duration_minutes), 0);
  assertExactWindow({
    clockBefore: first.time_update.clock_before,
    clockAfter: last.time_update.clock_after,
    exactElapsed: exactMinutes(duration)
  }, 'prepared effect aggregate');
  return deepFreeze({
    version: 2,
    schema: 'turn_time_update',
    owner: '@rus/time-events-history',
    clock_before: structuredClone(first.time_update.clock_before),
    clock_after: structuredClone(last.time_update.clock_after),
    exact_elapsed: exactMinutes(duration),
    nearest_boundary: null,
    boundary_trace: {
      owner: 'turn_step_prepared_effect_ledger',
      policy: 'ordered_prepared_effect_slices',
      evaluated_candidate_count: ledger.slices.reduce((sum, slice) =>
        sum + Number(slice.time_update.boundary_trace
          ?.evaluated_candidate_count ?? 0), 0),
      processed_boundary_ids: ledger.slices.flatMap((slice) =>
        slice.time_update.boundary_trace?.processed_boundary_ids ?? [])
    },
    prepared_effect_ledger_digest: ledger.ledger_digest,
    prepared_effect_ledger: structuredClone(ledger)
  });
}

export function buildTurnStepPreparedBodyUpdate(value) {
  const ledger = requireTurnStepPreparedEffectLedger(value);
  const applied = ledger.slices.filter(
    (slice) => slice.body_update.applied === true);
  if (applied.length > 1) {
    invalid('Multiple prepared body owners require an explicit composite owner.');
  }
  const lastState = ledger.slices.at(-1).body_update.state_after;
  if (applied.length === 0) {
    return deepFreeze({
      version: 1,
      schema: 'turn_body_update',
      owner: '@rus/body-state',
      applied: false,
      proposal: null,
      state_after: structuredClone(lastState),
      prepared_effect_ledger_digest: ledger.ledger_digest
    });
  }
  return deepFreeze({
    ...structuredClone(applied[0].body_update),
    state_after: structuredClone(lastState),
    prepared_effect_ledger_digest: ledger.ledger_digest
  });
}

export function bindTurnStepPreparedConsequence(value, ledgerValue) {
  const ledger = requireTurnStepPreparedEffectLedger(ledgerValue);
  return deepFreeze({
    ...structuredClone(requireObject(value, 'consequence')),
    prepared_effect_ledger_digest: ledger.ledger_digest
  });
}

function requireRawEffect(value) {
  const raw = requireObject(value, 'prepared effect');
  if (!exactKeys(raw, RAW_KEYS)
      || !Number.isSafeInteger(raw.step_index)
      || raw.step_index < 1 || raw.step_index > 8
      || !EFFECT_KINDS.has(raw.effect_kind)
      || !text(raw.owner_ref) || !text(raw.operation_ref)
      || (raw.effect_kind === 'domain_command')
        !== (raw.availability != null)
      || !plain(raw.consequence)
      || !plain(raw.time_update)
      || raw.time_update.schema !== 'turn_time_update'
      || !validBodyUpdate(raw.body_update)
      || !plain(raw.body_state_before)) {
    invalid('Prepared effect has an invalid exact contract.');
  }
  validateEffectState(raw);
  return raw;
}

function requirePreparedRequest(value) {
  const request = requireObject(value, 'prepared effect request');
  const keys = new Set([
    'effect_kind', 'owner_ref', 'operation_ref', 'availability', 'consequence'
  ]);
  if (!exactKeys(request, keys) || !EFFECT_KINDS.has(request.effect_kind)
      || !text(request.owner_ref) || !text(request.operation_ref)
      || (request.effect_kind === 'domain_command')
        !== (request.availability != null)
      || !plain(request.consequence)) {
    invalid('Prepared effect request has an invalid exact contract.');
  }
  return request;
}

function advanceWorkingClock(value, clockAfter) {
  const projection = requireObject(value, 'working projection');
  return {
    ...projection,
    clock: structuredClone(clockAfter),
    ...(plain(projection.clock_weather_light) ? {
      clock_weather_light: {
        ...projection.clock_weather_light,
        clock: structuredClone(clockAfter)
      }
    } : {})
  };
}

function validateSlice(slice, {
  ordinal,
  rootTurnId,
  committedStateVersion,
  previous
}) {
  if (!exactKeys(slice, SLICE_KEYS)
      || slice.version !== 1
      || slice.schema !== SLICE_SCHEMA
      || slice.ordinal !== ordinal
      || !Number.isSafeInteger(slice.step_index)
      || slice.step_index < 1 || slice.step_index > 8
      || (previous != null && slice.step_index < previous.step_index)
      || !EFFECT_KINDS.has(slice.effect_kind)
      || !text(slice.owner_ref) || !text(slice.operation_ref)
      || (slice.effect_kind === 'domain_command')
        !== (slice.availability != null)
      || !plain(slice.consequence)
      || !plain(slice.time_update)
      || slice.time_update.schema !== 'turn_time_update'
      || !validBodyUpdate(slice.body_update)
      || ![slice.body_state_before_digest,
        slice.projection_before_digest, slice.projection_after_digest,
        slice.previous_slice_digest, slice.slice_digest].every(digest)) {
    invalid('Prepared effect slice has an invalid exact contract.', {
      ordinal
    });
  }
  validateEffectState(slice);
  const expectedPrevious = previous?.slice_digest ?? sha256({
    schema: 'turn_step_prepared_effect_chain_seed_v1',
    root_turn_id: rootTurnId,
    committed_state_version: committedStateVersion,
    projection_before_digest: slice.projection_before_digest,
    body_state_before_digest: slice.body_state_before_digest,
    clock_before: slice.time_update.clock_before
  });
  const { slice_digest: actual, ...payload } = slice;
  if (slice.previous_slice_digest !== expectedPrevious
      || (previous != null
        && (slice.projection_before_digest
            !== previous.projection_after_digest
          || slice.body_state_before_digest
            !== sha256(previous.body_update.state_after)
          || !same(slice.time_update.clock_before,
            previous.time_update.clock_after)))
      || sha256(payload) !== actual) {
    invalid('Prepared effect slice chain or digest is invalid.', { ordinal });
  }
}

function validateEffectState(effect) {
  const duration = requireIntegralDuration(
    effect.consequence.duration_minutes);
  assertExactWindow({
    clockBefore: effect.time_update.clock_before,
    clockAfter: effect.time_update.clock_after,
    exactElapsed: effect.time_update.exact_elapsed
  }, `prepared effect ${effect.step_index}`);
  const exact = normalizeElapsedTime(effect.time_update.exact_elapsed);
  if (exact.exact_minutes.denominator !== '1'
      || exact.exact_minutes.numerator !== String(duration)) {
    invalid('Prepared effect consequence and exact time differ.', {
      step_index: effect.step_index
    });
  }
  if (effect.body_update.applied !== true
      && effect.body_state_before_digest != null
      && effect.body_state_before_digest
        !== sha256(effect.body_update.state_after)) {
    invalid('A non-applied body slice changed body state.', {
      step_index: effect.step_index
    });
  }
  if (Object.hasOwn(effect, 'body_state_before')
      && effect.body_update.applied !== true
      && !same(effect.body_state_before, effect.body_update.state_after)) {
    invalid('A non-applied body effect changed body state.', {
      step_index: effect.step_index
    });
  }
}

function validBodyUpdate(value) {
  return plain(value)
    && value.schema === 'turn_body_update'
    && typeof value.applied === 'boolean'
    && plain(value.state_after)
    && (value.applied === true ? plain(value.proposal) : value.proposal === null);
}

function assertExactWindow({ clockBefore, clockAfter, exactElapsed }, label) {
  try {
    const before = normalizeGameTimestamp(clockBefore);
    const after = normalizeGameTimestamp(clockAfter);
    const elapsed = normalizeElapsedTime(exactElapsed);
    const actual = subtractGameTimestamp(after, before);
    if (compareRationalMinutes(actual, elapsed.exact_minutes) !== 0) {
      invalid(`${label} exact elapsed differs from its clock window.`);
    }
  } catch (cause) {
    if (cause?.code === 'TURN_STEP_PREPARED_EFFECT_INVALID') throw cause;
    invalid(`${label} has an invalid exact clock window.`, {
      cause: cause?.message
    });
  }
}

function requireIntegralDuration(value) {
  const number = Number(value ?? 0);
  if (!Number.isSafeInteger(number) || number < 0) {
    invalid('Prepared effect duration must be a non-negative integer.');
  }
  return number;
}

function exactMinutes(value) {
  return { exact_minutes: { numerator: String(value), denominator: '1' } };
}

function requireObject(value, label) {
  if (!plain(value)) invalid(`${label} must be a JSON object.`);
  try {
    return structuredClone(value);
  } catch {
    invalid(`${label} must be detached JSON data.`);
  }
}

function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).length === keys.size
    && Object.keys(value).every((key) => keys.has(key));
}

function same(left, right) {
  return sha256(left) === sha256(right);
}

function plain(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return typeof value === 'string' && value.trim() === value
    && value.length > 0;
}

function digest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

function invalid(message, details = {}) {
  throw turnFailure(
    'TURN_STEP_PREPARED_EFFECT_INVALID',
    message,
    details
  );
}
