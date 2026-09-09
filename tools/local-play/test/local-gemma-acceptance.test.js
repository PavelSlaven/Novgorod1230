import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { acceptanceProviderFromEnv } from '../local-gemma-acceptance.mjs';

test('acceptance provider reads an optional key from a file, never the CLI', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'novgorod-provider-test-'));
  const keyFile = join(directory, 'key.txt');
  try {
    await writeFile(keyFile, 'test-secret\n');
    const provider = await acceptanceProviderFromEnv({
      RUS_ACCEPTANCE_LLM_BASE_URL: 'http://192.0.2.1:8000/v1',
      RUS_ACCEPTANCE_LLM_MODEL: 'unseen-gemma',
      RUS_ACCEPTANCE_LLM_API_KEY_FILE: keyFile,
      RUS_ACCEPTANCE_LLM_BACKEND: 'unseen-engine',
      RUS_ACCEPTANCE_LLM_BACKEND_VERSION: 'v7',
      RUS_ACCEPTANCE_LLM_RUNTIME_METADATA: 'one slot, 32k context',
      RUS_ACCEPTANCE_LLM_HARDWARE_METADATA: 'unseen accelerator'
    });
    assert.deepEqual(provider, { mode: 'custom',
      compatibility: 'openai_compatible',
      baseUrl: 'http://192.0.2.1:8000/v1', model: 'unseen-gemma',
      apiKey: 'test-secret', evidence: { backend: 'unseen-engine',
        backendVersion: 'v7', runtime: 'one slot, 32k context',
        hardware: 'unseen accelerator' } });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('acceptance provider keeps the managed default unless external selection is complete', async () => {
  assert.equal(await acceptanceProviderFromEnv({}), null);
  await assert.rejects(acceptanceProviderFromEnv({
    RUS_ACCEPTANCE_LLM_BASE_URL: 'http://192.0.2.1:8000/v1'
  }), /required together/u);
  await assert.rejects(acceptanceProviderFromEnv({
    RUS_ACCEPTANCE_LLM_BASE_URL: 'http://192.0.2.1:8000/v1',
    RUS_ACCEPTANCE_LLM_MODEL: 'unseen-gemma'
  }), /backend version, runtime and hardware metadata/u);
});
