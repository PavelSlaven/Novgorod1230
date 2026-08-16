import { deepFreeze } from '@rus/kernel';
import {
  assertOrdinaryMaterializationRequestV1,
  validateOrdinaryMaterializationPlanV1
} from '@rus/contracts/ordinary-materialization-v1';
import {
  assertAndNormalizeOrdinaryMaterializationWorkingProjection,
  canonicalDigest,
  refreshOrdinaryMaterializationWorkingProjection,
  validateOrdinaryBackgroundGroup,
  validateSupportingBasisAdmission
} from '@rus/materialization';
import { turnFailure } from './errors.js';

/**
 * Runs the independent, candidate-free Stage A seed. It intentionally returns
 * only server-side data and performs neither item admission nor persistence.
 */
export async function resolveOrdinaryMaterializationSeedScope({
  request, ordinaryMaterializationModel, workingProjection, basisCatalog,
  allowedDisclosurePolicyRefs, resolveIdentityBudget
} = {}) {
  assertSeedRequest(request);
  if (typeof ordinaryMaterializationModel !== 'function') {
    throw turnFailure('TURN_ORDINARY_SEED_MODEL_MISSING',
      'ordinaryMaterializationModel must be an injected function');
  }
  const safeRequest = immutable(request);
  const normalizedWorkingProjection = assertMatchingWorkingScope(
    safeRequest, workingProjection);
  let rawPlan = await invokeModel(ordinaryMaterializationModel, safeRequest,
    { repair: null }, false);
  let errors = validateOrdinaryMaterializationPlanV1(rawPlan, safeRequest);
  let repaired = false;
  if (errors.length !== 0) {
    rawPlan = await invokeModel(ordinaryMaterializationModel, safeRequest, {
      repair: { schema: 'ordinary_materialization_repair_context_v1',
        original_output: safeModelOutput(rawPlan), validation_errors: errors }
    }, true);
    errors = validateOrdinaryMaterializationPlanV1(rawPlan, safeRequest);
    repaired = true;
    if (errors.length !== 0) {
      throw turnFailure('TURN_ORDINARY_SEED_PLAN_INVALID',
        'Ordinary seed response and its one structural repair are invalid.',
        { request_id: safeRequest.request_id, repair_attempted: true,
          validation_errors: errors });
    }
  }
  const plan = immutable(rawPlan);
  const seedPlan = validateSeedPlan({ request: safeRequest, plan,
    basisCatalog, allowedDisclosurePolicyRefs });
  if (seedPlan.kind === 'no_change') {
    return deepFreeze({
      status: 'no_change', decision: decisionMetadata(safeRequest, plan, repaired),
      prepared_background_groups: [],
      pending_items_property_admission: [],
      working_projection: normalizedWorkingProjection
    });
  }
  if (typeof resolveIdentityBudget !== 'function') {
    throw turnFailure('TURN_ORDINARY_SEED_BUDGET_RESOLVER_MISSING',
      'resolveIdentityBudget must be an injected function for seeded Stage A.');
  }
  const identityBudgetResolution = await resolveBudget(resolveIdentityBudget,
    safeRequest, plan);
  const transition = deepFreeze({
    kind: 'seed', request_identity: safeRequest.request_id,
    expected_state_version:
      normalizedWorkingProjection.ordinary_aggregate.state_version,
    density_band: plan.density_band_proposal,
    identity_budget: identityBudgetResolution.identity_budget,
    background_groups: seedPlan.preparedGroups
  });
  let nextWorkingProjection;
  try {
    nextWorkingProjection = refreshOrdinaryMaterializationWorkingProjection({
      working_projection: normalizedWorkingProjection,
      ordinary_transition: transition
    });
  } catch (error) {
    throw turnFailure('TURN_ORDINARY_SEED_TRANSITION_INVALID',
      'Ordinary seed cannot be applied to the working projection.', {
        request_id: safeRequest.request_id, cause: causeMessage(error)
      });
  }
  return deepFreeze({
    status: 'seeded', decision: decisionMetadata(safeRequest, plan, repaired),
    prepared_background_groups: seedPlan.preparedGroups,
    pending_items_property_admission: seedPlan.pendingItemsPropertyAdmission,
    identity_budget_resolution: identityBudgetResolution,
    working_projection: nextWorkingProjection
  });
}

