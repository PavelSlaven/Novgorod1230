import { createOrdinaryMaterializationAtomicWritePlan } from
  './ordinary-materialization-phase-6-commit.js';
import { createActionProducedAtomicWritePlan } from
  './action-produced-atomic-write-plan.js';
import { ordinaryContainerRuntimeItemState } from
  './ordinary-materialization-container-batch-item.js';
import { buildOrdinaryMaterializedRuntimeItem } from
  './ordinary-materialization-runtime-item.js';
import { failActionProducedPersistence as fail } from
  './action-produced-persistence-boundary.js';

export function actionProducedPreparedOrdinaryRows(input, requested) {
  if (input.prepared_ordinary_plan == null) return new Map();
  let plan;
  try {
    plan = createOrdinaryMaterializationAtomicWritePlan(
      input.prepared_ordinary_plan);
  } catch { fail('ACTION_PRODUCED_PREPARED_ITEM_INVALID'); }
  if (plan.party_id !== input.party_id
      || plan.expected_versions.party_state_version
        !== input.expected_party_state_version) {
    fail('ACTION_PRODUCED_PREPARED_ITEM_INVALID');
  }
  if (plan.schema === 'ordinary_materialization_atomic_write_plan_v1') {
    return preparedWorldRows(plan, input, requested);
  }
  if (plan.schema !== 'ordinary_container_contents_atomic_write_plan_v2') {
    fail('ACTION_PRODUCED_PREPARED_ITEM_INVALID');
  }
  const byId = new Map();
  for (const item of plan.items) {
    if (!requested.includes(item.item_id)) continue;
    const evidence = item.item_proposal.property_placement_evidence;
    const provenance = item.runtime_mechanics_snapshot.provenance;
    if (evidence.owner_controller_ref !== input.actor_ref
        || provenance.root_turn_id !== input.root_turn_id
        || !Number.isSafeInteger(provenance.step_index)
        || provenance.step_index >= input.step_index
        || !plan.container_transition.revealed_refs.includes(item.item_id)) {
      fail('ACTION_PRODUCED_ITEM_ACCESS_DENIED');
    }
    byId.set(item.item_id, {
      row: preparedRow(item, input,plan),
      preparedOrdinary: {
        schema: 'action_production_prepared_ordinary_pin_v1',
        request_identity: plan.request_identity,
        root_turn_id: provenance.root_turn_id,
        step_index: provenance.step_index
      }
    });
  }
  return byId;
}

function preparedWorldRows(plan, input, requested) {
  const item = plan.item;
  if (item == null || plan.resolution !== 'materialize'
      || plan.request_identity !== `${input.root_turn_id}:ordinary:presence`) {
    fail('ACTION_PRODUCED_PREPARED_ITEM_INVALID');
  }
  if (!requested.includes(item.item_id)) return new Map();
  let runtime;
  try {
    runtime = buildOrdinaryMaterializedRuntimeItem({
      partyId: input.party_id, item
    });
  } catch { fail('ACTION_PRODUCED_PREPARED_ITEM_INVALID'); }
  const record = runtime.item_record;
  const placement = runtime.placement_record;
  const ownership = runtime.ownership_record;
  return new Map([[item.item_id, {
    row: {
      ...structuredClone(record), state_version: 1,
      anchor_id: placement.anchor_id,
      item_scene_position_id: placement.scene_position_id,
      container_id: placement.container_id,
      holder_npc_id: placement.holder_npc_id,
      holder_character_id: placement.holder_character_id,
      physical_position: placement.physical_position,
      equipment_slot_category_id: placement.equipment_slot_category_id,
      attached_item_id: placement.attached_item_id,
      ownership_id: ownership.ownership_id,
      owner_npc_id: ownership.owner_npc_id,
      owner_character_id: ownership.owner_character_id,
      owner_party: ownership.owner_party,
      owner_external_ref: structuredClone(ownership.owner_external_ref),
      controller_npc_id: ownership.controller_npc_id,
      controller_character_id: ownership.controller_character_id,
      claim_state: ownership.claim_state
    },
    preparedOrdinary: {
      schema: 'action_production_prepared_ordinary_pin_v2',
      request_identity: plan.request_identity,
      root_turn_id: input.root_turn_id
    }
  }]]);
}

