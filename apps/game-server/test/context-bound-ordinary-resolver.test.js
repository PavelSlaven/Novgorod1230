import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest, createOrdinaryAggregate } from '@rus/materialization';
import { createLowerDvinaTraceOrdinaryDiscoveryResolver } from
  '../src/runtime/lower-dvina-trace-ordinary-discovery.js';
import { resolveContextBoundOrdinaryPolicy } from
  '../src/runtime/context-bound-ordinary-policy.js';

const scope_ref = { entity_kind: 'g6', entity_id: 'shore' };
const permissions = ['armament:profile', 'armament:source'];
const property = { scope_ref, item_kind: 'man_made',
  property_catalog_version_ref: 'property-v1', placement_catalog_version_ref: 'placement-v1',
  personal_communal_refs: [], occupied_site_refs: ['warrior-house'], unowned_cause_refs: [],
  placement_context_refs: ['scene'], property_catalog: [{ property_basis_ref: 'property',
    state: 'committed', scope_ref, basis_class: 'occupied_site_default',
    source_ref: 'warrior-house', unowned_cause_ref: null }], placement_catalog: [{
    position_ref: 'bench', state: 'committed', scope_ref, position_kind: 'scene_position',
    g6_ref: 'shore', containment_depth: 1, placement_context_ref: 'scene' }] };

function enabled({ admission_class = 'weapon_or_armament', semantic_type = 'ordinary_spear',
  withProfile = true } = {}) {
  const supporting_bases = [{ basis_ref: 'armament:source', state: 'committed',
    scope_ref: structuredClone(scope_ref), prepared_seed_provenance: null,
    functional_buckets: ['arms'], allowed_admission_classes: [admission_class],
    permission_refs: permissions, basis_kind: 'personal_possession' }];
  const objective_context = { request_id: 'enablement', scope_ref: structuredClone(scope_ref),
    context_refs: { period_ref: 'period', region_ref: 'region', function_refs: [],
      environment_refs: [], occupation_household_refs: [], economic_context_ref: 'economy',
      occupancy_state_ref: 'occupied', material_culture_refs: [], property_context_ref: 'property' },
    policy_refs: { authority_policy_ref: 'authority', density_policy_ref: 'density',
      ordinary_presence_policy_ref: 'presence', runtime_item_mechanics_policy_ref: 'mechanics',
      allowed_admission_classes: [admission_class], context_bound_permission_refs: permissions,
      allowed_supporting_bases: [{ basis_ref: 'armament:source', basis_state: 'committed' }] },
    technical_limits: { max_new_entities: 1, max_new_background_groups: 1,
      max_resolution_records: 4 }, ordinary_state: { seeded: false, density_band: null,
      remaining_identity_budget: 0, background_groups: [], presence_resolutions: [],
      closed_observation_scopes: [] } };
  const execution_context = { supporting_bases, allowed_disclosure_policy_refs: ['disclosure'],
    identity_budget: { policy_version: 'density', density_band: 'ordinary', identity_budget: 1,
      source: 'policy' }, candidate_context: { target_ref: 'shore', semantic_type,
      candidate_hint: null, functional_bucket: 'arms', admission_class,
      availability_class: 'context_bound', coverage_kind: 'visible_surface',
      coverage_ref: 'armament-rack', policy_version: 'presence' },
    mechanics_policy: { policy_ref: 'mechanics', max_mass_grams: 1000,
      allowed_external_hand_costs: [0, 1, 2], allowed_carry_forms: ['compact', 'regular'],
      max_packing_slot_cost: 10, max_quantity: 10 }, causal_ref: 'cause', source_refs: [] };
  if (withProfile) execution_context.context_bound_ordinary_profile = {
    schema: 'rus.items.context_bound_ordinary_profile.v1', version: 1,
    profile_ref: 'armament:profile', state: 'committed', scope_ref: structuredClone(scope_ref),
    profile_kind: 'armament', semantic_type: 'ordinary_spear', functional_bucket: 'arms',
    admission_class: 'weapon_or_armament', permission_refs: permissions,
    source_basis_ref: 'armament:source', property_basis_ref: 'property',
    runtime_item_mechanics_policy_ref: 'mechanics', mechanics_capability_ref: 'combat:mechanics'
  };
  return { objective_context, objective_digest: canonicalDigest(objective_context),
    ordinary_aggregate: createOrdinaryAggregate({ scope_ref: structuredClone(scope_ref),
      resolution_record_cap: 4 }), property_placement_context: JSON.parse(JSON.stringify(property)),
    version_pins: { party_state_version: 0, ordinary_state_version: 0, catalog_version: 1,
      property_version: 1, placement_version: 1, supporting_basis_catalog_version: 1,
      supporting_basis_catalog_digest: canonicalDigest({ domain: 'ordinary_supporting_basis_catalog_v1',
        supporting_bases }), property_placement_context_digest: canonicalDigest({
        domain: 'rus.items.ordinary_world_property_placement_context.v1', ...property }) },
    execution_context };
}
function request() { return { request: { root_turn_id: 'turn:party:1' },
  committed_state: { position: { g6_id: 'shore' } },
  operation: { target_refs: ['shore'], query: 'свободная формулировка' }, working_projection: {} }; }
