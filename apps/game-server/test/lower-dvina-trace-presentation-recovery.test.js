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
