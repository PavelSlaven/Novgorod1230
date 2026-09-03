import { deepFreeze } from '@rus/kernel';
import {
  assertOrdinaryMaterializationRequestV1,
  validateOrdinaryMaterializationPlanV1
} from '@rus/contracts/ordinary-materialization-v1';
import {
  applyOrdinaryAggregateTransition,
  validateOrdinaryBackgroundGroup
} from '@rus/materialization';
import { turnFailure } from './errors.js';
import {
  applyOrdinaryAggregateToTurnWorkingProjection,
  assertAndNormalizeTurnOrdinaryWorkingProjection
} from './turn-step-ordinary-working-projection.js';

/**
 * Runs the independent, candidate-free Stage A seed. It intentionally returns
 * only server-side data and performs neither item admission nor persistence.
 */
export async function resolveOrdinaryMaterializationSeedScope({
  request, ordinaryMaterializationModel, workingProjection, basisCatalog,
  allowedDisclosurePolicyRefs, resolveIdentityBudget,
  semanticContext = null,
  repairAvailable = () => true
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
    modelContext(null, semanticContext), false);
  let errors = validateOrdinaryMaterializationPlanV1(rawPlan, safeRequest);
  let repaired = false;
  if (errors.length !== 0) {
    if (typeof repairAvailable !== 'function' || !repairAvailable()) {
      throw turnFailure('TURN_ORDINARY_SEED_PLAN_INVALID',
        'Ordinary seed response is invalid and no structural repair budget remains.',
        { request_id: safeRequest.request_id, repair_attempted: false,
          validation_errors: errors });
    }
    rawPlan = await invokeModel(ordinaryMaterializationModel, safeRequest,
      modelContext({ schema: 'ordinary_materialization_repair_context_v1',
        original_output: safeModelOutput(rawPlan), validation_errors: errors },
      semanticContext), true);
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
    basisCatalog, allowedDisclosurePolicyRefs: safeRequest.authority_envelope
      ?.disclosure_policy_refs ?? allowedDisclosurePolicyRefs });
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
      normalizedWorkingProjection.ordinary_materialization_aggregate.state_version,
    density_band: plan.density_band_proposal,
    identity_budget: identityBudgetResolution.identity_budget,
    background_groups: seedPlan.preparedGroups
  });
  let nextWorkingProjection;
  try {
    const nextAggregate = applyOrdinaryAggregateTransition({
      aggregate: normalizedWorkingProjection.ordinary_materialization_aggregate,
      transition
    });
    nextWorkingProjection = applyOrdinaryAggregateToTurnWorkingProjection({
      working_projection: withoutOrdinaryAggregate(normalizedWorkingProjection),
      ordinary_aggregate: nextAggregate
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

function modelContext(repair, semanticContext) {
  return semanticContext == null ? { repair } : {
    repair, semantic_context: immutable(semanticContext)
  };
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
      || plan.presence_resolutions.length !== 0 || plan.entities.length !== 0) {
    reject('ORDINARY_SEED_OUTCOME_INVALID',
      'Stage A requires density and may prepare groups, never concrete entities.');
  }
  const authority = request.authority_envelope;
  if (authority?.stage === 'seed_scope'
      && !authority.density_bands.includes(plan.density_band_proposal)) {
    reject('ORDINARY_SEED_DENSITY_NOT_ALLOWED',
      'Stage A density must be selected from the authority envelope.');
  }
  if (plan.background_groups.length > request.technical_limits.max_new_background_groups
      || plan.entities.length > request.technical_limits.max_new_entities) {
    reject('ORDINARY_SEED_LIMIT_EXCEEDED',
      'Stage A proposal exceeds its explicit minimal technical limit.');
  }
  const preparedGroups = plan.background_groups.map((group) => {
    try {
      if (authority?.stage === 'seed_scope' && !group.causal_basis.basis_refs
        .every((ref) => authority.group_bases.some((basis) =>
          basis.basis_ref === ref
          && basis.functional_buckets.includes(group.functional_bucket)
          && group.allowed_admission_classes.every((admission) =>
            basis.allowed_admission_classes.includes(admission))
          && sameRefs(basis.permission_refs, group.permission_refs)))) {
        reject('ORDINARY_SEED_GROUP_NOT_ALLOWED',
          'Stage A group must use only envelope-authorized basis classes.');
      }
      return validateOrdinaryBackgroundGroup({ request, group,
        basis_catalog: basisCatalog,
        allowed_disclosure_policy_refs: allowedDisclosurePolicyRefs });
    } catch (error) {
      reject('ORDINARY_SEED_GROUP_INVALID', causeMessage(error));
    }
  });
  return { kind: 'seeded', preparedGroups: immutable(preparedGroups),
    pendingItemsPropertyAdmission: immutable([]) };
}
function sameRefs(left, right) { return Array.isArray(left) && Array.isArray(right)
  && left.length === right.length && left.every((ref) => right.includes(ref)); }

function decisionMetadata(request, plan, repaired) {
  return deepFreeze({
    schema: 'ordinary_seed_scope_decision_v1', request_id: request.request_id,
    scope_ref: immutable(request.scope_ref), resolution: plan.resolution,
    density_band: plan.density_band_proposal, repaired
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
    normalized = assertAndNormalizeTurnOrdinaryWorkingProjection(
      workingProjection);
  } catch (error) {
    throw turnFailure('TURN_ORDINARY_SEED_WORKING_PROJECTION_INVALID',
      'Ordinary seed requires a valid working aggregate.', {
        cause: causeMessage(error)
      });
  }
  if (normalized.ordinary_materialization_aggregate.scope_ref.entity_kind !== request.scope_ref.entity_kind
      || normalized.ordinary_materialization_aggregate.scope_ref.entity_id !== request.scope_ref.entity_id) {
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
function withoutOrdinaryAggregate(value) {
  const { ordinary_materialization_aggregate: _aggregate, ...workingProjection } = value;
  return workingProjection;
}
// Contract validation is descriptor-safe. Never inspect an invalid model value
// again for repair, since accessors/proxies are untrusted model output.
function safeModelOutput(_value) { return null; }
function causeMessage(error) { return error instanceof Error ? error.message : String(error); }
