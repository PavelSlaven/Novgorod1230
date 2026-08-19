import { canonicalDigest } from '@rus/materialization';
import { activateCombatSessionForPlayerIntent, buildCombatDecisionSignals, buildCombatInitializationDecisionContexts, combatIntentFromOperation, initializeCombatSession, orderCombatTechnicalSteps, prepareCombatExchange, resolveCombatExchangeTiming } from '@rus/turn';
import { validateNpcCombatPlanApplicability } from '@rus/npc-runtime';
import { applyTraceCombatItemTransition } from './lower-dvina-trace-combat-item-owner.js';
import { applyTraceCombatPositionTransition, resolveTraceCombatPositionPlan } from './lower-dvina-trace-combat-position-owner.js';
import { executeTraceCombatTraversal } from './lower-dvina-trace-combat-traversal-adapter.js';
import { traceCombatBindingForActor, traceCombatMovementBindings, traceCombatOperationContractForNpc } from './lower-dvina-trace-combat-bindings.js';
import { projectTraceCombatSubjectiveState, projectTracePerceivedCombatState } from './lower-dvina-trace-combat-subjective.js';
import { projectTraceCombatWorkingState } from './lower-dvina-trace-combat-working-state.js';
import { createTraceCombatTemporalSliceOwner } from './lower-dvina-trace-combat-temporal.js';
import { resolveTraceOrdinaryWeaponDanger } from './lower-dvina-trace-combat-ordinary-weapon.js';
const COMMAND_ID = 'lower_dvina_trace.respond_in_active_combat';
export function createTraceCombatCommand({ state, bundle, inputDigest, randomSource,
  npcCombatModel, revalidateStateVersion, temporalAdvanceOwner = null }) {
  if (![16, 17, 18, 19].includes(bundle?.definition_revision)) return null;
  const playerProfiles = bundle.turn_step_bindings?.player_execution_profiles;
  const bindings = bundle.combat_semantic_bindings;
  if (!Array.isArray(playerProfiles) || !bindings) fail('TRACE_COMBAT_BINDING_GAP');
  return Object.freeze({ command_id: COMMAND_ID,
    option_id: 'respond_in_active_combat',
    label: 'Ответить на непосредственную угрозу',
    target_id: null,
    preconditions: [{ kind: 'active_combat_player_response' }],
    expected_cost: { kind: 'combat_exchange', value: 2 },
    known_risks: ['Боевое действие может причинить вред участникам.'],
    reason_visible_to_actor: 'Активная боевая сцена ждёт решения игрока.',
    mode: {
      selected_primary_mode: 'combat',
      secondary_modes: ['body_recovery', 'item_property', 'movement_route',
        'time_progression'],
      resolution_plan: {
        subsystems: ['combat_resolution', 'body_state', 'inventory',
          'movement', 'time_progression', 'visible_context_projection'],
        checks_to_run: [],
        expected_writes: ['party_state', 'party_npcs', 'party_items',
          'party_visible_context_package'],
        state_blocks_to_load: ['party_state', 'current_position',
          'clock_weather_light', 'relevant_items', 'relevant_npcs',
          'relevant_events', 'recent_changes_log']
      }
    },
    matches() { return false; }, availability({ committed_state: committed,
      retrievedState }) {
      const current = activeSession(committed ?? retrievedState);
      return availability(current != null);
    },
    async consequence({ retrievedState, semanticPlan, rootTurnId, playerInput }) {
      const session = activeSession(retrievedState);
      const raw = semanticPlan?.operations?.[0];
      if (!session || raw?.op !== 'request_combat') fail('TRACE_COMBAT_REQUEST_INVALID');
      const operation = materializeOperation(raw, session);
      const profile = applicablePlayerProfile(operation, playerProfiles);
      if (!profile) fail('TRACE_COMBAT_PLAYER_PROFILE_NOT_APPLICABLE');
      const intent = combatIntentFromOperation(operation, {
        combat_id: session.combat_id,
        intent_id: `combat-intent:${playerInput.request_id}`,
        created_from_boundary_ref: {
          entity_kind: 'player_combat_response_boundary',
          entity_id: `combat-response:${session.combat_id}:${session.exchange_ordinal}`
        },
        state_version: session.state_version
      });
      const active = activateCombatSessionForPlayerIntent(session, intent);
      const prepared = await prepareCombatExchange({
        session: active,
        working_state: projectTraceCombatWorkingState(retrievedState),
        occurred_at: retrievedState.clock,
        random_source: randomSource,
        idempotency_key: playerInput.idempotency_key,
        ports: exchangePorts({ state: retrievedState, bundle, playerProfiles,
          bindings, npcCombatModel, revalidateStateVersion,
          rootTurnId, playerInput, inputDigest, session: active,
          movementBindings: null, temporalAdvanceOwner })
      });
      const exchange = prepared.prepared;
      return {
        version: 1,
        schema: 'turn_consequence_package',
        status: 'resolved',
        combat_kind: 'exchange',
        activity_attempt_id: exchange.exchange?.proposal_id
          ?? `combat-exchange:${session.combat_id}:${session.exchange_ordinal}`,
        body_effect_ref: exchange.body_transitions.length > 0
          ? 'combat_harm' : null,
        duration_minutes: Number(exchange.exact_duration.exact_minutes.numerator),
        combat: exchange,
        visible_seed: {}, hidden_update: {}, state_changes: [],
        suggested_actions: []
      };
    },
    writeTargets(input) {
      return [{ target: 'party_state', value: {
        player_input: input.playerInput,
        mode_resolution: input.modeResolution,
        availability: input.availability,
        consequence: input.consequence,
        time_update: input.timeUpdate,
        body_update: input.bodyUpdate,
        hidden_update: input.hiddenUpdate
      } }, { target: 'party_visible_context_package', value: input.visibleContext }];
    }
  });
}
export function traceCombatPreconditionSatisfied(precondition, state) {
  return precondition?.kind === 'active_combat_player_response'
    && activeSession(state) != null;
}
export function traceCombatTargetRefs(state) {
  const session = (state?.combat_sessions ?? []).find(({ status }) => status !== 'ended');
  const hostile = session?.participant_states?.find(({ actor_ref: actor,
    combat_status: status, current_intent: intent }) =>
    actor.entity_kind === 'npc' && status === 'active'
      && intent?.intent_kind === 'engage')?.actor_ref
    ?? session?.participant_refs?.find(({ entity_kind }) =>
      entity_kind === 'npc');
  return { activeHostileNpc: hostile?.entity_id ?? null,
  combatScope: session?.scope_ref?.entity_id ?? null };
}
function exchangePorts(context) {
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
  const profile = records?.find(
    (entry) => entry.intent_kind === intent.intent_kind);
  if (!profile || profile.status !== 'approved') return { applicable: false };
  const positionPlan = ['reach', 'break_contact'].includes(intent.intent_kind)
    ? resolveTraceCombatPositionPlan({ intent, workingState: working,
      movementBindings: traceCombatMovementBindings(context) }) : null;
  if (['reach', 'break_contact'].includes(intent.intent_kind)
      && positionPlan == null) {
    return { applicable: false };
  }
  const weaponDanger = intent.intent_kind === 'engage'
    ? resolveTraceOrdinaryWeaponDanger(working?.items, intent.actor_ref)
    : undefined;
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
function activeSession(state) { const open = (state?.combat_sessions ?? [])
  .filter(({ status }) => status !== 'ended');
  return open.length === 1 && open[0].status === 'paused_for_player'
    && open[0].player_response_required === true ? open[0] : null;
}
function availability(canAttempt) { return { version: 1,
  schema: 'turn_availability_decision', status: canAttempt ? 'available' : 'blocked',
  can_attempt: canAttempt, reasons: canAttempt ? [] : ['active_combat_missing'],
  check_requests: [] }; }
function materializeOperation(raw, session) {
  const byId = new Map(session.participant_refs.map((ref) => [ref.entity_id,
    ref]));
  const known = (id) => byId.get(id) ?? (id === session.scope_ref.entity_id
    ? session.scope_ref : null);
  const refs = (values) => values.map((id) => known(id) ?? fail('TRACE_COMBAT_REF_UNKNOWN'));
  return { ...structuredClone(raw), actor_ref: known(raw.actor_ref),
    target_refs: refs(raw.target_refs), protected_refs: refs(raw.protected_refs),
    scope_ref: raw.scope_ref == null ? null : known(raw.scope_ref),
    destination_ref: raw.destination_ref == null ? null
      : known(raw.destination_ref) };
}
function applicablePlayerProfile(operation, profiles) { return profiles.find(
    (profile) => profile.intent_kind === operation.intent_kind
    && profile.status === 'approved'
    && profile.allowed_force_limits.includes(operation.force_limit)
    && profile.allowed_risk_postures.includes(operation.risk_posture)) ?? null;
}
function intentForStep(session, step) { return session.participant_states.map(
    ({ current_intent: intent }) => intent).find(
    (intent) => intent?.intent_id === step?.intent_ref?.entity_id) ?? null;
}
function fail(code) { throw Object.assign(new Error(code), { code }); }
