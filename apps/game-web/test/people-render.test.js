import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPeoplePanel } from '../src/features/people/render.js';

test('people panel renders player-safe display labels', () => {
  const html = renderPeoplePanel({ panels: { people: { visible: true, data: {
    visible_npcs: [{ display_label: 'Еремей', status: 'говорит с вами' },
      { display_label: 'рыбак' }]
  } } } });

  assert.match(html, /Еремей/u);
  assert.match(html, /говорит с вами/u);
  assert.match(html, /рыбак/u);
  assert.doesNotMatch(html, /Рядом никого не видно/u);
});

test('people panel renders appearance beside current status', () => {
  const html = renderPeoplePanel({ panels: { people: { visible: true, data: {
    visible_npcs: [{ display_label: 'человек (1)',
      appearance: 'русые волосы, короткая борода', status: 'чинит сети' },
    { display_label: 'человек (2)', appearance: 'лысина, густая борода',
      status: 'чинит сети' }]
  } } } });

  assert.match(html, /русые волосы, короткая борода · чинит сети/u);
  assert.match(html, /лысина, густая борода · чинит сети/u);
});
