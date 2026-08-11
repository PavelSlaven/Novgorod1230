import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCombatInitializationDecisionContexts,
  createCombatSession,
  executeCombatExchange,
  initializeCombatSession,
  installCombatIntent,
  orderCombatTechnicalSteps,
  prepareCombatExchange,
  resolveCombatExchangeTiming
} from '../src/index.js';
import { buildNpcDecisionBoundary } from '@rus/npc-runtime';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const at = { whole_minutes: '1', subminute_numerator: '0', subminute_denominator: '1' };
const makeIntent = (actor, target, kind = 'engage') => ({
  schema: 'combat_intent_v1', intent_id: `intent-${actor.entity_id}`,
  combat_id: 'combat-1', actor_ref: actor, intent_kind: kind,
  target_refs: kind === 'control' || kind === 'engage' ? [target] : [],
  protected_refs: [], scope_ref: null, destination_ref: null,
  force_limit: 'ordinary', risk_posture: 'ordinary',
  persistence: 'until_decision_boundary',
  created_from_boundary_ref: ref('npc_decision_boundary', `boundary-${actor.entity_id}`),
  state_version: '1', status: 'active'
});
const session = (intent = null) => ({
  schema: 'combat_session_v1', combat_id: 'combat-1', state_version: '1',
  status: 'active', started_at: at, scope_ref: ref('location', 'place-1'),
  participant_refs: [ref('npc', 'npc-1'), ref('player_character', 'player-1')],
  participant_states: [
    { actor_ref: ref('npc', 'npc-1'), combat_status: 'active', current_intent: intent, next_action_boundary_ref: null },
    { actor_ref: ref('player_character', 'player-1'), combat_status: 'active', current_intent: null, next_action_boundary_ref: null }
  ], exchange_ordinal: 0, last_exchange_ref: null,
  player_response_required: false, last_change_set_ref: null
});

test('common combat timing owner resolves approved exact profile time', () => {
  const timing = resolveCombatExchangeTiming({
    requested_at: at,
    timing_profile: {
      profile_id: 'combat-exchange-2m',
      status: 'approved',
      duration_minutes: 2
    }
  });
  assert.deepEqual(timing, {
    occurred_at: at,
    exact_duration: {
      exact_minutes: { numerator: '2', denominator: '1' }
    },
    timing_profile_ref: 'combat-exchange-2m'
  });
  assert.throws(() => resolveCombatExchangeTiming({
    requested_at: at,
    timing_profile: {
      profile_id: 'combat-exchange-2m',
      status: 'proposed',
      duration_minutes: 2
    }
  }), { code: 'TURN_COMBAT_TIMING_PROFILE_INVALID' });
});

test('common combat ordering follows the persisted participant order, not actor ids', () => {
  const first = ref('npc', 'z-last-lexically');
  const second = ref('npc', 'a-first-lexically');
  const orderedSession = {
    ...session(),
    participant_refs: [first, second],
    participant_states: [first, second].map((actor_ref) => ({
      actor_ref,
      combat_status: 'active',
      current_intent: null,
      next_action_boundary_ref: null
    }))
  };
  const proposals = [second, first].map((actor_ref) => ({
    proposal_id: `step-${actor_ref.entity_id}`,
    actor_ref,
    intent_ref: ref('combat_intent', `intent-${actor_ref.entity_id}`),
    preconditions_digest: `precondition-${actor_ref.entity_id}`,
    idempotency_key: `step-${actor_ref.entity_id}`
  }));
  assert.deepEqual(orderCombatTechnicalSteps({
    session: orderedSession,
    proposals
  }).map(({ actor_ref: actor }) => actor.entity_id), [
    first.entity_id,
    second.entity_id
  ]);
});

test('common session initializer creates only the paused decision lifecycle DTO', () => {
  const created = createCombatSession({ combat_id: 'combat-1', started_at: at,
    scope_ref: ref('location', 'place-1'),
    participant_refs: [ref('npc', 'npc-1'), ref('player_character', 'player-1')] });
  assert.equal(created.status, 'paused_for_decisions');
  assert.equal(created.participant_states.every((entry) => entry.current_intent === null), true);
});

