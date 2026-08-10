import assert from 'node:assert/strict';
import test from 'node:test';
import { executeTraceTurnWithAutonomousRetry,
  validateConversationDependencies } from
  '../src/runtime/lower-dvina-trace-phase-2-runtime-input.js';

test('revision 15 does not require the Phase 7 model on earlier turns', () => {
  assert.doesNotThrow(() => validateConversationDependencies({
    scenarioDefinitionRevision: 15,
    playerConversationModel() {},
    npcSemanticModel() {}
  }));
});

test('revision 16 requires the combat model only at a combat boundary', () => {
  assert.doesNotThrow(() => validateConversationDependencies({
    scenarioDefinitionRevision: 16,
    playerConversationModel() {},
    npcSemanticModel() {}
  }));
});

test('Phase 7 stale retry is bounded to one fresh root-turn attempt',
  async () => {
    let attempts = 0;
    const retryRequired = Object.assign(new Error('stale'), {
      code: 'TRACE_PHASE_7_AUTONOMOUS_RETRY_REQUIRED'
    });
    await assert.rejects(executeTraceTurnWithAutonomousRetry(async () => {
      attempts += 1;
      throw retryRequired;
    }), retryRequired);
    assert.equal(attempts, 2);
  });

test('non-stale turn failures are not retried', async () => {
  let attempts = 0;
  const failure = Object.assign(new Error('failed'), { code: 'OTHER' });
  await assert.rejects(executeTraceTurnWithAutonomousRetry(async () => {
    attempts += 1;
    throw failure;
  }), failure);
  assert.equal(attempts, 1);
});
