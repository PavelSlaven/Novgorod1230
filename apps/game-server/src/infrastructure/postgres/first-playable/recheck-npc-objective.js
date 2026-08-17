import { canonicalDigest } from '@rus/materialization';
import { validateLowerDvinaTraceN1ObjectivePin } from
  '../../../runtime/releases/lower-dvina-trace-n1-production.js';

export async function recheckNpcObjective({transaction,partyId,check,plan}) {
  const keys=['kind','digest','party_id','schema','profile_ref','profile_version',
    'profile_digest','profile_canonical_digest','npc_ref',
    'participant_slot_ref','npc_profile_set_ref','location_profile_ref','zone_ref',
    'required_status','target_ref','access_policy_ref','scope_ref',
    'objective_digest','operation_digest','operation','request_identity',
    'authority'];
  const {digest:ignoredDigest,kind:ignoredKind,party_id:ignoredParty,
    operation_digest:operationDigest,operation,request_identity:requestIdentity,
    authority,...pin}=check??{};
  const {digest:discarded,...sealedPayload}=check??{};
  if(check?.party_id!==partyId||Object.keys(check??{}).length!==keys.length
      ||!keys.every((key)=>Object.hasOwn(check,key))
      ||check.kind!=='npc_objective'
      ||!/^sha256:[a-f0-9]{64}$/u.test(check.digest)
      ||check.digest!==`sha256:${canonicalDigest(sealedPayload)}`
      ||check.schema!=='lower_dvina_trace_n1_objective_pin_v1'
      ||check.scope_ref?.entity_kind!=='g6'
      ||check.scope_ref.entity_id!==check.location_profile_ref
      ||operationDigest!==canonicalDigest(operation)
      ||!requestIdentityMatchesPlan(requestIdentity,plan)
      ||!validateLowerDvinaTraceN1ObjectivePin({pin,authority,operation})) {
    return result(false,'generated_schema_mismatch');
  }
  const found=await transaction.query(
    `SELECT npc_id,profile_set_id,anchor_id,identity_state,machine_state,semantic_state
       FROM party_runtime.party_npcs
      WHERE party_id=$1 AND npc_id=$2
      FOR UPDATE`,[partyId,check.npc_ref]);
  const row=found.rows[0],semantic=row?.semantic_state??{},machine=row?.machine_state??{};
  return result(found.rowCount===1
    &&semantic.participant_slot_ref===check.participant_slot_ref
    &&row.profile_set_id===check.npc_profile_set_ref
    &&semantic.location_profile_ref===check.location_profile_ref
    &&machine.location_ref===check.location_profile_ref
    &&machine.spatial_zone_ref===check.zone_ref
    &&machine.status===check.required_status);
}

function requestIdentityMatchesPlan(identity,plan) {
  const keys=['request_id','root_turn_id','boundary_id',
    'committed_state_version','decision_index','npc_ref'];
  if(identity==null||typeof identity!=='object'||Array.isArray(identity)
      ||Object.keys(identity).length!==keys.length
      ||!keys.every((key)=>Object.hasOwn(identity,key))
      ||identity.request_id!==`npc-action-request:${identity.boundary_id}`) {
    return false;
  }
  const writes=(plan?.appends??[]).filter((write)=>
    write?.target_table==='party_npc_decision_traces'
      &&write?.record?.request_id===identity.request_id);
  if(writes.length!==1) return false;
  const request=writes[0].record.semantic_request;
  const actual=Object.fromEntries(keys.map((key)=>[key,request?.[key]]));
  return canonicalDigest(identity)===canonicalDigest(actual)
    &&writes[0].record.boundary_id===identity.boundary_id
    &&writes[0].record.root_turn_id===identity.root_turn_id
    &&writes[0].record.npc_id===identity.npc_ref
    &&Number(writes[0].record.state_version)===identity.committed_state_version;
}

function result(ok,code='state_version_conflict') {
  return Object.freeze({ok,code});
}
