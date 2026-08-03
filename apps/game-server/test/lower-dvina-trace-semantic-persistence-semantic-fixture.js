
import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest } from '@rus/materialization';
import {
  computeSpatialV3CanonicalDigest
} from '@rus/contracts/spatial-v3/registry';
import {
  buildConversationSession,
  buildConversationStatementEvent,
  buildNpcConversationResponseRequest,
  buildNpcDecisionBoundary,
  buildNpcDecisionSignal,
  buildNpcSemanticDecisionTrace
} from '@rus/npc-runtime';
import { projectConversationAudience } from '@rus/visibility-knowledge-memory';
import {
  appendNpcSemanticConversationWrites,
  buildNpcSemanticConversationWriteInput
} from '../src/infrastructure/postgres/npc-semantic-conversation-writes.js';
import {
  assertLowerDvinaTraceSemanticConversationRows
} from '../src/infrastructure/postgres/lower-dvina-trace-semantic-conversation-read.js';
import {
  assertPhase4NormalizedRows
} from '../src/infrastructure/postgres/lower-dvina-trace-phase-4-read.js';

const PARTY_ID = 'party-semantic-persistence';
const CHANGE_SET_ID = 'change:' + PARTY_ID + ':semantic';
const ROOT_TURN_ID = 'turn:' + PARTY_ID + ':semantic';
const AT = Object.freeze({
  whole_minutes: '120',
  subminute_numerator: '0',
  subminute_denominator: '1'
});
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });


export function semanticWriterFixture() {
  const player = ref('player_character', 'player');
  const npc = ref('npc', 'eremey');
  const conversationId = 'conversation-1';
  const exchangeId = 'exchange-2';
  const playerStatement = statement(
    'statement-player', conversationId, exchangeId, player, npc,
    'Куда ведёт тропа?'
  );
  const npcStatement = statement(
    'statement-eremey', conversationId, exchangeId, npc, player,
    'К старой сушильне.', [{
      claim_id: 'eremey-route-disclosure',
      content_summary: 'К старой сушильне ведёт тропа.',
      form: 'assertion',
      speaker_posture: 'believed_true',
      source_knowledge_refs: [ref('knowledge_scope', 'eremey-route')],
      mentioned_entity_refs: [ref('route', 'camp-to-shed')]
    }]
  );
  const playerPerception =
    ref('perception_result', 'perception-statement-player-eremey');
  const npcPerception =
    ref('perception_result', 'perception-statement-eremey-player');
  const audiences = [
    audience(playerStatement, npc, playerPerception),
    audience(npcStatement, player, npcPerception)
  ];
  const signal = buildNpcDecisionSignal({
    occurred_at: AT,
    category: 'communication',
    significance: 'material',
    source_event_ref:
      ref('conversation_statement', playerStatement.statement_id),
    subject_ref: npc,
    perception_required: true,
    source_perception_ref: playerPerception
  });
  const boundary = buildNpcDecisionBoundary({
    decision_mode: 'conversation',
    scheduled_at: AT,
    npc_ref: npc,
    same_time_batch_ref: ref('temporal_batch', 'batch-conversation-1'),
    significance: 'material',
    categories: ['communication'],
    signal_refs: [ref('npc_decision_signal', signal.signal_id)],
    state_version: '2'
  });
  const request = buildNpcConversationResponseRequest({
    schema: 'npc_conversation_response_request_v1',
    request_id: 'npc-conversation-request-1',
    boundary_id: boundary.boundary_id,
    conversation_id: conversationId,
    exchange_id: exchangeId,
    state_version: 2,
    requested_at: AT,
    npc_ref: npc,
    decision_reasons: {
      significance: 'material',
      categories: ['communication'],
      signal_refs: [ref('npc_decision_signal', signal.signal_id)],
      perceived_changes: ['Услышан вопрос о дороге.']
    },
    npc: {},
    perceived_message: {
      source_statement_ref:
        ref('conversation_statement', playerStatement.statement_id),
      perception_result_ref: playerPerception
    },
    public_conversation_history: [playerStatement],
    knowledge: {},
    memory: {},
    social_context: {},
    available_resources: [],
    decision_scope: {
      conversation_mode: true,
      action_handoff_available: false,
      combat_handoff_available: false,
      allowed_attribute_refs: [],
      allowed_skill_refs: [],
      operation_contract: {}
    }
  });
  const plan = conversationPlan(request, npcStatement, player);
  const existingSession = buildConversationSession({
    schema: 'conversation_session_v1',
    conversation_id: conversationId,
    state_version: 1,
    status: 'active',
    started_at: AT,
    location_ref: ref('location', 'fishing-camp'),
    initiator_ref: player,
    active_participant_refs: [npc, player],
    last_contribution_ref:
      ref('conversation_statement', playerStatement.statement_id),
    topic_refs: [],
    status_reason: 'player_contribution_committed'
  });
  const session = buildConversationSession({
    ...structuredClone(existingSession),
    state_version: 2,
    status: 'ended',
    last_contribution_ref:
      ref('conversation_statement', npcStatement.statement_id),
    status_reason: 'npc_response_committed'
  });
  const semanticExchange = {
    exchange: {
      schema: 'conversation_exchange_result_v1',
      session_status: 'ended'
    },
    decision_boundary: boundary,
    decision_request: request,
    decision_plan: plan,
    statements: [playerStatement, npcStatement],
    audiences
  };
  const next = {
    conversation_sessions: [session],
    conversation_statements: [playerStatement, npcStatement],
    conversation_audiences: audiences,
    npc_decision_signals: [{
      signal,
      same_time_batch_key: boundary.same_time_batch_ref.entity_id
    }]
  };
  const input = buildNpcSemanticConversationWriteInput({
    state: { conversation_sessions: [existingSession] },
    next,
    semanticExchange
  });
  const writes = { inserts: [], updates: [], appends: [] };
  appendNpcSemanticConversationWrites({
    ...writes,
    partyId: PARTY_ID,
    changeSetId: CHANGE_SET_ID,
    idempotencyRecordId: 'idem-semantic-persistence',
    rootTurnId: ROOT_TURN_ID,
    workingRevision: 3,
    sessionWrite: input.sessionWrite,
    semanticExchange: input.semanticExchange,
    signalRecords: input.signalRecords,
    actualMessageEvidence: input.actualMessageEvidence
  });
  const trace = buildNpcSemanticDecisionTrace({
    request,
    plan,
    root_turn_id: ROOT_TURN_ID,
    working_revision: 3,
    applied_change_set_id: CHANGE_SET_ID,
    status: 'committed'
  });
  const receivedMessages = audiences.flatMap(
    ({ received_messages: messages }) => messages
  );
  return {
    writes,
    session,
    request,
    plan,
    trace,
    audiences,
    receivedMessages,
    expectedSessionStateVersion: input.expectedSessionStateVersion,
    payload: {
      materialization_trace: {
        seed_context: { scenario_definition_revision: 14 }
      },
      party_id: PARTY_ID,
      conversation_sessions: [session],
      conversation_statements: [playerStatement, npcStatement],
      conversation_audiences: audiences,
      received_messages: receivedMessages,
      npc_semantic_decision_refs: [{
        request_id: trace.request_id,
        boundary_id: trace.boundary_id,
        npc_ref: {
          entity_kind: 'npc',
          entity_id: trace.npc_ref
        },
        committed_state_version: trace.committed_state_version,
        root_turn_id: trace.root_turn_id,
        working_revision: trace.working_revision,
        applied_change_set_id: trace.applied_change_set_id,
        status: trace.status
      }],
      npc_decision_signals: next.npc_decision_signals,
      consumed_npc_decision_signal_ids: [signal.signal_id]
    }
  };
}

