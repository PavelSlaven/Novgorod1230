import { deepFreeze } from '@rus/kernel';
import { resolveTurnStepDomainOwner } from './turn-step-domain-owner-resolution.js';

export function createTurnStepDomainOwnerPreflight({ externalRegistry,
  semanticBindings, availableOptions, actor, committedState, services,
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
      playerSafeState: request.player_safe_state, committedState,
      externalRegistry, semanticBindings, availableOptions, preparedChainContext,
      services, isOrdinaryDiscoveryInScope, isSpatialSemanticRemainderInScope,
      isBackgroundNpcSemanticRemainderInScope,
      isActionProductionOwnerInScope });
    cachedOwners.set(key, owner);
    return owner;
  };
  const validate = ({ plan, request,
    prepared_chain_context: preparedChainContext }) => {
    const errors = [];
    const marker = plan.continuation?.prepared_followup_ref;
    if (marker != null && semanticBindings.filter(({ command, binding }) =>
      availableOptions.has(command.option_id)
        && command.prepared_followup_ref === marker
        && plan.operations?.some((operation) => binding.matches(deepFreeze({
          operation: structuredClone(operation), plan: structuredClone(plan),
          actor: structuredClone(actor),
          player_safe_state: structuredClone(request.player_safe_state),
          committed_state: structuredClone(committedState)
        })) === true)).length !== 1) {
      errors.push({ path: '$.continuation.prepared_followup_ref',
        rule: 'prepared_followup_binding', code: 'prepared_followup_binding',
        message: 'must bind the current available prepared command' });
    }
    const validateOwners = () => {
      for (const { operation, path } of plannedDomainOperations(plan,
        isDomainStepOperation)) {
        const owner = resolve({ operation, plan, request,
          preparedChainContext });
        if (owner.kind === 'ambiguous') throw domainOwnerResolutionError(owner,
          turnCommandError);
        if (owner.kind === 'missing' && !deferredPreparedDomainPlan({
          plan, path, preparedChainContext
        })) errors.push({ path,
          rule: 'domain_owner_unavailable', code: 'domain_owner_unavailable',
          message: 'must resolve to one available domain owner' });
      }
      if (errors.length !== 0) throw turnCommandError('TURN_STEP_PLAN_INVALID',
        'Semantic plan references an unavailable domain owner.', { errors });
    };
    return validateOwners();
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
