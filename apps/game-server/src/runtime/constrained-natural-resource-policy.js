import { resolveFiniteSourceInitialAmount } from '@rus/items-property/finite-resource-transition';

const PROFILE = ['schema', 'version', 'profile_ref', 'state', 'scope_ref',
  'environment_ref', 'semantic_type', 'functional_bucket', 'admission_class',
  'regional_permission_ref', 'resource_permission_ref', 'source_basis_ref',
  'finite_source'];
const SOURCE = ['source_resource_node_id', 'state_version', 'lifecycle_state',
  'quantity', 'quantity_unit_ref', 'position_ref', 'property_basis_ref'];
const UNINITIALIZED_SOURCE = [...SOURCE, 'initial_amount_bounds'];
const QUANTITY = ['numerator', 'denominator', 'unit'];

// This is an admission policy, not a geology resolver.  A caller gets a
// positive constrained resource only from a fully committed, finite source
// profile.  Player wording is intentionally not an input.
export function resolveConstrainedNaturalResourcePolicy({ objective_context,
  execution_context, candidate_context, scope_ref, property_placement_context } = {}) {
  const candidate = candidate_context;
  if (!plain(candidate) || candidate.admission_class === 'common_mundane') return pass(null);
  if (!['specialized_or_valuable','weapon_or_armament']
    .includes(candidate.admission_class)
      || candidate.availability_class !== 'context_bound') return blocked();
  const objective = objective_context;
  const profile = record(execution_context?.constrained_natural_resource_profile,
    PROFILE);
  if (!objective || !profile || !validProfile(profile, objective, candidate, scope_ref,
      execution_context?.supporting_bases, execution_context?.committed_finite_source,
      property_placement_context)) return blocked();
  return pass(profile);
}

export function constrainedNaturalResourceFiniteTransition({ profile, item,
  request_identity } = {}) {
  const p = record(profile, PROFILE), source = p && sourceRecord(p.finite_source);
  const quantity = item?.mechanics_snapshot?.mechanics?.quantity;
  if (!p || !source || !text(request_identity) || !Array.isArray(item?.causal_basis_refs)
      || !item.causal_basis_refs.includes(source.source_resource_node_id)
      || item.position_ref == null || item.property_basis_ref == null
      || !integer(quantity?.value) || quantity.value < 1 || quantity.unit !== source.quantity.unit) {
    return null;
  }
  const before = source.quantity;
  if (before.denominator !== 1 || before.numerator < quantity.value) return null;
  const after = before.numerator - quantity.value;
  return deepFreeze({ source_resource_node_id: source.source_resource_node_id,
    expected_state_version: source.state_version,
    causal_transition_identity: request_identity,
    quantity_unit_ref: structuredClone(source.quantity_unit_ref),
    before_quantity: structuredClone(before),
    decrement_quantity: { numerator: quantity.value, denominator: 1, unit: quantity.unit },
    after_quantity: { numerator: after, denominator: 1, unit: quantity.unit },
    next_state_version: source.state_version + 1,
    lifecycle_state_after: after === 0 ? 'depleted' : 'active' });
}

// The model estimates a rational amount inside code-owned persisted bounds;
// the runtime validates that estimate before the P16 plan exists.
export function constrainedNaturalResourceFiniteInitialization({ profile, item,
  request_identity, estimated_amount } = {}) {
  const p = record(profile, PROFILE), source = p && sourceRecord(p.finite_source);
  if (!p || !source || source.lifecycle_state !== 'uninitialized'
      || !rational(estimated_amount) || !Array.isArray(item?.causal_basis_refs)
      || !item.causal_basis_refs.includes(source.source_resource_node_id)) return null;
  let initialized;
  try {
    initialized = resolveFiniteSourceInitialAmount({
      initialization_identity: request_identity, committed_amount: null,
      approved_bounds: structuredClone(source.initial_amount_bounds),
      estimated_amount: structuredClone(estimated_amount)
    });
  } catch { return null; }
  const quantity = item?.mechanics_snapshot?.mechanics?.quantity;
  if (!integer(quantity?.value) || quantity.value < 1 || quantity.unit !== initialized.amount.unit
      || initialized.amount.denominator !== 1 || initialized.amount.numerator < quantity.value) return null;
  const after = initialized.amount.numerator - quantity.value;
  const transition = { source_resource_node_id: source.source_resource_node_id,
    expected_state_version: source.state_version + 1,
    causal_transition_identity: request_identity,
    quantity_unit_ref: structuredClone(source.quantity_unit_ref),
    before_quantity: structuredClone(initialized.amount),
    decrement_quantity: { numerator: quantity.value, denominator: 1, unit: quantity.unit },
    after_quantity: { numerator: after, denominator: 1, unit: quantity.unit },
    next_state_version: source.state_version + 2,
    lifecycle_state_after: after === 0 ? 'depleted' : 'active' };
  return deepFreeze({ finite_resource_initialization: {
    source_resource_node_id: source.source_resource_node_id,
    expected_state_version: source.state_version,
    initialization_identity: request_identity,
    quantity_unit_ref: structuredClone(source.quantity_unit_ref),
    estimated_amount: structuredClone(initialized.amount),
    approved_bounds: structuredClone(source.initial_amount_bounds)
  }, finite_resource_transition: transition });
}

