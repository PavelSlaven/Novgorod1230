import assert from 'node:assert/strict';
import test from 'node:test';
import { completeAuthoredItemMechanics } from
  '../src/lower-dvina-trace-selection.js';

test('M20 individual authored mechanics include one item per packing bundle', () => {
  const profile = { inventory_profile_id: 'individual', mass_grams: 100 };
  const bundle = { definition_revision: 32,
    a1_authored_item_mechanics_profile: { profiles: [{
      profile_ref: 'individual', packing_slot_cost: 2,
      quantity: null, container: null
    }] } };
  assert.deepEqual(completeAuthoredItemMechanics(bundle, profile), {
    ...profile, packing_slot_cost: 2, packing_bundle_size: 1,
    quantity: null, container: null
  });
  assert.deepEqual(completeAuthoredItemMechanics({ definition_revision: 31 },
    profile), profile);
  assert.throws(() => completeAuthoredItemMechanics(bundle,
    { inventory_profile_id: 'missing' }), {
    code: 'TRACE_REVISION_32_ITEM_MECHANICS_INVALID'
  });
  assert.equal(profile.packing_bundle_size, undefined);
});
