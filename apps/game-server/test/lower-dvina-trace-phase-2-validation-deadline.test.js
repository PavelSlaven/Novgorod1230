import test from 'node:test';
import assert from 'node:assert/strict';
import { createLowerDvinaTracePhase2Runtime } from
  '../src/runtime/lower-dvina-trace-phase-2.js';

test('post-opening validation read keeps current turn budget before DB work',
  async () => {
    let expired = false, stateReads = 0;
    const turnBudget = { assertWithinDeadline() {
      if (!expired) return;
      const error = new Error('Gameplay LLM turn budget is exhausted.');
      error.code = 'LLM_TURN_BUDGET_EXHAUSTED';
      throw error;
    } };
    const runtime = createLowerDvinaTracePhase2Runtime({
      repository: {
        async loadPhase2State(_partyId, { turnBudget: receivedTurnBudget }) {
          assert.equal(receivedTurnBudget, turnBudget);
          receivedTurnBudget.assertWithinDeadline();
          stateReads += 1;
        },
        async commitPhase2Turn() {},
        async loadPhase2VisibleContext() {},
        async persistPhase2Screen() {},
        async loadPhase2Replay() {}
      },
      semanticResolver() {}, narrator: { async run() {} },
      randomSourceFactory() {}, decisionSecret: 'test',
      llmTurnBudget: turnBudget, llmDiagnostics: { turnBudget: {} }
    });
    assert.equal(runtime.llmTurnBudget, turnBudget);
    expired = true;
    await assert.rejects(runtime.validateSessionRead({ partyId: 'party' }),
      { code: 'LLM_TURN_BUDGET_EXHAUSTED' });
    assert.equal(stateReads, 0);
  });
