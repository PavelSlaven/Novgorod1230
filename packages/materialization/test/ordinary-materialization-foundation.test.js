import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyOrdinaryAggregateTransition, computeOrdinaryIdentityBudget, createOrdinaryAggregate,
  createOrdinaryCandidateKey, createOrdinaryCoverageKey, createOrdinaryResolutionRef,
  createPreparedGroupRef, MaterializationError, validateOrdinaryBackgroundGroup,
  validateSupportingBasisAdmission
} from '../src/index.js';
import { O2A_SUPPORTING_BASIS_KINDS } from '../src/ordinary-materialization-foundation.js';

const scope = { entity_kind: 'g6', entity_id: 'scope-a' };
const request = {
  schema: 'ordinary_materialization_request_v1', request_id: 'seed-request-a', mode: 'seed_scope', scope_ref: scope, candidate_query: null,
  context_refs: { function_refs: ['function-a'], property_context_ref: 'property-a' },
  policy_refs: { context_bound_permission_refs: ['permission-a'], allowed_admission_classes: ['common_mundane', 'other_restricted'], allowed_supporting_bases: [{ basis_ref: 'basis-a', basis_state: 'committed' }, { basis_ref: 'prepared-a', basis_state: 'prepared_seed' }] }
};
const policy = { version: 'density-v1', mappings: [{ scope_kind: 'g6', function_ref: 'function-a', bands: { sparse: 1, ordinary: 3, dense: 5 } }] };
const bases = [
  { basis_ref: 'basis-a', state: 'committed', policy: { functional_buckets: ['household'], allowed_admission_classes: ['common_mundane'], permission_refs: [] } },
  { basis_ref: 'prepared-a', state: 'prepared_seed', scope_ref: scope, prepared_seed_provenance: { seed_request_id: 'other-seed', mode: 'seed_scope', candidate_query: null }, basis_kind: 'stored_supply', policy: { functional_buckets: ['other_ordinary'], allowed_admission_classes: ['other_restricted'], permission_refs: ['permission-a'] } }
];
const commonGroup = { descriptor: 'abstract-layer', functional_bucket: 'household', availability_class: 'common', allowed_admission_classes: ['common_mundane'], causal_basis: { basis_kind: 'source-kind', basis_refs: ['basis-a'] }, property_basis_ref: 'property-a', permission_refs: [], disclosure_policy_ref: 'disclosure-a' };
const transition = (kind, request_identity, extra = {}) => ({ kind, request_identity, expected_state_version: extra.expected_state_version ?? 0, ...(kind === 'seed' ? { background_groups: [] } : {}), ...extra });

test('density reads function refs from explicit DTO context, not scope, and respects authored hard cap', () => {
  const input = { density_band: 'ordinary', scope, request, policy, hard_technical_max: 5 };
  assert.deepEqual(computeOrdinaryIdentityBudget(input), computeOrdinaryIdentityBudget(input));
  assert.equal(computeOrdinaryIdentityBudget({ ...input, authored_identity_limit: 2 }).identity_budget, 2);
  assert.throws(() => computeOrdinaryIdentityBudget({ ...input, authored_identity_limit: 6 }), (error) => error.code === 'ORDINARY_AUTHORED_LIMIT_EXCEEDS_HARD_MAX');
  assert.throws(() => computeOrdinaryIdentityBudget({ ...input, request: { ...request, context_refs: { ...request.context_refs, function_refs: ['other-function'] } } }), (error) => error.code === 'ORDINARY_DENSITY_POLICY_MAPPING_AMBIGUOUS');
});

