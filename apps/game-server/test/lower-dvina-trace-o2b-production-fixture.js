import { canonicalDigest, createOrdinaryAggregate } from '@rus/materialization';
import { buildExistingContainerOrdinarySeedRequest } from '@rus/items-property';

export const partyId = 'party-o2b-production';
export const containerRef = 'fixture-chest';
export const templateId = 'fixture-chest-template';
export const mechanicsProfileRef = 'fixture-chest-mechanics';
export const profileDigest = 'a'.repeat(64);

export function activeProfile() {
  const ordinaryPolicy = policy();
  const inventoryProfile = containerProfile();
  const contextDigest = canonicalDigest({domain:'fixture-o2b-context-v1'});
  const binding = {binding_id:'fixture-chest-binding',container_ref:containerRef,
    template_id:templateId,mechanics_profile_ref:mechanicsProfileRef,
    mechanics_profile_digest:canonicalDigest(inventoryProfile),context_digest:
      contextDigest,ordinary_policy_digest:canonicalDigest(ordinaryPolicy),
    status:'approved'};
  return {schema:'rus.lower_dvina_trace_o2b_loaded_profile.v1',
    artifact_digest:profileDigest,profile:{schema:
      'rus.lower_dvina_trace_o2b_existing_container_profile.v1',profile_id:
      'lower_dvina_trace_o2b_existing_container_profile_v1',revision:1,
    status:'approved',scenario_id:'lower_dvina_trace_v1',
    scenario_definition_revision:19,policy:{policy_ref:
      'trace_ld_v1_o2b_existing_container_policy_v1',required_context_schema:
      'rus.items.existing_container_ordinary_context.v1',ordinary_policy_schema:
      'rus.items.existing_container_ordinary_policy.v2',max_new_entities_cap:8,
    allowed_authority_classes:['ordinary'],allowed_admission_classes:
      ['common_mundane'],allowed_availability_classes:['common'],
    allowed_disclosure_states:['concealed']},container_bindings:[binding],
    fallback_policy:'forbidden'}};
}

export function committedFixture(overrides = {}) {
  const ordinaryPolicy = policy();
  const inventoryProfile = containerProfile();
  const context = {schema:'rus.items.existing_container_ordinary_context.v1',
    profile_ref:'lower_dvina_trace_o2b_existing_container_profile_v1',
    profile_digest:profileDigest,
    policy_ref:'trace_ld_v1_o2b_existing_container_policy_v1',
    container_ref:containerRef,template_id:templateId,
    mechanics_profile_ref:mechanicsProfileRef,
    mechanics_profile_digest:canonicalDigest(inventoryProfile),
    context_digest:canonicalDigest({domain:'fixture-o2b-context-v1'}),
    owner_controller_ref:'owner:household',property_ref:'property:chest',
    site_function_ref:'site:household',economic_context_ref:'economy:local',
    context_bound_permission_refs:[],ordinary_policy:ordinaryPolicy,
    authoritative_status:'absent',container_inventory_profile:inventoryProfile,
    container_compatibility:[],mechanics_policy:{policy_ref:
      'mechanics:ordinary-container-v1',min_mass_grams:1,max_mass_grams:1000,
    max_external_hand_cost:0,max_packing_slot_cost:1,
    allowed_carry_forms:['compact']}};
  const objective = {schema:
    'rus.items.existing_container_ordinary_enablement.v1',profile_ref:
    'lower_dvina_trace_o2b_existing_container_profile_v1',
  profile_digest:profileDigest,
  policy_ref:'trace_ld_v1_o2b_existing_container_policy_v1',context_refs:{
    period_ref:'period:1230',region_ref:'region:lower-dvina',
    function_refs:['household'],environment_refs:['indoors'],
    occupation_household_refs:['household'],economic_context_ref:'economy:local',
    occupancy_state_ref:'occupied',material_culture_refs:['novgorod:1230'],
    property_context_ref:'property:chest'},policy_refs:{authority_policy_ref:
    'authority:ordinary',density_policy_ref:'density:container-v1',
    ordinary_presence_policy_ref:'presence:container-v1',
    runtime_item_mechanics_policy_ref:'mechanics:ordinary-container-v1',
    allowed_admission_classes:['common_mundane'],
    context_bound_permission_refs:[]},allowed_disclosure_policy_refs:[],
  identity_budget:{policy_version:'density:container-v1',density_band:'ordinary',
    identity_budget:2,source:'policy'}};
  const scope = {entity_kind:'container',entity_id:containerRef};
  const basis = {basis_ref:'basis:stored-household',state:'committed',scope_ref:scope,
    prepared_seed_provenance:null,functional_buckets:['household'],
    allowed_admission_classes:['common_mundane'],permission_refs:[]};
  const aggregate = overrides.ordinary_aggregate
    ?? createOrdinaryAggregate({scope_ref:scope,resolution_record_cap:4});
  const capacity = overrides.capacity_snapshot ?? [];
  const value = {party_state_version:7,container:{container_id:containerRef,
    template_id:templateId,state_version:3,closure_state:'closed',
    state:{ordinary_contents_context:context},placement:{anchor_id:'g6:fixture'}},
  ordinary_state_version:aggregate.state_version,ordinary_aggregate:aggregate,
  catalog_version:1,property_version:1,placement_version:1,
  supporting_basis_catalog_version:1,
  supporting_basis_catalog_digest:basisCatalogDigest([basis]),
  property_placement_context_digest:
    canonicalDigest({domain:'property-placement:fixture'}),
  property_placement_context:{property_catalog_version_ref:'property:v1',
    placement_catalog_version_ref:'placement:v1'},enablement:{
    objective_snapshot:objective,objective_digest:canonicalDigest(objective),
    enabled:true},supporting_bases:[basis],capacity_snapshot:capacity,
  inventory_input:{party_id:partyId,items:[],item_placements:[],item_profiles:[],
    containers:[{container_id:containerRef,template_id:templateId}],
    container_placements:[{party_id:partyId,container_id:containerRef,
      anchor_id:'g6:fixture'}],container_profiles:[inventoryProfile],
    container_compatibility:[],capacity_snapshot:structuredClone(capacity)}};
  value.inventory_input.container_profiles = [structuredClone(inventoryProfile)];
  return {...value,...overrides};
}

