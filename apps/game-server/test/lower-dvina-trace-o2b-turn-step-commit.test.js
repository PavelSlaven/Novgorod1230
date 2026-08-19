import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest } from '@rus/materialization';
import { commitLowerDvinaTraceTurnStep } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-commit.js';
import { bindCommitEnvelopeToBatch, commitEnvelope } from
  './lower-dvina-trace-turn-step-envelope-fixture.js';
import { batchInput } from
  './ordinary-materialization-container-batch-plan.test.js';
import { authoredItemPlacementSourceProof } from '@rus/items-property';

test('O2b child move is composed after materialization in the same P16',
  async () => {
    const ordinaryPlan = batchInput({masses:[80],party:'p'});
    const itemId = ordinaryPlan.items[0].item_id;
    const envelope = commitEnvelope({clarification:false,check:false});
    const batch = operationBatch(itemId);
    envelope.loop_trace.step_traces[0].plan_request.player_safe_state
      .visible_entities.push({entity_ref:itemId});
    bindCommitEnvelopeToBatch(envelope,batch);
    const writePlan = {version:2,schema:'party_turn_write_plan',
      sealed_by:'turn_code_planner_v2',party_id:'p',turn_id:'turn:p:1',
      base_state_version:3,write_targets:[batch],
      command_trace:envelope.mode_resolution.decision_trace,
      turn_step_commit:envelope,
      ordinary_materialization_atomic_write_plan:ordinaryPlan};
    const plans=[];
    await commitLowerDvinaTraceTurnStep({partyId:'p',writePlan,
      inputDigest:canonicalDigest({party_id:'p',request_id:'request-1',
        idempotency_key:'idem-key',raw_text:'беру песок'}),contracts:{},
      loadState:async()=>state(),committer:{async commit({plan}){
        plans.push(plan); return {ok:true,replay:false,
          change_set_id:plan.change_set_id};}}});
    const plan=plans[0];
    assert.equal(plan.ordinary_materialization_atomic_write_plan
      .write_plan_digest,ordinaryPlan.write_plan_digest);
    assert.deepEqual(plan.updates.find(({target_table:table,id}) =>
      table==='party_item_placements'&&id===itemId).record,
    {party_id:'p',item_id:itemId,anchor_id:null,container_id:null,
      holder_npc_id:null,holder_character_id:'actor-1',
      physical_position:'hands',equipment_slot_category_id:null,
      attached_item_id:null});
    const snapshot=plan.inserts.find(({target_table:table}) =>
      table==='party_state_snapshots').record.state_payload;
    const item=snapshot.items.find(({item_id})=>item_id===itemId);
    assert.deepEqual(item.placement,
      {holder_character_id:'actor-1',physical_position:'hands'});
    assert.equal(item.state.created_change_set_id,'change:p:turn-step:1');
    assert.equal(item.state.ordinary_metadata.operation_history.at(-1).result,
      'moved');
  });

test('concealed O2b resolution precedes one container move version chain',
  async () => {
    const ordinaryPlan=batchInput({masses:[80],party:'p',reveal:false,
      partyStateVersion:3,containerStateVersion:3});
    const current=stateWithContainer();
    const source=authoredItemPlacementSourceProof({
      ...current.containers[0],item_id:'chest',placement:{
        anchor_id:'anchor-shore',container_id:null,holder_npc_id:null,
        holder_character_id:null,physical_position:null,
        equipment_slot_category_id:null,location_ref:null,zone_ref:null}});
    const envelope=commitEnvelope({clarification:false,check:false});
    const batch=containerOperationBatch(source);
    envelope.loop_trace.step_traces[0].plan_request.player_safe_state
      .visible_entities.push({entity_ref:'chest'});
    bindCommitEnvelopeToBatch(envelope,batch);
    const writePlan={version:2,schema:'party_turn_write_plan',
      sealed_by:'turn_code_planner_v2',party_id:'p',turn_id:'turn:p:1',
      base_state_version:3,write_targets:[batch],
      command_trace:envelope.mode_resolution.decision_trace,
      turn_step_commit:envelope,
      ordinary_materialization_atomic_write_plan:ordinaryPlan};
    const plans=[];
    await commitLowerDvinaTraceTurnStep({partyId:'p',writePlan,
      inputDigest:canonicalDigest({party_id:'p',request_id:'request-1',
        idempotency_key:'idem-key',raw_text:'беру песок'}),contracts:{},
      loadState:async()=>current,committer:{async commit({plan}){
        plans.push(plan); return {ok:true,replay:false,
          change_set_id:plan.change_set_id};}}});
    const plan=plans[0];
    const snapshot=plan.inserts.find(({target_table:table}) =>
      table==='party_state_snapshots').record.state_payload;
    const container=snapshot.containers.find(({container_id}) =>
      container_id==='chest');
    assert.equal(container.state.contents_state,'resolved_concealed');
    assert.equal(container.state_version,5);
    assert.equal(container.holder_character_id,'actor-1');
    assert.equal(plan.expected_state_versions.find(({target_table,id}) =>
      target_table==='party_containers'&&id==='chest').state_version,3);
  });

