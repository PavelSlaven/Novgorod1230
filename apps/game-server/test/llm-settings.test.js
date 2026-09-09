import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createGameCompositionRoot,
  createGameHttpServer,
  createInMemorySessionStore,
  createLlmRoleRunnerAdapter,
  createLlmSettingsFileStore,
  createLlmSettingsOwner,
  LOCAL_LLM_PRESET,
  listen
} from '../src/index.js';

const custom = Object.freeze({
  mode: 'custom',
  base_url: 'http://127.0.0.1:11434/v1/', model: 'local-model', api_key: 'secret-key'
});

test('LLM settings owner snapshots are immutable, redacted, atomic, and resettable', async () => {
  const owner = createLlmSettingsOwner({ qualifyCustom: async () => identity() });
  assert.deepEqual(owner.read(), defaultSettings());
  const applied = await owner.apply(custom);
  assert.deepEqual(applied, {
    mode: 'custom', compatibility: 'openai_compatible',
    base_url: 'http://127.0.0.1:11434/v1', model: 'local-model',
    api_key_present: true, local_preset: LOCAL_LLM_PRESET
  });
  assert.throws(() => { applied.model = 'changed'; }, TypeError);
  assert.equal(JSON.stringify(owner.read()).includes('secret-key'), false);
  await assert.rejects(owner.apply({ ...custom, model: '' }), { code: 'LLM_SETTINGS_MODEL_REQUIRED' });
  assert.deepEqual(owner.read(), applied);
  await owner.apply({ ...custom, model: 'replacement-model', api_key: '' });
  assert.equal(owner.providerSnapshot().apiKey, 'secret-key');
  await owner.apply({ ...custom, base_url: 'http://127.0.0.1:11435/v1',
    model: 'other-endpoint-model', api_key: '' });
  assert.equal(owner.providerSnapshot().apiKey, null);
  await owner.apply({ ...custom, api_key: 'replacement-key' });
  assert.equal(owner.providerSnapshot().apiKey, 'replacement-key');
  assert.deepEqual(await owner.reset(), defaultSettings());
});

test('Apply serializes qualification and rejects stale results', async () => {
  const pending = [];
  let active = 0; let maxActive = 0;
  const owner = createLlmSettingsOwner({ qualifyCustom: (candidate) => new Promise((resolve) => {
    active += 1; maxActive = Math.max(maxActive, active);
    pending.push({ candidate, resolve: (value) => { active -= 1; resolve(value); } });
  }) });
  const first = owner.apply(custom);
  await tick();
  const reset = owner.reset();
  pending.shift().resolve(identity());
  await assert.rejects(first, { code: 'LLM_SETTINGS_APPLY_STALE' });
  await tick();
  pending.shift().resolve({ ...identity(), model: LOCAL_LLM_PRESET.model });
  await reset;
  assert.deepEqual(owner.read(), defaultSettings());

  const older = owner.apply(custom);
  await tick();
  const newer = owner.apply({ ...custom, model: 'new-model' });
  const old = pending.shift();
  old.resolve(identity());
  await assert.rejects(older, { code: 'LLM_SETTINGS_APPLY_STALE' });
  await tick();
  pending.shift().resolve({ ...identity(), model: 'new-model' });
  await newer;
  assert.equal(owner.read().model, 'new-model');
  assert.equal(maxActive, 1);
  assert.equal(JSON.stringify(owner.read()).includes('secret-key'), false);
});

test('latest failed Apply preserves active settings and test reports qualification duration', async () => {
  let ticks = 10;
  const owner = createLlmSettingsOwner({ now: () => ticks, qualifyCustom: async (candidate) => {
    ticks += 7;
    if (candidate.model === 'bad-model') throw Object.assign(new Error('no'),
      { code: 'QUALIFICATION_FAILED' });
    return { ...identity(), model: candidate.model };
  } });
  await owner.apply(custom);
  await assert.rejects(owner.apply({ ...custom, model: 'bad-model' }),
    { code: 'QUALIFICATION_FAILED' });
  assert.equal(owner.read().model, 'local-model');
  const result = await owner.probe({ ...custom, model: 'probe-model' });
  assert.deepEqual(result, { ok: true, provider: 'openai_compatible',
    model: 'probe-model', category: 'ok', duration_ms: 7 });
  assert.equal(JSON.stringify(result).includes('secret-key'), false);
});

