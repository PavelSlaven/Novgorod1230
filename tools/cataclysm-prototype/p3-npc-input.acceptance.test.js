import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { createLlmSettingsOwner } from '@rus/game-server';
import { validateNpcConversationResponseSubject } from '@rus/npc-runtime';
import { createP3RoleRuntime, runP3NativeNpcReply, runP3TurnStep } from './p3-boundary.js';
import { projectP3NpcWire } from './p3-npc-subject.js';
import { heardRecord, npcProjection, playerSpeechReadback, replyFrame,
  saidRecord, visibleItem } from './p3-test-frames.js';

const qwenSettingsOwner = () => createLlmSettingsOwner({ initialRecord: {
  version: 2, settings: { mode: 'custom', compatibility: 'openai_compatible',
    base_url: 'http://127.0.0.1:8000/v1', model: 'qwen3.8-27b-uncensored-w4a16-tp2',
    api_key: 'test-secret' }
} });

function captureRuntime(respond = () => { throw new Error('input captured'); }) {
  const calls = [];
  const runtime = createP3RoleRuntime({ env: {}, settingsOwner: qwenSettingsOwner(),
    execute: async value => {
      calls.push({ roleId: value.roleId, messages: structuredClone(value.messages) });
      const output = await respond(value);
      return { status: 'ok', parsed_json: output, provider: 'openai_compatible',
        model: 'qwen3.8-27b-uncensored-w4a16-tp2', scope: value.scope,
        role_id: value.roleId, durationMs: 1 };
    } });
  return { calls, runtime };
}

async function npcCalls(frame, { utterance = 'Здравствуй.', turn = frame.turn,
  respond } = {}) {
  const { calls, runtime } = captureRuntime(respond);
  const playerReadback = playerSpeechReadback({ utterance, turn });
  await assert.rejects(runP3NativeNpcReply({
    nativeAdapter: { refreshObservation: async () => structuredClone(frame) },
    observation: frame, playerReadback, semanticModel: runtime.npcConversationModel,
    targetActorRef: 'npc:9', maxRepairAttempts: 2
  }), error => error?.code === 'TURN_NPC_MODEL_FAILED'
    || error?.message === 'input captured');
  assert.ok(calls.length > 0, 'NPC role runtime must reach execute');
  return calls;
}

async function npcUser(frame, utterance = 'Здравствуй.', turn = frame.turn) {
  const calls = await npcCalls(frame, { utterance, turn });
  assert.equal(calls.length, 1, 'NPC responder must receive one model call');
  assert.equal(calls[0].roleId, 'npc_conversation_responder');
  return calls[0].messages.find(message => message.role === 'user').content;
}

async function plannerUser(frame) {
  const { calls, runtime } = captureRuntime();
  await assert.rejects(runP3TurnStep({ intent: 'Посмотри на вещи.', observation: frame,
    operationId: 'npc-input-acceptance', turnStepModel: runtime.turnStepModel,
    nativeAdapter: { writeOperationRequest: async () => {},
      readOperationReadback: async () => ({}) } }), /input captured/);
  assert.equal(calls.length, 1, 'turn planner must receive one model call');
  assert.equal(calls[0].roleId, 'turn_step_planner');
  return calls[0].messages.find(message => message.role === 'user').content;
}

function valuesUnder(value, key) {
  if (value === null || typeof value !== 'object') return [];
  return Array.isArray(value) ? value.flatMap(entry => valuesUnder(entry, key))
    : Object.entries(value).flatMap(([name, entry]) =>
      name === key ? [entry, ...valuesUnder(entry, key)] : valuesUnder(entry, key));
}

function citableObservations(input) {
  const knowledgeRefs = valuesUnder(input, 'allowed_references')
    .flatMap(refs => refs.knowledge_refs ?? []);
  return valuesUnder(input, 'current_observations').flat().filter(observation =>
    observation?.source_type === 'direct_perception'
      && typeof observation.fact_text === 'string'
      && knowledgeRefs.some(ref => ref.entity_kind === observation.observation_ref?.entity_kind
        && ref.entity_id === observation.observation_ref?.entity_id));
}

const forbiddenWireKeys = new Set(['request_id', 'boundary_id', 'conversation_id',
  'exchange_id', 'state_version', 'requested_at', 'signal_refs', 'template_ref']);

