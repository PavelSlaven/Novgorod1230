import assert from 'node:assert/strict';
import test from 'node:test';
import { assertNpcSpeechBounds, assertNoNpcSystemLines, npcExchangePresence, assertCurrentNpcUtterance, assertPlainPrompt, buildCanonicalRequest, formatNpcConversationExchangeLine,
  loadOverflow, loadScenes, npcSourceTextVariants, runAudit, runReply, splitPrompt,
  unicodeLength }
  from './npc-talk-test-helpers.js';

const RESPONDER = 'npc_conversation_responder';
const AUDITOR = 'npc_conversation_grounding_auditor';
const AUDIT_PLAN = Object.freeze({ contribution_kind: 'speech',
  speech: Object.freeze({ utterance_text: '😀'.repeat(400), claims: [] }) });

function callsFor(run, roleId) {
  return (run?.calls ?? []).filter(call => call.role_id === roleId);
}

function contentLength(messages) {
  return (messages ?? []).reduce((total, message) => total
    + unicodeLength(typeof message?.content === 'string' ? message.content : ''), 0);
}

function systemContent(messages) {
  return (messages ?? []).filter(message => message?.role === 'system')
    .map(message => typeof message.content === 'string' ? message.content : '');
}

function containsText(content, expected) {
  if (typeof content !== 'string') return false;
  if (content.includes(expected)) return true;
  try {
    const value = JSON.parse(content);
    const strings = (entry) => entry === null || typeof entry !== 'object'
      ? typeof entry === 'string' ? [entry] : []
      : Object.values(entry).flatMap(strings);
    return strings(value).some(text => text.includes(expected));
  } catch {
    return false;
  }
}

function collectPromptIssues(messages, split, { total, system, body, label }) {
  const issues = [];
  if (!Array.isArray(messages) || messages.length === 0) {
    issues.push(`${label}: no captured messages`);
    return issues;
  }
  try {
    assertPlainPrompt(messages);
  } catch (error) {
    issues.push(`${label}: ${error.message}`);
  }
  const totalChars = contentLength(messages);
  if (totalChars > total) issues.push(`${label}: ${totalChars} > ${total}`);
  const rules = systemContent(messages);
  const systemChars = rules.reduce((sum, text) => sum + unicodeLength(text), 0);
  if (systemChars === 0) issues.push(`${label}: system prompt missing`);
  if (systemChars > system) issues.push(`${label}: system ${systemChars} > ${system}`);
  if (split?.error) {
    issues.push(`${label}: ${split.error.message}`);
  } else if (split) {
    if (typeof split.part2 !== 'string' || typeof split.part3 !== 'string') {
      issues.push(`${label}: prompt sections are not strings`);
    } else {
      const partsChars = unicodeLength(split.part2) + unicodeLength(split.part3);
      if (partsChars > body) issues.push(`${label}: part2+part3 ${partsChars} > ${body}`);
    }
  }
  return issues;
}

function splitResult(messages) {
  try {
    return { value: splitPrompt(messages), error: null };
  } catch (error) {
    return { value: null, error };
  }
}

const exchangePresence = npcExchangePresence;

function controlTranscript(exchanges, { omit = null, half = null } = {}) {
  return exchanges.filter(exchange => exchange !== omit).map(exchange =>
    exchange === half ? `Он сказал тебе: «${exchange.playerText}»`
      : formatNpcConversationExchangeLine(exchange)).join('\n');
}

function replaceSystemRules(messages, length) {
  let assigned = false;
  return messages.map(message => {
    if (message.role !== 'system') return structuredClone(message);
    if (assigned) return { ...structuredClone(message), content: '' };
    assigned = true;
    return { ...structuredClone(message), content: 'а'.repeat(length) };
  });
}

function auditRuleIssues(messages) {
  const rules = systemContent(messages);
  const text = rules.join('');
  const length = rules.reduce((sum, content) => sum + unicodeLength(content), 0);
  return [
    ...(length === 0 ? ['empty-auditor-rules'] : []),
    ...(!/[А-ЯЁа-яё]/u.test(text) ? ['auditor-rules-not-Russian'] : []),
    ...(length > 600 ? ['auditor-rules-over-600'] : [])
  ];
}

