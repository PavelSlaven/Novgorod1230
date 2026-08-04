import {
  applyRuntimeContainerAccess,
  planRuntimeContainerAccess
} from '@rus/items-property';
import {
  applied,
  collectCurrentRefs,
  directFragment,
  fail,
  nextOperationIdentity,
  requireProjection,
  requireRef,
  visibleConsequence
} from './lower-dvina-trace-turn-step-runtime-common.js';

const SAFE_ITEM_KEYS = new Set([
  'item_id', 'instance_id', 'template_id', 'profile_id', 'category_id',
  'name', 'quantity', 'quantity_unit_id', 'condition_state', 'legal_status',
  'claim_state', 'placement', 'ownership', 'access_state',
  'visibility_state', 'open_state', 'closure_state', 'contents_state',
  'contents', 'visible', 'is_visible'
]);

export function createContainerAccessHandler(state) {
  return (execution) => requestContainerAccess(execution, state);
}

function requestContainerAccess(execution, state) {
  const { operation, working_projection: projection } = execution;
  requireProjection(projection);
  const refs = collectCurrentRefs(execution);
  requireRef(operation.actor_ref, refs, 'actor_ref');
  requireRef(operation.container_ref, refs, 'container_ref');
  if (operation.actor_ref !== projection.actor_id) {
    fail('TRACE_TURN_STEP_CONTAINER_ACTOR_MISMATCH');
  }
  const canonical = state.materializedItems.get(operation.container_ref);
  const visible = (projection.items ?? []).find((item) =>
    itemRef(item) === operation.container_ref);
  if (!canonical || !visible) {
    fail('TRACE_TURN_STEP_CONTAINER_NOT_VISIBLE', {
      container_ref: operation.container_ref
    });
  }
  const plan = planRuntimeContainerAccess({
    container: { ...structuredClone(canonical), ...structuredClone(visible) },
    access_kind: operation.access_kind,
    check_result: execution.check_result
  });
  if (!plan.pass) failIssue(plan.errors[0]);
  const transitioned = applyRuntimeContainerAccess({
    visible_items: projection.items ?? [],
    materialized_items: [...state.materializedItems.values()],
    plan,
    project_item: playerSafeItem
  });
  if (!transitioned.pass) failIssue(transitioned.errors[0]);
  const next = structuredClone(projection);
  next.items = transitioned.items;
  const stored = state.materializedItems.get(operation.container_ref);
  state.materializedItems.set(operation.container_ref, {
    ...stored,
    ...(plan.state_patch ?? {}),
    ...(stored?.state == null ? {} : {
      state: { ...stored.state, ...(plan.state_patch ?? {}) }
    })
  });
  const identity = nextOperationIdentity(execution, state);
  return applied({
    projection: next,
    summary: `container_access:${operation.container_ref}`,
    fragment: directFragment(identity, 'party_items', {
      container_ref: operation.container_ref,
      access_kind: operation.access_kind,
      state_patch: plan.state_patch,
      revealed_refs: transitioned.revealed_refs
    }),
    consequence: visibleConsequence(identity, {
      change: 'container_accessed',
      container_ref: operation.container_ref,
      revealed_refs: transitioned.revealed_refs
    })
  });
}

function playerSafeItem(item) {
  return Object.fromEntries(Object.entries(item)
    .filter(([key, value]) => SAFE_ITEM_KEYS.has(key) && value !== undefined)
    .map(([key, value]) => [key, structuredClone(value)]));
}

function itemRef(item) {
  return item?.item_id ?? item?.instance_id ?? item?.container_id;
}

function failIssue(issue) {
  fail(issue?.code ?? 'ITEM_RUNTIME_CONTAINER_ACCESS_INVALID',
    issue?.details ?? {});
}