function wireIssues(call, name, items) {
  const messages = call.messages;
  const input = JSON.parse(messages.find(message => message.role === 'user').content);
  const request = input.request ?? input;
  const failures = [];
  const walk = (value, path = '$') => {
    if (value === null || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenWireKeys.has(key)) failures.push(name + ' ' + path + '.' + key + ': service key');
      walk(child, path + '.' + key);
    }
  };
  walk(input);
  const resources = valuesUnder(input, 'available_resources');
  if (!Object.hasOwn(request, 'available_resources') || resources.length !== 1) {
    failures.push(name + ': expected one top-level available_resources, found ' + resources.length);
  }
  if (Object.hasOwn(request.npc ?? {}, 'available_resources')) {
    failures.push(name + ': nested resources duplicated on private wire');
  }
  const references = request.allowed_references;
  if (!references
      || !Array.isArray(references.actor_refs)
      || !Array.isArray(references.entity_refs)
      || !Array.isArray(references.knowledge_refs)
      || !Array.isArray(references.combat_target_refs)) {
    failures.push(name + ': allowed references are incomplete');
  } else {
    const hasRef = (group, kind, id) => references[group]?.some(ref =>
      ref.entity_kind === kind && ref.entity_id === id);
    if (!hasRef('actor_refs', 'npc', '9')
        || !hasRef('actor_refs', 'player_character', '7')) {
      failures.push(name + ': actor citation references were lost');
    }
    for (const visible of items) {
      if (!hasRef('entity_refs', 'item', visible.item_uid)) {
        failures.push(name + ': item citation ref ' + visible.item_uid + ' was lost');
      }
    }
    const knownFacts = valuesUnder(request, 'known_facts').flat();
    if (knownFacts.length === 0 || knownFacts.some(fact =>
      !hasRef('knowledge_refs', fact.fact_ref?.entity_kind, fact.fact_ref?.entity_id))) {
      failures.push(name + ': knowledge citation references were lost');
    }
  }

  const upstream = structuredClone(request);
  if (!upstream.npc || !Array.isArray(upstream.available_resources)) {
    failures.push(name + ': canonical resource source is missing');
    return failures;
  }
  upstream.npc.available_resources = structuredClone(upstream.available_resources);
  if (!assertResourceAlias(upstream, name, failures)) return failures;
  try {
    if (!validateNpcConversationResponseSubject(upstream)) {
      failures.push(name + ': canonical NPC subject failed validation');
    }
  } catch (error) {
    failures.push(name + ': canonical NPC subject validator threw ' + error.message);
  }
  const original = structuredClone(upstream);
  const firstProjection = projectP3NpcWire(upstream,
    'Keep optional null and empty subjective fields.');
  if (!isDeepStrictEqual(upstream, original)) failures.push(name + ': projection mutated its input');
  const secondProjection = projectP3NpcWire(upstream,
    'Preserve optional null and empty subjective fields.');
  if (!isDeepStrictEqual(upstream, original)) failures.push(name + ': wording projection mutated its input');
  if (!isDeepStrictEqual(firstProjection, secondProjection)) {
    failures.push(name + ': system wording changed the request projection');
  }
  if (!isDeepStrictEqual(firstProjection, request)) {
    failures.push(name + ': captured wire differs from canonical private projection');
  }
  return failures;
}

function assertResourceAlias(request, name, failures) {
  if (!isDeepStrictEqual(request.npc.available_resources, request.available_resources)) {
    failures.push(name + ': canonical nested resource alias differs from top-level copy');
    return false;
  }
  return true;
}

const wireFailureSummary = failures => ['service key', 'canonical', 'resources',
  'available_resources', 'citation references', 'projection'].map(kind =>
  failures.find(failure => failure.includes(kind))).filter(Boolean).join('; ');

const semanticSpeech = () => {
  const player = { entity_kind: 'player_character', entity_id: '7' };
  return {
    contribution_kind: 'speech', primary_addressee_ref: player,
    intended_addressee_refs: [player], affected_actor_refs: [],
    speech: { utterance_text: 'Слышу тебя.', dominant_act: 'answer',
      interaction_tags: [], topic_refs: [], claims: [],
      response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: 'ответить', grounded_contribution: 'Я слышу.',
      adaptation: 'literal' },
    resolution: 'automatic', activity: { duration_class: 'brief', effort: 'none' },
    supporting_operations: [], check: null, handoff: null, reason: 'Ответ.'
  };
};

