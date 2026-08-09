import {
  createM2ConversationContext,
  executeM2ConversationExchange,
  prepareM2PlayerConversationPlan
} from './lower-dvina-trace-m2-conversation-exchange.js';
import { freezeResult, ref } from
  './lower-dvina-trace-m2-conversation-shared.js';
import { PHASE7_REST_PROGRESS_EFFECT_REF } from
  './lower-dvina-trace-phase-7-temporal-effect-owner.js';

const PARTICIPATION_OPERATION = 'commit_route_participation';

export function createTraceTurn10ConversationContext({ state, contracts,
  playerInput, inputDigest, playerConversationModel, npcSemanticModel,
  temporalAdvanceOwner, revalidateStateVersion, playerPlan = null }) {
  const actualNpcActors = Object.values(contracts.actors);
  const operations = contracts.binding.npc_operations;
  const fisherOperations = [operations.fisher_stay, operations.fisher_escort];
  const byActor = new Map([
    [contracts.actors.eremey.instance_id, [operations.eremey_guide]],
    [contracts.actors.ratsha.instance_id, [operations.ratsha_witness]],
    [contracts.actors.participatingFisher.instance_id, fisherOperations],
    [contracts.actors.otherFisher.instance_id, fisherOperations]
  ]);
  return createM2ConversationContext({
    phase: 'turn_10',
    state,
    contracts,
    playerInput,
    inputDigest,
    checkResult: null,
    targetActor: contracts.actors.eremey,
    actualNpcActors,
    playerConversationModel,
    npcSemanticModel,
    revalidateStateVersion,
    playerOperationContract: {},
    mapping: contracts.binding.signal_mapping,
    npcOperationContract: operationContract([operations.eremey_guide]),
    npcDecisionScope: noHandoff(),
    npcContributionReferencePolicy:
      referencePolicy(contracts, [operations.eremey_guide]),
    classifyNpcPlan: (plan) => classifyParticipationPlan(
      plan, [operations.eremey_guide]),
    resolveNpcConversationContext({ target_actor: actor }) {
      const operation = byActor.get(actor.instance_id);
      if (operation == null) return null;
      return {
        npcOperationContract: operationContract(operation),
        npcDecisionScope: noHandoff(),
        npcContributionReferencePolicy:
          referencePolicy(contracts, operation),
        classifyNpcPlan: (plan) => classifyParticipationPlan(plan, operation)
      };
    },
    activityProfile: contracts.binding.conversation_activity,
    conversationTimeContract: {
      mode: 'parent_activity_final_segment',
      parent_activity_ref:
        contracts.binding.conversation_activity.parent_activity_ref,
      contribution_slots:
        contracts.binding.conversation_activity.contribution_slots,
      parent_temporal: parentTemporalContract(state)
    },
    temporalAdvanceOwner,
    playerPlan
  });
}

export async function prepareTraceTurn10PlayerPlan(input) {
  return prepareM2PlayerConversationPlan(
    createTraceTurn10ConversationContext(input));
}

export async function resolveTraceTurn10ConversationExchange(input) {
  const result = await executeM2ConversationExchange(
    createTraceTurn10ConversationContext(input));
  const exchange = result.exchange;
  return freezeResult({
    input_digest: input.inputDigest,
    exchange,
    same_time_batch_ref: ref('temporal_batch',
      `turn10:${input.state.party_id}:${input.state.clock.whole_minutes}`),
    clock_after: structuredClone(result.clockAfter),
    exact_elapsed_minutes: result.elapsedMinutes,
    time_accounting: {
      mode: 'parent_activity_final_segment',
      parent_activity_ref:
        input.contracts.binding.conversation_activity.parent_activity_ref,
      clock_before: structuredClone(input.state.clock),
      clock_after: structuredClone(result.clockAfter)
    },
    parent_activity_completion: parentActivityCompletion(result),
    temporal_candidates: structuredClone(
      input.state.temporal_boundary_candidates ?? []),
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
    pending_npc_execution: structuredClone(exchange.pending_npc_execution),
    pending_player_execution:
      structuredClone(exchange.pending_player_execution),
    resumed_npc_execution: structuredClone(result.resumedNpcExecution),
    resumed_player_execution: structuredClone(result.resumedPlayerExecution),
    social_delivery_result: null,
    new_signal_records: structuredClone(result.newSignalRecords),
    consumed_signal_ids: structuredClone(result.consumedSignalIds),
    terminal_npc_outcomes: structuredClone(result.terminalNpcOutcomes),
    response_kind: result.npcOutcome?.kind ?? null,
    route_disclosure: null,
    action_handoff: null,
    combat_handoff: null,
    objective_truth_writes: []
  });
}

