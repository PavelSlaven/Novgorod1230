import { commitPhase2BodyState } from './lower-dvina-trace-phase-2-state.js';
import { assertSharedSemanticSnapshotSafe,
  projectSemanticConversationSnapshot, projectSharedSemanticConsequence } from
  './lower-dvina-trace-conversation-state.js';
import { phase3SemanticInteractions } from
  './lower-dvina-trace-phase-3-state-interactions.js';
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
  next.activity_history = [...(next.activity_history ?? []),
    activityHistoryEntry({
      partyId: state.party_id,
      turnNumber,
      factual,
      inputDigest,
      changeSetId
    })];
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
      next = projectSemanticConversationSnapshot({
        state: next,
        semanticExchange: conversation.semantic_exchange,
        rootTurnId,
        workingRevision,
        appliedChangeSetId: changeSetId
      });
      next = projectPhase3SemanticConversation({
        next,
        state,
        factual,
        conversation,
        turnNumber
      });
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
  const npcRef = semantic.decision_request?.npc_ref ?? {
    entity_kind: 'npc', entity_id: conversation.npc_id
  };
  const hasDecision = semantic.decision_request !== null;
  const npcStatements = semantic.statements.filter(({ speaker_ref: speaker }) =>
    sameRef(speaker, npcRef));
  const speechResponse = ['route_disclosure', 'withhold', 'speech']
    .includes(semantic.response_kind);
  const expectedContributionKind = speechResponse
    ? 'speech' : semantic.response_kind;
  if (npcRef?.entity_kind !== 'npc'
      || npcStatements.length !== (speechResponse ? 1 : 0)
      || conversation.npc_id !== npcRef.entity_id
      || (hasDecision && semantic.decision_plan?.contribution_kind
        !== expectedContributionKind)
      || (!hasDecision && (semantic.response_kind !== null
        || semantic.decision_plan !== null))
      || !Array.isArray(conversation.objective_fact_outputs)
      || conversation.objective_fact_outputs.length !== 0
      || (hasDecision && ![
        'route_disclosure', 'withhold', 'speech', 'silence',
        'leave_conversation'
      ].includes(semantic.response_kind))) {
    semanticFail('TRACE_M2_PHASE_3_SEMANTIC_SHAPE_INVALID');
  }
  const statement = npcStatements[0] ?? null;
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
export function activityHistoryEntry({
  partyId,
  turnNumber,
  factual,
  inputDigest,
  changeSetId
}) {
  const phase3Kind = factual.consequence.phase3_kind;
  const sharedConsequence = projectSharedSemanticConsequence(
    factual.consequence
  );
  const time = phase3Kind === 'movement'
    ? phase3RouteTimeUpdate(factual) : factual.time_update;
  const duration = phase3Kind === 'movement'
    ? Number(time.exact_elapsed?.exact_minutes?.numerator)
    : factual.consequence.duration_minutes;
  return {
    activity_execution_id:
      phase3Kind === 'movement'
        ? `route-execution:${partyId}:trace-phase3:${turnNumber}`
        : `activity:${partyId}:trace-phase3:${turnNumber}`,
    activity_snapshot: {
      activity_ref: phase3ActivityRef(factual),
      consequence: phase3Kind
    },
    option_id: factual.mode_resolution.option_id,
    request_id: factual.player_input.request_id,
    input_digest: inputDigest,
    change_set_id: changeSetId,
    duration_minutes: duration,
    started_at: structuredClone(time.clock_before),
    ended_at: structuredClone(time.clock_after),
    execution_result: structuredClone(
      phase3Kind === 'movement'
        ? factual.consequence.movement
        : sharedConsequence.conversation
    )
  };
}

function phase3RouteTimeUpdate(factual) {
  const route = factual.time_update?.prepared_effect_ledger?.slices?.find(
    ({ effect_kind: kind, owner_ref: owner }) =>
      kind === 'domain_command'
      && owner === 'lower_dvina_trace.follow_path_to_fishing_camp');
  return route?.time_update ?? factual.time_update;
}

export function phase3ActivityRef(factual) {
  return factual.consequence.phase3_kind === 'movement'
    ? factual.consequence.movement.activity_ref
    : factual.consequence.conversation.activity_ref;
}
