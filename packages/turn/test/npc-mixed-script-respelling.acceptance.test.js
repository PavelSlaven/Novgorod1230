import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNpcDecisionBoundary, projectNpcConversationSubject } from '@rus/npc-runtime';
import { requestNpcSemanticDecision } from '../src/npc-semantic-decision.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const requestedAt = {
  whole_minutes: '10',
  subminute_numerator: '0',
  subminute_denominator: '1'
};

function boundary(overrides = {}) {
  return buildNpcDecisionBoundary({
    decision_mode: 'conversation',
    scheduled_at: requestedAt,
    npc_ref: ref('npc', 'speaker'),
    same_time_batch_ref: ref('temporal_batch', 'batch-1'),
    significance: 'material',
    categories: ['communication'],
    signal_refs: [ref('npc_decision_signal', 'signal-1')],
    state_version: '2',
    ...overrides
  });
}

function request(overrides = {}) {
  const subject = projectNpcConversationSubject({
    npc_ref: ref('npc', 'speaker'),
    npc_snapshot: { instance_id: 'speaker' },
    current_activity_snapshot: { status: 'idle', can_continue_automatically: false }
  });
  return {
    schema: 'npc_conversation_response_request_v1',
    request_id: 'request-1',
    boundary_id: 'npc-decision:conversation:batch-1:speaker',
    conversation_id: 'conversation-1',
    exchange_id: 'exchange-1',
    state_version: 2,
    requested_at: requestedAt,
    npc_ref: ref('npc', 'speaker'),
    decision_reasons: {
      significance: 'material',
      categories: ['communication'],
      signal_refs: [ref('npc_decision_signal', 'signal-1')],
      perceived_changes: ['Услышана реплика.']
    },
    npc: subject.npc,
    perceived_message: {
      source_statement_ref: ref('conversation_statement', 'statement-1'),
      perception_result_ref: ref('perception_result', 'perception-1')
    },
    public_conversation_history: [],
    knowledge: subject.knowledge,
    memory: subject.memory,
    social_context: {},
    available_resources: subject.available_resources,
    allowed_references: {
      actor_refs: [ref('npc', 'speaker'), ref('player_character', 'player')],
      entity_refs: [],
      knowledge_refs: subject.knowledge_refs,
      combat_target_refs: []
    },
    decision_scope: {
      conversation_mode: true,
      action_handoff_available: true,
      combat_handoff_available: false,
      allowed_attribute_refs: [],
      allowed_skill_refs: [],
      allowed_check_profile_refs: [],
      allowed_duration_classes: ['moment', 'brief', 'short', 'domain_owned'],
      operation_contract: {}
    },
    ...overrides
  };
}

function plan(sourceRequest = request()) {
  return {
    schema: 'conversation_contribution_plan_v1',
    request_id: sourceRequest.request_id,
    boundary_id: sourceRequest.boundary_id,
    conversation_id: sourceRequest.conversation_id,
    exchange_id: sourceRequest.exchange_id,
    state_version: sourceRequest.state_version,
    speaker_ref: sourceRequest.npc_ref,
    contribution_kind: 'speech',
    primary_addressee_ref: ref('player_character', 'player'),
    intended_addressee_refs: [ref('player_character', 'player')],
    affected_actor_refs: [],
    speech: {
      utterance_text: 'Я слышу.',
      dominant_act: 'answer',
      interaction_tags: [],
      topic_refs: [],
      claims: [],
      response_expectation: { kind: 'none', target_refs: [] }
    },
    interpretation: {
      intent: 'ответить',
      grounded_contribution: 'подтвердить, что реплика услышана',
      adaptation: 'literal'
    },
    resolution: 'automatic',
    activity: { duration_class: 'brief', effort: 'none' },
    supporting_operations: [],
    check: null,
    handoff: null,
    reason: 'Прямой ответ уместен.'
  };
}

function claim(content_summary, claim_id) {
  return {
    claim_id,
    content_summary,
    form: 'assertion',
    speaker_posture: 'believed_true',
    source_knowledge_refs: [],
    mentioned_entity_refs: []
  };
}

