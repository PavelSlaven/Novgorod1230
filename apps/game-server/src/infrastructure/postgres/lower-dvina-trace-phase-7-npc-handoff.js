import { canonicalDigest } from '@rus/materialization';
import { validateNpcActorStepHandoff } from '@rus/turn';
import { validateLowerDvinaTraceN1ObjectivePin } from
  '../../runtime/releases/lower-dvina-trace-n1-production.js';

export function validPhase7NpcSemanticHandoff(factual, state, contracts) {
  const phase7=factual.consequence.phase7;
  const operation=phase7.schedule_execution?.semantic_operation;
  const handoff=factual.consequence.npc_actor_step_handoff??null;
  if(operation?.op!=='request_discovery') return handoff===null;
  if(!validateNpcActorStepHandoff(handoff)
      || contracts.npcSemanticProfile==null
      || canonicalDigest(handoff.objective_pin)
        !==canonicalDigest(phase7.actor_step?.npc_objective_pin)
      || handoff.plan_digest!==canonicalDigest(phase7.autonomous.proposal.plan)
      || handoff.operation_digest!==canonicalDigest(operation)
      || canonicalDigest(handoff.request_identity)!==canonicalDigest(
        npcRequestIdentity(phase7.autonomous.request))
      || handoff.request_identity.root_turn_id!==factual.mode_resolution.turn_id
      || handoff.request_identity.npc_ref!==operation.actor_ref
      || canonicalDigest(handoff.ordinary_materialization_atomic_write_plan)
        !==canonicalDigest(factual.consequence.npc_actor_step_handoff
          .ordinary_materialization_atomic_write_plan)) return false;
  const pin=handoff.objective_pin;
  if(!validateLowerDvinaTraceN1ObjectivePin({pin,
    authority:contracts.npcSemanticAuthority,operation})) return false;
  const npc=(state.npcs??[]).filter((candidate)=>
    candidate.participant_slot_ref===pin.participant_slot_ref);
  const actual=npc[0],machine=actual?.machine_state??{};
  return npc.length===1&&actual.instance_id===pin.npc_ref
    &&(actual.profile_set_id??actual.profile_id)===pin.npc_profile_set_ref
    &&(machine.location_ref??actual.location_profile_ref)===pin.location_profile_ref
    &&(machine.spatial_zone_ref??actual.zone_ref)===pin.zone_ref
    &&machine.status===pin.required_status
    &&pin.profile_canonical_digest===canonicalDigest(contracts.npcSemanticProfile)
    &&pin.scope_ref?.entity_kind==='g6'
    &&pin.scope_ref.entity_id===pin.location_profile_ref
    &&pin.target_ref===contracts.npcSemanticProfile.discovery.target_ref;
}

function npcRequestIdentity(request) {
  return {
    request_id:request?.request_id,
    root_turn_id:request?.root_turn_id,
    boundary_id:request?.boundary_id,
    committed_state_version:request?.committed_state_version,
    decision_index:request?.decision_index,
    npc_ref:request?.npc_ref
  };
}
