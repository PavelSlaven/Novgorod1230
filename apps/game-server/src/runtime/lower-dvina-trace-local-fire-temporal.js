import { createLocalFireAtomicWritePlan, localFirePhysicalKeys } from
  '../infrastructure/postgres/local-fire-atomic-write-plan.js';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';

export function lowerDvinaTraceLocalFireTemporalRegistration(profile){
  requireProfile(profile);
  const ruleRef=versioned('action_contract','local_exact_fire_due_v1','1');
  const policyRef=versioned('activity_contract',profile.policy_ref,
    String(profile.policy_version));
  return Object.freeze({rule_ref:ruleRef,policy_ref:policyRef,
    resolve(candidate,context){
      const processRef=candidate?.source_ref?.entity_kind==='propagation_process'
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
      const stateProjection=applyLocalFireTemporalProjection(
        context.projection,plan);
      const after=plan.transition_proposal.process_after;
      const replacement=after.status==='active'
        ?nextCandidate(candidate,after,ruleRef,policyRef):null;
      return Object.freeze({disposition:replacement==null?'execute':'replace',
        ...(replacement==null?{}:{replacement}),follow_up_candidates:[],
        state_projection:stateProjection,
        proposals:[Object.freeze({proposal_id:candidate.boundary_id,
          local_fire_atomic_write_plans:Object.freeze([plan]),owner_keys:[],
          physical_keys:Object.freeze(localFirePhysicalKeys(plan))})]});
    }});
}

function exactCandidate(candidate,runtime,ruleRef,policyRef){
  const process=runtime.process_state;
  return candidate?.boundary_id===`local-fire:${process.process_ref}:state:${process.state_version}`
    &&candidate.boundary_kind==='propagation'
    &&sameTimestamp(candidate.scheduled_at,process.next_boundary_at)
    &&sameVersionedRef(candidate.rule_ref,ruleRef)
    &&sameVersionedRef(candidate.policy_ref,policyRef)
    &&candidate.idempotency_key===candidate.boundary_id
    &&candidate.resolution_class==='propagation_background';
}
export function applyLocalFireTemporalProjection(projection,plan){
  const next=structuredClone(projection),after=plan.transition_proposal.process_after;
  let runtime=findRuntime(next,after.process_ref);
  if(runtime==null){
    if(plan.transition_proposal.process_before!==null)
      fail('LOCAL_FIRE_TEMPORAL_CONTEXT_STALE');
    next.local_fire_runtime??=[];
    runtime=localFireTemporalRuntimeFromPlan(plan);
    next.local_fire_runtime.push(runtime);
    return next;
  }
  runtime.process_state=structuredClone(after);
  const remaining=new Set(after.fuel_bindings.map(({fuel_ref:ref})=>ref));
  const pins=new Map([...runtime.input_pins,...plan.input_pins]
    .map((pin)=>[pin.item_id,pin]));
  runtime.input_pins=[...remaining].map((ref)=>structuredClone(pins.get(ref)));
  if(runtime.input_pins.some((pin)=>pin==null))
    fail('LOCAL_FIRE_TEMPORAL_CONTEXT_STALE');
  return next;
}
export function localFireTemporalRuntimeFromPlan(raw){
  const plan=createLocalFireAtomicWritePlan(raw);
  const process=plan.transition_proposal.process_after;
  const bound=new Set(process.fuel_bindings.map(({fuel_ref:ref})=>ref));
  return{party_id:plan.party_id,rule_ref:versioned('action_contract',
    'local_exact_fire_due_v1','1'),policy_ref:versioned(
      'activity_contract',plan.profile_pin.policy.policy_ref,
      String(plan.profile_pin.policy.version)),process_state:structuredClone(
      process),input_pins:plan.input_pins.filter(({item_id:id})=>bound.has(id))
        .map((pin)=>({...structuredClone(pin),bound_process_ref:
          process.process_ref}))};
}
export function localFireTemporalCandidateFromRuntime(runtime){
  const state=runtime.process_state;
  const refs=state.fuel_bindings.map(({fuel_ref:ref})=>({entity_kind:'item',
    entity_id:ref}));const id=`local-fire:${state.process_ref}:state:${state.state_version}`;
  return{boundary_id:id,boundary_kind:'propagation',
    scheduled_at:structuredClone(state.next_boundary_at),source_ref:{
      entity_kind:'propagation_process',entity_id:state.process_ref},
    primary_subject_ref:refs[0],scope_ref:{entity_kind:'party',
      entity_id:runtime.party_id},rule_ref:runtime.rule_ref,
    policy_ref:runtime.policy_ref,preconditions_digest:
      computeSpatialV3CanonicalDigest({process_state:state,
        expected_state_version:state.state_version}),
    resolution_class:'propagation_background',interrupt_effect:'background',
    visibility_policy_ref:runtime.policy_ref,idempotency_key:id,
    subject_refs:refs,causal_parent_refs:[]};
}
function nextCandidate(candidate,after,ruleRef,policyRef){
  const fuelRefs=after.fuel_bindings.map(({fuel_ref:ref})=>({
    entity_kind:'item',entity_id:ref}));
  const boundaryId=`local-fire:${after.process_ref}:state:${after.state_version}`;
  return Object.freeze({...structuredClone(candidate),boundary_id:boundaryId,
    scheduled_at:structuredClone(after.next_boundary_at),rule_ref:ruleRef,
    policy_ref:policyRef,visibility_policy_ref:policyRef,
    primary_subject_ref:fuelRefs[0],subject_refs:fuelRefs,
    preconditions_digest:computeSpatialV3CanonicalDigest({
      process_state:after,expected_state_version:after.state_version}),
    idempotency_key:boundaryId});
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
function sameVersionedRef(left,right){return left?.authoring_version
  ===right?.authoring_version&&left?.entity_ref?.entity_kind
  ===right?.entity_ref?.entity_kind&&left?.entity_ref?.entity_id
  ===right?.entity_ref?.entity_id;}
function sameTimestamp(left,right){return left?.whole_minutes===right?.whole_minutes
  &&left?.subminute_numerator===right?.subminute_numerator
  &&left?.subminute_denominator===right?.subminute_denominator;}
function fail(code){throw Object.assign(new Error(code),{code});}
