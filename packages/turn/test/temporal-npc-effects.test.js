import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createNpcScheduleDecisionTerminalEffect,
  npcTemporalEffectRegistrations
} from '../src/temporal-npc-effects.js';

const at = (minutes) => ({
  whole_minutes: String(minutes),
  subminute_numerator: '0',
  subminute_denominator: '1'
});
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const versioned = (entityKind, entityId) => ({
  entity_ref: ref(entityKind, entityId), authoring_version: '1'
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
