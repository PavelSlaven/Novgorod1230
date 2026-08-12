import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTurnStepPreparedBodyUpdate,
  buildTurnStepPreparedEffectLedger,
  buildTurnStepPreparedTimeUpdate,
  prepareCombatExchange
} from '@rus/turn';
import { validatePreparedEffectCommit } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-prepared-effect-validation.js';
import { COMBAT_RESPONSE_COMMAND,
  createLowerDvinaTracePreparedDomainEffect } from
  '../src/runtime/lower-dvina-trace-turn-step-prepared-effects.js';
import { validTracePreparedCombatConsequence } from
  '../src/runtime/lower-dvina-trace-combat-prepared-contract.js';
import { combatPendingScreen, combatVisibleEnvelope } from
  '../src/infrastructure/postgres/lower-dvina-trace-combat-writes.js';

test('zero-time invalidation reaches prepared commit admission and replay',
  async () => {
    const fixture = preparedCombat({ exchange: null, duration: 0,
      status: 'paused_for_player', playerBoundary: true });
    const owner = createLowerDvinaTracePreparedDomainEffect({
      committedState: fixture.state
    });
    const applied = await owner.apply({ command_id: COMBAT_RESPONSE_COMMAND,
      consequence: fixture.envelope.consequence,
      prepared_chain_context: { prior_effect_count: 0 },
      operation: { op: 'request_combat' }, availability: { available: true },
      working_projection: {} });
    assert.equal(applied.player_response_boundary, true);
    const first = validatePreparedEffectCommit(fixture);
    const replay = validatePreparedEffectCommit(structuredClone(fixture));
    assert.deepEqual(replay, first);
    assert.equal(first.combatSlice.consequence.combat.outcome_events[0]
      .event_kind, 'combat_intent_invalidated');
  });

test('terminal prepared combat admits no player response boundary', async () => {
  const fixture = preparedCombat({ exchange: formalExchange(),
    duration: 2, status: 'ended', playerBoundary: false });
  const owner = createLowerDvinaTracePreparedDomainEffect({
    committedState: fixture.state
  });
  const applied = await owner.apply({ command_id: COMBAT_RESPONSE_COMMAND,
    consequence: fixture.envelope.consequence,
    prepared_chain_context: { prior_effect_count: 0 },
    operation: { op: 'request_combat' }, availability: { available: true },
    working_projection: {} });
  assert.equal(applied.player_response_boundary, false);
  assert.doesNotThrow(() => validatePreparedEffectCommit(fixture));
  assert.doesNotThrow(() => validatePreparedEffectCommit(
    structuredClone(fixture)));
  const projection = terminalProjection(fixture.envelope);
  const replay = terminalProjection(structuredClone(fixture.envelope));
  assert.deepEqual(replay, projection);
  assert.equal(projection.envelope.visible_payload.player_safe_interruption,
    null);
  assert.deepEqual(projection.envelope.visible_payload
    .allowed_action_affordances, []);
  assert.equal(projection.screen.main_prose, 'Боевая сцена завершена.');
});

test('prepared combat rejects non-formal exchange and non-bijective events', () => {
  const zero = preparedCombat({ exchange: null, duration: 0,
    status: 'paused_for_player', playerBoundary: true })
    .envelope.consequence;
  const duplicate = structuredClone(zero);
  duplicate.combat.outcome_events.push({
    ...duplicate.combat.outcome_events[0], event_id: 'combat-event:second' });
  duplicate.combat.blocked_descriptors.push(structuredClone(
    duplicate.combat.blocked_descriptors[0]));
  assert.equal(validTracePreparedCombatConsequence(duplicate), false);
  const foreignEvent = structuredClone(zero);
  foreignEvent.combat.outcome_events.push({ event_id: 'combat-event:foreign',
    event_kind: 'combat_step_attempted' });
  assert.equal(validTracePreparedCombatConsequence(foreignEvent), false);
  const terminal = preparedCombat({ exchange: { proposal_id: 'not-formal' },
    duration: 2, status: 'ended', playerBoundary: false })
    .envelope.consequence;
  assert.equal(validTracePreparedCombatConsequence(terminal), false);
});

