import { ORDINARY_MATERIALIZATION_PLAN_V1_JSON_SCHEMA, ORDINARY_MATERIALIZATION_PLAN_V1_SCHEMA, ORDINARY_MATERIALIZATION_REQUEST_V1_JSON_SCHEMA, ORDINARY_MATERIALIZATION_REQUEST_V1_SCHEMA, ORDINARY_MATERIALIZATION_V1_ENUMS } from './ordinary-materialization-v1-schema.js';
import { validateFiniteInitialAmountEstimate as initialEstimate,
  validateFiniteInitialAmountEstimateBinding as initialBinding,
  validateFiniteInitialAmountEstimatePolicy as initialPolicy } from
  './ordinary-materialization-initial-amount-choice.js';
import {
  arrayOf,
  arrayOfEnum,
  arrayOfStrings,
  assertValid,
  boolean,
  boundedInteger,
  enumValue,
  exactObject,
  freezeErrors,
  issue,
  nonemptyString,
  nonnegativeInteger,
  nullableEnum,
  positiveInteger,
  stringConst,
  validateJsonDataBoundary
} from './ordinary-materialization-validation.js';
export { ordinaryWorldPropertyPlacementContextDigest } from
  './ordinary-materialization-property-context-digest.js';

const REQUEST_SCHEMA = ORDINARY_MATERIALIZATION_REQUEST_V1_SCHEMA;
const PLAN_SCHEMA = ORDINARY_MATERIALIZATION_PLAN_V1_SCHEMA;

export { ORDINARY_MATERIALIZATION_PLAN_V1_JSON_SCHEMA, ORDINARY_MATERIALIZATION_PLAN_V1_SCHEMA, ORDINARY_MATERIALIZATION_REQUEST_V1_JSON_SCHEMA, ORDINARY_MATERIALIZATION_REQUEST_V1_SCHEMA, ORDINARY_MATERIALIZATION_V1_ENUMS };
export function validateOrdinaryMaterializationRequestV1(value) {
  const boundaryErrors = validateJsonDataBoundary(value);
  if (boundaryErrors.length !== 0) return freezeErrors(boundaryErrors);
  const errors = [];
  validateRequest(value, errors);
  return freezeErrors(errors);
}
export function assertOrdinaryMaterializationRequestV1(value) {
  return assertValid(value, validateOrdinaryMaterializationRequestV1, 'ORDINARY_MATERIALIZATION_REQUEST_INVALID');
}
export function validateOrdinaryMaterializationPlanV1(value, request = null) {
  const boundaryErrors = validateJsonDataBoundary(value);
  if (boundaryErrors.length !== 0) return freezeErrors(boundaryErrors);
  const errors = [];
  validatePlan(value, errors);
  if (errors.length === 0 && request !== null) validatePlanRequestBinding(value, request, errors);
  return freezeErrors(errors);
}

export function assertOrdinaryMaterializationPlanV1(value, request = null) {
  return assertValid(value, (candidate) => validateOrdinaryMaterializationPlanV1(candidate, request), 'ORDINARY_MATERIALIZATION_PLAN_INVALID');
}

function validateRequest(value,errors) {
  const keys=['schema', 'request_id', 'mode', 'scope_ref', 'context_refs', 'policy_refs', 'ordinary_state', 'candidate_query', 'technical_limits'];
  if (!exactObject(value, Object.hasOwn(value ?? {}, 'authority_envelope') ? [...keys,'authority_envelope'] : keys, '$', errors)) return;
  stringConst(value.schema, REQUEST_SCHEMA, 'schema', errors);
  nonemptyString(value.request_id, 'request_id', errors);
  enumValue(value.mode, ORDINARY_MATERIALIZATION_V1_ENUMS.mode, 'mode', errors);
  validateScopeRef(value.scope_ref, 'scope_ref', errors);
  validateContextRefs(value.context_refs, errors);
  validatePolicyRefs(value.policy_refs, errors);
  validateOrdinaryState(value.ordinary_state, errors);
  validateTechnicalLimits(value.technical_limits, errors);
  if (Object.hasOwn(value, 'authority_envelope')) validateAuthorityEnvelope(value.authority_envelope, value.mode, errors);
  if (value.mode === 'seed_scope') {
    if (value.candidate_query !== null) issue(errors, 'candidate_query', 'const', 'candidate_query must be null for seed_scope.');
  } else {
    validateCandidateQuery(value.candidate_query, errors);
  }
}

