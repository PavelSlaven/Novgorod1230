import assert from 'node:assert/strict';
import test from 'node:test';
import { segmentProse } from '../src/segments.js';

test('terminal punctuation keeps trailing Cyrillic and ASCII closing quotes or brackets', () => {
  for (const first of ['«Онисим!»', '“Берегись!”', '"Hello!"', "'Stop!'", '(Берегись!)',
    '[Стой!]', '{"Wait!"}', '«Что?».']) {
    const prose = `${first} У воды лежит ветвь.`;
    assert.deepEqual(segmentProse(prose), [
      { segment_id: 's1', prose: `${first} ` },
      { segment_id: 's2', prose: 'У воды лежит ветвь.' }
    ]);
    assert.equal(segmentProse(prose).map(({ prose }) => prose).join(''), prose);
  }
});
