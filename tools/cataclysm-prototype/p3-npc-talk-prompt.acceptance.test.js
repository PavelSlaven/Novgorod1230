import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { projectNpcConversationSubject } from '@rus/npc-runtime';
import { buildP3NativeNpcDecisionInput } from './p3-boundary.js';
import { loadP3NpcProfile } from './p3-npc-profile.js';
import { assertNpcExchangeHistory, assertPostRejectionMemory, assertNpcActionLabels, assertNpcReachabilityQueries, expectedNpcActionLabels,
  assertFlowConversationChoices, assertNpcSourceContent, npcSourceContent, assertPlainPrompt, formatNpcConversationExchangeLine, numberedPromptLines,
  npcSourceTextVariants, loadScenes, runFlow, runReply, splitPrompt } from './npc-talk-test-helpers.js';

const fixtureProfiles = path.join(path.dirname(fileURLToPath(import.meta.url)),
  'fixtures', 'npc-talk', 'profiles');

function check(failures, label, action) {
  try { action(); }
  catch (error) { failures.push(`${label}: ${error?.message ?? String(error)}`); }
}

async function checkAsync(failures, label, action) {
  try { await action(); }
  catch (error) { failures.push(`${label}: ${error?.message ?? String(error)}`); }
}

async function attempt(failures, label, action) {
  try { return await action(); }
  catch (error) {
    failures.push(`${label}: ${error?.message ?? String(error)}`);
    return null;
  }
}

function finish(failures) {
  assert.deepEqual(failures, [], failures.join('\n'));
}

function caseById(cases, id) {
  const sceneCase = cases.find(candidate => candidate.id === id);
  assert.ok(sceneCase, `fixture is missing ${id}`);
  return sceneCase;
}

