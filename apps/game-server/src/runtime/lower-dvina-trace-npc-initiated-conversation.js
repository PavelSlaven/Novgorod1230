import {
  buildNpcConversationResponseRequest,
  buildNpcDecisionSignal,
  evaluateNpcDecisionSignals
} from '@rus/npc-runtime';
import { canonicalDigest } from '@rus/materialization';
import { createNpcActorStepCompletionEffect } from
  '@rus/turn/temporal-advance';
import {
  createM2ConversationContext,
  executeM2ConversationExchange
} from './lower-dvina-trace-m2-conversation-exchange.js';
import {
  allowedNpcContributionReferences,
  ownKnowledgeProjection,
  ownMemoryProjection,
  ownNpcProjection
} from './lower-dvina-trace-m2-conversation-projections.js';
import { classifyOrdinaryConversationPlan } from
  './lower-dvina-trace-m2-conversation-plans.js';
import { PHASE7_REST_PROGRESS_EFFECT_REF } from
  './lower-dvina-trace-phase-7-temporal-effect-owner.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });

export async function runLowerDvinaTraceNpcConversationExchange({
  state, npc, operation, actor_step_request: actorStepRequest,
  npcSemanticModel, temporalAdvanceOwner, revalidateStateVersion,
  conversation_bindings: conversationBindings,
  conversation_activity: conversationActivity, parent_temporal: parentTemporal = null
}) {
  if (operation?.op !== 'request_conversation'
      || typeof operation.conversation_goal !== 'string'
      || !operation.conversation_goal.trim()
      || typeof npcSemanticModel !== 'function'
      || conversationBindings == null || conversationActivity == null) {
    throw new TypeError('NPC conversation handoff requires one semantic goal and model');
  }
  const parent = npcActorStepParentTemporal({ state, parentTemporal });
  state = parent.state;
  const inputDigest = canonicalDigest({ schema:
    'rus.lower_dvina_trace_npc_initiated_conversation.v1',
    party_id: state.party_id, request_id: actorStepRequest.request_id,
    npc_id: npc.instance_id, goal: operation.conversation_goal });
  const context = createM2ConversationContext({
    state, targetActor: npc, actualNpcActors: state.npcs ?? [], inputDigest,
    conversationActorRefs: conversationActorRefs(state, npc, operation),
    phase: 'npc_actor_step', contracts: { conversationBindings:
      conversationBindings },
    activityProfile: conversationActivity,
    ...(parent.contract == null ? {} : { conversationTimeContract: {
      mode: 'parent_activity_final_segment', parent_activity_ref: 'phase7_rest',
      parent_temporal: parent.contract } }),
    checkResult: null,
    npcSemanticModel, temporalAdvanceOwner,
    revalidateStateVersion, npcContributionReferencePolicy: {},
    npcDecisionScope: { action_handoff_available: false,
      combat_handoff_available: false },
    npcOperationContract: {}, npcSocialCheckProfile: null,
    classifyNpcPlan: classifyOrdinaryConversationPlan
  });
  const initialNpcDecision = initialDecision({ context, npc, operation,
    actorStepRequest });
  const result = await executeM2ConversationExchange(context, {
    initialNpcDecision
  });
  return {
    exchange: result.exchange,
    decision_boundary: result.decision?.boundary ?? null,
    decision_request: result.decision?.request ?? null,
    decision_plan: result.decision?.proposal?.plan ?? null,
    same_time_batch_ref: initialNpcDecision.boundary.same_time_batch_ref,
    clock_after: structuredClone(result.clockAfter),
    exact_elapsed_minutes: result.elapsedMinutes,
    temporal_boundary_refs: structuredClone(result.temporalBoundaryRefs),
    temporal_advance_results: structuredClone(
      result.exchange.working_state.temporal_advance_results),
    parent_temporal_completion_effect: structuredClone(parent.completionEffect),
    parent_temporal_cumulative_elapsed_minutes: parent.cumulativeElapsedMinutes,
    statements: structuredClone(result.statements),
    audiences: structuredClone(result.audiences),
    supporting_operation_perceptions:
      structuredClone(result.supportingOperationPerceptions),
    decisions: structuredClone(result.decisions),
    npc_outcomes: structuredClone(result.npcOutcomes),
    pending_npc_execution: structuredClone(result.exchange.pending_npc_execution),
    pending_player_execution: structuredClone(result.exchange.pending_player_execution),
    resumed_npc_execution: structuredClone(result.resumedNpcExecution),
    resumed_player_execution: structuredClone(result.resumedPlayerExecution),
    new_signal_records: structuredClone(result.newSignalRecords),
    consumed_signal_ids: structuredClone(result.consumedSignalIds),
    terminal_npc_outcomes: structuredClone(result.terminalNpcOutcomes),
    response_kind: result.npcOutcome?.kind ?? null,
    objective_truth_writes: [],
    semantic_context: { conversation_goal: operation.conversation_goal }
  };
}

