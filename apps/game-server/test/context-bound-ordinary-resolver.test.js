import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest, createOrdinaryAggregate } from '@rus/materialization';
import { ordinaryWorldPropertyPlacementContextDigest } from '@rus/items-property';
import { createLowerDvinaTraceOrdinaryDiscoveryResolver } from
  '../src/runtime/lower-dvina-trace-ordinary-discovery.js';
import { resolveContextBoundOrdinaryPolicy } from
  '../src/runtime/context-bound-ordinary-policy.js';

const scope_ref = { entity_kind: 'g6', entity_id: 'shore' };
const permissions = ['armament:profile', 'armament:source'];
const property = { schema: 'rus.items.ordinary_world_property_placement_context.v2',
  version: 2, scope_ref, item_kind: 'man_made',
  property_catalog_version_ref: 'property-v1', placement_catalog_version_ref: 'placement-v1',
  explicit_item_source_refs: [], personal_possession_refs: [],
  communal_public_service_refs: [], container_property_refs: [],
  occupied_site_refs: ['warrior-house'], unowned_cause_refs: [],
  placement_context_refs: ['scene'], property_catalog: [{ property_basis_ref: 'property',
    state: 'committed', scope_ref, basis_class: 'occupied_site_default',
    source_ref: 'warrior-house', unowned_cause_ref: null,
    unowned_cause_kind: null }], placement_catalog: [{
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
    density_policy: { version: 'density', mappings: [{ scope_kind: 'g6',
      function_ref: null, bands: { sparse: 0, ordinary: 1, dense: 1 } }] },
    candidate_context: { target_ref: 'shore', semantic_type,
      candidate_ref_namespace: 'test-context-bound',
      normalizer_version: 'ordinary-normalizer-v1', candidate_hint: null,
      functional_bucket: 'arms', admission_class,
      availability_class: 'context_bound', coverage_kind: 'visible_surface',
      coverage_ref: 'armament-rack', policy_version: 'presence' },
    stage_b_classification_eval: {},
    mechanics_policy: { policy_ref: 'mechanics', max_mass_grams: 1000,
      allowed_external_hand_costs: [0, 1, 2], allowed_carry_forms: ['compact', 'regular'],
      max_packing_slot_cost: 10, max_quantity: 10 }, causal_ref: 'cause', source_refs: [] };
  if (withProfile) execution_context.context_bound_ordinary_profile = {
    schema: 'rus.items.context_bound_ordinary_profile.v1', version: 1,
    profile_ref: 'armament:profile', state: 'committed', scope_ref: structuredClone(scope_ref),
    profile_kind: 'armament', semantic_type: 'ordinary_spear', functional_bucket: 'arms',
    admission_class: 'weapon_or_armament', permission_refs: permissions,
    source_basis_ref: 'armament:source', property_basis_ref: 'property',
    runtime_item_mechanics_policy_ref: 'mechanics', mechanics_capability_ref: 'combat:mechanics',
    public_name: 'обычный наконечник копья'
  };
  return { objective_context, objective_digest: canonicalDigest(objective_context),
    ordinary_aggregate: createOrdinaryAggregate({ scope_ref: structuredClone(scope_ref),
      resolution_record_cap: 4 }), property_placement_context: JSON.parse(JSON.stringify(property)),
    version_pins: { party_state_version: 0, ordinary_state_version: 0, catalog_version: 1,
      property_version: 1, placement_version: 1, supporting_basis_catalog_version: 1,
      supporting_basis_catalog_digest: canonicalDigest({ domain: 'ordinary_supporting_basis_catalog_v1',
        supporting_bases }), property_placement_context_digest:
        ordinaryWorldPropertyPlacementContextDigest({ ...property,
          supporting_basis_ref: 'armament:source',
          causal_basis_refs: ['armament:source'], requested_position_ref: 'bench' }) },
    execution_context };
}
function request() { return { request: { root_turn_id: 'turn:party:1' },
  committed_state: { position: { g6_id: 'shore', g5_anchor_id: 'anchor:shore' } },
  operation: { target_refs: ['shore'], query: 'свободная формулировка' }, working_projection: {} }; }
function model(request, publicName = 'обычный наконечник копья',
  semanticType = 'ordinary_spear') {
  if (request.mode === 'seed_scope') return { schema: 'ordinary_materialization_plan_v1',
    request_id: request.request_id, resolution: 'seeded', density_band_proposal: 'ordinary',
    background_groups: [], entities: [], presence_resolutions: [], reason_code: 'seed' };
  return { schema: 'ordinary_materialization_plan_v1', request_id: request.request_id,
    resolution: 'materialize', density_band_proposal: null, background_groups: [],
    presence_resolutions: [], reason_code: 'approved', entities: [{
      semantic_descriptor: { semantic_type: semanticType, name: publicName, facts: [] },
      authority_class: 'ordinary', admission_class: 'weapon_or_armament',
      availability_class: 'context_bound', functional_bucket: 'arms', presence_expectation: 'routine',
      supporting_basis_ref: 'armament:source', causal_basis: { basis_kind: 'personal_possession',
        basis_refs: ['armament:source'] }, property_basis_ref: 'property',
      placement_proposal: { scope_ref: 'shore', position_ref: 'bench' },
      mechanics_proposal: { mass_grams: 500, external_hand_cost: 1, carry_form: 'regular',
        packing_slot_cost: 1, quantity: { value: 1, unit: 'item' }, container: null }
    }] };
}
function verifiedModel(run) {
  const port = async (...args) => run(...args);
  port.verifyStageBCutover = async () => true;
  return port;
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
    ordinaryMaterializationModel: verifiedModel(async (input) => {
      calls += 1; return model(input);
    }) });
  const result = await resolver(request());
  assert.equal(calls, 2);
  assert.equal(result.ordinary_materialization_atomic_write_plan.resolution, 'materialize');
  assert.equal(result.ordinary_materialization_atomic_write_plan.item.admission_class,
    'weapon_or_armament');
  assert.deepEqual(result.ordinary_materialization_atomic_write_plan.item.permission_refs, permissions);
});

