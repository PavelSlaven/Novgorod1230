import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createLowerDvinaTraceNpcSemanticModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { auditFreshNpcSpeech } from
  '../src/runtime/lower-dvina-trace-npc-speech-grounding-audit.js';
import { CLAIM_KINDS_RULE, FACTUAL_ASSERTION_RULE } from
  '../src/runtime/lower-dvina-trace-phase-2-conversation-prompt-contract.js';

const targets = JSON.parse(await readFile(new URL(
  './fixtures/npc-conversation-target-prompts.json', import.meta.url), 'utf8'));

async function captureSystem(run) {
  const calls = [];
  const roleRunner = { async run(call) {
    calls.push(call);
    return { output: { pass: true, concerns: [] } };
  } };
  try {
    await run(roleRunner);
  } catch (error) {
    if (calls.length === 0) throw error;
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].messages[0].role, 'system');
  return calls[0].messages[0].content;
}

function responder(request = targets.responder.user) {
  return captureSystem(roleRunner => createLowerDvinaTraceNpcSemanticModel({
    roleRunner
  })(request));
}

function repair(kind, user) {
  return captureSystem(roleRunner => createLowerDvinaTraceNpcSemanticModel({
    roleRunner
  })(user.request, { repair: {
    kind, original_output: user.original_output,
    validation_errors: user.validation_errors
  } }));
}

function auditor() {
  const user = targets.auditor.user;
  return captureSystem(roleRunner => auditFreshNpcSpeech({
    roleRunner, plan: user.plan, request: user.request
  }));
}

function auditorOwn(full) {
  assert.equal(full.includes(FACTUAL_ASSERTION_RULE), true);
  assert.equal(full.includes(CLAIM_KINDS_RULE), true);
  return full.replace(FACTUAL_ASSERTION_RULE, '')
    .replace(CLAIM_KINDS_RULE, '');
}

function semanticRepairUser(intentOpen, request) {
  const source = targets.semantic_repair.user;
  const quote = source.original_output?.interpretation?.intent;
  assert.equal(typeof quote, 'string');
  return {
    ...source, request,
    validation_errors: [
      ...source.validation_errors,
      ...(intentOpen ? [{
        code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED',
        category: 'semantic_grounding',
        retryable: true,
        concern_kinds: ['unsupported_intent'],
        path: '$.interpretation.intent',
        quote,
        message: 'Rewrite the complete response without unsupported factual assertions.'
      }] : [])
    ]
  };
}

function responses(request = targets.responder.user) {
  return [
    ['responder', () => responder(request)],
    ['semantic repair, closed intent', () => repair('semantic',
      semanticRepairUser(false, request))],
    ['semantic repair, open intent', () => repair('semantic',
      semanticRepairUser(true, request))],
    ['format repair', () => repair('format', {
      ...targets.format_repair.user, request
    })]
  ];
}

function hasAll(text, patterns, label) {
  for (const pattern of patterns) assert.match(text, pattern, label);
}

function sentences(text) {
  return text.replace(/\s+/gu, ' ').split(/[.!?]\s+/u);
}

function cancelledOperationRule(text) {
  const speech = /\b(?:promis(?:e|es|ed|ing)|offer(?:s|ed|ing)?|intentions?|accept(?:s|ed|ing|ance)?|pledge(?:s|d|ing)?|undertak(?:e|es|en|ing)|commit(?:s|ted|ting)?\s+to|agree(?:s|d|ing)?\s+to\s+do|agreements?)\b/iu;
  const operation = /\b(?:operations?|supporting_operations|mechanics|handoffs?)\b/iu;
  const gate = /\b(?:must|needs?|requires?|required|reject(?:ed)?|refuse|forbids?|forbidden|cannot|may not|without|absent|missing|only if)\b/iu;
  const future = /\b(?:future|later|tomorrow|next|to do|to act|work|help|carry|escort|action|task)\b/iu;
  const absent = /\b(?:without|absent|missing|no supporting|no exact|no operation)\b/iu;
  return sentences(text).some(s => speech.test(s) && operation.test(s)
    && gate.test(s) && (future.test(s) || absent.test(s))
    && !/\b(?:not|never)\b.{0,45}\b(?:reason|grounds?|cause)\b.{0,35}\b(?:reject|fail)/iu.test(s)
    && !/\b(?:does not|need not|no|not)\b.{0,55}\b(?:require|required)\b/iu.test(s));
}

