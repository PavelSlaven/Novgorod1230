import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createNpcRoutineState, npcRoutineActivity,
  resolveNpcRoutinePresence, selectNpcRoutineSchedule } from '@rus/npc-runtime';
import { projectCalendar } from '@rus/time-events-history/calendar';
import { npcRoutineCandidate, npcRoutineTemporalRegistration } from
  '../src/runtime/npc-routine-temporal.js';
import { buildCalendarProjectionProfile } from
  '../src/internal/lower-dvina-trace-phase-1a-bundle.js';

const at = (whole_minutes) => ({ whole_minutes: String(whole_minutes),
  subminute_numerator: '0', subminute_denominator: '1' });
const profile = { schema: 'npc_routine_profile_v1', profile_id: 'worker-route',
  revision: 1, status: 'approved', phases: [{ state_id: 'work', duration_minutes: 60,
    activity_ref: 'work', summary: 'Работает.', activity_status: 'active',
    runtime_status: 'available', can_continue_automatically: true,
    decision_required: false }, { state_id: 'walk-home', duration_minutes: 12,
    activity_ref: 'walk-home', summary: 'Идёт домой.', activity_status: 'active',
    runtime_status: 'unavailable', can_continue_automatically: true,
    decision_required: false, movement_handoff: { route_ref: 'work-home',
      source_endpoint_ref: 'work-endpoint',
      destination_endpoint_ref: 'home-endpoint',
      destination_location_ref: 'pf_home', duration_minutes: 12 } },
  { state_id: 'sleep', duration_minutes: 480, activity_ref: 'sleep',
    summary: 'Спит.', activity_status: 'active', runtime_status: 'sleeping',
    can_continue_automatically: true, decision_required: false }] };

function world() {
  const runtime = createNpcRoutineState({ profile, started_at: at(100) });
  const activity = npcRoutineActivity(runtime);
  const npc = { instance_id: 'worker', machine_state: { status: 'idle',
    current_activity: activity, current_activity_ref: activity.activity_ref } };
  const row = { id: 'schedule-worker', party_id: 'party', npc_id: 'worker',
    state_version: 1, current_position_node_id: 'work-position',
    current_activity_execution_id: null, causal_state_ref: { routine_state: runtime },
    last_completed_movement: { destination_position_node_id: 'work-position',
      destination_location_ref: 'pf_home', completed_at: at(88) },
    approved_location_bindings: [{ position_node_id: 'work-position',
      location_ref: 'pf_home', binding_ref: { entity_id: 'place-composition',
        authoring_version: '1' } }],
    npc_snapshot: structuredClone(npc),
    npc_placement: { entity_kind: 'npc', entity_id: 'worker',
      position_node_id: 'work-position', state_version: 1 },
    route_endpoint_positions: {
      'work-endpoint': { position_id: 'work-position', status: 'active',
        binding_ref: { entity_id: 'work-endpoint', authoring_version: '1' } },
      'home-endpoint': { position_id: 'home-position', status: 'active',
        binding_ref: { entity_id: 'home-endpoint', authoring_version: '1' } },
      'yard-endpoint': { position_id: 'yard-position', status: 'active',
        binding_ref: { entity_id: 'yard-endpoint', authoring_version: '1' } }
    }, attention_state_ref: ref('condition_set', 'attention'),
    body_state_ref: ref('body_state', 'body'),
    knowledge_state_ref: ref('knowledge_fact', 'knowledge'),
    relationship_state_ref: ref('condition_set', 'relations') };
  return { npcs: [npc], npc_schedule_runtime: [row] };
}

test('routine route starts without teleport and changes placement only on arrival', () => {
  const registration = npcRoutineTemporalRegistration();
  const initial = world();
  const started = registration.resolve(npcRoutineCandidate(
    initial.npc_schedule_runtime[0]), context(initial, 'start'));
  const startTransition = started.proposals[0].npc_routine_transition;
  assert.equal(startTransition.proposal.movement_transition.status, 'started');
  assert.equal(startTransition.after.current_position_node_id, 'work-position');
  assert.equal(startTransition.after.causal_state_ref.routine_state.presence_state,
    'on_site');
  assert.equal(startTransition.after.current_position_node_id, 'work-position');

  const arrived = registration.resolve(started.replacement,
    context(started.state_projection, 'arrival'));
  const arrivalTransition = arrived.proposals[0].npc_routine_transition;
  assert.equal(arrivalTransition.proposal.movement_transition.status, 'completed');
  assert.equal(arrivalTransition.after.current_position_node_id, 'home-position');
  assert.equal(arrived.proposals[0].write_set.updates.find((write) =>
    write.target_table === 'entity_placements').record.position_node_id, 'home-position');
});

test('blocked routine route leaves the NPC at the source', () => {
  const state = world();
  state.npc_schedule_runtime[0].route_endpoint_positions['home-endpoint'].status
    = 'inactive';
  const registration = npcRoutineTemporalRegistration();
  const result = registration.resolve(npcRoutineCandidate(
    state.npc_schedule_runtime[0]), context(state, 'blocked'));
  const transition = result.proposals[0].npc_routine_transition;
  assert.equal(transition.interrupted, true);
  assert.equal(transition.after.status, 'inactive');
  assert.equal(transition.after.current_position_node_id, 'work-position');
  assert.notEqual(transition.after.npc_snapshot.machine_state.runtime_status,
    'unavailable');
});

