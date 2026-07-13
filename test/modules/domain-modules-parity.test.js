import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clampDifficulty as legacyClampDifficulty,
  evaluateCheckOutcome as legacyEvaluateCheckOutcome,
  calculateTravelTime as legacyCalculateTravelTime
} from '../../legacy/src/world/formulas.js';
import {
  calculateCarriedWeightFromItems as legacyCalculateCarriedWeight,
  resolveLoadCategory as legacyResolveLoadCategory
} from '../../legacy/src/world/load-model.js';
import {
  combatQualityFromMargin as legacyCombatQuality,
  combatHealthLossFromDamageScore as legacyHealthLoss,
  combatInjuryProfileFromDamageScore as legacyInjuryProfile
} from '../../legacy/src/world/combat-model.js';
import { canNpcRecognizeItem as legacyRecognition } from '../../legacy/src/world/item-recognition.js';
import {
  stripHiddenForNarrator as legacyStripHidden,
  validateVisibleContextPackage as legacyValidateVisible
} from '../../legacy/src/world/visibility.js';

import { clampDifficulty, evaluateCheckOutcome } from '@rus/checks-rng';
import { calculateTravelTime } from '@rus/movement-routes';
import { calculateCarriedWeight, resolveLoadCategory, buildRecognitionRequest } from '@rus/items-property';
import {
  combatQualityFromMargin,
  combatHealthLossFromDamageScore,
  combatInjuryProfileFromDamageScore
} from '@rus/combat-health';
import { stripHiddenForNarrator, validateVisibleContext } from '@rus/visibility-knowledge-memory';

test('check difficulty and outcome bands preserve legacy behavior', () => {
  for (const value of [null, 0, 5, 12.6, 30, 99]) {
    assert.equal(clampDifficulty(value), legacyClampDifficulty(value));
  }
  for (const [roll, total, dc] of [[1, 2, 15], [10, 9, 10], [12, 10, 10], [20, 25, 10]]) {
    const actual = evaluateCheckOutcome(roll, total, dc);
    const expected = legacyEvaluateCheckOutcome(roll, total, dc);
    assert.equal(actual.margin, expected.margin);
    assert.equal(actual.band, expected.band);
    assert.equal(actual.success, expected.success);
    assert.equal(actual.cost_required, expected.cost_required);
    assert.equal(actual.severe_failure, expected.severe_failure);
    assert.equal(actual.roll_note, expected.roll_note);
  }
});

test('travel time formula preserves legacy result for explicit base time', () => {
  const route = { id: 'route_1', scale: 'regional', base_time: 120 };
  const actor = { items: { load_category: 'heavy' } };
  const conditions = { poor: true };
  const actual = calculateTravelTime(route, actor, conditions);
  const expected = legacyCalculateTravelTime(route, actor, conditions);
  assert.equal(actual.base_time_minutes, expected.base_time);
  assert.equal(actual.condition_multiplier, expected.condition_multiplier);
  assert.equal(actual.load_multiplier, expected.load_multiplier);
  assert.equal(actual.final_time_minutes, expected.final_time);
});

test('inventory load calculation preserves legacy thresholds', () => {
  const actor = {
    attributes: { strength: 8 },
    items: {
      carried_items: [{ id: 'a', label: 'мешок', type: 'container', weight: 6, contents: [{ id: 'b', weight: 2 }] }],
      equipment: [{ id: 'c', label: 'топор', type: 'weapon', weight: 3 }]
    }
  };
  assert.equal(calculateCarriedWeight(actor), legacyCalculateCarriedWeight(actor));
  assert.equal(resolveLoadCategory(structuredClone(actor)), legacyResolveLoadCategory(structuredClone(actor)));
});

test('combat quality, health loss and injury bands preserve legacy behavior', () => {
  for (const score of [-1, 0, 1, 2, 4, 6, 8, 20]) {
    assert.equal(combatQualityFromMargin(score), legacyCombatQuality(score));
    assert.equal(combatHealthLossFromDamageScore(score), legacyHealthLoss(score));
    assert.deepEqual(combatInjuryProfileFromDamageScore(score), legacyInjuryProfile(score));
  }
});

test('item recognition request preserves legacy decision fields', () => {
  const npc = { id: 'npc_1', knowledge: ['знакомый нож с зарубкой'] };
  const item = { id: 'item_1', label: 'нож', type: 'weapon', marks: ['зарубка'], visible: true, visibility: 'visible' };
  const actual = buildRecognitionRequest(npc, item, {});
  const expected = legacyRecognition(npc, item, {});
  assert.equal(actual.obvious, expected.obvious);
  assert.equal(actual.check_required, expected.checkRequired);
  assert.equal(actual.difficulty, expected.dc);
  assert.equal(actual.reason, expected.reason);
});

test('visible boundary remains compatible and removes hidden fields', () => {
  const unsafe = {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: 'Двор пуст.',
    visible_changes: [],
    sensory_details: [],
    visible_npc: [],
    visible_objects: [],
    known_context: [],
    uncertainties: [],
    allowed_tensions: [],
    do_not_imply: [],
    hidden_state: { hidden_sentinel: true }
  };
  const actual = stripHiddenForNarrator(unsafe);
  const expected = legacyStripHidden(unsafe);
  assert.equal(actual.hidden_state, undefined);
  assert.equal(expected.hidden_state, undefined);
  assert.equal(validateVisibleContext(actual).ok, true);
  assert.equal(legacyValidateVisible(expected).ok, true);
});
