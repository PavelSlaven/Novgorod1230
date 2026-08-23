import assert from 'node:assert/strict';
import test from 'node:test';
import { recheckPhase6TargetedAdmission } from
  '../src/infrastructure/postgres/first-playable/recheck-phase6-admission.js';
import { carrierInventorySnapshot } from
  '../src/runtime/lower-dvina-trace-phase-6-carry-inventory.js';

test('Phase 6 admission preserves nested carrier snapshots', async () => {
  const assemblyResources = ['net', 'poles'].map((itemId) => ({
    item_id: itemId, item_template_ref: `${itemId}-template`,
    condition_state: 'serviceable', holder_npc_id: 'onisim',
    physical_position: 'external', owner_npc_id: 'eremey',
    controller_npc_id: 'onisim', accessibility: 'available', use_state: 'ready'
  }));
  const assemblyRows = assemblyResources.map((resource) => ({
    item_id: resource.item_id, template_id: resource.item_template_ref,
    condition_state: resource.condition_state,
    accessibility: resource.accessibility, use_state: resource.use_state,
    holder_npc_id: resource.holder_npc_id,
    physical_position: resource.physical_position
  }));
  const carrierRows = assemblyRows.map((row) => ({ ...row, quantity: 1,
    state: {}, anchor_id: 'shore', container_id: null,
    holder_character_id: null, equipment_slot_category_id: null }));
  const pouch = { container_id: 'legacy-pouch',
    template_id: 'legacy-pouch-template', anchor_id: null,
    parent_container_id: null, holder_npc_id: null,
    holder_character_id: 'player', physical_position: 'worn_quick',
    equipment_slot_category_id: null, state: {
      ordinary_contents_context: { container_inventory_profile: {
        mass_grams: 300, carry_form: 'regular', capacity: 4, packing_slot_cost: 3
      }, mechanics_policy: { max_external_hand_cost: 0 } }
    } };
  const pouchContents = item('pouch-contents', pouch.container_id, 10);
  const nestedPouch = { container_id: 'nested-pouch',
    template_id: 'nested-pouch-template', anchor_id: null,
    parent_container_id: pouch.container_id, holder_npc_id: null,
    holder_character_id: null, physical_position: null,
    equipment_slot_category_id: null, state: { inventory_profile_snapshot: {
      mass_grams: 20, carry_form: 'compact', capacity: 2, packing_slot_cost: 1,
      external_hand_cost: 0
    } } };
  const nestedContents = item('nested-pouch-contents', nestedPouch.container_id, 15);
  const state = { party_id: 'party', actor_id: 'player',
    party_state: { state_version: 0 }, position: { g5_anchor_id: 'shore' },
    player_profile: { attributes: { strength: { value: 9 } } },
    items: [withPlacement(pouchContents)], containers: [pouch],
    container_placements: [containerPlacement(pouch)], container_profiles: [] };
  const snapshot = () => carrierInventorySnapshot({ state, actorId: 'player',
    excludedAssemblyItemIds: new Set(assemblyResources.map(({ item_id: id }) => id))
  });
  const check = { physical_model: 'trace_phase6_targeted_admission',
    source_anchor_id: 'shore', execution_id: 'carry', resume: false,
    participant_bindings: { source_anchor_id: 'shore', player_actor_id: 'player',
      initial_carrier_ids: ['player', 'eremey', 'ratsha'],
      replacement_carrier_id: 'fisher', carried_actor_id: 'onisim' },
    assembly_resources: assemblyResources, active_carrier_snapshots: [snapshot()],
    player_strength: 9 };
  const rows = (values) => ({ rows: values, rowCount: values.length });
  const carrierContainerQueries = [];
  const recheck = async ({ nested = false, mutation = null,
    containerMutation = null } = {}) => recheckPhase6TargetedAdmission({
    partyId: 'party', check, transaction: { async query(sql) {
      if (sql.includes('FROM party_runtime.party_containers c')) {
        carrierContainerQueries.push(sql);
      }
      if (sql.includes('party_positions')) return rows([{ g5_anchor_id: 'shore' }]);
      if (sql.includes('party_npcs')) return rows(['eremey', 'fisher', 'onisim',
        'ratsha'].map((npc_id) => ({ npc_id, anchor_id: 'shore' })));
      if (sql.includes('party_activity_participant_bindings')) return rows([]);
      if (sql.includes('party_ownership')) return rows(assemblyResources.map(
        ({ item_id }) => ({ item_id, owner_npc_id: 'eremey', controller_npc_id: 'onisim' })));
      if (sql.includes('i.condition_state')) return rows(assemblyRows);
      if (sql.includes('i.quantity')) return rows([...carrierRows,
        ...(sql.includes('carrier_containers') ? [
          { ...pouchContents, state: mutation ?? pouchContents.state },
          ...(nested ? [nestedContents] : [])
        ] : [])]);
      if (sql.includes('party_containers')) return rows(
        sql.includes('carrier_containers') ? [{ ...pouch,
          state: containerMutation ?? pouch.state }, ...(nested ? [nestedPouch] : [])] : []
      );
      throw new Error(`unexpected query: ${sql}`);
    } }
  });

  assert.deepEqual(await recheck(), { ok: true, code: 'state_version_conflict' });
  assert.deepEqual(await recheck({ containerMutation: {
    ordinary_contents_context: { container_inventory_profile: {
      mass_grams: 301, carry_form: 'regular', capacity: 4, packing_slot_cost: 3
    }, mechanics_policy: { max_external_hand_cost: 0 } }
  } }), { ok: false, code: 'state_version_conflict' });
  state.items.push(withPlacement(nestedContents));
  state.containers.push(nestedPouch);
  state.container_placements.push(containerPlacement(nestedPouch));
  check.active_carrier_snapshots = [snapshot()];
  assert.deepEqual(await recheck({ nested: true }), {
    ok: true, code: 'state_version_conflict'
  });
  assert.deepEqual(await recheck({ nested: true, mutation: {
    inventory_profile_snapshot: { mass_grams: 11, external_hand_cost: 0,
      carry_form: 'compact' }
  } }), { ok: false, code: 'state_version_conflict' });
  assert.match(carrierContainerQueries.at(-1), /WHERE c\.party_id=\$1/);
});

function item(item_id, container_id, mass_grams) {
  return { item_id, template_id: `${item_id}-template`, quantity: 1,
    state: { inventory_profile_snapshot: { mass_grams, external_hand_cost: 0,
      carry_form: 'compact' } }, anchor_id: null, container_id,
    holder_npc_id: null, holder_character_id: null, physical_position: null,
    equipment_slot_category_id: null };
}

function withPlacement(item) {
  return { ...item, placement: { anchor_id: item.anchor_id,
    container_id: item.container_id, holder_npc_id: item.holder_npc_id,
    holder_character_id: item.holder_character_id,
    physical_position: item.physical_position,
    equipment_slot_category_id: item.equipment_slot_category_id } };
}

function containerPlacement(container) {
  return { container_id: container.container_id,
    parent_container_id: container.parent_container_id, anchor_id: container.anchor_id,
    holder_npc_id: container.holder_npc_id,
    holder_character_id: container.holder_character_id,
    physical_position: container.physical_position,
    equipment_slot_category_id: container.equipment_slot_category_id };
}
