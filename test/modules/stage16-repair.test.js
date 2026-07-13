import test from 'node:test';
import assert from 'node:assert/strict';
import { runStage16ItemPlacementBlock } from '@rus/new-game/stages/stage-16/compat';
import { makeStage16Input, makeStage16Draft, makeStage16Audit } from '../fixtures/stage13-16-fixtures.mjs';

test('Stage 16 format repair replaces malformed draft', async () => {
  let formatCalls=0;
  const result=await runStage16ItemPlacementBlock({input:makeStage16Input(),place:async()=>({}),formatRepair:async()=>{formatCalls+=1;return makeStage16Draft();},semanticRepair:async()=>{throw new Error('semantic repair must not run');},audit:async()=>makeStage16Audit()});
  assert.equal(result.pass,true);assert.equal(formatCalls,1);
});

test('Stage 16 semantic repair removes forbidden player-desire item', async () => {
  let semanticCalls=0;
  const result=await runStage16ItemPlacementBlock({input:makeStage16Input(),place:async()=>makeStage16Draft({future_plot_item:{id:'wish'}}),semanticRepair:async()=>{semanticCalls+=1;return makeStage16Draft();},audit:async()=>makeStage16Audit()});
  assert.equal(result.pass,true);assert.equal(semanticCalls,1);
});