async function decide(outputs, options = {}) {
  const decisionRequest = request();
  const calls = [];
  const semanticModel = async (_source, context) => {
    calls.push(context);
    return structuredClone(outputs[Math.min(calls.length - 1, outputs.length - 1)]);
  };
  const result = await requestNpcSemanticDecision({
    boundary: boundary(), request: decisionRequest, semanticModel,
    revalidateStateVersion: async () => 2, ...options
  });
  return { result, calls };
}

test('R1: Latin lookalikes in ordinary speech are replaced without repair', async (t) => {
  for (const [before, after, wordBefore, wordAfter] of [
    ['Здpавствуй. Чего надо?', 'Здравствуй. Чего надо?', 'Здpавствуй', 'Здравствуй'],
    ['Бoжьим велением.', 'Божьим велением.', 'Бoжьим', 'Божьим'],
    ['Чего нaдо?', 'Чего надо?', 'нaдо', 'надо'],
    ['Bот изба.', 'Вот изба.', 'Bот', 'Вот']
  ]) {
    await t.test(before, async () => {
      const first = plan();
      first.speech.utterance_text = before;
      const corrected = plan();
      corrected.speech.utterance_text = after;
      const { result, calls } = await decide([first, corrected]);
      assert.equal(calls.length, 1);
      assert.equal(result.status, 'planned');
      assert.equal(result.plan.speech.utterance_text, after);
      assert.deepEqual(result.script_respellings, [{
        path: '$.speech.utterance_text', before: wordBefore, after: wordAfter
      }]);
    });
  }
});

test('R2: all 18 Latin code points use the closed lookalike table', async () => {
  const pairs = [
    ['a', 'а'], ['c', 'с'], ['e', 'е'], ['o', 'о'], ['p', 'р'], ['x', 'х'], ['y', 'у'],
    ['A', 'А'], ['B', 'В'], ['C', 'С'], ['E', 'Е'], ['H', 'Н'], ['K', 'К'], ['M', 'М'],
    ['O', 'О'], ['P', 'Р'], ['T', 'Т'], ['X', 'Х']
  ];
  assert.deepEqual(pairs.map(([latin]) => latin.codePointAt(0)), [
    0x61, 0x63, 0x65, 0x6f, 0x70, 0x78, 0x79,
    0x41, 0x42, 0x43, 0x45, 0x48, 0x4b, 0x4d, 0x4f, 0x50, 0x54, 0x58
  ]);
  assert.deepEqual(pairs.map(([, cyrillic]) => cyrillic.codePointAt(0)), [
    0x430, 0x441, 0x435, 0x43e, 0x440, 0x445, 0x443,
    0x410, 0x412, 0x421, 0x415, 0x41d, 0x41a, 0x41c, 0x41e, 0x420, 0x422, 0x425
  ]);
  const beforeWords = pairs.map(([latin]) => `ж${latin}ж`);
  const afterWords = pairs.map(([, cyrillic]) => `ж${cyrillic}ж`);
  const first = plan();
  first.speech.utterance_text = beforeWords.join(' ');
  const corrected = plan();
  corrected.speech.utterance_text = afterWords.join(' ');
  const { result, calls } = await decide([first, corrected]);
  assert.equal(calls.length, 1);
  assert.equal(result.plan.speech.utterance_text, afterWords.join(' '));
  assert.deepEqual(result.script_respellings, beforeWords.map((before, index) => ({
    path: '$.speech.utterance_text', before, after: afterWords[index]
  })));
});

