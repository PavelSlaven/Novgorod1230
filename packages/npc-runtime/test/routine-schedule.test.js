import test from 'node:test';
import assert from 'node:assert/strict';
import { createNpcRoutineState, proposeNpcRoutineTransition,
  resolveNpcRoutinePresence, selectNpcRoutineSchedule, validateNpcRoutineProfile } from '../src/index.js';

const at = (value) => ({ whole_minutes: String(value), subminute_numerator: '0', subminute_denominator: '1' });
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const profile = { schema: 'npc_routine_profile_v1', profile_id: 'shared_work_routine', revision: 1,
  status: 'approved', phases: [
    { state_id: 'work', duration_minutes: 60, activity_ref: 'work', summary: 'Работает.',
      activity_status: 'active', runtime_status: 'available', can_continue_automatically: true, decision_required: false },
    { state_id: 'sleep', duration_minutes: 480, activity_ref: 'sleep', summary: 'Спит.',
      activity_status: 'active', runtime_status: 'sleeping', can_continue_automatically: true,
      decision_required: false, movement_handoff: { route_ref: 'home-yard',
        source_endpoint_ref: 'home-endpoint', destination_endpoint_ref: 'yard-endpoint',
        destination_location_ref: 'yard', duration_minutes: 480 } }
  ] };
const calendarProfile = {
  profile_id: 'two-month-test-calendar', version: '1', status: 'approved',
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
    { id: 'light', start_day: '31', end_day: '61' }] }
};
function scheduleRow(overrides = {}) {
  return { schedule_id: 'winter-home', schedule_version: 1,
    world_revision_id: 'world-r1', scope_kind: 'place_family',
    scope_ref: 'pf_home', subject_kind: 'occupation', subject_ref: 'nov_occ_worker',
    season: 'warm', months: [2], day_type: 'normal', status: 'approved',
    routine_profile: profile, ...overrides };
}
function scheduleContext(rows = [scheduleRow()]) {
  return { home_scope_ref: 'pf_home', subject_kind: 'occupation',
    subject_ref: 'nov_occ_worker', day_type: 'normal', approved_rule_rows: rows,
    calendar_profile: calendarProfile,
    selected_rule_ref: { schedule_id: 'winter-home', schedule_version: 1,
      world_revision_id: 'world-r1' } };
}
function input(npcId = 'unseen_carpenter') {
  return { runtime: createNpcRoutineState({ profile, started_at: at(100),
    current_activity: { activity_ref: 'work' } }), scheduled_at: at(160),
    npc_state: { npc_ref: ref('npc', npcId), state_version: '1',
      current_activity_execution_ref: null, placement_ref: ref('entity_placement', `position:${npcId}`),
      attention_state_ref: ref('condition_set', `attention:${npcId}`),
      body_state_ref: ref('body_state', `body:${npcId}`), knowledge_state_ref: ref('knowledge_fact', `knowledge:${npcId}`),
      relationship_state_ref: ref('condition_set', `relations:${npcId}`) },
    recheck_snapshot: { observed_state_version: '1', placement_ref: ref('entity_placement', `position:${npcId}`),
      access_ok: true, orders_ok: true, danger_ok: true, body_ok: true, activity_ok: true } };
}
test('shared routine has exact finite boundaries and changes causal activity for unseen NPCs', () => {
  for (const npc of ['unseen_carpenter', 'unseen_potter']) {
    const value = input(npc);
    assert.throws(() => proposeNpcRoutineTransition({ ...value, scheduled_at: at(159) }), /temporal_candidate_stale/);
    const result = proposeNpcRoutineTransition(value);
    assert.equal(result.ok, true);
    assert.equal(result.activity_after.activity_ref, 'sleep');
    assert.equal(result.runtime_after.runtime_status, 'sleeping');
    assert.deepEqual(result.runtime_after.next_transition_at, at(640));
    assert.equal(result.factual_transition.decision_required, false);
    assert.deepEqual(proposeNpcRoutineTransition(value), result);
  }
});
test('injured or interrupted routine never restarts automatically; exact rechecks remain owned', () => {
  const value = input();
  assert.equal(createNpcRoutineState({ profile, started_at: at(100), interrupted: true }).next_transition_at, null);
  assert.equal(proposeNpcRoutineTransition({ ...value,
    recheck_snapshot: { ...value.recheck_snapshot, body_ok: false } }).error.code, 'activity_precondition_stale');
});
test('approved profile marks a semantic handoff without enumerating decisions', () => {
  const value = input();
  const changed = structuredClone(profile);
  changed.phases[1].decision_required = true;
  value.runtime = createNpcRoutineState({ profile: changed, started_at: at(100) });
  assert.equal(proposeNpcRoutineTransition(value).factual_transition.decision_required, true);
});

