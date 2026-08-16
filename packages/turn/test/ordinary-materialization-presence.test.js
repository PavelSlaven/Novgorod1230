import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveOrdinaryMaterializationPresence } from '../src/index.js';
import {
  createOrdinaryAggregate,
  canonicalDigest,
  createOrdinaryCandidateKey,
  createOrdinaryCategoryKey,
  createOrdinaryContextVersion,
  createOrdinaryCoverageKey,
  createOrdinaryMaterializationWorkingProjection,
  refreshOrdinaryMaterializationWorkingProjection
} from '@rus/materialization';

const scope_ref = { entity_kind: 'g6', entity_id: 'scope-a' };
const candidate = { semantic_type: 'spoon', coverage_kind: 'visible_surface', coverage_ref: 'bench', policy_version: 'presence',
  functional_bucket: 'household', admission_class: 'common_mundane', availability_class: 'common' };

function request() {
  return { schema: 'ordinary_materialization_request_v1', request_id: 'presence-1',
    mode: 'resolve_presence', scope_ref,
    context_refs: { period_ref: 'period', region_ref: 'region', function_refs: [], environment_refs: [], occupation_household_refs: [], economic_context_ref: 'economy', occupancy_state_ref: 'occupied', material_culture_refs: [], property_context_ref: 'property' },
    policy_refs: { authority_policy_ref: 'authority', density_policy_ref: 'density', ordinary_presence_policy_ref: 'presence', runtime_item_mechanics_policy_ref: 'mechanics', allowed_admission_classes: ['common_mundane'], context_bound_permission_refs: [], allowed_supporting_bases: [{ basis_ref: 'basis-a', basis_state: 'prepared_seed' }] },
    ordinary_state: { seeded: true, density_band: 'ordinary', remaining_identity_budget: 1, background_groups: [], presence_resolutions: [], closed_observation_scopes: [] },
    candidate_query: { candidate_key: candidate.candidate_key, candidate_hint: 'простая ложка', coverage_key: candidate.coverage_key, evidence_weight: 0 },
    technical_limits: { max_new_entities: 1, max_new_background_groups: 1, max_resolution_records: 4 } };
}
Object.assign(candidate, {
  candidate_key: createOrdinaryCandidateKey({ scope_ref, ...candidate }),
  coverage_key: createOrdinaryCoverageKey({ scope_ref, coverage_kind: candidate.coverage_kind, coverage_ref: candidate.coverage_ref, policy_version: candidate.policy_version }),
  category_key: createOrdinaryCategoryKey({ scope_ref, functional_bucket: candidate.functional_bucket, admission_class: candidate.admission_class, availability_class: candidate.availability_class, policy_version: candidate.policy_version }),
  context_version: createOrdinaryContextVersion({ scope_ref, context_refs: request().context_refs, ordinary_presence_policy_ref: 'presence', property_basis_ref: 'property', property_placement_context_digest: propertyPlacementDigest() })
});
function projection(identity_budget = 1) {
  const initial = createOrdinaryMaterializationWorkingProjection({
    ordinary_aggregate: createOrdinaryAggregate({ scope_ref, resolution_record_cap: 4 })
  });
  return refreshOrdinaryMaterializationWorkingProjection({ working_projection: initial,
    ordinary_transition: { kind: 'seed', request_identity: 'seed', expected_state_version: 0,
      density_band: 'ordinary', identity_budget, background_groups: [] } });
}
const basisCatalog = [{ basis_ref: 'basis-a', state: 'prepared_seed', scope_ref,
  prepared_seed_provenance: { seed_request_id: 'seed', mode: 'seed_scope', candidate_query: null },
  policy: { functional_buckets: ['household'], allowed_admission_classes: ['common_mundane'], permission_refs: [] } }];
