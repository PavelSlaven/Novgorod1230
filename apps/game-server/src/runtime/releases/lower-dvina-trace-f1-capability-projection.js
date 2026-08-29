import { admitLocalFireIgnitionBasis, admitLocalFireInput } from
  '@rus/items-property';
import { npcSafeSnapshotHasEntityEvidence, projectNpcSafeResourceSnapshots } from
  '@rus/npc-runtime';
import { createLocalFireAtomicWritePlan } from
  '../../infrastructure/postgres/local-fire-atomic-write-plan.js';
import { projectLowerDvinaTraceF1CurrentState } from
  '../lower-dvina-trace-local-fire-current-state.js';

export function projectLowerDvinaTraceF1Capability({playerSafeState,
  committedState,localFirePlans=[],loadedProfile,resolverAvailable}){
  const profile=loadedProfile?.profile;
  if(!resolverAvailable||profile?.status!=='approved')return structuredClone(playerSafeState);
  const visible=new Set((playerSafeState?.items??[])
    .map((item)=>item?.item_id??item?.instance_id).filter(text));
  const scopeRef=currentScope(playerSafeState);
  const ignition=(committedState?.items??[]).filter((item)=>visible.has(item.item_id)
    &&item.state?.local_fire_ignition_basis?.schema
      ==='rus.items.local_fire_ignition_basis.v1'
    &&item.state?.lifecycle_status==='active').map(({item_id:id})=>id).sort();
  const items=currentFireItems(committedState,localFirePlans)
    .filter(({item_id:id})=>visible.has(id));
  const processStates=currentProcessStates(committedState,localFirePlans);
  const active=processStates
    .filter((state)=>state?.status==='active'
      &&state.scope_ref===scopeRef&&state.fuel_bindings?.some(
        ({fuel_ref:ref})=>visible.has(ref))).sort((left,right)=>
        left.process_ref.localeCompare(right.process_ref));
  if(!text(scopeRef)||ignition.length===0&&active.length===0)
    return structuredClone(playerSafeState);
  const bound=new Map(active.flatMap((state)=>state.fuel_bindings.map(
    ({fuel_ref:ref})=>[ref,state.process_ref])));
  const allowed=playerWorldProcessOperations({profile,actorRef:
    playerSafeState?.actor_id,scopeRef,ignition,active,items,bound});
  return{...structuredClone(playerSafeState),local_world_process:{
    semantic_grounding_available:true,context_ref:profile.context_ref,scope_ref:scopeRef,
    ignition_basis_refs:ignition,active_process_refs:active.map(({process_ref:ref})=>ref),
    ...(allowed.length===0?{}:{allowed}),
    }};
}

export function projectLowerDvinaTraceF1NpcCapability({ committedState,
  npcSnapshot, loadedProfile, resolverAvailable, priorLocalFirePlans = [] } = {}) {
  const profile = loadedProfile?.profile;
  if (!resolverAvailable || profile?.status !== 'approved') return null;
  const scopeRef = npcSnapshot?.anchor_id
    ?? npcSnapshot?.machine_state?.location_ref
    ?? npcSnapshot?.location_profile_ref ?? null;
  if (!text(scopeRef)) return null;
  const items = currentFireItems(committedState, priorLocalFirePlans);
  const resources = [...(committedState?.containers ?? []), ...items];
  const available = new Set(projectNpcSafeResourceSnapshots({
    npc_snapshot: npcSnapshot, resource_snapshots: resources,
    perception_snapshot: npcSnapshot?.perception_snapshot ?? null,
    knowledge_snapshot: npcSnapshot?.knowledge_snapshot ?? null
  }).map(({ resource_ref: ref }) => ref));
  const objectiveActive = currentProcessStates(committedState, priorLocalFirePlans)
    .filter((state) => state?.status === 'active'
      && state.scope_ref === scopeRef);
  const active = objectiveActive.filter((state) =>
    npcSafeSnapshotHasEntityEvidence({ entity_ref: state.process_ref,
      perception_snapshot: npcSnapshot?.perception_snapshot ?? null,
      knowledge_snapshot: npcSnapshot?.knowledge_snapshot ?? null }))
    .sort((left, right) => left.process_ref.localeCompare(right.process_ref));
  const bound = new Map(objectiveActive.flatMap((state) =>
    state.fuel_bindings.map(({ fuel_ref: ref }) => [ref, state.process_ref])));
  const availableItems = items.filter(({ item_id: id }) => available.has(id));
  const ignition = availableItems.filter((item) => admitLocalFireIgnitionBasis({
    item, placement: item.placement, ownership: item.ownership,
    actor_ref: npcSnapshot?.instance_id, scope_ref: scopeRef
  }).pass).map(({ item_id: id }) => id).sort();
  const allowed = [];
  if (profile.allowed_actions?.includes('start')) {
    const fuels = admittedInputRefs(availableItems, npcSnapshot?.instance_id, scopeRef,
      profile, bound, 'fuel_unit');
    for (const sourceRef of fuels) for (const ignitionRef of ignition) {
      allowed.push({ process_action: 'start', process_ref: null,
        process_kind: 'fire', source_refs: [sourceRef],
        target_refs: [ignitionRef] });
    }
  }
  if (profile.allowed_actions?.includes('affect')) {
    for (const process of active) {
      const inputs = admittedInputRefs(availableItems, npcSnapshot?.instance_id,
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
    allowed: Object.freeze(allowed.map(Object.freeze)) });
}

function currentProcessStates(committedState, plans) {
  const byRef = new Map((committedState?.local_fire_runtime ?? [])
    .map(({ process_state: state }) => [state?.process_ref, state])
    .filter(([ref]) => text(ref)));
  for (const raw of plans ?? []) {
    const state = createLocalFireAtomicWritePlan(raw)
      .transition_proposal.process_after;
    byRef.set(state.process_ref, state);
  }
  return [...byRef.values()];
}

function currentFireItems(committedState, plans) {
  return projectLowerDvinaTraceF1CurrentState({
    committedState, priorLocalFirePlans: plans
  }).items;
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

function playerWorldProcessOperations({profile,actorRef,scopeRef,ignition,
  active,items,bound}){
  if(!text(actorRef))return[];
  const allowed=[];
  if(profile.allowed_actions?.includes('start')){
    const fuels=admittedInputRefs(items,actorRef,scopeRef,profile,bound,
      'fuel_unit');
    for(const sourceRef of fuels)for(const ignitionRef of ignition)allowed.push({
      op:'request_world_process',actor_ref:actorRef,process_action:'start',
      process_ref:null,process_kind:'fire',source_refs:[sourceRef],
      target_refs:[ignitionRef],description:'Разжечь огонь.'});
  }
  if(profile.allowed_actions?.includes('affect')){
    const inputs=admittedInputRefs(items,actorRef,scopeRef,profile,bound,null);
    for(const {process_ref:processRef} of active)for(const sourceRef of inputs)
      allowed.push({op:'request_world_process',actor_ref:actorRef,
        process_action:'affect',process_ref:processRef,process_kind:'fire',
        source_refs:[sourceRef],target_refs:[],description:'Воздействовать на огонь.'});
  }
  return Object.freeze(allowed.map(Object.freeze));
}

function currentScope(state){return state?.position?.g5_anchor_id
  ??state?.position?.anchor_id??state?.position?.location_ref??null;}
function text(value){return typeof value==='string'&&value.length>0;}
