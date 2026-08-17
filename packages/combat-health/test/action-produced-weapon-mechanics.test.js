import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAttackRequest,
  combatActionProducedWeaponProfile,
  resolveActionProducedCombatWeaponClass
} from '../src/index.js';

test('closed qualitative class resolves only combat-owned formal input', () => {
  const result = resolveActionProducedCombatWeaponClass(request());
  assert.equal(result.qualitative_class, 'improvised_puncture_light');
  assert.deepEqual(result.formal_mechanics, { weapon_danger: 1 });
  assert.equal(buildAttackRequest(result.formal_mechanics).weapon_danger, 1);
  assert.equal(Object.isFrozen(result.profile_pin), true);
  assert.equal('damage' in result, false);
  assert.equal('canonical_weapon_identity' in result, false);
});

test('closed improvised classes use only the versioned combat catalog', () => {
  for (const [qualitativeClass, weaponDanger] of [
    ['improvised_puncture_light', 1],
    ['improvised_impact_light', 1],
    ['improvised_cutting_light', 1],
    ['improvised_two_hand_heavy', 2]
  ]) {
    const input = request();
    input.classification.qualitative_class = qualitativeClass;
    assert.deepEqual(resolveActionProducedCombatWeaponClass(input)
      .formal_mechanics, { weapon_danger: weaponDanger });
  }
});

test('combat owner rejects arbitrary damage and canonical identity', () => {
  for (const extra of [
    { damage: 900 }, { weapon_danger: 900 },
    { canonical_weapon_identity: 'royal_spear' },
    { output_class: 'money_like_token' },
    { output_class: 'written_carrier' },
    { output_class: 'ordinary_mundane' }
  ]) {
    const input = request(); Object.assign(input.classification, extra);
    assert.throws(() => resolveActionProducedCombatWeaponClass(input),
      { code: 'COMBAT_ACTION_PRODUCED_WEAPON_CLASSIFICATION_INVALID' });
  }
  const unknown = request();
  unknown.classification.qualitative_class = 'royal_spear';
  assert.throws(() => resolveActionProducedCombatWeaponClass(unknown),
    { code: 'COMBAT_ACTION_PRODUCED_WEAPON_CLASSIFICATION_INVALID' });
});

test('missing stale and forged combat owner profiles fail closed', () => {
  const missing = request(); missing.profile = null;
  assert.throws(() => resolveActionProducedCombatWeaponClass(missing),
    { code: 'COMBAT_ACTION_PRODUCED_WEAPON_PROFILE_INVALID' });
  const stale = request(); stale.expected_profile_pin.state_version = 2;
  assert.throws(() => resolveActionProducedCombatWeaponClass(stale),
    { code: 'COMBAT_ACTION_PRODUCED_WEAPON_PROFILE_STALE' });
  for (const mutate of [
    (profile) => { profile.profile_ref = 'combat:forged'; },
    (profile) => { profile.catalog_digest = `sha256:${'f'.repeat(64)}`; },
    (profile) => { profile.state_version = 2; }
  ]) {
    const forged = request(); mutate(forged.profile);
    assert.throws(() => resolveActionProducedCombatWeaponClass(forged),
      { code: 'COMBAT_ACTION_PRODUCED_WEAPON_PROFILE_INVALID' });
  }
});

test('combat class boundary rejects getters and aliases without reads', () => {
  let reads = 0;
  const accessor = request();
  Object.defineProperty(accessor.classification, 'qualitative_class', {
    enumerable: true,
    get() { reads += 1; return 'improvised_puncture_light'; }
  });
  assert.throws(() => resolveActionProducedCombatWeaponClass(accessor),
    { code: 'COMBAT_ACTION_PRODUCED_WEAPON_INPUT_INVALID' });
  assert.equal(reads, 0);
  for (const mutate of [
    (value) => { value[Symbol('forged')] = true; },
    (value) => { Object.setPrototypeOf(value.profile, { forged: true }); },
    (value) => { value.self = value; },
    (value) => { value.profile = value.expected_profile_pin; }
  ]) {
    const hostile = request(); mutate(hostile);
    assert.throws(() => resolveActionProducedCombatWeaponClass(hostile),
      { code: 'COMBAT_ACTION_PRODUCED_WEAPON_INPUT_INVALID' });
  }
});

function request() {
  const profile = structuredClone(combatActionProducedWeaponProfile());
  return {
    classification: {
      schema: 'rus.combat.action_produced_weapon_classification.v1',
      qualitative_class: 'improvised_puncture_light'
    },
    profile,
    expected_profile_pin: {
      profile_ref: profile.profile_ref,
      profile_version: profile.profile_version,
      state_version: profile.state_version,
      catalog_digest: profile.catalog_digest
    }
  };
}
