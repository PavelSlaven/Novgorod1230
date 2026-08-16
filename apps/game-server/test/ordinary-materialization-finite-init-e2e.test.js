import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest, createOrdinaryAggregate } from '@rus/materialization';
import { ordinaryWorldPropertyPlacementContextDigest } from '@rus/items-property';
import { createLowerDvinaTraceOrdinaryDiscoveryResolver } from
  '../src/runtime/lower-dvina-trace-ordinary-discovery.js';

const scope_ref = { entity_kind: 'g6', entity_id: 'river-bank' };
const source_ref = 'resource-node:river-clay';
const permissions = ['permission:regional-clay', 'permission:river-clay'];

function source({ lifecycle_state = 'uninitialized', state_version = 8,
  numerator = 0 } = {}) {
  const result = { source_resource_node_id: source_ref, state_version, lifecycle_state,
    quantity: { numerator, denominator: 1, unit: 'item' },
    quantity_unit_ref: { kind: 'unit', id: 'item' }, position_ref: 'position:bank',
    property_basis_ref: 'property:river-clay' };
  if (lifecycle_state === 'uninitialized') result.approved_initial_amounts = [
    { selection_ref: 'initial:two', amount: { numerator: 2, denominator: 1, unit: 'item' } },
    { selection_ref: 'initial:three', amount: { numerator: 3, denominator: 1, unit: 'item' } }
  ];
  return result;
}

