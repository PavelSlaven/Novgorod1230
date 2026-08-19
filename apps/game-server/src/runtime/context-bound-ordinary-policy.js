const PROFILE = ['schema', 'version', 'profile_ref', 'state', 'scope_ref',
  'profile_kind', 'semantic_type', 'functional_bucket', 'admission_class',
  'permission_refs', 'source_basis_ref', 'property_basis_ref',
  'runtime_item_mechanics_policy_ref', 'mechanics_capability_ref', 'public_name'];
const PROFILE_V2 = [...PROFILE, 'condition_state', 'basis_kind'];

// This is a closed authority envelope, not a vocabulary of semantic variants.
export function resolveContextBoundOrdinaryPolicy(input = {}) {
  const copied = copyData(input);
  if (copied === null) return blocked('authority_required');
  const outer = record(copied, ['objective_context', 'execution_context',
    'candidate_context', 'scope_ref', 'property_placement_context']);
  if (!outer) return blocked('authority_required');
  const { objective_context: objective, execution_context: execution,
    candidate_context: candidate, scope_ref: scopeRef,
    property_placement_context: propertyContext } = outer;
  if (!plain(candidate) || candidate.admission_class === 'common_mundane') return pass(null);
  if (!['weapon_or_armament', 'specialized_or_valuable',
    'currency_or_precious', 'document_like', 'other_restricted']
    .includes(candidate.admission_class)) {
    return blocked('absent');
  }
  if (candidate.admission_class === 'weapon_or_armament') return blocked('absent');
  const raw = execution?.context_bound_ordinary_profile;
  // A specialized finite natural source has its own Phase 5 authority owner.
  // Every other context-bound class requires this exact envelope.
  if (raw == null && candidate.admission_class === 'specialized_or_valuable') {
    return execution?.constrained_natural_resource_profile == null
      ? blocked('absent') : pass(null);
  }
  if (raw == null) return blocked('absent');
  const profile = record(raw, PROFILE_V2) ?? record(raw, PROFILE);
  if (!profile || !validProfile(profile, objective, execution, candidate, scopeRef,
      propertyContext)) return blocked('absent');
  return pass(profile.version === 1 ? { ...profile, condition_state: 'serviceable',
    basis_kind: execution.supporting_bases[0].basis_kind ?? null } : profile);
}

function validProfile(profile, objective, execution, candidate, scopeRef, propertyContext) {
  const expectedProfileKind = candidate.admission_class === 'currency_or_precious'
    ? 'precious_material' : 'specialized_stock';
  const permissions = refs(profile.permission_refs);
  const condition = profile.version === 1 ? 'serviceable' : profile.condition_state;
  return ((profile.schema === 'rus.items.context_bound_ordinary_profile.v1' && profile.version === 1)
      || (profile.schema === 'rus.items.context_bound_ordinary_profile.v2' && profile.version === 2
        && ['serviceable','damaged'].includes(condition)
        && (condition !== 'damaged' || (profile.basis_kind === 'remnant'
          && ['specialized_stock','armament'].includes(profile.profile_kind)))))
    && profile.state === 'committed'
    && text(profile.profile_ref) && scope(profile.scope_ref, scopeRef)
    && profile.profile_kind === expectedProfileKind
    && text(profile.public_name)
    && profile.functional_bucket === candidate.functional_bucket
    && profile.admission_class === candidate.admission_class
    && permissions !== null && permissions.includes(profile.profile_ref)
    && same(permissions, refs(objective?.policy_refs?.context_bound_permission_refs))
    && text(profile.source_basis_ref) && text(profile.property_basis_ref)
    && profile.property_basis_ref === objective?.context_refs?.property_context_ref
    && profile.runtime_item_mechanics_policy_ref === objective?.policy_refs?.runtime_item_mechanics_policy_ref
    && text(profile.mechanics_capability_ref)
    && exactBasis(execution?.supporting_bases, profile, scopeRef)
    && mechanics(execution?.mechanics_policy, profile)
    && exactProperty(propertyContext, profile.property_basis_ref, scopeRef);
}

function exactBasis(bases, profile, scopeRef) {
  if (!Array.isArray(bases) || bases.length !== 1) return false;
  const basis = bases[0];
  return plain(basis) && basis.basis_ref === profile.source_basis_ref
    && basis.state === 'committed' && scope(basis.scope_ref, scopeRef)
    && same(refs(basis.functional_buckets), [profile.functional_bucket])
    && same(refs(basis.allowed_admission_classes), [profile.admission_class])
    && same(refs(basis.permission_refs), refs(profile.permission_refs))
    && (profile.version === 1 || basis.basis_kind === profile.basis_kind);
}

function mechanics(value, profile) {
  return plain(value) && value.policy_ref === profile.runtime_item_mechanics_policy_ref;
}

function exactProperty(context, propertyBasisRef, scopeRef) {
  return plain(context) && scope(context.scope_ref, scopeRef)
    && Array.isArray(context.property_catalog)
    && context.property_catalog.some((entry) => plain(entry)
      && entry.state === 'committed' && entry.property_basis_ref === propertyBasisRef
      && scope(entry.scope_ref, scopeRef));
}

function refs(value) { return Array.isArray(value) && value.length > 0
  && value.every(text) && new Set(value).size === value.length ? [...value].sort() : null; }
function same(left, right) { return left !== null && right !== null
  && left.length === right.length && left.every((value, index) => value === right[index]); }
function scope(left, right) { return plain(left) && plain(right)
  && left.entity_kind === right.entity_kind && left.entity_id === right.entity_id
  && text(left.entity_kind) && text(left.entity_id); }
function record(value, keys) { return plain(value) && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key)) ? value : null; }
function plain(value) { return value != null && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype; }
function text(value) { return typeof value === 'string' && value.length > 0 && value.trim() === value; }
function pass(profile) { return deepFreeze({ resolution: null,
  profile: profile == null ? null : structuredClone(profile) }); }
function blocked(resolution) { return deepFreeze({ resolution, profile: null }); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  for (const entry of Object.values(value)) deepFreeze(entry);
  Object.freeze(value);
} return value; }

// This public policy boundary accepts data only.  Reading descriptors rather
// than values first prevents accessors from becoming an authority side channel.
function copyData(value) {
  const seen = new WeakSet();
  function visit(entry) {
    if (entry === null || typeof entry === 'string' || typeof entry === 'boolean') return entry;
    if (typeof entry === 'number') return Number.isFinite(entry) ? entry : null;
    if (!entry || typeof entry !== 'object' || Object.getOwnPropertySymbols(entry).length) return null;
    const array = Array.isArray(entry);
    if ((array && Object.getPrototypeOf(entry) !== Array.prototype)
        || (!array && Object.getPrototypeOf(entry) !== Object.prototype) || seen.has(entry)) return null;
    seen.add(entry);
    const names = Object.getOwnPropertyNames(entry);
    if (array && (names.length !== entry.length + 1 || !names.includes('length'))) return null;
    const out = array ? [] : {};
    for (const name of names) {
      if (array && name === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(entry, name);
      if (!descriptor || descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value')) return null;
      const child = visit(descriptor.value);
      if (child === null && descriptor.value !== null) return null;
      if (array) {
        if (name !== String(out.length)) return null;
        out.push(child);
      } else out[name] = child;
    }
    return out;
  }
  return visit(value);
}