function npcActorStepParentTemporal({ state, parentTemporal }) {
  if (parentTemporal == null) return { state, contract: null, completionEffect: null };
  const active = parentTemporal.active_actor_step;
  const completionEffect = createNpcActorStepCompletionEffect({
    party_ref: { entity_kind: 'party', entity_id: state.party_id },
    active_actor_step: active, visibility_policy_ref: {
      entity_ref: { entity_kind: 'visibility_modifier',
        entity_id: 'lower-dvina-trace-phase-7-hidden-npc' }, authoring_version: '1' }
  });
  return {
    state: structuredClone(state),
    cumulativeElapsedMinutes: parentTemporal.projection?.cumulative_elapsed_minutes,
    contract: { execution_id: parentTemporal.execution_id,
      limit_timestamp: structuredClone(parentTemporal.limit_timestamp),
      registered_effects: [completionEffect], continuous_effects: [{
        effect_ref: PHASE7_REST_PROGRESS_EFFECT_REF,
        input: { execution_id: parentTemporal.execution_id } }] },
    completionEffect
  };
}

function conversationActorRefs(state, npc, operation) {
  const selected = operation.target_actor_refs.map((actorId) => actorId === state.actor_id
    ? ref('player_character', actorId)
    : state.npcs?.some(({ instance_id }) => instance_id === actorId)
      ? ref('npc', actorId) : null);
  if (selected.includes(null)
      || new Set(selected.map(({ entity_kind, entity_id }) =>
        `${entity_kind}\u0000${entity_id}`)).size !== selected.length) {
    throw new TypeError('NPC conversation handoff requires exact selected targets');
  }
  return [ref('npc', npc.instance_id), ...selected];
}

function initialDecision({ context, npc, operation, actorStepRequest }) {
  const npcRef = ref('npc', npc.instance_id);
  const subjectiveNpc = { ...npc, ref: npcRef,
    knowledge_records: npc.knowledge_records ?? [] };
  const signal = buildNpcDecisionSignal({ occurred_at: context.state.clock,
    category: 'objective', significance: 'material', source_event_ref:
      ref('npc_actor_step_request', actorStepRequest.request_id),
    subject_ref: npcRef, scope_refs: [], perception_required: false,
    causal_parent_refs: [] });
  const boundary = evaluateNpcDecisionSignals({ npc_ref: npcRef,
    active_mode: 'conversation', current_intent: null, decision_capability: true,
    resolved_signals: [signal], consumed_signal_ids: [],
    same_time_batch_ref: ref('temporal_batch', context.batchKey),
    state_version: String(context.stateVersion) }).boundary;
  const request = buildNpcConversationResponseRequest({
    schema: 'npc_conversation_response_request_v1',
    request_id: `npc-conversation-request:${boundary.boundary_id}:${context.exchangeId}`,
    boundary_id: boundary.boundary_id, conversation_id: context.conversationId,
    exchange_id: context.exchangeId, state_version: context.stateVersion,
    requested_at: structuredClone(context.state.clock), npc_ref: npcRef,
    decision_reasons: { significance: boundary.significance,
      categories: structuredClone(boundary.categories),
      signal_refs: structuredClone(boundary.signal_refs),
      perceived_changes: ['NPC initiated a conversation.'] },
    npc: ownNpcProjection(subjectiveNpc), perceived_message: null,
    public_conversation_history: [], knowledge: ownKnowledgeProjection(subjectiveNpc),
    memory: ownMemoryProjection(subjectiveNpc, context.state, npcRef), social_context: {
      delivery_cues: [], claims_are_speaker_assertions_not_objective_truth: true,
      conversation_goal: operation.conversation_goal }, available_resources: [],
    allowed_references: allowedNpcContributionReferences(context),
    decision_scope: { conversation_mode: true, action_handoff_available: false,
      combat_handoff_available: false, allowed_attribute_refs: [],
      allowed_skill_refs: [], allowed_check_profile_refs: [],
      allowed_duration_classes: ['domain_owned'], operation_contract: {} }
  });
  const persisted_trace = (context.state.npc_semantic_decision_traces ?? []).find(
    ({ boundary_id }) => boundary_id === boundary.boundary_id) ?? null;
  return { boundary, request, persisted_trace, signal_record: {
    signal, same_time_batch_key: context.batchKey } };
}
