import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTracePhase7ScheduleTemporalAdvance } from
  '../src/runtime/lower-dvina-trace-phase-7-schedule-temporal.js';
import { createLocalFireAtomicWritePlan } from
  '../src/infrastructure/postgres/local-fire-atomic-write-plan.js';
import { applyLocalFireTemporalProjection,
  localFireTemporalCandidateFromRuntime,
  localFireTemporalRuntimeFromPlan } from
  '../src/runtime/lower-dvina-trace-local-fire-temporal.js';

const at = (minutes) => ({
  whole_minutes: String(minutes),
  subminute_numerator: '0',
  subminute_denominator: '1'
});

function baseActorStep() {
  return {
    started_at: at(125),
    result: { npc_ref: 'zhdanko-1' },
    working_projection: {
      active_npc_actor_step: {
        npc_ref: 'zhdanko-1',
        status: 'started',
        started_at: at(125),
        planned_exact_elapsed: {
          exact_minutes: { numerator: '5', denominator: '1' }
        },
        semantic_operation: { op: 'request_activity' },
        decision_trace_ref: {
          entity_kind: 'npc_semantic_decision_trace',
          entity_id: 'trace-1'
        }
      },
      cumulative_elapsed_minutes: 25
    }
  };
}

function baseTemporal() {
  return {
    execution_id: 'exec-1',
    limit_timestamp: at(130),
    result: {
      temporal_status: 'paused',
      clock_after: at(125),
      trace: { processed_boundary_ids: ['wait-terminal'] }
    }
  };
}

test('external interrupting boundary returns paused without TEMPORAL_INTERRUPTED',
  () => {
    const advanced = resolveTracePhase7ScheduleTemporalAdvance({
      state: {
        party_id: 'party-1',
        party_state: { turn_number: 7, state_version: 7 },
        clock: at(100),
        temporal_boundary_candidates: [{
          boundary_id: 'external-interrupt',
          scheduled_at: at(127)
        }]
      },
      temporal: baseTemporal(),
      actorStep: baseActorStep(),
      temporalAdvanceOwner: {
        advance: () => ({
          result: {
            temporal_status: 'paused',
            clock_before: at(125),
            clock_after: at(127)
          },
          state_projection: {
            cumulative_elapsed_minutes: 27,
            active_npc_actor_step: {
              npc_ref: 'zhdanko-1',
              status: 'started'
            }
          }
        })
      },
      commandIdempotencyKey: 'idem-1'
    });
    assert.equal(advanced.result.temporal_status, 'paused');
    assert.equal(advanced.elapsed_after_decision, 2);
  });

test('uninterrupted schedule advance still requires completed T+30 path', () => {
  assert.throws(() => resolveTracePhase7ScheduleTemporalAdvance({
    state: {
      party_id: 'party-1',
      party_state: { turn_number: 7, state_version: 7 },
      clock: at(100),
      temporal_boundary_candidates: []
    },
    temporal: baseTemporal(),
    actorStep: baseActorStep(),
    temporalAdvanceOwner: {
      advance: () => ({
        result: {
          temporal_status: 'completed',
          clock_before: at(125),
          clock_after: at(128)
        },
        state_projection: {
          cumulative_elapsed_minutes: 28,
          active_npc_actor_step: {
            npc_ref: 'zhdanko-1',
            status: 'started'
          }
        }
      })
    },
    commandIdempotencyKey: 'idem-2'
  }), ({ code }) => code === 'TRACE_PHASE_7_SCHEDULE_TEMPORAL_INTERRUPTED');

  const ok = resolveTracePhase7ScheduleTemporalAdvance({
    state: {
      party_id: 'party-1',
      party_state: { turn_number: 7, state_version: 7 },
      clock: at(100),
      temporal_boundary_candidates: []
    },
    temporal: baseTemporal(),
    actorStep: baseActorStep(),
    temporalAdvanceOwner: {
      advance: () => ({
        result: {
          temporal_status: 'completed',
          clock_before: at(125),
          clock_after: at(130)
        },
        state_projection: {
          cumulative_elapsed_minutes: 30,
          active_npc_actor_step: {
            npc_ref: 'zhdanko-1',
            status: 'completed',
            completed_at: at(130)
          }
        }
      })
    },
    commandIdempotencyKey: 'idem-3'
  });
  assert.equal(ok.result.temporal_status, 'completed');
  assert.equal(ok.elapsed_after_decision, 5);
});

