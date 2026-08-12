import {
  buildCombatExchangeProposal,
  combatBodyThresholdSignalProfile,
  buildCombatDecisionSignalDescriptors,
  buildCombatOutcomeEvents,
  buildCombatStepHarmPackage,
  buildCombatTechnicalStepProposal,
  validateCombatSession
} from '@rus/combat-health';
import { applyBodyStateChange, detectBodyThresholdCrossings } from '@rus/body-state';
import { executeCheck } from '@rus/checks-rng'; import { deepFreeze } from '@rus/kernel';
import { addElapsedTime, compareRationalMinutes, normalizeGameTimestamp } from '@rus/time-events-history';
import { recordCombatBlockedStep, recordCombatInvalidIntent } from './combat-blocked-events.js';
import { advanceCombatStepProgressForSlice, clearCombatStepProgress,
  earliestCombatStepDuration, orderedCombatStepTimings,
  resolveCombatStepTimings, retainCombatStepProgress,
  timingForCombatStep, zeroCombatDuration } from './combat-temporal-steps.js';
export async function executeCombatExchange(input = {}) {
  requireActiveSession(input.session);
  if (!input.ports?.loadCommittedExchange || !input.ports?.commitExchange) {
    throw combatError('TURN_COMBAT_PORT_MISSING');
  }
  const prior = await input.ports.loadCommittedExchange({ combat_id: input.session.combat_id,
    exchange_ordinal: input.session.exchange_ordinal + 1,
    idempotency_key: input.idempotency_key
  });
  if (prior) return deepFreeze({ status: 'replayed', committed: prior });
  const prepared = await prepareCombatExchange(input);
  return deepFreeze({ status: 'committed', committed: await input.ports
    .commitExchange(prepared.prepared) });
}
export async function prepareCombatExchange(input = {}) {
  const { session, working_state, occurred_at, random_source, idempotency_key,
    ports, body_threshold_profile = combatBodyThresholdSignalProfile() } = input;
  requireActiveSession(session);
  requirePorts(ports, random_source);
  requireBodyThresholdProfile(body_threshold_profile);
  let state = structuredClone(working_state);
  const next = structuredClone(session);
  const exchangeStartedAt = normalizeGameTimestamp(occurred_at);
  const blockedDescriptors = [], initialBlockedEvents = [], blockedStepEvents =
    new Map();
  const builtSteps = buildStepProposals(next, state, ports,
    blockedDescriptors, initialBlockedEvents, exchangeStartedAt);
  const { proposals, initialProfiles } = builtSteps;
  state = retainCombatStepProgress(state, proposals);
  const unorderedStepTimings = resolveCombatStepTimings({
    session: next,
    steps: proposals,
    workingState: state,
    requestedAt: exchangeStartedAt,
    resolveTiming: ports.resolveCombatTiming
  });
  const steps = validateStepOrder(ports.orderTechnicalSteps({
    session: next,
    proposals,
    requested_at: exchangeStartedAt,
    technical_step_timings: unorderedStepTimings
  }), proposals);
  const plannedStepTimings = orderedCombatStepTimings(steps,
    unorderedStepTimings);
  let sliceDuration = earliestCombatStepDuration(plannedStepTimings);
  let temporalAdvanceResults = [];
  const positivePlannedDuration = BigInt(
    sliceDuration.exact_minutes.numerator) > 0n;
  if (typeof ports.advanceTemporalSlice === 'function'
      && positivePlannedDuration) {
    const temporal = await ports.advanceTemporalSlice({ session: next,
      working_state: state, requested_at: exchangeStartedAt,
      exact_duration: sliceDuration, steps,
      step_timings: plannedStepTimings });
    validateTemporalSlice(temporal, sliceDuration);
    sliceDuration = structuredClone(temporal.exact_duration);
    temporalAdvanceResults = structuredClone(
      temporal.temporal_advance_results ?? []);
    state = structuredClone(temporal.working_state);
  }
  const plannedCompletedAt = addElapsedTime(exchangeStartedAt, sliceDuration);
  const dueStepIds = new Set(plannedStepTimings.filter(({ exact_duration: duration }) =>
    compareRationalMinutes(duration.exact_minutes,
      sliceDuration.exact_minutes) === 0).map(
    ({ technical_step_ref: ref }) => ref.entity_id));
  const results = { checks: [], harms: [], body: [], items: [], positions: [],
    continuous_positions: [], by_step: new Map() };
  const synchronizedSliceResultId = temporalAdvanceResults.at(-1)
    ?.processed_slice_refs?.at(-1)?.entity_id
    ?? `combat-time-slice:${next.combat_id}:${next.exchange_ordinal}`;
  const temporalSlice = (step) => ({
    exact_duration: structuredClone(sliceDuration),
    step_duration: structuredClone(timingForCombatStep(
      plannedStepTimings, step).exact_duration),
    completion_due: dueStepIds.has(step.proposal_id),
    clock_commit_mode: 'shared_root_transport_clock',
    synchronized_time_slice_result_id: synchronizedSliceResultId
  });
  const pendingSteps = steps.filter((candidate) =>
    !dueStepIds.has(candidate.proposal_id));
  if (typeof ports.advanceTemporalSlice !== 'function') {
    state = advanceCombatStepProgressForSlice(state, steps,
      plannedStepTimings, sliceDuration);
  }
  const dueSteps = steps.filter((step) => dueStepIds.has(step.proposal_id));
  for (const step of dueSteps) {
    state = clearCombatStepProgress(state, step);
    const intent = findIntent(next, step.intent_ref.entity_id);
    if (!currentStepApplicable(next, step, intent, state)) {
      recordCombatBlockedStep({ session: next, step, intent,
        occurredAt: plannedCompletedAt, descriptors: blockedDescriptors,
        events: blockedStepEvents });
      continue;
    }
    const profile = ports.resolveExecutionProfile({ session: next, intent, working_state: state, step });
    if (!validProfile(profile) || profile.applicable === false) {
      recordCombatBlockedStep({ session: next, step, intent,
        occurredAt: plannedCompletedAt, descriptors: blockedDescriptors,
        events: blockedStepEvents });
      continue;
    }
    const executed = executeStep({ step, intent, profile, state, random_source, body_threshold_profile });
    applyBodyTerminalStatuses(next, executed.body);
    results.checks.push(...executed.checks);
    results.harms.push(...executed.harms);
    results.body.push(...executed.body);
    results.by_step.set(step.proposal_id, executed);
    const item = ports.applyItemTransitions({ step, intent,
      check_result: executed.check, harm: executed.harm, working_state: state });
    validateOwnerResult(item, 'item');
    validateOwnerEvents(item?.outcome_events, step, next);
    results.items.push(item ?? null);
    const position = ports.applyPositionTransitions({ step, intent,
      check_result: executed.check, harm: executed.harm,
      working_state: item?.working_state ?? state,
      temporal_slice: temporalSlice(step) });
    validateOwnerResult(position, 'position');
    validateOwnerEvents(position?.outcome_events, step, next);
    results.positions.push(position ?? null);
    executed.item = item ?? null;
    executed.position = position ?? null;
    applyParticipantStatusUpdates(next,
      item?.participant_status_updates ?? [], 'item', step);
    applyParticipantStatusUpdates(next,
      position?.participant_status_updates ?? [], 'position', step);
    applyTerminalIntentStatus(next, intent, executed.check, position);
    state = structuredClone(position?.working_state ?? item?.working_state ?? state);
  }
  for (const step of pendingSteps) {
    const intent = findIntent(session, step.intent_ref.entity_id);
    if (!intent || !['reach', 'break_contact'].includes(intent.intent_kind)) {
      continue;
    }
    const profile = ports.resolveExecutionProfile({ session: next, intent,
      working_state: state, step });
    const applicable = currentStepApplicable(next, step, intent, state)
      && validProfile(profile) && profile.applicable !== false;
    if (!applicable) {
      state = clearCombatStepProgress(state, step);
      recordCombatBlockedStep({ session: next, step, intent,
        occurredAt: plannedCompletedAt, descriptors: blockedDescriptors,
        events: blockedStepEvents });
    }
    const position = ports.applyPositionTransitions({ step, intent,
      check_result: null, harm: null, working_state: state,
      execution_profile: applicable ? profile : initialProfiles.get(
        step.proposal_id),
      temporal_slice: { ...temporalSlice(step),
        continuation_allowed: applicable } });
    validateOwnerResult(position, 'position');
    validateOwnerEvents(position?.outcome_events, step, next);
    results.positions.push(position ?? null);
    results.continuous_positions.push({ step, position: position ?? null });
    state = structuredClone(position?.working_state ?? state);
  }
  state = retainCombatStepProgress(state, steps.filter((step) => {
    const intent = findIntent(next, step.intent_ref.entity_id);
    return currentStepApplicable(next, step, intent, state);
  }));

  const appliedAnyStep = results.by_step.size > 0;
  const technicalStepTimings = plannedStepTimings.filter(
    ({ technical_step_ref: ref }) => results.by_step.has(ref.entity_id));
  const exactDuration = appliedAnyStep || pendingSteps.length > 0
    ? sliceDuration : zeroCombatDuration();
  const exchangeCompletedAt = addElapsedTime(exchangeStartedAt, exactDuration);
  for (const descriptor of blockedDescriptors) {
    descriptor.occurred_at = exchangeCompletedAt;
  }
  const exchange = !appliedAnyStep ? null : buildCombatExchangeProposal({
    session: next, technical_steps: dueSteps,
    preconditions_digest: 'combat-exchange'
  });
  let events = [...initialBlockedEvents,
    ...pendingSteps.flatMap((step) => blockedStepEvents.has(step.proposal_id)
      ? [blockedStepEvents.get(step.proposal_id)] : []),
    ...results.continuous_positions.flatMap(({ position }) =>
      position?.outcome_events ?? []), ...dueSteps.flatMap((step) => {
    const blocked = blockedStepEvents.get(step.proposal_id);
    if (blocked) return [blocked];
    const result = results.by_step.get(step.proposal_id);
    if (!result) return [];
    return [
      ...buildCombatOutcomeEvents({ combat_id: next.combat_id,
        technical_step: step, check_result: result.check ?? null,
        harm_package: result.harm ?? null }),
      ...(result.item?.outcome_events ?? []),
      ...(result.position?.outcome_events ?? [])
    ];
  })];
  if (new Set(events.map(({ event_id: id }) => id)).size !== events.length) {
    throw combatError('TURN_COMBAT_OUTCOME_EVENT_INVALID');
  }
  const meaningfulDescriptors = buildMeaningfulDescriptors({ results,
    blockedDescriptors, occurredAt: exchangeCompletedAt });
  next.exchange_ordinal += exchange ? 1 : 0;
  next.state_version = String(Number(next.state_version) + 1);
  if (combatHasEnded(next)) {
    closeCombatSession(next);
    state = { ...state, active_combat_step_progress: [],
      active_combat_traversals: [] };
    events = [...events, combatEndedEvent(next, exchange,
      events.at(-1) ?? null)];
  } else {
    next.status = meaningfulDescriptors.length > 0
      ? 'paused_for_decisions' : 'paused_for_player';
    next.player_response_required = blockedDescriptors.length === 0;
  }
  const perceived = await ports.resolvePerceptionAndDecisionContexts({
    session: deepFreeze(structuredClone(next)), working_state: state,
    outcome_events: events,
    blocked_descriptors: blockedDescriptors,
    meaningful_descriptors: meaningfulDescriptors,
    occurred_at: exchangeCompletedAt,
    exchange_started_at: exchangeStartedAt,
    exact_duration: exactDuration,
    technical_step_timings: technicalStepTimings
  });
  validateOwnerResult(perceived, 'perception');
  const resolvedSession = perceived?.session_after == null
    ? next : structuredClone(perceived.session_after);
  if (!validateCombatSession(resolvedSession)
      || resolvedSession.combat_id !== next.combat_id
      || resolvedSession.exchange_ordinal !== next.exchange_ordinal
      || resolvedSession.state_version !== next.state_version
      || (next.status === 'ended'
        && (resolvedSession.status !== 'ended'
          || resolvedSession.player_response_required !== false
          || (perceived?.decision_results?.length ?? 0) !== 0))) {
    throw combatError('TURN_COMBAT_DECISION_OWNER_INVALID');
  }
  if (resolvedSession.status === 'paused_for_decisions') {
    resolvedSession.status = 'paused_for_player';
    resolvedSession.player_response_required = true;
  }
  return deepFreeze({ status: 'prepared', prepared: {
    idempotency_key, occurred_at: exchangeCompletedAt,
    exchange_started_at: exchangeStartedAt, exact_duration: exactDuration,
    technical_step_timings: technicalStepTimings,
    exchange, session_before: session, session_after: resolvedSession,
    working_state_after: perceived?.working_state ?? state, check_results: results.checks,
    harm_packages: results.harms, body_transitions: results.body,
    item_transitions: results.items, position_transitions: results.positions,
    decision_results: perceived?.decision_results ?? [],
    decision_records: perceived?.decision_records ?? [],
    player_boundary: perceived?.player_boundary ?? null,
    outcome_events: events, signal_records: perceived?.signal_records ?? [],
    blocked_descriptors: blockedDescriptors,
    meaningful_descriptors: meaningfulDescriptors,
    temporal_advance_results: temporalAdvanceResults }});
}

