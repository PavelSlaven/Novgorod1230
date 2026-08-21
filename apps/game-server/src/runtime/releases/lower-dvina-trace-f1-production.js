import { admitLocalFireIgnitionBasis, admitLocalFireInput } from
  '@rus/items-property';
import { matchesOperationContract, projectNpcSafeResourceSnapshots } from
  '@rus/npc-runtime';
import { resolveWorldProcessStep } from '@rus/turn';
import { createLocalFireAtomicWritePlan } from
  '../../infrastructure/postgres/local-fire-atomic-write-plan.js';
import { loadLocalFireCommittedContext } from
  '../../infrastructure/postgres/local-fire-persistence.js';

export function createLowerDvinaTraceF1ProductionResolverFactory({ pool,
  loadedProfile, worldProcessStepModel } = {}) {
  const profile=requireProfile(loadedProfile);
  if(!pool?.query)throw new TypeError('F1 PostgreSQL pool is required.');
  return({partyId})=>async function resolveLocalFire(envelope){
    const operation=envelope.operation,actorRef=actorFrom(envelope.actor);
    const marker=capabilityFrom(envelope,operation);
    const npc=envelope.plan?.schema==='npc_step_plan_v1';
    const scopeRef=npc?marker?.scope_ref:currentScope(envelope.committed_state);
    if(operation?.op!=='request_world_process'||operation.process_kind!=='fire'
        ||operation.actor_ref!==actorRef||!text(actorRef)
        ||marker==null||!npc&&marker.semantic_grounding_available!==true
        ||marker.context_ref!==profile.context_ref||marker.scope_ref!==scopeRef
        ||!Array.isArray(operation.source_refs)||operation.source_refs.length<1){
      fail('TRACE_F1_SCOPE_INVALID');
    }
    const start=operation.process_action==='start';
    if(start?operation.process_ref!==null
      ||operation.target_refs.length!==1
      ||!marker.ignition_basis_refs.includes(operation.target_refs[0])
      :operation.process_action!=='affect'||operation.target_refs.length!==0
        ||!marker.active_process_refs.includes(operation.process_ref)){
      fail('TRACE_F1_SCOPE_INVALID');
    }
    const ignitionBasisRef=start?operation.target_refs[0]
      :marker.process_ignition_basis_refs[operation.process_ref];
    const profilePin=profilePinFrom(profile,scopeRef,ignitionBasisRef);
    const loaded=await loadLocalFireCommittedContext({client:pool,partyId,
      actorRef,profilePin,inputItemIds:operation.source_refs,
      processRef:operation.process_ref,
      ignitionBasisRef:start?ignitionBasisRef:null});
    const admissions=loaded.input_pins.map((pin)=>admitLocalFireInput({
      item:pin.item,placement:pin.placement,ownership:pin.ownership,
      bound_process_ref:pin.bound_process_ref,actor_ref:actorRef,
      scope_ref:scopeRef,fuel_mass_grams_min:profile.fuel_unit_mass_grams_min,
      fuel_mass_grams_max:profile.fuel_unit_mass_grams_max}));
    if(admissions.some(({pass})=>!pass))fail('TRACE_F1_INPUT_NOT_ADMITTED');
    let action=start?'start':null,qualitativeOutcome=null;
    if(!start){
      if(admissions.every(({input_kind:kind})=>kind==='fuel_unit')){
        action='add_fuel';
      }else if(admissions.length===1
          &&admissions[0].input_kind==='water_portion'){
        const semantic=await resolveWorldProcessStep({
          request:worldProcessRequest({envelope,loaded,operation,scopeRef}),
          worldProcessStepModel});
        qualitativeOutcome=semantic.process_outcome;
        action='affect';
      }else fail('TRACE_F1_INPUT_NOT_ADMITTED');
    }
    const request=envelope.request;
    const stepIndex=request.step_index??request.decision_index;
    const processRef=start
      ?`local-fire:${partyId}:${request.root_turn_id}:${stepIndex}`
      :operation.process_ref;
    const plan=createLocalFireAtomicWritePlan({
      schema:'local_fire_atomic_write_request_v1',party_id:partyId,
      base_party_state_version:Number(request.committed_state_version),
      change_set_id:request.change_set_id??`change:${partyId}:turn-step:${Number(
        envelope.committed_state.party_state.turn_number)+1}`,
      actor_ref:actorRef,profile_pin:profilePin,
      process_state:loaded.process_state,input_pins:loaded.input_pins,
      ignition_basis_pin:loaded.ignition_basis_pin,action,process_ref:processRef,
      at_timestamp:envelope.committed_state.clock,
      cause:{kind:'actor_step',request_id:request.request_id,
        root_turn_id:request.root_turn_id,step_index:stepIndex},
      qualitative_outcome:qualitativeOutcome});
    return Object.freeze({working_projection:structuredClone(
      envelope.working_projection),summary:`local_fire:${plan.transition_proposal.outcome}`,
      write_fragments:[],local_fire_atomic_write_plan:plan,
      player_response_boundary:true});
  };
}

