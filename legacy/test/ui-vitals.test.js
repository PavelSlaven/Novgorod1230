import assert from 'node:assert/strict';
import test from 'node:test';
import { getPlayerAlertTags, getPlayerVitals, summarizeNeedsText, summarizeStateBadgeText } from '../src/ui/vitals.js';

test('ui vitals prefer canonical states over legacy fields', () => {
  const player = {
    states: {
      health: 88,
      satiety: 67,
      vigor: 42
    },
    health: 10,
    hunger: 90,
    fatigue: 0,
    sleep: 0,
    activeStates: [
      { label: 'усталость' },
      { label: 'голод' }
    ]
  };

  assert.deepEqual(getPlayerVitals(player), {
    health: 88,
    satiety: 67,
    vigor: 42
  });
  assert.deepEqual(getPlayerAlertTags(player), ['обессилен', 'голоден']);
  assert.equal(summarizeNeedsText(player), 'Здоровье 88 · Сытость 67 · Бодрость 42 · Тревоги: обессилен / голоден');
  assert.equal(summarizeStateBadgeText(player), '2 тревоги');
});

test('ui vitals badge hides when active states are absent', () => {
  assert.equal(summarizeStateBadgeText({ states: { health: 100, satiety: 100, vigor: 100 }, activeStates: [] }), 'Тревог нет');
});

test('ui vitals include compact alerts for cold wet and overloaded states', () => {
  const player = {
    states: {
      health: 100,
      satiety: 100,
      vigor: 100
    },
    activeStates: [
      { id: 'cold', label: 'холод' },
      { id: 'wet', label: 'промокание' }
    ],
    items: {
      load_category: 'overloaded'
    }
  };

  assert.deepEqual(getPlayerAlertTags(player), ['мёрзнет', 'промок', 'перегружен']);
  assert.equal(summarizeNeedsText(player), 'Здоровье 100 · Сытость 100 · Бодрость 100 · Тревоги: мёрзнет / промок / перегружен');
  assert.equal(summarizeStateBadgeText(player), '3 тревоги');
});
