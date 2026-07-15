import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculatePackingSlots,
  validateItemContainerClassificationCatalog
} from '../src/index.js';

test('calculatePackingSlots applies the approved bundle formula without mutating input', () => {
  const input = { quantity: 1, packing_slot_cost: 1, packing_bundle_size: 1 };
  assert.deepEqual(calculatePackingSlots(input), { pass: true, required_slots: 1, errors: [] });
  assert.deepEqual(calculatePackingSlots({ quantity: 7, packing_slot_cost: 1, packing_bundle_size: 5 }), { pass: true, required_slots: 2, errors: [] });
  assert.deepEqual(calculatePackingSlots({ quantity: 3, packing_slot_cost: 2, packing_bundle_size: 1 }), { pass: true, required_slots: 6, errors: [] });
  assert.deepEqual(input, { quantity: 1, packing_slot_cost: 1, packing_bundle_size: 1 });
});

test('calculatePackingSlots rejects non-positive and fractional packing inputs without a fallback', () => {
  for (const input of [
    { quantity: 0, packing_slot_cost: 1, packing_bundle_size: 1 },
    { quantity: -1, packing_slot_cost: 1, packing_bundle_size: 1 },
    { quantity: 1, packing_slot_cost: 0, packing_bundle_size: 1 },
    { quantity: 1, packing_slot_cost: 1, packing_bundle_size: 0 },
    { quantity: 1.5, packing_slot_cost: 1, packing_bundle_size: 1 },
    { quantity: 1, packing_slot_cost: 1.5, packing_bundle_size: 1 },
    { quantity: 1, packing_slot_cost: 1, packing_bundle_size: 1.5 }
  ]) {
    const result = calculatePackingSlots(input);
    assert.equal(result.pass, false);
    assert.equal(result.required_slots, null);
    assert.ok(result.errors.length > 0);
  }
});

test('classification validator requires exactly one approved size_band with packing metadata and exact container policy', () => {
  const records = {
    item_templates: [{ id: 'item-1', status: 'approved' }],
    container_templates: [{ id: 'container-1', world_revision_id: 'rev-1', category_id: 'container-category', capacity: 2, packing_slot_cost: 1, capacity_policy: { version: 1, mode: 'packing_slots', unit: 'packing_slot' }, status: 'approved' }],
    universal_categories: [
      { id: 'item-category', domain: 'item', facet: 'size_band', status: 'approved' },
      { id: 'container-category', domain: 'container', facet: 'container_form', status: 'approved' }
    ],
    item_template_category_bindings: [{ id: 'size-1', item_template_id: 'item-1', category_id: 'item-category', binding_kind: 'size_band', packing_slot_cost: 1, packing_bundle_size: 1, status: 'approved' }]
  };
  assert.deepEqual(validateItemContainerClassificationCatalog(records), []);
  const invalidKind = structuredClone(records);
  invalidKind.item_template_category_bindings[0].binding_kind = 'material';
  assert.ok(validateItemContainerClassificationCatalog(invalidKind).some((error) => error.includes('PACKING_METADATA')));
  const ambiguous = structuredClone(records);
  ambiguous.item_template_category_bindings.push({ ...ambiguous.item_template_category_bindings[0], id: 'size-2' });
  assert.ok(validateItemContainerClassificationCatalog(ambiguous).includes('ITEM_SIZE_BAND_AMBIGUOUS:item-1'));
  const missing = structuredClone(records);
  missing.item_template_category_bindings = [];
  assert.ok(validateItemContainerClassificationCatalog(missing).includes('ITEM_SIZE_BAND_MISSING:item-1'));
  const invalidPolicy = structuredClone(records);
  invalidPolicy.container_templates[0].capacity_policy.unit = 'litre';
  assert.ok(validateItemContainerClassificationCatalog(invalidPolicy).includes('CONTAINER_CAPACITY_POLICY_INVALID:container-1'));
});

test('general schema evaluator enforces nested closed objects, integer minimum and const', () => {
  const records = {
    container_templates: [{ id: 'container-1', world_revision_id: 'rev-1', category_id: 'container-category', capacity: 1, packing_slot_cost: 1, capacity_policy: { version: 1, mode: 'packing_slots', unit: 'packing_slot' }, status: 'approved' }],
    universal_categories: [{ id: 'container-category', domain: 'container', facet: 'container_form', status: 'approved' }]
  };
  const invalid = structuredClone(records);
  invalid.container_templates[0].capacity = 0;
  invalid.container_templates[0].packing_slot_cost = 1.5;
  invalid.container_templates[0].capacity_policy.version = '1';
  invalid.container_templates[0].capacity_policy.extra = true;
  const errors = validateItemContainerClassificationCatalog(invalid);
  assert.ok(errors.includes('JSON_SCHEMA_MINIMUM:container_templates:0:capacity'));
  assert.ok(errors.includes('JSON_SCHEMA_TYPE:container_templates:0:packing_slot_cost'));
  assert.ok(errors.includes('JSON_SCHEMA_CONST:container_templates:0:capacity_policy.version'));
  assert.ok(errors.includes('JSON_SCHEMA_ADDITIONAL_PROPERTY:container_templates:0:capacity_policy.extra'));
});

test('required concrete container content cannot exceed packing capacity', () => {
  const records = {
    item_templates: [{ id: 'item-1', status: 'approved' }],
    container_templates: [{ id: 'container-1', world_revision_id: 'rev-1', category_id: 'container-category', capacity: 1, packing_slot_cost: 1, capacity_policy: { version: 1, mode: 'packing_slots', unit: 'packing_slot' }, status: 'approved' }],
    universal_categories: [{ id: 'item-size', domain: 'item', facet: 'size_band', status: 'approved' }, { id: 'container-category', domain: 'container', facet: 'container_form', status: 'approved' }],
    item_template_category_bindings: [{ id: 'size-1', item_template_id: 'item-1', category_id: 'item-size', binding_kind: 'size_band', packing_slot_cost: 1, packing_bundle_size: 1, status: 'approved' }],
    container_content_profiles: [{ id: 'profile-1', container_template_id: 'container-1', empty_allowed: false, status: 'approved' }],
    container_content_profile_entries: [{ id: 'entry-1', profile_id: 'profile-1', item_template_id: 'item-1', min_quantity: 2, max_quantity: 2, required: true }]
  };
  assert.ok(validateItemContainerClassificationCatalog(records).includes('CONTAINER_REQUIRED_CONTENT_CAPACITY_EXCEEDED:profile-1'));
});