function ordinaryState(aggregate) {
  return { seeded: aggregate.seeded, density_band: aggregate.density_band,
    remaining_identity_budget: aggregate.remaining_identity_budget,
    background_groups: aggregate.background_groups.map(({ group_ref }) => group_ref),
    presence_resolutions: aggregate.presence_resolutions.map(({ resolution_ref }) => resolution_ref),
    closed_observation_scopes: aggregate.coverage_closures.map(({ coverage_key }) => coverage_key) };
}
function enabled({ finite = source(), aggregate = null } = {}) {
  const ordinary_aggregate = aggregate ?? createOrdinaryAggregate({ scope_ref, resolution_record_cap: 4 });
  const property_placement_context = {
    schema: 'rus.items.ordinary_world_property_placement_context.v2', version: 2,
    scope_ref: structuredClone(scope_ref), item_kind: 'man_made',
    property_catalog_version_ref: 'property:v2', placement_catalog_version_ref: 'placement:v2',
    explicit_item_source_refs: [source_ref], personal_possession_refs: [],
    communal_public_service_refs: [], container_property_refs: [], occupied_site_refs: [],
    unowned_cause_refs: [], placement_context_refs: ['placement-context'],
    property_catalog: [{ property_basis_ref: 'property:river-clay', state: 'committed',
      scope_ref: structuredClone(scope_ref), basis_class: 'explicit_source_item',
      source_ref, unowned_cause_ref: null, unowned_cause_kind: null }],
    placement_catalog: [{ position_ref: 'position:bank', state: 'committed',
      scope_ref: structuredClone(scope_ref), position_kind: 'scene_position',
      g6_ref: 'river-bank', containment_depth: 0, placement_context_ref: 'placement-context' }]
  };
  const basis = { basis_ref: source_ref, state: 'committed', scope_ref: structuredClone(scope_ref),
    prepared_seed_provenance: null, functional_buckets: ['other_ordinary'],
    allowed_admission_classes: ['specialized_or_valuable'], permission_refs: structuredClone(permissions),
    basis_kind: 'finite_source' };
  const objective_context = { request_id: 'enablement', scope_ref: structuredClone(scope_ref),
    context_refs: { period_ref: 'period', region_ref: 'region', function_refs: [],
      environment_refs: ['environment:river-bank'], occupation_household_refs: [],
      economic_context_ref: 'economy', occupancy_state_ref: 'occupied',
      material_culture_refs: [], property_context_ref: 'property:river-clay' },
    policy_refs: { authority_policy_ref: 'authority', density_policy_ref: 'density',
      ordinary_presence_policy_ref: 'presence', runtime_item_mechanics_policy_ref: 'mechanics',
      allowed_admission_classes: ['specialized_or_valuable'],
      context_bound_permission_refs: structuredClone(permissions),
      allowed_supporting_bases: [{ basis_ref: source_ref, basis_state: 'committed' }] },
    ordinary_state: ordinaryState(ordinary_aggregate), technical_limits: {
      max_new_entities: 1, max_new_background_groups: 1, max_resolution_records: 4 } };
  const profile = { schema: 'rus.items.constrained_natural_resource_profile.v1', version: 1,
    profile_ref: 'profile:river-clay', state: 'committed', scope_ref: structuredClone(scope_ref),
    environment_ref: 'environment:river-bank', semantic_type: 'river_clay',
    functional_bucket: 'other_ordinary', admission_class: 'specialized_or_valuable',
    regional_permission_ref: permissions[0], resource_permission_ref: permissions[1],
    source_basis_ref: source_ref, finite_source: structuredClone(finite) };
  const propertyDigest = ordinaryWorldPropertyPlacementContextDigest({
    ...property_placement_context, supporting_basis_ref: source_ref,
    causal_basis_refs: [source_ref], requested_position_ref: 'position:bank' });
  return { objective_context, ordinary_aggregate, objective_digest: canonicalDigest(objective_context),
    property_placement_context, version_pins: { party_state_version: 0,
      ordinary_state_version: ordinary_aggregate.state_version, catalog_version: 1,
      property_version: 1, placement_version: 1, supporting_basis_catalog_version: 1,
      supporting_basis_catalog_digest: canonicalDigest({ domain: 'ordinary_supporting_basis_catalog_v1', supporting_bases: [basis] }),
      property_placement_context_digest: propertyDigest }, execution_context: {
      supporting_bases: [basis], allowed_disclosure_policy_refs: [],
      identity_budget: { policy_version: 'density', density_band: 'ordinary', identity_budget: 1, source: 'policy' },
      candidate_context: { target_ref: 'river-bank', semantic_type: 'river_clay', candidate_hint: null,
        functional_bucket: 'other_ordinary', admission_class: 'specialized_or_valuable',
        availability_class: 'context_bound', coverage_kind: 'visible_surface',
        coverage_ref: 'river-bank:clay', policy_version: 'presence' },
      mechanics_policy: { policy_ref: 'mechanics', max_mass_grams: 1000,
        allowed_external_hand_costs: [0, 1, 2], allowed_carry_forms: ['compact', 'regular'],
        max_packing_slot_cost: 10, max_quantity: 10 }, causal_ref: 'cause:river-clay',
      source_refs: [source_ref], constrained_natural_resource_profile: profile,
      committed_finite_source: structuredClone(finite) } };
}

function request(root_turn_id = 'turn:1') {
  return { request: { root_turn_id }, committed_state: { position: { g6_id: 'river-bank' } },
    operation: { target_refs: ['river-bank'], query: 'взять глину' }, working_projection: {} };
}

function seedPlan(modelRequest) {
  return { schema: 'ordinary_materialization_plan_v1', request_id: modelRequest.request_id,
    resolution: 'seeded', density_band_proposal: 'ordinary', background_groups: [],
    entities: [], presence_resolutions: [], reason_code: 'seed' };
}

