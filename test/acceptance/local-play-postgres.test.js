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

test('local play persists a free turn and replays it after a server restart',
  { timeout: 600_000, skip: process.platform !== 'win32'
      || process.arch !== 'x64' }, async (context) => {
    const suffix = randomUUID().replaceAll('-', '');
    const directory = await mkdtemp(join(tmpdir(), 'novgorod-local-play-'));
    const dataRoot = join(directory, 'data');
    const settings = Object.freeze({ ...LOCAL_POSTGRES });
    const port = await freePort();
    const canonical = createCanonicalPhase11LlmResponder();
    const llm = await startLocalLlmProviderFixture({ respond: (request) =>
      request.body.messages?.[0]?.content === 'Return a JSON object with {"ok":true}.'
        ? { ok: true }
        : canonical({ ...request, model: fixtureRoleModel(request.input) })
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
      provisionRuntime: async () => fixtureRuntime(), log: () => {} });
    localPlay = await start();

    const requestId = `local-play-turn-${suffix}`;
    const started = await post(port, '/api/v1/new-games', {
      scenario_id: 'lower_dvina_trace_v1', request_id: `local-play-new-${suffix}`
    });
    const partyId = started.party_id;
    await post(port, `/api/v1/parties/${encodeURIComponent(partyId)}/opening-ack`, {
      client_ack_id: `local-play-opening-${suffix}`
    });
    const beforeTurn = await committedState(localPlay.postgres.partyUrl, partyId);
    const turnRequest = {
      request_id: requestId,
      idempotency_key: requestId,
      raw_text: 'Осматриваюсь вокруг.'
    };
    const turn = await post(port,
      `/api/v1/parties/${encodeURIComponent(partyId)}/turns`, turnRequest);
    assert.equal(turn.screen.schema, 'lower_dvina_trace_turn_screen');
    assert.equal(JSON.stringify(turn.screen).includes('hidden_truth'), false);
    const beforeRestart = await committedState(localPlay.postgres.partyUrl, partyId);
    assert.equal(beforeRestart.state_version, beforeTurn.state_version + 1);

    await localPlay.close();
    localPlay = await start();
    assert.equal(localPlay.postgres.state, 'existing');
    const screen = await get(port,
      `/api/v1/parties/${encodeURIComponent(partyId)}/screen`);
    assert.equal(JSON.stringify(screen).includes('hidden_truth'), false);
    assert.deepEqual(await committedState(localPlay.postgres.partyUrl, partyId), beforeRestart);
    const llmCalls = llm.requests.length;

    const replay = await post(port,
      `/api/v1/parties/${encodeURIComponent(partyId)}/turns`, turnRequest);
    assert.deepEqual(replay, turn);
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
    return {
      state_version: Number(row.state_version),
      state_payload: row.state_payload
    };
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
