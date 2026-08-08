import {
  createM2ConversationContext,
  executeM2ConversationExchange,
  prepareM2PlayerConversationPlan
} from './lower-dvina-trace-m2-conversation-exchange.js';
import { freezeResult, ref } from
  './lower-dvina-trace-m2-conversation-shared.js';

const PARTICIPATION_OPERATION = 'commit_route_participation';

export function createTraceTurn10ConversationContext({ state, contracts,
  playerInput, inputDigest, playerConversationModel, npcSemanticModel,
  revalidateStateVersion, playerPlan = null }) {
  const actualNpcActors = Object.values(contracts.actors);
  const operations = contracts.binding.npc_operations;
  const byActor = new Map([
    [contracts.actors.eremey.instance_id, operations.eremey_guide],
    [contracts.actors.participatingFisher.instance_id,
      operations.participating_fisher_stay],
    [contracts.actors.otherFisher.instance_id,
      operations.other_fisher_escort]
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
    npcOperationContract: operationContract(operations.eremey_guide),
    npcDecisionScope: noHandoff(),
    npcContributionReferencePolicy:
      referencePolicy(contracts, operations.eremey_guide),
    classifyNpcPlan: (plan) => classifyParticipationPlan(
      plan, operations.eremey_guide),
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
    conversationTimeContract: { mode: 'same_timestamp' },
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

function classifyParticipationPlan(plan, expected) {
  if (plan?.activity?.duration_class !== 'domain_owned') fail();
  if (['silence', 'leave_conversation'].includes(plan.contribution_kind)) {
    return { kind: plan.contribution_kind };
  }
  if (plan.contribution_kind !== 'speech') fail();
  const operation = plan.supporting_operations?.[0] ?? null;
  if (operation == null) return { kind: 'speech', statementRef: null };
  if (plan.supporting_operations.length !== 1
      || operation.op !== PARTICIPATION_OPERATION
      || Object.keys(expected).some((key) => operation[key] !== expected[key])
      || Object.keys(operation).length !== Object.keys(expected).length) {
    fail();
  }
  return {
    kind: 'route_participation',
    role: expected.role,
    execution_binding_ref: expected.execution_binding_ref,
    activity_ref: expected.activity_ref ?? null,
    route_ref: expected.route_ref ?? null,
    protected_actor_slot: expected.protected_actor_slot ?? null,
    statementRef: null
  };
}

function operationContract(operation) {
  const { op: _op, ...contract } = operation;
  return { [PARTICIPATION_OPERATION]: {
    owner: '@rus/npc-runtime',
    ...structuredClone(contract)
  } };
}

function referencePolicy(contracts, operation) {
  const refs = [
    operation.route_ref && ref('route', operation.route_ref),
    operation.activity_ref && ref('activity_profile', operation.activity_ref),
    operation.protected_actor_slot && ref(
      'npc', contracts.actors.onisim.instance_id)
  ].filter(Boolean);
  return { entity_refs: refs, knowledge_refs: [], combat_target_refs: [] };
}

function noHandoff() {
  return { action_handoff_available: false, combat_handoff_available: false };
}

function fail() {
  throw Object.assign(new Error(
    'NPC participation must match one exact approved Turn 10 binding.'),
  { code: 'TRACE_TURN10_NPC_PLAN_INVALID' });
}
