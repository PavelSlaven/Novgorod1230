import { buildCombatStepHarmPackage } from '@rus/combat-health';
import { applyBodyStateChange, detectBodyThresholdCrossings } from
  '@rus/body-state';
import { executeCheck } from '@rus/checks-rng';
import { recordCombatBlockedStep } from './combat-blocked-events.js';
import { clearCombatStepProgress, timingForCombatStep } from
  './combat-temporal-steps.js';

export function resolveDueCombatStep({ step, workingState, occurredAt,
  exactDuration, synchronizedSliceResultId, session, timings, ports,
  randomSource, bodyThresholdProfile, blockedDescriptors, blockedStepEvents,
  results }) {
  let state = clearCombatStepProgress(structuredClone(workingState), step);
  const intent = findCombatIntent(session, step.intent_ref.entity_id);
  if (!currentCombatStepApplicable(session, step, intent, state)) {
    recordCombatBlockedStep({ session, step, intent, occurredAt,
      descriptors: blockedDescriptors, events: blockedStepEvents });
    return projectCombatSession(state, session);
  }
  const profile = ports.resolveExecutionProfile({ session, intent,
    working_state: state, step });
  if (!validCombatExecutionProfile(profile) || profile.applicable === false) {
    recordCombatBlockedStep({ session, step, intent, occurredAt,
      descriptors: blockedDescriptors, events: blockedStepEvents });
    return projectCombatSession(state, session);
  }
  const executed = executeStep({ step, intent, profile, state,
    randomSource, bodyThresholdProfile });
  applyBodyTerminalStatuses(session, executed.body);
  results.checks.push(...executed.checks);
  results.harms.push(...executed.harms);
  results.body.push(...executed.body);
  results.by_step.set(step.proposal_id, executed);
  const item = ports.applyItemTransitions({ step, intent,
    check_result: executed.check, harm: executed.harm, working_state: state });
  validateCombatOwnerResult(item, 'item');
  validateCombatOwnerEvents(item?.outcome_events, step, session);
  results.items.push(item ?? null);
  const position = ports.applyPositionTransitions({ step, intent,
    check_result: executed.check, harm: executed.harm,
    working_state: item?.working_state ?? state,
    temporal_slice: { exact_duration: structuredClone(exactDuration),
      step_duration: structuredClone(timingForCombatStep(
        timings, step).exact_duration), completion_due: true,
      clock_commit_mode: 'shared_root_transport_clock',
      synchronized_time_slice_result_id: synchronizedSliceResultId } });
  validateCombatOwnerResult(position, 'position');
  validateCombatOwnerEvents(position?.outcome_events, step, session);
  results.positions.push(position ?? null);
  executed.item = item ?? null;
  executed.position = position ?? null;
  applyParticipantStatusUpdates(session,
    item?.participant_status_updates ?? [], 'item', step);
  applyParticipantStatusUpdates(session,
    position?.participant_status_updates ?? [], 'position', step);
  applyTerminalIntentStatus(session, intent, executed.check, position);
  state = structuredClone(
    position?.working_state ?? item?.working_state ?? state);
  return projectCombatSession(state, session);
}

