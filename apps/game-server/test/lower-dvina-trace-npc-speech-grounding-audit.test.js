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

test('rejects the captured A02 quote when absent from its parent claim', async () => {
  const { calls, promise } = call({ pass: false, concerns: [{
    kind: 'unsupported', path: '$.speech.claims[0]', quote: 'Щепы нет.'
  }] });
  await assert.rejects(promise, error =>
    error.code === 'TRACE_NPC_SPEECH_GROUNDING_AUDIT_INVALID'
      && error.status === 503);
  assert.equal(calls.length, 1);
});

test('rejects quotes from another field, missing targets, and unsupported paths', async () => {
  const concerns = [
    { kind: 'unsupported', path: '$.speech.claims[0].content_summary',
      quote: 'Щепы нет.' },
    { kind: 'unsupported', path: '$.speech.claims[9]', quote: 'Щепы нет' },
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
