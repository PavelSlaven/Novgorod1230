import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNpcDecisionBoundary, projectNpcConversationSubject } from
  '@rus/npc-runtime';
import { requestNpcSemanticDecision } from '@rus/turn';
import { createLowerDvinaTraceNpcSemanticModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const RESPONDER = 'npc_conversation_responder';
const REPAIR = 'npc_conversation_responder_format_repair';
const AUDITOR = 'npc_conversation_grounding_auditor';

function fixture() {
  const subject = projectNpcConversationSubject({
    npc_ref: ref('npc', 'npc-1'), npc_snapshot: { instance_id: 'npc-1' },
    current_activity_snapshot: { status: 'idle', can_continue_automatically: false }
  });
  const input = {
    schema: 'npc_conversation_response_request_v1', request_id: 'npc-request',
    boundary_id: 'boundary-1', conversation_id: 'conversation-1',
    exchange_id: 'exchange-1', state_version: 1,
    requested_at: { whole_minutes: '1', subminute_numerator: '0',
      subminute_denominator: '1' }, npc_ref: ref('npc', 'npc-1'),
    decision_reasons: { significance: 'material', categories: ['communication'],
      signal_refs: [ref('npc_decision_signal', 'signal-1')],
      perceived_changes: ['Игрок обратился к NPC.'] },
    npc: subject.npc, perceived_message: {
      source_statement_ref: ref('conversation_statement', 'statement-1'),
      perception_result_ref: ref('perception_result', 'perception-1')
    }, public_conversation_history: [], knowledge: subject.knowledge,
    memory: subject.memory, social_context: {},
    available_resources: subject.available_resources,
    allowed_references: {
      actor_refs: [ref('npc', 'npc-1'), ref('player_character', 'player-1')],
      entity_refs: [], knowledge_refs: [...subject.knowledge_refs],
      combat_target_refs: []
    },
    decision_scope: {
      conversation_mode: true, action_handoff_available: false,
      combat_handoff_available: false, allowed_attribute_refs: [],
      allowed_skill_refs: [], allowed_check_profile_refs: [],
      allowed_duration_classes: ['domain_owned'],
      operation_contract: { emit_interaction: {} }
    }
  };
  const boundary = buildNpcDecisionBoundary({
    decision_mode: 'conversation', scheduled_at: input.requested_at,
    npc_ref: input.npc_ref,
    same_time_batch_ref: ref('temporal_batch', 'batch-1'),
    ...input.decision_reasons, state_version: String(input.state_version)
  });
  input.boundary_id = boundary.boundary_id;
  return { input, boundary };
}

function plan(input) {
  return {
    schema: 'conversation_contribution_plan_v1', request_id: input.request_id,
    boundary_id: input.boundary_id, conversation_id: input.conversation_id,
    exchange_id: input.exchange_id, state_version: input.state_version,
    speaker_ref: input.npc_ref, contribution_kind: 'speech',
    primary_addressee_ref: ref('player_character', 'player-1'),
    intended_addressee_refs: [ref('player_character', 'player-1')],
    affected_actor_refs: [], speech: { utterance_text: 'Я отвечу.',
      dominant_act: 'answer', interaction_tags: [], topic_refs: [], claims: [],
      response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: 'ответить', grounded_contribution: 'дать ответ',
      adaptation: 'literal' }, resolution: 'automatic',
    activity: { duration_class: 'domain_owned', effort: 'none' },
    supporting_operations: [], check: null, handoff: null,
    reason: 'NPC chooses to answer.'
  };
}

function modelWith(input, initial, repaired) {
  const calls = [];
  const model = createLowerDvinaTraceNpcSemanticModel({ roleRunner: {
    async run(call) {
      calls.push(call.role_id);
      if (call.role_id === RESPONDER) return { output: initial };
      if (call.role_id === REPAIR) return { output: repaired };
      if (call.role_id === AUDITOR) return { output: { pass: true, concerns: [] } };
      assert.fail(`Unexpected role: ${call.role_id}`);
    }
  } });
  return { model, calls };
}

async function nonPlanFormatRepair(repaired) {
  const { input, boundary } = fixture();
  const initial = plan(input);
  initial.interpretation.adaptation = 'not_allowed';
  const { model, calls } = modelWith(input, initial, repaired(input));
  let failure;
  try {
    await requestNpcSemanticDecision({ boundary, request: input,
      semanticModel: model, validateFreshPlan: model.validateFreshPlan,
      revalidateStateVersion: async () => input.state_version });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure?.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
  assert.equal(failure.details.contract_error, 'conversation_llm_contract_failure');
  assert.equal(failure.details.category, 'format');
  assert.deepEqual(failure.details.repair_kinds_used, ['format']);
  assert.equal(failure.details.validation_errors.some(({ code }) =>
    code === 'format_repair_changed_act'), false);
  assert.deepEqual(calls, [RESPONDER, REPAIR]);
}

test('format repair returning a status object fails as format', async () => {
  await nonPlanFormatRepair(() => ({ status: 'cannot' }));
});

test('format repair returning an array fails as format', async () => {
  await nonPlanFormatRepair(() => []);
});

test('format repair missing interpretation fails as format', async () => {
  await nonPlanFormatRepair((input) => {
    const repaired = plan(input);
    delete repaired.interpretation;
    return repaired;
  });
});

test('a dotted descendant error permits its act field to change', async () => {
  const { input } = fixture();
  const original = plan(input);
  const repaired = plan(input);
  repaired.intended_addressee_refs.push(ref('npc', 'npc-1'));
  const { model } = modelWith(input, null, repaired);
  const result = await model(input, { repair: { kind: 'format',
    original_output: original, validation_errors: [{ code: 'invalid_type',
      category: 'format', path: '$.intended_addressee_refs[1].entity_id',
      message: 'Wrong addressee ref.' }] } });
  assert.notDeepEqual(repaired.intended_addressee_refs,
    original.intended_addressee_refs);
  assert.equal(result.contribution_kind, 'speech');
});

test('a sibling prefix error does not permit an act field to change', async () => {
  const { input } = fixture();
  const original = plan(input);
  const repaired = plan(input);
  repaired.speech.dominant_act = 'question';
  const { model } = modelWith(input, null, repaired);
  await assert.rejects(model(input, { repair: { kind: 'format',
    original_output: original, validation_errors: [{ code: 'invalid_type',
      category: 'format', path: '$.speech.dominant_act_note',
      message: 'A sibling field is invalid.' }] } }), (error) => {
    assert.equal(error.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
    assert.equal(error.details.category, 'semantic');
    assert.deepEqual(error.details.validation_errors.map(({ code, path }) =>
      ({ code, path })), [{ code: 'format_repair_changed_act',
      path: '$.speech.dominant_act' }]);
    return true;
  });
});