test('K1: first contact is unscored while positive and negative trust stay distinct', async () => {
  const cases = [
    { name: 'first meeting', trust: 0, expected: 'absent' },
    { name: 'positive opinion', trust: 3, expected: 'positive' },
    { name: 'negative opinion', trust: -3, expected: 'low' }
  ];
  const failures = [];
  for (const item of cases) {
    const frame = replyFrame({ projections: [npcProjection('9', {
      template_id: '', opinion_of_avatar: { trust: item.trust, fear: 0, value: 0, anger: 0 }
    })] });
    const trust = valuesUnder(JSON.parse(await npcUser(frame)), 'trust');
    if (item.expected === 'absent' && trust.length !== 0) {
      failures.push(`${item.name}: expected no trust scale, received ${JSON.stringify(trust)}`);
    }
    if (item.expected === 'positive' && (trust.length === 0
        || trust.some(value => typeof value === 'number' ? value <= 0
          : typeof value !== 'string' || !value.trim()
            || ['low', 'none', 'neutral', 'unknown', '0'].includes(value.toLowerCase())))) {
      failures.push(`${item.name}: positive opinion lost or became low: ${JSON.stringify(trust)}`);
    }
    if (item.expected === 'low' && !trust.includes('low')) {
      failures.push(`${item.name}: negative opinion must remain low: ${JSON.stringify(trust)}`);
    }
  }
  assert.equal(failures.length, 0, `K1 model input: ${failures.join('; ')}`);
});

test('K2: responder model input is canonical and private wire is service-stripped', async () => {
  const cases = [
    { name: 'one owned item', items: [visibleItem(31)] },
    { name: 'two different items', items: [visibleItem(32),
      visibleItem(33, { type: 'stick', label: 'палка' })] },
    { name: 'past conversation and item', items: [visibleItem(34)],
      memory: [heardRecord('Добрый день.', 3), saidRecord('И тебе.', 4)] }
  ];
  const failures = [];
  for (const item of cases) {
    const frame = replyFrame({ projections: [npcProjection('9', { template_id: '',
      visible_items: item.items, conversation_memory: item.memory ?? [] })] });
    const calls = await npcCalls(frame);
    assert.deepEqual(calls.map(call => call.roleId), ['npc_conversation_responder']);
    failures.push(...wireIssues(calls[0], item.name, item.items));
  }
  assert.equal(failures.length, 0, `K2 model input: ${wireFailureSummary(failures)}`);
});

test('K2: format repair receives the same projected NPC request', async () => {
  const item = visibleItem(35);
  const frame = replyFrame({ projections: [npcProjection('9', { template_id: '',
    visible_items: [item] })] });
  const calls = await npcCalls(frame, { respond: ({ roleId }) => {
    if (roleId === 'npc_conversation_responder') return { contribution_kind: 'speech' };
    throw new Error('input captured');
  } });
  assert.deepEqual(calls.map(call => call.roleId),
    ['npc_conversation_responder', 'npc_conversation_responder_format_repair']);
  const failures = wireIssues(calls[1], 'format repair', [item]);
  assert.equal(failures.length, 0, `K2 format repair input: ${wireFailureSummary(failures)}`);
});

test('K2: grounding auditor receives the same projected NPC request', async () => {
  const item = visibleItem(36);
  const frame = replyFrame({ projections: [npcProjection('9', { template_id: '',
    visible_items: [item] })] });
  const calls = await npcCalls(frame, { respond: ({ roleId }) => {
    if (roleId === 'npc_conversation_responder') return semanticSpeech();
    throw new Error('input captured');
  } });
  assert.deepEqual(calls.map(call => call.roleId),
    ['npc_conversation_responder', 'npc_conversation_grounding_auditor']);
  const failures = wireIssues(calls[1], 'grounding auditor', [item]);
  assert.equal(failures.length, 0, `K2 grounding auditor input: ${wireFailureSummary(failures)}`);
});

