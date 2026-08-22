import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceTurnStepRuntimePorts } from
  '../src/runtime/lower-dvina-trace-turn-step-runtime-ports.js';
import { createLowerDvinaTracePlayerSafeWorkingProjectionAuthority } from
  '../src/runtime/lower-dvina-trace-player-safe-working.js';

test('local fire placement leaves ownership but removes carried mass and hand', () => {
  const itemRef='fuel-1';
  const mechanics={schema:'rus.items.runtime_instance_mechanics_snapshot.v1',
    version:1,provenance:{source_kind:'ordinary_direct_action_result',
      root_turn_id:'turn-1',step_index:1,operation_ref:'op-1',
      origin_kind:'direct_partition',source_refs:['wood-1']},mechanics:{
      mass_grams:300,external_hand_cost:1,carry_form:'compact',
      packing_slot_cost:1,quantity:{value:1,unit:'item'},container:null}};
  const ports=createLowerDvinaTraceTurnStepRuntimePorts({committedState:{
    items:[{item_id:itemRef,runtime_instance_mechanics_snapshot:mechanics}],
    knowledge:[]},workingProjectionAuthority:
      createLowerDvinaTracePlayerSafeWorkingProjectionAuthority()});
  const projected=ports.applyLocalFireProjection({actor:{actor_id:'mikula',
    attributes:{strength:{value:9}}},working_projection:{actor_id:'mikula',
    position:{location_ref:'shore'},destination_refs:[],knowledge:[],
    items:[{item_id:itemRef,instance_id:itemRef,
      placement:{holder_character_id:'mikula',physical_position:'hands'}}],
    inventory:{items:[itemRef],
      total_weight:{grams:700},load_category:'light',occupied_hands:1}},
  local_fire_atomic_write_plan:{fuel_placement_transitions:[{
    item_id:itemRef,before_placement:{holder_character_id:'mikula',
      physical_position:'hands'},after_placement:{item_id:itemRef,
      anchor_id:'shore',physical_position:null,
      holder_character_id:null,holder_npc_id:null,container_id:null,
      physical_parent_item_id:null,equipped_slot:null,attached_item_id:null}}],
    item_retirement_transition:null}});

  assert.deepEqual(projected.inventory,{items:[],total_weight:{grams:400},
    load_category:'light',occupied_hands:0});
  assert.deepEqual(projected.items[0].placement,{anchor_id:'shore'});
});
