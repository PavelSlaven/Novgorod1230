import test from 'node:test';
import assert from 'node:assert/strict';
import {
  admitLocalFireIgnitionBasis,
  admitLocalFireInput,
  planLocalFireWholeItemRetirement
} from '../src/index.js';

const fuel = (itemId = 'unlisted-fuel') => ({
  item: {
    item_id: itemId, run_id: null, template_id: null, profile_id: null,
    category_id: null, quantity: 1, condition_state: 'serviceable',
    legal_status: 'ordinary', state_version: 3,
    state: { lifecycle_status: 'active', local_fire_fuel: {
      schema: 'rus.items.local_fire_fuel.v1',
      fuel_class: 'ordinary_solid_fuel_unit', whole_unit: true,
      provenance: { source_refs: ['source:wood'] }
    }, runtime_instance_mechanics_snapshot: {
      schema: 'rus.items.runtime_instance_mechanics_snapshot.v1', version: 1,
      provenance: { source_kind: 'ordinary_direct_action_result',
        root_turn_id: 'turn:fuel', step_index: 1,
        operation_ref: 'operation:fuel', origin_kind: 'direct_partition',
        source_refs: ['source:wood'] },
      mechanics: { mass_grams: 450, external_hand_cost: 1,
        carry_form: 'compact', packing_slot_cost: 1,
        quantity: { value: 1, unit: 'item' }, container: null }
    } }
  },
  placement: { item_id: itemId, anchor_id: null, container_id: null,
    holder_npc_id: null, holder_character_id: 'actor',
    physical_position: 'hands', equipment_slot_category_id: null,
    attached_item_id: null },
  ownership: { ownership_id: `ownership:${itemId}`, item_id: itemId,
    owner_npc_id: null, owner_character_id: 'actor', owner_party: false,
    controller_npc_id: null, controller_character_id: 'actor',
    claim_state: 'owned' },
  bound_process_ref: null
});

test('unlisted whole fuel uses item-owned class, access and mass bounds', () => {
  const admitted = admitLocalFireInput({ ...fuel(), actor_ref: 'actor',
    scope_ref: 'shore', fuel_mass_grams_min: 100,
    fuel_mass_grams_max: 1000 });
  assert.equal(admitted.pass, true);
  assert.equal(admitted.input_kind, 'fuel_unit');
  assert.equal(admitted.snapshot.fuel_ref, 'unlisted-fuel');
  assert.equal(admitted.snapshot.mass_grams, 450);

  const npc = fuel('npc-fuel');
  npc.placement.holder_character_id = null;
  npc.placement.holder_npc_id = 'npc';
  npc.ownership.owner_character_id = null;
  npc.ownership.owner_npc_id = 'npc';
  npc.ownership.controller_character_id = null;
  npc.ownership.controller_npc_id = 'npc';
  assert.equal(admitLocalFireInput({ ...npc, actor_ref: 'npc',
    scope_ref: 'shore', fuel_mass_grams_min: 100,
    fuel_mass_grams_max: 1000 }).pass, true);
});

test('ignition basis uses the shared physical access boundary', () => {
  const value = fuel('ignition');
  delete value.item.state.local_fire_fuel;
  value.item.state.local_fire_ignition_basis = {
    schema: 'rus.items.local_fire_ignition_basis.v1'
  };
  assert.equal(admitLocalFireIgnitionBasis({ ...value, actor_ref: 'actor',
    scope_ref: 'shore' }).pass, true);
  value.placement.holder_character_id = 'other';
  assert.equal(admitLocalFireIgnitionBasis({ ...value, actor_ref: 'actor',
    scope_ref: 'shore' }).pass, false);
});

test('fuel admission rejects wrong class, bounds, access and active binding', () => {
  for (const mutate of [
    (value) => { value.item.state.local_fire_fuel.fuel_class = 'wood'; },
    (value) => { value.item.state.runtime_instance_mechanics_snapshot
      .mechanics.mass_grams = 99; },
    (value) => { value.item.state.runtime_instance_mechanics_snapshot
      .mechanics.mass_grams = 1001; },
    (value) => { value.item.quantity = 2; },
    (value) => { value.item.state.runtime_instance_mechanics_snapshot
      .mechanics.quantity.value = 2; },
    (value) => { value.placement.holder_character_id = 'other'; },
    (value) => { value.bound_process_ref = 'fire:other'; }
  ]) {
    const value = fuel(); mutate(value);
    assert.equal(admitLocalFireInput({ ...value, actor_ref: 'actor',
      scope_ref: 'shore', fuel_mass_grams_min: 100,
      fuel_mass_grams_max: 1000 }).pass, false);
  }
  const labelled=fuel('labelled');
  labelled.item.display_name='прекрасное топливо';
  delete labelled.item.state.local_fire_fuel;
  assert.equal(admitLocalFireInput({...labelled,actor_ref:'actor',
    scope_ref:'shore',fuel_mass_grams_min:100,
    fuel_mass_grams_max:1000}).pass,false);
});

