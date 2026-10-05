import { createNpcRoutineState, npcRoutineActivity, proposeNpcRoutineTransition,
  resolveNpcRoutinePresence, selectNpcRoutineSchedule } from '@rus/npc-runtime';
import { compareGameTimestamp } from '@rus/time-events-history';
import { nextCalendarSeasonBoundary } from '@rus/time-events-history/calendar';
import { computeSpatialV3CanonicalDigest as digest } from '@rus/contracts/spatial-v3/registry';
import { routineRoute, routineRouteForHandoff, validateRoutineMovement } from
  './npc-routine-movement.js';
import { routineNpcSnapshot } from './lower-dvina-trace-scene-presence.js';

const RULE = versioned('action_contract', 'npc-approved-routine-transition');
const POLICY = versioned('condition_set', 'npc-approved-routine');

export function npcRoutineCandidate(row) {
  const runtime = row.causal_state_ref.routine_state;
  if (runtime.status !== 'active') return null;
  const phase = runtime.profile.phases[runtime.phase_index];
  const seasonBoundary = runtime.schedule_context
    ? nextCalendarSeasonBoundary(runtime.phase_started_at,
      runtime.schedule_context.calendar_profile)?.scheduled_at ?? null : null;
  const movementEnd = activeMovementEnd(runtime);
  const isSeasonBoundary = seasonBoundary != null
    && (runtime.next_transition_at == null
      || compareGameTimestamp(seasonBoundary, runtime.next_transition_at) <= 0)
    && (movementEnd == null || compareGameTimestamp(seasonBoundary, movementEnd) >= 0);
  const scheduledAt = isSeasonBoundary ? seasonBoundary : runtime.next_transition_at;
  if (scheduledAt == null) return null;
  const kind = isSeasonBoundary ? 'season' : 'phase';
  const id = `npc-schedule:${row.npc_id}:${row.state_version}:${kind}:${phase.state_id}:${timestampKey(scheduledAt)}`;
  return { boundary_id: id, boundary_kind: 'npc_schedule',
    scheduled_at: structuredClone(scheduledAt),
    source_ref: { entity_kind: 'npc', entity_id: row.npc_id },
    primary_subject_ref: { entity_kind: 'npc', entity_id: row.npc_id },
    scope_ref: { entity_kind: 'party', entity_id: row.party_id }, rule_ref: structuredClone(RULE),
    policy_ref: structuredClone(POLICY), preconditions_digest: digest(runtime),
    resolution_class: 'npc_schedule', interrupt_effect: 'background',
    visibility_policy_ref: structuredClone(POLICY), idempotency_key: id,
    subject_refs: [{ entity_kind: 'npc', entity_id: row.npc_id }], causal_parent_refs: [] };
}