test('only an active combat intent can replace the participant current intent', () => {
  const active = makeIntent(ref('npc', 'npc-1'),
    ref('player_character', 'player-1'));
  assert.equal(installCombatIntent(session(), active)
    .participant_states[0].current_intent.status, 'active');
  assert.throws(() => installCombatIntent(session(), {
    ...active, status: 'invalidated'
  }), ({ code }) => code === 'TURN_COMBAT_INTENT_INVALID');
});

test('combat initialization builds deterministic per-NPC contexts from one factual batch', () => {
  const common = {
    schema: 'combat_session_v1', combat_id: 'combat-1', state_version: '1', status: 'paused_for_decisions',
    started_at: at, scope_ref: ref('location', 'place-1'),
    participant_refs: [ref('npc', 'npc-1'), ref('npc', 'npc-2')],
    participant_states: [
      { actor_ref: ref('npc', 'npc-1'), combat_status: 'active', current_intent: null, next_action_boundary_ref: null },
      { actor_ref: ref('npc', 'npc-2'), combat_status: 'active', current_intent: null, next_action_boundary_ref: null }
    ], exchange_ordinal: 0, last_exchange_ref: null, player_response_required: false, last_change_set_ref: null
  };
  const contexts = buildCombatInitializationDecisionContexts({
    session: common, same_time_batch_ref: ref('temporal_batch', 'batch-1'), party_id: 'party-1', root_turn_id: 'turn-1', decided_at: at,
    signal_descriptors: [
      { occurred_at: at, category: 'self', significance: 'material', source_event_ref: ref('combat_event', 'a'), subject_ref: ref('npc', 'npc-2'), perceived_change_summary: 'Second NPC sees a drawn blade.' },
      { occurred_at: at, category: 'self', significance: 'material', source_event_ref: ref('combat_event', 'b'), subject_ref: ref('npc', 'npc-1'), perceived_change_summary: 'First NPC hears a threat.' }
    ],
    npc_contexts: ['npc-2', 'npc-1'].map((id) => ({
      npc_ref: ref('npc', id), state_version: '1', npc_subjective_state: { id },
      perceived_combat_state: { id }, relevant_memory: [], operation_contract: {}
    }))
  });
  assert.deepEqual(contexts.map((entry) => entry.request.npc_ref.entity_id), ['npc-1', 'npc-2']);
  assert.deepEqual(contexts.map((entry) => entry.request.decision_reasons.perceived_changes[0]), ['First NPC hears a threat.', 'Second NPC sees a drawn blade.']);
});

test('combat exchange replays before any RNG or commit', async () => {
  let committed = 0;
  const result = await executeCombatExchange({
    session: session(), idempotency_key: 'exchange-1',
    ports: {
      loadCommittedExchange: async () => ({ exchange_id: 'existing' }),
      commitExchange: async () => { committed += 1; }
    }
  });
  assert.equal(result.status, 'replayed');
  assert.equal(committed, 0);
});

test('combat initialization collects every NPC plan before installing intents', async () => {
  const paused = { ...session(), status: 'paused_for_decisions' };
  const contexts = ['npc-1'].map((id) => {
    const boundary = buildNpcDecisionBoundary({ decision_mode: 'combat', decision_context_id: 'combat-x', npc_ref: ref('npc', id), same_time_batch_ref: ref('temporal_batch', 'batch'), significance: 'material', categories: ['self'], signal_refs: [ref('npc_decision_signal', id)], state_version: '1', scheduled_at: at });
    const request = { schema: 'npc_combat_decision_request_v1', request_id: `request-${id}`, boundary_id: boundary.boundary_id, state_version: '1', combat_id: 'combat-1', exchange_ordinal: 0, decided_at: at, npc_ref: ref('npc', id), decision_reasons: { significance: 'material', categories: ['self'], signal_refs: [ref('npc_decision_signal', id)], perceived_changes: ['armed'] }, current_intent: null, npc_subjective_state: {}, perceived_combat_state: {}, relevant_memory: [], operation_contract: {} };
    return { boundary, request, ordered_signals: [], semantic_model: async () => ({ schema: 'npc_combat_intent_plan_v1', request_id: request.request_id, boundary_id: request.boundary_id, state_version: '1', combat_id: 'combat-1', npc_ref: ref('npc', id), decision: { intent_summary: 'Defend against the immediate threat.', grounded_goal: 'Keep the attacker at a distance.', adaptation: 'literal' }, operation: { op: 'set_combat_intent', intent_kind: 'engage', target_refs: [ref('player_character', 'player-1')], protected_refs: [], scope_ref: null, destination_ref: null, force_limit: 'ordinary', risk_posture: 'ordinary' }, combat_statement: null, reason: 'defend' }), revalidate_state_version: async () => 1 };
  });
  const result = await initializeCombatSession({ session: paused, decision_contexts: contexts });
  assert.equal(result.session.status, 'paused_for_player');
  assert.equal(result.session.participant_states[0].current_intent.intent_kind, 'engage');
});