export function conversationPlan(request, npcStatement, player) {
  return {
    schema: 'conversation_contribution_plan_v1',
    request_id: request.request_id,
    boundary_id: request.boundary_id,
    conversation_id: request.conversation_id,
    exchange_id: request.exchange_id,
    state_version: request.state_version,
    speaker_ref: request.npc_ref,
    contribution_kind: 'speech',
    primary_addressee_ref: player,
    intended_addressee_refs: [player],
    affected_actor_refs: [],
    speech: {
      utterance_text: npcStatement.utterance_text,
      dominant_act: npcStatement.dominant_act,
      interaction_tags: [],
      topic_refs: [],
      claims: structuredClone(npcStatement.claims),
      response_expectation: { kind: 'none', target_refs: [] }
    },
    interpretation: {
      intent: 'ответить на вопрос',
      grounded_contribution: 'указать направление к сушильне',
      adaptation: 'literal'
    },
    resolution: 'automatic',
    activity: { duration_class: 'domain_owned', effort: 'none' },
    supporting_operations: [],
    check: null,
    handoff: null,
    reason: 'Еремей сообщает известный ему маршрут.'
  };
}

export function statement(
  id,
  conversationId,
  exchangeId,
  speaker,
  addressee,
  text,
  claims = []
) {
  return buildConversationStatementEvent({
    schema: 'conversation_statement_event_v1',
    statement_id: id,
    conversation_id: conversationId,
    exchange_id: exchangeId,
    speaker_ref: speaker,
    intended_addressee_refs: [addressee],
    utterance_text: text,
    dominant_act: 'inform',
    interaction_tags: [],
    topic_refs: [],
    claims: structuredClone(claims),
    message_completeness: 'complete',
    spoken_at: AT,
    duration: {
      owner: 'approved_activity_contract',
      activity_ref: 'conversation-activity'
    },
    social_delivery_result: null,
    source_plan_ref: ref('semantic_plan', 'plan-' + id)
  });
}

export function audience(source, listener, perception) {
  return projectConversationAudience({
    statement: source,
    listener_results: [{
      listener_ref: listener,
      perception_result_ref: perception,
      perception_result: 'recognized',
      comprehension: 'full',
      speaker_recognized: true,
      witness_policy_allows: true
    }]
  });
}
