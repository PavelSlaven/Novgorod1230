import assert from 'node:assert/strict';
import test from 'node:test';
import {
  projectConversationMemory,
  validateConversationMemoryRecord
} from '../src/index.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const npc = ref('npc', 'miron');
const player = ref('player_character', 'player');
const other = ref('npc', 'fedor');
const LABELS = { miron: 'Мирон', player: 'Игрок', fedor: 'Фёдор' };
const label_of = (reference) => LABELS[reference.entity_id];
const time_of = (turn) => ({
  whole_minutes: String(turn),
  subminute_numerator: '0',
  subminute_denominator: '1'
});
const project = (records, options = {}) => projectConversationMemory(records,
  { npc_ref: npc, label_of, time_of, ...options });

const heardToMe = { kind: 'heard', speaker_ref: player, listener_ref: npc,
  text: 'Где лодка?', turn: 1 };
const heardOther = { kind: 'heard', speaker_ref: player, listener_ref: other,
  text: 'Где лодка?', turn: 2 };
const said = { kind: 'said', speaker_ref: npc, listener_ref: player,
  text: 'Лодка у пристани.', turn: 3 };
const silence = { kind: 'silence', speaker_ref: npc, listener_ref: player,
  text: '', turn: 4 };

test('each record kind has its own exact first-person summary', () => {
  const { recent_events: events } = project([heardToMe, heardOther, said, silence]);
  assert.deepEqual(events, [
    {
      event_ref: ref('memory_event', 'conversation-memory:miron:0'),
      source_event_ref: null,
      summary: 'Реплика, обращённая ко мне. Говорящий: Игрок. Слова: «Где лодка?»',
      occurred_at: time_of(1)
    },
    {
      event_ref: ref('memory_event', 'conversation-memory:miron:1'),
      source_event_ref: null,
      summary: 'Чужая реплика. Говорящий: Игрок. Кому: Фёдор. Слова: «Где лодка?»',
      occurred_at: time_of(2)
    },
    {
      event_ref: ref('memory_event', 'conversation-memory:miron:2'),
      source_event_ref: null,
      summary: 'Моя реплика. Кому: Игрок. Слова: «Лодка у пристани.»',
      occurred_at: time_of(3)
    },
    {
      event_ref: ref('memory_event', 'conversation-memory:miron:3'),
      source_event_ref: null,
      summary: 'Моё молчание в ответ. Кому: Игрок.',
      occurred_at: time_of(4)
    }
  ]);
});

test('public history keeps heard and said utterances and drops silence', () => {
  const { public_conversation_history: history } =
    project([heardToMe, said, silence, heardOther]);
  assert.deepEqual(history, [
    { speaker_ref: player, utterance_text: 'Где лодка?' },
    { speaker_ref: npc, utterance_text: 'Лодка у пристани.' },
    { speaker_ref: player, utterance_text: 'Где лодка?' }
  ]);
  assert.notEqual(history[0].speaker_ref, heardToMe.speaker_ref);
});

test('the projection returns fresh plain objects and leaves the input alone', () => {
  const records = [structuredClone(heardToMe), structuredClone(said)];
  const before = structuredClone(records);
  const result = project(records);
  assert.deepEqual(records, before);
  assert.equal(Object.isFrozen(result), false);
  assert.equal(Object.isFrozen(result.recent_events), false);
  assert.equal(Object.isFrozen(result.recent_events[0].event_ref), false);
  assert.equal(Object.isFrozen(result.public_conversation_history[0].speaker_ref), false);
});

