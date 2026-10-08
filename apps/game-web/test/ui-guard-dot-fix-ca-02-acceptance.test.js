import assert from 'node:assert/strict';
import test from 'node:test';
import { renderProse, renderExactNpcUtterances } from '../src/features/prose/render.js';

// D102: sol-authored acceptance. No current screen field structurally links a
// prose fragment to a particular utterance AND speaker; free text is no proof.
const ref = (public_key, entity_kind = 'npc') => ({ entity_kind, public_key });
const speaker = (public_key, display_label) => ({ entity_ref: ref(public_key), display_label });
const utterance = (public_key, utterance_text) => ({ speaker_ref: ref(public_key), utterance_text });
const screen = (main_prose, exact_npc_utterances, visible_npc = [
  speaker('e1', 'Еремей'), speaker('e2', 'Лука')
]) => ({ main_prose, exact_npc_utterances, visible_context: { visible_npc } });
const blocks = (html) => [...html.matchAll(/<blockquote>([\s\S]*?)<\/blockquote>/gu)]
  .map((match) => match[1]);

test('CA-02: free prose never suppresses a committed attributed utterance', async (t) => {
  for (const main_prose of [
    'Он даже не обернулся.',
    'Его ответ был да.',
    'Еремей говорит: «да».',
    'Лука говорит: «да».'
  ]) await t.test(main_prose, () => {
    const input = screen(main_prose, [utterance('e1', 'да')]);
    const before = structuredClone(input);
    const html = renderProse(input);
    assert.deepEqual(blocks(html), ['<strong>Еремей</strong><p>да</p>']);
    assert.ok(html.includes(`<p>${main_prose}</p>`), 'free prose remains visible');
    assert.deepEqual(input, before, 'rendering must not mutate the screen');
  });
});

test('CA-02: a full named quotation still needs its separate structural carrier', () => {
  const html = renderProse(screen('Еремей говорит: «До вечера.»', [
    utterance('e1', 'До вечера.')
  ]));
  assert.deepEqual(blocks(html), ['<strong>Еремей</strong><p>До вечера.</p>']);
  assert.equal((html.match(/До вечера\./gu) ?? []).length, 2,
    'a possible duplicate is preferable to losing the attributed utterance');
});

test('CA-02: equal utterances from distinct speakers both retain their attribution and order', () => {
  const html = renderProse(screen('Еремей и Лука ответили: «да».', [
    utterance('e2', 'да'), utterance('e1', 'да')
  ]));
  assert.deepEqual(blocks(html), [
    '<strong>Лука</strong><p>да</p>', '<strong>Еремей</strong><p>да</p>'
  ]);
});

test('CA-02: equal display labels never merge different utterances or reorder them', () => {
  const html = renderProse(screen('рыбак сказал: «Нет».', [
    utterance('e2', 'Нет'), utterance('e1', 'Да')
  ], [speaker('e1', 'рыбак'), speaker('e2', 'рыбак')]));
  assert.deepEqual(blocks(html), [
    '<strong>рыбак</strong><p>Нет</p>', '<strong>рыбак</strong><p>Да</p>'
  ]);
});

test('CA-02: speaker attribution uses the complete ref, with the existing unknown-speaker label', () => {
  const input = screen('Он кивнул.', [utterance('e1', 'Хорошо.')], [
    { entity_ref: ref('e1', 'item'), display_label: 'Чужая подпись' },
    speaker('e2', 'Лука')
  ]);
  assert.deepEqual(blocks(renderProse(input)), [
    '<strong>Собеседник</strong><p>Хорошо.</p>'
  ]);
});

test('CA-02: prose, speaker label and exact speech remain escaped even when text matches', () => {
  const input = screen('Он сказал <да & "нет">.', [utterance('e1', '<да & "нет">')], [
    speaker('e1', '<Еремей & "сын">')
  ]);
  const html = renderProse(input);
  assert.ok(html.includes('<p>Он сказал &lt;да &amp; &quot;нет&quot;&gt;.</p>'));
  assert.deepEqual(blocks(html), [
    '<strong>&lt;Еремей &amp; &quot;сын&quot;&gt;</strong><p>&lt;да &amp; &quot;нет&quot;&gt;</p>'
  ]);
  assert.doesNotMatch(html, /<Еремей|<да/u);
});

test('CA-02: legacy prose and the factual speech renderer retain exact carriers', () => {
  const input = screen(null, [utterance('e1', 'да')]);
  input.prose = 'Он даже не обернулся.';
  assert.deepEqual(blocks(renderProse(input)), ['<strong>Еремей</strong><p>да</p>']);
  assert.deepEqual(blocks(renderExactNpcUtterances(input, 'Еремей говорит: «да».')),
    ['<strong>Еремей</strong><p>да</p>']);
  assert.deepEqual(blocks(renderProse({ main_prose: 'Вы остановились.' })), []);
});
