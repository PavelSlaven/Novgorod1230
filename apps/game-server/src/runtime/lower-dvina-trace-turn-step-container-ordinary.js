import {
  buildExistingContainerOrdinarySeedRequest,
  classifyExistingContainerContents
} from '@rus/items-property';
import { fail } from './lower-dvina-trace-turn-step-runtime-common.js';
import { applyInventoryTransition, ordinaryContainerRuntimeEntity } from
  './lower-dvina-trace-turn-step-item-support.js';
export function snapshotO2bCommittedContainerInput(value) {
  if (value == null) return null;
  const snapshot = shallowDescriptorSnapshot(value);
  if (snapshot == null) return null;
  for (const key of ['items','containers']) {
    if (snapshot[key] == null) continue;
    const values = shallowArraySnapshot(snapshot[key]);
    if (values == null) return null;
    const safe = [];
    for (const value of values) {
      if (value == null || typeof value !== 'object' || Array.isArray(value)) {
        safe.push(value);
        continue;
      }
      const shallow = shallowDescriptorSnapshot(value);
      if (shallow == null) return null;
      const context = key === 'containers'
        || Object.getOwnPropertyDescriptor(
          shallow, 'ordinary_contents_context')?.value != null;
      const copied = context ? descriptorSnapshot(value) : shallow;
      if (copied == null) return null;
      safe.push(copied);
    }
    snapshot[key] = safe;
  }
  return snapshot;
}
export function snapshotContainerValue(value) {
  return descriptorSnapshot(value);
}
export async function resolveOrdinaryContents({ canonical, revealContents,
  state, options, execution, projection }) {
  const context = canonical?.ordinary_contents_context
    ?? canonical?.state?.ordinary_contents_context;
  if (context == null || ['resolved_concealed','known'].includes(
    canonical.contents_state ?? canonical.state?.contents_state)) return null;
  if (!sameContext(context, canonical)) {
    fail('TRACE_TURN_STEP_CONTAINER_ORDINARY_CONTEXT_INVALID');
  }
  const classification = classifyExistingContainerContents({
    container: { container_ref: itemRef(canonical),
      commit_state: canonical.commit_state, template_id: canonical.template_id,
      mechanics_profile_ref: canonical.mechanics_profile_ref },
    access: { pass: true }, ordinary_policy: context.ordinary_policy,
    authoritative_contents: { status: context.authoritative_status }
  });
  if (!classification.pass) failIssue(classification.errors[0]);
  if (classification.route === 'authoritative') return null;
  if (typeof options.ordinaryContainerContentsResolver !== 'function') {
    fail('TRACE_TURN_STEP_CONTAINER_ORDINARY_RESOLVER_REQUIRED');
  }
  const request = buildExistingContainerOrdinarySeedRequest({
    container_context: {
      container_ref: context.container_ref, template_id: context.template_id,
      mechanics_profile_ref: context.mechanics_profile_ref,
      owner_controller_ref: context.owner_controller_ref,
      property_ref: context.property_ref,
      site_function_ref: context.site_function_ref,
      economic_context_ref: context.economic_context_ref,
      context_bound_permission_refs: context.context_bound_permission_refs,
      ordinary_policy: context.ordinary_policy
    },
    prior_resolutions: Array.isArray(canonical.ordinary_content_resolutions)
      ? canonical.ordinary_content_resolutions : []
  });
  if (request == null) {
    fail('TRACE_TURN_STEP_CONTAINER_ORDINARY_CONTEXT_INVALID');
  }
  let resolved;
  try {
    resolved = descriptorSnapshot(await options.ordinaryContainerContentsResolver({
      stage_a_request:request, operation_identity:{
        root_turn_id:execution.request?.root_turn_id,
        step_index:execution.request?.step_index,
        operation_ref:`${revealContents ? 'request_container_access'
          : 'move_entity'}:${itemRef(canonical)}`,
        resolution_mode:revealContents ? 'reveal' : 'concealed'
      }
    }));
  } catch {
    fail('TRACE_TURN_STEP_CONTAINER_ORDINARY_RESOLUTION_FAILED');
  }
  if (!exact(resolved, ['pass','materialized_items',
    'ordinary_materialization_atomic_write_plan','errors'])
      || !Array.isArray(resolved.materialized_items)
      || !Array.isArray(resolved.errors)) {
    fail('TRACE_TURN_STEP_CONTAINER_ORDINARY_RESOLUTION_INVALID');
  }
  if (resolved.pass !== true) failIssue(resolved.errors[0]);
  const plan = resolved.ordinary_materialization_atomic_write_plan;
  if (!ordinaryPlanMatches(plan, itemRef(canonical),
    resolved.materialized_items, revealContents)) {
    fail('TRACE_TURN_STEP_CONTAINER_ORDINARY_RESOLUTION_INVALID');
  }
  if (plan == null) return null;
  const children = resolved.materialized_items.map((item) => {
    const normalized = ordinaryChild(item, itemRef(canonical));
    if (normalized == null) {
      fail('TRACE_TURN_STEP_CONTAINER_ORDINARY_CHILD_INVALID');
    }
    return normalized;
  });
  const ids = new Set(children.map(({ item_id: id }) => id));
  if (ids.size !== children.length || children.some(({ item_id: id }) =>
    state.materializedItems.has(id) || state.entities.has(id))) {
    fail('TRACE_TURN_STEP_CONTAINER_ORDINARY_CHILD_COLLISION');
  }
  const runtimeChildren = children.map((child) =>
    ordinaryContainerRuntimeEntity(child,
      plan.items.find(({ item_id }) => item_id === child.item_id)));
  const containerRef = itemRef(canonical);
  const storedContainer = state.materializedItems.get(containerRef);
  const storedAuthored = state.authoredContainers.get(containerRef);
  let next = structuredClone(projection);
  try {
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      const runtime = runtimeChildren[index];
      state.materializedItems.set(child.item_id, child);
      state.entities.set(child.item_id, runtime);
      if (carriedBy(canonical, projection.actor_id)) {
        next = applyInventoryTransition({projection:next,
          actor:execution.request.actor,beforePlacement:null,
          afterPlacement:child.placement,beforeMechanics:null,
          afterMechanics:runtime.mechanics,itemRef:child.item_id,state});
      }
    }
    const patch = plan.container_transition.state_patch;
    const updated = {...storedContainer,...structuredClone(patch),
      ...(storedContainer?.state == null ? {} : {state:{
        ...storedContainer.state,...structuredClone(patch)}})};
    state.materializedItems.set(containerRef, updated);
    if (storedAuthored != null) state.authoredContainers.set(containerRef, updated);
  } catch (error) {
    children.forEach(({item_id}) => {
      state.materializedItems.delete(item_id);
      state.entities.delete(item_id);
    });
    state.materializedItems.set(containerRef, storedContainer);
    if (storedAuthored != null) {
      state.authoredContainers.set(containerRef, storedAuthored);
    }
    throw error;
  }
  return {plan,working_projection:next};
}
function ordinaryPlanMatches(plan, containerRef, materializedItems,
  revealContents) {
  if (plan === null && materializedItems.length === 0) return true;
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)
      || plan.schema !== 'ordinary_container_contents_atomic_write_plan_v2'
      || typeof plan.write_plan_digest !== 'string' || !plan.write_plan_digest
      || !exact(plan.scope_ref, ['entity_kind','entity_id'])
      || plan.scope_ref.entity_kind !== 'container'
      || plan.scope_ref.entity_id !== containerRef || !Array.isArray(plan.items)
      || !exact(plan.container_transition,
        ['access_kind','state_patch','revealed_refs'])) return false;
  const childIds = materializedItems.map((item) => item?.item_id).sort();
  const planIds = plan.items.map((item) => item?.item_id).sort();
  const transition = plan.container_transition;
  if (revealContents
    ? transition.access_kind !== 'open_and_view'
      || transition.revealed_refs.length !== childIds.length
    : transition.access_kind !== 'resolve_concealed'
      || transition.revealed_refs.length !== 0) return false;
  return childIds.length === planIds.length
    && childIds.every((id, index) => typeof id === 'string'
      && id && id === planIds[index])
    && (!revealContents || [...transition.revealed_refs].sort()
      .every((id, index) => id === childIds[index]));
}
function ordinaryChild(value, containerRef) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || Object.getOwnPropertySymbols(value).length > 0) return null;
  const keys = ['item_id','semantic_type','name','authority','disclosure',
    'admission_class','is_container','evidence','authentic_document',
    'hidden_history','secret_cache','placement'];
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== keys.length
      || keys.some((key) => !names.includes(key))) return null;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      return null;
    }
  }
  if (typeof value.item_id !== 'string' || !value.item_id
      || typeof value.semantic_type !== 'string' || !value.semantic_type
      || typeof value.name !== 'string' || !value.name
      || value.authority !== 'ordinary' || value.disclosure !== 'concealed'
      || value.admission_class !== 'common_mundane'
      || value.is_container !== false || value.evidence !== false
      || value.authentic_document !== false || value.hidden_history !== false
      || value.secret_cache !== false
      || !exact(value.placement, ['container_id'])
      || value.placement.container_id !== containerRef) return null;
  return structuredClone(value);
}
function sameContext(context, canonical) {
  return context?.container_ref === itemRef(canonical)
    && context?.template_id === canonical.template_id
    && context?.mechanics_profile_ref === canonical.mechanics_profile_ref;
}
function exact(value, keys) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.getOwnPropertySymbols(value).length === 0
    && Object.getOwnPropertyNames(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function descriptorSnapshot(value) {
  const seen = new WeakSet();
  function copy(input) {
    if (input === null || typeof input === 'string'
        || typeof input === 'boolean') return input;
    if (typeof input === 'number') return Number.isFinite(input) ? input : null;
    if (!input || typeof input !== 'object' || seen.has(input)
        || Object.getOwnPropertySymbols(input).length > 0) return null;
    const array = Array.isArray(input);
    if (array && Object.getPrototypeOf(input) !== Array.prototype
        || !array && Object.getPrototypeOf(input) !== Object.prototype) {
      return null;
    }
    seen.add(input);
    const names = Object.getOwnPropertyNames(input);
    if (array && (names.length !== input.length + 1
        || !names.includes('length'))) return null;
    const out = array ? [] : {};
    for (const key of names) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
        return null;
      }
      const child = copy(descriptor.value);
      if (child === null && descriptor.value !== null) return null;
      if (array) {
        if (key !== String(out.length)) return null;
        out.push(child);
      } else out[key] = child;
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
    || typeof value === 'number' && Number.isFinite(value);
}

function itemRef(item) {
  return item?.item_id ?? item?.instance_id ?? item?.container_id;
}

function carriedBy(item, actorId) {
  return (item?.placement ?? item)?.holder_character_id === actorId;
}

function failIssue(issue) {
  fail(issue?.code ?? 'ITEM_RUNTIME_CONTAINER_ACCESS_INVALID',
    issue?.details ?? {});
}
