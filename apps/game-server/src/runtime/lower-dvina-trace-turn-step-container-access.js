import {
  applyRuntimeContainerAccess,
  buildExistingContainerOrdinarySeedRequest,
  classifyExistingContainerContents,
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

export function createContainerAccessHandler(state, options = {}) {
  return (execution) => requestContainerAccess(execution, state, options);
}

export function snapshotO2bCommittedContainerInput(value) {
  if (value == null) return null;
  const snapshot = shallowDescriptorSnapshot(value); if (snapshot == null) return null;
  if (snapshot.items == null) return snapshot;
  const items = shallowArraySnapshot(snapshot.items); if (items == null) return null;
  const safeItems = [];
  for (const item of items) {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) {
      safeItems.push(item);
      continue;
    }
    const shallowItem = shallowDescriptorSnapshot(item);
    if (shallowItem == null) return null;
    const context = Object.getOwnPropertyDescriptor(
      shallowItem, 'ordinary_contents_context')?.value;
    if (context == null) {
      safeItems.push(shallowItem);
      continue;
    }
    const strictItem = descriptorSnapshot(item); if (strictItem == null) return null;
    safeItems.push(strictItem);
  }
  snapshot.items = safeItems; return snapshot;
}

async function requestContainerAccess(execution, state, options) {
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
  const committed = descriptorSnapshot(canonical);
  if (committed == null) fail('TRACE_TURN_STEP_CONTAINER_ORDINARY_CONTEXT_INVALID');
  const plan = planRuntimeContainerAccess({
    container: { ...committed, ...structuredClone(visible) },
    access_kind: operation.access_kind,
    check_result: execution.check_result
  });
  if (!plan.pass) failIssue(plan.errors[0]);
  const ordinaryPlan = await resolveOrdinaryContents({
    canonical: committed, plan, state, options, execution
  });
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
    fragment: ordinaryPlan == null
      ? directFragment(identity, 'party_items', {
        container_ref: operation.container_ref,
        access_kind: operation.access_kind,
        state_patch: plan.state_patch,
        revealed_refs: transitioned.revealed_refs
      }) : null,
    ordinaryPlan,
    consequence: visibleConsequence(identity, {
      change: 'container_accessed',
      container_ref: operation.container_ref,
      revealed_refs: transitioned.revealed_refs
    })
  });
}

async function resolveOrdinaryContents({ canonical, plan, state, options,
  execution }) {
  const context = canonical?.ordinary_contents_context;
  if (context == null || plan.reveal_contents !== true) return null;
  if (!sameContext(context, canonical)) fail('TRACE_TURN_STEP_CONTAINER_ORDINARY_CONTEXT_INVALID');
  const classification = classifyExistingContainerContents({
    container: { container_ref: itemRef(canonical), commit_state: canonical.commit_state,
      template_id: canonical.template_id, mechanics_profile_ref: canonical.mechanics_profile_ref },
    access: { pass: true }, ordinary_policy: context.ordinary_policy,
    authoritative_contents: { status: context.authoritative_status }
  });
  if (!classification.pass) failIssue(classification.errors[0]);
  if (classification.route === 'authoritative') return null;
  if (typeof options.ordinaryContainerContentsResolver !== 'function') {
    fail('TRACE_TURN_STEP_CONTAINER_ORDINARY_RESOLVER_REQUIRED');
  }
  const request = buildExistingContainerOrdinarySeedRequest({ container_context: {
    container_ref: context.container_ref, template_id: context.template_id,
    mechanics_profile_ref: context.mechanics_profile_ref,
    owner_controller_ref: context.owner_controller_ref, property_ref: context.property_ref,
    site_function_ref: context.site_function_ref,
    economic_context_ref: context.economic_context_ref,
    context_bound_permission_refs: context.context_bound_permission_refs,
    ordinary_policy: context.ordinary_policy },
    prior_resolutions: Array.isArray(canonical.ordinary_content_resolutions)
      ? canonical.ordinary_content_resolutions : [] });
  if (request == null) fail('TRACE_TURN_STEP_CONTAINER_ORDINARY_CONTEXT_INVALID');
  let resolved;
  try { resolved = descriptorSnapshot(await options.ordinaryContainerContentsResolver({
    stage_a_request:request, operation_identity:{
      root_turn_id:execution.request?.root_turn_id,
      step_index:execution.request?.step_index,
      operation_ref:`request_container_access:${itemRef(canonical)}` }
  })); }
  catch { fail('TRACE_TURN_STEP_CONTAINER_ORDINARY_RESOLUTION_FAILED'); }
  if (!exact(resolved, ['pass','materialized_items',
    'ordinary_materialization_atomic_write_plan','errors'])
      || !Array.isArray(resolved.materialized_items) || !Array.isArray(resolved.errors)) {
    fail('TRACE_TURN_STEP_CONTAINER_ORDINARY_RESOLUTION_INVALID');
  }
  if (resolved.pass !== true) failIssue(resolved.errors[0]);
  const ordinaryPlan = resolved.ordinary_materialization_atomic_write_plan;
  if (!ordinaryPlanMatches(ordinaryPlan, itemRef(canonical),
    resolved.materialized_items)) {
    fail('TRACE_TURN_STEP_CONTAINER_ORDINARY_RESOLUTION_INVALID');
  }
  const children = [];
  for (const item of resolved.materialized_items) {
    const normalized = ordinaryChild(item, itemRef(canonical));
    if (normalized == null) fail('TRACE_TURN_STEP_CONTAINER_ORDINARY_CHILD_INVALID');
    children.push(normalized);
  }
  const ids = new Set(children.map(({ item_id: id }) => id));
  if (ids.size !== children.length || children.some(({ item_id: id }) => state.materializedItems.has(id))) {
    fail('TRACE_TURN_STEP_CONTAINER_ORDINARY_CHILD_COLLISION');
  }
  for (const child of children) state.materializedItems.set(child.item_id, child);
  return ordinaryPlan;
}

