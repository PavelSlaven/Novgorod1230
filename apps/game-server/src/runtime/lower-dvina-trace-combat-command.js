import { activateCombatSessionForPlayerIntent, combatIntentFromOperation,
  prepareCombatExchange } from '@rus/turn';
import { createTraceCombatExchangePorts } from './lower-dvina-trace-combat-exchange-ports.js';
import { projectTraceCombatWorkingState } from './lower-dvina-trace-combat-working-state.js';
import { classifyTraceActionProducedWeapons } from './lower-dvina-trace-combat-ordinary-weapon.js';
import { initializeTraceCombat } from './lower-dvina-trace-phase-4-combat-initialization.js';
import { phase8CombatParticipantBindings } from './lower-dvina-trace-phase-8-accusation-command.js';
import { projectLowerDvinaTracePlayerSafeState } from './lower-dvina-trace-player-safe-state.js';
const COMMAND_ID = 'lower_dvina_trace.respond_in_active_combat';
export function createTraceCombatCommand({ state, bundle, inputDigest, randomSource,
  npcCombatModel, actionProducedWeaponClassifier = null, revalidateStateVersion,
  temporalAdvanceOwner = null, phase8Contracts = null }) {
  if (![16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26].includes(bundle?.definition_revision)) return null;
  const playerProfiles = bundle.turn_step_bindings?.player_execution_profiles;
  const bindings = bundle.combat_semantic_bindings;
  if (!Array.isArray(playerProfiles) || !bindings) fail('TRACE_COMBAT_BINDING_GAP');
  return Object.freeze({ command_id: COMMAND_ID,
    option_id: 'respond_in_active_combat',
    label: 'Действовать в непосредственном противостоянии',
    target_id: null,
    preconditions: [{ kind: 'active_combat_player_response_or_phase8_start' }],
    expected_cost: { kind: 'combat_exchange', value: 2 },
    known_risks: ['Боевое действие может причинить вред участникам.'],
    reason_visible_to_actor: 'Непосредственное противостояние допускает боевое решение.',
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
      const current = committed ?? retrievedState;
      return availability(activeSession(current) != null
        || tracePhase8CombatStartTarget(current, phase8Contracts) != null);
    },
    async consequence({ retrievedState, semanticPlan, rootTurnId, playerInput }) {
      const session = activeSession(retrievedState);
      const raw = semanticPlan?.operations?.[0];
      if (raw?.op !== 'request_combat') fail('TRACE_COMBAT_REQUEST_INVALID');
      if (!session) return startPhase8Combat({ state: retrievedState, raw,
        playerInput, npcCombatModel, revalidateStateVersion,
        contracts: phase8Contracts, playerProfiles });
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
      const active = activateCombatSessionForPlayerIntent(session, intent),
        weaponClassifications = await classifyTraceActionProducedWeapons({
        session: active, items: retrievedState.items, classify: actionProducedWeaponClassifier, requestId: playerInput.request_id });
      const prepared = await prepareCombatExchange({
        session: active,
        working_state: projectTraceCombatWorkingState(retrievedState),
        occurred_at: retrievedState.clock,
        random_source: randomSource,
        idempotency_key: playerInput.idempotency_key,
        ports: createTraceCombatExchangePorts({ state: retrievedState, bundle, playerProfiles,
          bindings, npcCombatModel, revalidateStateVersion,
          rootTurnId, playerInput, inputDigest, session: active,
          movementBindings: null, temporalAdvanceOwner, weaponClassifications })
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
export function traceCombatPreconditionSatisfied(precondition, state,
  contracts = null) {
  return ['active_combat_player_response',
    'active_combat_player_response_or_phase8_start'].includes(precondition?.kind)
    && (activeSession(state) != null
      || tracePhase8CombatStartTarget(state, contracts) != null);
}
export function traceCombatTargetRefs(state, contracts = null) {
  const session = (state?.combat_sessions ?? []).find(({ status }) => status !== 'ended');
  const hostile = session?.participant_states?.find(({ actor_ref: actor,
    combat_status: status, current_intent: intent }) =>
    actor.entity_kind === 'npc' && status === 'active'
      && intent?.intent_kind === 'engage')?.actor_ref
    ?? session?.participant_refs?.find(({ entity_kind }) =>
      entity_kind === 'npc');
  const starter = tracePhase8CombatStartTarget(state, contracts);
  return { activeHostileNpc: hostile?.entity_id ?? starter?.instance_id ?? null,
  combatScope: session?.scope_ref?.entity_id ?? null };
}
export function tracePhase8CombatStartTarget(state, contracts) {
  const target = contracts?.actors?.zhdanko;
  if (!target || state?.position?.location_ref !== contracts.ids?.storehouse
      || state.position?.g5_anchor_id !== contracts.storehouseAnchor
      || (state.combat_sessions ?? []).some(({ status }) => status !== 'ended')
      || state.player_response_boundary != null
      || !phase8ParticipantsAtCurrentAnchor(state, contracts)) return null;
  const visible = projectLowerDvinaTracePlayerSafeState({
    committed_state: state, actor_id: state.actor_id
  }).player_safe_state.npcs ?? [];
  return visible.some(({ instance_id: id }) => id === target.instance_id)
    ? target : null;
}

function phase8ParticipantsAtCurrentAnchor(state, contracts) {
  const byId = new Map((state.npcs ?? []).map((npc) => [npc.instance_id, npc]));
  return [contracts.actors.zhdanko,
    ...phase8CombatParticipantBindings(contracts).map(({ actor }) => actor)]
    .every(({ instance_id: id }) => byId.get(id)?.anchor_id
      === state.position.g5_anchor_id);
}

async function startPhase8Combat({ state, raw, playerInput, npcCombatModel,
  revalidateStateVersion, contracts, playerProfiles }) {
  const target = tracePhase8CombatStartTarget(state, contracts);
  if (!target) fail('TRACE_PHASE_8_COMBAT_START_UNAVAILABLE');
  const operation = materializeStartOperation(raw, state, target, contracts);
  const profile = applicablePlayerProfile(operation, playerProfiles);
  if (!profile) fail('TRACE_COMBAT_PLAYER_PROFILE_NOT_APPLICABLE');
  const initialization = await initializeTraceCombat({ state,
    binding: contracts.combatBindings, actor: target,
    participantBindings: phase8CombatParticipantBindings(contracts),
    playerInput, npcCombatModel, revalidateStateVersion, combatLabel: 'zhdanko',
    movementBindings: contracts.combatMovementBindings,
    startedAt: state.clock,
    sourceEventRef: { entity_kind: 'player_combat_initiation',
      entity_id: playerInput.request_id },
    perceivedChangeSummary:
      'Жданко видит, что игрок начинает непосредственное противостояние.' });
  return { version: 1, schema: 'turn_consequence_package', status: 'resolved',
    combat_kind: 'start', phase8_kind: 'combat_start', duration_minutes: 0,
    activity_attempt_id: `combat-start:${initialization.session.combat_id}`,
    combat_initialization: initialization, visible_seed: {}, hidden_update: {},
    state_changes: [], suggested_actions: [] };
}

function materializeStartOperation(raw, state, target, contracts) {
  const known = (id) => id === state.actor_id
    ? { entity_kind: 'player_character', entity_id: state.actor_id }
    : id === target.instance_id ? { entity_kind: 'npc', entity_id: target.instance_id }
      : id === contracts.ids.storehouse
        ? { entity_kind: 'location', entity_id: contracts.ids.storehouse } : null;
  const refs = (values) => Array.isArray(values)
    ? values.map((id) => known(id) ?? fail('TRACE_COMBAT_REF_UNKNOWN')) : [];
  return { ...structuredClone(raw), actor_ref: known(raw.actor_ref)
    ?? fail('TRACE_COMBAT_REF_UNKNOWN'), target_refs: refs(raw.target_refs),
    protected_refs: refs(raw.protected_refs), scope_ref: raw.scope_ref == null
      ? null : known(raw.scope_ref) ?? fail('TRACE_COMBAT_REF_UNKNOWN'),
    destination_ref: raw.destination_ref == null ? null
      : known(raw.destination_ref) ?? fail('TRACE_COMBAT_REF_UNKNOWN') };
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
function fail(code) { throw Object.assign(new Error(code), { code }); }
