import test from 'node:test';
import assert from 'node:assert/strict';
import { createLlmDiagnostics } from '../src/runtime/llm-diagnostics.js';
import { createLlmTurnBudget } from '../src/runtime/llm-turn-budget.js';
import { executeTraceTurnWithDiagnostics } from '../src/runtime/lower-dvina-trace-phase-2-runtime-input.js';
import { withTurnDeadlineQueryPool, withTurnDeadlineTransaction } from
  '../src/infrastructure/postgres/query-with-turn-deadline.js';
import { createLowerDvinaTracePhase2PostgresRepository } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2.js';
import { createStateVersionRevalidator } from
  '../src/runtime/lower-dvina-trace-phase-2-runtime-input.js';
import { createLowerDvinaTracePhase2StateReader } from
  '../src/runtime/lower-dvina-trace-phase-2-state-reader.js';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { fixture } from './lower-dvina-trace-phase-2-fixture.js';

test('Postgres read queries receive the current gameplay deadline as statement timeout', async () => {
  let remainingMs = 1_234.8;
  const queries = [];
  const turnBudget = {
    assertWithinDeadline() {},
    remaining: () => ({ deadline_ms: remainingMs })
  };
  const client = {
    query: async (...args) => { queries.push(args); return {}; },
    release() {}
  };
  const pool = { connect: (callback) => callback(null, client, () => client.release()) };
  const readPool = withTurnDeadlineQueryPool(pool, turnBudget);
  await readPool.query({ text: 'SELECT 1' });
  remainingMs = 45.2;
  await readPool.query({ text: 'SELECT 2' });
  assert.deepEqual(queries, [
    ['SET statement_timeout = 1234'], [{ text: 'SELECT 1' }], ['RESET statement_timeout'],
    ['SET statement_timeout = 45'], [{ text: 'SELECT 2' }], ['RESET statement_timeout']
  ]);
});

test('Postgres acquisition after the gameplay deadline releases without querying', async () => {
  let released = 0;
  let queries = 0;
  const turnBudget = {
    assertWithinDeadline() {},
    remaining: () => ({ deadline_ms: 1, llm_budget_ms: 1 })
  };
  const client = { query() { queries += 1; }, release() { released += 1; } };
  const pool = {
    connect(callback) { setTimeout(() => callback(null, client, () => client.release()), 10); }
  };
  await assert.rejects(withTurnDeadlineQueryPool(pool, turnBudget).query({ text: 'SELECT 1' }),
    { code: 'LLM_TURN_BUDGET_EXHAUSTED' });
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(queries, 0);
  assert.equal(released, 1);
});

test('failed deadline transaction cleanup destroys the client without masking work failure', async () => {
  for (const failingStatement of ['ROLLBACK', 'RESET statement_timeout']) {
    const released = [];
    const workFailure = new Error('injected work failure');
    const client = {
      async query(query) {
        if (query === failingStatement) throw new Error(`injected ${query} failure`);
        if (query === 'SELECT fails') throw workFailure;
        return {};
      },
      release(error) { released.push(error); }
    };
    const pool = { connect(callback) { callback(null, client); } };
    await assert.rejects(withTurnDeadlineTransaction(pool, {
      assertWithinDeadline() {},
      remaining: () => ({ deadline_ms: 1_000, llm_budget_ms: 1_000 })
    }, (tx) => tx.query('SELECT fails')), (error) => {
      assert.equal(error, workFailure);
      return true;
    });
    assert.equal(released.length, 1);
    assert.match(released[0]?.message ?? '', new RegExp(failingStatement));
  }
});

test('Phase 2 replay read uses a deadline-bound read-only pool', async () => {
  const queries = [];
  const turnBudget = { assertWithinDeadline() {},
    remaining: () => ({ deadline_ms: 1_000, llm_budget_ms: 1_000 }) };
  const client = {
    async query(query) {
      queries.push(query);
      if (typeof query === 'object') return { rowCount: 0, rows: [] };
      return {};
    },
    release() {}
  };
  const repository = createLowerDvinaTracePhase2PostgresRepository({
    partyPool: {
      query() { throw new Error('unexpected direct pool query'); },
      connect(callback) { callback(null, client, () => client.release()); }
    },
    committer: { commit() {} }
  });
  assert.equal(await repository.loadPhase2Replay({ partyId: 'party',
    idempotencyKey: 'key', turnBudget }), null);
  assert.equal(queries[0], 'SET statement_timeout = 1000');
  assert.match(queries[1].text, /party_command_idempotency/u);
  assert.equal(queries[2], 'RESET statement_timeout');
  assert.equal(queries.includes('BEGIN'), false);
});

