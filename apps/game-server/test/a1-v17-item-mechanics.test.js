import assert from 'node:assert/strict';
import test from 'node:test';
import { committedMechanics } from '../src/runtime/releases/lower-dvina-trace-a1-pre-attempt.js';

// item-container-120-v5 inventory profiles (v17 start clothing) carry only mass, hands and carry form.
const shirt = { template_id: 'item_tpl_nov_linen_shirt_v1', state: { display_name: 'нижняя рубаха',
  inventory_profile_snapshot: { status: 'approved', carry_form: 'regular', mass_grams: 600,
    item_template_ref: 'item_tpl_nov_linen_shirt_v1', external_hand_cost: 0,
    inventory_profile_id: 'inventory_item_tpl_nov_linen_shirt_v1' } } };

test('A1 accepts a v5 inventory profile without packing, quantity or container fields', () => {
  assert.deepEqual(committedMechanics(shirt), { mass_grams: 600, external_hand_cost: 0,
    carry_form: 'regular', packing_slot_cost: 0, quantity: null, container: null });
});

test('A1 still refuses a container profile and a broken profile', () => {
  const container = structuredClone(shirt);
  container.state.inventory_profile_snapshot.container = { capacity: 3 };
  assert.throws(() => committedMechanics(container), { code: 'TRACE_A1_ITEM_MECHANICS_INVALID' });
  const broken = structuredClone(shirt);
  broken.state.inventory_profile_snapshot.mass_grams = -1;
  assert.throws(() => committedMechanics(broken), { code: 'TRACE_A1_ITEM_MECHANICS_INVALID' });
});
