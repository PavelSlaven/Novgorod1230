import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNpcDecisionBoundary } from '@rus/npc-runtime';
import { normalizeNpcBoundaryBatch } from
  '../src/conversation-exchange-npc-batch.js';
import { resumePendingNpcExecution } from
  '../src/conversation-exchange-resume.js';
import { runConversationExchange } from '../src/conversation-exchange.js';
import { normalizeConversationExchangeInput } from
  '../src/conversation-exchange-input.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const at = {
  whole_minutes: '10',
  subminute_numerator: '0',
  subminute_denominator: '1'
};

test('one NPC and same-time batch cannot enter separate decision modes', () => {
  const common = {
    scheduled_at: at,
    npc_ref: ref('npc', 'guard'),
    same_time_batch_ref: ref('temporal_batch', 'batch-1'),
    significance: 'material',
    categories: ['communication'],
    signal_refs: [ref('npc_decision_signal', 'signal-1')],
    state_version: '4'
  };
  const boundaries = ['conversation', 'autonomous'].map((decision_mode) =>
    buildNpcDecisionBoundary({ ...common, decision_mode }));

  assert.throws(() => normalizeNpcBoundaryBatch({
    boundaries,
    direct_addressee_refs: [ref('npc', 'guard')]
  }, new Set(), new Set()), {
    code: 'TURN_CONVERSATION_NPC_DECISION_DUPLICATE'
  });
});

test('resume remembers the pending NPC and batch across legacy boundary ids',
  async () => {
    const npcRef = ref('npc', 'guard');
    const batchRef = ref('temporal_batch', 'batch-1');
    const boundary = buildNpcDecisionBoundary({
      decision_mode: 'conversation',
      scheduled_at: at,
      npc_ref: npcRef,
      same_time_batch_ref: batchRef,
      significance: 'material',
      categories: ['communication'],
      signal_refs: [ref('npc_decision_signal', 'signal-2')],
      state_version: '4'
    });
    const contribution = {
      schema: 'conversation_non_statement_contribution_v1',
      contribution_id: 'contribution-1'
    };
    const applied = {
      working_state: {},
      contribution_event: contribution,
      player_response_boundary: false,
      session_status: 'active',
      handoff: null
    };

    await assert.rejects(() => resumePendingNpcExecution({
      initialWorkingState: {},
      maxContributionsPerExchange: 8,
      pendingNpcExecution: {
        plan: { speaker_ref: npcRef },
        boundary_id: 'npc-decision:batch-1:guard',
        contribution_index: 2,
        remaining_minutes: 1,
        remaining_exchange_minutes: 2,
        remaining_responder_refs: [],
        same_time_batch_ref: batchRef,
        check_result: null,
        social_delivery_result: null,
        source_decision_trace_ref: ref('npc_decision_trace', 'trace-1')
      }
    }, {
      applyPendingNpcContribution: async () => applied,
      revalidatePendingNpcContribution: async () => true,
      buildNpcResponseBoundaries: async () => ({
        boundaries: [boundary], direct_addressee_refs: [npcRef]
      })
    }, {
      callPort: (port, argument) => port(argument),
      fail(code, message) {
        const error = new Error(message);
        error.code = code;
        throw error;
      },
      immutableClone: structuredClone,
      normalizeApplyResult: (value) => value,
      progressAndProject: async ({ applied: value }) => ({
        applied: value,
        elapsedMinutes: 1,
        completed: true,
        interrupted: false,
        temporalBoundaryRefs: []
      }),
      stopAfterApply: () => null
    }), { code: 'TURN_CONVERSATION_NPC_DECISION_DUPLICATE' });
  });

