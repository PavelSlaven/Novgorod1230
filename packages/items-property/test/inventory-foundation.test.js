import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInventoryStackSignature,
  calculateContainerUsage,
  calculateHandsState,
  calculateInventoryMass,
  deriveInventoryZone,
  planApprovedActorItemTransition,
  planInventoryTransfer,
  resolveInventoryAccess,
  resolveInventoryLoad,
  validateInventoryTopology
} from '../src/index.js';
import { calculatePackingSlots } from '@rus/world-catalog-workflow';

const actorId = 'character-1';
const partyId = 'party-1';
const profiles = Object.freeze({
  knife: { mass_grams: 300, carry_form: 'compact', external_hand_cost: 1, packing_slot_cost: 1, packing_bundle_size: 1 },
  coat: { mass_grams: 900, carry_form: 'regular', external_hand_cost: 0, packing_slot_cost: 2, packing_bundle_size: 1 },
  bow: { mass_grams: 700, carry_form: 'long', external_hand_cost: 1, packing_slot_cost: 3, packing_bundle_size: 1 },
  chest: { mass_grams: 2000, carry_form: 'bulky', external_hand_cost: 2, packing_slot_cost: 4, packing_bundle_size: 1 },
  pouch: { mass_grams: 200, carry_form: 'compact', external_hand_cost: 0, packing_slot_cost: 1, capacity: 4, inventory_role: 'quick_container', closure_state: 'open' },
  bag: { mass_grams: 700, carry_form: 'regular', external_hand_cost: 0, packing_slot_cost: 2, capacity: 12, inventory_role: 'primary_container', closure_state: 'open' },
  box: { mass_grams: 400, carry_form: 'regular', external_hand_cost: 0, packing_slot_cost: 2, capacity: 5, inventory_role: 'none', closure_state: 'closed' }
});

function state(overrides = {}) {
  return {
    party_id: partyId,
    actor_id: actorId,
    state_version: 4,
    item_profiles: profiles,
    container_profiles: profiles,
    packing_calculator: calculatePackingSlots,
    items: [],
    containers: [],
    item_placements: [],
    container_placements: [],
    ownership: [],
    ...overrides
  };
}

test('inventory foundation: empty inventory is light, has no mass and two free hands', () => {
  const input = state();
  assert.deepEqual(calculateInventoryMass(input), { pass: true, total_mass_grams: 0, errors: [] });
  assert.deepEqual(calculateHandsState(input), { pass: true, hands_total: 2, hands_used: 0, hands_free: 2, errors: [] });
  assert.deepEqual(resolveInventoryLoad({ total_mass_grams: 0, strength: 10 }), { pass: true, load_category: 'light', at_limit: false, errors: [] });
});

test('inventory foundation: normalized graph counts equipment, containers and nested contents once', () => {
  const input = state({
    items: [{ item_id: 'coat-1', template_id: 'coat', quantity: 1 }, { item_id: 'knife-1', template_id: 'knife', quantity: 2 }],
    containers: [{ container_id: 'bag-1', template_id: 'bag' }],
    item_placements: [{ item_id: 'coat-1', holder_character_id: actorId, physical_position: 'equipped', equipment_slot_id: 'torso' }, { item_id: 'knife-1', container_id: 'bag-1' }],
    container_placements: [{ container_id: 'bag-1', holder_character_id: actorId, physical_position: 'worn' }]
  });
  assert.equal(calculateInventoryMass(input).total_mass_grams, 2200);
  assert.equal(calculateInventoryMass({ ...input, items: [...input.items, input.items[1]] }).pass, false);
});

test('inventory foundation: external locations do not count and missing mass never falls back', () => {
  const left = state({ items: [{ item_id: 'knife-1', template_id: 'knife', quantity: 1 }], item_placements: [{ item_id: 'knife-1', anchor_id: 'g5-1' }] });
  assert.equal(calculateInventoryMass(left).total_mass_grams, 0);
  const missing = state({ items: [{ item_id: 'unknown-1', template_id: 'unknown', quantity: 1 }], item_placements: [{ item_id: 'unknown-1', holder_character_id: actorId, physical_position: 'hands' }] });
  assert.equal(calculateInventoryMass(missing).errors[0].code, 'ITEM_MASS_DATA_GAP');
  const invalidQuantity = state({ items: [{ item_id: 'knife-1', template_id: 'knife', quantity: 0 }], item_placements: [{ item_id: 'knife-1', holder_character_id: actorId, physical_position: 'hands' }] });
  assert.equal(calculateInventoryMass(invalidQuantity).errors[0].code, 'INVENTORY_QUANTITY_INVALID');
});