export function seedRequest() {
  const context = committedFixture().container.state.ordinary_contents_context;
  return buildExistingContainerOrdinarySeedRequest({container_context:{
    container_ref:context.container_ref,template_id:context.template_id,
    mechanics_profile_ref:context.mechanics_profile_ref,
    owner_controller_ref:context.owner_controller_ref,
    property_ref:context.property_ref,site_function_ref:context.site_function_ref,
    economic_context_ref:context.economic_context_ref,
    context_bound_permission_refs:context.context_bound_permission_refs,
    ordinary_policy:context.ordinary_policy},prior_resolutions:[]});
}

export function operationIdentity(resolutionMode = 'reveal') { return {
  root_turn_id:'turn-o2b-fixture',step_index:1,resolution_mode:resolutionMode,
  operation_ref:resolutionMode === 'reveal'
    ? `request_container_access:${containerRef}` : `move_entity:${containerRef}`}; }

export function modelPlan(request, entities = [entity()]) {
  return {schema:'ordinary_materialization_plan_v1',request_id:request.request_id,
    resolution:entities.length === 0 ? 'no_change' : 'seeded',
    density_band_proposal:entities.length === 0 ? null : 'ordinary',
    background_groups:[],entities,presence_resolutions:[],
    reason_code:entities.length === 0 ? 'no_ordinary_contents' : 'scope_seeded'};
}

export function entity(name = 'wooden spoon') { return {semantic_descriptor:{
  semantic_type:`household_supply_${name.replaceAll(' ','_')}`,name,facts:[]},
authority_class:'ordinary',admission_class:'common_mundane',
availability_class:'common',functional_bucket:'household',
presence_expectation:'routine',supporting_basis_ref:'basis:stored-household',
causal_basis:{basis_kind:'household_use',basis_refs:['basis:stored-household']},
property_basis_ref:'property:chest',placement_proposal:{scope_ref:containerRef,
  position_ref:containerRef},mechanics_proposal:{mass_grams:80,
  external_hand_cost:0,carry_form:'compact',packing_slot_cost:1,
  quantity:{value:1,unit:'item'},container:null}}; }

function policy() { return {schema:
  'rus.items.existing_container_ordinary_policy.v2',version:2,
unresolved_ordinary_contents:true,technical_limits:{schema:
  'rus.items.existing_container_ordinary_limits.v1',version:1,
max_new_entities:2}}; }
function containerProfile() { return {template_id:templateId,capacity:4,
  packing_slot_cost:1,carry_form:'regular',mass_grams:500}; }
function basisCatalogDigest(value) { return canonicalDigest({domain:
  'ordinary_supporting_basis_catalog_v1',supporting_bases:value}); }
