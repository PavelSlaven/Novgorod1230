import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrdinaryAggregate, canonicalDigest } from '@rus/materialization';
import { ordinaryWorldPropertyPlacementContextDigest } from '@rus/items-property';
import { createLowerDvinaTraceOrdinaryDiscoveryResolver } from
  '../src/runtime/lower-dvina-trace-ordinary-discovery.js';
import { projectLowerDvinaTracePlayerSafeState } from
  '../src/runtime/lower-dvina-trace-player-safe-state.js';
import { applyOrdinaryMaterializationProjection } from
  '../src/infrastructure/postgres/lower-dvina-trace-ordinary-p16.js';

const scope_ref = { entity_kind: 'g6', entity_id: 'shore' };
const property = { scope_ref, item_kind: 'man_made',
  property_catalog_version_ref: 'property-v1', placement_catalog_version_ref: 'placement-v1',
  personal_communal_refs: [], occupied_site_refs: ['house'], unowned_cause_refs: [],
  placement_context_refs: ['scene'], property_catalog: [{ property_basis_ref: 'property',
    state: 'committed', scope_ref, basis_class: 'occupied_site_default',
    source_ref: 'house', unowned_cause_ref: null }], placement_catalog: [{
    position_ref: 'bench', state: 'committed', scope_ref, position_kind: 'scene_position',
    g6_ref: 'shore', containment_depth: 1, placement_context_ref: 'scene' }] };
const objective = { request_id: 'enablement', scope_ref, context_refs: {
  period_ref: 'period', region_ref: 'region', function_refs: [], environment_refs: [],
  occupation_household_refs: [], economic_context_ref: 'economy', occupancy_state_ref: 'occupied',
  material_culture_refs: [], property_context_ref: 'property' }, policy_refs: {
  authority_policy_ref: 'authority', density_policy_ref: 'density', ordinary_presence_policy_ref: 'presence',
  runtime_item_mechanics_policy_ref: 'mechanics', allowed_admission_classes: ['common_mundane'],
  context_bound_permission_refs: [], allowed_supporting_bases: [{ basis_ref: 'basis', basis_state: 'committed' }] }, technical_limits: {
  max_new_entities: 1, max_new_background_groups: 1, max_resolution_records: 4 } };

function enabled() { const ordinary_aggregate = createOrdinaryAggregate({ scope_ref: structuredClone(scope_ref), resolution_record_cap: 4 }); return { objective_context: { ...structuredClone(objective), scope_ref: structuredClone(scope_ref),
  ordinary_state: { seeded: false, density_band: null, remaining_identity_budget: 0,
    background_groups: [], presence_resolutions: [], closed_observation_scopes: [] } },
  ordinary_aggregate, objective_digest: canonicalDigest(objective),
  property_placement_context: JSON.parse(JSON.stringify(property)), version_pins: { party_state_version: 0,
    ordinary_state_version: 0, catalog_version: 1, property_version: 1, placement_version: 1,
    supporting_basis_catalog_version: 1,
    supporting_basis_catalog_digest: canonicalDigest({ domain: 'ordinary_supporting_basis_catalog_v1', supporting_bases: [{ basis_ref: 'basis', state: 'committed', scope_ref, prepared_seed_provenance: null, functional_buckets: ['household'], allowed_admission_classes: ['common_mundane'] }] }),
    property_placement_context_digest: canonicalDigest({ domain: 'rus.items.ordinary_world_property_placement_context.v1', ...property }) },
  execution_context: { supporting_bases: [{ basis_ref: 'basis', state: 'committed', scope_ref: structuredClone(scope_ref), prepared_seed_provenance: null,
    functional_buckets: ['household'], allowed_admission_classes: ['common_mundane'] }], allowed_disclosure_policy_refs: ['disclosure'],
    identity_budget: { policy_version: 'density', density_band: 'ordinary', identity_budget: 1, source: 'policy' },
    candidate_context: { target_ref: 'shore', semantic_type: 'spoon', candidate_hint: 'ложка',
      functional_bucket: 'household', admission_class: 'common_mundane', availability_class: 'common',
      coverage_kind: 'visible_surface', coverage_ref: 'bench', policy_version: 'presence' },
    mechanics_policy: { policy_ref: 'mechanics', max_mass_grams: 1000,
      allowed_external_hand_costs: [0, 1, 2], allowed_carry_forms: ['compact', 'regular', 'small'],
      max_packing_slot_cost: 10, max_quantity: 10 },
    causal_ref: 'cause', source_refs: [] } }; }

