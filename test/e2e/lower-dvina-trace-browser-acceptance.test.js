import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

import { chromium } from 'playwright-core';

import { startLowerDvinaProductionAcceptanceEnv } from
  '../helpers/lower-dvina-production-acceptance-env.js';
import { createCanonicalPhase11LlmResponder, PHASE11_CANONICAL_TURNS } from
  '../helpers/lower-dvina-phase-11-llm.js';

const CHROME_PATH = [
  process.env.RUS_CHROMIUM_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome'
].find((candidate) => candidate && existsSync(candidate));
const PHASE2_GENERAL_LOOK = ['look', 'Осмотреться'];

test('Chromium restores a saved party through production-v13 and PostgreSQL', {
  timeout: 360_000,
  skip: !CHROME_PATH && 'Chrome or Chromium executable not found.'
}, async (context) => {
  const environment = await startLowerDvinaProductionAcceptanceEnv({
    llmRespond: createCanonicalPhase11LlmResponder()
  });
  context.after(() => environment.close());
  const health = await fetch(`${environment.baseUrl}/api/v1/health`);
  assert.equal(health.ok, true);
  assert.equal((await health.json()).data.release_id,
    'spatial-v3-production-v13');
  const browser = await chromium.launch({ executablePath: CHROME_PATH,
    headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  context.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(120_000);
  const rawResponses = [];
  const turnByText = new Map(PHASE11_CANONICAL_TURNS.map(
    ([id, text]) => [text, id]));
  turnByText.set(PHASE2_GENERAL_LOOK[1], PHASE2_GENERAL_LOOK[0]);
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/v1/')) {
      await route.continue();
      return;
    }
    let outgoing = request.postData();
    if (request.method() === 'POST' && /\/turns$/u.test(url.pathname)
        && outgoing) {
      const parsed = JSON.parse(outgoing);
      const label = turnByText.get(parsed.raw_text);
      Object.assign(parsed, environment.requestIdentity(
        decodeURIComponent(url.pathname.split('/')[4]), label));
      outgoing = JSON.stringify(parsed);
    }
    const response = await route.fetch(outgoing === null
      ? { timeout: 120_000 }
      : { postData: outgoing, timeout: 120_000 });
    const body = await response.body();
    rawResponses.push(body.toString('utf8'));
    await route.fulfill({ response, body });
  });
  await page.goto(environment.baseUrl);
  await page.waitForSelector('[data-start-new-game]');
  await page.click('[data-start-new-game]');
  await page.waitForSelector('[data-new-game-screen]');
  await page.click('[data-scenario-id="lower_dvina_trace_v1"]');
  await page.waitForSelector('[data-turn-form]');
  await page.waitForSelector('[data-landscape]');
  const openingLandscapeClass = await page.getAttribute(
    '[data-landscape]', 'class'
  );
  assertLandscapeModifiers(openingLandscapeClass);
  assertPublicText(await page.textContent('body'));
  let partyId = rawResponses.map(parseJson).find(
    (value) => value?.data?.screen?.scenario_id === 'lower_dvina_trace_v1')
    ?.data?.party_id;
  assert.ok(partyId);
  let hiddenTruth = await actualHiddenTruthValues(
    environment.partyPool, partyId);
  assertValuesAbsent([...rawResponses, await page.textContent('body')],
    [hiddenTruth.culpritRef], 'pre-disclosure public HTTP/DOM');

  await submitThroughBrowser(page, PHASE2_GENERAL_LOOK[1], rawResponses);
  const phase2Screen = [...rawResponses].reverse().map(parseJson).find(
    (value) => value?.data?.screen?.turn_id
  )?.data?.screen;
  assert.ok(phase2Screen);
  assert.deepEqual(
    phase2Screen.visible_context.sensory_details.filter((detail) =>
      ['cold', 'wet', 'exposed'].includes(detail)).sort(),
    []
  );
  assert.equal(phase2Screen.visible_context.environment, undefined,
    'the turn must not create new environment state or knowledge');
  const phase2Landscape = await page.locator('[data-landscape]').evaluate(
    (element) => element.outerHTML
  );
  assert.doesNotMatch(phase2Landscape,
    /landscape--(?:cold|wet|exposed)/u);
  assert.doesNotMatch(phase2Landscape,
    /road_bag_missing|blue_wool_fragment/u);
  assertValuesAbsent([JSON.stringify(phase2Screen), phase2Landscape],
    [hiddenTruth.culpritRef, ...hiddenTruth.alwaysForbidden],
    'post-turn landscape/public screen');
  const phase2Calls = environment.llm.requests.length;
  await page.goto(environment.baseUrl);
  await page.waitForSelector('[data-continue-party]');
  await page.click('[data-continue-party]');
  await page.waitForSelector('[data-turn-form]');
  const reloadedPhase2Landscape = await page.locator(
    '[data-landscape]'
  ).evaluate((element) => element.outerHTML);
  assert.equal(reloadedPhase2Landscape, phase2Landscape,
    'reload must reproduce the same deterministic landscape');
  assert.equal(environment.llm.requests.length, phase2Calls,
    'reloading the Phase 2 screen must not invoke an LLM');

  const continuityPartyId = partyId;
  await page.click('[data-return-start]');
  await page.waitForSelector('[data-start-new-game]');
  await page.click('[data-start-new-game]');
  await page.waitForSelector('[data-new-game-screen]');
  await page.click('[data-scenario-id="lower_dvina_trace_v1"]');
  await page.waitForSelector('[data-turn-form]');
  partyId = [...rawResponses].reverse().map(parseJson).find(
    (value) => value?.data?.party_id
      && value.data.party_id !== continuityPartyId
  )?.data?.party_id;
  assert.ok(partyId);
  hiddenTruth = await actualHiddenTruthValues(environment.partyPool, partyId);
  assertValuesAbsent([...rawResponses, await page.textContent('body')],
    [hiddenTruth.culpritRef], 'canonical pre-disclosure public HTTP/DOM');

  for (const [id, text] of PHASE11_CANONICAL_TURNS) {
    await submitThroughBrowser(page, text, rawResponses);
    if (id === 'clue') {
      await page.waitForSelector('[data-conversation-portrait]');
      assert.match(await page.textContent('[data-conversation-portrait]'),
        /Еремей/u);
      assert.equal(await page.locator(
        '[data-conversation-portrait] svg'
      ).count(), 0, 'complete persisted appearance must not use SVG fallback');
      assert.equal(await page.locator(
        '[data-conversation-portrait-canvas]'
      ).count(), 1, 'visible committed appearance must render procedurally');
      const portrait = await page.locator(
        '[data-conversation-portrait]'
      ).evaluate((element) => element.outerHTML);
      const calls = environment.llm.requests.length;
      await page.goto(environment.baseUrl);
      await page.waitForSelector('[data-continue-party]');
      await page.click('[data-continue-party]');
      await page.waitForSelector('[data-turn-form]');
      assert.equal(await page.locator(
        '[data-conversation-portrait]'
      ).evaluate((element) => element.outerHTML), portrait);
      assert.equal(environment.llm.requests.length, calls,
        'reloading the conversation screen must not invoke an LLM');
    }
    if (id === 'route') {
      assert.equal(await page.locator(
        '[data-conversation-portrait]'
      ).count(), 0, 'moving away must remove the old interlocutor portrait');
    }
    if (id === 'rest') {
      const calls = environment.llm.requests.length;
      await environment.restartRoot();
      const restartedHealth = await fetch(
        `${environment.baseUrl}/api/v1/health`
      );
      assert.equal(restartedHealth.ok, true);
      assert.equal((await restartedHealth.json()).data.release_id,
        'spatial-v3-production-v13');
      await page.goto(environment.baseUrl);
      await page.waitForSelector('[data-continue-party]');
      const restoredScreen = page.waitForResponse((candidate) =>
        candidate.request().method() === 'GET'
          && new URL(candidate.url()).pathname ===
            `/api/v1/parties/${encodeURIComponent(partyId)}/screen`);
      await page.click('[data-continue-party]');
      assert.equal((await restoredScreen).ok(), true);
      await page.waitForSelector('[data-turn-form]');
      await page.waitForSelector(
        '[data-landscape], [data-conversation-portrait-canvas]'
      );
      assert.equal(await page.locator('.error').count(), 0,
        await page.textContent('body'));
      assert.equal(environment.llm.requests.length, calls);
    }
  }
  await submitThroughBrowser(page, PHASE11_CANONICAL_TURNS.at(-1)[1],
    rawResponses);
  const domText = await page.textContent('body');
  assertPublicText(domText);
  assert.equal(domText.includes('роль Жданко доказана'), false);
  assert.equal([
    'роль Жданко подтверждена лишь частично',
    'роль Жданко остаётся неустановленным'
  ].some((value) => rawResponses.at(-1).includes(value)), true);
  assert.equal(await page.locator('.error').count(), 0, domText);
  const snapshot = (await environment.partyPool.query(
    `SELECT state_payload FROM party_runtime.party_state_snapshots
      ORDER BY state_version DESC LIMIT 1`
  )).rows[0].state_payload;
  assert.equal(snapshot.completion.status, 'committed');
  assert.equal(snapshot.completion.outcome.primary_completion_state,
    'trace_ld_v1_completion_full');
  const causalIds = await internalCausalIds(environment.partyPool, partyId);
  const publicSurfaces = [...rawResponses, domText];
  assertValuesAbsent(publicSurfaces,
    [...hiddenTruth.alwaysForbidden, ...causalIds],
    'public HTTP/DOM');
  rawResponses.forEach((value, index) =>
    assertPublicText(value, `HTTP response ${index}`, HTTP_FORBIDDEN));
  for (const request of environment.llm.requests) {
    assertPublicText(JSON.stringify(request.input),
      `LLM ${request.body?.model}`, LLM_FORBIDDEN);
    assertValuesAbsent([JSON.stringify(request.input)],
      hiddenTruth.alwaysForbidden,
      `LLM ${request.body?.model}`);
  }
});

