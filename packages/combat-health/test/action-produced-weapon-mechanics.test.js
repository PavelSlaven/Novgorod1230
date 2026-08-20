import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTION_PRODUCED_WEAPON_CLASSES,
  buildAttackRequest,
  resolveActionProducedCombatWeaponClass
} from '../src/index.js';

test('combat-owned qualitative classes map to exact weapon danger', () => {
  for (const [qualitativeClass, weaponDanger] of [
    ['improvised_puncture_light', 1],
    ['improvised_impact_light', 1],
    ['improvised_cutting_light', 1],
    ['improvised_two_hand_heavy', 2]
  ]) {
    const input = request(qualitativeClass);
    const result = resolveActionProducedCombatWeaponClass(input);
    assert.deepEqual(result.formal_mechanics, {
      weapon_danger: weaponDanger
    });
    assert.equal(buildAttackRequest(result.formal_mechanics).weapon_danger,
      weaponDanger);
    assert.equal(result.request_id, 'combat-weapon:1');
  }
  assert.equal(Object.isFrozen(ACTION_PRODUCED_WEAPON_CLASSES), true);
});

test('combat boundary rejects arbitrary class, mechanics and hostile data', () => {
  for (const extra of [
    { damage: 900 }, { weapon_danger: 900 },
    { canonical_weapon_identity: 'royal_spear' }
  ]) {
    const input = request(); Object.assign(input.classification, extra);
    assert.throws(() => resolveActionProducedCombatWeaponClass(input), {
      code: 'COMBAT_ACTION_PRODUCED_WEAPON_CLASSIFICATION_INVALID'
    });
  }
  const unknown = request('royal_spear');
  assert.throws(() => resolveActionProducedCombatWeaponClass(unknown), {
    code: 'COMBAT_ACTION_PRODUCED_WEAPON_CLASSIFICATION_INVALID'
  });
  let reads = 0;
  const accessor = request();
  Object.defineProperty(accessor.classification, 'qualitative_class', {
    enumerable: true,
    get() { reads += 1; return 'improvised_puncture_light'; }
  });
  assert.throws(() => resolveActionProducedCombatWeaponClass(accessor), {
    code: 'COMBAT_ACTION_PRODUCED_WEAPON_CLASSIFICATION_INVALID'
  });
  assert.equal(reads, 0);
  const cycle = request(); cycle.self = cycle;
  assert.throws(() => resolveActionProducedCombatWeaponClass(cycle), {
    code: 'COMBAT_ACTION_PRODUCED_WEAPON_CLASSIFICATION_INVALID'
  });
});

function request(qualitativeClass = 'improvised_puncture_light') {
  return { classification: {
    schema: 'rus.combat.action_produced_weapon_classification.v1',
    request_id: 'combat-weapon:1', qualitative_class: qualitativeClass
  } };
}
