import { fail, requireMechanics } from
  './lower-dvina-trace-turn-step-persistence-support.js';

export function runtimeEntities(items) {
  const result = new Map();
  for (const source of items) {
    const item = structuredClone(source);
    const snapshot = item.runtime_instance_mechanics_snapshot
      ?? item.state?.runtime_instance_mechanics_snapshot;
    const runtime = item.template_id == null || snapshot != null;
    if (!runtime) continue;
    if (item.template_id != null || item.profile_id != null
        || item.category_id != null || snapshot == null) {
      fail('TRACE_TURN_STEP_MIXED_ITEM_SOURCE', { entity_ref: item.item_id });
    }
    const mechanics = requireMechanics(snapshot);
    const dbState = structuredClone(item.state ?? {});
    dbState.lifecycle_status ??= 'active';
    dbState.runtime_instance_mechanics_snapshot = mechanics;
    dbState.ordinary_metadata ??= {};
    dbState.ordinary_metadata.semantic_type ??=
      item.state?.semantic_category ?? 'ordinary_runtime';
    dbState.ordinary_metadata.name ??= item.name ?? item.item_id;
    dbState.ordinary_metadata.origin ??= {
      kind: mechanics.provenance.origin_kind,
      source_refs: mechanics.provenance.source_refs
    };
    dbState.ordinary_metadata.semantic_facts ??=
      structuredClone(item.semantic_facts ?? []);
    dbState.ordinary_metadata.operation_history ??= [];
    item.runtime_instance_mechanics_snapshot = mechanics;
    item.db_state = dbState;
    item.state = dbState;
    item.quantity ??= databaseQuantity();
    if (item.quantity !== 1) fail('TRACE_TURN_STEP_ITEM_INSTANCE_INVALID', {
      entity_ref: item.item_id,
      reason: 'party_items.quantity must represent one runtime instance'
    });
    item.condition_state ??= 'ordinary_runtime_instance';
    item.legal_status ??= 'unowned_ordinary_runtime';
    item.lifecycle_status = dbState.lifecycle_status;
    item.created_in_batch = false;
    result.set(item.item_id, item);
  }
  return result;
}

export function physicalPlacement(value) {
  return {
    anchor_id: value.anchor_id ?? null,
    container_id: value.container_id ?? null,
    holder_npc_id: value.holder_npc_id ?? null,
    holder_character_id: value.holder_character_id ?? null,
    physical_position: value.physical_position ?? null,
    equipment_slot_category_id:
      value.equipment_slot_category_id ?? null,
    attached_item_id: value.attached_item_id ?? null
  };
}

export function itemRecord(partyId, entity) {
  const record = {
    party_id: partyId,
    item_id: entity.item_id,
    quantity: entity.quantity,
    condition_state: entity.condition_state,
    legal_status: entity.legal_status,
    state: entity.db_state
  };
  if (entity.created_in_batch) Object.assign(record, {
    run_id: null, template_id: null, profile_id: null, category_id: null
  });
  return record;
}

export function mergeKnowledge(current = [], added = []) {
  const byId = new Map(current.map((entry) =>
    [entry.fact_id, structuredClone(entry)]));
  for (const entry of added) {
    if (byId.has(entry.fact_id)) fail('TRACE_TURN_STEP_FACT_REF_CONFLICT', {
      fact_ref: entry.fact_id
    });
    byId.set(entry.fact_id, structuredClone(entry));
  }
  return [...byId.values()].sort((left, right) =>
    left.fact_id.localeCompare(right.fact_id));
}

export function databaseQuantity() {
  return 1;
}
