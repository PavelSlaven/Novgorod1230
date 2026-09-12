import { addElapsedTime, compareGameTimestamp, subtractGameTimestamp } from '@rus/time-events-history';
import { projectCalendar } from '@rus/time-events-history/calendar';
import { digest, freeze } from './internal.js';
import { proposeNpcScheduleTransition } from './schedule.js';
export { proposeNpcScheduleTransition };

// A routine is an approved finite cycle, not a vocabulary of possible NPC actions.
export function validateNpcRoutineProfile(profile) {
  const phases = profile?.phases;
  if (profile?.schema !== 'npc_routine_profile_v1' || profile.status !== 'approved'
      || !text(profile.profile_id) || !Number.isSafeInteger(profile.revision)
      || profile.revision < 1 || !Array.isArray(phases) || phases.length < 2
      || new Set(phases.map((phase) => phase.state_id)).size !== phases.length
      || phases.some((phase) => !text(phase.state_id)
        || !Number.isSafeInteger(phase.duration_minutes) || phase.duration_minutes <= 0
        || !['available', 'unavailable', 'sleeping'].includes(phase.runtime_status)
        || !text(phase.activity_ref) || !text(phase.summary)
        || !['active', 'paused', 'completed'].includes(phase.activity_status)
        || (phase.uses_current_activity !== undefined
          && typeof phase.uses_current_activity !== 'boolean')
        || !validMovementHandoff(phase.movement_handoff, phase.duration_minutes)
        || typeof phase.can_continue_automatically !== 'boolean'
        || typeof phase.decision_required !== 'boolean')
      || (profile.local_start_minute !== undefined && (
        !Number.isSafeInteger(profile.local_start_minute) || profile.local_start_minute < 0
        || profile.local_start_minute >= 1440
        || phases.reduce((sum, phase) => sum + phase.duration_minutes, 0) !== 1440))) {
    fail('npc_schedule_gap');
  }
  return profile;
}

export function createNpcRoutineState({ profile, started_at, current_activity,
  interrupted = false, calendar_profile }) {
  validateNpcRoutineProfile(profile);
  let phaseIndex = 0;
  let remaining = minutes(profile.phases[0].duration_minutes);
  if (profile.local_start_minute !== undefined) {
    const local = projectCalendar(started_at, calendar_profile).local_time_of_day;
    const denominator = BigInt(local.denominator);
    let elapsed = (BigInt(local.numerator) - BigInt(profile.local_start_minute) * denominator
      + 1440n * denominator) % (1440n * denominator);
    while (elapsed >= BigInt(profile.phases[phaseIndex].duration_minutes) * denominator) {
      elapsed -= BigInt(profile.phases[phaseIndex].duration_minutes) * denominator;
      phaseIndex += 1;
    }
    remaining = { exact_minutes: {
      numerator: String(BigInt(profile.phases[phaseIndex].duration_minutes) * denominator - elapsed),
      denominator: String(denominator) } };
  }
  const phase = profile.phases[phaseIndex];
  const next = addElapsedTime(started_at, remaining);
  return freeze({ schema: 'npc_routine_state_v1', profile: structuredClone(profile),
    phase_index: phaseIndex, started_at: structuredClone(started_at),
    phase_started_at: structuredClone(started_at),
    next_transition_at: interrupted ? null : next,
    status: interrupted ? 'inactive' : 'active',
    runtime_status: interrupted ? 'unavailable' : phase.runtime_status,
    work_activity: structuredClone(current_activity) });
}

