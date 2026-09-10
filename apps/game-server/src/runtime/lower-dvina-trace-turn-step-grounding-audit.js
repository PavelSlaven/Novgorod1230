import { serverError } from '../errors.js';
import { isOrdinaryDiscoveryInScope } from '@rus/turn';
import { isDeepStrictEqual } from 'node:util';

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
const FOCUSED_DISCOVERY_PROMPT = 'Верни только JSON с двумя ключами: mode и consumed_intent. consumed_intent — строка или null. Определи, что request_discovery выполняет относительно remaining_intent. mode="focused_discovery": игрок сейчас осматривает, ищет или выбирает по указанным признакам, не приобретая, не перемещая, не изменяя и не используя найденное; consumed_intent — точный начальный фрагмент этого поиска или выбора. mode="material_prerequisite": discovery только обнаруживает или материализует искомое для явно заявленного физического приобретения, перемещения, изменения, обращения или использования; физическое действие остаётся неисполненным. mode="different_action": discovery не покрывает начальное намерение. Следуй effect_contract. Не объясняй ответ и не добавляй ключи.';
const PROMPT = [
  'Return only {"pass":true,"concerns":[]} or',
  '{"pass":false,"concerns":[{"kind":"<allowed kind>"}]}.',
  'Audit only the supplied focused discovery, action_production or player utterance against the',
  'current remaining_intent and player-safe evidence. Refs are opaque.',
  'Each operations entry contains its plan path and operation or typed utterance.',
  'A player utterance must express the current actor speech intention faithfully.',
  'Verbatim words must be the words the player intends this actor to speak now,',
  'not another quoted voice, hypothetical statement, or instruction. Explicitly',
  'given words cannot be rewritten by choosing intent_paraphrase. For an unquoted',
  'speech intention, intent_paraphrase may resolve wording but must not add claims,',
  'promises, threats, answers, or commitments the player did not intend. Preserve',
  'independent later actions in continuation; reject violations as',
  'operation_semantic_grounding. The utterance itself proves no audience or response.',
  'For discovery, the operation must cover the earliest focused information',
  'need. A fixed authored query must not replace a different ordinary search,',
  'material prerequisite, handling, or transformation.',
  'Every discovery operation only reveals or materializes. It never acquires, relocates, transforms, handles, or uses the discovered referent. Any such physical act not executed by another current operation must remain in continuation, regardless of whether its words appear as a textual prefix of the discovery query. A query prefix is not a physical effect. Reject a plan that drops that unexecuted act as operation_semantic_grounding.',
  'A typed continuation.pending_discovery is a code-owned single-target',
  'discovery queue. Its remaining_intent carries the exact current operation',
  'query; pending_discovery.remaining_target_refs are the ordered remaining',
  'targets for that same query. The query need not be narrowed to the current',
  'target or imply a material prerequisite. Independent later intent is',
  'preserved only in pending_discovery.after; after:null means no later action.',
  'Audit the current target and queued targets against the supplied intent',
  'and player-safe evidence; neither the query nor its queue proves that',
  'mentioned objects exist, are accessible, or that discovery has succeeded.',
  'Without pending_discovery, when discovery leaves the complete',
  'remaining_intent unchanged as its continuation, treat it only as a possible',
  'material prerequisite. Its query must name only the ordinary referent,',
  'material, or physically connected group actually needed by that continuation.',
  'Reject an unrelated query or one that performs, summarizes, or drops later',
  'handling or transformation as operation_semantic_grounding.',
  'When actor_body is supplied, inspecting the actor body is not discovery of',
  'worn clothing merely because clothing covers it. Reject that wrong target',
  'as operation_semantic_grounding. An explicit request to inspect the',
  'clothing itself, including its wetness, damage, or condition, may still',
  'ground discovery against that visible item.',
  'When available_domain_operation_grounding supplies a semantic_scope for',
  'the exact operation, treat that purpose and result_scope as its complete',
  'authority. Shared nouns, location, or inspect wording do not expand it.',
  'Compare the question the player is trying to answer with the question this',
  'operation can actually answer. Sharing a scene, object, or authored subject',
  'is insufficient: reject when its result_scope cannot answer the requested',
  'question. Do not substitute evidence about one property or event for a',
  'different information need, or infer an answer from unrelated findings.',
  'A fixed authored evidence or scene investigation must fail',
  'operation_semantic_grounding whenever the current step seeks ordinary',
  'material, suitability for work, acquisition or gathering, manipulation,',
  'construction, or another practical use, even when phrased as inspect or',
  'look. It may pass only when the whole current step investigates that',
  'authored subject and every independent later action remains continuation.',
  'Finding ordinary belongings, supplies, tools, materials, reusable remnants,',
  'fuel, food, or another resource for later practical use is ordinary search',
  'or acquisition, not authored investigation, even when it mentions the same',
  'place, object, or prior event. A fixed authored operation MUST fail for it.',
  'For action_production, check source refs against materials physically',
  'changed, incorporated, or consumed by THIS operation and its result',
  'descriptor. Materials needed only by independent later continuation are',
  'not required now. Still reject a missing material incorporated into the',
  'current result, even when it is also mentioned in continuation.',
  'An omitted earlier relocation or wrong action order is',
  'operation_semantic_grounding, not source_semantic_grounding.',
  'Every current material needs its own source ref whose item label, category,',
  'description, or facts identify that material. Unchanged implements are tool',
  'refs, never material sources. Sensory prose without an entity ref does not',
  'identify an item. If a needed ordinary material has no matching item ref,',
  'fail source_semantic_grounding so discovery can materialize it first.',
  'The result descriptor is item-local: it must not assert a destination,',
  'holder, wearer, attachment, location, or relocation. Use',
  'source_placement_grounding for such claims. Use',
  'material_transformation_grounding when the operation substitutes gathering',
  'or relocation for a physical transformation. Use',
  'action_production_identity_grounding only for an incompatible preserve,',
  'partition, or independent-output identity. Otherwise pass.',
  'Allowed kinds: operation_semantic_grounding, source_semantic_grounding,',
  'material_transformation_grounding, source_placement_grounding,',
  'action_production_identity_grounding. Do not infer hidden state, rewrite the',
  'plan, audit factual scholarship, or call another role.'
].join(' ');