export function npcRoutineTemporalRegistration() {
  return { rule_ref: RULE, policy_ref: POLICY, resolve(candidate, context) {
    const row = findSchedule(context.projection, candidate.primary_subject_ref.entity_id);
    if (row == null || digest(npcRoutineCandidate(row)) !== digest(candidate)) fail('temporal_candidate_stale');
    const npc = findNpc(context.projection, row.npc_id) ?? row.npc_snapshot;
    if (npc == null) fail('npc_schedule_gap');
    const runtime = row.causal_state_ref.routine_state;
    const seasonBoundary = runtime.schedule_context
      ? nextCalendarSeasonBoundary(runtime.phase_started_at,
        runtime.schedule_context.calendar_profile)?.scheduled_at ?? null : null;
    const movementEnd = activeMovementEnd(runtime);
    const completesMovement = movementEnd != null
      && compareGameTimestamp(movementEnd, candidate.scheduled_at) === 0;
    const switchesSeason = seasonBoundary != null
      && compareGameTimestamp(seasonBoundary, candidate.scheduled_at) <= 0
      && (compareGameTimestamp(seasonBoundary, candidate.scheduled_at) === 0
        || completesMovement)
      && (runtime.next_transition_at == null
        || compareGameTimestamp(candidate.scheduled_at, runtime.next_transition_at) <= 0);
    const machine = npc.machine_state;
    const placement = { entity_kind: 'entity_placement', entity_id: `npc:${row.npc_id}` };
    const expectedActivity = npcRoutineActivity(runtime);
    const route = routineRoute(runtime, row.current_position_node_id,
      row.route_endpoint_positions);
    const bodyOk = !['dead', 'unconscious', 'incapacitated'].includes(machine?.status)
      && !(Number.isFinite(npc.check_body_state?.health)
        && npc.check_body_state.health <= 0);
    const activityOk = machine?.current_activity?.can_continue_automatically === true
      && machine.current_activity.activity_ref === expectedActivity.activity_ref
      && machine.current_activity.status === expectedActivity.status
      && row.current_activity_execution_id == null
      && (machine?.current_activity_ref == null || machine.current_activity_ref
        === machine.current_activity?.activity_ref);
    const ordersOk = machine?.routine_orders_blocked !== true;
    const dangerOk = machine?.routine_danger_blocked !== true;
    const interrupted = !activityOk || !bodyOk || !ordersOk || !dangerOk
      || route?.access_ok === false;
    const followingPhase = runtime.profile.phases[
      (runtime.phase_index + 1) % runtime.profile.phases.length];
    const chainsMovement = !interrupted && !switchesSeason && completesMovement
      && followingPhase.movement_handoff != null;
    if (chainsMovement) {
      const nextRoute = routineRouteForHandoff(followingPhase.movement_handoff,
        route?.destination_position_node_id, row.route_endpoint_positions);
      if (nextRoute?.access_ok !== true) fail('npc_schedule_gap');
      validateRoutineMovement({ status: 'started' }, nextRoute);
    }
    let proposed = null;
    let seasonRuntime = null;
    if (!interrupted && switchesSeason && !completesMovement) {
      const selected = selectNpcRoutineSchedule({ schedule_context: runtime.schedule_context,
        scheduled_at: candidate.scheduled_at });
      seasonRuntime = createNpcRoutineState({ profile: selected.rule.routine_profile,
        started_at: candidate.scheduled_at,
        calendar_profile: runtime.schedule_context.calendar_profile,
        current_activity: runtime.work_activity,
        schedule_context: selected.schedule_context });
    } else if (!interrupted) {
      proposed = proposeNpcRoutineTransition({ runtime, scheduled_at: candidate.scheduled_at,
        next_movement_authorized: chainsMovement,
        suppress_next_movement: switchesSeason,
        npc_state: { npc_ref: candidate.primary_subject_ref, state_version: String(row.state_version),
          current_activity_execution_ref: row.current_activity_execution_id == null ? null : {
            entity_kind: 'party_timed_activity_execution', entity_id: row.current_activity_execution_id },
          placement_ref: placement, attention_state_ref: row.attention_state_ref,
          body_state_ref: row.body_state_ref, knowledge_state_ref: row.knowledge_state_ref,
          relationship_state_ref: row.relationship_state_ref },
        recheck_snapshot: { observed_state_version: String(row.state_version), placement_ref: placement,
          access_ok: route?.access_ok ?? true, orders_ok: ordersOk,
          danger_ok: dangerOk, body_ok: bodyOk, activity_ok: activityOk } });
      if (!proposed.ok) fail(proposed.error.code);
    }
    if (!interrupted && switchesSeason && completesMovement) {
      const selected = selectNpcRoutineSchedule({ schedule_context: runtime.schedule_context,
        scheduled_at: candidate.scheduled_at });
      seasonRuntime = createNpcRoutineState({ profile: selected.rule.routine_profile,
        started_at: candidate.scheduled_at,
        calendar_profile: runtime.schedule_context.calendar_profile,
        current_activity: runtime.work_activity,
        schedule_context: selected.schedule_context });
    }
    const interruption = interrupted
      ? interruptedRoutineState(runtime, machine, candidate.scheduled_at)
      : null;
    const runtimeAfter = structuredClone(interruption?.runtime ?? seasonRuntime ?? proposed.runtime_after);
    const nextPhase = runtimeAfter.profile.phases[runtimeAfter.phase_index];
    const machineAfter = interruption?.machine ?? (seasonRuntime ? {
      ...machine, schedule_state: nextPhase.state_id,
      current_activity: npcRoutineActivity(seasonRuntime),
      current_activity_ref: npcRoutineActivity(seasonRuntime).activity_ref,
      runtime_status: seasonRuntime.runtime_status,
      activity_changed_at: candidate.scheduled_at
    } : {
      ...machine, schedule_state: nextPhase.state_id,
      current_activity: proposed.activity_after,
      current_activity_ref: proposed.activity_after.activity_ref,
      runtime_status: runtimeAfter.runtime_status,
      activity_changed_at: candidate.scheduled_at });
    const movement = proposed == null ? null
      : validateRoutineMovement(proposed.movement_transition, route);
    let currentPositionNodeId = movement?.status === 'completed'
      ? movement.destination_position_node_id : row.current_position_node_id;
    const location = resolveRoutineLocation(runtimeAfter, currentPositionNodeId,
      row.causal_state_ref.deferred_placement, candidate.scheduled_at,
      movement, row.last_completed_movement, row, interrupted === true);
    const changeSetId = context.request.idempotency_context.change_set_id;
    currentPositionNodeId = location.position_node_id;
    runtimeAfter.presence_state = location.presence_state;
    if (location.gap_reason) runtimeAfter.schedule_gap_reason = location.gap_reason;
    else delete runtimeAfter.schedule_gap_reason;
    const causal = { ...row.causal_state_ref, routine_state: runtimeAfter };
    if (['offstage_away', 'location_gap'].includes(runtimeAfter.presence_state)) {
      delete causal.deferred_placement;
    }
    delete causal.canonical_digest;
    causal.canonical_digest = digest(causal);
    const after = { ...row, state_version: Number(row.state_version) + 1,
      current_position_node_id: currentPositionNodeId,
      causal_state_ref: causal, status: runtimeAfter.status,
      next_transition_at_whole_minutes: runtimeAfter.next_transition_at?.whole_minutes ?? null,
      next_transition_at_subminute_numerator: runtimeAfter.next_transition_at?.subminute_numerator ?? null,
      next_transition_at_subminute_denominator: runtimeAfter.next_transition_at?.subminute_denominator ?? null,
      npc_snapshot: routineNpcSnapshot({ ...npc, machine_state: machineAfter }),
      ...(seasonRuntime ? { schedule_profile_ref: routineProfileRef(runtimeAfter.profile),
        dependency_pins: routineProfilePins(runtimeAfter.profile) } : {}) };
    if (movement?.status === 'completed') {
      after.last_completed_movement = {
        destination_position_node_id: movement.destination_position_node_id,
        destination_location_ref: movement.destination_location_ref,
        completed_at: movement.completed_at
      };
    }
    const placementWrites = routinePlacementWrites(row, currentPositionNodeId, changeSetId);
    const persistedRows = worlds(context.projection).map((projection) =>
      projection?.temporal_source_proof?.npc_schedule_runtime)
      .find(Array.isArray);
    const persistedRow = Array.isArray(persistedRows)
      ? persistedRows.find((entry) => entry.id === row.id && entry.npc_id === row.npc_id)
      : null;
    if (persistedRow == null) fail('temporal_candidate_stale');
    const persistedStateVersion = Number(persistedRow.state_version);
    if (!Number.isSafeInteger(persistedStateVersion) || persistedStateVersion < 0) {
      fail('temporal_candidate_stale');
    }
    after.npc_placement = placementWrites.deletes.length ? null
      : placementWrites.updates.length ? { ...row.npc_placement,
        position_node_id: currentPositionNodeId,
        state_version: Number(row.npc_placement.state_version) + 1 }
        : row.npc_placement;
    const transition = { boundary_id: candidate.boundary_id, schedule_id: row.id, npc_id: row.npc_id,
      before: structuredClone(row), after, occurred_at: candidate.scheduled_at,
      proposal: proposed, interrupted };
    const projection = applyNpcRoutineProjection(context.projection, transition);
    const replacement = npcRoutineCandidate(after);
    const exact = candidate.scheduled_at;
    const record = { id: row.id, party_id: row.party_id, npc_id: row.npc_id,
      causal_state_ref: causal, status: runtimeAfter.status,
      current_position_node_id: currentPositionNodeId,
      ...(seasonRuntime ? { schedule_profile_ref: after.schedule_profile_ref,
        dependency_pins: after.dependency_pins } : {}),
      next_transition_at_whole_minutes: after.next_transition_at_whole_minutes,
      next_transition_at_subminute_numerator: after.next_transition_at_subminute_numerator,
      next_transition_at_subminute_denominator: after.next_transition_at_subminute_denominator,
      state_version: persistedStateVersion + 1, updated_change_set_id: changeSetId };
    const decisionRequired = proposed?.factual_transition.decision_required === true;
    return { disposition: replacement == null ? 'execute' : 'replace',
      ...(replacement == null ? {} : { replacement }), follow_up_candidates: [],
      state_projection: projection, stop_after_current_batch: decisionRequired,
      proposals: [{ proposal_id: candidate.boundary_id, npc_routine_transition: transition,
        write_set: { inserts: [], deletes: placementWrites.deletes, updates: [
          { ...write('party_npc_spatial_schedules', row.id, record),
            previous_record: { causal_state_ref: row.causal_state_ref } },
          { ...write('party_npcs', row.npc_id, { party_id: row.party_id,
            npc_id: row.npc_id, machine_state: machineAfter }),
            previous_record: { machine_state: machine } }, ...placementWrites.updates],
        appends: [write('party_npc_runtime_transitions', candidate.boundary_id, {
          transition_id: candidate.boundary_id, party_id: row.party_id, npc_id: row.npc_id,
          transition_kind: interrupted ? 'routine_interrupted'
            : switchesSeason ? 'season_schedule_switch' : 'routine_transition', event_id: null,
          change_set_id: changeSetId, idempotency_record_id: candidate.idempotency_key,
          occurred_at_whole_minutes: exact.whole_minutes,
          occurred_at_subminute_numerator: exact.subminute_numerator,
          occurred_at_subminute_denominator: exact.subminute_denominator,
          trace: { transition: proposed?.factual_transition ?? null,
            evidence: proposed?.transition_evidence ?? null,
            movement, location } })] },
        expected_state_versions: [{ target_table: 'party_npc_spatial_schedules', id: row.id,
          state_version: persistedStateVersion }, ...placementWrites.expected],
        physical_keys: [`party_runtime.party_npc_spatial_schedules:${row.id}`,
          `party_runtime.party_npcs:${row.npc_id}`,
          ...placementWrites.physical_keys,
          `party_runtime.party_npc_runtime_transitions:${candidate.boundary_id}`] }] };
  } };
}

