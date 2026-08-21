import { isDeepStrictEqual } from 'node:util';
import { calculatePackingSlots } from '@rus/items-property';
import { validateCommittedInventoryState } from
  '../../runtime/lower-dvina-trace-committed-inventory.js';
import { fail } from './lower-dvina-trace-turn-step-persistence-support.js';

export function validateFinalTurnStepInventory(snapshot, committedSnapshot) {
  let validation;
  try {
    validation = validateCommittedInventoryState(snapshot, {
      packingCalculator: calculatePackingSlots,
      skipContainerUsage: !containerCapacityEvidenceChanged(
        snapshot, committedSnapshot)
    });
  } catch (cause) {
    fail('TRACE_TURN_STEP_FINAL_INVENTORY_INVALID', {
      cause: cause?.code ?? cause?.message
    });
  }
  if (!validation.pass) {
    const error = validation.errors[0];
    fail(error?.code ?? 'TRACE_TURN_STEP_FINAL_INVENTORY_INVALID', {
      category: error?.category ?? 'data_gap',
      ...(error?.details ?? {})
    });
  }
}

function containerCapacityEvidenceChanged(state, committed) {
  return !isDeepStrictEqual(
    containerCapacityEvidence(state),
    containerCapacityEvidence(committed)
  );
}

function containerCapacityEvidence(state) {
  return {
    items: (state.items ?? []).map((item) => ({
      item_id: item.item_id ?? item.instance_id,
      template_id: item.template_id ?? null,
      quantity: item.quantity ?? null,
      lifecycle_status: item.state?.lifecycle_status ?? null,
      inventory_profile: item.inventory_profile
        ?? item.state?.inventory_profile_snapshot ?? null,
      runtime_instance_mechanics_snapshot:
        item.runtime_instance_mechanics_snapshot
          ?? item.state?.runtime_instance_mechanics_snapshot ?? null,
      container_id: item.placement?.container_id ?? null
    })).sort(byId('item_id')),
    containers: (state.containers ?? []).map((container) => ({
      container_id: container.container_id,
      template_id: container.template_id ?? null,
      parent_container_id: container.parent_container_id
        ?? (state.container_placements ?? []).find(
          ({ container_id: id }) => id === container.container_id)
          ?.parent_container_id ?? null,
      inventory_profile: container.state?.inventory_profile_snapshot
        ?? container.state?.ordinary_contents_context
          ?.container_inventory_profile ?? null
    })).sort(byId('container_id')),
    container_profiles: state.container_profiles ?? [],
    container_compatibility: state.container_compatibility ?? []
  };
}

function byId(field) {
  return (left, right) => String(left[field]).localeCompare(String(right[field]));
}

export function requiresFinalTurnStepInventoryValidation({
  state,
  committedSnapshot,
  batch
}) {
  const itemOperations = batch.operations.filter(
    ({ target }) => target === 'party_items');
  if (itemOperations.length > 0 && !itemOperations.every(({ value }) =>
    value?.operation_kind === 'move_entity'
      && value.payload?.actor_transition?.schema
        === 'rus.approved_actor_item_transition.v1')) {
    return true;
  }
  const fields = [
    'actor_id', 'player_profile', 'position', 'items', 'containers',
    'container_placements', 'container_profiles', 'container_compatibility'
  ];
  return fields.some((field) => !isDeepStrictEqual(
    state[field],
    committedSnapshot[field]
  ));
}
