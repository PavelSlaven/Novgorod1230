import {
  assertAndNormalizeOrdinaryAggregate, canonicalDigest,
  createOrdinaryContextVersion, createOrdinaryCoverageKey
} from '@rus/materialization';
import { validateOrdinaryMaterializationPlanV1 } from
  '@rus/contracts/ordinary-materialization-v1';
import { basisDigest } from
  '../infrastructure/postgres/ordinary-materialization-phase-6-commit-internal.js';
import { validLowerDvinaTraceO2bLoadedProfile } from
  '../internal/lower-dvina-trace-o2b-profile.js';
import { buildO2bContainerResolution } from
  './lower-dvina-trace-o2b-container-resolution.js';
import { descriptorSafeJsonSnapshot } from './descriptor-safe-json.js';
import { validLowerDvinaTraceO2bPhysicalAttestation } from
  './lower-dvina-trace-o2b-physical-attestation.js';

export function createLowerDvinaTraceO2bContainerResolver({ partyId,
  inputDigest, loadedProfile, loadCommittedContainer,
  ordinaryMaterializationModel } = {}) {
  if (loadedProfile == null) return null;
  if (!validLowerDvinaTraceO2bLoadedProfile(loadedProfile)) {
    throw coded('TRACE_O2B_PROFILE_INVALID');
  }
  const bindings = loadedProfile.profile.container_bindings;
  if (bindings.length === 0) return null;
  if (!text(partyId) || !text(inputDigest)
      || typeof loadCommittedContainer !== 'function'
      || typeof ordinaryMaterializationModel !== 'function') {
    throw new TypeError('O2b resolver dependencies are required.');
  }
  return async function resolve(input) {
    const call = descriptorSafeJsonSnapshot(input);
    if (!exact(call, ['stage_a_request','operation_identity'])) {
      return denied('TRACE_TURN_STEP_CONTAINER_ORDINARY_CONTEXT_INVALID');
    }
    const seed = call.stage_a_request;
    const operation = call.operation_identity;
    const binding = bindings.find((value) => value.container_ref
      === seed?.container_ref && value.template_id === seed?.template_id
      && value.mechanics_profile_ref === seed?.mechanics_profile_ref);
    if (!binding || !operationIdentity(operation, seed.container_ref)) {
      return denied('TRACE_TURN_STEP_CONTAINER_ORDINARY_PROFILE_DRIFT');
    }
    const loaded = descriptorSafeJsonSnapshot(await loadCommittedContainer({ party_id:partyId,
      container_ref:seed.container_ref }));
    const committed = committedInput(loaded, seed, binding, loadedProfile);
    if (committed == null) {
      return denied('TRACE_TURN_STEP_CONTAINER_ORDINARY_COMMITTED_DRIFT');
    }
    if (committed.replay) return success([], null);
    let rawValue;
    try {
      rawValue = await ordinaryMaterializationModel(committed.modelRequest,
        {repair:null});
      let errors = validateOrdinaryMaterializationPlanV1(rawValue,
        committed.modelRequest);
      if (errors.length !== 0) {
        rawValue = await ordinaryMaterializationModel(committed.modelRequest, {
          repair:{schema:'ordinary_materialization_repair_context_v1',
            original_output:null,validation_errors:errors}
        });
        errors = validateOrdinaryMaterializationPlanV1(rawValue,
          committed.modelRequest);
        if (errors.length !== 0) throw coded(
          'TRACE_TURN_STEP_CONTAINER_ORDINARY_MODEL_INVALID');
      }
    } catch { return denied('TRACE_TURN_STEP_CONTAINER_ORDINARY_MODEL_INVALID'); }
    const raw = descriptorSafeJsonSnapshot(rawValue);
    const noChange = raw?.resolution === 'no_change';
    if (raw == null || !['seeded','no_change'].includes(raw.resolution)
        || raw.background_groups?.length !== 0
        || raw.presence_resolutions?.length !== 0
        || raw.entities.length > committed.modelRequest.technical_limits
          .max_new_entities
        || (noChange ? raw.entities.length !== 0
          || raw.density_band_proposal !== null
          : raw.density_band_proposal
            !== committed.objective.identity_budget.density_band)) {
      return denied('TRACE_TURN_STEP_CONTAINER_ORDINARY_MODEL_INVALID');
    }
    try { return buildO2bContainerResolution({ committed, raw, operation,
      partyId, inputDigest }); }
    catch (error) { return denied(error?.code
      ?? 'TRACE_TURN_STEP_CONTAINER_ORDINARY_RESOLUTION_INVALID'); }
  };
}

