import { commitPhase2BodyState } from './lower-dvina-trace-phase-2-state.js';
import { assertSharedSemanticSnapshotSafe, projectSemanticConversationSnapshot, projectSharedSemanticConsequence } from './lower-dvina-trace-conversation-state.js';
import { phase3RouteTimeUpdate, routeMovement } from './lower-dvina-trace-phase-3-activity-state.js';
import { appendPhase3ActivityHistory } from './lower-dvina-trace-phase-3-activity-history.js';
import { projectRepeatedPendingNpcExecution } from './lower-dvina-trace-pending-npc-state.js';
import { attachPendingConversationActivity } from './lower-dvina-trace-pending-activity-state.js';
import {
  mergeKnowledge,
  projectPhase3SemanticConversation
} from './lower-dvina-trace-phase-3-semantic-state-projection.js';
export { activityHistoryEntry, phase3ActivityRef, routeMovement } from './lower-dvina-trace-phase-3-activity-state.js';
export function nextState({
  state, factual, nextVersion, turnNumber, inputDigest, changeSetId,
  rootTurnId, workingRevision
}) {
  let next = structuredClone(state);
  const routeTime = phase3RouteTimeUpdate(factual);
  delete next.npc_semantic_decision_traces;
  delete next.npc_semantic_decision_inputs;
  next.activity_history = (next.activity_history ?? []).map((entry) => ({
    ...entry,
    execution_result: entry.execution_result?.semantic_exchange == null
      ? entry.execution_result
      : projectSharedSemanticConsequence({
          conversation: entry.execution_result
        }).conversation
  }));
  delete next.relevant_hidden_state;
  next.schema = 'rus.lower_dvina_trace_turn_snapshot.v2';
  next.party_state = {
    ...next.party_state,
    state_version: nextVersion,
    session_state_version: next.party_state.session_state_version + 1,
    clock_state_version: next.party_state.clock_state_version + 1,
    turn_number: turnNumber
  };
  if (factual.body_update?.applied === true) {
    next.body_state = commitPhase2BodyState({
      before: state.body_state,
      proposed: factual.body_update.state_after
    });
    next.body_effect_history = [...(next.body_effect_history ?? []), {
      history_id: `body-history:${state.party_id}:trace-phase3:${turnNumber}`,
      effect_ref: factual.body_update.proposal.profile_ref,
      activity_attempt_id: factual.body_update.proposal.activity_attempt_id,
      occurred_at: structuredClone(routeTime.clock_after)
    }];
    next.party_state.body_state_version = state.party_state.body_state_version + 1;
  }
  next.clock = structuredClone(factual.time_update.clock_after);
  next.clock_weather_light.clock = structuredClone(next.clock);
  appendPhase3ActivityHistory({
    next, state, factual, turnNumber, inputDigest, changeSetId
  });
  if (routeMovement(factual)) {
    const firstEntry = state.first_entry_preparation?.spatial_v3;
    const firstEntryPending = firstEntry != null
      && firstEntry.target?.status !== 'prepared';
    if (firstEntryPending) {
      const existing = new Set((next.npcs ?? []).map(({ instance_id: id }) => id));
      next.npcs = [...(next.npcs ?? []),
        ...(state.first_entry_preparation.npcs ?? []).filter(
          ({ instance_id: id }) => !existing.has(id))];
      const firstEntryNpcs = new Set(
        (state.first_entry_preparation.npcs ?? [])
          .map(({ instance_id: id }) => id));
      next.npcs = next.npcs.map((npc) => firstEntryNpcs.has(npc.instance_id)
        ? { ...npc, anchor_id:
            factual.consequence.movement.destination.g5_anchor_id }
        : npc);
      next.first_entry_preparation.spatial_v3.target.status = 'prepared';
    }
    const destinationPositionId = factual.consequence.movement.destination.scene_position_id
      ?? (firstEntry?.target?.status === 'prepared'
        && state.first_entry_preparation?.scene?.location_profile_ref
          === factual.consequence.movement.destination.location_ref
        ? firstEntry.target.position_id : null)
      ?? (firstEntryPending ? firstEntry.target.position_id : null);
    next.position = {
      ...next.position,
      ...(firstEntryPending ? { position_id: firstEntry.target.position_id,
        g6_id: firstEntry.target.g6_instance_id }
        : (factual.consequence.movement.destination.scene_position_id
          ?? (firstEntry?.target?.status === 'prepared'
            && state.first_entry_preparation?.scene?.location_profile_ref
              === factual.consequence.movement.destination.location_ref
            ? firstEntry.target.position_id : null)) != null
        ? { position_id: factual.consequence.movement.destination.scene_position_id
          ?? firstEntry.target.position_id,
          g6_id: firstEntry?.target?.g6_instance_id }
        : {}),
      location_ref:
        factual.consequence.movement.destination.location_ref,
      g5_anchor_id:
        factual.consequence.movement.destination.g5_anchor_id,
      ...(factual.consequence.phase8_kind === 'movement' ? {
        zone_ref: factual.consequence.movement.destination.zone_ref
      } : {}),
      g5_node_id: preparedScene(next,
        factual.consequence.movement.destination.location_ref).node.instance_id
    };
    if (destinationPositionId == null) {
      delete next.position.position_id;
      delete next.position.g6_id;
    }
    next.route_history = [...(next.route_history ?? []), {
      route_ref: factual.consequence.movement.route_ref,
      activity_ref: factual.consequence.movement.activity_ref,
      started_at: routeTime.clock_before,
      ended_at: routeTime.clock_after,
      change_set_id: changeSetId
    }];
    const learnedRoute = factual.consequence.movement.reverse_route_ref
      ?? 'trace_ld_v1_route_camp_to_wreck';
    next.route_knowledge = [...new Set([
      ...(next.route_knowledge ?? []), learnedRoute
    ])];
    next.knowledge = mergeKnowledge(next.knowledge, [{
      fact_id: learnedRoute,
      knowledge_state: 'known_from_committed_source',
      evidence_refs: [factual.consequence.movement.route_ref]
    }]);
    const moved = new Set(factual.consequence.movement.participants ?? []);
    next.npcs = (next.npcs ?? []).map((npc) => moved.has(npc.instance_id)
      ? { ...npc, anchor_id:
          factual.consequence.movement.destination.g5_anchor_id,
        ...(factual.consequence.phase8_kind === 'movement' ? {
          location_profile_ref:
            factual.consequence.movement.destination.location_ref,
          zone_ref: factual.consequence.movement.destination.zone_ref,
          machine_state: { ...npc.machine_state,
            location_ref: factual.consequence.movement.destination.location_ref,
            spatial_zone_ref: factual.consequence.movement.destination.zone_ref }
        } : {}) }
      : npc);
  } else {
    const conversation = factual.consequence.conversation;
    if (conversation.semantic_exchange != null) {
      const { exchange } = conversation.semantic_exchange;
      const applied = exchange.applied_contribution_count > 0;
      const unavailable = exchange.stop_reason === 'npc_unavailable';
      if (applied || unavailable) {
        next = projectSemanticConversationSnapshot({
          state: next,
          semanticExchange: conversation.semantic_exchange,
          rootTurnId,
          workingRevision,
          appliedChangeSetId: changeSetId
        });
      } else if (conversation.semantic_exchange.pending_npc_execution != null
          || conversation.semantic_exchange.pending_player_execution != null) {
        next = projectRepeatedPendingNpcExecution(
          next, conversation.semantic_exchange
        );
      }
      next = projectPhase3SemanticConversation({
        next,
        state,
        factual,
        conversation,
        turnNumber
      });
      attachPendingConversationActivity({ next,
        semanticExchange: conversation.semantic_exchange,
        activityExecutionId:
          `activity:${state.party_id}:trace-phase3:${turnNumber}`,
        startedAt: factual.time_update.clock_before,
        optionId: factual.mode_resolution.option_id,
        originatingRequestId: factual.player_input.request_id });
    } else {
      const interaction = {
        interaction_id:
          `interaction:${state.party_id}:trace-phase3:${turnNumber}`,
        activity_ref: conversation.activity_ref,
        npc_id: conversation.npc_id,
        statement_ref: conversation.statement_ref,
        memory_ref: conversation.memory_ref,
        journal_ref: conversation.journal_ref,
        consequence_ref: conversation.consequence_ref,
        memory_text: conversation.memory_text,
        journal_text: conversation.journal_text,
        decision_trace: conversation.decision.trace,
        statement_is_new: conversation.statement_is_new,
        started_at: factual.time_update.clock_before,
        occurred_at: factual.time_update.clock_after
      };
      next.interactions = [...(next.interactions ?? []), interaction];
      if (conversation.route_knowledge_ref) {
        next.route_knowledge = [...new Set([
          ...(next.route_knowledge ?? []),
          conversation.route_knowledge_ref
        ])];
        next.knowledge = mergeKnowledge(next.knowledge, [{
          fact_id: conversation.route_knowledge_ref,
          knowledge_state: 'known_from_committed_source',
          evidence_refs: [conversation.statement_ref]
        }]);
      }
      if (conversation.testimonial_evidence_ref) {
        next.knowledge = mergeKnowledge(next.knowledge, [{
          fact_id: conversation.statement_ref,
          knowledge_state: 'known_from_committed_source',
          evidence_refs: [conversation.testimonial_evidence_ref]
        }]);
      }
    }
  }
  next.last_turn = {
    request_id: factual.player_input.request_id,
    idempotency_key: factual.player_input.idempotency_key,
    input_digest: inputDigest,
    raw_text: factual.player_input.raw_text,
    received_at: factual.player_input.received_at,
    option_id: factual.mode_resolution.option_id,
    action_set_digest:
      factual.mode_resolution.decision_trace.action_set_digest,
    semantic_trace:
      structuredClone(factual.mode_resolution.decision_trace),
    check_request:
      structuredClone(factual.availability.check_requests[0] ?? null),
    check_result:
      structuredClone(factual.consequence.conversation?.check_result ?? null),
    consequence: projectSharedSemanticConsequence(factual.consequence),
    time_update: structuredClone(factual.time_update),
    body_update: structuredClone(factual.body_update),
    visible_package: null
  };
  return assertSharedSemanticSnapshotSafe(next);
}
function preparedScene(state, locationRef) {
  const scene = state.prepared_scenes?.find(
    ({ location_profile_ref: ref }) => ref === locationRef
  ) ?? (state.first_entry_preparation?.scene?.location_profile_ref
      === locationRef ? state.first_entry_preparation.scene : null);
  if (!scene) fail('TRACE_PHASE_3_CAMP_ANCHOR_MISSING');
  return scene;
}