test('legacy deferred prepared-scene presence survives a routine transition without placement', () => {
  const state = world();
  const row = state.npc_schedule_runtime[0];
  const runtime = structuredClone(row.causal_state_ref.routine_state);
  runtime.profile.phases[1].movement_handoff = null;
  const deferred = { kind: 'prepared_scene', snapshot_id: 'preparation:party:first-entry',
    member_ordinal: 0 };
  row.current_position_node_id = null;
  row.npc_placement = null;
  row.causal_state_ref = { routine_state: runtime, deferred_placement: deferred };
  const activity = npcRoutineActivity(runtime);
  row.npc_snapshot.machine_state.current_activity = activity;
  row.npc_snapshot.machine_state.current_activity_ref = activity.activity_ref;
  state.npcs[0].machine_state = structuredClone(row.npc_snapshot.machine_state);

  const candidate = npcRoutineCandidate(row);
  const result = npcRoutineTemporalRegistration().resolve(candidate,
    context(state, 'deferred-prepared-scene'));
  const transition = result.proposals[0].npc_routine_transition;
  assert.equal(transition.after.causal_state_ref.routine_state.presence_state, 'on_site');
  assert.equal(transition.after.current_position_node_id, null);
  assert.deepEqual(transition.after.causal_state_ref.deferred_placement, deferred);
  assert.deepEqual(result.proposals[0].write_set.deletes, []);
  assert.equal(result.proposals[0].write_set.updates.some((write) =>
    write.target_table === 'entity_placements'), false);
});

test('season boundary selects the next pinned D-1 profile and keeps the same NPC and position', () => {
  const calendar = testCalendar();
  const cold = presenceProfile('cold-routine', 'pf_home');
  const warm = presenceProfile('warm-routine', 'pf_home');
  const rows = [
    scheduleRow('cold', cold), scheduleRow('warm', warm),
  ];
  const context = { home_scope_ref: 'pf_home', subject_kind: 'occupation',
    subject_ref: 'nov_occ_worker', day_type: 'normal', approved_rule_rows: rows,
    calendar_profile: calendar,
    composition_ref: { id: 'place-composition', version: 1 } };
  const initialSelection = selectNpcRoutineSchedule({ schedule_context: context,
    scheduled_at: at(42000) });
  const runtime = structuredClone(createNpcRoutineState({ profile: initialSelection.rule.routine_profile,
    started_at: at(42000), calendar_profile: calendar,
    current_activity: { activity_ref: 'work' },
    schedule_context: initialSelection.schedule_context }));
  runtime.presence_state = 'on_site';
  const activity = npcRoutineActivity(runtime);
  const npc = { instance_id: 'worker', machine_state: { status: 'idle',
    current_activity: activity, current_activity_ref: activity.activity_ref } };
  const row = { ...world().npc_schedule_runtime[0], state_version: 1,
    current_position_node_id: 'home-position', causal_state_ref: { routine_state: runtime },
    last_completed_movement: null,
    npc_snapshot: structuredClone(npc), npc_placement: { entity_kind: 'npc',
      entity_id: 'worker', position_node_id: 'home-position', state_version: 1 } };
  const candidate = npcRoutineCandidate(row);
  assert.deepEqual(candidate.scheduled_at, at(42120));
  const result = npcRoutineTemporalRegistration().resolve(candidate,
    contextFor({ npcs: [npc], npc_schedule_runtime: [row] }, 'season-switch'));
  const transition = result.proposals[0].npc_routine_transition;
  assert.equal(transition.after.causal_state_ref.routine_state.profile.profile_id,
    'warm-routine');
  assert.equal(transition.after.causal_state_ref.routine_state.schedule_context
    .selected_rule_ref.schedule_id, 'schedule-warm');
  assert.equal(transition.after.current_position_node_id, 'home-position');
  assert.equal(transition.after.npc_snapshot.machine_state.schedule_state, 'warm-work');
  assert.equal(result.proposals[0].write_set.updates.some((write) =>
    write.target_table === 'party_npc_spatial_schedules'), true);
  assert.equal(result.proposals[0].write_set.deletes.length, 0);
});