test('checked control has no combat harm or body transition', async () => {
  const control = makeIntent(ref('npc', 'npc-1'), ref('player_character', 'player-1'), 'control');
  const result = await prepareCombatExchange({
    session: session(control), working_state: { actor_states: { 'player_character\u0000player-1': { body_state: { health: 100, satiety: 100, energy: 100 } } } },
    occurred_at: at, idempotency_key: 'control-1', random_source: { next: () => 0.99 },
    ports: {
      resolveCombatTiming: () => ({ occurred_at: at, exact_duration: {
        exact_minutes: { numerator: '1', denominator: '1' } } }),
      resolveExecutionProfile: () => ({ preconditions_digest: 'control', check_request: { target_defense: 10, attribute_value: 10, skill_bonus: 0 } }),
      orderTechnicalSteps: ({ proposals }) => proposals,
      applyItemTransitions: ({ working_state }) => ({ working_state }),
      applyPositionTransitions: ({ working_state }) => ({ working_state }),
      resolvePerceptionAndDecisionContexts: async ({ working_state }) => ({ working_state, signal_records: [] })
    }
  });
  assert.equal(result.prepared.check_results.length, 1);
  assert.equal(result.prepared.technical_step_timings.length, 1);
  assert.deepEqual(result.prepared.harm_packages, []);
  assert.deepEqual(result.prepared.body_transitions, []);
});

test('blocked intent emits an objective boundary without choosing a replacement',
  async () => {
    const intent = makeIntent(ref('npc', 'npc-1'),
      ref('player_character', 'player-1'));
    let observed = null;
    const result = await prepareCombatExchange({
      session: session(intent), working_state: {}, occurred_at: at,
      idempotency_key: 'blocked-intent',
      random_source: { next: () => { throw new Error('RNG_NOT_EXPECTED'); } },
      ports: {
        resolveCombatTiming: () => ({ occurred_at: at,
          exact_duration: { exact_minutes: {
            numerator: '1', denominator: '1' } } }),
        resolveExecutionProfile: () => ({ applicable: false }),
        orderTechnicalSteps: ({ session: current, proposals }) =>
          orderCombatTechnicalSteps({ session: current, proposals }),
        applyItemTransitions: () => assert.fail('blocked step must not run'),
        applyPositionTransitions: () => assert.fail('blocked step must not run'),
        resolvePerceptionAndDecisionContexts: async (input) => {
          observed = input;
          return { session_after: input.session,
            working_state: input.working_state, signal_records: [] };
        }
      }
    });
    assert.equal(result.prepared.blocked_descriptors.length, 1);
    assert.equal(result.prepared.outcome_events.every(({ actor_ref: actor }) =>
      actor.entity_id === 'npc-1'), true);
    assert.equal(observed.meaningful_descriptors[0].category, 'objective');
    assert.equal(result.prepared.session_after.participant_states[0]
      .current_intent.intent_id, intent.intent_id);
    assert.equal(result.prepared.session_after.participant_states[0]
      .current_intent.status, 'invalidated');
    assert.equal(result.prepared.outcome_events[0].event_kind,
      'combat_intent_invalidated');
    assert.deepEqual(result.prepared.blocked_descriptors[0].source_event_ref, {
      entity_kind: 'combat_event',
      entity_id: result.prepared.outcome_events[0].event_id
    });
  });