test('real prepared positive exchange passes runtime and commit gates',
  async () => {
    const actor = { entity_kind: 'npc', entity_id: 'npc-1' };
    const target = { entity_kind: 'player_character', entity_id: 'player-1' };
    const intent = { schema: 'combat_intent_v1', intent_id: 'intent-1',
      combat_id: 'combat-1', actor_ref: actor, intent_kind: 'engage',
      target_refs: [target], protected_refs: [], scope_ref: null,
      destination_ref: null, force_limit: 'ordinary', risk_posture: 'ordinary',
      persistence: 'until_decision_boundary', created_from_boundary_ref: {
        entity_kind: 'npc_decision_boundary', entity_id: 'boundary-1' },
      state_version: '1', status: 'active' };
    const session = { schema: 'combat_session_v1', combat_id: 'combat-1',
      state_version: '1', status: 'active', started_at: at(10),
      scope_ref: { entity_kind: 'location', entity_id: 'place-1' },
      participant_refs: [actor, target], participant_states: [
        { actor_ref: actor, combat_status: 'active', current_intent: intent,
          next_action_boundary_ref: null },
        { actor_ref: target, combat_status: 'active', current_intent: null,
          next_action_boundary_ref: null }], exchange_ordinal: 0,
      last_exchange_ref: null, player_response_required: false,
      last_change_set_ref: null };
    const prepared = await prepareCombatExchange({ session, working_state: {},
      occurred_at: at(10), idempotency_key: 'positive-exchange',
      random_source: { next: () => 0.5 }, ports: {
        resolveCombatTiming: () => ({ occurred_at: at(10),
          exact_duration: { exact_minutes: {
            numerator: '1', denominator: '1' } } }),
        resolveExecutionProfile: () => ({ preconditions_digest: 'profile-1',
          check_request: { target_defense: 10, attribute_value: 10,
            skill_bonus: 0, weapon_danger: 0, target_protection: 0,
            target_vulnerability: 0 } }),
        orderTechnicalSteps: ({ proposals }) => proposals,
        applyItemTransitions: ({ working_state }) => ({ working_state }),
        applyPositionTransitions: ({ working_state }) => ({ working_state }),
        resolvePerceptionAndDecisionContexts: async ({ session: current,
          working_state }) => ({ session_after: current, working_state,
          signal_records: [] })
      } });
    const consequence = { combat_kind: 'exchange', duration_minutes: 1,
      combat: prepared.prepared };
    const fixture = preparedConsequence(consequence, true);
    const owner = createLowerDvinaTracePreparedDomainEffect({
      committedState: fixture.state });
    await assert.doesNotReject(() => owner.apply({
      command_id: COMBAT_RESPONSE_COMMAND, consequence,
      prepared_chain_context: { prior_effect_count: 0 },
      operation: { op: 'request_combat' }, availability: { available: true },
      working_projection: {} }));
    assert.doesNotThrow(() => validatePreparedEffectCommit(fixture));
  });

test('positive route invalidation admits blocked and stranded owner proof',
  async () => {
    const fixture = preparedTraversalInvalidation();
    const owner = createLowerDvinaTracePreparedDomainEffect({
      committedState: fixture.state });
    await assert.doesNotReject(() => owner.apply({
      command_id: COMBAT_RESPONSE_COMMAND,
      consequence: fixture.envelope.consequence,
      prepared_chain_context: { prior_effect_count: 0 },
      operation: { op: 'request_combat' }, availability: { available: true },
      working_projection: {} }));
    assert.doesNotThrow(() => validatePreparedEffectCommit(fixture));
    const detached = structuredClone(fixture.envelope.consequence);
    detached.combat.outcome_events = detached.combat.outcome_events.filter(
      ({ event_kind: kind }) => kind
        === 'combat_position_transition_interrupted');
    detached.combat.blocked_descriptors = [];
    assert.equal(validTracePreparedCombatConsequence(detached), false);
  });

function preparedTraversalInvalidation() {
  const base = preparedCombat({ exchange: null, duration: 0,
    status: 'paused_for_player', playerBoundary: true });
  const combat = base.envelope.consequence.combat;
  const blocked = combat.outcome_events[0];
  const traversal = { terminal: false, stranded: true, clock_update: null,
    ids: { interval_id: 'interval:stranded:1' }, interval_result: {
      result_kind: 'stranded', clock_commit_mode:
        'shared_root_transport_clock', actual_time_numerator: '1',
      actual_time_denominator: '1' } };
  const movement = { event_id: 'combat-event:movement:stranded',
    event_kind: 'combat_position_transition_interrupted',
    combat_id: combat.session_after.combat_id,
    source_step_ref: { entity_kind: 'combat_technical_step',
      entity_id: 'step:stranded' }, traversal_interval_ref: {
      entity_kind: 'traversal_interval_result',
      entity_id: traversal.ids.interval_id }, exact_elapsed: {
      exact_minutes: { numerator: '1', denominator: '1' } } };
  blocked.source_step_ref = structuredClone(movement.source_step_ref);
  movement.actor_ref = structuredClone(blocked.actor_ref);
  const consequence = { combat_kind: 'exchange', duration_minutes: 1,
    combat: { ...combat, outcome_events: [blocked, movement],
      position_transitions: [{ movement_result: { traversal } }],
      temporal_advance_results: [{ processed_slice_refs: [{
        entity_kind: 'time_slice_result', entity_id: 'slice:stranded' }] }],
      working_state_after: { active_combat_step_progress: [],
        active_combat_traversals: [] } } };
  return preparedConsequence(consequence, true);
}

