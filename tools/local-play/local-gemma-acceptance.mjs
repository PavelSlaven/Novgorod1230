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
import { createPartyLog } from
  '../../apps/game-server/src/infrastructure/filesystem/party-log.js';
import { LOCAL_LLM_PRESET } from
  '../../apps/game-server/src/runtime/llm-settings.js';
import { validateFactualTurnDeliveryScreen } from '@rus/presentation';
import { auditEvent, createGameplayGapExplorer, gitSnapshot, recordNarrationQuality } from
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
  scenarioId = 'lower_dvina_trace_v1',
  sequence = 1, afterP0P1FixRef = null, start = startIsolatedLocalPlay,
  launch = (options) => chromium.launch(options), snapshot = gitSnapshot,
  chromiumPath = CHROMIUM, headless = false, provider = null,
  resume = false, signal = null,
  createCompletionObserver = defaultCompletionObserver,
  createExplorer = createGameplayGapExplorer } = {}) {
  if (!outputDirectory || !focus || !/^[a-z0-9_]+$/u.test(scenarioId)
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
    reconcileNarrationQuality(report);
  } else {
    report = { schema: 'world_knowledge_gameplay_campaign_v1',
      campaign_id: campaignId,
      explorer_ref: `local-gemma-explorer:${campaignId}`,
      scenario_id: scenarioId, mode: 'acceptance_candidate',
      independent_unseen: true, sequence, focus,
      after_p0_p1_fix_ref: afterP0P1FixRef ?? before.head,
      git: before, status: 'running', turns: [], trace_refs: [], findings: [],
      narration_quality_pass: true,
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
    let renderedScreenReady = false;
    if (resume) {
      const events = await turnLogEvents(logDirectory, report.party_id);
      const pending = report.pending_turn
        ? pendingRequestState(report.pending_turn, events) : null;
      const afterEventCount = events.length;
      await page.waitForSelector('[data-continue-party]:not([disabled])');
      await page.click('[data-continue-party]');
      await page.waitForSelector('[data-turn-form] textarea:not([disabled])');
      if (!pending?.request && !pending?.terminal) {
        await waitForNewScreenRead({ directory: logDirectory,
          partyId: report.party_id, afterEventCount });
        renderedScreenReady = true;
      }
    } else {
      await page.waitForSelector('[data-start-new-game]:not([disabled])');
      await page.click('[data-start-new-game]');
      await page.waitForSelector('[data-new-game-screen]');
      await page.click(`[data-scenario-id="${scenarioId}"]`);
    }
    await page.waitForSelector('[data-turn-form] textarea:not([disabled])');
    const partyId = resume ? report.party_id : await page.evaluate(() =>
      globalThis.localStorage.getItem('rus.party_id'));
    if (!partyId) throw new Error('Browser UI did not persist party identity.');
    report.party_id = partyId;
    if (!resume) {
      await refreshRenderedScreen({ page, directory: logDirectory, partyId });
      renderedScreenReady = true;
    }
    const entryDom = await playerDom(page);
    if (resume) report.continuations = [...(report.continuations ?? []), {
      resumed_at: new Date().toISOString(), player_dom: entryDom }];
    else report.opening = { player_dom: entryDom };
    completionObserver = await createCompletionObserver(local);
    let terminal = await completionObserver.observe({ partyId,
      playerDom: entryDom, renderedScreenSchema: await renderedScreenSchema(page) });
    if (terminal.terminal) report.terminal = terminal;
    await save();
    if (report.pending_turn) {
      await resumePendingTurn({ report, page, logDirectory, partyId });
      const recovered = await capturePendingTurn({ report, page, identity,
        logDirectory, partyId });
      terminal = await completionObserver.observe({ partyId,
        playerDom: recovered.trace.player_dom_after,
        renderedScreenSchema: await renderedScreenSchema(page) });
      if (terminal.terminal) report.terminal = terminal;
      await save();
      if (recovered.event.event === 'turn.failed') throw new Error(
        `Browser turn failed: ${recovered.event.error?.code ?? 'unknown error'}`);
      renderedScreenReady = false;
    }
    for (let index = report.turns.length;
      !terminal.terminal && (turns === null || index < turns);
      index += 1) {
      if (signal?.aborted) break;
      if (!renderedScreenReady) {
        await refreshRenderedScreen({ page, directory: logDirectory, partyId });
        renderedScreenReady = true;
      }
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
        playerDom: trace.player_dom_after,
        renderedScreenSchema: await renderedScreenSchema(page) });
      if (terminal.terminal) report.terminal = terminal;
      await save();
      if (uiError || event.event === 'turn.failed') throw new Error(
        `Browser turn failed: ${uiError ?? event.error?.code ?? 'unknown error'}`);
      renderedScreenReady = false;
    }
    report.git_after = snapshot();
    if (report.git_after.head !== before.head || report.git_after.dirty) {
      throw new Error('Candidate changed during browser acceptance.');
    }
    report.status = report.narration_quality_pass === false ? 'quality_failed'
      : signal?.aborted && !report.terminal ? 'interrupted' : 'captured';
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
  return pendingRequestState(pending, events).request;
}

