import {
  createM2ConversationContext,
  executeM2ConversationExchange,
  prepareM2PlayerConversationPlan
} from './lower-dvina-trace-m2-conversation-exchange.js';
import {
  phase3AvailableEvidence,
  phase3PlayerOperationContract,
  phase3PresentedEvidence
} from './lower-dvina-trace-m2-conversation-player.js';
import { classifyEremeyPlan, classifyRatshaPlan } from
  './lower-dvina-trace-m2-conversation-plans.js';
import {
  BARGAIN_OPERATION,
  fail,
  freezeResult,
  LIE_OPERATION,
  PROMISE_OPERATION,
  requireCommonInput,
  ROUTE_OPERATION,
  SURRENDER_OPERATION
} from './lower-dvina-trace-m2-conversation-shared.js';
import { buildSurrenderProjection } from
  './lower-dvina-trace-m2-conversation-surrender.js';

export async function resolveTracePhase3ConversationExchange({
  state,
  contracts,
  playerInput,
  inputDigest,
  checkResult = null,
  playerConversationModel,
  npcSemanticModel,
  revalidateStateVersion,
  playerPlan = null
} = {}) {
  requireCommonInput({
    state,
    contracts,
    playerInput,
    inputDigest,
    playerConversationModel,
    npcSemanticModel,
    revalidateStateVersion
  });
  const target = contracts.actors?.find(
    ({ ref }) => ref === contracts.ids?.eremeyRef
  );
  const routeRef = contracts.disclosureMapping
    ?.route_knowledge_disclosure?.route_ref;
  if (!target?.instance_id || !routeRef
      || (checkResult !== null
        && checkResult.check_id !== contracts.check.check_id)) {
    fail(
      'TRACE_M2_PHASE_3_CONTRACT_GAP',
      'The exact Phase 3 conversation binding is required.'
    );
  }
  const availableEvidence = phase3AvailableEvidence(state, contracts);
  const initialContext = createM2ConversationContext({
    phase: 'phase_3',
    state,
    contracts,
    playerInput,
    inputDigest,
    checkResult,
    mapping: contracts.conversationSignalMappings?.question,
    targetActor: target,
    actualNpcActors: contracts.actors.filter(
      ({ anchor_id: anchorId }) =>
        anchorId === state.position?.g5_anchor_id
    ),
    playerConversationModel,
    npcSemanticModel,
    revalidateStateVersion,
    availableEvidence,
    playerOperationContract: phase3PlayerOperationContract(availableEvidence),
    npcOperationContract: {
      [ROUTE_OPERATION]: {
        owner: '@rus/visibility-knowledge-memory',
        route_ref: routeRef,
        source_knowledge_scope_ref:
          contracts.eremeyKnowledge.knowledge_scope_ref
      }
    },
    npcDecisionScope: {
      action_handoff_available: false,
      combat_handoff_available: false
    },
    classifyNpcPlan: (plan) => classifyEremeyPlan(plan, {
      routeRef,
      knowledgeScopeRef: contracts.eremeyKnowledge.knowledge_scope_ref
    }),
    playerPlan
  });
  const effectivePlayerPlan = playerPlan ??
    await prepareM2PlayerConversationPlan(initialContext);
  const evidencePresented = phase3PresentedEvidence({
    state, contracts, plan: effectivePlayerPlan
  });
  const mapping = contracts.conversationSignalMappings?.[
    evidencePresented ? 'evidence' : 'question'
  ];
  if (!mapping || mapping.target_npc_ref !== contracts.ids.eremeyRef) {
    fail(
      'TRACE_M2_PHASE_3_CONTRACT_GAP',
      'The exact Phase 3 conversation binding is required.'
    );
  }
  const context = {
    ...initialContext,
    evidencePresented,
    evidencePresentation: evidencePresented ? Object.freeze({
      schema: 'conversation_supporting_operation_event_v1',
      event_id: `evidence-presentation:${inputDigest}`,
      conversation_id: initialContext.conversationId,
      exchange_id: initialContext.exchangeId,
      op: 'emit_interaction',
      interaction_kind: 'present_item_as_evidence',
      actor_ref: {
        entity_kind: 'player_character',
        entity_id: state.actor_id
      },
      target_ref: structuredClone(initialContext.targetRef),
      entity_ref: structuredClone(availableEvidence.item_ref),
      evidence_ref: contracts.ids.evidence,
      occurred_at: structuredClone(state.clock)
    }) : null,
    mapping,
    playerPlan: effectivePlayerPlan
  };
  const result = await executeM2ConversationExchange(context);
  const disclosure = result.npcOutcome.kind === 'route_disclosure'
    ? Object.freeze({
        route_ref: routeRef,
        source_statement_ref: result.npcOutcome.statementRef,
        source_knowledge_scope_ref:
          contracts.eremeyKnowledge.knowledge_scope_ref,
        interaction_mapping_ref: contracts.disclosureMapping.mapping_id,
        memory_projection_ref:
          contracts.disclosureMapping.speaker_memory_projection.template_ref,
        journal_projection_ref:
          contracts.disclosureMapping.player_journal_projection.template_ref,
        testimonial_evidence_ref: 'trace_ld_v1_evidence_eremey_words',
        objective_truth_write: 'forbidden'
      })
    : null;
  return freezeResult({
    exchange: result.exchange,
    statements: result.statements,
    audiences: result.audiences,
    decision_boundary: result.decision.boundary,
    decision_request: result.decision.request,
    decision_plan: result.decision.proposal.plan,
    social_delivery_result: result.socialDeliveryResult,
    new_signal_records: result.newSignalRecords,
    consumed_signal_ids: result.consumedSignalIds,
    evidence_presentation: structuredClone(context.evidencePresentation),
    route_disclosure: disclosure,
    response_kind: result.npcOutcome.kind,
    speech: result.npcOutcome.kind === 'speech'
      ? result.npcOutcome.factualProjection
      : null,
    objective_truth_writes: []
  });
}
export async function resolveTracePhase4ConversationExchange({
  state,
  contracts,
  playerInput,
  inputDigest,
  checkResult,
  offerStage,
  checkRequest,
  playerConversationModel,
  npcSemanticModel,
  revalidateStateVersion,
  playerPlan = null
} = {}) {
  requireCommonInput({
    state,
    contracts,
    playerInput,
    inputDigest,
    playerConversationModel,
    npcSemanticModel,
    revalidateStateVersion
  });
  const hasCheck = checkResult !== null || checkRequest !== null;
  if ((checkResult === null) !== (checkRequest === null)
      || (hasCheck && (checkResult.check_id !== contracts.check?.check_id
        || checkRequest.check_id !== contracts.check?.check_id))
      || (offerStage !== null && typeof offerStage.stage_digest !== 'string')
      || (offerStage !== null && hasCheck
        && checkRequest.causal_predecessor_stage_digest
          !== offerStage.stage_digest)) {
    fail(
      'TRACE_M2_PHASE_4_CAUSAL_INPUT_MISSING',
      'The committed offer stage and code-owned check are required.'
    );
  }
  const mapping = contracts.conversationSignalMappings?.demand;
  const target = contracts.actors?.ratsha_storehouse_helper;
  if (!mapping || !target?.instance_id
      || mapping.target_npc_ref !== 'ratsha_storehouse_helper') {
    fail(
      'TRACE_M2_PHASE_4_CONTRACT_GAP',
      'The exact Phase 4 conversation binding is required.'
    );
  }
  const actualNpcActors = Object.entries(contracts.actors)
    .map(([ref, actor]) => ({ ref, ...structuredClone(actor) }))
    .filter(({ anchor_id: anchorId }) =>
      anchorId === contracts.anchors.shed);
  const context = createM2ConversationContext({
    phase: 'phase_4',
    state,
    contracts,
    playerInput,
    inputDigest,
    checkResult,
    mapping,
    targetActor: { ref: 'ratsha_storehouse_helper', ...target },
    actualNpcActors,
    playerConversationModel,
    npcSemanticModel,
    revalidateStateVersion,
    playerOperationContract: {
      [PROMISE_OPERATION]: {
        owner: '@rus/social-law',
        policy_ref: contracts.promisePolicy.policy_id
      }
    },
    npcOperationContract: {
      [SURRENDER_OPERATION]: {
        required_dominant_acts: ['accept', 'promise', 'confess'],
        required_interaction_tag: 'surrender'
      },
      [BARGAIN_OPERATION]: {
        required_dominant_acts: ['negotiate', 'offer', 'threaten'],
        required_interaction_tag: 'bargain'
      },
      [LIE_OPERATION]: {
        required_interaction_tag: 'lie',
        required_speaker_posture: 'knowingly_false'
      }
    },
    npcDecisionScope: {
      action_handoff_available: false,
      combat_handoff_available: true
    },
    offerStage,
    checkRequest,
    classifyNpcPlan: (plan) => classifyRatshaPlan(plan, {
      offerAvailable: offerStage !== null
    }),
    playerPlan
  });
  const result = await executeM2ConversationExchange(context);
  const surrender = result.npcOutcome.kind === 'surrender'
    ? buildSurrenderProjection(result, context)
    : null;
  const combatHandoff = result.npcOutcome.kind === 'combat_handoff'
    ? structuredClone(result.exchange.handoff)
    : null;

  return freezeResult({
    exchange: result.exchange,
    statements: result.statements,
    audiences: result.audiences,
    decision_boundary: result.decision.boundary,
    decision_request: result.decision.request,
    decision_plan: result.decision.proposal.plan,
    social_delivery_result: result.socialDeliveryResult,
    new_signal_records: result.newSignalRecords,
    consumed_signal_ids: result.consumedSignalIds,
    offer_stage: structuredClone(offerStage),
    check_request: structuredClone(checkRequest),
    surrender: surrender?.surrender ?? null,
    commitment: surrender?.commitment ?? null,
    knife_transition_eligibility:
      surrender?.knifeTransitionEligibility ?? null,
    lie: result.npcOutcome.kind === 'lie'
      ? result.npcOutcome.factualProjection
      : null,
    bargain: result.npcOutcome.kind === 'bargain'
      ? result.npcOutcome.factualProjection
      : null,
    speech: result.npcOutcome.kind === 'speech'
      ? result.npcOutcome.factualProjection
      : null,
    silence: result.npcOutcome.kind === 'silence',
    leave_conversation:
      result.npcOutcome.kind === 'leave_conversation',
    combat_handoff: combatHandoff,
    response_kind: result.npcOutcome.kind,
    objective_truth_writes: []
  });
}
