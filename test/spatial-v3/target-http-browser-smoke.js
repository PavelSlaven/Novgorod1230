import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
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
  if (realProvider) globalThis.fetch = async (url, init) => {
    const call = JSON.parse(init.body);
    const system = (call.messages?.[0]?.content ?? '').replace(/^Return a valid json object\.\s*/u, '');
    if (system.startsWith('Return only {"pass"')) {
      const response = await provider(url, init);
      report.model_calls.push({ role: 'gameplay_narrator_auditor',
        output: await readStage23AuditOutput(response) });
      await save();
      return response;
    }
    if (!system.startsWith('Return only one JSON object containing the semantic choice for one turn step.')) {
      return provider(url, init);
    }
    const input = JSON.parse(call.messages.find((message) => message.role === 'user').content);
    const request = input.request ?? input;
    const response = await provider(url, init);
    report.model_calls.push({ role: 'turn_step_planner',
      root_player_action: request.root_player_action,
      movement_choices: turnStepOperationChoices(request).filter(({ operation }) =>
        operation.op === 'request_movement').map(({ choice_id, operation }) => ({ choice_id, operation })),
      output: (await response.clone().json()).choices?.[0]?.message?.content ?? null });
    await save();
    return response;
  };
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
  console.log(`Browser smoke: open ${url}, select the forest start, acknowledge opening, submit "${TARGET_SMOKE_INPUT}"; retry the same HTTP turn identity, reload, then follow exact currently displayed approved movement labels in "Действие" to a directional exit. If it reaches a canonical terminal, start another ordinary UI party and repeat until an exit reaches a generated G5. POST observed results to ${url}/__smoke/finish.`);
  const timeout = setTimeout(() => finish(), 15 * 60_000);
  try {
    await finished;
    assert.ok(report.browser, 'Chromium must finish the explicit smoke');
    report.movement_routes = assertTargetTurnEvidence(report.calls, realProvider);
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

export function assertTargetTurnEvidence(calls, realProvider = false) {
  const turns = calls.filter((entry) => entry.method === 'submitTurn');
  const parties = [...new Set(turns.map((turn) => turn.args[0]))];
  let retryFound = false;
  const routes = [];
  for (const partyId of parties) {
    const partyTurns = turns.filter((turn) => turn.args[0] === partyId);
    assert.equal(partyTurns[0].args[1].raw_text, TARGET_SMOKE_INPUT,
      'each ordinary UI party begins with target observation');
    const uniqueTurns = [];
    for (const turn of partyTurns) {
      const previous = uniqueTurns.find((candidate) => isDeepStrictEqual(candidate.args, turn.args));
      if (previous) {
        assert.equal(turn.error, undefined, 'successful HTTP retry must reach its existing owner');
        assert.deepEqual(turn.result, previous.result, 'successful HTTP retry is idempotent');
        assert.deepEqual(turn.after, previous.after, 'retry adds no gameplay write');
        if (turn.args[1].raw_text === TARGET_SMOKE_INPUT) {
          const nextMovement = partyTurns.find((candidate) => partyTurns.indexOf(candidate) > partyTurns.indexOf(turn)
            && candidate.args[1].raw_text !== TARGET_SMOKE_INPUT);
          if (nextMovement) assert.ok(calls.slice(calls.indexOf(turn) + 1, calls.indexOf(nextMovement))
            .some((entry) => entry.method === 'getPartyScreen' && entry.args[0] === partyId),
          'reload must fetch current screen before movement');
          retryFound = true;
        }
        continue;
      }
      uniqueTurns.push(turn);
      if (turn.args[1].raw_text === TARGET_SMOKE_INPUT) assertTargetObservation(turn, realProvider);
    }
    if (uniqueTurns.some((turn) => turn.args[1].raw_text !== TARGET_SMOKE_INPUT)) {
      routes.push({ party_id: partyId, ...assertDisplayedMovementRoute(uniqueTurns) });
    }
  }
  assert.ok(retryFound, 'at least one party needs an exact identical HTTP retry');
  assert.ok(routes.some(({ generated }) => generated),
    'at least one ordinary UI party must enter a committed generated G5');
  return routes;
}

export function assertTargetObservation(turn, realProvider = false) {
  assert.equal(turn.error, undefined, 'approved target observation must reach its existing owner');
  assert.equal(turn.result.screen.screen_status, 'ready');
  assert.equal(turn.after.party.state_version, turn.before.party.state_version + 1);
  if (realProvider) assert.ok(turn.after.clock.whole_minutes > turn.before.clock.whole_minutes);
  else assert.equal(turn.after.clock.whole_minutes, turn.before.clock.whole_minutes + 1);
  for (const key of ['body', 'positions', 'entity_placements', 'materialization_runs', 'sites']) {
    assert.deepEqual(turn.after[key], turn.before[key], `observation preserves ${key}`);
  }
  assert.equal(turn.result.movement, null);
  const visibleNpcs = turn.result.screen.visible_context.visible_npc;
  for (const visibleNpc of visibleNpcs) {
    assert.deepEqual(Object.keys(visibleNpc).sort(),
      ['display_label', 'entity_ref', 'observable_cues', 'recognition']);
    assert.equal(visibleNpc.display_label, 'человек');
    assert.equal(visibleNpc.recognition, 'unrecognized');
    assert.equal(visibleNpc.entity_ref.entity_kind, 'npc');
    assert.equal(visibleNpc.observable_cues.identity.display_name, 'человек');
    assert.equal(typeof visibleNpc.observable_cues.identity.appearance, 'object');
    assert.ok(Array.isArray(visibleNpc.observable_cues.equipment));
  }
  assert.deepEqual((turn.result.screen.panels.people?.data?.visible_npcs ?? []).map(
    ({ display_label, status }) => ({ display_label, status })),
  visibleNpcs.map(({ display_label }, index) => ({
    display_label: visibleNpcs.length > 1 ? `${display_label} (${index + 1})` : display_label,
    status: undefined })));
}

export async function readStage23AuditOutput(response) {
  let output;
  try { output = JSON.parse((await response.clone().json()).choices?.[0]?.message?.content); }
  catch { return null; }
  if (!output || typeof output !== 'object' || Array.isArray(output)) return null;
  const string = (value) => typeof value === 'string' ? value : null;
  return { pass: typeof output.pass === 'boolean' ? output.pass : null,
    failed_checks: Array.isArray(output.failed_checks) ? output.failed_checks.map(string) : null,
    concerns: Array.isArray(output.concerns) ? output.concerns.map((item) => ({
      code: string(item?.code), severity: string(item?.severity), message: string(item?.message) })) : null,
    evidence: Array.isArray(output.evidence) ? output.evidence.map(string) : null };
}

export function assertDisplayedMovementRoute(turns) {
  let exited = false;
  let generated = false;
  for (let index = 1; index < turns.length; index += 1) {
    if (exited) break;
    const turn = turns[index];
    if (turn.args[1].raw_text === TARGET_SMOKE_INPUT) continue;
    const previous = turns[index - 1];
    const screen = previous.result.screen;
    const offered = (screen.panels?.route?.data?.movement?.options ?? []).filter((action) =>
      action.knowledge_state === 'known' && action.label === turn.args[1].raw_text);
    assert.equal(offered.length, 1, 'submit the exact currently displayed approved movement label');
    const refs = (screen.visible_context?.visible_objects ?? []).filter((object) =>
      object.display_label === offered[0].label
      && ['scene_movement_edge', 'g4_directional_exit'].includes(object.entity_ref?.entity_kind));
    assert.equal(refs.length, 1, 'displayed route has one visible committed movement ref');
    const isExit = refs[0].entity_ref.entity_kind === 'g4_directional_exit';
    assert.equal(turn.error, undefined, 'visible movement must reach the production movement owner');
    assert.notEqual(turn.result.movement, null);
    assert.notDeepEqual(turn.after.positions, turn.before.positions, 'movement must change committed position');
    assert.equal(turn.after.party.state_version, turn.before.party.state_version + 1);
    if (!isExit) {
      assert.notEqual(turn.after.position_slot, turn.before.position_slot);
      assert.equal(Number(turn.after.sites), Number(turn.before.sites));
      assert.equal(turn.after.site?.id, turn.before.site?.id, 'local movement stays in its G5');
    } else {
      const connections = (turn.after.connections ?? []).filter((connection) =>
        connection.from_site_id === turn.before.site?.id
        && connection.to_site_id === turn.after.site?.id
        && !(turn.before.connections ?? []).some((previousConnection) => previousConnection.id === connection.id));
      assert.equal(connections.length, 1, 'exit must commit one connection from current to destination site');
      assert.equal(connections[0].status, 'active');
      assert.ok(['canonical', 'generated'].includes(turn.after.site?.origin),
        'exit must reach a committed canonical or generated G5');
      const siteDelta = Number(turn.after.sites) - Number(turn.before.sites);
      if (turn.after.site.origin === 'generated') {
        assert.equal(siteDelta, 1, 'generated exit must commit exactly one G5');
        generated = true;
      } else assert.ok(siteDelta === 0 || siteDelta === 1,
        'terminal exit may reuse or project one canonical G5');
      exited = true;
    }
  }
  assert.ok(exited, 'displayed directional exit must reach a committed G5');
  return { generated };
}

async function snapshot(pool, partyId) {
  const row = (await pool.query(`SELECT
    (SELECT to_jsonb(p) FROM party_runtime.parties p WHERE party_id=$1) AS party,
    (SELECT to_jsonb(c) FROM party_runtime.party_clocks c WHERE party_id=$1) AS clock,
    (SELECT jsonb_agg(to_jsonb(b) ORDER BY actor_id) FROM party_runtime.party_actor_body_states b WHERE party_id=$1) AS body,
    (SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM party_runtime.party_journey_locations l WHERE party_id=$1) AS positions,
    (SELECT jsonb_agg(jsonb_build_object('entity_kind', e.entity_kind,
      'entity_id', e.entity_id, 'position_node_id', e.position_node_id,
      'occupies_capacity_units', e.occupies_capacity_units) ORDER BY e.entity_kind, e.entity_id)
      FROM party_runtime.entity_placements e
      WHERE e.party_id=$1 AND e.position_node_id IS NOT NULL) AS entity_placements,
    (SELECT n.template_slot_key FROM party_runtime.party_journey_locations l
      JOIN party_runtime.scene_position_nodes n ON n.party_id=l.party_id AND n.id=l.scene_position_id
      JOIN party_runtime.party_player_characters a ON a.party_id=l.party_id AND a.character_id=l.owner_id
      WHERE l.party_id=$1 AND l.owner_kind='actor') AS position_slot,
    (SELECT jsonb_build_object('id',s.id,'origin',s.origin) FROM party_runtime.party_journey_locations l
      JOIN party_runtime.party_player_characters a ON a.party_id=l.party_id AND a.character_id=l.owner_id
      JOIN party_runtime.scene_position_nodes n ON n.party_id=l.party_id AND n.id=l.scene_position_id
      JOIN party_runtime.party_g6_instances g ON g.party_id=n.party_id AND g.id=n.g6_instance_id
      JOIN party_runtime.party_scene_baselines b ON b.party_id=g.party_id AND b.id=g.scene_baseline_id
      JOIN party_runtime.party_g5_sites s ON s.party_id=b.party_id AND s.id=b.host_id
      WHERE l.party_id=$1 AND l.owner_kind='actor' AND b.host_kind='g5_site') AS site,
    (SELECT jsonb_agg(jsonb_build_object('id',c.id,'from_site_id',c.from_site_id,
      'to_site_id',c.to_site_id,'status',c.status) ORDER BY c.id)
      FROM party_runtime.g5_site_connections c WHERE c.party_id=$1) AS connections,
    (SELECT count(*) FROM party_runtime.party_materialization_runs WHERE party_id=$1) AS materialization_runs,
    (SELECT count(*) FROM party_runtime.party_g5_sites WHERE party_id=$1) AS sites,
    (SELECT jsonb_agg(jsonb_build_object('resource_node_id', resource_node_id,
      'quantity_numerator', quantity_numerator, 'quantity_denominator', quantity_denominator,
      'lifecycle_state', lifecycle_state, 'state_version', state_version)
      ORDER BY resource_node_id) FROM party_runtime.party_resource_nodes WHERE party_id=$1) AS finite_sources,
    (SELECT jsonb_agg(jsonb_build_object('resource_node_id', resource_node_id,
      'causal_transition_identity', causal_transition_identity, 'before_numerator', before_numerator,
      'decrement_numerator', decrement_numerator, 'after_numerator', after_numerator,
      'lifecycle_state_after', lifecycle_state_after)
      ORDER BY resource_node_id, causal_transition_identity)
      FROM party_runtime.party_resource_node_decrements WHERE party_id=$1) AS finite_decrements,
    (SELECT count(*) FROM party_runtime.party_state_snapshots WHERE party_id=$1) AS snapshots`, [partyId])).rows[0];
  return row;
}
