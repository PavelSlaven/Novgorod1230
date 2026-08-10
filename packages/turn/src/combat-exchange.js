import {
  buildCombatExchangeProposal,
  buildCombatDecisionSignalDescriptors,
  buildCombatOutcomeEvents,
  buildCombatStepHarmPackage,
  buildCombatTechnicalStepProposal,
  validateCombatSession
} from '@rus/combat-health';
import { applyBodyStateChange, detectBodyThresholdCrossings } from '@rus/body-state';
import { executeCheck } from '@rus/checks-rng';
import { deepFreeze } from '@rus/kernel';
import {
  addElapsedTime,
  compareGameTimestamp,
  compareRationalMinutes,
  isPositiveRationalMinutes,
  normalizeElapsedTime,
  normalizeGameTimestamp
} from '@rus/time-events-history';
import { normalizeTemporalBoundaryCandidates } from
  '@rus/time-events-history/temporal-boundaries';

export function resolveCombatExchangeTiming({ requested_at: requestedAt,
  timing_profile: profile } = {}) {
  if (profile?.status !== 'approved'
      || typeof profile.profile_id !== 'string'
      || profile.profile_id.length === 0
      || !Number.isSafeInteger(profile.duration_minutes)
      || profile.duration_minutes <= 0) {
    throw combatError('TURN_COMBAT_TIMING_PROFILE_INVALID');
  }
  return deepFreeze({
    occurred_at: normalizeGameTimestamp(requestedAt),
    exact_duration: normalizeElapsedTime({
      exact_minutes: {
        numerator: String(profile.duration_minutes),
        denominator: '1'
      }
    }),
    timing_profile_ref: profile.profile_id
  });
}

export function orderCombatTechnicalSteps({ session, proposals,
  requested_at: requestedAt = session?.started_at } = {}) {
  if (!validateCombatSession(session) || !Array.isArray(proposals)
      || proposals.some((proposal) => !proposal?.proposal_id)) {
    throw combatError('TURN_COMBAT_TECHNICAL_ORDER_INVALID');
  }
  const participantOrder = new Map(session.participant_states.map(
    ({ actor_ref: actor }, index) => [refKey(actor), index]));
  const actorKeys = proposals.map(({ actor_ref: actor }) => refKey(actor));
  if (new Set(actorKeys).size !== actorKeys.length
      || actorKeys.some((key) => !participantOrder.has(key))) {
    throw combatError('TURN_COMBAT_TECHNICAL_ORDER_INVALID');
  }
  const byId = new Map(proposals.map((proposal) => [proposal.proposal_id,
    proposal]));
  const candidates = proposals.map((proposal) =>
    technicalStepTemporalCandidate(proposal, session,
      participantOrder.get(refKey(proposal.actor_ref)), requestedAt));
  return deepFreeze(normalizeTemporalBoundaryCandidates(candidates)
    .map(({ boundary_id: id }) => byId.get(id)));
}

export async function executeCombatExchange(input = {}) {
  requireActiveSession(input.session);
  if (!input.ports?.loadCommittedExchange || !input.ports?.commitExchange) {
    throw combatError('TURN_COMBAT_PORT_MISSING');
  }
  const prior = await input.ports.loadCommittedExchange({
    combat_id: input.session.combat_id,
    exchange_ordinal: input.session.exchange_ordinal + 1,
    idempotency_key: input.idempotency_key
  });
  if (prior) return deepFreeze({ status: 'replayed', committed: prior });
  const prepared = await prepareCombatExchange(input);
  return deepFreeze({ status: 'committed', committed: await input.ports.commitExchange(prepared.prepared) });
}

