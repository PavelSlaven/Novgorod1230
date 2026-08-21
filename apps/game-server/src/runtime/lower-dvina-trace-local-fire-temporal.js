import { createLocalFireAtomicWritePlan, localFirePhysicalKeys } from
  '../infrastructure/postgres/local-fire-atomic-write-plan.js';

export function lowerDvinaTraceLocalFireTemporalRegistration(profile){
  requireProfile(profile);
  const ruleRef=versioned('world_process_rule','local_exact_fire_due_v1','1');
  const policyRef=versioned('world_process_policy',profile.context_ref,'1');
  return Object.freeze({rule_ref:ruleRef,policy_ref:policyRef,
    resolve(candidate,context){
      const processRef=candidate?.source_ref?.entity_kind==='local_world_process'
        ?candidate.source_ref.entity_id:null;
      const runtime=findRuntime(context?.projection,processRef);
      const request=context?.request,process=runtime?.process_state;
      if(runtime==null||request?.idempotency_context==null
          ||!exactCandidate(candidate,runtime,ruleRef,policyRef)){
        fail('LOCAL_FIRE_TEMPORAL_CONTEXT_STALE');
      }
      const plan=createLocalFireAtomicWritePlan({
        schema:'local_fire_atomic_write_request_v1',party_id:runtime.party_id,
        base_party_state_version:Number(request.base_state_version),
        change_set_id:request.idempotency_context.change_set_id,
        actor_ref:'system:local_fire_boundary',profile_pin:{
          profile_ref:profile.profile_id,profile_version:profile.revision,
          context_ref:profile.context_ref,scope_ref:process.scope_ref,
          ignition_basis_ref:process.causal_basis_ref,policy:{
            schema:'local_fire_policy_v1',policy_ref:profile.policy_ref,
            version:profile.policy_version,recheck_interval:profile.recheck_interval,
            fuel_unit_mass_grams_min:profile.fuel_unit_mass_grams_min,
            fuel_unit_mass_grams_max:profile.fuel_unit_mass_grams_max}},
        process_state:process,input_pins:runtime.input_pins,
        ignition_basis_pin:null,action:'due_boundary',process_ref:processRef,
        at_timestamp:candidate.scheduled_at,cause:{kind:'temporal_boundary',
          boundary_id:candidate.boundary_id,
          expected_process_state_version:process.state_version,
          due_at:structuredClone(candidate.scheduled_at)},
        qualitative_outcome:null});
      return Object.freeze({disposition:'execute',follow_up_candidates:[],
        proposals:[Object.freeze({proposal_id:candidate.boundary_id,
          local_fire_atomic_write_plan:plan,owner_keys:[],
          physical_keys:Object.freeze(localFirePhysicalKeys(plan))})]});
    }});
}

function exactCandidate(candidate,runtime,ruleRef,policyRef){
  const process=runtime.process_state;
  return candidate?.boundary_id===`local-fire:${process.process_ref}:state:${process.state_version}`
    &&candidate.boundary_kind==='world_process'
    &&JSON.stringify(candidate.scheduled_at)===JSON.stringify(process.next_boundary_at)
    &&JSON.stringify(candidate.rule_ref)===JSON.stringify(ruleRef)
    &&JSON.stringify(candidate.policy_ref)===JSON.stringify(policyRef)
    &&candidate.idempotency_key===candidate.boundary_id
    &&candidate.resolution_class==='local_exact_fire_due';
}
function findRuntime(projection,processRef){for(const candidate of[projection,
  projection?.phase6_state,projection?.world_state,
  projection?.conversation_state?.world_state]){const found=candidate
    ?.local_fire_runtime?.find?.(({process_state:state})=>state?.process_ref===processRef);
  if(found!=null)return found;}return null;}
function requireProfile(value){if(value?.schema!=='rus.lower_dvina_trace_local_fire_profile.v1'
    ||value.status!=='approved'||value.revision!==1)throw new TypeError(
    'Exact local-fire profile is required.');}
function versioned(entity_kind,entity_id,authoring_version){return{
  entity_ref:{entity_kind,entity_id},authoring_version};}
function fail(code){throw Object.assign(new Error(code),{code});}
