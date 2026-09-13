import test from 'node:test';
import assert from 'node:assert/strict';
import { createNpcRoutineState, proposeNpcRoutineTransition } from '../src/index.js';

const at = (value) => ({ whole_minutes: String(value), subminute_numerator: '0', subminute_denominator: '1' });
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const profile = { schema: 'npc_routine_profile_v1', profile_id: 'shared_work_routine', revision: 1,
  status: 'approved', phases: [
    { state_id: 'work', duration_minutes: 60, activity_ref: 'work', summary: 'Работает.',
      activity_status: 'active', runtime_status: 'available', can_continue_automatically: true, decision_required: false },
    { state_id: 'sleep', duration_minutes: 480, activity_ref: 'sleep', summary: 'Спит.',
      activity_status: 'active', runtime_status: 'sleeping', can_continue_automatically: true, decision_required: false }
  ] };
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