test('inventory foundation: a bulk quantity profile requires an explicit matching unit and derives mass deterministically', () => {
  const bulkProfiles = {
    ...profiles,
    grain: { quantity_dimension: 'mass', quantity_unit_id: 'quantity_unit_gram_v1', mass_grams_per_unit: 1, carry_form: 'regular', external_hand_cost: 0, packing_slot_cost: 1, packing_bundle_size: 1 }
  };
  const carried = { items: [{ item_id: 'grain-1', template_id: 'grain', quantity: 450, quantity_unit_id: 'quantity_unit_gram_v1' }], item_placements: [{ item_id: 'grain-1', holder_character_id: actorId, physical_position: 'hands' }], item_profiles: bulkProfiles };
  assert.equal(calculateInventoryMass(state(carried)).total_mass_grams, 450);
  assert.equal(calculateInventoryMass(state({ ...carried, items: [{ ...carried.items[0], quantity_unit_id: null }] })).errors[0].code, 'ITEM_QUANTITY_UNIT_REQUIRED');
  assert.equal(calculateInventoryMass(state({ ...carried, items: [{ ...carried.items[0], quantity_unit_id: 'quantity_unit_litre_v1' }] })).errors[0].code, 'ITEM_QUANTITY_UNIT_MISMATCH');
  const honey = { ...carried, items: [{ item_id: 'honey-1', template_id: 'honey', quantity: 100, quantity_unit_id: 'millilitre' }], item_profiles: { ...bulkProfiles, honey: { ...bulkProfiles.grain, quantity_dimension: 'volume', quantity_unit_id: 'millilitre', mass_grams_per_unit: 1.4 } }, item_placements: [{ item_id: 'honey-1', holder_character_id: actorId, physical_position: 'hands' }] };
  assert.equal(calculateInventoryMass(state(honey)).total_mass_grams, 140);
});

test('inventory foundation: topology blocks duplicate placement, cycles, depth, party mismatch and duplicate primary container', () => {
  const missing = state({ items: [{ item_id: 'knife-1', template_id: 'knife', quantity: 1 }] });
  assert.equal(validateInventoryTopology(missing).errors[0].code, 'INVENTORY_PLACEMENT_NOT_FOUND');
  const missingPosition = state({ items: [{ item_id: 'knife-1', template_id: 'knife', quantity: 1 }], item_placements: [{ item_id: 'knife-1', holder_character_id: actorId }] });
  assert.equal(validateInventoryTopology(missingPosition).errors[0].code, 'INVENTORY_PHYSICAL_POSITION_REQUIRED');
  const containerMissingPosition = state({ containers: [{ container_id: 'bag-1', template_id: 'bag' }], container_placements: [{ container_id: 'bag-1', holder_character_id: actorId }] });
  assert.equal(validateInventoryTopology(containerMissingPosition).errors[0].code, 'INVENTORY_PHYSICAL_POSITION_REQUIRED');
  const equippedWithoutSlot = state({ items: [{ item_id: 'knife-1', template_id: 'knife', quantity: 1 }], item_placements: [{ item_id: 'knife-1', holder_character_id: actorId, physical_position: 'equipped' }] });
  assert.equal(validateInventoryTopology(equippedWithoutSlot).errors[0].code, 'INVENTORY_EQUIPMENT_SLOT_REQUIRED');
  const duplicate = state({ items: [{ item_id: 'knife-1', template_id: 'knife', quantity: 1 }], item_placements: [{ item_id: 'knife-1', holder_character_id: actorId }, { item_id: 'knife-1', anchor_id: 'g5-1' }] });
  assert.equal(validateInventoryTopology(duplicate).errors[0].code, 'INVENTORY_PLACEMENT_AMBIGUOUS');
  const cycle = state({ containers: [{ container_id: 'a', template_id: 'bag' }, { container_id: 'b', template_id: 'box' }], container_placements: [{ container_id: 'a', parent_container_id: 'b' }, { container_id: 'b', parent_container_id: 'a' }] });
  assert.ok(validateInventoryTopology(cycle).errors.some((error) => error.code === 'INVENTORY_CYCLE_DETECTED'));
  const deep = state({ containers: [{ container_id: 'a', template_id: 'bag' }, { container_id: 'b', template_id: 'box' }, { container_id: 'c', template_id: 'box' }], item_placements: [{ item_id: 'knife-1', container_id: 'c' }], items: [{ item_id: 'knife-1', template_id: 'knife', quantity: 1 }], container_placements: [{ container_id: 'a', holder_character_id: actorId }, { container_id: 'b', parent_container_id: 'a' }, { container_id: 'c', parent_container_id: 'b' }] });
  assert.ok(validateInventoryTopology(deep).errors.some((error) => error.code === 'INVENTORY_NESTING_LIMIT_EXCEEDED'));
});

