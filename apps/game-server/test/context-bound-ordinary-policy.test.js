import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveContextBoundOrdinaryPolicy } from
  '../src/runtime/context-bound-ordinary-policy.js';

const scope_ref = { entity_kind: 'g6', entity_id: 'yard-a' };
const permissions = ['armament:profile-a', 'armament:source-a'];
const objective_context = { context_refs: { property_context_ref: 'property:warrior-a' },
  policy_refs: { context_bound_permission_refs: permissions,
    runtime_item_mechanics_policy_ref: 'mechanics:armament-a' } };
const candidate_context = { semantic_type: 'ordinary_spear', functional_bucket: 'arms',
  admission_class: 'weapon_or_armament', availability_class: 'context_bound' };
const property_placement_context = { scope_ref, property_catalog: [{
  property_basis_ref: 'property:warrior-a', state: 'committed', scope_ref
}] };

function execution(overrides = {}) { return {
  supporting_bases: [{ basis_ref: 'armament:source-a', state: 'committed', scope_ref,
    functional_buckets: ['arms'], allowed_admission_classes: ['weapon_or_armament'],
    permission_refs: permissions }],
  mechanics_policy: { policy_ref: 'mechanics:armament-a' },
  context_bound_ordinary_profile: {
    schema: 'rus.items.context_bound_ordinary_profile.v1', version: 1,
    profile_ref: 'armament:profile-a', state: 'committed', scope_ref,
    profile_kind: 'armament', semantic_type: 'ordinary_spear', functional_bucket: 'arms',
    admission_class: 'weapon_or_armament', permission_refs: permissions,
    source_basis_ref: 'armament:source-a', property_basis_ref: 'property:warrior-a',
    runtime_item_mechanics_policy_ref: 'mechanics:armament-a',
    mechanics_capability_ref: 'combat:mechanics:armament-a',
    public_name: 'обычный наконечник копья'
  },
  ...overrides
}; }
function resolve(overrides = {}) { return resolveContextBoundOrdinaryPolicy(JSON.parse(JSON.stringify({
  objective_context, execution_context: execution(overrides.execution_context),
  candidate_context: overrides.candidate_context ?? candidate_context, scope_ref,
  property_placement_context
}))); }

test('approved armament is a closed profile envelope, not a noun rule', () => {
  const result = resolve();
  assert.equal(result.resolution, null);
  assert.equal(result.profile.semantic_type, 'ordinary_spear');
  assert.equal(Object.isFrozen(result), true);
  assert.equal(resolve({ candidate_context: {
    ...candidate_context, semantic_type: 'unlisted_spearhead_variant'
  } }).resolution, null);
  for (const alteredCandidate of [
    { ...candidate_context, functional_bucket: 'work' },
    { ...candidate_context, admission_class: 'specialized_or_valuable' }
  ]) assert.equal(resolve({ candidate_context: alteredCandidate }).resolution, 'absent');
});

test('ordinary work context is not a specialized-stock authority envelope', () => {
  const candidate = { semantic_type: 'specialized_stock_item', functional_bucket: 'work',
    admission_class: 'specialized_or_valuable', availability_class: 'context_bound' };
  const value = resolve({ candidate_context: candidate, execution_context: {
    ...execution(), context_bound_ordinary_profile: {
      ...execution().context_bound_ordinary_profile, profile_kind: 'specialized_stock',
      semantic_type: 'specialized_stock_item', functional_bucket: 'stock',
      admission_class: 'specialized_or_valuable'
    }
  } });
  assert.equal(value.resolution, 'absent');
});

test('currency identity stays blocked while an approved precious material source is admitted', () => {
  const currency = { semantic_type: 'authentic_coin', functional_bucket: 'stock',
    admission_class: 'currency_or_precious', availability_class: 'context_bound' };
  assert.equal(resolve({ candidate_context: currency }).resolution, 'absent');
  const candidate = { ...currency, semantic_type: 'precious_material_fragment' };
  const base = execution();
  const profile = { ...base.context_bound_ordinary_profile,
    schema: 'rus.items.context_bound_ordinary_profile.v2', version: 2,
    profile_kind: 'precious_material', semantic_type: candidate.semantic_type,
    functional_bucket: 'stock', admission_class: 'currency_or_precious',
    condition_state: 'serviceable', basis_kind: 'finite_source' };
  const supporting_bases = [{ ...base.supporting_bases[0],
    functional_buckets: ['stock'],
    allowed_admission_classes: ['currency_or_precious'],
    basis_kind: 'finite_source' }];
  const approved = resolve({ candidate_context: candidate, execution_context: {
    ...base, supporting_bases, context_bound_ordinary_profile: profile
  } });
  assert.equal(approved.resolution, null);
  assert.equal(approved.profile.profile_kind, 'precious_material');
});

