import { computeSpatialV3CanonicalDigest as digest } from
  '@rus/contracts/spatial-v3/registry';
import { createActionProducedAtomicWritePlan } from
  './action-produced-atomic-write-plan.js';
import { actionProducedText as text } from
  './action-produced-persistence-boundary.js';
import { lockAndVerifyActionProducedContext } from
  './action-produced-persistence-context.js';
import { lockAndVerifyPreparedActionProducedPin } from
  './action-produced-prepared-ordinary-persistence.js';

export async function applyActionProducedAtomicWritePlanInTransaction({
  client, input, p16ChangeSetId, partyStateVersionAfter
}) {
  const plan = createActionProducedAtomicWritePlan(input);
  if (plan.change_set_id !== p16ChangeSetId
      || partyStateVersionAfter !== plan.base_party_state_version + 1) {
    fail('ACTION_PRODUCED_P16_BINDING_INVALID');
  }

  await lockAndVerifyActionProducedContext(client, plan);
  await lockAndVerifyPins(client, plan);
  await rejectOutputCollisions(client, plan);
  for (const update of plan.source_updates) {
    if (update.finite_resource_transition != null) {
      await applyResourceTransition(client, plan, update, p16ChangeSetId);
    }
    const changed = await client.query(
      `UPDATE party_runtime.party_items
       SET run_id=$1,template_id=$2,profile_id=$3,category_id=$4,
         quantity=$5,condition_state=$6,legal_status=$7,state=$8::jsonb,
         state_version=$9
       WHERE party_id=$10 AND item_id=$11 AND state_version=$12`,
    [update.after_item.run_id, update.after_item.template_id,
      update.after_item.profile_id, update.after_item.category_id,
      update.after_item.quantity, update.after_item.condition_state,
      update.after_item.legal_status, JSON.stringify(update.after_item.state),
      update.after_item.state_version, plan.party_id, update.item_id,
      update.expected_item_state_version]);
    if (changed.rowCount !== 1) fail('ACTION_PRODUCED_SOURCE_STALE');
  }
  for (const result of plan.result_items) {
    await insertResult(client, plan.party_id, result);
  }
  return Object.freeze({ replay: false });
}

async function lockAndVerifyPins(client, plan) {
  const pins = [...plan.source_pins, ...plan.tool_pins];
  for (const pin of pins) {
    if (pin.prepared_ordinary != null) {
      await lockAndVerifyPreparedActionProducedPin(client, plan, pin);
      continue;
    }
    const selected = await client.query(
      `SELECT i.item_id,i.run_id,i.template_id,i.profile_id,i.category_id,
         i.quantity,i.condition_state,i.legal_status,i.state,i.state_version,
         p.anchor_id,p.container_id,p.holder_npc_id,p.holder_character_id,
         p.physical_position,p.equipment_slot_category_id,p.attached_item_id,
         o.ownership_id,o.owner_npc_id,o.owner_character_id,o.owner_party,
         o.controller_npc_id,o.controller_character_id,o.claim_state
       FROM party_runtime.party_items i
       JOIN party_runtime.party_item_placements p
         ON p.party_id=i.party_id AND p.item_id=i.item_id
       JOIN party_runtime.party_ownership o
         ON o.party_id=i.party_id AND o.item_id=i.item_id
       WHERE i.party_id=$1 AND i.item_id=$2
       FOR UPDATE OF i,p,o`, [plan.party_id, pin.item_id]);
    if (selected.rows.length !== 1) fail('ACTION_PRODUCED_SOURCE_STALE');
    const normalized = normalizedRows(selected.rows[0]);
    if (!accessibleByActor(normalized.placement, normalized.ownership,
      plan.actor_ref)
        || digest(normalized.item) !== pin.item_digest
        || digest(normalized.placement) !== pin.placement_digest
        || digest(normalized.ownership) !== pin.ownership_digest) {
      fail(pin.role === 'tool'
        ? 'ACTION_PRODUCED_TOOL_STALE' : 'ACTION_PRODUCED_SOURCE_STALE');
    }
    if (pin.finite_resource_row != null) {
      const resource = await client.query(
        `SELECT resource_node_id,source_resource_ref,quantity_numerator,
           quantity_denominator,quantity_unit_ref,lifecycle_state,state_version,
           position_node_id,property_basis_ref
         FROM party_runtime.party_resource_nodes
         WHERE party_id=$1 AND resource_node_id=$2 FOR UPDATE`,
      [plan.party_id, pin.finite_resource_row.resource_node_id]);
      if (resource.rows.length !== 1
          || digest(normalizedResource(resource.rows[0]))
            !== digest(pin.finite_resource_row)) {
        fail('ACTION_PRODUCED_RESOURCE_STALE');
      }
    }
  }
}

