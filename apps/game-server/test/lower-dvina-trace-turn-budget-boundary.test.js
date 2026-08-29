import test from 'node:test';
import assert from 'node:assert/strict';
import { createLlmDiagnostics } from '../src/runtime/llm-diagnostics.js';
import { createLlmTurnBudget } from '../src/runtime/llm-turn-budget.js';
import { createLowerDvinaTraceNarrationService } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { executeTraceTurnWithDiagnostics } from '../src/runtime/lower-dvina-trace-phase-2-runtime-input.js';
import { withTurnDeadlineQueryPool, withTurnDeadlineTransaction } from
  '../src/infrastructure/postgres/query-with-turn-deadline.js';
import { createTemporalPresentationPostgresStore } from
  '../src/infrastructure/postgres/temporal-presentation-store.js';
import { createLowerDvinaTracePhase2DurableNarrator } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-presentation.js';
import { createLowerDvinaTracePhase2PrecommitNarrationApprover } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-presentation.js';
import { sealApprovedNarration } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-presentation.js';
import { loadSession } from
  '../src/infrastructure/postgres/first-playable/repository-support.js';
import { createLowerDvinaTracePhase2PostgresRepository } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2.js';
import { createStateVersionRevalidator } from
  '../src/runtime/lower-dvina-trace-phase-2-runtime-input.js';
import { createLowerDvinaTracePhase2StateReader } from
  '../src/runtime/lower-dvina-trace-phase-2-state-reader.js';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { fixture } from './lower-dvina-trace-phase-2-fixture.js';

const unusedNarrationService = { async run() { throw new Error('unexpected narration'); } };

test('temporal presentation package read uses the gameplay deadline', async () => {
  const queries = [];
  const turnBudget = { assertWithinDeadline() {},
    remaining: () => ({ deadline_ms: 1_000, llm_budget_ms: 1_000 }) };
  const client = {
    async query(query) {
      queries.push(query);
      return { rowCount: 0, rows: [] };
    },
    release() {}
  };
  const store = createTemporalPresentationPostgresStore({ pool: {
    query() { throw new Error('unexpected direct pool query'); },
    connect(callback) { callback(null, client, () => client.release()); }
  } });
  await store.loadCommittedVisiblePackage({ party_id: 'party', package_id: 'package',
    package_digest: 'digest', turnBudget });
  assert.equal(queries[0], 'SET statement_timeout = 1000');
  assert.match(queries.find((query) => typeof query === 'object').text,
    /party_visible_packages/u);
  assert.equal(queries.at(-1), 'RESET statement_timeout');
});

test('durable narrator forwards gameplay deadline to presentation store', async () => {
  const visiblePayload = { perceived_scene: 'Берег.', perceived_changes: [],
    sensory_details: [], visible_npcs: [], visible_objects: [], known_context: [],
    uncertainties: [] };
  const turnBudget = { assertWithinDeadline() {},
    remaining: () => ({ deadline_ms: 1_000, llm_budget_ms: 1_000 }) };
  const client = {
    async query(query) {
      if (typeof query === 'object') return { rows: [{ package_id: 'package',
        party_id: 'party', package_digest: computeSpatialV3CanonicalDigest(visiblePayload),
        visible_payload: visiblePayload }] };
      return {};
    },
    release() {}
  };
  let claimInput = null;
  const narrator = createLowerDvinaTracePhase2DurableNarrator({
    partyPool: { query() { throw new Error('unexpected direct pool query'); },
      connect(callback) { callback(null, client, () => client.release()); } },
    narrationService: { async run() { throw new Error('must not run'); } },
    presentationStore: { async claimPresentationAttempt(input) {
      claimInput = input;
      return { ok: true, disposition: 'in_progress', attempt_id: 'attempt' };
    } }
  });
  await assert.rejects(narrator.run({ request_id: 'turn', turnBudget,
    visible_context: { version: 1, schema: 'visible_context_package',
      visible_scene: 'Берег.', visible_changes: [], sensory_details: [],
      visible_npc: [], visible_objects: [], known_context: [], uncertainties: [],
      allowed_tensions: [], do_not_imply: [] } }),
  { code: 'TRACE_PHASE_2_NARRATION_IN_PROGRESS' });
  assert.equal(claimInput.turnBudget, turnBudget);
});

