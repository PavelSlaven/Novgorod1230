import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeItemContainerSet } from
  '../src/internal/lower-dvina-trace-character-appearance-bundle.js';
import { loadLowerDvinaTraceMaterializationBundle } from
  '../src/internal/lower-dvina-trace-phase-1a-bundle.js';

test('item-inventory overlay may revise an existing authored profile', () => {
  const base = { item_templates: [], item_inventory_profiles: [{
    inventory_profile_id: 'blue_wool', mass_grams: 10, carry_form: 'compact',
    external_hand_cost: 0
  }] };
  const merged = mergeItemContainerSet(base, {
    revision: 7,
    item_inventory_profile_overrides: [{
      inventory_profile_id: 'blue_wool', external_hand_cost: 1
    }]
  }, (code) => { throw Object.assign(new Error(code), { code }); });
  assert.deepEqual(merged.item_inventory_profiles, [{
    inventory_profile_id: 'blue_wool', mass_grams: 10, carry_form: 'compact',
    external_hand_cost: 1
  }]);
  assert.equal(base.item_inventory_profiles[0].external_hand_cost, 0);
});

test('item-inventory overlay rejects unknown or non-profile fields', () => {
  const base = { item_templates: [], item_inventory_profiles: [] };
  const fail = (code) => { throw Object.assign(new Error(code), { code }); };
  assert.throws(() => mergeItemContainerSet(base, {
    item_inventory_profile_overrides: [{ inventory_profile_id: 'missing',
      external_hand_cost: 1 }]
  }, fail), { code: 'TRACE_M7_ITEM_PROFILE_MISSING' });
  assert.throws(() => mergeItemContainerSet({ ...base,
    item_inventory_profiles: [{ inventory_profile_id: 'blue_wool' }] }, {
    item_inventory_profile_overrides: [{ inventory_profile_id: 'blue_wool',
      owner_ref: 'forbidden' }]
  }, fail), { code: 'TRACE_M7_ITEM_PROFILE_OVERRIDE_INVALID' });
});

test('revision 35 pins the blue-wool one-hand profile', async () => {
  const bundle = await loadLowerDvinaTraceMaterializationBundle({
    scenarioDefinitionRevision: 35
  });
  const profile = bundle.item_container_set.item_inventory_profiles.find(
    ({ inventory_profile_id: id }) =>
      id === 'trace_ld_v1_inventory_profile_blue_wool_fragment'
  );
  assert.deepEqual(profile, {
    inventory_profile_id: 'trace_ld_v1_inventory_profile_blue_wool_fragment',
    item_template_ref: 'trace_ld_v1_item_blue_wool_fragment',
    mass_grams: 10, carry_form: 'compact', external_hand_cost: 1
  });
});