function validateTemporalSlice(value, planned) {
  const actual = value?.exact_duration?.exact_minutes;
  if (!value?.working_state || !Array.isArray(
    value.temporal_advance_results ?? []) || actual == null
      || BigInt(actual.numerator) <= 0n
      || compareRationalMinutes(actual, planned.exact_minutes) > 0) {
    throw combatError('TURN_COMBAT_TEMPORAL_OWNER_INVALID');
  }
}

function buildMeaningfulDescriptors({ results, blockedDescriptors,
  occurredAt }) {
  const raw = [...blockedDescriptors,
    ...results.items.flatMap((entry) => entry?.signal_descriptors ?? []),
    ...results.positions.flatMap(
      (entry) => entry?.signal_descriptors ?? []),
    ...results.body.flatMap((entry) => (entry?.threshold_crossings ?? [])
      .map((crossing) => ({ ...approvedBodySignal(crossing),
      source_event_ref: { entity_kind: 'body_threshold_crossing',
        entity_id: `${entry.actor_ref.entity_id}:${crossing.threshold_id}` },
      subject_ref: entry.actor_ref, scope_refs: [] })))];
  return buildCombatDecisionSignalDescriptors({ occurred_at: occurredAt,
    events: raw.map((entry) => ({ ...entry, occurred_at: undefined,
      subject_ref: entry.subject_ref ?? { entity_kind: 'npc',
        entity_id: 'unknown' }, scope_refs: entry.scope_refs ?? [],
      perception_required: entry.perception_required === true,
      perceived_change_summary: entry.perceived_change_summary
        ?? 'Текущее намерение больше нельзя продолжать.' })) });
}