export function applyNpcRoutineProjection(projection, transition) {
  const next = structuredClone(projection);
  const row = findSchedule(next, transition.npc_id);
  if (!row || digest(row.causal_state_ref) !== digest(transition.before.causal_state_ref)) fail('temporal_candidate_stale');
  for (const world of worlds(next)) {
    const schedule = world?.npc_schedule_runtime?.find((entry) => entry.npc_id === transition.npc_id);
    if (schedule) Object.assign(schedule, structuredClone(transition.after));
    const npc = world?.npcs?.find(({ instance_id }) => instance_id === transition.npc_id);
    if (npc) npc.machine_state = structuredClone(transition.after.npc_snapshot.machine_state);
  }
  if (transition.proposal?.factual_transition.decision_required === true) {
      const source = { entity_kind: 'npc_activity_factual_transition', entity_id: transition.boundary_id };
      next.npc_decision_signal_descriptors = [...(next.npc_decision_signal_descriptors ?? []), {
        occurred_at: transition.occurred_at, category: 'objective', significance: 'material',
        source_event_ref: source, subject_ref: { entity_kind: 'npc', entity_id: transition.npc_id },
        scope_refs: [], perception_required: false, source_perception_ref: null,
        causal_parent_refs: [{ entity_kind: 'temporal_boundary_candidate', entity_id: transition.boundary_id }],
        perceived_change_summary: transition.proposal.factual_transition.summary }];
    }
  return next;
}
export function applyNpcRoutineTemporalResults(state, results) {
  const transitions = (results ?? []).flatMap((result) => result?.combined_change_set?.proposals ?? [])
    .map((proposal) => proposal.npc_routine_transition).filter(Boolean);
  for (const transition of transitions) {
    for (const group of [state.npcs, state.first_entry_preparation?.npcs,
      ...(state.first_entry_preparation?.members ?? []).map((member) => member.npcs)]) {
      const npc = group?.find((entry) => entry.instance_id === transition.npc_id);
      if (npc) npc.machine_state = structuredClone(transition.after.npc_snapshot.machine_state);
    }
    const runtime = state.npc_schedule_runtime?.find((entry) => entry.npc_id === transition.npc_id);
    if (runtime) Object.assign(runtime, structuredClone(transition.after));
    state.temporal_boundary_candidates = (state.temporal_boundary_candidates ?? [])
      .filter((candidate) => !(candidate.source_ref?.entity_kind === 'npc'
        && candidate.source_ref.entity_id === transition.npc_id && candidate.resolution_class === 'npc_schedule'));
    const next = npcRoutineCandidate(transition.after);
    if (next) state.temporal_boundary_candidates.push(next);
  }
  if (transitions.length && state.temporal_source_proof) {
    state.temporal_source_proof.candidates = structuredClone(state.temporal_boundary_candidates);
    state.temporal_source_proof.candidate_count = state.temporal_boundary_candidates.length;
    state.temporal_source_proof.active_schedule_count = (state.npc_schedule_runtime ?? [])
      .filter((row) => row.status === 'active').length;
  }
  return state;
}

