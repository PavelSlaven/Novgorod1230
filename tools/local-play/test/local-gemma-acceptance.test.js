import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { acceptanceProviderFromEnv, phase10TerminalObservation,
  pendingBrowserRequest, pendingBrowserStorage, resumePendingTurn, runLocalGemmaBrowserAcceptance } from
  '../local-gemma-acceptance.mjs';

test('runner recovers exact browser identity from persisted request or requested event', () => {
  const input = { request_id: 'request:existing', idempotency_key: 'idem:existing',
    raw_text: 'Осматриваю берег.' };
  const pending = { after_count: 1, proposal: { raw_text: input.raw_text } };
  const events = [{ event: 'turn.completed', input: { raw_text: 'прошлый ход' } },
    { event: 'turn.requested', input }];
  assert.deepEqual(pendingBrowserRequest(pending, events), input);
  assert.deepEqual(pendingBrowserRequest({ ...pending, browser_request: input }, []), input);
  assert.equal(pendingBrowserRequest(pending,
    [...events, { event: 'turn.completed', input }]), null);
  assert.equal(pendingBrowserRequest({ ...pending, after_count: 0 }, []), null);
  const restored = pendingBrowserStorage('http://localhost:3000/play', {
    party_id: 'party', pending_turn: pending }, events);
  assert.deepEqual(restored.cookies, []);
  assert.equal(restored.origins[0].origin, 'http://localhost:3000');
  assert.deepEqual(JSON.parse(restored.origins[0].localStorage[1].value),
    { party_id: 'party', request: input });
});

