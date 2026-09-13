import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { acceptanceProviderFromEnv, phase10TerminalObservation,
  acceptanceExitCode, appendRenderedUiEvidence, pendingBrowserRequest, pendingBrowserStorage, resumePendingTurn, runLocalGemmaBrowserAcceptance } from
  '../local-gemma-acceptance.mjs';
import { recordNarrationQuality } from '../gameplay-gap-campaign.mjs';

test('degraded factual delivery remains terminal evidence but blocks narration quality once', () => {
  const event = { event: 'turn.completed', output: { screen: {
    schema: 'factual_turn_delivery_screen', presentation_quality: 'degraded',
    party_id: 'party:terminal', turn_id: 'turn:terminal', package_id: 'visible:terminal'
  } } };
  const report = { findings: [], narration_quality_pass: true };
  const trace = { trace_ref: 'trace:terminal' };
  recordNarrationQuality({ report, trace, partyId: 'party:terminal', event });
  const replay = { trace_ref: 'trace:terminal-replay' };
  recordNarrationQuality({ report, trace: replay, partyId: 'party:terminal', event });
  assert.equal(trace.narration_quality_pass, false);
  assert.equal(replay.narration_quality_pass, false);
  assert.equal(report.narration_quality_pass, false);
  assert.equal(report.findings.length, 1);
  assert.deepEqual(trace.narration_finding_ids,
    ['narration-degraded:party:terminal:turn:terminal:visible:terminal']);
  assert.equal(report.findings[0].severity, 'blocking');
  assert.equal(report.findings[0].evidence_ref, 'trace:terminal#/events/0/output/screen');
});

test('approved narrated delivery remains a narration quality pass', () => {
  const report = { findings: [], narration_quality_pass: true };
  const trace = { trace_ref: 'trace:narrated' };
  assert.equal(recordNarrationQuality({ report, trace, partyId: 'party:narrated',
    event: { event: 'turn.completed', output: { screen: {
      schema: 'lower_dvina_trace_turn_screen', main_prose: 'Одобренная сцена.'
    } } } }), null);
  assert.equal(trace.narration_quality_pass, true);
  assert.equal(report.narration_quality_pass, true);
  assert.deepEqual(report.findings, []);
});

