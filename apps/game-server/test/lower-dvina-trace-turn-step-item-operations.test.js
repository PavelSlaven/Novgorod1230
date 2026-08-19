import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeInstanceMechanicsSnapshot } from '@rus/items-property';
import {
  createItemOperationHandlers,
  initializeRuntimeState
} from '../src/runtime/lower-dvina-trace-turn-step-item-operations.js';
import {
  buildCommittedInventoryInput,
  createCommittedItemMechanicsResolver,
  getCommittedInventoryLoad,
  validateCommittedInventoryState
} from
  '../src/runtime/lower-dvina-trace-committed-inventory.js';

const ordinaryResultPolicy = Object.freeze({
  schema: 'rus.items.ordinary_result_admission_policy.v1',
  version: 1,
  status: 'approved',
  candidates: [{
    semantic_type: 'material_portion',
    name: 'горсть мокрого песка',
    significance: 'ordinary',
    allowed_origin_kinds: ['ambient_ordinary', 'direct_partition'],
    approved_fact_texts: ['песок теперь собран плотным влажным комком']
  }]
});

test('scenario item factory requires injected approved ordinary policy', () => {
  const handlers = createItemOperationHandlers(initializeRuntimeState(null));
  assert.throws(() => handlers.create_entity(execution(createSand())), {
    code: 'ITEM_ORDINARY_RESULT_POLICY_DATA_GAP'
  });
});

test('ambient adapter preserves semantic intent for code-owned source selection', async () => {
  let received;
  const snapshot = createRuntimeInstanceMechanicsSnapshot({
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v1', version: 1,
    provenance: { source_kind: 'ordinary_direct_action_result',
      root_turn_id: 'turn:party:1', step_index: 1,
      operation_ref: 'turn:party:1:operation:1', origin_kind: 'ambient_ordinary',
      source_refs: ['ambient:shore'] },
    mechanics: createSand().mechanics
  });
  const handlers = createItemOperationHandlers(initializeRuntimeState(null), {
    ordinaryResultPolicy,
    ambientOrdinaryPortionAdmission: async (input) => {
      received = input.request;
      return { pass: true, proposal: { semantic_descriptor: {
        semantic_type: 'material_portion', name: 'горсть мокрого песка' } },
      runtime_instance_mechanics_snapshot: snapshot };
    }
  });
  await handlers.create_entity(execution(createSand()));
  assert.equal(received.semantic_type, 'material_portion');
  assert.equal(received.semantic_name, 'горсть мокрого песка');
  assert.deepEqual(received.source_identity_refs, ['shore']);
  assert.equal(received.source_ref, 'committed');
  assert.equal(received.portion_profile_ref, 'committed');
});

test('inside uses a visible open container and code-owned capacity', () => {
  const options = {
    ordinaryResultPolicy,
    resolveItemMechanics(ref) {
      return ref === 'open-bag' || ref === 'closed-bag'
        ? { capacity: 2, used_slots: 0 }
        : null;
    }
  };
  const handlers = createItemOperationHandlers(initializeRuntimeState(null),
    options);
  const openProjection = projection({
    items: [{
      item_id: 'open-bag', open_state: 'open',
      access_state: { access: 'open' },
      placement: { holder_character_id: 'mikula', physical_position: 'worn' }
    }, {
      item_id: 'closed-bag', open_state: 'closed',
      placement: { holder_character_id: 'mikula', physical_position: 'worn' }
    }]
  });
  const operation = createSand({
    placement: { relation: 'inside', target_ref: 'open-bag' }
  });
  const result = handlers.create_entity(execution(operation, openProjection));
  assert.deepEqual(result.working_projection.items.at(-1).placement,
    { container_id: 'open-bag' });
  assert.equal(result.working_projection.inventory.total_weight.grams, 700);
  assert.equal(result.working_projection.inventory.occupied_hands, 0);
  assert.equal(result.write_fragments[0].value.payload.placement.container_id,
    'open-bag');

  const closed = createSand({
    temp_ref: 'new_entity_2',
    placement: { relation: 'inside', target_ref: 'closed-bag' }
  });
  assert.throws(() => handlers.create_entity(execution(closed, openProjection)), {
    code: 'ITEM_RUNTIME_CONTAINER_NOT_OPEN'
  });
});

