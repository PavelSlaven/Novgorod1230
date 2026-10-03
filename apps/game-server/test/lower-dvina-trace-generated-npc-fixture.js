import { fixture, loadScenarioBundle } from './lower-dvina-trace-phase-2-fixture.js';
import LIVE_WORLD_TURN_PROFILE from
  '../../../data/world-catalogs/novgorod/live-world-runtime-v1/turn-profiles.json'
  with { type: 'json' };
import { canonicalDigest } from '@rus/materialization';
import { liveWorldConversationCommands } from
  '../src/runtime/lower-dvina-trace-phase-2.js';
import { SCENE_NPC_SOURCE } from '../src/infrastructure/postgres/scene-npcs-readback.js';
import { conversationTemporalOwner, createM2ConversationModels } from
  './lower-dvina-trace-m2-conversation-fixture.js';

const bundle13 = await loadScenarioBundle(13);
export const HERE = 'position:generated:here';
export const NEAR = 'position:generated:near';
export const FAR = 'position:generated:far';
export const profile = { profile: LIVE_WORLD_TURN_PROFILE, pin: {
  artifact_id: LIVE_WORLD_TURN_PROFILE.profile_set_id,
  revision: LIVE_WORLD_TURN_PROFILE.revision,
  digest: canonicalDigest(LIVE_WORLD_TURN_PROFILE)
} };
const LOCATION = 'trace_ld_v1_smp_fishing_camp';

// Real v17 shape (probed on a party at a generated site): the player position has
// no anchor, only site/position/G6; NPCs of the site are read from the database
// (runtime_source, no anchor, position + G6) next to the start NPC sealed in the
// snapshot (anchor of the start place, position of the start site).
// npcs[0] stands at the player position, npcs[1] on another position of the same
// G6, npcs[2..3] in another G6, npcs[4] is the start NPC of another site.
export function generatedState(mutate = () => {}) {
  const seed = fixture({ scenarioBundle: bundle13, materializationBundle: bundle13 });
  const state = structuredClone(seed.state);
  state.scenario_id = 'vikhtuy_fishing_camp_v1';
  const spots = [[HERE, 'g6:a'], [NEAR, 'g6:a'], [FAR, 'g6:b'], [FAR, 'g6:b']];
  state.npcs = state.npcs.map((npc, index) => index < spots.length ? {
    ...npc, anchor_id: null, position_id: spots[index][0],
    g6_instance_id: spots[index][1], location_profile_ref: LOCATION,
    runtime_source: SCENE_NPC_SOURCE } : { ...npc, anchor_id: 'anchor:start',
    position_id: 'position:start:focus', location_profile_ref: 'start_place' });
  state.position = { g4_id: state.position.g4_id, site_id: 'site:generated',
    position_id: HERE, g6_instance_id: 'g6:a', location_ref: LOCATION };
  state.scene_position_g6 = { [HERE]: 'g6:a', [NEAR]: 'g6:a', [FAR]: 'g6:b' };
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
export function conversationRun(state, { greeting = false, npcUtterance = null, leaveOn = null } = {}) {
  const npcRequests = [];
  const models = createM2ConversationModels({
    onNpcCall: (request) => npcRequests.push(request) });
  const npcSemanticModel = npcUtterance == null ? models.npcSemanticModel : (request) => {
    const plan = models.npcSemanticModel(request);
    plan.speech.utterance_text = npcUtterance;
    return plan;
  };
  const playerConversationModel = (request) => {
    const plan = models.playerConversationModel(request);
    if (leaveOn?.test(request.raw_text)) {
      return { ...plan, contribution_kind: 'leave_conversation', speech: null,
        primary_addressee_ref: null, intended_addressee_refs: [],
        affected_actor_refs: [], resolution: 'automatic', supporting_operations: [], check: null,
        handoff: null };
    }
    if (greeting) plan.speech.interaction_tags = ['greeting'];
    return plan;
  };
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
