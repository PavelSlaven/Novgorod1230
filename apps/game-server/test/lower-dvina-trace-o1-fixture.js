import { canonicalDigest, createOrdinaryAggregate } from '@rus/materialization';

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
const stageBEval = { schema: 'rus.ordinary_materialization_stage_b_eval.v1',
  version: 1, model_contract_ref: 'ordinary_materialization_plan_v1',
  model_identity_policy: 'single_exact_provider_model_config_role',
  cases: ['anachronism', 'evidence-clue', 'letter-document',
    'misleading-common-name', 'significant-hidden', 'silver-currency',
    'sword-weapon'].map((id) => ({ id, query: id, risk_class: id,
      allowed_resolutions: ['absent', 'authority_required'] })) };

const verifyStageBCutover = async () => ({ pass: true });

function enabled() { const ordinary_aggregate = createOrdinaryAggregate({ scope_ref: structuredClone(scope_ref), resolution_record_cap: 4 }); return { objective_context: { ...structuredClone(objective), scope_ref: structuredClone(scope_ref),
  ordinary_state: { seeded: false, density_band: null, remaining_identity_budget: 0,
    background_groups: [], presence_resolutions: [], closed_observation_scopes: [] } },
  ordinary_aggregate, objective_digest: canonicalDigest(objective),
  property_placement_context: JSON.parse(JSON.stringify(property)), version_pins: { party_state_version: 0,
    ordinary_state_version: 0, catalog_version: 1, property_version: 1, placement_version: 1,
    supporting_basis_catalog_version: 1,
    supporting_basis_catalog_digest: canonicalDigest({ domain: 'ordinary_supporting_basis_catalog_v1', supporting_bases: [{ basis_ref: 'basis', state: 'committed', scope_ref, prepared_seed_provenance: null, functional_buckets: ['other_ordinary'], allowed_admission_classes: ['common_mundane'] }] }),
    property_placement_context_digest: canonicalDigest({ domain: 'rus.items.ordinary_world_property_placement_context.v1', ...property }) },
  execution_context: { supporting_bases: [{ basis_ref: 'basis', state: 'committed', scope_ref: structuredClone(scope_ref), prepared_seed_provenance: null,
    functional_buckets: ['other_ordinary'], allowed_admission_classes: ['common_mundane'] }], allowed_disclosure_policy_refs: ['disclosure'],
    density_policy: { version: 'density', mappings: [{ scope_kind: 'g6',
      function_ref: null, bands: { sparse: 0, ordinary: 1, dense: 1 } }] },
    candidate_context: { target_ref: 'shore', candidate_ref_namespace: 'ordinary-query',
      normalizer_version: 'ordinary-normalizer-v1', semantic_type: 'ordinary_object_candidate', candidate_hint: null,
      functional_bucket: 'other_ordinary', admission_class: 'common_mundane', availability_class: 'common',
      coverage_kind: 'visible_surface', coverage_ref: 'bench', policy_version: 'presence' },
    mechanics_policy: { policy_ref: 'mechanics', max_mass_grams: 20000,
      allowed_external_hand_costs: [0, 1, 2],
      allowed_carry_forms: ['compact', 'regular', 'long', 'bulky'],
      max_packing_slot_cost: 16, max_quantity: 1 },
    stage_b_classification_eval: structuredClone(stageBEval),
    causal_ref: 'cause', source_refs: [] } }; }

function request(query) { return { request: { root_turn_id: 'turn:party:1' },
  committed_state: { position: { g6_id: 'shore',
    g5_anchor_id: 'shore-anchor' } }, operation: { target_refs: ['shore'], query },
  working_projection: {} }; }
function group() { return { descriptor: 'ordinary layer', functional_bucket: 'other_ordinary',
  availability_class: 'common', allowed_admission_classes: ['common_mundane'],
  causal_basis: { basis_kind: 'household_use', basis_refs: ['basis'] }, property_basis_ref: 'property',
  permission_refs: [], disclosure_policy_ref: 'disclosure' }; }

export { enabled, group, request, verifyStageBCutover };
