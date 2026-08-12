import { deepFreeze } from '@rus/kernel';
import { addElapsedTime, addRationalMinutes, compareGameTimestamp,
  compareRationalMinutes, isPositiveRationalMinutes, normalizeElapsedTime,
  normalizeGameTimestamp, subtractRationalMinutes } from
  '@rus/time-events-history';
import { normalizeTemporalBoundaryCandidates } from
  '@rus/time-events-history/temporal-boundaries';

export function resolveCombatExchangeTiming({ requested_at: requestedAt,
  timing_profile: profile } = {}) {
  if (profile?.status !== 'approved'
      || typeof profile.profile_id !== 'string'
      || profile.profile_id.length === 0
      || !Number.isSafeInteger(profile.duration_minutes)
      || profile.duration_minutes <= 0) {
    fail('TURN_COMBAT_TIMING_PROFILE_INVALID');
  }
  return deepFreeze({ occurred_at: normalizeGameTimestamp(requestedAt),
    exact_duration: normalizeElapsedTime({ exact_minutes: {
      numerator: String(profile.duration_minutes), denominator: '1' } }),
    timing_profile_ref: profile.profile_id });
}

export function orderCombatTechnicalSteps({ session, proposals,
  requested_at: requestedAt = session?.started_at,
  technical_step_timings: timings = null } = {}) {
  if (!validSessionParticipants(session) || !Array.isArray(proposals)
      || proposals.some((proposal) => !proposal?.proposal_id)) {
    fail('TURN_COMBAT_TECHNICAL_ORDER_INVALID');
  }
  const participantOrder = new Map(session.participant_states.map(
    ({ actor_ref: actor }, index) => [refKey(actor), index]));
  const actorKeys = proposals.map(({ actor_ref: actor }) => refKey(actor));
  if (new Set(actorKeys).size !== actorKeys.length
      || actorKeys.some((key) => !participantOrder.has(key))) {
    fail('TURN_COMBAT_TECHNICAL_ORDER_INVALID');
  }
  const byId = new Map(proposals.map((proposal) => [proposal.proposal_id,
    proposal]));
  const timingById = timingMap(timings, proposals);
  const candidates = proposals.map((proposal) => temporalCandidate(proposal,
    session, participantOrder.get(refKey(proposal.actor_ref)), requestedAt,
    timingById.get(proposal.proposal_id) ?? null));
  return deepFreeze(normalizeTemporalBoundaryCandidates(candidates)
    .map(({ boundary_id: id }) => byId.get(id)));
}

export function resolveCombatStepTimings({ session, steps, workingState,
  requestedAt, resolveTiming }) {
  const progress = progressMap(workingState);
  return deepFreeze(steps.map((step) => {
    const raw = resolveTiming({ session, working_state: workingState,
      requested_at: requestedAt, technical_step: step });
    if (!raw?.occurred_at || !raw?.exact_duration
        || compareGameTimestamp(raw.occurred_at, requestedAt) !== 0) {
      fail('TURN_COMBAT_TIME_OWNER_INVALID');
    }
    const totalDuration = normalizeElapsedTime(raw.exact_duration);
    if (!isPositiveRationalMinutes(totalDuration.exact_minutes)) {
      fail('TURN_COMBAT_TIME_OWNER_INVALID');
    }
    const prior = progress.get(progressKey(step));
    const elapsedBefore = prior == null ? zeroCombatDuration()
      : validateProgress(prior, step, raw, totalDuration);
    const remaining = normalizeElapsedTime({ exact_minutes:
      subtractRationalMinutes(totalDuration.exact_minutes,
        elapsedBefore.exact_minutes) });
    if (!isPositiveRationalMinutes(remaining.exact_minutes)) {
      fail('TURN_COMBAT_TIME_OWNER_INVALID');
    }
    return { technical_step_ref: { entity_kind: 'combat_technical_step',
      entity_id: step.proposal_id },
    occurred_at: normalizeGameTimestamp(raw.occurred_at),
    exact_duration: remaining, timing_profile_ref: raw.timing_profile_ref ?? null,
    total_duration: totalDuration, elapsed_before: elapsedBefore };
  }));
}

export function retainCombatStepProgress(state, proposals) {
  const allowed = new Set(proposals.map(progressKey));
  return { ...state, active_combat_step_progress: records(state).filter(
    (entry) => allowed.has(entryKey(entry))) };
}

export function advanceCombatStepProgress(state, steps, timings, elapsed) {
  if (steps.length === 0) return state;
  const byKey = new Map(records(state).map((entry) => [entryKey(entry), entry]));
  for (const step of steps) {
    const timing = timingForCombatStep(timings, step);
    const prior = byKey.get(progressKey(step));
    const elapsedBefore = prior?.elapsed_duration ?? timing.elapsed_before;
    const elapsedAfter = normalizeElapsedTime({ exact_minutes:
      addRationalMinutes(elapsedBefore.exact_minutes,
        elapsed.exact_minutes) });
    if (compareRationalMinutes(elapsedAfter.exact_minutes,
      timing.total_duration.exact_minutes) >= 0) {
      fail('TURN_COMBAT_TIME_OWNER_INVALID');
    }
    byKey.set(progressKey(step), { actor_ref: structuredClone(step.actor_ref),
      intent_id: step.intent_ref.entity_id,
      timing_profile_ref: timing.timing_profile_ref,
      total_duration: structuredClone(timing.total_duration),
      elapsed_duration: elapsedAfter });
  }
  return { ...state, active_combat_step_progress: [...byKey.values()] };
}

