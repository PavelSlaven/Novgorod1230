import { deepFreeze, sha256 } from '@rus/kernel';
import {
  runtimeItemContentsAreOpen,
  runtimeItemRecordIsConcealed,
  runtimeItemStateValues
} from './runtime-item-visibility.js';

const ACCESS_KINDS = new Set([
  'open', 'close', 'unlock', 'force', 'open_and_view'
]);
const SUCCESS_BANDS = new Set([
  'clean_success', 'success', 'success_with_cost'
]);
const DENIED_ACCESS_STATES = new Set([
  'denied', 'forbidden', 'inaccessible', 'restricted', 'unavailable'
]);

/**
 * Plans a formal access transition for an already materialized container.
 * Hidden contents are data inputs; this owner never invents them.
 */
export function planRuntimeContainerAccess({ container, access_kind: accessKind,
  check_result: checkResult = null } = {}) {
  const containerRef = itemRef(container);
  if (!containerRef || !ACCESS_KINDS.has(accessKind)) {
    return failed('ITEM_RUNTIME_CONTAINER_ACCESS_INVALID');
  }
  if (runtimeItemRecordIsConcealed(container, { includeAccess: false })) {
    return failed('ITEM_RUNTIME_CONTAINER_NOT_VISIBLE', {
      container_ref: containerRef
    });
  }
  if (accessKind === 'close') {
    return planned(containerRef, {
      open_state: 'closed', contents_state: 'contents_hidden'
    }, false);
  }
  const accessStates = runtimeItemStateValues(
    container.open_state,
    container.closure_state,
    container.access_state,
    container.state?.access_state
  );
  const locked = accessStates.includes('locked');
  if (!locked && accessStates.some((state) =>
    DENIED_ACCESS_STATES.has(state))) {
    return failed('ITEM_RUNTIME_CONTAINER_ACCESS_DENIED', {
      container_ref: containerRef
    });
  }
  if (locked && !SUCCESS_BANDS.has(checkResult?.outcome?.band)) {
    return failed('ITEM_RUNTIME_CONTAINER_CHECK_REQUIRED', {
      container_ref: containerRef
    }, 'check_required');
  }
  if (['unlock', 'force'].includes(accessKind) && checkResult == null) {
    return failed('ITEM_RUNTIME_CONTAINER_CHECK_REQUIRED', {
      container_ref: containerRef
    }, 'check_required');
  }
  if (runtimeItemContentsAreOpen(container)
      && ['open', 'open_and_view'].includes(accessKind)) {
    return planned(containerRef, null, true);
  }
  return planned(containerRef, {
    open_state: 'open',
    contents_state: 'known',
    access_state: { access: 'open' }
  }, true);
}

export function applyRuntimeContainerAccess({ visible_items: visibleItems,
  materialized_items: materializedItems, plan, project_item: projectItem } = {}) {
  if (!plan?.pass || !text(plan.container_ref)
      || !Array.isArray(visibleItems) || !Array.isArray(materializedItems)) {
    return failed('ITEM_RUNTIME_CONTAINER_ACCESS_PLAN_INVALID');
  }
  const byRef = new Map(materializedItems.map((item) => [itemRef(item), item])
    .filter(([ref]) => ref));
  const canonicalContainer = byRef.get(plan.container_ref);
  const visibleContainer = visibleItems.find((item) =>
    itemRef(item) === plan.container_ref);
  if (!canonicalContainer || !visibleContainer) {
    return failed('ITEM_RUNTIME_CONTAINER_NOT_VISIBLE', {
      container_ref: plan.container_ref
    });
  }
  const nextContainer = plan.state_patch == null
    ? structuredClone(visibleContainer)
    : mergeContainerState(visibleContainer, plan.state_patch);
  const next = visibleItems.filter((item) =>
    plan.reveal_contents
    || !containedBy(itemRef(item), plan.container_ref, byRef, new Set()))
    .map((item) => itemRef(item) === plan.container_ref
      ? nextContainer : structuredClone(item));
  const present = new Set(next.map(itemRef).filter(Boolean));
  const revealed = [];
  if (plan.reveal_contents) {
    for (const item of materializedItems) {
      const ref = itemRef(item);
      if (!ref || present.has(ref)
          || placement(item)?.container_id !== plan.container_ref
          || runtimeItemRecordIsConcealed(item, { includeAccess: false })) {
        continue;
      }
      const projected = typeof projectItem === 'function'
        ? projectItem(structuredClone(item)) : structuredClone(item);
      if (!plain(projected)) {
        return failed('ITEM_RUNTIME_CONTAINER_CONTENT_PROJECTION_INVALID', {
          entity_ref: ref
        });
      }
      next.push(structuredClone(projected));
      present.add(ref);
      revealed.push(ref);
    }
  }
  return deepFreeze({
    pass: true,
    items: next,
    container: nextContainer,
    revealed_refs: revealed,
    errors: []
  });
}

