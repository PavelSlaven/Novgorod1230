import { deepFreeze } from '@rus/kernel';

const CONTEXT = ['container_ref', 'template_id', 'mechanics_profile_ref',
  'owner_controller_ref', 'property_ref', 'site_function_ref',
  'economic_context_ref', 'context_bound_permission_refs', 'ordinary_policy'];

// The request is intentionally independent of a player operation.  It is a
// candidate-free Stage A envelope, not a contents proposal or a wishlist.
export function buildExistingContainerOrdinarySeedRequest({ container_context,
  prior_resolutions = [] } = {}) {
  const context = record(container_context, CONTEXT);
  if (!context || !text(context.container_ref) || !text(context.template_id)
      || !text(context.mechanics_profile_ref) || !text(context.owner_controller_ref)
      || !text(context.property_ref) || !text(context.site_function_ref)
      || !text(context.economic_context_ref) || !refs(context.context_bound_permission_refs)
      || !policy(context.ordinary_policy) || !Array.isArray(prior_resolutions)) return null;
  if (!prior_resolutions.every((value) => text(value))) return null;
  return deepFreeze({ schema: 'rus.items.existing_container_ordinary_seed_request.v2',
    container_ref: context.container_ref, template_id: context.template_id,
    mechanics_profile_ref: context.mechanics_profile_ref,
    context_refs: deepFreeze({ owner_controller_ref: context.owner_controller_ref,
      property_ref: context.property_ref, site_function_ref: context.site_function_ref,
      economic_context_ref: context.economic_context_ref,
      context_bound_permission_refs: [...context.context_bound_permission_refs] }),
    ordinary_policy: deepFreeze(structuredClone(context.ordinary_policy)),
    technical_limits: deepFreeze(structuredClone(
      context.ordinary_policy.technical_limits)),
    prior_resolutions: deepFreeze([...prior_resolutions]), candidate_query: null });
}

function policy(value) {
  const policyValue = record(value,
    ['schema','version','unresolved_ordinary_contents','technical_limits']);
  const limits = record(policyValue?.technical_limits,
    ['schema','version','max_new_entities']);
  return policyValue?.schema === 'rus.items.existing_container_ordinary_policy.v2'
    && policyValue.version === 2
    && policyValue.unresolved_ordinary_contents === true
    && limits?.schema === 'rus.items.existing_container_ordinary_limits.v1'
    && limits.version === 1 && Number.isSafeInteger(limits.max_new_entities)
    && limits.max_new_entities >= 1 && limits.max_new_entities <= 8;
}
function refs(value) { return Array.isArray(value) && value.every(text)
  && new Set(value).size === value.length; }
function text(value) { return typeof value === 'string' && value.length > 0 && value.trim() === value; }
function record(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || Object.getOwnPropertySymbols(value).length > 0) return null;
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== keys.length || keys.some((key) => !names.includes(key))) return null;
  const output = {};
  for (const key of keys) { const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
    output[key] = descriptor.value; }
  return output;
}