function materializePlan(modelRequest, choice = 'initial:three') {
  return { schema: 'ordinary_materialization_plan_v1', request_id: modelRequest.request_id,
    resolution: 'materialize', density_band_proposal: null, background_groups: [],
    presence_resolutions: [], reason_code: 'committed-finite-source', entities: [{
      semantic_descriptor: { semantic_type: 'river_clay', name: 'речная глина', facts: [] },
      authority_class: 'ordinary', admission_class: 'specialized_or_valuable',
      availability_class: 'context_bound', functional_bucket: 'other_ordinary',
      presence_expectation: 'routine', supporting_basis_ref: source_ref,
      causal_basis: { basis_kind: 'finite_source', basis_refs: [source_ref] },
      property_basis_ref: 'property:river-clay',
      placement_proposal: { scope_ref: 'river-bank', position_ref: 'position:bank' },
      mechanics_proposal: { mass_grams: 300, external_hand_cost: 1, carry_form: 'regular',
        packing_slot_cost: 1, quantity: { value: 1, unit: 'item' }, container: null },
      ...(choice === null ? {} : { finite_source_initial_amount_choice: {
        schema: 'finite_source_initial_amount_choice_v1', selection_ref: choice } })
    }] };
}

test('uninitialized generic finite source seals one approved selection, initialization, and decrement', async () => {
  let current = enabled(), calls = 0;
  const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId: 'party', inputDigest: 'input',
    loadEnablement: async () => current,
    ordinaryMaterializationModel: async (modelRequest) => {
      calls += 1;
      if (modelRequest.mode === 'seed_scope') {
        assert.equal(modelRequest.candidate_query, null);
        return seedPlan(modelRequest);
      }
      assert.deepEqual(modelRequest.policy_refs.finite_source_initial_amount_choices, [
        { schema: 'finite_source_initial_amount_choice_v1', selection_ref: 'initial:two' },
        { schema: 'finite_source_initial_amount_choice_v1', selection_ref: 'initial:three' }
      ]);
      assert.equal(JSON.stringify(modelRequest).includes('numerator'), false,
        'Stage B receives opaque alternatives, never source quantities');
      return materializePlan(modelRequest);
    } });
  const result = await resolver(request());
  assert.equal(calls, 2, 'unseeded finite discovery has only candidate-free Stage A plus Stage B');
  assert.equal(result.summary, 'ordinary discovery resolved');
  const plan = result.ordinary_materialization_atomic_write_plan;
  assert.equal(plan.finite_resource_initialization.selection_ref, 'initial:three');
  assert.deepEqual(plan.finite_resource_initialization.selected_amount,
    { numerator: 3, denominator: 1, unit: 'item' });
  assert.equal(plan.finite_resource_initialization.expected_state_version, 8);
  assert.deepEqual(plan.finite_resource_transition.before_quantity,
    { numerator: 3, denominator: 1, unit: 'item' });
  assert.deepEqual(plan.finite_resource_transition.after_quantity,
    { numerator: 2, denominator: 1, unit: 'item' });
  assert.equal(plan.finite_resource_transition.expected_state_version, 9);
  assert.equal(plan.finite_resource_transition.next_state_version, 10);
  assert.equal(plan.item.causal_basis_kind, 'finite_source');

  current = enabled({ finite: source({ lifecycle_state: 'active', state_version: 10, numerator: 2 }),
    aggregate: plan.next_aggregate });
  const replay = await resolver(request('turn:2'));
  assert.equal(calls, 2, 'committed exact identity does not reroll or decrement after reload');
  assert.equal(Object.hasOwn(replay, 'ordinary_materialization_atomic_write_plan'), false);
});

test('finite initialization rejects an unknown or omitted selection and a selection on an active source', async () => {
  for (const { finite, choice } of [
    { finite: source(), choice: 'initial:forged' },
    { finite: source(), choice: null },
    { finite: source({ lifecycle_state: 'active', state_version: 9, numerator: 3 }), choice: 'initial:three' }
  ]) {
    const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId: 'party', inputDigest: 'input',
      loadEnablement: async () => enabled({ finite }),
      ordinaryMaterializationModel: async (modelRequest) => modelRequest.mode === 'seed_scope'
        ? seedPlan(modelRequest) : materializePlan(modelRequest, choice) });
    await assert.rejects(() => resolver(request()),
      (error) => error?.code === 'TURN_ORDINARY_PRESENCE_PLAN_INVALID');
  }
});
