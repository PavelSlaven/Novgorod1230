import { assertNpcCheckDependence, assertSuccessfulFormatRepair, assertConversationFailure, npcParticipantRows, assertNpcParticipantBindings, npcFrameReferences, assertNpcActorReferences, assertNoNpcSystemLines } from '../../../tools/cataclysm-prototype/npc-talk-test-helpers.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { buildNpcConversationResponseRequest } from '@rus/npc-runtime';

import { auditFreshNpcSpeech } from '../src/runtime/lower-dvina-trace-npc-speech-grounding-audit.js';
import { assertPlainPrompt, buildCanonicalRequest,
  loadNativeMovementCase, loadScenes, numberedPromptLines, npcSourceTextVariants, runAudit,
  runCanonicalDecision, runFlow, runReply, splitPrompt, unicodeLength }
from '../../../tools/cataclysm-prototype/npc-talk-test-helpers.js';

const responder = 'npc_conversation_responder';
const repairRole = 'npc_conversation_responder_format_repair';
const auditGood = '\u0433\u043e\u0434\u043d\u043e';
const auditor = 'npc_conversation_grounding_auditor';
const speechText = 'Здравствуй.';
const speech = [
  'Выбор: говорить',
  'Речь: ' + speechText,
  'Поступок: приветствие',
  'Опора: —',
  'Неправда: —',
  'Утаил: —'
].join('\n');
const silence = 'Выбор: промолчать\nВместо ответа: Смотрит на собеседника.';
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });

async function scene(id) {
  const fixtures = await loadScenes();
  const value = fixtures.cases.find((entry) => entry.id === id);
  assert.ok(value, 'recorded scene ' + id + ' must exist');
  return value;
}

function roles(outcome) {
  return outcome.calls.map((call) => call.role_id);
}

function planOf(outcome) {
  return outcome.plan ?? outcome.proposal?.plan ?? outcome.result?.proposal?.plan ?? null;
}

function repairKinds(outcome) {
  return outcome.calls.filter((call) => call.role_id === repairRole)
    .map((call) => call.repair_kind);
}

function parseCalls(outcome, role) {
  return outcome.calls.filter((call) => call.role_id === role);
}

function assertP6Prompt(outcome, answer) {
  const call = parseCalls(outcome, responder)[0];
  assert.ok(call, 'the canonical responder role must be called');
  assertPlainPrompt(call.messages);
  const selected = /^Выбор:\s*(.+)$/mu.exec(answer)?.[1];
  assert.ok(selected, 'the input answer must select an item');
  if (selected) {
    assert.ok(call.messages.some(({ content }) => content.includes(selected)),
      'the real prompt must render the selected list item');
  }
  return call;
}

async function runP6(sceneCase, request, options) {
  const outcome = await runCanonicalDecision(sceneCase, request, options);
  return outcome;
}

async function observeRawJsonParsing(responses, callback) {
  const originalParse = JSON.parse;
  const attempts = [];
  JSON.parse = function (value, ...args) {
    if (responses.includes(value)) attempts.push(value);
    return Reflect.apply(originalParse, this, [value, ...args]);
  };
  try {
    const value = await callback();
    return { value, attempts };
  } finally {
    JSON.parse = originalParse;
  }
}

function validSpeechResponse() {
  return speech;
}

function nativeReplyCase(recorded, native) {
  const npcActorId = String(native.npcActorId);
  const turn = native.frame?.turn;
  const avatar = native.frame?.actors?.find((actor) => actor.actor_ref === 'avatar');
  assert.ok(Number.isSafeInteger(turn), 'native test frame must expose its turn');
  assert.ok(avatar && avatar.actor_id != null,
    'native test frame must expose the avatar actor');
  const playerReadback = structuredClone(recorded.playerReadback);
  playerReadback.operation_id = 'npc-talk-native-test-' + native.id;
  playerReadback.before = { turn };
  playerReadback.after = { turn };
  delete playerReadback.source;
  playerReadback.native_effect = { ...playerReadback.native_effect,
    speakerId: String(avatar.actor_id),
    actualHeardListenerIds: [npcActorId] };
  return { ...recorded, id: native.id, frame: native.frame, npcActorId,
    targetActorRef: native.actorRef, playerReadback,
    currentTurns: { turns: [turn], reconstructed: true,
      source: { kind: 'native_test', id: native.id,
        description: 'single native frame turn; no REC interval carried forward' } },
    source: { kind: 'native_test', id: native.id,
      readback: 'controlled external native boundary using the recorded A1 utterance' } };
}

function findOperation(value, operationName) {
  if (Array.isArray(value)) return value.map((entry) =>
    findOperation(entry, operationName)).find(Boolean) ?? null;
  if (value === null || typeof value !== 'object') return null;
  if (value.op === operationName) return value;
  return Object.values(value).map((entry) =>
    findOperation(entry, operationName)).find(Boolean) ?? null;
}

function systemMapping(messages, marker) {
  const text = messages.find(({ role }) => role === 'system')?.content ?? '';
  const start = text.indexOf(marker);
  if (start < 0) return null;
  const open = text.indexOf('{', start + marker.length);
  if (open < 0) return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = open; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '{') depth++;
    else if (character === '}' && --depth === 0) {
      return JSON.parse(text.slice(open, index + 1));
    }
  }
  return null;
}