test('closed admission consistency requires context permissions and an exact supporting policy', () => {
  const common = { supporting_basis_ref: 'basis-a', functional_bucket: 'household', admission_class: 'common_mundane', availability_class: 'common' };
  assert.equal(validateSupportingBasisAdmission({ request, candidate: common, basis_catalog: bases }).supporting_basis_ref, 'basis-a');
  assert.throws(() => validateSupportingBasisAdmission({ request, candidate: { ...common, availability_class: 'context_bound', permission_refs: ['permission-a'] }, basis_catalog: bases }), (error) => error.code === 'ORDINARY_SUPPORTING_BASIS_POLICY_MISMATCH');
  const restricted = { supporting_basis_ref: 'prepared-a', functional_bucket: 'other_ordinary', admission_class: 'other_restricted', availability_class: 'context_bound', permission_refs: ['permission-a'], basis_kind: 'stored_supply' };
  assert.equal(validateSupportingBasisAdmission({ request, candidate: restricted, basis_catalog: bases }).basis_state, 'prepared_seed');
  assert.throws(() => validateSupportingBasisAdmission({ request, candidate: { ...restricted, permission_refs: [] }, basis_catalog: bases }), (error) => error.code === 'ORDINARY_SUPPORTING_BASIS_POLICY_MISMATCH');
  assert.throws(() => validateSupportingBasisAdmission({ request, candidate: common, basis_catalog: [{ ...bases[0], policy: { ...bases[0].policy, unapproved_policy_field: true } }] }), (error) => error.code === 'ORDINARY_SUPPORTING_BASIS_POLICY_MISMATCH');
  assert.throws(() => validateSupportingBasisAdmission({ request, candidate: { ...restricted, supporting_basis_ref: 'basis-a' }, supporting_basis_ref: 'prepared-a', basis_catalog: bases }), (error) => error.code === 'ORDINARY_SUPPORTING_BASIS_REF_MISMATCH');
  assert.throws(() => validateSupportingBasisAdmission({ request, candidate: restricted, basis_catalog: [{ ...bases[1], prepared_seed_provenance: { seed_request_id: 'x', mode: 'seed_scope', candidate_query: 'candidate' } }] }), (error) => error.code === 'ORDINARY_PREPARED_SEED_PROVENANCE_INVALID');
  assert.throws(() => validateSupportingBasisAdmission({ request, candidate: restricted, basis_catalog: [{ ...bases[1], scope_ref: { entity_kind: 'g6', entity_id: 'other' } }] }), (error) => error.code === 'ORDINARY_PREPARED_SEED_SCOPE_MISMATCH');
});

test('O2a opens only closed context-bound classes with the exact approved permission set', () => {
  const o2Request = { ...request, policy_refs: { ...request.policy_refs,
    allowed_admission_classes: ['specialized_or_valuable', 'weapon_or_armament',
      'currency_or_precious', 'document_like', 'other_restricted', 'container_capable'],
    context_bound_permission_refs: ['approved-profile', 'approved-source'] } };
  for (const admission_class of ['specialized_or_valuable', 'weapon_or_armament',
    'currency_or_precious', 'document_like', 'other_restricted']) {
    const candidate = { supporting_basis_ref: 'basis-a', functional_bucket: 'household',
      admission_class, availability_class: 'context_bound',
      permission_refs: ['approved-profile', 'approved-source'], basis_kind: 'stored_supply' };
    const catalog = [{ ...bases[0], policy: { functional_buckets: ['household'],
      allowed_admission_classes: [admission_class],
      permission_refs: ['approved-profile', 'approved-source'] }, basis_kind: 'stored_supply' }];
    assert.equal(validateSupportingBasisAdmission({ request: o2Request, candidate,
      basis_catalog: catalog }).admission_class, admission_class);
    assert.throws(() => validateSupportingBasisAdmission({ request: o2Request,
      candidate: { ...candidate, permission_refs: ['approved-profile'] },
      basis_catalog: catalog }), (error) => error.code === 'ORDINARY_SUPPORTING_BASIS_POLICY_MISMATCH');
  }
  assert.throws(() => validateSupportingBasisAdmission({ request: o2Request,
    candidate: { supporting_basis_ref: 'basis-a', functional_bucket: 'household',
      admission_class: 'container_capable', availability_class: 'context_bound',
      permission_refs: ['approved-profile', 'approved-source'], basis_kind: 'stored_supply' }, basis_catalog: [{ ...bases[0], basis_kind: 'stored_supply',
      policy: { functional_buckets: ['household'], allowed_admission_classes: ['container_capable'],
        permission_refs: ['approved-profile', 'approved-source'] } }] }),
  (error) => error.code === 'ORDINARY_SUPPORTING_BASIS_POLICY_MISMATCH');
});