function negative(resolution = 'absent') { return { schema: 'ordinary_materialization_plan_v1', request_id: 'presence-1', resolution, density_band_proposal: null, background_groups: [], entities: [], presence_resolutions: [{ candidate_key: candidate.candidate_key, coverage_key: candidate.coverage_key, resolution }], reason_code: 'observed' }; }
function entity(overrides = {}) { return { semantic_descriptor: { semantic_type: 'spoon', name: 'простая ложка', facts: [] }, authority_class: 'ordinary', admission_class: 'common_mundane', availability_class: 'common', functional_bucket: 'household', presence_expectation: 'routine', supporting_basis_ref: 'basis-a', causal_basis: { basis_kind: 'household_use', basis_refs: ['basis-a'] }, property_basis_ref: 'property', placement_proposal: { scope_ref: 'scope-a', position_ref: 'bench' }, mechanics_proposal: { mass_grams: 30, external_hand_cost: 0, carry_form: 'small', packing_slot_cost: 0, quantity: { value: 1, unit: 'item' }, container: null }, ...overrides }; }
function materialize() { return { ...negative('materialize'), entities: [entity()], presence_resolutions: [] }; }
function propertyPlacementContext() { return { scope_ref, item_kind: 'man_made', property_catalog_version_ref: 'property-v1', placement_catalog_version_ref: 'placement-v1', personal_communal_refs: [], occupied_site_refs: ['house'], unowned_cause_refs: [], placement_context_refs: ['scene'], property_catalog: [{ property_basis_ref: 'property', state: 'committed', scope_ref, basis_class: 'occupied_site_default', source_ref: 'house', unowned_cause_ref: null }], placement_catalog: [{ position_ref: 'bench', state: 'committed', scope_ref, position_kind: 'scene_position', g6_ref: 'scope-a', containment_depth: 1, placement_context_ref: 'scene' }] }; }
function propertyPlacementDigest() { return canonicalDigest({ domain: 'rus.items.ordinary_world_property_placement_context.v1', ...propertyPlacementContext() }); }
function envelope() { return { schema: 'ordinary_materialization_presence_envelope_v1', request: request(), identity: structuredClone(candidate), ordinary_state_version: 1, property_placement_context: propertyPlacementContext(), property_placement_context_digest: propertyPlacementDigest() }; }
function input(model, overrides = {}) { return { envelope: envelope(), ordinaryMaterializationModel: model, workingProjection: projection(), basisCatalog, ...overrides }; }

test('Stage B sends only targeted candidate wording with zero evidence and records negative resolution', async () => {
  const output = await resolveOrdinaryMaterializationPresence(input(async (safe) => {
    assert.deepEqual(safe.candidate_query, request().candidate_query);
    assert.equal(safe.candidate_query.evidence_weight, 0);
    return negative();
  }));
  assert.equal(output.status, 'absent');
  assert.equal(output.working_projection.ordinary_aggregate.presence_resolutions.length, 1);
  assert.equal(output.pending_items_property_admission, null);
});

test('Stage B never rerolls an exact known resolution', async () => {
  const known = await resolveOrdinaryMaterializationPresence(input(async () => negative()));
  let calls = 0;
  const replay = await resolveOrdinaryMaterializationPresence(input(async () => { calls += 1; return negative(); }, { workingProjection: known.working_projection }));
  assert.equal(replay.status, 'already_resolved');
  assert.equal(calls, 0);
});

test('Stage B rejects swapped identity and proposed position outside committed placement', async () => {
  const swapped = envelope(); swapped.identity.context_version = 'other';
  await assert.rejects(() => resolveOrdinaryMaterializationPresence(input(async () => negative(), { envelope: swapped })), { code: 'TURN_ORDINARY_PRESENCE_ENVELOPE_INVALID' });
  await assert.rejects(() => resolveOrdinaryMaterializationPresence(input(async () => {
    const plan = materialize(); plan.entities[0].placement_proposal.position_ref = 'other'; return plan;
  })), { code: 'TURN_ORDINARY_PRESENCE_PLAN_REJECTED' });
});

test('Stage B rejects positive plans without compatible basis or budget and defers item admission', async () => {
  let calls = 0;
  assert.equal((await resolveOrdinaryMaterializationPresence(input(async () => { calls += 1; return materialize(); }, { basisCatalog: [] }))).status, 'authority_required');
  assert.equal((await resolveOrdinaryMaterializationPresence(input(async () => { calls += 1; return materialize(); }, { workingProjection: projection(0) }))).status, 'no_change');
  assert.equal(calls, 0);
  const output = await resolveOrdinaryMaterializationPresence(input(async () => materialize()));
  assert.equal(output.status, 'pending_items_property_admission');
  assert.equal(output.working_projection.ordinary_aggregate.presence_resolutions.length, 0);
  assert.equal(output.pending_items_property_admission.status, 'pending_items_property_admission');
  assert.equal(output.pending_items_property_admission.admission_evidence
    .runtime_item_mechanics_policy_ref, 'mechanics');
});

