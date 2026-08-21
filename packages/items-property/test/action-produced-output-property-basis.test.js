import assert from 'node:assert/strict';
import test from 'node:test';
import { validateActionProducedOutputPropertyBasis } from
  '../src/action-produced-transition-entities.js';

test('output property is canonical for equal ownership and mixed basis fails',
  () => {
  const sources = new Map([
    ['board', { source: { entity_ref: 'board',
      ownership_snapshot: ownership('board') } }],
    ['bark', { source: { entity_ref: 'bark',
      ownership_snapshot: ownership('bark') } }]
  ]);
  const allocations = [{ source_ref: 'board' }, { source_ref: 'bark' }];

  assert.doesNotThrow(() => validateActionProducedOutputPropertyBasis(
    'bark', allocations, sources));
  assert.doesNotThrow(() => validateActionProducedOutputPropertyBasis(
    'bark', [...allocations].reverse(), sources));

  sources.get('bark').source.ownership_snapshot.owner_character_id
    = 'actor:other';
  assert.throws(() => validateActionProducedOutputPropertyBasis(
    'bark', allocations, sources), {
    code: 'ITEM_ACTION_PRODUCED_PROPERTY_AMBIGUOUS'
  });
});

function ownership(id) {
  return { ownership_id: `ownership:${id}`, owner_npc_id: null,
    owner_character_id: 'actor:mikula', owner_party: false,
    controller_npc_id: null, controller_character_id: 'actor:mikula',
    claim_state: 'owned' };
}