test('precommit narration approver keeps live budget outside cloneable narration request', async () => {
  const visible_payload = { perceived_scene: 'Берег.', perceived_changes: [],
    sensory_details: [], visible_npcs: [], visible_objects: [],
    known_context: [], uncertainties: [] };
  let request = null;
  const turnBudget = createLlmTurnBudget();
  const roleRunner = { async run({ role_id, messages }) {
    const payload = JSON.parse(messages.at(-1).content);
    if (role_id === 'gameplay_narrator') {
      request = payload;
      assert.ok(turnBudget.current());
      return { output: { version: 1, schema: 'narration_output',
        output_id: payload.request_id, prose: 'Вода тихо идет у берега.',
        action_options: [], used_references: [], self_check: {} } };
    }
    return { output: { version: 1, schema: 'narration_audit', pass: true,
      concerns: [], evidence: ['visible_context'] } };
  } };
  const approver = createLowerDvinaTracePhase2PrecommitNarrationApprover({
    narrationService: createLowerDvinaTraceNarrationService({ roleRunner })
  });
  const narration = await turnBudget.runTurn(() => approver.approveNarration({
    visible_package_envelope: { party_id: 'party', package_id: 'package',
      package_digest: 'digest', turn_id: 'turn', dependency_pins: {},
      visible_payload },
    turnBudget
  }));
  assert.equal(request.visible_context.visible_scene, 'Берег.');
  assert.equal(Object.hasOwn(request, 'turnBudget'), false);
  assert.equal(narration.request_id, 'turn');
  assert.equal(narration.package_id, 'package');
  assert.equal(narration.canonical_digest,
    computeSpatialV3CanonicalDigest({
      kind: narration.kind, party_id: narration.party_id,
      request_id: narration.request_id, package_id: narration.package_id,
      package_digest: narration.package_digest,
      dependency_pins: narration.dependency_pins, text: narration.text,
      flow_result: narration.flow_result
    }));
});

test('durable narrator reuses precommitted delivered narration without LLM', async () => {
  const visible_payload = { perceived_scene: 'Берег.', perceived_changes: [],
    sensory_details: [], visible_npcs: [], visible_objects: [],
    known_context: [], uncertainties: [] };
  const envelope = { party_id: 'party', package_id: 'package', turn_id: 'turn',
    package_digest: computeSpatialV3CanonicalDigest(visible_payload),
    dependency_pins: {}, visible_payload };
  const flow = { schema: 'narration_flow_result', status: 'approved', pass: true,
    approved_output: { prose: 'Вода тихо идет у берега.' } };
  const narration_output = sealApprovedNarration({ envelope, flow });
  let calls = 0;
  const client = { async query(query) {
    if (typeof query === 'object') return { rows: [envelope] };
    return {};
  }, release() {} };
  const narrator = createLowerDvinaTracePhase2DurableNarrator({
    partyPool: { query() { return { rows: [envelope] }; },
      connect(callback) { callback(null, client, () => client.release()); } },
    narrationService: { async run() { calls += 1; } },
    presentationStore: { async claimPresentationAttempt() {
      return { ok: true, disposition: 'delivered', narration_result: narration_output,
        output_digest: narration_output.canonical_digest };
    } }
  });
  const result = await narrator.run({ request_id: 'turn', visible_context: {
    version: 1, schema: 'visible_context_package', visible_scene: 'Берег.',
    visible_changes: [], sensory_details: [], visible_npc: [],
    visible_objects: [], known_context: [], uncertainties: [],
    allowed_tensions: [], do_not_imply: []
  } });
  assert.equal(calls, 0);
  assert.equal(result.presentation.output_digest, narration_output.canonical_digest);
});

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