test('NPC candidate remains available on a no-leap calendar before and at year wrap', async (t) => {
  const calendar = testCalendar();
  calendar.leap_rules = { cycle_years: '1', leap_year_indexes: [], leap_month: '2', leap_days: '0' };
  calendar.season_rule.ranges[1].end_day = '60';
  calendar.daylight_rule.ranges[1].end_day = '60';
  const routine = presenceProfile('no-leap-routine', 'pf_home');
  const scheduleContext = { home_scope_ref: 'pf_home', subject_kind: 'occupation',
    subject_ref: 'nov_occ_worker', day_type: 'normal', calendar_profile: calendar,
    selected_rule_ref: { schedule_id: 'schedule-warm', schedule_version: 1,
      world_revision_id: 'world' },
    approved_rule_rows: [scheduleRow('warm', routine)] };
  for (const scenario of [
    { name: 'ordinary phase in warm day 15', startedAt: 65160,
      expectedAt: 65460, boundary: 'phase' },
    { name: 'season change at year wrap', startedAt: 85200,
      expectedAt: 85320, boundary: 'season' }
  ]) {
    await t.test(scenario.name, () => {
      const runtime = createNpcRoutineState({ profile: routine,
        started_at: at(scenario.startedAt), calendar_profile: calendar,
        schedule_context: scheduleContext });
      const candidate = npcRoutineCandidate({ id: 'schedule', party_id: 'party', npc_id: 'worker',
        state_version: 1, causal_state_ref: { routine_state: runtime } });

      assert.ok(candidate);
      assert.deepEqual(candidate.scheduled_at, at(scenario.expectedAt));
      assert.ok(candidate.boundary_id.includes(`:${scenario.boundary}:`));
    });
  }
});

test('season seam before route end preserves active movement and source placement', () => {
  const { started, registration } = seasonalRouteStarted({ seamOffset: 0 });
  const rowAtRouteStart = started.state_projection.npc_schedule_runtime[0];
  const moving = rowAtRouteStart.causal_state_ref.routine_state.movement_execution;
  assert.deepEqual(moving.started_at, at(42110));
  assert.deepEqual(moving.ends_at, at(42122));
  const candidate = started.replacement;
  assert.deepEqual(candidate.scheduled_at, at(42122));
  assert.ok(BigInt(candidate.scheduled_at.whole_minutes) > 42120n,
    'active movement defers the season transition until route completion');
  // Advancing party clock to 42120 alone creates no NPC transition. The last
  // persisted routine row still holds active movement and source placement.
  assert.equal(rowAtRouteStart.causal_state_ref.routine_state.profile.profile_id,
    'worker-route');
  assert.deepEqual(rowAtRouteStart.causal_state_ref.routine_state.movement_execution,
    moving);
  assert.equal(rowAtRouteStart.current_position_node_id, 'work-position');
  assert.equal(rowAtRouteStart.npc_placement.position_node_id, 'work-position');

  const arrival = registration.resolve(candidate,
    context(started.state_projection, 'arrival-after-season-seam'));
  const arrived = arrival.proposals[0].npc_routine_transition;
  assert.equal(arrived.proposal.movement_transition.status, 'completed');
  assert.deepEqual(arrived.proposal.movement_transition.completed_at, at(42122));
  assert.equal(arrived.after.causal_state_ref.routine_state.profile.profile_id,
    'warm-routine');
  assert.equal(arrived.after.causal_state_ref.routine_state.schedule_context
    .selected_rule_ref.schedule_id, 'schedule-warm');
  assert.equal(arrived.after.current_position_node_id, 'home-position');
  assert.equal(arrival.proposals[0].write_set.updates.filter((write) =>
    write.target_table === 'entity_placements').length, 1);
  assert.equal(arrival.proposals[0].write_set.updates.find((write) =>
    write.target_table === 'entity_placements').record.position_node_id, 'home-position');
});

test('season seam at route end completes route once before applying selected seasonal location', () => {
  const { started, registration } = seasonalRouteStarted({ seamOffset: 2 });
  const moving = started.state_projection.npc_schedule_runtime[0]
    .causal_state_ref.routine_state.movement_execution;
  assert.deepEqual(moving.started_at, at(42110));
  assert.deepEqual(moving.ends_at, at(42122));
  assert.deepEqual(started.replacement.scheduled_at, at(42122));

  const result = registration.resolve(started.replacement,
    context(started.state_projection, 'season-at-route-end'));
  const transition = result.proposals[0].npc_routine_transition;
  assert.deepEqual(transition.occurred_at, at(42122));
  assert.equal(transition.proposal?.movement_transition?.status, 'completed');
  assert.equal(transition.proposal?.movement_transition?.route_ref, 'work-home');
  assert.equal(transition.after.causal_state_ref.routine_state.profile.profile_id,
    'warm-routine');
  assert.deepEqual(transition.after.causal_state_ref.routine_state.work_activity,
    { activity_ref: 'work', summary: 'Перевозит людей.' });
  assert.equal(transition.after.causal_state_ref.routine_state.schedule_context
    .selected_rule_ref.schedule_id, 'schedule-warm');
  assert.equal(transition.after.current_position_node_id, 'home-position');
  assert.equal(transition.after.causal_state_ref.routine_state.movement_execution, undefined);
  assert.deepEqual(transition.proposal.movement_transition.completed_at, at(42122));
  assert.equal(result.proposals[0].write_set.updates.filter((write) =>
    write.target_table === 'entity_placements').length, 1);
  assert.equal(result.proposals[0].write_set.updates.find((write) =>
    write.target_table === 'entity_placements').record.position_node_id, 'home-position');
  assert.equal(result.proposals[0].write_set.deletes.length, 0);
  assert.equal(result.proposals[0].write_set.appends.filter((write) =>
    write.target_table === 'party_npc_runtime_transitions').length, 1);
  assert.equal(result.proposals[0].write_set.appends.find((write) =>
    write.target_table === 'party_npc_runtime_transitions').record.transition_kind,
  'season_schedule_switch');
});