export async function resumePendingTurn({ report, page, logDirectory, partyId }) {
  const events = await turnLogEvents(logDirectory, partyId);
  const state = pendingRequestState(report.pending_turn, events);
  if (state.terminal || state.request) return;
  // A saved proposal before the UI click has neither request identity nor event.
  // If a request was sent, bootstrap restored its exact identity before Continue.
  await page.fill('[data-turn-form] textarea[name="raw_text"]',
    report.pending_turn.proposal.raw_text);
  await page.click('[data-turn-form] button[type="submit"]');
  await page.waitForSelector('[data-turn-form] textarea:not([disabled]), .error',
    { timeout: 20 * 60_000 });
}

export function phase10TerminalObservation({ partyId, state, session, playerDom: dom,
  renderedScreenSchema = null }) {
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
  const factualValidation = screen?.schema === 'factual_turn_delivery_screen'
    ? validateFactualTurnDeliveryScreen(screen) : { ok: false };
  const factualValues = [screen?.visible_context?.visible_scene,
    ...(screen?.visible_changes ?? []), ...(screen?.uncertainties ?? [])]
    .filter((value) => typeof value === 'string' && value.trim());
  const factualShown = String(dom ?? '').includes('Текущий момент')
    && (factualValues.length === 0 || factualValues.some((value) =>
      String(dom ?? '').includes(value)));
  const factual = completion?.status === 'committed'
    && visible?.change_set_id === completion.change_set_id
    && factualValidation.ok
    && screen.party_id === partyId
    && screen.package_id === visible?.package_id
    && renderedScreenSchema === 'factual_turn_delivery_screen'
    && factualShown;
  return Object.freeze({ terminal: terminal || factual,
    completion_status: completion?.status ?? null,
    screen_status: screen?.screen_status ?? null,
    package_id: terminal ? anchor.package_id : factual ? screen.package_id : null,
    narration_output_digest: terminal ? anchor.narration_output_digest : null,
    narration_shown: narrationShown,
    factual_shown: factualShown });
}

async function capturePendingTurn({ report, page, identity, logDirectory,
  partyId }) {
  const pending = report.pending_turn;
  const { event, events, terminalIndex } = await readNextTurnEvent({ directory: logDirectory, partyId,
    afterCount: pending.after_count });
  if (pending.browser_request && !sameRequest(pending.browser_request, event.input)) {
    throw new Error('Browser request does not match terminal turn event.');
  }
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
  recordNarrationQuality({ report, trace, partyId, event, eventIndex: 0 });
  const screenshot = await captureRenderedScreenshot(page, logDirectory,
    partyId, event.input?.request_id).catch(() => null);
  await appendRenderedUiEvidence({ directory: logDirectory, partyId, event,
    events, terminalIndex, before: pending.player_dom_before,
    after: trace.player_dom_after, screenshot,
  });
  report.turns.push(trace); report.trace_refs.push(trace.trace_ref);
  delete report.pending_turn;
  return { event, trace };
}