test('browser acceptance records degraded delivery as a non-pass terminal report', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'novgorod-degraded-acceptance-'));
  const partyId = 'party:degraded'; let observations = 0;
  const logPath = join(directory, 'party-logs', 'party_degraded.jsonl');
  const append = async (event) => {
    await mkdir(join(directory, 'party-logs'), { recursive: true });
    await writeFile(logPath, `${JSON.stringify(event)}\n`, { flag: 'a' });
  };
  const provider = { mode: 'custom', compatibility: 'openai_compatible',
    baseUrl: 'http://127.0.0.1:8000/v1', model: 'selected-model', apiKey: null,
    evidence: { backend: 'test', backendVersion: '1', runtime: 'test', hardware: 'test' } };
  const page = { setDefaultTimeout() {}, async goto() {}, async reload() {},
    async waitForSelector() {}, async waitForFunction() {}, async fill() {},
    async evaluate() { return partyId; }, async click(selector) {
      if (selector.includes('data-continue-party')) return append({ event: 'screen.read',
        output: { screen: { screen_status: 'before' } } });
      if (!selector.includes('button[type="submit"]')) return;
      const input = { request_id: 'request:degraded', idempotency_key: 'idem:degraded',
        raw_text: 'Осматриваюсь.' };
      await append({ event: 'turn.requested', input });
      await append({ event: 'turn.completed', input, output: { screen: {
        schema: 'factual_turn_delivery_screen', presentation_quality: 'degraded',
        party_id: partyId, turn_id: 'turn:degraded', package_id: 'package:degraded'
      } }, llm: { gameplay_traces: [], waterfall: [], aggregate: {}, calls: [] } });
    }, locator(selector) {
      if (selector === '[data-game-root]') return { innerText: async () => 'Текущий момент' };
      if (selector === '.error') return { count: async () => 0 };
      return { async check() {}, async click() {}, count: async () => 0 };
    } };
  const common = { outputDirectory: directory, focus: 'degraded delivery', turns: 1,
    provider, chromiumPath: 'chromium', headless: true,
    snapshot: () => ({ head: 'a'.repeat(40), dirty: false }),
    start: async () => ({ url: 'http://127.0.0.1:3000',
      managedRuntime: { llm: null, giga: { identity: { model: 'giga' } } },
      postgres: { version: '16.14.0', partyUrl: 'unused' }, async close() {} }),
    launch: async () => ({ async newPage() { return page; }, async close() {} }),
    createExplorer: () => async () => ({ raw_text: 'Осматриваюсь.',
      explorer_provider: { provider: 'openai_compatible', model: provider.model } }),
    createCompletionObserver: async () => ({ async observe() {
      observations += 1; return { terminal: observations > 1 }; }, async close() {} }) };
  try {
    const report = await runLocalGemmaBrowserAcceptance(common);
    assert.equal(report.terminal.terminal, true);
    assert.equal(report.status, 'quality_failed');
    assert.equal(report.narration_quality_pass, false);
    assert.equal(report.findings.length, 1);
    assert.equal(acceptanceExitCode(report), 1);
    assert.equal(acceptanceExitCode({ status: 'captured' }), 0);
    await assert.rejects(runLocalGemmaBrowserAcceptance({ ...common, resume: true }),
      /not a resumable continuation/u);
    const interrupted = JSON.parse(await readFile(join(directory, 'campaign.json'), 'utf8'));
    interrupted.status = 'interrupted'; delete interrupted.terminal;
    await writeFile(join(directory, 'campaign.json'), `${JSON.stringify(interrupted)}\n`);
    const resumed = await runLocalGemmaBrowserAcceptance({ ...common, resume: true });
    assert.equal(resumed.status, 'quality_failed');
    assert.equal(resumed.resume_count, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('rendered UI evidence binds each turn to its causal preceding screen read', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'novgorod-ui-evidence-'));
  const input = { request_id: 'request:ui:1', idempotency_key: 'idem:ui:1',
    raw_text: 'Осмотреть берег.' };
  const next = { request_id: 'request:ui:2', idempotency_key: 'idem:ui:2',
    raw_text: 'Осмотреть следы.' };
  const first = { event: 'turn.completed', input,
    output: { screen: { screen_status: 'ready:first' } } };
  const second = { event: 'turn.completed', input: next,
    output: { screen: { screen_status: 'ready:second' } } };
  const events = [{ event: 'screen.read', output: { screen: { screen_status: 'before:first' } } },
    { event: 'turn.requested', input }, first,
    { event: 'screen.read', output: { screen: { screen_status: 'before:second' } } },
    { event: 'turn.requested', input: next }, second];
  try {
    await appendRenderedUiEvidence({ directory, partyId: 'party:ui',
      event: first, events, terminalIndex: 2, before: 'До', after: 'После' });
    await appendRenderedUiEvidence({ directory, partyId: 'party:ui',
      event: second, events, terminalIndex: 5, before: 'После', after: 'Дальше' });
    const saved = (await readFile(join(directory, 'party_ui.jsonl'), 'utf8'))
      .trim().split('\n').map(JSON.parse);
    assert.equal(saved[0].event, 'ui.rendered');
    assert.deepEqual(saved[0].input, input);
    assert.deepEqual(saved[0].public_dto_after, { screen_status: 'ready:first' });
    assert.deepEqual(saved[0].public_dto_before, { screen_status: 'before:first' });
    assert.equal(saved[0].player_dom_after, 'После');
    assert.deepEqual(saved[1].public_dto_before, { screen_status: 'before:second' });
    await assert.rejects(appendRenderedUiEvidence({ directory, partyId: 'party:ui',
      event: { event: 'turn.failed', input }, events, terminalIndex: 2 }),
    /terminal causal event/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('rendered UI evidence rejects a turn without a preceding causal screen read', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'novgorod-ui-evidence-'));
  const input = { request_id: 'request:missing', idempotency_key: 'idem:missing',
    raw_text: 'Осмотреть берег.' };
  const event = { event: 'turn.completed', input,
    output: { screen: { screen_status: 'ready' } } };
  try {
    await assert.rejects(appendRenderedUiEvidence({ directory, partyId: 'party:ui',
      event, events: [{ event: 'turn.requested', input }, event], terminalIndex: 1 }),
    /no preceding causal screen read/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

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
  assert.deepEqual(pendingBrowserRequest({ ...pending, browser_request: input }, [
    { event: 'turn.completed', input: { request_id: 'request:other', idempotency_key: 'idem:other' } }
  ]), input);
  assert.throws(() => pendingBrowserRequest(pending, [...events,
    { event: 'turn.requested', input: { ...input, idempotency_key: 'idem:second' } }
  ]), /ambiguous/u);
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
        `${JSON.stringify({ event: 'turn.requested', input: { request_id: 'request:resume', idempotency_key: 'idem:resume', raw_text: typed.at(-1) } })}\n${JSON.stringify({ event: 'turn.completed', input: { request_id: 'request:resume', idempotency_key: 'idem:resume', raw_text: typed.at(-1) } })}\n`);
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

test('completion observer accepts only anchored factual delivery with its rendered schema', () => {
  const screen = { version: 1, schema: 'factual_turn_delivery_screen',
    screen_status: 'ready', party_id: 'party:terminal', turn_id: 'turn:terminal',
    turn_number: 1, package_id: 'visible:terminal',
    committed_state_version: '3', presentation_quality: 'degraded',
    scenario_id: 'lower_dvina_trace_v1', screen_kind: 'trace_turn',
    visible_context: { visible_scene: 'Берег.' },
    visible_changes: ['Верёвка снята.'], uncertainties: [],
    action_panel: { suggested_actions: [] }, actions: [], checks: [], panels: {},
    input_panel: { free_text_enabled: true, input_contract: 'intent_not_fact' },
    delivery_state: { ready: true, generated_at: '1230-01-01T00:00:00.000Z' },
    opening_screen_digest: 'opening:terminal',
    current_projection_anchor: { committed_state_version: '3',
      package_id: 'visible:terminal', package_digest: 'package:terminal',
      narration_output_digest: null },
    presentation_context: { location_label: 'Берег' } };
  const input = { partyId: 'party:terminal', state: { completion: {
    status: 'committed', change_set_id: 'change:terminal' }, last_turn: {
    visible_package: { change_set_id: 'change:terminal',
      package_id: 'visible:terminal' } } }, session: { screen },
  playerDom: 'Текущий момент\nБерег.\nВерёвка снята.',
  renderedScreenSchema: 'factual_turn_delivery_screen' };
  assert.equal(phase10TerminalObservation(input).terminal, true);
  assert.equal(phase10TerminalObservation({ ...input,
    playerDom: 'Старый экран' }).terminal, false);
  assert.equal(phase10TerminalObservation({ ...input,
    renderedScreenSchema: 'turn_screen' }).terminal, false);
  assert.equal(phase10TerminalObservation({ ...input, partyId: 'party:other' }).terminal, false);
  assert.equal(phase10TerminalObservation({ ...input, session: { screen: {
    ...screen, package_id: 'visible:other' } } }).terminal, false);
  assert.equal(phase10TerminalObservation({ ...input, session: { screen: {
    ...screen, main_prose: 'Запрещено.' } } }).terminal, false);
});

test('browser runner reloads to a browser screen read before each new turn', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'novgorod-browser-read-'));
  const partyId = 'party:read'; let screen = 0; let submitted = 0;
  const order = [];
  const logPath = join(directory, 'party-logs', 'party_read.jsonl');
  const append = async (record) => {
    await mkdir(join(directory, 'party-logs'), { recursive: true });
    await writeFile(logPath, `${JSON.stringify(record)}\n`, { flag: 'a' });
  };
  const provider = { mode: 'custom', compatibility: 'openai_compatible',
    baseUrl: 'http://127.0.0.1:8000/v1', model: 'selected-model', apiKey: null,
    evidence: { backend: 'test', backendVersion: '1', runtime: 'test',
      hardware: 'test' } };
  const page = { setDefaultTimeout() {}, async goto() {}, async reload() {
    order.push('reload');
  }, async waitForSelector() {}, async waitForFunction() {}, async fill() {},
  async evaluate() { return partyId; }, async click(selector) {
    if (selector.includes('data-continue-party')) {
      screen += 1; order.push(`screen:${screen}`);
      await append({ event: 'screen.read', output: { screen: {
        screen_status: `before:${screen}` } } });
      return;
    }
    if (!selector.includes('button[type="submit"]')) return;
    submitted += 1; order.push(`request:${submitted}`);
    const input = { request_id: `request:${submitted}`,
      idempotency_key: `idem:${submitted}`, raw_text: `Ход ${submitted}` };
    await append({ event: 'turn.requested', input });
    await append({ event: 'turn.completed', input, output: { screen: {
      screen_status: `after:${submitted}` } }, llm: {
      gameplay_traces: [], waterfall: [], aggregate: {}, calls: [] } });
  }, locator(selector) {
    if (selector === '[data-game-root]') return { innerText: async () => {
      order.push(`dom:${screen}`); return `Экран ${screen}`;
    } };
    if (selector === '.error') return { count: async () => 0 };
    return { async check() {}, async click() {}, count: async () => 0 };
  } };
  try {
    const report = await runLocalGemmaBrowserAcceptance({ outputDirectory: directory,
      focus: 'causal screen reads', turns: 2, provider, chromiumPath: 'chromium',
      headless: true, snapshot: () => ({ head: 'a'.repeat(40), dirty: false }),
      start: async () => ({ url: 'http://127.0.0.1:3000',
        managedRuntime: { llm: null, giga: { identity: { model: 'giga' } } },
        postgres: { version: '16.14.0', partyUrl: 'unused' }, async close() {} }),
      launch: async () => ({ async newPage() { return page; }, async close() {} }),
      createExplorer: () => async ({ turn_index }) => ({ raw_text: `Ход ${turn_index + 1}`,
        explorer_provider: { provider: 'openai_compatible', model: provider.model } }),
      createCompletionObserver: async () => ({
        async observe() { return { terminal: false }; }, async close() {} }) });
    assert.equal(report.status, 'captured');
    assert.equal(report.narration_quality_pass, true);
    assert.equal(report.turns.length, 2);
    const events = (await readFile(logPath, 'utf8')).trim().split('\n').map(JSON.parse);
    const rendered = events.filter(({ event }) => event === 'ui.rendered');
    assert.deepEqual(rendered.map(({ public_dto_before }) => public_dto_before), [
      { screen_status: 'before:1' }, { screen_status: 'before:2' }]);
    for (const number of [1, 2]) assert.ok(order.indexOf(`screen:${number}`)
      < order.indexOf(`request:${number}`));
    assert.ok(order.indexOf('screen:1') < order.indexOf('dom:1'));
    assert.ok(order.indexOf('screen:2') < order.lastIndexOf('dom:2'));
  } finally { await rm(directory, { recursive: true, force: true }); }
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
    async waitForFunction() {}, async fill() {}, async reload() {},
    async evaluate() { return partyId; },
    async click(selector) {
      const logs = join(directory, 'party-logs');
      await mkdir(logs, { recursive: true });
      const path = join(logs, 'party_test.jsonl');
      if (selector.includes('data-continue-party')) {
        await writeFile(path, `${JSON.stringify({ event: 'screen.read',
          output: { screen: { screen_status: 'before' } } })}\n`);
        return;
      }
      if (!selector.includes('button[type="submit"]')) return;
      submitted = true;
      await writeFile(path, `${JSON.stringify({ event: 'turn.requested', input: event.input })}\n${JSON.stringify(event)}\n${JSON.stringify({ event: 'screen.read', output: { screen: { screen_status: 'later' } } })}\n`,
      { flag: 'a' });
    },
    locator(selector) {
      if (selector === '[data-game-root]') return {
        innerText: async () => submitted ? 'Экран ошибки' : 'Начальный экран' };
      if (selector === '.error') return { count: async () => submitted ? 1 : 0,
        innerText: async () => 'План отклонён' };
      return { async check() {}, count: async () => 0 };
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
    const events = (await readFile(join(directory, 'party-logs', 'party_test.jsonl'), 'utf8'))
      .trim().split('\n').map(JSON.parse);
    assert.deepEqual(events.find(({ event: name }) => name === 'ui.rendered')
      .public_dto_before, { screen_status: 'before' });
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
    let activeDirectory = null;
    const page = { setDefaultTimeout() {}, async goto() {},
      async waitForSelector() {}, async waitForFunction() {}, async fill() {},
      async click(selector) {
        if (!selector.includes('data-continue-party')) return;
        const logs = join(activeDirectory, 'party-logs');
        await mkdir(logs, { recursive: true });
        await writeFile(join(logs, 'party_existing.jsonl'), `${JSON.stringify({
          event: 'screen.read', output: { screen: { screen_status: 'resumed' } }
        })}\n`, { flag: 'a' });
      }, async addInitScript(_fn, partyId) {
        assert.equal(partyId, 'party:existing');
      }, locator(selector) {
        if (selector === '[data-game-root]') return {
          innerText: async () => 'Продолженный экран' };
        return { async check() {}, count: async () => 0 };
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
      activeDirectory = success;
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

test('resumed pre-click proposal waits for Continue screen read before submit', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'novgorod-resume-preclick-'));
  const partyId = 'party:resume'; const head = 'a'.repeat(40); const order = [];
  const provider = { mode: 'custom', compatibility: 'openai_compatible',
    baseUrl: 'http://127.0.0.1:8000/v1', model: 'selected-model', apiKey: null,
    evidence: { backend: 'test', backendVersion: '1', runtime: 'test', hardware: 'test' } };
  const identity = { mode: 'custom', provider: 'openai_compatible',
    base_url: provider.baseUrl, model: provider.model, backend: 'test',
    backend_version: '1', runtime_metadata: 'test', hardware_metadata: 'test' };
  const execution = { interface: 'chromium_playwright_dom_only',
    gameplay_transport: 'browser_ui_only', browser: { executable: 'chromium', headless: true },
    llm_provider: identity, giga: { model: 'giga' }, postgres: { version: '16.14.0' } };
  const path = join(directory, 'party-logs', 'party_resume.jsonl');
  const append = async (event) => {
    await mkdir(join(directory, 'party-logs'), { recursive: true });
    await writeFile(path, `${JSON.stringify(event)}\n`, { flag: 'a' });
  };
  const input = { request_id: 'request:resume', idempotency_key: 'idem:resume',
    raw_text: 'Осматриваю берег.' };
  const page = { setDefaultTimeout() {}, async goto() {}, async waitForSelector() {},
    async waitForFunction() {}, async fill() {}, async evaluate() { return null; },
    async click(selector) {
      if (selector.includes('data-continue-party')) {
        order.push('read'); await append({ event: 'screen.read', output: {
          screen: { screen_status: 'before:resume' } } }); return;
      }
      if (!selector.includes('button[type="submit"]')) return;
      order.push('submit'); await append({ event: 'turn.requested', input });
      await append({ event: 'turn.completed', input, output: { screen: {
        screen_status: 'after:resume' } }, llm: { gameplay_traces: [], waterfall: [],
        aggregate: {}, calls: [] } });
    }, locator(selector) {
      if (selector === '[data-game-root]') return { innerText: async () => 'Экран resume' };
      if (selector === '.error') return { count: async () => 0 };
      return { async check() {}, async click() {}, count: async () => 0 };
    } };
  try {
    await writeFile(join(directory, 'campaign.json'), `${JSON.stringify({
      schema: 'world_knowledge_gameplay_campaign_v1', campaign_id: 'campaign:resume',
      explorer_ref: 'explorer:resume', party_id: partyId, mode: 'acceptance_candidate',
      independent_unseen: true, sequence: 1, focus: 'resume read', git: { head, dirty: false },
      status: 'interrupted', execution, turns: [], trace_refs: [], pending_turn: {
        trace_ref: 'trace:resume', campaign_id: 'campaign:resume', explorer_ref: 'explorer:resume',
        producer_ref: `production-runtime:${head}`, proposal: { raw_text: input.raw_text }, after_count: 0 }
    }, null, 2)}\n`);
    const report = await runLocalGemmaBrowserAcceptance({ outputDirectory: directory,
      focus: 'resume read', turns: 1, sequence: 1, resume: true, provider,
      chromiumPath: 'chromium', headless: true, snapshot: () => ({ head, dirty: false }),
      start: async () => ({ url: 'http://127.0.0.1:3000', managedRuntime: {
        llm: null, giga: { identity: { model: 'giga' } } }, postgres: { version: '16.14.0',
        partyUrl: 'unused' }, async close() {} }),
      launch: async () => ({ async newPage() { return page; }, async close() {} }),
      createExplorer: () => async () => { throw new Error('proposal already saved'); },
      createCompletionObserver: async () => ({ async observe() { return { terminal: false }; },
        async close() {} }) });
    assert.deepEqual(order, ['read', 'submit']);
    const events = (await readFile(path, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.deepEqual(events.find(({ event }) => event === 'ui.rendered').public_dto_before,
      { screen_status: 'before:resume' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('resumed browser request keeps its original read and rejects a late substitute', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novgorod-resume-request-'));
  const head = 'a'.repeat(40); const partyId = 'party:request';
  const input = { request_id: 'request:existing', idempotency_key: 'idem:existing',
    raw_text: 'Осматриваю берег.' };
  const provider = { mode: 'custom', compatibility: 'openai_compatible',
    baseUrl: 'http://127.0.0.1:8000/v1', model: 'selected-model', apiKey: null,
    evidence: { backend: 'test', backendVersion: '1', runtime: 'test', hardware: 'test' } };
  const identity = { mode: 'custom', provider: 'openai_compatible',
    base_url: provider.baseUrl, model: provider.model, backend: 'test',
    backend_version: '1', runtime_metadata: 'test', hardware_metadata: 'test' };
  const execution = { interface: 'chromium_playwright_dom_only',
    gameplay_transport: 'browser_ui_only', browser: { executable: 'chromium', headless: true },
    llm_provider: identity, giga: { model: 'giga' }, postgres: { version: '16.14.0' } };
  const seed = async (directory, withOriginalRead) => {
    const logs = join(directory, 'party-logs'); await mkdir(logs, { recursive: true });
    const completed = { event: 'turn.completed', input, output: { screen: {
      screen_status: 'after:existing' } }, llm: { gameplay_traces: [], waterfall: [],
      aggregate: {}, calls: [] } };
    await writeFile(join(logs, 'party_request.jsonl'), [
      ...(withOriginalRead ? [{ event: 'screen.read', output: { screen: {
        screen_status: 'before:original' } } }] : []),
      { event: 'turn.requested', input }, completed
    ].map(JSON.stringify).join('\n').concat('\n'));
    await writeFile(join(directory, 'campaign.json'), `${JSON.stringify({
      schema: 'world_knowledge_gameplay_campaign_v1', campaign_id: 'campaign:request',
      explorer_ref: 'explorer:request', party_id: partyId, mode: 'acceptance_candidate',
      independent_unseen: true, sequence: 1, focus: 'request resume', git: { head, dirty: false },
      status: 'interrupted', execution, turns: [], trace_refs: [], pending_turn: {
        trace_ref: 'trace:request', campaign_id: 'campaign:request', explorer_ref: 'explorer:request',
        producer_ref: `production-runtime:${head}`, proposal: { raw_text: input.raw_text },
        after_count: 0, browser_request: input }
    }, null, 2)}\n`);
  };
  const run = async (directory) => {
    let submits = 0;
    const page = { setDefaultTimeout() {}, async goto() {}, async waitForSelector() {},
      async waitForFunction() {}, async fill() {}, async evaluate() { return null; },
      async click(selector) {
        if (selector.includes('button[type="submit"]')) { submits += 1; return; }
        if (selector.includes('data-continue-party')) await writeFile(
          join(directory, 'party-logs', 'party_request.jsonl'), `${JSON.stringify({
            event: 'screen.read', output: { screen: { screen_status: 'late' } }
          })}\n`, { flag: 'a' });
      }, locator(selector) {
        if (selector === '[data-game-root]') return { innerText: async () => 'Экран request' };
        if (selector === '.error') return { count: async () => 0 };
        return { async check() {}, async click() {}, count: async () => 0 };
      } };
    const result = await runLocalGemmaBrowserAcceptance({ outputDirectory: directory,
      focus: 'request resume', turns: 1, sequence: 1, resume: true, provider,
      chromiumPath: 'chromium', headless: true, snapshot: () => ({ head, dirty: false }),
      start: async () => ({ url: 'http://127.0.0.1:3000', managedRuntime: {
        llm: null, giga: { identity: { model: 'giga' } } }, postgres: { version: '16.14.0',
        partyUrl: 'unused' }, async close() {} }),
      launch: async () => ({ async newPage() { return page; }, async close() {} }),
      createExplorer: () => async () => { throw new Error('request already exists'); },
      createCompletionObserver: async () => ({ async observe() { return { terminal: false }; },
        async close() {} }) });
    return { result, submits };
  };
  try {
    const original = join(root, 'original'); await seed(original, true);
    const { submits } = await run(original);
    assert.equal(submits, 0);
    const originalEvents = (await readFile(join(original, 'party-logs', 'party_request.jsonl'),
      'utf8')).trim().split('\n').map(JSON.parse);
    assert.deepEqual(originalEvents.find(({ event }) => event === 'ui.rendered')
      .public_dto_before, { screen_status: 'before:original' });

    const missing = join(root, 'missing'); await seed(missing, false);
    await assert.rejects(run(missing), /no preceding causal screen read/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});
