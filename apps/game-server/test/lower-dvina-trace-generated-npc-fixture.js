import { fixture, loadScenarioBundle } from './lower-dvina-trace-phase-2-fixture.js';
import LIVE_WORLD_TURN_PROFILE from
  '../../../data/world-catalogs/novgorod/live-world-runtime-v1/turn-profiles.json'
  with { type: 'json' };
import { canonicalDigest } from '@rus/materialization';
import { liveWorldConversationCommands } from
  '../src/runtime/lower-dvina-trace-phase-2.js';
import { projectFirstEntryArrivalState } from
  '../src/runtime/lower-dvina-trace-turn-step-prepared-state-projection.js';
import { conversationTemporalOwner, createM2ConversationModels } from
  './lower-dvina-trace-m2-conversation-fixture.js';

const bundle13 = await loadScenarioBundle(13);
export const HERE = 'position:generated:here';
export const NEAR = 'position:generated:near';
export const FAR = 'position:generated:far';
export const DESTINATION_ANCHOR = 'g5:destination';
export const profile = { profile: LIVE_WORLD_TURN_PROFILE, pin: {
  artifact_id: LIVE_WORLD_TURN_PROFILE.profile_set_id,
  revision: LIVE_WORLD_TURN_PROFILE.revision,
  digest: canonicalDigest(LIVE_WORLD_TURN_PROFILE)
} };
const LOCATION = 'trace_ld_v1_smp_fishing_camp';

// Real v17 shape: first-entry NPCs are created with anchor_id = their scene
// position, then projectFirstEntryArrivalState rewrites the anchor to the
// destination anchor. npcs[0] stands at the player position, npcs[1] on another
// position of the same G6, the rest in another G6.
export function generatedState(mutate = () => {}) {
  const seed = fixture({ scenarioBundle: bundle13, materializationBundle: bundle13 });
  const state = structuredClone(seed.state);
  state.scenario_id = 'vikhtuy_fishing_camp_v1';
  const spots = [[HERE, 'g6:a'], [NEAR, 'g6:a'], [FAR, 'g6:b']];
  const arrivals = state.npcs.map((npc, index) => {
    const [positionId] = spots[Math.min(index, 2)];
    return { ...npc, anchor_id: positionId, position_id: positionId,
      location_profile_ref: LOCATION };
  });
  state.npcs = [];
  state.position = { ...state.position, location_ref: LOCATION,
    g5_anchor_id: DESTINATION_ANCHOR, position_id: HERE, g6_id: 'g6:a' };
  state.first_entry_preparation = {
    scene: { location_profile_ref: LOCATION, rows: spots.map(([id, g6]) => ({
      target_table: 'scene_position_nodes', id, record: { g6_instance_id: g6 } })) },
    spatial_v3: { preparation_snapshot_id: 'snapshot:generated',
      preparation_member_ordinal: 1, target: { status: 'pending',
        position_id: HERE, g6_instance_id: 'g6:a' } },
    npcs: arrivals };
  projectFirstEntryArrivalState(state, { destination: {
    location_ref: LOCATION, g5_anchor_id: DESTINATION_ANCHOR } });
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