export async function appendRenderedUiEvidence({ directory, partyId, event,
  events, terminalIndex, before = null, after = null, screenshot = null,
  partyLog = createPartyLog({ directory }) } = {}) {
  const terminal = event?.input ?? null;
  if (!Array.isArray(events) || !Number.isInteger(terminalIndex)
      || events[terminalIndex]?.event !== event?.event
      || !sameRequest(events[terminalIndex]?.input, terminal)) {
    throw new Error('Rendered UI evidence requires its terminal causal event.');
  }
  const actual = matchingTurnRequest(events, event, terminalIndex);
  if (!sameRequest(actual, terminal)) {
    throw new Error('Browser request does not match terminal turn event.');
  }
  if (!actual?.request_id || !actual?.idempotency_key) {
    throw new Error('Rendered UI evidence requires browser request identity.');
  }
  await partyLog.append(partyId, { event: 'ui.rendered', input: actual,
    terminal_event: event.event,
    public_dto_before: causalPublicScreen(events, terminalIndex, actual),
    public_dto_after: event.output?.screen ?? event.public_screen ?? event.output ?? null,
    player_dom_before: before, player_dom_after: after,
    screenshot: screenshot ?? null });
}

function pendingRequestState(pending, events) {
  const boundary = terminalIndexes(events)[pending.after_count - 1] ?? -1;
  const candidates = events.slice(boundary + 1).filter(({ event, input }) =>
    event === 'turn.requested' && input?.raw_text === pending.proposal.raw_text);
  if (!pending.browser_request && candidates.length > 1) {
    throw new Error('Browser pending turn has ambiguous same-text requests.');
  }
  const request = pending.browser_request ?? candidates[0]?.input ?? null;
  const terminal = request && events.slice(boundary + 1).some(({ event, input }) =>
    isTerminal(event) && sameRequest(input, request));
  return { request: terminal ? null : request, terminal };
}

function matchingTurnRequest(events, terminal, terminalIndex) {
  if (!terminal?.input?.request_id || !terminal.input.idempotency_key) {
    throw new Error('Terminal turn event has no request identity.');
  }
  const previousTerminal = terminalIndexes(events)
    .findLast((index) => index < terminalIndex) ?? -1;
  const requests = events.slice(previousTerminal + 1, terminalIndex).filter(({ event, input }) =>
    event === 'turn.requested' && sameRequest(input, terminal.input));
  if (requests.length !== 1) {
    throw new Error('Terminal turn event has no unique matching requested event.');
  }
  return requests[0].input;
}

function causalPublicScreen(events, terminalIndex, request) {
  const previousTerminal = terminalIndexes(events)
    .findLast((index) => index < terminalIndex) ?? -1;
  const requestIndex = events.findIndex((event, index) => index > previousTerminal
    && index < terminalIndex && event.event === 'turn.requested'
    && sameRequest(event.input, request));
  if (requestIndex < 0) throw new Error('Terminal turn event is outside request causal window.');
  const screen = events.slice(previousTerminal + 1, requestIndex).findLast((event) =>
    event.event === 'screen.read')?.output?.screen;
  if (!screen) throw new Error('Rendered UI evidence has no preceding causal screen read.');
  return screen;
}

function terminalIndexes(events) {
  return events.flatMap((event, index) => isTerminal(event.event) ? [index] : []);
}

function isTerminal(event) {
  return event === 'turn.completed' || event === 'turn.failed';
}

function sameRequest(left, right) {
  return left?.request_id === right?.request_id
    && left?.idempotency_key === right?.idempotency_key;
}

async function captureRenderedScreenshot(page, directory, partyId, requestId) {
  if (typeof page?.screenshot !== 'function') return null;
  const path = join(directory, 'ui-screenshots',
    `${safeFilePart(partyId)}-${safeFilePart(requestId ?? 'unknown')}.png`);
  await mkdir(join(directory, 'ui-screenshots'), { recursive: true });
  await page.screenshot({ path });
  return path;
}