function preparedCombat({ exchange, duration, status, playerBoundary }) {
  const clockAfter = at(10 + duration);
  const participant = { entity_kind: 'npc', entity_id: 'npc-1' };
  const sessionBefore = { combat_id: 'combat-1', exchange_ordinal: 0 };
  const sessionAfter = { combat_id: 'combat-1',
    exchange_ordinal: exchange == null ? 0 : 1, status,
    player_response_required: playerBoundary,
    participant_states: [{ actor_ref: participant,
      combat_status: status === 'ended' ? 'restrained' : 'active',
      current_intent: null, next_action_boundary_ref: null }] };
  const event = { event_id: 'combat-event:combat-1:intent-1:invalidated',
    event_kind: 'combat_intent_invalidated', combat_id: 'combat-1',
    actor_ref: participant,
    source_step_ref: { entity_kind: 'combat_intent', entity_id: 'intent-1' },
    intent_status: 'invalidated' };
  const descriptor = { category: 'objective', significance: 'material',
    source_event_ref: { entity_kind: 'combat_event', entity_id: event.event_id },
    subject_ref: participant, occurred_at: clockAfter };
  const combat = { session_before: sessionBefore, session_after: sessionAfter,
    exchange, outcome_events: exchange == null ? [event]
      : status === 'ended' ? [{ event_id: 'combat-event:ended',
        event_kind: 'combat_ended', combat_id: 'combat-1',
        source_step_ref: { entity_kind: 'combat_exchange',
          entity_id: exchange.proposal_id } }] : [],
    blocked_descriptors: exchange == null ? [descriptor] : [] };
  const consequence = { combat_kind: 'exchange', duration_minutes: duration,
    combat };
  return preparedConsequence(consequence, playerBoundary);
}

function preparedConsequence(consequence, playerBoundary) {
  const duration = consequence.duration_minutes;
  const clockBefore = at(10), clockAfter = at(10 + duration);
  const body = { health: 100, energy: 100, satiety: 100 };
  const sessionBefore = consequence.combat.session_before;
  const ledger = buildTurnStepPreparedEffectLedger({
    rootTurnId: 'turn:party-1:1', committedStateVersion: 7,
    effects: [{ effect: { step_index: 1, effect_kind: 'domain_command',
      owner_ref: COMBAT_RESPONSE_COMMAND, operation_ref: 'request_combat',
      availability: { available: true }, consequence,
      time_update: { schema: 'turn_time_update', clock_before: clockBefore,
        clock_after: clockAfter, exact_elapsed: { exact_minutes: {
          numerator: String(duration), denominator: '1' } } },
      body_update: { schema: 'turn_body_update', applied: false,
        proposal: null, state_after: body }, body_state_before: body },
    working_projection_before: { clock: clockBefore },
    working_projection_after: { clock: clockAfter } }]
  });
  const timeUpdate = buildTurnStepPreparedTimeUpdate(ledger);
  const bodyUpdate = buildTurnStepPreparedBodyUpdate(ledger);
  const envelope = { root_turn_id: 'turn:party-1:1', base_state_version: 7,
    consequence, time_update: timeUpdate, body_update: bodyUpdate,
    loop_trace: { step_traces: [{ applied: true,
      player_response_boundary: playerBoundary,
      approved_plan: { resolution: 'domain_request',
        operations: [{ op: 'request_combat' }] },
      plan_request: { player_safe_state: { combat_sessions: [sessionBefore],
        clock: clockBefore } } }] } };
  return { batch: { root_turn_id: 'turn:party-1:1',
    committed_state_version: 7 }, envelope, factual: {
    consequence, time_update: timeUpdate, body_update: bodyUpdate },
  state: { clock: clockBefore } };
}

function at(minutes) {
  return { whole_minutes: String(minutes), subminute_numerator: '0',
    subminute_denominator: '1' };
}

function formalExchange() {
  const step = { schema: 'combat_technical_step_proposal_v1',
    proposal_id: 'step-1', combat_id: 'combat-1', exchange_ordinal: 0,
    actor_ref: { entity_kind: 'npc', entity_id: 'npc-1' },
    intent_ref: { entity_kind: 'combat_intent', entity_id: 'intent-1' },
    step_kind: 'control', check_request: null,
    preconditions_digest: 'preconditions-1', idempotency_key: 'step-key-1' };
  return { schema: 'combat_exchange_proposal_v1', proposal_id: 'exchange-1',
    combat_id: 'combat-1', exchange_ordinal: 0, technical_steps: [step],
    preconditions_digest: 'exchange-preconditions',
    idempotency_key: 'exchange-key-1' };
}

function terminalProjection(envelope) {
  const factual = { ...envelope, mode_resolution: { turn_id: 'turn:party-1:1' } };
  const visibleContext = { visible_scene: [], visible_changes: [],
    sensory_details: [], visible_npc: [], visible_objects: [], known_context: [],
    uncertainties: [] };
  const projection = combatVisibleEnvelope({ partyId: 'party-1', factual,
    visibleContext, nextVersion: 8, turnNumber: 1,
    changeSetId: 'change-1', idemId: 'idem-1' });
  const state = { party_id: 'party-1', opening_identity: {
    opening_screen_digest: 'opening-1' } };
  return { envelope: projection, screen: combatPendingScreen({ state, factual,
    visibleEnvelope: projection, turnNumber: 1, nextVersion: 8 }) };
}