test('inventory foundation: load thresholds and hands are independent hard gates', () => {
  assert.equal(resolveInventoryLoad({ total_mass_grams: 20_000, strength: 10 }).load_category, 'light');
  assert.equal(resolveInventoryLoad({ total_mass_grams: 20_001, strength: 10 }).load_category, 'moderate');
  assert.equal(resolveInventoryLoad({ total_mass_grams: 40_001, strength: 10 }).load_category, 'heavy');
  assert.deepEqual(resolveInventoryLoad({ total_mass_grams: 60_000, strength: 10 }), { pass: true, load_category: 'heavy', at_limit: true, errors: [] });
  assert.equal(resolveInventoryLoad({ total_mass_grams: 60_001, strength: 10 }).load_category, 'overloaded');
  const hands = state({ items: [{ item_id: 'knife-1', template_id: 'knife', quantity: 1 }, { item_id: 'bow-1', template_id: 'bow', quantity: 1 }, { item_id: 'chest-1', template_id: 'chest', quantity: 1 }], item_placements: [{ item_id: 'knife-1', holder_character_id: actorId, physical_position: 'hands' }, { item_id: 'bow-1', holder_character_id: actorId, physical_position: 'external' }, { item_id: 'chest-1', holder_character_id: actorId, physical_position: 'external' }] });
  assert.ok(calculateHandsState(hands).errors.some((error) => error.code === 'INVENTORY_HANDS_EXCEEDED'));
});

test('inventory foundation: zones and ordered access derive only from physical placement path', () => {
  const input = state({
    items: [{ item_id: 'hand', template_id: 'knife', quantity: 1 }, { item_id: 'belt', template_id: 'knife', quantity: 1 }, { item_id: 'inside', template_id: 'knife', quantity: 1 }, { item_id: 'outside', template_id: 'knife', quantity: 1 }],
    containers: [{ container_id: 'bag-1', template_id: 'bag' }, { container_id: 'box-1', template_id: 'box' }],
    item_placements: [{ item_id: 'hand', holder_character_id: actorId, physical_position: 'hands' }, { item_id: 'belt', holder_character_id: actorId, physical_position: 'worn_quick' }, { item_id: 'inside', container_id: 'box-1' }, { item_id: 'outside', anchor_id: 'g5-1' }],
    container_placements: [{ container_id: 'bag-1', holder_character_id: actorId, physical_position: 'worn' }, { container_id: 'box-1', parent_container_id: 'bag-1' }]
  });
  assert.equal(deriveInventoryZone({ ...input, instance_id: 'hand' }).zone, 'hands');
  assert.equal(deriveInventoryZone({ ...input, instance_id: 'belt' }).zone, 'worn_quick');
  assert.equal(deriveInventoryZone({ ...input, instance_id: 'inside' }).zone, 'primary_container');
  assert.deepEqual(resolveInventoryAccess({ ...input, item_id: 'inside' }).access, { tier: 'closed', steps: ['open_primary_container', 'open_inner_container', 'retrieve_item'] });
  assert.equal(resolveInventoryAccess({ ...input, item_id: 'outside' }).access.tier, 'unavailable');
});

