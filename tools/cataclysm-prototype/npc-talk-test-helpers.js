import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLlmSettingsOwner } from '@rus/game-server';
import { buildNpcConversationResponseRequest, buildNpcDecisionBoundary,
  buildNpcDecisionSignal } from '@rus/npc-runtime';
import { requestNpcSemanticDecision } from '@rus/turn';
import { auditFreshNpcSpeech } from '../../apps/game-server/src/runtime/lower-dvina-trace-npc-speech-grounding-audit.js';
import { createP3AttemptBudget, createP3RoleRuntime, runP3NativeNpcFlow,
  runP3NativeNpcReply } from './p3-boundary.js';
import { loadP3NpcProfile } from './p3-npc-profile.js';
import { buildP3NpcConversationSubject, p3GameTimeOfTurn,
  projectP3NpcWire } from './p3-npc-subject.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const fixturesDirectory = path.join(directory, 'fixtures', 'npc-talk');
const defaultProfilesDirectory = path.join(fixturesDirectory, 'profiles');
const captureOnly = Symbol('capture only');

function clone(value) {
  return value == null ? value : structuredClone(value);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function loadScenes() {
  return readJson(path.join(fixturesDirectory, 'scenes.json'));
}

export function formatNpcConversationExchangeLine(exchange) {
  const answer = typeof exchange.npcText === 'string' && exchange.npcText !== ''
    ? `Ты ответил: «${exchange.npcText}»` : 'Ты не ответил.';
  return `Он сказал тебе: «${exchange.playerText}» ${answer}`;
}

export function npcSourceContent(sceneCase, profile) {
  const projection = sceneCase.projection ?? sceneCase.frame.npc_projections.find(row =>
    String(row.actor_id) === String(sceneCase.npcActorId));
  assert.ok(projection, 'source NPC projection is required');
  const npcId = String(sceneCase.npcActorId);
  const records = structuredClone(projection.conversation_memory ?? []);
  const turns = sceneCase.currentTurns.turns ?? [];
  const current = records.findLastIndex(record => record.kind === 'heard'
    && record.text === sceneCase.utterance && record.speaker_ref === 'avatar'
    && record.listener_ref === `npc:${npcId}` && turns.length > 0
    && record.turn >= Math.min(...turns) && record.turn <= Math.max(...turns));
  if (current >= 0) records.splice(current, 1);
  const label = reference => reference === `npc:${npcId}` ? 'я'
    : reference === 'avatar' ? 'собеседник' : 'другой человек';
  const time = turn => {
    const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
    const remainder = turn % 60;
    const divisor = gcd(remainder, 60);
    return { whole_minutes: String(Math.floor(turn / 60)),
      subminute_numerator: String(remainder / divisor),
      subminute_denominator: String(60 / divisor) };
  };
  const memory = records.map(record => {
    let summary;
    if (record.kind === 'said') summary = `Моя реплика. Кому: ${label(record.listener_ref)}. Слова: «${record.text}»`;
    else if (record.kind === 'silence') summary = `Моё молчание в ответ. Кому: ${label(record.listener_ref)}.`;
    else if (record.listener_ref === `npc:${npcId}`) summary =
      `Реплика, обращённая ко мне. Говорящий: ${label(record.speaker_ref)}. Слова: «${record.text}»`;
    else summary = `Чужая реплика. Говорящий: ${label(record.speaker_ref)}. Кому: ${label(record.listener_ref)}. Слова: «${record.text}»`;
    return { source_event_ref: null, summary, occurred_at: time(record.turn) };
  });
  const fact = (summary, resource_ref = null) => ({ source_event_ref: null,
    resource_ref, process_ref: null, summary, state: 'known' });
  const sourceKnowledge = profile?.knowledge_snapshot ?? {};
  const without = (rows, key) => (rows ?? []).map(({ [key]: ignored, ...content }) => content);
  return { projection, profile: profile?.npc_snapshot ?? {},
    knowledge: {
      known_facts: [...without(sourceKnowledge.known_facts, 'fact_ref'),
        fact(projection.gender === 'female' ? 'Я женщина.' : 'Я мужчина.'),
        ...(projection.job_description?.trim() ? [fact(projection.job_description.trim())] : []),
        ...(projection.visible_items ?? []).filter(item => item.owner_faction_id
          && item.owner_faction_id === projection.faction_id)
          .map(item => fact(`Вещь «${item.label}» принадлежит мне.`, item.item_ref))],
      beliefs: without(sourceKnowledge.beliefs, 'belief_ref'),
      hypotheses: without(sourceKnowledge.hypotheses, 'hypothesis_ref')
    }, memory };
}

export function assertNpcSourceContent(subject, source) {
  const lists = [['known_facts', 'fact_ref'], ['beliefs', 'belief_ref'],
    ['hypotheses', 'hypothesis_ref']];
  const canonical = value => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort()
      .map(key => [key, canonical(value[key])])) : value;
  const sorted = rows => rows.map(row => JSON.stringify(canonical(row))).sort();
  const fields = new Set(['source_event_ref', 'resource_ref', 'process_ref',
    'summary', 'state', 'confidence']);
  for (const [name, key] of lists) {
    const rows = subject.knowledge?.[name];
    assert.ok(Array.isArray(rows), `${name}: canonical source list missing`);
    const identifiers = rows.map(row => row[key]?.entity_id);
    assert.ok(identifiers.every(id => typeof id === 'string' && id.trim().length > 0),
      `${name}: every source unit needs a nonempty identifier`);
    assert.equal(new Set(identifiers).size, identifiers.length, `${name}: duplicate identifier`);
    const contents = rows.map(row => Object.fromEntries(Object.entries(row)
      .filter(([field]) => fields.has(field))));
    assert.deepEqual(sorted(contents), sorted(source.knowledge[name]), `${name}: source content lost or changed`);
  }
  const events = subject.memory?.recent_events;
  assert.ok(Array.isArray(events), 'canonical memory events missing');
  const ids = events.map(row => row.event_ref?.entity_id);
  assert.ok(ids.every(id => typeof id === 'string' && id.trim().length > 0), 'memory event identifier missing');
  assert.equal(new Set(ids).size, ids.length, 'duplicate memory event identifier');
  assert.deepEqual(events.map(({ event_ref: ignored, ...content }) => content), source.memory,
    'memory source text, participants, kind or turn lost or changed');
  if (subject.npc) {
    assert.equal(subject.npc.identity?.name_or_label, source.projection.name.trim() || null);
    for (const key of ['age_range', 'origin']) assert.equal(subject.npc.identity?.[key],
      source.profile.identity_state?.[key] ?? null, `NPC identity ${key} changed`);
    for (const key of ['temperament', 'values', 'goals', 'fears', 'obligations']) {
      assert.deepEqual(subject.npc[key], source.profile[key] ?? [], `NPC ${key} source content changed`);
    }
    assert.equal(subject.npc.social_role?.status, source.profile.social_role?.status ?? null);
  }
}

