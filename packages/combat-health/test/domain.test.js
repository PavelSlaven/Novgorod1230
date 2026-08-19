import test from 'node:test';
import assert from 'node:assert/strict';
import { applyHarmPackage, buildAttackRequest, buildHarmPackage,
  combatHealthLossFromDamageScore, combatQualityFromMargin,
  ORDINARY_ARMAMENT_MECHANICS_CAPABILITY, ordinaryArmamentWeaponDanger,
  resolveOrdinaryArmamentMechanics } from '../src/index.js';

test('combat-health preserves legacy quality and harm bands', () => {
  assert.equal(combatQualityFromMargin(10), 3);
  assert.equal(combatHealthLossFromDamageScore(6), 25);
  const request = buildAttackRequest({ attacker_id:'a', target_id:'b', target_defense:10, weapon_danger:3, target_protection:1 });
  const harm = buildHarmPackage({ total:15 }, request);
  assert.equal(harm.quality, 2);
  assert.equal(harm.damage_score, 4);
  const body = applyHarmPackage({ health:50, active_conditions:[] }, harm);
  assert.equal(body.health, 38);
});

test('ordinary armament capability owns a closed reload-safe danger snapshot', () => {
  const serviceable = resolveOrdinaryArmamentMechanics({
    mechanics_capability_ref: ORDINARY_ARMAMENT_MECHANICS_CAPABILITY,
    condition_state: 'serviceable'
  });
  const damaged = resolveOrdinaryArmamentMechanics({
    mechanics_capability_ref: ORDINARY_ARMAMENT_MECHANICS_CAPABILITY,
    condition_state: 'damaged'
  });
  assert.equal(ordinaryArmamentWeaponDanger(structuredClone(serviceable)), 1);
  assert.equal(ordinaryArmamentWeaponDanger(structuredClone(damaged)), 0);
  assert.equal(resolveOrdinaryArmamentMechanics({
    mechanics_capability_ref: 'combat:forged', condition_state: 'serviceable'
  }), null);
});
