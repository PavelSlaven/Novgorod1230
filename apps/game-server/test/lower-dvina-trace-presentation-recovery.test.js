import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverTracePendingPresentation } from
  '../src/runtime/lower-dvina-trace-presentation-recovery.js';
import { createLowerDvinaTracePhase2Runtime } from
  '../src/runtime/lower-dvina-trace-phase-2.js';
import { createLlmDiagnostics } from '../src/runtime/llm-diagnostics.js';

test('pending presentation recovery replays only committed turn', async () => {
  const calls = [];
  const replay = { screen: { screen_status: 'committed_presentation_pending' } };
  const repository = {
    async loadPhase2State(partyId) {
      calls.push(['state', partyId]);
      return { last_turn: { idempotency_key: 'turn-1' } };
    },
    async loadPhase2Replay(input) {
      calls.push(['replay', input]);
      return replay;
    },
    async replayPhase2Turn(input) {
      calls.push(['presentation', input]);
      return { screen: { screen_status: 'ready' } };
    }
  };
  const result = await recoverTracePendingPresentation({ partyId: 'party-1',
    session: { screen: { screen_status: 'committed_presentation_pending' } },
    repository, narrator: { run() {} }, turnBudget: null });
  assert.equal(result.screen.screen_status, 'ready');
  assert.deepEqual(calls.map(([kind]) => kind), ['state', 'replay', 'presentation']);
  assert.equal(calls[1][1].idempotencyKey, 'turn-1');
  assert.equal(calls[2][1].replay, replay);
});

test('non-pending presentation has no recovery side effect', async () => {
  const repository = { loadPhase2State() { throw new Error('unexpected'); } };
  assert.equal(await recoverTracePendingPresentation({ partyId: 'party-1',
    session: { screen: { screen_status: 'ready' } }, repository }), null);
});

test('recovery continues in-request resolve after expected replay failure', async () => {
  let presentationCalls = 0;
  const replay = {
    input_digest: 'd'.repeat(64),
    screen: { screen_status: 'committed_presentation_pending', party_id: 'party-1',
      turn_id: 'turn-1', turn_number: 1,
      current_projection_anchor: { committed_state_version: 1,
        package_id: 'pkg', package_digest: 'dig' } },
    state: { party_id: 'party-1', party_state: { state_version: 1, turn_number: 1 },
      last_turn: { idempotency_key: 'turn-1', option_id: 'opt', visible_package: {
        package_id: 'pkg', package_digest: 'dig', change_set_id: 1 } } },
    public_result: { party_id: 'party-1', turn_number: 1, state_version: 1, option_id: 'opt',
      screen: { screen_status: 'committed_presentation_pending', party_id: 'party-1',
        turn_id: 'turn-1', turn_number: 1,
        current_projection_anchor: { committed_state_version: 1,
          package_id: 'pkg', package_digest: 'dig' } } }
  };
  const repository = {
    async loadPhase2State() { return { last_turn: { idempotency_key: 'turn-1' } }; },
    async loadPhase2Replay() { return structuredClone(replay); },
    async replayPhase2Turn() {
      presentationCalls += 1;
      if (presentationCalls === 1) {
        throw Object.assign(new Error('narration rejected'), {
          code: 'TRACE_PHASE_2_NARRATION_REJECTED'
        });
      }
      return { screen: { screen_status: 'ready' } };
    }
  };
  const result = await recoverTracePendingPresentation({
    partyId: 'party-1',
    session: { screen: { screen_status: 'committed_presentation_pending' } },
    repository, narrator: { async run() {} }, turnBudget: null
  });
  assert.equal(result.screen.screen_status, 'ready');
  assert.equal(presentationCalls, 2);
});

test('runtime recovery records narration retry under pending turn identity', async () => {
  const diagnostics = createLlmDiagnostics();
  const repository = {
    async loadPhase2State() { return { last_turn: { idempotency_key: 'turn-1' } }; },
    async loadPhase2Replay() { return { screen: { screen_status: 'committed_presentation_pending' } }; },
    async replayPhase2Turn() { return { screen: { screen_status: 'ready' } }; },
    async commitPhase2Turn() {}, async loadPhase2VisibleContext() {},
    async persistPhase2Screen() {}
  };
  const runtime = createLowerDvinaTracePhase2Runtime({ repository,
    semanticResolver: async () => ({}), narrator: { run: async () => ({}) },
    randomSourceFactory: () => ({}), decisionSecret: 'test', llmDiagnostics: diagnostics });
  await runtime.recoverPendingPresentation({ partyId: 'party-1',
    session: { screen: { screen_status: 'committed_presentation_pending', turn_id: 'turn-1' } } });
  assert.equal(diagnostics.takeLogReport({ party_id: 'party-1' }).request_id, 'turn-1');
});

test('recovery returns null (screen stays pending) when the turn budget ends during its loads', async () => {
  const exhausted = () => Object.assign(new Error('Gameplay turn safety deadline is exhausted.'),
    { code: 'LLM_TURN_BUDGET_EXHAUSTED' });
  const session = { screen: { screen_status: 'committed_presentation_pending' } };
  const never = async () => { throw new Error('unexpected'); };
  assert.equal(await recoverTracePendingPresentation({ partyId: 'party-1', session,
    repository: { loadPhase2State: async () => { throw exhausted(); },
      loadPhase2Replay: never, replayPhase2Turn: never },
    narrator: { async run() {} }, turnBudget: null }), null);
  assert.equal(await recoverTracePendingPresentation({ partyId: 'party-1', session,
    repository: { loadPhase2State: async () => ({ last_turn: { idempotency_key: 'turn-1' } }),
      loadPhase2Replay: async () => { throw exhausted(); }, replayPhase2Turn: never },
    narrator: { async run() {} }, turnBudget: null }), null);
});

test('recovery still rethrows unexpected load failures', async () => {
  await assert.rejects(recoverTracePendingPresentation({ partyId: 'party-1',
    session: { screen: { screen_status: 'committed_presentation_pending' } },
    repository: { loadPhase2State: async () => {
      throw Object.assign(new Error('db down'), { code: 'DATABASE_UNAVAILABLE' }); } },
    narrator: { async run() {} }, turnBudget: null }), { code: 'DATABASE_UNAVAILABLE' });
});