export function flowActionChoices(messages) {
  const choices = [];
  const visit = value => {
    if (value === null || typeof value !== 'object') return;
    if (typeof value.choice_id === 'string' && typeof value.label === 'string'
      && Object.hasOwn(value, 'operation')) choices.push(value);
    for (const child of Object.values(value)) visit(child);
  };
  for (const message of messages) {
    if (message.role !== 'user' || typeof message.content !== 'string') continue;
    try { visit(JSON.parse(message.content)); }
    catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      const start = message.content.indexOf('{');
      if (start >= 0) {
        try { visit(JSON.parse(message.content.slice(start))); }
        catch (nestedError) { if (!(nestedError instanceof SyntaxError)) throw nestedError; }
      }
    }
  }
  return choices;
}

export function assertFlowConversationChoices(messages) {
  const choices = flowActionChoices(messages);
  assert.ok(choices.length > 0, 'autonomous JSON must contain a nonempty action choice list');
  assert.ok(choices.some(choice => choice.label === 'говорить'
    && choice.operation?.op === 'request_conversation'),
  'autonomous JSON must offer говорить as request_conversation');
  return choices;
}

export function npcFrameDistance(sceneCase) {
  const npc = sceneCase.frame.actors.find(actor => String(actor.actor_id) === String(sceneCase.npcActorId));
  const player = sceneCase.frame.actors.find(actor => actor.actor_ref === 'avatar');
  assert.ok(npc?.position?.length === 3 && player?.position?.length === 3,
    'source actor positions are required');
  return Math.max(...npc.position.map((value, index) => Math.abs(value - player.position[index])));
}

export function expectedNpcActionLabels(sceneCase, reachable) {
  return ['говорить', 'промолчать',
    ...(npcFrameDistance(sceneCase) > 1 && reachable.approach ? ['подойти'] : []),
    ...(reachable.retreat ? ['отойти'] : [])];
}

export function assertNpcActionLabels(labels, expected, allowSilence = false) {
  assert.ok(Array.isArray(labels) && labels.length > 0, 'action list must be nonempty');
  assert.equal(new Set(labels).size, labels.length, 'duplicate action names');
  const mandatory = values => values.filter(value => !allowSilence || value !== 'промолчать').sort();
  assert.deepEqual(mandatory(labels), mandatory(expected), 'action list differs from independent source rules');
}

export function assertNpcReachabilityQueries(calls, sceneCase, reachable) {
  const npcRef = `npc:${sceneCase.npcActorId}`;
  const player = sceneCase.frame.actors.find(actor => actor.actor_ref === 'avatar');
  const queries = calls.filter(call => call.method === 'queryPath');
  assert.ok(queries.length > 0, 'native reachability queries are required');
  const retreat = queries.filter(call => call.request.actorRef === npcRef && call.request.targetRadius === 0);
  assert.ok(retreat.length > 0, 'native retreat reachability was not queried');
  assert.ok(retreat.every(call => call.response?.reachable === reachable.retreat),
    'retreat queries must use the independent oracle');
  if (npcFrameDistance(sceneCase) > 1) {
    const approach = queries.filter(call => call.request.actorRef === npcRef && call.request.targetRadius === 1
      && JSON.stringify(call.request.targetPosition) === JSON.stringify(player.position));
    assert.ok(approach.length > 0, 'native approach reachability was not queried');
    assert.ok(approach.every(call => call.response?.reachable === reachable.approach),
      'approach queries must use the independent oracle');
  }
}

export async function loadOverflow() {
  return readJson(path.join(fixturesDirectory, 'overflow.json'));
}

export function assertPostRejectionMemory(request, sentText, rejectedText, acceptedText) {
  assert.ok(request?.memory, 'a subsequent request with memory is required');
  const memory = JSON.stringify(request.memory);
  assert.ok(memory.includes(acceptedText), 'subsequent memory must contain applied repaired speech');
  assert.equal(memory.includes(rejectedText), false, 'rejected speech entered subsequent memory');
  assert.equal(sentText.includes(rejectedText), false, 'rejected speech entered subsequent prompt');
}

export function npcExchangePresence(exchanges, text) {
  const lines = text.split(/\r?\n/u).map((line, lineIndex) => ({ lineIndex,
    text: numberedPromptLines([{ role: 'user', content: line }])[0]?.text ?? line.trim() }))
    .filter(row => row.text.includes('Он сказал тебе:'));
  const rows = exchanges.map(exchange => ({ id: exchange.id, lineIndex: -1, complete: false, partial: false }));
  const issues = [];
  let cursor = exchanges.length - 1;
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index];
    let found = -1;
    for (let n = cursor; n >= 0; n--) {
      if (line.text === formatNpcConversationExchangeLine(exchanges[n])) { found = n; break; }
    }
    if (found >= 0) {
      rows[found] = { ...rows[found], lineIndex: line.lineIndex, complete: true };
      cursor = found - 1;
    } else {
      issues.push('non-source-history-line');
      const partial = exchanges.findIndex(exchange => line.text.includes(exchange.playerText));
      if (partial >= 0) { rows[partial].partial = true; issues.push(`partial:${exchanges[partial].id}`); }
    }
  }
  const retained = rows.flatMap((row, index) => row.complete ? [index] : []);
  if (retained.length > 0 && (retained[0] + retained.length !== exchanges.length
    || retained.some((index, offset) => index !== retained[0] + offset))) issues.push('non-contiguous-suffix');
  return { rows, issues, historyLineCount: lines.length };
}