test('R3: claims and grounded contribution are replaced in scan order', async () => {
  const first = plan();
  first.speech.utterance_text = 'Здpавствуй.';
  first.speech.claims = [claim('Изба стоит.', 'claim-1'),
    claim('Жиpко видел Плoтника.', 'claim-2')];
  first.interpretation.grounded_contribution = 'Пoдтвердить встречу.';
  const corrected = structuredClone(first);
  corrected.speech.utterance_text = 'Здравствуй.';
  corrected.speech.claims[1].content_summary = 'Жирко видел Плотника.';
  corrected.interpretation.grounded_contribution = 'Подтвердить встречу.';
  const { result, calls } = await decide([first, corrected]);
  assert.equal(calls.length, 1);
  assert.equal(result.plan.speech.utterance_text, corrected.speech.utterance_text);
  assert.equal(result.plan.speech.claims[1].content_summary,
    corrected.speech.claims[1].content_summary);
  assert.equal(result.plan.interpretation.grounded_contribution,
    corrected.interpretation.grounded_contribution);
  assert.deepEqual(result.script_respellings, [
    { path: '$.speech.utterance_text', before: 'Здpавствуй', after: 'Здравствуй' },
    { path: '$.speech.claims[1].content_summary', before: 'Жиpко', after: 'Жирко' },
    { path: '$.speech.claims[1].content_summary', before: 'Плoтника', after: 'Плотника' },
    { path: '$.interpretation.grounded_contribution', before: 'Пoдтвердить', after: 'Подтвердить' }
  ]);
});

test('R4: other Latin letters remain in the format repair quote', async (t) => {
  for (const [before, partial, repaired] of [
    ['протoku', 'протоku', 'протоку'],
    ['прoтmу', 'протmу', 'протму'],
    ['сeлоi', 'селоi', 'селои']
  ]) {
    await t.test(before, async () => {
      const first = plan();
      first.speech.utterance_text = `Иди к ${before}.`;
      const corrected = plan();
      corrected.speech.utterance_text = `Иди к ${repaired}.`;
      const { result, calls } = await decide([first, corrected]);
      assert.equal(calls.length, 2);
      assert.equal(calls[1].repair.kind, 'format');
      assert.ok(calls[1].repair.validation_errors.some(({ code, quote }) =>
        code === 'mixed_script_word' && quote === partial));
      assert.equal(result.status, 'planned');
      assert.equal(result.plan.speech.utterance_text, `Иди к ${repaired}.`);
      assert.deepEqual(result.script_respellings, [{
        path: '$.speech.utterance_text', before, after: partial
      }]);
    });
  }
});

test('R5: raw adapter output keeps extra keys and uses replaced spelling in repair', async (t) => {
  for (const [before, after] of [
    ['Здpавствуй', 'Здравствуй'],
    ['Жиpко', 'Жирко'],
    ['Бoжьим', 'Божьим']
  ]) {
    await t.test(before, async () => {
      const decisionRequest = request();
      const assembled = plan(decisionRequest);
      assembled.speech.utterance_text = `${before}, иди к протoku.`;
      const raw = { ...structuredClone(assembled), unexpected: 'kept' };
      const corrected = plan(decisionRequest);
      corrected.speech.utterance_text = `${after}, иди к протоку.`;
      const calls = [];
      const semanticModel = async (_source, context) => {
        calls.push(context);
        return calls.length === 1 ? assembled : structuredClone(corrected);
      };
      semanticModel.originalOutputOf = (value) => value === assembled ? raw : undefined;
      const result = await requestNpcSemanticDecision({
        boundary: boundary(), request: decisionRequest, semanticModel,
        revalidateStateVersion: async () => 2
      });
      assert.equal(calls.length, 2);
      assert.equal(calls[1].repair.original_output.unexpected, 'kept');
      assert.equal(calls[1].repair.original_output.speech.utterance_text,
        `${after}, иди к протоku.`);
      assert.ok(calls[1].repair.validation_errors.some(({ code, quote }) =>
        code === 'mixed_script_word' && quote === 'протоku'));
      assert.ok(!calls[1].repair.validation_errors.some(({ code, quote }) =>
        code === 'mixed_script_word' && quote === after));
      assert.equal(result.status, 'planned');
      assert.deepEqual(result.script_respellings, [
        { path: '$.speech.utterance_text', before, after },
        { path: '$.speech.utterance_text', before: 'протoku', after: 'протоku' }
      ]);
    });
  }
});

