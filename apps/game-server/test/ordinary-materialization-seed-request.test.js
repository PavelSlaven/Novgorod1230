import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOrdinaryMaterializationSeedScopeRequest } from
  '../src/runtime/ordinary-materialization-seed-request.js';
import { buildOrdinaryMaterializationPresenceRequest } from
  '../src/runtime/ordinary-materialization-seed-request.js';

function objective() {
  return { request_id: 'seed-1', scope_ref: { entity_kind: 'g6', entity_id: 'scope' },
    context_refs: { period_ref: 'period', region_ref: 'region', function_refs: [], environment_refs: [], occupation_household_refs: [], economic_context_ref: 'economy', occupancy_state_ref: 'occupied', material_culture_refs: [], property_context_ref: 'property' },
    policy_refs: { authority_policy_ref: 'authority', density_policy_ref: 'density', ordinary_presence_policy_ref: 'presence', runtime_item_mechanics_policy_ref: 'mechanics', allowed_admission_classes: ['common_mundane'], context_bound_permission_refs: [], allowed_supporting_bases: [] },
    ordinary_state: { seeded: false, density_band: null, remaining_identity_budget: 0, background_groups: [], presence_resolutions: [], closed_observation_scopes: [] },
    technical_limits: { max_new_entities: 1, max_new_background_groups: 1, max_resolution_records: 1 } };
}

test('ordinary Stage A builder is deterministic and excludes player poison by closed shape', () => {
  const clean = { objective_context: objective() };
  const first = buildOrdinaryMaterializationSeedScopeRequest(clean);
  const second = buildOrdinaryMaterializationSeedScopeRequest(clean);
  assert.deepEqual(first, second);
  assert.equal(first.mode, 'seed_scope');
  assert.equal(first.candidate_query, null);
  for (const key of ['raw_action', 'candidate', 'desired_use', 'utility', 'risk', 'narration']) {
    if (key !== 'candidate') {
      assert.equal(JSON.stringify(first).includes(key), false);
    }
    assert.throws(() => buildOrdinaryMaterializationSeedScopeRequest({
      objective_context: { ...objective(), [key]: 'poison' }
    }), { code: 'ORDINARY_SEED_REQUEST_OBJECTIVE_INVALID' });
  }
});

test('ordinary Stage A builder rejects accessors without reading them', () => {
  let reads = 0;
  const hostile = { objective_context: objective() };
  Object.defineProperty(hostile, 'objective_context', { enumerable: true,
    get() { reads += 1; return objective(); } });
  assert.throws(() => buildOrdinaryMaterializationSeedScopeRequest(hostile),
    { code: 'ORDINARY_SEED_REQUEST_INPUT_INVALID' });
  assert.equal(reads, 0);
});

test('ordinary Stage A builder rejects non-data values, aliases, symbols and exotic arrays', () => {
  const variants = [];
  const withUndefined = objective(); withUndefined.context_refs.period_ref = undefined;
  variants.push(withUndefined);
  const withFunction = objective(); withFunction.context_refs.period_ref = () => 'period';
  variants.push(withFunction);
  const withNonfinite = objective(); withNonfinite.technical_limits.max_new_entities = Infinity;
  variants.push(withNonfinite);
  const withSymbol = objective(); withSymbol.context_refs[Symbol('poison')] = true;
  variants.push(withSymbol);
  const alias = objective(); alias.context_refs.environment_refs = alias.context_refs.function_refs;
  variants.push(alias);
  const exoticArray = objective(); Object.setPrototypeOf(exoticArray.context_refs.function_refs, null);
  variants.push(exoticArray);
  const cyclic = objective(); cyclic.context_refs.loop = cyclic;
  variants.push(cyclic);
  for (const objective_context of variants) {
    assert.throws(() => buildOrdinaryMaterializationSeedScopeRequest({ objective_context }),
      { code: 'ORDINARY_SEED_REQUEST_OBJECTIVE_INVALID' });
  }
});