test('O2a context-bound basis kinds are closed and remain independent from permissions', () => {
  const requestWithPermission = { ...request, policy_refs: { ...request.policy_refs,
    allowed_admission_classes: ['specialized_or_valuable'],
    context_bound_permission_refs: ['approved-profile'],
    allowed_supporting_bases: O2A_SUPPORTING_BASIS_KINDS.map((basis_ref) => ({ basis_ref,
      basis_state: 'committed' })) } };
  const catalog = O2A_SUPPORTING_BASIS_KINDS.map((basis_kind) => ({ basis_ref: basis_kind,
    state: 'committed', basis_kind, policy: { functional_buckets: ['household'],
      allowed_admission_classes: ['specialized_or_valuable'],
      permission_refs: ['approved-profile'] } }));
  for (const basis_kind of O2A_SUPPORTING_BASIS_KINDS) {
    assert.equal(validateSupportingBasisAdmission({ request: requestWithPermission,
      candidate: { supporting_basis_ref: basis_kind, functional_bucket: 'household',
        admission_class: 'specialized_or_valuable', availability_class: 'context_bound',
        permission_refs: ['approved-profile'], basis_kind }, basis_catalog: catalog }).basis_kind,
    basis_kind);
  }
  assert.throws(() => validateSupportingBasisAdmission({ request: requestWithPermission,
    candidate: { supporting_basis_ref: 'personal_possession', functional_bucket: 'household',
      admission_class: 'specialized_or_valuable', availability_class: 'context_bound',
      permission_refs: ['approved-profile'], basis_kind: 'invented_kind' }, basis_catalog: catalog }),
  (error) => error.code === 'ORDINARY_SUPPORTING_BASIS_KIND_MISMATCH');
  assert.throws(() => validateSupportingBasisAdmission({ request: requestWithPermission,
    candidate: { supporting_basis_ref: 'personal_possession', functional_bucket: 'household',
      admission_class: 'specialized_or_valuable', availability_class: 'context_bound',
      permission_refs: [], basis_kind: 'personal_possession' }, basis_catalog: catalog }),
  (error) => error.code === 'ORDINARY_SUPPORTING_BASIS_POLICY_MISMATCH');
});

test('prepared groups only originate in candidate-free seed and validate causal, permission, disclosure policy', () => {
  const validated = validateOrdinaryBackgroundGroup({ request, group: commonGroup, basis_catalog: bases, allowed_disclosure_policy_refs: ['disclosure-a'] });
  assert.equal(validated.state, 'prepared_seed'); assert.deepEqual(validated.prepared_seed_provenance, { seed_request_id: 'seed-request-a', mode: 'seed_scope', candidate_query: null }); assert.ok(Object.isFrozen(validated));
  assert.throws(() => validateOrdinaryBackgroundGroup({ request: { ...request, mode: 'resolve_presence', candidate_query: { candidate_key: 'c' } }, group: commonGroup, basis_catalog: bases, allowed_disclosure_policy_refs: ['disclosure-a'] }), (error) => error.code === 'ORDINARY_PREPARED_GROUP_SEED_REQUEST_INVALID');
  assert.throws(() => validateOrdinaryBackgroundGroup({ request, group: { ...commonGroup, causal_basis: { ...commonGroup.causal_basis, basis_refs: ['prepared-a'] } }, basis_catalog: bases, allowed_disclosure_policy_refs: ['disclosure-a'] }), (error) => error.code === 'ORDINARY_BACKGROUND_GROUP_BASIS_INVALID');
  assert.throws(() => validateOrdinaryBackgroundGroup({ request, group: { ...commonGroup, disclosure_policy_ref: 'unknown' }, basis_catalog: bases, allowed_disclosure_policy_refs: ['disclosure-a'] }), (error) => error.code === 'ORDINARY_BACKGROUND_GROUP_DISCLOSURE_INVALID');
  const restricted = { ...commonGroup, functional_bucket: 'other_ordinary', availability_class: 'context_bound', allowed_admission_classes: ['other_restricted'], causal_basis: { ...commonGroup.causal_basis, basis_refs: ['prepared-a'] }, permission_refs: ['permission-a'] };
  assert.equal(validateOrdinaryBackgroundGroup({ request, group: restricted, basis_catalog: bases, allowed_disclosure_policy_refs: ['disclosure-a'] }).policy.permission_refs[0], 'permission-a');
});