function assertSeedRequest(request) {
  try { assertOrdinaryMaterializationRequestV1(request); } catch (error) {
    throw turnFailure('TURN_ORDINARY_SEED_REQUEST_INVALID',
      'Ordinary seed request must match ordinary_materialization_request_v1.',
      { cause: causeMessage(error) });
  }
  if (request.mode !== 'seed_scope' || request.candidate_query !== null) {
    throw turnFailure('TURN_ORDINARY_SEED_REQUEST_INVALID',
      'Ordinary seed must be candidate-free seed_scope.');
  }
}

async function invokeModel(model, request, context, repairing) {
  try {
    return await model(request, immutable(context));
  } catch (error) {
    throw turnFailure('TURN_ORDINARY_SEED_MODEL_FAILED',
      repairing ? 'Ordinary seed structural repair failed.'
        : 'Ordinary seed model request failed.', { cause: causeMessage(error) });
  }
}

function validateSeedPlan({ request, plan, basisCatalog,
  allowedDisclosurePolicyRefs }) {
  if (plan.resolution === 'no_change') {
    return { kind: 'no_change', preparedGroups: [] };
  }
  if (plan.resolution !== 'seeded' || plan.density_band_proposal === null
      || plan.presence_resolutions.length !== 0) {
    reject('ORDINARY_SEED_OUTCOME_INVALID',
      'Stage A requires seeded outcome, density, and no presence resolution.');
  }
  if (plan.background_groups.length > request.technical_limits.max_new_background_groups
      || plan.entities.length > request.technical_limits.max_new_entities) {
    reject('ORDINARY_SEED_LIMIT_EXCEEDED',
      'Stage A proposal exceeds its explicit minimal technical limit.');
  }
  const preparedGroups = plan.background_groups.map((group) => {
    try {
      return validateOrdinaryBackgroundGroup({ request, group,
        basis_catalog: basisCatalog,
        allowed_disclosure_policy_refs: allowedDisclosurePolicyRefs });
    } catch (error) {
      reject('ORDINARY_SEED_GROUP_INVALID', causeMessage(error));
    }
  });
  const pendingItemsPropertyAdmission = plan.entities.map((entity) => {
    if (entity.authority_class !== 'ordinary'
        || entity.admission_class !== 'common_mundane'
        || entity.availability_class !== 'common') {
      reject('ORDINARY_SEED_ENTITY_RESTRICTED',
        'Stage A permits only salient common ordinary entities.');
    }
    if (entity.property_basis_ref !== request.context_refs.property_context_ref) {
      reject('ORDINARY_SEED_ENTITY_PROPERTY_INVALID',
        'Stage A entity property basis must equal the committed request context.');
    }
    try {
      validateSupportingBasisAdmission({ request, candidate: {
        supporting_basis_ref: entity.supporting_basis_ref,
        functional_bucket: entity.functional_bucket,
        admission_class: entity.admission_class,
        availability_class: entity.availability_class,
        permission_refs: []
      }, basis_catalog: basisCatalog });
    } catch (error) {
      reject('ORDINARY_SEED_ENTITY_BASIS_INVALID', causeMessage(error));
    }
    for (const basisRef of entity.causal_basis.basis_refs) {
      try {
        validateSupportingBasisAdmission({ request, candidate: {
          supporting_basis_ref: basisRef,
          functional_bucket: entity.functional_bucket,
          admission_class: entity.admission_class,
          availability_class: entity.availability_class,
          permission_refs: []
        }, basis_catalog: basisCatalog });
      } catch (error) {
        reject('ORDINARY_SEED_ENTITY_CAUSAL_BASIS_INVALID',
          causeMessage(error));
      }
    }
    return pendingItemsPropertyAdmissionHandoff(request, entity);
  });
  return { kind: 'seeded', preparedGroups: immutable(preparedGroups),
    pendingItemsPropertyAdmission: immutable(pendingItemsPropertyAdmission) };
}

function decisionMetadata(request, plan, repaired) {
  return deepFreeze({
    schema: 'ordinary_seed_scope_decision_v1', request_id: request.request_id,
    scope_ref: immutable(request.scope_ref), resolution: plan.resolution,
    density_band: plan.density_band_proposal, repaired
  });
}