export function assertNpcExchangeHistory(text, exchanges, { suffix = false } = {}) {
  const presence = npcExchangePresence(exchanges, text);
  assert.deepEqual(presence.issues, [], 'history must contain exact source exchanges as a contiguous suffix');
  const retained = presence.rows.filter(row => row.complete);
  assert.equal(presence.historyLineCount, retained.length, 'extra history line');
  if (suffix && exchanges.length > 0) assert.ok(retained.length > 0, 'history suffix must be nonempty');
  else assert.equal(retained.length, exchanges.length, 'history must contain every source exchange');
  return presence;
}

export function assertCurrentNpcUtterance(current, utterance) {
  const section = /(?:Что ты слышишь|Ты слышишь)\s*[:—–]?([^]*?)(?=\n\s*(?:Что было|Ты можешь)|$)/u.exec(current);
  assert.ok(section, 'current hearing section is required');
  assert.ok(section[1].includes(utterance), 'current hearing section lost the player utterance');
}

export function assertNoNpcSystemLines(messages, system) {
  const lines = system.split(/\r?\n/u).filter(line => line.trim().length > 0);
  assert.ok(lines.length > 0, 'NPC system must contain nonempty lines');
  const text = messages.map(message => message.content).join('\n');
  assert.equal(lines.some(line => text.includes(line)), false, 'NPC system line leaked into auditor input');
}

export function assertConversationFailure(error, repairKinds, category = null) {
  assert.equal(error?.code, 'TURN_NPC_CONVERSATION_CONTRACT_FAILURE', 'typed conversation refusal required');
  assert.equal(error?.details?.contract_error, 'conversation_llm_contract_failure', 'contract_error is required');
  assert.ok(['format', 'semantic'].includes(error?.details?.category), 'typed refusal category');
  if (category !== null) assert.equal(error.details.category, category);
  assert.ok(repairKinds.length <= 2, 'third repair is forbidden');
  assert.deepEqual(error.details.repair_kinds_used, repairKinds, 'repair accounting must match actual calls');
}

export function assertNpcSpeechBounds({ audited, accepted, error, repairs }, honest = null) {
  for (const text of audited) assert.ok(unicodeLength(text) <= 400, 'audited NPC speech exceeds 400 code points');
  if (accepted !== null) assert.ok(unicodeLength(accepted) <= 400, 'accepted NPC speech exceeds 400 code points');
  if (error) assertConversationFailure(error, repairs);
  else assert.equal(typeof accepted, 'string', 'successful speech must be present');
  if (honest !== null) {
    assert.equal(error, null, 'honest speech must be accepted');
    assert.equal(accepted, honest, 'honest speech must remain whole');
    assert.ok(audited.length > 0, 'honest speech must reach the auditor');
    assert.ok(audited.includes(honest), 'the auditor must receive the whole honest speech');
  }
}

export function npcFrameReferences(sceneCase) {
  const hero = sceneCase.frame.actors.find(actor => actor.actor_ref === 'avatar');
  assert.ok(hero, 'source frame must contain the avatar');
  return { npc: { entity_kind: 'npc', entity_id: String(sceneCase.npcActorId) },
    hero: { entity_kind: 'player_character', entity_id: String(hero.actor_id) } };
}

export function assertNpcActorReferences(request, plan, expected, movement = null) {
  assert.deepEqual(request?.npc_ref, expected.npc, 'request NPC must match the source frame');
  const actors = request?.allowed_references?.actor_refs;
  assert.ok(Array.isArray(actors) && actors.length > 0, 'request actor refs must be nonempty');
  assert.ok(actors.some(ref => ref.entity_kind === expected.hero.entity_kind
    && ref.entity_id === expected.hero.entity_id), 'request hero must match the source frame');
  if (movement) {
    assert.deepEqual(movement.actor_ref, expected.npc, 'movement executor must match the source frame');
    assert.deepEqual(movement.target_ref, expected.hero, 'movement target must match the source frame');
  } else {
    assert.deepEqual(plan?.speaker_ref, expected.npc, 'speaker must match the source frame');
    assert.deepEqual(plan?.primary_addressee_ref, expected.hero, 'addressee must match the source frame');
    assert.deepEqual(plan?.intended_addressee_refs, [expected.hero]);
  }
}

