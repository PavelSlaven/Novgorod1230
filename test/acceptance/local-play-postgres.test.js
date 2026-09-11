import { renderScreen } from '../../apps/game-web/src/index.js';
import { existingInspectionFixtureResponse, assertPersistedExistingInspection } from './local-play-item-inspection.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import pg from 'pg';

import { createCanonicalPhase11LlmResponder } from '../helpers/lower-dvina-phase-11-llm.js';
import { startLocalLlmProviderFixture } from '../helpers/local-llm-provider-fixture.js';
import { createProductionLlmRoleRunner } from
  '../../apps/game-server/src/infrastructure/provider/deepseek.js';
import { LOCAL_POSTGRES, ensureLocalPostgres, localDataRoot } from
  '../../tools/local-play/local-postgres.js';
import { MANAGED_RUNTIME_PINS } from '../../tools/local-play/managed-runtime.js';
import { startLocalPlay } from '../../tools/local-play/local-play.js';
import { loadLowerDvinaTraceScenePresentation } from '../../apps/game-server/src/internal/lower-dvina-trace-scene-presentation.js';
import { scenePresentationForLocation } from '../../apps/game-server/src/runtime/lower-dvina-trace-scene-presentation.js';

test('local play persists a free turn and replays it after a server restart',
  { timeout: 600_000, skip: process.platform !== 'win32'
      || process.arch !== 'x64' }, async (context) => {
    const suffix = randomUUID().replaceAll('-', '');
    const directory = await mkdtemp(join(tmpdir(), 'novgorod-local-play-'));
    const dataRoot = join(directory, 'data');
    const settings = Object.freeze({ ...LOCAL_POSTGRES });
    const port = await freePort();
    const canonical = createCanonicalPhase11LlmResponder();
    let fixtureResolution = 'no_change';
    const llm = await startLocalLlmProviderFixture({ respond: (request) =>
      request.body.messages?.[0]?.content === 'Return a JSON object with {"ok":true}.'
        ? { ok: true }
        : searchFixtureResponse(request.input, fixtureResolution)
          ?? canonical({ ...request, model: fixtureRoleModel(request.input) })
    });
    const provider = Object.freeze({ mode: 'custom',
      compatibility: 'openai_compatible', baseUrl: llm.baseUrl,
      model: 'fixture-local-play', apiKey: null });
    const identity = createProductionLlmRoleRunner({ settings: {
      providerSnapshot: () => provider
    } }).describe({ scope: 'turn_runtime', role_id: 'ordinary_materialization' });
    const settingsPath = join(directory, 'llm-settings.json');
    await writeFile(settingsPath, `${JSON.stringify({ version: 1,
      settings: { mode: 'custom', compatibility: provider.compatibility,
        base_url: provider.baseUrl, model: provider.model, api_key: null },
      ordinary_materialization_identity: identity })}\n`);
    let localPlay = null;
    context.after(async () => {
      await localPlay?.close().catch(() => {});
      await llm.close().catch(() => {});
      await rm(directory, { recursive: true, force: true });
    });

    const env = {
      ...process.env,
      RUS_LLM_SETTINGS_PATH: settingsPath,
      RUS_SERVER_PORT: String(port)
    };
    const start = () => startLocalPlay({ env, localPostgresSettings: settings,
      ensurePostgres: (options) => ensureLocalPostgres({ ...options, dataRoot }),
      provisionRuntime: async ({ startLlm }) => {
        assert.equal(startLlm, false); return fixtureRuntime();
      }, log: () => {} });
    localPlay = await start();

    const requestId = `local-play-turn-${suffix}`;
    const started = await post(port, '/api/v1/new-games', {
      scenario_id: 'lower_dvina_trace_v1', request_id: `local-play-new-${suffix}`
    });
    const partyId = started.party_id;
    assert.match(started.screen.main_prose, /^Вас зовут Микула\. Вы — младший приказчик,/u);
    assert.ok(renderScreen(started.screen).includes('<dt>Вы</dt><dd>Микула, младший приказчик</dd>'));
    assert.match(started.screen.panels.character.data.biography, /разорившегося кожевника/u);
    assert.match(started.screen.panels.character.data.memories, /Онисим/u);
    assert.match(started.screen.panels.character.data.knowledge, /Савва Твердич/u);
    assert.equal(started.screen.panels.character.visible, true);
    assert.equal(started.screen.panels.inventory.visible, true);
    assert.ok(started.screen.panels.inventory.data.zones.worn_quick.some(item => item.label === 'хозяйственный нож'));
    assert.equal(started.screen.panels.inventory.data.zones.equipped.length, 2);
    assert.equal(started.screen.panels.inventory.data.zones.worn_quick.length, 1);
    assert.ok(started.screen.presentation_context.date_label);
    assert.ok(started.screen.presentation_context.time_label);
    assert.match(started.screen.main_prose, /приметная тропа/u);
    assert.match(started.screen.main_prose, /плеск воды/u);
    assert.equal(started.screen.panels.route.data.movement.options[0].label, 'Приметная тропа за ивняк');
    await post(port, `/api/v1/parties/${encodeURIComponent(partyId)}/opening-ack`, {
      client_ack_id: `local-play-opening-${suffix}`
    });
    const beforeTurn = await committedState(localPlay.postgres.partyUrl, partyId);
    const names = beforeTurn.owned_item_names;
    const scenePresentation = await loadLowerDvinaTraceScenePresentation({
      scenarioDefinitionRevision: beforeTurn.state_payload.materialization_trace.seed_context.scenario_definition_revision
    });
    for (const name of ['хозяйственный нож', 'нижняя рубаха', 'верхняя шерстяная одежда']) assert.ok(names.includes(name));
    let turnRequest = {
      request_id: requestId,
      idempotency_key: requestId,
      raw_text: 'Перебрать речной сор в поисках щепки.'
    };
    const attempts = [];
    const ordinaryCalls = () => llm.requests.filter(({ input }) =>
      (input?.request ?? input)?.schema === 'ordinary_materialization_request_v1').length;
    let initialOrdinaryCalls = 0;
    for (const [index, resolution] of ['no_change', 'no_change', 'authority_required', 'materialize'].entries()) {
      fixtureResolution = resolution;
      turnRequest = { request_id: `${requestId}-${index}`, idempotency_key: `${requestId}-${index}`,
        raw_text: ['Перебрать сор в поисках обрывка ткани.',
          'Перебрать сор в поисках обрывка ткани.',
          'Перебрать сор в поисках предмета неясного происхождения.',
          'Перебрать сор в поисках щепки.'][index] };
      const callsBefore = llm.requests.length;
      const result = await post(port,
        `/api/v1/parties/${encodeURIComponent(partyId)}/turns`, turnRequest);
      const committed = await committedState(localPlay.postgres.partyUrl, partyId);
      const roleInputs = llm.requests.slice(callsBefore).map(({ input }) => input?.request ?? input);
      const plannerInput = roleInputs.find(input => input?.schema === 'turn_step_request_v1');
      const playerSafe = plannerInput.player_safe_state;
      assert.ok(playerSafe.available_routes.some(route => route.label === 'Приметная тропа за ивняк'
        && route.to_ref == null));
      assert.equal(result.screen.panels.route.data.movement.options[0].label, 'Приметная тропа за ивняк');
      assert.match(plannerInput.actor.biography, /разорившегося кожевника/u);
      assert.ok(plannerInput.actor.memory.some(record => record.text.includes('Онисим')));
      assert.ok(playerSafe.knowledge.some(record => record.text.includes('Савва Твердич')));
      assert.equal(committed.state_payload.player_profile.origin.biography, plannerInput.actor.biography);
      assert.deepEqual(committed.state_payload.player_profile.memory.records.map(record => record.text),
        plannerInput.actor.memory.map(record => record.text));
      const sourceScene = playerSafe.current_visible_context;
      const profile = scenePresentationForLocation({ scenePresentation, locationRef: playerSafe.position.location_ref });
      const narrated = roleInputs.filter(input => input?.schema === 'narration_request');
      assert.ok(narrated.length > 0, 'the real narrator receives the committed search projection');
      for (const { optional_support: visible, required_current_beat: beat } of narrated) {
        assert.deepEqual(Object.keys(visible).sort(), ['sensory_details', 'visible_scene']);
        assert.equal(visible.visible_scene, sourceScene.visible_scene);
        assert.ok(profile.player_visible_physical_facts.length > 0);
        for (const detail of profile.player_visible_physical_facts) assert.ok(visible.sensory_details.includes(detail), JSON.stringify({ index, missing: detail, profile: profile.player_visible_physical_facts, narrated: visible.sensory_details }));
        if (resolution === 'no_change' || resolution === 'authority_required') {
          assert.ok(beat.changes.some(({ text }) => text.includes(
            `За 15 минут поиска по вопросу «${turnRequest.raw_text}» подтверждённой находки нет.`)));
          assert.ok(beat.uncertainties.some(({ text }) => text.includes(`«${turnRequest.raw_text}»`)));
        } else assert.ok(beat.changes.some(
          ({ text }) => text.includes('Поиск занял 15 минут.')));
      }
      assert.equal(result.screen.panels.character.visible, true);
      assert.ok(renderScreen(result.screen).includes('<dt>Вы</dt><dd>Микула, младший приказчик</dd>'));
      assert.equal(result.screen.panels.inventory.visible, true);
      assert.equal(result.screen.panels.route.visible, true);
      assert.equal(result.screen.panels.character.data.energy, Number(committed.body.energy));
      assert.ok(result.screen.panels.inventory.data.zones.worn_quick.some(item => item.label === 'хозяйственный нож'));
      assert.ok(result.screen.presentation_context.location_label);
      assert.ok(result.screen.presentation_context.date_label);
      assert.notEqual(result.screen.presentation_context.time_label, started.screen.presentation_context.time_label);
      assert.equal(Number(committed.clock.whole_minutes) - Number(beforeTurn.clock.whole_minutes), 15 * (index + 1));
      assert.equal(Number(committed.body.energy), Number(beforeTurn.body.energy) - index - 1);
      assert.equal(committed.item_ids.length, beforeTurn.item_ids.length + (resolution === 'materialize' ? 1 : 0));
      assert.equal(committed.activities.length, index + 1);
      assert.ok(committed.activities.every(activity => Number(activity.original_total_minutes) === 15 && activity.status === 'completed'));
      if (index === 0) {
        initialOrdinaryCalls = ordinaryCalls();
        const planner = llm.requests.map(({ input }) => input?.request ?? input)
          .find(input => input?.schema === 'turn_step_request_v1');
        for (const name of names) assert.ok(planner.player_safe_state.items.some(item => item.name === name));
      }
      if (index === 1) {
        assert.equal(ordinaryCalls(), initialOrdinaryCalls, 'a new repeated physical search reuses presence without model calls');
        assert.deepEqual(committed.state_payload.ordinary_materialization_atomic_write_plan ?? null, null);
      }
      attempts.push({ request: turnRequest, result });
    }
    fixtureResolution = 'inspect';
    const beforeInspection = await committedState(localPlay.postgres.partyUrl, partyId);
    const inspectionCalls = llm.requests.length;
    const inspectionRequest = { request_id: `${requestId}-inspect`, idempotency_key: `${requestId}-inspect`,
      raw_text: 'Осмотреть две вещи при мне и понять причину их состояния. Затем решить, куда идти.' };
    const inspectionResult = await post(port, `/api/v1/parties/${encodeURIComponent(partyId)}/turns`, inspectionRequest);
    assertPersistedExistingInspection({ before: beforeInspection,
      after: await committedState(localPlay.postgres.partyUrl, partyId), result: inspectionResult,
      roleInputs: llm.requests.slice(inspectionCalls).map(({ input }) => input?.request ?? input) });
    attempts.push({ request: inspectionRequest, result: inspectionResult });
    const turn = attempts.at(-1).result;
    assert.equal(turn.screen.schema, 'lower_dvina_trace_turn_screen');
    assert.equal(JSON.stringify(turn.screen).includes('hidden_truth'), false);
    const beforeRestart = await committedState(localPlay.postgres.partyUrl, partyId);
    assert.equal(beforeRestart.state_version, beforeTurn.state_version + 5);

    await localPlay.close();
    localPlay = await start();
    assert.equal(localPlay.postgres.state, 'existing');
    const screen = await get(port,
      `/api/v1/parties/${encodeURIComponent(partyId)}/screen`);
    assert.equal(JSON.stringify(screen).includes('hidden_truth'), false);
    assert.deepEqual(await committedState(localPlay.postgres.partyUrl, partyId), beforeRestart);
    const llmCalls = llm.requests.length;

    for (const attempt of attempts) {
      const replay = await post(port,
        `/api/v1/parties/${encodeURIComponent(partyId)}/turns`, attempt.request);
      assert.deepEqual(replay, attempt.result);
    }
    assert.deepEqual(await committedState(localPlay.postgres.partyUrl, partyId), beforeRestart);
    assert.equal(llm.requests.length, llmCalls);
  });