function committedInput(value, seed, binding, loadedProfile) {
  if (!validSeed(seed) || !plain(value) || !plain(value.container)
      || !plain(value.enablement)
      || !Array.isArray(value.supporting_bases)
      || !Array.isArray(value.capacity_snapshot)
      || !plain(value.inventory_input)) return null;
  const state = value.container.state;
  const context = state?.ordinary_contents_context;
  const objective = value.enablement.objective_snapshot;
  const scope = {entity_kind:'container',entity_id:seed.container_ref};
  if (!validContext(context, seed, binding, loadedProfile)
      || value.container.container_id !== seed.container_ref
      || value.container.template_id !== seed.template_id
      || !validLowerDvinaTraceO2bPhysicalAttestation(
        value.container, loadedProfile)
      || !versions(value) || value.enablement.enabled !== true
      || canonicalDigest(objective) !== value.enablement.objective_digest
      || !validObjective(objective, context, loadedProfile)
      || !value.supporting_bases.every((basis) => validBasis(basis, scope,
        context.context_bound_permission_refs))
      || basisDigest(value.supporting_bases)
        !== value.supporting_basis_catalog_digest
      || canonicalDigest(value.capacity_snapshot)
        !== canonicalDigest(value.inventory_input.capacity_snapshot)) return null;
  let aggregate;
  try { aggregate = assertAndNormalizeOrdinaryAggregate(
    value.ordinary_aggregate); } catch { return null; }
  if (aggregate.scope_ref.entity_kind !== 'container'
      || aggregate.scope_ref.entity_id !== seed.container_ref
      || aggregate.state_version !== value.ordinary_state_version) return null;
  const identity = coverageIdentity(scope, objective, context);
  if (aggregate.closed_observation_scopes.some((entry) => entry.coverage_key
    === identity.coverage_key && entry.category_key === identity.category_key
    && entry.context_version === identity.context_version)) {
    return { replay:true };
  }
  if (aggregate.seeded) return null;
  const maxEntities = Math.min(context.ordinary_policy.technical_limits
    .max_new_entities, aggregate.resolution_record_cap - 1);
  if (maxEntities < 1
      || objective.identity_budget.identity_budget > maxEntities) return null;
  const modelRequest = { schema:'ordinary_materialization_request_v1',
    request_id:`o2b:${seed.container_ref}:${value.container.state_version}`,
    mode:'seed_scope',scope_ref:scope,
    context_refs:objective.context_refs,
    policy_refs:{...objective.policy_refs,allowed_supporting_bases:
      value.supporting_bases.map(({basis_ref,state}) => ({basis_ref,
        basis_state:state}))},ordinary_state:{seeded:false,
      density_band:null,remaining_identity_budget:0,background_groups:[],
      presence_resolutions:[],closed_observation_scopes:[]},candidate_query:null,
    technical_limits:{max_new_entities:maxEntities,max_new_background_groups:1,
      max_resolution_records:aggregate.resolution_record_cap} };
  return { replay:false,value,context,objective,aggregate,identity,modelRequest,
    admissionBases:value.supporting_bases.map((basis) => ({...basis,
      policy:{functional_buckets:basis.functional_buckets,
        allowed_admission_classes:basis.allowed_admission_classes,
        permission_refs:basis.permission_refs ?? []}})) };
}

