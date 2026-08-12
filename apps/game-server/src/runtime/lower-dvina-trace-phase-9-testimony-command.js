import { prepareTracePhase9PlayerPlan, resolveTracePhase9Testimony } from
  './lower-dvina-trace-phase-9-conversation.js';
import { phase3WriteTargets } from
  './lower-dvina-trace-phase-3-command-shared.js';

const COMMAND_ID = 'lower_dvina_trace.ask_onisim_for_testimony';

export function createTracePhase9TestimonyCommand({ contracts, inputDigest,
  playerConversationModel, npcSemanticModel, temporalAdvanceOwner,
  revalidateStateVersion }) {
  return Object.freeze({ command_id: COMMAND_ID,
    option_id: 'ask_onisim_for_testimony', label: 'Выслушать Онисима',
    target_id: contracts.onisim.instance_id,
    approved_record: contracts.activityPins.find(({ id }) => id
      === contracts.binding.onisim_testimony.activity_profile.profile_id),
    preconditions: [{ kind: 'phase9_onisim_testimony_available' }],
    expected_cost: { kind: 'exact_time', value: 5 }, known_risks: [],
    reason_visible_to_actor: 'Онисим находится в стане и может говорить.',
    mode: { selected_primary_mode: 'social_npc', secondary_modes: [],
      resolution_plan: { subsystems: ['npc_interaction', 'time_progression'],
        checks_to_run: [], expected_writes: ['party_state',
          'party_visible_context_package'], state_blocks_to_load: [
          'party_state', 'current_position', 'relevant_npcs',
          'character_knowledge_map'] } }, matches: () => false,
    async availability(context) {
      const state = context.committed_state ?? context.retrievedState;
      const allowed = testimonyAvailable(state, contracts);
      if (!allowed || context.action_set_evaluation === true) {
        return decision(allowed, []);
      }
      const plan = await prepareTracePhase9PlayerPlan({ state, contracts,
        playerInput: context.playerInput, inputDigest,
        playerConversationModel, npcSemanticModel, temporalAdvanceOwner,
        revalidateStateVersion });
      return decision(true, [{ schema:
        'rus.trace_player_conversation_plan_stage.v1', plan }]);
    },
    async consequence({ retrievedState: state, availability, playerInput }) {
      const playerPlan = availability.causal_stages?.find(({ schema }) =>
        schema === 'rus.trace_player_conversation_plan_stage.v1')?.plan;
      if (!playerPlan) fail('TRACE_PHASE_9_PLAYER_PLAN_MISSING');
      const semantic = await resolveTracePhase9Testimony({ state, contracts,
        playerInput, inputDigest, playerPlan, playerConversationModel,
        npcSemanticModel, temporalAdvanceOwner, revalidateStateVersion });
      return { version: 1, schema: 'turn_consequence_package',
        status: 'resolved', activity_attempt_id:
          `attempt:${inputDigest.slice(0, 32)}`,
        duration_minutes: semantic.exact_elapsed_minutes,
        phase9_kind: 'onisim_testimony', phase9: {
          semantic_exchange: semantic,
          case_evidence_ref:
            contracts.evidenceGraph.clue_evidence_graph_set_id,
          activity_ref: contracts.binding.onisim_testimony
            .activity_profile.profile_id,
          committed_facts: semantic.testimony_committed
            ? [semantic.evidence_ref] : [] },
        visible_seed: {}, hidden_update: {}, state_changes: [],
        suggested_actions: [] };
    }, writeTargets: phase3WriteTargets });
}

function testimonyAvailable(state, contracts) {
  const onisim = (state.npcs ?? []).find(({ instance_id: id }) =>
    id === contracts.onisim.instance_id);
  return state.position?.location_ref === contracts.ids.camp
    && (onisim?.location_profile_ref === contracts.ids.camp
      || onisim?.anchor_id === state.position.g5_anchor_id)
    && state.phase9?.onisim_testimony == null;
}
export function tracePhase9TestimonyPreconditionSatisfied(precondition,
  state, contracts) {
  return precondition?.kind === 'phase9_onisim_testimony_available'
    && testimonyAvailable(state, contracts);
}
function decision(allowed, causalStages) { return { version: 1,
  schema: 'turn_availability_decision', status: allowed ? 'available' : 'blocked',
  can_attempt: allowed, reasons: allowed ? [] : ['phase9_testimony_unavailable'],
  check_requests: [], causal_stages: causalStages }; }
function fail(code) { throw Object.assign(new Error(code), { code }); }
