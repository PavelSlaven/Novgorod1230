import assert from 'node:assert/strict';
import test from 'node:test';
import { auditFreshNpcSpeech } from
  '../src/runtime/lower-dvina-trace-npc-speech-grounding-audit.js';

function plan() {
  return {
    contribution_kind: 'speech',
    speech: {
      utterance_text: 'Щепы нет.',
      claims: [{
        claim_id: 'c1',
        content_summary: 'У Жирко нет сухой щепы.',
        form: 'assertion',
        speaker_posture: 'believed_true',
        source_knowledge_refs: [{ entity_kind: 'known_fact', entity_id: 'fact-1' }],
        mentioned_entity_refs: []
      }]
    },
    interpretation: { intent: 'ответить' },
    reason: 'Нужно ответить.',
    supporting_operations: []
  };
}

function call(reply, value = plan()) {
  const calls = [];
  return {
    calls,
    promise: auditFreshNpcSpeech({
      roleRunner: { async run() { calls.push(1); return { output: reply }; } },
      request: { request_id: 'path-quote-regression' },
      plan: value
    })
  };
}

test('accepts an exact quote at a string target and preserves the concern', async () => {
  const { calls, promise } = call({ pass: false, concerns: [{
    kind: 'unsupported', path: '$.speech.utterance_text', quote: 'Щепы нет'
  }] });
  const result = await promise;
  assert.equal(calls.length, 1);
  assert.equal(result.errors[0].path, '$.speech.utterance_text');
  assert.equal(result.errors[0].quote, 'Щепы нет');
});

test('resolves bracket-member JSONPath to the same exact plan value', async () => {
  const { promise } = call({ pass: false, concerns: [{
    kind: 'unsupported', path: "$['speech']['utterance_text']", quote: 'Щепы нет'
  }] });
  const result = await promise;
  assert.equal(result.errors[0].path, "$['speech']['utterance_text']");
});

test('accepts exact short quotes inside parent claim and reference paths', async () => {
  for (const concern of [
    { kind: 'unsupported', path: '$.speech.claims[0]', quote: 'сухой щепы' },
    { kind: 'unsupported', path: '$.speech.claims[0].source_knowledge_refs',
      quote: 'fact-1' }
  ]) {
    const { promise } = call({ pass: false, concerns: [concern] });
    const result = await promise;
    assert.equal(result.errors[0].path, concern.path);
    assert.equal(result.errors[0].quote, concern.quote);
  }
});

test('recovers one exact quote location on a clone and preserves the rejection',
async () => {
  const reply = { pass: false, concerns: [{
    kind: 'unsupported', path: '$.speech.claims[0]', quote: 'Щепы нет.'
  }] };
  const before = structuredClone(reply);
  const { calls, promise } = call(reply);
  const result = await promise;
  assert.equal(calls.length, 1);
  assert.deepEqual(reply, before);
  assert.deepEqual(result.errors, [{
    code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED',
    category: 'semantic_grounding',
    retryable: true,
    concern_kinds: ['unsupported'],
    path: '$.speech.utterance_text',
    quote: 'Щепы нет.',
    message: 'Rewrite the complete response without unsupported factual assertions.'
  }]);
});

test('recovers a unique quote when the valid original path target is absent', async () => {
  const { promise } = call({ pass: false, concerns: [{
    kind: 'unsupported', path: '$.speech.claims[9]', quote: 'Щепы нет.'
  }] });
  const result = await promise;
  assert.equal(result.errors[0].path, '$.speech.utterance_text');
});

test('encodes array indexes zero through ten in recovered JSON paths', async () => {
  for (const index of [0, 1, 2, 10]) {
    const value = plan();
    while (value.speech.claims.length <= index) {
      const next = value.speech.claims.length;
      value.speech.claims.push({
        ...value.speech.claims[0],
        claim_id: 'c' + next,
        content_summary: 'claim ' + next
      });
    }
    const quote = 'Уникальная цитата ' + index;
    value.speech.claims[index].content_summary = quote;
    const { promise } = call({ pass: false, concerns: [{
      kind: 'unsupported', path: '$.speech.claims[99]', quote
    }] }, value);
    const result = await promise;
    assert.equal(result.errors[0].path,
      '$.speech.claims[' + index + '].content_summary');
    assert.equal(result.errors[0].quote, quote);
  }
});

