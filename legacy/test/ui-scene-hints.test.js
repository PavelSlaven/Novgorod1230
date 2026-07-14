import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSceneActionHints } from '../src/ui/scene-hints.js';

test('scene hints are empty without visible entities', () => {
  assert.deepEqual(buildSceneActionHints({ notes: ['рядом двор'] }), []);
});

test('scene hints prefer explicit highlights over other markup', () => {
  const hints = buildSceneActionHints({
    highlights: [
      { label: 'ворота', action: 'move' },
      { label: 'староста', action: 'talk' }
    ],
    notes: ['не должно попасть в подсказки']
  });

  assert.deepEqual(hints, [
    { label: 'перейти: ворота', command: 'идти к ворота', action: 'move' },
    { label: 'поговорить: староста', command: 'поговорить с староста', action: 'talk' }
  ]);
});

test('scene hints fall back to visible entities', () => {
  const hints = buildSceneActionHints({
    entities: [
      { label: 'следы у ворот', action: 'inspect', accessible: true },
      { label: 'закрытая дверь', action: 'enter', accessible: false },
      { label: 'тайник под лавкой', action: 'inspect', visibility: 'hidden' },
      { label: 'чужой ключ', action: 'take', discoverability: 1 },
      { label: 'староста', action: 'talk' }
    ],
    notes: ['не должно попасть в подсказки']
  });

  assert.deepEqual(hints, [
    { label: 'осмотреть: следы у ворот', command: 'осмотреть следы у ворот', action: 'inspect' },
    { label: 'поговорить: староста', command: 'поговорить с староста', action: 'talk' }
  ]);
});

test('scene hints ignore hidden and unknown entities in fallback mode', () => {
  const hints = buildSceneActionHints({
    entities: [
      { label: 'скрытый мешок', action: 'inspect', visibility: 'hidden', accessible: true },
      { label: 'неизвестный тайник', action: 'inspect', visibility: 'unknown', accessible: true },
      { label: 'доска у стены', action: 'inspect', discoverability: 2, accessible: true }
    ]
  });

  assert.deepEqual(hints, [
    { label: 'осмотреть: доска у стены', command: 'осмотреть доска у стены', action: 'inspect' }
  ]);
});
