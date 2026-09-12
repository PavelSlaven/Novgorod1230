import { runtimeItemIsAccessibleInPlace } from '@rus/items-property';
import { isOrdinaryDiscoveryInScope, validateTurnStepPlan } from '@rus/turn';
import { serverError } from '../errors.js';
import { auditFocusedSpeech } from './lower-dvina-trace-turn-step-speech-audit.js';
import { assertDiscoveryIntent, auditedOperations, concern,
  directCreateEntries, directSemanticActivity, focusedDiscoveryGrounded,
  genericOrdinaryDiscovery, groundingState, isSimpleLocationDiscovery,
  matchesAmbientCreateCapability, normalized, ordinaryDenial,
  preservesCompleteIntent, preservesIntent, valid, validFocusedDiscovery } from
  './lower-dvina-trace-turn-step-grounding-rules.js';
const DISCOVERY_EFFECT_CONTRACT = { may_consume_discovery_intent: true,
  may_reveal_or_materialize: true, may_acquire_referent: false, may_relocate_referent: false,
  may_transform_referent: false, may_handle_referent: false, may_use_referent: false,
  unexecuted_physical_intent_must_remain_in_continuation: true };
import { TURN_STEP_GROUNDING_PROMPT as PROMPT, DIRECT_SEMANTIC_ACTIVITY_PROMPT,
  TRANSIENT_ITEM_USE_PROMPT,
  FOCUSED_DISCOVERY_PROMPT, FOCUSED_DISCOVERY_PREREQUISITE_REPAIR_PROMPT,
  FOCUSED_DISCOVERY_DIRECT_FACTS_PROMPT } from
  './lower-dvina-trace-turn-step-grounding-audit-prompt.js';
