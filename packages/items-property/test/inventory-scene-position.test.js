import assert from 'node:assert/strict';
import test from 'node:test';
import { validateInventoryTopology } from '../src/index.js';

const base = { party_id: 'party', actor_id: 'actor', state_version: 1,
  item_profiles: {}, container_profiles: {}, containers: [],
  container_placements: [], ownership: [], items: [{ item_id: 'item',
    template_id: 'ordinary', quantity: 1 }],
  item_placements: [{ item_id: 'item', scene_position_id: 'scene' }] };

test('scene position is one exact inventory placement target', () => {
  assert.equal(validateInventoryTopology(base).pass, true);
  const ambiguous = structuredClone(base);
  ambiguous.item_placements[0].anchor_id = 'anchor';
  assert.equal(validateInventoryTopology(ambiguous).errors[0].code,
    'INVENTORY_PLACEMENT_EXACTLY_ONE_REQUIRED');
});
