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
  writes, authoredItems, authoredContainers, authoredStateTouched,
  placements, ownerships, partyId, changeSetId
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
    if (ownerships.has(itemId)) {
      const ownership = item.ownership;
      if (!ownership?.ownership_id) {
        fail('TRACE_TURN_STEP_AUTHORED_OWNERSHIP_INVALID', {
          entity_ref: itemId
        });
      }
      writes.updates.push(row('party_ownership', ownership.ownership_id, {
        ...structuredClone(ownership),
        party_id: partyId,
        ownership_id: ownership.ownership_id,
        item_id: itemId
      }));
    }
  }
  for (const container of authoredContainers) {
    const containerId = container.item_id;
    if (authoredStateTouched.has(containerId)
        || placements.has(containerId)) {
      writes.updates.push(row('party_containers', containerId, {
        party_id: partyId, container_id: containerId,
        condition_state: container.condition_state ?? null,
        closure_state: container.closure_state ?? null,
        state: structuredClone(container.state ?? {}),
        anchor_id: container.placement.anchor_id ?? null,
        parent_container_id: container.placement.container_id ?? null,
        holder_npc_id: container.placement.holder_npc_id ?? null,
        holder_character_id:
          container.placement.holder_character_id ?? null,
        physical_position: container.placement.physical_position ?? null,
        equipment_slot_category_id:
          container.placement.equipment_slot_category_id ?? null,
        state_version: container.state_version,
        updated_change_set_id: changeSetId
      }));
    }
    if (ownerships.has(containerId)) {
      const ownership = container.ownership;
      if (!ownership?.ownership_id) {
        fail('TRACE_TURN_STEP_AUTHORED_OWNERSHIP_INVALID', {
          entity_ref: containerId
        });
      }
      writes.updates.push(row('party_ownership', ownership.ownership_id, {
        ...structuredClone(ownership), party_id: partyId,
        ownership_id: ownership.ownership_id,
        item_id: null, container_id: containerId
      }));
    }
  }
}