export function interruptNpcRoutinesForAction(state, {
  npcIds, occurredAt, positionNodeId, changeSetId
}) {
  const participants = new Set(npcIds);
  for (const schedule of state.npc_schedule_runtime ?? []) {
    if (!participants.has(schedule.npc_id)) continue;
    const npc = state.npcs?.find(
      ({ instance_id: instanceId }) => instanceId === schedule.npc_id
    );
    if (npc == null) fail('npc_schedule_gap');
    const interruption = schedule.status === 'active'
      ? interruptedRoutineState(
          schedule.causal_state_ref.routine_state,
          npc.machine_state,
          occurredAt
        )
      : null;
    const machine = interruption?.machine ?? npc.machine_state;
    const causal = interruption == null
      ? schedule.causal_state_ref
      : { ...schedule.causal_state_ref, routine_state: interruption.runtime };
    if (interruption != null) {
      delete causal.canonical_digest;
      causal.canonical_digest = digest(causal);
      npc.machine_state = structuredClone(machine);
    }
    Object.assign(schedule, {
      current_position_node_id: positionNodeId ?? null,
      causal_state_ref: causal,
      status: interruption?.runtime.status ?? schedule.status,
      next_transition_at_whole_minutes:
        interruption?.runtime.next_transition_at?.whole_minutes ?? null,
      next_transition_at_subminute_numerator:
        interruption?.runtime.next_transition_at?.subminute_numerator ?? null,
      next_transition_at_subminute_denominator:
        interruption?.runtime.next_transition_at?.subminute_denominator ?? null,
      state_version: Number(schedule.state_version) + 1,
      updated_change_set_id: changeSetId,
      npc_snapshot: routineNpcSnapshot({ ...schedule.npc_snapshot,
        ...structuredClone(npc), machine_state: structuredClone(machine) })
    });
  }
  state.temporal_boundary_candidates = (state.temporal_boundary_candidates ?? [])
    .filter((candidate) => !(candidate.resolution_class === 'npc_schedule'
      && participants.has(candidate.primary_subject_ref?.entity_id)));
  if (state.temporal_source_proof) {
    state.temporal_source_proof.candidates =
      structuredClone(state.temporal_boundary_candidates);
    state.temporal_source_proof.candidate_count =
      state.temporal_boundary_candidates.length;
    state.temporal_source_proof.active_schedule_count =
      (state.npc_schedule_runtime ?? []).filter(
        ({ status }) => status === 'active'
      ).length;
  }
  return state;
}
export function npcRoutineRuntime(projection) {
  return worlds(projection).find((value) => Array.isArray(value?.npc_schedule_runtime))?.npc_schedule_runtime ?? [];
}
export function replaceNpcRoutineCandidates(candidates, projection) {
  const rows = npcRoutineRuntime(projection);
  const ids = new Set(rows.map(row => row.npc_id));
  return [...candidates.filter(candidate => !(candidate.rule_ref?.entity_ref?.entity_id
    === RULE.entity_ref.entity_id && ids.has(candidate.primary_subject_ref?.entity_id))),
  ...rows.map(npcRoutineCandidate).filter(Boolean)];
}
export function hydrateNpcRoutineState(state) {
  for (const row of state.npc_schedule_runtime ?? []) {
    for (const group of [state.npcs, state.first_entry_preparation?.npcs,
      ...(state.first_entry_preparation?.members ?? []).map((member) => member.npcs)]) {
      const npc = group?.find(({ instance_id }) => instance_id === row.npc_id);
      if (npc) npc.machine_state = structuredClone(row.npc_snapshot.machine_state);
    }
  }
  return state;
}
function findSchedule(projection, id) { return npcRoutineRuntime(projection).find((row) => row.npc_id === id); }
function findNpc(projection, id) { return worlds(projection).flatMap((world) => world?.npcs ?? [])
  .find(({ instance_id }) => instance_id === id); }
