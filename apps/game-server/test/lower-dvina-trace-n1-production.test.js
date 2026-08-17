import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest } from '@rus/materialization';
import { loadLowerDvinaTraceNpcSemanticProfile } from
  '../src/internal/lower-dvina-trace-npc-semantic-profile.js';
import { createLowerDvinaTraceN1ProductionOwnerFactory } from
  '../src/runtime/releases/lower-dvina-trace-n1-production.js';
import { validateLowerDvinaTraceN1ObjectivePin } from
  '../src/runtime/releases/lower-dvina-trace-n1-production.js';
import { resolveTracePhase7Contracts } from
  '../src/runtime/lower-dvina-trace-phase-7-contracts.js';
import { fixture as phase2Fixture, loadScenarioBundle } from
  './lower-dvina-trace-phase-2-fixture.js';

async function fixture(){
  const loaded=await loadLowerDvinaTraceNpcSemanticProfile();
  const owner=createLowerDvinaTraceN1ProductionOwnerFactory({loadedProfile:loaded,
    loadEnablement:async()=>null,ordinaryMaterializationModel:async()=>null})({
      partyId:'party:n1',inputDigest:'a'.repeat(64)});
  const npc={instance_id:'npc:zhdanko',
    participant_slot_ref:'zhdanko_storehouse_controller',
    profile_id:'trace_ld_v1_zhdanko_storehouse_controller_v1',
    machine_state:{location_ref:'trace_ld_v1_loc_zhdanko_storehouse',
      spatial_zone_ref:'storehouse_yard',status:'active'}};
  return {loaded,owner,input:{state:{npcs:[npc]},
    contracts:{npcSemanticProfile:loaded.profile}}};
}

test('production N1 capability is exact actor-scoped O1 only',async()=>{
  const {owner,input}=await fixture(),available=owner.capability(input);
  assert.deepEqual(available.operation_contract.allowed,[{
    actor_ref:'npc:zhdanko',discovery_kind:'look',
    target_refs:['trace_ld_v1_loc_zhdanko_storehouse']}]);
  assert.deepEqual(available.objective_pin.scope_ref,{
    entity_kind:'g6',entity_id:'trace_ld_v1_loc_zhdanko_storehouse',
    position_ref:'trace_ld_v1_loc_zhdanko_storehouse'});
});

test('production N1 capability fails closed on objective or authority drift',async()=>{
  const {owner,input}=await fixture();
  for(const mutate of [
    (copy)=>{copy.state.npcs[0].machine_state.status='idle';},
    (copy)=>{copy.state.npcs[0].machine_state.location_ref='remote';},
    (copy)=>{copy.contracts.npcSemanticProfile.discovery.target_ref='forged';}
  ]){const copy=structuredClone(input);mutate(copy);assert.equal(owner.capability(copy),null);}
});

test('production N1 capability rejects hostile subjective snapshots without reads',async()=>{
  const {owner,input}=await fixture();let reads=0;
  const hostile={};Object.defineProperty(hostile,'state',{enumerable:true,
    get(){reads+=1;return input.state;}});hostile.contracts=input.contracts;
  assert.equal(owner.capability(hostile),null);assert.equal(reads,0);
  const alias=structuredClone(input),shared={status:'waiting'};
  alias.state.a=shared;alias.state.b=shared;
  assert.equal(owner.capability(alias),null);
});

test('N1 objective pin binds the loaded profile, access, scope and operation',async()=>{
  const {loaded,owner,input}=await fixture();
  const pin=owner.capability(input).objective_pin;
  const operation={op:'request_discovery',actor_ref:pin.npc_ref,
    discovery_kind:'look',target_refs:[pin.target_ref],query:'осмотреть место'};
  assert.equal(validateLowerDvinaTraceN1ObjectivePin({pin,
    authority:loaded,operation}),true);
  for(const mutate of [
    (copy)=>{copy.pin.objective_digest='0'.repeat(64);},
    (copy)=>{copy.pin.profile_digest='0'.repeat(64);},
    (copy)=>{copy.pin.access_policy_ref='forged-access';},
    (copy)=>{copy.pin.scope_ref.position_ref='forged-position';},
    (copy)=>{copy.operation.target_refs=['forged-target'];},
    (copy)=>{copy.authority.profile.discovery.access_policy_ref='forged-access';}
  ]){const copy=structuredClone({pin,authority:loaded,operation});mutate(copy);
    assert.equal(validateLowerDvinaTraceN1ObjectivePin(copy),false);}
  const forged=structuredClone({pin,authority:loaded,operation});
  forged.authority.profile.discovery.access_policy_ref='forged-access';
  forged.authority.profile_canonical_digest=canonicalDigest(
    forged.authority.profile);
  forged.authority.artifact_digest=forged.authority.profile_canonical_digest;
  forged.authority.publication_identity.profile_digest=
    forged.authority.artifact_digest;
  forged.authority.publication_identity.profile_canonical_digest=
    forged.authority.profile_canonical_digest;
  forged.pin.profile_digest=forged.authority.artifact_digest;
  forged.pin.profile_canonical_digest=forged.authority.profile_canonical_digest;
  forged.pin.access_policy_ref='forged-access';
  const {objective_digest:ignored,...unsigned}=forged.pin;
  forged.pin.objective_digest=canonicalDigest(unsigned);
  assert.equal(validateLowerDvinaTraceN1ObjectivePin(forged),false);
});

test('revision 24 defers N1 authority until the exact Phase 7 boundary',
  async()=>{
    const bundle=await loadScenarioBundle(24);
    const state=phase2Fixture({scenarioBundle:bundle}).state;
    assert.equal(resolveTracePhase7Contracts({state,bundle})
      .npcSemanticAuthority,null);
    assert.throws(()=>resolveTracePhase7Contracts({state,bundle,
      npcSemanticAuthority:{}}),
    ({code})=>code==='TRACE_PHASE_7_APPROVED_CHAIN_INVALID');
    state.phase6_carry_execution={status:'completed'};
    state.position.location_ref='trace_ld_v1_loc_fishing_camp';
    state.phase7_fire_rest=null;state.body_effect_history=[];
    const onisim=state.npcs.find(({participant_slot_ref:slot})=>
      slot==='onisim_boatman');
    onisim.machine_state={...onisim.machine_state,
      spatial_zone_ref:'fire_rest_area'};
    assert.throws(()=>resolveTracePhase7Contracts({state,bundle}),
      ({code})=>code==='TRACE_PHASE_7_APPROVED_CHAIN_INVALID');
    const authority=await loadLowerDvinaTraceNpcSemanticProfile();
    assert.equal(resolveTracePhase7Contracts({state,bundle,
      npcSemanticAuthority:authority}).npcSemanticProfile.profile_id,
    authority.profile.profile_id);
    state.phase7_fire_rest={status:'completed'};
    assert.equal(resolveTracePhase7Contracts({state,bundle})
      .npcSemanticAuthority,null);
    assert.throws(()=>resolveTracePhase7Contracts({state,bundle,
      npcSemanticAuthority:{}}),
    ({code})=>code==='TRACE_PHASE_7_APPROVED_CHAIN_INVALID');
  });
