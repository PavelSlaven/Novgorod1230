import { isDeepStrictEqual } from 'node:util';
import { calculatePackingSlots } from '@rus/items-property';
import { validateCommittedInventoryState } from
  '../../runtime/lower-dvina-trace-committed-inventory.js';
import { fail } from './lower-dvina-trace-turn-step-persistence-support.js';

export function validateFinalTurnStepInventory(snapshot) {
  let validation;
  try {
    validation = validateCommittedInventoryState(snapshot, {
      packingCalculator: calculatePackingSlots
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