test('document-like and other restricted gates require exact non-authentic stock profiles', () => {
  for (const admission_class of ['document_like', 'other_restricted']) {
    const semantic_type = `ordinary_${admission_class}`;
    const candidate = { semantic_type, functional_bucket: 'stock',
      admission_class, availability_class: 'context_bound' };
    const base = execution();
    const context_bound_ordinary_profile = {
      ...base.context_bound_ordinary_profile,
      schema: 'rus.items.context_bound_ordinary_profile.v2', version: 2,
      profile_kind: 'specialized_stock', semantic_type,
      functional_bucket: 'stock', admission_class,
      condition_state: 'serviceable', basis_kind: 'stored_supply'
    };
    const supporting_bases = [{ ...base.supporting_bases[0],
      functional_buckets: ['stock'], allowed_admission_classes: [admission_class],
      basis_kind: 'stored_supply' }];
    const approved = resolve({ candidate_context: candidate, execution_context: {
      ...base, supporting_bases, context_bound_ordinary_profile
    } });
    assert.equal(approved.resolution, null);
    assert.equal(approved.profile.semantic_type, semantic_type);
    assert.equal(approved.profile.profile_kind, 'specialized_stock');
    assert.equal(resolve({ candidate_context: candidate, execution_context: {
      ...base, supporting_bases, context_bound_ordinary_profile: null
    } }).resolution, 'absent');
  }
});

test('damaged ordinary armament remnant is reachable only from its approved remnant profile', () => {
  const candidate = { semantic_type: 'damaged_armament_remnant', functional_bucket: 'arms',
    admission_class: 'weapon_or_armament', availability_class: 'context_bound' };
  const base = execution();
  const profile = { ...base.context_bound_ordinary_profile,
    schema: 'rus.items.context_bound_ordinary_profile.v2', version: 2,
    profile_kind: 'armament', semantic_type: candidate.semantic_type,
    functional_bucket: 'arms', admission_class: 'weapon_or_armament',
    condition_state: 'damaged', basis_kind: 'remnant' };
  const supporting_bases = [{ ...base.supporting_bases[0], basis_kind: 'remnant' }];
  const result = resolve({ candidate_context: candidate, execution_context: {
    ...base, supporting_bases, context_bound_ordinary_profile: profile } });
  assert.equal(result.profile.condition_state, 'damaged');
  for (const change of [
    (value) => { value.context_bound_ordinary_profile.basis_kind = 'finite_source'; },
    (value) => { value.context_bound_ordinary_profile.profile_kind = 'specialized_stock'; }
  ]) {
    const value = structuredClone({ ...base, supporting_bases,
      context_bound_ordinary_profile: profile }); change(value);
    assert.equal(resolve({ candidate_context: candidate, execution_context: value }).resolution,
      'absent');
  }
});

test('policy boundary rejects hostile data descriptors before reading any semantic field', () => {
  function input() { return JSON.parse(JSON.stringify({ objective_context,
    execution_context: execution(), candidate_context, scope_ref, property_placement_context })); }
  for (const mutate of [
    (value, read) => Object.defineProperty(value, 'objective_context', { enumerable: true,
      get() { read(); return null; } }),
    (value, read) => Object.defineProperty(value.execution_context.context_bound_ordinary_profile,
      'semantic_type', { enumerable: true, get() { read(); return null; } }),
    (value, read) => Object.defineProperty(value.execution_context.supporting_bases[0], 'basis_ref',
      { enumerable: true, get() { read(); return null; } }),
    (value, read) => Object.defineProperty(value.property_placement_context.property_catalog[0],
      'property_basis_ref', { enumerable: true, get() { read(); return null; } }),
    (value, read) => Object.defineProperty(value.execution_context.mechanics_policy, 'policy_ref',
      { enumerable: true, get() { read(); return null; } })
  ]) {
    const value = input(); let reads = 0;
    mutate(value, () => { reads += 1; });
    assert.equal(resolveContextBoundOrdinaryPolicy(value).resolution, 'authority_required');
    assert.equal(reads, 0);
  }
});

test('policy boundary fails closed for custom prototypes, symbols and aliases', () => {
  function input() { return JSON.parse(JSON.stringify({ objective_context,
    execution_context: execution(), candidate_context, scope_ref, property_placement_context })); }
  const custom = input(); Object.setPrototypeOf(custom.candidate_context, { forged: true });
  const symbol = input(); symbol.execution_context[Symbol('forged')] = true;
  const alias = input(); alias.execution_context.context_bound_ordinary_profile.scope_ref = alias.scope_ref;
  for (const value of [custom, symbol, alias]) assert.equal(
    resolveContextBoundOrdinaryPolicy(value).resolution, 'authority_required');
});
