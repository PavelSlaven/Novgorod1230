import { deepFreeze } from '@rus/kernel';
import { resolveTurnStepDomainOwner } from './turn-step-domain-owner-resolution.js';

export function createTurnStepDomainOwnerPreflight({ externalRegistry,
  semanticBindings, availableOptions, actor, committedState, services,
  currentCommittedState = () => committedState,
  isDomainStepOperation, isOrdinaryDiscoveryInScope,
  isSpatialSemanticRemainderInScope, isBackgroundNpcSemanticRemainderInScope,
  isActionProductionOwnerInScope,
  turnCommandError }) {
  const cachedOwners = new Map();
  const resolve = ({ operation, plan, request, preparedChainContext }) => {
    const key = JSON.stringify([plan, request, preparedChainContext, operation]);
    const cached = cachedOwners.get(key);
    if (cached != null) return cached;
    const owner = resolveTurnStepDomainOwner({ operation, plan, request, actor,
      playerSafeState: request.player_safe_state, committedState: currentCommittedState(),
      externalRegistry, semanticBindings, availableOptions, preparedChainContext,
      services, isOrdinaryDiscoveryInScope, isSpatialSemanticRemainderInScope,
      isBackgroundNpcSemanticRemainderInScope,
      isActionProductionOwnerInScope });
    cachedOwners.set(key, owner);
    return owner;
  };
  const validate = ({ plan, request, allow_speech_metadata_projection = false,
    allow_denial_metadata_projection = false,
    material_prerequisite_candidate = false,
    prepared_chain_context: preparedChainContext }) => {
    const errors = [];
    let resolvedDomainOperations = [];
    const marker = plan.continuation?.prepared_followup_ref;
    if (marker != null && semanticBindings.filter(({ command, binding }) =>
      availableOptions.has(command.option_id)
        && command.prepared_followup_ref === marker
        && plan.operations?.some((operation) => binding.matches(deepFreeze({
          operation: structuredClone(operation), plan: structuredClone(plan),
          actor: structuredClone(actor),
          player_safe_state: structuredClone(request.player_safe_state),
          committed_state: structuredClone(currentCommittedState())
        })) === true)).length !== 1) {
      errors.push({ path: '$.continuation.prepared_followup_ref',
        rule: 'prepared_followup_binding', code: 'prepared_followup_binding',
        message: 'must bind the current available prepared command' });
    }
    const validateOwners = (candidate = plan) => {
      resolvedDomainOperations = [];
      for (const { operation, path } of plannedDomainOperations(candidate,
        isDomainStepOperation)) {
        const owner = resolve({ operation, plan: candidate, request,
          preparedChainContext });
        if (owner.kind === 'ambiguous') throw domainOwnerResolutionError(owner,
          turnCommandError);
        if (owner.kind !== 'missing') resolvedDomainOperations.push({ path,
          owner_kind: owner.kind,
          ...(owner.bound_operation == null ? {} : {
            bound_operation: structuredClone(owner.bound_operation)
          })
        });
        if (owner.kind === 'missing' && !(candidate === plan && deferredPreparedDomainPlan({
          plan: candidate, path, preparedChainContext
        }))) errors.push({ path,
          rule: 'domain_owner_unavailable', code: 'domain_owner_unavailable',
          message: 'must resolve to one available domain owner' });
      }
      if (errors.length !== 0) throw turnCommandError('TURN_STEP_PLAN_INVALID',
        'Semantic plan references an unavailable domain owner.', { errors });
      if (candidate.continuation?.remaining_intent === request.remaining_intent
          && candidate.operations?.some((operation, index) =>
            operation.op === 'request_discovery'
            && resolvedDomainOperations.some(({ path, owner_kind: kind }) =>
              path === `$.operations.${index}` && kind === 'binding'))) {
        throw turnCommandError('TURN_STEP_PLAN_INVALID',
          'Authored discovery must consume its investigation intent.', { errors: [{
            path: '$.continuation.remaining_intent',
            rule: 'continuation_progress', code: 'continuation_progress',
            message: 'an authored investigation cannot be a material prerequisite; preserve only independent uncovered intent'
          }] });
      }
    };
    validateOwners();
    const result = services.turnStepSemanticGroundingValidator?.(deepFreeze({
      plan: structuredClone(plan), request: structuredClone(request),
      resolved_domain_operations: resolvedDomainOperations,
      allow_speech_metadata_projection,
      ...(allow_denial_metadata_projection ? { allow_denial_metadata_projection: true } : {}),
      ...(material_prerequisite_candidate ? { material_prerequisite_candidate: true } : {})
    }));
    const revalidate = (audited) => {
      if (audited?.corrected_plan != null) validateOwners(audited.corrected_plan);
      return audited;
    };
    return result?.then ? result.then(revalidate) : revalidate(result);
  };
  validate.resolve = resolve;
  return validate;
}

function deferredPreparedDomainPlan({ plan, path, preparedChainContext }) {
  return (preparedChainContext?.prior_effect_count ?? 0) > 0
    && plan.resolution === 'domain_request'
    && plan.operations?.length === 1
    && path === '$.operations.0';
}

function* plannedDomainOperations(plan, isDomainStepOperation) {
  for (const [index, operation] of (plan.operations ?? []).entries()) {
    if (isDomainStepOperation(operation?.op)) yield { operation,
      path: `$.operations.${index}` };
  }
  for (const [band, outcome] of Object.entries(plan.check?.outcomes ?? {})) {
    for (const [index, operation] of (outcome.operations ?? []).entries()) {
      if (isDomainStepOperation(operation?.op)) yield { operation,
        path: `$.check.outcomes.${band}.operations.${index}` };
    }
  }
}

function domainOwnerResolutionError(owner, turnCommandError) {
  return turnCommandError(
    owner.kind === 'ambiguous'
      ? 'TURN_STEP_DOMAIN_BINDING_AMBIGUOUS'
      : 'TURN_STEP_DOMAIN_BINDING_MISSING',
    'Semantic domain request must resolve to exactly one available owner.');
}
