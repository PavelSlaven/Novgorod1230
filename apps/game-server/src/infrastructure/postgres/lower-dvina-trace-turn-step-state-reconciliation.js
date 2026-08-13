import { canonicalDigest } from '@rus/materialization';
import { addElapsedTime } from '@rus/time-events-history';
import { fail, text } from
  './lower-dvina-trace-turn-step-persistence-support.js';

const BODY_METRICS = Object.freeze(['health', 'satiety', 'energy']);
const DELEGATED_FACTUAL_FIELDS = Object.freeze([
  'player_input', 'mode_resolution', 'consequence', 'time_update',
  'body_update', 'hidden_update'
]);

/** Validates a semantic commit that has no generic mechanics batch. */
export function validateNoBatchFactualCommit({ writePlan, factual, state,
  preparedEffect = null }) {
  if (writePlan?.turn_step_commit == null) return;
  const commit = writePlan.turn_step_commit;
  const selectedOption = commit.mode_resolution?.decision_trace
    ?.selected_option_id;
  const clarification = commit.loop_trace?.clarification;
  const terminalDirectDraft = commit.loop_trace?.stop_reason === 'terminal'
    && (commit.loop_trace?.step_traces ?? []).some((trace) =>
      trace?.resolution === 'direct' && trace?.applied === true);
  if (!text(selectedOption) && clarification == null && terminalDirectDraft) {
    fail('TRACE_TURN_STEP_DIRECT_COMMIT_CONTRACT_GAP', {
      reason: 'direct semantic draft has no committed operation batch'
    });
  }

  const partyStateTargets = (writePlan.write_targets ?? []).filter(
    ({ target }) => target === 'party_state');
  if (partyStateTargets.length > 0) {
    if (partyStateTargets.length !== 1 || factual == null
        || !same(partyStateTargets[0].value, factual)) {
      noBatchFail('delegated domain factual target is ambiguous');
    }
    if (DELEGATED_FACTUAL_FIELDS.some((field) =>
      !same(commit[field], factual[field]))) {
      noBatchFail('delegated domain envelope differs from its factual target');
    }
    if (preparedEffect?.combatSlice != null) return;
    validateStateAwareTransition({ commit: factual, state });
    return;
  }

  validateStateAwareTransition({ commit, state });
  if (!same(commit.time_update?.clock_after, state.clock)
      || Number(commit.consequence?.duration_minutes) !== 0) {
    noBatchFail('no-batch clock window differs from the persisted clock');
  }

  const bodyUpdate = commit.body_update;
  if (bodyUpdate?.applied !== false || bodyUpdate?.proposal !== null
      || !same(bodyUpdate?.state_after, state.body_state)) {
    noBatchFail('no-batch body update differs from persisted body state');
  }
}

function validateStateAwareTransition({ commit, state }) {
  let expectedClockAfter;
  try {
    expectedClockAfter = addElapsedTime(
      state.clock, commit.time_update?.exact_elapsed);
  } catch (cause) {
    noBatchFail('exact elapsed time is invalid', cause?.message);
  }
  if (!same(commit.time_update?.clock_before, state.clock)
      || !same(commit.time_update?.clock_after, expectedClockAfter)
      || !durationMatches(commit.consequence?.duration_minutes,
        commit.time_update?.exact_elapsed?.exact_minutes)) {
    noBatchFail('no-batch clock transition is not state-aware');
  }

  const bodyUpdate = commit.body_update;
  if (bodyUpdate?.applied === false) {
    if (bodyUpdate.proposal !== null
        || !same(bodyUpdate.state_after, state.body_state)) {
      noBatchFail('unapplied body update differs from persisted body state');
    }
    return;
  }
  if (bodyUpdate?.applied !== true || bodyUpdate.proposal == null
      || bodyUpdate.state_after == null) {
    noBatchFail('body transition is incomplete');
  }
  for (const metric of BODY_METRICS) {
    const before = state.body_state?.[metric];
    const delta = bodyUpdate.proposal?.exact_deltas?.[metric];
    const after = bodyUpdate.state_after?.[metric];
    if (!Number.isFinite(before) || !Number.isSafeInteger(delta)
        || after !== Math.max(0, Math.min(100, before + delta))) {
      noBatchFail('body transition does not match its exact deltas');
    }
  }
}

function durationMatches(duration, exact) {
  if (!Number.isSafeInteger(duration) || duration < 0) return false;
  try {
    const denominator = BigInt(exact?.denominator);
    return denominator > 0n
      && BigInt(exact?.numerator) === BigInt(duration) * denominator;
  } catch {
    return false;
  }
}

function noBatchFail(reason, cause = null) {
  fail('TRACE_TURN_STEP_DIRECT_COMMIT_CONTRACT_GAP', {
    reason,
    ...(cause == null ? {} : { cause })
  });
}

function same(left, right) {
  return canonicalDigest(left) === canonicalDigest(right);
}
