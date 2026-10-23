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
  concerns: [{ kind: 'unsupported_past_observation',
    path: '$.speech.utterance_text', quote: 'Вчера я видел лодку у берега' }] });

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

function claim(content, sources, claimId = 'claim-1') {
  return { claim_id: claimId, content_summary: content, form: 'assertion',
    speaker_posture: 'believed_true', source_knowledge_refs: sources,
    mentioned_entity_refs: [] };
}

async function quoteGuardFailure({ original, repaired, concerns, expected = concerns,
  allowedRefs = [] }) {
  const fixture = request();
  fixture.input.allowed_references.knowledge_refs.push(...allowedRefs);
  fixture.input.allowed_references.knowledge_refs.sort((left, right) => {
    const leftKey = `${left.entity_kind}\u0000${left.entity_id}`;
    const rightKey = `${right.entity_kind}\u0000${right.entity_id}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  const { calls, model } = provider([
    { role: RESPONDER, result: json(original) },
    { role: AUDITOR, result: json({ pass: false, concerns }) },
    { role: REPAIR, result: json(repaired) }
  ]);
  const error = await rejection(decide(fixture, model));
  assert.equal(error.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
  assert.equal(error.details.category, 'semantic');
  assert.deepEqual(error.details.validation_errors.map(({ code, path, quote }) =>
    ({ code, path, quote })), expected.map(({ path, quote }) => ({
    code: 'semantic_repair_unresolved_quote', path, quote
  })));
  assert.deepEqual(calls.map(({ role_id }) => role_id),
    [RESPONDER, AUDITOR, REPAIR]);
  return { calls, error };
}

test('semantic repair quote guard matches NFC and Unicode whitespace', async (t) => {
  for (const { name, originalText, quote, repairedText } of [
    { name: 'NFC', originalText: 'Я видел ле\u0308д у берега.',
      quote: 'видел ле\u0308д у берега', repairedText: 'Я видел лёд у берега.' },
    { name: 'Unicode whitespace',
      originalText: 'Я видел\u00a0лёд\u2003у берега.',
      quote: 'видел\u00a0лёд\u2003у берега',
      repairedText: 'Я видел\u00a0\u2003лёд\u00a0у\u2003берега.' }
  ]) {
    await t.test(name, async () => {
      const fixture = request();
      await quoteGuardFailure({
        original: plan(fixture.input, originalText),
        repaired: plan(fixture.input, repairedText),
        concerns: [{ kind: 'unsupported_past_observation',
          path: '$.speech.utterance_text', quote }]
      });
    });
  }
});

test('semantic repair quote guard requires a new source on the cited claim', async (t) => {
  const oldRef = ref('known_fact', 'old-fact');
  const newRef = ref('known_fact', 'new-fact');
  const quote = 'Лодка у берега';
  const path = '$.speech.claims[0]';
  for (const { name, change } of [
    { name: 'old source and hidden edits', change: (repaired) => {
      repaired.speech.claims[0].content_summary = 'У берега стоит лодка.';
      repaired.speech.claims[0].form = 'question';
      repaired.speech.claims[0].speaker_posture = 'uncertain';
    } },
    { name: 'new source belongs to another claim', change: (repaired) => {
      repaired.speech.claims[1].source_knowledge_refs.push(newRef);
    } }
  ]) {
    await t.test(name, async () => {
      const fixture = request();
      const original = plan(fixture.input, `${quote}. Вода холодна.`);
      original.speech.claims = [claim(quote, [oldRef]),
        claim('Вода холодна', [oldRef], 'claim-2')];
      const repaired = structuredClone(original);
      change(repaired);
      await quoteGuardFailure({ original, repaired,
        concerns: [{ kind: 'unsupported_assertion', path, quote }],
        allowedRefs: [oldRef, newRef] });
    });
  }
});

test('semantic repair uses the recovered exact quote location', async () => {
  const fixture = request();
  const quote = '\u041b\u043e\u0434\u043a\u0430 \u0443 \u0431\u0435\u0440\u0435\u0433\u0430';
  const original = plan(fixture.input, quote + '.');
  const repaired = plan(fixture.input, '\u041d\u0435 \u0437\u043d\u0430\u044e.');
  const { calls, model } = provider([
    { role: RESPONDER, result: json(original) },
    { role: AUDITOR, result: json({ pass: false, concerns: [{
      kind: 'unsupported_assertion', path: '$.speech.claims[2]', quote
    }] }) },
    { role: REPAIR, result: json(repaired) },
    { role: AUDITOR, result: auditPass }
  ]);
  const result = await decide(fixture, model);
  assert.equal(result.status, 'planned');
  assert.deepEqual(calls.map(({ role_id }) => role_id),
    [RESPONDER, AUDITOR, REPAIR, AUDITOR]);
  assert.deepEqual(calls[2].user.validation_errors.map(
    ({ code, path, quote: errorQuote }) => ({ code, path, quote: errorQuote })), [{
    code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED',
    path: '$.speech.utterance_text', quote
  }]);
  const actAnchors = value => ({
    contribution_kind: value.contribution_kind,
    primary_addressee_ref: value.primary_addressee_ref,
    intended_addressee_refs: value.intended_addressee_refs,
    dominant_act: value.speech?.dominant_act,
    intent: value.interpretation?.intent
  });
  assert.deepEqual(actAnchors(repaired), actAnchors(original));
  assert.deepEqual(actAnchors(result.plan), actAnchors(original));
  assert.equal(result.plan.speech.utterance_text, '\u041d\u0435 \u0437\u043d\u0430\u044e.');
});

test('quote recovery fails closed for absent and ambiguous locations before repair',
  async (t) => {
    for (const scenario of [
      { name: 'absent quote', utterance: '\u041d\u0435 \u0437\u043d\u0430\u044e.',
        quote: '\u0412\u0447\u0435\u0440\u0430 \u0432\u0438\u0434\u0435\u043b \u043b\u043e\u0434\u043a\u0443', claims: [] },
      { name: 'ambiguous quote', utterance: '\u041b\u043e\u0434\u043a\u0430 \u0443 \u0431\u0435\u0440\u0435\u0433\u0430.',
        quote: '\u041b\u043e\u0434\u043a\u0430 \u0443 \u0431\u0435\u0440\u0435\u0433\u0430',
        claims: [{ ...claim('\u041b\u043e\u0434\u043a\u0430 \u0443 \u0431\u0435\u0440\u0435\u0433\u0430', []),
          speaker_posture: 'uncertain' }] }
    ]) {
      await t.test(scenario.name, async () => {
        const fixture = request();
        const original = plan(fixture.input, scenario.utterance);
        original.speech.claims = scenario.claims;
        const { calls, model } = provider([
          { role: RESPONDER, result: json(original) },
          { role: AUDITOR, result: json({ pass: false, concerns: [{
            kind: 'unsupported_assertion', path: '$.speech.claims[2]',
            quote: scenario.quote
          }] }) }
        ]);
        const error = await rejection(decide(fixture, model));
        assert.equal(error.code, 'TRACE_NPC_SPEECH_GROUNDING_AUDIT_INVALID');
        assert.equal(error.status, 503);
        assert.deepEqual(calls.map(({ role_id }) => role_id),
          [RESPONDER, AUDITOR]);
      });
    }
  });

test('semantic repair quote guard checks every rejected quote', async (t) => {
  const oldRef = ref('known_fact', 'old-fact');
  const newRef = ref('known_fact', 'new-fact');
  const fixture = request();
  const original = plan(fixture.input, 'Лодка у берега. Лёд на реке.');
  original.speech.claims = [claim('Лодка у берега', [oldRef]),
    claim('Лёд на реке', [oldRef], 'claim-2')];
  const concerns = [
    { kind: 'unsupported_assertion', path: '$.speech.claims[0]',
      quote: 'Лодка у берега' },
    { kind: 'unsupported_assertion', path: '$.speech.claims[1]',
      quote: 'Лёд на реке' }
  ];
  await t.test('one source added and one quote unresolved', async () => {
    const repaired = structuredClone(original);
    repaired.speech.claims[0].source_knowledge_refs.push(newRef);
    await quoteGuardFailure({ original, repaired, concerns,
      expected: [concerns[1]], allowedRefs: [oldRef, newRef] });
  });
  await t.test('both quotes unresolved', async () => {
    await quoteGuardFailure({ original, repaired: structuredClone(original),
      concerns, allowedRefs: [oldRef, newRef] });
  });
});

test('semantic repair quote guard precedes diagnosis of a new disallowed source',
  async () => {
    const oldRef = ref('known_fact', 'old-fact');
    const disallowedRef = ref('known_fact', 'disallowed-fact');
    const fixture = request();
    const original = plan(fixture.input, 'Лодка у берега.');
    original.speech.claims = [claim('Лодка у берега', [oldRef])];
    const repaired = structuredClone(original);
    repaired.speech.claims[0].source_knowledge_refs.push(disallowedRef);
    const { error } = await quoteGuardFailure({ original, repaired,
      concerns: [{ kind: 'unsupported_assertion', path: '$.speech.claims[0]',
        quote: 'Лодка у берега' }], allowedRefs: [oldRef] });
    assert.equal(error.details.validation_errors.length, 1);
  });

test('semantic repair quote guard ignores a quote absent from the original speech',
  async () => {
    const fixture = request();
    const original = plan(fixture.input, 'Лодка у берега.');
    original.speech.claims = [claim('Волк у леса', [], 'hidden-claim')];
    original.speech.claims[0].speaker_posture = 'uncertain';
    const repaired = structuredClone(original);
    const { calls, model } = provider([
      { role: RESPONDER, result: json(original) },
      { role: AUDITOR, result: json({ pass: false,
        concerns: [{ kind: 'unsupported_assertion',
          path: '$.speech.claims[0].content_summary', quote: 'Волк у леса' }] }) },
      { role: REPAIR, result: json(repaired) },
      { role: AUDITOR, result: auditPass }
    ]);
    const result = await decide(fixture, model);
    assert.equal(result.status, 'planned');
    assert.deepEqual(calls.map(({ role_id }) => role_id),
      [RESPONDER, AUDITOR, REPAIR, AUDITOR]);
    assert.equal(calls[3].user.plan.speech.utterance_text,
      repaired.speech.utterance_text);
  });

test('semantic repair quote guard lets the auditor decide a new allowed source',
  async (t) => {
    for (const accepted of [false, true]) {
      await t.test(`audit pass:${accepted}`, async () => {
        const fixture = request();
        const oldRef = ref('known_fact', 'old-fact');
        const newRef = ref('known_fact', 'new-fact');
        fixture.input.allowed_references.knowledge_refs.push(oldRef, newRef);
        fixture.input.allowed_references.knowledge_refs.sort((left, right) => {
          const leftKey = `${left.entity_kind}\u0000${left.entity_id}`;
          const rightKey = `${right.entity_kind}\u0000${right.entity_id}`;
          return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
        });
        const quote = 'Лодка у берега';
        const path = '$.speech.claims[0]';
        const original = plan(fixture.input, `${quote}.`);
        original.speech.claims = [claim(quote, [oldRef])];
        const repaired = structuredClone(original);
        repaired.speech.claims[0].source_knowledge_refs.push(newRef);
        const firstAudit = { pass: false, concerns: [
          { kind: 'unsupported_assertion', path, quote }] };
        const secondAudit = accepted ? auditPass : json(firstAudit);
        const { calls, model } = provider([
          { role: RESPONDER, result: json(original) },
          { role: AUDITOR, result: json(firstAudit) },
          { role: REPAIR, result: json(repaired) },
          { role: AUDITOR, result: secondAudit }
        ]);
        const outcome = await decide(fixture, model).then((value) => value,
          (error) => error);
        assert.deepEqual(calls.map(({ role_id }) => role_id),
          [RESPONDER, AUDITOR, REPAIR, AUDITOR]);
        assert.deepEqual(calls[3].user.plan.speech.claims[0]
          .source_knowledge_refs, [oldRef, newRef]);
        if (accepted) {
          assert.equal(outcome.status, 'planned');
          assert.equal(outcome.plan.speech.utterance_text,
            repaired.speech.utterance_text);
        } else {
          assert.equal(outcome.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
          assert.equal(outcome.details.category, 'semantic');
          assert.deepEqual(outcome.details.validation_errors.map(
            ({ code, path: errorPath, quote: errorQuote }) =>
              ({ code, path: errorPath, quote: errorQuote })), [{
            code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED', path, quote
          }]);
        }
      });
    }
  });

test('a new claim can support a retained quote at the speech path', async (t) => {
  for (const accepted of [false, true]) {
    await t.test(`second audit pass:${accepted}`, async () => {
      const fixture = request();
      const newRef = ref('known_fact', 'new-fact');
      fixture.input.allowed_references.knowledge_refs.push(newRef);
      fixture.input.allowed_references.knowledge_refs.sort((left, right) =>
        `${left.entity_kind}\u0000${left.entity_id}`.localeCompare(
          `${right.entity_kind}\u0000${right.entity_id}`));
      const quote = 'Не знаю.';
      const original = plan(fixture.input, quote);
      const repaired = structuredClone(original);
      repaired.speech.claims = [claim(quote, [newRef])];
      repaired.speech.claims[0].speaker_posture = 'knowingly_false';
      const firstConcern = { kind: 'unsupported_assertion',
        path: '$.speech.utterance_text', quote };
      const secondConcern = { kind: 'unsupported_assertion',
        path: '$.speech.claims[0].content_summary', quote: 'знаю' };
      const { calls, model } = provider([
        { role: RESPONDER, result: json(original) },
        { role: AUDITOR, result: json({ pass: false, concerns: [firstConcern] }) },
        { role: REPAIR, result: json(repaired) },
        { role: AUDITOR, result: accepted ? auditPass
          : json({ pass: false, concerns: [secondConcern] }) }
      ]);
      const outcome = await decide(fixture, model).then((value) => value,
        (error) => error);
      assert.deepEqual(calls.map(({ role_id }) => role_id),
        [RESPONDER, AUDITOR, REPAIR, AUDITOR]);
      assert.deepEqual(calls[3].user.plan.speech.claims[0]
        .source_knowledge_refs, [newRef]);
      if (accepted) {
        assert.equal(outcome.status, 'planned');
      } else {
        assert.equal(outcome.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
        assert.equal(outcome.details.category, 'semantic');
        assert.deepEqual(outcome.details.validation_errors.map(
          ({ code, path, quote: errorQuote }) => ({ code, path,
            quote: errorQuote })), [{
          code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED',
          path: secondConcern.path, quote: secondConcern.quote
        }]);
      }
    });
  }
});

test('a source already present in another original claim is not new', async () => {
  const fixture = request();
  const existingRef = ref('known_fact', 'existing-fact');
  const quote = 'Лодка у берега';
  const original = plan(fixture.input, `${quote}.`);
  original.speech.claims = [claim('Иное сообщение', [existingRef])];
  const repaired = structuredClone(original);
  repaired.speech.claims.push(claim(quote, [existingRef], 'claim-2'));
  await quoteGuardFailure({ original, repaired,
    concerns: [{ kind: 'unsupported_assertion',
      path: '$.speech.utterance_text', quote }],
    allowedRefs: [existingRef] });
});

test('a missing cited claim can gain a source in another claim', async (t) => {
  const oldRef = ref('known_fact', 'old-fact');
  const newRef = ref('known_fact', 'new-fact');
  const quote = 'Лодка у берега';
  for (const { name, citedPath, originalClaims, repairedClaims } of [
    { name: 'claim index absent from both plans',
      citedPath: '$.speech.utterance_text', originalClaims: [],
      repairedClaims: [claim(quote, [newRef])] },
    { name: 'cited claim removed during repair',
      citedPath: '$.speech.claims[1]',
      originalClaims: [claim('Иное сообщение', [oldRef]),
        claim(quote, [oldRef], 'claim-2')],
      repairedClaims: [claim(quote, [newRef])] }
  ]) {
    await t.test(name, async () => {
      const fixture = request();
      fixture.input.allowed_references.knowledge_refs.push(oldRef, newRef);
      fixture.input.allowed_references.knowledge_refs.sort((left, right) =>
        `${left.entity_kind}\u0000${left.entity_id}`.localeCompare(
          `${right.entity_kind}\u0000${right.entity_id}`));
      const original = plan(fixture.input, `${quote}.`);
      original.speech.claims = originalClaims;
      const repaired = structuredClone(original);
      repaired.speech.claims = repairedClaims;
      const { calls, model } = provider([
        { role: RESPONDER, result: json(original) },
        { role: AUDITOR, result: json({ pass: false, concerns: [
          { kind: 'unsupported_assertion', path: citedPath, quote }] }) },
        { role: REPAIR, result: json(repaired) },
        { role: AUDITOR, result: auditPass }
      ]);
      const result = await decide(fixture, model).then((value) => value,
        (error) => error);
      assert.deepEqual(calls.map(({ role_id }) => role_id),
        [RESPONDER, AUDITOR, REPAIR, AUDITOR]);
      assert.equal(result.status, 'planned');
      assert.deepEqual(calls[3].user.plan.speech.claims[0]
        .source_knowledge_refs, [newRef]);
    });
  }
});

test('a hidden claim diagnostic does not guard the matching spoken text',
  async () => {
    const fixture = request();
    const quote = 'Лодка у берега.';
    const original = plan(fixture.input, quote);
    original.speech.claims = [claim(quote, [])];
    const repaired = structuredClone(original);
    repaired.speech.claims[0].speaker_posture = 'uncertain';
    const { calls, model } = provider([
      { role: RESPONDER, result: json(original) },
      { role: REPAIR, result: json(repaired) },
      { role: AUDITOR, result: auditPass }
    ]);
    const result = await decide(fixture, model).then((value) => value,
      (error) => error);
    assert.deepEqual(calls.map(({ role_id }) => role_id),
      [RESPONDER, REPAIR, AUDITOR]);
    assert.equal(result.status, 'planned');
    assert.deepEqual(calls[1].user.validation_errors.map(
      ({ concern_kinds, path, quote: errorQuote }) => ({ concern_kinds, path,
        quote: errorQuote })), [{
      concern_kinds: ['claim_without_source_knowledge'],
      path: '$.speech.claims[0].source_knowledge_refs', quote
    }]);
  });

test('model hidden-claim concerns on content_summary do not use the precheck bypass',
  async () => {
    const fixture = request();
    const oldRef = ref('known_fact', 'old-fact');
    fixture.input.allowed_references.knowledge_refs.push(oldRef);
    fixture.input.allowed_references.knowledge_refs.sort((left, right) =>
      (left.entity_kind + String.fromCharCode(0) + left.entity_id).localeCompare(
        right.entity_kind + String.fromCharCode(0) + right.entity_id));
    const quote = 'Лодка у берега';
    const original = plan(fixture.input, quote + '.');
    original.speech.claims = [claim(quote, [oldRef])];
    const repaired = structuredClone(original);
    const { calls, model } = provider([
      { role: RESPONDER, result: json(original) },
      { role: AUDITOR, result: json({ pass: false, concerns: [{
        kind: 'claim_without_source_knowledge',
        path: '$.speech.claims[0].content_summary', quote
      }] }) },
      { role: REPAIR, result: json(repaired) }
    ]);
    const outcome = await decide(fixture, model).then(value => value, error => error);
    assert.equal(outcome.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
    assert.equal(outcome.details.category, 'semantic');
    assert.deepEqual(outcome.details.validation_errors.map(({ code, path }) =>
      ({ code, path })), [{
      code: 'semantic_repair_unresolved_quote',
      path: '$.speech.claims[0].content_summary'
    }]);
    assert.deepEqual(calls.map(({ role_id }) => role_id),
      [RESPONDER, AUDITOR, REPAIR]);
  });

test('an auditor concern with the hidden claim kind still guards visible speech',
  async () => {
    const fixture = request();
    const quote = 'Лодка у берега';
    const original = plan(fixture.input, `${quote}.`);
    await quoteGuardFailure({ original, repaired: structuredClone(original),
      concerns: [{ kind: 'claim_without_source_knowledge',
        path: '$.speech.utterance_text', quote }] });
  });

test('only the exact hidden claim diagnostic bypasses quote guard', async (t) => {
  for (const { name, concernKinds, path } of [
    { name: 'additional concern kind',
      concernKinds: ['claim_without_source_knowledge', 'unsupported_assertion'],
      path: '$.speech.claims[0].source_knowledge_refs' },
    { name: 'source field suffix',
      concernKinds: ['claim_without_source_knowledge'],
      path: '$.speech.claims[0].source_knowledge_refs_extra' },
    { name: 'nested source field',
      concernKinds: ['claim_without_source_knowledge'],
      path: '$.speech.claims[0].source_knowledge_refs[0]' }
  ]) {
    await t.test(name, async () => {
      const fixture = request();
      const quote = 'Лодка у берега';
      const original = plan(fixture.input, `${quote}.`);
      const repaired = structuredClone(original);
      const { model } = provider([{ role: REPAIR, result: json(repaired) }]);
      const error = await rejection(model(fixture.input, { repair: {
        kind: 'semantic', original_output: original,
        validation_errors: [{ code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED',
          category: 'semantic_grounding', concern_kinds: concernKinds,
          path, quote }]
      } }));
      assert.equal(error.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
      assert.equal(error.details.category, 'semantic');
      assert.deepEqual(error.details.validation_errors.map(
        ({ code, path: errorPath, quote: errorQuote }) => ({ code,
          path: errorPath, quote: errorQuote })), [{
        code: 'semantic_repair_unresolved_quote', path, quote
      }]);
    });
  }
});

test('a malformed semantic repair reaches format repair before quote guard',
  async () => {
    const fixture = request();
    const quote = 'Лодка у берега';
    const original = plan(fixture.input, `${quote}.`);
    const repaired = structuredClone(original);
    repaired.speech.claims = null;
    const { calls, model } = provider([
      { role: RESPONDER, result: json(original) },
      { role: AUDITOR, result: json({ pass: false, concerns: [
        { kind: 'unsupported_assertion', path: '$.speech.utterance_text', quote }
      ] }) },
      { role: REPAIR, result: json(repaired) },
      { role: REPAIR, result: json({ status: 'unrepairable' }) }
    ]);
    const error = await rejection(decide(fixture, model));
    assert.equal(error.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE');
    assert.equal(error.details.category, 'format');
    assert.deepEqual(calls.map(({ role_id }) => role_id),
      [RESPONDER, AUDITOR, REPAIR, REPAIR]);
    assert.ok(calls[3].user.validation_errors.some(({ category, path }) =>
      category === 'format' && path === '$.speech.claims'));
    assert.equal(error.details.validation_errors.some(({ code }) =>
      code === 'semantic_repair_unresolved_quote'), false);
  });

test('quote guard compares the speech after mixed-script respelling', async () => {
  const fixture = request();
  const quote = 'Лодка у берега';
  const original = plan(fixture.input, `${quote}.`);
  const repaired = plan(fixture.input, 'Лoдка у берега.');
  await quoteGuardFailure({ original, repaired,
    concerns: [{ kind: 'unsupported_assertion',
      path: '$.speech.utterance_text', quote }] });
});
