import { buildOrdinaryMaterializationPresenceRequest } from
  '../src/runtime/ordinary-materialization-seed-request.js';

export function presenceRequest(query) {
  const scope_ref = { entity_kind: 'g6', entity_id: 'scope' };
  return buildOrdinaryMaterializationPresenceRequest({ objective_context: {
    request_id: 'turn:eval:ordinary:presence', scope_ref: { ...scope_ref },
    context_refs: { period_ref: 'period', region_ref: 'region',
      function_refs: [], environment_refs: [], occupation_household_refs: [],
      economic_context_ref: 'economy', occupancy_state_ref: 'occupied',
      material_culture_refs: [], property_context_ref: 'property' },
    policy_refs: { authority_policy_ref: 'authority',
      density_policy_ref: 'density', ordinary_presence_policy_ref: 'presence',
      runtime_item_mechanics_policy_ref: 'mechanics',
      allowed_admission_classes: ['common_mundane'],
      context_bound_permission_refs: [], allowed_supporting_bases: [{
        basis_ref: 'generic_basis', basis_state: 'committed' }] },
    ordinary_state: { seeded: true, density_band: 'ordinary',
      remaining_identity_budget: 1, background_groups: [],
      presence_resolutions: [], closed_observation_scopes: [] },
    technical_limits: { max_new_entities: 1, max_new_background_groups: 1,
      max_resolution_records: 4 }, ordinary_state_version: 1,
    property_placement_context: { scope_ref: { ...scope_ref }, item_kind: 'man_made',
      property_catalog_version_ref: 'property-v1',
      placement_catalog_version_ref: 'placement-v1', personal_communal_refs: [],
      occupied_site_refs: ['house'], unowned_cause_refs: [],
      placement_context_refs: ['scene'], property_catalog: [{
        property_basis_ref: 'property', state: 'committed',
        scope_ref: { ...scope_ref }, basis_class: 'occupied_site_default',
        source_ref: 'house', unowned_cause_ref: null }], placement_catalog: [{
        position_ref: 'bench', state: 'committed', scope_ref: { ...scope_ref },
        g6_ref: 'scope', containment_depth: 1,
        placement_context_ref: 'scene' }] }
  }, candidate_context: { normalized_candidate_ref: 'ordinary-household',
    normalizer_version: 'normalizer-v1', semantic_type: 'household_tool',
    candidate_hint: query, functional_bucket: 'household',
    admission_class: 'common_mundane', availability_class: 'common',
    coverage_kind: 'visible_surface', coverage_ref: 'surface',
    policy_version: 'presence' }, selected_supporting_basis_ref: 'generic_basis' }).request;
}

export function absentPlan(request) {
  return { schema: 'ordinary_materialization_plan_v1',
    request_id: request.request_id, resolution: 'absent',
    density_band_proposal: null, background_groups: [], entities: [],
    presence_resolutions: [{
      candidate_key: request.candidate_query.candidate_key,
      coverage_key: request.candidate_query.coverage_key,
      resolution: 'absent' }], reason_code: 'eval_absent' };
}

export function modelIdentity() {
  return { provider: 'deepseek', model: 'deepseek-v4-flash',
    scope: 'turn_runtime', role_id: 'ordinary_materialization',
    config_hash: 'c43b0590a85401c2' };
}