async function committedState(partyUrl, partyId) {
  const pool = new pg.Pool({ connectionString: partyUrl, max: 1 });
  try {
    const { rows: [row] } = await pool.query(
      `SELECT p.state_version, s.state_payload
         FROM party_runtime.parties p
         JOIN party_runtime.party_state_snapshots s
           ON s.party_id=p.party_id AND s.state_version=p.state_version
        WHERE p.party_id=$1`, [partyId]
    );
    assert.ok(row, 'committed party snapshot must exist');
    const [clock, body, items, activities] = await Promise.all([
      pool.query('SELECT whole_minutes,subminute_numerator,subminute_denominator FROM party_runtime.party_clocks WHERE party_id=$1', [partyId]),
      pool.query("SELECT actor_id,health,energy,satiety FROM party_runtime.party_actor_body_states WHERE party_id=$1 AND actor_kind='player_character'", [partyId]),
      pool.query('SELECT i.item_id,i.state,ip.holder_character_id FROM party_runtime.party_items i JOIN party_runtime.party_item_placements ip ON ip.party_id=i.party_id AND ip.item_id=i.item_id WHERE i.party_id=$1 ORDER BY i.item_id', [partyId]),
      pool.query('SELECT a.original_total_minutes,a.status FROM party_runtime.party_timed_activity_executions a JOIN party_runtime.party_command_idempotency i ON i.id=a.idempotency_record_id WHERE i.party_id=$1 ORDER BY a.id', [partyId])
    ]);
    return { state_version: Number(row.state_version), state_payload: row.state_payload,
      clock: clock.rows[0], body: body.rows[0], item_ids: items.rows.map(({ item_id }) => item_id),
      owned_item_names: items.rows.filter(item => item.holder_character_id === body.rows[0].actor_id).map(item => item.state.display_name),
      activities: activities.rows };

  } finally {
    await pool.end();
  }
}

