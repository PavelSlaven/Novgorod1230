import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createNpcActorStepCompletionEffect,
  createNpcScheduleDecisionTerminalEffect,
  npcTemporalEffectRegistrations,
  startNpcActorStep
} from '../src/temporal-advance.js';

const at = (minutes) => ({
  whole_minutes: String(minutes),
  subminute_numerator: '0',
  subminute_denominator: '1'
});
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const versioned = (entityKind, entityId) => ({
  entity_ref: ref(entityKind, entityId), authoring_version: '1'
});

test('common NPC owner starts and completes one actor-step lifecycle', () => {
  const started = startNpcActorStep({
    execution: {
      request: { request_id: 'decision-1', committed_state_version: 7 },
      plan: { goal_result: 'pending' },
      operation: {
        op: 'request_activity', actor_ref: 'npc-1',
        activity_kind: 'work', target_refs: ['crate-1']
      },
      working_projection: { marker: 'preserved' }
    },
    started_at: at(25),
    duration_minutes: 5,
    execution_binding_ref: 'execution-1',
    schedule_option_id: 'carry-crate',
    activity_profile_ref: 'activity-1',
    movement_proposal: { owner: '@rus/movement-routes' },
    property_proposal: { owner: '@rus/items-property' }
  });
  const active = started.working_projection.active_npc_actor_step;
  assert.equal(active.status, 'started');
  assert.equal(active.started_at.whole_minutes, '25');
  assert.deepEqual(active.planned_exact_elapsed,
    { exact_minutes: { numerator: '5', denominator: '1' } });
  assert.equal(started.consequence_fragment.owner, '@rus/turn/actor-step');

  const completion = createNpcActorStepCompletionEffect({
    party_ref: ref('party', 'party-1'),
    active_actor_step: active,
    visibility_policy_ref: versioned('visibility_modifier', 'hidden')
  });
  assert.equal(completion.candidate.scheduled_at.whole_minutes, '30');
  const nextCompletion = createNpcActorStepCompletionEffect({
    party_ref: ref('party', 'party-1'),
    active_actor_step: {
      ...active,
      decision_trace_ref: ref('npc_decision_trace', 'decision-2')
    },
    visibility_policy_ref: versioned('visibility_modifier', 'hidden')
  });
  assert.notEqual(completion.candidate.boundary_id,
    nextCompletion.candidate.boundary_id);
  assert.equal(completion.candidate.idempotency_key,
    completion.candidate.boundary_id);
  const registration = npcTemporalEffectRegistrations().find(
    ({ effect_ref: effectRef }) =>
      effectRef.entity_ref.entity_id === 'npc-actor-step-completion'
  );
  const resolved = registration.resolve({
    candidate: completion.candidate,
    context: { projection: started.working_projection },
    descriptor: completion.input
  });

  assert.equal(resolved.state_projection.marker, 'preserved');
  assert.equal(resolved.state_projection.active_npc_actor_step.status,
    'completed');
  assert.equal(resolved.state_projection.active_npc_actor_step
    .completed_at.whole_minutes, '30');
});

test('common NPC temporal owner resolves schedule terminal into one signal',
  () => {
    const registered = createNpcScheduleDecisionTerminalEffect({
      boundary_id: 'npc-waiting:party:npc:terminal',
      scheduled_at: at(25),
      source_ref: ref('party_timed_activity_execution', 'rest-1'),
      scope_ref: ref('party', 'party-1'),
      npc_ref: ref('npc', 'npc-1'),
      schedule_actor_ref: 'schedule-slot-1',
      activity_ref: 'wait-profile-1',
      from_state: 'waiting',
      terminal_state: 'decision_required',
      rule_ref: versioned('action_contract', 'wait-profile-1'),
      policy_ref: versioned('activity_contract', 'schedule-policy-1'),
      visibility_policy_ref: versioned('visibility_modifier', 'hidden'),
      signal: {
        category: 'objective', significance: 'material',
        perceived_change_summary: 'Ожидаемый человек не вернулся.'
      }
    });
    const registration = npcTemporalEffectRegistrations().find(
      ({ effect_ref: effectRef }) =>
        effectRef.entity_ref.entity_id === 'npc-schedule-decision-terminal'
    );
    const resolution = registration.resolve({
      candidate: registered.candidate,
      context: { projection: { npc_activity_states: {
        'schedule-slot-1': {
          activity_ref: 'wait-profile-1', status: 'waiting'
        }
      } } },
      descriptor: registered.input
    });

    assert.equal(resolution.stop_after_current_batch, true);
    assert.equal(resolution.state_projection.npc_activity_states
      ['schedule-slot-1'].status, 'decision_required');
    assert.equal(resolution.state_projection.npc_activity_factual_transitions
      .length, 1);
    const transition = resolution.state_projection
      .npc_activity_factual_transitions[0];
    assert.equal(transition.from, 'waiting');
    assert.equal(transition.to, 'decision_required');
    assert.deepEqual(resolution.state_projection
      .npc_decision_signal_descriptors[0], {
      occurred_at: at(25),
      category: 'objective',
      significance: 'material',
      source_event_ref: ref('npc_activity_factual_transition',
        transition.transition_id),
      subject_ref: ref('npc', 'npc-1'),
      scope_refs: [],
      perception_required: false,
      source_perception_ref: null,
      causal_parent_refs: [ref('temporal_boundary_candidate',
        'npc-waiting:party:npc:terminal')],
      perceived_change_summary: 'Ожидаемый человек не вернулся.'
    });
  });

test('common NPC temporal owner rejects a descriptor detached from candidate',
  () => {
    const registered = createNpcScheduleDecisionTerminalEffect({
      boundary_id: 'npc-waiting:party:npc:terminal',
      scheduled_at: at(25),
      source_ref: ref('party_timed_activity_execution', 'rest-1'),
      scope_ref: ref('party', 'party-1'),
      npc_ref: ref('npc', 'npc-1'),
      schedule_actor_ref: 'schedule-slot-1',
      activity_ref: 'wait-profile-1',
      from_state: 'waiting',
      terminal_state: 'decision_required',
      rule_ref: versioned('action_contract', 'wait-profile-1'),
      policy_ref: versioned('activity_contract', 'schedule-policy-1'),
      visibility_policy_ref: versioned('visibility_modifier', 'hidden'),
      signal: {
        category: 'objective', significance: 'material',
        perceived_change_summary: 'Ожидаемый человек не вернулся.'
      }
    });
    const registration = npcTemporalEffectRegistrations()[0];

    assert.throws(() => registration.resolve({
      candidate: registered.candidate,
      context: { projection: { npc_activity_states: {
        'other-slot': {
          activity_ref: 'wait-profile-1', status: 'waiting'
        }
      } } },
      descriptor: {
        ...registered.input,
        schedule_actor_ref: 'other-slot'
      }
    }), { code: 'npc_schedule_gap' });
  });