function buildStepProposals(session, state, ports, blocked, blockedEvents,
  occurredAt) {
  const proposals = [], initialProfiles = new Map();
  for (const participant of session.participant_states) {
    const intent = participant.current_intent;
    if (!intent || intent.status !== 'active'
        || !['active', 'disengaging'].includes(participant.combat_status)) continue;
    const profile = ports.resolveExecutionProfile({ session, intent, working_state: state });
    if (!validProfile(profile) || profile.applicable === false) {
      recordCombatInvalidIntent({ session, intent, occurredAt,
        descriptors: blocked, events: blockedEvents });
      continue;
    }
    const proposal = buildCombatTechnicalStepProposal({ session, intent,
      preconditions_digest: profile.preconditions_digest,
      execution_profile: profile });
    proposals.push(proposal);
    initialProfiles.set(proposal.proposal_id, structuredClone(profile));
  }
  return { proposals, initialProfiles };
}

function executeStep({ step, intent, profile, state, random_source, body_threshold_profile }) {
  const check = step.check_request === null ? null : executeCheck({ ...step.check_request,
    check_id: `combat-check:${step.proposal_id}`, difficulty: step.check_request.target_defense }, random_source);
  const harm = step.step_kind === 'attack' && check
    ? buildCombatStepHarmPackage({ check_result: check, attack_request: step.check_request }) : null;
  const body = [];
  if (harm?.health_loss > 0) {
    const target = intent.target_refs[0];
    const actor = state.actor_states?.[`${target.entity_kind}\0${target.entity_id}`];
    if (actor?.body_state) {
      const before = actor.body_state;
      const after = applyBodyStateChange(before, { harm: { health: harm.health_loss } });
      actor.body_state = after;
      body.push({ actor_ref: target, body_before: before, body_after: after,
        threshold_crossings: body_threshold_profile ? detectBodyThresholdCrossings({ before, after, thresholds: body_threshold_profile.thresholds }) : [] });
    }
  }
  return { check, harm, checks: check ? [check] : [], harms: harm ? [harm] : [], body };
}

