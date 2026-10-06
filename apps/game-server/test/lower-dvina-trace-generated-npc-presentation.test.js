import assert from 'node:assert/strict';
import test from 'node:test';
import { conversationRun, generatedState } from
  './lower-dvina-trace-generated-npc-fixture.js';
import { npcConversationInstructions } from
  '../src/runtime/lower-dvina-trace-phase-2-npc-conversation-prompts.js';

const CHARACTER = Object.freeze({ temperament_ref: 'wary',
  temperament_label_ru: 'осторожность', value_refs: ['kin_loyalty', 'responsibility'],
  value_labels_ru: ['забота о родне', 'ответственность'],
  goals_ru: ['собрать припасы на зиму для детей'], fear_ru: 'остаться без хлеба в холода' });

function named(name = 'Настасья', extra = {}) {
  const state = generatedState((state) => {
    const npc = state.npcs[0];
    npc.identity_state = { ...npc.identity_state, canonical_name: name };
    npc.semantic_state = { ...npc.semantic_state, ...extra };
  });
  state.current_spatial_context = {
    version: 1, schema: 'visible_context_package',
    visible_scene: 'Рыбацкий стан у Вихтуя.', visible_changes: [],
    sensory_details: [], visible_npc: [], visible_objects: [],
    known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: []
  };
  state.current_spatial_context_is_fresh = true;
  return state;
}

test('greeting a named NPC in neutral conversation asks for a self-introduction',
  async () => {
    const { say, npcRequests } = conversationRun(named(), { greeting: true });
    await say('presentation-1', 'Здравствуй, добрый человек.');
    assert.deepEqual(npcRequests[0].social_context.first_contact_introduction,
      { canonical_name: 'Настасья' });
  });

test('no introduction without a greeting, without a name, or after the name was heard',
  async () => {
    const plain = conversationRun(named(), { greeting: false });
    await plain.say('presentation-2', 'Что ты делаешь?');
    assert.equal(plain.npcRequests[0].social_context.first_contact_introduction, undefined);

    const nameless = conversationRun(named(null), { greeting: true });
    await nameless.say('presentation-3', 'Здравствуй.');
    assert.equal(nameless.npcRequests[0].social_context.first_contact_introduction, undefined);

    const heard = conversationRun(named(), { greeting: true,
      npcUtterance: 'Я Настасья. Слышу тебя.' });
    await heard.say('presentation-4', 'Здравствуй.');
    assert.equal(heard.npcRequests[0].social_context.first_contact_introduction
      .canonical_name, 'Настасья');
    await heard.say('presentation-5', 'Здравствуй ещё раз.');
    assert.equal(heard.npcRequests.at(-1).social_context.first_contact_introduction,
      undefined);
  });

test('persisted character reaches the request as the speaker own hidden position',
  async () => {
    const marker = 'SECRET_RUNTIME_BASIS_MARKER';
    const { say, npcRequests } = conversationRun(named('Настасья', {
      character: structuredClone(CHARACTER),
      approved_runtime_basis: { goals: marker } }));
    await say('presentation-6', 'Что ты делаешь?');
    assert.deepEqual(npcRequests[0].social_context.npc_behavior, {
      temperament: 'осторожность', values: ['забота о родне', 'ответственность'],
      goals: ['собрать припасы на зиму для детей'],
      fears: ['остаться без хлеба в холода'] });
    const wire = JSON.stringify(npcRequests[0]);
    for (const hidden of [marker, 'wary', 'kin_loyalty', 'semantic_state']) {
      assert.equal(wire.includes(hidden), false, hidden);
    }
  });

test('missing or malformed character adds no npc_behavior and no error', async () => {
  for (const character of [undefined, null, {}, { ...CHARACTER, goals_ru: [] },
    { ...CHARACTER, fear_ru: '' }, { ...CHARACTER, value_labels_ru: ['одно'] },
    { ...CHARACTER, temperament_label_ru: 7 }]) {
    const { say, npcRequests } = conversationRun(named('Настасья',
      character === undefined ? {} : { character }));
    await say('presentation-7', 'Что ты делаешь?');
    assert.equal(npcRequests[0].social_context.npc_behavior, undefined,
      JSON.stringify(character));
  }
});

test('prompt asks for the exact self-introduction form and carries no sample name', () => {
  const text = npcConversationInstructions(null, {
    social_context: { first_contact_introduction: true }
  });
  assert.equal(text.includes('exactly "Я <canonical_name>."'), true);
  assert.equal(text.includes('temperament and values'), true);
  assert.equal(/Я [А-ЯЁ][а-яё]+/u.test(text), false);
});
