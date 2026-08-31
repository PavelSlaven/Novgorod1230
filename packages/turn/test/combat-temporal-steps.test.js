import assert from 'node:assert/strict';
import test from 'node:test';
import { orderCombatTechnicalSteps, prepareCombatExchange } from
  '../src/index.js';
import { advanceCombatStepProgressForSlice } from
  '../src/combat-temporal-steps.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const at = { whole_minutes: '1', subminute_numerator: '0',
  subminute_denominator: '1' };

test('heterogeneous combat steps stop at the earliest temporal boundary',
  async () => {
    const escaping = ref('npc', 'escape');
    const attacker = ref('npc', 'attack');
    const escapeIntent = intent(escaping, attacker, 'break_contact');
    escapeIntent.destination_ref = ref('location_anchor', 'safe-exit');
    const attackIntent = intent(attacker, escaping, 'engage');
    const session = combatSession(escaping, attacker, escapeIntent,
      attackIntent);
    const positionCalls = [], itemCalls = [];
    const result = await prepareCombatExchange({ session, working_state: {},
      occurred_at: at, idempotency_key: 'heterogeneous-boundary',
      random_source: { next: () => 0.99 },
      ports: ports(positionCalls, itemCalls) });
    assert.equal(result.prepared.exact_duration.exact_minutes.numerator, '2');
    assert.deepEqual(itemCalls, ['attack']);
    assert.deepEqual(positionCalls, [
      { actor: 'attack', completion_due: true, elapsed: '2' },
      { actor: 'escape', completion_due: false, elapsed: '2' }
    ]);
    assert.deepEqual(result.prepared.exchange.technical_steps.map(
      ({ actor_ref: actor }) => actor.entity_id), ['attack']);
    const progress = result.prepared.working_state_after
      .active_combat_step_progress[0];
    assert.equal(progress.actor_ref.entity_id, 'escape');
    assert.equal(progress.elapsed_duration.exact_minutes.numerator, '2');
    assert.equal(Object.hasOwn(result.prepared.item_transitions[0],
      'working_state'), false);
    assert.equal(Object.hasOwn(result.prepared.position_transitions[0],
      'working_state'), false);
  });

test('a due effect invalidates pending movement before its owner persists it',
  async () => {
    const escaping = ref('npc', 'escape');
    const attacker = ref('npc', 'attack');
    const third = ref('npc', 'third');
    const escapeIntent = intent(escaping, attacker, 'break_contact');
    escapeIntent.destination_ref = ref('location_anchor', 'safe-exit');
    const attackIntent = intent(attacker, escaping, 'engage');
    const thirdIntent = intent(third, attacker, 'engage');
    const session = { ...combatSession(escaping, attacker, escapeIntent,
      attackIntent), participant_refs: [escaping, attacker, third],
    participant_states: [
      { actor_ref: escaping, combat_status: 'active',
        current_intent: escapeIntent, next_action_boundary_ref: null },
      { actor_ref: attacker, combat_status: 'active',
        current_intent: attackIntent, next_action_boundary_ref: null },
      { actor_ref: third, combat_status: 'active',
        current_intent: thirdIntent, next_action_boundary_ref: null }] };
    const continuation = [];
    const configured = ports([], []);
    configured.resolveExecutionProfile = ({ intent: current }) => ({
      preconditions_digest: current.intent_id,
      check_request: current.intent_kind === 'engage'
        ? { target_defense: 1, attribute_value: 20, skill_bonus: 0,
          weapon_danger: 10, target_protection: 0,
          target_vulnerability: 0 } : null });
    configured.applyPositionTransitions = ({ step, working_state,
      temporal_slice: slice }) => {
      if (step.actor_ref.entity_id === 'escape') {
        continuation.push(slice.continuation_allowed);
      }
      return { working_state };
    };
    const actor_states = Object.fromEntries([escaping, attacker, third].map(
      (actor) => [`npc:${actor.entity_id}`, { body_state: { health:
        actor.entity_id === 'escape' ? 1 : 100, active_conditions: [],
      body_parts: {} } }]));
    const result = await prepareCombatExchange({ session,
      working_state: { actor_states }, occurred_at: at,
      idempotency_key: 'movement-invalidated-at-boundary',
      random_source: { next: () => 0.99 }, ports: configured });
    assert.deepEqual(continuation, [false]);
    assert.equal(result.prepared.session_after.participant_states[0]
      .combat_status, 'incapacitated');
    assert.notEqual(result.prepared.session_after.status, 'ended');
  });

