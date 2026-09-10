import { isDeepStrictEqual } from 'node:util';
import { isDomainStepOperation, isOrdinaryDiscoveryInScope } from '@rus/turn';
import { turnStepPlanMappings } from './lower-dvina-trace-turn-step-plan-mappings.js';
import { normalizeTurnStepOperationChoice, selectedTurnStepOperation,
  turnStepOperationChoices } from
  './lower-dvina-trace-turn-step-operation-choices.js';

export function assembleTurnStepPlan(choice, request,
  operationChoices = turnStepOperationChoices(request)) {
  const normalized = canonicalizePlannerEnvelope(
    normalizeTurnStepOperationChoice(structuredClone(unwrapMapping(choice, request))), request);
  const semantic = restoreExactOperationChoice(
    canonicalizeDiscoveryShape(normalized, request), operationChoices);
  const selected = selectedTurnStepOperation(semantic, operationChoices);
  const mismatchedSelectedOperations = selected != null
    && Array.isArray(semantic.operations)
    && semantic.operations.length > 0
    && (semantic.operations.length !== 1
      || !isDeepStrictEqual(semantic.operations[0], selected.operation));
  const selectedOperations = mismatchedSelectedOperations
    ? structuredClone(semantic.operations)
    : selected
    ? [structuredClone(selected.operation)]
    : semantic.operation_choice == null
      ? structuredClone(semantic.operations) : undefined;
  const ordinaryDiscovery = canonicalOrdinaryDiscovery({ operations:
    selectedOperations, semantic, request });
  const operations = bindActionProductionCarrierRefs(
    ordinaryDiscovery?.operations ?? selectedOperations);
  const resolution = operations?.some(({ op }) => isDomainStepOperation(op))
    ? 'domain_request' : semantic.resolution;
  const domainRequest = resolution === 'domain_request';
  const actionProduction = Array.isArray(operations) && operations.some((operation) =>
    operation?.op === 'request_item_use'
      && operation.action_production != null);
  const interpretation = semantic.interpretation;
  if (interpretation?.constructor === Object &&
      !interpretation.player_goal?.trim?.())
    interpretation.player_goal = request.root_player_action;
  const preserved = { ...semantic };
  delete preserved.operation_choice;
  delete preserved.operation_family;
  delete preserved.utterance;
  return {
    ...preserved,
    schema: 'turn_step_plan_v1',
    request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    step_index: request.step_index,
    interpretation,
    resolution,
    goal_result: domainRequest || resolution === 'generic_check'
      || resolution === 'clarification_required'
      || semantic.continuation != null
      ? 'pending'
      : semantic.goal_result,
    activity: domainRequest && !actionProduction
      ? { owner: 'domain', duration_class: null, effort: null }
      : semantic.activity,
    operations,
    check: semantic.check ?? null,
    continuation: ordinaryDiscovery == null
      ? semantic.continuation ?? null : ordinaryDiscovery.continuation,
    clarification: semantic.clarification ?? null,
    direct_result_kind: semantic.direct_result_kind ?? null,
    ...(semantic.utterance == null ? {} : {
      utterance: structuredClone(semantic.utterance)
    }),
    reason_code: semantic.reason_code,
    reason: semantic.reason,
    ...(mismatchedSelectedOperations ? {
      operation_choice: semantic.operation_choice
    } : {})
  };
}

function unwrapMapping(choice, request) {
  if (choice?.constructor !== Object) return choice;
  const keys = Object.keys(choice);
  return keys.length === 1 && choice[keys[0]]?.constructor === Object
    && Object.hasOwn(JSON.parse(turnStepPlanMappings(request)), keys[0])
    ? choice[keys[0]] : choice;
}

