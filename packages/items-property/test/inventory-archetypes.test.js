import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveInventoryProfile, validateInventoryArchetypes } from '../src/index.js';

const archetypes = [{ inventory_archetype_id: 'compact_tool', mass_grams: 300, carry_form: 'compact', external_hand_cost: 1, status: 'approved' }];

test('legacy exact inventory profile remains supported', () => {
  const resolved = resolveInventoryProfile({ profile: { mass_grams: 300, carry_form: 'compact', external_hand_cost: 1 } });
  assert.deepEqual(resolved, { mass_grams: 300, carry_form: 'compact', external_hand_cost: 1 });
  assert.ok(Object.isFrozen(resolved));
});

test('inventory archetype resolves and applies named overrides without mutation', () => {
  const profile = { inventory_archetype_ref: 'compact_tool', mass_grams_override: 180 };
  const source = structuredClone(profile);
  const resolved = resolveInventoryProfile({ profile, archetypes });
  assert.deepEqual(resolved, { mass_grams: 180, carry_form: 'compact', external_hand_cost: 1 });
  assert.deepEqual(profile, source);
  assert.ok(Object.isFrozen(resolved));
});

test('inventory archetype resolution fails closed for invalid authoring data', () => {
  assert.throws(() => resolveInventoryProfile({ profile: { inventory_archetype_ref: 'unknown' }, archetypes }), (error) => error.code === 'INVENTORY_ARCHETYPE_NOT_FOUND');
  assert.throws(() => validateInventoryArchetypes([...archetypes, { ...archetypes[0] }]), (error) => error.code === 'INVENTORY_ARCHETYPE_ID_DUPLICATE');
  assert.throws(() => resolveInventoryProfile({ profile: { inventory_archetype_ref: 'compact_tool', mass_grams: 300 }, archetypes }), (error) => error.code === 'INVENTORY_ARCHETYPE_PROFILE_CONFLICT');
  assert.throws(() => validateInventoryArchetypes([{ ...archetypes[0], mass_grams: -1 }]), (error) => error.code === 'INVENTORY_ARCHETYPE_MASS_INVALID');
  assert.throws(() => validateInventoryArchetypes([{ ...archetypes[0], carry_form: 'invalid' }]), (error) => error.code === 'INVENTORY_ARCHETYPE_CARRY_FORM_INVALID');
  assert.throws(() => validateInventoryArchetypes([{ ...archetypes[0], external_hand_cost: 3 }]), (error) => error.code === 'INVENTORY_ARCHETYPE_HAND_COST_INVALID');
  assert.throws(() => resolveInventoryProfile({ profile: { mass_grams: 300, carry_form: 'compact', external_hand_cost: 1, mass_grams_override: 180 } }), (error) => error.code === 'INVENTORY_ARCHETYPE_OVERRIDE_WITHOUT_REF');
  assert.throws(() => resolveInventoryProfile({ profile: { inventory_archetype_ref: ' compact_tool ' }, archetypes }), (error) => error.code === 'INVENTORY_ARCHETYPE_NOT_FOUND');
  assert.throws(() => validateInventoryArchetypes([{ ...archetypes[0], inventory_archetype_id: ' compact_tool ' }]), (error) => error.code === 'INVENTORY_ARCHETYPE_ID_REQUIRED');
  assert.throws(() => validateInventoryArchetypes([{ ...archetypes[0], inventory_archetype_ref: 'other' }]), (error) => error.code === 'INVENTORY_ARCHETYPE_INHERITANCE_FORBIDDEN');
  assert.throws(() => validateInventoryArchetypes([{ ...archetypes[0], inventory_archetype_refs: ['other'] }]), (error) => error.code === 'INVENTORY_ARCHETYPE_FIELD_UNKNOWN');
  assert.throws(() => validateInventoryArchetypes({ schema: 'unknown', revision: 1, archetypes }), (error) => error.code === 'INVENTORY_ARCHETYPE_SET_INVALID');
});