test('aggregate has logical CAS, idempotent last request replay, and bounded records', () => {
  const initial = createOrdinaryAggregate({ scope_ref: scope, resolution_record_cap: 2 });
  assert.deepEqual([initial.state_version, initial.last_committed_request_identity], [0, null]);
  const seeded = applyOrdinaryAggregateTransition({ aggregate: initial, transition: transition('seed', 'request-seed', { density_band: 'ordinary', identity_budget: 2 }) });
  assert.deepEqual([seeded.state_version, seeded.last_committed_request_identity], [1, 'request-seed']);
  assert.throws(() => applyOrdinaryAggregateTransition({ aggregate: seeded, transition: transition('seed', 'request-seed', { density_band: 'ordinary', identity_budget: 99 }) }), (error) => error.code === 'ORDINARY_COMMITTED_REQUEST_IDENTITY_COLLISION');
  assert.throws(() => applyOrdinaryAggregateTransition({ aggregate: seeded, transition: transition('resolve_presence', 'request-stale', { resolution_ref: 'r0', candidate_key: 'c0', coverage_key: 'v0', category_key: 'k0', context_version: 'ctx-a', resolution: 'absent', expected_state_version: 0 }) }), (error) => error.code === 'ORDINARY_AGGREGATE_STATE_STALE');
  const positive = transition('resolve_presence', 'request-present', { expected_state_version: 1, resolution_ref: 'r1', candidate_key: 'c1', coverage_key: 'v1', category_key: 'k1', context_version: 'ctx-a', resolution: 'materialize', identity_key: 'i1' });
  const admitted = applyOrdinaryAggregateTransition({ aggregate: seeded, transition: positive }); assert.equal(admitted.remaining_identity_budget, 1); assert.equal(admitted.state_version, 2);
  assert.strictEqual(applyOrdinaryAggregateTransition({ aggregate: admitted, transition: positive }), admitted);
  const closed = applyOrdinaryAggregateTransition({ aggregate: admitted, transition: transition('close_coverage', 'request-close', { expected_state_version: 2, coverage_key: 'v2', category_key: 'k2', context_version: 'ctx-a', resolution: 'absent' }) });
  assert.equal(closed.presence_resolutions.length + closed.coverage_closures.length, 2);
  assert.throws(() => applyOrdinaryAggregateTransition({ aggregate: closed, transition: transition('close_coverage', 'request-cap', { expected_state_version: 3, coverage_key: 'v3', category_key: 'k3', context_version: 'ctx-a', resolution: 'absent' }) }), (error) => error.code === 'ORDINARY_RESOLUTION_RECORD_CAP_EXCEEDED');
});

