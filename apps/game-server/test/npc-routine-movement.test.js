import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createNpcRoutineState, npcRoutineActivity } from '@rus/npc-runtime';
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
      destination_location_ref: 'home', duration_minutes: 12 } },
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
    npc_snapshot: structuredClone(npc),
    route_endpoint_positions: {
      'work-endpoint': { position_id: 'work-position', status: 'active' },
      'home-endpoint': { position_id: 'home-position', status: 'active' }
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

  const arrived = registration.resolve(started.replacement,
    context(started.state_projection, 'arrival'));
  const arrivalTransition = arrived.proposals[0].npc_routine_transition;
  assert.equal(arrivalTransition.proposal.movement_transition.status, 'completed');
  assert.equal(arrivalTransition.after.current_position_node_id, 'home-position');
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
  return { projection, request: { idempotency_context: {
    change_set_id: `change-${id}` } } };
}
function ref(entity_kind, entity_id) { return { entity_kind, entity_id }; }