test('only the last limit records are used, indexed in the full history', () => {
  const records = Array.from({ length: 45 }, (_, index) => ({
    kind: 'heard', speaker_ref: player, listener_ref: npc,
    text: `Слово ${index}`, turn: index
  }));
  const { recent_events: events, public_conversation_history: history } =
    project(records);
  assert.equal(events.length, 40);
  assert.equal(events[0].event_ref.entity_id, 'conversation-memory:miron:5');
  assert.equal(events[39].event_ref.entity_id, 'conversation-memory:miron:44');
  assert.equal(history.length, 40);
  assert.equal(history[0].utterance_text, 'Слово 5');
  assert.equal(history[39].utterance_text, 'Слово 44');
  const short = project(records, { limit: 3 });
  assert.deepEqual(short.recent_events.map(({ event_ref }) => event_ref.entity_id), [
    'conversation-memory:miron:42',
    'conversation-memory:miron:43',
    'conversation-memory:miron:44'
  ]);
  assert.equal(short.public_conversation_history.length, 3);
});

test('an empty history projects to empty lists', () => {
  assert.deepEqual(project([]), { recent_events: [], public_conversation_history: [] });
});

test('two hundred records project in order with strictly increasing ids', () => {
  const records = Array.from({ length: 200 }, (_, index) => ({
    kind: index % 2 === 0 ? 'heard' : 'said',
    speaker_ref: index % 2 === 0 ? player : npc,
    listener_ref: index % 2 === 0 ? npc : player,
    text: `Реплика ${index}`, turn: index
  }));
  const { recent_events: events } = project(records, { limit: 200 });
  assert.equal(events.length, 200);
  const indexes = events.map(({ event_ref }) =>
    Number(event_ref.entity_id.split(':').at(-1)));
  assert.deepEqual(indexes, Array.from({ length: 200 }, (_, index) => index));
  assert.equal(events.at(-1).event_ref.entity_id, 'conversation-memory:miron:199');
  assert.deepEqual(events.map(({ occurred_at }) => occurred_at),
    records.map(({ turn }) => time_of(turn)));
});

const INVALID_RECORDS = {
  'an extra key': { ...heardToMe, extra: 1 },
  'a missing key': { kind: 'heard', speaker_ref: player, listener_ref: npc, text: 'Слово' },
  'an unknown kind': { ...heardToMe, kind: 'whispered' },
  'silence carrying text': { ...silence, text: 'Слово' },
  'heard with empty text': { ...heardToMe, text: '' },
  'said with blank text': { ...said, text: '   ' },
  'a speaker of a wrong kind': { ...heardToMe, speaker_ref: ref('location', 'yard') },
  'a listener of a wrong kind': { ...heardToMe, listener_ref: ref('item', 'knife') },
  'a ref with an extra key': {
    ...heardToMe, speaker_ref: { ...player, extra: true }
  },
  'a ref with an empty id': { ...heardToMe, speaker_ref: ref('npc', '') },
  'a string ref': { ...heardToMe, speaker_ref: 'player' },
  'a negative turn': { ...heardToMe, turn: -1 },
  'a fractional turn': { ...heardToMe, turn: 1.5 },
  'a string turn': { ...heardToMe, turn: '1' },
  'a non-record': 'heard',
  'null': null
};

test('invalid raw records are rejected by the validator and the projection', async (t) => {
  for (const [name, record] of Object.entries(INVALID_RECORDS)) {
    await t.test(name, () => {
      assert.equal(validateConversationMemoryRecord(record), false);
      assert.throws(() => project([heardToMe, record]), TypeError);
    });
  }
  for (const record of [heardToMe, heardOther, said, silence]) {
    assert.equal(validateConversationMemoryRecord(record), true);
  }
});

test('the projection rejects a bad call shape', () => {
  assert.throws(() => project('records'), TypeError);
  assert.throws(() => project([heardToMe], { npc_ref: player }), TypeError);
  assert.throws(() => project([heardToMe], { npc_ref: 'miron' }), TypeError);
  assert.throws(() => project([heardToMe], { label_of: undefined }), TypeError);
  assert.throws(() => project([heardToMe], { time_of: 'turn' }), TypeError);
  assert.throws(() => project([heardToMe], { limit: 0 }), TypeError);
  assert.throws(() => project([heardToMe], { limit: 1.5 }), TypeError);
  assert.throws(() => project([heardToMe], { limit: -3 }), TypeError);
});
