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
    activity: { duration_class: input.decision_scope.allowed_duration_classes[0], effort: 'none' },
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

test('a dotted primary addressee descendant permits that act field to change',
  async () => {
    const { input } = fixture();
    input.decision_scope.allowed_duration_classes = ['brief'];
    input.allowed_references.actor_refs.push(ref('npc', 'npc-2'));
    const original = plan(input);
    original.intended_addressee_refs.push(ref('npc', 'npc-2'));
    const repaired = structuredClone(original);
    repaired.primary_addressee_ref = ref('npc', 'npc-2');
    const { model } = modelWith(input, null, repaired);
    const result = await model(input, { repair: { kind: 'format',
      original_output: original, validation_errors: [{ code: 'invalid_type',
        category: 'format', path: '$.primary_addressee_ref.entity_id',
        message: 'The addressee identifier is invalid.' }] } });
    assert.deepEqual(result.primary_addressee_ref, ref('npc', 'npc-2'));
  });

async function scriptedDecision(outputs) {
  const { input, boundary } = fixture();
  input.decision_scope.allowed_duration_classes = ['brief'];
  const calls = [];
  const model = createLowerDvinaTraceNpcSemanticModel({ roleRunner: {
    async run(call) {
      const output = outputs[calls.length]?.(input);
      assert.notEqual(output, undefined, `Unexpected role: ${call.role_id}`);
      calls.push({ role_id: call.role_id, repair_kind: call.repair_kind });
      return { output };
    }
  } });
  const outcome = await requestNpcSemanticDecision({ boundary, request: input,
    semanticModel: model, validateFreshPlan: model.validateFreshPlan,
    revalidateStateVersion: async () => input.state_version })
    .then((value) => ({ value }), (error) => ({ error }));
  return { calls, ...outcome };
}

const auditPass = () => ({ pass: true, concerns: [] });
const roleKinds = (calls) => calls.map(({ role_id, repair_kind }) =>
  repair_kind === undefined ? role_id : `${role_id}:${repair_kind}`);
const changedActErrors = (error) => error.details.validation_errors
  .map(({ code, path }) => ({ code, path }));

test('format repair cannot change intent while a reference error remains',
  async () => {
    const { calls, error } = await scriptedDecision([
      (input) => { const value = plan(input);
        value.interpretation.adaptation = 'not_allowed'; return value; },
      (input) => { const value = plan(input);
        value.interpretation.intent = 'солгать';
        value.affected_actor_refs = [ref('npc', 'npc-ghost')]; return value; },
      (input) => { const value = plan(input);
        value.interpretation.intent = 'солгать'; return value; },
      auditPass
    ]);
    assert.equal(error?.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
    assert.equal(error.details.category, 'semantic');
    assert.deepEqual(error.details.repair_kinds_used, ['format']);
    assert.deepEqual(changedActErrors(error), [{ code: 'format_repair_changed_act',
      path: '$.interpretation.intent' }]);
    assert.deepEqual(roleKinds(calls), [RESPONDER, `${REPAIR}:format`]);
  });

test('format repair keeps repeated mixed-script errors ahead of act changes',
  async () => {
    const { calls, error } = await scriptedDecision([
      (input) => { const value = plan(input);
        value.speech.utterance_text = 'Я отвечу dлинно.'; return value; },
      (input) => { const value = plan(input);
        value.speech.utterance_text = 'Я отвечу dлинно.';
        value.speech.dominant_act = 'question'; return value; }
    ]);
    assert.equal(error?.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
    assert.equal(error.details.category, 'format',
      JSON.stringify(error.details.validation_errors));
    assert.equal(error.details.contract_error,
      'conversation_llm_contract_failure');
    assert.deepEqual(error.details.repair_kinds_used, ['format']);
    assert.deepEqual(error.details.validation_errors.map(
      ({ code, category, path, quote }) => ({ code, category, path, quote })
    ), [{
      code: 'mixed_script_word',
      category: 'format',
      path: '$.speech.utterance_text',
      quote: 'dлинно'
    }]);
    assert.equal(error.details.validation_errors.some(
      ({ code }) => code === 'format_repair_changed_act'), false);
    assert.deepEqual(roleKinds(calls), [RESPONDER, `${REPAIR}:format`]);
  });

test('semantic repair missing interpretation can receive format repair',
  async () => {
    const { calls, value } = await scriptedDecision([
      (input) => { const result = plan(input);
        result.affected_actor_refs = [ref('npc', 'npc-ghost')]; return result; },
      (input) => { const result = plan(input);
        delete result.interpretation; return result; },
      plan, auditPass
    ]);
    assert.equal(value?.status, 'planned');
    assert.deepEqual(roleKinds(calls), [RESPONDER, `${REPAIR}:semantic`,
      `${REPAIR}:format`, AUDITOR]);
  });

test('semantic repair returning a status object can receive format repair',
  async () => {
    const { calls, value } = await scriptedDecision([
      (input) => { const result = plan(input);
        result.affected_actor_refs = [ref('npc', 'npc-ghost')]; return result; },
      () => ({ status: 'cannot' }), plan, auditPass
    ]);
    assert.equal(value?.status, 'planned');
    assert.deepEqual(roleKinds(calls), [RESPONDER, `${REPAIR}:semantic`,
      `${REPAIR}:format`, AUDITOR]);
  });

test('format repair cannot replace the act lost by semantic repair',
  async () => {
    const { calls, error } = await scriptedDecision([
      (input) => { const result = plan(input);
        result.affected_actor_refs = [ref('npc', 'npc-ghost')]; return result; },
      (input) => { const result = plan(input);
        delete result.interpretation; return result; },
      (input) => { const result = plan(input);
        result.interpretation.intent = 'солгать'; return result; }
    ]);
    assert.equal(error?.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
    assert.equal(error.details.category, 'semantic');
    assert.deepEqual(changedActErrors(error), [{ code: 'format_repair_changed_act',
      path: '$.interpretation.intent' }]);
    assert.deepEqual(error.details.repair_kinds_used, ['semantic', 'format']);
    assert.deepEqual(roleKinds(calls), [RESPONDER, `${REPAIR}:semantic`,
      `${REPAIR}:format`]);
  });

test('complete semantic repair still cannot change the dominant act',
  async () => {
    const { calls, error } = await scriptedDecision([
      (input) => { const result = plan(input);
        result.affected_actor_refs = [ref('npc', 'npc-ghost')]; return result; },
      (input) => { const result = plan(input);
        result.speech.dominant_act = 'question'; return result; }
    ]);
    assert.equal(error?.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
    assert.equal(error.details.category, 'semantic');
    assert.deepEqual(error.details.repair_kinds_used, ['semantic']);
    assert.deepEqual(changedActErrors(error), [{ code: 'semantic_repair_changed_act',
      path: '$.speech.dominant_act' }]);
    assert.deepEqual(roleKinds(calls), [RESPONDER, `${REPAIR}:semantic`]);
  });

test('format errors take priority over reference errors after semantic repair',
  async () => {
    const { calls, value } = await scriptedDecision([
      (input) => { const result = plan(input);
        result.affected_actor_refs = [ref('npc', 'npc-ghost')]; return result; },
      (input) => { const result = plan(input);
        delete result.interpretation;
        result.affected_actor_refs = [ref('npc', 'npc-ghost')]; return result; },
      plan, auditPass
    ]);
    assert.equal(value?.status, 'planned');
    assert.deepEqual(roleKinds(calls), [RESPONDER, `${REPAIR}:semantic`,
      `${REPAIR}:format`, AUDITOR]);
  });
