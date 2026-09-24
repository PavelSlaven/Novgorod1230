import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHttpHandler } from '../../apps/game-server/src/http/handler.js';
import { createStaticAssetResolver } from '../../apps/game-server/src/http/static-assets.js';
import { turnStepOperationChoices } from '../../apps/game-server/src/runtime/lower-dvina-trace-turn-step-operation-choices.js';

export const TARGET_SMOKE_INPUT = 'Осматриваюсь вокруг, оставаясь на месте.';

/** Opt-in isolated browser fixture. Never started by a production entrypoint.
 * Run target-canonical-start-postgres acceptance with RUS_TARGET_HTTP_BROWSER_SMOKE=true;
 * use the printed local URL, then POST browser observations to /__smoke/finish.
 * Deterministic model responses test delivery/mechanics, not prose quality.
 */
export async function serveTargetHttpBrowserSmoke({ root, pool, realProvider = false }) {
  const provider = globalThis.fetch;
  const report = { schema: 'target_http_browser_smoke_v1', scope: 'isolated PostgreSQL test approvals only',
    provider: realProvider ? 'configured_local_settings' : 'deterministic_test_fixture',
    player_input: TARGET_SMOKE_INPUT, started_at: new Date().toISOString(),
    model_calls: [], calls: [], browser: null };
  const reportPath = join(tmpdir(), `novgorod-target-http-smoke-${process.pid}.json`);
  const save = () => writeFile(reportPath, JSON.stringify(report, null, 2));
  if (!realProvider) globalThis.fetch = async (url, init) => {
    const call = JSON.parse(init.body);
    const system = call.messages[0].content.replace(/^Return a valid json object\.\s*/u, '');
    const input = JSON.parse(call.messages.find((message) => message.role === 'user').content);
    const started = performance.now();
    const captured = { model: call.model, system: call.messages[0].content, input };
    report.model_calls.push(captured);
    let output;
    if (system.includes('schema must equal world_knowledge_query_plan_v1.')) {
      captured.role = 'world_knowledge_query_planner';
      assert.equal(typeof (input.request ?? input).semantic_input, 'string');
      output = { schema: 'world_knowledge_query_plan_v1', query_locale: 'ru',
        domains: [], focus_refs: [], requested_predicates: [], search_hints: [] };
    } else if (system.startsWith('Resolve the raw Russian player text')) {
      captured.role = 'intent_router'; output = { status: 'unknown', reason_code: 'unknown_intent' };
    } else if (system.startsWith('Return only one JSON object containing the semantic choice for one turn step.')) {
      captured.role = 'turn_step_planner';
      const request = input.request ?? input;
      if (request.root_player_action === TARGET_SMOKE_INPUT) {
        assert.ok(system.includes('visible_general_look'), 'only the supplied current plan mapping may be used');
        assert.notEqual(request.player_safe_state?.ordinary_resolution?.scene_seed_available, true);
        output = { operation_choice: null, interpretation: { adaptation: 'literal' },
          resolution: 'direct', goal_result: 'achieved',
          activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
          operations: [], check: null, continuation: null, clarification: null,
          direct_result_kind: 'player_safe_observation', reason_code: 'review_supplied_visible_surroundings',
          reason: 'Обзор ограничен уже предоставленными видимыми сведениями; новые факты не утверждаются.' };
      } else {
        const matches = turnStepOperationChoices(request).filter(({ operation }) =>
          operation.op === 'request_movement'
          && ['local', 'route'].includes(operation.movement_kind)
          && operation.description === request.root_player_action);
        assert.equal(matches.length, 1, 'enter exactly one currently offered movement label as free text');
        output = { interpretation: { player_goal: request.root_player_action,
            grounded_attempt: request.root_player_action, adaptation: 'literal' },
          resolution: 'domain_request', goal_result: 'pending',
          activity: { owner: 'domain', duration_class: null, effort: null },
          operation_family: 'request_movement', operation_choice: matches[0].choice_id,
          check: null, continuation: null, clarification: null,
          direct_result_kind: null, reason_code: 'visible_movement',
          reason: 'Следую выбранному видимому пути.' };
      }
    } else if (system.startsWith('Return only {"prose"') && input.required_current_beat) {
      captured.role = 'gameplay_narrator';
      const sources = [...input.required_current_beat.changes, ...input.required_current_beat.uncertainties];
      assert.ok(sources.length > 0);
      output = { prose: sources.map(({ text }) => text).join('\n\n') };
    } else if (system.startsWith('You are a strict evidence auditor of Russian game prose.')) {
      captured.role = 'gameplay_narrator_auditor';
      const ids = input.segments.map(({ segment_id }) => segment_id);
      const sources = [...input.required_current_beat.changes, ...input.required_current_beat.uncertainties];
      output = { reviewed_segments: ids, source_reviews: sources.map(({ ref }) => ({ ref, segment_choices: ids })),
        unsupported: [], literary_failures: [], evidence: ['Deterministic test source-copy; no production prose-quality claim.'] };
    } else if (system.startsWith('Return only {"prose"') || system.startsWith('Return only {"pass"')) {
      captured.role = system.startsWith('Return only {"prose"') ? 'gameplay_narrator' : 'gameplay_narrator_auditor';
      const response = await provider(url, init);
      captured.output = await response.clone().json(); captured.duration_ms = performance.now() - started;
      await save(); return response;
    } else {
      captured.role = 'unconfigured_observed_role';
      await save(); throw new Error('TARGET_SMOKE_UNCONFIGURED_PROVIDER_ROLE');
    }
    captured.output = output; captured.duration_ms = performance.now() - started;
    await save();
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }), { status: 200 });
  };
  const observedRoot = { ...root, ...(realProvider ? {} : { getLlmSettings: () => ({
    mode: 'custom', compatibility: 'openai_compatible', base_url: 'https://target-acceptance.invalid',
    model: 'deterministic-test-fixture', api_key_present: true,
    default_model: 'deterministic-test-fixture' }) }), getTurnProgress: () => null };
  for (const method of ['startNewGame', 'acknowledgeOpening', 'submitTurn', 'getPartyScreen']) {
    observedRoot[method] = async (...args) => {
      const started = performance.now();
      const entry = { method, args, started_at: new Date().toISOString() };
      report.calls.push(entry);
      if (method === 'submitTurn') entry.before = await snapshot(pool, args[0]);
      try { entry.result = await root[method](...args); return entry.result; }
      catch (error) { entry.error = { code: error.code, message: error.message, details: error.details,
        turn_commit_status: error.turn_commit_status, cause_code: error.cause?.code }; throw error; }
      finally {
        entry.duration_ms = performance.now() - started;
        if (method === 'submitTurn') entry.after = await snapshot(pool, args[0]);
        await save();
      }
    };
  }
  const handler = createHttpHandler({ root: observedRoot, maxBodyBytes: 1024 * 1024,
    staticAssets: createStaticAssetResolver({ webRoot: resolve('apps/game-web'), contractsRoot: resolve('packages/contracts/src') }) });
  let finish;
  const finished = new Promise((done) => { finish = done; });
  const server = createServer(async (req, res) => {
    if (req.url === '/__smoke/finish' && req.method === 'POST') {
      let body = ''; for await (const chunk of req) body += chunk;
      report.browser = JSON.parse(body || '{}'); await save();
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); finish(); return;
    }
    return handler(req, res);
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const url = `http://127.0.0.1:${server.address().port}`;
  await writeFile(join(tmpdir(), 'novgorod-target-http-smoke-ready.json'), JSON.stringify({ url, reportPath }));
  console.log(`Target HTTP browser fixture ready: ${url}; report: ${reportPath}`);
  console.log(`Browser smoke: open ${url}, select the forest start, acknowledge opening, submit "${TARGET_SMOKE_INPUT}"; retry the same HTTP turn identity, reload, then at each step type the exact currently displayed approved local movement label into "Действие" and submit (arrival → focus → departure). Finally type the displayed directional exit label and submit. POST observed results to ${url}/__smoke/finish.`);
  const timeout = setTimeout(() => finish(), 15 * 60_000);
  try {
    await finished;
    assert.ok(report.browser, 'Chromium must finish the explicit smoke');
    const turns = report.calls.filter((entry) => entry.method === 'submitTurn');
    assert.equal(turns.length, 5, 'HTTP observation, identical retry, two local moves and directional exit required');
    assert.equal(turns[0].args[1].raw_text, TARGET_SMOKE_INPUT);
    assert.deepEqual(turns[0].args, turns[1].args);
    assert.equal(turns[0].error, undefined, 'approved target observation must reach its existing owner');
    assert.equal(turns[1].error, undefined);
    assert.equal(turns[0].result.screen.screen_status, 'ready');
    assert.deepEqual(turns[1].result, turns[0].result, 'successful HTTP retry is idempotent');
    assert.deepEqual(turns[1].after, turns[0].after, 'retry adds no gameplay write');
    assert.equal(turns[0].after.party.state_version, turns[0].before.party.state_version + 1);
    if (realProvider) assert.ok(turns[0].after.clock.whole_minutes > turns[0].before.clock.whole_minutes);
    else assert.equal(turns[0].after.clock.whole_minutes, turns[0].before.clock.whole_minutes + 1);
    for (const key of ['body', 'positions', 'materialization_runs', 'sites']) {
      assert.deepEqual(turns[0].after[key], turns[0].before[key], `observation preserves ${key}`);
    }
    assert.equal(turns[0].result.movement, null);
    assert.deepEqual(turns[0].result.screen.visible_context.visible_npc, []);
    assert.equal(turns[0].after.position_slot, 'arrival');
    const replayIndex = report.calls.indexOf(turns[1]);
    assert.ok(report.calls.slice(replayIndex + 1, report.calls.indexOf(turns[2]))
      .some((entry) => entry.method === 'getPartyScreen'), 'reload must fetch current screen before movement');
    for (let index = 2; index < 5; index += 1) {
      const turn = turns[index];
      const previous = turns[index - 1];
      const kind = index === 4 ? 'directional_exit:' : 'local_scene_edge:';
      const offered = previous.result.screen.action_panel.suggested_actions.filter((action) =>
        action.option_id?.startsWith(kind) && action.label === turn.args[1].raw_text);
      assert.equal(offered.length, 1, 'submit the exact currently displayed approved movement label');
      assert.equal(turn.error, undefined, 'visible movement must reach the production movement owner');
      assert.notEqual(turn.result.movement, null);
      assert.notDeepEqual(turn.after.positions, turn.before.positions, 'movement must change committed position');
      assert.equal(turn.after.party.state_version, turn.before.party.state_version + 1);
      assert.equal(turn.before.position_slot, index === 2 ? 'arrival' : index === 3 ? 'focus' : 'departure');
      if (index < 4) {
        assert.equal(turn.after.position_slot, index === 2 ? 'focus' : 'departure');
        assert.equal(Number(turn.after.sites), Number(turn.before.sites));
      } else {
        assert.equal(Number(turn.after.sites), Number(turn.before.sites) + 1,
          'directional exit must commit exactly one generated G5');
      }
    }
    assert.ok(report.calls.find((entry) => entry.method === 'startNewGame')?.result);
    assert.ok(report.calls.find((entry) => entry.method === 'acknowledgeOpening')?.result);
    assert.ok(report.calls.some((entry) => entry.method === 'getPartyScreen'));
    assert.ok(report.model_calls.every((call) => ['world_knowledge_query_planner', 'intent_router', 'turn_step_planner',
      'gameplay_narrator', 'gameplay_narrator_auditor'].includes(call.role)));
    report.generative_materialization_calls = report.model_calls.filter((call) =>
      !['world_knowledge_query_planner', 'intent_router', 'turn_step_planner', 'gameplay_narrator', 'gameplay_narrator_auditor'].includes(call.role)).length;
    report.finished_at = new Date().toISOString(); await save();
  } finally {
    clearTimeout(timeout); if (!realProvider) globalThis.fetch = provider;
    await new Promise((done) => server.close(done));
  }
}

