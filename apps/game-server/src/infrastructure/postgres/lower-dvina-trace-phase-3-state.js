import { commitPhase2BodyState } from './lower-dvina-trace-phase-2-state.js';
import { assertSharedSemanticSnapshotSafe, projectSemanticConversationSnapshot, projectSharedSemanticConsequence } from './lower-dvina-trace-conversation-state.js';
import { phase3SemanticInteractions } from './lower-dvina-trace-phase-3-state-interactions.js';
import { applyConversationTemporalNpcWrites } from './lower-dvina-trace-conversation-temporal.js';
import { phase3RouteTimeUpdate } from './lower-dvina-trace-phase-3-activity-state.js';
import { appendPhase3ActivityHistory } from './lower-dvina-trace-phase-3-activity-history.js';
import { projectRepeatedPendingNpcExecution } from './lower-dvina-trace-pending-npc-state.js';
export { activityHistoryEntry, phase3ActivityRef } from './lower-dvina-trace-phase-3-activity-state.js';
export function nextState({
  state, factual, nextVersion, turnNumber, inputDigest, changeSetId,
  rootTurnId, workingRevision
}) {
  let next = structuredClone(state);
  const routeTime = phase3RouteTimeUpdate(factual);
  delete next.npc_semantic_decision_traces;
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
  if (factual.consequence.phase3_kind === 'movement') {
    next.position = {
      ...next.position,
      location_ref:
        factual.consequence.movement.destination.location_ref,
      g5_anchor_id:
        factual.consequence.movement.destination.g5_anchor_id,
      g5_node_id: preparedScene(next,
        factual.consequence.movement.destination.location_ref).node.instance_id
    };
    next.route_history = [...(next.route_history ?? []), {
      route_ref: factual.consequence.movement.route_ref,
      activity_ref: factual.consequence.movement.activity_ref,
      started_at: routeTime.clock_before,
      ended_at: routeTime.clock_after,
      change_set_id: changeSetId
    }];
    next.route_knowledge = [...new Set([
      ...(next.route_knowledge ?? []),
      'trace_ld_v1_route_camp_to_wreck'
    ])];
    next.knowledge = mergeKnowledge(next.knowledge, [{
      fact_id: 'trace_ld_v1_route_camp_to_wreck',
      knowledge_state: 'known_from_committed_source',
      evidence_refs: []
    }]);
  } else {
  const conversation = factual.consequence.conversation;
    if (conversation.semantic_exchange != null) {
      if (conversation.semantic_exchange.exchange
          .applied_contribution_count > 0) {
        next = projectSemanticConversationSnapshot({
          state: next,
          semanticExchange: conversation.semantic_exchange,
          rootTurnId,
          workingRevision,
          appliedChangeSetId: changeSetId
        });
      } else if (conversation.semantic_exchange.pending_npc_execution != null) {
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
      if (next.pending_npc_conversation_execution != null
          && next.pending_npc_conversation_execution.activity_execution_id
            == null) {
        next.pending_npc_conversation_execution = {
          ...next.pending_npc_conversation_execution,
          activity_execution_id:
            `activity:${state.party_id}:trace-phase3:${turnNumber}`,
          total_minutes: conversation.semantic_exchange.exchange.time_budget
            .total_minutes,
          elapsed_minutes: conversation.semantic_exchange.exchange.time_budget
            .elapsed_minutes,
          started_at: structuredClone(factual.time_update.clock_before),
          option_id: factual.mode_resolution.option_id,
          originating_request_id: factual.player_input.request_id,
          next_attempt_ordinal: 1,
          activity_state_version: 2
        };
      }
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

function projectPhase3SemanticConversation({
  next, state, factual, conversation, turnNumber
}) {
  const semantic = conversation.semantic_exchange;
  applyConversationTemporalNpcWrites(next, semantic);
  const resumedPlan = semantic.resumed_npc_execution?.plan ?? null;
  const npcRef = resumedPlan?.speaker_ref
    ?? semantic.decision_request?.npc_ref ?? {
    entity_kind: 'npc', entity_id: conversation.npc_id
  };
  const appliedTargetOutcomes = (semantic.npc_outcomes ?? []).filter(
    ({ npc_ref: outcomeNpcRef, applied }) => applied
      && sameRef(outcomeNpcRef, npcRef));
  const finalOutcome = appliedTargetOutcomes.at(-1) ?? null;
  const finalDecision = semantic.decisions?.find(({ request }) => request.request_id === finalOutcome?.request_id) ?? null;
  const resumedRequestId = semantic.resumed_npc_execution?.decision_trace_ref?.entity_id;
  const npcPlan = finalDecision?.proposal?.plan ?? (finalOutcome?.request_id === resumedRequestId ? resumedPlan : null)
    ?? (finalOutcome === null ? resumedPlan ?? semantic.decision_plan : null);
  const hasDecision = semantic.decision_request !== null;
  const resumed = resumedPlan !== null;
  const npcApplied = appliedTargetOutcomes.length > 0;
  const npcStatements = semantic.statements.filter(({ speaker_ref: speaker }) =>
    sameRef(speaker, npcRef));
  const expectedStatementIds = new Set(appliedTargetOutcomes
    .filter(({ contribution_ref: contributionRef }) =>
      contributionRef?.entity_kind === 'conversation_statement')
    .map(({ contribution_ref: contributionRef }) => contributionRef.entity_id));
  const speechResponse = ['route_disclosure', 'withhold', 'speech']
    .includes(semantic.response_kind);
  const npcSpeechContribution = hasDecision
    || resumed
    ? npcPlan?.contribution_kind === 'speech'
    : false;
  const expectedContributionKind = npcApplied
    ? (speechResponse ? 'speech' : semantic.response_kind)
    : npcPlan?.contribution_kind;
  if (npcRef?.entity_kind !== 'npc'
      || npcStatements.length !== expectedStatementIds.size
      || npcStatements.some(({ statement_id: statementId }) =>
        !expectedStatementIds.has(statementId))
      || conversation.npc_id !== npcRef.entity_id
      || (npcApplied
        && finalOutcome?.outcome?.kind !== semantic.response_kind)
      || ((hasDecision || resumed) && npcPlan?.contribution_kind
        !== expectedContributionKind)
      || (!hasDecision && !resumed && (semantic.response_kind !== null
        || semantic.decision_plan !== null))
      || !Array.isArray(conversation.objective_fact_outputs)
      || conversation.objective_fact_outputs.length !== 0
      || ((hasDecision || resumed) && !npcApplied
        && semantic.response_kind !== null)
      || ((hasDecision || resumed) && ![
        'route_disclosure', 'withhold', 'speech', 'silence',
        'leave_conversation', null
      ].includes(semantic.response_kind))) {
    semanticFail('TRACE_M2_PHASE_3_SEMANTIC_SHAPE_INVALID');
  }
  const statement = semantic.route_disclosure === null
    ? npcStatements.at(-1) ?? null
    : npcStatements.find(({ statement_id: statementId }) =>
      statementId === semantic.route_disclosure.source_statement_ref?.entity_id)
      ?? null;
  next.interactions = [
    ...(next.interactions ?? []),
    ...phase3SemanticInteractions({
      semantic, conversation, npcRef, npcStatements, state, factual,
      turnNumber
    })
  ];

  const disclosure = semantic.route_disclosure;
  if (semantic.response_kind === 'route_disclosure') {
    if (!disclosure
        || disclosure.objective_truth_write !== 'forbidden'
        || disclosure.source_statement_ref?.entity_kind
          !== 'conversation_statement'
        || disclosure.source_statement_ref.entity_id
          !== statement.statement_id
        || typeof disclosure.route_ref !== 'string'
        || !disclosure.route_ref.trim()) {
      semanticFail('TRACE_M2_PHASE_3_ROUTE_DISCLOSURE_INVALID');
    }
    next.route_knowledge = [...new Set([
      ...(next.route_knowledge ?? []),
      disclosure.route_ref
    ])].sort();
    next.knowledge = mergeKnowledge(next.knowledge, [{
      fact_id: disclosure.route_ref,
      knowledge_state: 'known_from_committed_source',
      evidence_refs: [statement.statement_id]
    }]);
  } else if (disclosure !== null) {
    semanticFail('TRACE_M2_PHASE_3_ROUTE_DISCLOSURE_INVALID');
  }
  return next;
}

function sameRef(left, right) {
  return left?.entity_kind === right?.entity_kind &&
    left?.entity_id === right?.entity_id;
}
function semanticFail(code) {
  throw Object.assign(new Error(
    'The Phase 3 semantic conversation projection is incomplete.'), { code });
}

function preparedScene(state, locationRef) {
  const scene = state.prepared_scenes?.find(
    ({ location_profile_ref: ref }) => ref === locationRef
  );
  if (!scene) fail('TRACE_PHASE_3_CAMP_ANCHOR_MISSING');
  return scene;
}
function mergeKnowledge(current = [], added = []) {
  const byId = new Map(current.map((entry) => [entry.fact_id, entry]));
  for (const entry of added) if (!byId.has(entry.fact_id)) {
    byId.set(entry.fact_id, entry);
  }
  return [...byId.values()].sort((a, b) => a.fact_id.localeCompare(b.fact_id));
}