test('inventory foundation: zone traversal distinguishes quick/primary paths and rejects missing or cyclic containers', () => {
  const quick = state({
    items: [{ item_id: 'knife-1', template_id: 'knife', quantity: 1 }], containers: [{ container_id: 'pouch-1', template_id: 'pouch' }],
    item_placements: [{ item_id: 'knife-1', container_id: 'pouch-1' }], container_placements: [{ container_id: 'pouch-1', holder_character_id: actorId, physical_position: 'worn_quick' }]
  });
  assert.equal(deriveInventoryZone({ ...quick, instance_id: 'knife-1' }).zone, 'quick_container');
  assert.equal(deriveInventoryZone({ ...state({ items: [{ item_id: 'knife-1', template_id: 'knife', quantity: 1 }], item_placements: [{ item_id: 'knife-1', container_id: 'missing' }] }), instance_id: 'knife-1' }).errors[0].code, 'INVENTORY_CONTAINER_NOT_FOUND');
  const cycle = state({ items: [{ item_id: 'knife-1', template_id: 'knife', quantity: 1 }], containers: [{ container_id: 'a', template_id: 'box' }, { container_id: 'b', template_id: 'box' }], item_placements: [{ item_id: 'knife-1', container_id: 'a' }], container_placements: [{ container_id: 'a', parent_container_id: 'b' }, { container_id: 'b', parent_container_id: 'a' }] });
  assert.equal(deriveInventoryZone({ ...cycle, instance_id: 'knife-1' }).errors[0].code, 'INVENTORY_CYCLE_DETECTED');
});

test('inventory foundation: container usage reuses packing slots and rejects incompatible long or bulky content', () => {
  const input = state({
    items: [{ item_id: 'knife-1', template_id: 'knife', quantity: 2 }, { item_id: 'bow-1', template_id: 'bow', quantity: 1 }],
    containers: [{ container_id: 'pouch-1', template_id: 'pouch' }],
    item_placements: [{ item_id: 'knife-1', container_id: 'pouch-1' }, { item_id: 'bow-1', container_id: 'pouch-1' }],
    container_placements: [{ container_id: 'pouch-1', holder_character_id: actorId }],
    container_compatibility: [{ container_template_id: 'pouch', carry_form: 'compact', compatibility: 'allowed' }]
  });
  const usage = calculateContainerUsage({ ...input, container_id: 'pouch-1' });
  assert.equal(usage.used_slots, 2);
  assert.ok(usage.errors.some((error) => error.code === 'INVENTORY_CARRY_FORM_INCOMPATIBLE'));
  assert.ok(calculateContainerUsage({ ...input, packing_calculator: undefined, container_id: 'pouch-1' }).errors.some((error) => error.code === 'INVENTORY_PACKING_CALCULATOR_MISSING'));
});

test('inventory foundation: stack signature is deterministic and preserves ownership, marks and quantity invariants', () => {
  const base = { item_template_id: 'knife', condition: 'sound', owner_relation: 'owner:character-1', holder_relation: 'holder:character-1', placement: 'hands', legal_status: 'lawful', access_state: 'immediate', visibility_state: 'known', marks: ['maker:a'], quality: 'ordinary', modifiers: [] };
  assert.equal(buildInventoryStackSignature(base), buildInventoryStackSignature({ ...base }));
  assert.notEqual(buildInventoryStackSignature(base), buildInventoryStackSignature({ ...base, marks: ['maker:b'] }));
});

