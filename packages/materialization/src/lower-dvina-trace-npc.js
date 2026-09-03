import { failLowerDvinaTraceMaterialization as fail } from
  './lower-dvina-trace-contract.js';

export function materializeLowerDvinaTraceNpcSchedule({
  definitionRevision, profile, scheduleProfile, nodeId
}) {
  if (definitionRevision < 32) return { machineState: {}, records: null };
  const entries = scheduleProfile?.entries?.filter(({ participant_profile_ref: ref }) =>
    ref === profile.profile_id) ?? [];
  if (entries.length !== 1) {
    fail('TRACE_INITIAL_NPC_SCHEDULE_INVALID',
      'The initial NPC schedule profile requires one exact participant entry.');
  }
  const entry = entries[0];
  return {
    machineState: {
      schedule_state: entry.schedule_state,
      current_activity: structuredClone(entry.current_activity)
    },
    records: [{
      time_band: entry.time_band,
      schedule_profile_id: entry.schedule_profile_id,
      g5_node_id: nodeId
    }]
  };
}

export function materializeNpcRelationships(profileSet, participantSlotRef) {
  return (profileSet.relations ?? [])
    .filter(({ source }) => source === participantSlotRef)
    .map(({ source, relation_type_id: relation, target }) => ({
      relationship_ref: `${source}:${relation}:${target}`, actor_ref: target,
      relation, status: 'active' }));
}
