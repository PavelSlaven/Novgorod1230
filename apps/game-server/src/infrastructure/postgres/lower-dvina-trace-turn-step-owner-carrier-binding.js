import { domainOwner } from '@rus/turn/temporal-advance';
import { canonicalDigest } from '@rus/materialization';

export function requireTurnStepOwnerCarrierBinding({ semanticPlan = null,
  semanticOperation, semanticRequest = null, registeredOwner = null, carrier,
  carrierOperation = semanticOperation, actionRef = null }) {
  const operation = semanticPlan?.operations?.[0] ?? semanticOperation;
  if (operation == null || semanticPlan != null && (semanticPlan.operations?.length !== 1
        || !same(operation, semanticOperation))
      || typeof operation.op !== 'string'
      || typeof operation.actor_ref !== 'string'
      || semanticRequest != null && (operation.actor_ref !== semanticRequest.npc_ref
        || registeredOwner !== domainOwner(operation.op))) {
    throw new Error('TRACE_TURN_STEP_OWNER_OUTPUT_BINDING_INVALID');
  }
  const value = carrier?.payload == null ? carrier : { ...carrier, ...carrier.payload };
  if (value == null || typeof value !== 'object'
      || value.operation_kind != null && value.operation_kind !== operation.op
      || value.actor_ref != null && value.actor_ref !== operation.actor_ref
      || semanticRequest != null && (value.root_turn_id != null
        && value.root_turn_id !== semanticRequest.root_turn_id
        || value.step_index != null
          && value.step_index !== semanticRequest.decision_index)
      || !matchesExposedOperationRefs(value, carrierOperation)
      || !matchesCarrierCause(value.cause, semanticRequest)
      || !matchesCarrierIdentity(value.causal_identity, semanticRequest,
        operation.actor_ref, actionRef)) {
    throw new Error('TRACE_TURN_STEP_OWNER_OUTPUT_BINDING_INVALID');
  }
}

function matchesExposedOperationRefs(carrier, operation) {
  for (const key of ['container_ref', 'access_kind', 'item_ref', 'process_ref', 'process_kind', 'process_action']) {
    if (carrier[key] != null && carrier[key] !== operation[key]) return false;
  }
  for (const key of ['source_refs', 'tool_refs', 'target_refs']) {
    if (carrier[key] != null && !same(carrier[key], operation[key])) return false;
  }
  return true;
}

function matchesCarrierCause(cause, request) {
  return cause == null || request == null || cause.kind === 'actor_step' && cause.request_id === request.request_id
    && cause.root_turn_id === request.root_turn_id && cause.step_index === request.decision_index;
}

function matchesCarrierIdentity(identity, request, actorRef, actionRef) {
  return identity == null || request == null || (identity.request_id === request.request_id
      && identity.root_turn_id === request.root_turn_id && identity.step_index === request.decision_index
      && (identity.actor_ref == null || identity.actor_ref === actorRef)
      && (actionRef == null || identity.action_ref === actionRef));
}

function same(left, right) {
  return canonicalDigest(left) === canonicalDigest(right);
}