export function actionProducedPreparedActionRows(input) {
  const values = input.prepared_action_plans ?? [];
  if (!Array.isArray(values)) fail('ACTION_PRODUCED_PREPARED_ITEM_INVALID');
  const rows = new Map();
  const retired = new Set();
  let priorStep = 0;
  for (const value of values) {
    let plan;
    try { plan = createActionProducedAtomicWritePlan(value); }
    catch { fail('ACTION_PRODUCED_PREPARED_ITEM_INVALID'); }
    const causal = plan.transition_proposal.causal_identity;
    if (plan.party_id !== input.party_id
        || plan.base_party_state_version
          !== input.expected_party_state_version
        || plan.change_set_id !== input.change_set_id
        || causal.root_turn_id !== input.root_turn_id
        || causal.step_index <= priorStep
        || causal.step_index >= input.step_index) {
      fail('ACTION_PRODUCED_PREPARED_ITEM_INVALID');
    }
    priorStep = causal.step_index;
    for (const update of plan.source_updates) {
      const pin = plan.source_pins.find(({ item_id: id }) =>
        id === update.item_id);
      if (pin == null) fail('ACTION_PRODUCED_PREPARED_ITEM_INVALID');
      if (update.after_item.state?.lifecycle_status === 'retired') {
        rows.delete(update.item_id);
        retired.add(update.item_id);
        continue;
      }
      retired.delete(update.item_id);
      rows.set(update.item_id, preparedActionRow({
        item: update.after_item,
        placement: pin.placement,
        scenePlacement: pin.scene_placement ?? null,
        ownership: pin.ownership,
        finiteResourceRow: afterResourceRow(pin.finite_resource_row,
          update.finite_resource_transition),
        causal
      }));
    }
    for (const result of plan.result_items) {
      retired.delete(result.item_id);
      rows.set(result.item_id, preparedActionRow({
        item: { item_id: result.item_id, ...result.item_row },
        placement: result.placement_row,
        scenePlacement: plan.output_destination_pin?.destination_kind
          === 'party_current_scene_position' ? {
            position_node_id: plan.output_destination_pin.scene_position_id,
            occupies_capacity_units: 1, state_version: 1 } : null,
        ownership: result.ownership_row,
        finiteResourceRow: null,
        causal
      }));
    }
  }
  return { rows, retired };
}

export function actionProducedDestinationAfterPreparedActions(pin, values) {
  if (pin == null) return null;
  if (pin.destination_kind === 'party_current_scene_position') {
    let occupancy = pin.scene_occupancy;
    for (const raw of values ?? []) {
      let plan;
      try { plan = createActionProducedAtomicWritePlan(raw); }
      catch { fail('ACTION_PRODUCED_PREPARED_ITEM_INVALID'); }
      for (const update of plan.source_updates) {
        const source = plan.source_pins.find(({ item_id: id }) =>
          id === update.item_id);
        if (update.after_item.state?.lifecycle_status === 'retired'
            && source?.scene_placement?.position_node_id
              === pin.scene_position_id) {
          occupancy -= source.scene_placement.occupies_capacity_units;
        }
      }
      if (plan.output_destination_pin?.destination_kind
          === 'party_current_scene_position'
          && plan.output_destination_pin.scene_position_id
            === pin.scene_position_id) occupancy += plan.result_items.length;
    }
    if (occupancy < 0 || occupancy > pin.scene_capacity) {
      fail('ACTION_PRODUCED_DESTINATION_INVALID');
    }
    return { ...pin, scene_occupancy: occupancy };
  }
  const used = new Set(pin.used_item_ids);
  for (const raw of values ?? []) {
    let plan;
    try { plan = createActionProducedAtomicWritePlan(raw); }
    catch { fail('ACTION_PRODUCED_PREPARED_ITEM_INVALID'); }
    for (const update of plan.source_updates) {
      if (update.after_item.state?.lifecycle_status === 'retired') {
        used.delete(update.item_id);
      }
    }
    for (const result of plan.result_items) {
      if (result.placement_row.anchor_id === pin.anchor_id) {
        used.add(result.item_id);
      }
    }
  }
  if (used.size > pin.item_capacity) {
    fail('ACTION_PRODUCED_DESTINATION_INVALID');
  }
  return { ...pin, used_item_ids: [...used].sort() };
}

