import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTurnStepPreparedDomainConsequence,
  createTurnStepExecutionRegistry,
  mergeTurnStepDraftConsequence,
  runTurnStepLoop
} from '@rus/turn';
import { createTemporalAdvanceOwner } from '@rus/turn/temporal-advance';
import { createLocalFireAtomicWritePlan } from
  '../src/infrastructure/postgres/local-fire-atomic-write-plan.js';
import { phase7OwnerOutputPlans } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-7-owner-output.js';
import { applyLocalFireTemporalProjection,
  localFireTemporalCandidateFromRuntime,
  localFireTemporalRuntimeFromPlan,
  lowerDvinaTraceLocalFireTemporalRegistration,
  replaceLocalFireTemporalCandidates } from
  '../src/runtime/lower-dvina-trace-local-fire-temporal.js';
import { createTracePhase2TemporalAdvance } from
  '../src/runtime/lower-dvina-trace-phase-2-temporal.js';
import { lowerDvinaTraceTemporalSourceRegistrations } from
  '../src/runtime/lower-dvina-trace-phase-6-temporal-source.js';
import { lowerDvinaTracePhase6TemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-phase-6-temporal-effect-owner.js';
import { createLowerDvinaTraceTurnStepRuntimePorts } from
  '../src/runtime/lower-dvina-trace-turn-step-runtime-ports.js';
import { createLowerDvinaTracePlayerSafeWorkingProjectionAuthority } from
  '../src/runtime/lower-dvina-trace-player-safe-working.js';
import { createTracePhase3VisibleProjector } from
  '../src/runtime/lower-dvina-trace-phase-3-effects.js';
import { createLowerDvinaTraceTurnStepVisibleProjector } from
  '../src/runtime/lower-dvina-trace-turn-step-generic-owners.js';

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
  assert.deepEqual(result.local_fire_atomic_write_plans.map((plan)=>
    plan.change_set_id),['change:party-fire:trace-phase2:2',
      'change:party-fire:trace-phase2:2','change:party-fire:trace-phase2:2']);
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

test('local-fire temporal overlay inserts, replaces and removes candidates',()=>{
  const start=startPlan('fire-fold',['fuel-1','fuel-2']);
  let projection=applyLocalFireTemporalProjection({local_fire_runtime:[]},start);
  let candidates=replaceLocalFireTemporalCandidates([],projection,[start]);
  assert.deepEqual(candidates.map(({boundary_id:id})=>id),[
    'local-fire:fire-fold:state:1']);

  const add=addPlan(start,'fuel-3');
  projection=applyLocalFireTemporalProjection(projection,add);
  candidates=replaceLocalFireTemporalCandidates(candidates,projection,[add]);
  assert.deepEqual(candidates.map(({boundary_id:id})=>id),[
    'local-fire:fire-fold:state:2']);

  const single=startPlan('fire-complete',['fuel-last']);
  const runtime=localFireTemporalRuntimeFromPlan(single);
  const candidate=localFireTemporalCandidateFromRuntime(runtime);
  const resolved=lowerDvinaTraceLocalFireTemporalRegistration(profile())
    .resolve(candidate,{request:{base_state_version:'1',
      idempotency_context:{change_set_id:'change-complete'}},
    projection:{local_fire_runtime:[runtime]}});
  const due=resolved.proposals[0].local_fire_atomic_write_plans[0];
  assert.deepEqual(replaceLocalFireTemporalCandidates([candidate],
    resolved.state_projection,[due]),[]);
});

test('Phase 7 applies actor fire output before due temporal plans', async () => {
  const actorPlan = startPlan('fire-phase7-order', ['fuel-phase7-order']);
  const temporalPlan = structuredClone((await advance([actorPlan], 5))
    .local_fire_atomic_write_plans[0]);
  temporalPlan.change_set_id = 'change-fire';
  const plans = phase7OwnerOutputPlans({
    ownerOutputs: { write_fragments: [], consequence_fragment: null,
      ordinary_materialization_atomic_write_plan: null,
      action_production_atomic_write_plans: [],
      local_fire_atomic_write_plans: [actorPlan],
      spatial_semantic_atomic_write_plan: null },
    partyId: 'party-fire', changeSetId: 'change-fire', npcRef: 'pc',
    rootTurnId: 'turn-fire', committedStateVersion: 1,
    semanticOperation: { op: 'request_world_process' },
    temporalPlans: [temporalPlan], fail(code) { throw new Error(code); }
  });
  assert.deepEqual(plans.localFirePlans.map(({ transition_proposal: plan }) =>
    plan.action), ['start', 'due_boundary']);
  const temporalOnly = phase7OwnerOutputPlans({
    ownerOutputs: { write_fragments: [], consequence_fragment: null,
      ordinary_materialization_atomic_write_plan: null,
      action_production_atomic_write_plans: [],
      local_fire_atomic_write_plans: [],
      spatial_semantic_atomic_write_plan: null },
    partyId: 'party-fire', changeSetId: 'change-fire', npcRef: 'pc',
    rootTurnId: 'turn-fire', committedStateVersion: 1,
    semanticOperation: { op: 'request_activity', activity_kind: 'wait' },
    temporalPlans: [temporalPlan], fail(code) { throw new Error(code); }
  });
  assert.deepEqual(temporalOnly.localFirePlans.map(
    ({ transition_proposal: plan }) => plan.action), ['due_boundary']);
});

test('production prepared route advances prior fire and hides retired fuel',
  async()=>{
    const start=startPlan('fire-route',['fuel-route'],0);
    const temporalAdvanceOwner=createTemporalAdvanceOwner({
      source_registrations:lowerDvinaTraceTemporalSourceRegistrations([
        lowerDvinaTraceLocalFireTemporalRegistration(profile())]),
      effect_registrations:lowerDvinaTracePhase6TemporalEffectRegistrations()});
    const temporalAdvance=createTracePhase2TemporalAdvance({contracts:{
      activity:{nearest_temporal_boundary_rule:
        'split_before_earliest_boundary',duration_minutes:8}},
    temporalAdvanceOwner});
    const committed={party_id:'party-fire',party_state:{state_version:1,
      turn_number:1},
      actor_id:'pc',clock:clock(0),clock_weather_light:{clock:clock(0)},
      body_state:{},local_fire_runtime:[],temporal_boundary_candidates:[],
      temporal_source_proof:sourceProof(),items:[{item_id:'fuel-route',
        runtime_instance_mechanics_snapshot:mechanics('fuel-route')},{
        item_id:'ignition',runtime_instance_mechanics_snapshot:
          mechanics('ignition'),placement:{anchor_id:'scope-fire'}}],
      knowledge:[],prepared_scenes:[{location_profile_ref:'camp',
        node:{instance_id:'camp-node'}}]};
    const ports=createLowerDvinaTraceTurnStepRuntimePorts({
      committedState:committed,temporalAdvance,bodyEffect:{apply:async()=>({
        applied:false,proposal:null,state_after:{}})},workingProjectionAuthority:
        createLowerDvinaTracePlayerSafeWorkingProjectionAuthority()});
    const registry=createTurnStepExecutionRegistry({domain:{
      request_world_process:async(execution)=>({working_projection:
        ports.applyLocalFireProjection({working_projection:
          execution.working_projection,actor:execution.request.actor,
        local_fire_atomic_write_plan:start}),summary:'fire',write_fragments:[],
      local_fire_atomic_write_plans:[start],consequence_fragment:{visible_seed:{
        turn_step_world_process_1:{schema:
          'rus.lower_dvina_trace_turn_step_world_process_visible_result.v1',
        process_kind:'fire',action:'start',outcome:'started',status:'active'}}}}),
      request_movement:(execution)=>ports.preparedDomainEffect.apply({
        ...execution,command_id:
          'lower_dvina_trace.follow_path_to_fishing_camp',option_id:'route',
        availability:{available:true},consequence:{phase3_kind:'movement',
          duration_minutes:8,movement:{route_ref:'shore-camp',source:{
            location_ref:'scope-fire'},destination:{location_ref:'camp',
            g5_anchor_id:'camp-anchor'}},visible_seed:{},hidden_update:{},
          state_changes:[],suggested_actions:[]}})},applySemanticActivity:async(
        {working_projection:projection})=>({working_projection:projection,
          summary:'done',write_fragments:[],player_response_boundary:true})});
    const requests=[];
    const result=await runTurnStepLoop({requestId:'request-route',
      rootTurnId:'turn-route',committedStateVersion:1,
      rootPlayerAction:'разжечь огонь и уйти в лагерь',actor:{actor_id:'pc',
        attributes:{strength:{value:9}}},
      initialWorkingProjection:{actor_id:'pc',position:{
        location_ref:'scope-fire'},destination_refs:['camp'],clock:clock(0),
        clock_weather_light:{clock:clock(0)},knowledge:[],items:[{
          item_id:'fuel-route',instance_id:'fuel-route',placement:{
            holder_character_id:'pc',physical_position:'hands'}},{
          item_id:'ignition',instance_id:'ignition',placement:{
            anchor_id:'scope-fire'}}],inventory:{
          items:['fuel-route'],total_weight:{grams:300},load_category:'light',
          occupied_hands:1}},maxInternalSteps:8},{executionRegistry:registry,
      preparedEffectContext:ports.preparedEffectContext,
      preparedEffectTimeOwner:ports.preparedEffectTimeOwner,
      preparedEffectBodyOwner:ports.preparedEffectBodyOwner,
      preparedEffectProjectionOwner:ports.preparedEffectProjectionOwner,
      projectPlayerSafeState:async({working_projection:projection})=>projection,
      revalidateCommittedState:async()=>true,turnStepModel(request){
        requests.push(request);
        if(request.step_index===1)return fireStepPlan(request);
        if(request.step_index===2)return routeStepPlan(request);
        return doneStepPlan(request);}});
    assert.equal(requests[2].player_safe_state.position.location_ref,'camp');
    assert.equal(requests[2].player_safe_state.clock.whole_minutes,'8');
    assert.equal(requests[2].player_safe_state.items.some(
      ({item_id:id})=>id==='fuel-route'),false);
    assert.deepEqual(result.local_fire_atomic_write_plans.map((plan)=>
      plan.transition_proposal.action),['start','due_boundary']);
    assert.equal(result.local_fire_atomic_write_plans[1].change_set_id,
      'change:party-fire:turn-step:2');
    const draft={loop_result:result,selected_command_ids:[
      'lower_dvina_trace.follow_path_to_fishing_camp']};
    const consequence=mergeTurnStepDraftConsequence(
      buildTurnStepPreparedDomainConsequence(draft),draft);
    const visible=await createLowerDvinaTraceTurnStepVisibleProjector({
      fallback:createTracePhase3VisibleProjector({
        phase2Projector:{project(){throw new Error('unexpected phase2');}},
        contracts:{actors:[{instance_id:'npc-camp',ref:'eremey_fisher'}]}
      })
    }).project({consequence});
    assert.equal(visible.visible_scene,
      'Микула пришёл в рыбацкий стан. Огонь разгорелся.');
    assert.deepEqual(visible.visible_changes,[
      'Вы добрались от места крушения до рыбацкого стана.',
      'turn_step_world_process_1:local_fire:started']);
    assert.equal(visible.visible_changes.some((change)=>
      change.includes(':complete')),false);
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
    relevant_state:{party_id:'party-fire',party_state:{state_version:1,turn_number:1},
      temporal_boundary_candidates:[],temporal_source_proof:sourceProof()},
    local_fire_atomic_write_plans:actorPlans,root_turn_id:'turn-fire'});
}

