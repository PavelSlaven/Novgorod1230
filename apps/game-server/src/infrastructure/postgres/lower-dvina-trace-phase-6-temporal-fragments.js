export function validatePhase6TemporalFragments({ partyId, state, intent,
  changeSetId }) {
  const proposals = intent.temporal_advance_result
    ?.combined_change_set?.proposals ?? [];
  const allowed = new Set(['party_npcs', 'party_temporal_events']);
  for (const proposal of proposals) {
    if (proposal.write_set == null) continue;
    for (const mode of ['appends', 'inserts', 'updates', 'deletes']) {
      for (const write of proposal.write_set[mode] ?? []) {
        if (mode !== 'updates' || !allowed.has(write.target_table)) {
          fail('TRACE_PHASE_6_TEMPORAL_PROJECTION_UNSUPPORTED', {
            target_table: write.target_table, mode
          });
        }
      }
    }
  }
  for (const boundaryId of intent.attempt.external_boundary_refs) {
    const version = state.temporal_source_proof?.event_versions?.[boundaryId];
    if (!Number.isSafeInteger(version)) continue;
    const matches = proposals.flatMap((proposal) =>
      proposal.write_set?.updates ?? []).filter((write) =>
      write.target_table === 'party_temporal_events'
      && write.id === boundaryId
      && write.record?.party_id === partyId
      && write.record?.status === 'resolved'
      && write.record?.terminal_change_set_id === changeSetId
      && write.record?.state_version === version + 1);
    const expected = proposals.flatMap((proposal) =>
      proposal.expected_state_versions ?? []).filter((entry) =>
      entry.target_table === 'party_temporal_events'
      && entry.id === boundaryId
      && entry.state_version === version);
    if (matches.length !== 1 || expected.length !== 1) {
      fail('TRACE_PHASE_6_TEMPORAL_SOURCE_WRITE_GAP', { boundaryId });
    }
  }
}

function fail(code, details) {
  throw Object.assign(new Error(code), { code, details });
}