test('a code-owned authority gate records the negative resolution without invoking Stage B', async () => {
  let calls = 0;
  const output = await resolveOrdinaryMaterializationPresence(input(async () => {
    calls += 1;
    return materialize();
  }, { codeOwnedResolution: 'authority_required' }));
  assert.equal(calls, 0);
  assert.equal(output.status, 'authority_required');
  assert.equal(output.working_projection.ordinary_aggregate.presence_resolutions[0].resolution,
    'authority_required');
});

test('O2a context-bound presence requires the exact approved permission set and committed basis', async () => {
  const contextCandidate = { semantic_type: 'ordinary_weapon', coverage_kind: 'visible_surface',
    coverage_ref: 'weapon-rack', policy_version: 'presence', functional_bucket: 'arms',
    admission_class: 'weapon_or_armament', availability_class: 'context_bound' };
  const contextRequest = request();
  contextRequest.policy_refs = { ...contextRequest.policy_refs,
    allowed_admission_classes: ['weapon_or_armament'],
    context_bound_permission_refs: ['armament-profile', 'weapon-source'],
    allowed_supporting_bases: [{ basis_ref: 'basis-arms', basis_state: 'committed' }] };
  Object.assign(contextCandidate, {
    candidate_key: createOrdinaryCandidateKey({ scope_ref, ...contextCandidate }),
    coverage_key: createOrdinaryCoverageKey({ scope_ref, coverage_kind: contextCandidate.coverage_kind,
      coverage_ref: contextCandidate.coverage_ref, policy_version: contextCandidate.policy_version }),
    category_key: createOrdinaryCategoryKey({ scope_ref, functional_bucket: 'arms',
      admission_class: 'weapon_or_armament', availability_class: 'context_bound',
      policy_version: 'presence' }),
    context_version: createOrdinaryContextVersion({ scope_ref,
      context_refs: contextRequest.context_refs, ordinary_presence_policy_ref: 'presence',
      property_basis_ref: 'property', property_placement_context_digest: propertyPlacementDigest() })
  });
  contextRequest.candidate_query = { candidate_key: contextCandidate.candidate_key,
    candidate_hint: 'оружие', coverage_key: contextCandidate.coverage_key, evidence_weight: 0 };
  const contextEnvelope = { schema: 'ordinary_materialization_presence_envelope_v1',
    request: contextRequest, identity: contextCandidate, ordinary_state_version: 1,
    property_placement_context: propertyPlacementContext(),
    property_placement_context_digest: propertyPlacementDigest() };
  const contextBasis = [{ basis_ref: 'basis-arms', state: 'committed', scope_ref,
    prepared_seed_provenance: null, policy: { functional_buckets: ['arms'],
      allowed_admission_classes: ['weapon_or_armament'],
      permission_refs: ['armament-profile', 'weapon-source'] },
    basis_kind: 'personal_possession' }];
  const output = await resolveOrdinaryMaterializationPresence({ envelope: contextEnvelope,
    workingProjection: projection(), basisCatalog: contextBasis,
    ordinaryMaterializationModel: async () => ({ ...negative('materialize'),
      entities: [entity({ semantic_descriptor: { semantic_type: 'ordinary_weapon',
        name: 'неописанный предмет', facts: [] }, admission_class: 'weapon_or_armament',
      availability_class: 'context_bound', functional_bucket: 'arms',
      supporting_basis_ref: 'basis-arms', causal_basis: { basis_kind: 'personal_possession',
        basis_refs: ['basis-arms'] } })], presence_resolutions: [] }) });
  assert.equal(output.status, 'pending_items_property_admission');
  assert.deepEqual(output.pending_items_property_admission.admission_evidence.permission_refs,
    ['armament-profile', 'weapon-source']);
  const missingPermissionBasis = [{ ...contextBasis[0], policy: {
    ...contextBasis[0].policy, permission_refs: ['armament-profile'] } }];
  assert.equal((await resolveOrdinaryMaterializationPresence({ envelope: contextEnvelope,
    workingProjection: projection(), basisCatalog: missingPermissionBasis,
    ordinaryMaterializationModel: async () => negative() })).status, 'authority_required');

  for (const semantic_descriptor of [
    { semantic_type: 'swapped_weapon_type', name: 'совершенно свободное имя', facts: [] },
    { semantic_type: 'ordinary_weapon', name: 'совершенно свободное имя', facts: ['evidence'] }
  ]) await assert.rejects(() => resolveOrdinaryMaterializationPresence({ envelope: contextEnvelope,
    workingProjection: projection(), basisCatalog: contextBasis,
    ordinaryMaterializationModel: async () => ({ ...negative('materialize'),
      entities: [entity({ semantic_descriptor, admission_class: 'weapon_or_armament',
        availability_class: 'context_bound', functional_bucket: 'arms',
        supporting_basis_ref: 'basis-arms', causal_basis: { basis_kind: 'personal_possession',
          basis_refs: ['basis-arms'] } })], presence_resolutions: [] }) }),
  { code: 'TURN_ORDINARY_PRESENCE_PLAN_REJECTED' });
});

