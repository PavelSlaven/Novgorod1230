import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNpcDecisionBoundary, projectNpcConversationSubject } from
  '@rus/npc-runtime';
import { requestNpcSemanticDecision } from '@rus/turn';
import { createLlmRoleRunnerAdapter } from '../src/adapters/llm-role-runner.js';
import { createLowerDvinaTraceNpcSemanticModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const subject = projectNpcConversationSubject({
  npc_ref: ref('npc', 'npc-1'),
  npc_snapshot: { instance_id: 'npc-1' },
  current_activity_snapshot: { status: 'idle', can_continue_automatically: false }
});
const RESPONDER = 'npc_conversation_responder';
const REPAIR = 'npc_conversation_responder_format_repair';
const AUDITOR = 'npc_conversation_grounding_auditor';

function request() {
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
    }, public_conversation_history: [], knowledge: subject.knowledge, memory: subject.memory,
    social_context: {}, available_resources: subject.available_resources,
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

function plan(input, utterance = 'Я отвечу.') {
  return {
    schema: 'conversation_contribution_plan_v1', request_id: input.request_id,
    boundary_id: input.boundary_id, conversation_id: input.conversation_id,
    exchange_id: input.exchange_id, state_version: input.state_version,
    speaker_ref: input.npc_ref, contribution_kind: 'speech',
    primary_addressee_ref: ref('player_character', 'player-1'),
    intended_addressee_refs: [ref('player_character', 'player-1')],
    affected_actor_refs: [], speech: { utterance_text: utterance,
      dominant_act: 'answer', interaction_tags: [], topic_refs: [], claims: [],
      response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: 'ответить', grounded_contribution: 'дать ответ',
      adaptation: 'literal' },
    resolution: 'automatic', activity: { duration_class: 'domain_owned',
      effort: 'none' }, supporting_operations: [], check: null, handoff: null,
    reason: 'NPC chooses to answer.'
  };
}

const json = (value) => ({ status: 'ok', parsed_json: value,
  raw_text: JSON.stringify(value) });
const unparsed = (rawText) => ({ status: 'parse_error', raw_text: rawText,
  error: { code: 'json_parse_failed', message: 'Unexpected end of JSON input' } });
const auditPass = json({ pass: true, concerns: [] });
const auditFail = json({ pass: false,
  concerns: [{ kind: 'unsupported_past_observation' }] });

function provider(script) {
  const calls = [];
  const runner = createLlmRoleRunnerAdapter({ execute: async (call) => {
    calls.push({ role_id: call.roleId,
      user: JSON.parse(call.messages[1].content) });
    const next = script[calls.length - 1];
    assert.ok(next, `unexpected provider call ${calls.length}: ${call.roleId}`);
    assert.equal(call.roleId, next.role);
    return next.result;
  } });
  return { calls, model: createLowerDvinaTraceNpcSemanticModel({
    roleRunner: runner }) };
}

function decide({ input, boundary }, model) {
  return requestNpcSemanticDecision({ boundary, request: input,
    semanticModel: model, validateFreshPlan: model.validateFreshPlan,
    revalidateStateVersion: async () => input.state_version });
}

const rejection = (promise) => promise.then(
  () => assert.fail('NPC decision unexpectedly succeeded'), (error) => error);

test('the raw model object reaches the repair unchanged', async () => {
  const fixture = request();
  const raw = plan(fixture.input, 'Переправа открыта.');
  raw.speech.claims = [{ claim_id: 'crossing',
    content_summary: 'Переправа открыта.', form: 'assertion',
    speaker_posture: 'believed_true',
    source_knowledge_refs: [ref('known_fact', 'nonexistent')],
    mentioned_entity_refs: [], confidence: 'high' }];
  const { calls, model } = provider([
    { role: RESPONDER, result: json(raw) },
    { role: REPAIR, result: json(plan(fixture.input, 'Не знаю, открыта ли.')) },
    { role: AUDITOR, result: auditPass }
  ]);
  const result = await decide(fixture, model);
  assert.equal(result.status, 'planned');
  assert.deepEqual(calls[1].user.original_output, raw);
  assert.ok(calls[1].user.validation_errors.some(({ category }) =>
    category === 'semantic_grounding'));
});

test('unparsed model text reaches the format repair byte for byte', async () => {
  const fixture = request();
  const rawText = 'Мастер хмурится. {"speech": {"utterance_text": "двoр"';
  const { calls, model } = provider([
    { role: RESPONDER, result: unparsed(rawText) },
    { role: REPAIR, result: json(plan(fixture.input)) },
    { role: AUDITOR, result: auditPass }
  ]);
  const result = await decide(fixture, model);
  assert.equal(result.status, 'planned');
  assert.equal(calls[1].user.original_output_text, rawText);
  assert.equal(Object.hasOwn(calls[1].user, 'original_output'), false);
  assert.deepEqual(calls[1].user.validation_errors.map(({ code, category }) =>
    ({ code, category })), [{ code: 'json_parse_failed', category: 'format' }]);
});

test('a semantic repair that changes the act, addressee or intent fails as semantic',
  async (t) => {
    const changes = {
      dominant_act: (value) => { value.speech.dominant_act = 'question'; },
      contribution_kind: (value) => {
        value.contribution_kind = 'silence';
        value.speech = null;
      },
      primary_addressee_ref: (value) => {
        value.primary_addressee_ref = ref('npc', 'npc-1');
      },
      intended_addressee_refs: (value) => {
        value.intended_addressee_refs.push(ref('npc', 'npc-1'));
      },
      intent: (value) => { value.interpretation.intent = 'уйти от ответа'; }
    };
    for (const [name, change] of Object.entries(changes)) {
      await t.test(name, async () => {
        const fixture = request();
        const repaired = plan(fixture.input, 'Про лодку не скажу.');
        change(repaired);
        const { calls, model } = provider([
          { role: RESPONDER,
            result: json(plan(fixture.input, 'Вчера я видел лодку у берега.')) },
          { role: AUDITOR, result: auditFail },
          { role: REPAIR, result: json(repaired) }
        ]);
        const error = await rejection(decide(fixture, model));
        assert.equal(error.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
        assert.equal(error.details.category, 'semantic');
        assert.deepEqual(error.details.repair_kinds_used, ['semantic']);
        assert.equal(calls.length, 3);
      });
    }
  });

test('a format repair may turn an invalid act into the act it names', async () => {
  const fixture = request();
  const invalid = plan(fixture.input);
  invalid.speech.dominant_act = 'reply';
  const { calls, model } = provider([
    { role: RESPONDER, result: json(invalid) },
    { role: REPAIR, result: json(plan(fixture.input)) },
    { role: AUDITOR, result: auditPass }
  ]);
  const result = await decide(fixture, model);
  assert.equal(result.status, 'planned');
  assert.equal(result.plan.speech.dominant_act, 'answer');
  assert.deepEqual(calls[1].user.original_output, invalid);
});

test('the repair call takes its kind from the decision loop', async (t) => {
  const cases = [['semantic', 'semantic_consistency', 'semantic'],
    ['format', 'semantic_grounding', 'format'], [undefined, 'semantic_grounding', 'format']];
  for (const [given, category, kind] of cases) {
    await t.test(String(given), async () => {
      const fixture = request();
      const original = plan(fixture.input, 'Вчера я видел лодку у берега.');
      const repaired = plan(fixture.input, 'Про лодку не скажу.');
      repaired.speech.dominant_act = 'refuse';
      const inputs = [];
      const model = createLowerDvinaTraceNpcSemanticModel({ roleRunner: {
        async run(input) {
          inputs.push(input);
          return { output: repaired };
        } } });
      const outcome = await model(fixture.input, { repair: { ...(given ? { kind: given } : {}),
        original_output: original, validation_errors: [{ code: 'x', category, path: '$.speech.dominant_act' }] } })
        .then((value) => value, (error) => error);
      assert.equal(inputs[0].repair_kind, kind);
      assert.equal(Object.hasOwn(JSON.parse(inputs[0].messages[1].content), 'kind'), false);
      if (kind === 'semantic') {
        assert.equal(outcome.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
        assert.equal(outcome.details.category, 'semantic');
      } else {
        assert.equal(outcome.speech.dominant_act, 'refuse');
      }
    });
  }
  await t.test('first answer', async () => {
    const fixture = request();
    const inputs = [];
    const model = createLowerDvinaTraceNpcSemanticModel({ roleRunner: {
      async run(input) {
        inputs.push(input);
        return { output: plan(fixture.input) };
      } } });
    await model(fixture.input, {});
    assert.equal(Object.hasOwn(inputs[0], 'repair_kind'), false);
  });
});

test('a repair that declares itself unrepairable fails with its own kind',
  async (t) => {
    await t.test('semantic', async () => {
      const fixture = request();
      const { model } = provider([
        { role: RESPONDER,
          result: json(plan(fixture.input, 'Вчера я видел лодку у берега.')) },
        { role: AUDITOR, result: auditFail },
        { role: REPAIR, result: json({ status: 'unrepairable' }) }
      ]);
      const error = await rejection(decide(fixture, model));
      assert.equal(error.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
      assert.equal(error.details.category, 'semantic');
    });
    await t.test('format', async () => {
      const fixture = request();
      const { model } = provider([
        { role: RESPONDER, result: unparsed('не JSON') },
        { role: REPAIR, result: json({ status: 'unrepairable' }) }
      ]);
      const error = await rejection(decide(fixture, model));
      assert.equal(error.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
      assert.equal(error.details.category, 'format');
    });
  });