export function advanceCombatStepProgressForSlice(state, steps, timings,
  elapsed) {
  const pending = steps.filter((step) => compareRationalMinutes(
    timingForCombatStep(timings, step).exact_duration.exact_minutes,
    elapsed.exact_minutes) > 0);
  return advanceCombatStepProgress(state, pending, timings, elapsed);
}

export function clearCombatStepProgress(state, step) {
  const key = progressKey(step);
  return { ...state, active_combat_step_progress: records(state).filter(
    (entry) => entryKey(entry) !== key) };
}

export function earliestCombatStepDuration(timings) {
  if (timings.length === 0) return zeroCombatDuration();
  return timings.slice(1).reduce((earliest, { exact_duration: current }) =>
    compareRationalMinutes(current.exact_minutes,
      earliest.exact_minutes) < 0 ? current : earliest,
  timings[0].exact_duration);
}

export function orderedCombatStepTimings(steps, timings) {
  const byId = timingMap(timings, steps);
  return deepFreeze(steps.map(({ proposal_id: id }) => byId.get(id)));
}

export function timingForCombatStep(timings, step) {
  const timing = timings.find(({ technical_step_ref: ref }) =>
    ref.entity_id === step.proposal_id);
  if (!timing) fail('TURN_COMBAT_TIME_OWNER_INVALID');
  return timing;
}

export function zeroCombatDuration() {
  return normalizeElapsedTime({ exact_minutes: {
    numerator: '0', denominator: '1' } });
}

function validateProgress(entry, step, raw, totalDuration) {
  const elapsed = normalizeElapsedTime(entry.elapsed_duration);
  if (entry.actor_ref?.entity_kind !== step.actor_ref.entity_kind
      || entry.actor_ref.entity_id !== step.actor_ref.entity_id
      || entry.intent_id !== step.intent_ref.entity_id
      || entry.timing_profile_ref !== (raw.timing_profile_ref ?? null)
      || compareRationalMinutes(normalizeElapsedTime(
        entry.total_duration).exact_minutes, totalDuration.exact_minutes) !== 0
      || !isPositiveRationalMinutes(elapsed.exact_minutes)
      || compareRationalMinutes(elapsed.exact_minutes,
        totalDuration.exact_minutes) >= 0) {
    fail('TURN_COMBAT_TIME_OWNER_INVALID');
  }
  return elapsed;
}

function records(state) {
  const value = state.active_combat_step_progress ?? [];
  if (!Array.isArray(value)) fail('TURN_COMBAT_TIME_OWNER_INVALID');
  const keys = value.map(entryKey);
  if (keys.some((key) => key === null)
      || new Set(keys).size !== keys.length) {
    fail('TURN_COMBAT_TIME_OWNER_INVALID');
  }
  return structuredClone(value);
}
const progressMap = (state) => new Map(records(state).map((entry) => [
  entryKey(entry), entry]));
const progressKey = (step) => `${refKey(step.actor_ref)}\0${
  step.intent_ref.entity_id}`;
function entryKey(entry) {
  if (!entry?.actor_ref?.entity_kind || !entry.actor_ref.entity_id
      || typeof entry.intent_id !== 'string' || entry.intent_id.length === 0) {
    return null;
  }
  return `${refKey(entry.actor_ref)}\0${entry.intent_id}`;
}
function timingMap(timings, proposals) {
  if (timings == null) return new Map();
  if (!Array.isArray(timings) || timings.length !== proposals.length) {
    fail('TURN_COMBAT_TECHNICAL_ORDER_INVALID');
  }
  const byId = new Map(timings.map((timing) => [
    timing?.technical_step_ref?.entity_id, timing]));
  if (byId.size !== proposals.length || proposals.some(
    ({ proposal_id: id }) => !byId.has(id))) {
    fail('TURN_COMBAT_TECHNICAL_ORDER_INVALID');
  }
  return byId;
}
function temporalCandidate(proposal, session, ordinal, requestedAt, timing) {
  const orderId = String(ordinal).padStart(8, '0');
  return { boundary_id: proposal.proposal_id,
    boundary_kind: 'combat_technical_step',
    scheduled_at: timing == null ? normalizeGameTimestamp(requestedAt)
      : addElapsedTime(requestedAt, timing.exact_duration),
    source_ref: proposal.intent_ref, primary_subject_ref: proposal.actor_ref,
    subject_refs: [proposal.actor_ref], scope_ref: session.scope_ref,
    rule_ref: { entity_ref: { entity_kind: 'combat_participant_precedence',
      entity_id: `combat-order:${orderId}` }, authoring_version: '1' },
    policy_ref: { entity_ref: { entity_kind: 'temporal_policy',
      entity_id: 'combat-due-step-order-v1' }, authoring_version: '1' },
    preconditions_digest: proposal.preconditions_digest ?? proposal.proposal_id,
    resolution_class: 'execution_outcome', interrupt_effect: 'interruptible',
    visibility_policy_ref: { entity_ref: { entity_kind: 'visibility_policy',
      entity_id: 'combat-step-v1' }, authoring_version: '1' },
    idempotency_key: proposal.idempotency_key ?? proposal.proposal_id,
    causal_parent_refs: [] };
}
const validSessionParticipants = (session) => Array.isArray(
  session?.participant_states);
const refKey = (ref) => `${ref?.entity_kind ?? ''}\0${ref?.entity_id ?? ''}`;
function fail(code) { throw Object.assign(new Error(code), { code }); }
