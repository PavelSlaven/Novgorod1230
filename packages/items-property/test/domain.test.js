import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecognitionRequest, calculateCarriedWeight, physicalAccessTier, resolveLoadCategory, validateItem } from '../src/index.js';

test('items-property owns access, load and recognition contracts', () => {
  const actor = { id:'p1', attributes:{ strength:10 }, items:{ carried_items:[{ id:'a', label:'мешок', type:'container', weight:3, contents:[{ id:'b', label:'нож', type:'weapon', weight:1 }] }] } };
  assert.equal(calculateCarriedWeight(actor), 4);
  assert.equal(resolveLoadCategory(actor), 'light');
  assert.equal(physicalAccessTier({ placement:'в мешке' }), 'deep_bag');
  assert.equal(validateItem({ id:'i1', label:'нож', type:'weapon', weight:1 }).ok, true);
  const request = buildRecognitionRequest({ id:'n1', knowledge:['нож'] }, { id:'i1', label:'нож', type:'weapon', marks:['зарубка'], visible:true });
  assert.equal(request.obvious, true);
});

test('legacy carried-weight load thresholds are expressed in grams', () => {
  const actor = { attributes: { strength: 9 }, items: {} };
  const category = (weight) => resolveLoadCategory({
    ...actor,
    items: { carried_items: [{ id: `item-${weight}`, label: 'груз', type: 'cargo', weight }] }
  });
  assert.equal(category(18_000), 'light');
  assert.equal(category(18_001), 'moderate');
  assert.equal(category(36_000), 'moderate');
  assert.equal(category(36_001), 'heavy');
  assert.equal(category(54_000), 'heavy');
  assert.equal(category(54_001), 'overloaded');
});
