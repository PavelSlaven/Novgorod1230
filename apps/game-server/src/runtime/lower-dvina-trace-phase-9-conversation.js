import { createM2ConversationContext, executeM2ConversationExchange,
  prepareM2PlayerConversationPlan } from
  './lower-dvina-trace-m2-conversation-exchange.js';
import { freezeResult, ref, sameTimeBatchKey } from
  './lower-dvina-trace-m2-conversation-shared.js';

export async function prepareTracePhase9PlayerPlan(input) {
  return prepareM2PlayerConversationPlan(contextFor(input));
}

export async function resolveTracePhase9Testimony(input) {
  const result = await executeM2ConversationExchange(contextFor(input));
  const outcome = result.npcOutcome;
  return freezeResult({ input_digest: input.inputDigest,
    exchange: result.exchange,
    same_time_batch_ref: ref('temporal_batch',
      sameTimeBatchKey(input.state.party_id, result.clockAfter)),
    clock_after: structuredClone(result.clockAfter),
    exact_elapsed_minutes: result.elapsedMinutes,
    temporal_boundary_refs: structuredClone(result.temporalBoundaryRefs),
    statements: structuredClone(result.statements),
    audiences: structuredClone(result.audiences),
    supporting_operation_perceptions:
      structuredClone(result.supportingOperationPerceptions),
    decision_boundary: result.decision?.boundary ?? null,
    decision_request: result.decision?.request ?? null,
    decision_plan: result.decision?.proposal?.plan ?? null,
    decisions: structuredClone(result.decisions),
    npc_outcomes: structuredClone(result.npcOutcomes),
    pending_npc_execution: structuredClone(
      result.exchange.pending_npc_execution),
    pending_player_execution: structuredClone(
      result.exchange.pending_player_execution),
    resumed_npc_execution: structuredClone(result.resumedNpcExecution),
    resumed_player_execution: structuredClone(result.resumedPlayerExecution),
    social_delivery_result: null,
    new_signal_records: structuredClone(result.newSignalRecords),
    consumed_signal_ids: structuredClone(result.consumedSignalIds),
    terminal_npc_outcomes: structuredClone(result.terminalNpcOutcomes),
    response_kind: outcome?.kind ?? null,
    testimony_committed: outcome?.kind === 'speech',
    evidence_ref: outcome?.kind === 'speech'
      ? input.contracts.binding.onisim_testimony.evidence_ref : null,
    statement_template_ref:
      input.contracts.binding.onisim_testimony.statement_template_ref,
    objective_truth_writes: [] });
}

function contextFor({ state, contracts, playerInput, inputDigest,
  playerConversationModel, npcSemanticModel, temporalAdvanceOwner,
  revalidateStateVersion, playerPlan = null }) {
  const actualNpcActors = (state.npcs ?? []).filter((npc) =>
    npc.location_profile_ref === state.position.location_ref
      || npc.anchor_id === state.position.g5_anchor_id).map((npc) => ({
    ...npc,
    ref: ref('npc', npc.instance_id)
  }));
  return createM2ConversationContext({ phase: 'phase_9', state, contracts,
    playerInput, inputDigest, checkResult: null,
    mapping: contracts.binding.onisim_testimony.signal_mapping,
    targetActor: contracts.onisim, actualNpcActors,
    playerConversationModel, npcSemanticModel, revalidateStateVersion,
    temporalAdvanceOwner, playerOperationContract: {}, npcOperationContract: {},
    npcDecisionScope: { action_handoff_available: false,
      combat_handoff_available: false },
    npcContributionReferencePolicy: { entity_refs: [], knowledge_refs: [ref(
      'knowledge_scope',
      contracts.binding.onisim_testimony.knowledge_scope_ref)],
    combat_target_refs: [] },
    activityProfile: contracts.binding.onisim_testimony.activity_profile,
    playerPlan, classifyNpcPlan: classifyTestimonyPlan,
    resolveNpcConversationContext({ target_actor: actor }) {
      return actor.instance_id === contracts.onisim.instance_id ? {
        npcOperationContract: {}, npcDecisionScope: {
          action_handoff_available: false, combat_handoff_available: false },
        npcContributionReferencePolicy: { entity_refs: [], knowledge_refs: [
          ref('knowledge_scope', contracts.binding.onisim_testimony
            .knowledge_scope_ref)], combat_target_refs: [] },
        classifyNpcPlan: classifyTestimonyPlan
      } : null;
    } });
}

function classifyTestimonyPlan(plan) {
  if (plan?.activity?.duration_class !== 'domain_owned'
      || !['speech', 'silence', 'leave_conversation']
        .includes(plan.contribution_kind)
      || (plan.supporting_operations?.length ?? 0) !== 0) fail();
  return { kind: plan.contribution_kind,
    statementRef: plan.contribution_kind === 'speech' ? null : undefined };
}
function fail() { throw Object.assign(new Error(
  'Onisim testimony must remain a subjective speech contribution.'),
{ code: 'TRACE_PHASE_9_ONISIM_PLAN_INVALID' }); }