test('current mechanics override historical classification and ownership', () => {
  const stale = fuel('stale');
  stale.item.state.local_fire_fuel.historical_mass_grams = 300;
  stale.item.state.runtime_instance_mechanics_snapshot.mechanics.mass_grams = 75;
  assert.equal(admitLocalFireInput({ ...stale, actor_ref: 'actor',
    scope_ref: 'shore', fuel_mass_grams_min: 100,
    fuel_mass_grams_max: 1000 }).pass, false);

  const foreign = fuel('foreign');
  foreign.ownership.owner_character_id = 'other';
  foreign.ownership.controller_character_id = 'other';
  assert.equal(admitLocalFireInput({ ...foreign, actor_ref: 'actor',
    scope_ref: 'shore', fuel_mass_grams_min: 100,
    fuel_mass_grams_max: 1000 }).pass, true);
  assert.equal(foreign.ownership.owner_character_id, 'other');
});

test('committed water portion is typed affect input and retirement is owner-owned', () => {
  const value = fuel('water');
  delete value.item.state.local_fire_fuel;
  value.item.condition_state = 'ordinary_runtime_instance';
  value.item.state.ordinary_metadata = {
    semantic_type: 'water_portion', semantic_category: 'ordinary_mundane'
  };
  value.item.state.runtime_instance_mechanics_snapshot = {
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v2', version: 2,
    provenance: { source_kind: 'ordinary_world_materialization',
      causal_ref: 'cause:water', request_id: 'request:water',
      candidate_key: 'candidate:water', coverage_key: 'coverage:water',
      context_version: '1', policy_ref: 'policy:water',
      source_refs: ['source:river'] },
    mechanics: { mass_grams: 750, external_hand_cost: 1,
      carry_form: 'compact', packing_slot_cost: 1,
      quantity: { value: 1, unit: 'item' }, container: null }
  };
  const admitted = admitLocalFireInput({ ...value, actor_ref: 'actor',
    scope_ref: 'shore', fuel_mass_grams_min: 100,
    fuel_mass_grams_max: 1000 });
  assert.equal(admitted.pass, true);
  assert.equal(admitted.input_kind, 'water_portion');
  const transition = planLocalFireWholeItemRetirement({
    admission: admitted, process_ref: 'fire:1'
  });
  assert.equal(transition.expected_item_state_version, 3);
  assert.equal(transition.after_item.condition_state, 'retired');
  assert.equal(transition.after_item.state.lifecycle_status, 'retired');
  assert.equal(transition.after_item.state_version, 4);
});

test('open local or actor-held parent container preserves physical placement',()=>{
  const value=fuel('contained');
  value.placement.holder_character_id=null;
  value.placement.physical_position=null;
  value.placement.container_id='bucket';
  value.container={container_id:'bucket',anchor_id:'shore',
    parent_container_id:null,holder_npc_id:null,holder_character_id:null,
    physical_position:null,closure_state:'open',state_version:2};
  assert.equal(admitLocalFireInput({...value,actor_ref:'actor',scope_ref:'shore',
    fuel_mass_grams_min:100,fuel_mass_grams_max:1000}).pass,true);
  value.container.closure_state='closed';
  assert.equal(admitLocalFireInput({...value,actor_ref:'actor',scope_ref:'shore',
    fuel_mass_grams_min:100,fuel_mass_grams_max:1000}).pass,false);
  value.container.closure_state='open';value.container.anchor_id=null;
  value.container.holder_character_id='other';
  assert.equal(admitLocalFireInput({...value,actor_ref:'actor',scope_ref:'shore',
    fuel_mass_grams_min:100,fuel_mass_grams_max:1000}).pass,false);
});

test('due boundary admits only fuel already bound to the exact process', () => {
  const admitted = admitLocalFireInput({ ...fuel(), actor_ref: null,
    bound_process_ref: 'fire:1', process_ref: 'fire:1',
    scope_ref: 'shore',
    fuel_mass_grams_min:100,fuel_mass_grams_max:1000 });
  assert.equal(admitted.pass, true);
  assert.equal(admitted.snapshot.bound_process_ref, 'fire:1');
  assert.equal(admitLocalFireInput({ ...fuel(), actor_ref: null,
    bound_process_ref: 'fire:other', process_ref: 'fire:1',
    scope_ref: 'shore',
    fuel_mass_grams_min:100,fuel_mass_grams_max:1000 }).pass, false);
});
