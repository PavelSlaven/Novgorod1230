import { fixture, loadScenarioBundle } from './lower-dvina-trace-phase-2-fixture.js';
import LIVE_WORLD_TURN_PROFILE from
  '../../../data/world-catalogs/novgorod/live-world-runtime-v1/turn-profiles.json'
  with { type: 'json' };
import { canonicalDigest } from '@rus/materialization';
import { liveWorldConversationCommands } from
  '../src/runtime/lower-dvina-trace-phase-2.js';
import { conversationTemporalOwner, createM2ConversationModels } from
  './lower-dvina-trace-m2-conversation-fixture.js';

const bundle13 = await loadScenarioBundle(13);
export const HERE = 'position:generated:here';
export const ELSEWHERE = 'position:generated:elsewhere';
export const profile = { profile: LIVE_WORLD_TURN_PROFILE, pin: {
  artifact_id: LIVE_WORLD_TURN_PROFILE.profile_set_id,
  revision: LIVE_WORLD_TURN_PROFILE.revision,
  digest: canonicalDigest(LIVE_WORLD_TURN_PROFILE)
} };

// Generated scenes live on scene_position_nodes: the player and the NPCs carry a
// position_id and no g5 anchor. The first NPC shares the player's position.
export function generatedState(mutate = () => {}) {
  const seed = fixture({ scenarioBundle: bundle13, materializationBundle: bundle13 });
  const state = structuredClone(seed.state);
  state.scenario_id = 'vikhtuy_fishing_camp_v1';
  state.position.location_ref = 'trace_ld_v1_smp_fishing_camp';
  state.position.g5_anchor_id = null;
  state.position.position_id = HERE;
  state.npcs.forEach((npc, index) => {
    npc.anchor_id = null;
    npc.location_profile_ref = state.position.location_ref;
    npc.position_id = index === 0 ? HERE : ELSEWHERE;
  });
  mutate(state);
  return state;
}

export function commandsFor(state, models = createM2ConversationModels()) {
  return liveWorldConversationCommands({ state, inputDigest: 'a'.repeat(64),
    authoredTurnProfile: profile,
    playerConversationModel: models.playerConversationModel,
    npcSemanticModel: models.npcSemanticModel,
    temporalAdvanceOwner: null, revalidateStateVersion: async () => 1 });
}

/** Runs real turns on a generated-shape state; npcRequests collects every NPC request. */
export function conversationRun(state, { greeting = false, npcUtterance = null } = {}) {
  const npcRequests = [];
  const models = createM2ConversationModels({
    onNpcCall: (request) => npcRequests.push(request) });
  const npcSemanticModel = npcUtterance == null ? models.npcSemanticModel : (request) => {
    const plan = models.npcSemanticModel(request);
    plan.speech.utterance_text = npcUtterance;
    return plan;
  };
  const playerConversationModel = greeting ? (request) => {
    const plan = models.playerConversationModel(request);
    plan.speech.interaction_tags = ['greeting'];
    return plan;
  } : models.playerConversationModel;
  const f = fixture({ committedState: state, authoredTurnProfile: profile,
    playerConversationModel, npcSemanticModel,
    temporalAdvanceOwner: conversationTemporalOwner(state),
    turnStepModel: async (request) => {
      const interaction = request.available_domain_operations.find(
        ({ op }) => op === 'emit_interaction');
      if (!interaction) throw new Error(JSON.stringify(request.player_safe_state));
      return {
        schema: 'turn_step_plan_v1', request_id: request.request_id,
        committed_state_version: request.committed_state_version,
        working_revision: request.working_revision, step_index: request.step_index,
        interpretation: { player_goal: request.root_player_action,
          grounded_attempt: request.root_player_action, adaptation: 'literal' },
        resolution: 'domain_request', goal_result: 'pending',
        activity: { owner: 'domain', duration_class: null, effort: null },
        operations: [interaction], check: null, continuation: null,
        clarification: null, direct_result_kind: null,
        reason_code: 'visible_npc_conversation',
        reason: 'The visible NPC owns the response boundary.'
      };
    } });
  const say = (key, text) => f.runtime.submitTurn({ partyId: f.partyId,
    input: { request_id: key, idempotency_key: key, raw_text: text } });
  return { f, say, npcRequests };
}