test('ordinary Stage B builder deterministically owns candidate and coverage identity', () => {
  const objective_context = { ...objective(), ordinary_state_version: 0,
    property_placement_context: propertyPlacementContext() };
  const input = { objective_context, candidate_context: candidateContext(),
    selected_supporting_basis_ref: null };
  const first = buildOrdinaryMaterializationPresenceRequest(input);
  const second = buildOrdinaryMaterializationPresenceRequest(input);
  assert.deepEqual(first, second);
  assert.equal(first.request.mode, 'resolve_presence');
  assert.equal(first.request.candidate_query.evidence_weight, 0);
  assert.deepEqual(first.request.authority_envelope, {
    stage: 'resolve_presence', candidate: {
      semantic_type: 'spoon', functional_bucket: 'household',
      admission_class: 'common_mundane', availability_class: 'common',
      coverage_kind: 'visible_surface', coverage_ref: 'bench' },
    allowed_supporting_bases: [], selected_supporting_basis_ref: null,
    property_basis_ref: 'property',
    placement_refs: ['bench'] });
  assert.match(first.identity.candidate_key, /^ordinary_candidate_/);
  assert.match(first.identity.coverage_key, /^ordinary_coverage_/);
  assert.equal(JSON.stringify(first).includes('desired_use'), false);
  assert.equal(JSON.stringify(first.request.authority_envelope)
    .includes('простая ложка'), false);
});

test('ordinary Stage A builder carries only committed group constraints', () => {
  const request = buildOrdinaryMaterializationSeedScopeRequest({
    objective_context: objective(), authority_context: {
      stage: 'seed_scope', density_bands: ['ordinary'],
      disclosure_policy_refs: ['disclosure'], group_bases: [{
        basis_ref: 'basis', basis_state: 'committed',
        functional_buckets: ['household'],
        allowed_admission_classes: ['common_mundane'], permission_refs: []
      }] } });
  assert.equal(request.authority_envelope.stage, 'seed_scope');
  assert.equal(JSON.stringify(request.authority_envelope).includes('candidate_hint'), false);
});

test('ordinary Stage B builder rejects a property-basis getter without invoking it', () => {
  let reads = 0;
  const objective_context = { ...objective(), ordinary_state_version: 0,
    property_placement_context: propertyPlacementContext() };
  Object.defineProperty(objective_context.property_placement_context, 'property_catalog', {
    enumerable: true, get() { reads += 1; return 'property'; }
  });
  assert.throws(() => buildOrdinaryMaterializationPresenceRequest({ objective_context,
    candidate_context: candidateContext(), selected_supporting_basis_ref: null }), { code: 'ORDINARY_PRESENCE_REQUEST_OBJECTIVE_INVALID' });
  assert.equal(reads, 0);
});

function propertyPlacementContext() { const scope_ref = { entity_kind: 'g6', entity_id: 'scope' }; return { scope_ref, item_kind: 'man_made', property_catalog_version_ref: 'property-v1', placement_catalog_version_ref: 'placement-v1', personal_communal_refs: [], occupied_site_refs: ['house'], unowned_cause_refs: [], placement_context_refs: ['scene'], property_catalog: [{ property_basis_ref: 'property', state: 'committed', scope_ref: { ...scope_ref }, basis_class: 'occupied_site_default', source_ref: 'house', unowned_cause_ref: null }], placement_catalog: [{ position_ref: 'bench', state: 'committed', scope_ref: { ...scope_ref }, position_kind: 'scene_position', g6_ref: 'scope', containment_depth: 1, placement_context_ref: 'scene' }] }; }
function candidateContext() { return { normalized_candidate_ref: 'spoon',
  normalizer_version: 'ordinary-normalizer-v1', semantic_type: 'spoon',
  candidate_hint: 'простая ложка', functional_bucket: 'household',
  admission_class: 'common_mundane', availability_class: 'common',
  coverage_kind: 'visible_surface', coverage_ref: 'bench', policy_version: 'presence' }; }