function pendingItemsPropertyAdmissionHandoff(request, entity) {
  const evidence = {
    authority_class: entity.authority_class,
    admission_class: entity.admission_class,
    availability_class: entity.availability_class,
    functional_bucket: entity.functional_bucket,
    supporting_basis_ref: entity.supporting_basis_ref,
    causal_basis: entity.causal_basis,
    property_basis_ref: entity.property_basis_ref
  };
  return deepFreeze({
    schema: 'ordinary_pending_items_property_admission_v1',
    status: 'pending_items_property_admission',
    seed_request_id: request.request_id,
    scope_ref: immutable(request.scope_ref),
    ...immutable(evidence),
    proposal_ref: `ordinary_pending_${canonicalDigest({
      domain: 'ordinary_pending_items_property_admission_v1',
      seed_request_id: request.request_id, scope_ref: request.scope_ref, evidence
    }).slice(0, 24)}`
  });
}

async function resolveBudget(resolver, request, plan) {
  let budget;
  const budgetRequest = immutable({
    density_band: plan.density_band_proposal,
    scope_ref: request.scope_ref,
    density_policy_ref: request.policy_refs.density_policy_ref,
    hard_technical_max: request.technical_limits.max_new_entities
  });
  try { budget = await resolver(budgetRequest); } catch (error) {
    throw turnFailure('TURN_ORDINARY_SEED_BUDGET_RESOLUTION_FAILED',
      'Ordinary seed budget could not be resolved.', { cause: causeMessage(error) });
  }
  const fields = exactDataRecord(budget, [
    'policy_version', 'density_band', 'identity_budget', 'source'
  ]);
  if (!fields || typeof fields.policy_version !== 'string'
      || fields.policy_version !== request.policy_refs.density_policy_ref
      || fields.density_band !== plan.density_band_proposal
      || !['policy', 'authored_limit'].includes(fields.source)
      || !Number.isSafeInteger(fields.identity_budget)
      || fields.identity_budget < 0
      || fields.identity_budget > budgetRequest.hard_technical_max) {
    throw turnFailure('TURN_ORDINARY_SEED_BUDGET_INVALID',
      'Ordinary seed budget resolution must be an exact compatible bounded result.');
  }
  return deepFreeze({
    policy_version: fields.policy_version, density_band: fields.density_band,
    identity_budget: fields.identity_budget, source: fields.source
  });
}

function assertMatchingWorkingScope(request, workingProjection) {
  let normalized;
  try {
    normalized = assertAndNormalizeOrdinaryMaterializationWorkingProjection(
      workingProjection);
  } catch (error) {
    throw turnFailure('TURN_ORDINARY_SEED_WORKING_PROJECTION_INVALID',
      'Ordinary seed requires a valid working aggregate.', {
        cause: causeMessage(error)
      });
  }
  if (normalized.ordinary_aggregate.scope_ref.entity_kind !== request.scope_ref.entity_kind
      || normalized.ordinary_aggregate.scope_ref.entity_id !== request.scope_ref.entity_id) {
    throw turnFailure('TURN_ORDINARY_SEED_SCOPE_MISMATCH',
      'Ordinary seed request and working aggregate scopes must match exactly.');
  }
  return normalized;
}

function exactDataRecord(value, keys) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || Object.getOwnPropertySymbols(value).length !== 0) return null;
  const names = Object.getOwnPropertyNames(value);
  if (names.length !== keys.length || keys.some((key) => !names.includes(key))) {
    return null;
  }
  const fields = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor, 'value')) {
      return null;
    }
    fields[key] = descriptor.value;
  }
  return fields;
}

function reject(code, message) {
  throw turnFailure('TURN_ORDINARY_SEED_PLAN_REJECTED', message, { code });
}

function immutable(value) { return deepFreeze(structuredClone(value)); }
// Contract validation is descriptor-safe. Never inspect an invalid model value
// again for repair, since accessors/proxies are untrusted model output.
function safeModelOutput(_value) { return null; }
function causeMessage(error) { return error instanceof Error ? error.message : String(error); }