test('factual activity refs and summary preserve the individual duty across a full routine', () => {
  const value = input();
  const work = { activity_ref: 'repair_unseen_basket', summary: 'Чинит старую корзину.' };
  value.runtime = createNpcRoutineState({ profile, started_at: at(100), current_activity: work });
  const resting = proposeNpcRoutineTransition(value);
  assert.equal(resting.factual_transition.from_activity_ref, work.activity_ref);
  const resumed = proposeNpcRoutineTransition({ ...value, runtime: resting.runtime_after, scheduled_at: at(640) });
  assert.equal(resumed.factual_transition.from_activity_ref, resting.activity_after.activity_ref);
  assert.equal(resumed.factual_transition.to_activity_ref, resumed.activity_after.activity_ref);
  assert.equal(resumed.factual_transition.summary, work.summary);
  assert.equal(resumed.activity_after.summary, work.summary);
});

test('routine movement is a started interval before its completion', () => {
  const movingProfile = structuredClone(profile);
  movingProfile.phases[1] = { ...movingProfile.phases[1],
    duration_minutes: 12, activity_ref: 'walk-home', runtime_status: 'unavailable',
    movement_handoff: { route_ref: 'route-work-home',
      source_endpoint_ref: 'work-endpoint',
      destination_endpoint_ref: 'home-endpoint',
      destination_location_ref: 'home', duration_minutes: 12 } };
  const value = input();
  value.runtime = createNpcRoutineState({ profile: movingProfile,
    started_at: at(100), current_activity: { activity_ref: 'work' } });
  const started = proposeNpcRoutineTransition({ ...value, runtime: value.runtime,
    scheduled_at: at(160) });
  assert.equal(started.movement_transition.status, 'started');
  assert.equal(started.runtime_after.movement_execution.route_ref,
    'route-work-home');
  const arrived = proposeNpcRoutineTransition({ ...value,
    runtime: started.runtime_after, scheduled_at: at(172) });
  assert.equal(arrived.movement_transition.status, 'completed');
  assert.equal(arrived.runtime_after.movement_execution, null);
});

test('adjacent movement completion keeps next handoff active in the same after-state', () => {
  const movingProfile = structuredClone(profile);
  movingProfile.phases[0].duration_minutes = 60;
  const finalPhase = structuredClone(movingProfile.phases[1]);
  movingProfile.phases[1] = { ...movingProfile.phases[1], state_id: 'walk-home',
    duration_minutes: 12,
    activity_ref: 'walk-home', runtime_status: 'unavailable',
    movement_handoff: { route_ref: 'work-home', source_endpoint_ref: 'work-endpoint',
      destination_endpoint_ref: 'home-endpoint', destination_location_ref: 'home',
      duration_minutes: 12 } };
  movingProfile.phases.push({ ...finalPhase, movement_handoff: {
    route_ref: 'home-yard', source_endpoint_ref: 'home-endpoint',
    destination_endpoint_ref: 'yard-endpoint', destination_location_ref: 'yard',
    duration_minutes: 480 } });
  const value = input();
  value.runtime = createNpcRoutineState({ profile: movingProfile, started_at: at(100),
    current_activity: { activity_ref: 'work' } });
  const started = proposeNpcRoutineTransition({ ...value,
    scheduled_at: at(160) });
  const arrived = proposeNpcRoutineTransition({ ...value, runtime: started.runtime_after,
    scheduled_at: at(172), next_movement_authorized: true });
  assert.equal(arrived.movement_transition.status, 'completed');
  assert.equal(arrived.movement_transition.route_ref, 'work-home');
  assert.equal(arrived.runtime_after.movement_execution.route_ref, 'home-yard');
  assert.deepEqual(arrived.runtime_after.movement_execution.started_at, at(172));
});

