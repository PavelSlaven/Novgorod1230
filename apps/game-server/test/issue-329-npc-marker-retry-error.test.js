import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNpcDecisionBoundary } from '@rus/npc-runtime';
import { runConversationExchange } from '@rus/turn';
import { createLowerDvinaTraceNpcSemanticModel } from
  '../src/runtime/lower-dvina-trace-conversation-llm.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });

function request() {
  return {
    schema: 'npc_conversation_response_request_v1',
    request_id: 'npc-marker-retry',
    boundary_id: 'pending',
    conversation_id: 'conversation-1',
    exchange_id: 'exchange-1',
    state_version: 1,
    requested_at: { whole_minutes: '1', subminute_numerator: '0',
      subminute_denominator: '1' },
    npc_ref: ref('npc', 'npc-1'),
    decision_reasons: { significance: 'material', categories: ['communication'],
      signal_refs: [ref('npc_decision_signal', 'signal-1')],
      perceived_changes: ['Игрок обратился к NPC.'] },
    npc: {},
    perceived_message: { source_statement_ref:
      ref('conversation_statement', 'statement-1'), perception_result_ref:
      ref('perception_result', 'perception-1') },
    public_conversation_history: [], knowledge: {}, memory: {},
    social_context: {}, available_resources: [],
    allowed_references: { actor_refs: [ref('npc', 'npc-1'),
      ref('player_character', 'player-1')], entity_refs: [ref('item', 'item-1')],
      knowledge_refs: [], combat_target_refs: [] },
    decision_scope: { conversation_mode: true,
      action_handoff_available: false, combat_handoff_available: false,
      allowed_attribute_refs: ['influence'],
      allowed_skill_refs: ['conversation'],
      allowed_check_profile_refs: ['hard'],
      allowed_duration_classes: ['domain_owned'],
      operation_contract: { emit_interaction: {} } }
  };
}

function plan(input, utterance) {
  return {
    schema: 'conversation_contribution_plan_v1',
    request_id: input.request_id, boundary_id: input.boundary_id,
    conversation_id: input.conversation_id, exchange_id: input.exchange_id,
    state_version: input.state_version, speaker_ref: input.npc_ref,
    contribution_kind: 'speech',
    primary_addressee_ref: ref('player_character', 'player-1'),
    intended_addressee_refs: [ref('player_character', 'player-1')],
    affected_actor_refs: [],
    speech: { utterance_text: utterance, dominant_act: 'answer',
      interaction_tags: [], topic_refs: [], claims: [],
      response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: 'ответить', grounded_contribution: 'дать ответ',
      adaptation: 'literal' },
    resolution: 'automatic', activity: { duration_class: 'domain_owned',
      effort: 'none' }, supporting_operations: [], check: null, handoff: null,
    reason: 'NPC chooses to answer.'
  };
}

function harness(responder) {
  const calls = [];
  const roleRunner = { async run(call) {
    calls.push(structuredClone(call));
    if (call.role_id === 'npc_conversation_grounding_auditor') {
      return { output: { pass: true, concerns: [] } };
    }
    return { output: await responder(call) };
  } };
  return { calls, model: createLowerDvinaTraceNpcSemanticModel({ roleRunner }) };
}

function decisionFor(input) {
  const boundary = buildNpcDecisionBoundary({
    decision_mode: 'conversation', scheduled_at: input.requested_at,
    npc_ref: input.npc_ref,
    same_time_batch_ref: ref('temporal_batch', 'batch-1'),
    significance: input.decision_reasons.significance,
    categories: input.decision_reasons.categories,
    signal_refs: input.decision_reasons.signal_refs,
    state_version: String(input.state_version)
  });
  input.boundary_id = boundary.boundary_id;
  return { boundary, request: input, persisted_trace: null };
}

function exchangePorts(model, calls) {
  return {
    npcSemanticModel: model,
    validateFreshNpcPlan: model.validateFreshPlan,
    revalidateNpcStateVersion: async () => 1,
    applyNpcContribution: async ({ proposal }) => {
      calls.apply += 1;
      return contributionResult(proposal.plan);
    },
    advanceContributionTime: async () => {
      calls.advance += 1;
      return { working_state: { state_version: 1 },
        temporal_boundary_refs: [], session_status: 'active',
        elapsed_minutes: 0, completed: true, interrupted: false };
    },
    revalidateAfterContribution: async () => true,
    projectNpcContributionPerception: async ({ contribution_event }) => {
      calls.project += 1;
      return contributionResult(contribution_event);
    },
    buildNpcResponseBoundaries: async () => ({ boundaries: [],
      direct_addressee_refs: [] }),
    buildNpcResponseDecision: async () => assert.fail('no NPC follow-up')
  };
}

function contributionResult(planOrEvent) {
  return { working_state: { state_version: 1 },
    contribution_event: typeof planOrEvent.contribution_id === 'string'
      ? planOrEvent : { schema: 'conversation_non_statement_contribution_v1',
        contribution_id: 'npc-contribution', conversation_id: 'conversation-1' },
    player_response_boundary: true, session_status: 'active', handoff: null };
}

async function runExchange(input, model, calls) {
  return runConversationExchange({
    initialNpcDecision: decisionFor(input),
    initialWorkingState: { state_version: 1 },
    maxContributionsPerExchange: 1,
    timeBudget: { total_minutes: 0, contribution_slots: 1,
      mode: 'same_timestamp' }
  }, exchangePorts(model, calls));
}

test('second dirty NPC marker retry preserves typed failure before apply or projection',
  async () => {
    const input = request();
    const dirty = () => plan(input,
      'Исходная реплика. INFERENCE: private service marker.');
    const fixture = harness(dirty);
    const calls = { apply: 0, advance: 0, project: 0 };
    let failure;
    let result;
    try {
      result = await runExchange(input, fixture.model, calls);
    } catch (error) {
      failure = error;
    }

    assert.equal(result, undefined, 'failed retry returns no exchange result');
    assert.equal(failure?.code, 'TURN_NPC_PLAN_INVALID');
    assert.deepEqual(fixture.calls.map(({ role_id }) => role_id), [
      'npc_conversation_responder',
      'npc_conversation_responder_format_repair'
    ]);
    assert.deepEqual(calls, { apply: 0, advance: 0, project: 0 });
    assert.deepEqual(failure?.details?.validation_errors, [{
      code: 'TRACE_NPC_SPEECH_SERVICE_TEXT',
      category: 'semantic_grounding', retryable: true,
      concern_kinds: ['service_text_marker'],
      message: 'Rewrite the reply without service labels or technical markers.'
    }]);
  });

test('clean NPC response reaches the exchange apply and perception ports', async () => {
  const input = request();
  const fixture = harness(() => plan(input, 'Я отвечу.'));
  const calls = { apply: 0, advance: 0, project: 0 };
  const result = await runExchange(input, fixture.model, calls);

  assert.equal(result.npc_decisions[0].proposal.plan.speech.utterance_text,
    'Я отвечу.');
  assert.deepEqual(fixture.calls.map(({ role_id }) => role_id), [
    'npc_conversation_responder', 'npc_conversation_grounding_auditor'
  ]);
  assert.deepEqual(calls, { apply: 1, advance: 1, project: 1 });
});
