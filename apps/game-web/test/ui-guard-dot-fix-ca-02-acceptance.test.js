import assert from 'node:assert/strict';
import test from 'node:test';
import { renderProse, renderExactNpcUtterances } from '../src/features/prose/render.js';

const ref = (public_key, entity_kind = 'npc') => ({ entity_kind, public_key });
const speaker = (public_key, display_label, entity_kind = 'npc') => ({
  entity_ref: ref(public_key, entity_kind), display_label
});
const utterance = (public_key, utterance_text, entity_kind = 'npc') => ({
  speaker_ref: ref(public_key, entity_kind), utterance_text
});
const screen = (main_prose, exact_npc_utterances = [], visible_npc = [
  speaker('e1', 'Еремей'), speaker('e2', 'Лука')
]) => ({ main_prose, exact_npc_utterances, visible_context: { visible_npc } });
const blocks = (html) => [...html.matchAll(/<blockquote>([\s\S]*?)<\/blockquote>/gu)]
  .map((match) => match[1]);

test('CA-02: prose overlap never suppresses exact factual utterance or adds a prose carrier', async (t) => {
  const cases = [
    ['Он даже не обернулся.', 'да'],
    ['Его ответ был да.', 'да'],
    ['Еремей говорит: «да».', 'да'],
    ['Лука говорит: «да».', 'да'],
    ['Еремей говорит: «До вечера.»', 'До вечера.'],
    ['Еремей ответил: «До вечера не ходи к переправе».', 'До вечера не ходи к переправе.'],
    ['Еремей даже не обернулся.', 'До вечера не ходи к переправе.']
  ];
  for (const [main_prose, utterance_text] of cases) await t.test(main_prose, () => {
    const input = screen(main_prose, [utterance('e1', utterance_text)]);
    const before = structuredClone(input);
    const factual = renderExactNpcUtterances(input);
    const prose = renderProse(input);
    assert.deepEqual(blocks(factual), [`<strong>Еремей</strong><p>${utterance_text}</p>`],
      'factual speech and speaker survive any prose overlap');
    assert.ok(prose.includes(`<p>${main_prose}</p>`), 'approved prose remains visible');
    assert.deepEqual(blocks(prose), [], 'prose renderer adds no separate speech carrier');
    assert.deepEqual(input, before, 'both renderers must not mutate the screen');
  });
});

test('CA-02: a complete quote remains exactly once in approved prose', () => {
  const prose = 'Еремей говорит: «До вечера.»';
  const html = renderProse(screen(prose, [utterance('e1', 'До вечера.') ]));
  assert.equal((html.match(/До вечера\./gu) ?? []).length, 1);
  assert.deepEqual(blocks(html), []);
});

test('CA-02: equal utterances from distinct speakers keep factual attribution and order', () => {
  const html = renderExactNpcUtterances(screen('Сцена.', [
    utterance('e2', 'да'), utterance('e1', 'да')
  ]));
  assert.deepEqual(blocks(html), [
    '<strong>Лука</strong><p>да</p>', '<strong>Еремей</strong><p>да</p>'
  ]);
});

test('CA-02: equal display labels do not merge or reorder factual utterances', () => {
  const html = renderExactNpcUtterances(screen('Сцена.', [
    utterance('e2', 'Нет'), utterance('e1', 'Да')
  ], [speaker('e1', 'рыбак'), speaker('e2', 'рыбак')]));
  assert.deepEqual(blocks(html), [
    '<strong>рыбак</strong><p>Нет</p>', '<strong>рыбак</strong><p>Да</p>'
  ]);
});

test('CA-02: factual attribution requires the complete public reference', () => {
  const input = screen('Он кивнул.', [utterance('e1', 'Хорошо.')], [
    speaker('e1', 'Чужая подпись', 'item'), speaker('e2', 'Лука')
  ]);
  const html = renderExactNpcUtterances(input);
  assert.deepEqual(blocks(html), ['<p>Хорошо.</p>']);
});

test('CA-02: prose, factual label and exact speech remain escaped', () => {
  const input = screen('Он сказал <да & "нет">.', [
    utterance('e1', '<да & "нет">')
  ], [speaker('e1', '<Еремей & "сын">')]);
  const prose = renderProse(input);
  const factual = renderExactNpcUtterances(input);
  assert.ok(prose.includes('<p>Он сказал &lt;да &amp; &quot;нет&quot;&gt;.</p>'));
  assert.deepEqual(blocks(prose), []);
  assert.deepEqual(blocks(factual), [
    '<strong>&lt;Еремей &amp; &quot;сын&quot;&gt;</strong><p>&lt;да &amp; &quot;нет&quot;&gt;</p>'
  ]);
  assert.doesNotMatch(`${prose}${factual}`, /<Еремей|<да/u);
});

test('CA-02: legacy prose fallback stays visible without moving exact speech into prose', () => {
  const input = screen(null, [utterance('e1', 'да')]);
  input.prose = 'Он даже не обернулся.';
  assert.match(renderProse(input), /<p>Он даже не обернулся\.<\/p>/u);
  assert.deepEqual(blocks(renderProse(input)), []);
  assert.deepEqual(blocks(renderExactNpcUtterances(input)), [
    '<strong>Еремей</strong><p>да</p>'
  ]);
  assert.deepEqual(blocks(renderProse({ main_prose: 'Вы остановились.' })), []);
});
