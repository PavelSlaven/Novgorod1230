import assert from 'node:assert/strict';
import test from 'node:test';
import { validateActionProducedOutputPropertyBasis } from
  '../src/action-produced-transition-entities.js';

test('output may combine owned sources with distinct property states', () => {
  const sources = new Map([
    ['board', { source: { ownership_snapshot: ownership('board') } }],
    ['bark', { source: { ownership_snapshot: ownership('bark') } }]
  ]);
  const allocations = [{ source_ref: 'board' }, { source_ref: 'bark' }];

  assert.doesNotThrow(() => validateActionProducedOutputPropertyBasis(
    'board', allocations, sources));

  sources.get('bark').source.ownership_snapshot.owner_character_id
    = 'actor:other';
  assert.throws(() => validateActionProducedOutputPropertyBasis(
    'board', allocations, sources), {
    code: 'ITEM_ACTION_PRODUCED_TRANSITION_INVALID'
  });
});

function ownership(id) {
  return { ownership_id: `ownership:${id}`, owner_npc_id: null,
    owner_character_id: 'actor:mikula', owner_party: false,
    controller_npc_id: null, controller_character_id: 'actor:mikula',
    claim_state: 'owned' };
}