function validContext(c,s,b,p) { const profile=p.profile;
  return exact(c, ['schema','profile_ref','profile_digest','policy_ref',
    'container_ref','template_id','mechanics_profile_ref',
    'mechanics_profile_digest','context_digest','owner_controller_ref',
    'property_ref','site_function_ref','economic_context_ref',
    'context_bound_permission_refs','ordinary_policy','authoritative_status',
    'container_inventory_profile','container_compatibility','mechanics_policy'])
    && c.schema === profile.policy.required_context_schema
    && c.profile_ref === profile.profile_id
    && c.profile_digest === p.artifact_digest
    && c.policy_ref === profile.policy.policy_ref
    && c.container_ref === s.container_ref && c.template_id === s.template_id
    && c.mechanics_profile_ref === s.mechanics_profile_ref
    && c.mechanics_profile_digest === b.mechanics_profile_digest
    && c.context_digest === b.context_digest
    && canonicalDigest(c.ordinary_policy) === b.ordinary_policy_digest
    && canonicalDigest(s.ordinary_policy) === b.ordinary_policy_digest
    && canonicalDigest(s.context_refs) === canonicalDigest({
      owner_controller_ref:c.owner_controller_ref,property_ref:c.property_ref,
      site_function_ref:c.site_function_ref,
      economic_context_ref:c.economic_context_ref,
      context_bound_permission_refs:c.context_bound_permission_refs})
    && validOrdinaryPolicy(c.ordinary_policy)
    && c.ordinary_policy.technical_limits?.max_new_entities
      <= profile.policy.max_new_entities_cap
    && c.authoritative_status === 'absent'
    && refs(c.context_bound_permission_refs)
    && Array.isArray(c.container_compatibility)
    && exact(c.container_inventory_profile, ['template_id','capacity',
      'packing_slot_cost','carry_form','mass_grams'])
    && c.container_inventory_profile.template_id === c.template_id
    && canonicalDigest(c.container_inventory_profile)
      === c.mechanics_profile_digest
    && validMechanicsPolicy(c.mechanics_policy); }
function validObjective(o,c,p) { return exact(o, ['schema','profile_ref',
  'profile_digest','policy_ref','context_refs','policy_refs',
  'allowed_disclosure_policy_refs','identity_budget'])
  && o.schema === 'rus.items.existing_container_ordinary_enablement.v1'
  && o.profile_ref === p.profile.profile_id
  && o.profile_digest === p.artifact_digest
  && o.policy_ref === p.profile.policy.policy_ref
  && exact(o.context_refs, ['period_ref','region_ref','function_refs',
    'environment_refs','occupation_household_refs','economic_context_ref',
    'occupancy_state_ref','material_culture_refs','property_context_ref'])
  && exact(o.policy_refs, ['authority_policy_ref','density_policy_ref',
    'ordinary_presence_policy_ref','runtime_item_mechanics_policy_ref',
    'allowed_admission_classes','context_bound_permission_refs'])
  && o.context_refs.property_context_ref === c.property_ref
  && o.context_refs.economic_context_ref === c.economic_context_ref
  && [o.context_refs.period_ref,o.context_refs.region_ref,
    o.context_refs.occupancy_state_ref,o.context_refs.property_context_ref,
    o.policy_refs.authority_policy_ref,o.policy_refs.density_policy_ref,
    o.policy_refs.ordinary_presence_policy_ref,
    o.policy_refs.runtime_item_mechanics_policy_ref].every(text)
  && ['function_refs','environment_refs','occupation_household_refs',
    'material_culture_refs'].every((key) => refs(o.context_refs[key]))
  && canonicalDigest(o.policy_refs.context_bound_permission_refs)
    === canonicalDigest(c.context_bound_permission_refs)
  && o.policy_refs.allowed_admission_classes?.length === 1
  && o.policy_refs.allowed_admission_classes[0] === 'common_mundane'
  && refs(o.allowed_disclosure_policy_refs)
  && exact(o.identity_budget,['policy_version','density_band',
    'identity_budget','source'])
  && o.identity_budget.policy_version === o.policy_refs.density_policy_ref
  && o.identity_budget.density_band === 'ordinary'
  && o.identity_budget.source === 'policy'
  && Number.isSafeInteger(o.identity_budget.identity_budget)
  && o.identity_budget.identity_budget >= 0
  && o.identity_budget.identity_budget
      <= c.ordinary_policy.technical_limits.max_new_entities; }
function coverageIdentity(scope,o,c) { const policy=o.policy_refs
  .ordinary_presence_policy_ref; return {coverage_key:
    createOrdinaryCoverageKey({scope_ref:scope,
      coverage_kind:'existing_container_complete_contents',
      coverage_ref:c.container_ref,policy_version:policy}),category_key:
    `ordinary_container_category_${canonicalDigest({scope,policy}).slice(0,24)}`,
  context_version:createOrdinaryContextVersion({scope_ref:scope,
    context_refs:o.context_refs,ordinary_presence_policy_ref:policy,
    property_basis_ref:c.property_ref,
    property_placement_context_digest:c.context_digest})}; }
