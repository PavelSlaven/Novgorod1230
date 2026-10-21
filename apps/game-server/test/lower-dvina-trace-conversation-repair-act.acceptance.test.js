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

function claim(posture, id, source_knowledge_refs = []) {
  return { claim_id: id, content_summary: 'Я не уверен.', form: 'assertion',
    speaker_posture: posture, source_knowledge_refs,
    mentioned_entity_refs: [] };
}

function nonSpeechPlan(input, contribution_kind) {
  const value = plan(input);
  value.contribution_kind = contribution_kind;
  value.speech = null;
  return value;
}

const json = (value) => ({ status: 'ok', parsed_json: value,
  raw_text: JSON.stringify(value) });
const unparsed = (raw_text) => ({ status: 'parse_error', raw_text,
  error: { code: 'json_parse_failed', message: 'Invalid JSON' } });

function provider(input, { initial = plan(input), repair = plan(input),
  auditor = { pass: true, concerns: [] } } = {}) {
  const calls = [];
  const providerCalls = [];
  const counts = new Map();
  const adapter = createLlmRoleRunnerAdapter({ execute: async (call) => {
    providerCalls.push({ role_id: call.roleId,
      system: call.messages[0].content });
    const index = counts.get(call.roleId) ?? 0;
    counts.set(call.roleId, index + 1);
    if (call.roleId === AUDITOR) return json(index === 0 ? auditor
      : { pass: true, concerns: [] });
    if (call.roleId === REPAIR) return json(index === 0 ? repair : plan(input));
    if (call.roleId === RESPONDER) {
      const result = index === 0 ? initial : plan(input);
      return result?.status === 'parse_error' ? result : json(result);
    }
    assert.fail(`unexpected provider role: ${call.roleId}`);
  } });
  const roleRunner = { async run(call) {
    calls.push({ role_id: call.role_id, repair_kind: call.repair_kind,
      user: JSON.parse(call.messages[1].content) });
    return adapter.run(call);
  } };
  return { calls, providerCalls,
    model: createLowerDvinaTraceNpcSemanticModel({ roleRunner }) };
}

function decide({ input, boundary }, model) {
  return requestNpcSemanticDecision({ boundary, request: input,
    semanticModel: model, validateFreshPlan: model.validateFreshPlan,
    revalidateStateVersion: async () => input.state_version });
}

const rejection = (promise) => promise.then(
  () => assert.fail('NPC decision unexpectedly succeeded'), (error) => error);

async function capturedCycleRequest() {
  const fixture = request();
  const { model } = provider(fixture.input);
  let captured;
  const wrapped = async (input, context) => {
    captured ??= input;
    return model(input, context);
  };
  wrapped.originalOutputOf = model.originalOutputOf;
  wrapped.validateFreshPlan = model.validateFreshPlan;
  const result = await decide(fixture, wrapped);
  assert.equal(result.status, 'planned');
  assert.ok(captured);
  return captured;
}

test('uncertain source-free claims reach the auditor', async (t) => {
  const cited = subject.knowledge_refs[0];
  const cases = [
    ['one uncertain claim', [claim('uncertain', 'one')]],
    ['two uncertain claims', [claim('uncertain', 'one'), claim('uncertain', 'two')]],
    ['uncertain claim beside a cited claim', [claim('uncertain', 'one'),
      claim('believed_true', 'two', [cited])]]
  ];
  for (const [name, claims] of cases) {
    await t.test(name, async () => {
      const { input } = request();
      const value = plan(input);
      value.speech.claims = claims;
      const { calls, model } = provider(input);
      const result = await model.validateFreshPlan(value, input);
      assert.equal(result, true);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].role_id, AUDITOR);
      assert.ok(calls[0].user.plan.speech.claims.some(({ speaker_posture,
        source_knowledge_refs }) => speaker_posture === 'uncertain'
          && source_knowledge_refs.length === 0));
    });
  }
  await t.test('auditor may reject uncertain claim', async () => {
    const { input } = request();
    const value = plan(input);
    value.speech.claims = [claim('uncertain', 'one')];
    const { calls, model } = provider(input, { auditor: { pass: false,
      concerns: [{ kind: 'auditor_concern', path: '$.speech.claims[0].content_summary',
        quote: 'Я не уверен' }] } });
    const result = await model.validateFreshPlan(value, input);
    assert.equal(result.pass, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].role_id, AUDITOR);
    assert.deepEqual(result.errors[0].concern_kinds, ['auditor_concern']);
    assert.equal(result.errors.some(({ concern_kinds }) =>
      concern_kinds.includes('claim_without_source_knowledge')), false);
  });
  await t.test('decision loop plans after auditor pass', async () => {
    const fixture = request();
    const first = plan(fixture.input);
    first.speech.claims = [claim('uncertain', 'one')];
    const { calls, model } = provider(fixture.input, { initial: first });
    const result = await decide(fixture, model);
    assert.equal(result.status, 'planned');
    assert.deepEqual(calls.map(({ role_id }) => role_id), [RESPONDER, AUDITOR]);
    assert.equal(calls[1].user.plan.speech.claims[0].speaker_posture,
      'uncertain');
  });
});