test('adjacent old-profile handoff cannot replace completed route at seasonal seam', () => {
  const { started, registration } = seasonalRouteStarted({ seamOffset: 0,
    adjacentMovement: true });
  const result = registration.resolve(started.replacement,
    context(started.state_projection, 'season-adjacent-route'));
  const transition = result.proposals[0].npc_routine_transition;
  assert.equal(transition.proposal.movement_transition.status, 'completed');
  assert.equal(transition.proposal.movement_transition.route_ref, 'work-home');
  assert.equal(transition.after.causal_state_ref.routine_state.profile.profile_id,
    'warm-routine');
  assert.equal(transition.after.causal_state_ref.routine_state.movement_execution, undefined);
  assert.equal(transition.after.current_position_node_id, 'home-position');
  assert.equal(result.proposals[0].write_set.updates.filter((write) =>
    write.target_table === 'entity_placements').length, 1);
  assert.equal(result.proposals[0].write_set.updates.find((write) =>
    write.target_table === 'entity_placements').record.position_node_id, 'home-position');
});

test('adjacent movement completes current route before starting next handoff', () => {
  const state = world();
  const row = state.npc_schedule_runtime[0];
  const runtime = structuredClone(row.causal_state_ref.routine_state);
  runtime.profile.phases[2].movement_handoff = {
    route_ref: 'home-yard', source_endpoint_ref: 'home-endpoint',
    destination_endpoint_ref: 'yard-endpoint', destination_location_ref: 'pf_yard',
    duration_minutes: 480 };
  row.causal_state_ref = { ...row.causal_state_ref, routine_state: runtime };
  const registration = npcRoutineTemporalRegistration();
  const started = registration.resolve(npcRoutineCandidate(row), context(state, 'chain-start'));
  assert.equal(started.proposals[0].npc_routine_transition.proposal.movement_transition.status,
    'started');
  const arrival = registration.resolve(started.replacement,
    context(started.state_projection, 'chain-arrival'));
  const transition = arrival.proposals[0].npc_routine_transition;
  assert.equal(transition.proposal.movement_transition.status, 'completed');
  assert.equal(transition.proposal.movement_transition.route_ref, 'work-home');
  assert.equal(transition.after.current_position_node_id, 'home-position');
  assert.equal(transition.after.causal_state_ref.routine_state.movement_execution.route_ref,
    'home-yard');
  assert.deepEqual(transition.after.causal_state_ref.routine_state.movement_execution.started_at,
    at(172));
  assert.equal(transition.after.causal_state_ref.routine_state.presence_state, 'on_site');
  assert.equal(transition.after.current_position_node_id, 'home-position');
  assert.deepEqual(arrival.proposals[0].write_set.deletes, []);
  assert.equal(arrival.proposals[0].write_set.updates.filter((write) =>
    write.target_table === 'entity_placements').length, 1);
  const yardArrival = registration.resolve(arrival.replacement,
    context(arrival.state_projection, 'chain-yard-arrival'));
  const yardTransition = yardArrival.proposals[0].npc_routine_transition;
  assert.equal(yardTransition.proposal.movement_transition.status, 'completed');
  assert.equal(yardTransition.after.current_position_node_id, 'yard-position');
  assert.equal(yardTransition.after.causal_state_ref.routine_state.presence_state,
    'on_site');
});

test('temporal presence resolves only observed bindings for missing, mismatched and ambiguous facts', () => {
  const policy = structuredClone(profile);
  policy.phases = policy.phases.map((phase) => ({ ...phase,
    movement_handoff: null, presence_state: 'on_site', location_ref: 'pf_home' }));
  const outcomes = [[], [bindingAt('pf_yard')],
    [bindingAt('pf_home'), bindingAt('pf_yard')]];
  for (const [index, bindings] of outcomes.entries()) {
    const state = world();
    const row = state.npc_schedule_runtime[0];
    const runtime = createNpcRoutineState({ profile: policy, started_at: at(100) });
    row.causal_state_ref.routine_state = runtime;
    row.last_completed_movement = null;
    row.approved_location_bindings = bindings.map((binding) => ({
      ...binding, position_node_id: 'work-position' }));
    const npc = state.npcs[0];
    npc.machine_state.current_activity = npcRoutineActivity(runtime);
    npc.machine_state.current_activity_ref = npc.machine_state.current_activity.activity_ref;
    row.npc_snapshot = structuredClone(npc);
    const result = npcRoutineTemporalRegistration().resolve(npcRoutineCandidate(row),
      context(state, `fact-gap-${index}`));
    const transition = result.proposals[0].npc_routine_transition;
    assert.equal(transition.after.causal_state_ref.routine_state.presence_state,
      'location_gap');
    assert.equal(transition.after.current_position_node_id, 'work-position');
    assert.equal(transition.after.npc_placement.position_node_id, 'work-position');
    assert.deepEqual(result.proposals[0].write_set.deletes, []);
    assert.equal(result.proposals[0].write_set.updates.some((write) =>
      write.target_table === 'entity_placements'), false);
  }
});