function validateAuthorityEnvelope(value, mode, errors) {
  const path='authority_envelope';
  if (mode === 'seed_scope') {
    if (!exactObject(value,['stage','density_bands','disclosure_policy_refs','group_bases'],path,errors)) return;
    stringConst(value.stage,'seed_scope',`${path}.stage`,errors);
    arrayOfEnum(value.density_bands,ORDINARY_MATERIALIZATION_V1_ENUMS.density_band,`${path}.density_bands`,errors);
    arrayOfStrings(value.disclosure_policy_refs,`${path}.disclosure_policy_refs`,errors);
    arrayOf(value.group_bases,`${path}.group_bases`,errors,(entry,p,e)=>{if(!exactObject(entry,['basis_ref','basis_state','functional_buckets','allowed_admission_classes','permission_refs'],p,e))return;nonemptyString(entry.basis_ref,`${p}.basis_ref`,e);enumValue(entry.basis_state,ORDINARY_MATERIALIZATION_V1_ENUMS.basis_state,`${p}.basis_state`,e);arrayOfEnum(entry.functional_buckets,ORDINARY_MATERIALIZATION_V1_ENUMS.functional_bucket,`${p}.functional_buckets`,e);arrayOfEnum(entry.allowed_admission_classes,ORDINARY_MATERIALIZATION_V1_ENUMS.admission_class,`${p}.allowed_admission_classes`,e);arrayOfStrings(entry.permission_refs,`${p}.permission_refs`,e);});
    return;
  }
  if (!exactObject(value,['stage','candidate','allowed_supporting_bases','selected_supporting_basis_ref','property_basis_ref','placement_refs'],path,errors)) return;
  stringConst(value.stage,'resolve_presence',`${path}.stage`,errors);
  if (exactObject(value.candidate,['semantic_type','functional_bucket','admission_class','availability_class','coverage_kind','coverage_ref'],`${path}.candidate`,errors)) { nonemptyString(value.candidate.semantic_type,`${path}.candidate.semantic_type`,errors);enumValue(value.candidate.functional_bucket,ORDINARY_MATERIALIZATION_V1_ENUMS.functional_bucket,`${path}.candidate.functional_bucket`,errors);enumValue(value.candidate.admission_class,ORDINARY_MATERIALIZATION_V1_ENUMS.admission_class,`${path}.candidate.admission_class`,errors);enumValue(value.candidate.availability_class,ORDINARY_MATERIALIZATION_V1_ENUMS.availability_class,`${path}.candidate.availability_class`,errors);nonemptyString(value.candidate.coverage_kind,`${path}.candidate.coverage_kind`,errors);nonemptyString(value.candidate.coverage_ref,`${path}.candidate.coverage_ref`,errors); }
  arrayOf(value.allowed_supporting_bases,`${path}.allowed_supporting_bases`,errors,validateAllowedSupportingBasis);nullableString(value.selected_supporting_basis_ref,`${path}.selected_supporting_basis_ref`,errors);if(value.selected_supporting_basis_ref!==null&&!value.allowed_supporting_bases.some(({basis_ref})=>basis_ref===value.selected_supporting_basis_ref))issue(errors,`${path}.selected_supporting_basis_ref`,'enum',`${path}.selected_supporting_basis_ref must be an allowed supporting basis.`);nonemptyString(value.property_basis_ref,`${path}.property_basis_ref`,errors);arrayOfStrings(value.placement_refs,`${path}.placement_refs`,errors);
}

