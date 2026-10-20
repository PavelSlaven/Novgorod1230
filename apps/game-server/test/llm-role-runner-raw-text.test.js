import test from 'node:test';
import assert from 'node:assert/strict';
import { createLlmRoleRunnerAdapter } from '../src/adapters/llm-role-runner.js';

test('unparsed provider output reaches the caller byte for byte', async () => {
  const rawText = 'Не JSON: {"speech": "двoр" ';
  const runner = createLlmRoleRunnerAdapter({ execute: async () => ({ status: 'parse_error',
    raw_text: rawText, error: { code: 'json_parse_failed', message: 'Unexpected end' } }) });
  await assert.rejects(runner.run({ scope: 'turn_runtime', role_id: 'npc_conversation_responder' }),
    (error) => error.code === 'json_parse_failed' && error.raw_text === rawText);
});

test('transport failure carries no raw text', async () => {
  const runner = createLlmRoleRunnerAdapter({ execute: async () => ({ status: 'error',
    error: { code: 'timeout', message: 'timed out' } }) });
  await assert.rejects(runner.run({ scope: 'turn_runtime', role_id: 'npc_conversation_responder' }),
    (error) => error.code === 'timeout' && !Object.hasOwn(error, 'raw_text'));
});
