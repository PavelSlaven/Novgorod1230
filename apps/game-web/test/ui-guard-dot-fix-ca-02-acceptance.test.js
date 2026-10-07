import assert from 'node:assert/strict';
import test from 'node:test';
import { renderProse, renderExactNpcUtterances } from '../src/features/prose/render.js';

// D102: sol-authored acceptance. No current screen field structurally links a
// prose fragment to a particular utterance AND speaker; free text is no proof.
const ref = (entity_id, entity_kind = 'npc') => ({ entity_kind, entity_id });
const speaker = (entity_id, display_label) => ({ entity_ref: ref(entity_id), display_label });
const utterance = (entity_id, utterance_text) => ({ speaker_ref: ref(entity_id), utterance_text });
const screen = (main_prose, exact_npc_utterances, visible_npc = [
  speaker('npc-1', 'Еремей'), speaker('npc-2', 'Лука')
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
    const input = screen(main_prose, [utterance('npc-1', 'да')]);
    const before = structuredClone(input);
    const html = renderProse(input);
    assert.deepEqual(blocks(html), ['<strong>Еремей</strong><p>да</p>']);
    assert.ok(html.includes(`<p>${main_prose}</p>`), 'free prose remains visible');
    assert.deepEqual(input, before, 'rendering must not mutate the screen');
  });
});

test('CA-02: a full named quotation still needs its separate structural carrier', () => {
  const html = renderProse(screen('Еремей говорит: «До вечера.»', [
    utterance('npc-1', 'До вечера.')
  ]));
  assert.deepEqual(blocks(html), ['<strong>Еремей</strong><p>До вечера.</p>']);
  assert.equal((html.match(/До вечера\./gu) ?? []).length, 2,
    'a possible duplicate is preferable to losing the attributed utterance');
});

test('CA-02: equal utterances from distinct speakers both retain their attribution and order', () => {
  const html = renderProse(screen('Еремей и Лука ответили: «да».', [
    utterance('npc-2', 'да'), utterance('npc-1', 'да')
  ]));
  assert.deepEqual(blocks(html), [
    '<strong>Лука</strong><p>да</p>', '<strong>Еремей</strong><p>да</p>'
  ]);
});

test('CA-02: equal display labels never merge different utterances or reorder them', () => {
  const html = renderProse(screen('рыбак сказал: «Нет».', [
    utterance('npc-2', 'Нет'), utterance('npc-1', 'Да')
  ], [speaker('npc-1', 'рыбак'), speaker('npc-2', 'рыбак')]));
  assert.deepEqual(blocks(html), [
    '<strong>рыбак</strong><p>Нет</p>', '<strong>рыбак</strong><p>Да</p>'
  ]);
});

test('CA-02: speaker attribution uses the complete ref, with the existing unknown-speaker label', () => {
  const input = screen('Он кивнул.', [utterance('npc-1', 'Хорошо.')], [
    { entity_ref: ref('npc-1', 'item'), display_label: 'Чужая подпись' },
    speaker('npc-2', 'Лука')
  ]);
  assert.deepEqual(blocks(renderProse(input)), [
    '<strong>Собеседник</strong><p>Хорошо.</p>'
  ]);
});

test('CA-02: prose, speaker label and exact speech remain escaped even when text matches', () => {
  const input = screen('Он сказал <да & "нет">.', [utterance('npc-1', '<да & "нет">')], [
    speaker('npc-1', '<Еремей & "сын">')
  ]);
  const html = renderProse(input);
  assert.ok(html.includes('<p>Он сказал &lt;да &amp; &quot;нет&quot;&gt;.</p>'));
  assert.deepEqual(blocks(html), [
    '<strong>&lt;Еремей &amp; &quot;сын&quot;&gt;</strong><p>&lt;да &amp; &quot;нет&quot;&gt;</p>'
  ]);
  assert.doesNotMatch(html, /<Еремей|<да/u);
});

test('CA-02: legacy prose and the factual speech renderer retain exact carriers', () => {
  const input = screen(null, [utterance('npc-1', 'да')]);
  input.prose = 'Он даже не обернулся.';
  assert.deepEqual(blocks(renderProse(input)), ['<strong>Еремей</strong><p>да</p>']);
  assert.deepEqual(blocks(renderExactNpcUtterances(input, 'Еремей говорит: «да».')),
    ['<strong>Еремей</strong><p>да</p>']);
  assert.deepEqual(blocks(renderProse({ main_prose: 'Вы остановились.' })), []);
});
