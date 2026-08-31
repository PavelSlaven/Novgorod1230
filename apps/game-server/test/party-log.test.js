import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createPartyLog,
  createPartyLoggingRoot
} from '../src/infrastructure/filesystem/party-log.js';
import { createLlmRoleRunnerAdapter } from '../src/adapters/llm-role-runner.js';
import { createLlmDiagnostics } from '../src/runtime/llm-diagnostics.js';
import { readServerConfig } from '../src/config.js';

test('server config exposes LOG_DIRECTORY for party logs', () => {
  assert.equal(readServerConfig({ LOG_DIRECTORY: 'D:\\game-logs' }).logDirectory,
    'D:\\game-logs');
});

test('party log records complete player flow and detailed LLM trace in one JSONL file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rus-party-log-'));
  let failTurn = false;
  const root = {
    startNewGame: async () => ({
      party_id: 'party:abc', screen: { main_prose: 'Начало пути.' }
    }),
    acknowledgeOpening: async () => ({ party_id: 'party:abc', status: 'ok' }),
    submitTurn: async (_partyId, input) => {
      if (failTurn) throw Object.assign(new Error('turn failed'), {
        code: 'TURN_FAILED', details: { phase: 'resolve' }
      });
      return {
        party_id: 'party:abc', turn: { turn_number: 1 },
        screen: { main_prose: `Результат: ${input.raw_text}` }
      };
    },
    getPartyScreen: async () => ({
      party_id: 'party:abc', turn_number: 1,
      screen: { main_prose: 'Текущий экран.' }
    })
  };
  let llmReport = {
    request_id: 'turn-request-1',
    waterfall: [{ role: 'turn_step_planner', status: 'ok' }],
    calls: [{
      role_id: 'turn_step_planner',
      request: { messages: [{ role: 'user', content: 'Осмотреться' }] },
      response: { status: 'ok', parsed_json: { outcome: 'observed' } }
    }]
  };
  const llmDiagnostics = { takeLogReport: () => {
    const report = llmReport;
    llmReport = null;
    return report;
  } };
  const writes = [];
  const fileLog = createPartyLog({ directory,
    now: () => '2026-08-31T18:00:00.000Z' });
  let time = 0;
  const logged = createPartyLoggingRoot({
    root,
    partyLog: { append(...args) {
      const write = fileLog.append(...args);
      writes.push(write);
      return write;
    } },
    llmDiagnostics,
    metadata: { release_id: 'release-1' },
    clock: () => { time += 5; return time; }
  });

  await logged.startNewGame({ scenario_id: 'scenario-1' });
  await logged.acknowledgeOpening('party:abc', { client_ack_id: 'ack-1' });
  await logged.submitTurn('party:abc', { raw_text: 'Осмотреться' });
  failTurn = true;
  await assert.rejects(
    logged.submitTurn('party:abc', { raw_text: 'Прыгнуть в небо' }),
    { code: 'TURN_FAILED' }
  );
  await logged.getPartyScreen('party:abc');
  await new Promise(setImmediate);
  await Promise.allSettled(writes);

  const path = join(directory, 'party_abc.jsonl');
  const events = (await readFile(path, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.map(({ event }) => event), [
    'party.created', 'opening.acknowledged',
    'turn.requested', 'turn.completed',
    'turn.requested', 'turn.failed', 'screen.read'
  ]);
  assert.equal(events[0].metadata.release_id, 'release-1');
  assert.equal(events[2].input.raw_text, 'Осмотреться');
  assert.equal(events[3].output.screen.main_prose, 'Результат: Осмотреться');
  assert.equal(events[3].llm.calls[0].request.messages[0].content, 'Осмотреться');
  assert.equal(events[5].error.details.phase, 'resolve');
  assert.ok(events.every((event) => event.schema === 'rus.party_game_log_event.v1'
    && event.party_id === 'party:abc'));
});

test('party log failure never converts completed gameplay into client failure', async () => {
  const errors = [];
  const root = {
    startNewGame: async () => ({ party_id: 'party-1', screen: {} }),
    acknowledgeOpening: async () => ({ party_id: 'party-1' }),
    submitTurn: async () => ({ party_id: 'party-1', screen: {} }),
    getPartyScreen: async () => ({ party_id: 'party-1', screen: {} })
  };
  const logged = createPartyLoggingRoot({
    root,
    partyLog: { append: async () => { throw new Error('disk full'); } },
    onLogError: (...args) => errors.push(args)
  });
  assert.equal((await logged.startNewGame({})).party_id, 'party-1');
  await new Promise(setImmediate);
  assert.equal(errors.length, 1);
});

