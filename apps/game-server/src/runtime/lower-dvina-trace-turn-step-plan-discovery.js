import { isDeepStrictEqual } from 'node:util';
import { isOrdinaryDiscoveryInScope } from '@rus/turn';

export function canonicalizeDiscoveryShape(semantic, request) {
  const continuation = withoutPendingDiscovery(semantic?.continuation);
  const cleaned = continuation === semantic?.continuation ? semantic
    : { ...semantic, continuation };
  if (cleaned?.operation_choice != null || cleaned?.operations?.length !== 1
      || cleaned.operations[0]?.op !== 'request_discovery') return cleaned;
  let after = continuation;
  let operation = cleaned.operations[0];
  const locationRef = request.player_safe_state?.position?.location_ref;
  const currentScope = { ...operation, target_refs: [locationRef] };
  if (cleaned.check == null && operation.target_refs?.length === 0
      && !request.available_domain_operations?.some((available) =>
        isDeepStrictEqual(available, operation))
      && isOrdinaryDiscoveryInScope({ operation: currentScope,
        playerSafeState: request.player_safe_state })) {
    operation = currentScope;
    cleaned.operations = [operation];
  }
  if (after != null && Array.isArray(after.depends_on_refs)
      && after.depends_on_refs.length === 0
      && normalized(operation.query) === normalized(after.remaining_intent)
      && normalized(operation.query) === normalized(request.remaining_intent)) {
    after = null;
  }
  if (!Array.isArray(operation.target_refs) || operation.target_refs.length < 2) {
    return after === cleaned.continuation ? cleaned
      : { ...cleaned, continuation: after };
  }
  return { ...cleaned,
    operations: [{ ...operation, target_refs: [operation.target_refs[0]] }],
    continuation: { remaining_intent: operation.query, depends_on_refs: [],
      pending_discovery: { remaining_target_refs: operation.target_refs.slice(1),
        after } } };
}
function withoutPendingDiscovery(continuation) {
  if (continuation == null || typeof continuation !== 'object'
      || Array.isArray(continuation)
      || !Object.hasOwn(continuation, 'pending_discovery')) return continuation;
  const cleaned = { ...continuation };
  delete cleaned.pending_discovery;
  return cleaned;
}
export function canonicalOrdinaryDiscovery({ operations, semantic, request }) {
  if (semantic.operation_choice != null || semantic.check != null
      || operations?.length !== 1 || operations[0]?.op !== 'request_discovery'
      || operations[0]?.target_refs?.length !== 1) return null;
  if (semantic.interpretation?.adaptation === 'literal'
      && semantic.continuation?.remaining_intent === request.remaining_intent
      && semantic.continuation?.depends_on_refs?.length === 0
      && semantic.continuation.pending_discovery == null
      && semantic.continuation.prepared_followup_ref == null
      && normalized(operations[0].query) !== normalized(request.remaining_intent)
      && isOrdinaryDiscoveryInScope({ operation: {
        ...operations[0], discovery_kind: 'inspect' },
      playerSafeState: request.player_safe_state })) {
    return { operations: [{ ...operations[0], discovery_kind: 'inspect' }],
      continuation: semantic.continuation };
  }
  if (!isOrdinaryDiscoveryInScope({ operation: operations[0],
      playerSafeState: request.player_safe_state }) || semantic.continuation != null
      || normalized(operations[0].query) !== normalized(request.root_player_action)
      || !strictPriorIntent(request.root_player_action,
        request.remaining_intent)) return null;
  return { operations: [{ ...operations[0], query: request.remaining_intent }],
    continuation: null };
}
function strictPriorIntent(root, remaining) {
  const whole = normalized(root), tail = normalized(remaining);
  if (whole == null || tail == null || whole === tail || !whole.endsWith(tail)) {
    return false;
  }
  return !/[\p{L}\p{N}]/u.test(whole.slice(0, -tail.length).at(-1));
}
function normalized(value) {
  return typeof value === 'string' ? value.normalize('NFKC').trim()
    .replace(/\s+/gu, ' ').toLocaleLowerCase('ru-RU') : null;
}
export function bindActionProductionCarrierRefs(operations) {
  if (!Array.isArray(operations)) return operations;
  return operations.map((operation) => {
    const production = operation?.op === 'request_item_use'
      ? operation.action_production : null;
    if (!Array.isArray(production?.source_refs)
        || production.source_refs.length === 0
        || !Array.isArray(production.tool_refs)) return operation;
    return { ...operation, item_ref: production.source_refs[0],
      target_refs: [...production.source_refs.slice(1), ...production.tool_refs] };
  });
}