export function proposeNpcRoutineTransition({ runtime, npc_state, recheck_snapshot,
  scheduled_at }) {
  const profile = validateNpcRoutineProfile(runtime?.profile);
  const phase = profile.phases[runtime.phase_index];
  if (runtime.schema !== 'npc_routine_state_v1' || runtime.status !== 'active'
      || !phase || compareGameTimestamp(runtime.next_transition_at, scheduled_at) !== 0) {
    fail('temporal_candidate_stale');
  }
  const nextIndex = (runtime.phase_index + 1) % profile.phases.length;
  const nextPhase = profile.phases[nextIndex];
  const nextAt = addElapsedTime(scheduled_at, minutes(nextPhase.duration_minutes));
  const profileRef = versioned('activity_profile', profile.profile_id, profile.revision);
  const sourceRef = versioned('source_record', profile.profile_id, profile.revision);
  const policyRef = versioned('condition_set', 'npc-approved-routine', 1);
  const work = nextPhase.activity_ref === profile.phases[0].activity_ref
    || nextPhase.uses_current_activity === true ? runtime.work_activity : null;
  const nextActivity = versioned('activity_profile', work?.activity_ref ?? nextPhase.activity_ref, profile.revision);
  const dependencyPins = seal({ pins: [pin('profile', profileRef),
    pin('source_dependency', sourceRef), pin('condition_rule', policyRef),
    pin('condition', policyRef), pin('profile', nextActivity)] });
  const state = seal({ ...npc_state, schedule_profile_ref: profileRef,
    schedule_state_id: phase.state_id, next_transition_at: runtime.next_transition_at,
    runtime_status: runtime.runtime_status });
  const scheduleProfile = seal({ profile_ref: profileRef, status: 'approved',
    provenance_ref: sourceRef, applicability: { npc_refs: [state.npc_ref],
      placement_refs: [state.placement_ref] }, boundary_policy_ref: policyRef,
    visibility_policy_ref: policyRef, interrupt_effect: 'background', transitions: [{
      transition_id: `${phase.state_id}:${runtime.phase_started_at.whole_minutes}`,
      from_schedule_state_id: phase.state_id, to_schedule_state_id: nextPhase.state_id,
      at: scheduled_at, activity_profile_ref: nextActivity, next_boundary_at: nextAt,
      runtime_status: nextPhase.runtime_status }] });
  const proposed = proposeNpcScheduleTransition({ npc_state: state,
    schedule_profile: scheduleProfile, scheduled_at, dependency_pins: dependencyPins,
    recheck_snapshot: seal(recheck_snapshot) });
  if (!proposed.ok) return proposed;
  const activity = { activity_ref: work?.activity_ref ?? nextPhase.activity_ref,
    summary: work?.summary ?? nextPhase.summary,
    status: nextPhase.activity_status,
    can_continue_automatically: nextPhase.can_continue_automatically };
  const beforeActivity = npcRoutineActivity(runtime);
  const movementBefore = runtime.movement_execution ?? null;
  const movementAfter = nextPhase.movement_handoff == null ? null : {
    owner: '@rus/movement-routes', status: 'active',
    route_ref: nextPhase.movement_handoff.route_ref,
    source_endpoint_ref: nextPhase.movement_handoff.source_endpoint_ref,
    destination_endpoint_ref: nextPhase.movement_handoff.destination_endpoint_ref,
    destination_location_ref: nextPhase.movement_handoff.destination_location_ref,
    started_at: structuredClone(scheduled_at),
    ends_at: structuredClone(nextAt)
  };
  return freeze({ ...proposed,
    runtime_after: { ...runtime, phase_index: nextIndex,
      phase_started_at: structuredClone(scheduled_at), next_transition_at: nextAt,
      runtime_status: nextPhase.runtime_status,
      movement_execution: movementAfter },
    activity_after: activity,
    movement_transition: movementBefore == null && movementAfter == null ? null
      : movementAfter == null
        ? { ...structuredClone(movementBefore), status: 'completed',
          completed_at: structuredClone(scheduled_at) }
        : { ...structuredClone(movementAfter), status: 'started' },
    factual_transition: { npc_ref: state.npc_ref,
      from_activity_ref: beforeActivity.activity_ref, to_activity_ref: activity.activity_ref,
      occurred_at: structuredClone(scheduled_at),
      elapsed: subtractGameTimestamp(scheduled_at, runtime.phase_started_at),
      decision_required: nextPhase.decision_required, summary: activity.summary }
  });
}

export function npcRoutineActivity(runtime) {
  const phase = runtime.profile.phases[runtime.phase_index];
  const work = phase.activity_ref === runtime.profile.phases[0].activity_ref
    || phase.uses_current_activity === true
    ? runtime.work_activity : null;
  return freeze({ activity_ref: work?.activity_ref ?? phase.activity_ref,
    summary: work?.summary ?? phase.summary, status: phase.activity_status,
    can_continue_automatically: phase.can_continue_automatically });
}

function seal(value) { return { ...value, canonical_digest: digest(value) }; }
function pin(dependency_role, value) { return { dependency_role,
  entity_ref: value.entity_ref, version_pin: { pin_kind: 'authoring_version',
    authoring_version: value.authoring_version } }; }
function versioned(entity_kind, entity_id, revision) { return {
  entity_ref: { entity_kind, entity_id }, authoring_version: String(revision) }; }
function minutes(value) { return { exact_minutes: { numerator: String(value), denominator: '1' } }; }
function text(value) { return typeof value === 'string' && value.trim() === value && value.length > 0; }
function validMovementHandoff(value, duration) {
  return value === undefined || value === null || (
    value && typeof value === 'object' && !Array.isArray(value)
    && text(value.route_ref) && text(value.source_endpoint_ref)
    && text(value.destination_endpoint_ref) && text(value.destination_location_ref)
    && Number.isSafeInteger(value.duration_minutes)
    && value.duration_minutes === duration
  );
}
function fail(code) { throw Object.assign(new Error(code), { code }); }