function validatePlan(value,errors) {
  if (!exactObject(value, ['schema', 'request_id', 'resolution', 'density_band_proposal', 'background_groups', 'entities', 'presence_resolutions', 'reason_code'], '$', errors)) return;
  stringConst(value.schema, PLAN_SCHEMA, 'schema', errors);
  nonemptyString(value.request_id, 'request_id', errors);
  enumValue(value.resolution, ORDINARY_MATERIALIZATION_V1_ENUMS.resolution, 'resolution', errors);
  nullableEnum(value.density_band_proposal, ORDINARY_MATERIALIZATION_V1_ENUMS.density_band, 'density_band_proposal', errors);
  arrayOf(value.background_groups, 'background_groups', errors, validateBackgroundGroup);
  arrayOf(value.entities, 'entities', errors, validateEntity);
  arrayOf(value.presence_resolutions, 'presence_resolutions', errors, validatePresenceResolution);
  nonemptyString(value.reason_code, 'reason_code', errors);
  if (value.resolution === 'materialize' && Array.isArray(value.entities) && value.entities.length === 0) {
    issue(errors, 'entities', 'min_items', 'entities must contain a proposal for materialize.');
  }
}

function validateScopeRef(value,path,errors){if(!exactObject(value,['entity_kind','entity_id'],path,errors))return;enumValue(value.entity_kind,ORDINARY_MATERIALIZATION_V1_ENUMS.scope_kind,`${path}.entity_kind`,errors);nonemptyString(value.entity_id,`${path}.entity_id`,errors);}
function nullableString(value,path,errors) { if (value !== null) nonemptyString(value,path,errors); }

function validateContextRefs(value,errors) {
  const path='context_refs';
  if (!exactObject(value, ['period_ref', 'region_ref', 'function_refs', 'environment_refs', 'occupation_household_refs', 'economic_context_ref', 'occupancy_state_ref', 'material_culture_refs', 'property_context_ref'], path, errors)) return;
  for (const key of ['period_ref', 'region_ref', 'economic_context_ref', 'occupancy_state_ref', 'property_context_ref']) nonemptyString(value[key], `${path}.${key}`, errors);
  for (const key of ['function_refs', 'environment_refs', 'occupation_household_refs', 'material_culture_refs']) arrayOfStrings(value[key], `${path}.${key}`, errors);
}

function validatePolicyRefs(value,errors) {
  const path='policy_refs',keys=['authority_policy_ref','density_policy_ref','ordinary_presence_policy_ref','runtime_item_mechanics_policy_ref','allowed_admission_classes','context_bound_permission_refs','allowed_supporting_bases'],has=Object.hasOwn(value??{},'finite_source_initial_amount_estimate_policy');
  if (!exactObject(value,has?[...keys,'finite_source_initial_amount_estimate_policy']:keys,path,errors)) return;
  for (const key of ['authority_policy_ref', 'density_policy_ref', 'ordinary_presence_policy_ref', 'runtime_item_mechanics_policy_ref']) nonemptyString(value[key], `${path}.${key}`, errors);
  arrayOfEnum(value.allowed_admission_classes, ORDINARY_MATERIALIZATION_V1_ENUMS.admission_class, `${path}.allowed_admission_classes`, errors);
  arrayOfStrings(value.context_bound_permission_refs, `${path}.context_bound_permission_refs`, errors);
  arrayOf(value.allowed_supporting_bases, `${path}.allowed_supporting_bases`, errors, validateAllowedSupportingBasis);
  if(has) initialPolicy(value.finite_source_initial_amount_estimate_policy,`${path}.finite_source_initial_amount_estimate_policy`,errors,exactObject,stringConst,nonemptyString,issue);
}

function validateAllowedSupportingBasis(value,path,errors){if(!exactObject(value,['basis_ref','basis_state'],path,errors))return;nonemptyString(value.basis_ref,`${path}.basis_ref`,errors);enumValue(value.basis_state,ORDINARY_MATERIALIZATION_V1_ENUMS.basis_state,`${path}.basis_state`,errors);}

