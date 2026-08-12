import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePackingSlots } from '@rus/world-catalog-workflow';
import { planApprovedActorItemTransition } from '../src/index.js';

test('unrelated NPC containers keep their authoritative placement', () => {
  const profiles = {
    knife: { mass_grams: 300, carry_form: 'compact',
      external_hand_cost: 1, packing_slot_cost: 1, packing_bundle_size: 1 },
    coat: { mass_grams: 900, carry_form: 'regular',
      external_hand_cost: 0, packing_slot_cost: 2, packing_bundle_size: 1 },
    bag: { mass_grams: 700, carry_form: 'regular',
      external_hand_cost: 0, packing_slot_cost: 2, capacity: 12,
      inventory_role: 'primary_container', closure_state: 'open' }
  };
  const result = planApprovedActorItemTransition({
    party_id: 'party-1', actor_id: 'player-1', state_version: 4,
    expected_state_version: 4, item_profiles: profiles,
    container_profiles: profiles, packing_calculator: calculatePackingSlots,
    items: [{ item_id: 'knife-1', template_id: 'knife', quantity: 1 },
      { item_id: 'packet-1', template_id: 'coat', quantity: 1 }],
    containers: [{ container_id: 'bag-1', template_id: 'bag' }],
    item_placements: [{ item_id: 'knife-1', holder_npc_id: 'source',
      physical_position: 'worn_quick' },
    { item_id: 'packet-1', container_id: 'bag-1' }],
    container_placements: [{ container_id: 'bag-1',
      holder_npc_id: 'unrelated-npc' }],
    ownership: [{ item_id: 'knife-1', owner_npc_id: 'source',
      controller_npc_id: 'source' }],
    source: { actor_id: 'source', actor_kind: 'npc',
      controller_actor_id: 'source', physical_position: 'worn_quick',
      accessibility: 'quick' },
    destination: { actor_id: 'destination', actor_kind: 'npc',
      controller_actor_id: 'destination', physical_position: 'hands',
      accessibility: 'secured' },
    approved_transition: { transition_profile_id: 'approved',
      owner_change: 'forbidden', required_facts: ['admitted'] },
    approved_facts: ['admitted'], item_id: 'knife-1'
  });
  assert.equal(result.pass, true);
});
