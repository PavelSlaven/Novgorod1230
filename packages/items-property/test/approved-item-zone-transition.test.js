import test from 'node:test';
import assert from 'node:assert/strict';
import { planApprovedItemZoneTransition } from '../src/index.js';

const transition = {
  transition_profile_id: 'bag-to-river',
  schema: 'rus.items_property.approved_transition_profile.v1',
  version: 1,
  subject_ref: 'road-bag',
  requires: { location_ref: 'storehouse', zone_ref: 'inside',
    holder_ref: 'zhdanko', controller_ref: 'zhdanko' },
  writes: { location_ref: 'storehouse', zone_ref: 'river',
    holder_ref: 'zhdanko', controller_ref: 'zhdanko' },
  owner_change: 'forbidden',
  contained_item_effect:
    'inherit_parent_container_position_holder_and_controller'
};

test('approved item-zone owner preserves holder and controller', () => {
  const result = planApprovedItemZoneTransition({
    expected_state_version: 4,
    state_version: 4,
    approved_transition: transition,
    item: { item_id: 'bag-1', template_id: 'road-bag' },
    resolved_actor_refs: { zhdanko: 'npc-1' },
    source: { location_ref: 'storehouse', zone_ref: 'inside',
      holder_actor_id: 'npc-1', controller_actor_id: 'npc-1' }
  });
  assert.equal(result.pass, true);
  assert.equal(result.proposal.owner, '@rus/items-property');
  assert.deepEqual(result.proposal.destination, {
    location_ref: 'storehouse', zone_ref: 'river',
    holder_actor_id: 'npc-1', controller_actor_id: 'npc-1'
  });
});

test('approved item-zone owner rejects unapproved source state', () => {
  const result = planApprovedItemZoneTransition({
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
    'APPROVED_ITEM_ZONE_TRANSITION_SOURCE_MISMATCH');
});