function request(query) { return { request: { root_turn_id: 'turn:party:1' },
  committed_state: { position: { g6_id: 'shore' } }, operation: { target_refs: ['shore'], query },
  working_projection: {} }; }
function group() { return { descriptor: 'utensils', functional_bucket: 'household',
  availability_class: 'common', allowed_admission_classes: ['common_mundane'],
  causal_basis: { basis_kind: 'household_use', basis_refs: ['basis'] }, property_basis_ref: 'property',
  permission_refs: [], disclosure_policy_ref: 'disclosure' }; }

test('unseeded ordinary discovery keeps Stage A candidate-free and binds Stage B coverage to normalized query', async () => {
  const calls = [];
  const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId: 'party', inputDigest: 'input',
    loadEnablement: async () => enabled(), ordinaryMaterializationModel: async (modelRequest) => {
      calls.push(modelRequest);
      if (modelRequest.mode === 'seed_scope') return { schema: 'ordinary_materialization_plan_v1',
        request_id: modelRequest.request_id, resolution: 'seeded', density_band_proposal: 'ordinary',
        background_groups: [group()], entities: [], presence_resolutions: [], reason_code: 'seed' };
      return { schema: 'ordinary_materialization_plan_v1', request_id: modelRequest.request_id,
        resolution: 'absent', density_band_proposal: null, background_groups: [], entities: [],
        presence_resolutions: [{ candidate_key: modelRequest.candidate_query.candidate_key,
          coverage_key: modelRequest.candidate_query.coverage_key, resolution: 'absent' }], reason_code: 'absent' };
    } });
  const first = await resolver(request('  Найти   ЛОЖКУ '));
  assert.equal(calls[0].candidate_query, null);
  assert.equal(calls[1].candidate_query.evidence_weight, 0);
  assert.equal(calls[1].candidate_query.candidate_hint, 'найти ложку');
  assert.equal(calls.length, 2, 'unseeded targeted discovery costs at most Stage A + Stage B');
  const firstCoverageKey = calls[1].candidate_query.coverage_key;
  assert.equal(first.ordinary_materialization_atomic_write_plan.transitions[0]
    .background_groups[0].group_ref.startsWith('ordinary_group_'), true);
  assert.equal(first.ordinary_materialization_atomic_write_plan.new_prepared_bases[0].basis_ref,
    first.ordinary_materialization_atomic_write_plan.transitions[0].background_groups[0].group_ref);
  calls.length = 0;
  await resolver(request('найти верёвку'));
  assert.notEqual(calls[1].candidate_query.coverage_key, firstCoverageKey);
});

test('committed exact identity survives reload and only normalized wording reuses it', async () => {
  let committed = null;
  let modelCalls = 0;
  const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({
    partyId: 'party', inputDigest: 'input',
    loadEnablement: async () => {
      const value = enabled();
      if (committed === null) return value;
      const aggregate = structuredClone(committed);
      value.ordinary_aggregate = aggregate;
      value.objective_context.ordinary_state = {
        seeded: aggregate.seeded, density_band: aggregate.density_band,
        remaining_identity_budget: aggregate.remaining_identity_budget,
        background_groups: aggregate.background_groups.map(({ group_ref }) => group_ref),
        presence_resolutions: aggregate.presence_resolutions.map(({ resolution_ref }) => resolution_ref),
        closed_observation_scopes: aggregate.coverage_closures.map(({ coverage_key }) => coverage_key)
      };
      value.version_pins = { ...value.version_pins, party_state_version: 1,
        ordinary_state_version: aggregate.state_version };
      return value;
    },
    ordinaryMaterializationModel: async (modelRequest) => {
      modelCalls += 1;
      if (modelRequest.mode === 'seed_scope') return { schema: 'ordinary_materialization_plan_v1',
        request_id: modelRequest.request_id, resolution: 'seeded', density_band_proposal: 'ordinary',
        background_groups: [group()], entities: [], presence_resolutions: [], reason_code: 'seed' };
      return { schema: 'ordinary_materialization_plan_v1', request_id: modelRequest.request_id,
        resolution: 'absent', density_band_proposal: null, background_groups: [], entities: [],
        presence_resolutions: [{ candidate_key: modelRequest.candidate_query.candidate_key,
          coverage_key: modelRequest.candidate_query.coverage_key, resolution: 'absent' }], reason_code: 'absent' };
    }
  });
  const first = await resolver(request('найти ложку'));
  committed = first.ordinary_materialization_atomic_write_plan.next_aggregate;
  assert.equal(modelCalls, 2);
  await resolver({ ...request('  НАЙТИ   ложку  '), request: { root_turn_id: 'turn:party:2' } });
  assert.equal(modelCalls, 2, 'case/whitespace normalization maps to the committed identity');
  await resolver({ ...request('отыскать ложку'), request: { root_turn_id: 'turn:party:3' } });
  assert.equal(modelCalls, 3, 'an unknown paraphrase is a new coverage, not magical equivalence');
});

