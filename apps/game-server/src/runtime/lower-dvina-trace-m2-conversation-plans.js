import { committedPlayerKnowledgeRefs } from
  './lower-dvina-trace-m2-conversation-projections.js';
import {
  BARGAIN_OPERATION,
  EVIDENCE_INTERACTION,
  EVIDENCE_OPERATION,
  exactKeys,
  fail,
  LIE_OPERATION,
  PROMISE_OPERATION,
  ref,
  refKey,
  requiredVerbatimUtteranceText,
  ROUTE_OPERATION,
  sameRef,
  SURRENDER_OPERATION
} from './lower-dvina-trace-m2-conversation-shared.js';

export function classifyEremeyPlan(plan, {
  routeRef,
  knowledgeScopeRef
}) {
  requireDomainOwned(plan);
  if (plan.contribution_kind === 'silence'
      || plan.contribution_kind === 'leave_conversation') {
    return { kind: plan.contribution_kind };
  }
  if (plan.contribution_kind !== 'speech') {
    fail(
      'TRACE_M2_EREMEY_RESPONSE_INVALID',
      'Eremey returned an unavailable handoff contribution.'
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
    return {
      kind: plan.speech.interaction_tags.includes('withhold')
        ? 'withhold' : 'speech',
      statementRef: null
    };
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
  requireDomainOwned(plan);
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
  if (plan.contribution_kind === 'leave_conversation') {
    return { kind: 'leave_conversation' };
  }
  if (plan.contribution_kind !== 'speech') {
    fail(
      'TRACE_M2_RATSHA_RESPONSE_INVALID',
      'Ratsha response is outside the accepted conversation boundary.'
    );
  }
  const operation = plan.supporting_operations[0] ?? null;
  const checkRequired = plan.resolution === 'check_required'
    && plan.check !== null;
  if (operation?.op === SURRENDER_OPERATION
      && exactKeys(operation, ['op'])
      && ['accept', 'promise', 'confess'].includes(
        plan.speech.dominant_act
      )
      && plan.speech.interaction_tags.includes('surrender')) {
    return { kind: 'surrender', statementRef: null };
  }
  if (operation?.op === BARGAIN_OPERATION
      && checkRequired
      && exactKeys(operation, ['op'])
      && ['negotiate', 'offer', 'threaten'].includes(
        plan.speech.dominant_act
      )
      && plan.speech.interaction_tags.includes('bargain')) {
    return { kind: 'bargain', statementRef: null };
  }
  if (operation?.op === LIE_OPERATION
      && checkRequired
      && exactKeys(operation, ['op'])
      && plan.speech.interaction_tags.includes('lie')
      && plan.speech.claims.some(
        ({ speaker_posture: posture }) => posture === 'knowingly_false'
      )) {
    return { kind: 'lie', statementRef: null };
  }
  if (operation === null) {
    return { kind: 'speech', statementRef: null };
  }
  fail(
    'TRACE_M2_RATSHA_RESPONSE_INVALID',
    'Ratsha returned an unsupported mechanical operation.'
  );
}

export function classifyOrdinaryConversationPlan(plan) {
  requireDomainOwned(plan);
  if (['silence', 'leave_conversation'].includes(plan.contribution_kind)) {
    return { kind: plan.contribution_kind };
  }
  if (plan.contribution_kind === 'speech'
      && plan.supporting_operations.length === 0) {
    return { kind: 'speech', statementRef: null };
  }
  fail(
    'TRACE_M2_ORDINARY_NPC_RESPONSE_INVALID',
    'An additional conversation participant may only contribute ordinary speech, silence, or leave.'
  );
}

export function requirePlayerContribution(context, plan) {
  requireDomainOwned(plan);
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
  const expectedResolution = context.checkResult === null
    ? 'automatic'
    : 'check_required';
  const checkMatches = plan.resolution === 'automatic'
    ? plan.check === null
    : plan.check?.attribute_ref === context.contracts.check.attribute
      && plan.check?.skill_ref === context.contracts.check.skill
      && plan.check?.difficulty_band === context.contracts.check.check_id;
  const offerOperation = plan.supporting_operations.find(
    ({ op } = {}) => op === PROMISE_OPERATION
  );
  const evidenceOperation = plan.supporting_operations.find(
    ({ op } = {}) => op === EVIDENCE_OPERATION
  );
  const speech = plan.contribution_kind === 'speech';
  const lifecycleValid = speech
    ? plan.handoff === null
    : plan.resolution === 'automatic'
      && plan.check === null
      && plan.supporting_operations.length === 0
      && plan.primary_addressee_ref === null
      && (plan.contribution_kind === 'silence'
        ? plan.handoff === null
          && intended.every((listener) => listener.entity_kind === 'npc'
            && present.has(listener.entity_id))
        : plan.intended_addressee_refs.length === 0);
  if (!lifecycleValid
      || (speech && plan.input_mode === 'verbatim'
        && plan.speech?.utterance_text
          !== requiredVerbatimUtteranceText(context.playerInput))
      || (speech && !sameRef(plan.primary_addressee_ref, context.targetRef))
      || (speech && !intended.some((listener) =>
        sameRef(listener, context.targetRef)))
      || (speech && intended.some((listener) =>
        listener.entity_kind !== 'npc'
        || !present.has(listener.entity_id)))
      || (speech && plan.resolution !== expectedResolution)
      || (speech && !checkMatches)
      || hasUncommittedClaimSource
      || (speech && plan.supporting_operations.some((operation) => {
        if (context.phase === 'phase_3'
            && exactKeys(operation, [
              'op', 'interaction_kind', 'actor_ref', 'target_ref', 'entity_ref'
            ])
            && operation.op === EVIDENCE_OPERATION
            && operation.interaction_kind === EVIDENCE_INTERACTION
            && sameRef(operation.actor_ref, ref('player_character', context.state.actor_id))
            && sameRef(operation.target_ref, context.targetRef)
            && sameRef(operation.entity_ref, context.availableEvidence?.item_ref)) {
          return false;
        }
        return !(context.phase === 'phase_4'
          && exactKeys(operation, ['op'])
          && operation.op === PROMISE_OPERATION);
      }))
      || (speech && context.phase === 'phase_4'
        && Boolean(offerOperation) !== Boolean(context.offerStage))) {
    fail(
      'TRACE_M2_PLAYER_CONTRIBUTION_INVALID',
      'Player contribution must preserve its input mode and match available mechanics.'
    );
  }
  if (speech && context.phase === 'phase_3'
      && Boolean(evidenceOperation) !== Boolean(context.evidencePresented)) {
    fail(
      'TRACE_M2_PLAYER_EVIDENCE_OPERATION_INVALID',
      'The applied evidence effect must match the validated player operation.'
    );
  }
}

function requireDomainOwned(plan) {
  if (plan?.activity?.duration_class !== 'domain_owned') {
    fail('TRACE_M2_CONVERSATION_DURATION_CLASS_INVALID',
      'Lower Dvina revision 14 conversation duration is domain-owned.');
  }
}