export function projectLowerDvinaTraceF1Capability({playerSafeState,
  committedState,loadedProfile,resolverAvailable}){
  const profile=loadedProfile?.profile;
  if(!resolverAvailable||profile?.status!=='approved')return structuredClone(playerSafeState);
  const visible=new Set((playerSafeState?.items??[])
    .map((item)=>item?.item_id??item?.instance_id).filter(text));
  const scopeRef=currentScope(committedState);
  const ignition=(committedState?.items??[]).filter((item)=>visible.has(item.item_id)
    &&item.state?.local_fire_ignition_basis?.schema
      ==='rus.items.local_fire_ignition_basis.v1'
    &&item.state?.lifecycle_status==='active').map(({item_id:id})=>id);
  const active=(committedState?.local_fire_runtime??[])
    .map(({process_state:state})=>state).filter((state)=>state?.status==='active'
      &&state.scope_ref===scopeRef);
  if(!text(scopeRef)||ignition.length===0&&active.length===0)
    return structuredClone(playerSafeState);
  return{...structuredClone(playerSafeState),local_world_process:{
    semantic_grounding_available:true,context_ref:profile.context_ref,scope_ref:scopeRef,
    ignition_basis_refs:ignition,active_process_refs:active.map(({process_ref:ref})=>ref),
    process_ignition_basis_refs:Object.fromEntries(active.map((state)=>
      [state.process_ref,state.causal_basis_ref]))}};
}

export function projectLowerDvinaTraceF1NpcCapability({ committedState,
  npcSnapshot, loadedProfile, resolverAvailable } = {}) {
  const profile = loadedProfile?.profile;
  if (!resolverAvailable || profile?.status !== 'approved') return null;
  const scopeRef = npcSnapshot?.anchor_id
    ?? npcSnapshot?.machine_state?.location_ref
    ?? npcSnapshot?.location_profile_ref ?? null;
  if (!text(scopeRef)) return null;
  const resources = [
    ...(committedState?.containers ?? []), ...(committedState?.items ?? [])
  ];
  const available = new Set(projectNpcSafeResourceSnapshots({
    npc_snapshot: npcSnapshot, resource_snapshots: resources,
    perception_snapshot: npcSnapshot?.perception_snapshot ?? null,
    knowledge_snapshot: npcSnapshot?.knowledge_snapshot ?? null
  }).map(({ resource_ref: ref }) => ref));
  const active = (committedState?.local_fire_runtime ?? [])
    .map(({ process_state: state }) => state)
    .filter((state) => state?.status === 'active'
      && state.scope_ref === scopeRef)
    .sort((left, right) => left.process_ref.localeCompare(right.process_ref));
  const bound = new Map(active.flatMap((state) =>
    state.fuel_bindings.map(({ fuel_ref: ref }) => [ref, state.process_ref])));
  const items = (committedState?.items ?? []).filter(({ item_id: id }) =>
    available.has(id));
  const ignition = items.filter((item) => admitLocalFireIgnitionBasis({
    item, placement: item.placement, ownership: item.ownership,
    actor_ref: npcSnapshot?.instance_id, scope_ref: scopeRef
  }).pass).map(({ item_id: id }) => id).sort();
  const allowed = [];
  if (profile.allowed_actions?.includes('start')) {
    const fuels = admittedInputRefs(items, npcSnapshot?.instance_id, scopeRef,
      profile, bound, 'fuel_unit');
    for (const sourceRef of fuels) for (const ignitionRef of ignition) {
      allowed.push({ process_action: 'start', process_ref: null,
        process_kind: 'fire', source_refs: [sourceRef],
        target_refs: [ignitionRef] });
    }
  }
  if (profile.allowed_actions?.includes('affect')) {
    for (const process of active) {
      const inputs = admittedInputRefs(items, npcSnapshot?.instance_id,
        scopeRef, profile, bound, null);
      for (const sourceRef of inputs) allowed.push({
        process_action: 'affect', process_ref: process.process_ref,
        process_kind: 'fire', source_refs: [sourceRef], target_refs: []
      });
    }
  }
  if (allowed.length === 0) return null;
  return Object.freeze({ owner: '@rus/world-processes',
    context_ref: profile.context_ref, scope_ref: scopeRef,
    ignition_basis_refs: Object.freeze(ignition),
    active_process_refs: Object.freeze(active.map(
      ({ process_ref: ref }) => ref)),
    process_ignition_basis_refs: Object.freeze(Object.fromEntries(active.map(
      (state) => [state.process_ref, state.causal_basis_ref]))),
    allowed: Object.freeze(allowed.map(Object.freeze)) });
}

