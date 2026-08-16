import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceTurnStepRuntimePorts } from
  '../src/runtime/lower-dvina-trace-turn-step-runtime-ports.js';
import { projectLowerDvinaTracePlayerSafeState } from
  '../src/runtime/lower-dvina-trace-player-safe-state.js';
import { createLowerDvinaTracePlayerSafeWorkingProjectionAuthority } from
  '../src/runtime/lower-dvina-trace-player-safe-working.js';

const ACTOR_HELD_CASES = [{
  label: 'equipped caftan', itemId: 'ratsha-caftan',
  physicalPosition: 'equipped', equipmentSlot: 'outer_garment', handCost: 0
}, {
  label: 'knife in hands', itemId: 'ratsha-knife',
  physicalPosition: 'hands', handCost: 1
}, {
  label: 'ordinary worn-quick pouch', itemId: 'ratsha-pouch',
  physicalPosition: 'worn_quick', handCost: 0
}];

for (const itemCase of ACTOR_HELD_CASES) {
  test(`generic move_entity transfers ${itemCase.label} to player hands`,
    async () => {
      const { item, profile } = actorHeldItem(itemCase);
      const committedState = committedStateWith(item);
      const projection = projectLowerDvinaTracePlayerSafeState({
        committed_state: committedState, actor_id: 'mikula'
      }).player_safe_state;
      const projectedItem = projection.items.find(({ item_id: itemId }) =>
        itemId === itemCase.itemId);
      assert.equal(projectedItem.placement.holder_npc_id, 'ratsha');
      assert.equal(projectedItem.placement.physical_position,
        itemCase.physicalPosition);
      assert.equal(projectedItem.placement.equipment_slot_category_id,
        itemCase.equipmentSlot);
      const ports = runtimePorts(committedState, profile);
      const taken = await runMove(
        ports, projection, 1, 'held_by', itemCase.itemId);
      const takePayload = taken.write_fragments[0].value.payload;
      assert.deepEqual(takePayload.actor_transition, {
        schema: 'rus.approved_actor_item_transition.v1', version: 1
      });
      assert.equal(takePayload.entity_ref, itemCase.itemId);
      assert.equal(takePayload.placement.holder_character_id, 'mikula');
      assert.equal(takePayload.placement.physical_position, 'hands');
    });
}

test('transferred caftan uses the same item instance when player equips it',
  async () => {
    const itemCase = ACTOR_HELD_CASES[0];
    const { item, profile } = actorHeldItem(itemCase);
    const committedState = committedStateWith(item);
    const projection = projectLowerDvinaTracePlayerSafeState({
      committed_state: committedState, actor_id: 'mikula'
    }).player_safe_state;
    const ports = runtimePorts(committedState, profile);
    const taken = await runMove(
      ports, projection, 1, 'held_by', itemCase.itemId);
    const equipped = await runMove(
      ports, taken.working_projection, 2, 'worn_by', itemCase.itemId);
    const equipPayload = equipped.write_fragments[0].value.payload;
    assert.equal(equipPayload.entity_ref, itemCase.itemId);
    assert.equal(equipPayload.placement.physical_position, 'equipped');
    assert.equal(equipPayload.placement.equipment_slot_category_id,
      'outer_garment');
  });

test('generic move_entity transfers an NPC worn-quick container to player hands',
  async () => {
    const container = actorHeldContainer();
    const committedState = committedStateWithContainer(container);
    const projection = projectLowerDvinaTracePlayerSafeState({
      committed_state: committedState, actor_id: 'mikula'
    }).player_safe_state;
    assert.equal(projection.items.find(({ item_id: itemId }) =>
      itemId === container.container_id).placement.holder_npc_id, 'ratsha');
    const ports = runtimePorts(committedState,
      container.state.inventory_profile_snapshot);
    const moved = await runMove(
      ports, projection, 1, 'held_by', container.container_id);
    const fragment = moved.write_fragments[0];
    assert.equal(fragment.target, 'party_containers');
    assert.equal(fragment.value.payload.entity_ref, container.container_id);
    assert.equal(fragment.value.payload.placement.holder_character_id,
      'mikula');
    assert.equal(fragment.value.payload.placement.physical_position, 'hands');
  });