test('NPC affect replaces the committed fire candidate before remaining advance',
  ()=>{
    const start=firePlan({action:'start',process:null,item:'fuel-old',step:1});
    const add=firePlan({action:'add_fuel',
      process:start.transition_proposal.process_after,item:'fuel-new',step:2});
    const runtime=localFireTemporalRuntimeFromPlan(start);
    const oldCandidate=localFireTemporalCandidateFromRuntime(runtime);
    const actorStep=baseActorStep();
    actorStep.local_fire_atomic_write_plans=[add];
    actorStep.working_projection=applyLocalFireTemporalProjection({
      ...actorStep.working_projection,local_fire_runtime:[runtime]},add);
    let ids;
    resolveTracePhase7ScheduleTemporalAdvance({state:{party_id:'party-1',
      party_state:{turn_number:7,state_version:7},clock:at(100),
      temporal_boundary_candidates:[oldCandidate]},temporal:baseTemporal(),
    actorStep,temporalAdvanceOwner:{advance({source_candidates:candidates}){
      ids=candidates.map(({boundary_id:id})=>id);
      return{result:{temporal_status:'completed',clock_before:at(125),
        clock_after:at(130)},state_projection:{cumulative_elapsed_minutes:30,
        active_npc_actor_step:{npc_ref:'zhdanko-1',status:'completed'}}};}},
    commandIdempotencyKey:'idem-fire',rootTurnId:'turn-fire'});
    assert.deepEqual(ids,[`local-fire:${start.transition_proposal.process_after
      .process_ref}:state:2`]);
  });

function firePlan({action,process,item,step}){
  return createLocalFireAtomicWritePlan({schema:
    'local_fire_atomic_write_request_v1',party_id:'party-1',
    base_party_state_version:7,change_set_id:'change-fire',
    actor_ref:'zhdanko-1',profile_pin:fireProfile(),process_state:process,
    input_pins:[firePin(item)],ignition_basis_pin:action==='start'
      ?ignitionPin():null,action,process_ref:action==='start'?'fire-existing'
      :process.process_ref,at_timestamp:at(125),cause:{kind:'actor_step',
      request_id:`request:${step}`,root_turn_id:'turn-fire',step_index:step},
    qualitative_outcome:null});
}
function fireProfile(){return{profile_ref:'profile-fire',profile_version:1,
  context_ref:'context-fire',scope_ref:'scope-fire',
  ignition_basis_ref:'ignition',policy:{schema:'local_fire_policy_v1',
    policy_ref:'policy-fire',version:1,recheck_interval:{exact_minutes:{
      numerator:'5',denominator:'1'}},fuel_unit_mass_grams_min:100,
    fuel_unit_mass_grams_max:1000}};}
function firePin(itemId){return pin(itemId,{local_fire_fuel:{schema:
  'rus.items.local_fire_fuel.v1',fuel_class:'ordinary_solid_fuel_unit',
  whole_unit:true,provenance:{source_refs:['wood']}},
  runtime_instance_mechanics_snapshot:{schema:
    'rus.items.runtime_instance_mechanics_snapshot.v1',version:1,provenance:{
      source_kind:'ordinary_direct_action_result',root_turn_id:'source',
      step_index:1,operation_ref:'split',origin_kind:'direct_partition',
      source_refs:['wood']},mechanics:{mass_grams:300,external_hand_cost:1,
      carry_form:'compact',packing_slot_cost:1,quantity:{value:1,unit:'item'},
      container:null}}});}
function ignitionPin(){return pin('ignition',{local_fire_ignition_basis:{
  schema:'rus.items.local_fire_ignition_basis.v1'},inventory_profile_snapshot:{
  inventory_profile_id:'ignition',item_template_ref:'ignition',mass_grams:1,
  carry_form:'compact',external_hand_cost:0,packing_slot_cost:1}});}
function pin(itemId,state){return{item_id:itemId,item:{item_id:itemId,
  run_id:null,template_id:null,profile_id:null,category_id:null,quantity:1,
  condition_state:'serviceable',legal_status:'ordinary',state_version:1,
  state:{lifecycle_status:'active',...state}},placement:{item_id:itemId,
  anchor_id:'scope-fire',container_id:null,holder_npc_id:'zhdanko-1',
  holder_character_id:null,physical_position:'hands',
  equipment_slot_category_id:null,attached_item_id:null},ownership:{
  ownership_id:`own:${itemId}`,item_id:itemId,owner_npc_id:'zhdanko-1',
  owner_character_id:null,owner_party:false,controller_npc_id:'zhdanko-1',
  controller_character_id:null,claim_state:'owned'},bound_process_ref:null};}