function admittedInputRefs(items, actorRef, scopeRef, profile, bound,
  requiredKind) {
  return items.flatMap((item) => {
    const admitted = admitLocalFireInput({ item, placement: item.placement,
      ownership: item.ownership,
      bound_process_ref: bound.get(item.item_id)
        ?? item.bound_process_ref ?? null,
      actor_ref: actorRef, scope_ref: scopeRef,
      fuel_mass_grams_min: profile.fuel_unit_mass_grams_min,
      fuel_mass_grams_max: profile.fuel_unit_mass_grams_max,
      process_ref: null });
    return admitted.pass && (requiredKind == null
      || admitted.input_kind === requiredKind) ? [item.item_id] : [];
  }).sort();
}

function worldProcessRequest({envelope,loaded,operation,scopeRef}){
  const process=loaded.process_state;
  return{schema:'world_process_step_request_v1',
    request_id:`${envelope.request.request_id}:world-process`,
    party_state_version:loaded.party_state_version,
    process_state_version:process.state_version,process_mode:'local_exact',
    process_kind:'fire',process:structuredClone(process),
    current_timestamp:structuredClone(envelope.committed_state.clock),
    trigger:'actor_affected',subject_state:{source_refs:[...operation.source_refs],
      facts:['existing water portion'],quantities:[{ref:operation.source_refs[0],
        value:1,unit:'portion'}]},environment_state:{scope_ref:scopeRef,facts:[]},
    allowed_outcomes:['no_effect','continue','complete']};
}
function profilePinFrom(profile,scopeRef,ignitionBasisRef){return{
  profile_ref:profile.profile_id,profile_version:profile.revision,
  context_ref:profile.context_ref,scope_ref:scopeRef,
  ignition_basis_ref:ignitionBasisRef,
  policy:{schema:'local_fire_policy_v1',policy_ref:profile.policy_ref,
    version:profile.policy_version,recheck_interval:profile.recheck_interval,
    fuel_unit_mass_grams_min:profile.fuel_unit_mass_grams_min,
    fuel_unit_mass_grams_max:profile.fuel_unit_mass_grams_max}};}
function markerFrom(state){const value=state?.local_world_process;
  return value&&typeof value==='object'&&!Array.isArray(value)?value:null;}
function capabilityFrom(envelope,operation){
  if(envelope.plan?.schema!=='npc_step_plan_v1'){
    return markerFrom(envelope.request?.player_safe_state);
  }
  const value=envelope.request?.decision_scope?.operation_contract
    ?.request_world_process;
  return matchesOperationContract(operation,value)
    &&text(value?.context_ref)&&text(value?.scope_ref)
    &&Array.isArray(value.ignition_basis_refs)
    &&Array.isArray(value.active_process_refs)
    &&value.process_ignition_basis_refs&&typeof value.process_ignition_basis_refs
      ==='object'&&!Array.isArray(value.process_ignition_basis_refs)
    ?value:null;
}
function currentScope(state){return state?.position?.g5_anchor_id
  ??state?.position?.anchor_id??state?.position?.location_ref??null;}
function actorFrom(actor){return actor?.actor_id??actor?.actor_ref??actor?.npc_id??null;}
function requireProfile(value){if(value?.schema!=='rus.lower_dvina_trace_f1_loaded_profile.v1'
    ||value.profile?.schema!=='rus.lower_dvina_trace_local_fire_profile.v1'
    ||value.profile.status!=='approved')throw new TypeError('Exact loaded F1 profile is required.');
  return value.profile;}
function text(value){return typeof value==='string'&&value.length>0;}
function fail(code){throw Object.assign(new Error(code),{code});}