test('B1 NPC prompt fits the whole-window Unicode budget for all 23 scenes', async () => {
  const { cases = [] } = await loadScenes();
  const failures = [];
  if (cases.length !== 23) failures.push(`expected 23 scenes, got ${cases.length}`);
  const captures = [];
  for (const sceneCase of cases) {
    try {
      captures.push({ sceneCase,
        run: await runReply(sceneCase, { captureOnly: true }) });
    } catch (error) {
      captures.push({ sceneCase, run: null, error });
    }
  }

  for (const { sceneCase, run, error } of captures) {
    const label = sceneCase.id;
    if (error) failures.push(`${label}: ${error.message}`);
    const calls = callsFor(run, RESPONDER);
    if (calls.length !== 1) {
      failures.push(`${label}: expected one captured responder call, got ${calls.length}`);
      continue;
    }
    const { messages } = calls[0];
    const split = splitResult(messages);
    failures.push(...collectPromptIssues(messages, split.value
      ? { ...split.value, error: null } : { error: split.error },
    { total: 8000, system: 1600, body: 6400, label }));

    const exchanges = sceneCase.expectedExchanges;
    if (!Array.isArray(exchanges)) {
      failures.push(`${label}: source-grounded expectedExchanges missing`);
      continue;
    }
    if (typeof split.value?.part3 === 'string') {
      if (!split.value.part3.includes(sceneCase.utterance)) {
        failures.push(`${label}: current utterance missing from part3`);
      }
      const presence = exchangePresence(exchanges, split.value.part3);
      failures.push(...presence.issues.map(issue => `${label}: ${issue}`));
      failures.push(...presence.rows.filter(row => !row.complete)
        .map(row => `${label}: dropped exchange ${row.id}`));
    }
  }

  assert.equal(failures.length, 0, failures.join('\n'));
});