function ordinaryPlanMatches(plan, containerRef, materializedItems) {
  if (plan === null && materializedItems.length === 0) return true;
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)
      || plan.schema !== 'ordinary_container_contents_atomic_write_plan_v2'
      || typeof plan.write_plan_digest !== 'string' || !plan.write_plan_digest
      || !exact(plan.scope_ref, ['entity_kind','entity_id'])
      || plan.scope_ref.entity_kind !== 'container'
      || plan.scope_ref.entity_id !== containerRef
      || !Array.isArray(plan.items)) return false;
  const childIds = materializedItems.map((item) => item?.item_id).sort();
  const planIds = plan.items.map((item) => item?.item_id).sort();
  return childIds.length === planIds.length
    && childIds.every((id, index) => typeof id === 'string'
      && id && id === planIds[index]);
}

function ordinaryChild(value, containerRef) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || Object.getOwnPropertySymbols(value).length > 0) return null;
  const keys = ['item_id','semantic_type','authority','disclosure','admission_class',
    'is_container','evidence','authentic_document','hidden_history','secret_cache','placement'];
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== keys.length || keys.some((key) => !names.includes(key))) return null;
  for (const key of keys) { const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d?.enumerable || !Object.hasOwn(d, 'value')) return null; }
  if (typeof value.item_id !== 'string' || !value.item_id || typeof value.semantic_type !== 'string'
      || !value.semantic_type || value.authority !== 'ordinary'
      || value.disclosure !== 'concealed' || value.admission_class !== 'common_mundane'
      || value.is_container !== false || value.evidence !== false
      || value.authentic_document !== false || value.hidden_history !== false
      || value.secret_cache !== false || !exact(value.placement, ['container_id'])
      || value.placement.container_id !== containerRef) return null;
  return structuredClone(value);
}

function sameContext(context, canonical) {
  return context?.container_ref === itemRef(canonical)
    && context?.template_id === canonical.template_id
    && context?.mechanics_profile_ref === canonical.mechanics_profile_ref;
}
function exact(value, keys) { return value != null && typeof value === 'object'
  && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
  && Object.getOwnPropertySymbols(value).length === 0
  && Object.getOwnPropertyNames(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key)); }
function descriptorSnapshot(value) {
  const seen = new WeakSet();
  function copy(input) {
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
    if (typeof input === 'number') return Number.isFinite(input) ? input : null;
    if (!input || typeof input !== 'object' || seen.has(input)
        || Object.getOwnPropertySymbols(input).length > 0) return null;
    const array = Array.isArray(input);
    if ((array && Object.getPrototypeOf(input) !== Array.prototype)
        || (!array && Object.getPrototypeOf(input) !== Object.prototype)) return null;
    seen.add(input); const names = Object.getOwnPropertyNames(input);
    if (array && (names.length !== input.length + 1 || !names.includes('length'))) return null;
    const out = array ? [] : {};
    for (const key of names) { if (array && key === 'length') continue;
      const d = Object.getOwnPropertyDescriptor(input, key);
      if (!d?.enumerable || !Object.hasOwn(d, 'value')) return null;
      const child = copy(d.value); if (child === null && d.value !== null) return null;
      if (array) { if (key !== String(out.length)) return null; out.push(child); }
      else out[key] = child;
    }
    return out;
  }
  return copy(value);
}

function shallowDescriptorSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || Object.getOwnPropertySymbols(value).length > 0) return null;
  const out = {};
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')
        || !shallowValueIsCloneable(descriptor.value)) return null;
    out[key] = descriptor.value;
  }
  return out;
}

function shallowArraySnapshot(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
      || Object.getOwnPropertySymbols(value).length > 0) return null;
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== value.length + 1 || !names.includes('length')) return null;
  const out = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')
        || !shallowValueIsCloneable(descriptor.value)) return null;
    out.push(descriptor.value);
  }
  return out;
}

function shallowValueIsCloneable(value) {
  return value == null || typeof value === 'object'
    || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value));
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
