import {
  buildNpcActionDecisionRequestFromSnapshots
} from '@rus/npc-runtime';
import { requestNpcSemanticDecision } from '@rus/turn';
import { validateTracePhase7Plan } from './lower-dvina-trace-phase-7-plan-validation.js';

export async function resolveTracePhase7AutonomousDecision({
  state,
  contracts,
  temporal,
  signalBatch,
  operationContract,
  npcAutonomousModel,
  revalidateStateVersion
}) {
  const boundary = signalBatch?.boundary;
  if (!boundary) fail('TRACE_PHASE_7_AUTONOMOUS_BOUNDARY_MISSING');
  const orderedSignals = signalBatch.ordered_signals;
  const persistedInput = signalBatch.persisted_decision_input;
  const persistedTrace = persistedInput?.trace ?? null;
  const request = buildRequestFromSnapshots({
    state, contracts, boundary, orderedSignals, operationContract,
    currentActivity: temporal.projection.waiting_transition
  });
  const proposal = await requestNpcSemanticDecision({
    boundary,
    request,
    semanticModel: npcAutonomousModel,
    persistedTrace,
    persistedInput,
    orderedSignals,
    revalidateStateVersion,
    validatePlan: (plan, validatedRequest) =>
      validateTracePhase7Plan({
        plan,
        request: validatedRequest,
        contracts,
        operationContract
      })
  });
  const waitingTransitionId =
    temporal.projection.waiting_transition.transition_id;
  const causalSignals = orderedSignals.filter(({ source_event_ref: source }) =>
    source?.entity_kind === 'npc_activity_factual_transition'
      && source.entity_id === waitingTransitionId);
  if (causalSignals.length !== 1) {
    fail('TRACE_PHASE_7_CAUSAL_SIGNAL_INVALID');
  }
  const signal = causalSignals[0];
  return Object.freeze({
    signal,
    boundary,
    request,
    proposal,
    new_signal_records: signalBatch.new_signal_records,
    consumed_signal_ids: proposal.status === 'planned'
      ? [...proposal.signal_ids_to_consume]
      : [],
    decision_records: proposal.status === 'planned' ? [{
      request,
      boundary,
      orderedSignals,
      proposal
    }] : []
  });
}

function buildRequestFromSnapshots({ state, contracts, boundary,
  orderedSignals, operationContract, currentActivity }) {
  const npc = contracts.zhdanko;
  const previousDecisions = (state.npc_semantic_decision_refs ?? [])
    .filter(({ npc_ref: npc }) => npc?.entity_id === contracts.zhdanko.instance_id)
    .map(({ request_id: requestId, boundary_id: boundaryId }) => ({
      request_ref: requestId,
      boundary_ref: boundaryId
    }));
  return buildNpcActionDecisionRequestFromSnapshots({
    request_identity: {
      request_id: `npc-action-request:${boundary.boundary_id}`,
      root_turn_id:
        `turn:${state.party_id}:phase7:${state.party_state.turn_number + 1}`,
      committed_state_version: state.party_state.state_version,
      working_revision: state.party_state.turn_number + 1,
      decision_index: 1
    },
    boundary,
    npc_snapshot: npc,
    current_activity_snapshot: {
      activity_ref: currentActivity.activity_ref,
      summary: null,
      status: currentActivity.to,
      can_continue_automatically: false
    },
    historical_context_snapshot: state.historical_context ?? null,
    body_snapshot: npc.body_state ?? null,
    mood_snapshot: npc.mood ?? null,
    relationship_snapshots: npc.relationships ?? [],
    resource_snapshots: state.containers ?? [],
    perception_snapshot: npc.perception_snapshot ?? null,
    knowledge_snapshot: npc.knowledge_snapshot ?? null,
    memory_snapshot: {
      ...(npc.memory_snapshot ?? {}),
      previous_decisions: previousDecisions
    },
    resolved_signals: orderedSignals,
    operation_contract: operationContract
  });
}

function fail(code) {
  throw Object.assign(new Error(code), { code });
}
