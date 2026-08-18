import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOrdinaryMaterializationPlanV1 } from '@rus/contracts';
import {
  applyOrdinaryAggregateTransition, computeOrdinaryIdentityBudget, createOrdinaryAggregate,
  createOrdinaryCandidateKey, createOrdinaryCoverageKey, createOrdinaryResolutionRef,
  createPreparedGroupRef, MaterializationError, validateOrdinaryBackgroundGroup,
  validateSupportingBasisAdmission
} from '../src/index.js';

const scope = { entity_kind: 'g6', entity_id: 'scope-a' };
const request = {
  schema: 'ordinary_materialization_request_v1', request_id: 'seed-request-a', mode: 'seed_scope', scope_ref: scope, candidate_query: null,
  context_refs: { function_refs: ['function-a'], property_context_ref: 'property-a' },
  policy_refs: { context_bound_permission_refs: ['permission-a'], allowed_admission_classes: ['common_mundane', 'other_restricted'], allowed_supporting_bases: [{ basis_ref: 'basis-a', basis_state: 'committed' }, { basis_ref: 'prepared-a', basis_state: 'prepared_seed' }] }
};
const policy = { version: 'density-v1', mappings: [{ scope_kind: 'g6', function_ref: 'function-a', bands: { sparse: 1, ordinary: 3, dense: 5 } }] };
const bases = [
  { basis_ref: 'basis-a', state: 'committed', policy: { functional_buckets: ['household'], allowed_admission_classes: ['common_mundane'], permission_refs: [] } },
  { basis_ref: 'prepared-a', state: 'prepared_seed', prepared_seed_provenance: { seed_request_id: 'other-seed', mode: 'seed_scope', candidate_query: null }, policy: { functional_buckets: ['other_ordinary'], allowed_admission_classes: ['other_restricted'], permission_refs: ['permission-a'] } }
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
  assert.throws(() => validateSupportingBasisAdmission({ request, candidate: { ...common, availability_class: 'context_bound' }, basis_catalog: bases }), (error) => error.code === 'ORDINARY_SUPPORTING_BASIS_POLICY_MISMATCH');
  const restricted = {
    semantic_descriptor: { semantic_type: 'model-wording', name: 'model name', facts: [] },
    authority_class: 'ordinary', admission_class: 'other_restricted',
    availability_class: 'context_bound', functional_bucket: 'other_ordinary',
    presence_expectation: 'plausible', supporting_basis_ref: 'prepared-a',
    causal_basis: { basis_kind: 'prepared', basis_refs: ['prepared-a'] },
    property_basis_ref: 'property-a',
    placement_proposal: { scope_ref: 'scope-a', position_ref: 'position-a' },
    mechanics_proposal: { mass_grams: 1, external_hand_cost: 0, carry_form: 'held', packing_slot_cost: 0, quantity: { value: 1, unit: 'item' }, container: null }
  };
  assert.deepEqual(validateOrdinaryMaterializationPlanV1({ schema: 'ordinary_materialization_plan_v1', request_id: 'request-a', resolution: 'materialize', density_band_proposal: null, background_groups: [], entities: [restricted], presence_resolutions: [], reason_code: 'test' }), []);
  assert.equal(Object.hasOwn(restricted, 'permission_refs'), false);
  const admitted = validateSupportingBasisAdmission({ request, candidate: restricted, basis_catalog: bases });
  assert.equal(admitted.basis_state, 'prepared_seed'); assert.deepEqual(admitted.permission_refs, ['permission-a']);
  assert.throws(() => validateSupportingBasisAdmission({ request, candidate: { ...restricted, permission_refs: ['permission-a'] }, basis_catalog: bases }), (error) => error.code === 'ORDINARY_CANDIDATE_PERMISSION_INPUT_FORBIDDEN');
  assert.throws(() => validateSupportingBasisAdmission({ request: { ...request, policy_refs: { ...request.policy_refs, context_bound_permission_refs: [] } }, candidate: restricted, basis_catalog: bases }), (error) => error.code === 'ORDINARY_SUPPORTING_BASIS_POLICY_MISMATCH');
  assert.throws(() => validateSupportingBasisAdmission({ request, candidate: common, basis_catalog: [{ ...bases[0], policy: { ...bases[0].policy, unapproved_policy_field: true } }] }), (error) => error.code === 'ORDINARY_SUPPORTING_BASIS_POLICY_MISMATCH');
  assert.throws(() => validateSupportingBasisAdmission({ request, candidate: { ...restricted, supporting_basis_ref: 'basis-a' }, supporting_basis_ref: 'prepared-a', basis_catalog: bases }), (error) => error.code === 'ORDINARY_SUPPORTING_BASIS_REF_MISMATCH');
  assert.throws(() => validateSupportingBasisAdmission({ request, candidate: restricted, basis_catalog: [{ ...bases[1], prepared_seed_provenance: { seed_request_id: 'x', mode: 'seed_scope', candidate_query: 'candidate' } }] }), (error) => error.code === 'ORDINARY_PREPARED_SEED_PROVENANCE_INVALID');
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
  assert.deepEqual(Object.keys(initial), ['schema', 'scope_ref', 'state_version', 'last_committed_request_identity', 'last_committed_transition_kind', 'seeded', 'density_band', 'identity_budget', 'remaining_identity_budget', 'background_groups', 'presence_resolutions', 'closed_observation_scopes', 'resolution_record_cap']);
  const seedTransition = transition('seed', 'request-seed', { density_band: 'ordinary', identity_budget: 2 });
  const seeded = applyOrdinaryAggregateTransition({ aggregate: initial, transition: seedTransition });
  assert.deepEqual([seeded.state_version, seeded.last_committed_request_identity], [1, 'request-seed']);
  assert.strictEqual(applyOrdinaryAggregateTransition({ aggregate: seeded, transition: seedTransition }), seeded);
  assert.throws(() => applyOrdinaryAggregateTransition({ aggregate: seeded, transition: transition('seed', 'request-seed', { density_band: 'ordinary', identity_budget: 99 }) }), (error) => error.code === 'ORDINARY_COMMITTED_REQUEST_IDENTITY_COLLISION');
  assert.throws(() => applyOrdinaryAggregateTransition({ aggregate: seeded, transition: transition('resolve_presence', 'request-stale', { resolution_ref: 'r0', candidate_key: 'c0', coverage_key: 'v0', category_key: 'k0', context_version: 'ctx-a', resolution: 'absent', expected_state_version: 0 }) }), (error) => error.code === 'ORDINARY_AGGREGATE_STATE_STALE');
  const positive = transition('resolve_presence', 'request-present', { expected_state_version: 1, resolution_ref: 'r1', candidate_key: 'c1', coverage_key: 'v1', category_key: 'k1', context_version: 'ctx-a', resolution: 'materialize', identity_key: 'i1' });
  const admitted = applyOrdinaryAggregateTransition({ aggregate: seeded, transition: positive }); assert.equal(admitted.remaining_identity_budget, 1); assert.equal(admitted.state_version, 2);
  assert.strictEqual(applyOrdinaryAggregateTransition({ aggregate: admitted, transition: positive }), admitted);
  const closed = applyOrdinaryAggregateTransition({ aggregate: admitted, transition: transition('close_coverage', 'request-close', { expected_state_version: 2, coverage_key: 'v2', category_key: 'k2', context_version: 'ctx-a', resolution: 'absent' }) });
  assert.equal(closed.presence_resolutions.length + closed.closed_observation_scopes.length, 2);
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

test('keys use only code-owned normalized identity and reject model text', () => {
  const key = (normalized_candidate_ref) => createOrdinaryCandidateKey({ scope_ref: scope, normalized_candidate_ref, normalizer_version: 'ordinary-normalizer-v1', functional_bucket: 'other_ordinary', admission_class: 'other_restricted', availability_class: 'context_bound', policy_version: 'policy-a' });
  assert.equal(key('normalized-rope'), key('normalized-rope'));
  assert.notEqual(key('normalized-rope'), key('normalized-cordage'));
  assert.throws(() => createOrdinaryCandidateKey({ scope_ref: scope, semantic_type: 'rope', normalizer_version: 'ordinary-normalizer-v1', functional_bucket: 'other_ordinary', admission_class: 'other_restricted', availability_class: 'context_bound', policy_version: 'policy-a' }), (error) => error.code === 'ORDINARY_CANDIDATE_KEY_INVALID');
  let reads = 0; const hostile = {}; Object.defineProperty(hostile, 'scope_ref', { enumerable: true, get() { reads += 1; return scope; } });
  assert.throws(() => createOrdinaryCandidateKey(hostile), (error) => error.code === 'ORDINARY_CANDIDATE_KEY_INVALID'); assert.equal(reads, 0);
  const coverage = createOrdinaryCoverageKey({ scope_ref: scope, coverage_kind: 'unseen-coverage', coverage_ref: 'coverage-ref', policy_version: 'policy-a' });
  assert.notEqual(key('normalized-rope'), coverage);
  assert.notEqual(createOrdinaryResolutionRef({ scope_ref: scope, candidate_key: key('normalized-rope'), coverage_key: coverage, context_version: 'ctx-a', request_identity: 'request-a' }), createOrdinaryResolutionRef({ scope_ref: scope, candidate_key: key('normalized-rope'), coverage_key: coverage, context_version: 'ctx-a', request_identity: 'request-b' }));
  assert.equal(createPreparedGroupRef({ scope_ref: scope, group: commonGroup }), createPreparedGroupRef({ scope_ref: scope, group: commonGroup }));
});

test('malformed persisted aggregate fails typed before native collection operations', () => {
  assert.throws(() => applyOrdinaryAggregateTransition({ aggregate: { ...createOrdinaryAggregate({ scope_ref: scope, resolution_record_cap: 1 }), presence_resolutions: null }, transition: transition('seed', 'seed', { density_band: 'sparse', identity_budget: 1 }) }), (error) => error instanceof MaterializationError && error.code === 'ORDINARY_AGGREGATE_INVALID');
});

test('only the last committed request is idempotent; older retries use ordinary CAS', () => {
  const seeded = applyOrdinaryAggregateTransition({ aggregate: createOrdinaryAggregate({ scope_ref: scope, resolution_record_cap: 3 }), transition: transition('seed', 'seed-a', { density_band: 'ordinary', identity_budget: 2 }) });
  const absent = transition('resolve_presence', 'request-a', { expected_state_version: 1, resolution_ref: 'resolution-a', candidate_key: 'candidate-a', coverage_key: 'coverage-a', category_key: 'category-a', context_version: 'context-a', resolution: 'absent' });
  const afterAbsent = applyOrdinaryAggregateTransition({ aggregate: seeded, transition: absent });
  const closure = transition('close_coverage', 'request-b', { expected_state_version: 2, coverage_key: 'coverage-b', category_key: 'category-b', context_version: 'context-a', resolution: 'no_change' });
  const afterClosure = applyOrdinaryAggregateTransition({ aggregate: afterAbsent, transition: closure });
  assert.strictEqual(applyOrdinaryAggregateTransition({ aggregate: afterClosure, transition: closure }), afterClosure);
  assert.throws(() => applyOrdinaryAggregateTransition({ aggregate: afterClosure, transition: absent }), (error) => error.code === 'ORDINARY_AGGREGATE_STATE_STALE');
  assert.equal(Object.hasOwn(afterClosure, 'committed_request_fingerprints'), false);
});

test('NUL-bearing candidate tuples do not collide in aggregate validation or poison later transitions', () => {
  const seeded = applyOrdinaryAggregateTransition({ aggregate: createOrdinaryAggregate({ scope_ref: scope, resolution_record_cap: 2 }), transition: transition('seed', 'seed-nul', { density_band: 'sparse', identity_budget: 1 }) });
  const first = applyOrdinaryAggregateTransition({ aggregate: seeded, transition: transition('resolve_presence', 'nul-a', { expected_state_version: 1, resolution_ref: 'nul-resolution-a', candidate_key: 'part-a\u0000part-b', coverage_key: 'part-c', category_key: 'category-nul', context_version: 'context-nul', resolution: 'absent' }) });
  const second = applyOrdinaryAggregateTransition({ aggregate: first, transition: transition('resolve_presence', 'nul-b', { expected_state_version: 2, resolution_ref: 'nul-resolution-b', candidate_key: 'part-a', coverage_key: 'part-b\u0000part-c', category_key: 'category-nul', context_version: 'context-nul', resolution: 'absent' }) });
  assert.equal(second.presence_resolutions.length, 2);
  assert.throws(() => applyOrdinaryAggregateTransition({ aggregate: second, transition: transition('resolve_presence', 'nul-cap', { expected_state_version: 3, resolution_ref: 'nul-resolution-c', candidate_key: 'different', coverage_key: 'different', category_key: 'category-nul', context_version: 'context-nul', resolution: 'absent' }) }), (error) => error.code === 'ORDINARY_RESOLUTION_RECORD_CAP_EXCEEDED');
});

test('aggregate reload rejects unknown records, duplicate identities, and corrupted unseeded state', () => {
  const seeded = applyOrdinaryAggregateTransition({ aggregate: createOrdinaryAggregate({ scope_ref: scope, resolution_record_cap: 3 }), transition: transition('seed', 'seed-forgery', { density_band: 'ordinary', identity_budget: 2 }) });
  const first = applyOrdinaryAggregateTransition({ aggregate: seeded, transition: transition('resolve_presence', 'forgery-a', { expected_state_version: 1, resolution_ref: 'forgery-r-a', candidate_key: 'forgery-c-a', coverage_key: 'forgery-v-a', category_key: 'forgery-k-a', context_version: 'forgery-context', resolution: 'materialize', identity_key: 'forgery-i-a' }) });
  const second = applyOrdinaryAggregateTransition({ aggregate: first, transition: transition('resolve_presence', 'forgery-b', { expected_state_version: 2, resolution_ref: 'forgery-r-b', candidate_key: 'forgery-c-b', coverage_key: 'forgery-v-b', category_key: 'forgery-k-b', context_version: 'forgery-context', resolution: 'materialize', identity_key: 'forgery-i-b' }) });
  const duplicateIdentity = structuredClone(second); duplicateIdentity.presence_resolutions[1].identity_key = 'forgery-i-a';
  assert.throws(() => applyOrdinaryAggregateTransition({ aggregate: duplicateIdentity, transition: transition('close_coverage', 'unused-b', { expected_state_version: 3, coverage_key: 'unused-v', category_key: 'unused-k', context_version: 'unused', resolution: 'absent' }) }), (error) => error.code === 'ORDINARY_AGGREGATE_INVALID');
  const unknownRecord = structuredClone(second); unknownRecord.presence_resolutions[0].unexpected = true;
  assert.throws(() => applyOrdinaryAggregateTransition({ aggregate: unknownRecord, transition: transition('close_coverage', 'unused-c', { expected_state_version: 3, coverage_key: 'unused-v', category_key: 'unused-k', context_version: 'unused', resolution: 'absent' }) }), (error) => error.code === 'ORDINARY_AGGREGATE_INVALID');
  assert.throws(() => applyOrdinaryAggregateTransition({ aggregate: { ...createOrdinaryAggregate({ scope_ref: scope, resolution_record_cap: 1 }), density_band: 'sparse' }, transition: transition('seed', 'unused-d', { density_band: 'sparse', identity_budget: 1 }) }), (error) => error.code === 'ORDINARY_AGGREGATE_INVALID');
  assert.throws(() => applyOrdinaryAggregateTransition({ aggregate: { ...seeded, state_version: 100 }, transition: transition('close_coverage', 'forged-version', { expected_state_version: 100, coverage_key: 'forged-v', category_key: 'forged-k', context_version: 'forged-context', resolution: 'absent' }) }), (error) => error.code === 'ORDINARY_AGGREGATE_INVALID');
});

test('immediate replay is bound to the last transition kind', () => {
  const seeded = applyOrdinaryAggregateTransition({ aggregate: createOrdinaryAggregate({ scope_ref: scope, resolution_record_cap: 4 }), transition: transition('seed', 'seed-kind', { density_band: 'ordinary', identity_budget: 2 }) });
  const firstClosure = transition('close_coverage', 'reused-request', { expected_state_version: 1, coverage_key: 'coverage-old', category_key: 'category-old', context_version: 'context-old', resolution: 'absent' });
  const closed = applyOrdinaryAggregateTransition({ aggregate: seeded, transition: firstClosure });
  const resolved = applyOrdinaryAggregateTransition({ aggregate: closed, transition: transition('resolve_presence', 'other-request', { expected_state_version: 2, resolution_ref: 'resolution-new', candidate_key: 'candidate-new', coverage_key: 'coverage-new', category_key: 'category-new', context_version: 'context-new', resolution: 'absent' }) });
  const reused = applyOrdinaryAggregateTransition({ aggregate: resolved, transition: transition('resolve_presence', 'reused-request', { expected_state_version: 3, resolution_ref: 'resolution-reused', candidate_key: 'candidate-reused', coverage_key: 'coverage-reused', category_key: 'category-reused', context_version: 'context-reused', resolution: 'absent' }) });
  assert.throws(() => applyOrdinaryAggregateTransition({ aggregate: reused, transition: { ...firstClosure, expected_state_version: 3 } }), (error) => error.code === 'ORDINARY_COMMITTED_REQUEST_IDENTITY_COLLISION');
});

test('seed accepts only validated prepared groups and remains reload-valid for the next transition', () => {
  assert.throws(() => applyOrdinaryAggregateTransition({ aggregate: createOrdinaryAggregate({ scope_ref: scope, resolution_record_cap: 2 }), transition: transition('seed', 'raw-group-seed', { density_band: 'sparse', identity_budget: 1, background_groups: [commonGroup] }) }), (error) => error.code === 'ORDINARY_AGGREGATE_GROUP_INVALID');
  const prepared = validateOrdinaryBackgroundGroup({ request, group: commonGroup, basis_catalog: bases, allowed_disclosure_policy_refs: ['disclosure-a'] });
  const seeded = applyOrdinaryAggregateTransition({ aggregate: createOrdinaryAggregate({ scope_ref: scope, resolution_record_cap: 2 }), transition: transition('seed', 'prepared-group-seed', { density_band: 'sparse', identity_budget: 1, background_groups: [prepared] }) });
  const reloaded = structuredClone(seeded);
  const next = applyOrdinaryAggregateTransition({ aggregate: reloaded, transition: transition('close_coverage', 'prepared-group-next', { expected_state_version: 1, coverage_key: 'prepared-coverage', category_key: 'prepared-category', context_version: 'prepared-context', resolution: 'absent' }) });
  assert.equal(next.state_version, 2);
});