function cancelledLieRule(text) {
  const lie = /\b(?:knowingly_false|deliberate lies?|lying|false postures?)\b/iu;
  const conceal = /\b(?:hide|hides|hidden|hiding|conceal(?:s|ed|ing)?|withhold(?:s|ing)?|withheld)\b/iu;
  return sentences(text).some(s => lie.test(s) && conceal.test(s)
    && !/\b(?:not|never|cannot)\b.{0,35}\b(?:hide|conceal|withhold)/iu.test(s));
}

function withBindings(request) {
  const copy = structuredClone(request);
  copy.decision_scope ??= {};
  copy.decision_scope.operation_contract ??= {};
  copy.decision_scope.operation_contract.commit_route_participation = {
    allowed_bindings: [{ route_ref: 'route-1', role: 'companion' }]
  };
  return copy;
}

test('pf1: auditor treats intentions as statements and checks their factual premises', async () => {
  const full = await auditor();
  const own = auditorOwn(full);
  assert.equal(cancelledOperationRule(full), false);
  hasAll(own, [
    /(?:promise|offer|intention|acceptance).{0,160}(?:speech|statement)/iu,
    /(?:absence|lack|missing|without).{0,100}(?:operation|supporting_operation).{0,120}(?:not|never).{0,70}(?:reject|failure|grounds|reason)/iu,
    /factual premises?.{0,100}(?:claim|audit|check)/iu,
    /(?:already done|completed|current).{0,150}(?:assertion|fact|evidence|check|audit)/iu
  ], 'auditor-owned rule');
  assert.equal(sentences(own).some(s => /accept/iu.test(s)
    && /(?:future|later)/iu.test(s)
    && /(?:speech|statement)/iu.test(s)), true,
  'future acceptance remains a statement');
});

test('pf2: responder and repairs do not turn speech into action or mechanics', async () => {
  for (const [name, build] of responses()) {
    const full = await build();
    assert.equal(cancelledOperationRule(full), false, name);
    hasAll(full, [
      /(?:promise|offer|future intention|acceptance).{0,160}(?:speech|statement)/iu,
      /(?:speech|statement).{0,160}(?:does not|cannot|never).{0,100}(?:perform|commit|execute).{0,70}(?:action|mechanic)/iu,
      /factual premises?.{0,100}(?:claim|source_knowledge_refs)/iu
    ], name);
    assert.equal(sentences(full).some(s => /accept/iu.test(s)
      && /(?:future|later)/iu.test(s)
      && /(?:speech|statement)/iu.test(s)), true,
    `${name}: future acceptance remains a statement`);
  }
});

test('pf3: exact operation contracts remain binding for selected operations', async () => {
  for (const [name, build] of responses(withBindings(targets.responder.user))) {
    const full = await build();
    hasAll(full, [
      /commit_surrender.{0,220}(?:exact|explicit|surrender tag|supporting_operations)/iu,
      /state_bargain.{0,260}(?:concrete condition|supplied subjective|supporting_operations)/iu,
      /commit_route_participation.{0,240}(?:allowed binding|allowed_bindings)/iu,
      /disclose_known_route.{0,260}(?:player_safe_context|route topic|route_disclosure)/iu,
      /emit_interaction.{0,230}(?:exact permitted|copy its exact)/iu,
      /destination_label.{0,240}(?:Do not add|only permitted|never supports)/iu
    ], name);
    if (name.startsWith('semantic repair')) {
      assert.match(full, /Add no new fact, act, or operation/iu);
    }
  }
});

