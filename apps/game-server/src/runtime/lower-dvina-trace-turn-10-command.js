import { available, mode, phase3WriteTargets } from
  './lower-dvina-trace-phase-3-command-shared.js';
import {
  buildPlayerConversationPlanStage,
  requirePlayerConversationPlanStage
} from './lower-dvina-trace-m2-conversation-player.js';
import {
  prepareTraceTurn10PlayerPlan,
  requireTraceTurn10ParentTemporal,
  resolveTraceTurn10ConversationExchange
} from './lower-dvina-trace-turn-10-conversation.js';
import { TURN10_COMPANION_COMMAND } from
  './lower-dvina-trace-turn-step-prepared-effects.js';

export function createTraceTurn10CompanionCommand({ contracts, inputDigest,
  playerConversationModel, npcSemanticModel, temporalAdvanceOwner,
  revalidateStateVersion }) {
  return Object.freeze({
    command_id: TURN10_COMPANION_COMMAND,
    option_id: 'request_storehouse_companions',
    label: 'Попросить Еремея и рыбаков пойти к Жданко',
    target_id: contracts.actors.eremey.instance_id,
    approved_record: contracts.activityPin,
    preconditions: [{ kind: 'turn10_companion_request_admission' }],
    expected_cost: { kind: 'contained_time', value: 5 },
    known_risks: ['Персонажи могут отказаться.'],
    reason_visible_to_actor: 'Еремей и рыбаки находятся у огня.',
    mode: mode('social_npc', ['npc_interaction', 'knowledge_memory']),
    matches() { return false; },
    async availability(context) {
      const state = context.committed_state ?? context.retrievedState;
      if (!admitted(state, contracts)) {
        return available(false, [], ['turn10_companion_precondition_failed']);
      }
      if (context.action_set_evaluation === true) {
        return available(true, [], []);
      }
      const plan = await prepareTraceTurn10PlayerPlan({
        state,
        contracts,
        playerInput: context.playerInput,
        inputDigest,
        playerConversationModel,
        npcSemanticModel,
        temporalAdvanceOwner,
        revalidateStateVersion
      });
      return {
        ...available(true, [], []),
        causal_stages: [buildPlayerConversationPlanStage(plan)]
      };
    },
    async consequence({ retrievedState: state, availability, playerInput }) {
      const playerPlan = requirePlayerConversationPlanStage(availability);
      const semanticExchange = await resolveTraceTurn10ConversationExchange({
        state,
        contracts,
        playerInput,
        inputDigest,
        playerConversationModel,
        npcSemanticModel,
        temporalAdvanceOwner,
        revalidateStateVersion,
        playerPlan
      });
      return {
        version: 1,
        schema: 'turn_consequence_package',
        status: 'resolved',
        turn10_kind: 'companion_request',
        activity_attempt_id: `attempt:${inputDigest.slice(0, 32)}:turn10`,
        duration_minutes: 5,
        parent_activity_completion:
          structuredClone(semanticExchange.parent_activity_completion),
        conversation: {
          activity_ref: contracts.binding.conversation_activity.profile_id,
          npc_ref: 'eremey_fisher',
          npc_id: contracts.actors.eremey.instance_id,
          semantic_exchange: semanticExchange,
          check_result: null,
          consequence_ref: null,
          evidence_input_ref: null,
          objective_fact_outputs: []
        },
        visible_seed: {}, hidden_update: {}, state_changes: [],
        suggested_actions: []
      };
    },
    writeTargets: phase3WriteTargets
  });
}

export function traceTurn10PreconditionSatisfied(precondition, state,
  contracts) {
  return precondition?.kind === 'turn10_companion_request_admission'
    && admitted(state, contracts);
}

function admitted(state, contracts) {
  const atCamp = state?.position?.location_ref === contracts.campLocationRef;
  if (state?.phase7_fire_rest?.status !== 'active') return false;
  requireTraceTurn10ParentTemporal(state);
  const campAnchor = state.position?.g5_anchor_id
    ?? state.position?.anchor_id;
  const present = Object.values(contracts.actors).every((actor) => {
    const current = (state.npcs ?? []).find(({ instance_id: id }) =>
      id === actor.instance_id);
    return (current?.anchor_id ?? current?.g5_anchor_id) === campAnchor;
  });
  return atCamp && present
    && !(state.route_activity_admissions ?? []).some(
      ({ activity_ref: ref }) => ref === contracts.binding.route_activity_ref);
}
