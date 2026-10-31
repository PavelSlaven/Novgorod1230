import test from 'node:test';
import assert from 'node:assert/strict';
import { renderWarrior, renderItemCard } from '../warrior.mjs';
import { renderLandscape, LANDSCAPE_TIMES, LANDSCAPE_WEATHER } from '../landscape.mjs';
import { renderMap } from '../map.mjs';
import { sampleOvermap, sampleVisibility } from '../map-sample.mjs';

const BROKEN = /NaN|undefined|Infinity/u;

function assertStableSvg(make) {
  const svg = make();
  assert.match(svg, /^<svg[\s\S]*<\/svg>$/u);
  assert.doesNotMatch(svg, BROKEN);
  assert.equal(make(), svg);
}

test('people, faces and item cards are deterministic and finite', () => {
  assertStableSvg(() => renderWarrior({}));
  assertStableSvg(() => renderWarrior({ helmet: 'none', armor: 'scale', shield: 'almond', seed: 21, face: { age: 'old', beard: 'forked', hair: 'bald', scar: 'cheek' } }));
  assertStableSvg(() => renderItemCard({ item: 'helmet', title: 'Шлем', lines: ['железо'] }));
  assertStableSvg(() => renderItemCard({ item: 'axe', title: 'Топор', lines: ['железо, дерево'], seed: 8 }));
});

test('landscape renders every time of day and weather', () => {
  for (const time of LANDSCAPE_TIMES) {
    for (const weather of LANDSCAPE_WEATHER) assertStableSvg(() => renderLandscape({ time, weather }));
  }
});

test('map renders seasons and fog of war', () => {
  const map = sampleOvermap(1230);
  const hero = map.villages[0];
  assertStableSvg(() => renderMap({ map }));
  assertStableSvg(() => renderMap({ map, season: 'winter' }));
  assertStableSvg(() => renderMap({ map, visibility: sampleVisibility(map, hero), hero, npcs: [[hero[0] + 2, hero[1] - 1]] }));
});