test('pf4: promises and future intentions alone are not factual assertions', () => {
  hasAll(FACTUAL_ASSERTION_RULE, [
    /\bpromis(?:e|es|ed|ing)\b/iu,
    /\bfuture intentions?\b/iu,
    /not factual assertions by themselves/iu,
    /factual premise inside.{0,100}(?:claim|factual assertion)/iu
  ], 'shared factual assertion rule');
});

test('pl1: knowingly_false needs visible false speech and a contradicted known fact', () => {
  assert.equal(cancelledLieRule(CLAIM_KINDS_RULE), false);
  const lieRule = sentences(CLAIM_KINDS_RULE);
  assert.equal(lieRule.some(s => /knowingly_false/iu.test(s)
    && /(?:visible|utterance_text)/iu.test(s)
    && /(?:false factual assertion|factually false assertion)/iu.test(s)),
  true, 'a lie must be a false factual assertion in visible speech');
  assert.equal(lieRule.some(s => /knowingly_false/iu.test(s)
    && /(?:exact|source_knowledge_refs)/iu.test(s)
    && /known fact/iu.test(s) && /contradict/iu.test(s)),
  true, 'a lie must cite the exact known fact it contradicts');
  hasAll(CLAIM_KINDS_RULE, [
    /(?:truthful|true).{0,100}(?:refusal|evasion).{0,180}(?:withheld|omit|omission)/iu,
    /false denial.{0,150}knowingly_false/iu
  ], 'shared claim-kind rule');
});

test('pl2: auditor rejects false posture on truthful refusal or evasion', async () => {
  const full = await auditor();
  const own = auditorOwn(full);
  assert.equal(cancelledLieRule(full), false);
  hasAll(own, [
    /(?:truthful|true).{0,100}(?:refusal|evasion).{0,160}knowingly_false.{0,100}(?:reject|invalid|not)/iu,
    /false denial.{0,150}knowingly_false.{0,150}(?:exact|source_knowledge_refs).{0,100}known fact/iu
  ], 'auditor-owned lie rule');
});

test('pl3: responder and semantic repair keep the lie rule for both intent states', async () => {
  for (const [name, build] of responses().filter(([role]) =>
    role !== 'format repair')) {
    const full = await build();
    assert.equal(cancelledLieRule(full), false, name);
    hasAll(full, [
      /(?:truthful|true).{0,100}(?:refusal|evasion).{0,160}(?:withheld|omit|omission)/iu,
      /knowingly_false.{0,160}(?:visible|utterance_text).{0,160}(?:false|untrue|contradict)/iu,
      /false denial.{0,150}knowingly_false/iu
    ], name);
  }
});

test('pl4: withheld conceals an exact known fact without a false assertion', async () => {
  hasAll(CLAIM_KINDS_RULE, [
    /withheld.{0,160}(?:exact|source_knowledge_refs).{0,120}known fact/iu,
    /withheld.{0,180}without a false assertion/iu
  ], 'shared claim-kind rule');
  const own = auditorOwn(await auditor());
  hasAll(own, [
    /withheld.{0,180}exact ref/iu,
    /withheld.{0,180}(?:cannot|must not|without).{0,70}false assertion/iu
  ], 'auditor-owned withholding rule');
});

test('ph1: a hypothesis supports tentative supposition, not event truth', () => {
  hasAll(CLAIM_KINDS_RULE, [
    /speaker_posture uncertain.{0,160}knowledge\.hypotheses/iu,
    /knowledge\.hypotheses.{0,180}(?:exact|source_knowledge_refs)/iu,
    /\bsummary\b.{0,100}\bstate\b.{0,100}\bconfidence\b/iu,
    /hypothes(?:is|es).{0,220}(?:not|never|cannot).{0,140}(?:objective event truth|event truth)/iu,
    /hypothes(?:is|es).{0,220}(?:not|never|cannot).{0,140}past perception/iu,
    /hypothes(?:is|es).{0,220}(?:not|never|cannot).{0,140}source_event_ref/iu,
    /hypothes(?:is|es).{0,220}(?:not|never|cannot).{0,140}(?:categorical claim|categorical assertion)/iu,
    /(?:visible speech|utterance_text).{0,130}(?:tentative|supposition|uncertain)/iu
  ], 'shared claim-kind rule');
});

