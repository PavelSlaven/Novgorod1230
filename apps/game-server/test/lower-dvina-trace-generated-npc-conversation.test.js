import assert from 'node:assert/strict';
import test from 'node:test';
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
const HERE = 'position:generated:here';
const ELSEWHERE = 'position:generated:elsewhere';
const profile = { profile: LIVE_WORLD_TURN_PROFILE, pin: {
  artifact_id: LIVE_WORLD_TURN_PROFILE.profile_set_id,
  revision: LIVE_WORLD_TURN_PROFILE.revision,
  digest: canonicalDigest(LIVE_WORLD_TURN_PROFILE)
} };

// Generated scenes live on scene_position_nodes: the player and the NPCs carry a
// position_id and no g5 anchor.
function generatedState(mutate = () => {}) {
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

function commandsFor(state, models = createM2ConversationModels()) {
  return liveWorldConversationCommands({ state, inputDigest: 'a'.repeat(64),
    authoredTurnProfile: profile,
    playerConversationModel: models.playerConversationModel,
    npcSemanticModel: models.npcSemanticModel,
    temporalAdvanceOwner: null, revalidateStateVersion: async () => 1 });
}

const targets = (commands) => commands.map(({ command_id: id }) =>
  id.replace('live_world.conversation.', ''));

test('NPC on the player scene position is a conversation partner without an anchor',
  async () => {
    const state = generatedState();
    const commands = commandsFor(state);
    assert.deepEqual(targets(commands), [state.npcs[0].instance_id]);
    assert.equal((await commands[0].availability({ committed_state: state,
      action_set_evaluation: true })).can_attempt, true,
    JSON.stringify(commands[0].preconditions));
  });

test('NPC on another scene position is not a partner even in the same location',
  () => {
    const state = generatedState();
    assert.equal(state.npcs.length > 1, true);
    assert.equal(targets(commandsFor(state)).includes(state.npcs[1].instance_id), false);
  });

test('null anchor and null position never match each other', () => {
  const state = generatedState((next) => {
    next.npcs.forEach((npc) => { delete npc.position_id; });
    next.position.position_id = null;
  });
  assert.deepEqual(commandsFor(state), []);
});

test('routine that moved the NPC away removes it from the scene', () => {
  const state = generatedState((next) => {
    next.npc_schedule_runtime = [{ npc_id: next.npcs[0].instance_id,
      current_position_node_id: ELSEWHERE }];
  });
  assert.deepEqual(commandsFor(state), []);
});

test('generated-shape NPC hears the player and answers over two turns', async () => {
  const state = generatedState();
  const npc = state.npcs[0];
  const conversation = createM2ConversationModels();
  const f = fixture({ committedState: state, authoredTurnProfile: profile,
    playerConversationModel: conversation.playerConversationModel,
    npcSemanticModel: conversation.npcSemanticModel,
    temporalAdvanceOwner: conversationTemporalOwner(state),
    turnStepModel: async (request) => {
      const interaction = request.available_domain_operations.find(
        ({ op }) => op === 'emit_interaction');
      assert.ok(interaction, JSON.stringify(request.player_safe_state));
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
  await say('generated-talk-1', 'Спрашиваю незнакомого человека, как идёт работа.');
  const npcStatements = () => f.state.conversation_statements.filter(
    ({ speaker_ref: speaker }) => speaker?.entity_kind === 'npc');
  assert.equal(npcStatements().some(({ speaker_ref: s }) =>
    s.entity_id === npc.instance_id), true);
  const firstCount = npcStatements().length;
  await say('generated-talk-2', 'Иначе спрашиваю того же человека, что изменилось.');
  assert.equal(npcStatements().length > firstCount, true);
  assert.equal(f.commitCount(), 2);
});