test('K3: responder and auditor receive Russian visible world features', async () => {
  const features = [
    { kind: 'furniture', type: 'f_clay_oven', label: 'печь',
      position: [72, 73, 0], absolute_position: [81234, 19283, 0],
      target_ref: '72,73,0' },
    { kind: 'terrain', type: 't_wall_wood', label: 'стена',
      position: [73, 73, 0], absolute_position: [81235, 19283, 0],
      target_ref: '73,73,0' }
  ];
  const frame = replyFrame({ projections: [npcProjection('9', { template_id: '',
    visible_world_features: features })] });
  const calls = await npcCalls(frame, { respond: ({ roleId }) => {
    if (roleId === 'npc_conversation_responder') return semanticSpeech();
    throw new Error('input captured');
  } });
  assert.deepEqual(calls.map(call => call.roleId),
    ['npc_conversation_responder', 'npc_conversation_grounding_auditor']);
  for (const call of calls) {
    const user = call.messages.find(message => message.role === 'user').content;
    const input = JSON.parse(user);
    const observations = citableObservations(input);
    assert.ok(observations.some(row => row.fact_text.includes('печь')),
      call.roleId + ' must see the Russian furniture label');
    assert.ok(observations.some(row => row.fact_text.includes('стена')),
      call.roleId + ' must see the Russian terrain label');
    const refs = valuesUnder(input, 'allowed_references')[0].entity_refs
      .filter(ref => ['furniture', 'terrain'].includes(ref.entity_kind));
    assert.equal(refs.length, 2);
    assert.ok(refs.every(ref => /^[0-9a-f]{12}$/u.test(ref.entity_id)));
    for (const nativeValue of ['f_clay_oven', 't_wall_wood', '81234', '81235',
      '72,73,0', '73,73,0']) {
      assert.equal(user.includes(nativeValue), false, call.roleId + ' leaked ' + nativeValue);
    }
  }
  const englishFrame = replyFrame({ projections: [npcProjection('9', { template_id: '',
    visible_world_features: [{ ...features[0], label: 'clay oven' }] })] });
  const englishUser = await npcUser(englishFrame);
  assert.equal(englishUser.includes('clay oven'), false);
  assert.equal(valuesUnder(JSON.parse(englishUser), 'allowed_references')[0].entity_refs
    .some(ref => ref.entity_kind === 'furniture'), false);
});

test('K3: responder and planner use perceived Russian item names without native item ids', async () => {
  const cases = [
    { uid: '41', type: 'flint_steel', label: 'кресало', branch: 'held' },
    { uid: '42', type: 'straw_basket', label: 'соломенная корзина', branch: 'ground' },
    { uid: '43', type: 'stick_common', label: 'кривая палка', branch: 'ground' }
  ];
  const failures = [];
  for (const item of cases) {
    const nativeItem = visibleItem(item.uid, item);
    const frame = replyFrame({ projections: [npcProjection('9', {
      template_id: '', visible_items: [nativeItem] })] });
    const responseInput = await npcUser(frame);
    if (valuesUnder(JSON.parse(responseInput), 'template_ref').length > 0) {
      failures.push(`${item.label}: responder exposes template_ref`);
    }
    if (responseInput.includes(item.type)) failures.push(`${item.label}: responder exposes ${item.type}`);
    if (!responseInput.includes(item.label)) failures.push(`${item.label}: responder lost Russian name`);

    const plannerFrame = { ...frame, items: [{ item_ref: nativeItem.item_ref,
      item_uid: item.uid, type: item.type, label: item.label, use_methods: [],
      ...(item.branch === 'held' ? { holder: '7' } : { position: [61, 60, 0] }) }] };
    const plannerInput = JSON.parse(await plannerUser(plannerFrame));
    const state = valuesUnder(plannerInput, 'player_safe_state')[0] ?? {};
    const carried = Array.isArray(state.items) ? state.items : [];
    const entities = valuesUnder(plannerInput, 'visible_entities').flat();
    const listed = entities.find(({ item_ref }) => item_ref === nativeItem.item_ref);
    const visible = item.branch === 'held'
      ? carried.find(({ item_id, placement }) => item_id === nativeItem.item_ref
        && placement?.holder_character_id === state.actor_id)
      : listed;
    if (!visible) failures.push(`${item.label} (${item.branch}): planner item is not visible`);
    else {
      if (Object.hasOwn(visible, 'type') || JSON.stringify(visible).includes(item.type)) {
        failures.push(`${item.label} (${item.branch}): planner exposes English type ${item.type}`);
      }
      if (!JSON.stringify(visible).includes(item.label)) {
        failures.push(`${item.label} (${item.branch}): planner lost Russian name`);
      }
    }
    if (item.branch === 'held' && listed) {
      failures.push(`${item.label} (held): planner repeats carried item in visible_entities`);
    }
    for (const entry of [...entities, ...carried]) {
      if (Object.hasOwn(entry, 'item_uid')) {
        failures.push(`${item.label} (${item.branch}): planner exposes item_uid`);
      }
    }
  }
  assert.equal(failures.length, 0, `K3 model input: ${failures.join('; ')}`);
});