test('inside capacity includes committed hidden contents, not player projection', () => {
  const committedState = {
    party_id: 'party', actor_id: 'mikula',
    party_state: { state_version: 1 },
    position: { g5_anchor_id: 'shore-anchor' },
    player_profile: { attributes: { strength: { value: 9 } } },
    items: [{
      item_id: 'hidden-content', template_id: 'hidden-profile', quantity: 1,
      placement: { container_id: 'open-bag' },
      state: { inventory_profile_snapshot: {
        mass_grams: 10, external_hand_cost: 0, carry_form: 'compact',
        packing_slot_cost: 2, packing_bundle_size: 1
      } }
    }],
    containers: [{ container_id: 'open-bag', template_id: 'bag-profile' }],
    container_placements: [{
      container_id: 'open-bag', holder_character_id: 'mikula',
      physical_position: 'worn'
    }],
    container_profiles: {
      'bag-profile': {
        capacity: 2, mass_grams: 100, external_hand_cost: 0,
        packing_slot_cost: 1, carry_form: 'compact'
      }
    }
  };
  const resolveItemMechanics = createCommittedItemMechanicsResolver(
    committedState,
    {
      packingCalculator({ quantity, packing_slot_cost: cost,
        packing_bundle_size: bundle }) {
        return {
          pass: true,
          required_slots: Math.ceil(quantity / bundle) * cost,
          errors: []
        };
      }
    }
  );
  const handlers = createItemOperationHandlers(
    initializeRuntimeState(committedState),
    { ordinaryResultPolicy, resolveItemMechanics }
  );
  const visibleProjection = projection({
    items: [{
      item_id: 'open-bag', open_state: 'open',
      access_state: { access: 'open' },
      placement: { holder_character_id: 'mikula', physical_position: 'worn' }
    }]
  });

  assert.throws(() => handlers.create_entity(execution(createSand({
    placement: { relation: 'inside', target_ref: 'open-bag' }
  }), visibleProjection)), {
    code: 'ITEM_RUNTIME_CONTAINER_CAPACITY_EXCEEDED'
  });
});

test('inside capacity includes runtime items created earlier in the same submit', () => {
  const committedState = {
    party_id: 'party', actor_id: 'mikula',
    party_state: { state_version: 1 },
    position: { g5_anchor_id: 'shore-anchor' },
    player_profile: { attributes: { strength: { value: 9 } } },
    items: [],
    containers: [{ container_id: 'open-bag', template_id: 'bag-profile' }],
    container_placements: [{
      container_id: 'open-bag', holder_character_id: 'mikula',
      physical_position: 'worn'
    }],
    container_profiles: {
      'bag-profile': {
        capacity: 1, mass_grams: 100, external_hand_cost: 0,
        packing_slot_cost: 1, carry_form: 'compact'
      }
    }
  };
  const resolveItemMechanics = createCommittedItemMechanicsResolver(
    committedState,
    {
      packingCalculator({ quantity, packing_slot_cost: cost,
        packing_bundle_size: bundle }) {
        return {
          pass: true,
          required_slots: Math.ceil(quantity / bundle) * cost,
          errors: []
        };
      }
    }
  );
  const handlers = createItemOperationHandlers(
    initializeRuntimeState(committedState), {
    ordinaryResultPolicy,
    resolveItemMechanics
  });
  const visibleProjection = projection({
    items: [{
      item_id: 'open-bag', open_state: 'open',
      access_state: { access: 'open' },
      placement: { holder_character_id: 'mikula', physical_position: 'worn' }
    }]
  });
  const first = handlers.create_entity(execution(createSand({
    placement: { relation: 'inside', target_ref: 'open-bag' }
  }), visibleProjection));

  assert.throws(() => handlers.create_entity(execution(createSand({
    temp_ref: 'new_entity_2',
    placement: { relation: 'inside', target_ref: 'open-bag' }
  }), first.working_projection)), {
    code: 'ITEM_RUNTIME_CONTAINER_CAPACITY_EXCEEDED'
  });
});

test('attached topology rejects cycles and remote prepared destinations', async () => {
  const handlers = createItemOperationHandlers(initializeRuntimeState(null), {
    ordinaryResultPolicy
  });
  const first = handlers.create_entity(execution(createSand()));
  const attachedOperation = createSand({
    temp_ref: 'new_entity_2',
    origin: { kind: 'direct_partition', source_refs: ['new_entity_1'] },
    placement: { relation: 'attached_to', target_ref: 'new_entity_1' }
  });
  const second = handlers.create_entity(execution(attachedOperation,
    first.working_projection));
  const move = handlers.move_entity;
  await assert.rejects(() => move(execution({
    op: 'move_entity',
    entity_ref: 'new_entity_1',
    placement: { relation: 'attached_to', target_ref: 'new_entity_2' }
  }, second.working_projection)), { code: 'ITEM_RUNTIME_PLACEMENT_CYCLE' });
  await assert.rejects(() => move(execution({
    op: 'move_entity',
    entity_ref: 'new_entity_1',
    placement: { relation: 'located_at', target_ref: 'camp' }
  }, second.working_projection)), { code: 'ITEM_RUNTIME_LOCATION_NOT_CURRENT' });
});

