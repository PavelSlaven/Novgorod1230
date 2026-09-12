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