function canonicalizePlannerEnvelope(semantic, request) {
  if (semantic?.constructor !== Object) return semantic;
  const interpretation = semantic.interpretation;
  const nested = interpretation?.constructor === Object
    ? interpretation.continuation : undefined;
  let next = semantic;
  if (nested !== undefined) {
    const top = semantic.continuation;
    const duplicate = isDeepStrictEqual(nested, top)
      || (typeof nested === 'string'
        && top?.constructor === Object
        && nested === top.remaining_intent);
    const recoverable = top === undefined && typeof nested === 'string'
      && nested.trim().length > 0;
    if (duplicate || recoverable) {
      const cleanInterpretation = { ...interpretation };
      delete cleanInterpretation.continuation;
      next = { ...semantic, interpretation: cleanInterpretation,
        ...(recoverable ? { continuation: {
          remaining_intent: nested, depends_on_refs: []
        } } : {}) };
    }
  }
  return {
    ...next,
    interpretation: next.interpretation?.constructor === Object
      && next.interpretation.adaptation === 'literal'
      && !nonempty(next.interpretation.grounded_attempt)
      ? { ...next.interpretation,
        grounded_attempt: request.remaining_intent }
      : next.interpretation,
    reason_code: nonempty(next.reason_code)
      ? next.reason_code : 'semantic_plan',
    reason: nonempty(next.reason)
      ? next.reason : 'Semantic plan assembled at the validated boundary.'
  };
}

function restoreExactOperationChoice(semantic, operationChoices) {
  if (semantic?.operation_choice != null || semantic?.operations?.length !== 1) {
    return semantic;
  }
  const matches = operationChoices.filter(({ operation }) =>
    isDeepStrictEqual(operation, semantic.operations[0]));
  return matches.length !== 1 ? semantic : { ...semantic,
    operation_choice: matches[0].choice_id,
    operation_family: matches[0].operation.op };
}

function canonicalizeDiscoveryShape(semantic, request) {
  const continuation = withoutPendingDiscovery(semantic?.continuation);
  const cleaned = continuation === semantic?.continuation ? semantic
    : { ...semantic, continuation };
  if (cleaned?.operation_choice != null || cleaned?.operations?.length !== 1
      || cleaned.operations[0]?.op !== 'request_discovery') return cleaned;
  let after = continuation;
  const operation = cleaned.operations[0];
  if (after != null
      && Array.isArray(after.depends_on_refs)
      && after.depends_on_refs.length === 0
      && normalized(operation.query) === normalized(after.remaining_intent)
      && normalized(operation.query) === normalized(request.remaining_intent)) {
    after = null;
  }
  if (!Array.isArray(operation.target_refs)
      || operation.target_refs.length < 2) {
    return after === cleaned.continuation ? cleaned
      : { ...cleaned, continuation: after };
  }
  return { ...cleaned,
    operations: [{ ...operation, target_refs: [operation.target_refs[0]] }],
    continuation: { remaining_intent: operation.query, depends_on_refs: [],
      pending_discovery: {
        remaining_target_refs: operation.target_refs.slice(1),
        after
      } } };
}

function withoutPendingDiscovery(continuation) {
  if (continuation == null || typeof continuation !== 'object'
      || Array.isArray(continuation)
      || !Object.hasOwn(continuation, 'pending_discovery')) return continuation;
  const cleaned = { ...continuation };
  delete cleaned.pending_discovery;
  return cleaned;
}

function canonicalOrdinaryDiscovery({ operations, semantic, request }) {
  if (semantic.operation_choice != null
      || semantic.check != null || operations?.length !== 1
      || operations[0]?.target_refs?.length !== 1
      || !isOrdinaryDiscoveryInScope({ operation: operations[0],
        playerSafeState: request.player_safe_state })) return null;
  if (semantic.continuation != null
      || normalized(operations[0].query)
        !== normalized(request.root_player_action)
      || !strictPriorIntent(request.root_player_action,
        request.remaining_intent)) return null;
  return { operations: [{ ...operations[0], query: request.remaining_intent }],
    continuation: null };
}

function strictPriorIntent(root, remaining) {
  const whole = normalized(root);
  const tail = normalized(remaining);
  if (whole == null || tail == null || whole === tail || !whole.endsWith(tail)) {
    return false;
  }
  return !/[\p{L}\p{N}]/u.test(whole.slice(0, -tail.length).at(-1));
}

function normalized(value) {
  return typeof value === 'string' ? value.normalize('NFKC').trim()
    .replace(/\s+/gu, ' ').toLocaleLowerCase('ru-RU') : null;
}

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function bindActionProductionCarrierRefs(operations) {
  if (!Array.isArray(operations)) return operations;
  return operations.map((operation) => {
    const production = operation?.op === 'request_item_use'
      ? operation.action_production : null;
    if (!Array.isArray(production?.source_refs)
        || production.source_refs.length === 0
        || !Array.isArray(production.tool_refs)) return operation;
    return { ...operation, item_ref: production.source_refs[0],
      target_refs: [...production.source_refs.slice(1),
        ...production.tool_refs] };
  });
}