test('B2 auditor receives the NPC context within the real audit-call budget', async () => {
  const { cases = [] } = await loadScenes();
  const failures = [];
  if (cases.length !== 23) failures.push(`expected 23 scenes, got ${cases.length}`);
  if (!cases.some(sceneCase => sceneCase.id === 'A6')) failures.push('A6 boundary-control scene missing');

  const captures = [];
  for (const sceneCase of cases) {
    try {
      const request = await buildCanonicalRequest(sceneCase);
      const npcRun = await runReply(sceneCase, { captureOnly: true });
      const auditRun = await runAudit(request, AUDIT_PLAN);
      captures.push({ sceneCase, request, npcRun, auditRun });
    } catch (error) {
      captures.push({ sceneCase, error });
    }
  }

  let controlMessages = null;
  for (const { sceneCase, npcRun, auditRun, error } of captures) {
    const label = sceneCase.id;
    if (error) {
      failures.push(`${label}: ${error.message}`);
      continue;
    }
    const npcCall = callsFor(npcRun, RESPONDER)[0];
    const auditCalls = callsFor(auditRun, AUDITOR);
    if (!npcCall) failures.push(`${label}: no actual P3 responder capture`);
    if (auditCalls.length !== 1) {
      failures.push(`${label}: expected one external auditor call, got ${auditCalls.length}`);
      continue;
    }
    const auditCall = auditCalls[0];
    if (sceneCase.id === 'A6') controlMessages = auditCall.messages;
    failures.push(...auditRuleIssues(auditCall.messages).map(issue => `${label}: ${issue}`));
    const inputChars = contentLength(auditCall.messages);
    if (inputChars > 7400) failures.push(`${label}: auditor input ${inputChars} > 7400`);

    const auditUser = (auditCall.messages ?? []).find(message => message.role === 'user')?.content ?? '';
    const npcParts = splitResult(npcCall?.messages ?? []);
    if (npcParts.error) {
      failures.push(`${label}: actual NPC prompt: ${npcParts.error.message}`);
    } else if (!npcParts.value.part2 || !npcParts.value.part3
      || !containsText(auditUser, npcParts.value.part2)
      || !containsText(auditUser, npcParts.value.part3)) {
      failures.push(`${label}: audit user content omits NPC part2/part3`);
    }
    if (!containsText(auditUser, AUDIT_PLAN.speech.utterance_text)) {
      failures.push(`${label}: audit user content omits the NPC answer`);
    }

    const npcSystem = systemContent(npcCall?.messages ?? []).join('');
    try { assertNoNpcSystemLines(auditCall.messages, npcSystem); }
    catch (error) { failures.push(`${label}: ${error.message}`); }
    const sourceText = [JSON.stringify(sceneCase.projection), sceneCase.utterance,
      'Проверь опору речи. Ответь годно или негодно.', AUDIT_PLAN.speech.utterance_text].join('\n');
    assertNoNpcSystemLines([{ role: 'user', content: sourceText }], npcSystem);
    const leakedLine = npcSystem.split(/\r?\n/u).find(line => line.trim());
    assert.throws(() => assertNoNpcSystemLines([{ role: 'user', content: sourceText + '\n' + leakedLine }],
      npcSystem), /system line leaked/);

  }

  const boundaryScene = cases.find(sceneCase => sceneCase.id === 'A6');
  assert.ok(boundaryScene, 'a boundary scene is required');
  for (const length of [400, 401, 500]) {
    const answer = '😀'.repeat(length);
    const response = value => ['Выбор: говорить', `Речь: ${value}`, 'Поступок: ответ',
      'Опора: —', 'Неправда: —', 'Утаил: —'].join('\n');
    const run = await runReply(boundaryScene, { fetchResponses: (_http, role) => {
      if (role?.role_id === RESPONDER) return response(answer);
      if (role?.role_id === 'npc_conversation_responder_format_repair') return response('😀');
      return 'годно';
    } });
    try {
      const auditCalls = callsFor(run, AUDITOR);
      const audited = auditCalls.flatMap(call => call.messages.flatMap(message =>
        [...message.content.matchAll(/😀+/gu)].map(match => match[0])));
      for (const call of auditCalls) assert.ok(contentLength(call.messages) <= 7400,
        'boundary auditor input exceeds 7400');
      assertNpcSpeechBounds({ audited, accepted: run.plan?.speech?.utterance_text ?? null,
        error: run.error, repairs: callsFor(run, 'npc_conversation_responder_format_repair')
          .map(call => call.repair_kind) }, length === 400 ? answer : null);
    } catch (error) { failures.push(`NPC answer ${length}: ${error.message}`); }
  }

  controlMessages ??= captures.find(({ auditRun }) => callsFor(auditRun, AUDITOR).length === 1)
    ?.auditRun.calls.find(call => call.role_id === AUDITOR)?.messages ?? null;
  if (controlMessages) {
    const at600 = replaceSystemRules(controlMessages, 600);
    const at601 = replaceSystemRules(controlMessages, 601);
    if (auditRuleIssues(at600).length !== 0) {
      failures.push('600-character Russian audit-rule control was rejected');
    }
    if (!auditRuleIssues(at601).includes('auditor-rules-over-600')) {
      failures.push('601-character audit-rule control was accepted');
    }
  } else {
    failures.push('no captured auditor request for the 600/601 controls');
  }

  assert.equal(failures.length, 0, failures.join('\n'));
});

