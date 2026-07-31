import { canonicalDigest } from '@rus/materialization';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';

const TEMPLATE_IDS = Object.freeze([
  'trace_ld_v1_item_fishing_net',
  'trace_ld_v1_item_carry_poles',
  'trace_ld_v1_item_eremey_drinking_water_vessel'
]);

export async function loadPhase5ArrivalResourceRows(pool, partyId) {
  return pool.query(
    `SELECT i.item_id,i.template_id,i.profile_id,i.category_id,i.quantity,
            i.condition_state,i.legal_status,i.state,
            p.anchor_id,p.container_id,p.holder_npc_id,
            p.holder_character_id,p.physical_position,
            p.equipment_slot_category_id,
            o.ownership_id,o.owner_npc_id,o.owner_character_id,
            o.owner_external_ref,o.owner_party,o.controller_npc_id,
            o.controller_character_id,o.claim_state
       FROM party_runtime.party_items i
       JOIN party_runtime.party_item_placements p
         ON p.party_id=i.party_id AND p.item_id=i.item_id
       JOIN party_runtime.party_ownership o
         ON o.party_id=i.party_id AND o.item_id=i.item_id
      WHERE i.party_id=$1 AND i.template_id=ANY($2::text[])
      ORDER BY i.template_id`, [partyId, TEMPLATE_IDS]
  );
}

export function assertPhase5ArrivalResourceRows({ payload, movementHistory,
  rows }) {
  const phase5Bound = payload.items.some(
    ({ template_id: id }) => id === 'trace_ld_v1_item_bandage_cloth'
  );
  if (movementHistory.length === 0 || !phase5Bound) return;
  const expected = payload.items.filter(
    ({ template_id: id }) => TEMPLATE_IDS.includes(id)
  ).sort((left, right) => left.template_id.localeCompare(right.template_id));
  const actual = rows.map((entry) => ({
    item_id: entry.item_id,
    template_id: entry.template_id,
    profile_id: entry.profile_id,
    category_id: entry.category_id,
    quantity: Number(entry.quantity),
    condition_state: entry.condition_state,
    legal_status: entry.legal_status,
    placement: {
      anchor_id: entry.anchor_id,
      container_id: entry.container_id,
      holder_npc_id: entry.holder_npc_id,
      holder_character_id: entry.holder_character_id,
      physical_position: entry.physical_position,
      equipment_slot_category_id: entry.equipment_slot_category_id
    },
    ownership: {
      ownership_id: entry.ownership_id,
      owner_npc_id: entry.owner_npc_id,
      owner_character_id: entry.owner_character_id,
      owner_external_ref: entry.owner_external_ref,
      owner_party: entry.owner_party,
      controller_npc_id: entry.controller_npc_id,
      controller_character_id: entry.controller_character_id,
      claim_state: entry.claim_state
    },
    state: entry.state
  }));
  if (expected.length !== TEMPLATE_IDS.length
      || canonicalDigest(actual) !== canonicalDigest(expected)) {
    throw phase2IntegrityError();
  }
}