export async function prepareCombatExchange(input = {}) {
  const { session, working_state, occurred_at, random_source, idempotency_key,
    ports, body_threshold_profile = null } = input;
  requireActiveSession(session);
  requirePorts(ports, random_source);
  let state = structuredClone(working_state);
  const next = structuredClone(session);
  const blockedDescriptors = [];
  const proposals = buildStepProposals(next, state, ports, blockedDescriptors);
  const exchangeStartedAt = normalizeGameTimestamp(occurred_at);
  const steps = validateStepOrder(ports.orderTechnicalSteps({
    session: next,
    proposals,
    requested_at: exchangeStartedAt
  }), proposals);
  const technicalStepTimings = resolveTechnicalStepTimings({
    session: next,
    steps,
    workingState: state,
    requestedAt: exchangeStartedAt,
    resolveTiming: ports.resolveCombatTiming
  });
  const exactDuration = longestStepDuration(technicalStepTimings);
  const exchangeCompletedAt = addElapsedTime(exchangeStartedAt, exactDuration);
  const results = { checks: [], harms: [], body: [], items: [], positions: [], by_step: new Map() };

  for (const step of steps) {
    const intent = findIntent(next, step.intent_ref.entity_id);
    const profile = ports.resolveExecutionProfile({ session: next, intent, working_state: state, step });
    if (!validProfile(profile) || profile.applicable === false) {
      blockedDescriptors.push(blockedDescriptor(step, exchangeCompletedAt));
      continue;
    }
    const executed = executeStep({ step, intent, profile, state, random_source, body_threshold_profile });
    results.checks.push(...executed.checks);
    results.harms.push(...executed.harms);
    results.body.push(...executed.body);
    results.by_step.set(step.proposal_id, executed);
    const item = ports.applyItemTransitions({ step, check_result: executed.check, harm: executed.harm, working_state: state });
    validateOwnerResult(item, 'item');
    results.items.push(item ?? null);
    const position = ports.applyPositionTransitions({ step, check_result: executed.check, harm: executed.harm, working_state: item?.working_state ?? state });
    validateOwnerResult(position, 'position');
    results.positions.push(position ?? null);
    applyParticipantStatusUpdates(next,
      item?.participant_status_updates ?? [], 'item', step);
    applyParticipantStatusUpdates(next,
      position?.participant_status_updates ?? [], 'position', step);
    applyTerminalIntentStatus(next, intent, executed.check);
    state = structuredClone(position?.working_state ?? item?.working_state ?? state);
  }

  const exchange = steps.length === 0 ? null : buildCombatExchangeProposal({
    session: next, technical_steps: steps, preconditions_digest: 'combat-exchange'
  });
  const events = exchange ? steps.flatMap((step) => {
    const result = results.by_step.get(step.proposal_id);
    return buildCombatOutcomeEvents({ combat_id: next.combat_id, technical_step: step,
      check_result: result?.check ?? null, harm_package: result?.harm ?? null });
  }) : [];
  const meaningfulDescriptors = buildMeaningfulDescriptors({ results,
    blockedDescriptors, occurredAt: exchangeCompletedAt });
  next.exchange_ordinal += exchange ? 1 : 0;
  next.state_version = String(Number(next.state_version) + 1);
  next.status = meaningfulDescriptors.length > 0
    ? 'paused_for_decisions' : 'paused_for_player';
  next.player_response_required = blockedDescriptors.length === 0;
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
      || resolvedSession.state_version !== next.state_version) {
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
    meaningful_descriptors: meaningfulDescriptors
  }});
}

function buildMeaningfulDescriptors({ results, blockedDescriptors,
  occurredAt }) {
  const raw = [...blockedDescriptors,
    ...results.items.flatMap((entry) => entry?.signal_descriptors ?? []),
    ...results.body.flatMap((entry) => (entry?.threshold_crossings ?? [])
      .map((crossing) => ({ category: 'self', significance:
        crossing.value <= 25 ? 'critical' : 'material',
      source_event_ref: { entity_kind: 'body_threshold_crossing',
        entity_id: `${entry.actor_ref.entity_id}:${crossing.threshold_id}` },
      subject_ref: entry.actor_ref, scope_refs: [], perception_required: false,
      perceived_change_summary:
        'Участник ощущает существенное изменение своего физического состояния.' })))];
  return buildCombatDecisionSignalDescriptors({ occurred_at: occurredAt,
    events: raw.map((entry) => ({ ...entry, occurred_at: undefined,
      subject_ref: entry.subject_ref ?? { entity_kind: 'npc',
        entity_id: 'unknown' }, scope_refs: entry.scope_refs ?? [],
      perception_required: entry.perception_required === true,
      perceived_change_summary: entry.perceived_change_summary
        ?? 'Текущее намерение больше нельзя продолжать.' })) });
}

