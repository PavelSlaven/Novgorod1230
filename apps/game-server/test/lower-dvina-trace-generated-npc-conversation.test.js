import assert from 'node:assert/strict';
import test from 'node:test';
import { FAR, commandsFor, conversationRun, generatedState } from
  './lower-dvina-trace-generated-npc-fixture.js';

const targets = (commands) => commands.map(({ command_id: id }) =>
  id.replace('live_world.conversation.', ''));

test('NPCs of the player G6 are partners; the start NPC of another site is not',
  async () => {
    // the real v17 position has no location_ref: the site stands in for it
    const state = generatedState((next) => { delete next.position.location_ref; });
    const commands = commandsFor(state);
    assert.deepEqual(targets(commands),
      [state.npcs[0].instance_id, state.npcs[1].instance_id]);
    assert.equal((await commands[0].availability({ committed_state: state,
      action_set_evaluation: true })).can_attempt, true,
    JSON.stringify(commands[0].preconditions));
  });

test('an NPC in another G6 is not a partner although the site is shared', () => {
  const state = generatedState();
  assert.equal(state.npcs.length > 4, true);
  for (const far of state.npcs.slice(2)) {
    assert.equal(targets(commandsFor(state)).includes(far.instance_id), false);
  }
});

test('an unknown G6 is never co-presence: only the same position remains', () => {
  const state = generatedState((next) => { delete next.scene_position_g6; });
  assert.deepEqual(targets(commandsFor(state)), [state.npcs[0].instance_id]);
});

test('null anchor and null position never match each other', () => {
  const state = generatedState((next) => {
    next.position.position_id = null;
    next.npcs.forEach((npc) => { npc.anchor_id = null; delete npc.position_id; });
  });
  assert.deepEqual(commandsFor(state), []);
});

test('anchor decides only where a side has no position (authored scene)', () => {
  const state = generatedState((next) => {
    delete next.position.position_id;
    next.position.g5_anchor_id = 'anchor:a';
    next.npcs.forEach((npc) => { delete npc.position_id; npc.anchor_id = 'anchor:b'; });
    next.npcs[0].anchor_id = 'anchor:a';
  });
  assert.deepEqual(targets(commandsFor(state)), [state.npcs[0].instance_id]);
});

test('a routine that moved an NPC into another G6 removes it from the scene', () => {
  const state = generatedState((next) => {
    next.npc_schedule_runtime = [{ npc_id: next.npcs[0].instance_id,
      current_position_node_id: FAR }];
  });
  assert.equal(targets(commandsFor(state)).includes(state.npcs[0].instance_id), false);
  assert.equal(targets(commandsFor(state)).includes(state.npcs[1].instance_id), true);
});

test('generated-shape NPC hears the player and answers over two turns', async () => {
  const state = generatedState();
  const npc = state.npcs[0];
  const { f, say } = conversationRun(state);
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

test('greeting, question, second turn and leaving run as one lifecycle', async () => {
  const state = generatedState();
  const npc = state.npcs[0];
  const { f, say, npcRequests } = conversationRun(state,
    { greeting: true, leaveOn: /прощай/u });
  const spoken = () => f.state.conversation_statements.filter(
    ({ speaker_ref: speaker }) => speaker?.entity_id === npc.instance_id).length;
  await say('lifecycle-1', 'Здравствуй, добрый человек.');
  await say('lifecycle-2', 'Как идёт работа?');
  await say('lifecycle-3', 'А что нового?');
  const beforeLeaving = spoken();
  assert.equal(beforeLeaving, 3);
  assert.equal(new Set(npcRequests.map(({ npc_ref: ref }) => ref.entity_id)).size, 1);
  await say('lifecycle-4', 'Ну, прощай, мне пора.');
  assert.equal(spoken(), beforeLeaving);
  assert.equal(f.commitCount(), 4);
  await say('lifecycle-5', 'Ещё вопрос: далеко ли до воды?');
  assert.equal(spoken(), beforeLeaving + 1);
  assert.equal(f.commitCount(), 5);
});