test('same candidate/coverage cannot reroll in one context but can resolve under changed context', () => {
  const seeded = applyOrdinaryAggregateTransition({ aggregate: createOrdinaryAggregate({ scope_ref: scope, resolution_record_cap: 4 }), transition: transition('seed', 'seed', { density_band: 'sparse', identity_budget: 1 }) });
  const absent = applyOrdinaryAggregateTransition({ aggregate: seeded, transition: transition('resolve_presence', 'absent-a', { expected_state_version: 1, resolution_ref: 'r-a', candidate_key: 'candidate-a', coverage_key: 'coverage-a', category_key: 'category-a', context_version: 'context-a', resolution: 'absent' }) });
  assert.throws(() => applyOrdinaryAggregateTransition({ aggregate: absent, transition: transition('resolve_presence', 'reroll-a', { expected_state_version: 2, resolution_ref: 'r-b', candidate_key: 'candidate-a', coverage_key: 'coverage-a', category_key: 'category-a', context_version: 'context-a', resolution: 'materialize', identity_key: 'identity-a' }) }), (error) => error.code === 'ORDINARY_RESOLUTION_REPLAY');
  const changed = applyOrdinaryAggregateTransition({ aggregate: absent, transition: transition('resolve_presence', 'present-b', { expected_state_version: 2, resolution_ref: 'r-c', candidate_key: 'candidate-a', coverage_key: 'coverage-a', category_key: 'category-a', context_version: 'context-b', resolution: 'materialize', identity_key: 'identity-a' }) });
  assert.equal(changed.remaining_identity_budget, 0);
  assert.throws(() => applyOrdinaryAggregateTransition({ aggregate: changed, transition: transition('close_coverage', 'close-conflict', { expected_state_version: 3, coverage_key: 'coverage-a', category_key: 'category-a', context_version: 'context-b', resolution: 'absent' }) }), (error) => error.code === 'ORDINARY_COVERAGE_CLOSURE_CONTRADICTION');
});

test('keys are domain-separated, structured, stable, and ignore free-text phrasing', () => {
  const key = (semantic_type, ignored_name, ignored_phrase) => createOrdinaryCandidateKey({ scope_ref: scope, semantic_type, functional_bucket: 'other_ordinary', admission_class: 'other_restricted', availability_class: 'context_bound', policy_version: 'policy-a', ignored_name, ignored_phrase });
  assert.equal(key('unseen_semantic_type', 'name-one', 'phrase-one'), key('unseen_semantic_type', 'name-two', 'phrase-two'));
  const sourceA = createOrdinaryCandidateKey({ scope_ref: scope, semantic_type: 'unseen_semantic_type', functional_bucket: 'other_ordinary', admission_class: 'other_restricted', availability_class: 'context_bound', policy_version: 'policy-a', source_ref: 'finite-source-a' });
  const sourceB = createOrdinaryCandidateKey({ scope_ref: scope, semantic_type: 'unseen_semantic_type', functional_bucket: 'other_ordinary', admission_class: 'other_restricted', availability_class: 'context_bound', policy_version: 'policy-a', source_ref: 'finite-source-b' });
  assert.notEqual(sourceA, sourceB);
  const coverage = createOrdinaryCoverageKey({ scope_ref: scope, coverage_kind: 'unseen-coverage', coverage_ref: 'coverage-ref', policy_version: 'policy-a' });
  assert.notEqual(key('unseen_semantic_type'), coverage);
  assert.notEqual(createOrdinaryResolutionRef({ scope_ref: scope, candidate_key: key('unseen_semantic_type'), coverage_key: coverage, context_version: 'ctx-a', request_identity: 'request-a' }), createOrdinaryResolutionRef({ scope_ref: scope, candidate_key: key('unseen_semantic_type'), coverage_key: coverage, context_version: 'ctx-a', request_identity: 'request-b' }));
  assert.equal(createPreparedGroupRef({ scope_ref: scope, group: commonGroup }), createPreparedGroupRef({ scope_ref: scope, group: commonGroup }));
});

