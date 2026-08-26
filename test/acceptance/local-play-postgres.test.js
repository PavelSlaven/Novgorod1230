import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import test from 'node:test';

import pg from 'pg';

import { createCanonicalPhase11LlmResponder } from '../helpers/lower-dvina-phase-11-llm.js';
import { startLocalLlmProviderFixture } from '../helpers/local-llm-provider-fixture.js';
import { LOCAL_POSTGRES } from '../../tools/local-play/local-postgres.js';
import { startLocalPlay } from '../../tools/local-play/local-play.js';

test('local play persists a free turn and replays it after a server restart',
  { timeout: 600_000 }, async (context) => {
    assert.equal(docker(['version']).status, 0, 'Docker is required.');
    const suffix = randomUUID().replaceAll('-', '');
    const settings = Object.freeze({
      ...LOCAL_POSTGRES,
      container: `novgorod-local-play-test-${suffix}`,
      volume: `novgorod-local-play-test-data-${suffix}`
    });
    const port = await freePort();
    const canonical = createCanonicalPhase11LlmResponder();
    const llm = await startLocalLlmProviderFixture({ respond: (request) =>
      request.body.messages?.[0]?.content === 'Return a JSON object with {"ok":true}.'
        ? { ok: true }
        : canonical(request)
    });
    let child = null;
    context.after(async () => {
      await stop(child);
      await llm.close().catch(() => {});
      removeTestResources(settings);
    });

    const env = {
      ...process.env,
      ...llm.env,
      RUS_SERVER_PORT: String(port)
    };
    let localPlay = await startLocalPlay({ env, localPostgresSettings: settings,
      log: () => {} });
    child = localPlay.child;
    assert.equal(llm.requests.length > 0, true, 'provider preflight must run before party creation');

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

    await stop(child);
    localPlay = await startLocalPlay({ env, localPostgresSettings: settings,
      log: () => {} });
    child = localPlay.child;
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

function stop(child) {
  if (!child || child.exitCode != null) return Promise.resolve();
  child.kill('SIGTERM');
  return new Promise((resolve) => child.once('exit', resolve));
}

function removeTestResources(settings) {
  const container = docker(['container', 'inspect', settings.container]);
  if (container.status === 0) {
    assert.equal(JSON.parse(container.stdout)[0]?.Config?.Labels?.[settings.label], settings.labelValue);
    assert.equal(docker(['container', 'rm', '-f', settings.container]).status, 0);
  }
  const volume = docker(['volume', 'inspect', settings.volume]);
  if (volume.status === 0) {
    assert.equal(JSON.parse(volume.stdout)[0]?.Labels?.[settings.label], settings.labelValue);
    assert.equal(docker(['volume', 'rm', settings.volume]).status, 0);
  }
}

function docker(args) {
  return spawnSync('docker', args, { encoding: 'utf8', timeout: 60_000 });
}
