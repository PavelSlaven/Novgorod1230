import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { assertNpcStackLine, assertNpcActivityText, assertNpcNameOccurrences, assertNpcMealDescriptions, numberedPromptLines, loadScenes, runReply, splitPrompt } from './npc-talk-test-helpers.js';

const nativeRoot = () => {
  const directory = process.env.P3_NATIVE_NPC_FRAME_DIR;
  assert.ok(typeof directory === 'string' && directory.trim(),
    'P3_NATIVE_NPC_FRAME_DIR must point to the native test user directory');
  return directory;
};

async function readNativeJson(relativePath) {
  return JSON.parse(await readFile(path.join(nativeRoot(), relativePath), 'utf8'));
}

async function loadOracle() {
  const oracle = await readNativeJson('source-light-oracle.json');
  assert.equal(oracle.schema, 'p3_native_npc_source_light_oracle_v1');
  return oracle;
}

async function loadFrame(record) {
  return readNativeJson(record.frame);
}

async function loadCaptureRow(record) {
  const text = await readFile(path.join(nativeRoot(), record.capture), 'utf8');
  const lines = text.split(/\r?\n/u).filter(Boolean);
  assert.ok(lines.length > 0, `${record.capture}: native capture is empty`);
  const last = JSON.parse(lines.at(-1));
  assert.equal(last.kind, 'full', `${record.capture}: final capture must be a full frame`);
  assert.ok(last.frame && typeof last.frame === 'object',
    `${record.capture}: final native frame is missing`);
  return last;
}

async function loadCapture(record) {
  return (await loadCaptureRow(record)).frame;
}

function sourceProjection(frame, actorId) {
  const projection = frame.npc_projections?.find(row =>
    String(row.actor_id) === String(actorId));
  assert.ok(projection, `native projection for NPC ${actorId} is missing`);
  return projection;
}

function sourceRecord(oracle, id) {
  const record = oracle.records.find(row => row.id === id);
  assert.ok(record, `native oracle record ${id} is missing`);
  return record;
}

function messagesFrom(run) {
  const call = run.httpCalls.find(entry => Array.isArray(entry.body?.messages));
  assert.ok(call, 'product entry must reach the captured responder request');
  return call.body.messages;
}

function promptParts(run) {
  const messages = messagesFrom(run);
  const user = messages.filter(message => message?.role === 'user')
    .map(message => message.content).filter(value => typeof value === 'string').join('\n');
  assert.ok(user, 'captured responder request must contain user input');
  try {
    const parts = splitPrompt(messages);
    return { user: parts.user, current: parts.part3 };
  } catch (error) {
    if (!/P3_TEST_PROMPT_(?:CURRENT_SECTION|SINGLE_USER_MESSAGE|SYSTEM)_REQUIRED/u
      .test(String(error?.message))) throw error;
    return { user, current: user };
  }
}

function nativeCaseFrom(sourceCase, id, frame, record) {
  return {
    ...sourceCase,
    id,
    frame,
    projection: sourceProjection(frame, record.npcActorId),
    targetActorRef: record.actorRef,
    npcActorId: String(record.npcActorId),
    source: { kind: 'native_capture', frame: record.frame },
    currentTurns: { turns: [], reconstructed: false,
      source: { kind: 'native_capture', frame: record.frame } },
    playerReadback: null,
    wireSubject: undefined
  };
}

async function nativeProductInput(sourceCase, id, frame, record) {
  const result = await runReply(nativeCaseFrom(sourceCase, id, frame, record), {
    captureOnly: true
  });
  assert.equal(result.mode, 'factory_only', 'native state must be inspected without inventing a readback');
  assert.ok(result.request, 'product request must be captured');
  const responderCall = result.calls.find(call => call.role_id === 'npc_conversation_responder');
  assert.ok(responderCall && Array.isArray(responderCall.messages),
    'the real responder invocation and its messages must be captured');
  const fetchCall = result.httpCalls.find(call => Array.isArray(call.body?.messages));
  assert.ok(fetchCall, 'the responder request must reach the captured HTTP boundary');
  assert.deepEqual(fetchCall.body.messages, responderCall.messages,
    'the captured HTTP boundary must carry the responder messages');
  assert.equal(result.result, null, 'capture-only must stop before a model response is returned');
  return { ...result, prompt: promptParts(result) };
}