test('shared presence policy agrees when each adapter supplies an approved home fact', () => {
  const intent = { presence_state: 'on_site', location_ref: 'pf_home' };
  const homeBinding = bindingAt('pf_home');
  const firstEntry = resolveNpcRoutinePresence({ intent,
    facts: { first_entry_binding: homeBinding } });
  const temporal = resolveNpcRoutinePresence({ intent,
    facts: { current_position_node_id: 'work-position',
      approved_location_bindings: [{ ...homeBinding,
        position_node_id: 'work-position' }] } });
  assert.deepEqual(temporal, firstEntry);
  assert.deepEqual(temporal, { presence_state: 'on_site', location_ref: 'pf_home' });
});

test('persisted home and composition context do not authorize a mismatched current node', () => {
  const state = world();
  const row = state.npc_schedule_runtime[0];
  const policy = structuredClone(profile);
  policy.phases = policy.phases.map((phase) => ({ ...phase,
    movement_handoff: null, presence_state: 'on_site', location_ref: 'pf_home' }));
  const runtime = structuredClone(createNpcRoutineState({ profile: policy,
    started_at: at(100) }));
  runtime.schedule_context = { home_scope_ref: 'pf_home', composition_ref: {
    id: 'home-composition', version: 1 }, calendar_profile: testCalendar() };
  row.causal_state_ref.routine_state = runtime;
  row.last_completed_movement = null;
  row.approved_location_bindings = [];
  const npc = state.npcs[0];
  npc.machine_state.current_activity = npcRoutineActivity(runtime);
  npc.machine_state.current_activity_ref = npc.machine_state.current_activity.activity_ref;
  row.npc_snapshot = structuredClone(npc);

  const result = npcRoutineTemporalRegistration().resolve(npcRoutineCandidate(row),
    context(state, 'composition-context-is-not-proof'));
  const transition = result.proposals[0].npc_routine_transition;
  assert.equal(transition.after.causal_state_ref.routine_state.presence_state,
    'location_gap');
  assert.equal(transition.after.current_position_node_id, 'work-position');
  assert.equal(transition.after.npc_placement.position_node_id, 'work-position');
  assert.deepEqual(result.proposals[0].write_set.deletes, []);
  assert.equal(result.proposals[0].write_set.updates.some((write) =>
    write.target_table === 'entity_placements'), false);
});

test('temporal interruptions at route start and in flight never authorize the planned destination', () => {
  const routeProfile = structuredClone(profile);
  routeProfile.phases[0].presence_state = 'on_site';
  routeProfile.phases[0].location_ref = 'pf_yard';
  routeProfile.phases[1].presence_state = 'on_site';
  routeProfile.phases[1].location_ref = 'pf_yard';
  routeProfile.phases[1].movement_handoff.destination_location_ref = 'pf_yard';
  routeProfile.phases[2].presence_state = 'on_site';
  routeProfile.phases[2].location_ref = 'pf_yard';

  const atStart = world();
  const startRow = atStart.npc_schedule_runtime[0];
  const startRuntime = createNpcRoutineState({ profile: routeProfile, started_at: at(100) });
  startRow.causal_state_ref.routine_state = startRuntime;
  atStart.npcs[0].machine_state.current_activity = npcRoutineActivity(startRuntime);
  atStart.npcs[0].machine_state.current_activity_ref =
    atStart.npcs[0].machine_state.current_activity.activity_ref;
  atStart.npcs[0].machine_state.routine_danger_blocked = true;
  startRow.npc_snapshot = structuredClone(atStart.npcs[0]);
  const startResult = npcRoutineTemporalRegistration().resolve(
    npcRoutineCandidate(startRow), context(atStart, 'interrupt-at-start'));
  const startTransition = startResult.proposals[0].npc_routine_transition;
  assert.equal(startTransition.interrupted, true);
  assert.equal(startTransition.proposal, null);
  assert.equal(startTransition.after.current_position_node_id, 'work-position');
  assert.equal(startTransition.after.causal_state_ref.routine_state.presence_state,
    'on_site');
  assert.notEqual(startResult.proposals[0].write_set.appends[0].record.trace.location.location_ref,
    'pf_yard');

  const inFlight = world();
  const flightRow = inFlight.npc_schedule_runtime[0];
  const flightRuntime = createNpcRoutineState({ profile: routeProfile, started_at: at(100) });
  flightRow.causal_state_ref.routine_state = flightRuntime;
  inFlight.npcs[0].machine_state.current_activity = npcRoutineActivity(flightRuntime);
  inFlight.npcs[0].machine_state.current_activity_ref =
    inFlight.npcs[0].machine_state.current_activity.activity_ref;
  flightRow.npc_snapshot = structuredClone(inFlight.npcs[0]);
  const started = npcRoutineTemporalRegistration().resolve(npcRoutineCandidate(flightRow),
    context(inFlight, 'route-before-interrupt'));
  const interruptedProjection = structuredClone(started.state_projection);
  interruptedProjection.npcs[0].machine_state.routine_danger_blocked = true;
  const stopped = npcRoutineTemporalRegistration().resolve(started.replacement,
    context(interruptedProjection, 'interrupt-in-flight'));
  const stopTransition = stopped.proposals[0].npc_routine_transition;
  assert.equal(stopTransition.interrupted, true);
  assert.equal(stopTransition.after.current_position_node_id, 'work-position');
  assert.equal(stopTransition.after.causal_state_ref.routine_state.presence_state,
    'on_site');
  assert.notEqual(stopped.proposals[0].write_set.appends[0].record.trace.location.location_ref,
    'pf_yard');
});