test('other source-free postures fail before the auditor', async (t) => {
  const cases = ['believed_true', 'knowingly_false', 'mixed', 'withheld'];
  for (const posture of cases) {
    await t.test(posture, async () => {
      const { input } = request();
      const value = plan(input);
      value.speech.claims = [claim(posture, 'one')];
      const { calls, model } = provider(input);
      const result = await model.validateFreshPlan(value, input);
      assert.deepEqual(result.errors[0].concern_kinds,
        ['claim_without_source_knowledge']);
      assert.equal(calls.length, 0);
    });
  }
  await t.test('uncertain beside source-free believed_true', async () => {
    const { input } = request();
    const value = plan(input);
    value.speech.claims = [claim('uncertain', 'one'),
      claim('believed_true', 'two')];
    const { calls, model } = provider(input);
    const result = await model.validateFreshPlan(value, input);
    assert.deepEqual(result.errors[0].concern_kinds,
      ['claim_without_source_knowledge']);
    assert.equal(calls.length, 0);
  });
});

test('format repair rejects changes to act paths absent from form errors',
  async (t) => {
    const changes = [
      ['$.contribution_kind', (input, original, repaired) => {
        original.contribution_kind = 'silence';
        original.speech = null;
        repaired.contribution_kind = 'leave_conversation';
        repaired.speech = null;
      }],
      ['$.speech.dominant_act', (input, original, repaired) => {
        repaired.speech.dominant_act = 'question';
      }],
      ['$.primary_addressee_ref', (input, original, repaired) => {
        repaired.primary_addressee_ref = null;
      }],
      ['$.intended_addressee_refs', (input, original, repaired) => {
        repaired.intended_addressee_refs.push(ref('npc', 'npc-1'));
      }],
      ['$.interpretation.intent', (input, original, repaired) => {
        repaired.interpretation.intent = 'спросить';
      }]
    ];
    for (const [path, change] of changes) {
      await t.test(path, async () => {
        const fixture = request();
        const original = plan(fixture.input);
        const repaired = plan(fixture.input);
        change(fixture.input, original, repaired);
        original.interpretation.adaptation = 'not_allowed';
        const { calls, model } = provider(fixture.input,
          { initial: original, repair: repaired });
        const error = await rejection(decide(fixture, model));
        assert.equal(error.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
        assert.equal(error.details.category, 'semantic');
        assert.deepEqual(error.details.repair_kinds_used, ['format']);
        assert.deepEqual(error.details.validation_errors.map(
          ({ code, category, path: errorPath }) => ({ code, category,
            path: errorPath })), [{ code: 'format_repair_changed_act',
          category: 'semantic_grounding', path }]);
        assert.ok(calls[1].user.validation_errors.some(({ path: errorPath }) =>
          errorPath === '$.interpretation.adaptation'));
        assert.equal(calls.filter(({ role_id }) => role_id === AUDITOR).length, 0);
      });
    }
    await t.test('two changed paths retain ACT_PATHS order', async () => {
      const fixture = request();
      const original = plan(fixture.input);
      original.interpretation.adaptation = 'not_allowed';
      const repaired = plan(fixture.input);
      repaired.speech.dominant_act = 'question';
      repaired.interpretation.intent = 'спросить';
      const { calls, model } = provider(fixture.input,
        { initial: original, repair: repaired });
      const error = await rejection(decide(fixture, model));
      assert.equal(error.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
      assert.equal(error.details.category, 'semantic');
      assert.deepEqual(error.details.repair_kinds_used, ['format']);
      assert.deepEqual(error.details.validation_errors.map(
        ({ code, category, path }) => ({ code, category, path })), [
        { code: 'format_repair_changed_act', category: 'semantic_grounding',
          path: '$.speech.dominant_act' },
        { code: 'format_repair_changed_act', category: 'semantic_grounding',
          path: '$.interpretation.intent' }
      ]);
      assert.equal(calls.filter(({ role_id }) => role_id === AUDITOR).length, 0);
    });
  });

test('format repair may change only act paths named by form errors', async (t) => {
  const cases = [
    ['equal contribution kind', (value) => {
      value.contribution_kind = 'not_allowed';
    }, '$.contribution_kind'],
    ['indexed child of intended addressees', (value) => {
      value.intended_addressee_refs = [{ entity_kind: 'npc' }];
    }, '$.intended_addressee_refs[0]'],
    ['interpretation ancestor', (value) => {
      value.interpretation = null;
    }, '$.interpretation'],
    ['speech ancestor', (value) => {
      value.speech = null;
    }, '$.speech']
  ];
  for (const [name, breakForm, errorPath] of cases) {
    await t.test(name, async () => {
      const fixture = request();
      const original = plan(fixture.input);
      const repaired = plan(fixture.input);
      breakForm(original);
      if (errorPath !== '$.contribution_kind') {
        original.supporting_operations = [{ op: 'emit_interaction' }];
        repaired.supporting_operations = [{ op: 'emit_interaction' }];
      }
      const { calls, model } = provider(fixture.input,
        { initial: original, repair: repaired });
      const result = await decide(fixture, model);
      assert.equal(result.status, 'planned');
      assert.equal(calls[1].role_id, REPAIR);
      assert.ok(calls[1].user.validation_errors.some(({ path }) =>
        path === errorPath));
      assert.deepEqual(calls.map(({ role_id }) => role_id),
        [RESPONDER, REPAIR, AUDITOR]);
    });
  }
});

test('root error does not authorize an act change; non-object originals skip comparison',
  async (t) => {
    const input = await capturedCycleRequest();
    await t.test('root path', async () => {
      const original = nonSpeechPlan(input, 'silence');
      const repaired = nonSpeechPlan(input, 'leave_conversation');
      const { model } = provider(input, { repair: repaired });
      const error = await rejection(model(input, { repair: {
        original_output: original,
        validation_errors: [{ code: 'conversation_plan_not_object',
          category: 'format', path: '$', message: 'Response must be an object.' }]
      } }));
      assert.equal(error.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
      assert.equal(error.status, 503);
      assert.equal(error.details.category, 'semantic');
      assert.deepEqual(error.details.validation_errors.map(
        ({ code, category, path }) => ({ code, category, path })), [
        { code: 'format_repair_changed_act', category: 'semantic_grounding',
          path: '$.contribution_kind' }
      ]);
    });
    for (const original_output of [[], null]) {
      await t.test(`original_output ${JSON.stringify(original_output)}`,
        async () => {
          const repaired = plan(input);
          const { calls, model } = provider(input, { repair: repaired });
          const result = await model(input, { repair: { original_output,
            validation_errors: [{ code: 'conversation_plan_not_object',
              category: 'format', path: '$',
              message: 'Response must be an object.' }] } });
          assert.equal(result.contribution_kind, 'speech');
          assert.equal(calls.length, 1);
          assert.equal(calls[0].role_id, REPAIR);
        });
    }
  });

test('unparsed first answer permits a format repair with another act', async () => {
  const fixture = request();
  const repaired = plan(fixture.input, 'Ответить ли?');
  repaired.speech.dominant_act = 'question';
  const { calls, model } = provider(fixture.input,
    { initial: unparsed('не JSON'), repair: repaired });
  const result = await decide(fixture, model);
  assert.equal(result.status, 'planned');
  assert.equal(calls[1].user.original_output_text, 'не JSON');
  assert.equal(Object.hasOwn(calls[1].user, 'original_output'), false);
  assert.deepEqual(calls.map(({ role_id }) => role_id),
    [RESPONDER, REPAIR, AUDITOR]);
});

test('responder system prompts never offer unrepairable', async (t) => {
  await t.test('first answer', async () => {
    const fixture = request();
    const { calls, providerCalls, model } = provider(fixture.input);
    const result = await decide(fixture, model);
    assert.equal(result.status, 'planned');
    assert.equal(calls[0].role_id, RESPONDER);
    assert.equal(providerCalls[0].role_id, RESPONDER);
    assert.equal(/unrepairable/iu.test(providerCalls[0].system), false);
  });
  await t.test('format repair', async () => {
    const fixture = request();
    const original = plan(fixture.input);
    original.interpretation.adaptation = 'not_allowed';
    const { calls, providerCalls, model } = provider(fixture.input,
      { initial: original });
    const result = await decide(fixture, model);
    assert.equal(result.status, 'planned');
    assert.equal(calls[1].role_id, REPAIR);
    assert.equal(calls[1].repair_kind, 'format');
    assert.equal(providerCalls[1].role_id, REPAIR);
    assert.equal(/unrepairable/iu.test(providerCalls[1].system), false);
  });
  await t.test('semantic repair', async () => {
    const fixture = request();
    const { calls, providerCalls, model } = provider(fixture.input,
      { repair: plan(fixture.input, 'Я не знаю.'),
        auditor: { pass: false,
          concerns: [{ kind: 'unsupported_assertion', path: '$.speech.utterance_text',
            quote: 'Я отвечу' }] } });
    const result = await decide(fixture, model);
    assert.equal(result.status, 'planned');
    const repairCall = calls.find(({ role_id }) => role_id === REPAIR);
    assert.equal(repairCall.role_id, REPAIR);
    assert.equal(repairCall.repair_kind, 'semantic');
    const providerRepairCall = providerCalls.find(({ role_id }) =>
      role_id === REPAIR);
    assert.equal(providerRepairCall.role_id, REPAIR);
    assert.equal(/unrepairable/iu.test(providerRepairCall.system), false);
  });
});