test('resume cancels an unavailable pending NPC without time or application',
  async () => {
    let applyCalls = 0;
    let terminalOutcomes = null;
    const result = await resumePendingNpcExecution({
      initialWorkingState: { state_version: 4 },
      maxContributionsPerExchange: 8,
      pendingNpcExecution: {
        plan: { speaker_ref: ref('npc', 'guard') },
        boundary_id: 'npc-decision:batch-1:guard',
        contribution_index: 2,
        remaining_minutes: 3,
        remaining_exchange_minutes: 3,
        remaining_responder_refs: [],
        same_time_batch_ref: ref('temporal_batch', 'batch-1'),
        check_result: null,
        social_delivery_result: null,
        source_decision_trace_ref: ref('npc_decision_trace', 'trace-1')
      }
    }, {
      revalidatePendingNpcContribution: async () => false,
      applyPendingNpcContribution: async () => {
        applyCalls += 1;
        throw new Error('unavailable pending contribution must not apply');
      },
      applyNpcTerminalOutcomes: async ({ working_state: workingState,
        terminal_outcomes: outcomes }) => {
        terminalOutcomes = outcomes;
        return { working_state: workingState, session_status: 'ended' };
      }
    }, {
      callPort: (port, argument) => port(argument),
      fail(code, message) {
        const error = new Error(message);
        error.code = code;
        throw error;
      },
      immutableClone: structuredClone
    });

    assert.equal(applyCalls, 0);
    assert.equal(result.stop_reason, 'npc_unavailable');
    assert.equal(result.session_status, 'ended');
    assert.equal(result.time_budget.elapsed_minutes, 0);
    assert.deepEqual(result.contributions, []);
    assert.equal(result.pending_npc_execution, null);
    assert.deepEqual(terminalOutcomes, [{
      npc_ref: ref('npc', 'guard'),
      same_time_batch_ref: ref('temporal_batch', 'batch-1'),
      outcome: 'npc_unavailable',
      signal_ids_to_consume: [],
      source_decision_trace_ref: ref('npc_decision_trace', 'trace-1')
    }]);
  });

test('NPC-first exchange resolves contribution one without player ports',
  async () => {
    const decision = npcFirstDecision();
    const calls = [];
    const result = await runConversationExchange({
      initialNpcDecision: decision,
      initialWorkingState: { state_version: 2 },
      maxContributionsPerExchange: 1,
      timeBudget: { total_minutes: 0, contribution_slots: 1,
        mode: 'same_timestamp' }
    }, {
      npcSemanticModel: async (request) => {
        calls.push('model');
        return npcFirstPlan(request);
      },
      revalidateNpcStateVersion: async () => 2,
      applyNpcContribution: async ({ proposal, contribution_index: index }) => {
        calls.push(`apply:${index}`);
        return contributionResult(proposal.plan);
      },
      advanceContributionTime: async () => {
        calls.push('time');
        return { working_state: { state_version: 2 },
          temporal_boundary_refs: [], session_status: 'active',
          elapsed_minutes: 0, completed: true, interrupted: false };
      },
      revalidateAfterContribution: async () => true,
      projectNpcContributionPerception: async ({ contribution_event: event }) => {
        calls.push('perception');
        return contributionResult(event);
      },
      buildNpcResponseBoundaries: async () => ({ boundaries: [],
        direct_addressee_refs: [] }),
      buildNpcResponseDecision: async () => assert.fail('no NPC follow-up')
    });
    assert.deepEqual(calls, ['model', 'apply:1', 'time', 'perception']);
    assert.equal(result.contributions.length, 1);
    assert.equal(result.contributions[0].contribution_id, 'contribution-1');
    assert.equal(result.npc_decisions[0].proposal.plan.contribution_kind, 'speech');
    assert.equal(result.stop_reason, 'player_response');
  });

test('NPC-first exchange fails closed if first contribution is interrupted',
  async () => {
    const decision = npcFirstDecision();
    await assert.rejects(runConversationExchange({
      initialNpcDecision: decision,
      initialWorkingState: { state_version: 2 },
      timeBudget: { total_minutes: 1, contribution_slots: 1 }
    }, npcFirstPorts({ interrupted: true })),
    ({ code }) => code === 'TURN_CONVERSATION_NPC_INITIAL_INTERRUPTED');
  });

