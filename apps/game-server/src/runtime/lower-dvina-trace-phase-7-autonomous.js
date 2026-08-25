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
  revalidateStateVersion,
  rootTurnId
}) {
  const boundary = signalBatch?.boundary;
  if (!boundary) fail('TRACE_PHASE_7_AUTONOMOUS_BOUNDARY_MISSING');
  const orderedSignals = signalBatch.ordered_signals;
  const persistedInput = signalBatch.persisted_decision_input;
  const persistedTrace = persistedInput?.trace ?? null;
  const request = buildTracePhase7NpcActionDecisionRequest({
    state, contracts, boundary, orderedSignals, operationContract, rootTurnId,
    waitingTransition: temporal.waiting_transition,
    perceivedChanges: signalBatch.perceived_changes
  });
  const proposal = await requestNpcSemanticDecision({
    boundary,
    request,
    semanticModel: npcAutonomousModel,
    persistedTrace,
    persistedInput,
    orderedSignals,
    revalidateStateVersion,
    rebuildDecisionContext: async () => null,
    validatePlan: (plan, validatedRequest) =>
      validateTracePhase7Plan({
        plan,
        request: validatedRequest,
        contracts,
        operationContract
      })
  });
  if (proposal.status === 'stale_discarded') {
    fail('TRACE_PHASE_7_AUTONOMOUS_RETRY_REQUIRED');
  }
  const resolved = proposal.decision_context;
  const resolvedBoundary = resolved.boundary;
  const resolvedRequest = resolved.request;
  const resolvedSignals = resolved.ordered_signals;
  const waitingTransitionId =
    temporal.waiting_transition.transition_id;
  const causalSignals = resolvedSignals.filter(({ source_event_ref: source }) =>
    source?.entity_kind === 'npc_activity_factual_transition'
      && source.entity_id === waitingTransitionId);
  if (causalSignals.length !== 1) {
    fail('TRACE_PHASE_7_CAUSAL_SIGNAL_INVALID');
  }
  const signal = causalSignals[0];
  return Object.freeze({
    signal,
    boundary: resolvedBoundary,
    request: resolvedRequest,
    proposal,
    new_signal_records: signalBatch.new_signal_records,
    consumed_signal_ids: proposal.status === 'planned'
      ? [...proposal.signal_ids_to_consume]
      : [],
    decision_records: proposal.status === 'planned' ? [{
      request: resolvedRequest,
      boundary: resolvedBoundary,
      orderedSignals: resolvedSignals,
      proposal
    }] : []
  });
}

export function buildTracePhase7NpcActionDecisionRequest({ state, contracts, boundary,
  orderedSignals, operationContract, rootTurnId, waitingTransition,
  perceivedChanges }) {
  const npc = (state.npcs ?? []).find(
    ({ instance_id }) => instance_id === contracts.zhdanko.instance_id
  ) ?? contracts.zhdanko;
  const policy = contracts.npcPolicy ?? {};
  const previousDecisions = (state.npc_semantic_decision_refs ?? [])
    .filter(({ npc_ref: npcRef }) => npcRef?.entity_id === npc.instance_id)
    .map(({ request_id: requestId, boundary_id: boundaryId }) => ({
      request_ref: requestId,
      boundary_ref: boundaryId
    }));
  return buildNpcActionDecisionRequestFromSnapshots({
    request_identity: {
      request_id: `npc-action-request:${boundary.boundary_id}`,
      root_turn_id: rootTurnId,
      committed_state_version: state.party_state.state_version,
      working_revision: state.party_state.turn_number + 1,
      decision_index: 1
    },
    boundary,
    npc_snapshot: {
      ...npc,
      attributes: structuredClone(
        contracts.genericCheckContext?.attributes ?? []),
      skills: structuredClone(contracts.genericCheckContext?.skills ?? []),
      goals: policyEntries(policy.goals, 'goal_ref'),
      fears: policyEntries(policy.fears, 'fear_ref'),
      obligations: obligationEntries(policy.relations_and_obligations)
    },
    current_activity_snapshot: {
      activity_ref: waitingTransition.activity_ref,
      summary: waitingActivitySummary(waitingTransition),
      status: waitingTransition.to,
      can_continue_automatically: false
    },
    historical_context_snapshot: state.historical_context ?? null,
    body_snapshot: npc.check_body_state == null ? npc.body_state : {
      summary: npc.check_body_state.summary ?? npc.body_state?.summary ?? null,
      active_conditions: npc.check_body_state.active_conditions
    },
    mood_snapshot: npc.mood ?? null,
    relationship_snapshots: npc.relationships ?? [],
    resource_snapshots: [
      ...(state.containers ?? []),
      ...(state.items ?? [])
    ],
    perception_snapshot: {
      ...(npc.perception_snapshot ?? {}),
      perceived_changes: structuredClone(perceivedChanges),
      known_routes_and_exits: knownRoutes(contracts)
    },
    knowledge_snapshot: npc.knowledge_snapshot ?? null,
    memory_snapshot: {
      ...(npc.memory_snapshot ?? {}),
      previous_decisions: previousDecisions
    },
    resolved_signals: orderedSignals,
    operation_contract: operationContract
  });
}

function policyEntries(values, refKey) {
  return (values ?? []).flatMap((value) => {
    if (typeof value !== 'string' || value.length === 0) return [];
    return [{ [refKey]: value, summary: value }];
  });
}

function obligationEntries(values) {
  return (values ?? []).flatMap((value) => {
    if (typeof value !== 'string' || value.length === 0) return [];
    const separator = value.indexOf(':');
    return [{
      obligation_ref: value,
      actor_ref: separator >= 0 ? value.slice(separator + 1) : null,
      summary: value,
      status: 'active'
    }];
  });
}

function knownRoutes(contracts) {
  return (contracts.autonomous?.known_route_refs ?? []).map((routeRef) => ({
    route_ref: routeRef,
    destination_zone_ref:
      contracts.localTransition?.destination_zone_ref ?? null,
    summary: routeRef
  }));
}

function waitingActivitySummary(transition) {
  return `${transition.activity_ref}: ${transition.from}→${transition.to}`;
}

function fail(code) {
  throw Object.assign(new Error(code), { code });
}
