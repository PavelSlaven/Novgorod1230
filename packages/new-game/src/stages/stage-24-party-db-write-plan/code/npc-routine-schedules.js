import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';

export function initialNpcRoutineRecords({ result, partyId, changeSetId, npcs }) {
  const members = result.first_entry_preparation?.members ?? [];
  return npcs.filter((npc) => npc.routine_state != null).map((npc) => {
    const runtime = npc.routine_state;
    const profile = runtime.profile;
    const memberIndex = members.findIndex((member) =>
      member.binding.destination.location_profile_ref === npc.location_profile_ref);
    const deferred = memberIndex >= 0
      ? { kind: 'prepared_scene', snapshot_id: `preparation:${partyId}:${result.run_id}:first-entry`,
          member_ordinal: memberIndex }
      : { kind: 'legacy_anchor', anchor_id: npc.anchor_id };
    if (memberIndex < 0 && !npc.anchor_id) throw new Error('NPC_ROUTINE_PLACEMENT_GAP');
    const profileRef = versioned('activity_profile', profile.profile_id, profile.revision);
    const causal = { ...versioned('condition_set', 'npc-approved-routine', 1),
      routine_state: structuredClone(runtime), deferred_placement: deferred };
    const next = runtime.next_transition_at;
    return { id: `npc-schedule:${partyId}:${npc.instance_id}`, party_id: partyId,
      npc_id: npc.instance_id, current_position_node_id: null,
      schedule_profile_ref: profileRef,
      dependency_pins: seal({ pins: [{ dependency_role: 'profile',
        entity_ref: profileRef.entity_ref, version_pin: { pin_kind: 'authoring_version',
          authoring_version: profileRef.authoring_version } }] }),
      causal_state_ref: seal(causal), status: runtime.status, state_version: 1,
      next_transition_at_whole_minutes: next == null ? null : Number(next.whole_minutes),
      next_transition_at_subminute_numerator: next == null ? null : Number(next.subminute_numerator),
      next_transition_at_subminute_denominator: next == null ? null : Number(next.subminute_denominator),
      current_activity_execution_id: null,
      attention_state_ref: { entity_kind: 'condition_set', entity_id: `npc-attention:${npc.instance_id}` },
      body_state_ref: { entity_kind: 'body_state', entity_id: `npc-body:${npc.instance_id}` },
      knowledge_state_ref: { entity_kind: 'knowledge_fact', entity_id: `npc-knowledge:${npc.instance_id}` },
      relationship_state_ref: { entity_kind: 'condition_set', entity_id: `npc-relations:${npc.instance_id}` },
      updated_change_set_id: changeSetId };
  });
}
function versioned(entity_kind, entity_id, revision) { return {
  entity_ref: { entity_kind, entity_id }, authoring_version: String(revision) }; }
function seal(value) { return { ...value, canonical_digest: computeSpatialV3CanonicalDigest(value) }; }