async function submitThroughBrowser(page, rawText, rawResponses) {
  await page.fill('[data-turn-form] textarea[name="raw_text"]', rawText);
  const response = page.waitForResponse((candidate) =>
    candidate.request().method() === 'POST'
      && /\/api\/v1\/parties\/[^/]+\/turns$/u.test(
        new URL(candidate.url()).pathname));
  await page.click('[data-turn-form] button[type="submit"]');
  await response;
  await page.waitForSelector(
    '[data-turn-form] textarea:not([disabled]), .error');
  assert.equal(await page.locator('.error').count(), 0,
    `${await page.textContent('body')}\n${rawResponses.at(-1)}`);
}

const HTTP_FORBIDDEN = ['hidden_truth', 'private_motives',
  'npc_semantic_decision_inputs', 'npc_semantic_decision_traces',
  'decision_signal_records', 'document_contents'];
const LLM_FORBIDDEN = ['private_motives', 'document_contents',
  'actual_truth_hidden_from_character'];

function assertPublicText(value, surface = 'public surface',
  forbiddenValues = HTTP_FORBIDDEN) {
  for (const forbidden of forbiddenValues) {
    assert.equal(String(value).includes(forbidden), false,
      `${surface}: ${forbidden}: ${String(value).slice(0, 1_000)}`);
  }
}

