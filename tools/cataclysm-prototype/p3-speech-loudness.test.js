import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePlayerSpeechLoudness } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-m2-conversation-shared.js';

test('speech loudness uses the first unquoted, non-negated cue', () => {
  const cases = [
    ['Шепчу тихо, потом кричу.', 1],
    ['Сначала кричу, затем шепчу.', 4],
    ['Говорю: «я шепчу», затем кричу.', 4],
    ['Говорю: “я кричу”, затем шепчу.', 1],
    ['Говорю: „кричу“.', 2],
    ['Говорю: "шепчу".', 2],
    ['Говорю: «Он сказал: “я кричу”».', 2],
    ['Говорю: «Он сказал: „я шепчу“», затем кричу.', 4],
    ['Шепчу: “Он сказал: «я кричу»”.', 1],
    ['Не шепчу, а кричу.', 4],
    ['Кричу, но не шепчу.', 4],
    ['Не кричу.', 2],
    ['Не кричу, затем шепчу.', 1],
    ['Шепчу, затем не кричу.', 1],
    ['Кричу не.', 4]
  ];
  for (const [intent, expected] of cases) {
    assert.equal(parsePlayerSpeechLoudness(intent), expected, intent);
  }
});

test('speech loudness cues are case-insensitive, word-bounded and complete', () => {
  const cases = [
    ['ШЁПОТОМ произношу слова.', 1],
    ['Шепотом произношу слова.', 1],
    ['ШЕПЧУ слова.', 1],
    ['КРИКОМ зову людей.', 4],
    ['Кричу людям.', 4],
    ['Перешепчу это позже; говорю обычно.', 2],
    ['Шепчущий голос звучит ровно.', 2],
    ['aшепчу рядом с латиницей.', 2],
    ['шепчу1', 2],
    ['шепчу\u0301', 2],
    ['Не очень кричу.', 4]
  ];
  for (const [intent, expected] of cases) {
    assert.equal(parsePlayerSpeechLoudness(intent), expected, intent);
  }
});

test('speech loudness defaults to normal when no positive cue remains', () => {
  for (const intent of ['', 'Говорю с рыбаком.', '«Кричу!»', '“Шепчу!”',
    '„Криком“', '"Шепотом"', 'не шепчу и не кричу']) {
    assert.equal(parsePlayerSpeechLoudness(intent), 2, intent);
  }
});