test('inventory foundation: transfer planning is atomic and drop/recover primary container preserves ownership and contents', () => {
  const input = state({
    current_g5_anchor_id: 'g5-1',
    strength: 100,
    containers: [{ container_id: 'bag-1', template_id: 'bag' }],
    items: [{ item_id: 'knife-1', template_id: 'knife', quantity: 1 }],
    container_placements: [{ container_id: 'bag-1', holder_character_id: actorId, physical_position: 'worn' }],
    item_placements: [{ item_id: 'knife-1', container_id: 'bag-1' }],
    ownership: [{ container_id: 'bag-1', owner_character_id: actorId, controller_character_id: actorId }]
  });
  const dropped = planInventoryTransfer({ ...input, operation: 'drop_primary_container', item_or_container_id: 'bag-1', expected_state_version: 4 });
  assert.equal(dropped.pass, true);
  assert.deepEqual(dropped.change_set.ownership_changes, []);
  assert.equal(dropped.change_set.placement_changes[0].anchor_id, 'g5-1');
  assert.equal(planInventoryTransfer({ ...input, operation: 'drop_primary_container', item_or_container_id: 'bag-1', expected_state_version: 3 }).errors[0].code, 'STATE_VERSION_MISMATCH');
  assert.equal(planInventoryTransfer({ ...input, current_g5_anchor_id: null, operation: 'drop_primary_container', item_or_container_id: 'bag-1', expected_state_version: 4 }).errors[0].code, 'INVENTORY_DROP_ANCHOR_MISSING');
});

test('inventory foundation: generic item moves are planned as a validated change set', () => {
  const input = state({
    strength: 100,
    containers: [{ container_id: 'pouch-1', template_id: 'pouch' }],
    items: [{ item_id: 'knife-1', template_id: 'knife', quantity: 1 }],
    container_placements: [{ container_id: 'pouch-1', holder_character_id: actorId, physical_position: 'worn_quick' }],
    item_placements: [{ item_id: 'knife-1', holder_character_id: actorId, physical_position: 'hands' }],
    container_compatibility: [{ container_template_id: 'pouch', carry_form: 'compact', compatibility: 'allowed' }]
  });
  const moved = planInventoryTransfer({ ...input, operation: 'move_to_container', item_or_container_id: 'knife-1', target_container_id: 'pouch-1', expected_state_version: 4 });
  assert.equal(moved.pass, true);
  assert.deepEqual(moved.change_set.placement_changes[0], { instance_kind: 'item', party_id: partyId, item_id: 'knife-1', container_id: 'pouch-1' });
  assert.equal(planInventoryTransfer({ ...input, operation: 'equip', item_or_container_id: 'knife-1', expected_state_version: 4 }).errors[0].code, 'INVENTORY_EQUIPMENT_SLOT_REQUIRED');
});

test('inventory foundation: approved actor transition moves a NPC-held quick item to NPC hands without changing its owner', () => {
  const input = state({
    strength: undefined,
    actor_strengths: { 'ratsha-npc': 10, 'fisher-npc': 10 },
    items: [{ item_id: 'ratsha-knife', template_id: 'knife', quantity: 1 }],
    item_profiles: { ...profiles, knife: { ...profiles.knife, mass_grams: 400, external_hand_cost: 0 } },
    item_placements: [{ item_id: 'ratsha-knife', holder_npc_id: 'ratsha-npc', physical_position: 'worn_quick' }],
    ownership: [{ item_id: 'ratsha-knife', owner_npc_id: 'ratsha-owner', controller_npc_id: 'ratsha-npc' }],
    source: { actor_id: 'ratsha-npc', actor_kind: 'npc', controller_actor_id: 'ratsha-npc', physical_position: 'worn_quick', accessibility: 'quick' },
    destination: { actor_id: 'fisher-npc', actor_kind: 'npc', controller_actor_id: 'fisher-npc', physical_position: 'hands', accessibility: 'secured_not_available_to_source' },
    approved_transition: {
      transition_profile_id: 'approved-surrender',
      subject_ref: 'knife',
      owner_change: 'forbidden',
      requires: {
        holder_ref: 'ratsha_slot',
        controller_ref: 'ratsha_slot',
        physical_position: 'worn_quick',
        accessibility: 'quick',
        admission_fact: 'surrender-committed'
      },
      writes: {
        holder_ref: 'fisher_slot',
        controller_ref: 'fisher_slot',
        physical_position: 'hands',
        accessibility: 'secured_not_available_to_source'
      }
    },
    resolved_actor_refs: {
      ratsha_slot: 'ratsha-npc',
      fisher_slot: 'fisher-npc'
    },
    approved_facts: ['surrender-committed'],
    item_id: 'ratsha-knife',
    expected_state_version: 4
  });
  const planned = planApprovedActorItemTransition(input);
  assert.equal(planned.pass, true);
  assert.deepEqual(planned.proposal.placement, { instance_kind: 'item', party_id: partyId, item_id: 'ratsha-knife', holder_npc_id: 'fisher-npc', physical_position: 'hands' });
  assert.equal(planned.proposal.ownership.owner_change, 'forbidden');
  assert.equal(planned.proposal.ownership.next.owner_npc_id, 'ratsha-owner');
  assert.equal(planned.proposal.ownership.next.controller_npc_id, 'fisher-npc');
  assert.deepEqual(planned.derived_after.destination, { total_mass_grams: 400, hands_used: 0, hands_free: 2, load_category: 'light' });
  assert.equal(planApprovedActorItemTransition({
    ...input,
    destination: { ...input.destination, physical_position: 'worn_quick' }
  }).errors[0].code, 'APPROVED_TRANSITION_POLICY_STATE_MISMATCH');
});

