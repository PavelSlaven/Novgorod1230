import { canonicalDigest } from '@rus/materialization';
import { buildCombatDecisionSignals, buildCombatInitializationDecisionContexts,
  initializeCombatSession, orderCombatTechnicalSteps,
  resolveCombatExchangeTiming } from '@rus/turn';
import { validateNpcCombatPlanApplicability } from '@rus/npc-runtime';
import { applyTraceCombatItemTransition } from './lower-dvina-trace-combat-item-owner.js';
import { applyTraceCombatPositionTransition,
  resolveTraceCombatPositionPlan } from './lower-dvina-trace-combat-position-owner.js';
import { executeTraceCombatTraversal } from './lower-dvina-trace-combat-traversal-adapter.js';
import { traceCombatBindingForActor, traceCombatMovementBindings,
  traceCombatOperationContractForNpc } from './lower-dvina-trace-combat-bindings.js';
import { projectTraceCombatSubjectiveState,
  projectTracePerceivedCombatState } from './lower-dvina-trace-combat-subjective.js';
import { createTraceCombatTemporalSliceOwner } from './lower-dvina-trace-combat-temporal.js';
import { resolveTraceCombatWeaponDanger } from './lower-dvina-trace-combat-ordinary-weapon.js';

export function createTraceCombatExchangePorts(context) {
  return {
    advanceTemporalSlice: createTraceCombatTemporalSliceOwner({
      temporalAdvanceOwner: context.temporalAdvanceOwner,
      partyId: context.state.party_id, rootTurnId: context.rootTurnId,
      idempotencyKey: context.playerInput.idempotency_key }),
    resolveCombatTiming: (input) => resolveTraceCombatTiming(input, context),
    orderTechnicalSteps: (input) => orderCombatTechnicalSteps(input),
    resolveExecutionProfile: ({ intent, working_state: working }) =>
      resolveProfile(intent, context, working),
    applyItemTransitions: (input) => applyTraceCombatItemTransition(input,
      context),
    applyPositionTransitions: (input) =>
      applyTraceCombatPositionTransition(input, {
        session: context.session,
        executeTraversal: (request) =>
          executeTraceCombatTraversal(request, context),
        movementBindings: ['reach', 'break_contact']
          .includes(input.intent?.intent_kind)
          ? traceCombatMovementBindings(context) : null
      }),
    resolvePerceptionAndDecisionContexts: (input) =>
      resolvePostExchangeDecisions(input, context)
  };
}

function resolveProfile(intent, context, working = context.state) {
  const records = intent.actor_ref.entity_kind === 'player_character'
    ? context.playerProfiles
    : traceCombatBindingForActor(intent.actor_ref.entity_id, context)
      ?.execution_profiles;
  const profile = records?.find((entry) => entry.intent_kind === intent.intent_kind);
  if (!profile || profile.status !== 'approved') return { applicable: false };
  const positionPlan = ['reach', 'break_contact'].includes(intent.intent_kind)
    ? resolveTraceCombatPositionPlan({ intent, workingState: working,
      movementBindings: traceCombatMovementBindings(context) }) : null;
  if (['reach', 'break_contact'].includes(intent.intent_kind)
      && positionPlan == null) {
    return { applicable: false };
  }
  const weaponDanger = intent.intent_kind !== 'engage' ? undefined
    : resolveTraceCombatWeaponDanger(working?.items, intent.actor_ref, context.weaponClassifications);
  if (weaponDanger === null) return { applicable: false };
  return {
    applicable: true,
    position_plan: positionPlan == null
      ? null : structuredClone(positionPlan.proposal),
    preconditions_digest: canonicalDigest({ profile_id: profile.profile_id,
      intent_kind: intent.intent_kind }),
    check_request: profile.check_request == null ? null : {
      ...structuredClone(profile.check_request),
      ...(weaponDanger === undefined ? {} : { weapon_danger: weaponDanger }),
      attacker_id: intent.actor_ref.entity_id,
      target_id: intent.target_refs[0]?.entity_id ?? null,
      action: intent.intent_kind,
      focus: { force_limit: intent.force_limit,
        risk_posture: intent.risk_posture }
    }
  };
}