test('adjacent handoff with a source away from completed destination is a typed gap', () => {
  const state = world();
  const row = state.npc_schedule_runtime[0];
  const runtime = structuredClone(row.causal_state_ref.routine_state);
  runtime.profile.phases[2].movement_handoff = {
    route_ref: 'yard-route', source_endpoint_ref: 'yard-endpoint',
    destination_endpoint_ref: 'work-endpoint', destination_location_ref: 'pf_work',
    duration_minutes: 480 };
  row.causal_state_ref = { ...row.causal_state_ref, routine_state: runtime };
  const registration = npcRoutineTemporalRegistration();
  const started = registration.resolve(npcRoutineCandidate(row), context(state, 'bad-chain-start'));
  assert.throws(() => registration.resolve(started.replacement,
    context(started.state_projection, 'bad-chain-arrival')),
  (error) => error?.code === 'npc_schedule_gap');
});

test('last completed route cannot authorize an on-site phase at a different place', () => {
  const calendar = testCalendar();
  const cold = structuredClone(profile);
  cold.phases.forEach((phase) => {
    phase.presence_state = 'on_site'; phase.location_ref = 'pf_home';
  });
  cold.phases[1].movement_handoff.destination_location_ref = 'pf_yard';
  cold.phases[2].location_ref = 'pf_yard';
  cold.phases.push({ ...cold.phases[0], state_id: 'return-without-route',
    activity_ref: 'return', location_ref: 'pf_home' });
  const scheduleContext = { home_scope_ref: 'pf_home', subject_kind: 'occupation',
    subject_ref: 'nov_occ_worker', day_type: 'normal', calendar_profile: calendar,
    approved_rule_rows: [scheduleRow('cold', cold),
      scheduleRow('warm', presenceProfile('warm-routine', 'pf_home'))] };
  const selected = selectNpcRoutineSchedule({ schedule_context: scheduleContext,
    scheduled_at: at(100) });
  const runtime = structuredClone(createNpcRoutineState({ profile: cold,
    started_at: at(100), calendar_profile: calendar,
    schedule_context: selected.schedule_context }));
  runtime.presence_state = 'on_site';
  const activity = npcRoutineActivity(runtime);
  const npc = { instance_id: 'worker', machine_state: { status: 'idle',
    current_activity: activity, current_activity_ref: activity.activity_ref } };
  const state = world();
  const row = state.npc_schedule_runtime[0];
  row.causal_state_ref.routine_state = runtime;
  row.npc_snapshot = structuredClone(npc);
  row.route_endpoint_positions['home-endpoint'].position_id = 'yard-position';
  state.npcs = [npc];
  const registration = npcRoutineTemporalRegistration();
  const started = registration.resolve(npcRoutineCandidate(row), context(state, 'to-yard'));
  const arrived = registration.resolve(started.replacement,
    context(started.state_projection, 'arrive-yard'));
  const arrival = arrived.proposals[0].npc_routine_transition;
  assert.equal(arrival.proposal.movement_transition.status, 'completed');
  assert.equal(arrival.after.current_position_node_id, 'yard-position');
  assert.equal(arrival.after.causal_state_ref.routine_state.presence_state, 'on_site');

  const returned = registration.resolve(arrived.replacement,
    context(arrived.state_projection, 'home-without-route'));
  const result = returned.proposals[0].npc_routine_transition;
  assert.equal(result.proposal.movement_transition, null);
  assert.equal(result.after.causal_state_ref.routine_state.presence_state, 'location_gap');
  assert.equal(result.after.current_position_node_id, 'yard-position');
  assert.equal(result.after.npc_placement.position_node_id, 'yard-position');
  assert.deepEqual(returned.proposals[0].write_set.deletes, []);
  assert.equal(returned.proposals[0].write_set.updates.some((write) =>
    write.target_table === 'entity_placements'), false);
});

