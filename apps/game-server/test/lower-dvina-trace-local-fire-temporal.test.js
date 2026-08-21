import assert from 'node:assert/strict';
import test from 'node:test';
import { createTemporalAdvanceOwner } from '@rus/turn/temporal-advance';
import { createLocalFireAtomicWritePlan } from
  '../src/infrastructure/postgres/local-fire-atomic-write-plan.js';
import { lowerDvinaTraceLocalFireTemporalRegistration } from
  '../src/runtime/lower-dvina-trace-local-fire-temporal.js';
import { createTracePhase2TemporalAdvance } from
  '../src/runtime/lower-dvina-trace-phase-2-temporal.js';
import { lowerDvinaTraceTemporalSourceRegistrations } from
  '../src/runtime/lower-dvina-trace-phase-6-temporal-source.js';
import { lowerDvinaTracePhase6TemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-phase-6-temporal-effect-owner.js';

const clock=(whole)=>({whole_minutes:String(whole),subminute_numerator:'0',
  subminute_denominator:'1'});

test('configured temporal owner consumes three same-root fire boundaries',async()=>{
  const start=startPlan('fire-three',['fuel-1','fuel-2','fuel-3']);
  const result=await advance([start],15);
  assert.deepEqual(result.local_fire_atomic_write_plans.map((plan)=>
    plan.transition_proposal.process_after.fuel_bindings.map(
      ({fuel_ref:ref})=>ref)),[['fuel-2','fuel-3'],['fuel-3'],[]]);
  assert.deepEqual(result.local_fire_atomic_write_plans.map((plan)=>
    plan.item_retirement_transition.item_id),['fuel-1','fuel-2','fuel-3']);
  assert.equal(result.local_fire_atomic_write_plans.at(-1)
    .transition_proposal.process_after.status,'completed');
  assert.equal(result.local_fire_atomic_write_plans.at(-1)
    .transition_proposal.process_after.next_boundary_at,null);
  assert.deepEqual(result.boundary_trace.processed_boundary_ids,[
    'local-fire:fire-three:state:1','local-fire:fire-three:state:2',
    'local-fire:fire-three:state:3']);
});

test('configured temporal owner preserves both same-time fires deterministically',
  async()=>{
    const result=await advance([
      startPlan('fire-b',['fuel-b']),startPlan('fire-a',['fuel-a'])],5);
    assert.deepEqual(result.local_fire_atomic_write_plans.map((plan)=>
      plan.transition_proposal.process_after.process_ref),['fire-a','fire-b']);
    assert.deepEqual(result.local_fire_atomic_write_plans.map((plan)=>
      plan.item_retirement_transition.item_id),['fuel-a','fuel-b']);
    assert.deepEqual(result.boundary_trace.processed_boundary_ids,[
      'local-fire:fire-a:state:1','local-fire:fire-b:state:1']);
  });

async function advance(actorPlans,minutes){
  const temporalAdvanceOwner=createTemporalAdvanceOwner({
    source_registrations:lowerDvinaTraceTemporalSourceRegistrations([
      lowerDvinaTraceLocalFireTemporalRegistration(profile())]),
    effect_registrations:lowerDvinaTracePhase6TemporalEffectRegistrations()});
  return createTracePhase2TemporalAdvance({contracts:{activity:{
    nearest_temporal_boundary_rule:'split_before_earliest_boundary',
    duration_minutes:minutes}},temporalAdvanceOwner})({clock_before:clock(10),
    exact_elapsed:{exact_minutes:{numerator:String(minutes),denominator:'1'}},
    relevant_state:{party_id:'party-fire',party_state:{state_version:1},
      temporal_boundary_candidates:[],temporal_source_proof:sourceProof()},
    local_fire_atomic_write_plans:actorPlans,root_turn_id:'turn-fire'});
}

function startPlan(processRef,fuelRefs){
  return createLocalFireAtomicWritePlan({schema:
    'local_fire_atomic_write_request_v1',party_id:'party-fire',
    base_party_state_version:1,change_set_id:'change-fire',actor_ref:'pc',
    profile_pin:profilePin(),process_state:null,
    input_pins:fuelRefs.map(fuelPin),ignition_basis_pin:ignitionPin(),
    action:'start',process_ref:processRef,at_timestamp:clock(10),cause:{
      kind:'actor_step',request_id:`request:${processRef}`,
      root_turn_id:'turn-fire',step_index:1},qualitative_outcome:null});
}

function fuelPin(itemId){return itemPin(itemId,{local_fire_fuel:{schema:
  'rus.items.local_fire_fuel.v1',fuel_class:'ordinary_solid_fuel_unit',
  whole_unit:true,provenance:{source_refs:['source:wood']}},
  runtime_instance_mechanics_snapshot:mechanics(itemId)});}
function ignitionPin(){return itemPin('ignition',{local_fire_ignition_basis:{
  schema:'rus.items.local_fire_ignition_basis.v1'},
  inventory_profile_snapshot:{inventory_profile_id:'ignition-profile',
    item_template_ref:'ignition-template',mass_grams:100,carry_form:'compact',
    external_hand_cost:1,packing_slot_cost:1}});}
function itemPin(itemId,state){return{item_id:itemId,item:{item_id:itemId,
  run_id:null,template_id:null,profile_id:null,category_id:null,quantity:1,
  condition_state:'serviceable',legal_status:'ordinary',state_version:1,
  state:{lifecycle_status:'active',...state}},placement:{item_id:itemId,
  anchor_id:null,container_id:null,holder_npc_id:null,holder_character_id:'pc',
  physical_position:'hands',equipment_slot_category_id:null,
  attached_item_id:null},ownership:{ownership_id:`own:${itemId}`,
  item_id:itemId,owner_npc_id:null,owner_character_id:'pc',owner_party:false,
  controller_npc_id:null,controller_character_id:'pc',claim_state:'owned'},
  bound_process_ref:null};}
function mechanics(itemId){return{schema:
  'rus.items.runtime_instance_mechanics_snapshot.v1',version:1,provenance:{
    source_kind:'ordinary_direct_action_result',root_turn_id:'turn-source',
    step_index:1,operation_ref:`operation:${itemId}`,
    origin_kind:'direct_partition',source_refs:['source:wood']},mechanics:{
    mass_grams:300,external_hand_cost:1,carry_form:'compact',
    packing_slot_cost:1,quantity:{value:1,unit:'item'},container:null}};}
function profile(){return{schema:
  'rus.lower_dvina_trace_local_fire_profile.v1',profile_id:'profile-fire',
  revision:1,status:'approved',context_ref:'context-fire',
  policy_ref:'policy-fire',policy_version:1,recheck_interval:{exact_minutes:{
    numerator:'5',denominator:'1'}},fuel_unit_mass_grams_min:100,
  fuel_unit_mass_grams_max:1000};}
function profilePin(){const value=profile();return{profile_ref:value.profile_id,
  profile_version:value.revision,context_ref:value.context_ref,
  scope_ref:'scope-fire',ignition_basis_ref:'ignition',policy:{schema:
    'local_fire_policy_v1',policy_ref:value.policy_ref,
    version:value.policy_version,recheck_interval:value.recheck_interval,
    fuel_unit_mass_grams_min:value.fuel_unit_mass_grams_min,
    fuel_unit_mass_grams_max:value.fuel_unit_mass_grams_max}};}
function sourceProof(){return{schema:'lower_dvina_trace_temporal_source_proof',
  version:2,owner:'@rus/time-events-history/temporal-boundaries',
  same_time_cascade_owner:
    '@rus/time-events-history/temporal-boundaries:resolveSameTimeCascade',
  admission_policy:'pass_exact_candidates_to_temporal_activity_owner',
  pending_event_count:0,active_schedule_count:0,candidate_count:0,
  candidates:[]};}
