import test from 'node:test';
import assert from 'node:assert/strict';
import { createNpcActorStepHandoff, npcActorStepAtomicExtensions,
  validateNpcActorStepHandoff } from '../src/index.js';

function fixture() {
  const identity = { request_id:'req:1',root_turn_id:'turn:p:1',
    boundary_id:'boundary:1',committed_state_version:1,decision_index:1,
    npc_ref:'npc:1' };
  return { request:{...identity}, plan:{ schema:'npc_step_plan_v1',...identity,
    resolution:'domain_request',operations:[{op:'request_discovery',
      actor_ref:'npc:1',discovery_kind:'look',target_refs:['place:1'],query:'что рядом'}]},
  execution:{ ordinary_materialization_atomic_write_plan:{schema:'ordinary'},
    action_production_atomic_write_plan:null,local_fire_atomic_write_plan:null,
    spatial_semantic_atomic_write_plan:null },
  objective_pin:{schema:'npc_objective_pin_v1',npc_ref:'npc:1'} };
}

test('NPC actor-step handoff seals and detaches its exact O1 extension', () => {
  const input=fixture(), sealed=createNpcActorStepHandoff(input);
  assert.equal(validateNpcActorStepHandoff(sealed),true);
  input.execution.ordinary_materialization_atomic_write_plan.schema='forged';
  assert.equal(npcActorStepAtomicExtensions(sealed)
    .ordinary_materialization_atomic_write_plan.schema,'ordinary');
  assert.equal(Object.isFrozen(sealed.objective_pin),true);
});

test('NPC actor-step handoff rejects hostile descriptors without reads', () => {
  let reads=0; const input=fixture();
  Object.defineProperty(input.execution,'ordinary_materialization_atomic_write_plan',{
    enumerable:true,get(){reads+=1;return {schema:'forged'};}});
  assert.throws(()=>createNpcActorStepHandoff(input),{
    code:'TURN_NPC_ACTOR_STEP_HANDOFF_INVALID'});
  assert.equal(reads,0);
});

test('NPC actor-step handoff rejects jointly resealed tampering', () => {
  const sealed=createNpcActorStepHandoff(fixture());
  const forged={...sealed,objective_pin:{...sealed.objective_pin,npc_ref:'npc:2'}};
  assert.equal(validateNpcActorStepHandoff(forged),false);
});
