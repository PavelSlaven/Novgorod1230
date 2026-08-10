import { canonicalDigest } from '@rus/materialization';
import {
  activateCombatSessionForPlayerIntent,
  combatIntentFromOperation,
  initializeCombatSession,
  prepareCombatExchange,
  resolveCombatExchangeTiming
} from '@rus/turn';
import { buildCombatInitializationDecisionContexts } from '@rus/turn';
import { validateNpcCombatPlanApplicability } from '@rus/npc-runtime';
import { applyTraceCombatItemTransition } from
  './lower-dvina-trace-combat-item-owner.js';
const COMMAND_ID = 'lower_dvina_trace.respond_in_active_combat';
export function createTraceCombatCommand({ state, bundle, inputDigest,
  randomSource, npcCombatModel, revalidateStateVersion }) {
  if (bundle?.definition_revision !== 16) return null;
  const playerProfiles = bundle.turn_step_bindings?.player_execution_profiles;
  const bindings = bundle.combat_semantic_bindings;
  if (!Array.isArray(playerProfiles) || !bindings) fail('TRACE_COMBAT_BINDING_GAP');
  return Object.freeze({
    command_id: COMMAND_ID,
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
    matches() { return false; },
    availability({ committed_state: committed, retrievedState }) {
      const current = activeSession(committed ?? retrievedState);
      return availability(current != null);
    },
    async consequence({ retrievedState, semanticPlan, rootTurnId,
      playerInput }) {
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
        working_state: combatWorkingState(retrievedState),
        occurred_at: retrievedState.clock,
        random_source: randomSource,
        idempotency_key: playerInput.idempotency_key,
        body_threshold_profile: { thresholds: [75, 50, 25, 0].map(
          (value) => ({ threshold_id: `health-${value}`,
            metric: 'health', direction: 'decrease', value })) },
        ports: exchangePorts({ state: retrievedState, bundle, playerProfiles,
          bindings, npcCombatModel, revalidateStateVersion,
          rootTurnId, playerInput, session: active })
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
  const session = (state?.combat_sessions ?? []).find(
    ({ status }) => status !== 'ended');
  return { activeHostileNpc: session?.participant_refs?.find(
    ({ entity_kind: kind }) => kind === 'npc')?.entity_id ?? null,
  combatScope: session?.scope_ref?.entity_id ?? null };
}
function exchangePorts(context) {
  return {
    resolveCombatTiming: ({ requested_at: requestedAt }) =>
      resolveCombatExchangeTiming({
        requested_at: requestedAt,
        timing_profile: context.bindings.exchange_timing_profile
      }),
    resolveExecutionProfile: ({ intent }) => resolveProfile(intent, context),
    applyItemTransitions: (input) => applyTraceCombatItemTransition(input,
      context),
    applyPositionTransitions: ({ working_state: working }) => ({
      working_state: structuredClone(working), participant_status_updates: []
    }),
    resolvePerceptionAndDecisionContexts: (input) =>
      resolvePostExchangeDecisions(input, context)
  };
}
function resolveProfile(intent, context) {
  const records = intent.actor_ref.entity_kind === 'player_character'
    ? context.playerProfiles
    : bindingForActor(intent.actor_ref.entity_id, context)?.execution_profiles;
  const profile = records?.find((entry) => entry.intent_kind === intent.intent_kind);
  if (!profile || profile.status !== 'approved') return { applicable: false };
  return {
    applicable: true,
    preconditions_digest: canonicalDigest({ profile_id: profile.profile_id,
      intent_kind: intent.intent_kind }),
    check_request: profile.check_request == null ? null : {
      ...structuredClone(profile.check_request),
      attacker_id: intent.actor_ref.entity_id,
      target_id: intent.target_refs[0]?.entity_id ?? null,
      action: intent.intent_kind,
      focus: { force_limit: intent.force_limit, risk_posture: intent.risk_posture }
    }
  };
}

async function resolvePostExchangeDecisions(input, context) {
  const descriptors = (input.meaningful_descriptors ?? [])
    .filter(({ subject_ref: subject }) => subject?.entity_kind === 'npc');
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
  if (npcStates.length === 0 || typeof context.npcCombatModel !== 'function') {
    fail('TRACE_COMBAT_DECISION_DEPENDENCY_MISSING');
  }
  const contexts = buildCombatInitializationDecisionContexts({
    session: input.session,
    signal_descriptors: descriptors,
    npc_contexts: npcStates.map((participant) => ({
      npc_ref: participant.actor_ref,
      state_version: String(context.state.party_state.state_version),
      current_intent: participant.current_intent,
      npc_subjective_state: subjectiveState(participant.actor_ref, context.state),
      perceived_combat_state: perceivedCombatState(input.session),
      relevant_memory: [],
      operation_contract: operationContractForNpc(participant.actor_ref, context),
      validate_plan: validateNpcCombatPlanApplicability,
      semantic_model: context.npcCombatModel
    })),
    same_time_batch_ref: { entity_kind: 'temporal_batch',
      entity_id: `combat-batch:${input.session.combat_id}:${input.session.exchange_ordinal}` },
    party_id: context.state.party_id,
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
    signal_records: contexts.flatMap((entry) => entry.ordered_signals) };
}

function activeSession(state) {
  const open = (state?.combat_sessions ?? []).filter(({ status }) => status !== 'ended');
  return open.length === 1 && open[0].status === 'paused_for_player'
    && open[0].player_response_required === true ? open[0] : null;
}
function availability(canAttempt) { return { version: 1,
  schema: 'turn_availability_decision', status: canAttempt ? 'available' : 'blocked',
  can_attempt: canAttempt, reasons: canAttempt ? [] : ['active_combat_missing'],
  check_requests: [] }; }
function materializeOperation(raw, session) {
  const byId = new Map(session.participant_refs.map((ref) => [ref.entity_id, ref]));
  const known = (id) => byId.get(id) ?? (id === session.scope_ref.entity_id
    ? session.scope_ref : null);
  const refs = (values) => values.map((id) => known(id) ?? fail('TRACE_COMBAT_REF_UNKNOWN'));
  return { ...structuredClone(raw), actor_ref: known(raw.actor_ref),
    target_refs: refs(raw.target_refs), protected_refs: refs(raw.protected_refs),
    scope_ref: raw.scope_ref == null ? null : known(raw.scope_ref),
    destination_ref: raw.destination_ref == null ? null : known(raw.destination_ref) };
}
function applicablePlayerProfile(operation, profiles) {
  return profiles.find((profile) => profile.intent_kind === operation.intent_kind
    && profile.status === 'approved'
    && profile.allowed_force_limits.includes(operation.force_limit)
    && profile.allowed_risk_postures.includes(operation.risk_posture)) ?? null;
}
function combatWorkingState(state) {
  const actor_states = {
    [`player_character\0${state.actor_id}`]: { body_state: structuredClone(state.body_state) }
  };
  for (const npc of state.npcs ?? []) actor_states[`npc\0${npc.instance_id}`] = {
    body_state: { health: Number(npc.machine_state?.body_condition?.health ?? 100),
      energy: null, satiety: null, active_conditions: [], body_parts: {}, prose: null }
  };
  return { ...structuredClone(state), actor_states };
}
function bindingForActor(actorId, context) {
  const npc = context.state.npcs?.find(({ instance_id: id }) => id === actorId);
  const slot = npc?.participant_slot_ref;
  const phase8 = context.bindings.phase_8;
  if (context.session?.scope_ref?.entity_id === phase8?.scope_location_ref) {
    if (slot === phase8.actor_slot) return phase8;
    return phase8.participant_roles?.[
      /^background_fisher_[12]$/.test(slot) ? 'participating_fisher' : slot]
      ?? null;
  }
  return slot === context.bindings.phase_4?.actor_slot
    ? context.bindings.phase_4 : null;
}
function operationContractForNpc(actorRef, context) {
  const binding = bindingForActor(actorRef.entity_id, context);
  if (!binding) fail('TRACE_COMBAT_NPC_BINDING_GAP');
  const primary = context.state.npcs?.find(({ participant_slot_ref: value }) =>
    value === context.bindings.phase_8?.actor_slot);
  const ally = binding !== context.bindings.phase_8;
  const opponents = ally && primary ? [{ entity_kind: 'npc',
    entity_id: primary.instance_id }] : context.state.actor_id == null ? [] : [{
    entity_kind: 'player_character', entity_id: context.state.actor_id }];
  const scope = binding.scope_location_ref
    ?? context.bindings.phase_8?.scope_location_ref;
  return { ...structuredClone(binding.operation_contract),
    engageable_actor_refs: opponents, controllable_actor_refs: opponents,
    protectable_refs: ally ? [{ entity_kind: 'player_character',
      entity_id: context.state.actor_id }] : [], holdable_scope_refs: [
      { entity_kind: 'location', entity_id: scope }],
    reachable_destination_refs: [], break_contact_destination_refs: [] };
}
function subjectiveState(actorRef, state) {
  const npc = state.npcs?.find(({ instance_id: id }) => id === actorRef.entity_id);
  return { identity: { name_or_label: npc?.semantic_profile?.identity?.canonical_name
    ?? npc?.participant_slot_ref ?? 'NPC' }, social_role: {}, combat_experience: 'limited',
  attributes: [], skills: [], body: structuredClone(npc?.machine_state?.body_condition ?? {}),
  mood: {}, temperament: [], goals: [], fears: [], obligations: [], relationships: [],
  available_equipment: [] };
}
function perceivedCombatState(session) { return { scope: session.scope_ref,
  visible_opponents: session.participant_refs.filter((ref) => ref.entity_kind === 'player_character'),
  visible_allies: [], visible_neutral_actors: [], recognized_weapons: [],
  known_positions: [], known_exits: [], visible_cover: [], perceived_hazards: [],
  recent_perceived_events: [], uncertainties: [] }; }
function fail(code) { throw Object.assign(new Error(code), { code }); }
