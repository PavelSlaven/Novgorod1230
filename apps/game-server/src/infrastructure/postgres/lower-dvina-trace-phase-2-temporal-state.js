import { serverError } from '../../errors.js';

const TEMPORAL_OWNER =
  '@rus/time-events-history/temporal-boundaries';
const CASCADE_OWNER =
  '@rus/time-events-history/temporal-boundaries:resolveSameTimeCascade';

export async function loadTracePhase2TemporalSourceProof(
  partyPool,
  partyId
) {
  const [events, schedules] = await Promise.all([
    partyPool.query(
      `SELECT e.event_id,e.event_kind,
              e.scheduled_at_whole_minutes::text,
              e.scheduled_at_subminute_numerator::text,
              e.scheduled_at_subminute_denominator::text,
              e.rule_ref,e.policy_ref,e.preconditions_digest,
              e.idempotency_key,
              COALESCE(jsonb_agg(jsonb_build_object(
                'entity_kind',s.subject_kind,'entity_id',s.subject_id
              ) ORDER BY s.subject_kind,s.subject_id)
                FILTER (WHERE s.event_id IS NOT NULL),'[]'::jsonb) AS subjects,
              COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'entity_kind','temporal_boundary_candidate',
                'entity_id',d.depends_on_event_id
              ) ORDER BY d.depends_on_event_id)
                FROM party_runtime.party_temporal_event_dependencies d
               WHERE d.event_id=e.event_id),'[]'::jsonb) AS dependencies
         FROM party_runtime.party_temporal_events e
         LEFT JOIN party_runtime.party_temporal_event_subjects s
           ON s.event_id=e.event_id
        WHERE e.party_id=$1 AND e.status='pending'
        GROUP BY e.event_id
        ORDER BY e.scheduled_at_whole_minutes,
                 e.scheduled_at_subminute_numerator,
                 e.event_id`,
      [partyId]
    ),
    partyPool.query(
      `SELECT id,npc_id,schedule_profile_ref,causal_state_ref,
              next_transition_at_whole_minutes::text,
              next_transition_at_subminute_numerator::text,
              next_transition_at_subminute_denominator::text
         FROM party_runtime.party_npc_spatial_schedules
        WHERE party_id=$1 AND status='active'
        ORDER BY npc_id`,
      [partyId]
    )
  ]);
  const eventCandidates = events.rows.map((row) => {
    const resolutionClass = row.rule_ref?.resolution_class;
    if (!nonEmpty(resolutionClass) || row.subjects.length === 0) {
      throw temporalGap({ event_id: row.event_id });
    }
    return candidate({
      boundaryId: row.event_id,
      boundaryKind: row.event_kind,
      timestamp: timestampFrom(row, 'scheduled_at'),
      sourceRef: { entity_kind: 'temporal_event', entity_id: row.event_id },
      primarySubjectRef: row.subjects[0],
      partyId,
      ruleRef: row.rule_ref,
      policyRef: row.policy_ref,
      preconditionsDigest: row.preconditions_digest,
      resolutionClass,
      idempotencyKey: row.idempotency_key,
      subjectRefs: row.subjects,
      causalParentRefs: row.dependencies
    });
  });
  const scheduleCandidates = schedules.rows.map((row) => candidate({
    boundaryId: `npc-schedule:${row.id}`,
    boundaryKind: 'npc_schedule',
    timestamp: timestampFrom(row, 'next_transition_at'),
    sourceRef: { entity_kind: 'npc_schedule', entity_id: row.id },
    primarySubjectRef: { entity_kind: 'npc', entity_id: row.npc_id },
    partyId,
    ruleRef: row.schedule_profile_ref,
    policyRef: row.causal_state_ref,
    preconditionsDigest: row.causal_state_ref?.canonical_digest,
    resolutionClass: 'npc_schedule',
    idempotencyKey: `npc-schedule:${row.id}:${row.next_transition_at_whole_minutes}`,
    subjectRefs: [{ entity_kind: 'npc', entity_id: row.npc_id }],
    causalParentRefs: []
  }));
  const candidates = [...eventCandidates, ...scheduleCandidates];
  return Object.freeze({
    version: 2,
    schema: 'lower_dvina_trace_temporal_source_proof',
    owner: TEMPORAL_OWNER,
    same_time_cascade_owner: CASCADE_OWNER,
    admission_policy:
      'pass_exact_candidates_to_temporal_activity_owner',
    pending_event_count: eventCandidates.length,
    active_schedule_count: scheduleCandidates.length,
    candidate_count: candidates.length,
    candidates
  });
}

function candidate({ boundaryId, boundaryKind, timestamp, sourceRef,
  primarySubjectRef, partyId, ruleRef, policyRef, preconditionsDigest,
  resolutionClass, idempotencyKey, subjectRefs, causalParentRefs }) {
  if (!timestamp || !nonEmpty(preconditionsDigest)) {
    throw temporalGap({ boundary_id: boundaryId });
  }
  return Object.freeze({
    boundary_id: boundaryId,
    boundary_kind: boundaryKind,
    scheduled_at: timestamp,
    source_ref: sourceRef,
    primary_subject_ref: primarySubjectRef,
    scope_ref: { entity_kind: 'party', entity_id: partyId },
    rule_ref: ruleRef,
    policy_ref: policyRef,
    preconditions_digest: preconditionsDigest,
    resolution_class: resolutionClass,
    interrupt_effect: 'background',
    visibility_policy_ref: policyRef,
    idempotency_key: idempotencyKey,
    subject_refs: subjectRefs,
    causal_parent_refs: causalParentRefs
  });
}

function timestampFrom(row, prefix) {
  const whole = row[`${prefix}_whole_minutes`];
  const numerator = row[`${prefix}_subminute_numerator`];
  const denominator = row[`${prefix}_subminute_denominator`];
  return whole == null || numerator == null || denominator == null ? null : {
    whole_minutes: whole,
    subminute_numerator: numerator,
    subminute_denominator: denominator
  };
}

function nonEmpty(value) {
  return typeof value === 'string' && value.length > 0;
}

function temporalGap(details = {}) {
  return serverError(
    'TRACE_PHASE_2_TEMPORAL_BINDING_GAP',
    'Phase 2 cannot admit unresolved temporal events or NPC schedules.',
    { status: 409, details }
  );
}
