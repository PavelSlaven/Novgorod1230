import { deepFreeze, sha256 } from '@rus/kernel';
import { addRationalMinutes,
  compareRationalMinutes,
  normalizeElapsedTime,
  normalizeGameTimestamp,
  subtractGameTimestamp
} from '@rus/time-events-history';
import { LEDGER_KEYS, LEDGER_SCHEMA, SLICE_SCHEMA, advanceWorkingClock,
  assertExactWindow, digest, exactKeys, exactMinutes, invalid, plain,
  rationalAsNumber, requireObject, requirePreparedRequest, requireRawEffect,
  same, text, validateSlice } from './turn-step-prepared-effect-validation.js';
export function buildTurnStepPreparedChainContext({
  priorEffectCount, currentClock, currentBodyState
}) {
  if (!Number.isSafeInteger(priorEffectCount) || priorEffectCount < 0
      || !plain(currentClock)
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
  request, applied, preparedChainContext,
  priorLocalFirePlans = [],
  timeOwner, bodyOwner, projectionOwner = null
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
  if (!Array.isArray(priorLocalFirePlans)) invalid(
    'Prepared effects require an ordered prior local-fire plan array.');
  const candidate = requirePreparedRequest(applied.prepared_effect_request);
  const currentLocalFirePlans = applied.local_fire_atomic_write_plans ?? [];
  if (!Array.isArray(currentLocalFirePlans)) invalid(
    'Prepared effects require an ordered current local-fire plan array.');
  const ownerInput = {
    prepared_chain_context: structuredClone(context),
    consequence: structuredClone(candidate.consequence),
    effect_kind: candidate.effect_kind,
    owner_ref: candidate.owner_ref,
    operation_ref: candidate.operation_ref,
    root_turn_id: request?.root_turn_id,
    step_index: request?.step_index,
    working_projection: structuredClone(applied.working_projection),
    local_fire_atomic_write_plans: structuredClone(
      [...priorLocalFirePlans,...currentLocalFirePlans])
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
  const interrupted = candidate.effect_kind === 'semantic_activity'
    && compareRationalMinutes(
      normalizeElapsedTime(timeUpdate.exact_elapsed).exact_minutes,
      normalizeElapsedTime({ exact_minutes: {
        numerator: String(candidate.consequence.duration_minutes),
        denominator: '1'
      } }).exact_minutes
    ) < 0;
  const workingProjection = projectionOwner == null
    ? advancedProjection
    : await projectionOwner(deepFreeze({
        prepared_chain_context: structuredClone(context),
        actor: structuredClone(request?.actor),
        working_projection: structuredClone(advancedProjection),
        prepared_effect: structuredClone(effect)
      }));
  return deepFreeze({
    ...structuredClone(result),
    interrupted,
    player_response_boundary: result.player_response_boundary === true
      || (timeUpdate.temporal_results ?? []).some((temporal) =>
        temporal.temporal_status === 'paused'
        || temporal.trace?.stopped_after_current_batch === true
        || temporal.visible_package_candidate?.player_safe_interruption != null
        || temporal.visible_package_candidate?.visible_payload?.player_safe_interruption != null),
    local_fire_atomic_write_plans:[...structuredClone(result
      .local_fire_atomic_write_plans??[]),...structuredClone(timeUpdate
      .local_fire_atomic_write_plans??[])],
    working_projection: requireObject(
      workingProjection, 'prepared working projection'),
    prepared_effect: effect
  });
}
export function buildTurnStepPreparedEffectLedger({
  rootTurnId, committedStateVersion, effects
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
      if (bodyStateBeforeDigest
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
  const exactElapsed = ledger.slices.reduce((sum, slice) =>
    addRationalMinutes(
      sum,
      normalizeElapsedTime(slice.time_update.exact_elapsed).exact_minutes
    ), { numerator: '0', denominator: '1' });
  assertExactWindow({
    clockBefore: first.time_update.clock_before,
    clockAfter: last.time_update.clock_after,
    exactElapsed: { exact_minutes: exactElapsed }
  }, 'prepared effect aggregate');
  return deepFreeze({
    version: 2,
    schema: 'turn_time_update',
    owner: '@rus/time-events-history',
    clock_before: structuredClone(first.time_update.clock_before),
    clock_after: structuredClone(last.time_update.clock_after),
    exact_elapsed: { exact_minutes: exactElapsed },
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
    temporal_results: ledger.slices.flatMap((slice) =>
      structuredClone(slice.time_update.temporal_results ?? [])),
    prepared_effect_ledger_digest: ledger.ledger_digest,
    prepared_effect_ledger: structuredClone(ledger)
  });
}
export function buildTurnStepPreparedBodyUpdate(value) {
  const ledger = requireTurnStepPreparedEffectLedger(value);
  const applied = ledger.slices.filter(
    (slice) => slice.body_update.applied === true);
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
  if (applied.length === 1) {
    return deepFreeze({
      ...structuredClone(applied[0].body_update),
      state_after: structuredClone(lastState),
      prepared_effect_ledger_digest: ledger.ledger_digest
    });
  }
  const updates = applied.map(({ body_update: update }) => update);
  const first = updates[0];
  const proposal = structuredClone(first.proposal);
  if (updates.some((update) => update.owner !== first.owner
      || update.proposal?.profile_ref !== proposal.profile_ref
      || !same(update.proposal?.profile_pin, proposal.profile_pin)
      || update.proposal?.selection_policy !== proposal.selection_policy
      || update.proposal?.rng_consumption !== proposal.rng_consumption
      || !Array.isArray(update.proposal?.component_proposals))) {
    invalid('Prepared body updates require one existing composite owner.');
  }
  proposal.component_proposals = updates.flatMap((update) =>
    structuredClone(update.proposal.component_proposals));
  proposal.exact_deltas = Object.fromEntries(
    Object.keys(proposal.exact_deltas).map((metric) => [metric,
      proposal.component_proposals.reduce((sum, component) =>
        sum + Number(component.exact_deltas?.[metric] ?? 0), 0)]));
  return deepFreeze({
    ...structuredClone(first), proposal,
    state_after: structuredClone(lastState),
    prepared_effect_ledger_digest: ledger.ledger_digest
  });
}
export function bindTurnStepPreparedConsequence(value, ledgerValue) {
  const ledger = requireTurnStepPreparedEffectLedger(ledgerValue);
  const consequence = structuredClone(requireObject(value, 'consequence'));
  for (const slice of ledger.slices) {
    if (slice.effect_kind !== 'semantic_activity') continue;
    for (const [key, seed] of Object.entries(slice.consequence.visible_seed ?? {})) {
      if (seed?.kind === 'semantic_activity' && consequence.visible_seed?.[key] != null)
        consequence.visible_seed[key].duration_minutes = rationalAsNumber(
          slice.time_update.exact_elapsed.exact_minutes
        );
    }
  }
  return deepFreeze({
    ...consequence,
    duration_minutes: rationalAsNumber(
      buildTurnStepPreparedTimeUpdate(ledger).exact_elapsed.exact_minutes
    ),
    prepared_effect_ledger_digest: ledger.ledger_digest
  });
}
