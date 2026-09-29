import assert from 'node:assert/strict';
import test from 'node:test';
import { commandsFor, conversationRun, generatedState, ELSEWHERE } from
  './lower-dvina-trace-generated-npc-fixture.js';

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