function safeFilePart(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/gu, '_');
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
    async observe({ partyId, playerDom: dom, renderedScreenSchema }) {
      const [state, session] = await Promise.all([
        repository.loadPhase2State(partyId), sessions.load(partyId)
      ]);
      return phase10TerminalObservation({ partyId, state, session, playerDom: dom,
        renderedScreenSchema });
    },
    close: () => pool.end()
  });
}

function assertResumableReport(report, { before, focus, sequence }) {
  if (report?.schema !== 'world_knowledge_gameplay_campaign_v1'
      || report.mode !== 'acceptance_candidate'
      || report.independent_unseen !== true || !report.party_id
      || !['running', 'interrupted', 'failed', 'captured', 'quality_failed'].includes(report.status)
      || report.git?.head !== before.head || report.focus !== focus
      || report.sequence !== sequence || report.terminal) {
    throw new Error('Acceptance report is not a resumable continuation.');
  }
}

function reconcileNarrationQuality(report) {
  report.findings ??= [];
  report.narration_quality_pass = true;
  for (const trace of report.turns ?? []) {
    const eventIndex = trace.events?.findLastIndex(({ event }) => event === 'turn.completed') ?? -1;
    if (eventIndex >= 0) recordNarrationQuality({ report, trace,
      partyId: report.party_id, event: trace.events[eventIndex], eventIndex });
  }
}

export function acceptanceExitCode(report) {
  return report?.status === 'quality_failed' ? 1 : 0;
}

function startIsolatedLocalPlay({ acceptanceDataRoot, ...options }) {
  return startLocalPlay({ ...options,
    ensurePostgres: (input) => ensureLocalPostgres({ ...input,
      dataRoot: acceptanceDataRoot }) });
}

export async function playerDom(page) {
  return page.locator('[data-game-root]').innerText();
}

async function renderedScreenSchema(page) {
  const screen = page?.locator?.('main[data-screen-schema]');
  return typeof screen?.getAttribute === 'function'
    ? screen.getAttribute('data-screen-schema').catch(() => null) : null;
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
async function refreshRenderedScreen({ page, directory, partyId }) {
  const afterEventCount = (await turnLogEvents(directory, partyId)).length;
  await page.reload();
  await page.waitForSelector('[data-continue-party]:not([disabled])');
  await page.click('[data-continue-party]');
  await page.waitForSelector('[data-turn-form] textarea:not([disabled])');
  await waitForNewScreenRead({ directory, partyId, afterEventCount });
}
async function waitForNewScreenRead({ directory, partyId, afterEventCount }) {
  for (let index = 0; index < 1_200; index += 1) {
    const events = await turnLogEvents(directory, partyId);
    const read = events.slice(afterEventCount).find(({ event, output }) =>
      event === 'screen.read' && output?.screen);
    if (read) return read;
    await delay(100);
  }
  throw new Error('Browser screen read was not flushed.');
}
async function readNextTurnEvent({ directory, partyId, afterCount }) {
  for (let index = 0; index < 1_200; index += 1) {
    const events = await turnLogEvents(directory, partyId);
    const terminalIndex = terminalIndexes(events)[afterCount];
    if (terminalIndex !== undefined) return { event: events[terminalIndex], events, terminalIndex };
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
      const wk = item.core_result;
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
    scenarioId: process.env.RUS_ACCEPTANCE_SCENARIO_ID
      || 'lower_dvina_trace_v1',
    sequence: Number(sequence), signal: controller.signal,
    resume: process.env.RUS_ACCEPTANCE_RESUME === 'true',
    provider: await acceptanceProviderFromEnv() });
  console.log(JSON.stringify({ campaign_id: report.campaign_id,
    status: report.status, turns: report.turns.length }));
  process.exitCode = acceptanceExitCode(report);
}