for (const [intentKind, expectedStatus] of [
  ['surrender', 'surrendered'],
  ['break_contact', 'disengaging']
]) {
  test(`${intentKind} produces a distinct valid terminal combat state`, async () => {
    const intent = makeIntent(ref('npc', 'npc-1'),
      ref('player_character', 'player-1'), intentKind);
    const result = await prepareCombatExchange({
      session: session(intent), working_state: {}, occurred_at: at,
      idempotency_key: `alternative-${intentKind}`,
      random_source: { next: () => { throw new Error('RNG_NOT_EXPECTED'); } },
      ports: {
        resolveCombatTiming: () => ({ occurred_at: at,
          exact_duration: { exact_minutes: {
            numerator: '1', denominator: '1' } } }),
        resolveExecutionProfile: () => ({
          preconditions_digest: `alternative-${intentKind}` }),
        orderTechnicalSteps: ({ proposals }) => proposals,
        applyItemTransitions: ({ working_state }) => ({ working_state }),
        applyPositionTransitions: ({ working_state }) => ({ working_state }),
        resolvePerceptionAndDecisionContexts: async ({ session, working_state }) => ({
          session_after: session, working_state, signal_records: [] })
      }
    });
    const actor = result.prepared.session_after.participant_states[0];
    assert.equal(actor.combat_status, expectedStatus);
    assert.equal(actor.current_intent === null, intentKind === 'surrender');
    assert.equal(result.prepared.session_after.status,
      intentKind === 'surrender' ? 'ended' : 'paused_for_player');
    assert.deepEqual(result.prepared.harm_packages, []);
    assert.deepEqual(result.prepared.body_transitions, []);
    if (intentKind === 'surrender') {
      assert.equal(result.prepared.outcome_events.some(
        ({ event_kind: kind }) => kind === 'combat_ended'), true);
    }
  });
}

test('later same-time step is blocked after an earlier owner restrains its actor',
  async () => {
    const first = ref('npc', 'npc-1');
    const second = ref('npc', 'npc-2');
    const third = ref('npc', 'npc-3');
    const firstIntent = makeIntent(first, second, 'control');
    const secondIntent = makeIntent(second, first, 'engage');
    const thirdIntent = makeIntent(third, first, 'engage');
    const simultaneous = {
      ...session(),
      participant_refs: [first, second, third],
      participant_states: [
        { actor_ref: first, combat_status: 'active',
          current_intent: firstIntent, next_action_boundary_ref: null },
        { actor_ref: second, combat_status: 'active',
          current_intent: secondIntent, next_action_boundary_ref: null },
        { actor_ref: third, combat_status: 'active',
          current_intent: thirdIntent, next_action_boundary_ref: null }
      ]
    };
    let randomCalls = 0;
    let observed;
    const result = await prepareCombatExchange({
      session: simultaneous, working_state: {}, occurred_at: at,
      idempotency_key: 'same-time-recheck',
      random_source: { next: () => { randomCalls += 1; return 0.99; } },
      ports: {
        resolveCombatTiming: ({ technical_step: step }) => ({ occurred_at: at,
          exact_duration: { exact_minutes: {
            numerator: step.actor_ref.entity_id === 'npc-2' ? '5'
              : step.actor_ref.entity_id === 'npc-3' ? '2' : '1',
            denominator: '1' } } }),
        resolveExecutionProfile: () => ({
          preconditions_digest: 'same-time-recheck',
          check_request: { target_defense: 5, attribute_value: 20,
            skill_bonus: 0, weapon_danger: 0,
            target_protection: 0, target_vulnerability: 0 }
        }),
        orderTechnicalSteps: ({ proposals }) => proposals,
        applyItemTransitions: ({ step, working_state }) => ({ working_state,
          participant_status_updates: step.actor_ref.entity_id === 'npc-1'
            ? [{ actor_ref: second, combat_status: 'restrained',
              clear_intent: true }]
            : [] }),
        applyPositionTransitions: ({ working_state }) => ({ working_state }),
        resolvePerceptionAndDecisionContexts: async ({ session: current,
          working_state, outcome_events, blocked_descriptors }) => {
          observed = { current, outcome_events, blocked_descriptors };
          return { session_after: current, working_state, signal_records: [] };
        }
      }
    });
    assert.equal(randomCalls, 2);
    assert.equal(result.prepared.check_results.length, 2);
    assert.equal(result.prepared.blocked_descriptors.length, 1);
    assert.equal(result.prepared.exact_duration.exact_minutes.numerator, '2');
    assert.equal(result.prepared.technical_step_timings.length, 2);
    assert.equal(result.prepared.session_after.participant_states[1]
      .combat_status, 'restrained');
    assert.equal(result.prepared.session_after.participant_states[1]
      .current_intent.status, 'invalidated');
    const blockedEvent = observed.outcome_events.find(
      ({ event_kind: kind }) => kind === 'combat_step_blocked');
    assert.ok(blockedEvent);
    assert.deepEqual(observed.outcome_events.map(({ event_kind: kind }) => kind),
      ['combat_step_attempted', 'combat_check_resolved',
        'combat_step_blocked', 'combat_step_attempted',
        'combat_check_resolved', 'combat_harm_proposed']);
    assert.deepEqual(observed.blocked_descriptors[0].source_event_ref, {
      entity_kind: 'combat_event', entity_id: blockedEvent.event_id
    });
    assert.equal(observed.blocked_descriptors[0].source_event_ref.entity_id,
      result.prepared.blocked_descriptors[0].source_event_ref.entity_id);
  });