test('conversation exchange input requires exactly one initial actor', () => {
  for (const input of [{ initialWorkingState: {} }, {
    playerRequest: {}, initialNpcDecision: {}, initialWorkingState: {}
  }]) {
    assert.throws(() => normalizeConversationExchangeInput(input),
      { code: 'TURN_CONVERSATION_EXCHANGE_INPUT_INVALID' });
  }
});

function npcFirstDecision() {
  const boundary = buildNpcDecisionBoundary({ decision_mode: 'conversation',
    scheduled_at: at, npc_ref: ref('npc', 'speaker'),
    same_time_batch_ref: ref('temporal_batch', 'batch-1'),
    significance: 'material', categories: ['objective'],
    signal_refs: [ref('npc_decision_signal', 'signal-1')], state_version: '2' });
  return { boundary, persisted_trace: null, request: {
    schema: 'npc_conversation_response_request_v1',
    request_id: 'request-1', boundary_id: boundary.boundary_id,
    conversation_id: 'conversation-1', exchange_id: 'exchange-1',
    state_version: 2, requested_at: at, npc_ref: ref('npc', 'speaker'),
    decision_reasons: { significance: 'material', categories: ['objective'],
      signal_refs: [ref('npc_decision_signal', 'signal-1')],
      perceived_changes: ['Решил заговорить.'] },
    npc: {}, perceived_message: null, public_conversation_history: [],
    knowledge: {}, memory: {}, social_context: {}, available_resources: [],
    allowed_references: { actor_refs: [ref('npc', 'speaker'),
      ref('player_character', 'player')], entity_refs: [], knowledge_refs: [],
    combat_target_refs: [] },
    decision_scope: { conversation_mode: true, action_handoff_available: false,
      combat_handoff_available: false, allowed_attribute_refs: [],
      allowed_skill_refs: [], allowed_check_profile_refs: [],
      allowed_duration_classes: ['domain_owned'], operation_contract: {} }
  } };
}

function npcFirstPlan(request) {
  return { schema: 'conversation_contribution_plan_v1',
    request_id: request.request_id, boundary_id: request.boundary_id,
    conversation_id: request.conversation_id, exchange_id: request.exchange_id,
    state_version: request.state_version, speaker_ref: request.npc_ref,
    contribution_kind: 'speech', primary_addressee_ref: ref('player_character', 'player'),
    intended_addressee_refs: [ref('player_character', 'player')],
    affected_actor_refs: [], speech: { utterance_text: 'Постой.',
      dominant_act: 'request', interaction_tags: [], topic_refs: [], claims: [],
      response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: 'начать разговор', grounded_contribution: 'обратиться',
      adaptation: 'literal' }, resolution: 'automatic',
    activity: { duration_class: 'domain_owned', effort: 'none' },
    supporting_operations: [], check: null, handoff: null, reason: 'Есть повод.' };
}

function contributionResult(plan) {
  return { working_state: { state_version: 2 }, contribution_event:
    typeof plan.contribution_id === 'string' ? plan : {
      schema: 'conversation_non_statement_contribution_v1',
      contribution_id: 'contribution-1', conversation_id: 'conversation-1' },
  player_response_boundary: true, session_status: 'active', handoff: null };
}

function npcFirstPorts({ interrupted = false } = {}) {
  return { npcSemanticModel: async (request) => npcFirstPlan(request),
    revalidateNpcStateVersion: async () => 2,
    applyNpcContribution: async ({ proposal }) => contributionResult(proposal.plan),
    advanceContributionTime: async () => ({ working_state: { state_version: 2 },
      temporal_boundary_refs: [], session_status: 'active', elapsed_minutes: 0,
      completed: !interrupted, interrupted }),
    revalidateAfterContribution: async () => true,
    projectNpcContributionPerception: async ({ contribution_event: event }) =>
      contributionResult(event),
    buildNpcResponseBoundaries: async () => ({ boundaries: [],
      direct_addressee_refs: [] }),
    buildNpcResponseDecision: async () => assert.fail('no NPC follow-up') };
}