async function actualHiddenTruthValues(pool, partyId) {
  const state = (await pool.query(
    `SELECT state_payload FROM party_runtime.party_state_snapshots
      WHERE party_id=$1 ORDER BY state_version ASC LIMIT 1`, [partyId]
  )).rows[0]?.state_payload;
  assert.ok(state?.hidden_truth?.motive?.motive_id,
    'acceptance must derive forbidden values from committed hidden truth');
  assert.ok(state.hidden_truth.sequence?.hidden_sequence_candidate_id);
  assert.ok(state.hidden_truth.culprit_ref);
  return { culpritRef: state.hidden_truth.culprit_ref,
    alwaysForbidden: [state.hidden_truth.motive.motive_id,
    state.hidden_truth.sequence.hidden_sequence_candidate_id,
    state.hidden_truth.digest].filter((value) => String(value).length >= 8) };
}

async function internalCausalIds(pool, partyId) {
  const rows = (await pool.query(
    `SELECT request_id, boundary_id
       FROM party_runtime.party_npc_decision_traces WHERE party_id=$1`,
    [partyId]
  )).rows;
  assert.ok(rows.length > 0);
  return rows.flatMap(({ request_id: requestId, boundary_id: boundaryId }) =>
    [requestId, boundaryId]).filter(Boolean);
}

function assertValuesAbsent(surfaces, values, label) {
  for (const value of new Set(values)) {
    assert.equal(surfaces.some((surface) => String(surface).includes(value)),
      false, `${label} leaked committed hidden/causal value ${value}`);
  }
}

function assertLandscapeModifiers(value) {
  for (const modifier of [
    'landscape--cold', 'landscape--wet', 'landscape--exposed'
  ]) assert.match(value, new RegExp(modifier, 'u'));
}

function parseJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}
