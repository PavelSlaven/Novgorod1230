import assert from 'node:assert/strict';
import test from 'node:test';
import { auditFreshNpcSpeech } from
  '../src/runtime/lower-dvina-trace-npc-speech-grounding-audit.js';

const utterance = 'На пристани выгрузили дрова. Я сам туда не хожу.';
const claim = { claim_id: 'event', source_knowledge_refs: ['memory:event'] };
function fragment(text, factual, claim_ids = []) {
  return { text, factual, claim_ids };
}
function run(report, speech = { utterance_text: utterance, claims: [claim] }) {
  const plan = { contribution_kind: 'speech', speech };
  const calls = [];
  const roleRunner = { async run(call) {
    calls.push(call);
    return { output: report };
  } };
  return { result: auditFreshNpcSpeech({ roleRunner, plan,
    request: { request_id: 'npc-audit-test' } }), calls };
}
const split = [fragment('На пристани выгрузили дрова. ', true, ['event']),
  fragment('Я сам туда не хожу.', true)];

test('private audit rejects an unclaimed factual fragment even when model passes', async () => {
  const { result, calls } = run({ pass: true, concerns: [],
    utterance_fragments: split });
  const audit = await result;
  assert.equal(calls.length, 1);
  assert.equal(audit.pass, false);
  assert.deepEqual(audit.errors[0].concern_kinds, ['unclaimed_factual_utterance']);
  assert.equal(audit.errors[0].audit_feedback[0].quote, 'Я сам туда не хожу.');
});

test('private audit rejects a supported event left in utterance without an original claim', async () => {
  const { result } = run({ pass: true, concerns: [], utterance_fragments: [
    fragment(utterance, true)] }, { utterance_text: utterance, claims: [] });
  assert.deepEqual((await result).errors[0].concern_kinds,
    ['unclaimed_factual_utterance']);
});

test('private audit restores only source whitespace between exact fragments', async () => {
  const text = 'На пристани выгрузили дрова. \tЯ не уверен.';
  assert.equal(await run({ pass: true, concerns: [], utterance_fragments: [
    fragment('На пристани выгрузили дрова.', true, ['event']),
    fragment('Я не уверен.', false)
  ] }, { utterance_text: text, claims: [claim] }).result, true);
  for (const fragments of [
    [fragment('На пристани выгрузили', true, ['event']),
      fragment('Я не уверен.', false)],
    [fragment('На пристани выгрузили дрова', true, ['event']),
      fragment('Я не уверен.', false)],
    [fragment('Я не уверен.', false),
      fragment('На пристани выгрузили дрова.', true, ['event'])]
  ]) {
    await assert.rejects(run({ pass: true, concerns: [],
      utterance_fragments: fragments }, { utterance_text: text,
      claims: [claim] }).result, { code: 'TRACE_NPC_SPEECH_GROUNDING_AUDIT_INVALID' });
  }
});

test('private audit checks exact ordered coverage and existing claim ids', async () => {
  const invalid = [
    [fragment('На пристани выгрузили дрова.', true, ['event'])],
    [fragment(utterance, true, ['event']), fragment(utterance, true, ['event'])],
    [fragment('Я сам туда не хожу.', true, ['event']),
      fragment('На пристани выгрузили дрова. ', true, ['event'])],
    [fragment(utterance, true, ['invented'])],
    [fragment('', true, ['event']), fragment(utterance, false)],
    [null]
  ];
  for (const utterance_fragments of invalid) {
    await assert.rejects(run({ pass: true, concerns: [],
      utterance_fragments }).result, { code: 'TRACE_NPC_SPEECH_GROUNDING_AUDIT_INVALID' });
  }
  await assert.rejects(run({ pass: true, concerns: [] }).result,
    { code: 'TRACE_NPC_SPEECH_GROUNDING_AUDIT_INVALID' });
});

test('private audit accepts linked fact and nonfactual current speech', async () => {
  assert.equal(await run({ pass: true, concerns: [], utterance_fragments: [
    fragment('На пристани выгрузили дрова. ', true, ['event']),
    fragment('Я сам туда не хожу.', false)] }).result, true);
  for (const text of ['Что произошло?', 'Не скажу.',
    'Не уверен, что видел это.', 'Сейчас я выбираю остаться здесь.']) {
    assert.equal(await run({ pass: true, concerns: [], utterance_fragments: [
      fragment(text, false)] }, { utterance_text: text, claims: [] }).result, true);
  }
});

test('private audit demands evidence for categorical NPC knowledge bounds', async () => {
  const text = 'Больше ничего не знаю.';
  const concern = { kind: 'unsupported_knowledge_bound',
    reason: 'A single memory record does not prove the NPC knows nothing else.',
    quote: text };
  const { result, calls } = run({ pass: false, concerns: [concern],
    utterance_fragments: [fragment(text, true)] },
  { utterance_text: text, claims: [] });
  assert.deepEqual((await result).errors[0].concern_kinds,
    ['unsupported_knowledge_bound', 'unclaimed_factual_utterance']);
  assert.match(calls[0].messages[0].content, /Категорический предел знаний/u);
  assert.match(calls[0].messages[0].content, /interpretation и reason/u);
});
