import { runtimeItemIsAccessibleInPlace } from '@rus/items-property';
import { serverError } from '../errors.js';
import { isOrdinaryDiscoveryInScope, validateTurnStepPlan } from '@rus/turn';
import { isDeepStrictEqual } from 'node:util';
import { auditFocusedSpeech } from './lower-dvina-trace-turn-step-speech-audit.js';
const KINDS = new Set([
  'operation_semantic_grounding',
  'source_semantic_grounding',
  'material_transformation_grounding',
  'source_placement_grounding',
  'action_production_identity_grounding'
]);
const FOCUSED_DISCOVERY_MODES = new Set(['focused_discovery', 'material_prerequisite', 'different_action']);
const DISCOVERY_EFFECT_CONTRACT = { may_consume_discovery_intent: true,
  may_reveal_or_materialize: true, may_acquire_referent: false, may_relocate_referent: false,
  may_transform_referent: false, may_handle_referent: false, may_use_referent: false,
  unexecuted_physical_intent_must_remain_in_continuation: true };
import { TURN_STEP_GROUNDING_PROMPT as PROMPT, FOCUSED_DISCOVERY_PROMPT } from './lower-dvina-trace-turn-step-grounding-audit-prompt.js';
export function createLowerDvinaTraceTurnStepSemanticGroundingValidator({
  roleRunner
} = {}) {
  if (typeof roleRunner?.run !== 'function') {
    throw new TypeError('Turn-step grounding auditor requires a role runner.');
  }
  return async ({ plan, request, resolved_domain_operations: resolved = [], allow_speech_metadata_projection = false, allow_denial_metadata_projection = false, material_prerequisite_candidate = false }) => {
    const denialProjection = allow_denial_metadata_projection && ordinaryDenial(plan, request);
    if (denialProjection) {
      const operation = { op: 'request_discovery', actor_ref: request.actor?.actor_id ?? request.actor?.actor_ref,
        discovery_kind: 'inspect', target_refs: [request.player_safe_state?.position?.location_ref],
        query: request.remaining_intent };
      if (isOrdinaryDiscoveryInScope({ operation, playerSafeState: request.player_safe_state }))
        plan = { ...plan, operations: [operation] };
    }
    let audited = [...auditedOperations(plan)];
    for (const entry of audited.filter(({ operation }) => operation?.op === 'request_item_use'
        && typeof operation.description === 'string')) {
      const state = request.player_safe_state;
      const item = state?.items?.find(item => item.item_id === entry.operation.item_ref);
      if (!runtimeItemIsAccessibleInPlace(item, { actor_id: request.actor?.actor_id ?? request.actor?.actor_ref,
        position: state?.position, visible_objects: state?.current_visible_context?.visible_objects })) {
        throw serverError('TURN_STEP_PLAN_INVALID', 'Transient item use requires current accessible material.',
          { details: { errors: [concern('source_placement_grounding', [entry], resolved)] } });
      }
    }
    const use = plan.operations?.length === 1 ? plan.operations[0] : null;
    const descriptionProjection = use?.op === 'request_item_use' && use.use_kind === 'other'
      && use.action_production == null && typeof use.description === 'string'
      && use.description !== request.remaining_intent && plan.interpretation?.adaptation === 'literal'
      && plan.continuation === null && plan.check === null && plan.clarification === null
      && plan.direct_result_kind === null && validateTurnStepPlan(plan, { request }).ok;
    if (descriptionProjection) {
      plan = { ...plan, operations: [{ ...use, description: request.remaining_intent }] };
      audited = [...auditedOperations(plan)];
    }
    if (ordinaryDenial(plan, request)) throw serverError('TURN_STEP_PLAN_INVALID',
      'Literal physical denial must use the available grounded owner.', {
        details: { errors: [concern('operation_semantic_grounding',
          [{ path: '$.resolution' }], resolved)] }
      });
    if (audited.length === 0) return true;
    if (plan.direct_result_kind === 'player_utterance'
        && (plan.operations == null || plan.operations.length === 0)
        && plan.check == null) {
      const result = await auditFocusedSpeech({ roleRunner, plan, request, allow_speech_metadata_projection });
      if (result) return result;
      throw serverError('TURN_STEP_PLAN_INVALID',
        'Turn-step semantic grounding is invalid.', { details: { errors:
          [concern('operation_semantic_grounding', audited, resolved)] } });
    }
    const genericDiscovery = denialProjection && plan.operations.length === 1
      ? plan.operations[0] : genericOrdinaryDiscovery({ audited, plan, request, resolved });
    if (genericDiscovery != null
        && plan.continuation?.pending_discovery == null) {
      if (isSimpleLocationDiscovery(genericDiscovery, request)) {
        const prerequisiteProjection = plan.interpretation?.adaptation === 'literal'
          && plan.clarification == null && plan.direct_result_kind == null
          && preservesCompleteIntent(plan.continuation, request.remaining_intent)
          && normalized(genericDiscovery.query) !== normalized(request.remaining_intent)
          && validateTurnStepPlan(plan, { request }).ok;
        const focused = await roleRunner.run({
          scope: 'turn_runtime', role_id: 'turn_step_grounding_auditor',
          request_identity: request.request_id,
          messages: [{ role: 'system', content: FOCUSED_DISCOVERY_PROMPT }, {
            role: 'user', content: JSON.stringify({ remaining_intent:
              request.remaining_intent, operation: genericDiscovery,
              ...(material_prerequisite_candidate || prerequisiteProjection ? { correction_candidate:
                material_prerequisite_candidate ? 'missing_ordinary_referent' : 'proposed_material_prerequisite' } : {}),
              continuation: structuredClone(plan.continuation ?? null),
              player_safe_state: groundingState(request.player_safe_state),
              effect_contract: DISCOVERY_EFFECT_CONTRACT }) }]
        });
        if (!validFocusedDiscovery(focused?.output)) throw serverError(
          'TRACE_TURN_STEP_GROUNDING_AUDIT_INVALID',
          'Turn-step grounding auditor returned an invalid result.', { status: 503 }
        );
        const query = focused.output.prerequisite_query ?? (prerequisiteProjection
          && focused.output.mode === 'material_prerequisite' && focused.output.consumed_intent === null
          ? genericDiscovery.query : null);
        if (query != null && plan.interpretation?.adaptation === 'literal'
            && plan.clarification == null && plan.direct_result_kind == null
            && (plan.continuation == null || plan.continuation.depends_on_refs?.length === 0
              && plan.continuation.prepared_followup_ref == null)
            && normalized(query) !== normalized(request.remaining_intent)) {
          return { corrected_plan: { ...plan, resolution: 'domain_request', goal_result: 'pending',
            activity: { owner: 'domain', duration_class: null, effort: null },
            operations: [{ ...genericDiscovery, discovery_kind: 'inspect', query }],
            continuation: { remaining_intent: request.remaining_intent, depends_on_refs: [] } } };
        }
        if (!denialProjection && !material_prerequisite_candidate && !prerequisiteProjection && query == null && focusedDiscoveryGrounded({ classification: focused.output,
          operation: genericDiscovery, continuation: plan.continuation,
          remainingIntent: request.remaining_intent })) return true;
        assertDiscoveryIntent(genericDiscovery, plan, request, audited);
        throw serverError('TURN_STEP_PLAN_INVALID',
          'Turn-step semantic grounding is invalid.', { details: { errors:
            [concern('operation_semantic_grounding', audited, resolved)] } });
      }
      assertDiscoveryIntent(genericDiscovery, plan, request, audited);
    }
    const response = await roleRunner.run({
      scope: 'turn_runtime', role_id: 'turn_step_grounding_auditor',
      request_identity: request.request_id,
      messages: [{ role: 'system', content: PROMPT }, { role: 'user',
        content: JSON.stringify({ remaining_intent: request.remaining_intent,
          actor_ref: request.actor?.actor_id ?? request.actor?.actor_ref ?? null,
          actor_body: request.actor?.body ?? null,
          player_safe_state: groundingState(request.player_safe_state,
            audited),
          operations: audited, continuation: plan.continuation }) }]
    });
    if (!valid(response?.output)) throw serverError(
      'TRACE_TURN_STEP_GROUNDING_AUDIT_INVALID',
      'Turn-step grounding auditor returned an invalid result.', { status: 503 }
    );
    if (response.output.pass) return descriptionProjection
      ? { corrected_plan: plan } : true;
    throw serverError('TURN_STEP_PLAN_INVALID',
      'Turn-step semantic grounding is invalid.', { details: { errors:
        response.output.concerns.map(({ kind }) =>
          concern(kind, audited, resolved)) } });
  };
}
function assertDiscoveryIntent(genericDiscovery, plan, request, audited) {
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
function ordinaryDenial(plan, request) {
  return plan.interpretation?.adaptation === 'literal'
    && plan.resolution === 'direct' && plan.goal_result === 'not_achieved'
    && Array.isArray(plan.operations) && plan.operations.length === 0
    && plan.check == null && plan.clarification == null && plan.continuation == null
    && plan.direct_result_kind == null
    && request.player_safe_state?.ordinary_resolution?.discovery_available === true;
}
function genericOrdinaryDiscovery({ audited, plan, request, resolved }) {
  const owner = resolved.find(({ path }) => path === audited[0]?.path);
  if (audited.length !== 1 || plan.operations?.length !== 1
      || plan.check != null
      || owner?.owner_kind !== 'ordinary_discovery') return null;
  const operation = audited[0].operation;
  return isOrdinaryDiscoveryInScope({ operation,
    playerSafeState: request.player_safe_state }) ? operation : null;
}
function isSimpleLocationDiscovery(operation, request) {
  const locationRef = request.player_safe_state?.position?.location_ref;
  return locationRef != null && operation.target_refs?.length === 1 && operation.target_refs[0] === locationRef;
}
function preservesIntent(query, continuation, remainingIntent) {
  const remaining = normalized(remainingIntent);
  const current = normalized(query);
  if (continuation == null) return current === remaining;
  if (preservesCompleteIntent(continuation, remainingIntent)) return true;
  const next = normalized(continuation.remaining_intent);
  if (current == null || next == null || remaining == null
      || current.length + next.length > remaining.length
      || !remaining.startsWith(current) || !remaining.endsWith(next)) {
    return false;
  }
  return !/[\p{L}\p{N}]/u.test(remaining.slice(current.length,
    remaining.length - next.length));
}
function preservesCompleteIntent(continuation, remainingIntent) {
  return continuation?.remaining_intent === remainingIntent &&
    Array.isArray(continuation.depends_on_refs) && continuation.depends_on_refs.length === 0 &&
    continuation.prepared_followup_ref == null;
}
function focusedDiscoveryGrounded({ classification, operation, continuation,
  remainingIntent }) {
  if (classification.mode === 'material_prerequisite') return preservesCompleteIntent(continuation, remainingIntent);
  if (classification.mode !== 'focused_discovery'
      || typeof classification.consumed_intent !== 'string'
      || !remainingIntent.startsWith(classification.consumed_intent)
      || normalized(operation.query) !== normalized(classification.consumed_intent)
      || preservesCompleteIntent(continuation, remainingIntent)) return false;
  return preservesIntent(classification.consumed_intent, continuation, remainingIntent);
}
function normalized(value) {
  return typeof value === 'string' ? value.normalize('NFKC').trim()
    .replace(/\s+/gu, ' ').toLocaleLowerCase('ru-RU') : null;
}
function* auditedOperations(plan) {
  if (plan?.direct_result_kind === 'player_utterance') {
    yield { path: '$.utterance', utterance: plan.utterance };
  }
  for (const [index, operation] of (plan?.operations ?? []).entries()) {
    if (auditable(operation) || operation.op === 'move_entity'
        && plan.operations.some(op => op.op === 'request_item_use' && typeof op.description === 'string'))
      yield { path: `$.operations.${index}`, operation };
  }
  for (const [band, outcome] of Object.entries(plan?.check?.outcomes ?? {})) {
    for (const [index, operation] of (outcome.operations ?? []).entries()) {
      if (auditable(operation)) yield {
        path: `$.check.outcomes.${band}.operations.${index}`, operation
      };
    }
  }
}
function auditable(operation) {
  return operation?.op === 'request_discovery'
    || operation?.op === 'request_item_use'
      && (operation.action_production != null || typeof operation.description === 'string');
}
function groundingState(state = {}, audited = []) {
  return {
    actor_id: state.actor_id, position: state.position,
    items: state.items ?? [], inventory: state.inventory ?? {},
    current_visible_context: state.current_visible_context ?? null,
    visible_context: state.visible_context ?? null,
    ordinary_resolution: state.ordinary_resolution ?? null,
    observed_evidence_inspection:
      state.observed_evidence_inspection ?? null,
    available_domain_operation_grounding:
      (state.available_domain_operation_grounding ?? []).filter(({ operation }) =>
        audited.some((entry) => isDeepStrictEqual(entry.operation, operation)))
  };
}

function concern(kind, audited, resolved) {
  const operationPath = audited.length === 1 ? audited[0].path
    : audited.every(({ path }) => path.startsWith('$.check.outcomes.'))
      ? '$.check.outcomes' : '$.operations';
  const transientUse = audited.find(entry => typeof entry.operation?.description === 'string'
    && entry.operation?.op === 'request_item_use');
  const path = transientUse && kind !== 'operation_semantic_grounding' ? `${transientUse.path}.item_ref`
    : kind === 'operation_semantic_grounding' ? operationPath
    : kind === 'source_semantic_grounding'
      ? `${operationPath}.action_production.source_refs`
      : kind === 'source_placement_grounding'
        ? `${operationPath}.action_production.result_descriptor`
        : kind === 'material_transformation_grounding'
          ? `${operationPath}.action_production`
          : `${operationPath}.action_production.identity_mode`;
  const rejected = kind === 'operation_semantic_grounding'
    && audited.length === 1
    ? resolved.find(({ path: candidate }) => candidate === audited[0].path)
      ?.bound_operation : null;
  return { path, rule: kind, code: kind,
    message: 'must remain grounded by the current intent and player-safe evidence',
    ...(rejected == null ? {} : {
      rejected_operation: structuredClone(rejected)
    }) };
}

function valid(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 2 && typeof value.pass === 'boolean'
    && Array.isArray(value.concerns)
    && (value.pass ? value.concerns.length === 0 : value.concerns.length > 0)
    && value.concerns.every((entry) => entry != null
      && typeof entry === 'object' && !Array.isArray(entry)
      && Object.keys(entry).length === 1 && KINDS.has(entry.kind));
}
function validFocusedDiscovery(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && (Object.keys(value).length === 2 && !Object.hasOwn(value, 'prerequisite_query')
      || Object.keys(value).length === 3 && value.mode === 'material_prerequisite'
        && value.consumed_intent === null && typeof value.prerequisite_query === 'string'
        && value.prerequisite_query.trim().length > 0)
    && FOCUSED_DISCOVERY_MODES.has(value.mode)
    && (value.consumed_intent === null || typeof value.consumed_intent === 'string'
      && value.consumed_intent.trim().length > 0);
}
