import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findMixedLatinCyrillicWord,
  normalizeMixedScriptHomoglyphs
} from '../src/index.js';

test('finds first mixed Latin/Cyrillic word and normalizes mapped homoglyphs', () => {
  assert.equal(findMixedLatinCyrillicWord('Обычный текст, пpивет!'), 'пpивет');
  assert.deepEqual(normalizeMixedScriptHomoglyphs('Обычный текст, пpивет!'), {
    text: 'Обычный текст, привет!',
    replacedCharacterCount: 1
  });
});

test('leaves a mixed token unchanged when any Latin letter has no Russian pair', () => {
  assert.deepEqual(normalizeMixedScriptHomoglyphs('мuж'), {
    text: 'мuж',
    replacedCharacterCount: 0
  });
});

test('does not normalize wholly Latin words', () => {
  assert.equal(findMixedLatinCyrillicWord('ok Linux'), null);
  assert.deepEqual(normalizeMixedScriptHomoglyphs('ok Linux'), {
    text: 'ok Linux',
    replacedCharacterCount: 0
  });
});

test('normalization is idempotent', () => {
  const normalized = normalizeMixedScriptHomoglyphs('пpивет');
  assert.deepEqual(normalizeMixedScriptHomoglyphs(normalized.text), {
    text: normalized.text,
    replacedCharacterCount: 0
  });
});