test('a pre-commit resolver result is not visible or durable and can be modelled after restart', async () => {
  let modelCalls = 0;
  const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId: 'party', inputDigest: 'input',
    loadEnablement: async () => enabled(), ordinaryMaterializationModel: async (modelRequest) => {
      modelCalls += 1;
      if (modelRequest.mode === 'seed_scope') return { schema: 'ordinary_materialization_plan_v1',
        request_id: modelRequest.request_id, resolution: 'seeded', density_band_proposal: 'ordinary',
        background_groups: [group()], entities: [], presence_resolutions: [], reason_code: 'seed' };
      return { schema: 'ordinary_materialization_plan_v1', request_id: modelRequest.request_id,
        resolution: 'absent', density_band_proposal: null, background_groups: [], entities: [],
        presence_resolutions: [{ candidate_key: modelRequest.candidate_query.candidate_key,
          coverage_key: modelRequest.candidate_query.coverage_key, resolution: 'absent' }], reason_code: 'absent' };
    } });
  const beforeCommit = await resolver(request('найти ложку'));
  assert.deepEqual(beforeCommit.write_fragments, []);
  assert.equal(Object.hasOwn(beforeCommit.working_projection, 'items'), false);
  await resolver(request('найти ложку'));
  assert.equal(modelCalls, 4, 'uncommitted state is not reused after a restart');
});