test('B3 overflow keeps the core and an exact contiguous suffix of full exchanges', async () => {
  const overflow = await loadOverflow();
  const failures = [];
  const overflowSource = overflow.source?.overflow_scenario ?? {};
  const threshold = overflowSource.thresholdBoundaryExchange;
  if (!Number.isSafeInteger(overflowSource.sourceHistoryChars)
    || overflowSource.sourceHistoryChars < 5000) {
    failures.push('overflow source did not reach 5000 code points');
  }
  if (!Number.isSafeInteger(threshold?.previousHistoryChars)
    || threshold.previousHistoryChars >= 5000
    || !Number.isSafeInteger(threshold?.historyChars) || threshold.historyChars < 5000
    || threshold.historyChars !== overflowSource.sourceHistoryChars) {
    failures.push('overflow source threshold is not the first complete exchange at 5000');
  }
  if (!Number.isSafeInteger(overflowSource.sourceCycleCount)
    || overflowSource.sourceCycleCount < 1) failures.push('overflow source cycle count missing');
  const exchanges = overflow.expectedExchanges ?? [];
  if (!Array.isArray(overflow.expectedExchanges)) failures.push('overflow expectedExchanges missing');
  assert.ok(exchanges.length > 0, 'overflow source exchange list must be nonempty');

  const source = overflow.wireSubject ?? {};
  const profile = source.npc ?? {};
  const knowledge = source.knowledge ?? {};
  const profileChecks = [
    ['имя', profile.identity?.name_or_label],
    ['возраст', profile.identity?.age_range],
    ['происхождение', profile.identity?.origin],
    ['роль', profile.social_role?.status],
    ...(profile.temperament ?? []).map(entry => ['нрав', entry.summary]),
    ...(profile.values ?? []).map(entry => ['ценность', entry.summary]),
    ...(profile.goals ?? []).map(entry => ['цель', entry.summary]),
    ...(profile.fears ?? []).map(entry => ['страх', entry.summary])
  ];
  const facts = new Map((knowledge.known_facts ?? [])
    .map(entry => [entry.fact_ref?.entity_id, entry.summary]));
  const factText = ref => facts.get(ref);
  const knowledgeChecks = [
    ['двор', factText('novgorod-dev-master-yard')],
    ['дом', factText('novgorod-dev-master-house')],
    ['тайна', factText('novgorod-dev-master-secret-firesteel')],
    ['огонь кресалом', factText('claim:ha-firesteel-ignition')]
  ];
  const workSummary = factText('novgorod-dev-master-work-now');
  const craftChecks = [...facts.entries()]
    .filter(([ref]) => /^claim:population-woodwork-(?:axe|adze|chisel)$/u.test(ref))
    .map(([, summary]) => summary);
  const craftNames = craftChecks.map(summary => summary.split(/\s/u, 1)[0]);
  const ownedItemStacks = new Set((knowledge.known_facts ?? [])
    .filter(entry => entry.fact_ref?.entity_id?.startsWith('p3-owns-'))
    .map(entry => entry.summary.match(/«([^»]+)»/u)?.[1]).filter(Boolean));
  const beliefCore = [...(knowledge.beliefs ?? []),
    ...(knowledge.hypotheses ?? [])].map(entry => entry.summary);
  if (profileChecks.some(([, value]) => typeof value !== 'string' || !value.trim())
    || knowledgeChecks.some(([, value]) => typeof value !== 'string' || !value.trim())
    || typeof workSummary !== 'string' || craftChecks.length !== 3
    || ownedItemStacks.size === 0 || beliefCore.length === 0) {
    failures.push('overflow fixture core source is incomplete');
  }
  const rowContainsSource = (section, value) => {
    if (typeof value !== 'string') return false;
    const normalizedRows = section.split(/\r?\n/u)
      .map(row => npcSourceTextVariants(row)[0]).filter(Boolean);
    return npcSourceTextVariants(value).some(variant =>
      normalizedRows.some(row => row.includes(variant)));
  };
  const hasGroupedCraftLine = section => {
    const names = craftNames.map(name => npcSourceTextVariants(name)[0]);
    return section.split(/\r?\n/u).map(row => npcSourceTextVariants(row)[0])
      .some(row => names.every(name => row.includes(name))
        && row.includes('знаком') && row.includes('по дереву'));
  };
  const sectionBody = (text, heading, nextHeading = null) => {
    const start = text.indexOf(heading);
    if (start < 0) return '';
    const bodyStart = start + heading.length;
    const end = nextHeading ? text.indexOf(nextHeading, bodyStart) : -1;
    return text.slice(bodyStart, end < 0 ? text.length : end);
  };
  const secondPersonWorkSummary = 'У двери лежит бревно — его и тешешь.';
  const coreIssues = part2 => {
    const profileSection = sectionBody(part2, 'Кто ты', 'Что ты знаешь');
    const knowledgeSection = sectionBody(part2, 'Что ты знаешь', 'Во что веришь');
    const beliefSection = sectionBody(part2, 'Во что веришь');
    const missing = [];
    for (const [label, value] of profileChecks) {
      if (!rowContainsSource(profileSection, value)) missing.push(`profile:${label}`);
    }
    for (const [label, value] of knowledgeChecks) {
      if (!rowContainsSource(knowledgeSection, value)) missing.push(`knowledge:${label}`);
    }
    if (!rowContainsSource(knowledgeSection, workSummary)
      && !rowContainsSource(knowledgeSection, secondPersonWorkSummary)) {
      missing.push('knowledge:занятие');
    }
    if (!craftChecks.every(value => rowContainsSource(knowledgeSection, value))
      && !hasGroupedCraftLine(knowledgeSection)) {
      missing.push('knowledge:ремесло');
    }
    for (const name of ownedItemStacks) {
      if (!rowContainsSource(knowledgeSection, name)) {
        missing.push(`knowledge:вещь:${name}`);
      }
    }
    for (const value of beliefCore) {
      if (!rowContainsSource(beliefSection, value)) missing.push('belief:source');
    }
    return missing;
  };
  const secretSummary = knowledgeChecks.find(([label]) => label === 'тайна')?.[1] ?? '';
  const profileControl = ['Кто ты', ...profileChecks.map(([, value]) => value)].join('\n');
  const knowledgeControl = ['Что ты знаешь', ...knowledgeChecks.map(([, value]) => value),
    workSummary, ...craftChecks,
    `Свои вещи: ${[...ownedItemStacks].join(', ')}`].join('\n');
  const beliefControl = ['Во что веришь', ...beliefCore].join('\n');
  const coreControl = [profileControl, knowledgeControl, beliefControl].join('\n');
  if (coreIssues(coreControl).length !== 0) {
    failures.push('overflow core oracle rejects its source-value control');
  }
  const secondPersonVariant = value => npcSourceTextVariants(value)[1];
  const secondPersonGroupedCraft = `${craftNames[0]}, ${craftNames[1]} и ${craftNames[2]}`
    + ' тебе знакомы: ими работают по дереву.';
  const secondPersonCoreControl = [
    ['Кто ты', ...profileChecks.map(([, value]) => secondPersonVariant(value))].join('\n'),
    ['Что ты знаешь', ...knowledgeChecks.map(([, value]) => secondPersonVariant(value)),
      secondPersonWorkSummary, secondPersonGroupedCraft,
      `Свои вещи: ${[...ownedItemStacks].join(', ')}`].join('\n'),
    ['Во что веришь', ...beliefCore.map(secondPersonVariant)].join('\n')
  ].join('\n');
  if (coreIssues(secondPersonCoreControl).length !== 0) {
    failures.push('overflow core oracle rejects finite second-person source-value control');
  }
  if (!secretSummary || !coreIssues(coreControl.replace(secretSummary, ''))
    .includes('knowledge:тайна')) {
    failures.push('overflow core oracle accepts a lost source secret');
  }
  const recentExchanges = exchanges.slice(-2);
  const recentTranscript = controlTranscript(recentExchanges);
  const limitedWindowPart3 = ['Сейчас', `Ты слышишь: «${overflow.utterance}»`,
    'Что было', recentTranscript].join('\n');
  const limitedWindowMessages = [{ role: 'system', content: 'Правила ответа.' },
    { role: 'user', content: secondPersonCoreControl }, { role: 'user', content: limitedWindowPart3 }];
  const limitedWindowSplit = splitResult(limitedWindowMessages);
  const recentPresence = exchangePresence(exchanges, recentTranscript);
  if (limitedWindowSplit.error
    || coreIssues(limitedWindowSplit.value?.part2 ?? '').length !== 0
    || unicodeLength(limitedWindowSplit.value?.part2 ?? '')
      + unicodeLength(limitedWindowSplit.value?.part3 ?? '') > 6400
    || contentLength(limitedWindowMessages) > 8000
    || systemContent(limitedWindowMessages)
      .reduce((sum, text) => sum + unicodeLength(text), 0) > 1600
    || recentPresence.issues.length !== 0
    || recentPresence.historyLineCount !== recentExchanges.length
    || recentPresence.rows.filter(row => row.complete).length !== recentExchanges.length
    || !recentPresence.rows.find(row => row.id === 'A7')?.complete
    || !limitedWindowSplit.value?.part3?.includes(overflow.utterance)) {
    failures.push('overflow core oracle rejects a valid limited-window control');
  }

  let run = null;
  try {
    run = await runReply(overflow, { captureOnly: true });
  } catch (error) {
    failures.push(`overflow capture: ${error.message}`);
  }
  const call = callsFor(run, RESPONDER)[0];
  if (!call) failures.push('no actual overflow responder call');
  let split = null;
  if (call) {
    const parsed = splitResult(call.messages);
    if (parsed.error) failures.push(`overflow prompt: ${parsed.error.message}`);
    else split = parsed.value;
    const total = contentLength(call.messages);
    const system = systemContent(call.messages)
      .reduce((sum, text) => sum + unicodeLength(text), 0);
    if (total > 8000) failures.push(`overflow input ${total} > 8000`);
    if (system > 1600) failures.push(`overflow system ${system} > 1600`);
    if (system === 0) failures.push('overflow system prompt missing');
    if (split && (typeof split.part2 !== 'string' || typeof split.part3 !== 'string')) {
      failures.push('overflow prompt sections are not strings');
    } else if (split && unicodeLength(split.part2) + unicodeLength(split.part3) > 6400) {
      failures.push('overflow part2+part3 exceeds 6400');
    }
  }

  if (split && typeof split.part2 === 'string') {
    failures.push(...coreIssues(split.part2));
  }
  if (typeof split?.part3 === 'string') {
    try { assertCurrentNpcUtterance(split.part3, overflow.utterance); }
    catch (error) { failures.push(`overflow ${error.message}`); }
    const actual = exchangePresence(exchanges, split.part3);
    failures.push(...actual.issues.map(issue => `overflow ${issue}`));
    if (actual.historyLineCount !== actual.rows.filter(row => row.complete).length) {
      failures.push('overflow contains a non-source or partial history line');
    }
    if (actual.rows.filter(row => row.complete).length === exchanges.length) {
      failures.push('overflow history did not trim a complete exchange prefix');
    }
    const axe = exchanges.find(exchange => exchange.id === 'A7');
    if (!axe || !actual.rows.find(row => row.id === 'A7')?.complete) {
      failures.push('overflow dropped the complete A7 exchange');
    }
  } else {
    failures.push('overflow part3 is unavailable for the suffix oracle');
  }
  const a3 = exchanges.find(exchange => exchange.id === 'A3');
  const b4 = exchanges.find(exchange => exchange.id === 'B4');
  const completeControl = exchangePresence(exchanges, controlTranscript(exchanges));
  if (completeControl.issues.length !== 0
    || completeControl.rows.some(row => !row.complete)) {
    failures.push('suffix oracle rejects the full ordered source history');
  }
  if (!a3) failures.push('overflow A3 source exchange missing');
  else {
    const withoutA3 = exchangePresence(exchanges,
      controlTranscript(exchanges, { omit: a3 }));
    if (!withoutA3.issues.includes('non-contiguous-suffix')) {
      failures.push('suffix oracle accepted an A3 deletion from the middle');
    }
  }
  if (!b4) failures.push('overflow B4 source exchange missing');
  else {
    const halfB4 = exchangePresence(exchanges,
      controlTranscript(exchanges, { half: b4 }));
    if (!halfB4.issues.includes('partial:B4')) {
      failures.push('suffix oracle accepted half of B4');
    }
  }

  assert.equal(failures.length, 0, failures.join('\n'));
});
