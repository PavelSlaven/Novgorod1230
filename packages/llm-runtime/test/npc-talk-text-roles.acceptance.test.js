import assert from 'node:assert/strict';
import test from 'node:test';

import { createLlmRoleRunnerAdapter } from '../../../apps/game-server/src/adapters/llm-role-runner.js';
import { createLowerDvinaTraceNpcSemanticModel } from '../../../apps/game-server/src/runtime/lower-dvina-trace-conversation-llm.js';
import { auditFreshNpcSpeech } from '../../../apps/game-server/src/runtime/lower-dvina-trace-npc-speech-grounding-audit.js';
import { resolveLlmExecutionConfig } from '../src/provider-config.js';
import { loadScenes, buildCanonicalRequest, runReply, runAudit } from '../../../tools/cataclysm-prototype/npc-talk-test-helpers.js';

const responder = 'npc_conversation_responder';
const repair = 'npc_conversation_responder_format_repair';
const auditor = 'npc_conversation_grounding_auditor';
const sixLineSpeech = [
  'Выбор: говорить',
  'Речь: Здравствуй.',
  'Поступок: приветствие',
  'Опора: —',
  'Неправда: —',
  'Утаил: —'
].join('\n');

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

function caseById(envelope, id) {
  const value = envelope.cases.find((entry) => entry.id === id);
  assert.ok(value, 'fixture case ' + id + ' must exist');
  return value;
}