function sortRefs(values) {
  return [...values].sort((left, right) => {
    const a = left.entity_kind + '\0' + left.entity_id;
    const b = right.entity_kind + '\0' + right.entity_id;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function requestWithScope(request, scope, extraActorRefs = []) {
  const value = structuredClone(request);
  value.decision_scope = { ...value.decision_scope, ...scope };
  if (extraActorRefs.length > 0) {
    const refs = value.allowed_references;
    refs.actor_refs = sortRefs([...refs.actor_refs, ...extraActorRefs]);
    refs.entity_refs = sortRefs([...refs.entity_refs, ...extraActorRefs]);
  }
  return buildNpcConversationResponseRequest(value);
}

async function canonicalWithScope(sceneId, scope, mutate = () => {}) {
  const sceneCase = await scene(sceneId);
  const request = structuredClone(await buildCanonicalRequest(sceneCase));
  mutate(request, sceneCase);
  return { sceneCase, request: requestWithScope(request, scope) };
}

async function controlledParserFixture() {
  const request = structuredClone(await buildCanonicalRequest(await scene('A1')));
  const sourceK5 = request.knowledge.known_facts.find(({ fact_ref }) =>
    fact_ref.entity_id === 'claim:candidate-macro-causal-v2-visible-sun-and-shadow-are-qualitative-directional-and-time-cues');
  const sourceK9 = request.knowledge.known_facts.find(({ fact_ref }) =>
    fact_ref.entity_id === 'novgorod-dev-master-secret-firesteel');
  const sourceB11 = request.knowledge.beliefs.find(({ belief_ref }) =>
    belief_ref.entity_id === 'novgorod-dev-master-belief-sun');
  assert.ok(sourceK5 && sourceK9 && sourceB11,
    'the recorded A1 profile provides the source rows for K5, K9, and B11');
  const refs = {
    K5: ref('known_fact', 'p3-parser-k5'),
    K9: ref('known_fact', 'p3-parser-k9'),
    B11: ref('belief', 'p3-parser-b11')
  };
  const replacedRefs = [sourceK5.fact_ref, sourceK9.fact_ref, sourceB11.belief_ref];
  const heroTopicRef = request.allowed_references.knowledge_refs.find((candidate) =>
    !replacedRefs.some((source) => isDeepStrictEqual(candidate, source)));
  assert.ok(heroTopicRef,
    'the recorded A1 request provides a separate current-message topic reference');
  const topics = { heroTopic: heroTopicRef.entity_id,
    factTopic: refs.K5.entity_id, beliefTopic: refs.B11.entity_id,
    withheldTopic: refs.K9.entity_id };
  request.knowledge = {
    ...request.knowledge,
    known_facts: request.knowledge.known_facts.map((entry) =>
      isDeepStrictEqual(entry.fact_ref, sourceK5.fact_ref)
        ? { ...entry, fact_ref: refs.K5 }
        : isDeepStrictEqual(entry.fact_ref, sourceK9.fact_ref)
          ? { ...entry, fact_ref: refs.K9 } : entry),
    beliefs: request.knowledge.beliefs.map((entry) =>
      isDeepStrictEqual(entry.belief_ref, sourceB11.belief_ref)
        ? { ...entry, belief_ref: refs.B11 } : entry)
  };
  request.allowed_references = {
    ...request.allowed_references,
    knowledge_refs: sortRefs([
      ...request.allowed_references.knowledge_refs.filter((candidate) =>
        !replacedRefs.some((source) => isDeepStrictEqual(candidate, source))),
      refs.K5, refs.K9, refs.B11
    ])
  };
  request.social_context = { ...request.social_context,
    current_message_topic_refs: [topics.heroTopic] };
  const canonicalRequest = buildNpcConversationResponseRequest(request);
  const rowText = { K5: sourceK5.summary, K9: sourceK9.summary,
    B11: sourceB11.summary };
  return { request: canonicalRequest, rowText, refs, topics };
}

function participantRefFor(request, entityId) {
  return request.allowed_references.actor_refs.find(({ entity_kind, entity_id }) =>
    entity_kind === 'npc' && entity_id === entityId);
}

function scopedMenuChoice(runtime, request, predicate) {
  if (typeof runtime.buildNpcAvailableActions !== 'function') {
    return { choices: [], choice: null };
  }
  const addressee = request.public_conversation_history.at(-1)?.speaker_ref
    ?? request.allowed_references.actor_refs.find(({ entity_kind }) =>
      entity_kind === 'player_character');
  const choices = runtime.buildNpcAvailableActions({
    npc_ref: request.npc_ref, addressee_ref: addressee,
    operation_contract: request.decision_scope.operation_contract,
    movements: { approach: false, retreat: false },
    decision_scope: request.decision_scope
  });
  return { choices,
    choice: choices.find(predicate) ?? null };
}

function speechChoiceText(choice, { utterance, act, addresseeNumber = null }) {
  return [
    'Выбор: ' + (choice?.label ?? 'пункт отсутствует'),
    ...(addresseeNumber === null ? [] : ['Кому: ' + addresseeNumber]),
    'Речь: ' + utterance,
    'Поступок: ' + act,
    'Опора: —',
    'Неправда: —',
    'Утаил: —'
  ].join('\n');
}

function findSentSourceRow(rows, sourceText) {
  const sourceVariants = npcSourceTextVariants(sourceText).filter(Boolean);
  return rows.find(({ text }) => npcSourceTextVariants(text).some((rowVariant) =>
    sourceVariants.some((sourceVariant) => rowVariant.includes(sourceVariant))));
}

async function probeAddressableParticipants(sceneCase, request, choice, words = { utterance: speechText, act: 'приветствие' }) {
  const baselineAnswer = speechChoiceText(choice, words);
  const baseline = await runP6(sceneCase, request, {
    fetchResponses: (_fetchCall, roleCall) =>
      roleCall?.role_id === responder
        ? baselineAnswer
        : roleCall?.role_id === auditor ? auditGood : ''
  });
  assert.equal(baseline.error, null);
  assert.deepEqual(repairKinds(baseline), []);
  const baselineCall = parseCalls(baseline, responder)[0];
  assert.ok(baselineCall, 'the baseline responder message must be captured');
  const rows = numberedPromptLines(baselineCall.messages);
  const numbers = rows.map(({ number }) => number);
  assert.ok(numbers.length > 0, 'the sent user messages must have numbered rows');
  assert.ok(numbers.every(Number.isSafeInteger), 'sent row numbers must be integers');
  assert.equal(new Set(numbers).size, numbers.length,
    'sent row numbers must be unique');
  const numberSet = new Set(numbers);
  const expected = sortRefs(request.allowed_references.actor_refs.filter(reference =>
    !(reference.entity_kind === 'npc' && reference.entity_id === String(sceneCase.npcActorId))));
  for (const reference of expected) assert.ok(sceneCase.frame.actors.some(actor =>
    String(actor.actor_id) === reference.entity_id), 'participant refs must originate in the frame');
  const probe = async (number, repeatInvalid = false) => {
    const repairedText = speechChoiceText(choice, words);
    const outcome = await runP6(sceneCase, request, {
      fetchResponses: (_fetchCall, roleCall) => {
        if (roleCall?.role_id === responder) {
          return speechChoiceText(choice, { ...words, addresseeNumber: number });
        }
        if (roleCall?.role_id === repairRole) return repeatInvalid
          ? speechChoiceText(choice, { ...words, addresseeNumber: number })
          : repairedText;
        return roleCall?.role_id === auditor ? auditGood : '';
      }
    });
    const repairs = repairKinds(outcome);
    const reference = planOf(outcome)?.primary_addressee_ref ?? null;
    const addressable = numberSet.has(number) && outcome.error === null
      && repairs.length === 0
      && reference !== null && typeof reference === 'object'
      && typeof reference.entity_kind === 'string'
      && typeof reference.entity_id === 'string';
    return { number, outcome, repairs, reference, addressable };
  };
  const probes = [];
  for (const number of numbers) probes.push(await probe(number));
  const addressable = probes.filter(({ addressable: value }) => value);
  assertAddressableParticipantMap(addressable, expected);
  assertNpcParticipantBindings(addressable, npcParticipantRows(baselineCall.messages), sceneCase, expected);
  return { baseline, baselineAnswer, rows, expected, probes, addressable, probe };
}

function assertAddressableParticipantMap(rows, expected) {
  const references = rows.map(({ reference }) => reference);
  assert.equal(rows.length, expected.length,
    'each non-responder actor must have exactly one addressable row number');
  assert.deepEqual(sortRefs(references), sortRefs(expected),
    'addressable row references must equal the request actor refs without the responder');
  assert.equal(new Set(references.map(({ entity_kind, entity_id }) =>
    entity_kind + '\0' + entity_id)).size, expected.length,
  'two addressable numbers must not resolve to the same actor');
  assert.equal(new Set(rows.map(({ number }) => number)).size, expected.length,
    'each expected actor must be represented by a distinct number');
}

function addFrameNpc3(value, source) {
  const actor = source.frame.actors.find(actor => String(actor.actor_id) === '3');
  assert.ok(actor?.visible, 'NPC3 must be visible in the source frame');
  for (const key of ['actor_refs', 'entity_refs']) {
    const reference = ref('npc', String(actor.actor_id));
    if (!value.allowed_references[key].some(entry => isDeepStrictEqual(entry, reference))) {
      value.allowed_references[key] = sortRefs([...value.allowed_references[key], reference]);
    }
  }
}

async function assertScopedRecipients(sceneCase, request, choice, words) {
  const probed = await probeAddressableParticipants(sceneCase, request, choice, words);
  assert.ok(probed.addressable.length > 0, 'speech recipients must be nonempty');

}

function selectedText(choice) {
  return 'Выбор: ' + (choice?.label ?? 'пункт отсутствует');
}

function canonicalCheckOutcomes() {
  return {
    clean_success: { delivery_quality: 'compelling', observable_effects: [] },
    success: { delivery_quality: 'credible', observable_effects: [] },
    success_with_cost: { delivery_quality: 'credible_with_visible_cost', observable_effects: [] },
    failure_with_consequence: { delivery_quality: 'unconvincing', observable_effects: [] },
    severe_failure: { delivery_quality: 'transparently_manipulative', observable_effects: [] }
  };
}

function formatAuditInput(messages, { npcPart1, context, current, utterance }) {
  const all = messages.map(({ content }) => content).join('\n');
  const system = messages.find(({ role }) => role === 'system')?.content ?? '';
  const user = messages.filter(({ role }) => role === 'user')
    .map(({ content }) => content).join('\n');
  const letters = [...system.matchAll(/\p{L}/gu)].length;
  const cyrillic = [...system.matchAll(/\p{Script=Cyrillic}/gu)].length;
  let noSystemLines = true;
  try { assertNoNpcSystemLines(messages, npcPart1); } catch { noSystemLines = false; }
  return user.includes(context) && user.includes(current) && user.includes(utterance)
    && noSystemLines && letters > 0 && cyrillic > letters / 2
    && /годно/iu.test(system) && /негодно/iu.test(system)
    && /негодно.*?(?:двоеточие|:)/isu.test(system)
    && /(?:цитат\p{L}*|кавычк\p{L}*).*?«[^»]*»/isu.test(system)
    && /причин\p{L}*.*?200\s*(?:знак\p{L}*|символ\p{L}*)/isu.test(system)
    && /проверь|проверить|сверь|доказательств/iu.test(system) && user.length > 0;
}

function assertAuditRuleControls() {
  const npcPart1 = 'Правила NPC';
  const context = 'Кто ты: сторож.';
  const current = 'Сейчас: у ворот.';
  const utterance = 'Здравствуй.';
  const user = [context, current, utterance].join('\n');
  const messages = (rules) => [
    { role: 'system', content: rules },
    { role: 'user', content: user }
  ];
  const russianRules = 'Проверь опору каждой цитаты из речи NPC. Ответь одной строкой. '
    + 'Первое слово — «годно» или «негодно». После «годно» ничего не добавляй. '
    + 'После «негодно» поставь двоеточие, приведи цитату из речи NPC в кавычках «слова» '
    + 'и укажи причину не длиннее 200 знаков.';
  const englishRules = 'Check every claim against the evidence. проверь.';
  const fields = { npcPart1, context, current, utterance };
  assert.equal(formatAuditInput(messages(russianRules), fields), true);
  assert.equal(formatAuditInput(messages(englishRules), fields), false);
}

function assertSelectedDuration(plan, choice, request) {
  assert.ok(request?.decision_scope?.allowed_duration_classes
    ?.includes(choice?.duration_class),
    'selected item duration must be allowed by the request');
  assert.equal(plan?.activity?.duration_class, choice?.duration_class,
    'plan duration must come from the selected item');
}

test('a six-line NPC speech becomes a canonical accepted contribution', async () => {
  const controlChoice = { duration_class: 'domain_owned' };
  const controlRequest = { decision_scope: {
    allowed_duration_classes: ['brief', 'domain_owned']
  } };
  assert.doesNotThrow(() => assertSelectedDuration({
    activity: { duration_class: 'domain_owned' }
  }, controlChoice, controlRequest));
  assert.ok(controlRequest.decision_scope.allowed_duration_classes
    .includes('brief'));
  assert.notEqual('brief', controlChoice.duration_class);
  assert.throws(
    () => assertSelectedDuration({
      activity: { duration_class: 'brief' }
    }, controlChoice, controlRequest),
    /plan duration must come from the selected item/u);

  const recorded = await scene('A1');
  const expectedActors = npcFrameReferences(recorded);
  const sourceRequest = structuredClone(await buildCanonicalRequest(recorded));
  sourceRequest.decision_scope.allowed_duration_classes = ['domain_owned'];
  const outcome = await runP6(recorded, sourceRequest, { fetchResponses: [speech, 'годно'] });
  const plan = planOf(outcome);
  const responseCall = parseCalls(outcome, responder)[0];
  assert.ok(responseCall, 'the product responder role must be called');
  assert.equal(outcome.error, null);
  assert.equal(plan?.schema, 'conversation_contribution_plan_v1');
  assert.equal(plan?.contribution_kind, 'speech');
  assert.equal(plan?.speech?.utterance_text, speechText);
  assertNpcActorReferences(sourceRequest, plan, expectedActors);
  assert.deepEqual(outcome.request, sourceRequest);
  assert.deepEqual(plan?.affected_actor_refs, []);
  assert.equal(plan?.resolution, 'automatic');
  assert.equal(plan?.check, null);
  assert.equal(plan?.activity?.duration_class, 'domain_owned');
  for (const key of ['request_id', 'boundary_id', 'conversation_id', 'exchange_id',
    'state_version']) assert.equal(plan?.[key], sourceRequest[key], key);
  assert.equal(Object.hasOwn(plan ?? {}, 'reason'), false);
  assert.equal(Object.hasOwn(plan?.interpretation ?? {}, 'intent'), false);
  assert.equal(Object.hasOwn(plan?.interpretation ?? {}, 'adaptation'), false);
  assert.equal(parseCalls(outcome, auditor).length, 1);
  assert.equal(plan?.speech?.response_expectation?.kind, 'none');
  assert.deepEqual(plan?.speech?.response_expectation?.target_refs, []);
  assertPlainPrompt(responseCall.messages);
});

test('two-line silence is accepted with its grounded contribution and no speech', async () => {
  const outcome = await runReply(await scene('A1'), {
    fetchResponses: [silence, silence]
  });
  const plan = planOf(outcome);
  assert.equal(outcome.error, null);
  assert.equal(plan?.contribution_kind, 'silence');
  assert.equal(plan?.interpretation?.grounded_contribution,
    'Смотрит на собеседника.');
  assert.equal(plan?.speech, null);
  assert.equal(parseCalls(outcome, auditor).length, 0);
});

test('available retreat and approach choices become NPC movement contributions', async () => {
  const recorded = await scene('A1');
  const native = await loadNativeMovementCase('movement-far-reachable');
  const nativeScene = nativeReplyCase(recorded, native);
  const expectedActors = npcFrameReferences(nativeScene);
  const options = ['отойти', 'подойти'];
  const outcomes = [];
  for (const option of options) {
    outcomes.push(await runReply(nativeScene, {
      fetchResponses: ['Выбор: ' + option, 'Выбор: ' + option],
      nativeAdapterOverrides: {
        refreshObservation: async () => structuredClone(native.frame),
        queryPath: async (query) => {
          assert.deepEqual(Object.keys(query).sort(),
            ['actorRef', 'targetPosition', 'targetRadius']);
          assert.deepEqual(query.actorRef, native.actorRef);
          assert.equal(Array.isArray(query.targetPosition), true);
          assert.equal(query.targetPosition.length, 3);
          assert.ok([0, 1].includes(query.targetRadius));
          return { reachable: true };
        }
      }
    }));
  }
  const plans = outcomes.map(planOf);
  assert.deepEqual(outcomes.map(({ error }) => error ?? null), [null, null]);
  assert.deepEqual(plans.map((plan) => plan?.contribution_kind),
    ['action_handoff', 'action_handoff']);
  for (const [index, movementIntent] of ['retreat', 'approach'].entries()) {
    const plan = plans[index];
    const operation = findOperation(plan, 'request_movement');
    assert.equal(operation?.op, 'request_movement');
    assertNpcActorReferences(outcomes[index].request, plan, expectedActors, operation);
    assert.equal(operation?.movement_intent, movementIntent);
    assert.equal(plan?.speech, null);
    assert.equal(parseCalls(outcomes[index], auditor).length, 0);
  }
  assert.deepEqual(outcomes.map(repairKinds), [[], []]);
});

test('a five-line speech is repaired once by the format role and then accepted', async () => {
  const incomplete = speech.split('\n').slice(0, 5).join('\n');
  const outcome = await runReply(await scene('A1'), {
    fetchResponses: [incomplete, validSpeechResponse(), 'годно']
  });
  assert.equal(outcome.error, null);
  assert.equal(planOf(outcome)?.contribution_kind, 'speech');
  assert.deepEqual(repairKinds(outcome), ['format']);
  assert.ok(roles(outcome).includes(auditor));
});

test('a semantic error is repaired once and the corrected NPC contribution is accepted', async () => {
  const native = await loadNativeMovementCase('movement-blocked-near');
  const nativeScene = nativeReplyCase(await scene('A1'), native);
  const unavailable = 'Выбор: отойти';
  const outcome = await runReply(nativeScene, {
    fetchResponses: [unavailable, silence],
    nativeAdapterOverrides: {
      refreshObservation: async () => structuredClone(native.frame),
      queryPath: async (query) => {
        assert.deepEqual(Object.keys(query).sort(),
          ['actorRef', 'targetPosition', 'targetRadius']);
        assert.equal(Array.isArray(query.targetPosition), true);
        assert.equal(query.targetPosition.length, 3);
        assert.ok([0, 1].includes(query.targetRadius));
        const route = [native, ...(native.retreatTargets ?? [])].find((candidate) =>
          JSON.stringify(candidate.targetPosition) === JSON.stringify(query.targetPosition)
          && candidate.targetRadius === query.targetRadius);
        assert.ok(route, 'blocked movement must use a native oracle target');
        return { reachable: route.reachable };
      }
    }
  });
  assert.equal(outcome.error, null);
  assert.equal(planOf(outcome)?.contribution_kind, 'silence');
  assert.deepEqual(repairKinds(outcome), ['semantic']);
});

test('format repair may be followed by semantic repair with one call of each kind', async () => {
  const incompleteBadChoice = [
    'Выбор: передать топор', 'Речь: Здравствуй.', 'Поступок: приветствие',
    'Опора: —', 'Неправда: —'
  ].join('\n');
  const repairedFormat = [
    'Выбор: передать топор', 'Речь: Здравствуй.', 'Поступок: приветствие',
    'Опора: —', 'Неправда: —', 'Утаил: —'
  ].join('\n');
  const outcome = await runReply(await scene('A1'), {
    fetchResponses: [incompleteBadChoice, repairedFormat, silence]
  });
  assert.equal(outcome.error, null);
  assert.equal(planOf(outcome)?.contribution_kind, 'silence');
  assert.deepEqual(repairKinds(outcome), ['format', 'semantic']);
  assert.equal(parseCalls(outcome, auditor).length, 0);
});

test('semantic repair may be followed by format repair with one call of each kind', async () => {
  const badChoice = [
    'Выбор: передать топор', 'Речь: Здравствуй.', 'Поступок: приветствие',
    'Опора: —', 'Неправда: —', 'Утаил: —'
  ].join('\n');
  const incompleteSilence = 'Выбор: промолчать';
  const outcome = await runReply(await scene('A1'), {
    fetchResponses: [badChoice, incompleteSilence, silence]
  });
  assert.equal(outcome.error, null);
  assert.equal(planOf(outcome)?.contribution_kind, 'silence');
  assert.deepEqual(repairKinds(outcome), ['semantic', 'format']);
  assert.equal(parseCalls(outcome, auditor).length, 0);
});

test('a repeated format or semantic failure returns a typed refusal without a third repair', async () => {
  const fiveLines = speech.split('\n').slice(0, 5).join('\n');
  const badChoice = [
    'Выбор: передать топор', 'Речь: Здравствуй.', 'Поступок: приветствие',
    'Опора: —', 'Неправда: —', 'Утаил: —'
  ].join('\n');
  const scenarios = [
    { kind: 'format', responses: [fiveLines, fiveLines] },
    { kind: 'semantic', responses: [badChoice, badChoice] }
  ];
  const outcomes = [];
  for (const scenario of scenarios) {
    outcomes.push(await runReply(await scene('A1'), {
      fetchResponses: scenario.responses
    }));
  }
  for (const [index, outcome] of outcomes.entries()) {
    assertConversationFailure(outcome.error, repairKinds(outcome), scenarios[index].kind);
    assert.deepEqual(repairKinds(outcome), [scenarios[index].kind]);
    assert.equal(parseCalls(outcome, repairRole).length, 1);
  }
});

test('extra, missing, misnumbered, and annotated response lines trigger format repair before audit', async () => {
  const malformed = [
    speech + '\nПояснение: Сказано спокойно.',
    speech.split('\n').slice(0, 5).join('\n'),
    speech.replace('Опора: —', 'Опора: 999'),
    speech.replace('Речь: Здравствуй.', 'Речь: Здравствуй. (улыбается)')
  ];
  const outcomes = [];
  for (const text of malformed) {
    outcomes.push(await runReply(await scene('A1'), {
      fetchResponses: [text, speech, 'годно']
    }));
  }
  assert.deepEqual(outcomes.map(({ error }) => error ?? null),
    [null, null, null, null]);
  assert.deepEqual(outcomes.map(repairKinds),
    [['format'], ['format'], ['format'], ['format']]);
  assert.ok(outcomes.every((outcome) => roles(outcome).at(-1) === auditor));
});

test('an unavailable action and speech on the hero behalf receive semantic repair', async () => {
  const invalid = [
    [
      'Выбор: передать топор', 'Речь: Здравствуй.', 'Поступок: приветствие',
      'Опора: —', 'Неправда: —', 'Утаил: —'
    ].join('\n'),
    [
      'Выбор: говорить', 'Речь: Ты отвечаешь: «Здравствуй».',
      'Поступок: приветствие', 'Опора: —', 'Неправда: —', 'Утаил: —'
    ].join('\n')
  ];
  const outcomes = [];
  for (const text of invalid) {
    outcomes.push(await runReply(await scene('A1'), {
      fetchResponses: [text, silence]
    }));
  }
  assert.deepEqual(outcomes.map(({ error }) => error ?? null), [null, null]);
  assert.deepEqual(outcomes.map(repairKinds), [['semantic'], ['semantic']]);
  assert.deepEqual(outcomes.map((outcome) => planOf(outcome)?.contribution_kind),
    ['silence', 'silence']);
});

test('the audit grammar accepts exact good, parses a valid rejection, and types malformed text', async () => {
  const recorded = await scene('A1');
  const request = await buildCanonicalRequest(recorded);
  const plan = { contribution_kind: 'speech',
    speech: { utterance_text: speechText, claims: [] } };
  const malformed = [
    'годно: есть сомнения',
    'годно потому что всё верно',
    'годно\nлишняя строка',
    'допустимо',
    'негодно',
    'негодно: ответ без цитаты — причина',
    'негодно: «Здравствуй.»',
    'негодно: «чужая цитата» — причина',
    'негодно: «Здравствуй.» — ' + 'длинная'.repeat(34),
    (await loadScenes()).auditMalformedResponse.text
  ];
  assert.equal(unicodeLength(malformed.at(-1)), 630);
  const outputs = ['годно',
    'негодно: «Здравствуй.» — это утверждение не опирается на запрос.',
    ...malformed];
  const recordedResponseTexts = [...outputs, speech];
  const observed = await observeRawJsonParsing(recordedResponseTexts, async () => {
    const results = [];
    for (const text of outputs) {
      results.push(await runAudit(request, plan, {
        captureOnly: false, fetchResponses: [text]
      }));
    }
    const turn = await runCanonicalDecision(recorded, request, {
      fetchResponses: [speech, malformed[0], speech]
    });
    return { results, turn };
  });
  const [good, validReject, ...badForms] = observed.value.results;
  const turn = observed.value.turn;
  const turnRoles = roles(turn);
  const failures = [];
  if (good.result !== true || good.error !== null) {
    failures.push('exact good verdict was not accepted');
  }
  if (validReject.result?.pass !== false || validReject.error !== null) {
    failures.push('well-formed rejection was not parsed as a verdict');
  }
  if (!badForms.every((outcome) =>
    outcome.error?.code === 'TRACE_NPC_SPEECH_GROUNDING_AUDIT_INVALID')) {
    failures.push('a malformed audit response did not produce a typed form error');
  }
  if (turn.error?.code !== 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE'
    || turn.error?.details?.category !== 'format'
    || parseCalls(turn, auditor).length !== 1
    || parseCalls(turn, repairRole).length !== 0
    || JSON.stringify(turnRoles) !== JSON.stringify([responder, auditor])) {
    failures.push('the turn owner did not fail a malformed audit verdict immediately');
  }
  if (observed.attempts.length !== 0) failures.push('a raw text verdict was JSON-parsed');
  assert.deepEqual(failures, [], JSON.stringify({
    good: { result: good.result, error: good.error?.code },
    validReject: { result: validReject.result, error: validReject.error?.code },
    badForms: badForms.map(({ error }) => error?.code ?? null),
    turn: { error: turn.error?.code, category: turn.error?.details?.category,
      roles: turnRoles }, rawParseAttempts: observed.attempts
  }));
});

test('the real auditor receives its Russian rules, conversation parts, and speech only', async () => {
  assertAuditRuleControls();
  const recorded = await scene('A1');
  const expectedActors = npcFrameReferences(recorded);
  const sourceRequest = structuredClone(await buildCanonicalRequest(recorded));
  sourceRequest.decision_scope.allowed_duration_classes = ['domain_owned'];
  const outcome = await runP6(recorded, sourceRequest, { fetchResponses: [speech, 'годно'] });
  const promptModule = await import('@rus/npc-runtime');
  assert.equal(typeof promptModule.renderNpcConversationPrompt, 'function');
  const responseCall = parseCalls(outcome, responder)[0];
  const auditCall = parseCalls(outcome, auditor)[0];
  assert.ok(responseCall && auditCall);
  const responsePrompt = splitPrompt(responseCall.messages);
  const auditPrompt = splitPrompt(auditCall.messages);
  const { context, current } = responsePrompt;
  const npcPart1 = responseCall.messages.find(({ role }) => role === 'system').content;
  assert.ok(formatAuditInput(auditCall.messages, {
    npcPart1, context, current, utterance: speechText
  }));

  const npcRulesWithParts = [{ role: 'system', content: npcPart1 },
    { role: 'user', content: context + '\n' + current + '\n' + speechText }];
  const auditorWithoutParts = [{ role: 'system', content: auditPrompt.system },
    { role: 'user', content: speechText }];
  assert.equal(formatAuditInput(npcRulesWithParts, {
    npcPart1, context, current, utterance: speechText
  }), false);
  assert.equal(formatAuditInput(auditorWithoutParts, {
    npcPart1, context, current, utterance: speechText
  }), false);
});

test('the future parser maps numbered belief, fact, and withheld lines to claims', async () => {
  const { request, rowText, refs, topics } = await controlledParserFixture();
  const { K5, K9, B11 } = refs;
  const { heroTopic, factTopic, beliefTopic, withheldTopic } = topics;
  const promptModule = await import('@rus/npc-runtime');
  assert.equal(typeof promptModule.parseNpcConversationReply, 'function');
  const recorded = await scene('A1');
  const menu = scopedMenuChoice(promptModule, request, ({ contribution_kind, operation }) =>
    contribution_kind === 'speech' && operation == null);
  assert.ok(menu.choice && typeof menu.choice.label === 'string');
  let lineNumbers;
  const outcome = await runP6(recorded, request, {
    fetchResponses: (_fetchCall, roleCall) => {
      if (roleCall?.role_id === responder) {
        const sentRows = numberedPromptLines(roleCall.messages);
        lineNumbers = Object.fromEntries(Object.entries(rowText).map(([key, text]) =>
          [key, findSentSourceRow(sentRows, text)?.number ?? null]));
        assert.ok(Object.values(lineNumbers).every(Number.isSafeInteger),
          'source row numbers must come from the sent prompt text');
        return speechChoiceText(menu.choice, { utterance:
          'Солнце Божьим велением ходит. Ты по делу пришёл?', act: 'вопрос' })
          .replace('Опора: —', `Опора: ${lineNumbers.K5}, ${lineNumbers.B11}`)
          .replace('Утаил: —', `Утаил: ${lineNumbers.K9}`);
      }
      return roleCall?.role_id === auditor ? auditGood : '';
    }
  });
  const parsed = planOf(outcome);
  assert.equal(outcome.error, null);
  const factOnlyOutcome = await runP6(recorded, request, {
    fetchResponses: (_fetchCall, roleCall) => {
      if (roleCall?.role_id === responder) {
        const factNumber = findSentSourceRow(
          numberedPromptLines(roleCall.messages), rowText.K5)?.number;
        assert.ok(factNumber, 'the source fact number comes from the sent prompt text');
        return speechChoiceText(menu.choice, {
          utterance: 'Солнце Божьим велением ходит.', act: 'сообщение'
        }).replace('Опора: —', `Опора: ${factNumber}`);
      }
      return roleCall?.role_id === auditor ? auditGood : '';
    }
  });
  const factOnly = planOf(factOnlyOutcome);
  assert.equal(factOnlyOutcome.error, null);
  const heroRef = request.allowed_references.actor_refs.find(({ entity_kind }) =>
    entity_kind === 'player_character');
  const claims = parsed.speech.claims;
  assert.deepEqual(parsed.speaker_ref, request.npc_ref);
  assert.equal(parsed.schema, 'conversation_contribution_plan_v1');
  assert.equal(parsed.speech.utterance_text,
    'Солнце Божьим велением ходит. Ты по делу пришёл?');
  assert.equal(claims.length, 2);
  const uncertainClaim = claims.find(({ speaker_posture }) =>
    speaker_posture === 'uncertain');
  const withheldClaim = claims.find(({ speaker_posture }) =>
    speaker_posture === 'withheld');
  assert.ok(uncertainClaim && withheldClaim);
  assert.deepEqual(sortRefs(uncertainClaim.source_knowledge_refs), sortRefs([K5, B11]));
  assert.deepEqual(sortRefs(withheldClaim.source_knowledge_refs), sortRefs([K9]));
  assert.equal(uncertainClaim.content_summary, parsed.speech.utterance_text);
  assert.equal(withheldClaim.content_summary, parsed.speech.utterance_text);
  assert.equal(parsed.speech.dominant_act, 'question');
  assert.notEqual(parsed.speech.response_expectation.kind, 'none');
  assert.deepEqual(parsed.speech.response_expectation.target_refs,
    [heroRef]);
  assert.deepEqual(parsed.primary_addressee_ref, heroRef);
  assert.deepEqual(parsed.intended_addressee_refs, [heroRef]);
  const expectedTopics = [...new Set([heroTopic, factTopic, beliefTopic])].sort();
  assert.deepEqual([...parsed.speech.topic_refs].sort(), expectedTopics);
  assert.equal(parsed.speech.topic_refs.includes(withheldTopic), false);
  assert.equal(Object.hasOwn(parsed, 'reason'), false);
  assert.equal(Object.hasOwn(parsed.interpretation, 'intent'), false);
  assert.equal(Object.hasOwn(parsed.interpretation, 'adaptation'), false);
  assert.equal(promptModule.validateConversationContributionPlan(parsed, request), true);

  const factOnlyClaim = factOnly.speech.claims.find(({ speaker_posture }) =>
    speaker_posture === 'believed_true');
  assert.equal(factOnly.speech.claims.length, 1);
  assert.ok(factOnlyClaim);
  assert.deepEqual(sortRefs(factOnlyClaim.source_knowledge_refs), sortRefs([K5]));
  assert.equal(factOnlyClaim.content_summary, factOnly.speech.utterance_text);
  assert.equal(promptModule.validateConversationContributionPlan(factOnly, request), true);
});

test('the future parser marks deliberate falsehood and maps acts, topics, and addressees', async () => {
  const { request, rowText, refs, topics } = await controlledParserFixture();
  const { K5 } = refs;
  const { heroTopic, factTopic } = topics;
  const promptModule = await import('@rus/npc-runtime');
  assert.equal(typeof promptModule.parseNpcConversationReply, 'function');
  const recorded = await scene('A1');
  const menu = scopedMenuChoice(promptModule, request, ({ contribution_kind, operation }) =>
    contribution_kind === 'speech' && operation == null);
  assert.ok(menu.choice && typeof menu.choice.label === 'string');
  let factNumber;
  const outcome = await runP6(recorded, request, {
    fetchResponses: (_fetchCall, roleCall) => {
      if (roleCall?.role_id === responder) {
        factNumber = findSentSourceRow(
          numberedPromptLines(roleCall.messages), rowText.K5)?.number;
        assert.ok(factNumber, 'the source fact number comes from the sent prompt text');
        return speechChoiceText(menu.choice, {
          utterance: 'Солнце не садится. Ты по делу пришёл?', act: 'вопрос'
        }).replace('Неправда: —', `Неправда: ${factNumber}`);
      }
      return roleCall?.role_id === auditor ? auditGood : '';
    }
  });
  const parsed = planOf(outcome);
  assert.equal(outcome.error, null);
  const heroRef = request.allowed_references.actor_refs.find(({ entity_kind }) =>
    entity_kind === 'player_character');
  assert.deepEqual(parsed.speaker_ref, request.npc_ref);
  const lie = parsed.speech.claims.find(({ speaker_posture }) =>
    speaker_posture === 'knowingly_false');
  assert.ok(lie);
  assert.deepEqual(sortRefs(lie.source_knowledge_refs), sortRefs([K5]));
  assert.equal(lie.content_summary, parsed.speech.utterance_text);
  assert.equal(parsed.speech.dominant_act, 'question');
  assert.notEqual(parsed.speech.response_expectation.kind, 'none');
  const requiredTag = request.social_context?.npc_behavior
    ?.required_interaction_tag;
  if (requiredTag) assert.ok(parsed.speech.interaction_tags.includes(requiredTag));
  assert.deepEqual(parsed.primary_addressee_ref, heroRef);
  assert.deepEqual(parsed.intended_addressee_refs, [heroRef]);
  assert.deepEqual([...parsed.speech.topic_refs].sort(), [heroTopic].sort());
  assert.equal(parsed.speech.topic_refs.includes(factTopic), false);
  assert.deepEqual(parsed.speech.response_expectation.target_refs,
    [heroRef]);
  assert.equal(promptModule.validateConversationContributionPlan(parsed, request), true);
});

test('reply and native flow both route through text response, repair, and audit', async () => {
  const recorded = await scene('A1');
  const replyResponses = [
    speech.split('\n').slice(0, 5).join('\n'), speech, 'годно'
  ];
  const replyObserved = await observeRawJsonParsing(replyResponses, async () =>
    runReply(recorded, { fetchResponses: replyResponses }));

  const flowResponse = (fetchCall, roleCall) => {
    if (roleCall.role_id === 'npc_autonomous_decider') {
      const mappings = systemMapping(roleCall.messages,
        'Use these request-derived operation choices exactly:');
      const conversation = mappings?.operation_choices?.find(({ operation }) =>
        operation?.op === 'request_conversation');
      return JSON.stringify({
        interpretation: { npc_goal: 'поговорить с героем',
          grounded_attempt: 'ответить на услышанную речь', adaptation: 'literal' },
        resolution: 'domain_request', operation_choice: conversation?.choice_id ?? null,
        goal_result: undefined,
        activity: { duration_class: 'moment', effort: 'none' },
        operations: [], check: null, reason_code: 'request_conversation',
        reason: 'NPC обращается к герою.'
      });
    }
    if (roleCall.role_id === responder) return speech.split('\n').slice(0, 5).join('\n');
    if (roleCall.role_id === auditor) return 'годно';
    if (roleCall.role_id === repairRole) return speech;
    return '';
  };
  const flowObserved = await observeRawJsonParsing([speech, 'годно'], async () =>
    runFlow(recorded, { fetchResponses: flowResponse }));
  const flowOutcome = flowObserved.value;
  const flowCalls = flowOutcome.calls;
  const flowRoles = flowCalls.map(({ role_id }) => role_id);
  const flowResponderCall = flowCalls.find(({ role_id }) => role_id === responder);
  const flowRepairCalls = flowCalls.filter(({ role_id }) => role_id === repairRole);
  const flowAuditCalls = flowCalls.filter(({ role_id }) => role_id === auditor);
  const selectedOperation = findOperation(flowOutcome.result, 'request_conversation');
  const replyEvidence = {
    error: replyObserved.value.error?.code ?? null,
    roles: roles(replyObserved.value),
    repairKinds: repairKinds(replyObserved.value),
    auditorCalls: parseCalls(replyObserved.value, auditor).length,
    rawParseAttempts: replyObserved.attempts.length
  };
  const flowEvidence = {
    error: flowOutcome.error?.code ?? null,
    selectedOperation: selectedOperation?.op ?? null,
    roles: flowRoles,
    repairKinds: flowRepairCalls.map(({ repair_kind }) => repair_kind),
    auditorCalls: flowAuditCalls.length,
    httpCalls: flowOutcome.httpCalls.length,
    nativeSpeech: flowOutcome.nativeCalls.some((call) =>
      JSON.stringify(call).includes('speak')),
    rawParseAttempts: flowObserved.attempts.length
  };
  const failures = [];
  if (replyEvidence.error !== null || !replyEvidence.repairKinds.includes('format')
    || replyEvidence.auditorCalls === 0 || replyEvidence.rawParseAttempts > 0) {
    failures.push('reply product path did not complete text repair and audit');
  }
  if (flowEvidence.error !== null || !flowEvidence.roles.includes('npc_autonomous_decider')
    || flowEvidence.selectedOperation !== 'request_conversation'
    || !flowEvidence.roles.includes(responder) || flowEvidence.auditorCalls === 0
    || flowEvidence.repairKinds.length === 0 || flowEvidence.httpCalls < 4
    || !flowEvidence.nativeSpeech || flowEvidence.rawParseAttempts > 0) {
    failures.push('native flow did not continue through text conversation, repair, audit, and speech');
  }
  assert.deepEqual(failures, [], JSON.stringify({ reply: replyEvidence, flow: flowEvidence }));
  assertPlainPrompt(flowResponderCall.messages);
});

test('factory selects surrender as say-and-do from its scoped operation', async () => {
  const scope = {
    allowed_duration_classes: ['domain_owned'],
    allowed_contribution_kinds: ['speech'],
    operation_contract: { commit_surrender: {
      required_dominant_acts: ['accept', 'promise', 'confess'],
      required_interaction_tag: 'surrender'
    } },
    required_supporting_operation: { op: 'commit_surrender' }
  };
  const { sceneCase, request } = await canonicalWithScope('A1', scope, addFrameNpc3);
  const npc = await import('@rus/npc-runtime');
  const menu = scopedMenuChoice(npc, request, ({ operation }) =>
    operation?.op === 'commit_surrender');
  const answer = speechChoiceText(menu.choice, {
    utterance: 'Сдаюсь. Не стану сопротивляться.', act: 'согласие'
  });
  const outcome = await runP6(sceneCase, request, {
    fetchResponses: [answer, auditGood]
  });
  const plan = planOf(outcome);
  assert.equal(typeof npc.buildNpcAvailableActions, 'function');
  assert.ok(menu.choice && typeof menu.choice.label === 'string');
  assert.equal(outcome.error, null);
  assert.equal(plan?.contribution_kind, 'speech');
  assert.equal(plan?.speech?.utterance_text,
    'Сдаюсь. Не стану сопротивляться.');
  assert.deepEqual(menu.choice.operation,
    scope.required_supporting_operation);
  assert.ok(request.decision_scope.operation_contract.commit_surrender
    .required_dominant_acts.includes(plan?.speech?.dominant_act));
  assert.ok(plan?.speech?.interaction_tags.includes('surrender'));
  assert.deepEqual(plan?.supporting_operations, [scope.required_supporting_operation]);
  assert.equal(plan?.resolution, 'automatic');
  assert.equal(plan?.check, null);
  assert.equal(plan?.activity?.duration_class, 'domain_owned');
  assert.equal(parseCalls(outcome, auditor).length, 1);
  assertP6Prompt(outcome, answer);
  await assertScopedRecipients(sceneCase, request, menu.choice, {
    utterance: 'Сдаюсь. Не стану сопротивляться.', act: 'согласие'
  });
});

test('factory derives the bargain check and supporting operation from the scoped option', async () => {
  const requiredCheck = { attribute_ref: 'influence', skill_ref: 'communication',
    difficulty_band: 'risky' };
  const check = { purpose: 'Уговорить отпустить меня', ...requiredCheck,
    outcomes: canonicalCheckOutcomes() };
  const scope = {
    allowed_attribute_refs: ['influence'],
    allowed_skill_refs: ['communication'],
    allowed_check_profile_refs: ['risky', 'dangerous'],
    allowed_duration_classes: ['domain_owned'],
    allowed_contribution_kinds: ['speech'],
    operation_contract: { state_bargain: {
      required_dominant_acts: ['negotiate', 'offer', 'threaten'],
      required_interaction_tag: 'bargain',
      required_resolution: 'check_required',
      required_check: requiredCheck,
      check
    } },
    required_supporting_operation: { op: 'state_bargain' }
  };
  const { sceneCase, request } = await canonicalWithScope('A1', scope, addFrameNpc3);
  const npc = await import('@rus/npc-runtime');
  const menu = scopedMenuChoice(npc, request, ({ operation }) =>
    operation?.op === 'state_bargain');
  const answer = speechChoiceText(menu.choice, {
    utterance: 'Отпусти меня, тогда мы договоримся.', act: 'торг'
  });
  const outcome = await runP6(sceneCase, request, {
    fetchResponses: [answer, auditGood]
  });
  const plan = planOf(outcome);
  assert.equal(typeof npc.buildNpcAvailableActions, 'function');
  assert.ok(menu.choice && typeof menu.choice.label === 'string');
  assert.equal(outcome.error, null);
  assert.equal(plan?.contribution_kind, 'speech');
  assert.equal(plan?.resolution, 'check_required');
  assert.equal(plan?.speech?.dominant_act, 'negotiate');
  assert.ok(plan?.speech?.interaction_tags.includes('bargain'));
  assert.deepEqual(menu.choice.operation,
    scope.required_supporting_operation);
  assert.deepEqual(plan?.supporting_operations, [scope.required_supporting_operation]);
  assert.deepEqual(plan?.check, check);
  assert.equal(plan?.activity?.duration_class, 'domain_owned');
  assert.equal(parseCalls(outcome, auditor).length, 1);
  assertP6Prompt(outcome, answer);
  await assertNpcCheckDependence(async candidate => {
    const input = structuredClone(request);
    input.decision_scope.operation_contract.state_bargain.check = candidate;
    input.decision_scope.operation_contract.state_bargain.required_check.difficulty_band = candidate.difficulty_band;
    const option = scopedMenuChoice(npc, input, ({ operation }) => operation?.op === 'state_bargain').choice;
    assert.ok(option, 'the scoped social option is required');
    const captured = await runP6(sceneCase, input, { captureOnly: true });
    const call = parseCalls(captured, responder)[0];
    assert.ok(call, 'the social responder prompt must be captured');
    const rows = numberedPromptLines(call.messages).filter(row => row.text.includes(option.label));
    assert.equal(rows.length, 1, 'the sent social option must have one numbered row');
    return [option, rows[0].text];
  }, check);
  await assertScopedRecipients(sceneCase, request, menu.choice, {
    utterance: 'Отпусти меня, тогда мы договоримся.', act: 'торг'
  });
});

test('factory maps the combat action to the scoped combat handoff', async () => {
  const scope = {
    action_handoff_available: false,
    combat_handoff_available: true,
    allowed_duration_classes: ['domain_owned'],
    allowed_contribution_kinds: ['combat_handoff'],
    operation_contract: {}
  };
  const { sceneCase, request } = await canonicalWithScope('A1', scope, (value) => {
    const player = value.allowed_references.actor_refs.find(({ entity_kind }) =>
      entity_kind === 'player_character');
    value.allowed_references.combat_target_refs = [player];
  });
  const player = request.allowed_references.combat_target_refs[0];
  const npc = await import('@rus/npc-runtime');
  const menu = scopedMenuChoice(npc, request, ({ contribution_kind }) =>
    contribution_kind === 'combat_handoff');
  const answer = selectedText(menu.choice);
  const outcome = await runP6(sceneCase, request, {
    fetchResponses: [answer]
  });
  const plan = planOf(outcome);
  assert.equal(typeof npc.buildNpcAvailableActions, 'function');
  assert.ok(menu.choice && typeof menu.choice.label === 'string');
  assert.equal(outcome.error, null);
  assert.equal(plan?.contribution_kind, 'combat_handoff');
  assert.equal(plan?.speech, null);
  assert.equal(plan?.handoff?.kind, 'combat');
  assert.deepEqual(plan?.handoff?.target_actor_refs,
    request.allowed_references.combat_target_refs);
  assert.equal(plan?.resolution, 'automatic');
  assert.equal(plan?.check, null);
  assert.equal(plan?.activity?.duration_class, 'domain_owned');
  assert.deepEqual(request.allowed_references.combat_target_refs, [player]);
  assert.equal(parseCalls(outcome, auditor).length, 0);
  assertP6Prompt(outcome, answer);
});

test('factory maps leave-conversation as a one-line scoped action', async () => {
  const scope = {
    allowed_duration_classes: ['domain_owned'],
    allowed_contribution_kinds: ['leave_conversation'],
    operation_contract: {}
  };
  const { sceneCase, request } = await canonicalWithScope('A1', scope);
  const npc = await import('@rus/npc-runtime');
  const menu = scopedMenuChoice(npc, request, ({ contribution_kind }) =>
    contribution_kind === 'leave_conversation');
  const answer = selectedText(menu.choice);
  const outcome = await runP6(sceneCase, request, {
    fetchResponses: [answer]
  });
  const plan = planOf(outcome);
  assert.equal(typeof npc.buildNpcAvailableActions, 'function');
  assert.ok(menu.choice && typeof menu.choice.label === 'string');
  assert.equal(outcome.error, null);
  assert.equal(plan?.contribution_kind, 'leave_conversation');
  assert.equal(plan?.speech, null);
  assert.equal(plan?.handoff, null);
  assert.equal(plan?.resolution, 'automatic');
  assert.equal(plan?.check, null);
  assert.equal(plan?.activity?.duration_class, 'domain_owned');
  assert.equal(parseCalls(outcome, auditor).length, 0);
  assertP6Prompt(outcome, answer);
});

test('factory resolves Кому by probing the sent participant rows', async () => {
  const scope = {
    allowed_duration_classes: ['domain_owned'],
    allowed_contribution_kinds: ['speech'],
    operation_contract: {}
  };
  const { sceneCase, request } = await canonicalWithScope('A1', scope, (value, source) => {
    const visibleNpc = source.frame.actors.find((actor) => actor.actor_id === '3');
    assert.ok(visibleNpc?.visible === true,
      'visible NPC3 must come from the recorded A1 observation');
    const npc3Ref = ref('npc', visibleNpc.actor_id);
    if (!value.allowed_references.actor_refs.some((entry) =>
      isDeepStrictEqual(entry, npc3Ref))) {
      value.allowed_references.actor_refs = sortRefs([
        ...value.allowed_references.actor_refs, npc3Ref
      ]);
    }
    if (!value.allowed_references.entity_refs.some((entry) =>
      isDeepStrictEqual(entry, npc3Ref))) {
      value.allowed_references.entity_refs = sortRefs([
        ...value.allowed_references.entity_refs, npc3Ref
      ]);
    }
  });
  const npc3Ref = participantRefFor(request, '3');
  const playerRef = request.allowed_references.actor_refs.find(({ entity_kind }) =>
    entity_kind === 'player_character');
  const expectedRefs = sortRefs(request.allowed_references.actor_refs.filter((reference) =>
    !isDeepStrictEqual(reference, request.npc_ref)));
  assert.deepEqual(expectedRefs, sortRefs([playerRef, npc3Ref]));
  const sampleMap = expectedRefs.map((reference, index) =>
    ({ number: index === 0 ? 7 : 42, reference }));
  assertAddressableParticipantMap(sampleMap, expectedRefs);
  assert.throws(() => assertAddressableParticipantMap([
    sampleMap[0], { ...sampleMap[1], reference: sampleMap[0].reference }
  ], expectedRefs));
  assert.throws(() => assertAddressableParticipantMap([
    ...sampleMap, { number: 81, reference: ref('npc', 'extra') }
  ], expectedRefs));
  assert.throws(() => assertAddressableParticipantMap(sampleMap.slice(1), expectedRefs));
  const npc = await import('@rus/npc-runtime');
  assert.equal(typeof npc.parseNpcConversationReply, 'function');
  assert.equal(typeof npc.renderNpcConversationPrompt, 'function');
  const menu = scopedMenuChoice(npc, request, ({ contribution_kind, operation }) =>
    contribution_kind === 'speech' && operation == null);
  const probed = await probeAddressableParticipants(sceneCase, request, menu.choice);
  const npc3Probe = probed.addressable.find(({ reference }) =>
    isDeepStrictEqual(reference, npc3Ref));
  assert.deepEqual(probed.expected, expectedRefs);
  assert.ok(npc3Probe, 'the response parser must resolve npc:3 from a sent row number');
  assert.equal(typeof npc.buildNpcAvailableActions, 'function');
  assert.ok(menu.choice && typeof menu.choice.label === 'string');
  const baselinePlan = planOf(probed.baseline);
  const heardSpeaker = request.public_conversation_history.at(-1).speaker_ref;
  assert.equal(probed.baseline.error, null);
  assert.equal(baselinePlan?.contribution_kind, 'speech');
  assert.deepEqual(baselinePlan?.primary_addressee_ref, heardSpeaker);
  assert.deepEqual(baselinePlan?.intended_addressee_refs, [heardSpeaker]);
  assert.equal(parseCalls(probed.baseline, auditor).length, 1);
  assertP6Prompt(probed.baseline, probed.baselineAnswer);

  const baselineCall = parseCalls(probed.baseline, responder)[0];
  assert.ok(baselineCall, 'the baseline responder message must be captured');
  const contextLines = splitPrompt(baselineCall.messages).context.split(/\r?\n/u);
  const knowledgeStart = contextLines.findIndex((line) =>
    /^\s*(?:#{1,6}[ \t]*)?Что ты знаешь(?=$|[ \t:—–])/u.test(line));
  assert.ok(knowledgeStart >= 0, 'the sent context has no knowledge heading');
  const beliefsStart = contextLines.findIndex((line, index) => index > knowledgeStart
    && /^\s*(?:#{1,6}[ \t]*)?Во что веришь(?=$|[ \t:—–])/u.test(line));
  assert.ok(beliefsStart > knowledgeStart,
    'the sent context has no belief heading after the knowledge section');
  const knowledgeSection = contextLines.slice(knowledgeStart + 1, beliefsStart).join('\n');
  const knowledgeRows = numberedPromptLines([{ role: 'user', content: knowledgeSection }]);
  const nonParticipant = probed.rows.find(({ number, text }) =>
    knowledgeRows.some((row) => row.number === number && row.text === text));
  assert.ok(nonParticipant, 'the sent text includes a numbered knowledge row');
  const outsideNumber = Math.max(...probed.rows.map(({ number }) => number)) + 1;
  assert.equal(probed.rows.some(({ number }) => number === 0 || number === outsideNumber), false);
  for (const [label, number] of [['zero', 0], ['outside', outsideNumber],
    ['nonparticipant', nonParticipant.number]]) {
    const result = await probed.probe(number, label === 'nonparticipant');
    if (label === 'nonparticipant') {
      assert.deepEqual(result.repairs, ['semantic'], 'a repeated nonparticipant recipient requires one semantic repair');
      assertConversationFailure(result.outcome.error, result.repairs, 'semantic');
    }
    else assertSuccessfulFormatRepair({ error: result.outcome.error, repairs: result.repairs,
      plan: planOf(result.outcome) });
    assert.equal(result.addressable, false, `${label} recipient numbers are not addressable`);
  }
});

test('factory defaults a one-participant reply to the heard speaker without Кому', async () => {
  const scope = {
    allowed_duration_classes: ['domain_owned'],
    allowed_contribution_kinds: ['speech'],
    operation_contract: {}
  };
  const { sceneCase, request } = await canonicalWithScope('A1', scope);
  const heardSpeaker = request.public_conversation_history.at(-1).speaker_ref;
  const otherParticipants = request.allowed_references.actor_refs.filter((reference) =>
    !isDeepStrictEqual(reference, request.npc_ref));
  const npc = await import('@rus/npc-runtime');
  const menu = scopedMenuChoice(npc, request, ({ contribution_kind, operation }) =>
    contribution_kind === 'speech' && operation == null);
  const answer = speechChoiceText(menu.choice, {
    utterance: speechText, act: "приветствие"
  });
  const outcome = await runP6(sceneCase, request, {
    fetchResponses: [answer, auditGood]
  });
  const plan = planOf(outcome);
  assert.equal(typeof npc.buildNpcAvailableActions, 'function');
  assert.ok(menu.choice && typeof menu.choice.label === 'string');
  assert.equal(otherParticipants.length, 1);
  assert.equal(answer.split('\n').some((line) => line.startsWith('\u041a\u043e\u043c\u0443: ')), false);
  assert.equal(outcome.error, null);
  assert.deepEqual(plan?.primary_addressee_ref, heardSpeaker);
  assert.deepEqual(plan?.intended_addressee_refs, [heardSpeaker]);
  assert.equal(parseCalls(outcome, auditor).length, 1);
  assertP6Prompt(outcome, answer);
});

test('an unauthorized addressee is format-repaired for action and silence choices', async () => {
  const scopes = [
    { id: 'leave', contributionKind: 'leave_conversation', includeInstead: false,
      decisionScope: { allowed_duration_classes: ['domain_owned'],
        allowed_contribution_kinds: ['speech', 'silence', 'leave_conversation'],
        operation_contract: {} } },
    { id: 'silence', contributionKind: 'silence', includeInstead: true,
      decisionScope: { allowed_duration_classes: ['domain_owned'],
        allowed_contribution_kinds: ['speech', 'silence'], operation_contract: {} } }
  ];
  const requestCases = [];
  for (const scenario of scopes) {
    let npc3Ref;
    const { sceneCase, request } = await canonicalWithScope('A1',
      scenario.decisionScope, (value, source) => {
        const visibleNpc = source.frame.actors.find((actor) => actor.actor_id === '3');
        assert.ok(visibleNpc?.visible === true,
          'NPC3 must come from the recorded A1 frame');
        npc3Ref = ref('npc', visibleNpc.actor_id);
        if (!value.allowed_references.actor_refs.some((entry) =>
          isDeepStrictEqual(entry, npc3Ref))) {
          value.allowed_references.actor_refs = sortRefs([
            ...value.allowed_references.actor_refs, npc3Ref
          ]);
        }
        if (!value.allowed_references.entity_refs.some((entry) =>
          isDeepStrictEqual(entry, npc3Ref))) {
          value.allowed_references.entity_refs = sortRefs([
            ...value.allowed_references.entity_refs, npc3Ref
          ]);
        }
      });
    requestCases.push({ scenario, sceneCase, request, npc3Ref });
  }

  const npc = await import('@rus/npc-runtime');
  assert.equal(typeof npc.buildNpcAvailableActions, 'function');
  assert.equal(typeof npc.parseNpcConversationReply, 'function');
  assert.equal(typeof npc.renderNpcConversationPrompt, 'function');
  const recipientPrefix = '\u041a\u043e\u043c\u0443: ';
  const insteadPrefix = '\u0412\u043c\u0435\u0441\u0442\u043e \u043e\u0442\u0432\u0435\u0442\u0430: ';
  const insteadText = insteadPrefix + '\u041c\u043d\u0435 \u043d\u0435\u0447\u0435\u0433\u043e \u0434\u043e\u0431\u0430\u0432\u0438\u0442\u044c.';
  const outcomes = [];
  for (const entry of requestCases) {
    const { scenario, sceneCase, request, npc3Ref } = entry;
    const speechMenu = scopedMenuChoice(npc, request, ({ contribution_kind, operation }) =>
      contribution_kind === 'speech' && operation == null);
    assert.ok(speechMenu.choice && typeof speechMenu.choice.label === 'string',
      `${scenario.id}: the request must offer a speech response`);
    const probed = await probeAddressableParticipants(sceneCase, request, speechMenu.choice);
    const npc3Probe = probed.addressable.find(({ reference }) =>
      isDeepStrictEqual(reference, npc3Ref));
    assert.ok(npc3Probe, `${scenario.id}: npc:3 must be addressable from a sent row`);
    const menu = scopedMenuChoice(npc, request, ({ contribution_kind }) =>
      contribution_kind === scenario.contributionKind);
    const participantNumber = npc3Probe.number;
    const selection = selectedText(menu.choice);
    const repaired = selection + (scenario.includeInstead ? '\n' + insteadText : '');
    const invalid = selection + '\n' + recipientPrefix + participantNumber
      + (scenario.includeInstead ? '\n' + insteadText : '');
    const outcome = await runP6(sceneCase, request, {
      fetchResponses: [invalid, repaired]
    });
    outcomes.push({ ...entry, menu, participantNumber,
      invalid, repaired, outcome });
  }

  for (const entry of outcomes) {
    const { scenario, request, menu, participantNumber,
      invalid, repaired, outcome } = entry;
    const plan = planOf(outcome);
    assert.equal(outcome.error, null, scenario.id);
    assert.equal(plan?.contribution_kind, scenario.contributionKind, scenario.id);
    assert.equal(plan?.speech, null, scenario.id);
    assert.deepEqual(repairKinds(outcome), ['format'], scenario.id);
    assert.equal(parseCalls(outcome, auditor).length, 0, scenario.id);
    assert.ok(menu.choice && typeof menu.choice.label === 'string', scenario.id);
    assert.equal(menu.choice.contribution_kind, scenario.contributionKind, scenario.id);
    assert.ok(Number.isSafeInteger(participantNumber), scenario.id);
    assert.ok(invalid.includes(recipientPrefix + participantNumber), scenario.id);
    assert.equal(repaired.split('\n').some((line) => line.startsWith(recipientPrefix)), false,
      scenario.id);
    if (scenario.includeInstead) {
      assert.ok(invalid.includes(insteadPrefix), scenario.id);
      assert.ok(repaired.includes(insteadPrefix), scenario.id);
    }
    assert.equal(plan?.check, null, scenario.id);
    assert.equal(plan?.activity?.duration_class,
      request.decision_scope.allowed_duration_classes[0], scenario.id);
    assertP6Prompt(outcome, repaired);
  }
});

