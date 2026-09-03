import { canonicalDigest } from '@rus/materialization';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';
import { assertTurnStepSemanticActivityRows } from
  './lower-dvina-trace-turn-step-activity-read.js';
import { assertTurnStepBodyHistoryRows } from
  './lower-dvina-trace-turn-step-body-read.js';

export async function assertTurnStepNormalizedRows(pool, payload, headRow) {
  await assertTurnStepRuntimeItemRows(pool, payload);
  await assertTurnStepAuthoredItemRows(pool, payload);
  await assertTurnStepAuthoredContainerRows(pool, payload);
  await assertTurnStepSemanticActivityRows(pool, payload);
  await assertTurnStepBodyHistoryRows(pool, payload, headRow);
}

async function assertTurnStepAuthoredContainerRows(pool, payload) {
  const expected = authoredContainersTouchedByLastBatch(payload);
  if (expected.length === 0) return;
  const result = await pool.query(
    `SELECT c.container_id,c.run_id,c.template_id,c.anchor_id,
            c.parent_container_id,c.holder_npc_id,c.holder_character_id,
            c.physical_position,c.equipment_slot_category_id,
            c.condition_state,c.closure_state,c.state,c.state_version,
            o.ownership_id,o.owner_npc_id,o.owner_character_id,
            o.controller_npc_id,o.controller_character_id,o.claim_state
       FROM party_runtime.party_containers c
       LEFT JOIN party_runtime.party_ownership o
         ON o.party_id=c.party_id AND o.container_id=c.container_id
      WHERE c.party_id=$1 AND c.container_id = ANY($2::text[])
      ORDER BY c.container_id`,
    [payload.party_id,
      expected.map(({ container_id: containerId }) => containerId)]
  );
  const actual = result.rows.map(containerRowProof);
  if (canonicalDigest(actual) !== canonicalDigest(expected)) {
    throw phase2IntegrityError();
  }
}

/** Only authored items changed by the last committed batch are restart-bound. */
export async function assertTurnStepAuthoredItemRows(pool, payload) {
  const expected = authoredItemsTouchedByLastBatch(payload);
  if (expected.length === 0) return;
  const result = await pool.query(
    `SELECT i.item_id,i.run_id,i.template_id,i.profile_id,i.category_id,
            i.quantity,i.condition_state,i.legal_status,i.state,
            p.item_id AS placement_item_id,p.anchor_id,p.scene_position_id,
            p.container_id,
            p.holder_npc_id,p.holder_character_id,p.physical_position,
            p.equipment_slot_category_id,p.attached_item_id,
            o.ownership_id,o.owner_npc_id,o.owner_character_id,
            o.controller_npc_id,o.controller_character_id,o.claim_state
       FROM party_runtime.party_items i
       LEFT JOIN party_runtime.party_item_placements p
         ON p.party_id=i.party_id AND p.item_id=i.item_id
       LEFT JOIN party_runtime.party_ownership o
         ON o.party_id=i.party_id AND o.item_id=i.item_id
      WHERE i.party_id=$1 AND i.item_id = ANY($2::text[])
      ORDER BY i.item_id`,
    [payload.party_id, expected.map(({ item_id: itemId }) => itemId)]
  );
  const actual = result.rows.map(authoredItemRowProof);
  if (canonicalDigest(actual) !== canonicalDigest(expected)) {
    throw phase2IntegrityError();
  }
}

/**
 * A v2 snapshot is a restart cache, not an alternative item store. Runtime
 * instances therefore have to agree exactly with both normalized item rows
 * and their one physical placement row, including terminal lifecycle state.
 */
export async function assertTurnStepRuntimeItemRows(pool, payload) {
  const result = await pool.query(
    `SELECT i.item_id,i.run_id,i.template_id,i.profile_id,i.category_id,
            i.quantity,i.condition_state,i.legal_status,i.state,
            p.item_id AS placement_item_id,p.anchor_id,p.scene_position_id,
            p.container_id,
            p.holder_npc_id,p.holder_character_id,p.physical_position,
            p.equipment_slot_category_id,p.attached_item_id
       FROM party_runtime.party_items i
       LEFT JOIN party_runtime.party_item_placements p
         ON p.party_id=i.party_id AND p.item_id=i.item_id
      WHERE i.party_id=$1
        AND (i.template_id IS NULL
          OR i.state ? 'runtime_instance_mechanics_snapshot')
      ORDER BY i.item_id`,
    [payload.party_id]
  );
  const expected = runtimeItems(payload.items ?? []);
  const actual = result.rows.map(itemProof);
  if (canonicalDigest(actual) !== canonicalDigest(expected)) {
    throw phase2IntegrityError();
  }
}

function runtimeItems(items) {
  return items.filter((item) => {
    const mechanics = item?.runtime_instance_mechanics_snapshot
      ?? item?.state?.runtime_instance_mechanics_snapshot;
    return item?.template_id == null && mechanics != null;
  }).map((item) => {
    const lifecycle = item.state?.lifecycle_status;
    if (!['active', 'retired'].includes(lifecycle)
        || (lifecycle === 'retired') !== (item.condition_state === 'retired')) {
      throw phase2IntegrityError();
    }
    return {
      item_id: item.item_id,
      run_id: null,
      template_id: null,
      profile_id: null,
      category_id: null,
      quantity: Number(item.quantity),
      condition_state: item.condition_state,
      legal_status: item.legal_status,
      state: structuredClone(item.state),
      placement: placementProof(item.placement)
    };
  }).sort((left, right) => left.item_id.localeCompare(right.item_id));
}

