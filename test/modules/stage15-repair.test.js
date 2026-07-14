import test from 'node:test';
import assert from 'node:assert/strict';
import { runStage15NpcPlacementBlock } from '@rus/new-game/stages/stage-15/compat';
import { makeStage15Input, makeStage15Draft, makeStage15Audit } from '../fixtures/stage13-16-fixtures.mjs';

test('Stage 15 hard-blocks malformed code materialization without LLM draft repair', async () => {
  let repairCalls = 0;
  await assert.rejects(runStage15NpcPlacementBlock({ input: makeStage15Input(), materialize: async () => ({}), formatRepair: async () => { repairCalls += 1; return makeStage15Draft(); }, semanticRepair: async () => { repairCalls += 1; return makeStage15Draft(); }, audit: async () => makeStage15Audit() }), /failed code precheck/u);
  assert.equal(repairCalls, 0);
});

test('Stage 15 hard-blocks forbidden instance content without semantic repair', async () => {
  let repairCalls = 0;
  await assert.rejects(runStage15NpcPlacementBlock({ input: makeStage15Input(), materialize: async () => makeStage15Draft({ items: { id: 'forbidden' } }), semanticRepair: async () => { repairCalls += 1; return makeStage15Draft(); }, audit: async () => makeStage15Audit() }), /failed code precheck/u);
  assert.equal(repairCalls, 0);
});
