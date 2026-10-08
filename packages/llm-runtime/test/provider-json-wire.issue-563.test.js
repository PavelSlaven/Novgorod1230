import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { TurnRuntimeRoles } from '../src/provider-config.js';
import { buildProviderRequestPayload } from '../src/provider-request.js';
import { executeRoleLlmCall } from '../src/runtime.js';

const dummyProvider = Object.freeze({
  compatibility: 'openai_compatible',
  baseUrl: 'http://provider.invalid/v1',
  model: 'issue-563-dummy-model'
});

async function captureRequest(body) {
  const directory = process.env.ISSUE_563_CAPTURE_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  const { messages, ...parameters } = body;
  await writeFile(join(directory, `transport-${randomUUID()}.json`),
    `${JSON.stringify({ messages, parameters }, null, 2)}\n`, { flag: 'wx' });
}

function assertAddedInstructionIsRussian(firstSystemMessage, originalSystemMessage) {
  const content = firstSystemMessage.content;
  const originalContent = originalSystemMessage?.content;
  const instruction = typeof originalContent === 'string'
    ? content.slice(0, content.lastIndexOf(originalContent)).trim()
    : content;

  assert.ok(instruction.length > 0, 'добавленная инструкция должна быть непустой');
  assert.match(instruction, /json/iu, 'добавленная инструкция должна содержать JSON');
  assert.match(instruction, /\p{Script=Cyrillic}/u,
    'добавленная инструкция должна содержать кириллицу');
  assert.doesNotMatch(instruction.replace(/json/giu, ''), /[A-Za-z]+/u,
    'после удаления JSON в добавленной инструкции не должно быть английских слов');
}

async function assertWireInstruction(messages) {
  const originalMessages = structuredClone(messages);
  const originalFetch = globalThis.fetch;
  let capturedInit;
  globalThis.fetch = async (_url, init) => {
    capturedInit = init;
    return {
      ok: true,
      status: 200,
      async json() {
        return { choices: [{ message: { content: '{}' } }] };
      }
    };
  };

  let result;
  let body;
  try {
    result = await executeRoleLlmCall({
      scope: 'turn_runtime',
      roleId: TurnRuntimeRoles.GAMEPLAY_NARRATOR,
      messages,
      env: {},
      runtimeProviderOverride: dummyProvider
    });
    assert.ok(capturedInit, 'fake fetch должен получить provider request');
    body = JSON.parse(capturedInit.body);
    await captureRequest(body);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(result.status, 'ok', 'fake provider transport и JSON response должны завершиться успешно');
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.deepEqual(messages, originalMessages, 'исходные сообщения не должны мутировать');

  const firstSystemMessage = body.messages.find(({ role }) => role === 'system');
  assert.ok(firstSystemMessage, 'wire request должен содержать system-инструкцию');
  assertAddedInstructionIsRussian(firstSystemMessage,
    messages[0]?.role === 'system' ? messages[0] : null);
}

test('ожидаемо красный, issue #563: JSON wire instruction for existing first system message is Russian', async () => {
  const messages = Object.freeze([
    Object.freeze({ role: 'system', content: 'Отвечай по-русски.' }),
    Object.freeze({ role: 'user', content: 'Опиши выбранный исход.' })
  ]);
  await assertWireInstruction(messages);
});

test('ожидаемо красный, issue #563: JSON wire instruction without system message is Russian', async () => {
  const messages = Object.freeze([
    Object.freeze({ role: 'user', content: 'Верни краткое описание по-русски.' })
  ]);
  await assertWireInstruction(messages);
});

test('JSON wire control: existing JSON is not supplemented', () => {
  const messages = [{ role: 'user', content: 'Верни JSON с кратким ответом.' }];
  const payload = buildProviderRequestPayload({
    compatibility: 'openai_compatible',
    model: 'dummy-model',
    maxTokens: 32,
    responseFormat: { type: 'json_object' }
  }, messages);

  assert.strictEqual(payload.messages, messages);
});

test('plain-text wire control: builder leaves messages unchanged and omits response_format', () => {
  const messages = [{ role: 'user', content: 'Ответь обычным текстом.' }];
  const originalMessages = structuredClone(messages);
  const payload = buildProviderRequestPayload({
    compatibility: 'openai_compatible',
    model: 'dummy-model',
    maxTokens: 32,
    responseFormat: null
  }, messages);

  assert.strictEqual(payload.messages, messages);
  assert.deepEqual(messages, originalMessages);
  assert.equal('response_format' in payload, false);
});