test('Phase 2 state-version read uses a deadline-bound read-only pool', async () => {
  const queries = [];
  const turnBudget = { assertWithinDeadline() {},
    remaining: () => ({ deadline_ms: 1_000, llm_budget_ms: 1_000 }) };
  const client = {
    async query(query) {
      queries.push(query);
      if (typeof query === 'object') return { rowCount: 1,
        rows: [{ party_state_version: '17', delivery_ack_result: { pass: true } }] };
      return {};
    },
    release() {}
  };
  const repository = createLowerDvinaTracePhase2PostgresRepository({
    partyPool: {
      query() { throw new Error('unexpected direct pool query'); },
      connect(callback) { callback(null, client, () => client.release()); }
    },
    committer: { commit() {} }
  });
  assert.equal(await repository.loadPhase2StateVersion('party', { turnBudget }), 17);
  assert.equal(queries[0], 'SET statement_timeout = 1000');
  assert.match(queries[1].text, /SELECT p\.state_version/u);
  assert.equal(queries[2], 'RESET statement_timeout');
  assert.equal(queries.includes('BEGIN'), false);
  assert.equal(queries.some((query) => String(query)
    .includes("set_config('statement_timeout'")), false);
});

test('Phase 2 state revalidators forward deadline to version reader', async () => {
  const calls = [];
  const turnBudget = {};
  const repository = {
    async loadPhase2StateVersion(partyId, options) {
      calls.push({ partyId, options });
      return 17;
    }
  };
  const stateReader = createLowerDvinaTracePhase2StateReader({ repository,
    partyId: 'party', idempotencyKey: 'key', state: {}, turnBudget,
    projectCurrentScene: (state) => state });
  const revalidate = createStateVersionRevalidator({ repository,
    partyId: 'party', idempotencyKey: 'key', turnBudget });
  assert.equal(await stateReader.revalidate(), 17);
  assert.equal(await revalidate(), 17);
  assert.deepEqual(calls, [
    { partyId: 'party', options: {
      presentationIdempotencyKey: 'key', turnBudget } },
    { partyId: 'party', options: {
      presentationIdempotencyKey: 'key', turnBudget } }
  ]);
});

test('initial Phase 2 state reader reuses its per-attempt state without mutation',
  async () => {
    const state = { party_state: { state_version: 17 }, items: [{ id: 'item' }] };
    const before = structuredClone(state);
    let projected = null;
    const reader = createLowerDvinaTracePhase2StateReader({
      repository: {}, partyId: 'party', idempotencyKey: 'key', state,
      projectCurrentScene: (value) => {
        projected = value;
        return { ...value, current_visible_context: { visible_scene: 'Берег' } };
      }
    });
    const result = await reader.read({ revalidation: false });
    assert.equal(projected, state);
    assert.deepEqual(state, before);
    assert.notEqual(result, state);
  });

test('replay deadline after visible read does not call narrator', async () => {
  let visibleRead = false, narratorCalls = 0;
  const visiblePayload = {
    perceived_scene: 'Берег Северной Двины.', perceived_changes: [],
    sensory_details: [], visible_npcs: [], visible_objects: [],
    known_context: [], uncertainties: []
  };
  const packageDigest = computeSpatialV3CanonicalDigest(visiblePayload);
  const turnBudget = {
    assertWithinDeadline() {
      if (visibleRead) {
        const error = new Error('Gameplay LLM turn budget is exhausted.');
        error.code = 'LLM_TURN_BUDGET_EXHAUSTED';
        throw error;
      }
    },
    remaining: () => ({ deadline_ms: 1_000, llm_budget_ms: 1_000 })
  };
  const client = {
    async query(query) {
      if (typeof query === 'object') {
        visibleRead = true;
        return { rowCount: 1,
          rows: [{ visible_payload: visiblePayload, package_digest: packageDigest }] };
      }
      return {};
    },
    release() {}
  };
  const repository = createLowerDvinaTracePhase2PostgresRepository({
    partyPool: {
      query() { throw new Error('unexpected direct query'); },
      connect(callback) { callback(null, client, () => client.release()); }
    },
    committer: { commit() {} }
  });
  await assert.rejects(repository.replayPhase2Turn({
    partyId: 'party',
    replay: {
      input_digest: 'input',
      screen: { screen_status: 'committed_presentation_pending', turn_id: 'turn' },
      state: { last_turn: {
        visible_package: { package_id: 'package', package_digest: packageDigest },
        raw_text: 'Осмотреть берег.', option_id: 'turn_step_execution_draft'
      } }
    },
    narrator: { async run() { narratorCalls += 1; } },
    turnBudget
  }), { code: 'LLM_TURN_BUDGET_EXHAUSTED' });
  assert.equal(narratorCalls, 0);
});

