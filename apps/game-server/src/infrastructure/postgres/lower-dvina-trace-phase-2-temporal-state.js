import { npcRoutineCandidate } from '../../runtime/npc-routine-temporal.js';
import { serverError } from '../../errors.js';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { localFireItemPin, localFireItemQuery } from
  './local-fire-persistence-pins.js';

const TEMPORAL_OWNER =
  '@rus/time-events-history/temporal-boundaries';
const CASCADE_OWNER =
  '@rus/time-events-history/temporal-boundaries:resolveSameTimeCascade';

export async function loadTracePhase2TemporalSourceProof(
  partyPool,
  partyId
) {
  const [events, schedules, localProcesses, routeEndpoints] = await Promise.all([
    partyPool.query(
      `SELECT e.event_id,e.event_kind,
              e.state_version,
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
      `SELECT s.*,s.id,s.npc_id,s.schedule_profile_ref,s.causal_state_ref,
              jsonb_build_object('instance_id',n.npc_id,'anchor_id',n.anchor_id,
                'machine_state',n.machine_state) AS npc_snapshot,
              next_transition_at_whole_minutes::text,
              next_transition_at_subminute_numerator::text,
              next_transition_at_subminute_denominator::text
         FROM party_runtime.party_npc_spatial_schedules s
         JOIN party_runtime.party_npcs n ON n.party_id=s.party_id AND n.npc_id=s.npc_id
        WHERE s.party_id=$1
        ORDER BY s.npc_id`,
      [partyId]
    ),
    partyPool.query(
      `SELECT p.process_ref,p.context_ref,p.rule_ref,p.policy_ref,
              p.process_state,p.next_boundary_at,p.state_version
         FROM party_runtime.party_local_world_processes p
        WHERE p.party_id=$1 AND p.status='active'
        ORDER BY p.process_ref`, [partyId]),
    partyPool.query(
      `SELECT b.source_endpoint_binding_ref->>'entity_id' AS endpoint_id,
              b.position_id,p.access_class_id,p.capacity,p.status
         FROM party_runtime.party_world_route_endpoint_position_bindings b
         JOIN party_runtime.scene_position_nodes p
           ON p.party_id=b.party_id AND p.id=b.position_id
        WHERE b.party_id=$1 AND b.status='active'
        ORDER BY endpoint_id`, [partyId])
  ]);
  const routeEndpointPositions = Object.fromEntries(routeEndpoints.rows.map((row) => [
    row.endpoint_id, { position_id: row.position_id,
      access_class_id: row.access_class_id, capacity: Number(row.capacity),
      status: row.status }
  ]));
  const scheduleRows = schedules.rows.map((row) => ({
    ...row, route_endpoint_positions: structuredClone(routeEndpointPositions)
  }));
  const eventCandidates = events.rows.map((row) => {
    const resolutionClass = row.rule_ref?.resolution_class;
    if (!nonEmpty(resolutionClass) || row.subjects.length === 0) {
      throw temporalGap({ event_id: row.event_id });
    }
    return candidate({
      boundaryId: row.event_id,
      boundaryKind: 'exact_timer',
      timestamp: timestampFrom(row, 'scheduled_at'),
      sourceRef: { entity_kind: 'source_record', entity_id: row.event_id },
      primarySubjectRef: row.subjects[0],
      partyId,
      ruleRef: versionedRef(row.rule_ref),
      policyRef: versionedRef(row.policy_ref),
      preconditionsDigest: row.preconditions_digest,
      resolutionClass,
      idempotencyKey: row.idempotency_key,
      subjectRefs: row.subjects,
      causalParentRefs: row.dependencies
    });
  });
  const scheduleCandidates = scheduleRows.filter((row) => row.status === 'active').map((row) =>
    row.causal_state_ref?.routine_state ? npcRoutineCandidate(row) : candidate({
    boundaryId: `npc-schedule:${row.id}`,
    boundaryKind: 'npc_schedule',
    timestamp: timestampFrom(row, 'next_transition_at'),
    sourceRef: { entity_kind: 'npc', entity_id: row.npc_id },
    primarySubjectRef: { entity_kind: 'npc', entity_id: row.npc_id },
    partyId,
    ruleRef: versionedRef(row.schedule_profile_ref),
    policyRef: versionedRef(row.causal_state_ref),
    preconditionsDigest: row.causal_state_ref?.canonical_digest,
    resolutionClass: 'npc_schedule',
    idempotencyKey: `npc-schedule:${row.id}:${row.next_transition_at_whole_minutes}`,
    subjectRefs: [{ entity_kind: 'npc', entity_id: row.npc_id }],
    causalParentRefs: []
  }));
  const localProcessCandidates = localProcesses.rows.map((row) => {
    const fuelRefs = row.process_state?.fuel_bindings?.map(
      ({ fuel_ref: ref }) => ({ entity_kind: 'item', entity_id: ref })) ?? [];
    if (fuelRefs.length === 0 || row.next_boundary_at == null) {
      throw temporalGap({ process_ref: row.process_ref });
    }
    return candidate({ boundaryId:
      `local-fire:${row.process_ref}:state:${row.state_version}`,
    boundaryKind: 'propagation', timestamp: row.next_boundary_at,
    sourceRef: { entity_kind: 'propagation_process',
      entity_id: row.process_ref }, primarySubjectRef: fuelRefs[0], partyId,
    ruleRef: versionedRef(row.rule_ref),
    policyRef: versionedRef(row.policy_ref),
    preconditionsDigest: computeSpatialV3CanonicalDigest({
      process_state: row.process_state, expected_state_version:
        Number(row.state_version) }), resolutionClass: 'propagation_background',
    idempotencyKey: `local-fire:${row.process_ref}:state:${row.state_version}`,
    subjectRefs: fuelRefs, causalParentRefs: [] });
  });
  const localFireRuntime = await Promise.all(localProcesses.rows.map(async(row)=>{
    const inputPins=[];
    for(const {fuel_ref:ref} of row.process_state.fuel_bindings){
      const selected=await partyPool.query(localFireItemQuery(false),[partyId,ref]);
      if(selected.rows.length!==1)throw temporalGap({process_ref:row.process_ref,
        fuel_ref:ref});
      inputPins.push(localFireItemPin(selected.rows[0]));
    }
    return Object.freeze({party_id:partyId,
      rule_ref:versionedRef(row.rule_ref),policy_ref:versionedRef(row.policy_ref),
      process_state:structuredClone(row.process_state),input_pins:inputPins});
  }));
  const candidates = [...eventCandidates, ...scheduleCandidates,
    ...localProcessCandidates];
  const eventVersions = Object.fromEntries(events.rows.map((row) => [
    row.event_id, Number(row.state_version)
  ]));
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
    event_versions: eventVersions,
    local_fire_runtime: localFireRuntime,
    npc_schedule_runtime: scheduleRows.filter((row) => row.causal_state_ref?.routine_state),
    route_endpoint_positions: routeEndpointPositions,
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
    primary_subject_ref: structuredClone(primarySubjectRef),
    scope_ref: { entity_kind: 'party', entity_id: partyId },
    rule_ref: ruleRef,
    policy_ref: structuredClone(policyRef),
    preconditions_digest: preconditionsDigest,
    resolution_class: resolutionClass,
    interrupt_effect: 'background',
    visibility_policy_ref: structuredClone(policyRef),
    idempotency_key: idempotencyKey,
    subject_refs: structuredClone(subjectRefs),
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

function versionedRef(value) {
  return {
    entity_ref: structuredClone(value?.entity_ref),
    authoring_version: value?.authoring_version
  };
}

function temporalGap(details = {}) {
  return serverError(
    'TRACE_PHASE_2_TEMPORAL_BINDING_GAP',
    'Phase 2 cannot admit unresolved temporal events or NPC schedules.',
    { status: 409, details }
  );
}