test('D-1 selector uses exact calendar season, month, scope, subject and day type', () => {
  const context = scheduleContext([
    scheduleRow(),
    scheduleRow({ schedule_id: 'wrong-scope', scope_ref: 'pf_elsewhere' }),
    scheduleRow({ schedule_id: 'wrong-subject', subject_ref: 'nov_occ_other' }),
    scheduleRow({ schedule_id: 'wrong-day', day_type: 'feast' }),
    scheduleRow({ schedule_id: 'wrong-month', months: [1] })
  ]);
  const selected = selectNpcRoutineSchedule({ schedule_context: context,
    scheduled_at: at(42180) });
  assert.equal(selected.rule.schedule_id, 'winter-home');
  assert.equal(selected.season, 'warm');
  assert.equal(selected.month, 2);
  assert.deepEqual(selected.selected_rule_ref, context.selected_rule_ref);
  assert.ok(Object.isFrozen(selected));
  assert.ok(Object.isFrozen(selected.schedule_context.approved_rule_rows[0]));
  assert.throws(() => selectNpcRoutineSchedule({ schedule_context: context,
    scheduled_at: at(0) }), (error) => error?.code === 'npc_schedule_gap');
});

test('D-1 selector chooses and pins the initial applicable rule without a preselected ref', () => {
  const { selected_rule_ref, ...context } = scheduleContext();
  const selected = selectNpcRoutineSchedule({ schedule_context: context,
    scheduled_at: at(42180) });
  assert.equal(selected.rule.schedule_id, 'winter-home');
  assert.deepEqual(selected.schedule_context.selected_rule_ref, selected.selected_rule_ref);
});

test('D-1 selector fails closed for missing or ambiguous exact rules', () => {
  const row = scheduleRow();
  assert.throws(() => selectNpcRoutineSchedule({ schedule_context: scheduleContext([
    { ...row, months: [1] }
  ]), scheduled_at: at(42180) }), (error) => error?.code === 'npc_schedule_gap');
  assert.throws(() => selectNpcRoutineSchedule({ schedule_context: scheduleContext([
    row, { ...row, schedule_id: 'duplicate' }
  ]), scheduled_at: at(42180) }), (error) => error?.code === 'npc_schedule_gap');
});

test('routine persists frozen D-1 context and accepts legacy profiles without presence fields', () => {
  const context = scheduleContext();
  const runtime = createNpcRoutineState({ profile, started_at: at(42180),
    schedule_context: context });
  assert.deepEqual(runtime.schedule_context, context);
  assert.ok(Object.isFrozen(runtime.schedule_context));
  assert.ok(Object.isFrozen(runtime.schedule_context.approved_rule_rows));
  assert.equal(validateNpcRoutineProfile(profile), profile);
});

test('D-1 phase presence requires a valid on-site location or explicit away state', () => {
  const valid = structuredClone(profile);
  valid.phases[0].presence_state = 'on_site';
  valid.phases[0].location_ref = 'pf_home';
  assert.equal(validateNpcRoutineProfile(valid), valid);
  for (const invalidPresence of [
    { presence_state: 'on_site' },
    { presence_state: 'on_site', location_ref: null },
    { presence_state: 'away', location_ref: 'pf_home' },
    { presence_state: 'unknown', location_ref: null }
  ]) {
    const invalid = structuredClone(profile);
    Object.assign(invalid.phases[0], invalidPresence);
    assert.throws(() => validateNpcRoutineProfile(invalid),
      (error) => error?.code === 'npc_schedule_gap');
  }
});

test('presence policy turns winter absence without a D-1 row into a typed location gap', () => {
  const context = { ...scheduleContext([]), scheduled_absences: [{
    subject_kind: 'occupation', subject_ref: 'nov_occ_worker', seasons: ['cold'],
    location_ref: 'pf_winter_work'
  }] };
  const result = resolveNpcRoutinePresence({ schedule_context: context,
    scheduled_at: at(0), allow_home_baseline: true,
    facts: { first_entry_binding: binding('pf_home') } });
  assert.deepEqual(result, { presence_state: 'location_gap',
    location_ref: null, gap_reason: 'npc_location_gap' });
  assert.ok(Object.isFrozen(result));
});