test('trace retry shares one turn budget context', async () => {
  const budget = createLlmTurnBudget();
  const diagnostics = createLlmDiagnostics({ turnBudget: budget });
  const contexts = [];
  let attempts = 0;
  const result = await executeTraceTurnWithDiagnostics(diagnostics,
    { party_id: 'party-1', request_id: 'request-1' }, async () => {
      contexts.push(budget.current());
      if (attempts++ === 0) {
        const error = new Error('retry');
        error.code = 'TRACE_PHASE_7_AUTONOMOUS_RETRY_REQUIRED';
        throw error;
      }
      return 'done';
    });
  assert.equal(result, 'done');
  assert.equal(contexts.length, 2);
  assert.equal(contexts[0], contexts[1]);
});

test('pre-commit reserve blocks phase 2 repository commit', async () => {
  let now = 0;
  const budget = createLlmTurnBudget({ now: () => now });
  const diagnostics = createLlmDiagnostics({ now: () => now, turnBudget: budget });
  const f = fixture({ llmDiagnostics: diagnostics, beforeRandomSource() { now = 25_000; } });
  await assert.rejects(f.runtime.submitTurn({ partyId: f.partyId, input: {
    request_id: 'budget-precommit', idempotency_key: 'budget-precommit',
    raw_text: 'Осмотреть лодку, верёвку и следы. Понять, что здесь случилось.'
  } }), (error) => {
    assert.equal(error.code, 'LLM_TURN_BUDGET_EXHAUSTED');
    assert.equal(error.budget_exhausted, true);
    assert.equal(error.deadline_exceeded, false);
    return true;
  });
  assert.equal(f.commitCount(), 0);
});

test('pre-commit reserve permits phase 2 repository commit before boundary', async () => {
  let now = 0;
  const budget = createLlmTurnBudget({ now: () => now });
  const diagnostics = createLlmDiagnostics({ now: () => now, turnBudget: budget });
  const f = fixture({ llmDiagnostics: diagnostics, beforeRandomSource() { now = 24_999; } });
  await f.runtime.submitTurn({ partyId: f.partyId, input: {
    request_id: 'budget-precommit-ok', idempotency_key: 'budget-precommit-ok',
    raw_text: 'Осмотреть лодку, верёвку и следы. Понять, что здесь случилось.'
  } });
  assert.equal(f.commitCount(), 1);
  assert.equal(f.lastCommitInput().turnBudget, budget);
});

test('whole-turn deadline stops post-commit projection before narration or screen persistence', async () => {
  let now = 0;
  const budget = createLlmTurnBudget({ now: () => now });
  const diagnostics = createLlmDiagnostics({ now: () => now, turnBudget: budget });
  const f = fixture({ llmDiagnostics: diagnostics,
    beforeRandomSource() { now = 24_999; },
    afterCommittedVisibleRead() { now = 30_000; } });
  await assert.rejects(f.runtime.submitTurn({ partyId: f.partyId, input: {
    request_id: 'budget-post-commit-visible',
    idempotency_key: 'budget-post-commit-visible',
    raw_text: 'Осмотреть лодку, верёвку и следы. Понять, что здесь случилось.'
  } }), (error) => {
    assert.equal(error.code, 'LLM_TURN_BUDGET_EXHAUSTED');
    assert.equal(error.deadline_exceeded, true);
    assert.equal(error.budget_exhausted, false);
    return true;
  });
  assert.equal(f.commitCount(), 1);
  assert.equal(f.narratorInput(), null);
  assert.equal(f.events.includes('persist_screen'), false);
});

test('whole-turn deadline waits for narration then stops screen persistence', async () => {
  let now = 0;
  const budget = createLlmTurnBudget({ now: () => now });
  const diagnostics = createLlmDiagnostics({ now: () => now, turnBudget: budget });
  const f = fixture({ llmDiagnostics: diagnostics,
    beforeRandomSource() { now = 24_999; },
    afterNarration() { now = 30_000; } });
  await assert.rejects(f.runtime.submitTurn({ partyId: f.partyId, input: {
    request_id: 'budget-post-commit-narration',
    idempotency_key: 'budget-post-commit-narration',
    raw_text: 'Осмотреть лодку, верёвку и следы. Понять, что здесь случилось.'
  } }), (error) => {
    assert.equal(error.code, 'LLM_TURN_BUDGET_EXHAUSTED');
    assert.equal(error.deadline_exceeded, true);
    return true;
  });
  assert.notEqual(f.narratorInput(), null);
  assert.equal(f.events.includes('persist_screen'), false);
});
