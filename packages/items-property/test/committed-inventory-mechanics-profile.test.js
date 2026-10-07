import assert from 'node:assert/strict';
import test from 'node:test';
import * as items from '@rus/items-property';

const base = { mass_grams: 600, external_hand_cost: 0, carry_form: 'regular' };
const expected = { ...base, packing_slot_cost: 0, quantity: null, container: null };

function project(profile) {
  assert.equal(typeof items.projectCommittedInventoryMechanicsProfile, 'function',
    'items-property must own the committed inventory mechanics projection');
  return items.projectCommittedInventoryMechanicsProfile(profile);
}

test('the item owner projects exactly six mechanics fields from a v5 profile', () => {
  const profile = { ...base, status: 'approved', inventory_profile_id: 'shirt-profile' };
  const before = structuredClone(profile);
  assert.deepEqual(project(profile), expected);
  assert.deepEqual(profile, before);
  for (const field of ['packing_slot_cost', 'quantity', 'container']) {
    assert.equal(Object.hasOwn(profile, field), false,
      'computed defaults must not become authored profile fields');
  }
});

test('only absent or undefined optional fields receive defaults', () => {
  assert.deepEqual(project({ ...base, packing_slot_cost: undefined,
    quantity: undefined, container: undefined }), expected);
  assert.deepEqual(project({ ...base, packing_slot_cost: null,
    quantity: null, container: null }), { ...expected, packing_slot_cost: null });
  assert.deepEqual(project({ ...base, packing_slot_cost: 7,
    quantity: null, container: null }), { ...expected, packing_slot_cost: 7 });
});

test('projection preserves quantity and container without early validation or cloning', () => {
  const quantity = { value: 0.5, unit: 'piece' };
  const container = { capacity: 3 };
  const profile = Object.freeze({ ...base, packing_slot_cost: 2,
    quantity: Object.freeze(quantity), container: Object.freeze(container) });
  const result = project(profile);
  assert.deepEqual(result, { ...base, packing_slot_cost: 2, quantity, container });
  assert.equal(result.quantity, quantity);
  assert.equal(result.container, container);
  const invalid = { ...profile, mass_grams: -1, quantity: { value: -2, unit: '' } };
  assert.deepEqual(project(invalid), { ...base, mass_grams: -1,
    packing_slot_cost: 2, quantity: invalid.quantity, container });
});

test('source selection retains absent authored fields and mixed-source failure', () => {
  const profile = { template_id: 'shirt', ...base };
  const result = items.resolveInventoryMechanicsProfile({
    instance: { template_id: 'shirt' }, profiles: [profile]
  });
  assert.equal(result.pass, true);
  assert.equal(result.source, 'authored_profile');
  assert.deepEqual(result.profile, profile);
  for (const field of ['packing_slot_cost', 'quantity', 'container']) {
    assert.equal(Object.hasOwn(result.profile, field), false);
  }
  const conflict = items.resolveInventoryMechanicsProfile({
    instance: { template_id: 'shirt', runtime_instance_mechanics_snapshot: {} },
    profiles: [profile]
  });
  assert.equal(conflict.pass, false);
  assert.equal(conflict.errors[0].code, 'ITEM_MECHANICS_SOURCE_CONFLICT');
});

test('an unresolved projection has undefined mandatory fields, not invented mechanics', () => {
  assert.deepEqual(project(undefined), { mass_grams: undefined,
    external_hand_cost: undefined, carry_form: undefined,
    packing_slot_cost: 0, quantity: null, container: null });
});
