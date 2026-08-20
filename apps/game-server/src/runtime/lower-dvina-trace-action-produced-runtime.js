import { resolveInventoryMechanicsProfile } from '@rus/items-property';
import {
  fail,
  plain,
  requireProjection,
  text
} from './lower-dvina-trace-turn-step-runtime-common.js';
import {
  applyInventoryTransition,
  matchesItem,
  requireProjectedItem
} from './lower-dvina-trace-turn-step-item-support.js';

export function applyActionProducedRuntimeProjection({ workingProjection,
  actor, plan, state, resolveItemMechanics }) {
  requireProjection(workingProjection);
  if (!plain(plan) || !Array.isArray(plan.source_updates)
      || !Array.isArray(plan.result_items)) {
    fail('TRACE_TURN_STEP_ACTION_PRODUCTION_PLAN_INVALID');
  }
  let next = structuredClone(workingProjection);
  for (const update of plan.source_updates) {
    const itemId = text(update?.item_id);
    const current = requireProjectedItem(next, itemId);
    const runtime = state.entities.get(itemId);
    const beforeMechanics = runtime?.mechanics
      ?? resolveItemMechanics?.(itemId);
    if (!plain(beforeMechanics)) {
      fail('TRACE_TURN_STEP_RUNTIME_ENTITY_REQUIRED', { entity_ref: itemId });
    }
    const retired = update.after_item?.state?.lifecycle_status === 'retired';
    const afterSnapshot = retired ? null : update.after_item?.state
      ?.runtime_instance_mechanics_snapshot ?? runtime?.snapshot ?? null;
    const afterMechanics = afterSnapshot?.mechanics ?? beforeMechanics;
    next = applyInventoryTransition({ projection: next, actor,
      beforePlacement: current.placement ?? {},
      afterPlacement: retired ? null : current.placement ?? {},
      beforeMechanics, afterMechanics: retired ? null : afterMechanics,
      itemRef: itemId, state });
    if (retired) {
      next.items = next.items.filter((item) => !matchesItem(item, itemId));
      state.entities.delete(itemId);
      state.materializedItems.delete(itemId);
      state.authoredItems.delete(itemId);
      state.retiredEntities.add(itemId);
      continue;
    }
    const metadata = update.after_item.state?.ordinary_metadata;
    const projected = {
      ...current,
      template_id: update.after_item.template_id,
      profile_id: update.after_item.profile_id,
      category_id: update.after_item.category_id
        ?? metadata?.semantic_type ?? current.category_id,
      name: metadata?.name ?? current.name,
      semantic_type: metadata?.semantic_type ?? current.semantic_type,
      quantity: update.after_item.quantity,
      condition_state: update.after_item.condition_state,
      legal_status: update.after_item.legal_status
    };
    next.items = next.items.map((item) => matchesItem(item, itemId)
      ? projected : item);
    state.entities.set(itemId, runtimeEntity(itemId, update.after_item.state));
    state.materializedItems.set(itemId, {
      ...structuredClone(update.after_item), item_id: itemId,
      placement: structuredClone(current.placement ?? {})
    });
    state.authoredItems.delete(itemId);
  }
  for (const result of plan.result_items) {
    const itemId = text(result?.item_id);
    const row = result?.item_row;
    const placement = result?.placement_row;
    if (!itemId || !plain(row) || !plain(placement)
        || (next.items ?? []).some((item) => matchesItem(item, itemId))) {
      fail('TRACE_TURN_STEP_ACTION_PRODUCTION_PLAN_INVALID');
    }
    const runtime = runtimeEntity(itemId, row.state);
    const metadata = row.state?.ordinary_metadata;
    const projected = {
      item_id: itemId, instance_id: itemId,
      template_id: row.template_id, profile_id: row.profile_id,
      category_id: row.category_id ?? metadata?.semantic_type ?? null,
      name: metadata?.name ?? null,
      semantic_type: metadata?.semantic_type ?? null, quantity: row.quantity,
      quantity_unit_id: runtime.mechanics.quantity?.unit,
      condition_state: row.condition_state, legal_status: row.legal_status,
      placement: structuredClone(placement)
    };
    next.items = [...(next.items ?? []), projected];
    next = applyInventoryTransition({ projection: next, actor,
      beforePlacement: null, afterPlacement: placement,
      beforeMechanics: null, afterMechanics: runtime.mechanics,
      itemRef: itemId, state });
    state.entities.set(itemId, runtime);
    state.materializedItems.set(itemId, {
      ...structuredClone(row), item_id: itemId,
      placement: structuredClone(placement)
    });
  }
  return next;
}

function runtimeEntity(itemId, itemState) {
  const snapshot = itemState?.runtime_instance_mechanics_snapshot;
  const metadata = itemState?.ordinary_metadata;
  const resolved = resolveInventoryMechanicsProfile({
    instance: { template_id: null,
      runtime_instance_mechanics_snapshot: snapshot }, profiles: {}
  });
  if (!resolved.pass || resolved.source !== 'runtime_instance_snapshot') {
    fail('TRACE_TURN_STEP_ACTION_PRODUCTION_PLAN_INVALID');
  }
  return {
    instance_id: itemId, mechanics: structuredClone(resolved.snapshot.mechanics),
    snapshot: structuredClone(resolved.snapshot),
    semantic_type: text(metadata?.semantic_type) || null,
    name: text(metadata?.name) || null,
    origin_kind: resolved.snapshot.provenance.origin_kind,
    source_refs: [...resolved.snapshot.provenance.source_refs]
  };
}