test('initial public session read uses its gameplay deadline', async () => {
  const queries = [];
  const turnBudget = { assertWithinDeadline() {},
    remaining: () => ({ deadline_ms: 1_000, llm_budget_ms: 1_000 }) };
  const client = {
    async query(query) {
      queries.push(query);
      if (typeof query === 'object') return { rows: [{
        request_id: 'request', stage26_result: {}, delivery_attempt: {},
        delivery_ack_result: null, screen: {}, turn_number: 0,
        last_turn_id: null, state_version: 1, updated_at: null
      }] };
      return {};
    },
    release() {}
  };
  const pool = {
    query() { throw new Error('unexpected direct pool query'); },
    connect(callback) { callback(null, client, () => client.release()); }
  };
  await loadSession(pool, 'party', { turnBudget });
  assert.equal(queries[0], 'SET statement_timeout = 1000');
  assert.match(queries[1].text, /party_server_sessions/u);
  assert.equal(queries[2], 'RESET statement_timeout');
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

test('deadline transaction rolls back when timeout setup reaches deadline', async () => {
  let expired = false;
  const queries = [];
  const exhausted = () => Object.assign(
    new Error('Gameplay LLM turn budget is exhausted.'),
    { code: 'LLM_TURN_BUDGET_EXHAUSTED' }
  );
  const turnBudget = {
    assertWithinDeadline() { if (expired) throw exhausted(); },
    remaining: () => ({ deadline_ms: 1_000, llm_budget_ms: 1_000 })
  };
  const client = {
    async query(query) {
      queries.push(query);
      if (String(query).includes("set_config('statement_timeout'")) expired = true;
      return {};
    },
    release() {}
  };
  const pool = { connect(callback) { callback(null, client); } };
  await assert.rejects(withTurnDeadlineTransaction(pool, turnBudget,
    (tx) => tx.query('SELECT mutation')), { code: 'LLM_TURN_BUDGET_EXHAUSTED' });
  assert.equal(queries.includes('SELECT mutation'), false);
  assert.equal(queries.includes('ROLLBACK'), true);
});

test('deadline transaction returns after an atomic commit without rollback', async () => {
  let expired = false;
  const queries = [];
  const exhausted = () => Object.assign(
    new Error('Gameplay LLM turn budget is exhausted.'),
    { code: 'LLM_TURN_BUDGET_EXHAUSTED' }
  );
  const turnBudget = {
    assertWithinDeadline() { if (expired) throw exhausted(); },
    remaining: () => ({ deadline_ms: 1_000, llm_budget_ms: 1_000 })
  };
  const client = {
    async query(query) {
      queries.push(query);
      if (query === 'COMMIT') expired = true;
      return {};
    },
    release() {}
  };
  const pool = { connect(callback) { callback(null, client); } };
  await withTurnDeadlineTransaction(pool, turnBudget,
    (tx) => tx.query('SELECT mutation'));
  assert.equal(queries.includes('COMMIT'), true);
  assert.equal(queries.includes('ROLLBACK'), false);
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
    committer: { commit() {} }, narrationService: unusedNarrationService
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
    committer: { commit() {} }, narrationService: unusedNarrationService
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
    committer: { commit() {} }, narrationService: unusedNarrationService
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

test('whole-turn deadline returns committed pending screen before narration or screen persistence', async () => {
  let now = 0;
  const budget = createLlmTurnBudget({ now: () => now });
  const diagnostics = createLlmDiagnostics({ now: () => now, turnBudget: budget });
  const f = fixture({ llmDiagnostics: diagnostics,
    beforeRandomSource() { now = 24_999; },
    afterCommittedVisibleRead() { now = 30_000; } });
  const result = await f.runtime.submitTurn({ partyId: f.partyId, input: {
    request_id: 'budget-post-commit-visible',
    idempotency_key: 'budget-post-commit-visible',
    raw_text: 'Осмотреть лодку, верёвку и следы. Понять, что здесь случилось.'
  } });
  assert.equal(f.commitCount(), 1);
  assert.equal(result.screen.screen_status, 'committed_presentation_pending');
  assert.equal(f.narratorInput(), null);
  assert.equal(f.events.includes('persist_screen'), false);
});