function validateOrdinaryState(value,errors) {
  const path='ordinary_state';
  if (!exactObject(value, ['seeded', 'density_band', 'remaining_identity_budget', 'background_groups', 'presence_resolutions', 'closed_observation_scopes'], path, errors)) return;
  boolean(value.seeded, `${path}.seeded`, errors);
  nullableEnum(value.density_band, ORDINARY_MATERIALIZATION_V1_ENUMS.density_band, `${path}.density_band`, errors);
  nonnegativeInteger(value.remaining_identity_budget, `${path}.remaining_identity_budget`, errors);
  for (const key of ['background_groups', 'presence_resolutions', 'closed_observation_scopes']) arrayOfStrings(value[key], `${path}.${key}`, errors);
  if (value.seeded === false) {
    if (value.density_band !== null) issue(errors, `${path}.density_band`, 'const', `${path}.density_band must be null while unseeded.`);
    if (value.remaining_identity_budget !== 0) issue(errors, `${path}.remaining_identity_budget`, 'const', `${path}.remaining_identity_budget must equal 0 while unseeded.`);
    for (const key of ['background_groups', 'presence_resolutions', 'closed_observation_scopes']) {
      if (Array.isArray(value[key]) && value[key].length !== 0) issue(errors, `${path}.${key}`, 'max_items', `${path}.${key} must be empty while unseeded.`);
    }
  } else if (value.seeded === true && value.density_band === null) {
    issue(errors, `${path}.density_band`, 'enum', `${path}.density_band must be set while seeded.`);
  }
}

function validateCandidateQuery(value,errors) {
  const path='candidate_query';
  if (!exactObject(value, ['candidate_key', 'candidate_hint', 'coverage_key', 'evidence_weight'], path, errors)) return;
  for (const key of ['candidate_key', 'candidate_hint', 'coverage_key']) nonemptyString(value[key], `${path}.${key}`, errors);
  if (value.evidence_weight !== 0) issue(errors, `${path}.evidence_weight`, 'const', `${path}.evidence_weight must equal 0.`);
}

function validateTechnicalLimits(value,errors) {
  const path='technical_limits';
  if (!exactObject(value, ['max_new_entities', 'max_new_background_groups', 'max_resolution_records'], path, errors)) return;
  for (const key of ['max_new_entities', 'max_new_background_groups', 'max_resolution_records']) positiveInteger(value[key], `${path}.${key}`, errors);
}

function validateBackgroundGroup(value,path,errors) {
  if (!exactObject(value, ['descriptor', 'functional_bucket', 'availability_class', 'allowed_admission_classes', 'causal_basis', 'property_basis_ref', 'permission_refs', 'disclosure_policy_ref'], path, errors)) return;
  nonemptyString(value.descriptor, `${path}.descriptor`, errors);
  enumValue(value.functional_bucket, ORDINARY_MATERIALIZATION_V1_ENUMS.functional_bucket, `${path}.functional_bucket`, errors);
  enumValue(value.availability_class, ORDINARY_MATERIALIZATION_V1_ENUMS.availability_class, `${path}.availability_class`, errors);
  arrayOfEnum(value.allowed_admission_classes, ORDINARY_MATERIALIZATION_V1_ENUMS.admission_class, `${path}.allowed_admission_classes`, errors);
  validateCausalBasis(value.causal_basis, `${path}.causal_basis`, errors);
  nonemptyString(value.property_basis_ref, `${path}.property_basis_ref`, errors);
  arrayOfStrings(value.permission_refs, `${path}.permission_refs`, errors);
  nonemptyString(value.disclosure_policy_ref, `${path}.disclosure_policy_ref`, errors);
}

