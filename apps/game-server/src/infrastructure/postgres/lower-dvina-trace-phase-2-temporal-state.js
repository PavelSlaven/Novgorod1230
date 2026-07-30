import { serverError } from '../../errors.js';

const TEMPORAL_OWNER =
  '@rus/time-events-history/temporal-boundaries';
const CASCADE_OWNER =
  '@rus/time-events-history/temporal-boundaries:resolveSameTimeCascade';

export async function loadTracePhase2TemporalSourceProof(
  partyPool,
  partyId
) {
  const result = await partyPool.query(
    `SELECT
       (SELECT count(*)::integer
          FROM party_runtime.party_temporal_events
         WHERE party_id=$1 AND status='pending') AS pending_event_count,
       (SELECT count(*)::integer
          FROM party_runtime.party_npc_spatial_schedules
         WHERE party_id=$1 AND status='active') AS active_schedule_count`,
    [partyId]
  );
  if (result.rowCount !== 1) throw temporalGap();
  const pendingEventCount = Number(result.rows[0].pending_event_count);
  const activeScheduleCount = Number(result.rows[0].active_schedule_count);
  if (pendingEventCount !== 0 || activeScheduleCount !== 0) {
    throw temporalGap({
      pending_event_count: pendingEventCount,
      active_schedule_count: activeScheduleCount
    });
  }
  return Object.freeze({
    version: 1,
    schema: 'lower_dvina_trace_phase_2_temporal_source_proof',
    owner: TEMPORAL_OWNER,
    same_time_cascade_owner: CASCADE_OWNER,
    admission_policy:
      'fail_closed_before_activity_when_unbound_candidate_exists',
    pending_event_count: 0,
    active_schedule_count: 0,
    candidate_count: 0
  });
}

function temporalGap(details = {}) {
  return serverError(
    'TRACE_PHASE_2_TEMPORAL_BINDING_GAP',
    'Phase 2 cannot admit unresolved temporal events or NPC schedules.',
    { status: 409, details }
  );
}