export function currentCombatStepApplicable(session, step, intent,
  workingState) {
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

export function findCombatIntent(session, intentId) {
  return session.participant_states.find((participant) =>
    participant.current_intent?.intent_id === intentId)?.current_intent;
}

export function validCombatExecutionProfile(value) {
  return value && typeof value === 'object'
    && (value.applicable === false
      || typeof value.preconditions_digest === 'string');
}

export function validateCombatOwnerResult(value, owner) {
  if (value !== undefined
      && (value === null || typeof value !== 'object')) {
    fail(`TURN_COMBAT_${owner.toUpperCase()}_OWNER_INVALID`);
  }
}

export function validateCombatOwnerEvents(events = [], step, session) {
  if (!Array.isArray(events) || events.some((event) =>
    typeof event?.event_id !== 'string' || event.event_id.length === 0
    || typeof event.event_kind !== 'string' || event.event_kind.length === 0
    || event.combat_id !== session.combat_id
    || event.source_step_ref?.entity_kind !== 'combat_technical_step'
    || event.source_step_ref.entity_id !== step.proposal_id)) {
    fail('TURN_COMBAT_DOMAIN_EVENT_INVALID');
  }
}

function executeStep({ step, intent, profile, state, randomSource,
  bodyThresholdProfile }) {
  const check = step.check_request === null ? null : executeCheck({
    ...step.check_request, check_id: `combat-check:${step.proposal_id}`,
    difficulty: step.check_request.target_defense }, randomSource);
  const harm = step.step_kind === 'attack' && check
    ? buildCombatStepHarmPackage({ check_result: check,
      attack_request: step.check_request }) : null;
  const body = [];
  if (harm?.health_loss > 0) {
    const target = intent.target_refs[0];
    const actor = state.actor_states?.[
      `${target.entity_kind}:${target.entity_id}`];
    if (actor?.body_state) {
      const before = actor.body_state;
      const after = applyBodyStateChange(before,
        { harm: { health: harm.health_loss } });
      actor.body_state = after;
      body.push({ actor_ref: target, body_before: before, body_after: after,
        threshold_crossings: bodyThresholdProfile
          ? detectBodyThresholdCrossings({ before, after,
            thresholds: bodyThresholdProfile.thresholds }) : [] });
    }
  }
  return { check, harm, checks: check ? [check] : [],
    harms: harm ? [harm] : [], body };
}

function actorHasNoHealth(actor, workingState) {
  const health = workingState.actor_states?.[
    `${actor.entity_kind}:${actor.entity_id}`]?.body_state?.health;
  return Number.isFinite(Number(health)) && Number(health) <= 0;
}

function projectCombatSession(workingState, session) {
  if (!Array.isArray(workingState.combat_sessions)) return workingState;
  const sessions = workingState.combat_sessions.map((entry) =>
    entry.combat_id === session.combat_id ? structuredClone(session) : entry);
  if (!sessions.some(({ combat_id: id }) => id === session.combat_id)) {
    sessions.push(structuredClone(session));
  }
  return { ...workingState, combat_sessions: sessions };
}

function applyBodyTerminalStatuses(session, bodyTransitions) {
  for (const transition of bodyTransitions) {
    if (Number(transition.body_after?.health) > 0) continue;
    const participant = session.participant_states.find(({ actor_ref }) =>
      refKey(actor_ref) === refKey(transition.actor_ref));
    if (!participant) fail('TURN_COMBAT_BODY_TARGET_INVALID');
    participant.combat_status = 'incapacitated';
    participant.current_intent = null;
    participant.next_action_boundary_ref = null;
  }
}

function applyParticipantStatusUpdates(session, updates, owner, step) {
  if (!Array.isArray(updates)) fail('TURN_COMBAT_DOMAIN_OWNER_INVALID');
  for (const update of updates) {
    const participant = session.participant_states.find(({ actor_ref }) =>
      actor_ref.entity_kind === update?.actor_ref?.entity_kind
      && actor_ref.entity_id === update?.actor_ref?.entity_id);
    if (!participant || !['active','disengaging','restrained','surrendered',
      'incapacitated','left'].includes(update.combat_status)) {
      fail('TURN_COMBAT_DOMAIN_OWNER_INVALID');
    }
    if (update.combat_status === 'left'
        && (owner !== 'position'
          || update.actor_ref.entity_kind !== step.actor_ref.entity_kind
          || update.actor_ref.entity_id !== step.actor_ref.entity_id
          || participant.current_intent?.intent_kind !== 'break_contact')) {
      fail('TURN_COMBAT_DOMAIN_OWNER_INVALID');
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
  const participant = session.participant_states.find(({ actor_ref }) =>
    actor_ref.entity_kind === intent.actor_ref.entity_kind
    && actor_ref.entity_id === intent.actor_ref.entity_id);
  if (!participant) fail('TURN_COMBAT_ACTOR_NOT_ACTIVE');
  if (intent.intent_kind === 'surrender') {
    participant.combat_status = 'surrendered';
    participant.current_intent = null;
  } else if (intent.intent_kind === 'break_contact') {
    if (participant.combat_status === 'left') participant.current_intent = null;
    else participant.combat_status = 'disengaging';
  } else if (intent.intent_kind === 'reach'
      && position?.completed_intent === true) {
    participant.current_intent = { ...participant.current_intent,
      status: 'completed' };
  } else if (intent.intent_kind === 'cease_hostility') {
    participant.current_intent = null;
  }
}

const refKey = (ref) => `${ref?.entity_kind ?? ''}\0${
  ref?.entity_id ?? ''}`;
function fail(code) { throw Object.assign(new Error(code), { code }); }