function requireActiveSession(session) { if (!validateCombatSession(session) || session.status !== 'active') throw combatError('TURN_COMBAT_SESSION_INVALID'); }
function requirePorts(ports, random) { for (const key of ['resolveCombatTiming','resolveExecutionProfile','orderTechnicalSteps','applyItemTransitions','applyPositionTransitions','resolvePerceptionAndDecisionContexts']) if (typeof ports?.[key] !== 'function') throw combatError('TURN_COMBAT_EXCHANGE_INPUT_INVALID'); if (typeof random?.next !== 'function') throw combatError('TURN_COMBAT_EXCHANGE_INPUT_INVALID'); }
function requireBodyThresholdProfile(profile) {
  if (profile === null) return;
  if (profile?.status !== 'approved'
      || typeof profile.profile_id !== 'string' || profile.profile_id.length === 0
      || !Array.isArray(profile.thresholds)
      || profile.thresholds.some(({ decision_signal: signal } = {}) =>
        !validBodySignal(signal))) {
    throw combatError('TURN_COMBAT_BODY_THRESHOLD_PROFILE_INVALID');
  }
}
function validBodySignal(signal) {
  return signal && ['self','others','environment','objective','communication']
    .includes(signal.category)
    && ['material','critical'].includes(signal.significance)
    && typeof signal.perception_required === 'boolean'
    && typeof signal.perceived_change_summary === 'string'
    && signal.perceived_change_summary.length > 0;
}
function approvedBodySignal(crossing) {
  if (!validBodySignal(crossing?.decision_signal)) {
    throw combatError('TURN_COMBAT_BODY_SIGNAL_DESCRIPTOR_INVALID');
  }
  return structuredClone(crossing.decision_signal);
}
function validProfile(value) { return value && typeof value === 'object' && (value.applicable === false || typeof value.preconditions_digest === 'string'); }
function validateStepOrder(steps, proposals) { if (!Array.isArray(steps) || steps.length !== proposals.length || new Set(steps.map((step) => step.proposal_id)).size !== proposals.length) throw combatError('TURN_COMBAT_TECHNICAL_ORDER_INVALID'); return steps; }
function findIntent(session, intentId) { return session.participant_states.find((participant) => participant.current_intent?.intent_id === intentId)?.current_intent; }
function currentStepApplicable(session, step, intent, workingState) {
  if (!intent || intent.status !== 'active') return false;
  const actor = session.participant_states.find((participant) =>
    refKey(participant.actor_ref) === refKey(step.actor_ref));
  if (!actor || !['active', 'disengaging'].includes(actor.combat_status)
      || actor.current_intent?.intent_id !== intent.intent_id
      || actorHasNoHealth(step.actor_ref, workingState)) return false;
  if (!['engage', 'control'].includes(intent.intent_kind)) return true;
  return intent.target_refs.every((target) => {
    const participant = session.participant_states.find((candidate) =>
      refKey(candidate.actor_ref) === refKey(target));
    return participant
      && ['active', 'disengaging'].includes(participant.combat_status);
  });
}
function actorHasNoHealth(actor, workingState) {
  const health = workingState.actor_states?.[
    `${actor.entity_kind}\0${actor.entity_id}`]?.body_state?.health;
  return Number.isFinite(Number(health)) && Number(health) <= 0;
}
function applyBodyTerminalStatuses(session, bodyTransitions) {
  for (const transition of bodyTransitions) {
    if (Number(transition.body_after?.health) > 0) continue;
    const participant = session.participant_states.find(({ actor_ref: actor }) =>
      refKey(actor) === refKey(transition.actor_ref));
    if (!participant) throw combatError('TURN_COMBAT_BODY_TARGET_INVALID');
    participant.combat_status = 'incapacitated';
    participant.current_intent = null;
    participant.next_action_boundary_ref = null;
  }
}
function validateOwnerResult(value, owner) { if (value !== undefined && (value === null || typeof value !== 'object')) throw combatError(`TURN_COMBAT_${owner.toUpperCase()}_OWNER_INVALID`); }
function validateOwnerEvents(events = [], step, session) {
  if (!Array.isArray(events) || events.some((event) =>
    typeof event?.event_id !== 'string' || event.event_id.length === 0
    || typeof event.event_kind !== 'string' || event.event_kind.length === 0
    || event.combat_id !== session.combat_id
    || event.source_step_ref?.entity_kind !== 'combat_technical_step'
    || event.source_step_ref.entity_id !== step.proposal_id)) {
    throw combatError('TURN_COMBAT_DOMAIN_EVENT_INVALID');
  }
}
function applyParticipantStatusUpdates(session, updates, owner, step) {
  if (!Array.isArray(updates)) throw combatError('TURN_COMBAT_DOMAIN_OWNER_INVALID');
  for (const update of updates) {
    const participant = session.participant_states.find(({ actor_ref: actor }) =>
      actor.entity_kind === update?.actor_ref?.entity_kind
      && actor.entity_id === update?.actor_ref?.entity_id);
    if (!participant || !['active','disengaging','restrained','surrendered',
      'incapacitated','left'].includes(update.combat_status)) {
      throw combatError('TURN_COMBAT_DOMAIN_OWNER_INVALID');
    }
    if (update.combat_status === 'left'
        && (owner !== 'position'
          || update.actor_ref.entity_kind !== step.actor_ref.entity_kind
          || update.actor_ref.entity_id !== step.actor_ref.entity_id
          || participant.current_intent?.intent_kind !== 'break_contact')) {
      throw combatError('TURN_COMBAT_DOMAIN_OWNER_INVALID');
    }
    participant.combat_status = update.combat_status;
    if (update.clear_intent === true) {
      participant.current_intent = participant.current_intent
        && ['active', 'disengaging', 'restrained'].includes(
          update.combat_status)
        ? { ...participant.current_intent, status: 'invalidated' }
        : null;
    }
  }
}
function applyTerminalIntentStatus(session, intent, check, position) {
  if (check?.outcome?.success === false) return;
  const participant = session.participant_states.find(({ actor_ref: actor }) =>
    actor.entity_kind === intent.actor_ref.entity_kind
    && actor.entity_id === intent.actor_ref.entity_id);
  if (!participant) throw combatError('TURN_COMBAT_ACTOR_NOT_ACTIVE');
  if (intent.intent_kind === 'surrender') {
    participant.combat_status = 'surrendered';
    participant.current_intent = null;
  } else if (intent.intent_kind === 'break_contact') {
    if (participant.combat_status === 'left') {
      participant.current_intent = null;
    } else {
      participant.combat_status = 'disengaging';
    }
  } else if (intent.intent_kind === 'reach'
      && position?.completed_intent === true) {
    participant.current_intent = { ...participant.current_intent,
      status: 'completed' };
  } else if (intent.intent_kind === 'cease_hostility') {
    participant.current_intent = null;
  }
}
function combatHasEnded(session) {
  const capable = session.participant_states.filter(({ combat_status: status }) =>
    ['active', 'disengaging'].includes(status));
  if (capable.length < 2) return true;
  const capableRefs = new Set(capable.map(({ actor_ref: actor }) => refKey(actor)));
  if (capable.some(({ combat_status: status, current_intent: intent }) =>
    status === 'disengaging' || intent?.intent_kind === 'break_contact')) {
    return false;
  }
  return !capable.some(({ current_intent: intent }) =>
    ['engage', 'control'].includes(intent?.intent_kind)
      && intent.target_refs.some((target) => capableRefs.has(refKey(target))));
}
function closeCombatSession(session) {
  session.status = 'ended';
  session.player_response_required = false;
  for (const participant of session.participant_states) {
    participant.current_intent = null;
    participant.next_action_boundary_ref = null;
  }
}
function combatEndedEvent(session, exchange, terminalCause) {
  if (!exchange?.proposal_id && !terminalCause?.event_id) {
    throw combatError('TURN_COMBAT_TERMINAL_EXCHANGE_INVALID');
  }
  return deepFreeze({
    event_id: `combat-event:${session.combat_id}:exchange:${
      session.exchange_ordinal}:ended`,
    event_kind: 'combat_ended',
    combat_id: session.combat_id,
    source_step_ref: exchange?.proposal_id
      ? { entity_kind: 'combat_exchange', entity_id: exchange.proposal_id }
      : { entity_kind: 'combat_event', entity_id: terminalCause.event_id }
  });
}
function refKey(ref) { return `${ref?.entity_kind ?? ''}\0${ref?.entity_id ?? ''}`; }
function combatError(code) { return Object.assign(new Error(code), { code }); }
