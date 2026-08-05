import assert from 'node:assert/strict';
import test from 'node:test';
import { validateConversationDependencies } from
  '../src/runtime/lower-dvina-trace-phase-2-runtime-input.js';

test('revision 15 does not require the Phase 7 model on earlier turns', () => {
  assert.doesNotThrow(() => validateConversationDependencies({
    scenarioDefinitionRevision: 15,
    playerConversationModel() {},
    npcSemanticModel() {}
  }));
});
