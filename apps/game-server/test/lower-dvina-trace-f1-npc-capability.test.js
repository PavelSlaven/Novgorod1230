import assert from 'node:assert/strict';
import test from 'node:test';
import { projectLowerDvinaTraceF1NpcCapability } from
  '../src/runtime/releases/lower-dvina-trace-f1-production.js';
import { approvedPhase7Contracts } from
  './lower-dvina-trace-phase-7-contract-fixture.js';
import { phase7CommittedState } from
  './lower-dvina-trace-phase-7-runtime-fixture.js';

test('F1 NPC capability needs evidence of the process, not its bound fuel', () => {
  const state=phase7CommittedState();
  const fuel=fireItem('known-fuel','fuel');
  const water=fireItem('water','fuel');
  delete water.state.local_fire_fuel;
  water.state.ordinary_metadata={semantic_type:'water_portion'};
  state.items.push(fuel,water);
  state.local_fire_runtime=[{process_state:{process_ref:'hidden-fire',
      process_mode:'local_exact',process_kind:'fire',scope_ref:'scope-1',
      causal_basis_ref:'ignition-1',status:'active',started_at:at(1),
      next_boundary_at:at(6),fuel_bindings:[{fuel_ref:'known-fuel',
        fuel_class:'ordinary_solid_fuel_unit'}],state_version:1}}];
  const loadedProfile={schema:'rus.lower_dvina_trace_f1_loaded_profile.v1',
    profile:{schema:'rus.lower_dvina_trace_local_fire_profile.v1',
      profile_id:'f1',revision:1,status:'approved',context_ref:'f1-context',
      policy_ref:'f1-policy',policy_version:1,allowed_actions:['affect'],
      recheck_interval:{exact_minutes:{numerator:'5',denominator:'1'}},
      fuel_unit_mass_grams_min:100,fuel_unit_mass_grams_max:1000}};
  const npcSnapshot=structuredClone(approvedPhase7Contracts(state).zhdanko);
  npcSnapshot.anchor_id='scope-1';
  assert.equal(projectLowerDvinaTraceF1NpcCapability({committedState:state,
    npcSnapshot,loadedProfile,resolverAvailable:true}),null);

  npcSnapshot.perception_snapshot={visible_objects:[{process_ref:'hidden-fire',
    source_event_ref:{entity_kind:'actor_step',entity_id:'start-fire'},
    summary:'разожжённый огонь'}]};
  const visible=projectLowerDvinaTraceF1NpcCapability({committedState:state,
    npcSnapshot,loadedProfile,resolverAvailable:true});
  assert.deepEqual(visible.active_process_refs,['hidden-fire']);
  assert.equal(visible.allowed.some(({process_ref})=>process_ref==='hidden-fire'),
    true);

});

function fireItem(itemId,kind) {
  return{item_id:itemId,condition_state:'serviceable',legal_status:'ordinary',
    quantity:1,state_version:1,placement:{item_id:itemId,
      holder_npc_id:'zhdanko-1',holder_character_id:null,anchor_id:null,
      container_id:null,physical_position:'hands',
      equipment_slot_category_id:null,attached_item_id:null},ownership:{
      ownership_id:`own:${itemId}`,item_id:itemId,owner_npc_id:'zhdanko-1',
      owner_character_id:null,owner_party:false,controller_npc_id:'zhdanko-1',
      controller_character_id:null,claim_state:'owned'},state:{
      lifecycle_status:'active',local_fire_fuel:{
        schema:'rus.items.local_fire_fuel.v1',
        fuel_class:'ordinary_solid_fuel_unit',whole_unit:true,
        provenance:{source_refs:['wood']}},runtime_instance_mechanics_snapshot:{
        schema:'rus.items.runtime_instance_mechanics_snapshot.v1',version:1,
        provenance:{source_kind:'ordinary_direct_action_result',
          root_turn_id:'turn-1',step_index:1,operation_ref:'op-1',
          origin_kind:'direct_partition',source_refs:['wood']},mechanics:{
          mass_grams:300,external_hand_cost:1,carry_form:'compact',
          packing_slot_cost:1,quantity:{value:1,unit:'item'},container:null}}}};
}

function at(value) {
  return {whole_minutes:String(value),subminute_numerator:'0',
    subminute_denominator:'1'};
}