test('Phase 5 keeps weapons disabled even when a model tries to materialize one', async () => {
  let modelCalls = 0;
  const contextEnabled = enabled();
  contextEnabled.objective_context.policy_refs = {
    ...contextEnabled.objective_context.policy_refs,
    allowed_admission_classes: ['weapon_or_armament'],
    context_bound_permission_refs: ['armament-profile', 'weapon-source']
  };
  contextEnabled.execution_context.supporting_bases = [{ basis_ref: 'basis-arms',
    state: 'committed', scope_ref: structuredClone(scope_ref), prepared_seed_provenance: null,
    functional_buckets: ['arms'], allowed_admission_classes: ['weapon_or_armament'],
    permission_refs: ['armament-profile', 'weapon-source'] }];
  contextEnabled.objective_context.policy_refs.allowed_supporting_bases = [{
    basis_ref: 'basis-arms', basis_state: 'committed'
  }];
  contextEnabled.version_pins.supporting_basis_catalog_digest = canonicalDigest({
    domain: 'ordinary_supporting_basis_catalog_v1',
    supporting_bases: contextEnabled.execution_context.supporting_bases
  });
  contextEnabled.execution_context.candidate_context = {
    target_ref: 'shore', semantic_type: 'ordinary_weapon', candidate_hint: null,
    functional_bucket: 'arms', admission_class: 'weapon_or_armament',
    availability_class: 'context_bound', coverage_kind: 'visible_surface',
    coverage_ref: 'weapon-rack', policy_version: 'presence'
  };
  contextEnabled.property_placement_context = {
    schema: 'rus.items.ordinary_world_property_placement_context.v2', version: 2,
    scope_ref: structuredClone(scope_ref), item_kind: 'man_made',
    property_catalog_version_ref: 'property-v2', placement_catalog_version_ref: 'placement-v2',
    explicit_item_source_refs: [], personal_possession_refs: ['warrior-a'],
    communal_public_service_refs: ['armory-service'], container_property_refs: ['rack-a'],
    occupied_site_refs: ['warrior-household'], unowned_cause_refs: [],
    placement_context_refs: ['scene'], property_catalog: [
      { property_basis_ref: 'site-property', state: 'committed', scope_ref: structuredClone(scope_ref), basis_class: 'occupied_site_default', source_ref: 'warrior-household', unowned_cause_ref: null, unowned_cause_kind: null },
      { property_basis_ref: 'container-property', state: 'committed', scope_ref: structuredClone(scope_ref), basis_class: 'container_property', source_ref: 'rack-a', unowned_cause_ref: null, unowned_cause_kind: null },
      { property_basis_ref: 'service-property', state: 'committed', scope_ref: structuredClone(scope_ref), basis_class: 'communal_public_service', source_ref: 'armory-service', unowned_cause_ref: null, unowned_cause_kind: null },
      { property_basis_ref: 'property', state: 'committed', scope_ref: structuredClone(scope_ref), basis_class: 'personal_possession', source_ref: 'warrior-a', unowned_cause_ref: null, unowned_cause_kind: null }
    ], placement_catalog: [{ position_ref: 'bench', state: 'committed',
      scope_ref: structuredClone(scope_ref), position_kind: 'scene_position', g6_ref: 'shore',
      containment_depth: 1, placement_context_ref: 'scene' }]
  };
  contextEnabled.version_pins.property_placement_context_digest =
    ordinaryWorldPropertyPlacementContextDigest({ ...contextEnabled.property_placement_context,
      supporting_basis_ref: 'context-digest', causal_basis_refs: ['context-digest'],
      requested_position_ref: 'context-digest' });
  const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId: 'party',
    inputDigest: 'input', loadEnablement: async () => contextEnabled,
    ordinaryMaterializationModel: async (modelRequest) => {
      modelCalls += 1;
      if (modelRequest.mode === 'seed_scope') return {
        schema: 'ordinary_materialization_plan_v1', request_id: modelRequest.request_id,
        resolution: 'seeded', density_band_proposal: 'ordinary', background_groups: [],
        entities: [], presence_resolutions: [], reason_code: 'seed'
      };
      return { schema: 'ordinary_materialization_plan_v1', request_id: modelRequest.request_id,
        resolution: 'materialize', density_band_proposal: null, background_groups: [],
        presence_resolutions: [], reason_code: 'supported', entities: [{
          semantic_descriptor: { semantic_type: 'ordinary_weapon',
            name: 'свободное eval-имя', facts: [] }, authority_class: 'ordinary',
          admission_class: 'weapon_or_armament', availability_class: 'context_bound',
          functional_bucket: 'arms', presence_expectation: 'routine',
          supporting_basis_ref: 'basis-arms', causal_basis: { basis_kind: 'armament',
            basis_refs: ['basis-arms'] }, property_basis_ref: 'property',
          placement_proposal: { scope_ref: 'shore', position_ref: 'bench' },
          mechanics_proposal: { mass_grams: 300, external_hand_cost: 1,
            carry_form: 'regular', packing_slot_cost: 1,
            quantity: { value: 1, unit: 'item' }, container: null }
        }] };
    } });
  const result = await resolver(request('меч'));
  assert.equal(Object.hasOwn(result, 'ordinary_materialization_atomic_write_plan'), false);
  assert.equal(modelCalls, 0, 'unapproved class never reaches either Stage A or Stage B');
});