test('approved class admits an unlisted ordinary semantic variant', async () => {
  let calls = 0;
  const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId: 'party',
    inputDigest: 'input', loadEnablement: async () => JSON.parse(JSON.stringify(enabled())),
    ordinaryMaterializationModel: verifiedModel(async (input) => {
      calls += 1;
      return model(input, 'обычный втульчатый наконечник', 'socketed_spearhead_variant');
    }) });
  const result = await resolver(request());
  const descriptor = result.ordinary_materialization_atomic_write_plan
    ?.item.item_proposal.semantic_descriptor;
  assert.equal(calls, 2);
  assert.deepEqual(descriptor, { semantic_type: 'socketed_spearhead_variant',
    name: 'обычный втульчатый наконечник', facts: [] });
});

test('selected finite capability consumes its own committed source row', async () => {
  const value = enabled({ admission_class: 'specialized_or_valuable',
    semantic_type: 'prepared_stock', withProfile: false });
  const capability = (suffix) => {
    const source = `source-${suffix}`;
    const propertyRef = `property-${suffix}`;
    const permissions = [`region-${suffix}`, `resource-${suffix}`];
    const basis = { basis_ref: source, state: 'committed', scope_ref,
      prepared_seed_provenance: null, functional_buckets: ['other_ordinary'],
      allowed_admission_classes: ['specialized_or_valuable'],
      permission_refs: permissions, basis_kind: 'finite_source' };
    return { source_ref: source, candidate_context: { target_ref: source,
      semantic_type: 'prepared_stock', candidate_ref_namespace: `candidate-${suffix}`,
      normalizer_version: 'ordinary-normalizer-v1', candidate_hint: null,
      functional_bucket: 'other_ordinary', admission_class: 'specialized_or_valuable',
      availability_class: 'context_bound', coverage_kind: 'finite_source',
      coverage_ref: source, policy_version: 'presence' }, supporting_bases: [basis],
    context_bound_ordinary_profile: null,
    constrained_natural_resource_profile: {
      schema: 'rus.items.constrained_natural_resource_profile.v1', version: 1,
      profile_ref: `profile-${suffix}`, state: 'committed', scope_ref,
      environment_ref: `environment-${suffix}`, semantic_type: 'prepared_stock',
      functional_bucket: 'other_ordinary', admission_class: 'specialized_or_valuable',
      regional_permission_ref: permissions[0], resource_permission_ref: permissions[1],
      source_basis_ref: source, public_name: `stock-${suffix}`, finite_source: {
        source_resource_node_id: source, quantity_unit_ref: { kind: 'unit', id: 'item' },
        position_ref: 'bench', property_basis_ref: propertyRef,
        initial_amount_bounds: { minimum: { numerator: 1, denominator: 1, unit: 'item' },
          maximum: { numerator: 8, denominator: 1, unit: 'item' } }
      } }, context_refs: { ...value.objective_context.context_refs,
      environment_refs: [`environment-${suffix}`], property_context_ref: propertyRef },
    policy_refs: { ...value.objective_context.policy_refs,
      allowed_admission_classes: ['specialized_or_valuable'],
      context_bound_permission_refs: permissions,
      allowed_supporting_bases: [{ basis_ref: source, basis_state: 'committed' }] } };
  };
  value.execution_context.context_bound_capabilities = [capability('a'), capability('b')];
  value.execution_context.supporting_bases = value.execution_context
    .context_bound_capabilities.flatMap(({ supporting_bases: bases }) => bases);
  value.version_pins.supporting_basis_catalog_digest = canonicalDigest({
    domain: 'ordinary_supporting_basis_catalog_v1',
    supporting_bases: value.execution_context.supporting_bases
  });
  const committed = (suffix, stateVersion, quantity) => ({
    source_resource_node_id: `source-${suffix}`, state_version: stateVersion,
    lifecycle_state: 'active', quantity: { numerator: quantity, denominator: 1,
      unit: 'item' }, quantity_unit_ref: { kind: 'unit', id: 'item' },
    position_ref: 'bench', property_basis_ref: `property-${suffix}`
  });
  value.execution_context.committed_finite_source = committed('a', 4, 2);
  value.execution_context.committed_finite_sources = [committed('a', 4, 2),
    committed('b', 5, 3)];
  value.property_placement_context.explicit_item_source_refs = [
    'source-a', 'source-b'];
  for (const suffix of ['a', 'b']) {
    value.property_placement_context.property_catalog.push({ property_basis_ref:
      `property-${suffix}`, state: 'committed', scope_ref, basis_class: 'explicit_source_item',
    source_ref: `source-${suffix}`, unowned_cause_ref: null, unowned_cause_kind: null });
  }
  value.version_pins.property_placement_context_digest =
    ordinaryWorldPropertyPlacementContextDigest({
      ...value.property_placement_context, supporting_basis_ref: 'source-b',
      causal_basis_refs: ['source-b'], requested_position_ref: 'bench'
    });
  let calls = 0;
  const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId: 'party',
    inputDigest: 'input', loadEnablement: async () => JSON.parse(JSON.stringify(value)),
    ordinaryMaterializationModel: verifiedModel(async (input) => {
      calls += 1;
      if (input.mode === 'seed_scope') return { schema: 'ordinary_materialization_plan_v1',
        request_id: input.request_id, resolution: 'seeded', density_band_proposal: 'ordinary',
        background_groups: [], entities: [], presence_resolutions: [], reason_code: 'seed' };
      return { schema: 'ordinary_materialization_plan_v1', request_id: input.request_id,
        resolution: 'materialize', density_band_proposal: null, background_groups: [],
        presence_resolutions: [], reason_code: 'present', entities: [{ semantic_descriptor: {
          semantic_type: 'clay_blank', name: 'заготовка', facts: [] },
        authority_class: 'ordinary', admission_class: 'specialized_or_valuable',
        availability_class: 'context_bound', functional_bucket: 'other_ordinary',
        presence_expectation: 'routine', supporting_basis_ref: 'source-b',
        causal_basis: { basis_kind: 'finite_source', basis_refs: ['source-b'] },
        property_basis_ref: 'property-b', placement_proposal: { scope_ref: 'shore',
          position_ref: 'bench' }, mechanics_proposal: { mass_grams: 300,
          external_hand_cost: 1, carry_form: 'regular', packing_slot_cost: 1,
          quantity: { value: 1, unit: 'item' }, container: null } }] };
    }) });
  const result = await resolver({ ...request(), operation: {
    target_refs: ['source-b'], query: 'взять вторую порцию' } });
  const transition = result.ordinary_materialization_atomic_write_plan
    ?.finite_resource_transition;
  assert.equal(calls, 2, JSON.stringify(result));
  assert.ok(transition, JSON.stringify(result));
  assert.equal(transition.source_resource_node_id, 'source-b');
  assert.equal(transition.expected_state_version, 5);
  assert.deepEqual(transition.before_quantity,
    { numerator: 3, denominator: 1, unit: 'item' });
  assert.deepEqual(transition.after_quantity,
    { numerator: 2, denominator: 1, unit: 'item' });
});