test('retired temp refs remain reserved for the submit-scoped step loop', () => {
  const handlers = createItemOperationHandlers(initializeRuntimeState(null), {
    ordinaryResultPolicy
  });
  const first = handlers.create_entity(execution(createSand()));
  const partition = createSand({
    temp_ref: 'new_entity_2',
    origin: { kind: 'direct_partition', source_refs: ['new_entity_1'] },
    placement: { relation: 'located_at', target_ref: 'shore' }
  });
  const second = handlers.create_entity(execution(partition,
    first.working_projection));
  const retired = handlers.retire_entity(execution({
    op: 'retire_entity',
    entity_ref: 'new_entity_1',
    reason: 'исходная порция полностью разделена'
  }, second.working_projection));

  assert.throws(() => handlers.create_entity(execution(createSand(),
    retired.working_projection)), {
    code: 'TRACE_TURN_STEP_TEMP_REF_RETIRED_OR_RESERVED'
  });
});

test('restart hydrates persisted ordinary_metadata facts for change and remove', () => {
  const snapshot = createRuntimeInstanceMechanicsSnapshot({
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v1', version: 1,
    provenance: {
      source_kind: 'ordinary_direct_action_result',
      root_turn_id: 'turn:party:0', step_index: 1,
      operation_ref: 'op:create', origin_kind: 'ambient_ordinary',
      source_refs: ['shore']
    },
    mechanics: createSand().mechanics
  });
  const state = initializeRuntimeState({
    items: [{
      item_id: 'runtime-sand',
      runtime_instance_mechanics_snapshot: snapshot,
      state: {
        ordinary_metadata: {
          semantic_type: 'material_portion',
          name: 'горсть мокрого песка',
          semantic_facts: [{ fact_id: 'persisted-fact', text: 'старый факт' }]
        }
      }
    }],
    knowledge: []
  });
  const handlers = createItemOperationHandlers(state, {
    ordinaryResultPolicy
  });
  const restartedProjection = projection({
    items: [{
      item_id: 'runtime-sand', instance_id: 'runtime-sand',
      placement: { location_ref: 'shore' }
    }],
    knowledge: [{ fact_id: 'persisted-fact', text: 'старый факт' }]
  });
  const result = handlers.change_entity_facts(execution({
    op: 'change_entity_facts',
    entity_ref: 'runtime-sand',
    remove_fact_refs: ['persisted-fact'],
    add_facts: [{
      temp_ref: 'new_fact_after_restart',
      text: 'песок теперь собран плотным влажным комком'
    }]
  }, restartedProjection));

  assert.equal(result.working_projection.knowledge.some(
    ({ fact_id: ref }) => ref === 'persisted-fact'), false);
  assert.equal(result.working_projection.knowledge.some(
    ({ fact_id: ref }) => ref === 'new_fact_after_restart'), true);
  assert.deepEqual(result.write_fragments[0].value.payload.remove_fact_refs,
    ['persisted-fact']);
});

test('committed inventory input preserves runtime snapshot for mass and hands', () => {
  const snapshot = createRuntimeInstanceMechanicsSnapshot({
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v1', version: 1,
    provenance: {
      source_kind: 'ordinary_direct_action_result',
      root_turn_id: 'turn:party:0', step_index: 1,
      operation_ref: 'op:create', origin_kind: 'ambient_ordinary',
      source_refs: ['shore']
    },
    mechanics: createSand().mechanics
  });
  const committedState = {
    party_id: 'party', actor_id: 'mikula',
    party_state: { state_version: 2 },
    position: { g5_anchor_id: 'shore-anchor' },
    player_profile: { attributes: { strength: { value: 9 } } },
    items: [{
      item_id: 'runtime-sand', quantity: 1,
      runtime_instance_mechanics_snapshot: snapshot,
      placement: {
        holder_character_id: 'mikula', physical_position: 'hands'
      }
    }],
    containers: [], container_placements: [], container_profiles: {}
  };

  const input = buildCommittedInventoryInput(committedState);
  assert.deepEqual(input.items[0].runtime_instance_mechanics_snapshot,
    snapshot);
  const derived = getCommittedInventoryLoad(committedState);
  assert.equal(derived.mass.total_mass_grams, 300);
  assert.equal(derived.hands.hands_used, 1);
});

