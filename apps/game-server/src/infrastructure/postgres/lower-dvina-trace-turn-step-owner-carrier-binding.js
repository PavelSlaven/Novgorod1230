import { domainOwner } from '@rus/turn/temporal-advance';
import { canonicalDigest } from '@rus/materialization';

export function requireTurnStepOwnerCarrierBinding({ semanticPlan = null,
  semanticOperation = null, semanticOperations = null,
  semanticRequest = null, registeredOwner = null, carrier,
  carrierOperation = null, actionRef = null }) {
  const operations = semanticOperations ?? (semanticOperation == null
    ? [] : [semanticOperation]);
  const value = carrier?.payload == null ? carrier : { ...carrier, ...carrier.payload };
  const kind = carrierOperation?.op ?? carrier?.operation_kind
    ?? (operations.length === 1 ? operations[0].op : null);
  const matches = operations.filter(({ op }) => op === kind);
  const bound = carrierOperation == null
    ? matches.filter((candidate) => carrierMatchesOperation(value, candidate))
    : [carrierOperation];
  const operation = bound.length === 1 ? bound[0] : null;
  const primary = operations.filter(({ op }) => !DIRECT.has(op));
  if (operation == null || semanticPlan != null
      && !same(semanticPlan.operations ?? [], operations)
      || primary.length > 1 || typeof operation.op !== 'string'
      || operation.actor_ref != null && typeof operation.actor_ref !== 'string'
      || semanticRequest != null && (operation.actor_ref != null
        && operation.actor_ref !== semanticRequest.npc_ref
        || primary.length === 1 && registeredOwner !== domainOwner(primary[0].op))) {
    throw new Error('TRACE_TURN_STEP_OWNER_OUTPUT_BINDING_INVALID');
  }
  if (value == null || typeof value !== 'object'
      || value.operation_kind != null && value.operation_kind !== operation.op
      || value.actor_ref != null && value.actor_ref !== operation.actor_ref
      || semanticRequest != null && (value.root_turn_id != null
        && value.root_turn_id !== semanticRequest.root_turn_id
        || value.step_index != null
          && value.step_index !== semanticRequest.decision_index)
      || !matchesExposedOperationRefs(value, carrierOperation ?? operation)
      || !matchesCarrierCause(value.cause, semanticRequest)
      || !matchesCarrierIdentity(value.causal_identity, semanticRequest,
        operation.actor_ref, actionRef)) {
    throw new Error('TRACE_TURN_STEP_OWNER_OUTPUT_BINDING_INVALID');
  }
}

const DIRECT = new Set(['create_entity', 'move_entity', 'change_entity_facts',
  'set_entity_mechanics', 'retire_entity', 'apply_body_event']);

function matchesExposedOperationRefs(carrier, operation) {
  for (const key of ['container_ref', 'access_kind', 'item_ref', 'process_ref', 'process_kind', 'process_action']) {
    if (carrier[key] != null && carrier[key] !== operation[key]) return false;
  }
  for (const key of ['source_refs', 'tool_refs', 'target_refs']) {
    if (carrier[key] != null && !same(carrier[key], operation[key])) return false;
  }
  return true;
}

function carrierMatchesOperation(carrier, operation) {
  if (carrier == null || typeof carrier !== 'object') return false;
  if (carrier.temp_ref != null && carrier.temp_ref !== operation.temp_ref) {
    return false;
  }
  if (carrier.entity_ref != null && operation.entity_ref != null
      && carrier.entity_ref !== operation.entity_ref) return false;
  if (carrier.reason != null && carrier.reason !== operation.reason) return false;
  if (operation.op === 'change_entity_facts') {
    return same(carrier.remove_fact_refs, operation.remove_fact_refs)
      && same((carrier.add_facts ?? []).map(({ temp_ref, text }) => ({
        temp_ref, text })), operation.add_facts);
  }
  if (operation.op === 'move_entity') {
    return carrierPlacementTarget(carrier.placement)
      === operation.placement.target_ref;
  }
  if (operation.op === 'apply_body_event') {
    const context = carrier.payload?.selected_context
      ?? carrier.selected_context;
    return carrier.actor_ref === operation.actor_ref
      && context?.mechanism === operation.mechanism
      && context?.severity === operation.severity
      && (context?.body_part_ref ?? null) === operation.body_part_ref;
  }
  return true;
}

function carrierPlacementTarget(placement) {
  return placement?.target_ref ?? placement?.container_id
    ?? placement?.attached_item_id ?? placement?.location_ref
    ?? placement?.holder_character_id ?? placement?.holder_npc_id ?? null;
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