function accessibleByActor(placement, ownership, actorRef) {
  const owners = Number(text(ownership.owner_character_id))
    + Number(text(ownership.owner_npc_id))
    + Number(ownership.owner_party === true);
  return placement.holder_character_id === actorRef
    && placement.holder_npc_id === null
    && ownership.controller_character_id === actorRef
    && ownership.controller_npc_id === null
    && owners === 1 && typeof ownership.owner_party === 'boolean'
    && text(ownership.claim_state);
}

async function rejectOutputCollisions(client, plan) {
  if (plan.result_items.length === 0) return;
  const ids = plan.result_items.map(({ item_id }) => item_id);
  const collision = await client.query(
    `SELECT item_id FROM party_runtime.party_items
     WHERE party_id=$1 AND item_id=ANY($2::text[]) FOR UPDATE`,
  [plan.party_id, ids]);
  if (collision.rows.length !== 0) fail('ACTION_PRODUCED_OUTPUT_COLLISION');
}

async function applyResourceTransition(client, plan, update, changeSetId) {
  const transition = update.finite_resource_transition;
  const changed = await client.query(
    `UPDATE party_runtime.party_resource_nodes
     SET quantity_numerator=$1,quantity_denominator=$2,lifecycle_state=$3,
       retired_by_causal_identity=CASE WHEN $3='depleted' THEN $4 ELSE NULL END,
       updated_change_set_id=$5,state_version=state_version+1
     WHERE party_id=$6 AND resource_node_id=$7 AND state_version=$8
       AND lifecycle_state='active'`,
  [transition.after_quantity.numerator, transition.after_quantity.denominator,
    transition.lifecycle_state_after, transition.causal_transition_identity,
    changeSetId, plan.party_id, transition.source_resource_node_id,
    transition.expected_state_version]);
  if (changed.rowCount !== 1) fail('ACTION_PRODUCED_RESOURCE_STALE');
}

async function insertResult(client, partyId, result) {
  const item = result.item_row;
  await client.query(
    `INSERT INTO party_runtime.party_items
      (party_id,item_id,run_id,template_id,profile_id,category_id,quantity,
       condition_state,legal_status,state,state_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
  [partyId, result.item_id, item.run_id, item.template_id, item.profile_id,
    item.category_id, item.quantity, item.condition_state, item.legal_status,
    JSON.stringify(item.state), item.state_version]);
  const placement = result.placement_row;
  await client.query(
    `INSERT INTO party_runtime.party_item_placements
      (party_id,item_id,anchor_id,container_id,holder_npc_id,
       holder_character_id,physical_position,equipment_slot_category_id,
       attached_item_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
  [partyId, result.item_id, placement.anchor_id, placement.container_id,
    placement.holder_npc_id, placement.holder_character_id,
    placement.physical_position, placement.equipment_slot_category_id,
    placement.attached_item_id]);
  const ownership = result.ownership_row;
  await client.query(
    `INSERT INTO party_runtime.party_ownership
      (party_id,ownership_id,item_id,container_id,owner_npc_id,
       owner_character_id,owner_party,controller_npc_id,
       controller_character_id,claim_state)
     VALUES ($1,$2,$3,NULL,$4,$5,$6,$7,$8,$9)`,
  [partyId, ownership.ownership_id, result.item_id,
    ownership.owner_npc_id, ownership.owner_character_id,
    ownership.owner_party, ownership.controller_npc_id,
    ownership.controller_character_id, ownership.claim_state]);
}

function normalizedRows(row) {
  return {
    item: {
      item_id: row.item_id, run_id: row.run_id,
      template_id: row.template_id, profile_id: row.profile_id,
      category_id: row.category_id, quantity: Number(row.quantity),
      condition_state: row.condition_state, legal_status: row.legal_status,
      state: row.state, state_version: Number(row.state_version)
    },
    placement: {
      anchor_id: row.anchor_id, container_id: row.container_id,
      holder_npc_id: row.holder_npc_id,
      holder_character_id: row.holder_character_id,
      physical_position: row.physical_position,
      equipment_slot_category_id: row.equipment_slot_category_id,
      attached_item_id: row.attached_item_id
    },
    ownership: {
      ownership_id: row.ownership_id, owner_npc_id: row.owner_npc_id,
      owner_character_id: row.owner_character_id,
      owner_party: row.owner_party,
      controller_npc_id: row.controller_npc_id,
      controller_character_id: row.controller_character_id,
      claim_state: row.claim_state
    }
  };
}

function normalizedResource(row) {
  return {
    resource_node_id: row.resource_node_id,
    source_resource_ref: row.source_resource_ref,
    quantity_numerator: Number(row.quantity_numerator),
    quantity_denominator: Number(row.quantity_denominator),
    quantity_unit_ref: row.quantity_unit_ref,
    lifecycle_state: row.lifecycle_state,
    state_version: Number(row.state_version),
    position_node_id: row.position_node_id,
    property_basis_ref: row.property_basis_ref
  };
}
function fail(code) {
  throw Object.assign(new Error(code), { code });
}
