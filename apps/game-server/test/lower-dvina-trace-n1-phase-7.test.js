import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest } from '@rus/materialization';
import { assertPhase7OwnerResult } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-7-owner-result.js';
import { loadLowerDvinaTraceNpcSemanticProfile } from
  '../src/internal/lower-dvina-trace-npc-semantic-profile.js';
import { createLowerDvinaTraceN1ProductionOwnerFactory } from
  '../src/runtime/releases/lower-dvina-trace-n1-production.js';
import { approvedPhase7Contracts, phase7DiscoveryPlan } from
  './lower-dvina-trace-phase-7-contract-fixture.js';
import { phase7Command, phase7CommittedState, phase7PlayerInput } from
  './lower-dvina-trace-phase-7-runtime-fixture.js';

test('Phase 7 carries an actor-scoped O1 plan through the sealed handoff',async()=>{
  const state=phase7CommittedState(),contracts=approvedPhase7Contracts(state);
  contracts.npcSemanticProfile={discovery:{
    target_ref:'trace_ld_v1_loc_zhdanko_storehouse'}};
  let modelCalls=0,ownerCalls=0;
  const objective={schema:'lower_dvina_trace_n1_objective_pin_v1',
    profile_ref:'n1',profile_version:1,profile_digest:'a'.repeat(64),
    profile_canonical_digest:'b'.repeat(64),npc_ref:'zhdanko-1',
    participant_slot_ref:'zhdanko_storehouse_controller',
    npc_profile_set_ref:'trace_ld_v1_zhdanko_storehouse_controller_v1',
    location_profile_ref:'trace_ld_v1_loc_zhdanko_storehouse',
    zone_ref:'storehouse_yard',required_status:'active',
    target_ref:'trace_ld_v1_loc_zhdanko_storehouse',
    access_policy_ref:'trace_ld_v1_access_zhdanko_storehouse',
    scope_ref:{entity_kind:'g6',entity_id:'trace_ld_v1_loc_zhdanko_storehouse',
      position_ref:'trace_ld_v1_loc_zhdanko_storehouse'},
    objective_digest:'c'.repeat(64)};
  const owner={capability(){return {operation_contract:{owner:'@rus/materialization',
    allowed:[{actor_ref:'zhdanko-1',discovery_kind:'look',
      target_refs:['trace_ld_v1_loc_zhdanko_storehouse']}],
    factual_outcome_write:'owner_only'},objective_pin:objective};},
  async resolve(){ownerCalls+=1;return {objective_pin:objective,
    ordinary_materialization_atomic_write_plan:{schema:'ordinary-test-plan'}};}};
  const consequence=await phase7Command({state,contracts,
    npcSemanticRemainderOwner:owner,model:async(request)=>{
      modelCalls+=1;return phase7DiscoveryPlan(request);}}).consequence({
    retrievedState:state,playerInput:phase7PlayerInput(state,'n1-discovery')});
  assert.equal(modelCalls,1);assert.equal(ownerCalls,1);
  assert.equal(consequence.phase7.schedule_execution.semantic_operation.op,
    'request_discovery');
  assert.equal(consequence.npc_actor_step_handoff.schema,
    'npc_actor_step_handoff_v1');
  assert.equal(consequence.npc_actor_step_handoff
    .ordinary_materialization_atomic_write_plan.schema,'ordinary-test-plan');
});

test('Phase 7 binds every sealed handoff identity field to the actual NPC request',async()=>{
  const loaded=await loadLowerDvinaTraceNpcSemanticProfile();
  const state=phase7CommittedState(),contracts=approvedPhase7Contracts(state);
  const npc=state.npcs.find(({participant_slot_ref:slot})=>
    slot==='zhdanko_storehouse_controller');
  npc.profile_id=loaded.profile.boundary.npc_profile_set_ref;
  delete npc.profile_set_id;
  npc.location_profile_ref=loaded.profile.boundary.location_profile_ref;
  npc.machine_state.location_ref=loaded.profile.boundary.location_profile_ref;
  npc.machine_state.spatial_zone_ref=loaded.profile.boundary.zone_ref;
  npc.machine_state.status=loaded.profile.boundary.required_status;
  contracts.npcSemanticProfile=loaded.profile;
  contracts.npcSemanticAuthority=loaded;
  const productionOwner=createLowerDvinaTraceN1ProductionOwnerFactory({
    loadedProfile:loaded,loadEnablement:async()=>null,
    ordinaryMaterializationModel:async()=>null})({
    partyId:state.party_id,inputDigest:'a'.repeat(64)});
  const capability=productionOwner.capability({state:{npcs:[{
    instance_id:npc.instance_id,participant_slot_ref:npc.participant_slot_ref,
    profile_id:npc.profile_id,machine_state:structuredClone(
      npc.machine_state)}]},contracts:{npcSemanticProfile:loaded.profile}});
  assert.ok(capability);
  const owner={capability:()=>capability,async resolve(){return {
    objective_pin:capability.objective_pin,
    ordinary_materialization_atomic_write_plan:{schema:'ordinary-test-plan'}
  };}};
  const consequence=await phase7Command({state,contracts,
    npcSemanticRemainderOwner:owner,
    model:async(request)=>phase7DiscoveryPlan(request)}).consequence({
    retrievedState:state,playerInput:phase7PlayerInput(state,'n1-identity')});
  const factual={consequence,mode_resolution:{turn_id:
    consequence.phase7.autonomous.request.root_turn_id},time_update:{clock_after:
    consequence.phase7.schedule_temporal.result.clock_after},body_update:{
    applied:true,proposal:{profile_ref:contracts.bodyEffect.effect_profile_id}}};
  const changeSetId=consequence.phase7.temporal.result.combined_change_set
    .change_set_id;
  assert.doesNotThrow(()=>assertPhase7OwnerResult({factual,state,
    phase7Contracts:contracts,changeSetId}));
  for(const field of ['request_id','root_turn_id','boundary_id',
    'committed_state_version','decision_index','npc_ref']) {
    const copy=structuredClone(factual);
    const handoff=copy.consequence.npc_actor_step_handoff;
    handoff.request_identity[field]=typeof handoff.request_identity[field]
      ==='number'?handoff.request_identity[field]+1:`forged-${field}`;
    const {handoff_digest:ignored,...unsigned}=handoff;
    handoff.handoff_digest=canonicalDigest(unsigned);
    assert.throws(()=>assertPhase7OwnerResult({factual:copy,state,
      phase7Contracts:contracts,changeSetId}),{
      code:'TRACE_PHASE_7_OWNER_RESULT_INVALID'});
  }
});