async function post(port, pathname, body) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  assert.equal(response.ok, true, `${response.status}: ${JSON.stringify(payload)}`);
  return payload.data;
}

async function get(port, pathname) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`);
  const payload = await response.json();
  assert.equal(response.ok, true, `${response.status}: ${JSON.stringify(payload)}`);
  return payload.data;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function fixtureRuntime() {
  const managedRoot = localDataRoot();
  const managedPython = join(managedRoot, 'runtime', 'giga-python',
    'Scripts', 'python.exe');
  const managedModel = join(managedRoot, 'models', 'giga',
    MANAGED_RUNTIME_PINS.giga.revision);
  return Object.freeze({
    hardware: { supported: false, facts: {}, reasons: ['test fixture'] },
    giga: { python: process.env.RUS_WORLD_KNOWLEDGE_PYTHON
        ?? (existsSync(managedPython) ? managedPython : 'python'),
      modelPath: process.env.RUS_WORLD_KNOWLEDGE_MODEL_PATH
        ?? (existsSync(managedModel) ? managedModel : null),
      hfHome: process.env.HF_HOME ?? null },
    llm: null, async close() {}
  });
}

function fixtureRoleModel(input) {
  const value = input?.request ?? input;
  if (value?.schema === 'world_knowledge_query_planner_request_v1') {
    return 'fixture-world-knowledge-query-planner';
  }
  if (value?.schema === 'turn_step_request_v1') {
    return 'fixture-turn-step-planner';
  }
  if (value?.schema === 'narration_request') return 'fixture-gameplay-narrator';
  if (value?.schema === 'narration_semantic_audit_request') {
    return 'fixture-gameplay-narrator-auditor';
  }
  if (value?.remaining_intent && Array.isArray(value.operations)) {
    return 'fixture-turn-step-grounding-auditor';
  }
  throw new Error(`Unexpected fixture request schema: ${value?.schema ?? 'none'}`);
}

function searchFixtureResponse(input, resolution) {
  const request = input?.request ?? input;
  if (request?.operation?.op === 'request_discovery'
      && request.operation.query === request.remaining_intent) return {
    mode: 'focused_discovery', consumed_intent: request.remaining_intent
  };
  if (resolution === 'inspect' && request?.schema === 'turn_step_request_v1') {
    return existingInspectionFixtureResponse(request);
  }
  if (request?.schema === 'turn_step_request_v1') return {
    interpretation: { player_goal: request.root_player_action,
      grounded_attempt: request.remaining_intent, adaptation: 'literal' },
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{ op: 'request_discovery', actor_ref: request.actor.actor_id,
      discovery_kind: 'search', target_refs: [request.player_safe_state.position.location_ref],
      query: request.remaining_intent }], check: null, continuation: null,
    clarification: null, direct_result_kind: null, reason_code: 'ordinary_search',
    reason: 'Физический поиск обычной щепки.'
  };
  if (request?.schema !== 'ordinary_materialization_request_v1') return null;
  if (request.mode === 'seed_scope') return { resolution: 'seeded',
    density_band_proposal: 'ordinary', background_groups: [{ descriptor: 'Кусочки древесины среди речного сора.' }],
    reason_code: 'seed' };
  if (resolution !== 'materialize') return { resolution, semantic_admission_class: 'document_like',
    semantic_materialization_kind: 'standalone_item', reason_code: 'insufficient_support', entities: [] };
  return { resolution: 'materialize', semantic_materialization_kind: 'standalone_item',
    semantic_admission_class: 'common_mundane', reason_code: 'ordinary_wood',
    world_knowledge_claim_refs: [request.world_knowledge.facts[0].claim_ref],
    entities: [{ semantic_type: 'wood_fragment', presence_expectation: 'routine',
      mechanics_proposal: { mass_grams: 10,
        external_hand_cost: 0, carry_form: 'compact', packing_slot_cost: 1,
        quantity: { value: 1, unit: 'item' }, container: null } }] };
}