export function createLowerDvinaTraceTurnStepSemanticGroundingValidator({
  roleRunner
} = {}) {
  if (typeof roleRunner?.run !== 'function') {
    throw new TypeError('Turn-step grounding auditor requires a role runner.');
  }
  return async ({ plan, request, resolved_domain_operations: resolved = [], allow_speech_metadata_projection = false, allow_denial_metadata_projection = false, material_prerequisite_candidate = false }) => {
    const invalidCreate = directCreateEntries(plan).find(({ operation }) =>
      !matchesAmbientCreateCapability(operation, request));
    if (invalidCreate) throw serverError('TURN_STEP_PLAN_INVALID',
      'Direct entity creation requires an exposed ambient capability.', {
        details: { errors: [{ path: invalidCreate.path,
          rule: 'operation_semantic_grounding',
          code: 'operation_semantic_grounding',
          message: 'must move an existing item or use an exposed ambient capability',
          rejected_operation: structuredClone(invalidCreate.operation) }] }
      });
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
    const transientUse = audited.length === 1 && plan.operations?.length === 1
      && audited[0].operation?.op === 'request_item_use'
      && audited[0].operation.use_kind === 'other'
      && audited[0].operation.action_production == null
      && typeof audited[0].operation.description === 'string'
      && plan.continuation == null;
    if (transientUse) {
      const response = await roleRunner.run({
        scope: 'turn_runtime', role_id: 'turn_step_grounding_auditor',
        request_identity: request.request_id,
        messages: [{ role: 'system', content: TRANSIENT_ITEM_USE_PROMPT }, {
          role: 'user', content: JSON.stringify({
            remaining_intent: request.remaining_intent,
            actor_ref: request.actor?.actor_id ?? request.actor?.actor_ref ?? null,
            player_safe_state: groundingState(request.player_safe_state, audited),
            operation: audited[0].operation
          }) }]
      });
      if (!valid(response?.output)) throw serverError(
        'TRACE_TURN_STEP_GROUNDING_AUDIT_INVALID',
        'Turn-step grounding auditor returned an invalid result.', { status: 503 }
      );
      if (response.output.pass) return descriptionProjection
        ? { corrected_plan: plan } : true;
      throw serverError('TURN_STEP_PLAN_INVALID',
        'Turn-step semantic grounding is invalid.', { details: { errors:
          response.output.concerns.map(({ kind }) => concern(kind, audited, resolved)) } });
    }
    if (audited.length === 0) {
      if (!directSemanticActivity(plan, request)) return true;
      const response = await roleRunner.run({
        scope: 'turn_runtime', role_id: 'turn_step_grounding_auditor',
        request_identity: request.request_id,
        messages: [{ role: 'system', content: DIRECT_SEMANTIC_ACTIVITY_PROMPT }, {
          role: 'user', content: JSON.stringify({
            remaining_intent: request.remaining_intent,
            grounded_attempt: plan.interpretation?.grounded_attempt,
            activity: plan.activity,
            continuation: plan.continuation
          }) }]
      });
      if (!valid(response?.output)) throw serverError(
        'TRACE_TURN_STEP_GROUNDING_AUDIT_INVALID',
        'Turn-step grounding auditor returned an invalid result.', { status: 503 }
      );
      if (response.output.pass) return true;
      throw serverError('TURN_STEP_PLAN_INVALID',
        'Direct semantic activity is not grounded by the current intent.', {
          details: { errors: [{ path: '$.activity',
            rule: 'operation_semantic_grounding',
            code: 'operation_semantic_grounding',
            message: 'must perform the earliest non-vocal activity and preserve every later action' }] }
        });
    }
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
          messages: [{ role: 'system', content: [
            FOCUSED_DISCOVERY_DIRECT_FACTS_PROMPT,
            FOCUSED_DISCOVERY_PROMPT,
            FOCUSED_DISCOVERY_PREREQUISITE_REPAIR_PROMPT
          ].join(' ') }, {
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
        if ((material_prerequisite_candidate || prerequisiteProjection)
            && focused.output.mode === 'focused_discovery') {
          throw serverError('TURN_STEP_PLAN_INVALID',
            'A material prerequisite candidate cannot consume player discovery intent.', {
              details: { errors: [concern('operation_semantic_grounding', audited, resolved)] }
            });
        }
        const query = focused.output.prerequisite_query ?? (prerequisiteProjection
          && focused.output.mode === 'material_prerequisite' && focused.output.consumed_intent === null
          ? genericDiscovery.query : null);
        const consumed = normalized(focused.output.consumed_intent);
        const requested = normalized(genericDiscovery.query);
        const groundedWhole = normalized(plan.interpretation?.grounded_attempt)
          === normalized(request.remaining_intent);
        const groundedPrefix = typeof plan.interpretation?.grounded_attempt === 'string'
          && preservesIntent(plan.interpretation.grounded_attempt,
            plan.continuation, request.remaining_intent)
          ? plan.interpretation.grounded_attempt : null;
        if (focused.output.mode === 'material_prerequisite'
            && !material_prerequisite_candidate && !prerequisiteProjection
            && plan.interpretation?.adaptation === 'literal'
            && normalized(groundedPrefix) === normalized(genericDiscovery.query)
            && plan.continuation?.depends_on_refs?.length === 0
            && plan.continuation.prepared_followup_ref == null) return true;
        if (focused.output.mode === 'focused_discovery'
            && (groundedWhole || consumed === normalized(request.remaining_intent)
              && plan.interpretation?.grounded_attempt == null)
            && plan.continuation != null
            && plan.continuation.depends_on_refs?.length === 0
            && plan.continuation.prepared_followup_ref == null) {
          return { corrected_plan: { ...plan, operations: [{
            ...genericDiscovery, query: request.remaining_intent
          }], continuation: null } };
        }
        if (focused.output.mode === 'focused_discovery'
            && consumed === requested && plan.continuation != null
            && groundedPrefix != null) {
          return { corrected_plan: { ...plan, operations: [{
            ...genericDiscovery, query: groundedPrefix
          }] } };
        }
        if (focused.output.mode === 'focused_discovery'
            && consumed != null && requested != null
            && consumed !== requested
            && preservesIntent(focused.output.consumed_intent,
              plan.continuation, request.remaining_intent)) {
          return { corrected_plan: { ...plan, operations: [{
            ...genericDiscovery, query: focused.output.consumed_intent
          }] } };
        }
        if (query != null && plan.interpretation?.adaptation === 'literal'
            && plan.clarification == null && plan.direct_result_kind == null
            && (plan.continuation == null || plan.continuation.depends_on_refs?.length === 0
              && plan.continuation.prepared_followup_ref == null)
            && normalized(query) !== normalized(request.remaining_intent)) {
          return { corrected_plan: { ...plan, resolution: 'domain_request', goal_result: 'pending',
            activity: { owner: 'domain', duration_class: null, effort: null },
            operations: [{ ...genericDiscovery, discovery_kind: 'inspect', query,
              ...(Number.isSafeInteger(focused.output.prerequisite_quantity)
                ? { quantity: { value: focused.output.prerequisite_quantity,
                    unit: 'item' } } : {}) }],
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
    const moveOnly = audited.length === 1
      && audited[0].operation?.op === 'move_entity'
      && plan.operations?.length === 1 && plan.check == null;
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
    if (!valid(response?.output, { allowMovePrerequisite: moveOnly })) throw serverError(
      'TRACE_TURN_STEP_GROUNDING_AUDIT_INVALID',
      'Turn-step grounding auditor returned an invalid result.', { status: 503 }
    );
    if (response.output.pass) return descriptionProjection
      ? { corrected_plan: plan } : true;
    const locationRef = request.player_safe_state?.position?.location_ref;
    const actorRef = request.actor?.actor_id ?? request.actor?.actor_ref
      ?? request.player_safe_state?.actor_id;
    if (moveOnly && typeof response.output.prerequisite_query === 'string'
        && Number.isSafeInteger(response.output.prerequisite_quantity)
        && request.player_safe_state?.ordinary_resolution
          ?.discovery_available === true
        && typeof locationRef === 'string' && typeof actorRef === 'string') {
      return { corrected_plan: { ...plan,
        resolution: 'domain_request', goal_result: 'pending',
        activity: { owner: 'domain', duration_class: null, effort: null },
        operations: [{ op: 'request_discovery', actor_ref: actorRef,
          discovery_kind: 'inspect', target_refs: [locationRef],
          query: response.output.prerequisite_query.trim(), quantity: {
            value: response.output.prerequisite_quantity, unit: 'item'
          } }],
        continuation: { remaining_intent: request.remaining_intent,
          depends_on_refs: [] },
        reason_code: 'ordinary_quantity_prerequisite',
        reason: 'Resolve the requested ordinary quantity before relocation.' } };
    }
    throw serverError('TURN_STEP_PLAN_INVALID',
      'Turn-step semantic grounding is invalid.', { details: { errors:
        response.output.concerns.map(({ kind }) =>
          concern(kind, audited, resolved)) } });
  };
}