function actionLabelsFromPrompt(messages) {
  const prompt = messages.filter(message => message.role === 'user')
    .map(message => message.content).filter(content => typeof content === 'string').join('\n');
  const heading = 'Ты можешь:';
  const headingIndex = prompt.indexOf(heading);
  assert.ok(headingIndex >= 0, 'user prompt is missing the «Ты можешь:» block');
  const block = prompt.slice(headingIndex + heading.length).trim();
  assert.ok(block, 'the «Ты можешь:» block is empty');
  return block.split(/\r?\n/u).flatMap(line => line.split(';'))
    .map(line => line.trim()).filter(Boolean)
    .map(line => (numberedPromptLines([{ role: 'user', content: line }])[0]?.text
      ?? line.replace(/^[-*•—–]\s*/u, ''))
      .split(/\s*(?:—|–|:)\s+/u, 1)[0]
      .replace(/^[«“"']|[»”"']$/gu, '').replace(/[;,.]+$/u, '').trim());
}

function orderedCases(cases, prefix) {
  return cases.filter(sceneCase => sceneCase.id.startsWith(prefix))
    .sort((left, right) => Number(left.id.slice(1)) - Number(right.id.slice(1)));
}

function containsOrderedExchanges(rows, exchanges) {
  try { assertNpcExchangeHistory(rows.join('\n'), exchanges); return true; }
  catch { return false; }
}

function directFlowResponse() {
  return JSON.stringify({ interpretation: { npc_goal: 'оставаться при своём деле',
    grounded_attempt: 'продолжить текущее занятие', adaptation: 'literal' },
  resolution: 'direct', goal_result: 'not_achieved',
  activity: { duration_class: 'moment', effort: 'none' }, operations: [],
  operation_choice: null, check: null, reason_code: 'continue_current_activity',
  reason: 'Продолжить ближайшее занятие.' });
}

function conversationResponse(utterance = 'Здравствуй.', act = 'приветствие') {
  return ['Выбор: говорить', `Речь: ${utterance}`, `Поступок: ${act}`,
    'Опора: —', 'Неправда: —', 'Утаил: —'].join('\n');
}

function collectRequestConversationChoice(value) {
  if (Array.isArray(value)) return value.map(collectRequestConversationChoice).find(Boolean) ?? null;
  if (value === null || typeof value !== 'object') return null;
  if (typeof value.choice_id === 'string' && value.operation?.op === 'request_conversation') {
    return value;
  }
  for (const child of Object.values(value)) {
    const found = collectRequestConversationChoice(child);
    if (found) return found;
  }
  return null;
}

function flowResponseFor(sceneCase) {
  const projection = sceneCase.projection
    ?? sceneCase.frame.npc_projections.find(row => row.actor_id === String(sceneCase.npcActorId));
  const input = buildP3NativeNpcDecisionInput(projection);
  const choice = collectRequestConversationChoice(input.request);
  if (!choice) return directFlowResponse();
  return JSON.stringify({
    interpretation: { npc_goal: 'ответить собеседнику',
      grounded_attempt: 'начать разговор с собеседником', adaptation: 'literal' },
    resolution: 'domain_request',
    activity: { duration_class: 'brief', effort: 'none' },
    operations: [], operation_choice: choice.choice_id, check: null,
    reason_code: 'request_conversation', reason: 'Ответить собеседнику.'
  });
}

function flowResponses(sceneCase) {
  return (_fetchCall, roleCall) => {
    if (roleCall?.role_id === 'npc_autonomous_decider'
        || roleCall?.role_id === 'npc_autonomous_decider_format_repair') {
      return flowResponseFor(sceneCase);
    }
    if (roleCall?.role_id === 'npc_conversation_responder'
        || roleCall?.role_id === 'npc_conversation_responder_format_repair') {
      return conversationResponse();
    }
    if (roleCall?.role_id === 'npc_conversation_grounding_auditor') return 'годно';
    throw new Error(`unexpected role ${roleCall?.role_id ?? 'unknown'}`);
  };
}

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

test('P1 real product calls use plain Russian prompt text for all 23 recorded scenes', async () => {
  const fixture = await loadScenes();
  assert.equal(fixture.cases.length, 23);
  const failures = [];
  const sourceFragments = value => value.split(/[;:,.!?]/u).map(fragment => fragment.trim())
    .filter(Boolean);
  const rowContainsKnowledge = (rowText, sourceText) => {
    const rowVariants = npcSourceTextVariants(rowText);
    const fragments = sourceFragments(sourceText);
    assert.ok(fragments.length > 0, 'source knowledge must contain text fragments');
    return fragments.every(fragment =>
      npcSourceTextVariants(fragment).some(sourceVariant =>
        rowVariants.some(rowVariant => ` ${rowVariant} `.includes(` ${sourceVariant} `))));
  };
  for (const sceneCase of fixture.cases) {
    const captured = await attempt(failures, `${sceneCase.id} runReply`, () =>
      runReply(sceneCase, { mode: sceneCase.playerReadback == null
        ? 'factory_only' : 'reply', captureOnly: true }));
    if (!captured) continue;
    const call = captured.calls.find(value => value.role_id === 'npc_conversation_responder');
    check(failures, `${sceneCase.id} responder capture`, () => {
      assert.ok(call, 'real responder role call was not captured');
    });
    if (!call) continue;
    const sourceKnowledge = await attempt(failures, `${sceneCase.id} source knowledge`, async () => {
      const projection = sceneCase.projection
        ?? sceneCase.frame.npc_projections.find(row => row.actor_id === String(sceneCase.npcActorId));
      assert.ok(projection?.template_id, 'NPC profile is required as the source knowledge oracle');
      const profile = await loadP3NpcProfile(projection.template_id,
        { profilesDir: fixtureProfiles });
      return profile?.knowledge_snapshot ?? {};
    });
    if (!sourceKnowledge) continue;
    check(failures, `${sceneCase.id} plain prompt`, () => assertPlainPrompt(call.messages));
    check(failures, `${sceneCase.id} prompt sections`, () => {
      const prompt = splitPrompt(call.messages);
      assert.ok(prompt.system.length > 0);
      for (const [text, headings] of [[prompt.context,
        ['Кто ты', 'Что ты знаешь', 'Во что веришь']], [prompt.current,
        ['Сейчас', 'Что было', 'Что ты знаешь об этом', 'Что ты слышишь', 'Ты можешь']]]) {
        assert.ok(text.length > 0);
        const positions = headings.map(heading => text.indexOf(heading));
        assert.ok(positions.every(position => position >= 0),
          `missing ordered prompt section: ${headings.join(', ')}`);
        assert.deepEqual([...positions].sort((left, right) => left - right), positions,
          `prompt sections are out of order: ${headings.join(', ')}`);
      }
      const rows = numberedPromptLines(call.messages);
      const lineNumbers = rows.map(row => row.number);
      assert.ok(rows.length > 0, 'sent prompt has no numbered rows');
      assert.deepEqual(lineNumbers, Array.from({ length: lineNumbers.length },
        (_value, index) => index + 1), 'sent prompt row numbers must be continuous');
      assert.equal(new Set(lineNumbers).size, lineNumbers.length,
        'sent prompt row numbers must be unique');
    });
    check(failures, `${sceneCase.id} source-backed belief and hypothesis text`, () => {
      const knowledge = sourceKnowledge;
      const facts = knowledge.known_facts ?? [];
      const beliefs = knowledge.beliefs ?? [];
      const hypotheses = knowledge.hypotheses ?? [];
      const beliefHeading = /^(?:#{1,6}[ \t]*)?Во что веришь(?=$|[ \t:—?!.,-])/mu
        .exec(splitPrompt(call.messages).context);
      assert.ok((!beliefs.length && !hypotheses.length) || beliefHeading,
        'beliefs and hypotheses need a real «Во что веришь» section');
      if (!beliefHeading) return;
      const context = splitPrompt(call.messages).context;
      const section = context.slice(beliefHeading.index + beliefHeading[0].length);
      const rows = numberedPromptLines([{ role: 'user', content: section }]);
      assert.ok(rows.length > 0, 'belief section must contain numbered source rows');
      const usedRows = new Set();
      for (const [kind, entries] of [['belief', beliefs], ['hypothesis', hypotheses]]) {
        for (const entry of entries) {
          assert.equal(typeof entry?.summary, 'string', `${kind} source text is missing`);
          const row = rows.find(candidate => !usedRows.has(candidate.number)
            && rowContainsKnowledge(candidate.text, entry.summary));
          assert.ok(row, `${kind} source text is missing from «Во что веришь»`);
          if (!row) continue;
          usedRows.add(row.number);
          if (kind === 'hypothesis') {
            assert.match(row.text, /\(не уверен\)\s*$/u,
              'a hypothesis row must carry the «не уверен» marker');
          }
        }
      }
      for (const fact of facts) {
        assert.equal(typeof fact?.summary, 'string', 'known fact source text is missing');
        assert.ok(!rows.some(row => rowContainsKnowledge(row.text, fact.summary)),
          'known fact text must not be presented as a belief');
      }
    });
  }

  const runtime = await import('@rus/npc-runtime');
  check(failures, 'renderNpcConversationPrompt future export', () => {
    assert.equal(typeof runtime.renderNpcConversationPrompt, 'function');
  });
  check(failures, 'parseNpcConversationReply future export', () => {
    assert.equal(typeof runtime.parseNpcConversationReply, 'function');
  });
  check(failures, 'negative JSON/object oracle', () => {
    assert.throws(() => assertPlainPrompt([{ role: 'user',
      content: 'Контекст:\n{"npc":{"actor_ref":"npc:2"}}' }]));
    assert.throws(() => assertPlainPrompt([{ role: 'user',
      content: 'Список:\n[\n  {"event_ref":"event:one"}\n]' }]));
    assert.throws(() => assertPlainPrompt([{ role: 'user',
      content: '7. Твои вещи: {"топор":1,"брёвна":49}' }]));
    assert.throws(() => assertPlainPrompt([{ role: 'user',
      content: 'Идентификатор: 123e4567-e89b-12d3-a456-426614174000' }]));
    assert.throws(() => assertPlainPrompt([{ role: 'user',
      content: 'Пустой UUID: 00000000-0000-0000-0000-000000000000' }]));
  });
  check(failures, 'splitPrompt accepts two user messages without inserting bytes', () => {
    const context = 'Кто ты\nЧто ты знаешь\nВо что веришь';
    const current = 'Сейчас\nЧто было\n';
    const split = splitPrompt([{ role: 'system', content: 'Правила.' },
      { role: 'user', content: context }, { role: 'user', content: current }]);
    assert.equal(split.system, 'Правила.');
    assert.equal(split.user, context + current);
    assert.equal(split.context, context);
    assert.equal(split.current, current);
  });
  finish(failures);
});

test('P2 reply and autonomous flow retain the same full canonical NPC, knowledge, and memory', async () => {
  const fixture = await loadScenes();
  const snapshotModule = await import('./p3-npc-subject.js');
  const runtime = await import('@rus/npc-runtime');
  const failures = [];
  const hasSnapshotBuilder = typeof snapshotModule.buildP3NpcConversationSnapshots === 'function';
  check(failures, 'snapshot future export', () => assert.equal(hasSnapshotBuilder, true));
  const selected = fixture.cases.filter(sceneCase => sceneCase.playerReadback != null);
  assert.ok(selected.length > 0, 'recorded source scenes are required');
  for (const sceneCase of selected) {
    const projection = sceneCase.projection ?? sceneCase.frame.npc_projections
      .find(row => row.actor_id === String(sceneCase.npcActorId));
    const profile = await loadP3NpcProfile(projection.template_id, { profilesDir: fixtureProfiles });
    const source = npcSourceContent(sceneCase, profile);
    const reply = await runReply(sceneCase);
    const flow = await runFlow(sceneCase, { fetchResponses: flowResponses(sceneCase) });
    const replyRequest = reply.proposal?.decision_context?.request ?? null;
    const flowRequest = flow.result?.decision?.decision_context?.request ?? null;
    check(failures, `${sceneCase.id} actual reply request`, () => assert.ok(replyRequest,
      `reply failed: ${reply.error?.message ?? 'no proposal'}`));
    check(failures, `${sceneCase.id} actual flow request`, () => assert.ok(flowRequest,
      `flow failed: ${flow.error?.message ?? 'no checkpoint decision'}`));
    if (!replyRequest || !flowRequest || !hasSnapshotBuilder) continue;
    await checkAsync(failures, `${sceneCase.id} independent source content oracle`, async () => {
      const player = sceneCase.frame.actors.find(actor => actor.actor_ref === 'avatar');
      const npcRef = { entity_kind: 'npc', entity_id: String(sceneCase.npcActorId) };
      const playerRef = { entity_kind: 'player_character', entity_id: String(player.actor_id) };
      const snapshots = snapshotModule.buildP3NpcConversationSnapshots({
        projection, profile, frame: sceneCase.frame, player, npcRef, playerRef,
        perceptionRef: replyRequest.perceived_message.perception_result_ref,
        utterance: sceneCase.utterance, currentTurns: new Set(sceneCase.currentTurns.turns)
      });
      const inputBefore = structuredClone(snapshots.projector_input);
      assertNpcSourceContent({ knowledge: snapshots.projector_input.knowledge_snapshot,
        memory: snapshots.projector_input.memory_snapshot }, source);
      const canonical = projectNpcConversationSubject(freezeDeep(snapshots.projector_input));
      assertNpcSourceContent(canonical, source);
      assert.deepEqual(snapshots.projector_input, inputBefore, 'canonical projector mutated source snapshots');
      for (const [label, request] of [['reply', replyRequest], ['flow', flowRequest]]) {
        assert.ok(request.npc, `${label} NPC content missing`);
        assertNpcSourceContent(request, source);

      }
      for (const field of ['npc', 'knowledge', 'memory']) {
        assert.deepEqual(flowRequest[field], replyRequest[field], `${field} identifiers and content must be identical in reply and flow`);
      }
      if (typeof runtime.renderNpcConversationPrompt === 'function') {
        const beforeRender = structuredClone(replyRequest);
        await runtime.renderNpcConversationPrompt(freezeDeep(replyRequest));
        assert.deepEqual(replyRequest, beforeRender, 'prompt rendering mutated the request');
      }
    });
  }
  finish(failures);
});

test('P3 both routes expose the shared action builder and source-backed movement choices', async () => {
  const fixture = await loadScenes();
  const failures = [];
  const cases = fixture.cases.filter(candidate => candidate.playerReadback != null)
    .map(sceneCase => ({ sceneCase, reachable: { approach: true, retreat: true } }));
  const source = caseById(fixture.cases, 'A1');
  for (const [id, far, reachable] of [
    ['near-no-retreat', false, { approach: false, retreat: false }],
    ['far-reachable', true, { approach: true, retreat: true }],
    ['far-no-approach', true, { approach: false, retreat: true }]
  ]) {
    const sceneCase = structuredClone(source);
    sceneCase.id = id;
    if (far) {
      const player = sceneCase.frame.actors.find(actor => actor.actor_ref === 'avatar');
      const position = [player.position[0] + 3, player.position[1], player.position[2]];
      sceneCase.frame.actors.find(actor => String(actor.actor_id) === String(sceneCase.npcActorId)).position = position;
      const projection = sceneCase.frame.npc_projections.find(row => String(row.actor_id) === String(sceneCase.npcActorId));
      projection.position = [...position];
      if (sceneCase.projection) sceneCase.projection.position = [...position];
    }
    cases.push({ sceneCase, reachable });
  }
  assert.ok(cases.length > 0, 'action source cases are required');
  for (const { sceneCase, reachable } of cases) {
    const expected = expectedNpcActionLabels(sceneCase, reachable);
    for (const [label, invoke] of [['reply', runReply], ['flow', runFlow]]) {
      const captured = await attempt(failures, `${sceneCase.id}/${label} capture`, () =>
        invoke(sceneCase, { captureOnly: true, nativeAdapterOverrides: {
          queryPath: async request => {
            assert.equal(request.actorRef, `npc:${sceneCase.npcActorId}`);
            assert.ok([0, 1].includes(request.targetRadius));
            return { reachable: request.targetRadius === 0 ? reachable.retreat : reachable.approach };
          }
        } }));
      if (!captured) continue;
      check(failures, `${sceneCase.id}/${label} independent path oracle`, () =>
        assertNpcReachabilityQueries(captured.nativeCalls, sceneCase, reachable));
      check(failures, `${sceneCase.id}/${label} independent actions`, () => {
        const role = label === 'reply' ? 'npc_conversation_responder' : 'npc_autonomous_decider';
        const call = captured.calls.find(value => value.role_id === role);
        assert.ok(call, 'product model call missing');
        const labels = label === 'reply' ? actionLabelsFromPrompt(call.messages)
          : assertFlowConversationChoices(call.messages).map(choice => choice.label);
        assertNpcActionLabels(labels, expected, label === 'flow');
      });
    }
  }
  finish(failures);
});

test('P4 autonomous conversation selection makes a separate text call before native speech', async () => {
  const fixture = await loadScenes();
  const sceneCase = caseById(fixture.cases, 'A1');
  const result = await runFlow(sceneCase, { fetchResponses: flowResponses(sceneCase),
    nativeAdapterOverrides: { queryPath: async () => ({ reachable: true }) } });
  const failures = [];
  const roles = result.calls.map(call => call.role_id);
  const autonomousIndex = roles.indexOf('npc_autonomous_decider');
  const conversationIndex = roles.indexOf('npc_conversation_responder');
  const auditIndex = roles.indexOf('npc_conversation_grounding_auditor');
  check(failures, 'controlled autonomous plan', () => {
    assert.equal(result.result?.decision?.plan?.schema, 'npc_step_plan_v1');
    assert.ok(result.result.decision.plan.operations.some(operation =>
      operation.op === 'request_conversation'));
  });
  check(failures, 'separate conversation and audit calls', () => {
    assert.ok(autonomousIndex >= 0);
    assert.ok(conversationIndex > autonomousIndex);
    assert.ok(auditIndex > conversationIndex);
  });
  const conversationCall = result.calls[conversationIndex];
  if (conversationCall) {
    check(failures, 'plain Russian conversation input', () => assertPlainPrompt(conversationCall.messages));
  }
  const speak = result.nativeCalls.find(call => call.method === 'execute'
    && typeof call.envelope?.args?.utterance === 'string');
  check(failures, 'only the conversation result reaches native speech', () => {
    assert.ok(speak, 'no native speech operation was applied');
    assert.ok(speak.afterRoleCalls > auditIndex,
      'native speech occurred before the conversation/audit calls');
    assert.equal(speak.envelope.args.utterance, 'Здравствуй.');
  });
  finish(failures);
});

test('P5 stable system and context sections are byte-identical across adjacent recorded turns', async () => {
  const fixture = await loadScenes();
  const prompts = new Map();
  const failures = [];
  for (const sceneCase of fixture.cases) {
    const result = await attempt(failures, `${sceneCase.id} runReply`, () =>
      runReply(sceneCase, { mode: sceneCase.playerReadback == null
        ? 'factory_only' : 'reply', captureOnly: true }));
    if (!result) continue;
    const call = result.calls.find(value => value.role_id === 'npc_conversation_responder');
    if (!call) {
      failures.push(`${sceneCase.id}: no responder input captured`);
      continue;
    }
    await checkAsync(failures, `${sceneCase.id} sections`, async () => {
      prompts.set(sceneCase.id, splitPrompt(call.messages));
    });
  }
  const a1 = prompts.get('A1');
  if (a1) {
    for (const sceneCase of fixture.cases) {
      check(failures, `${sceneCase.id} system equals A1`, () => {
        assert.equal(prompts.get(sceneCase.id)?.system, a1.system);
      });
    }
  }
  check(failures, 'A1/V1 NPC-specific context differs', () => {
    const v1 = prompts.get('V1');
    assert.ok(a1, 'A1 responder prompt was not captured');
    assert.ok(v1, 'V1 responder prompt was not captured');
    assert.notEqual(a1.context, v1.context,
      'the context section must distinguish the two NPCs');
  });
  let adjacentPairs = 0;
  for (const prefix of ['A', 'B', 'V']) {
    const group = orderedCases(fixture.cases, prefix);
    for (let index = 1; index < group.length; index++) {
      const previous = prompts.get(group[index - 1].id);
      const current = prompts.get(group[index].id);
      if (!previous || !current) continue;
      adjacentPairs++;
      check(failures, `${group[index - 1].id}/${group[index].id} stable prefix`, () => {
        assert.equal(current.system, previous.system);
        assert.equal(current.context, previous.context);
      });
    }
  }
  check(failures, 'all 20 adjacent pairs checked', () => assert.equal(adjacentPairs, 20));
  finish(failures);
});

test('P6 history preserves complete exchanges, unanswered speech, and rejected replies are not world facts', async () => {
  const fixture = await loadScenes();
  const failures = [];
  const replyResults = new Map();
  const answeredExchange = fixture.cases.flatMap(sceneCase =>
    sceneCase.expectedExchanges ?? []).find(exchange =>
    typeof exchange.npcText === 'string' && exchange.npcText !== '');
  check(failures, 'exchange-row controls', () => {
    assert.ok(answeredExchange, 'scene fixtures must include an answered exchange');
    const oneLine = `Он сказал тебе: «${answeredExchange.playerText}» `
      + `Ты ответил: «${answeredExchange.npcText}»`;
    assert.equal(containsOrderedExchanges([oneLine], [answeredExchange]), true,
      'one-line exchange control must be accepted');
    assert.equal(containsOrderedExchanges([
      `Он сказал тебе: «${answeredExchange.playerText}»`,
      `Ты ответил: «${answeredExchange.npcText}»`
    ], [answeredExchange]), false,
    'split exchange control must be rejected');
  });
  for (const sceneCase of fixture.cases.filter(candidate => candidate.playerReadback != null)) {
    const reply = await runReply(sceneCase);
    replyResults.set(sceneCase.id, reply);
    for (const [index, responderCall] of reply.calls
      .filter(call => call.role_id === 'npc_conversation_responder').entries()) {
      check(failures, `${sceneCase.id} responder ${index + 1} history prompt`, () => {
        const prompt = splitPrompt(responderCall.messages);
        assert.ok(prompt.current.includes('Что было'),
          'responder prompt is missing the «Что было» section');
      });
    }
    const request = reply.proposal?.decision_context?.request;
    check(failures, `${sceneCase.id} actual request`, () => assert.ok(request));
    if (!request) continue;
    const history = request.public_conversation_history;
    const historicalHistory = history.slice(0, -1);
    const avatarId = sceneCase.frame.actors
      .find(actor => actor.actor_ref === 'avatar')?.actor_id;
    const expectedExchanges = sceneCase.expectedExchanges ?? [];
    const expectedLines = expectedExchanges.flatMap(exchange => exchange.npcText == null
      ? [exchange.playerText] : [exchange.playerText, exchange.npcText]);
    check(failures, `${sceneCase.id} ordered complete exchanges`, () => {
      let cursor = 0;
      for (const exchange of expectedExchanges) {
        const playerLine = entry => entry.utterance_text === exchange.playerText
          && entry.speaker_ref?.entity_kind === 'player_character'
          && entry.speaker_ref.entity_id === String(avatarId);
        if (exchange.npcText != null) {
          const pairStart = historicalHistory.findIndex((entry, index) => index >= cursor
            && playerLine(entry)
            && historicalHistory[index + 1]?.utterance_text === exchange.npcText
            && historicalHistory[index + 1]?.speaker_ref?.entity_kind === 'npc'
            && historicalHistory[index + 1]?.speaker_ref.entity_id === String(sceneCase.npcActorId));
          assert.ok(pairStart >= cursor, `missing target-NPC exchange: ${exchange.id}`);
          cursor = pairStart + 2;
        } else {
          const playerIndex = historicalHistory.findLastIndex((entry, index) => index >= cursor
            && playerLine(entry));
          assert.ok(playerIndex >= cursor, `missing unanswered player line: ${exchange.playerText}`);
          cursor = playerIndex + 1;
        }
      }
    });
    check(failures, `${sceneCase.id} ordered exchange prefix`, () => {
      const current = history.at(-1);
      assert.ok(current, 'current heard player line is missing');
      assert.equal(current.utterance_text, sceneCase.utterance);
      assert.deepEqual(current.speaker_ref,
        { entity_kind: 'player_character', entity_id: avatarId });
      const targetRef = `npc:${sceneCase.npcActorId}`;
      const hasOtherNpcHistory = sceneCase.projection.conversation_memory.some(record =>
        record.kind === 'heard' && (record.speaker_ref === 'avatar'
          || record.listener_ref === 'avatar')
        && record.speaker_ref !== targetRef && record.listener_ref !== targetRef);
      if (!hasOtherNpcHistory) {
        const actualPrefix = historicalHistory
          .map(entry => entry.utterance_text);
        assert.deepEqual(actualPrefix, expectedLines,
          'conversation history shifted, dropped, or reordered a complete exchange');
      }
    });
    const responderCall = reply.calls.find(call => call.role_id === 'npc_conversation_responder');
    await checkAsync(failures, `${sceneCase.id} rendered What Was prefix`, async () => {
      const currentSection = splitPrompt(responderCall.messages).current;
      const start = currentSection.indexOf('Что было');
      assert.ok(start >= 0, 'prompt has no What Was section');
      const laterHeadings = ['Что ты знаешь об этом', 'Что ты слышишь', 'Ты можешь']
        .map(heading => currentSection.indexOf(heading, start + 'Что было'.length))
        .filter(index => index >= 0);
      const end = laterHeadings.length ? Math.min(...laterHeadings) : currentSection.length;
      const rows = currentSection.slice(start, end).split(/\r?\n/u)
        .map(line => line.trim()).filter(Boolean);
      assert.ok(containsOrderedExchanges(rows, expectedExchanges),
        'rendered history split, dropped, or reordered a complete exchange');
    });
    if (expectedExchanges.some(exchange => exchange.npcText == null)) {
      const responder = reply.calls.find(call => call.role_id === 'npc_conversation_responder');
      check(failures, `${sceneCase.id} unanswered line`, () => {
        const prompt = splitPrompt(responder.messages).current;
        for (const exchange of expectedExchanges.filter(value => value.npcText == null)) {
          assert.ok(numberedPromptLines([{ role: 'user', content: prompt }])
            .find(row => row.text === formatNpcConversationExchangeLine(exchange)),
          'complete unanswered exchange line is missing');
        }
        assert.match(prompt, /Ты не ответил\./u);
      });
    }
  }
  const a2 = caseById(fixture.cases, 'A2');
  const a3Reply = replyResults.get('A3');
  const a3Request = a3Reply?.proposal?.decision_context?.request;
  check(failures, 'A2 is not invented in A3 memory', () => {
    assert.ok(a3Request);
    assert.equal(JSON.stringify(a3Request.memory).includes(a2.utterance), false);
  });
  check(failures, 'A2 readback remains absent', () => assert.equal(a2.playerReadback, null));
  for (const prefix of ['A', 'B', 'V']) {
    const group = orderedCases(fixture.cases, prefix);
    for (let index = 1; index < group.length; index++) {
      const previous = group[index - 1];
      const current = group[index];
      if (previous.playerReadback == null || current.playerReadback == null) continue;
      const previousExchanges = previous.expectedExchanges ?? [];
      const currentExchanges = current.expectedExchanges ?? [];
      check(failures, `${previous.id}/${current.id} prior turn remains first-class`, () => {
        assert.deepEqual(currentExchanges.slice(0, previousExchanges.length), previousExchanges,
          'the next prompt must retain the previous complete exchange prefix until the window shifts');
        assert.ok(currentExchanges.some(exchange => exchange.playerText === previous.utterance),
          'the prior utterance is missing from the next restored exchange window');
      });
    }
  }

  const rejectedCase = caseById(fixture.cases, 'A1');
  const rejectedText = 'Ты видел тайный клад за стеной?';
  const repairedText = conversationResponse('Хорошо, поговорим.', 'ответ');
  let knownFactLine = '1';
  await checkAsync(failures, 'sent knowledge row for rejected factual claim', async () => {
    const captured = await runReply(rejectedCase, { captureOnly: true });
    const responder = captured.calls.find(call => call.role_id === 'npc_conversation_responder');
    assert.ok(responder, 'the responder message was not captured');
    const prompt = splitPrompt(responder.messages);
    const lines = prompt.context.split(/\r?\n/u);
    const knowledgeStart = lines.findIndex(line =>
      /^\s*(?:#{1,6}[ \t]*)?Что ты знаешь(?=$|[ \t:—–])/u.test(line));
    assert.ok(knowledgeStart >= 0, 'the sent context has no knowledge heading');
    const nextHeading = lines.findIndex((line, index) => index > knowledgeStart
      && /^\s*(?:#{1,6}[ \t]*)?Во что веришь(?=$|[ \t:—–])/u.test(line));
    const knowledgeLines = lines.slice(knowledgeStart + 1,
      nextHeading < 0 ? lines.length : nextHeading);
    const row = numberedPromptLines([{ role: 'user', content: knowledgeLines.join('\n') }])[0];
    assert.ok(row, 'the sent knowledge section has no numbered row for false support');
    knownFactLine = String(row.number);
  });
  let auditAttempts = 0;
  const frameBefore = structuredClone(rejectedCase.frame);
  const world = structuredClone(rejectedCase.frame);
  const nativeAdapterOverrides = {
    refreshObservation: async () => structuredClone(world),
    execute: async envelope => {
      const text = envelope.args.utterance;
      assert.equal(typeof text, 'string');
      const projection = world.npc_projections.find(row => String(row.actor_id) === String(rejectedCase.npcActorId));
      projection.conversation_memory.push({ kind: 'said', speaker_ref: rejectedCase.targetActorRef,
        listener_ref: 'avatar', text, turn: world.turn });
      const hero = world.actors.find(actor => actor.actor_ref === 'avatar');
      return { schema: 'p3_native_operation_readback_v1', operation_id: envelope.operation_id,
        status: 'applied', native_effect: { effect_status: 'confirmed', primitive: 'speak',
          actor_id: String(rejectedCase.npcActorId), speakerId: String(rejectedCase.npcActorId),
          contribution_kind: 'speech', utterance: text, actualHeardListenerIds: [String(hero.actor_id)] },
        before: { turn: world.turn }, after: { turn: world.turn } };
    }
  };
  const rejected = await runReply(rejectedCase, { maxRepairAttempts: 1, nativeAdapterOverrides,
    fetchResponses: (_fetchCall, roleCall) => {
      if (roleCall?.role_id === 'npc_conversation_responder') {
        return ['Выбор: говорить', `Речь: ${rejectedText}`, 'Поступок: вопрос',
          `Опора: ${knownFactLine}`, 'Неправда: —', 'Утаил: —'].join('\n');
      }
      if (roleCall?.role_id === 'npc_conversation_grounding_auditor') {
        return ++auditAttempts === 1
          ? `негодно: «${rejectedText}» — В запросе нет сведений о кладе.` : 'годно';
      }
      if (roleCall?.role_id === 'npc_conversation_responder_format_repair') return repairedText;
      return 'годно';
    } });
  check(failures, 'auditor rejection is repaired before native speech', () => {
    const auditorCalls = rejected.calls.filter(call => call.role_id === 'npc_conversation_grounding_auditor');
    const repairCalls = rejected.calls.filter(call =>
      call.role_id === 'npc_conversation_responder_format_repair');
    assert.equal(auditorCalls.length, 2, 'original and repaired speech must reach the auditor');
    assert.ok(repairCalls.some(call => call.repair_kind === 'semantic'),
      'the rejected speech must trigger the real semantic repair role');
    const nativeSpeech = rejected.nativeCalls.filter(call => call.method === 'execute'
      && typeof call.envelope.args?.utterance === 'string');
    assert.ok(nativeSpeech.length > 0, 'the repaired speech was not applied');
    assert.ok(nativeSpeech.every(call => call.envelope.args.utterance !== rejectedText),
      'rejected speech reached the native world');
    assert.deepEqual(rejectedCase.frame, frameBefore);
  });
  const subsequentCase = structuredClone(rejectedCase);
  subsequentCase.frame = structuredClone(world);
  subsequentCase.projection = subsequentCase.frame.npc_projections.find(row =>
    String(row.actor_id) === String(rejectedCase.npcActorId));
  const subsequent = await runReply(subsequentCase, { nativeAdapterOverrides,
    fetchResponses: [conversationResponse('Слушаю.', 'ответ'), 'годно'] });
  check(failures, 'post-rejection request contains only applied speech', () => {
    assertPostRejectionMemory(subsequent.request,
      subsequent.calls.filter(call => call.role_id === 'npc_conversation_responder')
        .flatMap(call => call.messages.map(message => message.content)).join('\n'),
      rejectedText, 'Хорошо, поговорим.');
  });
  finish(failures);
});

test('P7 changing only A3/A6 utterance on the same A3 frame changes only the current section', async () => {
  const fixture = await loadScenes();
  const a3 = caseById(fixture.cases, 'A3');
  const a6 = caseById(fixture.cases, 'A6');
  const repeated = { ...a3, utterance: a6.utterance,
    playerReadback: { ...a3.playerReadback,
      native_effect: { ...a3.playerReadback.native_effect, utterance: a6.utterance } } };
  const left = await runReply(a3, { captureOnly: true });
  const right = await runReply(repeated, { captureOnly: true });
  const leftCall = left.calls.find(call => call.role_id === 'npc_conversation_responder');
  const rightCall = right.calls.find(call => call.role_id === 'npc_conversation_responder');
  const failures = [];
  check(failures, 'same frame used for both inputs', () => assert.deepEqual(repeated.frame, a3.frame));
  check(failures, 'same non-text readback window', () => {
    assert.deepEqual(repeated.playerReadback.before, a3.playerReadback.before);
    assert.deepEqual(repeated.playerReadback.after, a3.playerReadback.after);
    assert.deepEqual(repeated.currentTurns, a3.currentTurns);
  });
  if (leftCall && rightCall) {
    const leftPrompt = splitPrompt(leftCall.messages);
    const rightPrompt = splitPrompt(rightCall.messages);
    check(failures, 'stable system/context', () => {
      assert.equal(rightPrompt.system, leftPrompt.system);
      assert.equal(rightPrompt.context, leftPrompt.context);
    });
    check(failures, 'current utterance only changes current section', () => {
      assert.notEqual(rightPrompt.current, leftPrompt.current);
      assert.ok(rightPrompt.current.includes(a6.utterance));
    });
  } else failures.push('A3/A6 responder inputs were not captured');
  finish(failures);
});
