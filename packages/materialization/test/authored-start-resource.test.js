import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAuthoredStartResource } from '../src/authored-start.js';
import { calculateContainerUsage, calculatePackingSlots } from
  '@rus/items-property';

const resource = (kind) => ({
  item_template_id: `item-${kind}`,
  inventory_profile_id: `inventory-${kind}`,
  quantity_profile_id: `quantity-${kind}`,
  category_id: `category-${kind}`,
  quantity: 1
});

function records() {
  return {
    item_templates: ['rope', 'shirt'].map((kind) => ({
      id: `item-${kind}`, category_id: `category-${kind}`,
      status: 'approved'
    })),
    item_template_inventory_profiles: [{ id: 'inventory-rope',
      item_template_id: 'item-rope', mass_grams: 1200, carry_form: 'long',
      external_hand_cost: 1, status: 'approved' },
    { id: 'inventory-shirt', item_template_id: 'item-shirt',
      mass_grams: 500, carry_form: 'regular', external_hand_cost: 0,
      status: 'approved' }],
    item_template_quantity_profiles: ['rope', 'shirt'].map((kind) => ({
      id: `quantity-${kind}`, item_template_id: `item-${kind}`,
      minimum_quantity: 1, maximum_quantity: 1, status: 'approved'
    })),
    universal_categories: ['rope', 'shirt'].flatMap((kind) => [{
      id: `category-${kind}`, status: 'approved'
    }, { id: `size-${kind}`, domain: 'item', facet: 'size_band',
      status: 'approved' }]),
    item_template_category_bindings: [{ id: 'rope-size',
      item_template_id: 'item-rope', category_id: 'size-rope',
      binding_kind: 'size_band', packing_slot_cost: 6,
      packing_bundle_size: 1, status: 'approved' },
    { id: 'shirt-size', item_template_id: 'item-shirt',
      category_id: 'size-shirt', binding_kind: 'size_band',
      packing_slot_cost: 3, packing_bundle_size: 1, status: 'approved' }]
  };
}

test('authored resources persist exact approved size-band packing', () => {
  const catalog = records();
  assert.deepEqual(resolveAuthoredStartResource(catalog, resource('rope'))
    .inventory_profile, { mass_grams: 1200, carry_form: 'long',
    external_hand_cost: 1, packing_slot_cost: 6, packing_bundle_size: 1,
    size_band: 'size-rope' });
  assert.deepEqual(resolveAuthoredStartResource(catalog, resource('shirt'))
    .inventory_profile, { mass_grams: 500, carry_form: 'regular',
    external_hand_cost: 0, packing_slot_cost: 3, packing_bundle_size: 1,
    size_band: 'size-shirt' });
});

test('authored resource rejects missing or ambiguous size-band admission', () => {
  const missing = records();
  missing.item_template_category_bindings.shift();
  assert.throws(() => resolveAuthoredStartResource(missing, resource('rope')),
    { code: 'AUTHORED_START_PROFILE_INVALID' });

  const ambiguous = records();
  ambiguous.item_template_category_bindings.push({
    ...ambiguous.item_template_category_bindings[0], id: 'rope-size-copy'
  });
  assert.throws(() => resolveAuthoredStartResource(
    ambiguous, resource('rope')), { code: 'AUTHORED_START_PROFILE_INVALID' });
});

test('resolved authored packing survives the shared container calculator', () => {
  const catalog = records();
  const rope = resolveAuthoredStartResource(catalog, resource('rope'))
    .inventory_profile;
  const shirt = resolveAuthoredStartResource(catalog, resource('shirt'))
    .inventory_profile;
  const result = calculateContainerUsage({ container_id: 'bag',
    containers: [{ container_id: 'bag', template_id: 'bag-template' }],
    container_profiles: [{ template_id: 'bag-template', capacity: 9 }],
    items: [{ item_id: 'rope', template_id: 'item-rope', quantity: 1 },
      { item_id: 'shirt', template_id: 'item-shirt', quantity: 1 }],
    item_profiles: [{ ...rope, template_id: 'item-rope' },
      { ...shirt, template_id: 'item-shirt' }],
    item_placements: [{ item_id: 'rope', container_id: 'bag' },
      { item_id: 'shirt', container_id: 'bag' }],
    container_placements: [], container_compatibility: [{
      container_template_id: 'bag-template', carry_form: 'long',
      compatibility: 'allowed'
    }], packing_calculator: calculatePackingSlots });
  assert.equal(result.pass, true, JSON.stringify(result.errors));
  assert.equal(result.used_slots, 9);
  assert.equal(result.remaining_slots, 0);
});
