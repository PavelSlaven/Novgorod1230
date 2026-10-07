import assert from 'node:assert/strict';
import test from 'node:test';
import { FAR, conversationRun, generatedState } from
  './lower-dvina-trace-generated-npc-fixture.js';
import { audienceForStatement } from
  '../src/runtime/lower-dvina-trace-m2-conversation-audience.js';
import { projectSilencePerception } from
  '../src/runtime/lower-dvina-trace-m2-conversation-nonverbal.js';
import { evidencePresentationPerception } from
  '../src/runtime/lower-dvina-trace-m2-conversation-supporting-perception.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });

// One real conversation turn supplies committed statements; the scene is then
// varied around them. npcs[0] shares the player's position, npcs[1] is on another
// position of the same G6, npcs[2] is in another G6.
async function committed(mutate = () => {}) {
  const seedState = generatedState();
  seedState.current_spatial_context = {
    version: 1, schema: 'visible_context_package',
    visible_scene: 'Рыбацкий стан у Вихтуя.', visible_changes: [],
    sensory_details: [], visible_npc: [], visible_objects: [],
    known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: []
  };
  seedState.current_spatial_context_is_fresh = true;
  const { f, say } = conversationRun(seedState);
  await say('perception-turn', 'Спрашиваю человека, как дела.');
  const state = structuredClone(f.state);
  mutate(state);
  const player = state.conversation_statements.find(
    ({ speaker_ref: s }) => s.entity_kind === 'player_character');
  const npcStatement = state.conversation_statements.find(
    ({ speaker_ref: s }) => s.entity_kind === 'npc');
  return { state, player, npcStatement,
    context: (actors) => ({ state, actualNpcActors: actors, batchKey: 'batch',
      targetRef: ref('npc', actors[0].instance_id),
      evidencePresentation: { conversation_id: 'c', exchange_id: 'e',
        event_id: 'evidence', entity_ref: ref('item', 'item-1') } }) };
}
const ids = (refs) => refs.map(({ entity_id: id }) => id);

test('the player statement reaches NPCs of the same G6 and not another G6', async () => {
  const { state, player, context } = await committed();
  const audience = audienceForStatement(context(state.npcs.slice(0, 3)), player,
    state.npcs.slice(0, 3), []);
  assert.deepEqual(ids(audience.actual_listener_refs).sort(),
    [state.npcs[0].instance_id, state.npcs[1].instance_id].sort());
});

test('an NPC statement reaches the player only from the same G6', async () => {
  const { state, npcStatement, context } = await committed();
  const player = [ref('player_character', state.actor_id)];
  const heard = (speakerIndex) => audienceForStatement(context(state.npcs),
    { ...npcStatement, speaker_ref: ref('npc', state.npcs[speakerIndex].instance_id) },
    [], player).received_messages.length;
  assert.equal(heard(1), 1);
  assert.equal(heard(2), 0);
});

test('nothing is perceived when neither position nor anchor is known (null is not null)',
  async () => {
    const { state, player, context } = await committed((next) => {
      next.position.position_id = null; next.position.g5_anchor_id = null;
      next.npcs.forEach((npc) => { delete npc.position_id; npc.anchor_id = null; });
    });
    assert.deepEqual(audienceForStatement(context(state.npcs.slice(0, 2)), player,
      state.npcs.slice(0, 2), []).actual_listener_refs, []);
  });

test('an NPC whose routine row moved it to another G6 does not hear', async () => {
  const { state, player, context } = await committed((next) => {
    next.npc_schedule_runtime = [{ npc_id: next.npcs[0].instance_id,
      current_position_node_id: FAR }];
  });
  assert.deepEqual(ids(audienceForStatement(context(state.npcs.slice(0, 2)), player,
    state.npcs.slice(0, 2), []).actual_listener_refs), [state.npcs[1].instance_id]);
});

test('player silence is observed by NPCs of the same G6 only', async () => {
  const { state, player, context } = await committed();
  const silence = { schema: 'conversation_non_statement_contribution_v1',
    contribution_id: 'contribution:test:1', conversation_id: player.conversation_id,
    exchange_id: player.exchange_id, speaker_ref: player.speaker_ref,
    contribution_kind: 'silence', handoff: null, nonverbal_audience: null };
  const { contributionEvent } = projectSilencePerception(
    context(state.npcs.slice(0, 3)), { new_signal_records: [] }, silence, {}, null);
  assert.deepEqual(ids(contributionEvent.nonverbal_audience.actual_observer_refs).sort(),
    [state.npcs[0].instance_id, state.npcs[1].instance_id].sort());
});

test('evidence presentation is perceived by the same G6 and not by another', async () => {
  const { state, context } = await committed();
  const kind = (index) => evidencePresentationPerception(
    context([state.npcs[index]])).result_kind;
  assert.equal(kind(1), 'recognized');
  assert.notEqual(kind(2), 'recognized');
});
