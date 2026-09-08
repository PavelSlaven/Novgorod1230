import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

import { chromium } from 'playwright-core';
import { createProductionLlmRoleRunner } from
  '../../apps/game-server/src/infrastructure/provider/deepseek.js';
import { LOCAL_LLM_PRESET } from
  '../../apps/game-server/src/runtime/llm-settings.js';
import { auditEvent, createGameplayGapExplorer, gitSnapshot } from
  './gameplay-gap-campaign.mjs';
import { startLocalPlay } from './local-play.js';

const CHROMIUM = [process.env.RUS_CHROMIUM_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']
  .find((candidate) => candidate && existsSync(candidate));

export async function runLocalGemmaBrowserAcceptance({ outputDirectory,
  focus, turns = 8, campaignId = `local-gemma-${randomUUID()}`,
  sequence = 1, afterP0P1FixRef = null, start = startLocalPlay,
  launch = (options) => chromium.launch(options), snapshot = gitSnapshot,
  chromiumPath = CHROMIUM, headless = false, provider = null } = {}) {
  if (!outputDirectory || !focus || !Number.isInteger(turns) || turns < 1
      || !chromiumPath) throw new TypeError(
    'outputDirectory, focus, positive turns and Chromium are required.');
  const before = snapshot();
  if (before.dirty !== false) throw new Error(
    'Local Gemma acceptance requires a clean unchanged checkout.');
  const directory = resolve(outputDirectory);
  const logDirectory = join(directory, 'party-logs');
  const reportPath = join(directory, 'campaign.json');
  await mkdir(directory, { recursive: true });
  const report = { schema: 'world_knowledge_gameplay_campaign_v1',
    campaign_id: campaignId, explorer_ref: `local-gemma-explorer:${campaignId}`,
    scenario_id: 'lower_dvina_trace_v1', mode: 'acceptance_candidate',
    independent_unseen: true, sequence,
    after_p0_p1_fix_ref: afterP0P1FixRef ?? before.head,
    git: before, status: 'running', turns: [], trace_refs: [],
    started_at: new Date().toISOString() };
  const save = () => writeFile(reportPath,
    `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`,
    { flag: 'wx' });
  let local; let browser; let settingsDirectory;
  try {
    if (provider) settingsDirectory = await mkdtemp(join(tmpdir(),
      'novgorod-acceptance-llm-'));
    local = await start({ env: { ...process.env, RUS_DEVELOPER_MODE: 'true',
      LOG_DIRECTORY: logDirectory,
      ...(settingsDirectory ? { RUS_LLM_SETTINGS_PATH:
        join(settingsDirectory, 'settings.json') } : {}) },
      startManagedLlm: provider == null });
    if (!provider && !local.managedRuntime?.llm) throw new Error(
      'Final acceptance requires the managed local Gemma runtime.');
    const selectedProvider = provider ?? { mode: 'local',
      compatibility: 'openai_compatible', baseUrl: LOCAL_LLM_PRESET.base_url,
      model: LOCAL_LLM_PRESET.model, apiKey: null };
    const identity = provider ? { mode: 'custom',
      provider: 'openai_compatible', base_url: provider.baseUrl,
      model: provider.model } : local.managedRuntime.llm.identity;
    report.execution = { interface: 'chromium_playwright_dom_only',
      gameplay_transport: 'browser_ui_only',
      browser: { executable: chromiumPath, headless },
      llm_provider: identity,
      ...(!provider ? { local_runtime: identity } : {}),
      giga: local.managedRuntime.giga.identity,
      postgres: { version: local.postgres.version } };
    const settings = { providerSnapshot: () => selectedProvider };
    const nextIntent = createGameplayGapExplorer({ focus,
      roleRunner: createProductionLlmRoleRunner({ settings }) });
    browser = await launch({ executablePath: chromiumPath, headless,
      args: ['--no-sandbox', '--no-proxy-server'] });
    const page = await browser.newPage();
    page.setDefaultTimeout(120_000);
    await page.goto(local.url);
    await selectProvider(page, selectedProvider);
    await page.waitForSelector('[data-start-new-game]:not([disabled])');
    await page.click('[data-start-new-game]');
    await page.waitForSelector('[data-new-game-screen]');
    await page.click('[data-scenario-id="lower_dvina_trace_v1"]');
    await page.waitForSelector('[data-turn-form] textarea:not([disabled])');
    const partyId = await page.evaluate(() =>
      globalThis.localStorage.getItem('rus.party_id'));
    if (!partyId) throw new Error('Browser UI did not persist party identity.');
    report.party_id = partyId;
    for (let index = 0; index < turns; index += 1) {
      const domBefore = await playerDom(page);
      const proposal = await nextIntent({ campaign_id: campaignId,
        turn_index: index, player_dom: domBefore,
        previous_intents: report.turns.map((turn) => turn.proposal.raw_text) });
      assertLocalProvider(proposal.explorer_provider, identity,
        'development PLAYER');
      const already = await completedTurnCount(logDirectory, partyId);
      await page.fill('[data-turn-form] textarea[name="raw_text"]',
        proposal.raw_text);
      await page.click('[data-turn-form] button[type="submit"]');
      await page.waitForSelector(
        '[data-turn-form] textarea:not([disabled]), .error');
      if (await page.locator('.error').count()) throw new Error(
        `Browser turn failed: ${await page.locator('.error').innerText()}`);
      const event = await readNextTurnEvent({ directory: logDirectory,
        partyId, afterCount: already });
      const audited = auditEvent(event);
      for (const call of audited.llm.calls.filter(({ role_id }) => role_id)) {
        assertLocalProvider(call, identity, `gameplay role ${call.role_id}`);
      }
      const traceRef = `${campaignId}:trace:${index}`;
      const boundaries = audited.llm.gameplay_traces;
      const trace = { trace_ref: traceRef, campaign_id: campaignId,
        explorer_ref: report.explorer_ref,
        producer_ref: `production-runtime:${before.head}`, proposal,
        player_dom_before: domBefore, player_dom_after: await playerDom(page),
        input: event.input, events: [audited],
        accepted: boundaries.some((item) =>
          item.event === 'owner_commit_completed'),
        retrieved_claim_refs: retrievedClaims(boundaries),
        code_mechanics_refs: codeRefs(traceRef, audited),
        replay_of_gap_ids: [] };
      trace.commit_status = trace.accepted ? 'committed' : 'not_committed';
      trace.presentation_status = event.event === 'turn.completed'
        ? 'completed' : 'failed';
      report.turns.push(trace); report.trace_refs.push(traceRef);
      await save();
    }
    report.git_after = snapshot();
    if (report.git_after.head !== before.head || report.git_after.dirty) {
      throw new Error('Candidate changed during local Gemma acceptance.');
    }
    report.status = 'captured';
    return report;
  } catch (error) {
    report.status = 'failed'; report.failure = {
      code: error?.code ?? null, message: String(error?.message ?? error) };
    throw Object.assign(error, { report });
  } finally {
    try { await save(); }
    finally {
      await browser?.close().catch(() => {});
      await local?.close().catch(() => {});
      if (settingsDirectory) await rm(settingsDirectory,
        { recursive: true, force: true });
    }
  }
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
    '.llm-settings-message')?.textContent?.includes('Настройки применены.'));
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
  const path = join(directory,
    `${partyId.replace(/[^A-Za-z0-9._-]+/gu, '_')}.jsonl`);
  const content = await readFile(path, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return ''; throw error;
  });
  return content.split('\n').slice(0, -1).filter(Boolean).map(JSON.parse)
    .filter((event) => ['turn.completed', 'turn.failed'].includes(event.event));
}
function assertLocalProvider(record, identity, label) {
  if (record?.provider !== 'openai_compatible'
      || record?.model !== identity.model) throw new Error(
    `${label} did not use the selected Gemma provider.`);
}

export async function acceptanceProviderFromEnv(env = process.env) {
  const baseUrl = String(env.RUS_ACCEPTANCE_LLM_BASE_URL ?? '').trim();
  const model = String(env.RUS_ACCEPTANCE_LLM_MODEL ?? '').trim();
  const keyFile = String(env.RUS_ACCEPTANCE_LLM_API_KEY_FILE ?? '').trim();
  if (!baseUrl && !model && !keyFile) return null;
  if (!baseUrl || !model) throw new Error(
    'RUS_ACCEPTANCE_LLM_BASE_URL and RUS_ACCEPTANCE_LLM_MODEL are required together.');
  const apiKey = keyFile ? (await readFile(keyFile, 'utf8')).trim() : null;
  return Object.freeze({ mode: 'custom', compatibility: 'openai_compatible',
    baseUrl, model, apiKey: apiKey || null });
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
  const report = await runLocalGemmaBrowserAcceptance({ outputDirectory,
    focus, turns: Number(count), sequence: Number(sequence),
    provider: await acceptanceProviderFromEnv() });
  console.log(JSON.stringify({ campaign_id: report.campaign_id,
    status: report.status, turns: report.turns.length }));
}