function validateEntity(value, path, errors) {
  const keys=['semantic_descriptor','authority_class','admission_class','availability_class','functional_bucket','presence_expectation','supporting_basis_ref','causal_basis','property_basis_ref','placement_proposal','mechanics_proposal'],has=Object.hasOwn(value??{},'finite_source_initial_amount_estimate');
  if (!exactObject(value,has?[...keys,'finite_source_initial_amount_estimate']:keys,path,errors)) return;
  validateSemanticDescriptor(value.semantic_descriptor,`${path}.semantic_descriptor`,errors); enumValue(value.authority_class,ORDINARY_MATERIALIZATION_V1_ENUMS.authority_class,`${path}.authority_class`,errors); if(value.authority_class!=='ordinary') issue(errors,`${path}.authority_class`,'const',`${path}.authority_class must equal ordinary.`); enumValue(value.admission_class,ORDINARY_MATERIALIZATION_V1_ENUMS.admission_class,`${path}.admission_class`,errors); enumValue(value.availability_class,ORDINARY_MATERIALIZATION_V1_ENUMS.availability_class,`${path}.availability_class`,errors); enumValue(value.functional_bucket,ORDINARY_MATERIALIZATION_V1_ENUMS.functional_bucket,`${path}.functional_bucket`,errors); enumValue(value.presence_expectation,ORDINARY_MATERIALIZATION_V1_ENUMS.presence_expectation,`${path}.presence_expectation`,errors); nonemptyString(value.supporting_basis_ref,`${path}.supporting_basis_ref`,errors); validateCausalBasis(value.causal_basis,`${path}.causal_basis`,errors); nonemptyString(value.property_basis_ref,`${path}.property_basis_ref`,errors); validatePlacementProposal(value.placement_proposal,`${path}.placement_proposal`,errors); validateMechanicsProposal(value.mechanics_proposal,`${path}.mechanics_proposal`,errors); if(has) initialEstimate(value.finite_source_initial_amount_estimate,`${path}.finite_source_initial_amount_estimate`,errors,exactObject,stringConst,nonemptyString,issue);
}

function validateSemanticDescriptor(value,path,errors) {
  if (!exactObject(value, ['semantic_type', 'name', 'facts'], path, errors)) return;
  nonemptyString(value.semantic_type, `${path}.semantic_type`, errors);
  nonemptyString(value.name, `${path}.name`, errors);
  arrayOfStrings(value.facts, `${path}.facts`, errors);
}

function validateCausalBasis(value,path,errors) {
  if (!exactObject(value, ['basis_kind', 'basis_refs'], path, errors)) return;
  nonemptyString(value.basis_kind, `${path}.basis_kind`, errors);
  arrayOfStrings(value.basis_refs, `${path}.basis_refs`, errors, true);
}

function validatePlacementProposal(value,path,errors) {
  if (!exactObject(value, ['scope_ref', 'position_ref'], path, errors)) return;
  nonemptyString(value.scope_ref, `${path}.scope_ref`, errors);
  nonemptyString(value.position_ref, `${path}.position_ref`, errors);
}

function validateMechanicsProposal(value,path,errors) {
  if (!exactObject(value, ['mass_grams', 'external_hand_cost', 'carry_form', 'packing_slot_cost', 'quantity', 'container'], path, errors)) return;
  boundedInteger(value.mass_grams, 1, 1000000, `${path}.mass_grams`, errors);
  boundedInteger(value.external_hand_cost, 0, 2, `${path}.external_hand_cost`, errors);
  nonemptyString(value.carry_form, `${path}.carry_form`, errors);
  boundedInteger(value.packing_slot_cost, 0, 1000, `${path}.packing_slot_cost`, errors);
  if (!exactObject(value.quantity, ['value', 'unit'], `${path}.quantity`, errors)) return;
  boundedInteger(value.quantity.value, 1, 1000, `${path}.quantity.value`, errors);
  stringConst(value.quantity.unit, 'item', `${path}.quantity.unit`, errors);
  if (value.container !== null) issue(errors, `${path}.container`, 'const', `${path}.container must be null.`);
}

function validatePresenceResolution(value,path,errors) {
  if (!exactObject(value, ['candidate_key', 'coverage_key', 'resolution'], path, errors)) return;
  nonemptyString(value.candidate_key, `${path}.candidate_key`, errors);
  nonemptyString(value.coverage_key, `${path}.coverage_key`, errors);
  enumValue(value.resolution, ['absent', 'no_change', 'authority_required'], `${path}.resolution`, errors);
}