test('NPC responder passes speech, silence, and movement as plain text', async () => {
  const outputs = [
    sixLineSpeech,
    'Выбор: промолчать\nВместо ответа: Смотрит на собеседника.',
    'Выбор: отойти'
  ];
  const originalFetch = globalThis.fetch;
  const originalParse = JSON.parse;
  const payloads = [];
  const rawParseAttempts = [];
  let responseIndex = 0;
  globalThis.JSON.parse = function (value, ...args) {
    if (outputs.includes(value)) rawParseAttempts.push(value);
    return Reflect.apply(originalParse, this, [value, ...args]);
  };
  globalThis.fetch = async (_url, init) => {
    payloads.push(originalParse(init.body));
    const content = outputs[responseIndex++];
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
  };

  let runs;
  let config;
  try {
    config = resolveLlmExecutionConfig({ scope: 'turn_runtime', roleId: responder,
      env: { DEEPSEEK_API_KEY: 'test-key' } }).config;
    const roleRunner = createLlmRoleRunnerAdapter({
      env: { DEEPSEEK_API_KEY: 'test-key' }
    });
    runs = [];
    for (const [index, content] of outputs.entries()) {
      try {
        runs.push({ output: await roleRunner.run({ scope: 'turn_runtime', role_id: responder,
          messages: [{ role: 'system', content: 'Верни ответ обычным текстом.' },
            { role: 'user', content: 'Контекст разговора ' + index }],
          overrides: { maxTokens: 1_000 } }) });
      } catch (error) {
        runs.push({ error });
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.JSON.parse = originalParse;
  }

  assert.equal(config.outputContractMode, 'plain_text');
  assert.equal(config.parseJson, false);
  assert.equal(config.responseFormat, undefined);
  assert.deepEqual(runs.map(({ output }) => output?.output), outputs);
  assert.deepEqual(runs.map(({ error }) => error ?? null), [null, null, null]);
  assert.equal(payloads.length, 3);
  assert.ok(payloads.every((payload) => !Object.hasOwn(payload, 'response_format')));
  assert.deepEqual(rawParseAttempts, []);
});

test('format and semantic repair text reaches the real responder repair consumer', async () => {
  const scene = caseById(await loadScenes(), 'A1');
  const responses = [
    [
      'Выбор: говорить', 'Речь: Здравствуй.', 'Поступок: приветствие',
      'Опора: —', 'Неправда: —'
    ].join('\n'),
    sixLineSpeech,
    'годно',
    [
      'Выбор: передать топор', 'Речь: Здравствуй.', 'Поступок: приветствие',
      'Опора: —', 'Неправда: —', 'Утаил: —'
    ].join('\n'),
    'Выбор: промолчать\nВместо ответа: Смотрит на собеседника.'
  ];
  const observed = await observeRawJsonParsing(responses, async () => {
    const format = await runReply(scene, { fetchResponses: responses.slice(0, 3) });
    const semantic = await runReply(scene, { fetchResponses: responses.slice(3) });
    return [format, semantic];
  });
  const [format, semantic] = observed.value;
  const repairCalls = [format, semantic].map((outcome) =>
    outcome.calls.filter((call) => call.role_id === repair));
  assert.deepEqual([format.error, semantic.error].map((error) => error ?? null), [null, null]);
  assert.equal(format.plan?.contribution_kind, 'speech');
  assert.equal(semantic.plan?.contribution_kind, 'silence');
  assert.deepEqual(repairCalls.map((calls) => calls.map((call) => call.repair_kind)),
    [['format'], ['semantic']]);
  assert.deepEqual(observed.attempts, []);
  assert.ok([format, semantic].every((outcome) => outcome.httpCalls.length > 0));
  assert.ok([format, semantic].flatMap((outcome) => outcome.httpCalls)
    .every((call) => !call.payload?.response_format));
});

test('the actual audit role consumes good and bad plain-text verdicts', async () => {
  const scene = caseById(await loadScenes(), 'A1');
  const request = await buildCanonicalRequest(scene);
  const plan = { contribution_kind: 'speech',
    speech: { utterance_text: 'Здравствуй.', claims: [] } };
  const verdicts = ['годно', 'негодно: «Здравствуй.» — ответ не опирается на источник.'];
  const observed = await observeRawJsonParsing(verdicts, async () => {
    const good = await runAudit(request, plan, { captureOnly: false,
      fetchResponses: [verdicts[0]] });
    const bad = await runAudit(request, plan, { captureOnly: false,
      fetchResponses: [verdicts[1]] });
    return [good, bad];
  });
  const [good, bad] = observed.value;
  assert.equal(good.error, null);
  assert.equal(good.result, true);
  assert.equal(bad.error, null);
  assert.equal(bad.result?.pass, false);
  assert.deepEqual([good, bad].map((outcome) => outcome.calls[0]?.role_id),
    [auditor, auditor]);
  const auditHttp = [good, bad].flatMap((outcome) => outcome.httpCalls);
  assert.ok(auditHttp.length > 0, 'the audit must reach the HTTP boundary');
  assert.ok(auditHttp.every((call) => !call.payload?.response_format));
  assert.deepEqual(observed.attempts, []);
});

test('responder, repair, and auditor retain their per-call output limits', async () => {
  const scene = caseById(await loadScenes(), 'A1');
  const request = await buildCanonicalRequest(scene);
  const captured = [];
  const model = createLowerDvinaTraceNpcSemanticModel({ roleRunner: {
    async run(call) {
      captured.push(call);
      throw new Error('captured role boundary');
    }
  } });
  await assert.rejects(model(request), /captured role boundary/);
  await assert.rejects(model(request, { repair: { kind: 'semantic',
    original_output_text: 'Выбор: говорить', validation_errors: [] } }),
  /captured role boundary/);
  assert.deepEqual(captured.map(({ role_id, overrides }) =>
    [role_id, overrides.maxTokens]), [[responder, 1_000], [repair, 1_000]]);

  let capturedAudit;
  const stop = new Error('capture complete');
  await assert.rejects(auditFreshNpcSpeech({ roleRunner: { async run(call) {
    capturedAudit = call;
    throw stop;
  } }, request, plan: { contribution_kind: 'speech',
    speech: { utterance_text: 'Здравствуй.', claims: [] } } }),
  (error) => error === stop);
  assert.equal(capturedAudit.overrides.maxTokens, 256);
});
