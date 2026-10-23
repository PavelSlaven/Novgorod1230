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

async function captureCall(run) {
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
  return calls[0];
}

function auditorCall(plan = targets.auditor.user.plan,
  request = targets.auditor.user.request) {
  return captureCall(roleRunner => auditFreshNpcSpeech({
    roleRunner, plan, request
  }));
}

async function auditor() {
  return (await auditorCall()).messages[0].content;
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

function responseCalls(request = targets.responder.user) {
  return [
    ['responder', roleRunner => createLowerDvinaTraceNpcSemanticModel({
      roleRunner
    })(request)],
    ['semantic repair, closed intent', roleRunner =>
      createLowerDvinaTraceNpcSemanticModel({ roleRunner })(request, {
        repair: {
          kind: 'semantic',
          original_output: targets.semantic_repair.user.original_output,
          validation_errors: semanticRepairUser(false, request).validation_errors
        }
      })],
    ['semantic repair, open intent', roleRunner =>
      createLowerDvinaTraceNpcSemanticModel({ roleRunner })(request, {
        repair: {
          kind: 'semantic',
          original_output: targets.semantic_repair.user.original_output,
          validation_errors: semanticRepairUser(true, request).validation_errors
        }
      })]
  ];
}

function ownAuditorRule(full) {
  assert.ok(full.includes(FACTUAL_ASSERTION_RULE));
  assert.ok(full.includes(CLAIM_KINDS_RULE));
  return full.replace(FACTUAL_ASSERTION_RULE, '')
    .replace(CLAIM_KINDS_RULE, '');
}

function requirePatterns(text, patterns, label) {
  for (const pattern of patterns) assert.match(text, pattern, label);
}

async function sampleCall(sample) {
  const plan = {
    contribution_kind: 'speech',
    speech: {
      utterance_text: sample.words,
      claims: [{
        content_summary: sample.summary ?? sample.words,
        speaker_posture: sample.posture ?? 'believed_true',
        source_knowledge_refs: sample.refs ?? [{
          entity_kind: 'known_fact', entity_id: 'fact:sample'
        }]
      }]
    }
  };
  const request = { request_id: `delta:${sample.name}`,
    knowledge: sample.knowledge ?? {}, memory: sample.memory ?? {} };
  const call = await auditorCall(plan, request);
  const payload = JSON.parse(call.messages[1].content);
  assert.equal(payload.plan.speech.utterance_text, sample.words);
  assert.deepEqual(payload.plan.speech.claims[0].source_knowledge_refs,
    sample.refs ?? [{ entity_kind: 'known_fact', entity_id: 'fact:sample' }]);
  assert.deepEqual(payload.request.knowledge, sample.knowledge ?? {});
  assert.deepEqual(payload.request.memory, sample.memory ?? {});
  return call.messages[0].content;
}

test('D1: cited craft or habit supports an unanchored habitual past', async () => {
  const own = ownAuditorRule(await auditor());
  requirePatterns(own, [
    /(?:habit|craft|usual (?:practice|occupation)).{0,260}(?:earlier|before|past|previously).{0,160}(?:habit|practice|occupation|activity)/iu,
    /(?:earlier|before|past|previously).{0,220}(?:without|no|absent|unless).{0,130}(?:specific|particular|dated|stated) (?:time|event|occasion)/iu,
    /(?:habit|craft|usual (?:practice|occupation)).{0,250}(?:not|never|cannot).{0,140}(?:duration|start|begin|began|how long|since)/iu,
    /(?:present|current|now|still).{0,180}(?:usual practice|habit|craft|occupation)/iu,
    /(?:habit|craft|usual practice).{0,350}(?:frequency|how often|number of times|count)/iu,
    /(?:habit|craft|usual practice).{0,450}(?:place|location|where|person|whom|for whom|served|worked for|object|item)/iu,
    /(?:vague|imprecise|unspecified).{0,100}(?:duration|time|span|period)/iu,
    /(?:separate|distinct|particular).{0,100}(?:past )?(?:event|occurrence).{0,130}(?:without|no|even without).{0,100}(?:date|time)/iu,
    /(?:denial|negation|cessation|stopp|quit|no longer).{0,160}(?:habit|craft|practice|occupation)/iu,
    /(?:requested_at).{0,180}(?:action|activity|underway|happening)|(?:action|activity|underway|happening).{0,180}requested_at/iu
  ], 'habitual past needs an explicit allowance');
  const mandatory = own.slice(own.indexOf('Mandatory failure: reject a first-person'),
    own.indexOf('A cited known fact or event'));
  requirePatterns(mandatory, [
    /(?:undated|no stated time).{0,220}(?:usual practice|habit|craft).{0,220}(?:not|never).{0,180}(?:separate|distinct|particular|timed) (?:past |earlier )?(?:event|occurrence|activity)/iu
  ], 'mandatory past rule must exempt an undated continuing practice');
  for (const sample of [
    { name: 'past craft', words: 'И прежде я ставил лодки.',
      knowledge: { known_facts: [{ ref: 'fact:sample', text: 'Я лодочник.' }] } },
    { name: 'reordered habit', words: 'Лодки я и раньше чинил.',
      knowledge: { known_facts: [{ ref: 'fact:sample', text: 'Обычно чиню лодки.' }] } },
    { name: 'present usual practice', words: 'И теперь чиню лодки.',
      knowledge: { known_facts: [{ ref: 'fact:sample', text: 'Обычно чиню лодки.' }] } },
    { name: 'past frequency beyond fact', words: 'Раньше я чинил лодки каждый вечер.',
      knowledge: { known_facts: [{ ref: 'fact:sample', text: 'Обычно чиню лодки.' }] } },
    { name: 'past place beyond fact', words: 'Прежде я чинил лодки у ворот.',
      knowledge: { known_facts: [{ ref: 'fact:sample', text: 'Обычно чиню лодки.' }] } },
    { name: 'undated separate occurrence', words: 'Я уже чинил эту дверь.',
      knowledge: { known_facts: [{ ref: 'fact:sample', text: 'Обычно плотничаю.' }] } },
    { name: 'ceased practice', words: 'Раньше плотничал, а теперь бросил.',
      knowledge: { known_facts: [{ ref: 'fact:sample', text: 'Я плотник.' }] } }
  ]) {
    const system = await sampleCall(sample);
    assert.match(system, /(?:habit|craft|usual practice)/iu, sample.name);
  }
});

test('D1 guards: a habit is not a dated event, duration, start, or current act', async () => {
  const own = ownAuditorRule(await auditor());
  requirePatterns(own, [
    /habit.{0,180}(?:not|never).{0,100}(?:now|particular past time|specific (?:time|event))/iu,
    /past first-person activity.{0,300}(?:exact|same past assertion)/iu,
    /npc\.current_activity.{0,180}requested_at/iu
  ], 'existing past boundaries');
  for (const sample of [
    { name: 'dated event', words: 'Вчера я чинил лодку.' },
    { name: 'duration', words: 'Я чиню лодки уже двадцать лет.' },
    { name: 'start', words: 'Я стал лодочником ещё ребёнком.' },
    { name: 'current act', words: 'Сейчас я чиню лодку.' }
  ]) await sampleCall(sample);
});

test('D2: a habit leaves a particular dated event genuinely uncertain', async () => {
  const shared = CLAIM_KINDS_RULE;
  const own = ownAuditorRule(await auditor());
  for (const [label, text] of [['shared rule', shared], ['auditor', own]]) {
    requirePatterns(text, [
      /(?:habit|craft|usual (?:practice|occupation)).{0,250}(?:does not|cannot|never|not).{0,120}(?:answer|establish|prove|settle).{0,180}(?:specific|particular|dated|yesterday|event)/iu,
      /(?:not (?:remember|know)|uncertaint).{0,250}(?:no ref|without (?:a )?ref|needs no ref|genuine)/iu,
      /(?:frequency|frequent|often|every (?:day|evening|night)).{0,220}(?:particular|separate|dated|specific).{0,100}(?:event|occurrence)/iu,
      /(?:neither|does not|cannot).{0,110}(?:establish|prove|confirm).{0,100}(?:nor |or )?(?:exclude|rule out)|(?:establish|prove|confirm).{0,90}(?:nor |or )?(?:exclude|rule out)/iu,
      /(?:habit|craft|usual practice).{0,250}(?:answer|establish|support).{0,140}(?:practice|occupation|habit).{0,130}(?:now|ever|before)/iu,
      /(?:premise|presupposition|factual assertion).{0,180}(?:claim).{0,150}(?:ref|evidence|source)/iu,
      /(?:memory|record|event).{0,180}(?:only|just).{0,120}(?:time|detail)/iu
    ], label);
  }
  for (const [name, build] of responseCalls()) {
    const text = (await captureCall(build)).messages[0].content;
    requirePatterns(text, [
      /(?:habit|craft|usual (?:practice|occupation)).{0,250}(?:does not|cannot|never|not).{0,120}(?:answer|establish|prove|settle).{0,180}(?:specific|particular|dated|event)/iu,
      /(?:not (?:remember|know)|uncertaint).{0,250}(?:no ref|without (?:a )?ref|needs no ref|genuine)/iu,
      /(?:premise|presupposition|factual assertion).{0,180}claim/iu,
      /(?:habit|craft|usual practice).{0,250}(?:now|ever|before)/iu
    ], name);
  }
  for (const sample of [
    { name: 'uncertain fire', words: 'Разводил ли я огонь вчера, не помню.',
      posture: 'uncertain', refs: [],
      knowledge: { known_facts: [{ text: 'Обычно развожу огонь кресалом.' }] } },
    { name: 'uncertain work', words: 'Был ли я на работе в тот день, не знаю.',
      posture: 'uncertain', refs: [],
      knowledge: { known_facts: [{ text: 'Я плотник.' }] } },
    { name: 'stated frequency is not yesterday',
      words: 'Не помню, разводил ли я огонь вчера.', posture: 'uncertain', refs: [],
      knowledge: { known_facts: [{ text: 'Развожу огонь каждый вечер.' }] } },
    { name: 'premise within uncertainty', words: 'Куда вчера ходил, не помню.',
      posture: 'uncertain', refs: [], knowledge: {} },
    { name: 'habit answers own practice', words: 'Не знаю, развожу ли я вообще огонь.',
      posture: 'uncertain', refs: [],
      knowledge: { known_facts: [{ text: 'Обычно развожу огонь.' }] } },
    { name: 'other day does not answer yesterday',
      words: 'Не помню, разводил ли я огонь вчера.', posture: 'uncertain', refs: [],
      memory: { recent_events: [{ text: 'Сегодня утром разводил огонь.' }] } },
    { name: 'record omits asked detail', words: 'Не помню, чем разводил огонь утром.',
      posture: 'uncertain', refs: [],
      memory: { recent_events: [{ text: 'Сегодня утром разводил огонь.' }] } }
  ]) await sampleCall(sample);
});

test('D2 guards: exact event knowledge defeats an untagged denial', async () => {
  requirePatterns(CLAIM_KINDS_RULE, [
    /no known fact, belief, memory event, observation, or perceived message.{0,120}answers/iu,
    /(?:false denial.{0,120}knowingly_false|knowingly_false.{0,180}false denial)/iu,
    /uncertainty itself needs no ref/iu
  ], 'shared uncertainty boundary');
  const own = ownAuditorRule(await auditor());
  requirePatterns(own, [
    /does not remember or does not know.{0,220}only if no known fact, belief, memory event, observation, or perceived message.{0,80}answers/iu,
    /false denial of known information.{0,90}knowingly_false.{0,100}exact known fact/iu
  ], 'auditor uncertainty boundary');
  for (const [name, build] of responseCalls()) {
    const text = (await captureCall(build)).messages[0].content;
    assert.match(text,
      /no known fact, belief, memory event, observation, or perceived message.{0,100}answers/iu,
      name);
  }
});

test('D3: a matching speech record supports what this speaker said to this addressee', async () => {
  const own = ownAuditorRule(await auditor());
  requirePatterns(own, [
    /(?:record of speech|memory (?:event|record)|perceived (?:speech|message)).{0,250}(?:support|prove|ground).{0,150}(?:said|spoken|communicated)/iu,
    /(?:same|matching|exact).{0,80}speaker.{0,140}(?:same|matching|exact).{0,80}addressee/iu,
    /(?:words|utterance|recorded speech).{0,180}(?:mean|entail|convey|support).{0,100}(?:claim|assertion|content|report)/iu,
    /(?:(?:mismatch|different|wrong).{0,140}(?:speaker|addressee|words).{0,180}(?:reject|fail|not|cannot)|(?:reject|fail|not|cannot).{0,180}(?:mismatch|different|wrong).{0,140}(?:speaker|addressee|words))/iu
  ], 'recorded speech as speech evidence');
  const speechPatterns = [
    /(?:cited|quoted).{0,180}(?:speech|message|record).{0,180}(?:together|in order|sequence)/iu,
    /pronoun.{0,180}(?:only|solely).{0,100}(?:cited|quoted)/iu,
    /speaker.{0,130}addressee/iu,
    /(?:report|conversation).{0,200}either participant.{0,100}(?:other|each other)/iu,
    /(?:time|when|occurred_at).{0,170}(?:number of times|number of occasions|count|how many|repetition)/iu,
    /(?:said|reported speech|speech report).{0,220}(?:not|does not|only).{0,160}(?:truth|true|fact)/iu,
    /(?:separate|independent).{0,130}(?:assertion|claim).{0,180}(?:truth|true|fact|support|evidence|ref)/iu
  ];
  requirePatterns(own, speechPatterns, 'auditor speech boundary');
  requirePatterns(CLAIM_KINDS_RULE, [
    /(?:cited|quoted).{0,160}(?:speech|message|record).{0,200}(?:support|prove|ground).{0,120}(?:said|spoken|speech)/iu,
    ...speechPatterns
  ], 'shared speech boundary');
  for (const [name, build] of responseCalls()) {
    const text = (await captureCall(build)).messages[0].content;
    requirePatterns(text, speechPatterns, name);
  }
  for (const sample of [
    { name: 'same speaker and listener',
      words: 'Я тебе уже говорил, что кресало моё.',
      memory: { recent_events: [{ speaker: 'npc', addressee: 'player',
        words: 'Не дам. Это моё.' }] } },
    { name: 'listener first',
      words: 'Ты слышал от меня: кресало принадлежит мне.',
      memory: { recent_events: [{ speaker: 'npc', addressee: 'player',
        words: 'Это моё кресало.' }] } },
    { name: 'other speaker',
      words: 'Я тебе говорил, что кресало моё.',
      memory: { recent_events: [{ speaker: 'other', addressee: 'player',
        words: 'Это моё кресало.' }] } },
    { name: 'conversation with listener as speaker',
      words: 'Мы говорили, что кресало моё.',
      memory: { recent_events: [{ speaker: 'player', addressee: 'npc',
        words: 'Ты сказал, что кресало твоё.' }] } },
    { name: 'other listener',
      words: 'Я тебе говорил, что кресало моё.',
      memory: { recent_events: [{ speaker: 'npc', addressee: 'other',
        words: 'Это моё кресало.' }] } },
    { name: 'other words',
      words: 'Я тебе говорил, что кресало украли.',
      memory: { recent_events: [{ speaker: 'npc', addressee: 'player',
        words: 'Кресало моё.' }] } },
    { name: 'two cited records in order',
      words: 'Мы говорили, что кресало моё.',
      memory: { recent_events: [
        { ref: 'speech:1', speaker: 'npc', addressee: 'player',
          words: 'Вот кресало.', occurred_at: 'yesterday' },
        { ref: 'speech:2', speaker: 'npc', addressee: 'player',
          words: 'Моё оно.', occurred_at: 'yesterday' }
      ] }, refs: [
        { entity_kind: 'memory_event', entity_id: 'speech:1' },
        { entity_kind: 'memory_event', entity_id: 'speech:2' }
      ] },
    { name: 'uncited antecedent', words: 'Я говорил, что кресало моё.',
      memory: { recent_events: [
        { ref: 'speech:1', speaker: 'npc', addressee: 'player', words: 'Вот кресало.' },
        { ref: 'speech:2', speaker: 'npc', addressee: 'player', words: 'Моё оно.' }
      ] }, refs: [{ entity_kind: 'memory_event', entity_id: 'speech:2' }] },
    { name: 'wrong time and count', words: 'Я вчера не раз говорил тебе, что кресало моё.',
      memory: { recent_events: [{ ref: 'speech:1', speaker: 'npc',
        addressee: 'player', words: 'Кресало моё.', occurred_at: 'today' }] },
      refs: [{ entity_kind: 'memory_event', entity_id: 'speech:1' }] },
    { name: 'reported words versus separate truth',
      words: 'Кресало моё. Мы же говорили об этом.',
      memory: { recent_events: [{ ref: 'speech:1', speaker: 'npc',
        addressee: 'player', words: 'Кресало моё.' }] },
      refs: [{ entity_kind: 'memory_event', entity_id: 'speech:1' }] }
  ]) await sampleCall(sample);
});

test('D3 guards: a speech record does not establish the truth of its words', async () => {
  const own = ownAuditorRule(await auditor());
  requirePatterns(own, [
    /record of speech proves only what was said/iu,
    /received statement proves only that its speaker said it, not that its content is true/iu,
    /believed_true assertion whose cited ref does not state it/iu
  ], 'speech versus event truth');
  assert.match(CLAIM_KINDS_RULE,
    /cited message proves only what was said, not its truth/iu);
});

test('D4: exact known fact or memory may be disclosed, including a secret', async () => {
  const own = ownAuditorRule(await auditor());
  requirePatterns(own, [
    /(?:disclos|reveal|tell).{0,250}(?:known fact|memory event).{0,220}(?:secret|private|concealed)/iu,
    /(?:secret|private|concealed).{0,250}(?:exact|matching).{0,130}(?:ref|evidence|citation).{0,160}(?:pass|allow|support|valid)/iu,
    /(?:(?:goal|character|benefit|advantage).{0,250}(?:not|never|cannot|do not).{0,120}(?:reject|audit|decide|override)|(?:not|never|cannot|do not).{0,120}(?:reject|audit|decide|override).{0,250}(?:goal|character|benefit|advantage))/iu,
    /(?:npc\.goals|NPC.{0,30}goals|goals.{0,100}request).{0,180}(?:motive|character|interest|benefit)/iu,
    /(?:interpretation\.intent|interpretation.{0,80}intent|intent).{0,220}(?:utterance|speech|words|visible)/iu,
    /(?:broader|more than|beyond|extra).{0,150}(?:cited|source|record|ref)/iu
  ], 'disclosure is the NPC decision');
  for (const sample of [
    { name: 'secret fact', words: 'Я нашёл кресало на торгу.',
      knowledge: { known_facts: [{ ref: 'fact:sample', secret: true,
        text: 'Кресало я нашёл на торгу.' }] } },
    { name: 'reordered secret', words: 'Кресало я на торгу подобрал.',
      knowledge: { known_facts: [{ ref: 'fact:sample', secret: true,
        text: 'Нашёл кресало на торгу.' }] } },
    { name: 'memory', words: 'Я помню, как нашёл его у ворот.',
      memory: { recent_events: [{ ref: 'fact:sample',
        text: 'Я нашёл кресало у ворот.' }] } },
    { name: 'speech broader than cited fact',
      words: 'Я нашёл кресало на торгу и спрятал его у ворот.',
      knowledge: { known_facts: [{ ref: 'fact:sample', secret: true,
        text: 'Я нашёл кресало на торгу.' }] } }
  ]) await sampleCall(sample);
});

test('D4 guards: absent or mismatched evidence and extra facts still fail', async () => {
  const own = ownAuditorRule(await auditor());
  requirePatterns(own, [
    /every factual assertion needs matching exact request evidence/iu,
    /every claim needs matching source_knowledge_refs/iu,
    /reject a believed_true assertion whose cited ref does not state it/iu,
    /do not infer hidden state, invent evidence/iu,
    /(?:reason|interpretation).{0,180}(?:factual|fact).{0,150}(?:audit|check|ground|evidence|support)/iu
  ], 'disclosure still needs grounding');
  const result = await auditFreshNpcSpeech({
    roleRunner: { async run() { throw new Error('precheck did not stop call'); } },
    request: { request_id: 'delta:missing-ref' },
    plan: { contribution_kind: 'speech', speech: { claims: [{
      content_summary: 'Секретное кресало моё',
      speaker_posture: 'believed_true', source_knowledge_refs: []
    }] } }
  });
  assert.equal(result.pass, false);
  assert.deepEqual(result.errors[0].concern_kinds,
    ['claim_without_source_knowledge']);
});

test('D5: concern path starts at the plan root and names a real field', async () => {
  const own = ownAuditorRule(await auditor());
  requirePatterns(own, [
    /path.{0,150}(?:relative to|from|root of|root is).{0,80}(?:the )?plan/iu,
    /\$\.speech\.claims\[0\](?!\.[A-Za-z_])/u,
    /\$\.speech.{0,160}\$\.interpretation.{0,160}\$\.reason.{0,160}\$\.supporting_operations/u,
    /(?:never|do not|cannot|must not).{0,120}\$\.plan/iu,
    /(?:never|do not|cannot|must not).{0,120}\$\.request/iu
  ], 'auditor path convention');
  assert.doesNotMatch(own, /\$\.(?:plan|request)\.claims(?:\[|\.)/u);
});

test('D5 guards: concerns retain path and exact quote; code paths use speech root', async () => {
  const full = await auditor();
  requirePatterns(full, [
    /"path":"<JSON path of the assertion in plan>"/u,
    /"quote":"<exact unsupported words from plan>"/u
  ], 'auditor result shape');
  const result = await auditFreshNpcSpeech({
    roleRunner: { async run() { throw new Error('precheck did not stop call'); } },
    request: { request_id: 'delta:path' },
    plan: { contribution_kind: 'speech', speech: { claims: [{
      content_summary: 'Без опоры', speaker_posture: 'believed_true',
      source_knowledge_refs: []
    }] } }
  });
  assert.equal(result.errors[0].path,
    '$.speech.claims[0].source_knowledge_refs');
  assert.equal(result.errors[0].quote, 'Без опоры');
  const modelResult = await auditFreshNpcSpeech({
    roleRunner: { async run() { return { output: {
      pass: false, concerns: [{ kind: 'bad_path',
        path: '$.speech.utterance_text', quote: 'Проверочный текст' }]
    } }; } },
    request: { request_id: 'delta:path-passthrough' },
    plan: { contribution_kind: 'speech', speech: { utterance_text: 'Проверочный текст', claims: [] } }
  });
  assert.equal(modelResult.errors[0].path, '$.speech.utterance_text');
});
