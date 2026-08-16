import {
  ORDINARY_MATERIALIZATION_PLAN_V1_JSON_SCHEMA,
  ORDINARY_MATERIALIZATION_PLAN_V1_SCHEMA,
  ORDINARY_MATERIALIZATION_REQUEST_V1_JSON_SCHEMA,
  ORDINARY_MATERIALIZATION_REQUEST_V1_SCHEMA,
  ORDINARY_MATERIALIZATION_V1_ENUMS
} from './ordinary-materialization-v1-schema.js';

const REQUEST_SCHEMA = ORDINARY_MATERIALIZATION_REQUEST_V1_SCHEMA;
const PLAN_SCHEMA = ORDINARY_MATERIALIZATION_PLAN_V1_SCHEMA;

export {
  ORDINARY_MATERIALIZATION_PLAN_V1_JSON_SCHEMA,
  ORDINARY_MATERIALIZATION_PLAN_V1_SCHEMA,
  ORDINARY_MATERIALIZATION_REQUEST_V1_JSON_SCHEMA,
  ORDINARY_MATERIALIZATION_REQUEST_V1_SCHEMA,
  ORDINARY_MATERIALIZATION_V1_ENUMS
};

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

function validateRequest(value, errors) {
  if (!exactObject(value, ['schema', 'request_id', 'mode', 'scope_ref', 'context_refs', 'policy_refs', 'ordinary_state', 'candidate_query', 'technical_limits'], '$', errors)) return;
  stringConst(value.schema, REQUEST_SCHEMA, 'schema', errors);
  nonemptyString(value.request_id, 'request_id', errors);
  enumValue(value.mode, ORDINARY_MATERIALIZATION_V1_ENUMS.mode, 'mode', errors);
  validateScopeRef(value.scope_ref, 'scope_ref', errors);
  validateContextRefs(value.context_refs, errors);
  validatePolicyRefs(value.policy_refs, errors);
  validateOrdinaryState(value.ordinary_state, errors);
  validateTechnicalLimits(value.technical_limits, errors);
  if (value.mode === 'seed_scope') {
    if (value.candidate_query !== null) issue(errors, 'candidate_query', 'const', 'candidate_query must be null for seed_scope.');
  } else {
    validateCandidateQuery(value.candidate_query, errors);
  }
}