test('custom qualification is atomic; probe does not apply it', async () => {
  let fail = false;
  const owner = createLlmSettingsOwner({ qualifyCustom: async (candidate) => {
    if (fail) throw Object.assign(new Error('no'), { code: 'QUALIFICATION_FAILED' });
    return { ...identity(), model: candidate.model };
  } });
  await owner.apply(custom);
  assert.equal(owner.ordinaryMaterializationIdentity().model, 'local-model');
  fail = true;
  await assert.rejects(owner.apply({ ...custom, model: 'bad-model' }), { code: 'QUALIFICATION_FAILED' });
  assert.equal(owner.read().model, 'local-model');
  await assert.rejects(owner.probe({ ...custom, model: 'probe-model' }), { code: 'QUALIFICATION_FAILED' });
  assert.equal(owner.read().model, 'local-model');
  fail = false;
  await owner.reset();
  assert.equal(owner.ordinaryMaterializationIdentity().model,
    LOCAL_LLM_PRESET.model);
});

test('role runner fixes custom provider settings at call start and tags probes separately', async () => {
  const owner = createLlmSettingsOwner({ qualifyCustom: async () => identity() });
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
  await owner.apply(custom);
  releaseFirst();
  await first;
  await runner.run({ scope: 'turn_runtime', role_id: 'intent_router' });
  assert.equal(calls[0].runtimeProviderOverride.model, LOCAL_LLM_PRESET.model);
  assert.equal(calls[1].runtimeProviderOverride.model, 'local-model');
  const description = runner.describe({ scope: 'turn_runtime', role_id: 'intent_router' });
  assert.equal(description.provider, 'openai_compatible');
  assert.equal(description.model, 'local-model');
  assert.equal(runner.isCustomProvider(), true);
  const before = owner.read();
  await owner.probe(custom);
  assert.deepEqual(owner.read(), before);
  assert.equal(calls.at(-1).runtimeProviderOverride.model, 'local-model');
  const failed = createLlmRoleRunnerAdapter({ execute: async () => ({ status: 'transport_error', error: { code: 'timeout' }, durationMs: 2 }) });
  assert.deepEqual(await failed.probe(owner.providerSnapshot()), {
    ok: false, provider: 'openai_compatible', model: 'local-model', category: 'timeout', duration_ms: 2
  });
});

test('LLM settings HTTP routes redact secrets and reject invalid input without changing active config', async (t) => {
  const owner = createLlmSettingsOwner({ qualifyCustom: async () => identity() });
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
  assert.deepEqual((await get.json()).data, defaultSettings());
  const apply = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(custom) });
  const applyText = await apply.text();
  assert.equal(apply.status, 200);
  assert.equal(applyText.includes('secret-key'), false);
  const invalid = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...custom, extra: true }) });
  assert.equal(invalid.status, 400);
  assert.equal(owner.read().model, 'local-model');
  const probe = await fetch(`${url}/test`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(custom) });
  const probeData = (await probe.json()).data;
  assert.equal(probeData.category, 'ok');
  assert.equal(Number.isFinite(probeData.duration_ms), true);
  assert.equal(probeCalls, 0);
  const reset = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'default' }) });
  assert.deepEqual((await reset.json()).data, defaultSettings());
});