test('malformed persisted aggregate fails typed before native collection operations', () => {
  assert.throws(() => applyOrdinaryAggregateTransition({ aggregate: { ...createOrdinaryAggregate({ scope_ref: scope, resolution_record_cap: 1 }), presence_resolutions: null }, transition: transition('seed', 'seed', { density_band: 'sparse', identity_budget: 1 }) }), (error) => error instanceof MaterializationError && error.code === 'ORDINARY_AGGREGATE_INVALID');
});

test('an earlier committed request replays after intervening commits, but identity mutation is rejected before CAS', () => {
  const seed = transition('seed', 'seed-history', { density_band: 'ordinary', identity_budget: 2 });
  const seeded = applyOrdinaryAggregateTransition({ aggregate: createOrdinaryAggregate({ scope_ref: scope, resolution_record_cap: 3 }), transition: seed });
  const absent = transition('resolve_presence', 'request-history-a', { expected_state_version: 1, resolution_ref: 'resolution-history-a', candidate_key: 'candidate-history-a', coverage_key: 'coverage-history-a', category_key: 'category-history-a', context_version: 'context-history-a', resolution: 'absent' });
  const afterAbsent = applyOrdinaryAggregateTransition({ aggregate: seeded, transition: absent });
  const afterClosure = applyOrdinaryAggregateTransition({ aggregate: afterAbsent, transition: transition('close_coverage', 'request-history-b', { expected_state_version: 2, coverage_key: 'coverage-history-b', category_key: 'category-history-b', context_version: 'context-history-a', resolution: 'no_change' }) });
  assert.strictEqual(applyOrdinaryAggregateTransition({ aggregate: afterClosure, transition: absent }), afterClosure);
  assert.throws(() => applyOrdinaryAggregateTransition({ aggregate: afterClosure, transition: { ...absent, resolution: 'authority_required' } }), (error) => error.code === 'ORDINARY_COMMITTED_REQUEST_IDENTITY_COLLISION');
  assert.equal(afterClosure.committed_request_fingerprints.length, 3);
});

test('NUL-bearing candidate tuples do not collide in aggregate validation or poison later transitions', () => {
  const seeded = applyOrdinaryAggregateTransition({ aggregate: createOrdinaryAggregate({ scope_ref: scope, resolution_record_cap: 2 }), transition: transition('seed', 'seed-nul', { density_band: 'sparse', identity_budget: 1 }) });
  const first = applyOrdinaryAggregateTransition({ aggregate: seeded, transition: transition('resolve_presence', 'nul-a', { expected_state_version: 1, resolution_ref: 'nul-resolution-a', candidate_key: 'part-a\u0000part-b', coverage_key: 'part-c', category_key: 'category-nul', context_version: 'context-nul', resolution: 'absent' }) });
  const second = applyOrdinaryAggregateTransition({ aggregate: first, transition: transition('resolve_presence', 'nul-b', { expected_state_version: 2, resolution_ref: 'nul-resolution-b', candidate_key: 'part-a', coverage_key: 'part-b\u0000part-c', category_key: 'category-nul', context_version: 'context-nul', resolution: 'absent' }) });
  assert.equal(second.presence_resolutions.length, 2);
  assert.throws(() => applyOrdinaryAggregateTransition({ aggregate: second, transition: transition('resolve_presence', 'nul-cap', { expected_state_version: 3, resolution_ref: 'nul-resolution-c', candidate_key: 'different', coverage_key: 'different', category_key: 'category-nul', context_version: 'context-nul', resolution: 'absent' }) }), (error) => error.code === 'ORDINARY_RESOLUTION_RECORD_CAP_EXCEEDED');
});

