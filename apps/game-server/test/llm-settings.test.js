import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGameCompositionRoot,
  createGameHttpServer,
  createInMemorySessionStore,
  createLlmRoleRunnerAdapter,
  createLlmSettingsOwner,
  listen
} from '../src/index.js';

const custom = Object.freeze({
  mode: 'custom',
  base_url: 'http://127.0.0.1:11434/v1/', model: 'local-model', api_key: 'secret-key'
});

test('LLM settings owner snapshots are immutable, redacted, atomic, and resettable', () => {
  const owner = createLlmSettingsOwner();
  assert.deepEqual(owner.read(), { mode: 'default', base_url: null, model: null, api_key_present: false, compatibility: 'deepseek' });
  const applied = owner.apply(custom);
  assert.deepEqual(applied, {
    mode: 'custom', compatibility: 'openai_compatible',
    base_url: 'http://127.0.0.1:11434/v1', model: 'local-model', api_key_present: true
  });
  assert.throws(() => { applied.model = 'changed'; }, TypeError);
  assert.equal(JSON.stringify(owner.read()).includes('secret-key'), false);
  assert.throws(() => owner.apply({ ...custom, model: '' }), { code: 'LLM_SETTINGS_MODEL_REQUIRED' });
  assert.deepEqual(owner.read(), applied);
  assert.deepEqual(owner.reset(), { mode: 'default', base_url: null, model: null, api_key_present: false, compatibility: 'deepseek' });
});

test('role runner fixes custom provider settings at call start and tags probes separately', async () => {
  const owner = createLlmSettingsOwner();
  const calls = [];
  const telemetryCalls = [];
  const telemetry = { onCall: (record) => telemetryCalls.push(record) };
  let releaseFirst;
  const runner = createLlmRoleRunnerAdapter({ settings: owner, telemetry, execute: async (input) => {
    calls.push(input);
    if (calls.length === 1) await new Promise((resolve) => { releaseFirst = resolve; });
    input.telemetry?.onCall?.({ provider: 'openai_compatible' });
    return { status: 'ok', parsed_json: {}, provider: 'openai_compatible', model: input.runtimeProviderOverride?.model ?? 'default', durationMs: 1 };
  } });
  const first = runner.run({ scope: 'turn_runtime', role_id: 'intent_router' });
  owner.apply(custom);
  releaseFirst();
  await first;
  await runner.run({ scope: 'turn_runtime', role_id: 'intent_router' });
  assert.equal(calls[0].runtimeProviderOverride, undefined);
  assert.equal(calls[1].runtimeProviderOverride.model, 'local-model');
  const description = runner.describe({ scope: 'turn_runtime', role_id: 'intent_router' });
  assert.equal(description.provider, 'openai_compatible');
  assert.equal(description.model, 'local-model');
  assert.equal(runner.isCustomProvider(), true);
  const before = owner.read();
  await runner.probe(owner.providerSnapshot());
  assert.deepEqual(owner.read(), before);
  assert.equal(calls.at(-1).runtimeProviderOverride.model, 'local-model');
  assert.equal(telemetryCalls.at(-1).call_type, 'probe');
  const failed = createLlmRoleRunnerAdapter({ execute: async () => ({ status: 'transport_error', error: { code: 'timeout' }, durationMs: 2 }) });
  assert.deepEqual(await failed.probe(owner.providerSnapshot()), {
    ok: false, provider: 'openai_compatible', model: 'local-model', category: 'timeout', duration_ms: 2
  });
});

test('LLM settings HTTP routes redact secrets and reject invalid input without changing active config', async (t) => {
  const owner = createLlmSettingsOwner();
  let probeCalls = 0;
  const root = createGameCompositionRoot({
    newGameWorkflow: { run: async () => ({}) }, turnWorkflow: { run: async () => ({}) },
    sessionStore: createInMemorySessionStore(), llmSettings: owner,
    llmRoleRunner: { probe: async () => { probeCalls += 1; return { ok: true, provider: 'openai_compatible', model: 'local-model', category: 'ok', duration_ms: 1 }; } }
  });
  const server = createGameHttpServer({ root });
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  t.after(() => server.close());
  const url = `http://127.0.0.1:${address.port}/api/v1/llm-settings`;
  const get = await fetch(url);
  assert.deepEqual((await get.json()).data, { mode: 'default', base_url: null, model: null, api_key_present: false, compatibility: 'deepseek' });
  const apply = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(custom) });
  const applyText = await apply.text();
  assert.equal(apply.status, 200);
  assert.equal(applyText.includes('secret-key'), false);
  const invalid = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...custom, extra: true }) });
  assert.equal(invalid.status, 400);
  assert.equal(owner.read().model, 'local-model');
  const probe = await fetch(`${url}/test`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(custom) });
  assert.equal((await probe.json()).data.category, 'ok');
  assert.equal(probeCalls, 1);
  const reset = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'default' }) });
  assert.deepEqual((await reset.json()).data, { mode: 'default', base_url: null, model: null, api_key_present: false, compatibility: 'deepseek' });
});
