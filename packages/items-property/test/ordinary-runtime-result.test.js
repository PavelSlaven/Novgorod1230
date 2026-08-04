import assert from 'node:assert/strict';
import test from 'node:test';
import {
  admitOrdinaryRuntimeResult,
  applyRuntimeInventoryTransition,
  calculateHandsState,
  calculateInventoryMass,
  normalizeRuntimeItemPlacement,
  projectRuntimeInventoryInstance
} from '../src/index.js';

const policy = Object.freeze({
  schema: 'rus.items.ordinary_result_admission_policy.v1',
  version: 1,
  status: 'approved',
  candidates: [{
    semantic_type: 'material_portion',
    name: 'handful of wet sand',
    significance: 'ordinary',
    allowed_origin_kinds: ['ambient_ordinary'],
    approved_fact_texts: ['wet river sand taken from the shore']
  }]
});

const operation = {
  semantic_type: 'material_portion',
  name: 'handful of wet sand',
  origin: { kind: 'ambient_ordinary' },
  facts: [{ text: 'wet river sand taken from the shore' }]
};

test('ordinary result admission requires one exact approved semantic policy', () => {
  assert.deepEqual(admitOrdinaryRuntimeResult({ operation, policy }), {
    pass: true,
    admission: {
      semantic_type: 'material_portion',
      name: 'handful of wet sand',
      significance: 'ordinary'
    },
    errors: []
  });
  for (const missing of [undefined, {}, {
    ...policy,
    candidates: [...policy.candidates, structuredClone(policy.candidates[0])]
  }]) {
    const result = admitOrdinaryRuntimeResult({ operation, policy: missing });
    assert.equal(result.pass, false);
    assert.equal(result.errors[0].category, 'data_gap');
  }
  assert.equal(admitOrdinaryRuntimeResult({
    operation: { ...operation, name: 'silver coin' }, policy
  }).pass, false);
});

test('inside and attached placement use visible current topology and reject invalid targets', () => {
  const items = [{
    item_id: 'open-bag', open_state: 'open',
    access_state: { access: 'open' }, placement: { holder_character_id: 'actor' }
  }, {
    item_id: 'closed-box', open_state: 'closed',
    placement: { holder_character_id: 'actor' }
  }, {
    item_id: 'remote-item', placement: { location_ref: 'remote' }
  }, {
    item_id: 'chain-a', placement: { attached_item_id: 'chain-b' }
  }, {
    item_id: 'chain-b', placement: { attached_item_id: 'moving' }
  }];
  const context = {
    actor_id: 'actor', current_location_ref: 'here', entity_ref: 'moving',
    visible_items: items,
    incoming_mechanics: { packing_slot_cost: 2 },
    resolve_mechanics: (ref) => ref === 'open-bag'
      ? { capacity: 3, used_slots: 0 }
      : { packing_slot_cost: 1 }
  };

  assert.deepEqual(normalizeRuntimeItemPlacement({
    ...context,
    placement: { relation: 'inside', target_ref: 'open-bag' }
  }).placement, { container_id: 'open-bag' });
  assert.equal(normalizeRuntimeItemPlacement({
    ...context,
    placement: { relation: 'inside', target_ref: 'closed-box' }
  }).errors[0].code, 'ITEM_RUNTIME_CONTAINER_NOT_OPEN');
  assert.equal(normalizeRuntimeItemPlacement({
    ...context,
    resolve_mechanics: () => ({ capacity: 2, used_slots: 2 }),
    placement: { relation: 'inside', target_ref: 'open-bag' }
  }).errors[0].code, 'ITEM_RUNTIME_CONTAINER_CAPACITY_EXCEEDED');
  assert.equal(normalizeRuntimeItemPlacement({
    ...context,
    placement: { relation: 'attached_to', target_ref: 'remote-item' }
  }).errors[0].code, 'ITEM_RUNTIME_PLACEMENT_TARGET_NOT_VISIBLE');
  assert.equal(normalizeRuntimeItemPlacement({
    ...context,
    placement: { relation: 'attached_to', target_ref: 'chain-a' }
  }).errors[0].code, 'ITEM_RUNTIME_PLACEMENT_CYCLE');
  assert.equal(normalizeRuntimeItemPlacement({
    ...context,
    placement: { relation: 'located_at', target_ref: 'prepared-destination' }
  }).errors[0].code, 'ITEM_RUNTIME_LOCATION_NOT_CURRENT');
});