function validProfile(profile, objective, candidate, scopeRef, bases, committedSource, propertyContext) {
  const permissions = ordered([profile.regional_permission_ref,
    profile.resource_permission_ref]);
  const policy = objective.policy_refs;
  const source = sourceRecord(profile.finite_source);
  const committed = sourceRecord(committedSource);
  const okay = profile.schema === 'rus.items.constrained_natural_resource_profile.v1'
    && profile.version === 1 && profile.state === 'committed'
    && text(profile.profile_ref) && scope(profile.scope_ref, scopeRef)
    && text(profile.environment_ref) && Array.isArray(objective.context_refs?.environment_refs)
    && objective.context_refs.environment_refs.includes(profile.environment_ref)
    && profile.semantic_type === candidate.semantic_type
    && profile.functional_bucket === candidate.functional_bucket
    && profile.admission_class === candidate.admission_class
    && text(profile.regional_permission_ref) && text(profile.resource_permission_ref)
    && profile.regional_permission_ref !== profile.resource_permission_ref
    && Array.isArray(policy?.context_bound_permission_refs)
    && same(permissions, ordered(policy.context_bound_permission_refs))
    && text(profile.source_basis_ref) && source
    && source.source_resource_node_id === profile.source_basis_ref
    && integer(source.state_version) && source.state_version >= 1
    && rational(source.quantity) && plain(source.quantity_unit_ref)
    && ((source.lifecycle_state === 'active' && source.quantity.numerator > 0)
      || (source.lifecycle_state === 'uninitialized' && source.quantity.numerator === 0
        && validBounds(source.initial_amount_bounds, source.quantity.unit)))
    && committed && sameSource(source, committed)
    && placementPropertyPins(source, propertyContext, scopeRef)
    && Array.isArray(bases) && bases.length === 1
    && basisCovers(bases[0], profile, permissions, scopeRef);
  return okay;
}
function basisCovers(basis, profile, permissions, scopeRef) {
  return basis?.basis_ref === profile.source_basis_ref && basis.state === 'committed'
    && scope(basis.scope_ref, scopeRef)
    && Array.isArray(basis.functional_buckets)
    && basis.functional_buckets.length === 1
    && basis.functional_buckets[0] === profile.functional_bucket
    && Array.isArray(basis.allowed_admission_classes)
    && basis.allowed_admission_classes.length === 1
    && basis.allowed_admission_classes[0] === profile.admission_class
    && same(ordered(basis.permission_refs), permissions);
}
function sameSource(left, right) { return left.source_resource_node_id === right.source_resource_node_id
  && left.state_version === right.state_version && left.lifecycle_state === right.lifecycle_state
  && left.position_ref === right.position_ref && left.property_basis_ref === right.property_basis_ref
  && left.quantity.numerator === right.quantity.numerator
  && left.quantity.denominator === right.quantity.denominator && left.quantity.unit === right.quantity.unit
  && JSON.stringify(left.quantity_unit_ref) === JSON.stringify(right.quantity_unit_ref)
  && JSON.stringify(left.initial_amount_bounds ?? null)
    === JSON.stringify(right.initial_amount_bounds ?? null); }
function sourceRecord(value) {
  const keys = value?.lifecycle_state === 'uninitialized' ? UNINITIALIZED_SOURCE : SOURCE;
  return record(value, keys);
}
function validBounds(value, unit) {
  const bounds = record(value, ['minimum','maximum']);
  return !!bounds && rational(bounds.minimum) && rational(bounds.maximum)
    && bounds.minimum.numerator > 0 && bounds.maximum.numerator > 0
    && bounds.minimum.unit === unit && bounds.maximum.unit === unit
    && BigInt(bounds.minimum.numerator) * BigInt(bounds.maximum.denominator)
      <= BigInt(bounds.maximum.numerator) * BigInt(bounds.minimum.denominator);
}
function placementPropertyPins(source, context, scopeRef) { return plain(context)
  && scope(context.scope_ref, scopeRef) && Array.isArray(context.placement_catalog)
  && context.placement_catalog.some((entry) => entry?.state === 'committed'
    && entry.position_ref === source.position_ref && scope(entry.scope_ref, scopeRef))
  && Array.isArray(context.property_catalog) && context.property_catalog.some((entry) =>
    entry?.state === 'committed' && entry.property_basis_ref === source.property_basis_ref
      && scope(entry.scope_ref, scopeRef)); }
function rational(value) { const q = record(value, QUANTITY); return q && integer(q.numerator)
  && q.numerator >= 0 && integer(q.denominator) && q.denominator >= 1 && text(q.unit)
  && gcd(q.numerator, q.denominator) === 1; }
function ordered(value) { return Array.isArray(value) && value.every(text)
  && new Set(value).size === value.length ? [...value].sort() : null; }
function same(left, right) { return left != null && right != null && left.length === right.length
  && left.every((value, index) => value === right[index]); }
function scope(left, right) { return plain(left) && plain(right)
  && left.entity_kind === right.entity_kind && left.entity_id === right.entity_id
  && text(left.entity_kind) && text(left.entity_id); }
function record(value, keys) { return plain(value) && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key)) ? value : null; }
function plain(value) { return value != null && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype; }
function integer(value) { return Number.isSafeInteger(value); }
function text(value) { return typeof value === 'string' && value.length > 0 && value.trim() === value; }
function gcd(a, b) { while (b !== 0) [a, b] = [b, a % b]; return a || 1; }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  for (const entry of Object.values(value)) deepFreeze(entry);
  Object.freeze(value);
} return value; }
function pass(profile) { return deepFreeze({ resolution: null,
  profile: profile == null ? null : structuredClone(profile) }); }
function blocked() { return deepFreeze({ resolution: 'authority_required', profile: null }); }
