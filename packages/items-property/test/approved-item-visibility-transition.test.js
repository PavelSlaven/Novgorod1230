import test from 'node:test';
import assert from 'node:assert/strict';
import { planApprovedItemVisibilityTransition } from '../src/index.js';

const transition = {
  transition_profile_id: 'conceal-bag',
  schema: 'rus.items_property.approved_transition_profile.v1',
  version: 1,
  subject_ref: 'road-bag',
  requires: { location_ref: 'storehouse', zone_ref: 'inside',
    holder_ref: 'zhdanko', controller_ref: 'zhdanko' },
  writes: { location_ref: 'storehouse', zone_ref: 'inside',
    visibility_state: 'concealed_requires_search' },
  owner_change: 'forbidden',
  contained_item_effect:
    'inherit_parent_container_position_holder_controller_and_visibility',
  write_targets: ['item_visibility_state', 'property_history']
};

test('approved visibility owner conceals an item without moving it', () => {
  const result = planApprovedItemVisibilityTransition({
    expected_state_version: 4,
    state_version: 4,
    approved_transition: transition,
    item: { item_id: 'bag-1', template_id: 'road-bag' },
    resolved_actor_refs: { zhdanko: 'npc-1' },
    source: { location_ref: 'storehouse', zone_ref: 'inside',
      holder_actor_id: 'npc-1', controller_actor_id: 'npc-1' }
  });
  assert.equal(result.pass, true);
  assert.deepEqual(result.proposal.destination, {
    location_ref: 'storehouse', zone_ref: 'inside',
    holder_actor_id: 'npc-1', controller_actor_id: 'npc-1',
    visibility_state: 'concealed_requires_search'
  });
});

test('approved visibility owner rejects a stale physical source', () => {
  const result = planApprovedItemVisibilityTransition({
    expected_state_version: 4,
    state_version: 4,
    approved_transition: transition,
    item: { item_id: 'bag-1', template_id: 'road-bag' },
    resolved_actor_refs: { zhdanko: 'npc-1' },
    source: { location_ref: 'storehouse', zone_ref: 'yard',
      holder_actor_id: 'npc-1', controller_actor_id: 'npc-1' }
  });
  assert.equal(result.pass, false);
  assert.equal(result.errors[0].code,
    'APPROVED_ITEM_VISIBILITY_TRANSITION_SOURCE_MISMATCH');
});
