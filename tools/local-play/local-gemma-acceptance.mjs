import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

import { chromium } from 'playwright-core';
import pg from 'pg';
import { createProductionLlmRoleRunner } from
  '../../apps/game-server/src/infrastructure/provider/deepseek.js';
import { createLowerDvinaTracePhase2PostgresRepository } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2.js';
import { createPostgresSessionStore } from
  '../../apps/game-server/src/infrastructure/postgres/session-store.js';
import { LOCAL_LLM_PRESET } from
  '../../apps/game-server/src/runtime/llm-settings.js';
import { auditEvent, createGameplayGapExplorer, gitSnapshot } from
  './gameplay-gap-campaign.mjs';
import { startLocalPlay } from './local-play.js';
import { ensureLocalPostgres } from './local-postgres.js';
import { observePlayerPanels } from './browser-player-observation.mjs';

const CHROMIUM = [process.env.RUS_CHROMIUM_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']
  .find((candidate) => candidate && existsSync(candidate));

export async function runLocalGemmaBrowserAcceptance({ outputDirectory,
  focus, turns = 8, campaignId = `local-gemma-${randomUUID()}`,
  sequence = 1, afterP0P1FixRef = null, start = startIsolatedLocalPlay,
  launch = (options) => chromium.launch(options), snapshot = gitSnapshot,
  chromiumPath = CHROMIUM, headless = false, provider = null,
  resume = false, signal = null,
  createCompletionObserver = defaultCompletionObserver,
  createExplorer = createGameplayGapExplorer } = {}) {
  if (!outputDirectory || !focus
      || (turns !== null && (!Number.isInteger(turns) || turns < 1))
      || typeof resume !== 'boolean'
      || !chromiumPath) throw new TypeError(
    'outputDirectory, focus, positive turns or completion mode, and Chromium are required.');
  const before = snapshot();
  if (before.dirty !== false) throw new Error(
    'Browser acceptance requires a clean unchanged checkout.');
  const directory = resolve(outputDirectory);
  const logDirectory = join(directory, 'party-logs');
  const reportPath = join(directory, 'campaign.json');
  await mkdir(directory, { recursive: true });
  let report;
  if (resume) {
    report = JSON.parse(await readFile(reportPath, 'utf8'));
    assertResumableReport(report, { before, focus, sequence });
    report.resume_count = Number(report.resume_count ?? 0) + 1;
    report.failure_history = [...(report.failure_history ?? []),
      ...(report.failure ? [report.failure] : [])];
    delete report.failure;
    report.status = 'running';
  } else {
    report = { schema: 'world_knowledge_gameplay_campaign_v1',
      campaign_id: campaignId,
      explorer_ref: `local-gemma-explorer:${campaignId}`,
      scenario_id: 'lower_dvina_trace_v1', mode: 'acceptance_candidate',
      independent_unseen: true, sequence, focus,
      after_p0_p1_fix_ref: afterP0P1FixRef ?? before.head,
      git: before, status: 'running', turns: [], trace_refs: [],
      started_at: new Date().toISOString() };
  }
  const save = () => writeFile(reportPath,
    `${JSON.stringify(report, null, 2)}\n`);
  if (resume) await save();
  else await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`,
    { flag: 'wx' });
  let local; let browser; let settingsDirectory; let completionObserver;
  try {
    settingsDirectory = join(directory, 'runtime');
    await mkdir(settingsDirectory, { recursive: true });
    local = await start({ env: { ...process.env, RUS_DEVELOPER_MODE: 'true',
      LOG_DIRECTORY: logDirectory,
      ...(settingsDirectory ? { RUS_LLM_SETTINGS_PATH:
        join(settingsDirectory, 'settings.json') } : {}) },
      startManagedLlm: provider == null,
      acceptanceDataRoot: join(directory, 'postgres') });
    if (!provider && !local.managedRuntime?.llm) throw new Error(
      'Final acceptance requires the managed local Gemma runtime.');
    const selectedProvider = provider ?? { mode: 'local',
      compatibility: 'openai_compatible', baseUrl: LOCAL_LLM_PRESET.base_url,
      model: LOCAL_LLM_PRESET.model, apiKey: null };
    const identity = provider ? { mode: 'custom',
      provider: 'openai_compatible', base_url: provider.baseUrl,
      model: provider.model, backend: provider.evidence.backend,
      backend_version: provider.evidence.backendVersion,
      runtime_metadata: provider.evidence.runtime,
      hardware_metadata: provider.evidence.hardware }
      : local.managedRuntime.llm.identity;
    const execution = { interface: 'chromium_playwright_dom_only',
      gameplay_transport: 'browser_ui_only',
      browser: { executable: chromiumPath, headless },
      llm_provider: identity,
      ...(!provider ? { local_runtime: identity } : {}),
      giga: local.managedRuntime.giga.identity,
      postgres: { version: local.postgres.version } };
    if (resume && JSON.stringify(report.execution) !== JSON.stringify(execution)) {
      throw new Error('Continuation must use the original provider and runtime identity.');
    }
    report.execution = execution;
    const settings = { providerSnapshot: () => selectedProvider };
    const nextIntent = createExplorer({ focus,
      roleRunner: createProductionLlmRoleRunner({ settings }) });
    browser = await launch({ executablePath: chromiumPath, headless,
      args: ['--no-sandbox', '--no-proxy-server'] });
    const storageState = resume ? pendingBrowserStorage(local.url, report,
      await turnLogEvents(logDirectory, report.party_id)) : undefined;
    const page = await browser.newPage({ storageState });
    page.setDefaultTimeout(120_000);
    await page.goto(local.url);
    await selectProvider(page, selectedProvider);
    if (resume) {
      await page.waitForSelector('[data-continue-party]:not([disabled])');
      await page.click('[data-continue-party]');
    } else {
      await page.waitForSelector('[data-start-new-game]:not([disabled])');
      await page.click('[data-start-new-game]');
      await page.waitForSelector('[data-new-game-screen]');
      await page.click('[data-scenario-id="lower_dvina_trace_v1"]');
    }
    await page.waitForSelector('[data-turn-form] textarea:not([disabled])');
    const partyId = resume ? report.party_id : await page.evaluate(() =>
      globalThis.localStorage.getItem('rus.party_id'));
    if (!partyId) throw new Error('Browser UI did not persist party identity.');
    report.party_id = partyId;
    const entryDom = await playerDom(page);
    if (resume) report.continuations = [...(report.continuations ?? []), {
      resumed_at: new Date().toISOString(), player_dom: entryDom }];
    else report.opening = { player_dom: entryDom };
    completionObserver = await createCompletionObserver(local);
    let terminal = await completionObserver.observe({ partyId,
      playerDom: entryDom });
    if (terminal.terminal) report.terminal = terminal;
    await save();
    if (report.pending_turn) {
      await resumePendingTurn({ report, page, logDirectory, partyId });
      const recovered = await capturePendingTurn({ report, page, identity,
        logDirectory, partyId });
      terminal = await completionObserver.observe({ partyId,
        playerDom: recovered.trace.player_dom_after });
      if (terminal.terminal) report.terminal = terminal;
      await save();
      if (recovered.event.event === 'turn.failed') throw new Error(
        `Browser turn failed: ${recovered.event.error?.code ?? 'unknown error'}`);
    }
    for (let index = report.turns.length;
      !terminal.terminal && (turns === null || index < turns);
      index += 1) {
      if (signal?.aborted) break;
      const domBefore = await playerDom(page);
      const panelsBefore = await observePlayerPanels(page);
      const proposal = await nextIntent({ campaign_id: report.campaign_id,
        turn_index: index, player_dom: domBefore,
        player_panels: panelsBefore,
        previous_intents: report.turns.map((turn) => turn.proposal.raw_text) });
      assertLocalProvider(proposal.explorer_provider, identity,
        'development PLAYER');
      const already = await completedTurnCount(logDirectory, partyId);
      const traceRef = `${report.campaign_id}:trace:${index}`;
      report.pending_turn = { trace_ref: traceRef,
        campaign_id: report.campaign_id, explorer_ref: report.explorer_ref,
        producer_ref: `production-runtime:${before.head}`, proposal,
        player_dom_before: domBefore, player_panels_before: panelsBefore,
        after_count: already };
      await save();
      await page.fill('[data-turn-form] textarea[name="raw_text"]',
        proposal.raw_text);
      await page.click('[data-turn-form] button[type="submit"]');
      const pending = await page.evaluate(() =>
        JSON.parse(globalThis.localStorage.getItem('rus.pending_turn') ?? 'null'));
      if (pending?.party_id === partyId) {
        report.pending_turn.browser_request = pending.request;
        await save();
      }
      await page.waitForSelector(
        '[data-turn-form] textarea:not([disabled]), .error',
        { timeout: 20 * 60_000 });
      const uiError = await page.locator('.error').count()
        ? await page.locator('.error').innerText() : null;
      const captured = await capturePendingTurn({ report, page, identity,
        logDirectory, partyId });
      const { event, trace } = captured;
      terminal = await completionObserver.observe({ partyId,
        playerDom: trace.player_dom_after });
      if (terminal.terminal) report.terminal = terminal;
      await save();
      if (uiError || event.event === 'turn.failed') throw new Error(
        `Browser turn failed: ${uiError ?? event.error?.code ?? 'unknown error'}`);
    }
    report.git_after = snapshot();
    if (report.git_after.head !== before.head || report.git_after.dirty) {
      throw new Error('Candidate changed during browser acceptance.');
    }
    report.status = signal?.aborted && !report.terminal
      ? 'interrupted' : 'captured';
    return report;
  } catch (error) {
    report.status = 'failed'; report.failure = {
      code: error?.code ?? null, message: String(error?.message ?? error) };
    throw Object.assign(error, { report });
  } finally {
    try { await save(); }
    finally {
      await browser?.close().catch(() => {});
      await completionObserver?.close?.().catch(() => {});
      await local?.close().catch(() => {});
    }
  }
}

export function pendingBrowserStorage(url, report, events) {
  const request = report.pending_turn && pendingBrowserRequest(report.pending_turn, events);
  return { cookies: [], origins: [{ origin: new URL(url).origin, localStorage: [
    { name: 'rus.party_id', value: report.party_id },
    ...(request ? [{ name: 'rus.pending_turn', value: JSON.stringify({
      party_id: report.party_id, request }) }] : [])
  ] }] };
}

export function pendingBrowserRequest(pending, events) {
  const terminal = events.filter(({ event }) =>
    ['turn.completed', 'turn.failed'].includes(event));
  if (terminal.length > pending.after_count) return null;
  if (pending.browser_request) return pending.browser_request;
  const lastTerminal = events.findLastIndex(({ event }) =>
    ['turn.completed', 'turn.failed'].includes(event));
  return events.slice(lastTerminal + 1).find(({ event, input }) =>
    event === 'turn.requested' && input?.raw_text === pending.proposal.raw_text)
    ?.input ?? null;
}

export async function resumePendingTurn({ report, page, logDirectory, partyId }) {
  const events = await turnLogEvents(logDirectory, partyId);
  if (events.filter(({ event }) => ['turn.completed', 'turn.failed'].includes(event))
    .length > report.pending_turn.after_count) return;
  // A saved proposal before the UI click has neither request identity nor event.
  // If a request was sent, bootstrap restored its exact identity before Continue.
  await page.fill('[data-turn-form] textarea[name="raw_text"]',
    report.pending_turn.proposal.raw_text);
  await page.click('[data-turn-form] button[type="submit"]');
  await page.waitForSelector('[data-turn-form] textarea:not([disabled]), .error',
    { timeout: 20 * 60_000 });
}

export function phase10TerminalObservation({ state, session, playerDom: dom }) {
  const completion = state?.completion;
  const visible = state?.last_turn?.visible_package;
  const screen = session?.screen;
  const anchor = screen?.current_projection_anchor;
  const narrationShown = typeof screen?.main_prose === 'string'
    && screen.main_prose.length > 0 && String(dom ?? '').includes(screen.main_prose);
  const terminal = completion?.status === 'committed'
    && visible?.change_set_id === completion.change_set_id
    && screen?.screen_status === 'ready'
    && anchor?.package_id === visible?.package_id
    && anchor?.package_digest === visible?.package_digest
    && typeof anchor?.narration_output_digest === 'string'
    && anchor.narration_output_digest.length > 0 && narrationShown;
  return Object.freeze({ terminal,
    completion_status: completion?.status ?? null,
    screen_status: screen?.screen_status ?? null,
    package_id: terminal ? anchor.package_id : null,
    narration_output_digest: terminal ? anchor.narration_output_digest : null,
    narration_shown: narrationShown });
}

async function capturePendingTurn({ report, page, identity, logDirectory,
  partyId }) {
  const pending = report.pending_turn;
  const event = await readNextTurnEvent({ directory: logDirectory, partyId,
    afterCount: pending.after_count });
  const audited = auditEvent(event);
  for (const call of audited.llm.calls.filter(({ role_id }) => role_id)) {
    assertLocalProvider(call, identity, `gameplay role ${call.role_id}`);
  }
  const boundaries = audited.llm.gameplay_traces;
  const trace = { trace_ref: pending.trace_ref,
    campaign_id: pending.campaign_id, explorer_ref: pending.explorer_ref,
    producer_ref: pending.producer_ref, proposal: pending.proposal,
    player_dom_before: pending.player_dom_before,
    player_panels_before: pending.player_panels_before ?? [],
    player_dom_after: await playerDom(page), input: event.input,
    events: [audited], accepted: boundaries.some((item) =>
      item.event === 'owner_commit_completed'),
    retrieved_claim_refs: retrievedClaims(boundaries),
    code_mechanics_refs: codeRefs(pending.trace_ref, audited),
    replay_of_gap_ids: [] };
  trace.commit_status = trace.accepted ? 'committed' : 'not_committed';
  trace.presentation_status = event.event === 'turn.completed'
    ? 'completed' : 'failed';
  report.turns.push(trace); report.trace_refs.push(trace.trace_ref);
  delete report.pending_turn;
  return { event, trace };
}

async function defaultCompletionObserver(local) {
  if (!local?.postgres?.partyUrl) throw new Error(
    'Acceptance completion observer requires the owned party database.');
  const pool = new pg.Pool({ connectionString: local.postgres.partyUrl, max: 1 });
  const repository = createLowerDvinaTracePhase2PostgresRepository({
    partyPool: pool,
    committer: { async commit() { throw new Error('Read-only observer cannot commit.'); } }
  });
  const sessions = createPostgresSessionStore({ pool });
  return Object.freeze({
    async observe({ partyId, playerDom: dom }) {
      const [state, session] = await Promise.all([
        repository.loadPhase2State(partyId), sessions.load(partyId)
      ]);
      return phase10TerminalObservation({ state, session, playerDom: dom });
    },
    close: () => pool.end()
  });
}

function assertResumableReport(report, { before, focus, sequence }) {
  if (report?.schema !== 'world_knowledge_gameplay_campaign_v1'
      || report.mode !== 'acceptance_candidate'
      || report.independent_unseen !== true || !report.party_id
      || !['running', 'interrupted', 'failed', 'captured'].includes(report.status)
      || report.git?.head !== before.head || report.focus !== focus
      || report.sequence !== sequence || report.terminal) {
    throw new Error('Acceptance report is not a resumable continuation.');
  }
}

function startIsolatedLocalPlay({ acceptanceDataRoot, ...options }) {
  return startLocalPlay({ ...options,
    ensurePostgres: (input) => ensureLocalPostgres({ ...input,
      dataRoot: acceptanceDataRoot }) });
}

export async function playerDom(page) {
  return page.locator('[data-game-root]').innerText();
}

async function selectProvider(page, provider) {
  await page.click('[data-llm-settings-open]');
  await page.waitForFunction(() => Boolean(document.querySelector(
    '[data-llm-settings-form] input[name="model"]')?.value));
  const mode = page.locator(
    `[data-llm-settings-form] input[name="mode"][value="${provider.mode}"]`);
  await mode.check();
  if (provider.mode === 'custom') {
    await page.fill('[data-llm-settings-form] input[name="base_url"]',
      provider.baseUrl);
    await page.fill('[data-llm-settings-form] input[name="model"]',
      provider.model);
    if (provider.apiKey) await page.fill(
      '[data-llm-settings-form] input[name="api_key"]', provider.apiKey);
  }
  await page.click(
    '[data-llm-settings-form] button[name="llm_action"][value="apply"]');
  await page.waitForFunction(() => document.querySelector(
    '.llm-settings-message')?.textContent?.includes('Настройки применены.'),
  undefined, { timeout: 20 * 60_000 });
  await page.click('[data-overlay-close]');
}

async function completedTurnCount(directory, partyId) {
  return (await turnEvents(directory, partyId)).length;
}
async function readNextTurnEvent({ directory, partyId, afterCount }) {
  for (let index = 0; index < 1_200; index += 1) {
    const events = await turnEvents(directory, partyId);
    if (events.length > afterCount) return events[afterCount];
    await delay(100);
  }
  throw new Error('Private browser turn trace was not flushed.');
}
async function turnEvents(directory, partyId) {
  return (await turnLogEvents(directory, partyId)).filter((event) =>
    ['turn.completed', 'turn.failed'].includes(event.event));
}
async function turnLogEvents(directory, partyId) {
  const path = join(directory,
    `${partyId.replace(/[^A-Za-z0-9._-]+/gu, '_')}.jsonl`);
  const content = await readFile(path, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return ''; throw error;
  });
  return content.split('\n').slice(0, -1).filter(Boolean).map(JSON.parse);
}
function assertLocalProvider(record, identity, label) {
  if (record?.provider !== 'openai_compatible'
      || record?.model !== identity.model) throw new Error(
    `${label} did not use the selected acceptance provider.`);
}

export async function acceptanceProviderFromEnv(env = process.env) {
  const baseUrl = String(env.RUS_ACCEPTANCE_LLM_BASE_URL ?? '').trim();
  const model = String(env.RUS_ACCEPTANCE_LLM_MODEL ?? '').trim();
  const keyFile = String(env.RUS_ACCEPTANCE_LLM_API_KEY_FILE ?? '').trim();
  const backend = String(env.RUS_ACCEPTANCE_LLM_BACKEND ?? '').trim();
  const backendVersion = String(
    env.RUS_ACCEPTANCE_LLM_BACKEND_VERSION ?? '').trim();
  const runtime = String(env.RUS_ACCEPTANCE_LLM_RUNTIME_METADATA ?? '').trim();
  const hardware = String(env.RUS_ACCEPTANCE_LLM_HARDWARE_METADATA ?? '').trim();
  if (![baseUrl, model, keyFile, backend, backendVersion, runtime, hardware]
    .some(Boolean)) return null;
  if (!baseUrl || !model) throw new Error(
    'RUS_ACCEPTANCE_LLM_BASE_URL and RUS_ACCEPTANCE_LLM_MODEL are required together.');
  if (!backend || !backendVersion || !runtime || !hardware) throw new Error(
    'External acceptance requires backend version, runtime and hardware metadata.');
  const apiKey = keyFile ? (await readFile(keyFile, 'utf8')).trim() : null;
  return Object.freeze({ mode: 'custom', compatibility: 'openai_compatible',
    baseUrl, model, apiKey: apiKey || null, evidence: Object.freeze({
      backend, backendVersion, runtime, hardware }) });
}
function retrievedClaims(boundaries) {
  return [...new Set(boundaries
    .filter((item) => item.event === 'world_knowledge_resolved')
    .flatMap((item) => {
      const wk = item.consumer_request?.world_knowledge;
      return [...(wk?.hard_constraints ?? []), ...(wk?.facts ?? [])]
        .map((fact) => fact.claim_ref).filter(Boolean);
    }))];
}
function codeRefs(traceRef, event) {
  return [...(event.error?.code ? [`${traceRef}#/events/0/error`] : []),
    ...event.llm.gameplay_traces.flatMap((item, index) =>
      item.event === 'owner_commit_completed'
        ? [`${traceRef}#/events/0/llm/gameplay_traces/${index}/result`] : [])];
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [outputDirectory, focus, count = '8', sequence = '1'] =
    process.argv.slice(2);
  if (!outputDirectory || !focus) throw new Error(
    'Usage: npm run gameplay:acceptance:local -- <output-directory> <focus> [turn-count] [sequence]');
  const controller = new AbortController();
  for (const event of ['SIGINT', 'SIGTERM']) process.once(event, () =>
    controller.abort(event));
  const report = await runLocalGemmaBrowserAcceptance({ outputDirectory,
    focus, turns: count === 'completion' ? null : Number(count),
    sequence: Number(sequence), signal: controller.signal,
    resume: process.env.RUS_ACCEPTANCE_RESUME === 'true',
    provider: await acceptanceProviderFromEnv() });
  console.log(JSON.stringify({ campaign_id: report.campaign_id,
    status: report.status, turns: report.turns.length }));
}