test('aggregate reload rejects forged history, unknown records, duplicate identities, and corrupted unseeded state', () => {
  const seeded = applyOrdinaryAggregateTransition({ aggregate: createOrdinaryAggregate({ scope_ref: scope, resolution_record_cap: 3 }), transition: transition('seed', 'seed-forgery', { density_band: 'ordinary', identity_budget: 2 }) });
  const first = applyOrdinaryAggregateTransition({ aggregate: seeded, transition: transition('resolve_presence', 'forgery-a', { expected_state_version: 1, resolution_ref: 'forgery-r-a', candidate_key: 'forgery-c-a', coverage_key: 'forgery-v-a', category_key: 'forgery-k-a', context_version: 'forgery-context', resolution: 'materialize', identity_key: 'forgery-i-a' }) });
  const second = applyOrdinaryAggregateTransition({ aggregate: first, transition: transition('resolve_presence', 'forgery-b', { expected_state_version: 2, resolution_ref: 'forgery-r-b', candidate_key: 'forgery-c-b', coverage_key: 'forgery-v-b', category_key: 'forgery-k-b', context_version: 'forgery-context', resolution: 'materialize', identity_key: 'forgery-i-b' }) });
  const badDigest = structuredClone(second); badDigest.committed_request_fingerprints[1].transition_digest = '0'.repeat(64);
  assert.throws(() => applyOrdinaryAggregateTransition({ aggregate: badDigest, transition: transition('close_coverage', 'unused-a', { expected_state_version: 3, coverage_key: 'unused-v', category_key: 'unused-k', context_version: 'unused', resolution: 'absent' }) }), (error) => error.code === 'ORDINARY_AGGREGATE_INVALID');
  const duplicateIdentity = structuredClone(second); duplicateIdentity.presence_resolutions[1].identity_key = 'forgery-i-a';
  assert.throws(() => applyOrdinaryAggregateTransition({ aggregate: duplicateIdentity, transition: transition('close_coverage', 'unused-b', { expected_state_version: 3, coverage_key: 'unused-v', category_key: 'unused-k', context_version: 'unused', resolution: 'absent' }) }), (error) => error.code === 'ORDINARY_AGGREGATE_INVALID');
  const unknownRecord = structuredClone(second); unknownRecord.presence_resolutions[0].unexpected = true;
  assert.throws(() => applyOrdinaryAggregateTransition({ aggregate: unknownRecord, transition: transition('close_coverage', 'unused-c', { expected_state_version: 3, coverage_key: 'unused-v', category_key: 'unused-k', context_version: 'unused', resolution: 'absent' }) }), (error) => error.code === 'ORDINARY_AGGREGATE_INVALID');
  assert.throws(() => applyOrdinaryAggregateTransition({ aggregate: { ...createOrdinaryAggregate({ scope_ref: scope, resolution_record_cap: 1 }), density_band: 'sparse' }, transition: transition('seed', 'unused-d', { density_band: 'sparse', identity_budget: 1 }) }), (error) => error.code === 'ORDINARY_AGGREGATE_INVALID');
});

test('seed accepts only validated prepared groups and remains reload-valid for the next transition', () => {
  assert.throws(() => applyOrdinaryAggregateTransition({ aggregate: createOrdinaryAggregate({ scope_ref: scope, resolution_record_cap: 2 }), transition: transition('seed', 'raw-group-seed', { density_band: 'sparse', identity_budget: 1, background_groups: [commonGroup] }) }), (error) => error.code === 'ORDINARY_AGGREGATE_GROUP_INVALID');
  const prepared = validateOrdinaryBackgroundGroup({ request, group: commonGroup, basis_catalog: bases, allowed_disclosure_policy_refs: ['disclosure-a'] });
  const seeded = applyOrdinaryAggregateTransition({ aggregate: createOrdinaryAggregate({ scope_ref: scope, resolution_record_cap: 2 }), transition: transition('seed', 'prepared-group-seed', { density_band: 'sparse', identity_budget: 1, background_groups: [prepared] }) });
  const reloaded = structuredClone(seeded);
  const next = applyOrdinaryAggregateTransition({ aggregate: reloaded, transition: transition('close_coverage', 'prepared-group-next', { expected_state_version: 1, coverage_key: 'prepared-coverage', category_key: 'prepared-category', context_version: 'prepared-context', resolution: 'absent' }) });
  assert.equal(next.state_version, 2);
});
