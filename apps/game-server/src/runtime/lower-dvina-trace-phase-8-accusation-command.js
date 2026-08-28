import { initializeTraceCombatHandoff } from
  './lower-dvina-trace-phase-4-combat-initialization.js';
import { prepareTracePhase8PlayerPlan, resolveTracePhase8Conversation } from
  './lower-dvina-trace-phase-8-conversation.js';

const COMMAND_ID = 'lower_dvina_trace.accuse_zhdanko_at_storehouse';

export function createTracePhase8AccusationCommand({ contracts, inputDigest,
  playerConversationModel, npcSemanticModel, npcCombatModel,
  temporalAdvanceOwner, revalidateStateVersion }) {
  return Object.freeze({ command_id: COMMAND_ID,
    option_id: 'accuse_zhdanko_at_storehouse',
    label: 'Предъявить Жданко обвинение и потребовать отдать сумку',
    target_id: contracts.actors.zhdanko.instance_id,
    approved_record: contracts.activityPins.find(
      ({ id }) => id === contracts.accusationActivity.profile_id),
    preconditions: [{ kind: 'phase8_accusation_available' }],
    expected_cost: { kind: 'exact_time', value: 5 },
    known_risks: ['Вооружённый Жданко может прекратить разговор.'],
    reason_visible_to_actor: 'Жданко находится перед группой у клети.',
    mode: { selected_primary_mode: 'social_npc', secondary_modes: [],
      resolution_plan: { subsystems: ['npc_interaction', 'time_progression'],
        checks_to_run: [], expected_writes: ['party_state',
          'party_visible_context_package'], state_blocks_to_load: [
          'party_state', 'current_position', 'relevant_npcs'] } },
    matches: () => false,
    async availability(context) {
      const state = context.committed_state ?? context.retrievedState;
      const allowed = accusationAvailable(state, contracts);
      if (!allowed || context.action_set_evaluation === true) {
        return decision(allowed, []);
      }
      const plan = await prepareTracePhase8PlayerPlan({ state, contracts,
        playerInput: context.playerInput, inputDigest,
        playerConversationModel, npcSemanticModel, temporalAdvanceOwner,
        revalidateStateVersion });
      return decision(true, [{ schema:
        'rus.trace_player_conversation_plan_stage.v1', plan }]);
    },
    async consequence({ retrievedState: state, availability, playerInput }) {
      const playerPlan = availability.causal_stages?.find(({ schema }) =>
        schema === 'rus.trace_player_conversation_plan_stage.v1')?.plan;
      if (!playerPlan) fail('TRACE_PHASE_8_PLAYER_PLAN_MISSING');
      const semantic = await resolveTracePhase8Conversation({ state, contracts,
        playerInput, inputDigest, playerPlan, playerConversationModel,
        npcSemanticModel, temporalAdvanceOwner, revalidateStateVersion });
      const combat = semantic.response_kind !== 'combat_handoff' ? null
        : await initializeTraceCombatHandoff({ state,
          binding: contracts.combatBindings,
          actor: contracts.actors.zhdanko,
          participantBindings: companionBindings(contracts),
          semanticExchange: semantic, playerInput, npcCombatModel,
          revalidateStateVersion, combatLabel: 'zhdanko',
          movementBindings: contracts.combatMovementBindings,
          perceivedChangeSummary:
            'Жданко видит, что обвинение перешло к непосредственному противостоянию.' });
      assertStrictJson(semantic, 'semantic_exchange');
      assertStrictJson(combat, 'combat_initialization');
      return { version: 1, schema: 'turn_consequence_package',
        status: 'resolved', activity_attempt_id:
          `attempt:${inputDigest.slice(0, 32)}`,
        duration_minutes: semantic.exact_elapsed_minutes,
        phase8_kind: 'accusation', accusation: {
          activity_ref: contracts.accusationActivity.profile_id,
          semantic_exchange: semantic,
          combat_initialization: structuredClone(combat),
          response_kind: semantic.response_kind,
          objective_fact_outputs: [], activity_roots: [{
            activity_ref: contracts.accusationActivity.profile_id,
            duration_minutes: semantic.exchange.time_budget.total_minutes }] },
        visible_seed: {}, hidden_update: {}, state_changes: [],
        suggested_actions: [] };
    },
    writeTargets(input) { return [{ target: 'party_state', value: {
      player_input: input.playerInput, mode_resolution: input.modeResolution,
      availability: input.availability, consequence: input.consequence,
      time_update: input.timeUpdate, body_update: input.bodyUpdate,
      hidden_update: input.hiddenUpdate } }, {
      target: 'party_visible_context_package', value: input.visibleContext }]; }
  });
}

export function tracePhase8AccusationPreconditionSatisfied(precondition,
  state, contracts) {
  return precondition?.kind === 'phase8_accusation_available'
    && accusationAvailable(state, contracts);
}

function companionBindings(contracts) {
  const roles = contracts.combatBindings.participant_roles;
  return [{ actor: contracts.actors.eremey,
    binding: roleBinding(roles.eremey_fisher, contracts),
    perceivedChangeSummary:
      'Еремей видит вооружённое сопротивление Жданко после обвинения.' },
  { actor: contracts.actors.ratsha,
    binding: roleBinding(roles.ratsha_storehouse_helper, contracts),
    perceivedChangeSummary:
      'Ратша видит вооружённое сопротивление Жданко рядом с сумкой.' },
  ...contracts.participatingFishers.map((actor) => ({ actor,
    binding: roleBinding(roles.participating_fisher, contracts),
    perceivedChangeSummary:
      'Рыбак видит вооружённое сопротивление Жданко перед группой.' }))];
}
function roleBinding(role, contracts) {
  if (!role?.operation_contract || !Array.isArray(role.execution_profiles)) {
    fail('TRACE_PHASE_8_COMBAT_ROLE_GAP');
  }
  return { ...structuredClone(role),
    scope_location_ref: contracts.ids.storehouse };
}
function accusationAvailable(state, contracts) {
  const present = new Set((state.npcs ?? []).filter(({ anchor_id: anchor }) =>
    anchor === state.position?.g5_anchor_id).map(({ instance_id: id }) => id));
  return state.position?.location_ref === contracts.ids.storehouse
    && [contracts.actors.zhdanko, contracts.actors.eremey,
      contracts.actors.ratsha, ...contracts.participatingFishers]
      .every(({ instance_id: id }) => present.has(id))
    && !(state.combat_sessions ?? []).some(({ status }) => status !== 'ended')
    && state.player_response_boundary == null;
}
function decision(allowed, causalStages) { return { version: 1,
  schema: 'turn_availability_decision', status: allowed ? 'available' : 'blocked',
  can_attempt: allowed, reasons: allowed ? [] : ['phase8_accusation_unavailable'],
  check_requests: [], causal_stages: causalStages }; }
function assertStrictJson(value, label) {
  const invalid = firstNonJsonPath(value, label, new Set());
  if (invalid !== null) fail(`TRACE_PHASE_8_NON_JSON:${invalid}`);
}
function firstNonJsonPath(value, path, ancestors) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) {
    return null;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? null : path;
  if (typeof value !== 'object' || ancestors.has(value)
      || (!Array.isArray(value)
        && Object.getPrototypeOf(value) !== Object.prototype)) return path;
  ancestors.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || (Array.isArray(value) && key === 'length')) {
      continue;
    }
    const nested = firstNonJsonPath(value[key], `${path}.${key}`, ancestors);
    if (nested !== null) { ancestors.delete(value); return nested; }
  }
  ancestors.delete(value);
  return null;
}
function fail(code) { throw Object.assign(new Error(code), { code }); }