export function npcParticipantRows(messages) {
  const rows = [];
  for (const message of messages) {
    if (message.role !== 'user') continue;
    let excluded = false;
    for (const line of message.content.split(/\r?\n/u)) {
      if (/^\s*(?:#{1,6}\s*)?(?:Что было|Что ты слышишь|Ты слышишь)(?=$|[ :—–])/u.test(line)) excluded = true;
      else if (/^\s*(?:#{1,6}\s*)?(?:Кто ты|Что ты знаешь|Во что веришь|Сейчас|Ты можешь|Участники|С кем говоришь)(?=$|[ :—–])/u.test(line)) excluded = false;
      if (!excluded) rows.push(...numberedPromptLines([{ role: 'user', content: line }]));
    }
  }
  return rows;
}

export function assertNpcParticipantBindings(addressable, rows, sceneCase, expected) {
  assert.ok(expected.length > 0, 'source participants must be nonempty');
  const key = ref => `${ref.entity_kind}:${ref.entity_id}`;
  assert.deepEqual(addressable.map(row => key(row.reference)).sort(), expected.map(key).sort(),
    'addressable refs must equal source participants');
  assert.equal(new Set(addressable.map(row => row.number)).size, expected.length, 'participant numbers must be unique');
  const sources = expected.map(reference => {
    const actor = sceneCase.frame.actors.find(actor => String(actor.actor_id) === reference.entity_id
      && (reference.entity_kind === 'player_character' ? actor.actor_ref === 'avatar' : actor.actor_ref !== 'avatar'));
    assert.ok(actor, 'participant reference must belong to the source frame');
    return { reference, actor, name: typeof actor.name === 'string' ? actor.name.trim() : '' };
  });
  const exceptions = [];
  for (const source of sources) {
    let reason = !source.name ? 'в кадре нет имени' : null;
    const allNamed = sceneCase.frame.actors.filter(actor => typeof actor.name === 'string' && actor.name.trim());
    if (!reason && allNamed.filter(actor => actor.name.trim() === source.name).length !== 1) reason = 'имя не уникально в кадре';
    const matching = rows.filter(row => source.name && row.text.includes(source.name)
      && !allNamed.some(actor => String(actor.actor_id) !== String(source.actor.actor_id)
        && row.text.includes(actor.name.trim())));
    if (!reason && matching.length !== 1) reason = `подходящих строк: ${matching.length}, требуется одна`;
    if (reason) { exceptions.push({ frame: sceneCase.id, participant: key(source.reference), reason }); continue; }
    const resolved = addressable.find(row => row.number === matching[0].number);
    assert.deepEqual(resolved?.reference, source.reference, 'participant number must resolve to the named source actor');
  }
  return exceptions;
}

export function assertSuccessfulFormatRepair({ error, repairs, plan }) {
  assert.equal(error, null, 'invalid recipient must be repaired to success');
  assert.deepEqual(repairs, ['format'], 'invalid recipient requires exactly one format repair');
  assert.ok(plan, 'a repaired contribution plan is required');
}

export async function assertNpcCheckDependence(readSurfaces, check) {
  const baseline = clone(await readSurfaces(clone(check)));
  assert.deepEqual(await readSurfaces(clone(check)), baseline, 'social option surfaces must be deterministic');
  const probes = [
    ['purpose', value => { value.purpose = 'Уговорить остаться у ворот'; }],
    ['difficulty_band', value => { value.difficulty_band = 'dangerous'; }],
    ['outcomes.delivery_quality', value => { value.outcomes.clean_success.delivery_quality = 'credible'; }],
    ['outcomes.observable_effects', value => { value.outcomes.clean_success.observable_effects = ['speaker_exposes_urgency']; }],
    ['outcomes.removal', value => { delete value.outcomes.severe_failure; }]
  ];
  for (const [component, mutate] of probes) {
    const changed = clone(check);
    mutate(changed);
    assert.notDeepEqual(changed, check, `probe must change ${component}`);
    const surfaces = clone(await readSurfaces(changed));
    assert.deepEqual(await readSurfaces(clone(changed)), surfaces,
      `social option surfaces must repeat for ${component}`);
    assert.notDeepEqual(surfaces, baseline, `social option does not depend on ${component}`);
  }
}

export function assertNpcStackLine(messages, name, count) {
  const rows = numberedPromptLines(messages).filter(row => row.text.includes(name));
  assert.ok(rows.length > 0, 'native stack must have a numbered row');
  const matching = rows.filter(row => new RegExp(`(?:^|\\D)${count}(?:\\D|$)`, 'u').test(row.text));
  assert.equal(matching.length, 1, 'native stack count must match the changed source');
}

export function assertNpcActivityText(text, verb, previous) {
  assert.ok(verb && previous && verb !== previous, 'two distinct source activity verbs are required');
  assert.ok(text.includes(verb), 'current native activity verb must reach the prompt');
  assert.equal(text.includes(previous), false, 'previous native activity verb must be absent');
  assert.doesNotMatch(text, /\bACT_[A-Z0-9_]+\b/u);
}

export function assertNpcNameOccurrences(text, name, expected) {
  assert.ok(name.length > 0, 'source member name is required');
  assert.equal(text.split(name).length - 1, expected, 'member mentions must match independent source count');
}

export function npcMealDescription(text) {
  const rows = text.split(/\r?\n/u).filter(line => /(?:(?<![а-яё])ел[аи]?(?![а-яё])|ед[ауы]|пищ|трапез|куша|поел)/iu.test(line));
  assert.ok(rows.length > 0, 'a meal description is required');
  return rows.join('\n');
}

export function assertNpcMealDescriptions(left, right, durations) {
  assert.equal(durations.length, 2);
  assert.notEqual(durations[0], durations[1], 'meal source durations must differ');
  assert.notEqual(npcMealDescription(left), npcMealDescription(right),
    'one meal description cannot represent both source durations');
}

export function assertIntentLoudness(actual, expected) {
  assert.equal(actual, expected, 'speech loudness must follow player intent');
}

export function assertSuppliedSpeechOptions(options, words) {
  assert.ok(options.length > 0, 'supplied speech options must be nonempty');
  assert.ok(options.every(({ content }) => content === words), 'speech options must contain only supplied words');
}

export async function loadNativeMovementCase(id,
  nativeDirectory = process.env.P3_NATIVE_NPC_FRAME_DIR) {
  if (typeof nativeDirectory !== 'string' || !nativeDirectory.trim()) {
    throw new Error('P3_NATIVE_NPC_FRAME_DIR_REQUIRED');
  }
  const oracle = await readJson(path.join(nativeDirectory, 'movement-oracle.json'));
  const movementCase = oracle?.cases?.find(entry => entry.id === id);
  if (!movementCase) throw new Error(`P3_NATIVE_MOVEMENT_CASE_NOT_FOUND:${id}`);
  if (movementCase.frame && typeof movementCase.frame === 'object') {
    return { ...movementCase, frame: clone(movementCase.frame) };
  }
  if (typeof movementCase.frame !== 'string' || !movementCase.frame.trim()) {
    throw new Error(`P3_NATIVE_MOVEMENT_FRAME_REQUIRED:${id}`);
  }
  return { ...movementCase,
    frame: await readJson(path.resolve(nativeDirectory, movementCase.frame)) };
}

function fetchRequest(input, init) {
  let payload = null;
  if (typeof init?.body === 'string') {
    try { payload = JSON.parse(init.body); } catch { payload = init.body; }
  }
  return { url: String(input), method: init?.method ?? 'GET',
    headers: clone(init?.headers ?? null), body: payload, payload,
    rawBody: init?.body ?? null };
}

function responseContent(value) {
  if (value instanceof Response) return value;
  if (value === captureOnly) throw Object.assign(new Error('P3_TEST_CAPTURE_ONLY'), {
    code: 'P3_TEST_CAPTURE_ONLY'
  });
  if (value && typeof value === 'object'
      && Array.isArray(value.choices)) {
    return new Response(JSON.stringify(value), { status: 200,
      headers: { 'content-type': 'application/json' } });
  }
  const content = typeof value === 'string' ? value
    : typeof value?.content === 'string' ? value.content
      : JSON.stringify(value);
  return new Response(JSON.stringify({ id: 'npc-talk-test', object: 'chat.completion',
    created: 0, model: 'test', choices: [{ index: 0,
      message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }), {
    status: 200, headers: { 'content-type': 'application/json' }
  });
}

export async function withCapturedFetch(responses, callback) {
  if (typeof callback !== 'function') throw new TypeError('callback required');
  const originalFetch = globalThis.fetch;
  const calls = [];
  let responseIndex = 0;
  globalThis.fetch = async (input, init = {}) => {
    const call = fetchRequest(input, init);
    calls.push(call);
    let response;
    if (typeof responses === 'function') response = await responses(call);
    else {
      const item = responses?.[responseIndex++];
      if (item === undefined) throw new Error('P3_TEST_FETCH_RESPONSE_MISSING');
      response = typeof item === 'function' ? await item(call) : item;
    }
    const outgoing = responseContent(response);
    call.responseText = await outgoing.clone().text();
    try { call.response = JSON.parse(call.responseText); }
    catch { call.response = call.responseText; }
    return outgoing;
  };
  try {
    return await callback({ calls });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function settingsOwner() {
  return createLlmSettingsOwner({ initialRecord: {
    version: 2,
    settings: { mode: 'custom', compatibility: 'openai_compatible',
      base_url: 'http://127.0.0.1:8000/v1',
      model: 'qwen3.8-27b-uncensored-w4a16-tp2', api_key: 'test-secret' }
  } });
}

function defaultResponse(roleCall) {
  const validSpeech = ['Выбор: говорить', 'Речь: Здравствуй.',
    'Поступок: приветствие', 'Опора: —', 'Неправда: —', 'Утаил: —'].join('\n');
  if (roleCall?.role_id === 'npc_conversation_responder') return validSpeech;
  if (roleCall?.role_id === 'npc_conversation_responder_format_repair') {
    return validSpeech;
  }
  if (roleCall?.role_id === 'npc_conversation_grounding_auditor') return 'годно';
  throw new Error(`P3_TEST_FETCH_RESPONSE_REQUIRED:${roleCall?.role_id ?? 'unknown'}`);
}

function makeResponseSource(sceneCase, options, calls) {
  if (options.captureOnly === true) return () => captureOnly;
  const configured = options.fetchResponses;
  if (typeof configured === 'function') {
    return fetchCall => configured(fetchCall, clone(calls.at(-1) ?? null), sceneCase);
  }
  if (Array.isArray(configured)) {
    let index = 0;
    return fetchCall => {
      const response = configured[index++];
      if (response === undefined) throw new Error('P3_TEST_FETCH_RESPONSE_MISSING');
      return typeof response === 'function'
        ? response(fetchCall, clone(calls.at(-1) ?? null), sceneCase) : response;
    };
  }
  return () => defaultResponse(calls.at(-1));
}

function nativeAdapterFor(sceneCase, options, nativeCalls, events, nextOrder) {
  const frame = options.frame ?? sceneCase.frame ?? options.nativeObservation;
  if (!frame || typeof frame !== 'object') throw new Error('P3_TEST_NATIVE_FRAME_REQUIRED');
  const overrides = options.nativeAdapterOverrides ?? {};
  return {
    async refreshObservation(...args) {
      const call = { method: 'refreshObservation', args: clone(args),
        order: nextOrder(), afterRoleCalls: events.filter(event => event.type === 'role').length };
      nativeCalls.push(call);
      events.push({ type: 'native', ...call });
      return typeof overrides.refreshObservation === 'function'
        ? overrides.refreshObservation(...args) : clone(frame);
    },
    async queryPath(request, ...args) {
      const call = { method: 'queryPath', request: clone(request), args: clone(args),
        order: nextOrder(), afterRoleCalls: events.filter(event => event.type === 'role').length };
      nativeCalls.push(call);
      events.push({ type: 'native', ...call });
      call.response = clone(await (typeof overrides.queryPath === 'function'
        ? overrides.queryPath(request, ...args) : { reachable: true }));
      return call.response;
    },
    async execute(envelope, ...args) {
      const call = { method: 'execute', envelope: clone(envelope), args: clone(args),
        order: nextOrder(), afterRoleCalls: events.filter(event => event.type === 'role').length };
      nativeCalls.push(call);
      events.push({ type: 'native', ...call });
      if (typeof overrides.execute === 'function') return overrides.execute(envelope, ...args);
      const actorId = String(envelope.actor_id);
      const playerId = String(frame.actors?.find(actor => actor.actor_ref === 'avatar')?.actor_id ?? '');
      const silent = envelope.args?.contribution_kind === 'silence';
      return { schema: 'p3_native_operation_readback_v1',
        operation_id: envelope.operation_id, status: 'applied',
        native_effect: { effect_status: 'confirmed', primitive: 'speak',
          actor_id: actorId, speakerId: actorId,
          contribution_kind: silent ? 'silence' : 'speech',
          ...(silent ? { visible_behavior: envelope.args.visible_behavior,
            actualHeardListenerIds: [] }
            : { utterance: envelope.args.utterance,
              actualHeardListenerIds: [playerId] }) },
        before: { turn: frame.turn }, after: { turn: frame.turn } };
    }
  };
}

async function withRuntime(sceneCase, options, invoke) {
  const calls = [];
  const httpCalls = [];
  const nativeCalls = [];
  const events = [];
  let sequence = 0;
  const nextOrder = () => ++sequence;
  let result = null;
  let error = null;
  const budget = createP3AttemptBudget({ budget: options.budget ?? 72,
    onAttempt: event => {
      if (event.phase === 'before') {
        const input = clone(event.input);
        calls.push(input);
        events.push({ type: 'role', input, order: nextOrder() });
      }
    } });
  try {
    const runtime = createP3RoleRuntime({ env: {}, settingsOwner: settingsOwner(), budget });
    const nativeAdapter = nativeAdapterFor(sceneCase, options, nativeCalls, events, nextOrder);
    const responses = makeResponseSource(sceneCase, options, calls);
    await withCapturedFetch(responses, async ({ calls: captured }) => {
      try { result = await invoke({ runtime, nativeAdapter }); }
      catch (caught) { error = caught; }
      httpCalls.push(...captured);
    });
  } catch (caught) {
    error = caught;
  }
  return { result, error, calls, httpCalls, nativeCalls, events };
}

function actorRefs(frame, targetActorRef) {
  const actor = frame.actors?.find(row => row.actor_ref === targetActorRef);
  const player = frame.actors?.find(row => row.actor_ref === 'avatar');
  if (!actor || !player) throw new Error('P3_TEST_REPLY_ACTORS_REQUIRED');
  return { actor, player,
    npcRef: { entity_kind: 'npc', entity_id: String(actor.actor_id) },
    playerRef: { entity_kind: 'player_character', entity_id: String(player.actor_id) } };
}

function reconstructedTurns(sceneCase) {
  const turns = sceneCase.currentTurns?.turns;
  if (!Array.isArray(turns) || turns.some(turn => !Number.isSafeInteger(turn))) {
    throw new Error(`P3_TEST_CURRENT_TURNS_INVALID:${sceneCase.id}`);
  }
  const readback = sceneCase.playerReadback;
  if (readback == null) {
    const recordedA2 = sceneCase.id === 'A2'
      && sceneCase.currentTurns.reason === 'no source readback; factory-only A2 case'
      && sceneCase.currentTurns.source?.path === 'capture/inputs.log'
      && sceneCase.currentTurns.source?.line === 22;
    const nativeSource = sceneCase.currentTurns.source;
    const nativeCapture = sceneCase.id.startsWith('native-')
      && nativeSource?.kind === 'native_capture'
      && typeof nativeSource.frame === 'string' && nativeSource.frame.trim();
    if (sceneCase.currentTurns.reconstructed !== false || turns.length !== 0
        || (!recordedA2 && !nativeCapture)) {
      throw new Error(`P3_TEST_FACTORY_ONLY_TURNS_INVALID:${sceneCase.id}`);
    }
  } else {
    if (sceneCase.currentTurns.reconstructed !== true) {
      throw new Error(`P3_TEST_RECONSTRUCTION_MARKER_MISSING:${sceneCase.id}`);
    }
    const sourceTurns = [...new Set([readback.before?.turn, readback.after?.turn,
      sceneCase.frame?.turn].filter(Number.isSafeInteger))].sort((left, right) => left - right);
    const restoredTurns = [...new Set(turns)].sort((left, right) => left - right);
    if (JSON.stringify(restoredTurns) !== JSON.stringify(sourceTurns)) {
      throw new Error(`P3_TEST_RESTORED_TURN_WINDOW_MISMATCH:${sceneCase.id}`);
    }
  }
  return new Set(turns);
}

export async function buildCanonicalRequest(sceneCase, { profilesDir = defaultProfilesDirectory } = {}) {
  const frame = sceneCase.frame;
  const targetActorRef = sceneCase.targetActorRef;
  const utterance = sceneCase.utterance;
  if (!frame || typeof targetActorRef !== 'string' || typeof utterance !== 'string') {
    throw new Error(`P3_TEST_CANONICAL_INPUT_INVALID:${sceneCase?.id ?? 'unknown'}`);
  }
  const { actor, player, npcRef, playerRef } = actorRefs(frame, targetActorRef);
  const projection = sceneCase.projection
    ?? frame.npc_projections?.find(row => row.actor_id === actor.actor_id);
  if (!projection || String(projection.actor_id) !== String(actor.actor_id)) {
    throw new Error(`P3_TEST_NPC_PROJECTION_REQUIRED:${sceneCase.id}`);
  }
  const profile = projection.template_id
    ? await loadP3NpcProfile(projection.template_id, { profilesDir }) : null;
  const readback = sceneCase.playerReadback;
  // Ссылка нужна только фабрике: запись не содержит услышанной реплики.
  const operationId = readback?.operation_id ?? `factory-${sceneCase.id}`;
  const perceptionRef = { entity_kind: 'perception_result',
    entity_id: `p3-heard-${operationId}-${actor.actor_id}` };
  const subject = buildP3NpcConversationSubject({ projection, profile, frame, player,
    npcRef, playerRef, perceptionRef, utterance,
    currentTurns: reconstructedTurns(sceneCase) });
  const at = p3GameTimeOfTurn(frame.turn);
  const source = { entity_kind: 'event', entity_id: `p3-speech-${operationId}` };
  const signal = buildNpcDecisionSignal({ occurred_at: at, category: 'communication',
    significance: 'material', source_event_ref: source, subject_ref: npcRef,
    scope_refs: [], perception_required: false });
  const signalRef = { entity_kind: 'npc_decision_signal', entity_id: signal.signal_id };
  const stateVersion = frame.turn + 1;
  const boundary = buildNpcDecisionBoundary({ decision_mode: 'conversation',
    scheduled_at: at, npc_ref: npcRef,
    same_time_batch_ref: { entity_kind: 'temporal_batch', entity_id: `p3-speech-${operationId}` },
    significance: 'material', categories: ['communication'], signal_refs: [signalRef],
    state_version: String(stateVersion) });
  return buildNpcConversationResponseRequest({
    schema: 'npc_conversation_response_request_v1',
    request_id: `p3-reply-${operationId}-${actor.actor_id}`,
    boundary_id: boundary.boundary_id,
    conversation_id: `p3-conversation-npc${actor.actor_id}-pc${player.actor_id}`,
    exchange_id: `p3-exchange-${operationId}`,
    state_version: stateVersion, requested_at: at, npc_ref: npcRef,
    decision_reasons: { significance: 'material', categories: ['communication'],
      signal_refs: [signalRef], perceived_changes: [utterance] },
    npc: subject.npc,
    perceived_message: { source_statement_ref: { entity_kind: 'conversation_statement',
      entity_id: `p3-player-speech-${operationId}` }, perception_result_ref: perceptionRef },
    public_conversation_history: [...subject.public_conversation_history,
      { speaker_ref: playerRef, utterance_text: utterance }],
    knowledge: subject.knowledge, memory: subject.memory, social_context: {},
    available_resources: subject.available_resources,
    allowed_references: { actor_refs: [npcRef, playerRef], entity_refs: subject.entity_refs,
      knowledge_refs: subject.knowledge_refs, combat_target_refs: [] },
    decision_scope: { conversation_mode: true, action_handoff_available: false,
      combat_handoff_available: false, allowed_attribute_refs: [], allowed_skill_refs: [],
      allowed_check_profile_refs: [], allowed_duration_classes: ['moment', 'brief', 'short', 'domain_owned'],
      allowed_contribution_kinds: ['speech', 'silence'], operation_contract: {} }
  });
}

export async function runReply(sceneCase, options = {}) {
  const mode = options.mode === 'factory_only' || sceneCase.playerReadback == null
    ? 'factory_only' : 'reply';
  const request = mode === 'factory_only'
    ? await buildCanonicalRequest(sceneCase, options) : null;
  const captured = await withRuntime(sceneCase, options, async ({ runtime, nativeAdapter }) => {
    if (mode === 'factory_only') return runtime.npcConversationModel(request);
    return runP3NativeNpcReply({ nativeAdapter,
      observation: options.frame ?? options.nativeObservation ?? sceneCase.frame,
      playerReadback: options.playerReadback ?? sceneCase.playerReadback,
      semanticModel: runtime.npcConversationModel,
      targetActorRef: options.targetActorRef ?? sceneCase.targetActorRef,
      maxRepairAttempts: options.maxRepairAttempts ?? 2,
      profilesDir: options.profilesDir ?? defaultProfilesDirectory });
  });
  const proposal = mode === 'reply' ? captured.result?.proposal ?? null : null;
  return { ...captured, proposal,
    request: mode === 'factory_only' ? request
      : proposal?.decision_context?.request ?? null,
    mode, plan: mode === 'factory_only' ? captured.result
      : proposal?.plan ?? null };
}

export async function runCanonicalDecision(sceneCase, canonicalRequest, options = {}) {
  const request = buildNpcConversationResponseRequest(canonicalRequest);
  const operationId = request.exchange_id.startsWith('p3-exchange-')
    ? request.exchange_id.slice('p3-exchange-'.length) : null;
  if (!operationId) throw new Error(`P3_TEST_CONVERSATION_EXCHANGE_ID_INVALID:${sceneCase.id}`);
  const boundary = buildNpcDecisionBoundary({ decision_mode: 'conversation',
    scheduled_at: request.requested_at, npc_ref: request.npc_ref,
    same_time_batch_ref: { entity_kind: 'temporal_batch', entity_id: `p3-speech-${operationId}` },
    significance: request.decision_reasons.significance,
    categories: request.decision_reasons.categories,
    signal_refs: request.decision_reasons.signal_refs,
    state_version: String(request.state_version) });
  if (boundary.boundary_id !== request.boundary_id) {
    throw new Error(`P3_TEST_CONVERSATION_BOUNDARY_MISMATCH:${sceneCase.id}`);
  }
  const captured = await withRuntime(sceneCase, options, async ({ runtime }) =>
    requestNpcSemanticDecision({ boundary, request,
      semanticModel: runtime.npcConversationModel,
      maxRepairAttempts: options.maxRepairAttempts ?? 2,
      revalidateStateVersion: async () => request.state_version,
      validateFreshPlan: runtime.npcConversationModel.validateFreshPlan ?? null }));
  const proposal = captured.result ?? null;
  return { ...captured, proposal,
    request: proposal?.decision_context?.request ?? request,
    plan: proposal?.plan ?? null, mode: 'canonical_decision' };
}

export async function runFlow(sceneCase, options = {}) {
  const captured = await withRuntime(sceneCase, options, async ({ runtime, nativeAdapter }) =>
    runP3NativeNpcFlow({ nativeAdapter, actorId: String(options.actorId ?? sceneCase.npcActorId),
      nativeObservation: options.frame ?? options.nativeObservation ?? sceneCase.frame,
      semanticModel: runtime.npcAutonomousModel,
      conversationModel: runtime.npcConversationModel,
      profilesDir: options.profilesDir ?? defaultProfilesDirectory,
      maxRepairAttempts: options.maxRepairAttempts ?? 2,
      replay: options.replay ?? new Map(), evidence: options.evidence ?? null }));
  const decision = captured.result?.decision ?? null;
  const proposal = captured.result?.proposal ?? null;
  const request = proposal?.decision_context?.request
    ?? decision?.proposal?.decision_context?.request
    ?? decision?.decision_context?.request ?? null;
  const plan = proposal?.plan ?? decision?.proposal?.plan ?? decision?.plan ?? null;
  return { ...captured, proposal, request, mode: 'flow', plan };
}

export async function runAudit(request, plan, options = {}) {
  const sceneCase = options.sceneCase ?? { frame: { turn: 0 }, npcActorId: '0' };
  const captured = await withRuntime(sceneCase, { ...options,
    captureOnly: options.captureOnly ?? true }, async ({ runtime }) =>
    auditFreshNpcSpeech({ roleRunner: runtime.roleRunner, plan, request,
      requestWire: projectP3NpcWire }));
  return { ...captured, request, plan, mode: 'audit' };
}

export function unicodeLength(value) {
  if (typeof value !== 'string') throw new TypeError('text must be a string');
  return [...value].length;
}

function jsonStructuredSubstring(text) {
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== '{' && text[start] !== '[') continue;
    const stack = [];
    let quoted = false;
    let escaped = false;
    for (let end = start; end < text.length; end++) {
      const character = text[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') { quoted = true; continue; }
      if (character === '{' || character === '[') stack.push(character);
      else if (character === '}' || character === ']') {
        const open = stack.pop();
        if ((open === '{' && character !== '}') || (open === '[' && character !== ']')) break;
        if (stack.length === 0) {
          try { JSON.parse(text.slice(start, end + 1)); return true; }
          catch { break; }
        }
      }
    }
  }
  return false;
}

export function assertPlainPrompt(messages) {
  assert.ok(Array.isArray(messages), 'prompt messages must be an array');
  assert.ok(messages.some(message => message?.role === 'user'),
    'prompt must contain a user message');
  for (const { role, content } of messages) {
    assert.equal(typeof content, 'string', 'message content must be plain text');
    assert.equal(jsonStructuredSubstring(content), false,
      'user content must not contain a JSON object or array');
    assert.doesNotMatch(content, /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/iu,
      'user content must not contain UUIDs');
    assert.doesNotMatch(content, /\b(?:npc|player|avatar|actor|entity|event|request|boundary|conversation|exchange|memory|knowledge|belief|fact|resource|perception|signal):[\w.-]+/iu,
      'user content must not contain serialized references');
    assert.doesNotMatch(content, /\b[\p{L}_][\p{L}\p{N}_.-]*:[\p{L}\p{N}_.-]+/iu,
      'user content must not contain namespaced identifiers');
    assert.doesNotMatch(content, /\b[\p{L}_][\p{L}\p{N}_]*_(?:id|ref)\b/iu,
      'user content must not contain serialized reference field names');
  }
  for (const { role, content } of messages) {
    assert.match(content, /\p{Script=Cyrillic}/u,
      `${role ?? 'prompt'} content must be written in Russian`);
  }
  return true;
}

export function splitPrompt(messages) {
  assert.ok(Array.isArray(messages), 'prompt messages must be an array');
  const roles = messages.map(message => message?.role);
  const firstUser = roles.indexOf('user');
  if (firstUser < 1 || roles.slice(0, firstUser).some(role => role !== 'system')
      || roles.slice(firstUser).some(role => role !== 'user')) {
    throw new Error('P3_TEST_PROMPT_ROLE_ORDER_INVALID');
  }
  const systemParts = messages.slice(0, firstUser).map(message => message.content);
  const userParts = messages.slice(firstUser).map(message => message.content);
  if (systemParts.some(part => typeof part !== 'string')) {
    throw new Error('P3_TEST_PROMPT_SYSTEM_REQUIRED');
  }
  if (userParts.some(part => typeof part !== 'string')) {
    throw new Error('P3_TEST_PROMPT_USER_CONTENT_REQUIRED');
  }
  const user = userParts.join('');
  const headingPattern = /^(?:#{1,6}[ \t]*)?Сейчас(?=$|[ \t:—–])/gimu;
  const headings = [];
  let offset = 0;
  for (const part of userParts) {
    headings.push(...[...part.matchAll(headingPattern)].map(match => offset + match.index));
    offset += part.length;
  }
  if (headings.length !== 1) throw new Error('P3_TEST_PROMPT_CURRENT_SECTION_REQUIRED');
  const currentStart = headings[0];
  const context = user.slice(0, currentStart);
  const current = user.slice(currentStart);
  return { system: systemParts.join(''), user,
    part2: context, part3: current, context, current };
}

export function numberedPromptLines(messages) {
  assert.ok(Array.isArray(messages), 'prompt messages must be an array');
  const rows = [];
  for (const message of messages) {
    if (message?.role !== 'user') continue;
    assert.equal(typeof message.content, 'string', 'user prompt content must be text');
    for (const line of message.content.split(/\r?\n/u)) {
      const match = /^\s*(?:\[)?(\d+)(?:\]|[.)|:—-])\s+(.+?)\s*$/u.exec(line);
      if (match) rows.push({ number: Number(match[1]), text: match[2].trim() });
    }
  }
  return rows;
}

const npcSecondPersonWords = new Map([['мой', 'твой'], ['моя', 'твоя'], ['моё', 'твоё'],
  ['мое', 'твое'], ['моему', 'твоему'], ['моём', 'твоём'], ['моем', 'твоём'],
  ['мои', 'твои'], ['моих', 'твоих'], ['мне', 'тебе'], ['меня', 'тебя'], ['я', 'ты'],
  ['живу', 'живёшь'], ['работаю', 'работаешь'], ['греюсь', 'греешься'], ['варю', 'варишь'],
  ['развожу', 'разводишь'], ['высекаю', 'высекаешь'], ['знаю', 'знаешь'],
  ['говорит', 'говоришь'], ['гордится', 'гордишься'], ['бережёт', 'бережёшь'],
  ['даёт', 'даёшь'], ['держится', 'держишься'], ['заискивает', 'заискиваешь'],
  ['отвечает', 'отвечаешь'], ['может', 'можешь'], ['подпущу', 'подпустишь'],
  ['руса', 'русы']]);

function normalizeNpcSourceText(value) {
  return value.toLocaleLowerCase('ru').replace(/ё/gu, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/gu, ' ');
}

export function npcSourceTextVariants(value) {
  assert.equal(typeof value, 'string', 'NPC source text must be a string');
  const secondPersonText = value.replace(/[\p{Script=Cyrillic}]+/gu,
    word => npcSecondPersonWords.get(word.toLocaleLowerCase('ru')) ?? word);
  return [normalizeNpcSourceText(value), normalizeNpcSourceText(secondPersonText)];
}