test('ph2: a hypothesis does not disprove genuine lack of knowledge', () => {
  hasAll(CLAIM_KINDS_RULE, [
    /(?:no|without) known fact, belief, memory event, observation, or perceived message/iu,
    /hypothes(?:is|es).{0,180}(?:does not|cannot|never).{0,130}(?:not know|lack of knowledge|genuine uncertainty)/iu
  ], 'shared uncertainty rule');
  assert.doesNotMatch(CLAIM_KINDS_RULE,
    /no known fact, belief, hypothes(?:is|es), memory event/iu);
});

test('cancelled operation detector accepts synonyms and reordered clauses', () => {
  for (const [sample, expected] of [
    ['Every promise of future work requires a supporting operation.', true],
    ['Reject an offered action without an exact operation.', true],
    ['A missing handoff forbids an intention to act.', true],
    ['No supporting operation means an offer cannot be spoken.', true],
    ['An accepted future action requires a supporting operation before it can be voiced.', true],
    ['Without an operation, reject a pledge to carry the load tomorrow.', true],
    ['An undertaking to help later cannot be spoken without a handoff.', true],
    ['To commit to escort tomorrow, the NPC must have a supporting operation.', true],
    ['Agree to do the work tomorrow only if an operation is available.', true],
    ['The operation is required before an acceptance of future work can be spoken.', true],
    ['A promise is a statement; missing operation is not a reason to reject speech.', false],
    ['Selecting commit_surrender copies its exact operation.', false],
    ['Accept surrender now: select the exact commit_surrender operation.', false],
    ['A current bargain uses its selected state_bargain operation.', false],
    ['Agree to surrender now and copy the permitted operation.', false]
  ]) assert.equal(cancelledOperationRule(sample), expected, sample);
});

test('cancelled lie detector accepts synonyms and reordered clauses', () => {
  for (const [sample, expected] of [
    ['A knowingly_false claim may hide a known fact.', true],
    ['Concealing a fact is a deliberate lie.', true],
    ['The hidden known fact can support a knowingly_false posture.', true],
    ['Withheld conceals a known fact without a false assertion.', false],
    ['A knowingly_false assertion cites the fact it contradicts.', false],
    ['A truthful refusal cannot hide behind knowingly_false.', false]
  ]) assert.equal(cancelledLieRule(sample), expected, sample);
});

test('attack: conditional promise still needs its factual premise grounded', async () => {
  const full = await auditor();
  const own = auditorOwn(full);
  for (const [attack, cancelledInstruction] of [
    ['promise with a premise', 'A promise to help later must have an operation.'],
    ['future acceptance with a premise', 'Accepting future work requires an operation.'],
    ['pledge with a premise', 'A pledge to carry the load tomorrow needs an operation.'],
    ['undertaking with a premise', 'Without an operation, reject an undertaking to help later.'],
    ['commitment with a premise', 'To commit to escort tomorrow requires an operation.'],
    ['agreement with a premise', 'Agree to do the work tomorrow only if an operation is present.']
  ]) {
    assert.equal(cancelledOperationRule(cancelledInstruction), true, attack);
    assert.equal(cancelledOperationRule(full), false, attack);
    hasAll(own, [
      /(?:promise|offer|intention|acceptance).{0,160}(?:speech|statement)/iu,
      /factual premises?.{0,100}(?:claim|audit|check)/iu
    ], attack);
  }
});

test('attack: truthful refusal cannot use knowingly_false posture', async () => {
  const own = auditorOwn(await auditor());
  assert.match(own,
    /(?:truthful|true).{0,100}(?:refusal|evasion).{0,160}knowingly_false.{0,100}(?:reject|invalid|not)/iu);
});

test('attack: categorical fact cannot borrow a hypothesis ref', async () => {
  const own = auditorOwn(await auditor());
  hasAll(own, [
    /knowledge\.hypotheses/iu,
    /(?:categorical|asserted as fact|objective truth).{0,180}(?:reject|not|cannot|unsupported)/iu
  ], 'auditor-owned hypothesis rule');
});
