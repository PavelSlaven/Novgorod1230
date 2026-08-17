import assert from 'node:assert/strict';
import test from 'node:test';
import { validateOrdinaryContainerContentsMechanics } from '../src/index.js';

function validInput() {
  const mechanics = { mass_grams:80,external_hand_cost:0,
    carry_form:'compact',packing_slot_cost:1,
    quantity:{value:1,unit:'item'},container:null };
  return { container_id:'chest',inventory_input:{party_id:'party',items:[],
    item_placements:[],item_profiles:[],containers:[{container_id:'chest',
      template_id:'chest-template'}],container_placements:[{party_id:'party',
      container_id:'chest',anchor_id:'anchor'}],container_profiles:[{
      template_id:'chest-template',capacity:4,packing_slot_cost:1,
      carry_form:'regular',mass_grams:500}],container_compatibility:[],
    capacity_snapshot:[]},proposed_items:[{item_id:'ordinary',template_id:null,
    quantity:1,placement:{container_id:'chest'},runtime_mechanics_snapshot:{
      schema:'rus.items.runtime_instance_mechanics_snapshot.v1',version:1,
      provenance:{source_kind:'ordinary_world_materialization',
        root_turn_id:'turn',step_index:1,operation_ref:'operation',
        origin_kind:'existing_container_ordinary',source_refs:['source']},
      mechanics}}] };
}

test('ordinary container mechanics snapshots strict JSON before any read', () => {
  assert.equal(validateOrdinaryContainerContentsMechanics(validInput()).pass,true);
  let reads=0;
  const getter=validInput();
  Object.defineProperty(getter.inventory_input.items[0] ?? getter.inventory_input,
    'items',{enumerable:true,get(){reads+=1;return [];}});
  assert.equal(validateOrdinaryContainerContentsMechanics(getter).pass,false);
  assert.equal(reads,0);

  const hostile=[];
  const symbol=validInput(); symbol.inventory_input[Symbol('hidden')]=true;
  hostile.push(symbol);
  const proto=validInput(); Object.setPrototypeOf(proto.proposed_items[0],
    {inherited:true}); hostile.push(proto);
  const cycle=validInput(); cycle.inventory_input.self=cycle.inventory_input;
  hostile.push(cycle);
  const alias=validInput(); alias.inventory_input.alias=alias.proposed_items[0];
  hostile.push(alias);
  const callable=validInput(); callable.inventory_input.callback=()=>{};
  hostile.push(callable);
  const missing=validInput(); missing.inventory_input.missing=undefined;
  hostile.push(missing);
  const nonfinite=validInput(); nonfinite.inventory_input.total=Infinity;
  hostile.push(nonfinite);
  for (const input of hostile) {
    const result=validateOrdinaryContainerContentsMechanics(input);
    assert.equal(result.pass,false);
    assert.equal(result.errors[0].code,
      'ITEM_ORDINARY_CONTAINER_MECHANICS_INPUT_INVALID');
  }
});
