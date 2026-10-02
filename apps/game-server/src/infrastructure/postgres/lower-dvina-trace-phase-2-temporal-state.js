import { npcRoutineCandidate } from '../../runtime/npc-routine-temporal.js';
import { serverError } from '../../errors.js';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { localFireItemPin, localFireItemQuery } from
  './local-fire-persistence-pins.js';
import { NPC_ROUTINE_SCHEDULE_PROJECTION_COLUMNS } from
  '@rus/party-store/internal/lower-dvina-trace-phase-1a';

// Schedule rows enter npc_schedule_runtime and npc_routine_transition.before:
// select the projection columns explicitly so columns added later (037
// candidate_profile_refs) cannot enter runtime state (REVIEW-069 N14).
const SCHEDULE_COLUMNS = NPC_ROUTINE_SCHEDULE_PROJECTION_COLUMNS
  .map((column) => (column.startsWith('next_transition_at_')
    ? `s.${column}::text AS ${column}` : `s.${column}`))
  .join(',');

const TEMPORAL_OWNER =
  '@rus/time-events-history/temporal-boundaries';
const CASCADE_OWNER =
  '@rus/time-events-history/temporal-boundaries:resolveSameTimeCascade';

export async function loadTracePhase2TemporalSourceProof(
  partyPool,
  partyId
) {
  const [events, schedules, localProcesses, routeEndpoints, lastCompletedMovements] = await Promise.all([
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
      `SELECT ${SCHEDULE_COLUMNS},
              jsonb_build_object('instance_id',n.npc_id,'anchor_id',n.anchor_id,
                'machine_state',n.machine_state) AS npc_snapshot,
              n.semantic_state AS npc_semantic_state,
              CASE WHEN placement.entity_id IS NULL THEN NULL ELSE jsonb_build_object(
                'entity_kind',placement.entity_kind,'entity_id',placement.entity_id,
                'position_node_id',placement.position_node_id,
                'state_version',placement.state_version,
                'updated_change_set_id',placement.updated_change_set_id) END AS npc_placement,
              jsonb_build_object(
                'party_world_revision_id',party.world_revision_id,
                'schedule_position_node_id',s.current_position_node_id,
                'position_node_id',position.id,
                'position_template_slot_key',position.template_slot_key,
                'position_template_instance_ordinal',position.template_instance_ordinal,
                'position_status',position.status,
                'g6_id',g6.id,'g6_status',g6.status,'g6_host_kind',g6.host_kind,
                'g6_host_id',g6.host_id,'g6_scene_baseline_id',g6.scene_baseline_id,
                'g6_source_scene_template_ref',g6.source_scene_template_ref,
                'scene_baseline_id',baseline.id,'scene_baseline_status',baseline.status,
                'scene_baseline_source_kind',baseline.source_kind,
                'scene_baseline_scene_template_ref',baseline.scene_template_ref,
                'site_id',site.id,'site_status',site.status,'site_origin',site.origin,
                'site_canonical_g5_ref',site.canonical_g5_ref,
                'site_parent_g4_id',site.parent_g4_id,
                'site_generated_template_ref',site.generated_template_ref,
                'placement_position_node_id',placement.position_node_id,
                'placement_state_version',placement.state_version,
                'placement_updated_change_set_id',placement.updated_change_set_id,
                'actor_profile_created_change_set_id',actor_profile.created_change_set_id
              ) AS initial_location_proof
         FROM party_runtime.party_npc_spatial_schedules s
         JOIN party_runtime.party_npcs n ON n.party_id=s.party_id AND n.npc_id=s.npc_id
         JOIN party_runtime.parties party ON party.party_id=s.party_id
         LEFT JOIN party_runtime.entity_placements placement
           ON placement.party_id=s.party_id AND placement.entity_kind='npc'
          AND placement.entity_id=s.npc_id
         LEFT JOIN party_runtime.party_actor_profile_bindings actor_profile
           ON actor_profile.party_id=s.party_id AND actor_profile.actor_kind='npc'
          AND actor_profile.actor_id=s.npc_id
         LEFT JOIN party_runtime.scene_position_nodes position
           ON position.party_id=s.party_id AND position.id=s.current_position_node_id
         LEFT JOIN party_runtime.party_g6_instances g6
           ON g6.party_id=s.party_id AND g6.id=position.g6_instance_id
         LEFT JOIN party_runtime.party_scene_baselines baseline
           ON baseline.party_id=s.party_id AND baseline.id=g6.scene_baseline_id
         LEFT JOIN party_runtime.party_g5_sites site
           ON site.party_id=g6.party_id AND site.id=g6.host_id
          AND g6.host_kind='g5_site'
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
              b.source_endpoint_binding_ref,b.scene_baseline_id,b.g5_site_id,
              b.position_id,b.state_version,p.access_class_id,p.capacity,p.status
         FROM party_runtime.party_world_route_endpoint_position_bindings b
         JOIN party_runtime.scene_position_nodes p
           ON p.party_id=b.party_id AND p.id=b.position_id
        WHERE b.party_id=$1 AND b.status='active'
        ORDER BY endpoint_id`, [partyId]),
    partyPool.query(
      `SELECT DISTINCT ON (tr.npc_id) tr.npc_id,
              jsonb_build_object(
                'destination_position_node_id',tr.trace#>>'{movement,destination_position_node_id}',
                'destination_location_ref',tr.trace#>>'{movement,destination_location_ref}',
                'completed_at',jsonb_build_object(
                  'whole_minutes',tr.occurred_at_whole_minutes::text,
                  'subminute_numerator',tr.occurred_at_subminute_numerator::text,
                  'subminute_denominator',tr.occurred_at_subminute_denominator::text))
                AS last_completed_movement
         FROM party_runtime.party_npc_runtime_transitions tr
        WHERE tr.party_id=$1 AND tr.trace#>>'{movement,status}'='completed'
        ORDER BY tr.npc_id,tr.occurred_at_whole_minutes DESC,
          tr.occurred_at_subminute_numerator::numeric
            / tr.occurred_at_subminute_denominator::numeric DESC,
          tr.transition_id DESC`, [partyId])
  ]);
  if (routeEndpoints.rows.some((row) => !nonEmpty(row.endpoint_id)
      || !nonEmpty(row.source_endpoint_binding_ref?.entity_id)
      || !(nonEmpty(row.source_endpoint_binding_ref?.authoring_version)
        || Number.isSafeInteger(row.source_endpoint_binding_ref?.authoring_version))
      || !nonEmpty(row.position_id))) {
    throw temporalGap();
  }
  const routeEndpointBindings = routeEndpoints.rows.map((row) => ({
    source_endpoint_binding_ref: row.source_endpoint_binding_ref,
    scene_baseline_id: row.scene_baseline_id, g5_site_id: row.g5_site_id,
    position_id: row.position_id, state_version: Number(row.state_version),
    access_class_id: row.access_class_id, capacity: Number(row.capacity),
    status: row.status }));
  const endpointGroups = new Map();
  for (const row of routeEndpoints.rows) {
    const group = endpointGroups.get(row.endpoint_id) ?? [];
    group.push(row);
    endpointGroups.set(row.endpoint_id, group);
  }
  const routeEndpointPositions = Object.fromEntries([...endpointGroups].map(([endpointId, rows]) => [
    endpointId, rows.length === 1 ? { position_id: rows[0].position_id,
      binding_ref: { entity_id: rows[0].source_endpoint_binding_ref.entity_id,
        authoring_version: String(rows[0].source_endpoint_binding_ref.authoring_version) },
      access_class_id: rows[0].access_class_id, capacity: Number(rows[0].capacity),
      status: rows[0].status } : { position_id: null, status: 'ambiguous',
      binding_refs: rows.map((row) => ({ entity_id: row.source_endpoint_binding_ref.entity_id,
        authoring_version: String(row.source_endpoint_binding_ref.authoring_version) })) }
  ]));
  const lastCompletedByNpc = Object.fromEntries(lastCompletedMovements.rows.map((row) => [
    row.npc_id, row.last_completed_movement
  ]));
  const scheduleRows = schedules.rows.map(({ initial_location_proof: initialProof,
    npc_semantic_state: semanticState, ...row }) => ({
    ...row, last_completed_movement: lastCompletedByNpc[row.npc_id] ?? null,
    approved_location_bindings: initialLocationBinding(initialProof, semanticState),
    route_endpoint_positions: structuredClone(routeEndpointPositions),
    route_endpoint_bindings: structuredClone(routeEndpointBindings)
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

function initialLocationBinding(proof, semanticState) {
  const source = semanticState?.source_binding;
  const locationRef = semanticState?.location_profile_ref;
  if (!proof || !source || !nonEmpty(locationRef)
      || proof.schedule_position_node_id == null
      || proof.schedule_position_node_id !== proof.position_node_id
      || proof.schedule_position_node_id !== proof.placement_position_node_id
      || proof.position_status !== 'active' || proof.g6_status !== 'active'
      || proof.scene_baseline_status !== 'active' || proof.site_status !== 'active'
      || !nonEmpty(proof.g6_id) || !nonEmpty(proof.position_node_id)
      || proof.g6_host_kind !== 'g5_site' || proof.site_origin !== 'canonical'
      || proof.g6_host_id !== proof.site_id
      || proof.g6_scene_baseline_id !== proof.scene_baseline_id
      || !sameVersionedRef(proof.g6_source_scene_template_ref,
        proof.scene_baseline_scene_template_ref)
      || Number(proof.placement_state_version) !== 1
      || !nonEmpty(proof.placement_updated_change_set_id)
      || proof.placement_updated_change_set_id !== proof.actor_profile_created_change_set_id
      || proof.party_world_revision_id !== source.world_revision_id
      || source.g4_ref?.id !== proof.site_parent_g4_id
      || !sameVersionedRef(source.canonical_g5_ref, proof.site_canonical_g5_ref)
      || !nonEmpty(semanticState.zone_ref)
      || !nonEmpty(proof.position_template_slot_key)
      || semanticState.zone_ref !== proof.position_template_slot_key) return [];

  const refs = [source.place_population_composition_ref, source.presence_rule_ref]
    .filter((value) => value != null);
  if (refs.length !== 1) return [];
  const ref = refs[0];
  const entityId = ref.id ?? ref.rule_id;
  const authoringVersion = ref.version ?? ref.rule_version;
  if (!nonEmpty(entityId) || !validVersion(authoringVersion)) return [];
  if (ref === source.place_population_composition_ref
      && (source.place_family_id !== locationRef
        || ref.world_revision_id !== source.world_revision_id)) return [];
  if (ref === source.presence_rule_ref && source.place_family_id != null
      && source.place_family_id !== locationRef) return [];
  return [{ position_node_id: proof.position_node_id, location_ref: locationRef,
    binding_ref: { entity_id: entityId,
      authoring_version: String(authoringVersion) } }];
}

function sameVersionedRef(left, right) {
  const leftId = left?.entity_id ?? left?.id;
  const rightId = right?.entity_id ?? right?.id;
  const leftVersion = left?.authoring_version ?? left?.version;
  const rightVersion = right?.authoring_version ?? right?.version;
  return nonEmpty(leftId) && leftId === rightId && validVersion(leftVersion)
    && validVersion(rightVersion) && String(leftVersion) === String(rightVersion);
}

function validVersion(value) {
  return (typeof value === 'string' || Number.isSafeInteger(value))
    && Number.isSafeInteger(Number(value)) && Number(value) > 0;
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