test('inventory foundation: approved actor transition rejects missing destination, incorrect source and inferred placement', () => {
  const base = state({
    actor_strengths: { source: 10, destination: 10 },
    items: [{ item_id: 'knife-1', template_id: 'knife', quantity: 1 }],
    item_placements: [{ item_id: 'knife-1', holder_npc_id: 'source', physical_position: 'worn_quick' }],
    ownership: [{ item_id: 'knife-1', owner_npc_id: 'owner', controller_npc_id: 'source' }],
    source: { actor_id: 'source', actor_kind: 'npc', controller_actor_id: 'source', physical_position: 'worn_quick', accessibility: 'quick' },
    destination: { actor_id: 'destination', actor_kind: 'npc', controller_actor_id: 'destination', physical_position: 'hands', accessibility: 'secured' },
    approved_transition: { transition_profile_id: 'approved', owner_change: 'forbidden', required_facts: ['admitted'] },
    approved_facts: ['admitted'],
    item_id: 'knife-1',
    expected_state_version: 4
  });
  assert.equal(planApprovedActorItemTransition({ ...base, destination: undefined }).errors[0].code, 'APPROVED_TRANSITION_EXACT_STATE_REQUIRED');
  assert.equal(planApprovedActorItemTransition({ ...base, source: { ...base.source, physical_position: 'hands' } }).errors[0].code, 'APPROVED_TRANSITION_SOURCE_PLACEMENT_MISMATCH');
  assert.equal(planApprovedActorItemTransition({ ...base, destination: { ...base.destination, physical_position: undefined } }).errors[0].code, 'APPROVED_TRANSITION_EXACT_STATE_REQUIRED');
});

test('inventory foundation: approved actor transition validates mass and hands without inventing missing NPC strength', () => {
  const input = state({
    strength: undefined,
    actor_strengths: {},
    items: [{ item_id: 'knife-1', template_id: 'knife', quantity: 1 }],
    item_placements: [{
      item_id: 'knife-1',
      holder_npc_id: 'source',
      physical_position: 'worn_quick'
    }],
    ownership: [{
      item_id: 'knife-1',
      owner_npc_id: 'source',
      controller_npc_id: 'source'
    }],
    source: {
      actor_id: 'source',
      actor_kind: 'npc',
      controller_actor_id: 'source',
      physical_position: 'worn_quick',
      accessibility: 'quick'
    },
    destination: {
      actor_id: 'destination',
      actor_kind: 'npc',
      controller_actor_id: 'destination',
      physical_position: 'hands',
      accessibility: 'secured'
    },
    approved_transition: {
      transition_profile_id: 'approved',
      owner_change: 'forbidden',
      required_facts: ['admitted']
    },
    approved_facts: ['admitted'],
    item_id: 'knife-1',
    expected_state_version: 4
  });
  const result = planApprovedActorItemTransition(input);
  assert.equal(result.pass, true);
  assert.equal(result.derived_after.source.load_category, null);
  assert.equal(result.derived_after.destination.total_mass_grams, 300);
  assert.equal(result.derived_after.destination.hands_used, 1);
});
