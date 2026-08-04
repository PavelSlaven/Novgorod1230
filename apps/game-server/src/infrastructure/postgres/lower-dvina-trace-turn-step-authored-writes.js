import { row } from './first-playable/plan-shared.js';
import { physicalPlacement } from
  './lower-dvina-trace-turn-step-item-state.js';
import { authoredItemPlacementSourceProof } from '@rus/items-property';
import { fail } from './lower-dvina-trace-turn-step-persistence-support.js';

export function requireAuthoredSourceProof(item, proof) {
  const expected = authoredItemPlacementSourceProof(item);
  if (!expected || JSON.stringify(proof) !== JSON.stringify(expected)) {
    fail('TRACE_TURN_STEP_AUTHORED_SOURCE_PROOF_INVALID', {
      entity_ref: item?.item_id ?? item?.instance_id ?? null
    });
  }
}

export function appendAuthoredTurnStepWrites({
  writes, authoredItems, authoredStateTouched, placements, partyId
}) {
  for (const item of authoredItems) {
    const itemId = item.item_id ?? item.instance_id;
    if (authoredStateTouched.has(itemId) || placements.has(itemId)) {
      writes.updates.push(row('party_items', itemId, {
        party_id: partyId,
        item_id: itemId,
        quantity: item.quantity,
        condition_state: item.condition_state,
        legal_status: item.legal_status,
        state: structuredClone(item.state ?? {})
      }));
    }
    if (placements.has(itemId)) {
      writes.updates.push(row('party_item_placements', itemId, {
        party_id: partyId,
        item_id: itemId,
        ...physicalPlacement(item.placement)
      }));
    }
  }
}