test('final inventory validation rejects an active attachment to a retired host', () => {
  const hostSnapshot = createRuntimeInstanceMechanicsSnapshot({
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v1', version: 1,
    provenance: {
      source_kind: 'ordinary_direct_action_result',
      root_turn_id: 'turn:party:0', step_index: 1,
      operation_ref: 'op:host', origin_kind: 'ambient_ordinary',
      source_refs: ['shore']
    },
    mechanics: createSand().mechanics
  });
  const childSnapshot = createRuntimeInstanceMechanicsSnapshot({
    ...structuredClone(hostSnapshot),
    provenance: {
      ...structuredClone(hostSnapshot.provenance),
      operation_ref: 'op:child'
    }
  });
  const result = validateCommittedInventoryState({
    party_id: 'party', actor_id: 'mikula',
    party_state: { state_version: 2 },
    position: { g5_anchor_id: 'shore-anchor' },
    player_profile: { attributes: { strength: { value: 9 } } },
    items: [{
      item_id: 'retired-host',
      runtime_instance_mechanics_snapshot: hostSnapshot,
      condition_state: 'retired',
      state: { lifecycle_status: 'retired' },
      placement: { anchor_id: 'shore-anchor' }
    }, {
      item_id: 'active-child',
      runtime_instance_mechanics_snapshot: childSnapshot,
      condition_state: 'ordinary_runtime_instance',
      state: { lifecycle_status: 'active' },
      placement: { attached_item_id: 'retired-host' }
    }],
    containers: [], container_placements: [], container_profiles: {}
  });

  assert.equal(result.pass, false);
  assert.ok(result.errors.some(({ code }) => code === 'INVENTORY_ITEM_NOT_FOUND'));
});

test('committed capacity overlay releases an item retired in the same submit', () => {
  const mechanics = createRuntimeInstanceMechanicsSnapshot({
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v1', version: 1,
    provenance: {
      source_kind: 'ordinary_direct_action_result',
      root_turn_id: 'turn:party:0', step_index: 1,
      operation_ref: 'op:item', origin_kind: 'ambient_ordinary',
      source_refs: ['shore']
    },
    mechanics: createSand().mechanics
  });
  const state = {
    party_id: 'party', actor_id: 'mikula',
    party_state: { state_version: 2 },
    position: { g5_anchor_id: 'shore-anchor' },
    player_profile: { attributes: { strength: { value: 9 } } },
    items: [{
      item_id: 'runtime-item',
      runtime_instance_mechanics_snapshot: mechanics,
      placement: { container_id: 'bag' }
    }],
    containers: [{ container_id: 'bag', template_id: 'bag-profile' }],
    container_placements: [{
      container_id: 'bag', holder_character_id: 'mikula',
      physical_position: 'worn'
    }],
    container_profiles: {
      'bag-profile': {
        capacity: 1, mass_grams: 100, external_hand_cost: 0,
        packing_slot_cost: 1, carry_form: 'compact'
      }
    }
  };
  const resolver = createCommittedItemMechanicsResolver(state, {
    packingCalculator({ quantity, packing_slot_cost: cost,
      packing_bundle_size: bundle }) {
      return { pass: true, required_slots: Math.ceil(quantity / bundle) * cost,
        errors: [] };
    }
  });

  assert.equal(resolver('bag').used_slots, 1);
  assert.equal(resolver('bag', {
    retiredItemRefs: ['runtime-item']
  }).used_slots, 0);
});

function execution(operation, workingProjection = projection()) {
  return {
    request: {
      root_turn_id: 'turn:party:1', step_index: 1,
      actor: {
        actor_id: 'mikula', attributes: { strength: { value: 9 } }
      }
    },
    operation,
    working_projection: workingProjection,
    plan: {}, check_result: null
  };
}

function projection(overrides = {}) {
  return {
    actor_id: 'mikula',
    position: { location_ref: 'shore' },
    destination_refs: ['camp'],
    inventory: {
      items: [], total_weight: { grams: 400 }, load_category: 'light',
      occupied_hands: 0
    },
    items: [],
    knowledge: [{ fact_id: 'shore', knowledge_state: 'known' }],
    ...overrides
  };
}

function createSand(overrides = {}) {
  return {
    op: 'create_entity',
    temp_ref: 'new_entity_1',
    semantic_type: 'material_portion',
    name: 'горсть мокрого песка',
    origin: { kind: 'ambient_ordinary', source_refs: ['shore'] },
    facts: [],
    mechanics: {
      mass_grams: 300, external_hand_cost: 1, carry_form: 'compact',
      packing_slot_cost: 1, quantity: { value: 1, unit: 'handful' },
      container: null
    },
    placement: { relation: 'held_by', target_ref: 'mikula' },
    ...overrides
  };
}