test('missing authority and restricted class persist code-owned absence without model calls', async () => {
  for (const input of [enabled({ withProfile: false }),
    enabled({ admission_class: 'currency_or_precious', semantic_type: 'authentic_coin' })]
    .map((value) => JSON.parse(JSON.stringify(value)))) {
    let calls = 0;
    const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId: 'party',
      inputDigest: 'input', loadEnablement: async () => input,
      ordinaryMaterializationModel: verifiedModel(async () => {
        calls += 1; return {};
      }) });
    const result = await resolver(request());
    assert.equal(calls, 0);
    const plan = result.ordinary_materialization_atomic_write_plan;
    assert.ok(plan, JSON.stringify(result));
    assert.equal(plan.resolution, 'absent');
    assert.deepEqual(plan.transitions.map(({ kind }) => kind),
      ['seed', 'resolve_presence']);
    assert.equal(plan.next_aggregate.presence_resolutions.at(-1).resolution,
      'absent');
  }
});

test('hostile armament profile is rejected without getter execution or model call', async () => {
  const value = JSON.parse(JSON.stringify(enabled())); let reads = 0; let calls = 0;
  Object.defineProperty(value.execution_context.context_bound_ordinary_profile, 'semantic_type', {
    enumerable: true, get() { reads += 1; return 'ordinary_spear'; }
  });
  const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId: 'party',
    inputDigest: 'input', loadEnablement: async () => value,
    ordinaryMaterializationModel: verifiedModel(async () => {
      calls += 1; return {};
    }) });
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
      ordinaryMaterializationModel: verifiedModel(async () => {
        calls += 1; return {};
      }) });
    const result = await resolver(request());
    assert.equal(reads, 0);
    assert.equal(calls, 0);
    assert.equal(Object.hasOwn(result, 'ordinary_materialization_atomic_write_plan'), false);
  }
});