function operationBatch(itemId) {
  return {target:'party_turn_step_operations',value:{version:1,
    schema:'party_turn_step_operation_batch_v1',root_turn_id:'turn:p:1',
    committed_state_version:3,operations:[{target:'party_items',value:{
      version:1,schema:'rus.lower_dvina_trace_turn_step_direct_operation.v1',
      operation_id:'op-o2b-move',root_turn_id:'turn:p:1',step_index:1,
      operation_kind:'move_entity',payload:{entity_ref:itemId,placement:{
        holder_character_id:'actor-1',physical_position:'hands'}}}},
    {target:'party_events',value:{version:1,
      schema:'rus.lower_dvina_trace_turn_step_semantic_activity.v1',
      activity_id:'activity-1',root_turn_id:'turn:p:1',step_index:1,
      profile_ref:'approved:brief-none',duration_class:'brief',
      duration_minutes:1,effort:'none'}}]}};
}

function containerOperationBatch(source) {
  return {target:'party_turn_step_operations',value:{version:1,
    schema:'party_turn_step_operation_batch_v1',root_turn_id:'turn:p:1',
    committed_state_version:3,operations:[{target:'party_containers',value:{
      version:1,schema:'rus.lower_dvina_trace_turn_step_direct_operation.v1',
      operation_id:'op-o2b-container-move',root_turn_id:'turn:p:1',step_index:1,
      operation_kind:'move_entity',payload:{entity_ref:'chest',placement:{
        holder_character_id:'actor-1',physical_position:'hands'},
      authored_source:source}}},{target:'party_events',value:{version:1,
      schema:'rus.lower_dvina_trace_turn_step_semantic_activity.v1',
      activity_id:'activity-1',root_turn_id:'turn:p:1',step_index:1,
      profile_ref:'approved:brief-none',duration_class:'brief',
      duration_minutes:1,effort:'none'}}]}};
}

function state() {
  const clock={whole_minutes:'10',subminute_numerator:'0',
    subminute_denominator:'1'};
  return {party_id:'p',actor_id:'actor-1',
    schema:'rus.lower_dvina_trace_turn_snapshot.v2',party_state:{
      state_version:3,session_state_version:7,clock_state_version:2,
      body_state_version:5,turn_number:0},player_profile:{attributes:{
      strength:{value:10}}},position:{location_ref:'shore',
      g5_anchor_id:'anchor-shore'},clock,clock_weather_light:{clock,
      weather:{},light:{}},body_state:{health:100,energy:100,satiety:100,
      active_conditions:[]},items:[],containers:[],npcs:[],
    container_placements:[],container_profiles:[],container_compatibility:[],
    knowledge:[{fact_id:'shore',knowledge_state:'known'}],
    opening_identity:{opening_screen_digest:'opening-digest'}};
}

function stateWithContainer() {
  const current=state();
  current.containers=[{container_id:'chest',template_id:'chest-template',
    state_version:3,closure_state:'closed',state:{
      inventory_profile_snapshot:{mass_grams:500,external_hand_cost:1,
        carry_form:'regular',packing_slot_cost:2,packing_bundle_size:1,
        capacity:4,inventory_role:'regular_container',
        closure_state:'closed'},
      ordinary_contents_context:{mechanics_profile_ref:'chest-mechanics'},
      contents_state:'contents_hidden'},anchor_id:'anchor-shore',
    parent_container_id:null,holder_npc_id:null,holder_character_id:null,
    physical_position:null,equipment_slot_category_id:null}];
  current.container_placements=[{party_id:'p',container_id:'chest',
    anchor_id:'anchor-shore',parent_container_id:null,holder_npc_id:null,
    holder_character_id:null,physical_position:null,
    equipment_slot_category_id:null}];
  current.container_profiles=[{template_id:'chest-template',mass_grams:500,
    external_hand_cost:1,carry_form:'regular',packing_slot_cost:2,
    packing_bundle_size:1,capacity:4,inventory_role:'regular_container',
    closure_state:'closed'}];
  return current;
}