test('R6: format repair response is replaced before the spelling comparison', async (t) => {
  for (const [path, firstWord, repairedWord, finalWord] of [
    ['speech', 'протoku', 'прoтоку', 'протоку'],
    ['claim', 'плoтnik', 'плoтник', 'плотник']
  ]) {
    await t.test(path, async () => {
      const first = plan();
      const repaired = plan();
      const final = plan();
      if (path === 'speech') {
        first.speech.utterance_text = `Иди к ${firstWord}.`;
        repaired.speech.utterance_text = `Иди к ${repairedWord}.`;
        final.speech.utterance_text = `Иди к ${finalWord}.`;
      } else {
        first.speech.claims = [claim(`${firstWord} работает.`, 'claim-1')];
        repaired.speech.claims = [claim(`${repairedWord} работает.`, 'claim-1')];
        final.speech.claims = [claim(`${finalWord} работает.`, 'claim-1')];
      }
      const calls = [];
      const semanticModel = async (_source, context) => {
        calls.push(context);
        return structuredClone(calls.length === 1 ? first : calls.length === 2 ? repaired : final);
      };
      const outcome = await requestNpcSemanticDecision({
        boundary: boundary(), request: request(), semanticModel,
        revalidateStateVersion: async () => 2
      }).catch((error) => ({ status: 'rejected', error }));
      assert.equal(outcome.status, 'planned');
      assert.equal(calls.length, 2);
      assert.equal(path === 'speech' ? outcome.plan.speech.utterance_text
        : outcome.plan.speech.claims[0].content_summary,
      path === 'speech' ? `Иди к ${finalWord}.` : `${finalWord} работает.`);
      assert.deepEqual(outcome.script_respellings, [
        { path: path === 'speech' ? '$.speech.utterance_text' : '$.speech.claims[0].content_summary',
          before: firstWord, after: path === 'speech' ? 'протоku' : 'плотnik' },
        { path: path === 'speech' ? '$.speech.utterance_text' : '$.speech.claims[0].content_summary',
          before: repairedWord, after: finalWord }
      ]);
    });
  }
});

test('R6: semantic repair response also has lookalikes replaced without another call', async () => {
  const first = plan();
  first.speech.utterance_text = 'Я отвечу.';
  const repaired = plan();
  repaired.speech.utterance_text = 'Здpавствуй.';
  const corrected = plan();
  corrected.speech.utterance_text = 'Здравствуй.';
  const calls = [];
  let audits = 0;
  const result = await requestNpcSemanticDecision({
    boundary: boundary(), request: request(),
    semanticModel: async (_source, context) => {
      calls.push(context);
      return structuredClone(calls.length === 1 ? first : calls.length === 2 ? repaired : corrected);
    },
    validateFreshPlan: () => ++audits === 1 ? { pass: false, errors: [{
      code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED',
      category: 'semantic_grounding', retryable: true
    }] } : true,
    revalidateStateVersion: async () => 2
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].repair.kind, 'semantic');
  assert.equal(result.status, 'planned');
  assert.equal(result.plan.speech.utterance_text, 'Здравствуй.');
  assert.deepEqual(result.script_respellings, [{
    path: '$.speech.utterance_text', before: 'Здpавствуй', after: 'Здравствуй'
  }]);
});

test('R7: Latin-only words and Cyrillic words are left untouched', async (t) => {
  for (const utterance of ['Peter пришёл.', 'OK, я понял.', 'Tom уехал.', 'Чистая кириллица.']) {
    await t.test(utterance, async () => {
      const first = plan();
      first.speech.utterance_text = utterance;
      const { result, calls } = await decide([first]);
      assert.equal(calls.length, 1);
      assert.equal(result.status, 'planned');
      assert.equal(result.plan.speech.utterance_text, utterance);
      assert.equal(Object.hasOwn(result, 'script_respellings'), false);
    });
  }
});

test('R7: mixed script in reason is outside the scanned texts', async () => {
  const first = plan();
  first.reason = 'Здpавствуй не относится к произнесённой реплике.';
  const { result, calls } = await decide([first]);
  assert.equal(calls.length, 1);
  assert.equal(result.status, 'planned');
  assert.equal(result.plan.reason, first.reason);
  assert.equal(Object.hasOwn(result, 'script_respellings'), false);
});