test('D-1 away intent preserves known placement until departure is completed', () => {
  const calendar = testCalendar();
  const profile = { ...presenceProfile('daily-presence', 'pf_home'), phases: [
    { state_id: 'work', duration_minutes: 60, activity_ref: 'work', summary: 'Работает.',
      activity_status: 'active', runtime_status: 'available', can_continue_automatically: true,
      decision_required: false, presence_state: 'on_site', location_ref: 'pf_home' },
    { state_id: 'away', duration_minutes: 480, activity_ref: 'rest', summary: 'Отдыхает.',
      activity_status: 'active', runtime_status: 'available', can_continue_automatically: true,
      decision_required: false, presence_state: 'away', location_ref: null },
    { state_id: 'return-to-work', duration_minutes: 480, activity_ref: 'work', summary: 'Возвращается к работе.',
      activity_status: 'active', runtime_status: 'available', can_continue_automatically: true,
      decision_required: false, presence_state: 'on_site', location_ref: 'pf_home' }
  ] };
  const scheduleContext = { home_scope_ref: 'pf_home', subject_kind: 'occupation',
    subject_ref: 'nov_occ_worker', day_type: 'normal', calendar_profile: calendar,
    approved_rule_rows: [scheduleRow('cold', profile)],
    selected_rule_ref: { schedule_id: 'schedule-cold', schedule_version: 1,
      world_revision_id: 'world' } };
  const runtime = structuredClone(createNpcRoutineState({ profile, started_at: at(100),
    calendar_profile: calendar, current_activity: { activity_ref: 'work' },
    schedule_context: scheduleContext }));
  runtime.presence_state = 'on_site';
  const activity = npcRoutineActivity(runtime);
  const npc = { instance_id: 'worker', machine_state: { status: 'idle',
    current_activity: activity, current_activity_ref: activity.activity_ref } };
  const state = world();
  const row = { ...state.npc_schedule_runtime[0], causal_state_ref: { routine_state: runtime },
    npc_snapshot: structuredClone(npc) };
  const result = npcRoutineTemporalRegistration().resolve(npcRoutineCandidate(row),
    contextFor({ npcs: [npc], npc_schedule_runtime: [row] }, 'away'));
  const transition = result.proposals[0].npc_routine_transition;
  assert.equal(transition.after.current_position_node_id, row.current_position_node_id);
  assert.equal(transition.after.causal_state_ref.routine_state.presence_state, 'location_gap');
  assert.equal(transition.after.causal_state_ref.routine_state.schedule_gap_reason,
    'npc_location_gap');
  assert.deepEqual(transition.after.npc_placement, row.npc_placement);
  assert.deepEqual(result.proposals[0].write_set.deletes, []);
  assert.equal(result.proposals[0].write_set.updates.some((write) =>
    write.target_table === 'entity_placements'), false);
  assert.equal(result.proposals[0].expected_state_versions.some((entry) =>
    entry.target_table === 'entity_placements'), false);

  const awayRow = transition.after;
  const awayNpc = { ...npc, machine_state: structuredClone(awayRow.npc_snapshot.machine_state) };
  const returnCandidate = npcRoutineCandidate(awayRow);
  const returned = npcRoutineTemporalRegistration().resolve(returnCandidate,
    contextFor({ npcs: [awayNpc], npc_schedule_runtime: [awayRow] }, 'return-without-route'));
  const returnTransition = returned.proposals[0].npc_routine_transition;
  assert.equal(returnTransition.after.causal_state_ref.routine_state.presence_state,
    'on_site');
  assert.equal(returnTransition.after.current_position_node_id, row.current_position_node_id);
  assert.deepEqual(returnTransition.after.npc_placement, row.npc_placement);
  assert.equal(returned.proposals[0].write_set.updates.some((write) =>
    write.target_table === 'entity_placements'), false);
  assert.equal(returned.proposals[0].write_set.deletes.length, 0);
});

test('approved winter ferryman D-1 schedule produces the 1006830 candidate from 1231-12-01', async () => {
  const [calendarRecord] = JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/temporal-v4/datasets/calendar_daylight_light_profiles.json',
    import.meta.url), 'utf8'));
  const calendarProfile = buildCalendarProjectionProfile(calendarRecord);
  const now = at(1006560);
  const projected = projectCalendar(now, calendarProfile);
  assert.deepEqual([projected.year, projected.month, projected.day,
    projected.local_time_of_day.numerator], ['1231', '12', '1', '0']);

  const schedules = JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/m2c-npc-wave/v1/datasets/npc_schedule_routine_rules.json',
    import.meta.url), 'utf8'));
  const d1 = schedules.find((row) => row.schedule_id
    === 'sch_nov_occ_ferryman_pf_ferry_landing_normal_winter' && row.schedule_version === 2);
  assert.ok(d1);
  assert.equal(d1.routine_profile.local_start_minute, 0);
  const routine = createNpcRoutineState({
    profile: d1.routine_profile,
    started_at: now,
    calendar_profile: calendarProfile
  });
  const candidate = npcRoutineCandidate({
    npc_id: 'ferryman', party_id: 'party', state_version: 1,
    causal_state_ref: { routine_state: routine }
  });
  assert.deepEqual(candidate.scheduled_at, at(1006830));
});