test('unseeded constrained source gaps never invoke a model or emit an ordinary write', async () => {
  function constrained(source) {
    const value = enabled();
    value.objective_context.context_refs.environment_refs = ['environment:bank'];
    value.objective_context.policy_refs = { ...value.objective_context.policy_refs,
      allowed_admission_classes: ['specialized_or_valuable'],
      context_bound_permission_refs: ['permission:region', 'permission:resource'],
      allowed_supporting_bases: [{ basis_ref: 'node:resource', basis_state: 'committed' }] };
    value.execution_context.supporting_bases = [{ basis_ref: 'node:resource', state: 'committed',
      scope_ref: structuredClone(scope_ref), functional_buckets: ['other_ordinary'],
      allowed_admission_classes: ['specialized_or_valuable'],
      permission_refs: ['permission:region', 'permission:resource'] }];
    value.execution_context.candidate_context = { target_ref: 'shore', semantic_type: 'unseen_raw',
      candidate_hint: null, functional_bucket: 'other_ordinary',
      admission_class: 'specialized_or_valuable', availability_class: 'context_bound',
      coverage_kind: 'visible_surface', coverage_ref: 'bank', policy_version: 'presence' };
    const finite_source = { source_resource_node_id: 'node:resource', state_version: 4,
      lifecycle_state: 'active', quantity: { numerator: 2, denominator: 1, unit: 'item' },
      quantity_unit_ref: { kind: 'unit', id: 'item' }, position_ref: 'bench',
      property_basis_ref: 'property' };
    value.execution_context.constrained_natural_resource_profile = {
      schema: 'rus.items.constrained_natural_resource_profile.v1', version: 1,
      profile_ref: 'profile:unseen', state: 'committed', scope_ref: structuredClone(scope_ref),
      environment_ref: 'environment:bank', semantic_type: 'unseen_raw',
      functional_bucket: 'other_ordinary', admission_class: 'specialized_or_valuable',
      regional_permission_ref: 'permission:region', resource_permission_ref: 'permission:resource',
      source_basis_ref: 'node:resource', finite_source };
    value.execution_context.committed_finite_source = source;
    return value;
  }
  for (const source of [null,
    { source_resource_node_id: 'node:resource', state_version: 5, lifecycle_state: 'active',
      quantity: { numerator: 2, denominator: 1, unit: 'item' }, quantity_unit_ref: { kind: 'unit', id: 'item' },
      position_ref: 'bench', property_basis_ref: 'property' },
    { source_resource_node_id: 'node:resource', state_version: 4, lifecycle_state: 'depleted',
      quantity: { numerator: 0, denominator: 1, unit: 'item' }, quantity_unit_ref: { kind: 'unit', id: 'item' },
      position_ref: 'bench', property_basis_ref: 'property' }]) {
    let modelCalls = 0;
    const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId: 'party', inputDigest: 'input',
      loadEnablement: async () => constrained(source), ordinaryMaterializationModel: async () => {
        modelCalls += 1; return {}; } });
    const result = await resolver(request('копаю и ищу'));
    assert.equal(modelCalls, 0);
    assert.equal(Object.hasOwn(result, 'ordinary_materialization_atomic_write_plan'), false);
  }
});

test('visible target without a committed G6 never calls the ordinary model', async () => {
  let modelCalls = 0;
  let enablementCalls = 0;
  const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({
    partyId: 'party', inputDigest: 'input',
    loadEnablement: async () => { enablementCalls += 1; return enabled(); },
    ordinaryMaterializationModel: async () => { modelCalls += 1; return {}; }
  });

  const result = await resolver({
    request: { root_turn_id: 'turn:party:no-g6' },
    committed_state: { position: { location_ref: 'visible-shore' } },
    operation: { target_refs: ['visible-shore'], query: 'найти ложку' },
    working_projection: {}
  });

  assert.equal(modelCalls, 0);
  assert.equal(enablementCalls, 0);
  assert.equal(result.summary, 'ordinary discovery unavailable');
});

test('projects a committed ordinary item without its materialization internals', () => {
  const committedState = {
    actor_id: 'mikula', player_profile: {}, position: { location_ref: 'shed' },
    items: [], visible_context: { visible_objects: [] },
    ordinary_materialization: { remaining_identity_budget: 0,
      background_groups: ['group-private'], supporting_basis_catalog: ['basis-private'],
      negative_presence_record: 'negative-presence' }
  };
  const ordinaryPlan = { item: { item_id: 'ordinary-spoon',
    property_basis_ref: 'basis-private', supporting_basis_ref: 'basis-private',
    item_proposal: { scope_ref: { entity_kind: 'g6', entity_id: 'shed' },
      semantic_descriptor: { semantic_type: 'household_tool', name: 'wooden spoon' },
      placement: { scope_ref: 'shed', position_ref: 'bench' } },
    mechanics_snapshot: { provenance: { permission_ref: 'permission-private' } } } };
  committedState.visible_context = applyOrdinaryMaterializationProjection({
    next: committedState, visibleContext: committedState.visible_context, ordinaryPlan
  });

  const result = projectLowerDvinaTracePlayerSafeState({
    committed_state: committedState, actor_id: 'mikula' });
  assert.deepEqual(result.player_safe_state.items, [{
    item_id: 'ordinary-spoon', name: 'wooden spoon',
    placement: { location_ref: 'shed' },
    state: { semantic_category: 'household_tool' }
  }]);
  const playerSafe = JSON.stringify(result.player_safe_state);
  for (const privateValue of ['remaining_identity_budget', 'background_groups',
    'basis-private', 'permission-private', 'negative-presence']) {
    assert.equal(playerSafe.includes(privateValue), false);
  }
});