test('an external boundary invalidates pending movement without aborting',
  async () => {
    const escaping = ref('npc', 'escape');
    const opponent = ref('npc', 'opponent');
    const escapeIntent = intent(escaping, opponent, 'break_contact');
    escapeIntent.destination_ref = ref('location_anchor', 'safe-exit');
    const session = combatSession(escaping, opponent, escapeIntent,
      null);
    const continuation = [];
    const configured = ports([], []);
    configured.resolveExecutionProfile = ({ intent: current,
      working_state: working }) => ({
      applicable: current.intent_kind !== 'break_contact'
        || working.route_open !== false,
      preconditions_digest: current.intent_id, check_request: null,
      position_plan: current.intent_kind === 'break_contact'
        ? { movement_ref: 'escape-route' } : null });
    configured.advanceTemporalSlice = ({ working_state: working, steps,
      step_timings: timings }) => {
      const elapsed = { exact_minutes: { numerator: '1', denominator: '1' } };
      const progressed = advanceCombatStepProgressForSlice(working, steps,
        timings, elapsed);
      return { working_state: { ...progressed, route_open: false },
        exact_duration: elapsed, temporal_advance_results: [] };
    };
    configured.applyPositionTransitions = ({ step, working_state,
      temporal_slice: slice }) => {
      if (step.actor_ref.entity_id === 'escape') {
        continuation.push(slice.continuation_allowed);
      }
      return { working_state };
    };
    const result = await prepareCombatExchange({ session,
      working_state: {}, occurred_at: at,
      idempotency_key: 'external-movement-invalidation',
      random_source: { next: () => 0.5 }, ports: configured });
    assert.deepEqual(continuation, [false]);
    assert.equal(result.prepared.outcome_events.some(
      ({ event_kind: kind }) => kind === 'combat_step_blocked'), true);
    assert.equal(result.prepared.session_after.participant_states[0]
      .current_intent.status, 'invalidated');
  });

function ports(positionCalls, itemCalls) {
  return {
    resolveCombatTiming: ({ technical_step: step }) => ({ occurred_at: at,
      exact_duration: { exact_minutes: { numerator:
        step.actor_ref.entity_id === 'escape' ? '12' : '2',
      denominator: '1' } }, timing_profile_ref: `time-${step.step_kind}` }),
    resolveExecutionProfile: ({ intent: current }) => ({
      preconditions_digest: current.intent_id,
      check_request: current.intent_kind === 'engage'
        ? { target_defense: 1, attribute_value: 20, skill_bonus: 0,
          weapon_danger: 0, target_protection: 0,
          target_vulnerability: 0 } : null }),
    orderTechnicalSteps: (input) => orderCombatTechnicalSteps(input),
    applyItemTransitions: ({ step, working_state }) => {
      itemCalls.push(step.actor_ref.entity_id);
      return { working_state };
    },
    applyPositionTransitions: ({ step, working_state, temporal_slice: slice }) => {
      positionCalls.push({ actor: step.actor_ref.entity_id,
        completion_due: slice.completion_due,
        elapsed: slice.exact_duration.exact_minutes.numerator });
      return { working_state };
    },
    resolvePerceptionAndDecisionContexts: async ({ session, working_state }) =>
      ({ session_after: session, working_state, signal_records: [] })
  };
}

function intent(actor, target, kind) {
  return { schema: 'combat_intent_v1', intent_id: `intent-${actor.entity_id}`,
    combat_id: 'combat-temporal', actor_ref: actor, intent_kind: kind,
    target_refs: kind === 'engage' ? [target] : [], protected_refs: [],
    scope_ref: null, destination_ref: null, force_limit: 'ordinary',
    risk_posture: 'ordinary', persistence: 'until_decision_boundary',
    created_from_boundary_ref: ref('npc_decision_boundary',
      `boundary-${actor.entity_id}`), state_version: '1', status: 'active' };
}

function combatSession(first, second, firstIntent, secondIntent) {
  return { schema: 'combat_session_v1', combat_id: 'combat-temporal',
    state_version: '1', status: 'active', started_at: at,
    scope_ref: ref('location', 'place'), participant_refs: [first, second],
    participant_states: [
      { actor_ref: first, combat_status: 'active',
        current_intent: firstIntent, next_action_boundary_ref: null },
      { actor_ref: second, combat_status: 'active',
        current_intent: secondIntent, next_action_boundary_ref: null }
    ], exchange_ordinal: 0, last_exchange_ref: null,
    player_response_required: false, last_change_set_ref: null };
}
