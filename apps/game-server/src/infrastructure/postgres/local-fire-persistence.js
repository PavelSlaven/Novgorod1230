import { createLocalFireAtomicWritePlan } from
  './local-fire-atomic-write-plan.js';
import { isDeepStrictEqual } from 'node:util';
import { localFireItemPin, localFireItemQuery } from
  './local-fire-persistence-pins.js';
import { actionProducedPreparedActionRows,
  actionProducedPreparedOrdinaryRows } from
  './action-produced-prepared-ordinary.js';
import { localFirePriorRefs, validateLocalFirePriorChain } from
  './local-fire-prior-chain.js';

export async function loadLocalFireCommittedContext({ client, partyId,
  actorRef, profilePin, inputItemIds = [], processRef = null,
  ignitionBasisRef = null, rootTurnId = null, stepIndex = null,
  changeSetId = null, preparedOrdinaryPlan = null,
  preparedActionPlans = [], priorLocalFirePlans = [],
  currentRequestId = null, completedSteps = [] } = {}) {
  if (!client?.query || ![partyId, actorRef].every(text)
      || !plain(profilePin) || !Array.isArray(inputItemIds)
      || new Set(inputItemIds).size !== inputItemIds.length
      || !Array.isArray(priorLocalFirePlans)) fail('LOCAL_FIRE_LOAD_INVALID');
  const party = await client.query(
    `SELECT state_version FROM party_runtime.parties WHERE party_id=$1`,
  [partyId]);
  if (party.rows.length !== 1) fail('LOCAL_FIRE_LOAD_INVALID');
  const partyStateVersion = Number(party.rows[0].state_version);
  const priorRefs = localFirePriorRefs(priorLocalFirePlans);
  const processRefs = new Set(priorRefs.processRefs);
  if (processRef !== null) processRefs.add(processRef);
  const processStates = new Map();
  for (const ref of processRefs) {
    const process = await client.query(
      `SELECT process_state FROM party_runtime.party_local_world_processes
       WHERE party_id=$1 AND process_ref=$2`, [partyId, ref]);
    if (process.rows.length > 1) fail('LOCAL_FIRE_PROCESS_STALE');
    if (process.rows.length === 1) processStates.set(ref,
      process.rows[0].process_state);
  }
  const allItemIds = [...new Set([...inputItemIds, ...priorRefs.itemRefs,
    ...(ignitionBasisRef === null ? [] : [ignitionBasisRef])])];
  const preparedInput = { party_id:partyId,actor_ref:actorRef,
    root_turn_id:rootTurnId,step_index:stepIndex,
    expected_party_state_version:partyStateVersion,
    change_set_id:changeSetId,prepared_ordinary_plan:preparedOrdinaryPlan,
    prepared_action_plans:preparedActionPlans };
  const preparedActions=actionProducedPreparedActionRows(preparedInput);
  if(allItemIds.some((id)=>preparedActions.retired.has(id)))
    fail('LOCAL_FIRE_INPUT_STALE');
  const preparedOrdinary=actionProducedPreparedOrdinaryRows(preparedInput,
    allItemIds);
  const itemPins = new Map();
  for (const itemId of allItemIds) {
    const prepared=preparedActions.rows.get(itemId)
      ??preparedOrdinary.get(itemId);
    if(prepared!=null){itemPins.set(itemId,localFireItemPin(prepared.row));continue;}
    const result = await client.query(localFireItemQuery(false), [partyId,itemId]);
    if (result.rows.length !== 1) fail('LOCAL_FIRE_INPUT_STALE');
    itemPins.set(itemId,localFireItemPin(result.rows[0]));
  }
  validateLocalFirePriorChain({ rawPlans:priorLocalFirePlans, partyId,actorRef,
    profilePin,partyStateVersion,rootTurnId,stepIndex,changeSetId,
    currentRequestId,completedSteps,processStates,itemPins });
  const processState=processRef===null?null:processStates.get(processRef);
  if(processRef!==null&&processState==null)fail('LOCAL_FIRE_PROCESS_STALE');
  const inputPins=inputItemIds.map((id)=>itemPins.get(id));
  const ignitionBasisPin=ignitionBasisRef===null?null:itemPins.get(ignitionBasisRef);
  if(ignitionBasisRef!==null&&ignitionBasisPin==null){
    fail('LOCAL_FIRE_IGNITION_BASIS_STALE');
  }
  return freeze({ schema:'local_fire_committed_context_load_v2',
    party_id:partyId, party_state_version:partyStateVersion,
    actor_ref:actorRef, profile_pin:structuredClone(profilePin), process_state:processState,
    input_pins:inputPins, ignition_basis_pin:ignitionBasisPin });
}