function resolveTraceCombatTiming(input, context) {
  const intent = intentForStep(context.session, input.technical_step);
  const movement = resolveTraceCombatPositionPlan({ intent,
    workingState: input.working_state,
    movementBindings: ['reach', 'break_contact'].includes(intent?.intent_kind)
      ? traceCombatMovementBindings(context) : null });
  const timingProfile = movement == null
    ? context.bindings.exchange_timing_profile
    : { profile_id: movement.proposal.movement_ref, status: 'approved',
      duration_minutes: Number(
        movement.proposal.exact_elapsed.exact_minutes.numerator) };
  return resolveCombatExchangeTiming({ requested_at: input.requested_at,
    timing_profile: timingProfile });
}

async function resolvePostExchangeDecisions(input, context) {
  const descriptors = (input.meaningful_descriptors ?? [])
    .filter(({ subject_ref: subject }) => subject?.entity_kind === 'npc');
  const signalRecords = buildCombatDecisionSignals(descriptors);
  if (input.session.status === 'ended') {
    return { working_state: input.working_state, session_after: input.session,
      decision_results: [], decision_records: [], signal_records: signalRecords };
  }
  if (descriptors.length === 0) {
    return { working_state: input.working_state, decision_results: [] };
  }
  const affected = new Set(descriptors.map(
    ({ subject_ref: subject }) => subject.entity_id));
  const npcStates = input.session.participant_states.filter((participant) =>
    participant.actor_ref.entity_kind === 'npc'
      && affected.has(participant.actor_ref.entity_id)
      && !['incapacitated', 'left', 'surrendered']
        .includes(participant.combat_status));
  if (npcStates.length === 0) {
    return { working_state: input.working_state, session_after: input.session,
      decision_results: [], decision_records: [], signal_records: signalRecords };
  }
  if (typeof context.npcCombatModel !== 'function') {
    fail('TRACE_COMBAT_DECISION_DEPENDENCY_MISSING');
  }
  const postExchangeContext = { ...context, state: input.working_state,
    session: input.session,
    movementBindings: traceCombatMovementBindings(context) };
  const contexts = buildCombatInitializationDecisionContexts({
    session: input.session,
    signal_descriptors: descriptors,
    npc_contexts: npcStates.map((participant) => {
      const operationContract = traceCombatOperationContractForNpc(
        participant.actor_ref, postExchangeContext);
      return {
      npc_ref: participant.actor_ref,
      state_version: String(input.working_state.party_state.state_version),
      current_intent: participant.current_intent,
      npc_subjective_state: projectTraceCombatSubjectiveState(
        participant.actor_ref, input.working_state),
      perceived_combat_state: projectTracePerceivedCombatState(input.session,
        input.working_state, participant.actor_ref,
        operationContract.break_contact_destination_refs),
      relevant_memory: [],
      operation_contract: operationContract,
      validate_plan: validateNpcCombatPlanApplicability,
      semantic_model: context.npcCombatModel
    }; }),
    same_time_batch_ref: { entity_kind: 'temporal_batch',
      entity_id: `combat-batch:${input.session.combat_id}:${input.session.exchange_ordinal}` },
    party_id: input.working_state.party_id,
    root_turn_id: context.rootTurnId,
    decided_at: input.occurred_at,
    exchange_ordinal: input.session.exchange_ordinal
  });
  const initialized = await initializeCombatSession({
    session: input.session,
    decision_contexts: contexts,
    semantic_model: context.npcCombatModel,
    revalidate_state_version: context.revalidateStateVersion
  });
  return { working_state: input.working_state,
    session_after: initialized.session,
    decision_results: initialized.decision_results,
    decision_records: initialized.decision_results.map((proposal) => {
      const decisionContext = contexts.find(({ request }) =>
        request.request_id === proposal.plan?.request_id);
      return { request: decisionContext.request,
        boundary: decisionContext.boundary,
        orderedSignals: decisionContext.ordered_signals,
        proposal };
    }),
    signal_records: signalRecords };
}

function intentForStep(session, step) { return session.participant_states.map(
    ({ current_intent: intent }) => intent).find(
    (intent) => intent?.intent_id === step?.intent_ref?.entity_id) ?? null;
}
function fail(code) { throw Object.assign(new Error(code), { code }); }
