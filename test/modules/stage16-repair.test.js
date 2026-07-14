import test from 'node:test';
import assert from 'node:assert/strict';
import { runStage16ItemPlacementBlock } from '@rus/new-game/stages/stage-16/compat';
import { makeStage16Input, makeStage16Draft, makeStage16Audit } from '../fixtures/stage13-16-fixtures.mjs';

test('Stage 16 hard-blocks malformed code materialization without LLM draft repair', async () => {
  let repairCalls = 0;
  await assert.rejects(runStage16ItemPlacementBlock({ input: makeStage16Input(), materialize: async () => ({}), formatRepair: async () => { repairCalls += 1; return makeStage16Draft(); }, semanticRepair: async () => { repairCalls += 1; return makeStage16Draft(); }, audit: async () => makeStage16Audit() }), /failed code precheck/u);
  assert.equal(repairCalls, 0);
});

test('Stage 16 hard-blocks forbidden item content without semantic repair', async () => {
  let repairCalls = 0;
  await assert.rejects(runStage16ItemPlacementBlock({ input: makeStage16Input(), materialize: async () => makeStage16Draft({ future_plot_item: { id: 'wish' } }), semanticRepair: async () => { repairCalls += 1; return makeStage16Draft(); }, audit: async () => makeStage16Audit() }), /failed code precheck/u);
  assert.equal(repairCalls, 0);
});
