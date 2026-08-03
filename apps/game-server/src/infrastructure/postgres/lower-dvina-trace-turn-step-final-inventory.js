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