function itemCount(item) {
  return Number.isSafeInteger(item.count) && item.count > 0 ? item.count : 1;
}

function containsCount(text, count) {
  return new RegExp(`(?:^|\\D)${count}(?:\\D|$)`, 'u').test(text);
}

function stackGroups(items) {
  const groups = new Map();
  for (const item of items.filter(row => row.placement === 'ground')) {
    const key = JSON.stringify([item.type, item.label]);
    const group = groups.get(key) ?? { type: item.type, label: item.label, count: 0 };
    group.count += itemCount(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function valuesUnder(value, key) {
  if (value === null || typeof value !== 'object') return [];
  return Array.isArray(value) ? value.flatMap(entry => valuesUnder(entry, key))
    : Object.entries(value).flatMap(([name, entry]) =>
      name === key ? [entry, ...valuesUnder(entry, key)] : valuesUnder(entry, key));
}

function sceneA2(scenes) {
  const entry = scenes.cases.find(row => row.id === 'A2');
  assert.ok(entry, 'Scene A2 must be available as the source utterance');
  assert.equal(entry.playerReadback, null, 'A2 has no recorded NPC reply or readback');
  return entry;
}

test('D1: native item count and source Scene A stacks reach the NPC input', async () => {
  const [oracle, scenes] = await Promise.all([loadOracle(), loadScenes()]);
  const beforeRecord = sourceRecord(oracle, 'source-stack-before');
  const afterRecord = sourceRecord(oracle, 'source-stack-after');
  const [beforeFrame, afterFrame] = await Promise.all([
    loadFrame(beforeRecord), loadFrame(afterRecord)
  ]);
  const beforeItems = sourceProjection(beforeFrame, beforeRecord.npcActorId).visible_items
    .filter(item => item.type === oracle.stack.type && item.label === oracle.stack.label
      && item.placement === 'ground');
  const afterItems = sourceProjection(afterFrame, afterRecord.npcActorId).visible_items
    .filter(item => item.type === oracle.stack.type && item.label === oracle.stack.label
      && item.placement === 'ground');
  assert.equal(beforeItems.reduce((sum, item) => sum + itemCount(item), 0), oracle.stack.before);
  assert.equal(afterItems.reduce((sum, item) => sum + itemCount(item), 0), oracle.stack.after);
  const [beforeCapture, afterCapture] = await Promise.all([
    loadCapture(beforeRecord), loadCapture(afterRecord)
  ]);
  const captureLogs = capture => (capture.objects ?? []).filter(object =>
    object.kind === 'ground_item' && object.item?.type === oracle.stack.type
      && object.item?.name === oracle.stack.tname);
  assert.equal(captureLogs(beforeCapture).length, oracle.stack.before,
    'native capture must preserve every log tname before removal');
  assert.equal(captureLogs(afterCapture).length, oracle.stack.after,
    'native capture must preserve the 48 remaining log tnames');
  assert.equal(oracle.stack.before, 49);
  assert.equal(oracle.stack.after, 48);

  assert.throws(() => assertNpcStackLine([{ role: 'user', content: `1: ${oracle.stack.tname} — 48` }],
    oracle.stack.tname, oracle.stack.before), /count must match/);
  assertNpcStackLine([{ role: 'user', content: `1: ${oracle.stack.tname} — 49` }], oracle.stack.tname, oracle.stack.before);
  for (const [frame, record, count] of [[beforeFrame, beforeRecord, oracle.stack.before],
    [afterFrame, afterRecord, oracle.stack.after]]) {
    const input = await nativeProductInput(sceneA2(scenes), 'native-stack', frame, record);
    assertNpcStackLine([{ role: 'user', content: input.prompt.current }], oracle.stack.tname, count);
  }

  const sceneA = scenes.cases.filter(row => row.scene === 'A');
  assert.equal(sceneA.length, 8, 'Scene A source must retain exchanges A1 through A8');
  for (const sceneCase of sceneA) {
    const projection = sourceProjection(sceneCase.frame, sceneCase.npcActorId);
    assert.deepEqual(sceneCase.projection.visible_items, projection.visible_items,
      `${sceneCase.id}: extracted item rows must match the raw source frame`);
    const sourceLogs = stackGroups(projection.visible_items)
      .filter(group => group.type === oracle.stack.type);
    assert.equal(sourceLogs.length, 1,
      `${sceneCase.id}: source records must retain one native log label`);
    assert.equal(sourceLogs[0].count, 49,
      `${sceneCase.id}: source log count must come from raw item records`);
  }
});

test('D2: native activity capture verb reaches the product input without ACT identifiers', async () => {
  const [oracle, scenes] = await Promise.all([loadOracle(), loadScenes()]);
  const record = sourceRecord(oracle, 'source-activity');
  const [frame, capture] = await Promise.all([loadFrame(record), loadCapture(record)]);
  const npc = capture.creatures?.find(creature => String(creature.id) === record.npcActorId);
  assert.ok(npc?.activity, 'native capture must contain the NPC activity');
  assert.equal(npc.activity.id, oracle.activity.id);
  assert.equal(npc.activity.verb, oracle.activity.nativeVerb);

  const idleRecord = sourceRecord(oracle, 'source-stack-before');
  const [idleFrame, idleCapture] = await Promise.all([loadFrame(idleRecord), loadCapture(idleRecord)]);
  const idleNpc = idleCapture.creatures.find(creature => String(creature.id) === idleRecord.npcActorId);
  const idleVerb = idleNpc.activity.verb;
  assert.throws(() => assertNpcActivityText(oracle.activity.nativeVerb, idleVerb,
    oracle.activity.nativeVerb), /current native activity/);
  assertNpcActivityText(idleVerb, idleVerb, oracle.activity.nativeVerb);
  for (const [state, stateRecord, verb, oldVerb] of [
    [frame, record, oracle.activity.nativeVerb, idleVerb], [idleFrame, idleRecord, idleVerb, oracle.activity.nativeVerb]
  ]) {
    const input = await nativeProductInput(sceneA2(scenes), 'native-activity', state, stateRecord);
    assertNpcActivityText(input.prompt.user, verb, oldVerb);
  }
});

test('D3: native faction membership changes the responder input independently of faction_id', async () => {
  const [oracle, scenes] = await Promise.all([loadOracle(), loadScenes()]);
  const memberRecord = sourceRecord(oracle, 'source-faction-member');
  const removedRecord = sourceRecord(oracle, 'source-faction-removed');
  const membership = oracle.factionMembership;
  assert.equal(membership.memberPresent, true);
  assert.equal(membership.memberRemoved, true);
  assert.equal(typeof membership.factionName, 'string');
  const memberName = membership.memberName;
  const memberActorId = String(membership.memberActorId);
  assert.ok(typeof memberName === 'string' && memberName.length > 0,
    'the native oracle must identify the member added to the faction');
  const [memberFrame, removedFrame, memberCaptureRow, removedCaptureRow] = await Promise.all([
    loadFrame(memberRecord), loadFrame(removedRecord),
    loadCaptureRow(memberRecord), loadCaptureRow(removedRecord)
  ]);
  const member = sourceProjection(memberFrame, memberRecord.npcActorId);
  const removed = sourceProjection(removedFrame, removedRecord.npcActorId);
  assert.equal(member.faction_id, membership.npcFactionId);
  assert.equal(removed.faction_id, membership.npcFactionId);
  assert.equal(member.name, removed.name);
  assert.equal(member.template_id, removed.template_id);
  for (const [frame, projection, caseId] of [
    [memberFrame, member, memberRecord.id], [removedFrame, removed, removedRecord.id]
  ]) {
    assert.deepEqual((frame.actors ?? []).filter(actor => String(actor.actor_id) === memberActorId
      && actor.visible === true), [],
    `${caseId}: roster member must not be a visible actor`);
    assert.deepEqual((projection.visible_actors ?? []).filter(actor =>
      String(actor.actor_id) === memberActorId), [],
    `${caseId}: roster member must not appear in the NPC's visible actors`);
  }
  const memberNpc = memberCaptureRow.frame.creatures?.find(creature =>
    String(creature.id) === memberRecord.npcActorId);
  const removedNpc = removedCaptureRow.frame.creatures?.find(creature =>
    String(creature.id) === removedRecord.npcActorId);
  assert.ok(memberNpc && removedNpc, 'native capture must retain the NPC in both membership states');
  assert.equal(memberCaptureRow.native_turn, removedCaptureRow.native_turn);
  assert.equal(memberNpc.id, removedNpc.id);
  assert.equal(memberNpc.name, removedNpc.name);
  assert.equal(memberNpc.type, removedNpc.type);

  const sourceMentions = JSON.stringify(removed).split(memberName).length - 1;
  assert.equal(sourceMentions, 0, 'removed native source has no other member-name facts');
  assert.throws(() => assertNpcNameOccurrences(memberName, memberName, sourceMentions), /independent source count/);
  assertNpcNameOccurrences('Состав двора изменился.', memberName, sourceMentions);
  const source = sceneA2(scenes);
  const memberInput = await nativeProductInput(source, 'native-faction', memberFrame, memberRecord);
  const removedInput = await nativeProductInput(source, 'native-faction', removedFrame, removedRecord);
  assertNpcNameOccurrences(memberInput.prompt.user, memberName, sourceMentions + 1);
  assertNpcNameOccurrences(removedInput.prompt.user, memberName, sourceMentions);
});

test('D4: native captures preserve last-ate values at a shared turn', async () => {
  const [oracle, scenes] = await Promise.all([loadOracle(), loadScenes()]);
  assert.notEqual(oracle.lastAte.earlyTimeSinceAteTurns, oracle.lastAte.lateTimeSinceAteTurns);
  assert.equal(oracle.lastAte.captureTurn,
    sourceRecord(oracle, 'source-last-ate-early').nativeTurn);
  assert.equal(oracle.lastAte.captureTurn,
    sourceRecord(oracle, 'source-last-ate-late').nativeTurn);
  const earlyRecord = sourceRecord(oracle, 'source-last-ate-early');
  const lateRecord = sourceRecord(oracle, 'source-last-ate-late');
  const [earlyFrame, lateFrame, earlyCaptureRow, lateCaptureRow] = await Promise.all([
    loadFrame(earlyRecord), loadFrame(lateRecord), loadCaptureRow(earlyRecord),
    loadCaptureRow(lateRecord)
  ]);
  const earlyCapture = earlyCaptureRow.frame;
  const lateCapture = lateCaptureRow.frame;
  assert.equal(earlyCaptureRow.native_turn, oracle.lastAte.captureTurn);
  assert.equal(lateCaptureRow.native_turn, oracle.lastAte.captureTurn);
  const earlyNpc = earlyCapture.creatures?.find(creature =>
    String(creature.id) === earlyRecord.npcActorId);
  const lateNpc = lateCapture.creatures?.find(creature =>
    String(creature.id) === lateRecord.npcActorId);
  assert.ok(earlyNpc && lateNpc, 'native captures must retain the NPC in both states');
  assert.equal(earlyNpc.id, lateNpc.id);
  assert.equal(earlyNpc.name, lateNpc.name);
  assert.equal(earlyNpc.type, lateNpc.type);
  assert.equal(earlyNpc.name, earlyRecord.name);
  assert.equal(earlyNpc.type, earlyRecord.templateId);
  const durations = [oracle.lastAte.earlyTimeSinceAteTurns, oracle.lastAte.lateTimeSinceAteTurns];
  assert.throws(() => assertNpcMealDescriptions('Последняя еда была давно.',
    'Последняя еда была давно.\nСлучайная вставка.', durations), /cannot represent both/);
  assertNpcMealDescriptions('Последняя еда была давно.', 'Последняя еда была недавно.', durations);
  assert.equal(earlyNpc.stomach?.time_since_ate_turns, oracle.lastAte.earlyTimeSinceAteTurns,
    'native capture must expose the early API-derived last-ate duration');
  assert.equal(lateNpc.stomach?.time_since_ate_turns, oracle.lastAte.lateTimeSinceAteTurns,
    'native capture must expose the late API-derived last-ate duration');

  const source = sceneA2(scenes);
  const early = await nativeProductInput(source, 'native-last-ate', earlyFrame, earlyRecord);
  const late = await nativeProductInput(source, 'native-last-ate', lateFrame, lateRecord);
  assert.ok(valuesUnder(sourceProjection(earlyFrame, earlyRecord.npcActorId),
    'time_since_ate_turns').includes(oracle.lastAte.earlyTimeSinceAteTurns),
    'target NPC projection must carry the early last-ate duration');
  assert.ok(valuesUnder(sourceProjection(lateFrame, lateRecord.npcActorId),
    'time_since_ate_turns').includes(oracle.lastAte.lateTimeSinceAteTurns),
    'target NPC projection must carry the late last-ate duration');
  assertNpcMealDescriptions(early.prompt.user, late.prompt.user, durations);
});

test('D4b: first-person meal wording is a meal description', () => {
  assertNpcMealDescriptions('Ты ел четыре часа назад.', 'Ты ел два часа назад.', [14400, 7200]);
});

test('D5: visibility oracle admits details at day and LOW, then hides them at DARK', async () => {
  const [oracle, scenes] = await Promise.all([loadOracle(), loadScenes()]);
  const lightCases = new Map(oracle.light.map(record => [record.id, record]));
  const day = lightCases.get('light-day');
  const low = lightCases.get('light-low');
  const dark = lightCases.get('light-dark');
  assert.ok(day && low && dark, 'native oracle must contain day, LOW and DARK states');
  assert.equal(day.actorPresentVisible, true);
  assert.equal(day.detailsClear, true);
  assert.equal(low.ambientLight, 3.5, 'LOW is set to LIGHT_AMBIENT_LOW exactly');
  assert.equal(low.lightName, 'LOW');
  assert.equal(low.detailsClear, true);
  assert.equal(dark.lightName, 'DARK');
  assert.equal(dark.actorPresentVisible, true);
  assert.equal(dark.detailsClear, false);

  const source = sceneA2(scenes);
  const products = new Map();
  for (const nativeLight of [day, low, dark]) {
    const record = sourceRecord(oracle, nativeLight.id);
    const frame = await loadFrame(record);
    const projection = sourceProjection(frame, record.npcActorId);
    const avatar = frame.actors.find(actor => actor.actor_ref === 'avatar');
    const visibleAvatar = projection.visible_actors.find(actor =>
      String(actor.actor_id) === String(avatar?.actor_id));
    assert.ok(visibleAvatar, `${nativeLight.id}: actor presence must remain visible`);
    if (nativeLight.detailsClear) {
      assert.equal(visibleAvatar.appearance.worn_items
        .some(item => item.label === nativeLight.shirtName), true,
      `${nativeLight.id}: clear raw observation must retain the source clothing record`);
      assert.equal(visibleAvatar.appearance.wielded_item?.label, nativeLight.heldItemName,
        `${nativeLight.id}: clear raw observation must retain the held item record`);
    }

    const input = await nativeProductInput(source, 'native-light', frame, record);
    products.set(nativeLight.id, input.prompt.user);
    if (nativeLight.detailsClear) {
      assert.ok(input.prompt.user.includes(nativeLight.shirtName),
        `${nativeLight.id}: clear detail visibility must include clothing`);
      assert.ok(input.prompt.user.includes(nativeLight.heldItemName),
        `${nativeLight.id}: clear detail visibility must include the held item`);
    } else {
      assert.equal(input.prompt.user.includes(nativeLight.shirtName), false,
        'DARK must not expose clothing details when the native detail oracle is not CLEAR');
      assert.equal(input.prompt.user.includes(nativeLight.heldItemName), false,
        'DARK must not expose the held item when the native detail oracle is not CLEAR');
    }
  }
  assert.notEqual(products.get('light-low'), products.get('light-dark'));
});