function actorHeldItem({ itemId, physicalPosition, equipmentSlot, handCost }) {
  const profile = {
    mass_grams: 500, carry_form: 'regular', external_hand_cost: handCost
  };
  return {
    profile,
    item: {
      item_id: itemId, template_id: `${itemId}-template`,
      profile_id: `${itemId}-profile`, quantity: 1,
      condition_state: 'serviceable', legal_status: 'owned',
      placement: {
        holder_npc_id: 'ratsha', physical_position: physicalPosition,
        ...(equipmentSlot == null
          ? {} : { equipment_slot_category_id: equipmentSlot })
      },
      ownership: { ownership_id: `ownership:${itemId}`,
        owner_npc_id: 'ratsha', controller_npc_id: 'ratsha',
        claim_state: 'established' },
      state: { inventory_profile_snapshot: profile,
        ...(equipmentSlot == null ? {} : {
          visual_profile_snapshot: {
            schema: 'item_visual_profile_snapshot_v1', version: 1,
            equipment_slot: equipmentSlot
          }
        }) }
    }
  };
}

function committedStateWith(item) {
  return {
    party_id: 'party', actor_id: 'mikula',
    party_state: { state_version: 2 },
    position: { g5_anchor_id: 'shore-anchor', location_ref: 'shore' },
    player_profile: {
      attributes: { strength: { value: 9 } },
      inventory: { items: [], total_weight: { grams: 0 },
        load_category: 'light', occupied_hands: 0 }
    },
    npcs: [{ instance_id: 'ratsha', location_ref: 'shore' }],
    items: [item], containers: [], container_placements: [],
    container_profiles: [], knowledge: []
  };
}

function actorHeldContainer() {
  const profile = { mass_grams: 600, carry_form: 'regular',
    external_hand_cost: 1, packing_slot_cost: 2, packing_bundle_size: 1,
    capacity: 8, inventory_role: 'quick_container',
    closure_state: 'closed' };
  return {
    container_id: 'ratsha-bag', template_id: 'bag-template',
    holder_npc_id: 'ratsha', physical_position: 'worn_quick',
    closure_state: 'closed',
    ownership: { ownership_id: 'ownership:ratsha-bag',
      container_id: 'ratsha-bag', owner_npc_id: 'ratsha',
      controller_npc_id: 'ratsha', claim_state: 'owned' },
    state: { inventory_profile_snapshot: profile }
  };
}

function committedStateWithContainer(container) {
  const state = committedStateWith(null);
  state.items = [];
  state.containers = [container];
  state.container_placements = [{
    container_id: container.container_id,
    holder_npc_id: container.holder_npc_id,
    physical_position: container.physical_position
  }];
  state.container_profiles = [{
    template_id: container.template_id,
    ...container.state.inventory_profile_snapshot
  }];
  return state;
}

function runtimePorts(committedState, profile) {
  return createLowerDvinaTraceTurnStepRuntimePorts({
    committedState,
    resolveItemMechanics: () => profile,
    workingProjectionAuthority:
      createLowerDvinaTracePlayerSafeWorkingProjectionAuthority()
  });
}

function runMove(ports, projection, step, relation, itemId) {
  const operation = { op: 'move_entity', entity_ref: itemId,
    placement: { relation, target_ref: 'mikula' } };
  return ports.executionRegistry.direct(operation)({
    plan: {}, operation, working_projection: projection, check_result: null,
    request: { root_turn_id: 'turn:party:1', step_index: step,
      actor: { actor_id: 'mikula',
        attributes: { strength: { value: 9, bonus: -1 } } } }
  });
}
