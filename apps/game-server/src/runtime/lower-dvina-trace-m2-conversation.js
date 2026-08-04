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
import { classifyEremeyPlan } from
  './lower-dvina-trace-m2-conversation-plans.js';
import {
  fail,
  freezeResult,
  ref,
  requireCommonInput,
  ROUTE_OPERATION,
  sameTimeBatchKey
} from './lower-dvina-trace-m2-conversation-shared.js';

export { resolveTracePhase4ConversationExchange } from
  './lower-dvina-trace-m2-conversation-phase4.js';

export async function resolveTracePhase3ConversationExchange({
  state,
  contracts,
  playerInput,
  inputDigest,
  checkResult = null,
  playerConversationModel,
  npcSemanticModel,
  temporalAdvanceOwner,
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
  const pendingExecution = state.pending_npc_conversation_execution ?? null;
  const effectiveInputDigest = pendingExecution?.source_input_digest
    ?? inputDigest;
  const initialContext = createM2ConversationContext({
    phase: 'phase_3',
    state,
    contracts,
    playerInput,
    inputDigest: effectiveInputDigest,
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
    temporalAdvanceOwner,
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
  const effectivePlayerPlan = pendingExecution === null
    ? playerPlan ?? await prepareM2PlayerConversationPlan(initialContext)
    : null;
  const evidencePresented = effectivePlayerPlan === null ? false
    : phase3PresentedEvidence({ state, contracts, plan: effectivePlayerPlan });
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
      event_id: `evidence-presentation:${effectiveInputDigest}`,
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
  const disclosure = result.npcOutcome?.kind === 'route_disclosure'
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
    input_digest: effectiveInputDigest,
    exchange: result.exchange,
    same_time_batch_ref: ref(
      'temporal_batch',
      sameTimeBatchKey(state.party_id, result.clockAfter)
    ),
    clock_after: structuredClone(result.clockAfter),
    exact_elapsed_minutes: result.elapsedMinutes,
    temporal_boundary_refs: structuredClone(result.temporalBoundaryRefs),
    statements: result.statements,
    audiences: result.audiences,
    supporting_operation_perceptions:
      result.supportingOperationPerceptions,
    decision_boundary: result.decision?.boundary ?? null,
    decision_request: result.decision?.request ?? null,
    decision_plan: result.decision?.proposal.plan ?? null,
    decisions: structuredClone(result.decisions),
    pending_npc_execution:
      structuredClone(result.exchange.pending_npc_execution),
    resumed_npc_execution:
      structuredClone(result.resumedNpcExecution),
    social_delivery_result: result.socialDeliveryResult,
    new_signal_records: result.newSignalRecords,
    consumed_signal_ids: result.consumedSignalIds,
    evidence_presentation:
      result.exchange.applied_contribution_count >= 1
        ? structuredClone(context.evidencePresentation) : null,
    route_disclosure: disclosure,
    response_kind: result.npcOutcome?.kind ?? null,
    speech: result.npcOutcome?.kind === 'speech'
      ? result.npcOutcome.factualProjection
      : null,
    objective_truth_writes: []
  });
}