test('LLM settings probe HTTP route reuses key only for active endpoint', async (t) => {
  const candidates = [];
  const owner = createLlmSettingsOwner({ qualifyCustom: async (candidate) => {
    candidates.push(candidate);
    return identity();
  } });
  const root = createGameCompositionRoot({
    newGameWorkflow: { run: async () => ({}) }, turnWorkflow: { run: async () => ({}) },
    sessionStore: createInMemorySessionStore(), llmSettings: owner
  });
  const server = createGameHttpServer({ root });
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  t.after(() => server.close());
  const url = `http://127.0.0.1:${address.port}/api/v1/llm-settings`;
  const applied = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(custom) });
  assert.equal(applied.status, 200);
  candidates.length = 0;
  const blankKey = { ...custom, api_key: '' };
  const unknown = await fetch(`${url}/test`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...blankKey, extra: true }) });
  const invalidKey = await fetch(`${url}/test`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...blankKey, api_key: 1 }) });
  assert.equal(unknown.status, 400);
  assert.equal((await unknown.json()).error.code, 'LLM_SETTINGS_FIELD_UNKNOWN');
  assert.equal(invalidKey.status, 400);
  assert.equal((await invalidKey.json()).error.code, 'LLM_SETTINGS_API_KEY_INVALID');
  assert.equal(candidates.length, 0);
  const same = await fetch(`${url}/test`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(blankKey) });
  const other = await fetch(`${url}/test`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...blankKey, base_url: 'http://127.0.0.1:11435/v1/' }) });
  assert.equal(same.status, 200);
  assert.equal(other.status, 200);
  assert.equal(candidates[0].apiKey, 'secret-key');
  assert.equal(candidates[1].apiKey, null);
  assert.equal(owner.providerSnapshot().apiKey, 'secret-key');
  assert.equal(owner.providerSnapshot().baseUrl, 'http://127.0.0.1:11434/v1');
});

test('local preset and private server config survive restart', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'rus-llm-settings-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createLlmSettingsFileStore({
    filePath: join(directory, 'llm-settings.json')
  });
  const qualifyCustom = async (candidate) => ({ ...identity(),
    model: candidate.model });
  const first = createLlmSettingsOwner({ qualifyCustom,
    persistSettings: (record) => store.save(record) });
  const applied = await first.apply({ mode: 'local', api_key: 'local-secret' });
  assert.equal(applied.mode, 'local');
  assert.equal(applied.base_url, LOCAL_LLM_PRESET.base_url);
  assert.equal(applied.model, LOCAL_LLM_PRESET.model);
  assert.equal(JSON.stringify(applied).includes('local-secret'), false);
  assert.match(await readFile(store.path, 'utf8'), /local-secret/u);

  const restored = createLlmSettingsOwner({ qualifyCustom,
    initialRecord: await store.load(),
    persistSettings: (record) => store.save(record) });
  assert.equal(restored.read().mode, 'local');
  assert.equal(restored.read().api_key_present, true);
  assert.equal(restored.providerSnapshot().apiKey, 'local-secret');
  assert.equal(restored.ordinaryMaterializationIdentity().model,
    LOCAL_LLM_PRESET.model);
});

test('readiness probe reports provider category without applying candidate', async () => {
  const owner = createLlmSettingsOwner({ qualifyCustom: async () => identity(),
    probeCustom: async () => ({ ok: false, category: 'timeout', duration_ms: 12 }) });
  const before = owner.read();
  assert.deepEqual(await owner.probe(custom), {
    ok: false, provider: 'openai_compatible', model: 'local-model',
    category: 'timeout', duration_ms: 12
  });
  assert.deepEqual(owner.read(), before);
});

function identity() { return { provider: 'openai_compatible', model: 'local-model',
  scope: 'turn_runtime', role_id: 'ordinary_materialization', config_hash: 'qualified' }; }
function defaultSettings() { return { mode: 'local',
  base_url: LOCAL_LLM_PRESET.base_url, model: LOCAL_LLM_PRESET.model,
  api_key_present: false, compatibility: 'openai_compatible',
  local_preset: LOCAL_LLM_PRESET }; }
function tick() { return new Promise((resolve) => setImmediate(resolve)); }