export function actionProducedDestinationAfterPreparedOrdinary(pin, raw) {
  if (pin == null || raw == null) return pin;
  let plan;
  try { plan = createOrdinaryMaterializationAtomicWritePlan(raw); }
  catch { fail('ACTION_PRODUCED_PREPARED_ITEM_INVALID'); }
  const item = plan.schema === 'ordinary_materialization_atomic_write_plan_v1'
    && plan.resolution === 'materialize' ? plan.item : null;
  if (item == null) return pin;
  if (pin.destination_kind === 'party_current_scene_position') {
    if (item.runtime_placement.scene_position_id !== pin.scene_position_id) {
      return pin;
    }
    const occupancy = pin.scene_occupancy + 1;
    if (occupancy > pin.scene_capacity) {
      fail('ACTION_PRODUCED_DESTINATION_INVALID');
    }
    return { ...pin, scene_occupancy: occupancy };
  }
  if (pin.destination_kind !== 'party_current_anchor'
      || item.runtime_placement.anchor_id !== pin.anchor_id) return pin;
  const used = [...new Set([...pin.used_item_ids, item.item_id])].sort();
  if (used.length > pin.item_capacity) {
    fail('ACTION_PRODUCED_DESTINATION_INVALID');
  }
  return { ...pin, used_item_ids: used };
}

function preparedActionRow({ item, placement, ownership,
  scenePlacement, finiteResourceRow, causal }) {
  return {
    row: { ...structuredClone(item), ...structuredClone(placement),
      ...structuredClone(ownership),
      ...(scenePlacement === null ? {} : {
        scene_position_id: scenePlacement.position_node_id,
        scene_occupies_capacity_units: scenePlacement.occupies_capacity_units,
        scene_state_version: scenePlacement.state_version }) },
    finiteResourceRow: structuredClone(finiteResourceRow),
    preparedAction: {
      schema: 'action_production_prepared_action_pin_v1',
      root_turn_id: causal.root_turn_id,
      step_index: causal.step_index
    }
  };
}

function afterResourceRow(row, transition) {
  if (transition == null) return row;
  return { ...row,
    quantity_numerator: transition.after_quantity.numerator,
    quantity_denominator: transition.after_quantity.denominator,
    lifecycle_state: transition.lifecycle_state_after,
    state_version: transition.next_state_version };
}

function preparedRow(item, input,plan) {
  const placement=plan.mechanics.inventory_input.container_placements.find(
    ({container_id:id})=>id===item.container_id);
  return {
    item_id: item.item_id, run_id: null, template_id: null,
    profile_id: null, category_id: null, quantity: 1,
    condition_state: item.condition_state,
    legal_status: 'ordinary_container_content',
    state: ordinaryContainerRuntimeItemState(item, input.change_set_id),
    state_version: 1, anchor_id: null, container_id: item.container_id,
    holder_npc_id: null, holder_character_id: null,
    physical_position: null, equipment_slot_category_id: null,
    attached_item_id: null, ownership_id: `ownership:${item.item_id}`,
    owner_npc_id: null, owner_character_id: input.actor_ref,
    owner_party: false, controller_npc_id: null,
    controller_character_id: input.actor_ref, claim_state: 'owned',
    container_anchor_id:placement?.anchor_id??null,
    container_parent_container_id:placement?.parent_container_id??null,
    container_holder_npc_id:placement?.holder_npc_id??null,
    container_holder_character_id:placement?.holder_character_id??null,
    container_physical_position:placement?.physical_position??null,
    container_closure_state:'open',
    container_state_version:plan.container_pin.state_version+1
  };
}