export function admitAuthoredItemPlacementTransition({ item,
  placement } = {}) {
  const ref = itemRef(item);
  if (!ref || !text(item?.template_id) || !plain(placement)) {
    return failed('ITEM_AUTHORED_PLACEMENT_TRANSITION_INVALID', {
      entity_ref: ref || null
    });
  }
  return deepFreeze({
    pass: true,
    entity_ref: ref,
    transition_kind: 'placement_only',
    placement: structuredClone(placement),
    ownership: item.ownership == null
      ? null : structuredClone(item.ownership),
    errors: []
  });
}

export function authoredItemPlacementSourceProof(item) {
  const identity = {
    item_id: itemRef(item),
    template_id: text(item?.template_id),
    profile_id: item?.profile_id == null ? null : text(item.profile_id)
  };
  if (!identity.item_id || !identity.template_id
      || item?.profile_id != null && !identity.profile_id) return null;
  return deepFreeze({
    ...identity,
    source_digest: sha256({
      ...identity,
      placement: item?.placement ?? null,
      ownership: item?.ownership ?? null,
      mechanics: item?.inventory_profile
        ?? item?.state?.inventory_profile_snapshot ?? null
    })
  });
}

function mergeContainerState(container, patch) {
  return {
    ...structuredClone(container),
    ...structuredClone(patch),
    ...(plain(container.state) || plain(patch.state) ? {
      state: {
        ...(plain(container.state) ? structuredClone(container.state) : {}),
        ...(plain(patch.state) ? structuredClone(patch.state) : {})
      }
    } : {})
  };
}

function planned(containerRef, statePatch, revealContents) {
  return deepFreeze({
    pass: true,
    disposition: 'granted',
    container_ref: containerRef,
    state_patch: statePatch == null ? null : structuredClone(statePatch),
    reveal_contents: revealContents,
    errors: []
  });
}

function failed(code, details = {}, disposition = 'denied') {
  return deepFreeze({
    pass: false,
    disposition,
    container_ref: details.container_ref ?? null,
    state_patch: null,
    reveal_contents: false,
    errors: [deepFreeze({
      code,
      category: disposition === 'check_required' ? 'check' : 'access',
      retryable: false,
      message: code,
      details: structuredClone(details)
    })]
  });
}

function placement(item) {
  return plain(item?.placement) ? item.placement : item;
}

function containedBy(ref, containerRef, byRef, seen) {
  if (!ref || seen.has(ref)) return false;
  seen.add(ref);
  const host = placement(byRef.get(ref))?.container_id;
  if (!host) return false;
  return host === containerRef || containedBy(host, containerRef, byRef, seen);
}

function itemRef(item) {
  return text(item?.item_id ?? item?.instance_id ?? item?.container_id);
}

function text(value) {
  return typeof value === 'string' && value.trim() === value && value
    ? value : '';
}

function plain(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