test('K4: each remembered speaker keeps the relationship label from that event', async () => {
  const cases = [
    { name: 'first meeting', turn: 5, previous: [], current: 'Привет.' },
    { name: 'second phrase', turn: 12, previous: [heardRecord('Первое приветствие.', 5),
      saidRecord('Здравствуй.', 6)], current: 'Как дела?' },
    { name: 'third phrase after a pause', turn: 120,
      previous: [heardRecord('Первое приветствие.', 5), saidRecord('Здравствуй.', 6),
        heardRecord('Вернулся.', 70), saidRecord('Вижу.', 71)], current: 'Я снова здесь.' }
  ];
  const failures = [];
  for (const item of cases) {
    const frame = replyFrame({ turn: item.turn, projections: [npcProjection('9', {
      template_id: '', conversation_memory: [...item.previous,
        heardRecord(item.current, item.turn)] })] });
    const input = await npcUser(frame, item.current, item.turn);
    if (item.previous.length === 0) {
      if (!input.includes('незнакомый человек')) {
        failures.push(`${item.name}: current first-contact speaker is not a stranger`);
      }
      continue;
    }
    const summaries = valuesUnder(JSON.parse(input), 'recent_events').flat()
      .map(event => event.summary).filter(value => typeof value === 'string');
    const first = summaries.find(summary => summary.includes('Первое приветствие.'));
    if (!first) failures.push(`${item.name}: first utterance is missing from memory`);
    else if (first.includes('человек, с которым я уже говорил')) {
      failures.push(`${item.name}: first utterance is signed with the current relationship`);
    }
  }
  assert.equal(failures.length, 0, `K4 model input: ${failures.join('; ')}`);
});

test('K5: responder sees the interlocutor clothing, hands, wetness and visible wounds', async () => {
  const cases = [
    { sex: 'Мужчина', worn: 'рубаха', wielded: 'топор', wet: false, bodyPart: 'arm_l',
      wound: 'Кровотечение (левая рука)' },
    { sex: 'Женщина', worn: 'шерстяной плащ', wielded: 'палка', wet: true, bodyPart: 'head',
      wound: 'Укус (голова)' },
    { sex: 'Мужчина', worn: 'кожаные обмотки', wielded: 'кресало', wet: true,
      bodyPart: 'hand_r',
      wound: 'Перевязка (правая кисть)' }
  ];
  const failures = [];
  for (const [index, item] of cases.entries()) {
    const frame = replyFrame({ projections: [npcProjection('9', { template_id: '',
      visible_actors: [{ actor_id: '7', position: [60, 60, 0], appearance: {
        worn_items: [{ item_uid: `worn-${index}`, label: item.worn }],
        wielded_item: { item_uid: `held-${index}`, label: item.wielded },
        wet: item.wet, sex_label: item.sex,
        visible_wounds: [{ body_part_id: item.bodyPart, label: item.wound }]
      } }] })] });
    const input = citableObservations(JSON.parse(await npcUser(frame)))
      .map(observation => observation.fact_text).join('\n');
    for (const label of [item.sex, item.worn, item.wielded, item.wound]) {
      if (!input.includes(label)) {
        failures.push(`${index + 1}: no citable interlocutor observation of ${label}`);
      }
    }
    if (item.wet && !/мокр/iu.test(input)) failures.push(`${index + 1}: wetness is absent`);
    if (!item.wet && /мокр/iu.test(input)) {
      failures.push(`${index + 1}: dry interlocutor is called wet`);
    }
  }
  assert.equal(failures.length, 0, `K5 model input: ${failures.join('; ')}`);
});