function buildStepProposals(session, state, ports, blocked) {
  const proposals = [];
  for (const participant of session.participant_states) {
    const intent = participant.current_intent;
    if (!intent || !['active', 'disengaging'].includes(participant.combat_status)) continue;
    const profile = ports.resolveExecutionProfile({ session, intent, working_state: state });
    if (!validProfile(profile) || profile.applicable === false) {
      blocked.push(blockedDescriptorForIntent(intent));
      continue;
    }
    proposals.push(buildCombatTechnicalStepProposal({ session, intent,
      preconditions_digest: profile.preconditions_digest, execution_profile: profile }));
  }
  return proposals;
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
function validProfile(value) { return value && typeof value === 'object' && (value.applicable === false || typeof value.preconditions_digest === 'string'); }
function validateStepOrder(steps, proposals) { if (!Array.isArray(steps) || steps.length !== proposals.length || new Set(steps.map((step) => step.proposal_id)).size !== proposals.length) throw combatError('TURN_COMBAT_TECHNICAL_ORDER_INVALID'); return steps; }
function findIntent(session, intentId) { return session.participant_states.find((participant) => participant.current_intent?.intent_id === intentId)?.current_intent; }
function validateOwnerResult(value, owner) { if (value !== undefined && (value === null || typeof value !== 'object')) throw combatError(`TURN_COMBAT_${owner.toUpperCase()}_OWNER_INVALID`); }
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
    if (update.clear_intent === true) participant.current_intent = null;
  }
}
function applyTerminalIntentStatus(session, intent, check) {
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
  } else if (intent.intent_kind === 'cease_hostility') {
    participant.current_intent = null;
  }
}
function blockedDescriptor(step, occurred_at) { return { category: 'objective', significance: 'material', source_event_ref: { entity_kind: 'combat_technical_step', entity_id: step.proposal_id }, subject_ref: step.actor_ref, occurred_at }; }
function blockedDescriptorForIntent(intent) { return { category: 'objective', significance: 'material', source_event_ref: { entity_kind: 'combat_intent', entity_id: intent.intent_id }, subject_ref: intent.actor_ref, occurred_at: null }; }
function resolveTechnicalStepTimings({ session, steps, workingState,
  requestedAt, resolveTiming }) {
  return deepFreeze(steps.map((step) => {
    const raw = resolveTiming({ session, working_state: workingState,
      requested_at: requestedAt, technical_step: step });
    if (!raw?.occurred_at || !raw?.exact_duration
        || compareGameTimestamp(raw.occurred_at, requestedAt) !== 0) {
      throw combatError('TURN_COMBAT_TIME_OWNER_INVALID');
    }
    const exactDuration = normalizeElapsedTime(raw.exact_duration);
    if (!isPositiveRationalMinutes(exactDuration.exact_minutes)) {
      throw combatError('TURN_COMBAT_TIME_OWNER_INVALID');
    }
    return { technical_step_ref: { entity_kind: 'combat_technical_step',
      entity_id: step.proposal_id }, occurred_at: normalizeGameTimestamp(
      raw.occurred_at), exact_duration: exactDuration,
    timing_profile_ref: raw.timing_profile_ref ?? null };
  }));
}
function longestStepDuration(timings) {
  const zero = normalizeElapsedTime({ exact_minutes: {
    numerator: '0', denominator: '1' } });
  return timings.reduce((longest, { exact_duration: current }) =>
    compareRationalMinutes(current.exact_minutes, longest.exact_minutes) > 0
      ? current : longest, zero);
}
function technicalStepTemporalCandidate(proposal, session, ordinal,
  requestedAt) {
  const orderId = String(ordinal).padStart(8, '0');
  return {
    boundary_id: proposal.proposal_id,
    boundary_kind: 'combat_technical_step',
    scheduled_at: normalizeGameTimestamp(requestedAt),
    source_ref: proposal.intent_ref,
    primary_subject_ref: proposal.actor_ref,
    subject_refs: [proposal.actor_ref],
    scope_ref: session.scope_ref,
    rule_ref: { entity_ref: { entity_kind: 'combat_participant_precedence',
      entity_id: `combat-order:${orderId}` }, authoring_version: '1' },
    policy_ref: { entity_ref: { entity_kind: 'temporal_policy',
      entity_id: 'combat-due-step-order-v1' }, authoring_version: '1' },
    preconditions_digest: proposal.preconditions_digest ?? proposal.proposal_id,
    resolution_class: 'execution_outcome',
    interrupt_effect: 'interruptible',
    visibility_policy_ref: { entity_ref: {
      entity_kind: 'visibility_policy', entity_id: 'combat-step-v1' },
    authoring_version: '1' },
    idempotency_key: proposal.idempotency_key ?? proposal.proposal_id,
    causal_parent_refs: []
  };
}
function refKey(ref) { return `${ref?.entity_kind ?? ''}\0${ref?.entity_id ?? ''}`; }
function combatError(code) { return Object.assign(new Error(code), { code }); }