test('runner resumes a pre-click proposal once and consumes existing terminal events without a click', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'novgorod-pending-ui-'));
  const report = { pending_turn: { after_count: 0,
    proposal: { raw_text: 'Осматриваю берег.' } } };
  let clicks = 0; const typed = [];
  const page = { async fill(selector, text) { typed.push(text); },
    async click() {
      clicks += 1;
      await writeFile(join(directory, 'party.jsonl'),
        `${JSON.stringify({ event: 'turn.completed', input: { raw_text: typed.at(-1) } })}\n`);
    }, async waitForSelector() {} };
  try {
    const input = { report, page, logDirectory: directory, partyId: 'party' };
    await resumePendingTurn(input);
    await resumePendingTurn(input);
    assert.deepEqual(typed, ['Осматриваю берег.']);
    assert.equal(clicks, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

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

test('completion observer requires committed Phase 10 narration on actual DOM', () => {
  const input = { state: { completion: { status: 'committed',
    change_set_id: 'change:terminal' }, last_turn: { visible_package: {
      change_set_id: 'change:terminal', package_id: 'visible:terminal',
      package_digest: 'sha256:package' } } }, session: { screen: {
    screen_status: 'ready', main_prose: 'Одобренный итог показан игроку.',
    current_projection_anchor: { package_id: 'visible:terminal',
      package_digest: 'sha256:package',
      narration_output_digest: 'sha256:narration' } } },
  playerDom: 'Хроника\nОдобренный итог показан игроку.' };
  assert.equal(phase10TerminalObservation(input).terminal, true);
  assert.equal(phase10TerminalObservation({ ...input,
    playerDom: 'Предыдущий экран' }).terminal, false);
  assert.equal(phase10TerminalObservation({ ...input, state: {
    ...input.state, last_turn: { visible_package: {
      ...input.state.last_turn.visible_package,
      change_set_id: 'change:later' } } } }).terminal, false);
});

test('browser runner persists failed turn evidence before reporting failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'novgorod-browser-failure-'));
  const partyId = 'party:test';
  let submitted = false;
  const event = { event: 'turn.failed',
    input: { request_id: 'request:failed', idempotency_key: 'idem:failed',
      raw_text: 'Осмотреть мокрую верёвку.' },
    error: { code: 'TURN_STEP_PLAN_INVALID', details: { stage: 'plan' } },
    llm: { gameplay_traces: [], waterfall: [], aggregate: {}, calls: [] } };
  const page = {
    setDefaultTimeout() {}, async goto() {}, async waitForSelector() {},
    async waitForFunction() {}, async fill() {},
    async evaluate() { return partyId; },
    async click(selector) {
      if (!selector.includes('button[type="submit"]')) return;
      submitted = true;
      const logs = join(directory, 'party-logs');
      await mkdir(logs, { recursive: true });
      await writeFile(join(logs, 'party_test.jsonl'),
        `${JSON.stringify(event)}\n`);
    },
    locator(selector) {
      if (selector === '[data-game-root]') return {
        innerText: async () => submitted ? 'Экран ошибки' : 'Начальный экран' };
      if (selector === '.error') return { count: async () => submitted ? 1 : 0,
        innerText: async () => 'План отклонён' };
      return { async check() {} };
    }
  };
  const provider = { mode: 'custom', compatibility: 'openai_compatible',
    baseUrl: 'http://127.0.0.1:8000/v1', model: 'selected-model', apiKey: null,
    evidence: { backend: 'test', backendVersion: '1', runtime: 'test',
      hardware: 'test' } };
  try {
    await assert.rejects(runLocalGemmaBrowserAcceptance({
      outputDirectory: directory, focus: 'unseen failure', turns: 1,
      provider, chromiumPath: 'chromium', headless: true,
      snapshot: () => ({ head: 'a'.repeat(40), dirty: false }),
      start: async () => ({ url: 'http://127.0.0.1:3000',
        managedRuntime: { llm: null, giga: { identity: { model: 'giga' } } },
        postgres: { version: '16.14.0', partyUrl: 'unused' },
        async close() {} }),
      launch: async () => ({ async newPage() { return page; },
        async close() {} }),
      createExplorer: () => async () => ({
        raw_text: event.input.raw_text, probe_family: 'materials',
        explorer_provider: { provider: 'openai_compatible',
          model: provider.model } }),
      createCompletionObserver: async () => ({
        async observe() { return { terminal: false }; }, async close() {} })
    }), /План отклонён/u);
    const report = JSON.parse(await readFile(join(directory,
      'campaign.json'), 'utf8'));
    assert.equal(report.status, 'failed');
    assert.equal(report.pending_turn, undefined);
    assert.equal(report.turns.length, 1);
    assert.equal(report.turns[0].proposal.raw_text, event.input.raw_text);
    assert.equal(report.turns[0].input.idempotency_key, 'idem:failed');
    assert.equal(report.turns[0].player_dom_after, 'Экран ошибки');
    assert.equal(report.turns[0].events[0].error.code,
      'TURN_STEP_PLAN_INVALID');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('browser runner resumes the same party and rejects changed identity',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'novgorod-browser-resume-'));
    const head = 'a'.repeat(40);
    const provider = { mode: 'custom', compatibility: 'openai_compatible',
      baseUrl: 'http://127.0.0.1:8000/v1', model: 'selected-model', apiKey: null,
      evidence: { backend: 'test', backendVersion: '1', runtime: 'test',
        hardware: 'test' } };
    const identity = { mode: 'custom', provider: 'openai_compatible',
      base_url: provider.baseUrl, model: provider.model,
      backend: 'test', backend_version: '1', runtime_metadata: 'test',
      hardware_metadata: 'test' };
    const execution = { interface: 'chromium_playwright_dom_only',
      gameplay_transport: 'browser_ui_only', browser: {
        executable: 'chromium', headless: true }, llm_provider: identity,
      giga: { model: 'giga' }, postgres: { version: '16.14.0' } };
    const seed = async (directory) => {
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'campaign.json'), `${JSON.stringify({
        schema: 'world_knowledge_gameplay_campaign_v1',
        campaign_id: 'campaign:existing',
        explorer_ref: 'explorer:existing', party_id: 'party:existing',
        mode: 'acceptance_candidate', independent_unseen: true, sequence: 4,
        focus: 'resume contract', git: { head, dirty: false },
        status: 'captured', execution, turns: [
          { trace_ref: 'trace:existing:0', proposal: { raw_text: 'Первый ход' } },
          { trace_ref: 'trace:existing:1', proposal: { raw_text: 'Второй ход' } }
        ], trace_refs: ['trace:existing:0', 'trace:existing:1']
      }, null, 2)}\n`);
    };
    const start = async () => ({ url: 'http://127.0.0.1:3000',
      managedRuntime: { llm: null, giga: { identity: { model: 'giga' } } },
      postgres: { version: '16.14.0', partyUrl: 'unused' }, async close() {} });
    const page = { setDefaultTimeout() {}, async goto() {},
      async waitForSelector() {}, async waitForFunction() {}, async fill() {},
      async click() {}, async addInitScript(_fn, partyId) {
        assert.equal(partyId, 'party:existing');
      }, locator(selector) {
        if (selector === '[data-game-root]') return {
          innerText: async () => 'Продолженный экран' };
        return { async check() {} };
      } };
    const common = { focus: 'resume contract', turns: null, sequence: 4,
      provider, chromiumPath: 'chromium', headless: true, resume: true,
      start, launch: async () => ({ async newPage({ storageState }) {
        assert.deepEqual(storageState.origins[0].localStorage,
          [{ name: 'rus.party_id', value: 'party:existing' }]);
        return page;
      },
        async close() {} }), createExplorer: () => async () => {
        throw new Error('Terminal continuation must not request a new turn.');
      }, createCompletionObserver: async () => ({
        async observe() { return { terminal: true,
          package_id: 'visible:terminal' }; }, async close() {} }) };
    try {
      const success = join(root, 'success');
      await seed(success);
      const report = await runLocalGemmaBrowserAcceptance({ ...common,
        outputDirectory: success,
        snapshot: () => ({ head, dirty: false }) });
      assert.equal(report.campaign_id, 'campaign:existing');
      assert.equal(report.party_id, 'party:existing');
      assert.deepEqual(report.trace_refs,
        ['trace:existing:0', 'trace:existing:1']);
      assert.deepEqual(report.turns.map(({ trace_ref }) => trace_ref),
        ['trace:existing:0', 'trace:existing:1']);
      assert.equal(report.resume_count, 1);
      assert.equal(report.continuations[0].player_dom, 'Продолженный экран');

      const changedHead = join(root, 'changed-head');
      await seed(changedHead);
      let started = false;
      await assert.rejects(runLocalGemmaBrowserAcceptance({ ...common,
        outputDirectory: changedHead,
        snapshot: () => ({ head: 'b'.repeat(40), dirty: false }),
        start: async () => { started = true; return start(); }
      }), /not a resumable continuation/u);
      assert.equal(started, false);

      const changedProvider = join(root, 'changed-provider');
      await seed(changedProvider);
      await assert.rejects(runLocalGemmaBrowserAcceptance({ ...common,
        outputDirectory: changedProvider,
        snapshot: () => ({ head, dirty: false }), provider: { ...provider,
          model: 'changed-model' }
      }), /original provider and runtime identity/u);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
