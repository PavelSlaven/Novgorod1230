import test from 'node:test';
import assert from 'node:assert/strict';
import { runStage15NpcPlacementBlock } from '@rus/new-game/stages/stage-15/compat';
import { makeStage15Input, makeStage15Draft, makeStage15Audit } from '../fixtures/stage13-16-fixtures.mjs';

test('Stage 15 format repair replaces malformed draft', async () => {
  let formatCalls=0;
  const result=await runStage15NpcPlacementBlock({input:makeStage15Input(),place:async()=>({}),formatRepair:async()=>{formatCalls+=1;return makeStage15Draft();},semanticRepair:async()=>{throw new Error('semantic repair must not run');},audit:async()=>makeStage15Audit()});
  assert.equal(result.pass,true);assert.equal(formatCalls,1);
});

test('Stage 15 semantic repair removes forbidden premature item content', async () => {
  let semanticCalls=0;
  const result=await runStage15NpcPlacementBlock({input:makeStage15Input(),place:async()=>makeStage15Draft({items:{id:'forbidden'}}),semanticRepair:async()=>{semanticCalls+=1;return makeStage15Draft();},audit:async()=>makeStage15Audit()});
  assert.equal(result.pass,true);assert.equal(semanticCalls,1);
});