test('O2a rejects model attempts to smuggle hidden, historical, or significant truth through a valid armament envelope', async () => {
  const contextCandidate = { semantic_type: 'ordinary_weapon', coverage_kind: 'visible_surface',
    coverage_ref: 'weapon-rack', policy_version: 'presence', functional_bucket: 'arms',
    admission_class: 'weapon_or_armament', availability_class: 'context_bound' };
  const contextRequest = request();
  contextRequest.policy_refs = { ...contextRequest.policy_refs,
    allowed_admission_classes: ['weapon_or_armament'],
    context_bound_permission_refs: ['armament-profile', 'weapon-source'],
    allowed_supporting_bases: [{ basis_ref: 'basis-arms', basis_state: 'committed' }] };
  Object.assign(contextCandidate, {
    candidate_key: createOrdinaryCandidateKey({ scope_ref, ...contextCandidate }),
    coverage_key: createOrdinaryCoverageKey({ scope_ref, coverage_kind: contextCandidate.coverage_kind,
      coverage_ref: contextCandidate.coverage_ref, policy_version: contextCandidate.policy_version }),
    category_key: createOrdinaryCategoryKey({ scope_ref, functional_bucket: 'arms',
      admission_class: 'weapon_or_armament', availability_class: 'context_bound',
      policy_version: 'presence' }),
    context_version: createOrdinaryContextVersion({ scope_ref,
      context_refs: contextRequest.context_refs, ordinary_presence_policy_ref: 'presence',
      property_basis_ref: 'property', property_placement_context_digest: propertyPlacementDigest() })
  });
  contextRequest.candidate_query = { candidate_key: contextCandidate.candidate_key,
    candidate_hint: 'оружие', coverage_key: contextCandidate.coverage_key, evidence_weight: 0 };
  const contextEnvelope = { schema: 'ordinary_materialization_presence_envelope_v1',
    request: contextRequest, identity: contextCandidate, ordinary_state_version: 1,
    property_placement_context: propertyPlacementContext(),
    property_placement_context_digest: propertyPlacementDigest() };
  const contextBasis = [{ basis_ref: 'basis-arms', state: 'committed', scope_ref,
    prepared_seed_provenance: null, policy: { functional_buckets: ['arms'],
      allowed_admission_classes: ['weapon_or_armament'],
      permission_refs: ['armament-profile', 'weapon-source'] }, basis_kind: 'personal_possession' }];
  for (const fact of ['hidden', 'historical', 'significant', 'evidence']) {
    await assert.rejects(() => resolveOrdinaryMaterializationPresence({ envelope: contextEnvelope,
      workingProjection: projection(), basisCatalog: contextBasis,
      ordinaryMaterializationModel: async () => ({ ...negative('materialize'),
        entities: [entity({ semantic_descriptor: { semantic_type: 'ordinary_weapon',
          name: 'прикладное оружие', facts: [fact] }, admission_class: 'weapon_or_armament',
          availability_class: 'context_bound', functional_bucket: 'arms',
          supporting_basis_ref: 'basis-arms', causal_basis: { basis_kind: 'personal_possession',
            basis_refs: ['basis-arms'] } })], presence_resolutions: [] }) }),
    { code: 'TURN_ORDINARY_PRESENCE_PLAN_REJECTED' }, fact);
  }
});
