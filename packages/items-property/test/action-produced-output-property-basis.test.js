import assert from 'node:assert/strict';
import test from 'node:test';
import { validateActionProducedOutputPropertyBasis } from
  '../src/action-produced-transition-entities.js';

test('output may combine owned sources with distinct property states', () => {
  const sources = new Map([
    ['board', { source: { ownership_basis_ref: 'owned:mikula',
      property_basis_ref: 'property:board' } }],
    ['bark', { source: { ownership_basis_ref: 'owned:mikula',
      property_basis_ref: 'property:bark' } }]
  ]);
  const allocations = [{ source_ref: 'board' }, { source_ref: 'bark' }];

  assert.doesNotThrow(() => validateActionProducedOutputPropertyBasis(
    'board', allocations, sources));

  sources.get('bark').source.ownership_basis_ref = 'owned:other';
  assert.throws(() => validateActionProducedOutputPropertyBasis(
    'board', allocations, sources), {
    code: 'ITEM_ACTION_PRODUCED_TRANSITION_INVALID'
  });
});