function startPlan(processRef,fuelRefs,at=10){
  return createLocalFireAtomicWritePlan({schema:
    'local_fire_atomic_write_request_v1',party_id:'party-fire',
    base_party_state_version:1,change_set_id:'change-fire',actor_ref:'pc',
    profile_pin:profilePin(),process_state:null,
    input_pins:fuelRefs.map(fuelPin),ignition_basis_pin:ignitionPin(),
    action:'start',process_ref:processRef,at_timestamp:clock(at),cause:{
      kind:'actor_step',request_id:`request:${processRef}`,
      root_turn_id:'turn-fire',step_index:1},qualitative_outcome:null});
}

function addPlan(start,itemId){
  const process=start.transition_proposal.process_after;
  return createLocalFireAtomicWritePlan({schema:
    'local_fire_atomic_write_request_v1',party_id:'party-fire',
    base_party_state_version:1,change_set_id:'change-fire',actor_ref:'pc',
    profile_pin:profilePin(),process_state:process,input_pins:[fuelPin(itemId)],
    ignition_basis_pin:null,action:'add_fuel',process_ref:process.process_ref,
    at_timestamp:clock(11),cause:{kind:'actor_step',request_id:'request:add',
      root_turn_id:'turn-fire',step_index:2},qualitative_outcome:null});
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

function fireStepPlan(request){return stepPlan(request,{resolution:'domain_request',
  goal_result:'pending',activity:{owner:'domain',duration_class:null,
    effort:null},operations:[{op:'request_world_process',actor_ref:'pc',
    process_action:'start',process_ref:null,process_kind:'fire',
    source_refs:['fuel-route'],target_refs:['ignition'],description:'огонь'}],
  continuation:{remaining_intent:'уйти в лагерь',depends_on_refs:['camp']}});}
function routeStepPlan(request){return stepPlan(request,{resolution:
  'domain_request',goal_result:'pending',activity:{owner:'domain',
    duration_class:null,effort:null},operations:[{op:'request_movement',
    actor_ref:'pc',movement_kind:'local',target_ref:'camp'}],continuation:{
    remaining_intent:'осмотреться',depends_on_refs:['camp']}});}
function doneStepPlan(request){return stepPlan(request,{});}
function stepPlan(request,overrides){return{schema:'turn_step_plan_v1',
  request_id:request.request_id,committed_state_version:
    request.committed_state_version,working_revision:request.working_revision,
  step_index:request.step_index,interpretation:{player_goal:
    request.root_player_action,grounded_attempt:request.remaining_intent,
    adaptation:'literal'},resolution:'direct',goal_result:'achieved',activity:{
    owner:'semantic',duration_class:'moment',effort:'none'},operations:[],
  check:null,continuation:null,clarification:null,reason_code:'test',
  reason:'temporal F1 production regression',...overrides};}