export async function applyLocalFireAtomicWritePlanInTransaction({ client,
  input, p16ChangeSetId, partyStateVersionAfter } = {}) {
  const plan = createLocalFireAtomicWritePlan(input);
  if (plan.change_set_id !== p16ChangeSetId
      || partyStateVersionAfter !== plan.base_party_state_version + 1) {
    fail('LOCAL_FIRE_P16_BINDING_INVALID');
  }
  await lockProcess(client, plan);
  for (const pin of plan.input_pins) await lockPin(client, plan.party_id, pin);
  if (plan.ignition_basis_pin != null) {
    await lockPin(client, plan.party_id, plan.ignition_basis_pin);
  }
  const proposal = plan.transition_proposal;
  if (proposal.action === 'start') await insertProcess(client, plan);
  else await updateProcess(client, plan);
  if (proposal.added_fuel_refs.length) await appendBindings(client, plan);
  for (const transition of plan.fuel_placement_transitions) {
    await applyFuelPlacement(client, plan.party_id, transition);
  }
  if (proposal.released_fuel_refs.length) await releaseBindings(client, plan);
  if (plan.item_retirement_transition != null) {
    await applyRetirement(client, plan.party_id,
      plan.item_retirement_transition);
  }
  return Object.freeze({ replay:false });
}

async function applyFuelPlacement(client, partyId, transition) {
  const after = transition.after_placement;
  const result = await client.query(
    `UPDATE party_runtime.party_item_placements
     SET anchor_id=$1,container_id=$2,holder_npc_id=$3,
       holder_character_id=$4,physical_position=$5,
       equipment_slot_category_id=$6,attached_item_id=$7
     WHERE party_id=$8 AND item_id=$9`,
  [after.anchor_id,after.container_id,after.holder_npc_id,
    after.holder_character_id,after.physical_position,
    after.equipment_slot_category_id,after.attached_item_id,
    partyId,transition.item_id]);
  if (result.rowCount !== 1) fail('LOCAL_FIRE_INPUT_STALE');
}

async function lockPin(client, partyId, expected) {
  const result = await client.query(localFireItemQuery(true),
    [partyId,expected.item_id]);
  if (result.rows.length !== 1
      || !isDeepStrictEqual(localFireItemPin(result.rows[0]),expected))
    fail('LOCAL_FIRE_INPUT_STALE');
}

async function lockProcess(client, plan) {
  const before=plan.transition_proposal.process_before;
  const ref=plan.transition_proposal.process_after.process_ref;
  const result=await client.query(
    `SELECT process_state FROM party_runtime.party_local_world_processes
     WHERE party_id=$1 AND process_ref=$2 FOR UPDATE`,[plan.party_id,ref]);
  if (before===null ? result.rows.length!==0
    : result.rows.length!==1
      || !isDeepStrictEqual(result.rows[0].process_state,before)) {
    fail(before===null?'LOCAL_FIRE_PROCESS_COLLISION':'LOCAL_FIRE_PROCESS_STALE');
  }
}