function worlds(value) { return [value, value?.phase6_state, value?.world_state, value?.conversation_state?.world_state]; }
function interruptedRoutineState(runtime, machine, occurredAt) {
  return {
    runtime: { ...runtime, status: 'inactive', next_transition_at: null },
    machine: { ...machine, schedule_state: 'interrupted',
      current_activity: null, current_activity_ref: null,
      activity_changed_at: occurredAt }
  };
}
function activeMovementEnd(runtime) {
  const movement = runtime?.movement_execution;
  return movement?.status === 'active' && movement.ends_at != null
    ? movement.ends_at : null;
}
function versioned(entity_kind, entity_id, authoring_version = '1') {
  return { entity_ref: { entity_kind, entity_id }, authoring_version: String(authoring_version) };
}
function write(target_table, id, record) { return { target_table, id, record }; }
function timestampKey(value) { return `${value.whole_minutes}:${value.subminute_numerator}/${value.subminute_denominator}`; }
function routineProfileRef(profile) { return versioned('activity_profile', profile.profile_id, profile.revision); }
function routineProfilePins(profile) {
  const profileRef = routineProfileRef(profile);
  const value = { pins: [{ dependency_role: 'profile', entity_ref: profileRef.entity_ref,
    version_pin: { pin_kind: 'authoring_version', authoring_version: profileRef.authoring_version } }] };
  return { ...value, canonical_digest: digest(value) };
}
function resolveRoutineLocation(runtime, positionNodeId, deferredPlacement,
  scheduledAt, movement, lastCompletedMovement, row, interrupted) {
  const context = runtime.schedule_context;
  const phase = runtime.profile.phases[runtime.phase_index];
  const facts = { current_position_node_id: positionNodeId,
    has_placement: row.npc_placement != null,
    last_completed_movement: movement?.status === 'completed'
      ? movement : lastCompletedMovement,
    active_movement_execution: runtime.movement_execution ?? null,
    approved_location_bindings: approvedLocationBindings(positionNodeId, row),
    approved_endpoint_bindings: (row.route_endpoint_bindings ?? []).filter((binding) =>
      binding.position_id === positionNodeId && binding.status === 'active'),
    interrupted };
  const presence = resolveNpcRoutinePresence({ intent: phase,
    schedule_context: context,
    scheduled_at: scheduledAt,
    facts,
    allow_home_baseline: deferredPlacement != null && positionNodeId == null,
    deferred_placement: deferredPlacement });
  return { ...presence,
    position_node_id: presence.presence_state === 'on_site'
      || (presence.presence_state === 'location_gap'
        && row.npc_placement != null && positionNodeId != null)
      ? positionNodeId : null };
}

