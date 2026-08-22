import { createLocalFireAtomicWritePlan, localFirePhysicalKeys } from
  './local-fire-atomic-write-plan.js';

export function validLocalFireExtension(plan) {
  const localFire=plan.local_fire_atomic_write_plans??[];
  if(!Array.isArray(localFire))return false;
  if(localFire.length===0)return true;
  try{
    const values=localFire.map(createLocalFireAtomicWritePlan);
    const party=plan.updates?.find((write)=>write.target_table==='parties'
      &&write.id===plan.party_id);
    return values.every((value)=>value.party_id===plan.party_id
      &&value.change_set_id===plan.change_set_id
      &&party?.record?.party_id===plan.party_id
      &&plan.expected_state_versions.some((version)=>
        version.target_table==='parties'&&version.id===plan.party_id
          &&version.state_version===value.base_party_state_version)
      &&localFirePhysicalKeys(value).every((key)=>plan.physical_keys.includes(key))
      &&outerCauseMatches(plan,value))
      &&!hasGenericInputMutationConflict(plan,values);
  }catch{return false;}
}

function outerCauseMatches(plan,value){
  const proposal=value.transition_proposal,cause=proposal.cause;
  if(proposal.action==='due_boundary'){
    return cause.kind==='temporal_boundary'
      &&cause.boundary_id===`local-fire:${proposal.process_before?.process_ref}`
        +`:state:${proposal.process_before?.state_version}`
      &&cause.expected_process_state_version===proposal.process_before?.state_version
      &&JSON.stringify(cause.due_at)===JSON.stringify(proposal.at_timestamp)
      &&JSON.stringify(cause.due_at)===JSON.stringify(
        proposal.process_before?.next_boundary_at);
  }
  const npc=plan.semantic_command_snapshot?.npc_actor_step;
  if(npc!=null){
    return plan.operation_kind==='trace_phase_7_fire_rest'
      &&cause.kind==='actor_step'&&cause.request_id===npc.request_id
      &&cause.root_turn_id===npc.root_turn_id
      &&cause.step_index===npc.step_index
      &&plan.owner_keys.includes(`actor:${value.actor_ref}`)
      &&traceOperationMatches(npc.operation,value);
  }
  const trace=plan.semantic_command_snapshot?.semantic_trace?.step_traces
    ?.[cause.step_index-1];
  const request=trace?.plan_request;
  const operations=(trace?.approved_plan?.operations??[])
    .filter(({op})=>op==='request_world_process');
  return cause.kind==='actor_step'&&cause.request_id===request?.request_id
    &&cause.root_turn_id===request?.root_turn_id
    &&cause.root_turn_id===plan.visible_package_envelope?.turn_id
    &&plan.owner_keys.includes(`actor:${value.actor_ref}`)
      &&trace?.step_index===cause.step_index
      &&request?.step_index===cause.step_index
    &&operations.length===1&&traceOperationMatches(operations[0],value);
}

function traceOperationMatches(operation,value){
  if(operation?.op!=='request_world_process')return false;
  const proposal=value.transition_proposal;
  const sourceRefs=proposal.action==='affect'
    ?[proposal.consumed_item_ref]:proposal.added_fuel_refs;
  return operation.actor_ref===value.actor_ref
    &&operation.process_kind==='fire'
    &&operation.process_action===(proposal.action==='start'?'start':'affect')
    &&operation.process_ref===(proposal.action==='start'?null
      :proposal.process_before?.process_ref)
    &&JSON.stringify(operation.source_refs)===JSON.stringify(sourceRefs)
    &&JSON.stringify(operation.target_refs)===JSON.stringify(
      proposal.action==='start'?[value.profile_pin.ignition_basis_ref]:[]);
}

function hasGenericInputMutationConflict(plan,values){
  const protectedRefs=new Set(values.flatMap((value)=>
    value.input_pins.map(({item_id:id})=>id)));
  return genericItemMutationRefs(plan).some((ref)=>protectedRefs.has(ref));
}
function genericItemMutationRefs(plan){return[...(plan.inserts??[]),
  ...(plan.updates??[]),...(plan.deletes??[])].flatMap((write)=>{
    if(write.target_table==='party_items'
        ||write.target_table==='party_item_placements')return[write.record?.item_id??write.id];
    if(write.target_table==='party_ownership'&&write.record?.item_id!=null)
      return[write.record.item_id];return[];}).concat(
        (plan.action_production_atomic_write_plans??[]).flatMap((action)=>
          (action.source_updates??[]).map(({item_id:id})=>id))
      );}
