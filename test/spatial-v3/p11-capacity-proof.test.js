import assert from 'node:assert/strict';
import test from 'node:test';
import { proveExpansionCapacity } from '../../tools/spatial-v3/p11-capacity-proof.mjs';
test('P11 deterministic max-flow accepts a feasible normalized slot/template graph',()=>assert.deepEqual(proveExpansionCapacity({slots:[{id:'a',maxInstances:1},{id:'b',maxInstances:1}],limits:[{template:'x',maxCount:1},{template:'y',maxCount:1}],allowed:new Map([['a',['x']],['b',['y']]])}).ok,true));
test('P11 deterministic max-flow hard-blocks shared capacity and empty candidates',()=>{assert.equal(proveExpansionCapacity({slots:[{id:'a',maxInstances:1},{id:'b',maxInstances:1}],limits:[{template:'x',maxCount:1}],allowed:new Map([['a',['x']],['b',['x']]])}).ok,false);assert.equal(proveExpansionCapacity({slots:[{id:'a',maxInstances:1}],limits:[{template:'x',maxCount:1}],allowed:new Map()}).code,'controlled_vocabulary_gap');});
test('P11 max-flow reroutes an earlier slot instead of rejecting a feasible graph',()=>{
 const proof=proveExpansionCapacity({slots:[{id:'a',maxInstances:1},{id:'b',maxInstances:1}],limits:[{template:'x',maxCount:1},{template:'y',maxCount:1}],allowed:new Map([['a',['x','y']],['b',['x']]])});
 assert.deepEqual(proof,{ok:true,requiredCapacity:2,committedCapacity:2,assignments:{'a:y':1,'b:x':1}});
});
test('P11 max-flow rejects a candidate that bypasses the approved template limit',()=>assert.deepEqual(proveExpansionCapacity({slots:[{id:'a',maxInstances:1}],limits:[{template:'x',maxCount:1}],allowed:new Map([['a',['unknown']]])}),{ok:false,code:'generated_schema_mismatch',slotId:'a',reason:'candidate_without_limit'}));