export function createLowerDvinaTraceTurnStepSemanticGroundingValidator({
  roleRunner
} = {}) {
  if (typeof roleRunner?.run !== 'function') {
    throw new TypeError('Turn-step grounding auditor requires a role runner.');
  }
  return async ({ plan, request, resolved_domain_operations: resolved = [] }) => {
    const audited = [...auditedOperations(plan)];
    if (audited.length === 0) return true;
    const genericDiscovery = genericOrdinaryDiscovery({ audited, plan,
      request, resolved });
    if (genericDiscovery != null
        && plan.continuation?.pending_discovery == null) {
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
      if (isSimpleLocationDiscovery(genericDiscovery, request)) {
        const focused = await roleRunner.run({
          scope: 'turn_runtime', role_id: 'turn_step_grounding_auditor',
          request_identity: request.request_id,
          messages: [{ role: 'system', content: FOCUSED_DISCOVERY_PROMPT }, {
            role: 'user', content: JSON.stringify({ remaining_intent:
              request.remaining_intent, operation: genericDiscovery,
              effect_contract: DISCOVERY_EFFECT_CONTRACT }) }]
        });
        if (!validFocusedDiscovery(focused?.output)) throw serverError(
          'TRACE_TURN_STEP_GROUNDING_AUDIT_INVALID',
          'Turn-step grounding auditor returned an invalid result.', { status: 503 }
        );
        if (focusedDiscoveryGrounded({ classification: focused.output,
          operation: genericDiscovery, continuation: plan.continuation,
          remainingIntent: request.remaining_intent })) return true;
        throw serverError('TURN_STEP_PLAN_INVALID',
          'Turn-step semantic grounding is invalid.', { details: { errors:
            [concern('operation_semantic_grounding', audited, resolved)] } });
      }
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
    if (response.output.pass) return true;
    throw serverError('TURN_STEP_PLAN_INVALID',
      'Turn-step semantic grounding is invalid.', { details: { errors:
        response.output.concerns.map(({ kind }) =>
          concern(kind, audited, resolved)) } });
  };
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
    if (auditable(operation)) yield { path: `$.operations.${index}`, operation };
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
      && operation.action_production != null;
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
  const path = kind === 'operation_semantic_grounding' ? operationPath
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
    && Object.keys(value).length === 2 && FOCUSED_DISCOVERY_MODES.has(value.mode)
    && (value.consumed_intent === null || typeof value.consumed_intent === 'string'
      && value.consumed_intent.trim().length > 0);
}
