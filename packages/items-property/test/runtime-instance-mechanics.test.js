import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePackingSlots } from '@rus/world-catalog-workflow';
import {
  calculateContainerUsage,
  calculateHandsState,
  calculateInventoryMass,
  createRuntimeInstanceMechanicsSnapshot,
  resolveInventoryMechanicsProfile
} from '../src/index.js';

const partyId = 'party-1';
const actorId = 'actor-1';

function snapshot(overrides = {}) {
  return {
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v1',
    version: 1,
    provenance: {
      source_kind: 'ordinary_direct_action_result',
      root_turn_id: 'turn:party-1:7',
      step_index: 1,
      operation_ref: 'new_entity_1',
      origin_kind: 'ambient_ordinary',
      source_refs: ['shore_wet_sand']
    },
    mechanics: {
      mass_grams: 350,
      external_hand_cost: 1,
      carry_form: 'compact',
      packing_slot_cost: 2,
      quantity: { value: 1, unit: 'handful' },
      container: null
    },
    ...overrides
  };
}

function inventory(item) {
  return {
    party_id: partyId,
    actor_id: actorId,
    items: [item],
    containers: [],
    item_placements: [{
      item_id: item.item_id,
      holder_character_id: actorId,
      physical_position: 'hands'
    }],
    container_placements: [],
    item_profiles: {},
    container_profiles: {}
  };
}

test('runtime instance snapshot is strict, detached and deeply frozen', () => {
  const source = snapshot();
  const before = structuredClone(source);
  const created = createRuntimeInstanceMechanicsSnapshot(source);

  assert.deepEqual(created, before);
  assert.notEqual(created, source);
  assert.notEqual(created.provenance, source.provenance);
  assert.equal(Object.isFrozen(created), true);
  assert.equal(Object.isFrozen(created.provenance), true);
  assert.equal(Object.isFrozen(created.provenance.source_refs), true);
  assert.equal(Object.isFrozen(created.mechanics), true);
  assert.deepEqual(source, before);
  assert.throws(() => {
    created.mechanics.mass_grams = 1;
  }, TypeError);
});

test('template-less ordinary instance snapshot owns exact mass, hands and packing', () => {
  const item = {
    item_id: 'wet-sand-1',
    runtime_instance_mechanics_snapshot: snapshot()
  };
  const carried = inventory(item);

  assert.deepEqual(calculateInventoryMass(carried), {
    pass: true,
    total_mass_grams: 350,
    errors: []
  });
  assert.deepEqual(calculateHandsState(carried), {
    pass: true,
    hands_total: 2,
    hands_used: 1,
    hands_free: 1,
    errors: []
  });

  const packed = {
    ...carried,
    item_placements: [{ item_id: item.item_id, container_id: 'pouch-1' }],
    containers: [{ container_id: 'pouch-1', template_id: 'pouch' }],
    container_placements: [{
      container_id: 'pouch-1',
      holder_character_id: actorId,
      physical_position: 'worn_quick'
    }],
    container_profiles: {
      pouch: {
        mass_grams: 100,
        external_hand_cost: 0,
        carry_form: 'compact',
        packing_slot_cost: 1,
        packing_bundle_size: 1,
        capacity: 4
      }
    },
    container_compatibility: [],
    packing_calculator: calculatePackingSlots
  };
  assert.deepEqual(calculateContainerUsage({
    ...packed,
    container_id: 'pouch-1'
  }), {
    pass: true,
    used_slots: 2,
    remaining_slots: 2,
    errors: []
  });
});

test('runtime snapshot and resolver fail closed on absent, incomplete or mixed sources', () => {
  assert.throws(
    () => createRuntimeInstanceMechanicsSnapshot({
      ...snapshot(),
      mechanics: { mass_grams: 350 }
    }),
    { code: 'ITEM_RUNTIME_MECHANICS_SNAPSHOT_INVALID' }
  );
  for (const field of ['mass_grams', 'packing_slot_cost']) {
    assert.throws(() => createRuntimeInstanceMechanicsSnapshot({
      ...snapshot(),
      mechanics: {
        ...snapshot().mechanics,
        [field]: Number.MAX_SAFE_INTEGER + 1
      }
    }), { code: 'ITEM_RUNTIME_MECHANICS_SNAPSHOT_INVALID' });
  }
  assert.throws(
    () => createRuntimeInstanceMechanicsSnapshot({
      ...snapshot(),
      unexpected: true
    }),
    { code: 'ITEM_RUNTIME_MECHANICS_SNAPSHOT_INVALID' }
  );

  const absent = resolveInventoryMechanicsProfile({
    instance: { item_id: 'missing-1' },
    profiles: {}
  });
  assert.equal(absent.pass, false);
  assert.equal(absent.errors[0].code,
    'ITEM_RUNTIME_MECHANICS_SNAPSHOT_REQUIRED');

  const invalidItem = {
    item_id: 'invalid-1',
    runtime_instance_mechanics_snapshot: {
      ...snapshot(),
      mechanics: { ...snapshot().mechanics, external_hand_cost: 3 }
    }
  };
  assert.equal(
    calculateInventoryMass(inventory(invalidItem)).errors[0].code,
    'ITEM_RUNTIME_MECHANICS_SNAPSHOT_INVALID'
  );

  const mixed = resolveInventoryMechanicsProfile({
    instance: {
      item_id: 'mixed-1',
      template_id: 'knife',
      runtime_instance_mechanics_snapshot: snapshot()
    },
    profiles: { knife: { mass_grams: 300 } }
  });
  assert.equal(mixed.pass, false);
  assert.equal(mixed.errors[0].code, 'ITEM_MECHANICS_SOURCE_CONFLICT');
});

test('authored instances still resolve and calculate exclusively by template profile', () => {
  const profiles = {
    knife: {
      mass_grams: 300,
      external_hand_cost: 1,
      carry_form: 'compact',
      packing_slot_cost: 1,
      packing_bundle_size: 1
    }
  };
  const item = { item_id: 'knife-1', template_id: 'knife', quantity: 2 };
  const resolved = resolveInventoryMechanicsProfile({ instance: item, profiles });
  const state = { ...inventory(item), item_profiles: profiles };

  assert.equal(resolved.pass, true);
  assert.equal(resolved.source, 'authored_profile');
  assert.deepEqual(resolved.profile, profiles.knife);
  assert.notEqual(resolved.profile, profiles.knife);
  assert.equal(Object.isFrozen(resolved.profile), true);
  assert.equal(calculateInventoryMass(state).total_mass_grams, 600);
  assert.equal(calculateHandsState(state).hands_used, 1);
});
