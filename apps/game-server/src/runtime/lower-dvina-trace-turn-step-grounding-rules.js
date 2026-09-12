import { isDeepStrictEqual } from 'node:util';
import { isOrdinaryDiscoveryInScope, validateTurnStepPlan } from '@rus/turn';
import { serverError } from '../errors.js';

const KINDS = new Set(['operation_semantic_grounding',
  'source_semantic_grounding', 'material_transformation_grounding',
  'source_placement_grounding', 'action_production_identity_grounding']);
const FOCUSED_DISCOVERY_MODES = new Set([
  'focused_discovery', 'material_prerequisite', 'different_action'
]);

export function directSemanticActivity(plan, request) {
  return plan?.resolution === 'direct'
    && plan.goal_result !== 'not_achieved'
    && plan.direct_result_kind == null
    && Array.isArray(plan.operations) && plan.operations.length === 0
    && plan.check == null && plan.clarification == null
    && plan.activity?.owner === 'semantic'
    && validateTurnStepPlan(plan, { request }).ok;
}
export function assertDiscoveryIntent(genericDiscovery, plan, request, audited) {
  if (!preservesIntent(genericDiscovery.query, plan.continuation,
    request.remaining_intent)) {
    throw serverError('TURN_STEP_PLAN_INVALID',
      'Ordinary discovery must preserve the current intent.', {
        details: { errors: [
          { path: `${audited[0].path}.query`,
            rule: 'ordinary_discovery_query_identity',
            code: 'ordinary_discovery_query_identity',
            message: 'must equal remaining_intent, form a non-overlapping lossless prefix, or name only a material prerequisite' },
          { path: '$.continuation.remaining_intent',
            rule: 'ordinary_discovery_query_identity',
            code: 'ordinary_discovery_query_identity',
            message: 'must preserve the exact uncovered suffix or the complete intent required after a material prerequisite' }
        ] }
      });
  }
}
export function ordinaryDenial(plan, request) {
  return plan.interpretation?.adaptation === 'literal'
    && plan.resolution === 'direct' && plan.goal_result === 'not_achieved'
    && Array.isArray(plan.operations) && plan.operations.length === 0
    && plan.check == null && plan.clarification == null && plan.continuation == null
    && plan.direct_result_kind == null
    && request.player_safe_state?.ordinary_resolution?.discovery_available === true;
}
export function genericOrdinaryDiscovery({ audited, plan, request, resolved }) {
  const owner = resolved.find(({ path }) => path === audited[0]?.path);
  if (audited.length !== 1 || plan.operations?.length !== 1
      || plan.check != null || owner?.owner_kind !== 'ordinary_discovery') return null;
  const operation = audited[0].operation;
  return isOrdinaryDiscoveryInScope({ operation,
    playerSafeState: request.player_safe_state }) ? operation : null;
}
export function isSimpleLocationDiscovery(operation, request) {
  const locationRef = request.player_safe_state?.position?.location_ref;
  return locationRef != null && operation.target_refs?.length === 1
    && operation.target_refs[0] === locationRef;
}
export function preservesIntent(query, continuation, remainingIntent) {
  const remaining = normalized(remainingIntent);
  const current = normalized(query);
  if (continuation == null) return current === remaining;
  if (preservesCompleteIntent(continuation, remainingIntent)) return true;
  const next = normalized(continuation.remaining_intent);
  if (current == null || next == null || remaining == null
      || current.length + next.length > remaining.length
      || !remaining.startsWith(current) || !remaining.endsWith(next)) return false;
  return !/[\p{L}\p{N}]/u.test(remaining.slice(current.length,
    remaining.length - next.length));
}
export function preservesCompleteIntent(continuation, remainingIntent) {
  return continuation?.remaining_intent === remainingIntent
    && Array.isArray(continuation.depends_on_refs)
    && continuation.depends_on_refs.length === 0
    && continuation.prepared_followup_ref == null;
}
export function focusedDiscoveryGrounded({ classification, operation,
  continuation, remainingIntent }) {
  if (classification.mode === 'material_prerequisite') {
    return preservesCompleteIntent(continuation, remainingIntent);
  }
  if (classification.mode !== 'focused_discovery'
      || typeof classification.consumed_intent !== 'string'
      || !remainingIntent.startsWith(classification.consumed_intent)
      || normalized(operation.query) !== normalized(classification.consumed_intent)
      || preservesCompleteIntent(continuation, remainingIntent)) return false;
  return preservesIntent(classification.consumed_intent, continuation, remainingIntent);
}
export function normalized(value) {
  return typeof value === 'string' ? value.normalize('NFKC').trim()
    .replace(/\s+/gu, ' ').toLocaleLowerCase('ru-RU') : null;
}
export function* auditedOperations(plan) {
  if (plan?.direct_result_kind === 'player_utterance') {
    yield { path: '$.utterance', utterance: plan.utterance };
  }
  for (const [index, operation] of (plan?.operations ?? []).entries()) {
    if (auditable(operation) || operation.op === 'move_entity'
        && plan.operations.some(op => op.op === 'request_item_use'
          && typeof op.description === 'string')) {
      yield { path: `$.operations.${index}`, operation };
    }
  }
  for (const [band, outcome] of Object.entries(plan?.check?.outcomes ?? {})) {
    for (const [index, operation] of (outcome.operations ?? []).entries()) {
      if (auditable(operation)) yield {
        path: `$.check.outcomes.${band}.operations.${index}`, operation
      };
    }
  }
}
export function* directCreateEntries(plan) {
  for (const [index, operation] of (plan?.operations ?? []).entries()) {
    if (operation?.op === 'create_entity') yield {
      path: `$.operations.${index}`, operation
    };
  }
  for (const [band, outcome] of Object.entries(plan?.check?.outcomes ?? {})) {
    for (const [index, operation] of (outcome.operations ?? []).entries()) {
      if (operation?.op === 'create_entity') yield {
        path: `$.check.outcomes.${band}.operations.${index}`, operation
      };
    }
  }
}
export function matchesAmbientCreateCapability(operation, request) {
  if (operation.origin?.kind !== 'ambient_ordinary'
      || operation.origin.source_refs?.length !== 1) return false;
  const sourceRef = operation.origin.source_refs[0];
  return request.player_safe_state?.visible_context?.visible_objects?.some(
    ({ entity_ref: ref }) => ref?.entity_kind === 'ambient_ordinary_capability'
      && ref.entity_id === sourceRef) === true;
}
function auditable(operation) {
  return operation?.op === 'request_discovery'
    || operation?.op === 'request_item_use'
      && (operation.action_production != null
        || typeof operation.description === 'string');
}
export function groundingState(state = {}, audited = []) {
  return {
    actor_id: state.actor_id, position: state.position,
    items: state.items ?? [], inventory: state.inventory ?? {},
    current_visible_context: state.current_visible_context ?? null,
    visible_context: state.visible_context ?? null,
    ordinary_resolution: state.ordinary_resolution ?? null,
    observed_evidence_inspection: state.observed_evidence_inspection ?? null,
    available_domain_operation_grounding:
      (state.available_domain_operation_grounding ?? []).filter(({ operation }) =>
        audited.some((entry) => isDeepStrictEqual(entry.operation, operation)))
  };
}
export function concern(kind, audited, resolved) {
  const operationPath = audited.length === 1 ? audited[0].path
    : audited.every(({ path }) => path.startsWith('$.check.outcomes.'))
      ? '$.check.outcomes' : '$.operations';
  const transientUse = audited.find(entry =>
    typeof entry.operation?.description === 'string'
      && entry.operation?.op === 'request_item_use');
  const path = transientUse && kind !== 'operation_semantic_grounding'
    ? `${transientUse.path}.item_ref`
    : kind === 'operation_semantic_grounding' ? operationPath
    : kind === 'source_semantic_grounding'
      ? `${operationPath}.action_production.source_refs`
      : kind === 'source_placement_grounding'
        ? `${operationPath}.action_production.result_descriptor`
        : kind === 'material_transformation_grounding'
          ? `${operationPath}.action_production`
          : `${operationPath}.action_production.identity_mode`;
  const rejected = kind === 'operation_semantic_grounding' && audited.length === 1
    ? resolved.find(({ path: candidate }) => candidate === audited[0].path)
      ?.bound_operation : null;
  return { path, rule: kind, code: kind,
    message: 'must remain grounded by the current intent and player-safe evidence',
    ...(rejected == null ? {} : { rejected_operation: structuredClone(rejected) }) };
}
export function valid(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 2 && typeof value.pass === 'boolean'
    && Array.isArray(value.concerns)
    && (value.pass ? value.concerns.length === 0 : value.concerns.length > 0)
    && value.concerns.every((entry) => entry != null
      && typeof entry === 'object' && !Array.isArray(entry)
      && Object.keys(entry).length === 1 && KINDS.has(entry.kind));
}
export function validFocusedDiscovery(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && (Object.keys(value).length === 2 && !Object.hasOwn(value, 'prerequisite_query')
      || Object.keys(value).length === 3 && value.mode === 'material_prerequisite'
        && value.consumed_intent === null
        && typeof value.prerequisite_query === 'string'
        && value.prerequisite_query.trim().length > 0)
    && FOCUSED_DISCOVERY_MODES.has(value.mode)
    && (value.consumed_intent === null
      || typeof value.consumed_intent === 'string'
        && value.consumed_intent.trim().length > 0);
}