test('K6: responder receives native time of day, light and weather in distinct conditions', async () => {
  const cases = [
    { hour: 6, is_night: false, time_label: 'Раннее утро',
      light_label: 'светло', weather_label: 'Солнечно' },
    { hour: 14, is_night: false, time_label: 'После полудня',
      light_label: 'пасмурно', weather_label: 'Дождь' },
    { hour: 23, is_night: true, time_label: 'Около полуночи',
      light_label: 'очень темно', weather_label: 'Снегопад' }
  ];
  const failures = [];
  for (const item of cases) {
    const frame = { ...replyFrame(), environment: { hour: item.hour,
      is_night: item.is_night, time_label: item.time_label,
      light_label: item.light_label, weather_label: item.weather_label } };
    const user = await npcUser(frame);
    const input = citableObservations(JSON.parse(user))
      .map(observation => observation.fact_text).join('\n');
    for (const [kind, label] of [['time', item.time_label],
      ['light', item.light_label], ['weather', item.weather_label]]) {
      if (!input.includes(label)) failures.push(`${item.time_label}: ${kind} label ${label} is absent`);
    }
    if (valuesUnder(JSON.parse(user), 'light_level').length > 0
        || /"[^"]*(?:light|свет|освещ)[^"]*"\s*:\s*-?\d/iu.test(user)
        || /(?:свет|освещ\w*)\s*[:—=-]\s*\d/iu.test(input)) {
      failures.push(`${item.time_label}: numeric light leaks into user`);
    }
  }
  assert.equal(failures.length, 0, `K6 model input: ${failures.join('; ')}`);
});

test('K7: dev-world grounds ownership of the basket, crooked stick and courtyard goods', async () => {
  const readJson = async name => JSON.parse(await readFile(
    new URL(`./dev-world/${name}.json`, import.meta.url), 'utf8'));
  const [courtyard] = await readJson('courtyard');
  const npcData = await readJson('npc');
  const itemData = await readJson('items');
  const profile = JSON.parse(await readFile(
    new URL('./npc-profiles/novgorod_dev_master.json', import.meta.url), 'utf8'));
  const npc = npcData.find(entry => entry.type === 'npc'
    && entry.id === 'novgorod_dev_master');
  assert.ok(npc, 'dev-world must contain the courtyard NPC');
  const ownedAreas = courtyard.object.faction_owner
    .filter(area => area.id === npc.faction);
  assert.ok(ownedAreas.length > 0, 'the courtyard must name the NPC faction as owner');
  const cases = [
    { type: 'straw_basket', label: 'соломенная корзина' },
    { type: 'stick_common', label: 'кривая палка' },
    { type: 'firewood', label: 'полено' }
  ];
  const failures = [];
  for (const item of cases) {
    assert.ok(itemData.some(entry => entry.id === item.type
      && Object.values(entry.name).includes(item.label)), `${item.type}: item fixture is missing`);
    const ownedPlacement = courtyard.object.place_loot.some(placement =>
      placement.item === item.type && placement.chance === 100
        && ownedAreas.some(area => placement.x >= area.x[0] && placement.x <= area.x[1]
          && placement.y >= area.y[0] && placement.y <= area.y[1]));
    const explicitFact = profile.knowledge_snapshot.known_facts.some(fact =>
      fact.summary.includes(item.label)
        && /(?:принадлежит мне|мо[яйи]|мне принадлежит)/iu.test(fact.summary));
    if (!ownedPlacement && !explicitFact) {
      failures.push(`${item.label}: no owned ground placement or explicit ownership fact`);
    }
  }
  assert.equal(failures.length, 0, `K7 dev-world data: ${failures.join('; ')}`);
});