function validSeed(value) { return exact(value, ['schema','container_ref',
  'template_id','mechanics_profile_ref','context_refs','ordinary_policy',
  'technical_limits','prior_resolutions','candidate_query'])
  && value.schema === 'rus.items.existing_container_ordinary_seed_request.v2'
  && value.candidate_query === null && Array.isArray(value.prior_resolutions)
  && value.prior_resolutions.every(text)
  && canonicalDigest(value.technical_limits)
    === canonicalDigest(value.ordinary_policy.technical_limits); }
function validOrdinaryPolicy(value) { return exact(value, ['schema','version',
  'unresolved_ordinary_contents','technical_limits'])
  && value.schema === 'rus.items.existing_container_ordinary_policy.v2'
  && value.version === 2 && value.unresolved_ordinary_contents === true
  && exact(value.technical_limits,
    ['schema','version','max_new_entities'])
  && value.technical_limits.schema
    === 'rus.items.existing_container_ordinary_limits.v1'
  && value.technical_limits.version === 1
  && Number.isSafeInteger(value.technical_limits.max_new_entities)
  && value.technical_limits.max_new_entities >= 1
  && value.technical_limits.max_new_entities <= 8; }
function validMechanicsPolicy(value) { return exact(value, ['policy_ref',
  'min_mass_grams','max_mass_grams','max_external_hand_cost',
  'max_packing_slot_cost','allowed_carry_forms'])
  && text(value.policy_ref) && Number.isSafeInteger(value.min_mass_grams)
  && Number.isSafeInteger(value.max_mass_grams)
  && value.min_mass_grams >= 0 && value.max_mass_grams >= value.min_mass_grams
  && Number.isSafeInteger(value.max_external_hand_cost)
  && value.max_external_hand_cost >= 0
  && Number.isSafeInteger(value.max_packing_slot_cost)
  && value.max_packing_slot_cost >= 0 && refs(value.allowed_carry_forms); }
function validBasis(value, scope, permissions) { return exact(value, ['basis_ref','state',
  'scope_ref','prepared_seed_provenance','functional_buckets',
  'allowed_admission_classes','permission_refs'])
  && text(value.basis_ref) && value.state === 'committed'
  && canonicalDigest(value.scope_ref) === canonicalDigest(scope)
  && value.prepared_seed_provenance === null
  && refs(value.functional_buckets)
  && value.functional_buckets.length > 0
  && canonicalDigest(value.allowed_admission_classes)
    === canonicalDigest(['common_mundane']) && refs(value.permission_refs)
  && canonicalDigest(value.permission_refs) === canonicalDigest(permissions); }
function versions(v) { return ['party_state_version','ordinary_state_version',
  'catalog_version','property_version','placement_version',
  'supporting_basis_catalog_version'].every((key) =>
  Number.isSafeInteger(v[key]) && v[key] >= 0)
  && Number.isSafeInteger(v.container?.state_version)
  && v.container.state_version >= 0; }
function operationIdentity(v, containerRef) { return exact(v,['root_turn_id',
  'step_index','operation_ref','resolution_mode']) && text(v.root_turn_id)
  && Number.isSafeInteger(v.step_index) && v.step_index >= 1 && v.step_index <= 8
  && (v.resolution_mode === 'reveal'
    && v.operation_ref === `request_container_access:${containerRef}`
    || v.resolution_mode === 'concealed'
      && v.operation_ref === `move_entity:${containerRef}`); }
function success(items,plan) { return Object.freeze({pass:true,
  materialized_items:structuredClone(items),
  ordinary_materialization_atomic_write_plan:plan,errors:[]}); }
function denied(code) { return Object.freeze({pass:false,materialized_items:[],
  ordinary_materialization_atomic_write_plan:null,errors:[{code,
    category:'data_gap',retryable:false,message:code,details:{}}]}); }
function coded(code) { return Object.assign(new Error(code),{code}); }
function text(v) { return typeof v === 'string' && v.length > 0
  && v.trim() === v; }
function refs(v) { return Array.isArray(v) && v.every(text)
  && new Set(v).size === v.length; }
function plain(v) { return v != null && typeof v === 'object'
  && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype; }
function exact(v,keys) { return plain(v) && Object.keys(v).length === keys.length
  && keys.every((key) => Object.hasOwn(v,key)); }
