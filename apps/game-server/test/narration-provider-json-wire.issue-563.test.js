import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { executeRoleLlmCall } from '@rus/llm-runtime';
import { createLlmRoleRunnerAdapter } from '../src/adapters/llm-role-runner.js';
import { createLowerDvinaTraceNarrationService } from
  '../src/runtime/lower-dvina-trace-narration-llm.js';
import { reviewedNarration } from './narration-audit-fixture.js';

test('ожидаемо красный, issue #563: narration JSON instruction on provider wire is Russian', async () => {
  const { visible_context, prose } = JSON.parse(await readFile(new URL(
    './fixtures/narration-current-beat.json', import.meta.url), 'utf8'));
  const env = Object.freeze({});
  const settings = { providerSnapshot: () => ({ mode: 'custom',
    baseUrl: 'http://127.0.0.1:11434/v1', model: 'issue-563-dummy', apiKey: null }) };
  const transportResults = [];
  const serializedRequests = [];
  const runner = createLlmRoleRunnerAdapter({ env, settings,
    execute: async (input) => {
      const result = await executeRoleLlmCall(input);
      transportResults.push({ roleId: input.roleId, status: result.status });
      return result;
    } });
  const narrator = createLowerDvinaTraceNarrationService({ roleRunner: runner });
  const originalFetch = globalThis.fetch;
  let result;
  globalThis.fetch = async (_url, options) => {
    const serializedBody = options.body;
    const request = JSON.parse(serializedBody);
    serializedRequests.push({ request, serializedBody });
    const callIndex = serializedRequests.length;
    if (callIndex === 1 && process.env.ISSUE_563_CAPTURE_DIR) {
      const captureDir = process.env.ISSUE_563_CAPTURE_DIR;
      await mkdir(captureDir, { recursive: true });
      await writeFile(join(captureDir, `narration-writer-${randomUUID()}.json`), serializedBody,
        { flag: 'wx' });
    }
    const output = callIndex === 1
      ? { prose }
      : (() => {
        const wire = JSON.parse(request.messages[1].content);
        const sourceRefs = [
          ...wire.required_current_beat.changes,
          ...wire.required_current_beat.uncertainties
        ].map(({ ref }) => [ref, ['s1']]);
        return { ...reviewedNarration(wire.segments,
          Object.fromEntries(sourceRefs)), evidence: ['Grounded current beat.'] };
      })();
    return new Response(JSON.stringify({ choices: [{ message: {
      content: JSON.stringify(output)
    } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    result = await narrator.run({ version: 1, schema: 'narration_request',
      request_id: 'issue-563-provider-wire', surface: 'turn', visible_context,
      context: {} });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(result.status, 'approved');
  assert.equal(serializedRequests.length, 2);
  const writerRequest = serializedRequests[0].request;
  assert.equal(writerRequest.response_format?.type, 'json_object');
  assert.deepEqual(transportResults, [
    { roleId: 'gameplay_narrator', status: 'ok' },
    { roleId: 'gameplay_narrator_auditor', status: 'ok' }
  ]);

  const addedInstruction = writerRequest.messages[0].content.split('\n', 1)[0];
  assert.match(addedInstruction, /[\u0400-\u04FF]/u,
    'issue #563: the added first-line JSON instruction must be Russian');
  assert.match(addedInstruction, /JSON/iu,
    'issue #563: the added first-line instruction must retain the JSON requirement');
});