async function snapshot(pool, partyId) {
  const row = (await pool.query(`SELECT
    (SELECT to_jsonb(p) FROM party_runtime.parties p WHERE party_id=$1) AS party,
    (SELECT to_jsonb(c) FROM party_runtime.party_clocks c WHERE party_id=$1) AS clock,
    (SELECT jsonb_agg(to_jsonb(b) ORDER BY actor_id) FROM party_runtime.party_actor_body_states b WHERE party_id=$1) AS body,
    (SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM party_runtime.party_journey_locations l WHERE party_id=$1) AS positions,
    (SELECT n.template_slot_key FROM party_runtime.party_journey_locations l
      JOIN party_runtime.scene_position_nodes n ON n.party_id=l.party_id AND n.id=l.scene_position_id
      JOIN party_runtime.party_player_characters a ON a.party_id=l.party_id AND a.character_id=l.owner_id
      WHERE l.party_id=$1 AND l.owner_kind='actor') AS position_slot,
    (SELECT count(*) FROM party_runtime.party_materialization_runs WHERE party_id=$1) AS materialization_runs,
    (SELECT count(*) FROM party_runtime.party_g5_sites WHERE party_id=$1) AS sites,
    (SELECT count(*) FROM party_runtime.party_state_snapshots WHERE party_id=$1) AS snapshots`, [partyId])).rows[0];
  return row;
}