function validatePlanRequestBinding(plan, request, errors) {
  if (validateOrdinaryMaterializationRequestV1(request).length !== 0) {
    issue(errors, 'request', 'invalid', 'request must be a valid ordinary materialization request.');
    return;
  }
  if (plan.request_id !== request.request_id) issue(errors, 'request_id', 'const', 'request_id must match the request.');
  const bases = new Set(request.policy_refs.allowed_supporting_bases.map(({ basis_ref }) => basis_ref));
  const admissions = new Set(request.policy_refs.allowed_admission_classes);
  const initialAmountPolicy = request.policy_refs.finite_source_initial_amount_estimate_policy ?? null;
  for (const [index, entity] of plan.entities.entries()) {
    const path = `entities[${index}]`;
    if (!bases.has(entity.supporting_basis_ref)) issue(errors, `${path}.supporting_basis_ref`, 'enum', `${path}.supporting_basis_ref must be supplied by the request.`);
    const selected = request.authority_envelope?.stage === 'resolve_presence'
      ? request.authority_envelope.selected_supporting_basis_ref : null;
    if (selected !== null && entity.supporting_basis_ref !== selected) issue(errors, `${path}.supporting_basis_ref`, 'const', `${path}.supporting_basis_ref must match the code-selected supporting basis.`);
    if (!admissions.has(entity.admission_class)) issue(errors, `${path}.admission_class`, 'enum', `${path}.admission_class must be allowed by the request.`);
    initialBinding({entity,path,policy:initialAmountPolicy,errors,issue});
  }
  if (request.mode === 'seed_scope') {
    validateSeedPlanBinding(plan, errors);
    return;
  }
  validateTargetedPlanBinding(plan, request.candidate_query, errors);
}

function validateSeedPlanBinding(plan, errors) {
  if (!['seeded', 'no_change'].includes(plan.resolution)) {
    issue(errors, 'resolution', 'enum', 'resolution must be seeded or no_change for seed_scope.');
  }
  if (plan.presence_resolutions.length !== 0) {
    issue(errors, 'presence_resolutions', 'min_items', 'presence_resolutions must be empty for seed_scope.');
  }
  if (plan.resolution === 'no_change') {
    if (plan.entities.length !== 0) issue(errors, 'entities', 'min_items', 'entities must be empty for seed_scope no_change.');
    if (plan.background_groups.length !== 0) issue(errors, 'background_groups', 'min_items', 'background_groups must be empty for seed_scope no_change.');
    if (plan.density_band_proposal !== null) issue(errors, 'density_band_proposal', 'const', 'density_band_proposal must be null for seed_scope no_change.');
  }
}

function validateTargetedPlanBinding(plan, candidateQuery, errors) {
  const targetedResolutions = ['materialize', 'absent', 'no_change', 'authority_required'];
  if (plan.density_band_proposal !== null) {
    issue(errors, 'density_band_proposal', 'const', 'density_band_proposal must be null for a targeted request.');
  }
  if (plan.background_groups.length !== 0) {
    issue(errors, 'background_groups', 'min_items', 'background_groups must be empty for a targeted request.');
  }
  if (!targetedResolutions.includes(plan.resolution)) {
    issue(errors, 'resolution', 'enum', 'resolution must be a targeted outcome for a targeted request.');
    return;
  }
  if (plan.resolution === 'materialize') {
    if (plan.entities.length !== 1) issue(errors, 'entities', 'items', 'entities must contain exactly one proposal for targeted materialize.');
    if (plan.presence_resolutions.length !== 0) issue(errors, 'presence_resolutions', 'min_items', 'presence_resolutions must be empty for targeted materialize.');
    return;
  }
  if (plan.entities.length !== 0) issue(errors, 'entities', 'min_items', `entities must be empty for ${plan.resolution}.`);
  if (plan.presence_resolutions.length !== 1) {
    issue(errors, 'presence_resolutions', 'items', `presence_resolutions must contain exactly one record for ${plan.resolution}.`);
    return;
  }
  const [presence] = plan.presence_resolutions;
  if (presence.candidate_key !== candidateQuery.candidate_key) issue(errors, 'presence_resolutions[0].candidate_key', 'const', 'presence_resolutions[0].candidate_key must match candidate_query.candidate_key.');
  if (presence.coverage_key !== candidateQuery.coverage_key) issue(errors, 'presence_resolutions[0].coverage_key', 'const', 'presence_resolutions[0].coverage_key must match candidate_query.coverage_key.');
  if (presence.resolution !== plan.resolution) issue(errors, 'presence_resolutions[0].resolution', 'const', 'presence_resolutions[0].resolution must match plan resolution.');
}
