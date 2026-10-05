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
        || !validRoutinePresence(phase)
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

/** Select one exact approved D-1 rule from a persisted schedule snapshot. */
export function selectNpcRoutineSchedule({ schedule_context, scheduled_at,
  calendar_day_type = null, assigned_work_variant = null } = {}) {
  validateNpcScheduleContext(schedule_context, { requireSelectedRule: false });
  const dayType = assigned_work_variant ?? calendar_day_type ?? 'normal';
  if (!text(dayType)) fail('npc_schedule_gap');
  let projected;
  try {
    projected = projectCalendar(scheduled_at, schedule_context.calendar_profile);
  } catch {
    fail('npc_schedule_gap');
  }
  const matches = schedule_context.approved_rule_rows.filter((row) =>
    row.scope_kind === 'place_family'
      && row.scope_ref === schedule_context.home_scope_ref
      && row.subject_kind === schedule_context.subject_kind
      && row.subject_ref === schedule_context.subject_ref
      && row.day_type === dayType
      && row.season === projected.season_id
      && (row.months == null || row.months.includes(Number(projected.month))));
  if (matches.length !== 1) fail('npc_schedule_gap');
  const rule = matches[0];
  const selected_rule_ref = scheduleRuleRef(rule);
  return freeze({ rule, selected_rule_ref,
    schedule_context: { ...schedule_context, day_type: dayType, selected_rule_ref },
    season: projected.season_id, month: Number(projected.month) });
}

/** Resolve routine presence from intent and observed, approved location facts. */
export function resolveNpcRoutinePresence({ intent = null, schedule_context = null,
  scheduled_at, facts = {}, allow_home_baseline = false,
  deferred_placement = null } = {}) {
  const home = text(schedule_context?.home_scope_ref) ? schedule_context.home_scope_ref : null;
  const phase = intent;
  if (phase?.presence_state === 'away' && phase.location_ref === null) {
    if (facts.current_position_node_id != null && facts.has_placement === true) {
      return locationGap(null);
    }
    return freeze({ presence_state: 'offstage_away', location_ref: null });
  }
  if (phase != null && (Object.hasOwn(phase, 'presence_state')
      || Object.hasOwn(phase, 'location_ref'))) {
    if (phase.presence_state !== 'on_site' || !text(phase.location_ref)) {
      return locationGap(text(phase.location_ref) ? phase.location_ref : null);
    }
  }

  const absence = scheduledAbsenceForSeason(schedule_context, scheduled_at);
  if (absence.status !== 'none') {
    const location = absence.status === 'match' ? factualLocation(facts) : null;
    return location?.location_ref === absence.location_ref
      ? freeze({ presence_state: 'on_site', location_ref: absence.location_ref })
      : locationGap(null);
  }

  const factual = factualLocation(facts);
  if (factual != null) {
    const requested = text(phase?.location_ref) ? phase.location_ref : null;
    const moving = facts.active_movement_execution?.status === 'active';
    if (requested == null || requested === factual.location_ref || moving
        || facts.interrupted === true) {
      return freeze({ presence_state: 'on_site', location_ref: factual.location_ref });
    }
    return locationGap(null);
  }

  if (allow_home_baseline && home != null
      && (phase == null || (!Object.hasOwn(phase, 'presence_state')
        && !Object.hasOwn(phase, 'location_ref')))
      && facts.first_entry_binding?.location_ref === home
      && validBindingRef(facts.first_entry_binding.binding_ref)) {
    return freeze({ presence_state: 'on_site', location_ref: home });
  }
  if (schedule_context == null && validDeferredPlacement(deferred_placement)
      && facts.first_entry_binding == null
      && facts.current_position_node_id == null) {
    return freeze({ presence_state: 'on_site', location_ref: null });
  }
  return locationGap(null);
}

function factualLocation(facts) {
  const position = facts.current_position_node_id;
  if (position == null && facts.first_entry_binding != null) {
    const binding = facts.first_entry_binding;
    return text(binding.location_ref) && validBindingRef(binding.binding_ref)
      ? { location_ref: binding.location_ref } : null;
  }
  if (position == null || facts.has_placement === false) return null;
  const completed = facts.last_completed_movement;
  let location = completed != null
    && completed.destination_position_node_id === position
    && text(completed.destination_location_ref) ? completed.destination_location_ref : null;
  const bindings = Array.isArray(facts.approved_location_bindings)
    ? facts.approved_location_bindings.filter((binding) =>
      binding?.position_node_id === position && text(binding.location_ref)
        && validBindingRef(binding.binding_ref)) : [];
  if (bindings.length > 1) return null;
  if (bindings.length === 1) {
    if (location != null && location !== bindings[0].location_ref) return null;
    location = bindings[0].location_ref;
  }
  return location == null ? null : { location_ref: location };
}

function validBindingRef(value) {
  return text(value?.entity_id) && text(value?.authoring_version);
}

function scheduledAbsenceForSeason(context, scheduledAt) {
  const absences = context?.scheduled_absences;
  if (!Array.isArray(absences) || absences.length === 0) return { status: 'none' };
  const relevant = absences.filter((absence) => absence?.subject_kind === context.subject_kind
    && absence?.subject_ref === context.subject_ref);
  if (relevant.length === 0) return { status: 'none' };
  let projected;
  try {
    projected = projectCalendar(scheduledAt, context.calendar_profile);
  } catch {
    return { status: 'unknown' };
  }
  if (relevant.some((absence) => !Array.isArray(absence.seasons))) {
    return { status: 'unknown' };
  }
  const match = relevant.find((absence) => absence.seasons.includes(projected.season_id));
  return match ? { status: 'match', location_ref: match.location_ref } : { status: 'none' };
}

