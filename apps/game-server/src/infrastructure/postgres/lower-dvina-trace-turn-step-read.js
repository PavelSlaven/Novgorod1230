import { canonicalDigest } from '@rus/materialization';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';
import { assertTurnStepSemanticActivityRows } from
  './lower-dvina-trace-turn-step-activity-read.js';
import { assertTurnStepBodyHistoryRows } from
  './lower-dvina-trace-turn-step-body-read.js';

export async function assertTurnStepNormalizedRows(pool, payload, headRow) {
  await assertTurnStepRuntimeItemRows(pool, payload);
  await assertTurnStepAuthoredItemRows(pool, payload);
  await assertTurnStepSemanticActivityRows(pool, payload);
  await assertTurnStepBodyHistoryRows(pool, payload, headRow);
}

/** Only authored items changed by the last committed batch are restart-bound. */
export async function assertTurnStepAuthoredItemRows(pool, payload) {
  const expected = authoredItemsTouchedByLastBatch(payload);
  if (expected.length === 0) return;
  const result = await pool.query(
    `SELECT i.item_id,i.run_id,i.template_id,i.profile_id,i.category_id,
            i.quantity,i.condition_state,i.legal_status,i.state,
            p.item_id AS placement_item_id,p.anchor_id,p.container_id,
            p.holder_npc_id,p.holder_character_id,p.physical_position,
            p.equipment_slot_category_id,p.attached_item_id
       FROM party_runtime.party_items i
       LEFT JOIN party_runtime.party_item_placements p
         ON p.party_id=i.party_id AND p.item_id=i.item_id
      WHERE i.party_id=$1 AND i.item_id = ANY($2::text[])
      ORDER BY i.item_id`,
    [payload.party_id, expected.map(({ item_id: itemId }) => itemId)]
  );
  const actual = result.rows.map(itemProof);
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
            p.item_id AS placement_item_id,p.anchor_id,p.container_id,
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
    placement: placementProof(item.placement)
  };
}

function itemProof(row) {
  if (row.placement_item_id !== row.item_id) throw phase2IntegrityError();
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
  return {
    anchor_id: value.anchor_id ?? null,
    container_id: value.container_id ?? null,
    holder_npc_id: value.holder_npc_id ?? null,
    holder_character_id: value.holder_character_id ?? null,
    physical_position: value.physical_position ?? null,
    equipment_slot_category_id: value.equipment_slot_category_id ?? null,
    attached_item_id: value.attached_item_id ?? null
  };
}
