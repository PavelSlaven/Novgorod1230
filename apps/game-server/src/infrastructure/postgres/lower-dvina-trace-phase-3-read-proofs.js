import { canonicalDigest } from '@rus/materialization';

export function phase3ActivityReadProof(payload, rows) {
  const phase3History = (payload.activity_history ?? []).filter(
    ({ activity_execution_id: id }) => id.startsWith(
      `activity:${payload.party_id}:trace-phase3:`));
  const latestRows = [...new Map(rows.map((entry) => [entry.id, entry]))
    .values()];
  const actual = latestRows.map((entry) => ({
    activity_execution_id: entry.id,
    activity_snapshot: entry.activity_snapshot,
    option_id: entry.execution_context_snapshot?.option_id,
    duration_minutes: Number(entry.original_total_minutes),
    started_at: timestampFromColumns(entry, 'started_at'),
    ended_at: timestampFromColumns(entry, 'last_processed_at'),
    execution_result: entry.trace
  }));
  const expected = phase3History
    .filter((entry) => entry.activity_snapshot.consequence !== 'movement')
    .map((entry) => ({
      activity_execution_id: entry.activity_execution_id,
      activity_snapshot: entry.activity_snapshot,
      option_id: entry.option_id,
      duration_minutes: entry.duration_minutes,
      started_at: entry.started_at,
      ended_at: entry.ended_at,
      execution_result: entry.execution_result
    }));
  const expectedById = new Map(phase3History.map(
    (entry) => [entry.activity_execution_id, entry]
  ));
  const elapsedByExecution = new Map();
  for (const entry of rows) {
    elapsedByExecution.set(entry.id,
      (elapsedByExecution.get(entry.id) ?? 0)
        + Number(entry.actual_time_numerator)
          / Number(entry.actual_time_denominator));
  }
  const valid = latestRows.every((entry) => {
    const budget = expectedById.get(entry.id)?.execution_result
      ?.semantic_exchange_projection?.time_budget ?? null;
    const status = budget?.status ?? 'completed';
    const elapsed = String(budget?.elapsed_minutes
      ?? entry.original_total_minutes);
    return entry.status === status
      && entry.result_kind === status
      && elapsedByExecution.get(entry.id) === Number(elapsed);
  });
  return { actual, expected, valid };
}

export function phase3NpcReadProof(payload, rows) {
  const expected = (payload.npcs ?? []).map((npc) => ({
    npc_id: npc.instance_id,
    participant_slot_ref: npc.participant_slot_ref,
    profile_level: npc.profile_level,
    anchor_id: npc.anchor_id
  })).sort((left, right) => left.npc_id.localeCompare(right.npc_id));
  const actual = rows.map((npc) => ({
    npc_id: npc.npc_id,
    participant_slot_ref: npc.semantic_state?.participant_slot_ref,
    profile_level: npc.profile_level,
    anchor_id: npc.anchor_id
  }));
  return { actual, expected };
}

export function expectedPhase3Traversals(payload) {
  return (payload.activity_history ?? [])
    .filter((entry) => entry.activity_snapshot.consequence === 'movement'
      && entry.execution_result?.traversal?.ids?.plan_id?.startsWith(
        `route-plan:${payload.party_id}:trace-phase3:`))
    .map((entry) => {
      const traversal = entry.execution_result.traversal;
      return {
        plan_id: traversal.ids.plan_id,
        execution_id: traversal.ids.execution_id,
        travel_state_id: traversal.ids.travel_state_id,
        interval_id: traversal.ids.interval_id,
        option_id: entry.execution_result.route_ref,
        planning_state_version: traversal.planning_state_version,
        status: 'completed',
        segment_progress_ppm: 1_000_000,
        actual_time_numerator:
          traversal.interval_result.actual_time_numerator,
        actual_time_denominator:
          traversal.interval_result.actual_time_denominator,
        result_kind: traversal.interval_result.result_kind,
        inventory_load: traversal.inventory_load,
        lifecycle_event_count: 3
      };
    });
}

export function actualPhase3Traversals(rows) {
  return rows.map((entry) => ({
    plan_id: entry.plan_id,
    execution_id: entry.execution_id,
    travel_state_id: entry.travel_state_id,
    interval_id: entry.interval_id,
    option_id: entry.option_id,
    planning_state_version: Number(entry.planning_state_version),
    status: entry.status,
    segment_progress_ppm: entry.segment_progress_ppm,
    actual_time_numerator: entry.actual_time_numerator,
    actual_time_denominator: entry.actual_time_denominator,
    result_kind: entry.result_kind,
    inventory_load: entry.dynamic_snapshot?.inventory_load,
    lifecycle_event_count: entry.lifecycle_event_count
  }));
}

export function phase3ClueOwnershipMatches(expected, actual) {
  return canonicalDigest(actual.owner_external_ref) === canonicalDigest({
    entity_kind: 'participant_slot',
    entity_id: expected.state?.property_state?.owner_ref
  })
    && actual.owner_character_id === null
    && actual.controller_character_id
      === expected.state?.property_state?.controller_ref
    && actual.claim_state === 'owner_preserved_evidence_held';
}

function timestampFromColumns(row, prefix) {
  return {
    whole_minutes: row[`${prefix}_whole_minutes`],
    subminute_numerator: row[`${prefix}_subminute_numerator`],
    subminute_denominator: row[`${prefix}_subminute_denominator`]
  };
}
