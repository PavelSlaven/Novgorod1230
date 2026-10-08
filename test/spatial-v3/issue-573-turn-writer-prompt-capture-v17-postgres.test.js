import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
} from './presence-rules-production-e2e-fixture.js';
import { identifyLlmTestRole } from './llm-test-role.js';

const ACTION = 'Здороваюсь с человеком.';
const SCENARIO = 'novgorod_zaostrovye_settlement_approach_v1';
const START_REQUEST_ID = 'issue-573:novgorod_zaostrovye_settlement_approach_v1:seed-1';

function classifyCall(providerRequest) {
  const knownRole = identifyLlmTestRole(providerRequest);
  if (knownRole != null) return { role: knownRole, source: 'identifyLlmTestRole' };
  const system = providerRequest.messages?.find(({ role }) => role === 'system')?.content ?? '';
  if (/Repair the invalid JSON shape against validation_errors/u.test(system)) {
    return { role: 'gameplay_narrator_format_repair', source: 'system instruction' };
  }
  if (/Return only \{"replacements"/u.test(system)) {
    return { role: 'gameplay_narrator_semantic_repair', source: 'system instruction' };
  }
  if (system.includes('You are a strict evidence auditor of Russian game prose.')) {
    return { role: 'gameplay_narrator_auditor', source: 'system instruction' };
  }
  if (/Return only \{"prose"/u.test(system)) {
    return { role: 'gameplay_narrator', source: 'system instruction' };
  }
  return { role: null, source: null };
}

function actualParameters(request) {
  return Object.fromEntries([
    'model', 'max_tokens', 'response_format', 'chat_template_kwargs',
    'reasoning_effort', 'temperature', 'top_p',
  ].filter((key) => Object.hasOwn(request, key)).map((key) => [key, request[key]]));
}

test('D81 capture: actual v17 writer provider request for issue #573',
  { timeout: 1_780_000 }, async (t) => {
    const captureDir = process.env.ISSUE_573_CAPTURE_DIR;
    if (captureDir == null) {
      t.skip('Diagnostic D81 capture requires an explicit ISSUE_573_CAPTURE_DIR');
      return;
    }
    assert.ok(typeof captureDir === 'string' && captureDir.trim(),
      'ISSUE_573_CAPTURE_DIR must name the output directory; no default capture path is used');

    const env = await bootstrapV17PresenceE2e(t);
    const requestLog = [];
    const narrationLog = [];
    const plannerRequests = [];
    const capturedCalls = [];
    const restoreFixtureFetch = installPresenceProductionE2eFetch({
      requestLog,
      narrationLog,
      turnStepPlanner: ({ request }) => {
        plannerRequests.push(structuredClone(request));
        return {
          operation_choice: null,
          interpretation: { player_goal: ACTION, grounded_attempt: ACTION,
            adaptation: 'literal' },
          resolution: 'direct', goal_result: 'not_achieved',
          activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
          operations: [], check: null, continuation: null, clarification: null,
          direct_result_kind: null,
          reason_code: 'no_visible_greeting_target',
          reason: 'В переданной сцене нет видимого человека, к которому можно обратиться.',
        };
      },
    });
    const fixtureFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const providerRequest = JSON.parse(init.body);
      const classification = classifyCall(providerRequest);
      const response = await fixtureFetch(url, init);
      let responseBody = null;
      try {
        responseBody = await response.clone().json();
      } catch {
        // Some providers return non-JSON bodies; the request capture remains useful.
      }
      capturedCalls.push({
        index: capturedCalls.length,
        ...classification,
        provider_request: providerRequest,
        response: responseBody,
      });
      return response;
    };
    t.after(() => {
      globalThis.fetch = fixtureFetch;
      restoreFixtureFetch();
    });

    const { runtime } = await createPresenceProductionRoot(env);
    t.after(() => runtime.close());
    assert.equal(runtime.health().release_id, 'spatial-v3-production-v17',
      'precondition: production root is v17');
    const opening = await runtime.startNewGame({
      scenario_id: SCENARIO, request_id: START_REQUEST_ID,
    });
    const partyId = opening.party_id;
    const seeds = (await env.partyPool.query(
      `SELECT run_id, seed_digest, rng_version, trace->'npc_selection_trace' AS npc_selection_trace
         FROM party_runtime.party_materialization_runs
        WHERE party_id=$1 AND run_kind='baseline' AND run_id LIKE 'authored_%'`,
      [partyId],
    )).rows;
    assert.equal(seeds.length, 1, 'precondition: persisted authored-start seed is available');
    assert.match(seeds[0].seed_digest, /^[a-f0-9]{64}$/u);
    assert.match(seeds[0].npc_selection_trace.seed_digest, /^[a-f0-9]{64}$/u);
    await runtime.acknowledgeOpening(partyId, { client_ack_id: 'issue-573-opening-ack' });

    // Keep only provider traffic caused by the submitted greeting.
    requestLog.length = 0;
    narrationLog.length = 0;
    capturedCalls.length = 0;
    const result = await runtime.submitTurn(partyId, {
      raw_text: ACTION, request_id: 'issue-573-greeting',
    });
    assert.equal(plannerRequests.length, 1, 'precondition: one accepted direct greeting plan');
    assert.equal(plannerRequests[0].root_player_action, ACTION);
    const scene = plannerRequests[0].player_safe_state?.current_visible_context;
    assert.ok(scene, 'precondition: production planner receives current perception');
    assert.deepEqual(scene.visible_npc, [], 'precondition: no visible greeting target');
    assert.ok(narrationLog.length > 0, 'precondition: production turn reaches writer');
    assert.equal(Number(result.screen.turn_number), 1,
      'precondition: turn commits and delivers');

    const writerCall = capturedCalls.find(({ role, provider_request }) =>
      role === 'gameplay_narrator'
      && provider_request.messages?.some(({ role: messageRole, content }) =>
        messageRole === 'user' && typeof content === 'string'
        && JSON.parse(content)?.required_current_beat));
    assert.ok(writerCall, 'precondition: actual provider body for the turn writer was captured');
    assert.equal(requestLog.length > 0, true,
      'precondition: fixture also observed provider requests for the greeting');

    const suffix = `${new Date().toISOString().replace(/[:.]/gu, '-')}-${randomUUID()}`;
    await mkdir(captureDir, { recursive: true });
    const writerPath = join(captureDir, `issue-573-writer-payload-${suffix}.json`);
    const callsPath = join(captureDir, `issue-573-provider-calls-${suffix}.json`);
    const manifestPath = join(captureDir, `issue-573-capture-manifest-${suffix}.json`);
    const writerUser = JSON.parse(writerCall.provider_request.messages
      .find(({ role }) => role === 'user').content);
    await writeFile(writerPath, `${JSON.stringify(writerCall.provider_request, null, 2)}\n`);
    await writeFile(callsPath, `${JSON.stringify(capturedCalls, null, 2)}\n`);
    await writeFile(manifestPath, `${JSON.stringify({
      release_id: runtime.health().release_id,
      scenario_id: SCENARIO,
      start_request_id: START_REQUEST_ID,
      action: ACTION,
      party_id: partyId,
      seeds,
      planner_request: plannerRequests[0],
      current_visible_context: scene,
      writer_beat: writerUser.required_current_beat,
      captured_call_roles: capturedCalls.map(({ index, role, source }) => ({ index, role, source })),
      writer_parameters: actualParameters(writerCall.provider_request),
      writer_payload_file: writerPath,
      provider_calls_file: callsPath,
    }, null, 2)}\n`);
  });
