import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePackingSlots } from '@rus/world-catalog-workflow';
import { planApprovedActorItemTransition } from '../src/index.js';

test('NPC transition keeps a holder container without an invented position', () => {
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
      holder_npc_id: 'destination' }],
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

test('one item keeps identity and owner across NPC equipped to player hands to player equipped', () => {
  const profiles = { caftan: { mass_grams: 900, carry_form: 'regular', external_hand_cost: 0, packing_slot_cost: 2, packing_bundle_size: 1 } };
  const base = {
    party_id: 'party-1', state_version: 4, expected_state_version: 4,
    item_profiles: profiles, container_profiles: {}, packing_calculator: calculatePackingSlots,
    items: [{ item_id: 'ratsha-caftan', template_id: 'caftan', quantity: 1 }], containers: [], container_placements: [],
    approved_transition: { transition_profile_id: 'ratsha-caftan-transfer', owner_change: 'forbidden', required_facts: ['admitted'] },
    approved_facts: ['admitted'], item_id: 'ratsha-caftan'
  };
  const first = planApprovedActorItemTransition({
    ...base,
    item_placements: [{ item_id: 'ratsha-caftan', holder_npc_id: 'ratsha', physical_position: 'equipped', equipment_slot_category_id: 'outer_garment' }],
    ownership: [{ item_id: 'ratsha-caftan', owner_npc_id: 'ratsha', owner_character_id: null, controller_npc_id: 'ratsha', controller_character_id: null, claim_state: 'owned' }],
    source: { actor_id: 'ratsha', actor_kind: 'npc', controller_actor_id: 'ratsha', physical_position: 'equipped', equipment_slot_category_id: 'outer_garment', accessibility: 'quick' },
    destination: { actor_id: 'player', actor_kind: 'character', controller_actor_id: 'player', physical_position: 'hands', accessibility: 'hands' }
  });
  assert.equal(first.pass, true);
  assert.equal(first.proposal.placement.item_id, 'ratsha-caftan');
  assert.equal(first.proposal.ownership.next.owner_npc_id, 'ratsha');
  assert.equal(first.proposal.ownership.next.controller_npc_id, null);
  assert.equal(first.proposal.ownership.next.controller_character_id, 'player');

  const second = planApprovedActorItemTransition({
    ...base,
    item_placements: [first.proposal.placement],
    ownership: [first.proposal.ownership.next],
    source: { actor_id: 'player', actor_kind: 'character', controller_actor_id: 'player', physical_position: 'hands', accessibility: 'immediate' },
    destination: { actor_id: 'player', actor_kind: 'character', controller_actor_id: 'player', physical_position: 'equipped', equipment_slot_category_id: 'outer_garment', accessibility: 'quick' }
  });
  assert.equal(second.pass, true);
  assert.equal(second.proposal.placement.item_id, 'ratsha-caftan');
  assert.equal(second.proposal.placement.equipment_slot_category_id, 'outer_garment');
  assert.equal(second.proposal.ownership.next.owner_npc_id, 'ratsha');
  assert.equal(second.proposal.ownership.next.controller_character_id, 'player');
});

test('one container keeps identity and owner across NPC worn-quick to player hands', () => {
  const profiles = { bag: { mass_grams: 700, carry_form: 'regular',
    external_hand_cost: 1, packing_slot_cost: 2, packing_bundle_size: 1,
    capacity: 8, inventory_role: 'quick_container', closure_state: 'closed' } };
  const result = planApprovedActorItemTransition({
    party_id: 'party-1', actor_id: 'player', state_version: 4,
    expected_state_version: 4, item_profiles: {},
    container_profiles: profiles, items: [], item_placements: [],
    containers: [{ container_id: 'ratsha-bag', template_id: 'bag' }],
    container_placements: [{ container_id: 'ratsha-bag',
      holder_npc_id: 'ratsha', physical_position: 'worn_quick' }],
    ownership: [{ container_id: 'ratsha-bag', owner_npc_id: 'ratsha',
      controller_npc_id: 'ratsha', claim_state: 'owned' }],
    source: { actor_id: 'ratsha', actor_kind: 'npc',
      controller_actor_id: 'ratsha', physical_position: 'worn_quick',
      accessibility: 'quick' },
    destination: { actor_id: 'player', actor_kind: 'character',
      controller_actor_id: 'player', physical_position: 'hands',
      accessibility: 'immediate' },
    approved_transition: { transition_profile_id: 'generic-transfer',
      owner_change: 'forbidden', required_facts: ['admitted'] },
    approved_facts: ['admitted'], item_id: 'ratsha-bag'
  });
  assert.equal(result.pass, true, JSON.stringify(result));
  assert.deepEqual(result.proposal.placement, {
    instance_kind: 'container', party_id: 'party-1',
    container_id: 'ratsha-bag',
    holder_character_id: 'player', physical_position: 'hands'
  });
  assert.equal(result.proposal.ownership.next.owner_npc_id, 'ratsha');
  assert.equal(result.proposal.ownership.next.controller_npc_id, null);
  assert.equal(result.proposal.ownership.next.controller_character_id,
    'player');
});

test('actor-keyed strength never falls back to another actor strength', () => {
  const profiles = {
    caftan: { mass_grams: 900, carry_form: 'regular',
      external_hand_cost: 0 },
    burden: { mass_grams: 10_000, carry_form: 'regular',
      external_hand_cost: 0 }
  };
  const result = planApprovedActorItemTransition({
    party_id: 'party-1', actor_id: 'player', strength: 1,
    actor_strengths: { player: 10 },
    state_version: 4, expected_state_version: 4,
    item_profiles: profiles, container_profiles: {},
    items: [
      { item_id: 'ratsha-caftan', template_id: 'caftan', quantity: 1 },
      { item_id: 'ratsha-burden', template_id: 'burden', quantity: 1 }
    ],
    item_placements: [
      { item_id: 'ratsha-caftan', holder_npc_id: 'ratsha',
        physical_position: 'equipped',
        equipment_slot_category_id: 'outer_garment' },
      { item_id: 'ratsha-burden', holder_npc_id: 'ratsha',
        physical_position: 'external_load' }
    ],
    containers: [], container_placements: [],
    ownership: [{ item_id: 'ratsha-caftan', owner_npc_id: 'ratsha',
      controller_npc_id: 'ratsha' }],
    source: { actor_id: 'ratsha', actor_kind: 'npc',
      controller_actor_id: 'ratsha', physical_position: 'equipped',
      equipment_slot_category_id: 'outer_garment', accessibility: 'quick' },
    destination: { actor_id: 'player', actor_kind: 'character',
      controller_actor_id: 'player', physical_position: 'hands',
      accessibility: 'immediate' },
    approved_transition: { transition_profile_id: 'generic-transfer',
      owner_change: 'forbidden', required_facts: ['admitted'] },
    approved_facts: ['admitted'], item_id: 'ratsha-caftan'
  });
  assert.equal(result.pass, true);
  assert.equal(result.derived_after.source.load_category, null);
  assert.equal(result.derived_after.destination.load_category, 'light');
});