test('runtime transition derives nested mass, hands and load from exact snapshots', () => {
  const result = applyRuntimeInventoryTransition({
    inventory: {
      items: [], total_weight: { grams: 100 }, occupied_hands: 0,
      load_category: 'light'
    },
    actor_id: 'actor', strength: 1, item_ref: 'sand',
    before_placement: { location_ref: 'here' },
    after_placement: { holder_character_id: 'actor', physical_position: 'hands' },
    runtime_items: [{
      item_ref: 'sand',
      placement: { location_ref: 'here' },
      mechanics: { mass_grams: 300, external_hand_cost: 1 }
    }]
  });
  assert.deepEqual(result.inventory, {
    items: ['sand'], total_weight: { grams: 400 }, occupied_hands: 1,
    load_category: 'light'
  });
});

test('runtime transition fails closed when committed or derived mass is unsafe', () => {
  const base = {
    inventory: {
      items: [], total_weight: { grams: 0 }, occupied_hands: 0,
      load_category: 'light'
    },
    actor_id: 'actor', strength: 1, item_ref: 'sand',
    before_placement: { location_ref: 'here' },
    after_placement: { holder_character_id: 'actor', physical_position: 'hands' }
  };
  assert.equal(applyRuntimeInventoryTransition({
    ...base,
    inventory: {
      ...base.inventory,
      total_weight: { grams: Number.MAX_SAFE_INTEGER + 1 }
    },
    runtime_items: []
  }).errors[0].code, 'ITEM_RUNTIME_INVENTORY_CONTEXT_DATA_GAP');
  assert.equal(applyRuntimeInventoryTransition({
    ...base,
    runtime_items: [{
      item_ref: 'sand', placement: { location_ref: 'here' },
      mechanics: {
        mass_grams: Number.MAX_SAFE_INTEGER,
        external_hand_cost: 1
      }
    }, {
      item_ref: 'second',
      placement: { holder_character_id: 'actor', physical_position: 'worn' },
      mechanics: { mass_grams: 1, external_hand_cost: 0 }
    }]
  }).errors[0].code, 'ITEM_RUNTIME_INVENTORY_CONTEXT_DATA_GAP');
});

test('runtime inventory projection preserves mechanics across restart calculations', () => {
  const snapshot = {
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v1', version: 1,
    provenance: {
      source_kind: 'ordinary_direct_action_result', root_turn_id: 'turn:1',
      step_index: 1, operation_ref: 'op:1', origin_kind: 'ambient_ordinary',
      source_refs: ['shore']
    },
    mechanics: {
      mass_grams: 300, external_hand_cost: 1, carry_form: 'compact',
      packing_slot_cost: 1, quantity: { value: 1, unit: 'handful' },
      container: null
    }
  };
  const restarted = projectRuntimeInventoryInstance({
    item_id: 'sand', quantity: 1,
    runtime_instance_mechanics_snapshot: snapshot
  });
  assert.deepEqual(restarted, {
    item_id: 'sand', quantity: 1,
    runtime_instance_mechanics_snapshot: snapshot
  });
  const inventory = {
    party_id: 'party', actor_id: 'actor', items: [restarted], containers: [],
    item_placements: [{
      item_id: 'sand', holder_character_id: 'actor', physical_position: 'hands'
    }],
    container_placements: [], item_profiles: {}, container_profiles: {}
  };
  assert.equal(calculateInventoryMass(inventory).total_mass_grams, 300);
  assert.equal(calculateHandsState(inventory).hands_used, 1);
});
