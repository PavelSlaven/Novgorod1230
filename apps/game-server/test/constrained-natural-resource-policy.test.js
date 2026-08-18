import assert from 'node:assert/strict';
import test from 'node:test';
import { constrainedNaturalResourceFiniteTransition,
  constrainedNaturalResourceFiniteInitialization,
  resolveConstrainedNaturalResourcePolicy } from
  '../src/runtime/constrained-natural-resource-policy.js';

const scope_ref = { entity_kind: 'g6', entity_id: 'river-bank' };
const candidate_context = { semantic_type: 'unseen_constrained_raw',
  functional_bucket: 'other_ordinary', admission_class: 'specialized_or_valuable',
  availability_class: 'context_bound' };
function fixture() {
  const committedFiniteSource = { source_resource_node_id: 'node:unseen', state_version: 4,
    lifecycle_state: 'active', quantity: { numerator: 2, denominator: 1, unit: 'item' },
    quantity_unit_ref: { kind: 'unit', id: 'item' }, position_ref: 'position:bank',
    property_basis_ref: 'property:bank' };
  const profile = { schema: 'rus.items.constrained_natural_resource_profile.v1', version: 1,
    profile_ref: 'profile:unseen-constrained', state: 'committed', scope_ref,
    environment_ref: 'environment:river-bank', semantic_type: 'unseen_constrained_raw',
    functional_bucket: 'other_ordinary', admission_class: 'specialized_or_valuable',
    regional_permission_ref: 'permission:region-resource',
    resource_permission_ref: 'permission:unseen-class', source_basis_ref: 'node:unseen',
    public_name: 'обычный кусок природного материала',
    finite_source: { source_resource_node_id: 'node:unseen',
      quantity_unit_ref: { kind: 'unit', id: 'item' }, position_ref: 'position:bank',
      property_basis_ref: 'property:bank', initial_amount_bounds: {
        minimum: { numerator: 2, denominator: 1, unit: 'item' },
        maximum: { numerator: 8, denominator: 1, unit: 'item' }
      } } };
  const result = { objective_context: { context_refs: { environment_refs: ['environment:river-bank'] },
    policy_refs: { context_bound_permission_refs: ['permission:region-resource',
      'permission:unseen-class'] } }, execution_context: { supporting_bases: [{
      basis_ref: 'node:unseen', state: 'committed', scope_ref,
      functional_buckets: ['other_ordinary'],
      allowed_admission_classes: ['specialized_or_valuable'],
      permission_refs: ['permission:region-resource', 'permission:unseen-class'] }],
    constrained_natural_resource_profile: profile }, candidate_context: structuredClone(candidate_context), scope_ref };
  // The loader-owned descriptor is distinct from the authored profile and is
  // what prevents stale/depleted source rows from reaching Stage B.
  return { ...result, property_placement_context: { scope_ref, placement_catalog: [{
    state: 'committed', position_ref: 'position:bank', scope_ref }], property_catalog: [{
    state: 'committed', property_basis_ref: 'property:bank', scope_ref }] },
    execution_context: { ...result.execution_context,
      committed_finite_source: structuredClone(committedFiniteSource) } };
}

test('an unseen server-owned constrained class is admitted only by its exact profile and finite source', () => {
  const result = resolveConstrainedNaturalResourcePolicy(fixture());
  assert.equal(result.resolution, null);
  assert.equal(result.profile.profile_ref, 'profile:unseen-constrained');
  const transition = constrainedNaturalResourceFiniteTransition({ profile: result.profile,
    request_identity: 'turn:1:ordinary:presence', item: { position_ref: 'position:bank',
      property_basis_ref: 'property:bank', causal_basis_refs: ['node:unseen'],
      mechanics_snapshot: { mechanics: { quantity: { value: 1, unit: 'item' } } } } });
  assert.deepEqual(transition.after_quantity, { numerator: 1, denominator: 1, unit: 'item' });
  assert.equal(transition.next_state_version, 5);
});

test('a committed decrement refreshes mutable finite state without invalidating immutable authority', () => {
  const value = fixture();
  assert.deepEqual(Object.keys(value.execution_context
    .constrained_natural_resource_profile.finite_source).sort(), [
    'initial_amount_bounds', 'position_ref', 'property_basis_ref',
    'quantity_unit_ref', 'source_resource_node_id'
  ]);
  value.execution_context.committed_finite_source = {
    ...value.execution_context.committed_finite_source,
    state_version: 5,
    quantity: { numerator: 1, denominator: 1, unit: 'item' }
  };
  const result = resolveConstrainedNaturalResourcePolicy(value);
  assert.equal(result.resolution, null);
  assert.equal(result.profile.finite_source.state_version, 5);
  assert.deepEqual(result.profile.finite_source.quantity,
    { numerator: 1, denominator: 1, unit: 'item' });
  const drifted = fixture();
  drifted.execution_context.committed_finite_source.position_ref = 'position:other';
  assert.equal(resolveConstrainedNaturalResourcePolicy(drifted).resolution,
    'absent');
});

test('missing permissions, cross-scope profile, missing source, and a model-like class swap fail closed', () => {
  for (const change of [
    (value) => { value.objective_context.policy_refs.context_bound_permission_refs = ['permission:unseen-class']; },
    (value) => { value.execution_context.constrained_natural_resource_profile.scope_ref = { entity_kind: 'g6', entity_id: 'other' }; },
    (value) => { value.execution_context.constrained_natural_resource_profile.finite_source = null; },
    (value) => { value.candidate_context.semantic_type = 'forged-model-class'; }
  ]) {
    const value = fixture(); change(value);
    assert.deepEqual(resolveConstrainedNaturalResourcePolicy(value),
      { resolution: 'absent', profile: null });
  }
});

test('player digging wording is not a policy input and never creates a source', () => {
  const value = fixture();
  value.execution_context.constrained_natural_resource_profile = undefined;
  value.player_query = 'копаю землю и ищу дорогой материал';
  assert.equal(resolveConstrainedNaturalResourcePolicy(value).resolution,
    'absent');
});

test('a one-time source accepts one bounded semantic estimate before its first decrement', () => {
  const value = fixture();
  const source = { ...value.execution_context.committed_finite_source,
    lifecycle_state: 'uninitialized', quantity: { numerator: 0, denominator: 1, unit: 'item' },
    initial_amount_bounds: {
      minimum: { numerator: 2, denominator: 1, unit: 'item' },
      maximum: { numerator: 8, denominator: 1, unit: 'item' }
    } };
  value.execution_context.committed_finite_source = structuredClone(source);
  const profile = resolveConstrainedNaturalResourcePolicy(value).profile;
  assert.notEqual(profile, null);
  const item = { position_ref: 'position:bank', property_basis_ref: 'property:bank',
    causal_basis_refs: ['node:unseen'], mechanics_snapshot: {
      mechanics: { quantity: { value: 1, unit: 'item' } } } };
  const first = constrainedNaturalResourceFiniteInitialization({ profile, item,
    request_identity: 'turn:1:ordinary:presence',
    estimated_amount: { numerator: 7, denominator: 1, unit: 'item' } });
  assert.equal(first.finite_resource_initialization.estimated_amount.numerator, 7);
  assert.equal(first.finite_resource_transition.expected_state_version, 5);
  assert.equal(first.finite_resource_transition.after_quantity.numerator, 6);
  assert.equal(constrainedNaturalResourceFiniteInitialization({ profile, item,
    request_identity: 'turn:1:ordinary:presence',
    estimated_amount: { numerator: 9, denominator: 1, unit: 'item' } }), null);
});