test('combat body signal uses the approved threshold descriptor verbatim',
  async () => {
    const intent = makeIntent(ref('npc', 'npc-1'),
      ref('player_character', 'player-1'));
    let observed;
    await prepareCombatExchange({
      session: session(intent),
      working_state: { actor_states: {
        'player_character\u0000player-1': { body_state: {
          health: 100, satiety: 100, energy: 100 } }
      } },
      occurred_at: at, idempotency_key: 'approved-body-signal',
      random_source: { next: () => 0.99 },
      body_threshold_profile: {
        profile_id: 'combat-body-signals-v1', status: 'approved',
        thresholds: [{ threshold_id: 'health-99', metric: 'health',
          direction: 'decrease', value: 99, decision_signal: {
            category: 'self', significance: 'critical',
            perception_required: false,
            perceived_change_summary: 'The wound prevents ordinary resistance.'
          } }]
      },
      ports: {
        resolveCombatTiming: () => ({ occurred_at: at,
          exact_duration: { exact_minutes: {
            numerator: '1', denominator: '1' } } }),
        resolveExecutionProfile: () => ({
          preconditions_digest: 'approved-body-signal',
          check_request: { target_defense: 1, attribute_value: 20,
            skill_bonus: 0, weapon_danger: 3,
            target_protection: 0, target_vulnerability: 0 }
        }),
        orderTechnicalSteps: ({ proposals }) => proposals,
        applyItemTransitions: ({ working_state }) => ({ working_state }),
        applyPositionTransitions: ({ working_state }) => ({ working_state }),
        resolvePerceptionAndDecisionContexts: async (input) => {
          observed = input;
          return { session_after: input.session,
            working_state: input.working_state, signal_records: [] };
        }
      }
    });
    const bodySignal = observed.meaningful_descriptors.find(
      ({ source_event_ref: source }) =>
        source.entity_kind === 'body_threshold_crossing');
    assert.equal(bodySignal.significance, 'critical');
    assert.equal(bodySignal.perceived_change_summary,
      'The wound prevents ordinary resistance.');
  });