function locationGap(locationRef) {
  return freeze({ presence_state: 'location_gap', location_ref: locationRef,
    gap_reason: 'npc_location_gap' });
}

function validDeferredPlacement(value) {
  if (value?.kind === 'prepared_scene') {
    return text(value.snapshot_id) && Number.isSafeInteger(value.member_ordinal)
      && value.member_ordinal >= 0;
  }
  return value?.kind === 'legacy_anchor' && text(value.anchor_id);
}

export function createNpcRoutineState({ profile, started_at, current_activity,
  interrupted = false, calendar_profile, schedule_context }) {
  validateNpcRoutineProfile(profile);
  if (schedule_context !== undefined) validateNpcScheduleContext(schedule_context);
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
    work_activity: structuredClone(current_activity),
    ...(schedule_context === undefined ? {} : { schedule_context }) });
}

export function proposeNpcRoutineTransition({ runtime, npc_state, recheck_snapshot,
  scheduled_at, next_movement_authorized = false, suppress_next_movement = false }) {
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
  const work = usesCurrentActivity(profile, nextPhase) ? runtime.work_activity : null;
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
  const movementAfter = suppress_next_movement || nextPhase.movement_handoff == null ? null : {
    owner: '@rus/movement-routes', status: 'active',
    route_ref: nextPhase.movement_handoff.route_ref,
    source_endpoint_ref: nextPhase.movement_handoff.source_endpoint_ref,
    destination_endpoint_ref: nextPhase.movement_handoff.destination_endpoint_ref,
    destination_location_ref: nextPhase.movement_handoff.destination_location_ref,
    started_at: structuredClone(scheduled_at),
    ends_at: structuredClone(nextAt)
  };
  if (movementBefore != null && movementAfter != null && next_movement_authorized !== true) {
    fail('npc_schedule_gap');
  }
  return freeze({ ...proposed,
    runtime_after: { ...runtime, phase_index: nextIndex,
      phase_started_at: structuredClone(scheduled_at), next_transition_at: nextAt,
      runtime_status: nextPhase.runtime_status,
      movement_execution: movementAfter },
    activity_after: activity,
    movement_transition: movementBefore != null
      ? { ...structuredClone(movementBefore), status: 'completed',
        completed_at: structuredClone(scheduled_at) }
      : movementAfter == null ? null
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
  const work = usesCurrentActivity(runtime.profile, phase) ? runtime.work_activity : null;
  return freeze({ activity_ref: work?.activity_ref ?? phase.activity_ref,
    summary: work?.summary ?? phase.summary, status: phase.activity_status,
    can_continue_automatically: phase.can_continue_automatically });
}

function usesCurrentActivity(profile, phase) {
  return phase.uses_current_activity === true
    || (phase.uses_current_activity === undefined
      && phase.activity_ref === profile.phases[0].activity_ref);
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

function validRoutinePresence(phase) {
  const hasPresence = Object.hasOwn(phase, 'presence_state');
  const hasLocation = Object.hasOwn(phase, 'location_ref');
  if (!hasPresence && !hasLocation) return true;
  if (!hasPresence || !hasLocation
      || !['on_site', 'away'].includes(phase.presence_state)) return false;
  return phase.presence_state === 'on_site'
    ? text(phase.location_ref)
    : phase.location_ref === null;
}

function validateNpcScheduleContext(context, { requireSelectedRule = true } = {}) {
  if (!context || !text(context.home_scope_ref)
      || !text(context.subject_kind) || !text(context.subject_ref)
      || !text(context.day_type) || !Array.isArray(context.approved_rule_rows)
      || !context.calendar_profile
      || (requireSelectedRule && !validScheduleRuleRef(context.selected_rule_ref))
      || (context.selected_rule_ref != null && !validScheduleRuleRef(context.selected_rule_ref))) {
    fail('npc_schedule_gap');
  }
  let selectedRefFound = false;
  for (const row of context.approved_rule_rows) {
    if (!row || row.status !== 'approved' || row.scope_kind !== 'place_family'
        || !text(row.scope_ref) || !text(row.subject_kind) || !text(row.subject_ref)
        || !text(row.season) || !text(row.day_type) || !text(row.schedule_id)
        || !Number.isSafeInteger(row.schedule_version) || row.schedule_version < 1
        || !text(row.world_revision_id)
        || (row.months !== null && row.months !== undefined
          && (!Array.isArray(row.months) || row.months.length === 0
            || row.months.some((month) => !Number.isInteger(month) || month < 1 || month > 12)
            || new Set(row.months).size !== row.months.length))) {
      fail('npc_schedule_gap');
    }
    validateNpcRoutineProfile(row.routine_profile);
    const ref = scheduleRuleRef(row);
    if (context.selected_rule_ref != null
        && sameScheduleRuleRef(ref, context.selected_rule_ref)) selectedRefFound = true;
  }
  if (context.selected_rule_ref != null && !selectedRefFound) fail('npc_schedule_gap');
}

function scheduleRuleRef(row) {
  return { schedule_id: row.schedule_id, schedule_version: row.schedule_version,
    world_revision_id: row.world_revision_id };
}

function validScheduleRuleRef(value) {
  return value && text(value.schedule_id)
    && Number.isSafeInteger(value.schedule_version) && value.schedule_version > 0
    && text(value.world_revision_id);
}

function sameScheduleRuleRef(left, right) {
  return left.schedule_id === right.schedule_id
    && left.schedule_version === right.schedule_version
    && left.world_revision_id === right.world_revision_id;
}
function fail(code) { throw Object.assign(new Error(code), { code }); }