test('D2: translated NPC work reaches the responder and empty work is omitted', async () => {
  const cases = [
    { name: 'carpenter', description: 'Плотничаю на своём дворе.' },
    { name: 'roof repair', description: 'Чиню соседу крышу.' },
    { name: 'no current work', description: '' }
  ];
  const failures = [];
  for (const item of cases) {
    const frame = replyFrame({ projections: [npcProjection('9', { template_id: '',
      job_description: item.description })] });
    const user = await npcUser(frame);
    const input = JSON.parse(user);
    if (item.description && !user.includes(item.description)) {
      failures.push(`${item.name}: job description is absent from responder user`);
    }
    if (!item.description && (valuesUnder(input, 'job_description').length > 0
        || user.includes('"job_description":""'))) {
      failures.push(`${item.name}: empty job_description reaches responder user`);
    }
  }
  assert.equal(failures.length, 0, `D2 model input: ${failures.join('; ')}`);
});

test('B3: Zhirko receives separate approved woodworking facts and citation refs', async () => {
  const catalog = JSON.parse(await readFile(new URL(
    '../../data/world-catalogs/novgorod/world-knowledge/production-v1/woodwork-ceramics.json',
    import.meta.url), 'utf8'));
  const approved = new Map(catalog.claims.filter(claim =>
    claim.review_status === 'approved'
      && claim.claim_ref.startsWith('claim:population-woodwork-')
      && claim.predicate === 'attested_use'
      && claim.object?.value === 'wk:craft_technology:woodworking')
    .map(claim => [claim.claim_ref, claim]));
  assert.ok(approved.size >= 3, 'canonical WK must contain at least three approved woodworking claims');

  const frame = replyFrame({ projections: [npcProjection('9', {
    template_id: 'novgorod_dev_master' })] });
  let request;
  await assert.rejects(runP3NativeNpcReply({
    nativeAdapter: { refreshObservation: async () => structuredClone(frame) },
    observation: frame, playerReadback: playerSpeechReadback({ utterance: 'Чем работаешь?' }),
    targetActorRef: 'npc:9', semanticModel: async built => {
      request = built;
      throw new Error('request captured');
    }
  }), error => error?.code === 'TURN_NPC_MODEL_FAILED'
    || error?.message === 'request captured');
  assert.ok(request, 'production NPC request must reach the semantic boundary');

  const facts = request.knowledge.known_facts.filter(fact =>
    approved.has(fact.fact_ref?.entity_id));
  const factIds = facts.map(fact => fact.fact_ref.entity_id);
  assert.ok(factIds.length >= 3,
    `Zhirko needs at least three separate approved woodworking facts; received ${factIds.length}`);
  assert.equal(new Set(factIds).size, factIds.length,
    'each approved woodworking claim must have its own known fact');
  const citedIds = request.allowed_references.knowledge_refs
    .filter(ref => approved.has(ref.entity_id)).map(ref => ref.entity_id);
  assert.ok(citedIds.length >= 3,
    `Zhirko needs at least three separate approved woodworking citation refs; received ${citedIds.length}`);
  assert.deepEqual([...citedIds].sort(), [...factIds].sort(),
    'each woodworking fact must have its own allowed citation ref');

  const confidenceRank = { low: 1, medium: 2, high: 3, certain: 4 };
  for (const fact of facts) {
    assert.ok(confidenceRank[fact.confidence] <= confidenceRank[approved.get(fact.fact_ref.entity_id)
      .qualifiers.confidence], `${fact.fact_ref.entity_id}: NPC confidence exceeds WK confidence`);
    assert.equal(fact.resource_ref, null,
      `${fact.fact_ref.entity_id}: historical knowledge must not become a present resource`);
    assert.equal(fact.source_perception_ref, undefined,
      `${fact.fact_ref.entity_id}: historical knowledge must not become a current observation`);
  }
  assert.equal(request.knowledge.known_facts.some(fact =>
    fact.fact_ref.entity_id === 'claim:ordinary-life-carpenter-works-wood-with-tools'), false,
  'the composite woodworking fact must be replaced by atomic WK claims');
  assert.deepEqual(request.available_resources, [],
    'WK woodworking claims must not materialize tools in the current scene');
  assert.ok(request.memory.current_observations.every(observation =>
    !approved.has(observation.observation_ref?.entity_id)),
  'WK woodworking claims must not become current observations');
  assert.ok(request.knowledge.known_facts.some(fact =>
    fact.fact_ref.entity_id === 'novgorod-dev-master-yard'),
  'the existing profile knowledge must still reach the production request');
});