function model(request) {
  if (request.mode === 'seed_scope') return { schema: 'ordinary_materialization_plan_v1',
    request_id: request.request_id, resolution: 'seeded', density_band_proposal: 'ordinary',
    background_groups: [], entities: [], presence_resolutions: [], reason_code: 'seed' };
  return { schema: 'ordinary_materialization_plan_v1', request_id: request.request_id,
    resolution: 'materialize', density_band_proposal: null, background_groups: [],
    presence_resolutions: [], reason_code: 'approved', entities: [{
      semantic_descriptor: { semantic_type: 'ordinary_spear', name: 'профильное имя', facts: [] },
      authority_class: 'ordinary', admission_class: 'weapon_or_armament',
      availability_class: 'context_bound', functional_bucket: 'arms', presence_expectation: 'routine',
      supporting_basis_ref: 'armament:source', causal_basis: { basis_kind: 'personal_possession',
        basis_refs: ['armament:source'] }, property_basis_ref: 'property',
      placement_proposal: { scope_ref: 'shore', position_ref: 'bench' },
      mechanics_proposal: { mass_grams: 500, external_hand_cost: 1, carry_form: 'regular',
        packing_slot_cost: 1, quantity: { value: 1, unit: 'item' }, container: null }
    }] };
}

test('approved armament profile reaches the same bounded presence and P16 plan', async () => {
  const fixture = enabled();
  const policy = resolveContextBoundOrdinaryPolicy(JSON.parse(JSON.stringify({ objective_context: fixture.objective_context,
    execution_context: fixture.execution_context,
    candidate_context: fixture.execution_context.candidate_context,
    scope_ref, property_placement_context: fixture.property_placement_context })));
  assert.equal(policy.resolution, null);
  assert.equal(policy.profile.condition_state, 'serviceable');
  assert.equal(policy.profile.basis_kind, 'personal_possession');
  let calls = 0;
  const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId: 'party',
    inputDigest: 'input', loadEnablement: async () => JSON.parse(JSON.stringify(enabled())),
    ordinaryMaterializationModel: async (input) => { calls += 1; return model(input); } });
  const result = await resolver(request());
  assert.equal(calls, 2);
  assert.equal(result.ordinary_materialization_atomic_write_plan.resolution, 'materialize');
  assert.equal(result.ordinary_materialization_atomic_write_plan.item.admission_class,
    'weapon_or_armament');
  assert.deepEqual(result.ordinary_materialization_atomic_write_plan.item.permission_refs, permissions);
});

test('unseen armament, ordinary yard and currency stop before either model stage', async () => {
  for (const input of [enabled({ semantic_type: 'unseen_weapon' }), enabled({ withProfile: false }),
    enabled({ admission_class: 'currency_or_precious', semantic_type: 'authentic_coin' })]) {
    let calls = 0;
    const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId: 'party',
      inputDigest: 'input', loadEnablement: async () => input,
      ordinaryMaterializationModel: async () => { calls += 1; return {}; } });
    const result = await resolver(request());
    assert.equal(calls, 0);
    assert.equal(Object.hasOwn(result, 'ordinary_materialization_atomic_write_plan'), false);
  }
});

test('hostile armament profile is rejected without getter execution or model call', async () => {
  const value = JSON.parse(JSON.stringify(enabled())); let reads = 0; let calls = 0;
  Object.defineProperty(value.execution_context.context_bound_ordinary_profile, 'semantic_type', {
    enumerable: true, get() { reads += 1; return 'ordinary_spear'; }
  });
  const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId: 'party',
    inputDigest: 'input', loadEnablement: async () => value,
    ordinaryMaterializationModel: async () => { calls += 1; return {}; } });
  const result = await resolver(request());
  assert.equal(reads, 0);
  assert.equal(calls, 0);
  assert.equal(Object.hasOwn(result, 'ordinary_materialization_atomic_write_plan'), false);
});

test('entire loaded enablement is snapshotted before any getter can run', async () => {
  const paths = [
    (value, read) => Object.defineProperty(value, 'execution_context', { enumerable: true,
      get() { read(); return null; } }),
    (value, read) => Object.defineProperty(value.execution_context.candidate_context,
      'semantic_type', { enumerable: true, get() { read(); return 'ordinary_spear'; } }),
    (value, read) => Object.defineProperty(value.execution_context.context_bound_ordinary_profile,
      'profile_ref', { enumerable: true, get() { read(); return 'armament:profile'; } }),
    (value, read) => Object.defineProperty(value.execution_context.supporting_bases[0], 'basis_ref',
      { enumerable: true, get() { read(); return 'armament:source'; } }),
    (value, read) => Object.defineProperty(value.property_placement_context.property_catalog[0],
      'property_basis_ref', { enumerable: true, get() { read(); return 'property'; } }),
    (value, read) => Object.defineProperty(value.version_pins, 'party_state_version',
      { enumerable: true, get() { read(); return 0; } }),
    (value, read) => Object.defineProperty(value.ordinary_aggregate, 'state_version',
      { enumerable: true, get() { read(); return 0; } })
  ];
  for (const install of paths) {
    const value = JSON.parse(JSON.stringify(enabled())); let reads = 0; let calls = 0;
    install(value, () => { reads += 1; });
    const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId: 'party',
      inputDigest: 'input', loadEnablement: async () => value,
      ordinaryMaterializationModel: async () => { calls += 1; return {}; } });
    const result = await resolver(request());
    assert.equal(reads, 0);
    assert.equal(calls, 0);
    assert.equal(Object.hasOwn(result, 'ordinary_materialization_atomic_write_plan'), false);
  }
});