function validatePlan(value, errors) {
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

function validateScopeRef(value, path, errors) {
  if (!exactObject(value, ['entity_kind', 'entity_id'], path, errors)) return;
  enumValue(value.entity_kind, ORDINARY_MATERIALIZATION_V1_ENUMS.scope_kind, `${path}.entity_kind`, errors);
  nonemptyString(value.entity_id, `${path}.entity_id`, errors);
}

function validateContextRefs(value, errors) {
  const path = 'context_refs';
  if (!exactObject(value, ['period_ref', 'region_ref', 'function_refs', 'environment_refs', 'occupation_household_refs', 'economic_context_ref', 'occupancy_state_ref', 'material_culture_refs', 'property_context_ref'], path, errors)) return;
  for (const key of ['period_ref', 'region_ref', 'economic_context_ref', 'occupancy_state_ref', 'property_context_ref']) nonemptyString(value[key], `${path}.${key}`, errors);
  for (const key of ['function_refs', 'environment_refs', 'occupation_household_refs', 'material_culture_refs']) arrayOfStrings(value[key], `${path}.${key}`, errors);
}

function validatePolicyRefs(value, errors) {
  const path = 'policy_refs';
  if (!exactObject(value, ['authority_policy_ref', 'density_policy_ref', 'ordinary_presence_policy_ref', 'runtime_item_mechanics_policy_ref', 'allowed_admission_classes', 'context_bound_permission_refs', 'allowed_supporting_bases'], path, errors)) return;
  for (const key of ['authority_policy_ref', 'density_policy_ref', 'ordinary_presence_policy_ref', 'runtime_item_mechanics_policy_ref']) nonemptyString(value[key], `${path}.${key}`, errors);
  arrayOfEnum(value.allowed_admission_classes, ORDINARY_MATERIALIZATION_V1_ENUMS.admission_class, `${path}.allowed_admission_classes`, errors);
  arrayOfStrings(value.context_bound_permission_refs, `${path}.context_bound_permission_refs`, errors);
  arrayOf(value.allowed_supporting_bases, `${path}.allowed_supporting_bases`, errors, validateAllowedSupportingBasis);
}

function validateAllowedSupportingBasis(value, path, errors) {
  if (!exactObject(value, ['basis_ref', 'basis_state'], path, errors)) return;
  nonemptyString(value.basis_ref, `${path}.basis_ref`, errors);
  enumValue(value.basis_state, ORDINARY_MATERIALIZATION_V1_ENUMS.basis_state, `${path}.basis_state`, errors);
}

function validateOrdinaryState(value, errors) {
  const path = 'ordinary_state';
  if (!exactObject(value, ['seeded', 'density_band', 'remaining_identity_budget', 'background_groups', 'presence_resolutions', 'closed_observation_scopes'], path, errors)) return;
  boolean(value.seeded, `${path}.seeded`, errors);
  nullableEnum(value.density_band, ORDINARY_MATERIALIZATION_V1_ENUMS.density_band, `${path}.density_band`, errors);
  nonnegativeInteger(value.remaining_identity_budget, `${path}.remaining_identity_budget`, errors);
  for (const key of ['background_groups', 'presence_resolutions', 'closed_observation_scopes']) arrayOfStrings(value[key], `${path}.${key}`, errors);
}

function validateCandidateQuery(value, errors) {
  const path = 'candidate_query';
  if (!exactObject(value, ['candidate_key', 'candidate_hint', 'coverage_key', 'evidence_weight'], path, errors)) return;
  for (const key of ['candidate_key', 'candidate_hint', 'coverage_key']) nonemptyString(value[key], `${path}.${key}`, errors);
  if (value.evidence_weight !== 0) issue(errors, `${path}.evidence_weight`, 'const', `${path}.evidence_weight must equal 0.`);
}

function validateTechnicalLimits(value, errors) {
  const path = 'technical_limits';
  if (!exactObject(value, ['max_new_entities', 'max_new_background_groups', 'max_resolution_records'], path, errors)) return;
  for (const key of ['max_new_entities', 'max_new_background_groups', 'max_resolution_records']) positiveInteger(value[key], `${path}.${key}`, errors);
}

function validateBackgroundGroup(value, path, errors) {
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
  if (!exactObject(value, ['semantic_descriptor', 'authority_class', 'admission_class', 'availability_class', 'functional_bucket', 'presence_expectation', 'supporting_basis_ref', 'causal_basis', 'property_basis_ref', 'placement_proposal', 'mechanics_proposal'], path, errors)) return;
  validateSemanticDescriptor(value.semantic_descriptor, `${path}.semantic_descriptor`, errors);
  enumValue(value.authority_class, ORDINARY_MATERIALIZATION_V1_ENUMS.authority_class, `${path}.authority_class`, errors);
  if (value.authority_class !== 'ordinary') issue(errors, `${path}.authority_class`, 'const', `${path}.authority_class must equal ordinary.`);
  enumValue(value.admission_class, ORDINARY_MATERIALIZATION_V1_ENUMS.admission_class, `${path}.admission_class`, errors);
  enumValue(value.availability_class, ORDINARY_MATERIALIZATION_V1_ENUMS.availability_class, `${path}.availability_class`, errors);
  enumValue(value.functional_bucket, ORDINARY_MATERIALIZATION_V1_ENUMS.functional_bucket, `${path}.functional_bucket`, errors);
  enumValue(value.presence_expectation, ORDINARY_MATERIALIZATION_V1_ENUMS.presence_expectation, `${path}.presence_expectation`, errors);
  nonemptyString(value.supporting_basis_ref, `${path}.supporting_basis_ref`, errors);
  validateCausalBasis(value.causal_basis, `${path}.causal_basis`, errors);
  nonemptyString(value.property_basis_ref, `${path}.property_basis_ref`, errors);
  validatePlacementProposal(value.placement_proposal, `${path}.placement_proposal`, errors);
  validateMechanicsProposal(value.mechanics_proposal, `${path}.mechanics_proposal`, errors);
}

function validateSemanticDescriptor(value, path, errors) {
  if (!exactObject(value, ['semantic_type', 'name', 'facts'], path, errors)) return;
  nonemptyString(value.semantic_type, `${path}.semantic_type`, errors);
  nonemptyString(value.name, `${path}.name`, errors);
  arrayOfStrings(value.facts, `${path}.facts`, errors);
}

function validateCausalBasis(value, path, errors) {
  if (!exactObject(value, ['basis_kind', 'basis_refs'], path, errors)) return;
  nonemptyString(value.basis_kind, `${path}.basis_kind`, errors);
  arrayOfStrings(value.basis_refs, `${path}.basis_refs`, errors, true);
}

function validatePlacementProposal(value, path, errors) {
  if (!exactObject(value, ['scope_ref', 'position_ref'], path, errors)) return;
  nonemptyString(value.scope_ref, `${path}.scope_ref`, errors);
  nonemptyString(value.position_ref, `${path}.position_ref`, errors);
}

function validateMechanicsProposal(value, path, errors) {
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

function validatePresenceResolution(value, path, errors) {
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
  for (const [index, entity] of plan.entities.entries()) {
    const path = `entities[${index}]`;
    if (!bases.has(entity.supporting_basis_ref)) issue(errors, `${path}.supporting_basis_ref`, 'enum', `${path}.supporting_basis_ref must be supplied by the request.`);
    if (!admissions.has(entity.admission_class)) issue(errors, `${path}.admission_class`, 'enum', `${path}.admission_class must be allowed by the request.`);
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
    // candidate_key is opaque code-owned identity: this DTO has no model-owned
    // candidate field, so commit binds the one proposal to request.candidate_query.
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

function exactObject(value, keys, path, errors) {
  if (!plainObject(value)) {
    issue(errors, path, 'type', `${path} must be an object.`);
    return false;
  }
  for (const key of keys) if (!Object.hasOwn(value, key)) issue(errors, path === '$' ? key : `${path}.${key}`, 'required', `${path === '$' ? key : `${path}.${key}`} is required.`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) issue(errors, path === '$' ? key : `${path}.${key}`, 'additional_property', `${path === '$' ? key : `${path}.${key}`} is not allowed.`);
  return true;
}

function arrayOf(value, path, errors, validator) {
  if (!Array.isArray(value)) {
    issue(errors, path, 'type', `${path} must be an array.`);
    return;
  }
  value.forEach((item, index) => validator(item, `${path}[${index}]`, errors));
}

function arrayOfStrings(value, path, errors, nonempty = false) {
  arrayOf(value, path, errors, (item, itemPath, itemErrors) => nonemptyString(item, itemPath, itemErrors));
  if (nonempty && Array.isArray(value) && value.length === 0) issue(errors, path, 'min_items', `${path} must not be empty.`);
}

function arrayOfEnum(value, values, path, errors) {
  arrayOf(value, path, errors, (item, itemPath, itemErrors) => enumValue(item, values, itemPath, itemErrors));
}

function nonemptyString(value, path, errors) {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) issue(errors, path, 'type', `${path} must be a nonempty string.`);
}

function stringConst(value, constant, path, errors) {
  if (typeof value !== 'string') issue(errors, path, 'type', `${path} must be a string.`);
  else if (value !== constant) issue(errors, path, 'const', `${path} must equal ${constant}.`);
}

function enumValue(value, values, path, errors) {
  if (typeof value !== 'string') issue(errors, path, 'type', `${path} must be a string.`);
  else if (!values.includes(value)) issue(errors, path, 'enum', `${path} must be one of: ${values.join(', ')}.`);
}

function nullableEnum(value, values, path, errors) {
  if (value !== null) enumValue(value, values, path, errors);
}

function boolean(value, path, errors) {
  if (typeof value !== 'boolean') issue(errors, path, 'type', `${path} must be a boolean.`);
}

function nonnegativeInteger(value, path, errors) {
  if (!Number.isInteger(value) || value < 0) issue(errors, path, 'type', `${path} must be a nonnegative integer.`);
}

function positiveInteger(value, path, errors) {
  if (!Number.isInteger(value) || value < 1) issue(errors, path, 'type', `${path} must be a positive integer.`);
}

function boundedInteger(value, min, max, path, errors) {
  if (!Number.isInteger(value) || value < min || value > max) issue(errors, path, 'range', `${path} must be an integer from ${min} to ${max}.`);
}

function issue(errors, path, code, message) {
  errors.push({ path, code, message });
}

function assertValid(value, validator, code) {
  const errors = validator(value);
  if (errors.length === 0) return value;
  const error = new TypeError(errors.map(({ message }) => message).join('\n'));
  error.name = 'OrdinaryMaterializationValidationError';
  error.code = code;
  error.validationErrors = errors;
  throw error;
}

function freezeErrors(errors) {
  return Object.freeze(errors.map((error) => Object.freeze(error))
    .sort((left, right) => `${left.path}\u0000${left.code}\u0000${left.message}`.localeCompare(`${right.path}\u0000${right.code}\u0000${right.message}`)));
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null);
}

function validateJsonDataBoundary(root) {
  const errors = [];
  const seen = new WeakSet();
  const stack = [{ value: root, path: '$' }];
  while (stack.length !== 0) {
    const { value, path } = stack.pop();
    if (value === null || typeof value === 'string' || typeof value === 'boolean') continue;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) issue(errors, path, 'data_boundary', `${path} must not be nonfinite.`);
      continue;
    }
    if (typeof value !== 'object') {
      issue(errors, path, 'data_boundary', `${path} must be JSON data.`);
      continue;
    }
    if (seen.has(value)) {
      issue(errors, path, 'data_boundary', `${path} must not contain cycles or aliases.`);
      continue;
    }
    seen.add(value);
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if ((array && prototype !== Array.prototype)
        || (!array && prototype !== Object.prototype && prototype !== null)) {
      issue(errors, path, 'data_boundary', `${path} must have a JSON-compatible prototype.`);
      continue;
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key === 'symbol')) {
      issue(errors, path, 'data_boundary', `${path} must not contain symbol keys.`);
      continue;
    }
    if (array) {
      const length = Object.getOwnPropertyDescriptor(value, 'length');
      const validKeys = length?.enumerable === false
        && Object.hasOwn(length, 'value')
        && length.value === value.length
        && keys.length === value.length + 1
        && keys.every((key) => key === 'length' || typeof key === 'string'
          && Number.isSafeInteger(Number(key))
          && Number(key) >= 0 && Number(key) < value.length
          && String(Number(key)) === key);
      if (!validKeys) {
        issue(errors, path, 'data_boundary', `${path} must be a dense standard array.`);
        continue;
      }
    }
    for (const key of keys.sort((left, right) => String(left).localeCompare(String(right)))) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      const childPath = array ? `${path}[${key}]` : `${path}.${key}`;
      if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor ?? {}, 'value')) {
        issue(errors, childPath, 'data_boundary', `${childPath} must be an enumerable data property.`);
        continue;
      }
      stack.push({ value: descriptor.value, path: childPath });
    }
  }
  return errors;
}