test('presence policy allows summer home baseline when no seasonal absence applies', () => {
  const context = { ...scheduleContext([]), scheduled_absences: [{
    subject_kind: 'occupation', subject_ref: 'nov_occ_worker', seasons: ['cold'],
    location_ref: 'pf_winter_work'
  }] };
  assert.deepEqual(resolveNpcRoutinePresence({ schedule_context: context,
    scheduled_at: at(42180), allow_home_baseline: true,
    facts: { first_entry_binding: binding('pf_home') } }), {
    presence_state: 'on_site', location_ref: 'pf_home'
  });
});

test('presence policy uses intent only when current approved facts authorize its location', () => {
  const context = scheduleContext();
  assert.deepEqual(resolveNpcRoutinePresence({ intent: { presence_state: 'away',
    location_ref: null }, schedule_context: context }), {
    presence_state: 'offstage_away', location_ref: null
  });
  assert.deepEqual(resolveNpcRoutinePresence({ intent: { presence_state: 'away',
    location_ref: null }, schedule_context: context,
  facts: { current_position_node_id: 'known-position', has_placement: true } }), {
    presence_state: 'location_gap', location_ref: null,
    gap_reason: 'npc_location_gap'
  });
  assert.deepEqual(resolveNpcRoutinePresence({ intent: { presence_state: 'on_site',
    location_ref: 'pf_home' }, schedule_context: context,
  facts: { first_entry_binding: binding('pf_home') } }), {
    presence_state: 'on_site', location_ref: 'pf_home'
  });
  assert.deepEqual(resolveNpcRoutinePresence({ intent: { presence_state: 'on_site',
    location_ref: 'pf_winter_work' }, schedule_context: context,
  }), { presence_state: 'location_gap', location_ref: null,
    gap_reason: 'npc_location_gap' });
  assert.deepEqual(resolveNpcRoutinePresence({ intent: { presence_state: 'on_site',
    location_ref: 'pf_winter_work' }, schedule_context: context,
  facts: { first_entry_binding: binding('pf_winter_work') } }), {
    presence_state: 'on_site', location_ref: 'pf_winter_work'
  });
});

test('presence policy treats absent, mismatched and ambiguous bindings as a typed gap', () => {
  const intent = { presence_state: 'on_site', location_ref: 'pf_home' };
  for (const bindings of [[], [binding('pf_yard')],
    [binding('pf_home'), binding('pf_yard')]]) {
    assert.deepEqual(resolveNpcRoutinePresence({ intent, schedule_context: scheduleContext(),
      scheduled_at: at(0), facts: { current_position_node_id: 'position',
        approved_location_bindings: bindings } }), {
      presence_state: 'location_gap', location_ref: null,
      gap_reason: 'npc_location_gap'
    });
  }
});

test('presence policy keeps the factual source while an active next movement is pending', () => {
  assert.deepEqual(resolveNpcRoutinePresence({ intent: { presence_state: 'on_site',
    location_ref: 'pf_yard' }, schedule_context: scheduleContext(), scheduled_at: at(172),
  facts: { current_position_node_id: 'home-node',
    last_completed_movement: { destination_position_node_id: 'home-node',
      destination_location_ref: 'pf_home' },
    active_movement_execution: { status: 'active',
      destination_endpoint_ref: 'yard-endpoint' } } }), {
    presence_state: 'on_site', location_ref: 'pf_home'
  });
});

test('legacy deferred prepared scene remains on-site without creating a position', () => {
  assert.deepEqual(resolveNpcRoutinePresence({ deferred_placement: {
    kind: 'prepared_scene', snapshot_id: 'preparation:party:first-entry',
    member_ordinal: 0 }, facts: {} }), {
    presence_state: 'on_site', location_ref: null });
  assert.equal(resolveNpcRoutinePresence({ deferred_placement: {
    kind: 'prepared_scene', snapshot_id: 'missing-member', member_ordinal: -1
  } }).presence_state, 'location_gap');
});

function binding(location_ref) {
  return { position_node_id: 'position', location_ref,
    binding_ref: { entity_id: `endpoint-${location_ref}`,
      authoring_version: '1' } };
}
