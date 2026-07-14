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