test('pending party log append never delays submitTurn', async () => {
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const logged = createPartyLoggingRoot({
    root: {
      startNewGame: async () => ({ party_id: 'party-1' }),
      acknowledgeOpening: async () => ({ party_id: 'party-1' }),
      submitTurn: async () => ({ party_id: 'party-1', screen: {} }),
      getPartyScreen: async () => ({ party_id: 'party-1', screen: {} })
    },
    partyLog: { append: () => blocked }
  });

  const outcome = await Promise.race([
    logged.submitTurn('party-1', { raw_text: 'Идти' }),
    new Promise((resolve) => setTimeout(() => resolve('timed-out'), 20))
  ]);
  release();
  assert.notEqual(outcome, 'timed-out');
  assert.equal(outcome.party_id, 'party-1');
});

test('failed turn cannot reuse consumed LLM trace from previous turn', async () => {
  const diagnostics = createLlmDiagnostics();
  const events = [];
  let turn = 0;
  const logged = createPartyLoggingRoot({
    root: {
      startNewGame: async () => ({ party_id: 'party-1' }),
      acknowledgeOpening: async () => ({ party_id: 'party-1' }),
      async submitTurn() {
        turn += 1;
        if (turn > 1) throw new Error('failed before LLM');
        return diagnostics.runTurn({ party_id: 'party-1', request_id: 'turn-1' },
          async () => {
            diagnostics.telemetry.onDetail({ request: 'first turn prompt' });
            return { party_id: 'party-1', screen: {} };
          });
      },
      getPartyScreen: async () => ({ party_id: 'party-1', screen: {} })
    },
    partyLog: { append: async (_partyId, event) => { events.push(event); } },
    llmDiagnostics: diagnostics
  });

  await logged.submitTurn('party-1', { raw_text: 'Первый ход' });
  await assert.rejects(logged.submitTurn('party-1', { raw_text: 'Второй ход' }),
    /failed before LLM/u);
  const failed = events.find(({ event }) => event === 'turn.failed');
  assert.equal(failed.llm, null);
});

test('party log excludes custom provider credentials and endpoint', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rus-party-log-secret-'));
  const apiKey = 'SECRET_SENTINEL';
  const baseUrl = 'https://private.example.test/v1';
  const originalFetch = globalThis.fetch;
  let providerCall;
  globalThis.fetch = async (url, init) => {
    providerCall = { url: String(url), authorization: init.headers.Authorization };
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"action":"look"}' } }] })
    };
  };
  try {
    const diagnostics = createLlmDiagnostics();
    const runner = createLlmRoleRunnerAdapter({
      settings: { providerSnapshot: () => ({
        mode: 'custom', baseUrl, model: 'private-model', apiKey
      }) },
      telemetry: diagnostics.telemetry,
      turnBudget: diagnostics.turnBudget
    });
    const writes = [];
    const fileLog = createPartyLog({ directory });
    const logged = createPartyLoggingRoot({
      root: {
        startNewGame: async () => ({ party_id: 'party-secret' }),
        acknowledgeOpening: async () => ({ party_id: 'party-secret' }),
        submitTurn: () => diagnostics.runTurn({
          party_id: 'party-secret', request_id: 'turn-secret'
        }, async () => {
          await runner.run({
            scope: 'turn_runtime', role_id: 'turn_step_planner',
            request_identity: 'turn-secret:step-1',
            messages: [{ role: 'user', content: 'Осмотреться' }]
          });
          return { party_id: 'party-secret', screen: {} };
        }),
        getPartyScreen: async () => ({ party_id: 'party-secret' })
      },
      partyLog: { append(...args) {
        const write = fileLog.append(...args);
        writes.push(write);
        return write;
      } },
      llmDiagnostics: diagnostics
    });

    await logged.submitTurn('party-secret', { raw_text: 'Осмотреться' });
    await new Promise(setImmediate);
    await Promise.allSettled(writes);
    const serialized = await readFile(join(directory, 'party-secret.jsonl'), 'utf8');

    assert.equal(providerCall.authorization, `Bearer ${apiKey}`);
    assert.equal(providerCall.url, `${baseUrl}/chat/completions`);
    assert.equal(serialized.includes(apiKey), false);
    assert.equal(serialized.includes(baseUrl), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