async function insertProcess(client,plan) {
  const state=plan.transition_proposal.process_after;
  await client.query(
    `INSERT INTO party_runtime.party_local_world_processes
      (party_id,process_ref,context_ref,rule_ref,policy_ref,
       process_mode,process_kind,scope_ref,
       causal_basis_ref,status,started_at,next_boundary_at,process_state,
       state_version,last_change_set_id)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10,$11::jsonb,
       $12::jsonb,$13::jsonb,$14,$15)`,
  [plan.party_id,state.process_ref,plan.profile_pin.context_ref,
    JSON.stringify(localFireRuleRef()),JSON.stringify(localFirePolicyRef(plan)),
    state.process_mode,state.process_kind,state.scope_ref,state.causal_basis_ref,
    state.status,JSON.stringify(state.started_at),JSON.stringify(state.next_boundary_at),
    JSON.stringify(state),state.state_version,plan.change_set_id]);
}

function localFireRuleRef(){return{entity_ref:{entity_kind:'action_contract',
  entity_id:'local_exact_fire_due_v1'},authoring_version:'1'};}
function localFirePolicyRef(plan){return{entity_ref:{
  entity_kind:'activity_contract',entity_id:plan.profile_pin.policy.policy_ref},
  authoring_version:String(plan.profile_pin.policy.version)};}

async function updateProcess(client,plan) {
  const before=plan.transition_proposal.process_before;
  const after=plan.transition_proposal.process_after;
  const result=await client.query(
    `UPDATE party_runtime.party_local_world_processes
     SET status=$1,next_boundary_at=$2::jsonb,process_state=$3::jsonb,
       state_version=$4,last_change_set_id=$5
     WHERE party_id=$6 AND process_ref=$7 AND state_version=$8`,
  [after.status,after.next_boundary_at==null?null:JSON.stringify(after.next_boundary_at),
    JSON.stringify(after),after.state_version,plan.change_set_id,plan.party_id,
    after.process_ref,before.state_version]);
  if (result.rowCount!==1) fail('LOCAL_FIRE_PROCESS_STALE');
}

async function appendBindings(client,plan) {
  const proposal=plan.transition_proposal;
  const prior=await client.query(
    `SELECT COALESCE(MAX(binding_ordinal),-1)::int AS last_ordinal
     FROM party_runtime.party_local_world_process_fuel_bindings
     WHERE party_id=$1 AND process_ref=$2`,
  [plan.party_id,proposal.process_after.process_ref]);
  let ordinal=Number(prior.rows[0]?.last_ordinal)+1;
  for (const ref of proposal.added_fuel_refs) {
    await client.query(
      `INSERT INTO party_runtime.party_local_world_process_fuel_bindings
        (party_id,process_ref,fuel_item_id,binding_ordinal,bound_at_change_set_id)
       VALUES ($1,$2,$3,$4,$5)`,
    [plan.party_id,proposal.process_after.process_ref,ref,ordinal,
      plan.change_set_id]);
    ordinal+=1;
  }
}

async function releaseBindings(client,plan) {
  for (const ref of plan.transition_proposal.released_fuel_refs) {
    const result=await client.query(
      `UPDATE party_runtime.party_local_world_process_fuel_bindings
       SET released_at_change_set_id=$1
       WHERE party_id=$2 AND process_ref=$3 AND fuel_item_id=$4
         AND released_at_change_set_id IS NULL`,
    [plan.change_set_id,plan.party_id,
      plan.transition_proposal.process_after.process_ref,ref]);
    if (result.rowCount!==1) fail('LOCAL_FIRE_INPUT_STALE');
  }
}

async function applyRetirement(client,partyId,transition) {
  const after=transition.after_item;
  const result=await client.query(
    `UPDATE party_runtime.party_items
     SET condition_state=$1,state=$2::jsonb,state_version=$3
     WHERE party_id=$4 AND item_id=$5 AND state_version=$6`,
  [after.condition_state,JSON.stringify(after.state),after.state_version,
    partyId,transition.item_id,transition.expected_item_state_version]);
  if (result.rowCount!==1) fail('LOCAL_FIRE_INPUT_STALE');
}

function plain(value){return value!=null&&typeof value==='object'&&!Array.isArray(value);}
function text(value){return typeof value==='string'&&value.length>0;}
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){
  for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
function fail(code){throw Object.assign(new Error(code),{code});}