test('keeps correct paths, exact parent paths, and pass responses unchanged', async () => {
  const replies = [
    { pass: false, concerns: [{
      kind: 'unsupported', path: '$.speech.utterance_text', quote: 'Щепы нет'
    }] },
    { pass: false, concerns: [{
      kind: 'unsupported', path: '$.speech.claims[0]', quote: 'сухой щепы'
    }] },
    { pass: true, concerns: [] }
  ];
  for (const reply of replies) {
    const before = structuredClone(reply);
    const { promise } = call(reply);
    const result = await promise;
    assert.deepEqual(reply, before);
    if (reply.pass) assert.equal(result, true);
    else assert.equal(result.errors[0].path, reply.concerns[0].path);
  }
});

test('keeps missing, ambiguous, malformed, and out-of-scope concerns fail-closed',
async () => {
  const concerns = [
    { kind: 'unsupported', path: '$.speech.claims[0]', quote: 'нет такого текста' },
    { kind: 'unsupported', path: '$.request.speech.utterance_text',
      quote: 'Щепы нет' },
    { kind: 'unsupported', path: '$.speech..utterance_text', quote: 'Щепы нет' },
    { kind: 'unsupported', path: '$.speech.claims[0].source_knowledge_refs[*]',
      quote: 'fact-1' },
    { kind: 'unsupported', path: '$.speech.utterance_text', quote: '  ' }
  ];
  for (const concern of concerns) {
    const { promise } = call({ pass: false, concerns: [concern] });
    await assert.rejects(promise, error =>
      error.code === 'TRACE_NPC_SPEECH_GROUNDING_AUDIT_INVALID'
        && error.status === 503, concern.path);
  }
  const ambiguous = plan();
  ambiguous.speech['unexpected-key'] = 'Щепы нет.';
  const ambiguousCall = call({ pass: false, concerns: [{
    kind: 'unsupported', path: '$.speech.claims[0]', quote: 'Щепы нет.'
  }] }, ambiguous);
  await assert.rejects(ambiguousCall.promise, error =>
    error.code === 'TRACE_NPC_SPEECH_GROUNDING_AUDIT_INVALID'
      && error.status === 503);
  const malformedCall = call({ pass: false, concerns: [{
    kind: 'unsupported', path: '$.speech.claims[0]', quote: 'Щепы нет.'
  }], extra: true });
  await assert.rejects(malformedCall.promise, error =>
    error.code === 'TRACE_NPC_SPEECH_GROUNDING_AUDIT_INVALID'
      && error.status === 503);
  const partialCall = call({ pass: false, concerns: [
    { kind: 'unsupported', path: '$.speech.claims[0]', quote: 'Щепы нет.' },
    { kind: 'unsupported', path: '$.speech.claims[0]', quote: 'нет такого текста' }
  ] });
  await assert.rejects(partialCall.promise, error =>
    error.code === 'TRACE_NPC_SPEECH_GROUNDING_AUDIT_INVALID'
      && error.status === 503);
});

test('does not move quotes across roots or change any act-anchor coverage', async () => {
  const cases = [
    {
      value: plan(),
      path: '$.speech.claims[0]',
      quote: 'unsupported reason',
      add: value => { value.reason = 'unsupported reason'; }
    },
    {
      value: plan(),
      path: '$.interpretation.grounded_contribution',
      quote: 'сообщить о морозе',
      add: value => { value.interpretation.intent = 'сообщить о морозе'; }
    },
    {
      value: plan(),
      path: '$.speech.claims[0]',
      quote: 'отказ',
      add: value => { value.speech.dominant_act = 'отказ'; }
    },
    {
      value: plan(),
      path: '$.speech.dominant_act',
      quote: 'Щепы нет.',
      add: () => {}
    }
  ];
  for (const scenario of cases) {
    scenario.add(scenario.value);
    const { promise } = call({ pass: false, concerns: [{
      kind: 'unsupported', path: scenario.path, quote: scenario.quote
    }] }, scenario.value);
    await assert.rejects(promise, error =>
      error.code === 'TRACE_NPC_SPEECH_GROUNDING_AUDIT_INVALID'
        && error.status === 503, scenario.path);
  }
});

test('source-free precheck keeps its structural path and claim quote before auditor call',
async () => {
  const value = plan();
  value.speech.claims[0].source_knowledge_refs = [];
  const calls = [];
  const result = await auditFreshNpcSpeech({
    roleRunner: { async run() { calls.push(1); } },
    request: { request_id: 'source-free-path' },
    plan: value
  });
  assert.equal(result.errors[0].path,
    '$.speech.claims[0].source_knowledge_refs');
  assert.equal(result.errors[0].quote, value.speech.claims[0].content_summary);
  assert.deepEqual(result.errors[0].concern_kinds,
    ['claim_without_source_knowledge']);
  assert.equal(calls.length, 0);
});