function parentTemporalContract(state) {
  const parent = state.phase7_parent_temporal;
  if (parent?.execution_id == null || parent.limit_timestamp == null
      || parent.completion_effect == null
      || state.cumulative_elapsed_minutes !== 25
      || state.active_npc_actor_step == null) {
    fail('TRACE_TURN10_PARENT_ACTIVITY_INVALID');
  }
  return {
    execution_id: parent.execution_id,
    limit_timestamp: structuredClone(parent.limit_timestamp),
    registered_effects: [structuredClone(parent.completion_effect)],
    continuous_effects: [{
      effect_ref: PHASE7_REST_PROGRESS_EFFECT_REF,
      input: { execution_id: parent.execution_id }
    }]
  };
}

function parentActivityCompletion(result) {
  const world = result.exchange?.working_state?.world_state;
  if (world?.cumulative_elapsed_minutes !== 30
      || !['started', 'completed'].includes(
        world.active_npc_actor_step?.status)) {
    fail('TRACE_TURN10_PARENT_ACTIVITY_INCOMPLETE');
  }
  return {
    status: 'completed',
    cumulative_elapsed_minutes: 30,
    active_npc_actor_step: structuredClone(world.active_npc_actor_step)
  };
}

function classifyParticipationPlan(plan, allowed) {
  if (plan?.activity?.duration_class !== 'domain_owned') fail();
  if (['silence', 'leave_conversation'].includes(plan.contribution_kind)) {
    return { kind: plan.contribution_kind };
  }
  if (plan.contribution_kind !== 'speech') fail();
  const operation = plan.supporting_operations?.[0] ?? null;
  if (operation == null) return { kind: 'speech', statementRef: null };
  const matched = allowed.find((expected) =>
    Object.keys(expected).every((key) => operation[key] === expected[key])
      && Object.keys(operation).length === Object.keys(expected).length);
  if (plan.supporting_operations.length !== 1
      || operation.op !== PARTICIPATION_OPERATION
      || matched == null) {
    fail();
  }
  return {
    kind: 'route_participation',
    role: matched.role,
    execution_binding_ref: matched.execution_binding_ref,
    activity_ref: matched.activity_ref ?? null,
    route_ref: matched.route_ref ?? null,
    protected_actor_slot: matched.protected_actor_slot ?? null,
    statementRef: null
  };
}

function operationContract(operations) {
  return { [PARTICIPATION_OPERATION]: {
    owner: '@rus/npc-runtime',
    allowed_bindings: operations.map(({ op: _op, ...binding }) =>
      structuredClone(binding))
  } };
}

function referencePolicy(contracts, operations) {
  const refs = operations.flatMap((operation) => [
    operation.route_ref ? ref('route', operation.route_ref) : null,
    operation.activity_ref
      ? ref('activity_profile', operation.activity_ref) : null,
    operation.protected_actor_slot ? ref(
      'npc', contracts.actors.onisim.instance_id)
      : null
  ]).filter(Boolean);
  const unique = new Map(refs.map((reference) => [
    `${reference.entity_kind}:${reference.entity_id}`, reference
  ]));
  return { entity_refs: [...unique.values()], knowledge_refs: [],
    combat_target_refs: [] };
}

function noHandoff() {
  return { action_handoff_available: false, combat_handoff_available: false };
}

function fail() {
  throw Object.assign(new Error(
    'NPC participation must match one exact approved Turn 10 binding.'),
  { code: 'TRACE_TURN10_NPC_PLAN_INVALID' });
}
