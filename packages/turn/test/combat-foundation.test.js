import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCombatInitializationDecisionContexts,
  createCombatSession,
  executeCombatExchange,
  initializeCombatSession,
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
    return { boundary, request, ordered_signals: [], semantic_model: async () => ({ schema: 'npc_combat_intent_plan_v1', request_id: request.request_id, boundary_id: request.boundary_id, state_version: '1', combat_id: 'combat-1', npc_ref: ref('npc', id), decision: {}, operation: { op: 'set_combat_intent', intent_kind: 'engage', target_refs: [ref('player_character', 'player-1')], protected_refs: [], scope_ref: null, destination_ref: null, force_limit: 'ordinary', risk_posture: 'ordinary' }, combat_statement: null, reason: 'defend' }), revalidate_state_version: async () => 1 };
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
    assert.equal(observed.meaningful_descriptors[0].category, 'objective');
    assert.equal(result.prepared.session_after.participant_states[0]
      .current_intent.intent_id, intent.intent_id);
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
    assert.deepEqual(result.prepared.harm_packages, []);
    assert.deepEqual(result.prepared.body_transitions, []);
  });
}

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