function authoredItemsTouchedByLastBatch(payload) {
  const byRef = new Map((payload.items ?? []).map((item) => [
    item.item_id ?? item.instance_id, item
  ]));
  const touched = new Set();
  const operations = payload.last_turn?.turn_step_operation_batch?.operations
    ?? [];
  for (const fragment of operations) {
    if (fragment?.target !== 'party_items') continue;
    const { operation_kind: kind, payload: operation = {} } = fragment.value
      ?? {};
    const ref = kind === 'move_entity' && operation.authored_source != null
      ? operation.entity_ref
      : kind === 'request_container_access'
        ? operation.container_ref : null;
    if (ref != null && byRef.get(ref)?.template_id != null) touched.add(ref);
  }
  return [...touched].map((ref) => authoredItemProof(byRef.get(ref)))
    .sort((left, right) => left.item_id.localeCompare(right.item_id));
}

function authoredContainersTouchedByLastBatch(payload) {
  const byRef = new Map((payload.containers ?? []).map((container) => [
    container.container_id, container
  ]));
  const touched = new Set();
  const operations = payload.last_turn?.turn_step_operation_batch?.operations
    ?? [];
  for (const fragment of operations) {
    if (fragment?.target !== 'party_containers') continue;
    const operation = fragment.value?.payload ?? {};
    const ref = fragment.value?.operation_kind === 'move_entity'
      && operation.authored_source != null
      ? operation.entity_ref : null;
    if (ref != null && byRef.has(ref)) touched.add(ref);
  }
  return [...touched].map((ref) => containerProof(byRef.get(ref)))
    .sort((left, right) => left.container_id.localeCompare(
      right.container_id));
}

function authoredItemProof(item) {
  if (item?.template_id == null) throw phase2IntegrityError();
  return {
    item_id: item.item_id ?? item.instance_id,
    run_id: item.run_id ?? null,
    template_id: item.template_id,
    profile_id: item.profile_id ?? null,
    category_id: item.category_id ?? null,
    quantity: Number(item.quantity),
    condition_state: item.condition_state ?? null,
    legal_status: item.legal_status ?? null,
    state: structuredClone(item.state ?? {}),
    placement: placementProof(item.placement),
    ownership: ownershipProof(item.ownership)
  };
}

function authoredItemRowProof(row) {
  return {
    ...itemProof(row),
    ownership: ownershipProof(row)
  };
}

function itemProof(row) {
  if (row.placement_item_id !== row.item_id
      && !(row.placement_item_id == null
        && row.state?.lifecycle_status === 'retired')) {
    throw phase2IntegrityError();
  }
  return {
    item_id: row.item_id,
    run_id: row.run_id,
    template_id: row.template_id,
    profile_id: row.profile_id,
    category_id: row.category_id,
    quantity: Number(row.quantity),
    condition_state: row.condition_state,
    legal_status: row.legal_status,
    state: structuredClone(row.state),
    placement: placementProof(row)
  };
}

function placementProof(value = {}) {
  value ??= {};
  return {
    anchor_id: value.anchor_id ?? null,
    ...(value.scene_position_id == null ? {} : {
      scene_position_id: value.scene_position_id
    }),
    container_id: value.container_id ?? null,
    holder_npc_id: value.holder_npc_id ?? null,
    holder_character_id: value.holder_character_id ?? null,
    physical_position: value.physical_position ?? null,
    equipment_slot_category_id: value.equipment_slot_category_id ?? null,
    attached_item_id: value.attached_item_id ?? null
  };
}

function ownershipProof(value = {}) {
  return {
    ownership_id: value.ownership_id ?? null,
    owner_npc_id: value.owner_npc_id ?? null,
    owner_character_id: value.owner_character_id ?? null,
    controller_npc_id: value.controller_npc_id ?? null,
    controller_character_id: value.controller_character_id ?? null,
    claim_state: value.claim_state ?? null
  };
}

function containerProof(container) {
  return {
    container_id: container.container_id,
    run_id: container.run_id ?? null,
    template_id: container.template_id,
    anchor_id: container.anchor_id ?? null,
    parent_container_id: container.parent_container_id ?? null,
    holder_npc_id: container.holder_npc_id ?? null,
    holder_character_id: container.holder_character_id ?? null,
    physical_position: container.physical_position ?? null,
    equipment_slot_category_id:
      container.equipment_slot_category_id ?? null,
    condition_state: container.condition_state ?? null,
    closure_state: container.closure_state ?? null,
    state: structuredClone(container.state ?? {}),
    state_version: Number(container.state_version),
    ownership: ownershipProof(container.ownership)
  };
}

function containerRowProof(row) {
  return {
    container_id: row.container_id,
    run_id: row.run_id,
    template_id: row.template_id,
    anchor_id: row.anchor_id,
    parent_container_id: row.parent_container_id,
    holder_npc_id: row.holder_npc_id,
    holder_character_id: row.holder_character_id,
    physical_position: row.physical_position,
    equipment_slot_category_id: row.equipment_slot_category_id,
    condition_state: row.condition_state,
    closure_state: row.closure_state,
    state: structuredClone(row.state),
    state_version: Number(row.state_version),
    ownership: ownershipProof(row)
  };
}
