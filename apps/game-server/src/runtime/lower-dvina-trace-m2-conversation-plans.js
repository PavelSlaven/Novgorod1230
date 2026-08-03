import { committedPlayerKnowledgeRefs } from
  './lower-dvina-trace-m2-conversation-projections.js';
import {
  BARGAIN_OPERATION,
  exactKeys,
  fail,
  LIE_OPERATION,
  PLAYER_OPERATION,
  refKey,
  requiredRawText,
  ROUTE_OPERATION,
  sameRef,
  SURRENDER_OPERATION
} from './lower-dvina-trace-m2-conversation-shared.js';

export function classifyEremeyPlan(plan, {
  routeRef,
  knowledgeScopeRef
}) {
  requireCodeOwnedNpcResolution(plan);
  if (plan.contribution_kind !== 'speech') {
    fail(
      'TRACE_M2_EREMEY_RESPONSE_INVALID',
      'Eremey must answer with one exact speech contribution.'
    );
  }
  const operation = plan.supporting_operations[0] ?? null;
  if (operation?.op !== ROUTE_OPERATION) {
    if (operation !== null) {
      fail(
        'TRACE_M2_EREMEY_OPERATION_INVALID',
        'Eremey returned an unsupported operation.'
      );
    }
    return { kind: 'withhold', statementRef: null };
  }
  if (!exactKeys(operation, [
    'op', 'route_ref', 'source_knowledge_scope_ref'
  ])
      || operation.route_ref !== routeRef
      || operation.source_knowledge_scope_ref !== knowledgeScopeRef
      || !plan.speech.interaction_tags.includes('route_disclosure')
      || !plan.speech.claims.some((claim) =>
        claim.source_knowledge_refs.some((sourceRef) =>
          sourceRef.entity_kind === 'knowledge_scope'
          && sourceRef.entity_id === knowledgeScopeRef)
        && claim.mentioned_entity_refs.some((mentionedRef) =>
          mentionedRef.entity_kind === 'route'
          && mentionedRef.entity_id === routeRef))) {
    fail(
      'TRACE_M2_ROUTE_DISCLOSURE_UNBACKED',
      'Route disclosure requires the exact authored route and NPC knowledge source.'
    );
  }
  return { kind: 'route_disclosure', statementRef: null };
}

export function classifyRatshaPlan(plan) {
  requireCodeOwnedNpcResolution(plan);
  if (plan.contribution_kind === 'combat_handoff') {
    if (plan.handoff?.kind !== 'combat') {
      fail(
        'TRACE_M2_COMBAT_HANDOFF_INVALID',
        'Combat may only leave conversation through the combat handoff.'
      );
    }
    return { kind: 'combat_handoff' };
  }
  if (plan.contribution_kind === 'silence') {
    return { kind: 'silence' };
  }
  if (plan.contribution_kind !== 'speech') {
    fail(
      'TRACE_M2_RATSHA_RESPONSE_INVALID',
      'Ratsha response is outside the accepted conversation boundary.'
    );
  }
  const operation = plan.supporting_operations[0] ?? null;
  if (operation?.op === SURRENDER_OPERATION
      && exactKeys(operation, ['op'])
      && ['accept', 'promise', 'confess'].includes(
        plan.speech.dominant_act
      )
      && plan.speech.interaction_tags.includes('surrender')) {
    return { kind: 'surrender', statementRef: null };
  }
  if (operation?.op === BARGAIN_OPERATION
      && exactKeys(operation, ['op'])
      && ['negotiate', 'offer', 'threaten'].includes(
        plan.speech.dominant_act
      )
      && plan.speech.interaction_tags.includes('bargain')) {
    return { kind: 'bargain', statementRef: null };
  }
  if (operation?.op === LIE_OPERATION
      && exactKeys(operation, ['op'])
      && plan.speech.interaction_tags.includes('lie')
      && plan.speech.claims.some(
        ({ speaker_posture: posture }) => posture === 'knowingly_false'
      )) {
    return { kind: 'lie', statementRef: null };
  }
  fail(
    'TRACE_M2_RATSHA_RESPONSE_INVALID',
    'Ratsha response must be surrender, lie, bargain, silence, or combat handoff.'
  );
}

export function requireExactPlayerSpeech(context, plan) {
  const intended = plan.intended_addressee_refs ?? [];
  const present = new Set(
    context.actualNpcActors.map(({ instance_id: instanceId }) => instanceId)
  );
  const committedKnowledge = new Set(
    committedPlayerKnowledgeRefs(context.state).map(refKey)
  );
  const hasUncommittedClaimSource = (plan.speech?.claims ?? []).some(
    (claim) => claim.source_knowledge_refs.some(
      (sourceRef) => !committedKnowledge.has(refKey(sourceRef))
    )
  );
  if (plan.input_mode !== 'verbatim'
      || plan.contribution_kind !== 'speech'
      || plan.speech?.utterance_text !== requiredRawText(context.playerInput)
      || !sameRef(plan.primary_addressee_ref, context.targetRef)
      || !intended.some((listener) => sameRef(listener, context.targetRef))
      || intended.some((listener) =>
        listener.entity_kind !== 'npc'
        || !present.has(listener.entity_id))
      || plan.resolution !== 'automatic'
      || plan.check !== null
      || plan.handoff !== null
      || hasUncommittedClaimSource
      || plan.supporting_operations.some(
        (operation) => !exactKeys(operation, ['op'])
          || operation.op !== PLAYER_OPERATION
      )) {
    fail(
      'TRACE_M2_PLAYER_CONTRIBUTION_INVALID',
      'Player contribution must preserve the exact utterance and present audience.'
    );
  }
}

function requireCodeOwnedNpcResolution(plan) {
  if (plan.resolution !== 'automatic' || plan.check !== null) {
    fail(
      'TRACE_M2_NPC_CHECK_FORBIDDEN',
      'NPC semantic output cannot resolve or request domain checks.'
    );
  }
}
