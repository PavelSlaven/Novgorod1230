import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addElapsedTime,
  addRationalMinutes,
  compareGameTimestamp,
  compareRationalMinutes,
  computeTemporalDigest,
  countCrossedWholeMinuteBoundaries,
  divideRationalMinutes,
  multiplyRationalMinutes,
  normalizeGameTimestamp,
  normalizeRationalMinutes,
  subtractGameTimestamp,
  subtractRationalMinutes,
  wholeMinuteIndex
} from '../src/index.js';

const rational = (numerator, denominator = '1') => ({ numerator, denominator });
const timestamp = (wholeMinutes, numerator = '0', denominator = '1') => ({
  whole_minutes: wholeMinutes,
  subminute_numerator: numerator,
  subminute_denominator: denominator
});

test('Temporal v4 canonicalizes decimal-string rationals and rejects ambiguous integer spellings', () => {
  assert.deepEqual(normalizeRationalMinutes(rational('10', '20')), rational('1', '2'));
  assert.deepEqual(normalizeRationalMinutes(rational('0', '999')), rational('0', '1'));
  for (const value of [
    rational('+1'), rational('-1'), rational('01'), rational('1', '0'),
    rational('1', '-2'), rational('1e3'), { numerator: 1, denominator: 2 }
  ]) assert.throws(() => normalizeRationalMinutes(value), /decimal|denominator|rational/u);
});

test('Temporal v4 arithmetic stays exact beyond Number.MAX_SAFE_INTEGER and cross-reduces', () => {
  assert.deepEqual(
    addRationalMinutes(rational('9007199254740993', '2'), rational('1', '2')),
    rational('4503599627370497')
  );
  assert.deepEqual(
    addRationalMinutes(
      rational('123456789012345678901234567890', '999999999999999999999999999999'),
      rational('876543210987654321098765432109', '999999999999999999999999999999')
    ),
    rational('1')
  );
  assert.deepEqual(
    subtractRationalMinutes(rational('4503599627370497'), rational('1', '2')),
    rational('9007199254740993', '2')
  );
  assert.equal(compareRationalMinutes(rational('100000000000000000000', '3'), rational('99999999999999999999', '3')), 1);
  const huge = '99999999999999999999999999999999999999999999999999999999999999999999999999999999';
  assert.deepEqual(
    multiplyRationalMinutes(rational('2', huge), rational(huge, '3')),
    rational('2', '3')
  );
  assert.deepEqual(
    divideRationalMinutes(rational('2', huge), rational('3', huge)),
    rational('2', '3')
  );
  assert.throws(() => divideRationalMinutes(rational('1'), rational('0')), /zero/u);
});

test('Temporal v4 exact timestamp addition is associative across arbitrary slices', () => {
  const start = timestamp('10000000000000000', '1', '3');
  const sliced = addElapsedTime(
    addElapsedTime(start, { exact_minutes: rational('1', '7') }),
    { exact_minutes: rational('2', '7') }
  );
  const direct = addElapsedTime(start, { exact_minutes: rational('3', '7') });
  assert.deepEqual(sliced, direct);
  assert.equal(compareGameTimestamp(sliced, direct), 0);
  assert.deepEqual(subtractGameTimestamp(direct, start), rational('3', '7'));
});

test('Temporal v4 derives exact whole-minute crossings without inventing minute events', () => {
  const before = timestamp('10', '3', '4');
  const after = addElapsedTime(before, { exact_minutes: rational('1', '2') });
  assert.deepEqual(after, timestamp('11', '1', '4'));
  assert.equal(wholeMinuteIndex(after), '11');
  assert.equal(countCrossedWholeMinuteBoundaries(before, after), '1');

  const subminuteAfter = addElapsedTime(timestamp('10', '1', '4'), { exact_minutes: rational('1', '4') });
  assert.deepEqual(subminuteAfter, timestamp('10', '1', '2'));
  assert.equal(countCrossedWholeMinuteBoundaries(timestamp('10', '1', '4'), subminuteAfter), '0');
});

test('Temporal v4 rejects malformed and negative timestamp operations', () => {
  assert.throws(() => normalizeGameTimestamp(timestamp('01')), /timestamp|decimal/u);
  assert.throws(() => normalizeGameTimestamp(timestamp('1', '2', '2')), /timestamp|fraction/u);
  assert.throws(() => subtractGameTimestamp(timestamp('0'), timestamp('0', '1', '2')), /negative/u);
});

test('Temporal v4 normalized DTOs are JSON-safe, closed and slicing-independent across a deterministic property corpus', () => {
  assert.throws(() => normalizeRationalMinutes({ ...rational('1', '2'), unexpected: 'field' }), /property|rational/u);
  assert.throws(() => normalizeGameTimestamp({ ...timestamp('1'), technical_time: 'forbidden' }), /property|timestamp/u);

  for (let index = 1n; index <= 250n; index += 1n) {
    const start = timestamp((10_000_000_000_000_000n + index).toString(), (index % 7n).toString(), '11');
    const first = rational((index * 13n).toString(), '17');
    const second = rational((index * 19n).toString(), '23');
    const sliced = addElapsedTime(addElapsedTime(start, { exact_minutes: first }), { exact_minutes: second });
    const direct = addElapsedTime(start, { exact_minutes: addRationalMinutes(first, second) });
    assert.deepEqual(sliced, direct);
    assert.deepEqual(subtractGameTimestamp(direct, start), addRationalMinutes(first, second));
    assert.doesNotThrow(() => JSON.stringify(direct));
  }
  assert.equal(
    computeTemporalDigest({ timestamp: timestamp('3', '1', '2'), elapsed: rational('1', '3') }),
    computeTemporalDigest({ elapsed: rational('1', '3'), timestamp: timestamp('3', '1', '2') })
  );
  assert.throws(() => computeTemporalDigest({ unsafe: 1n }), /JSON-safe/u);
});