test('zero health incapacitates the target before its later same-time step',
  async () => {
    const first = ref('player_character', 'player-1');
    const second = ref('npc', 'npc-1');
    const firstIntent = makeIntent(first, second, 'engage');
    const secondIntent = makeIntent(second, first, 'engage');
    const active = {
      ...session(),
      participant_refs: [first, second],
      participant_states: [
        { actor_ref: first, combat_status: 'active',
          current_intent: firstIntent, next_action_boundary_ref: null },
        { actor_ref: second, combat_status: 'active',
          current_intent: secondIntent, next_action_boundary_ref: null }
      ]
    };
    let randomCalls = 0;
    const result = await prepareCombatExchange({
      session: active, working_state: { actor_states: {
        'npc\0npc-1': { body_state: {
          health: 5, satiety: 100, energy: 100 } },
        'player_character\0player-1': { body_state: {
          health: 100, satiety: 100, energy: 100 } }
      } }, occurred_at: at, idempotency_key: 'incapacitation',
      random_source: { next: () => { randomCalls += 1; return 0.99; } },
      body_threshold_profile: {
        profile_id: 'incapacitation-threshold', status: 'approved',
        thresholds: [{ threshold_id: 'health-0', metric: 'health',
          direction: 'decrease', value: 0, decision_signal: {
            category: 'self', significance: 'critical',
            perception_required: false,
            perceived_change_summary: 'The participant is incapacitated.'
          } }]
      }, ports: {
        resolveCombatTiming: () => ({ occurred_at: at,
          exact_duration: { exact_minutes: {
            numerator: '1', denominator: '1' } } }),
        resolveExecutionProfile: () => ({
          preconditions_digest: 'incapacitation',
          check_request: { target_defense: 1, attribute_value: 20,
            skill_bonus: 0, weapon_danger: 4,
            target_protection: 0, target_vulnerability: 0 }
        }),
        orderTechnicalSteps: ({ proposals }) => proposals,
        applyItemTransitions: ({ working_state }) => ({ working_state }),
        applyPositionTransitions: ({ working_state }) => ({ working_state }),
        resolvePerceptionAndDecisionContexts: async ({ session: current,
          working_state }) => ({ session_after: current, working_state,
          decision_results: [], signal_records: [] })
      }
    });
    assert.equal(randomCalls, 1);
    assert.equal(result.prepared.session_after.status, 'ended');
    assert.equal(result.prepared.session_after.participant_states[1]
      .combat_status, 'incapacitated');
    assert.equal(result.prepared.session_after.participant_states[1]
      .current_intent, null);
    assert.equal(result.prepared.outcome_events.some(
      ({ event_kind: kind }) => kind === 'combat_ended'), true);
  });

test('break_contact becomes left only after the movement owner confirms departure',
  async () => {
    const intent = makeIntent(ref('npc', 'npc-1'),
      ref('player_character', 'player-1'), 'break_contact');
    const result = await prepareCombatExchange({
      session: session(intent), working_state: {}, occurred_at: at,
      idempotency_key: 'confirmed-break-contact',
      random_source: { next: () => { throw new Error('RNG_NOT_EXPECTED'); } },
      ports: {
        resolveCombatTiming: () => ({ occurred_at: at,
          exact_duration: { exact_minutes: {
            numerator: '1', denominator: '1' } } }),
        resolveExecutionProfile: () => ({
          preconditions_digest: 'confirmed-break-contact' }),
        orderTechnicalSteps: ({ session: current, proposals }) =>
          orderCombatTechnicalSteps({ session: current, proposals }),
        applyItemTransitions: ({ working_state }) => ({ working_state }),
        applyPositionTransitions: ({ working_state }) => ({ working_state,
          participant_status_updates: [{ actor_ref: ref('npc', 'npc-1'),
            combat_status: 'left', clear_intent: true }] }),
        resolvePerceptionAndDecisionContexts: async ({ session: current,
          working_state }) => ({ session_after: current, working_state,
          signal_records: [] })
      }
    });
    const actor = result.prepared.session_after.participant_states[0];
    assert.equal(actor.combat_status, 'left');
    assert.equal(actor.current_intent, null);
  });

test('item owner cannot confirm departure for break_contact', async () => {
  const intent = makeIntent(ref('npc', 'npc-1'),
    ref('player_character', 'player-1'), 'break_contact');
  await assert.rejects(prepareCombatExchange({
    session: session(intent), working_state: {}, occurred_at: at,
    idempotency_key: 'item-owned-break-contact',
    random_source: { next: () => { throw new Error('RNG_NOT_EXPECTED'); } },
    ports: {
      resolveCombatTiming: () => ({ occurred_at: at,
        exact_duration: { exact_minutes: {
          numerator: '1', denominator: '1' } } }),
      resolveExecutionProfile: () => ({
        preconditions_digest: 'item-owned-break-contact' }),
      orderTechnicalSteps: ({ session: current, proposals }) =>
        orderCombatTechnicalSteps({ session: current, proposals }),
      applyItemTransitions: ({ working_state }) => ({ working_state,
        participant_status_updates: [{ actor_ref: ref('npc', 'npc-1'),
          combat_status: 'left', clear_intent: true }] }),
      applyPositionTransitions: ({ working_state }) => ({ working_state }),
      resolvePerceptionAndDecisionContexts: async ({ session: current,
        working_state }) => ({ session_after: current, working_state,
        signal_records: [] })
    }
  }), { code: 'TURN_COMBAT_DOMAIN_OWNER_INVALID' });
});
