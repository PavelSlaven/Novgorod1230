import assert from 'node:assert/strict';
import test from 'node:test';
import { planFiniteResourceDecrement, resolveFiniteSourceInitialAmount } from '../src/finite-resource-transition.js';

const input = () => ({ source_resource_node_id:'source', expected_state_version:4, causal_transition_identity:'request', source:{state_version:4,lifecycle_state:'active',quantity:{numerator:5,denominator:2,unit:'kilogram'}}, requested_decrement:{numerator:1,denominator:2,unit:'kilogram'} });
test('finite source decrement conserves exact rational remainder and retires at zero', () => {
  const transition = planFiniteResourceDecrement(input());
  assert.deepEqual(transition.after_quantity, { numerator:2, denominator:1, unit:'kilogram' });
  const final = input(); final.requested_decrement = { numerator:5,denominator:2,unit:'kilogram' };
  assert.equal(planFiniteResourceDecrement(final).lifecycle_state_after, 'depleted');
});
test('finite source transition rejects stale, overspend, depleted and getters', () => {
  for (const mutate of [(v)=>v.source.state_version=3,(v)=>v.requested_decrement.numerator=6,(v)=>v.source.lifecycle_state='depleted']) { const value=input(); mutate(value); assert.throws(()=>planFiniteResourceDecrement(value),{code:'FINITE_RESOURCE_TRANSITION_INVALID'}); }
  const getter=input(); Object.defineProperty(getter,'source',{enumerable:true,get(){ throw Error('must not read'); }});
  assert.throws(()=>planFiniteResourceDecrement(getter),{code:'FINITE_RESOURCE_TRANSITION_INVALID'});
});
test('initial amount is selected once from committed bounded alternatives', () => {
  const value={initialization_identity:'source:init',committed_amount:null,approved_alternatives:[{numerator:1,denominator:1,unit:'litre'},{numerator:2,denominator:1,unit:'litre'}],selected_amount:{numerator:2,denominator:1,unit:'litre'}};
  assert.equal(resolveFiniteSourceInitialAmount(value).status,'initialized');
  value.selected_amount={numerator:3,denominator:1,unit:'litre'};
  assert.throws(()=>resolveFiniteSourceInitialAmount(value),{code:'FINITE_RESOURCE_TRANSITION_INVALID'});
  assert.equal(resolveFiniteSourceInitialAmount({initialization_identity:'source:init',committed_amount:{numerator:2,denominator:1,unit:'litre'},approved_alternatives:[],selected_amount:null}).status,'already_committed');
});