function context(projection, id) {
  return contextFor(projection, id);
}
function seasonalRouteStarted({ seamOffset, adjacentMovement = false }) {
  const calendar = testCalendar();
  if (seamOffset) calendar.day_start_rule.local_minute = String(360 + seamOffset);
  const coldProfile = structuredClone(profile);
  if (adjacentMovement) coldProfile.phases[2].movement_handoff = {
    route_ref: 'home-yard', source_endpoint_ref: 'home-endpoint',
    destination_endpoint_ref: 'yard-endpoint', destination_location_ref: 'pf_yard',
    duration_minutes: 480 };
  coldProfile.phases = coldProfile.phases.map((phase) => ({ ...phase,
    presence_state: 'on_site', location_ref: 'pf_home' }));
  const warmProfile = presenceProfile('warm-routine', 'pf_home');
  const work = { activity_ref: 'work', summary: 'Перевозит людей.' };
  const scheduleContext = { home_scope_ref: 'pf_home', subject_kind: 'occupation',
    subject_ref: 'nov_occ_worker', day_type: 'normal', calendar_profile: calendar,
    approved_rule_rows: [scheduleRow('cold', coldProfile),
      scheduleRow('warm', warmProfile)] };
  const initial = selectNpcRoutineSchedule({ schedule_context: scheduleContext,
    scheduled_at: at(42050) });
  const runtime = structuredClone(createNpcRoutineState({ profile: initial.rule.routine_profile,
    started_at: at(42050), current_activity: work,
    calendar_profile: calendar, schedule_context: initial.schedule_context }));
  runtime.presence_state = 'on_site';
  const activity = npcRoutineActivity(runtime);
  const npc = { instance_id: 'worker', machine_state: { status: 'idle',
    current_activity: activity, current_activity_ref: activity.activity_ref } };
  const row = { ...world().npc_schedule_runtime[0], state_version: 1,
    causal_state_ref: { routine_state: runtime }, npc_snapshot: structuredClone(npc) };
  const projection = { npcs: [npc], npc_schedule_runtime: [row] };
  const registration = npcRoutineTemporalRegistration();
  const started = registration.resolve(npcRoutineCandidate(row),
    context(projection, `route-start-${seamOffset}`));
  assert.deepEqual(started.proposals[0].npc_routine_transition.occurred_at, at(42110));
  assert.deepEqual(started.proposals[0].npc_routine_transition.after
    .causal_state_ref.routine_state.movement_execution.started_at, at(42110));
  return { started, registration };
}
function contextFor(projection, id) {
  return { projection, request: { idempotency_context: {
    change_set_id: `change-${id}` } } };
}
function ref(entity_kind, entity_id) { return { entity_kind, entity_id }; }
function bindingAt(location_ref) {
  return { location_ref, binding_ref: { entity_id: `binding-${location_ref}`,
    authoring_version: '1' } };
}
function scheduleRow(season, routine_profile) {
  return { schedule_id: `schedule-${season}`, schedule_version: 1,
    world_revision_id: 'world', scope_kind: 'place_family', scope_ref: 'pf_home',
    subject_kind: 'occupation', subject_ref: 'nov_occ_worker', season,
    months: null, day_type: 'normal', status: 'approved', routine_profile };
}
function presenceProfile(profile_id, location_ref) {
  return { schema: 'npc_routine_profile_v1', profile_id, revision: 1,
    status: 'approved', phases: [
      { state_id: `${profile_id === 'warm-routine' ? 'warm' : 'cold'}-work`,
        duration_minutes: 300, activity_ref: 'work', summary: 'Работает.',
        activity_status: 'active', runtime_status: 'available',
        can_continue_automatically: true, decision_required: false,
        presence_state: 'on_site', location_ref },
      { state_id: 'rest', duration_minutes: 1140, activity_ref: 'rest',
        summary: 'Отдыхает.', activity_status: 'active', runtime_status: 'available',
        can_continue_automatically: true, decision_required: false,
        presence_state: 'on_site', location_ref }
    ] };
}
function testCalendar() {
  return { profile_id: 'npc-calendar', version: '1', status: 'approved',
    provenance: { source_id: 'test', source_version: '1' },
    epoch: { game_timestamp: at(0), year: '1', month: '1', day: '1' },
    calendar_system: 'test', month_rules: { month_lengths: ['30', '30'] },
    leap_rules: { cycle_years: '4', leap_year_indexes: ['3'], leap_month: '2', leap_days: '1' },
    day_start_rule: { local_minute: '360' }, local_offset_rule: { offset_minutes: '0' },
    daypart_rule: { ranges: [{ id: 'night', start_minute: '0', end_minute: '360' },
      { id: 'day', start_minute: '360', end_minute: '1080' },
      { id: 'evening', start_minute: '1080', end_minute: '1440' }] },
    season_rule: { ranges: [{ id: 'cold', start_day: '1', end_day: '30' },
      { id: 'warm', start_day: '31', end_day: '61' }] },
    daylight_rule: { ranges: [{ id: 'dark', start_day: '1', end_day: '30' },
      { id: 'light', start_day: '31', end_day: '61' }] } };
}