function approvedLocationBindings(positionNodeId, row) {
  if (positionNodeId == null) return [];
  return (row.approved_location_bindings ?? []).filter((binding) =>
    binding.position_node_id === positionNodeId);
}
function routinePlacementWrites(row, positionNodeId, changeSetId) {
  const placement = row.npc_placement;
  if (!placement) {
    if (positionNodeId != null) fail('npc_schedule_gap');
    return { updates: [], deletes: [], expected: [], physical_keys: [] };
  }
  if (placement.entity_id !== row.npc_id || placement.entity_kind !== 'npc'
      || placement.position_node_id !== row.current_position_node_id
      || !Number.isSafeInteger(Number(placement.state_version))) fail('npc_schedule_gap');
  const id = `npc:${row.npc_id}`;
  const physicalKey = `party_runtime.entity_placements:${id}`;
  const expected = [{ target_table: 'entity_placements', id,
    state_version: Number(placement.state_version) }];
  if (positionNodeId == null) return { updates: [], deletes: [{
    ...write('entity_placements', id, { party_id: row.party_id,
      entity_kind: 'npc', entity_id: row.npc_id }),
    previous_record: { position_node_id: placement.position_node_id,
      state_version: Number(placement.state_version) }
  }], expected, physical_keys: [physicalKey] };
  if (positionNodeId === placement.position_node_id) {
    return { updates: [], deletes: [], expected: [], physical_keys: [] };
  }
  const record = { party_id: row.party_id, entity_kind: 'npc', entity_id: row.npc_id,
    placement_kind: 'scene_position', position_node_id: positionNodeId,
    occupies_capacity_units: 1, state_version: Number(placement.state_version) + 1,
    updated_change_set_id: changeSetId };
  return { updates: [{ ...write('entity_placements', id, record),
    previous_record: { position_node_id: placement.position_node_id,
      state_version: Number(placement.state_version) } }], deletes: [], expected, physical_keys: [physicalKey] };
}
function fail(code) { throw Object.assign(new Error(code), { code }); }
