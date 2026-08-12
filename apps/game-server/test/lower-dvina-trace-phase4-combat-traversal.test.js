import assert from 'node:assert/strict';
import test from 'node:test';
import { addElapsedTime } from '@rus/time-events-history';
import { orderCombatTechnicalSteps, prepareCombatExchange } from '@rus/turn';
import { createTemporalAdvanceOwner } from '@rus/turn/temporal-advance';
import { fixture, loadScenarioBundle } from
  './lower-dvina-trace-phase-2-fixture.js';
import { projectTraceCombatWorkingState } from
  '../src/runtime/lower-dvina-trace-combat-working-state.js';
import { createTraceCombatTemporalSliceOwner } from
  '../src/runtime/lower-dvina-trace-combat-temporal.js';
import { lowerDvinaTraceCombatTemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-combat-temporal-effect-owner.js';

const bundle = await loadScenarioBundle(16);

test('Phase 4 break_contact pauses at the earlier combat boundary exactly once',
  async () => {
    const seed = fixture({ scenarioBundle: bundle,
      materializationBundle: bundle });
    const state = structuredClone(seed.state);
    state.container_placements = state.containers.map((container) => ({
      party_id: state.party_id, container_id: container.container_id,
      anchor_id: container.anchor_id, holder_npc_id: container.holder_npc_id,
      physical_position: 'external_load'
    }));
    const ratsha = state.npcs.find(({ participant_slot_ref: slot }) =>
      slot === 'ratsha_storehouse_helper');
    const shed = state.prepared_scenes.find(({ location_profile_ref: id }) =>
      id === 'trace_ld_v1_loc_old_drying_shed');
    const camp = state.prepared_scenes.find(({ location_profile_ref: id }) =>
      id === 'trace_ld_v1_loc_fishing_camp');
    state.position = { ...state.position,
      location_ref: shed.location_profile_ref,
      g5_anchor_id: shed.anchor.instance_id,
      g5_node_id: shed.node.instance_id,
      zone_ref: shed.anchor.state.zone_ref };
    const combatId = 'combat:phase4:traversal';
    const ratshaRef = { entity_kind: 'npc', entity_id: ratsha.instance_id };
    const playerRef = { entity_kind: 'player_character',
      entity_id: state.actor_id };
    const ratshaIntent = { schema: 'combat_intent_v1',
      intent_id: 'intent:ratsha:escape', combat_id: combatId,
      actor_ref: ratshaRef, intent_kind: 'break_contact', target_refs: [],
      protected_refs: [], scope_ref: null, destination_ref: {
        entity_kind: 'location_anchor', entity_id: camp.anchor.instance_id },
      force_limit: 'ordinary', risk_posture: 'ordinary',
      persistence: 'until_decision_boundary',
      created_from_boundary_ref: { entity_kind: 'npc_decision_boundary',
        entity_id: 'boundary:ratsha:escape' },
      state_version: '1', status: 'active' };
    state.combat_sessions = [{ schema: 'combat_session_v1', combat_id: combatId,
      state_version: '1', status: 'paused_for_player',
      started_at: structuredClone(state.clock), scope_ref: {
        entity_kind: 'location', entity_id: shed.location_profile_ref },
      participant_refs: [playerRef, ratshaRef], participant_states: [
        { actor_ref: playerRef, combat_status: 'active',
          current_intent: null, next_action_boundary_ref: null },
        { actor_ref: ratshaRef, combat_status: 'active',
          current_intent: ratshaIntent, next_action_boundary_ref: null }
      ], exchange_ordinal: 0, last_exchange_ref: null,
      player_response_required: true, last_change_set_ref: null }];
    state.player_response_boundary = { kind: 'combat', combat_id: combatId };
    const external = boundary(state, addElapsedTime(state.clock, {
      exact_minutes: { numerator: '1', denominator: '1' } }));
    state.temporal_boundary_candidates = [external];
    let boundaryObservedProgress = false;
    const temporalAdvanceOwner = createTemporalAdvanceOwner({
      source_registrations: [{ rule_ref: external.rule_ref,
        policy_ref: external.policy_ref,
        resolve(_candidate, { projection }) {
          const progress = projection.active_combat_step_progress?.find(
            ({ actor_ref: actor }) => actor.entity_id === ratsha.instance_id);
          assert.equal(progress?.elapsed_duration?.exact_minutes?.numerator,
            '1');
          boundaryObservedProgress = true;
          return { disposition: 'execute', proposals: [],
            state_projection: projection, follow_up_candidates: [] };
        } }], effect_registrations:
        lowerDvinaTraceCombatTemporalEffectRegistrations() });
    const runtime = fixture({ scenarioBundle: bundle,
      materializationBundle: bundle, committedState: state,
      turnStepModel: (request) => holdPlan(request, state, shed),
      temporalAdvanceOwner,
      npcCombatModel: async () => assert.fail(
        'a non-meaningful progress slice must not call the NPC model') });
    const before = Number(runtime.state.clock.whole_minutes);
    const response = { request_id: 'phase4-combat-boundary',
      idempotency_key: 'phase4-combat-boundary',
      raw_text: 'Держать позицию и не дать Ратше напасть.' };
    await runtime.runtime.submitTurn({ partyId: runtime.partyId,
      input: response });
    assert.equal(Number(runtime.state.clock.whole_minutes), before + 1);
    assert.equal(runtime.state.active_combat_traversals.length, 1);
    const traversal = runtime.state.active_combat_traversals[0].traversal;
    assert.equal(traversal.interval_result.result_kind, 'paused_in_transit');
    assert.equal(traversal.interval_result.clock_commit_mode,
      'shared_root_transport_clock');
    assert.equal(traversal.clock_update, null);
    assert.equal(traversal.final_travel_state.progress_ppm, 83_333);
    assert.equal(runtime.state.npcs.find(({ instance_id: id }) =>
      id === ratsha.instance_id).location_profile_ref,
    shed.location_profile_ref);
    assert.equal(runtime.state.last_turn.consequence.duration_minutes, 1);
    assert.equal(boundaryObservedProgress, true);
    assert.deepEqual(runtime.state.temporal_boundary_candidates, []);
    assert.equal(runtime.state.last_turn.consequence.combat.outcome_events.some(
      ({ event_kind: kind }) =>
        kind === 'combat_position_transition_progressed'), true);
    const commits = runtime.commitCount();
    const rolls = runtime.rollCount();
    await runtime.runtime.submitTurn({ partyId: runtime.partyId,
      input: response });
    assert.equal(runtime.commitCount(), commits);
    assert.equal(runtime.rollCount(), rolls);
    assert.equal(Number(runtime.state.clock.whole_minutes), before + 1);
    assert.equal(runtime.state.active_combat_traversals[0].traversal
      .final_travel_state.cumulative_actual_time.numerator, '1');

    const restarted = fixture({ scenarioBundle: bundle,
      materializationBundle: bundle,
      committedState: structuredClone(runtime.state),
      turnStepModel: (request) => holdPlan(request, runtime.state, shed),
      temporalAdvanceOwner,
      npcCombatModel: async () => assert.fail(
        'resumed non-meaningful progress must not call the NPC model') });
    const resumed = { request_id: 'phase4-combat-boundary-resumed',
      idempotency_key: 'phase4-combat-boundary-resumed',
      raw_text: 'Продолжать удерживать позицию.' };
    await restarted.runtime.submitTurn({ partyId: restarted.partyId,
      input: resumed });
    assert.equal(Number(restarted.state.clock.whole_minutes), before + 3);
    assert.equal(restarted.state.active_combat_traversals[0].traversal
      .ids.execution_id, traversal.ids.execution_id);
    assert.equal(restarted.state.active_combat_traversals[0].traversal
      .interval_result.interval_ordinal, 1);
    assert.equal(restarted.state.active_combat_traversals[0].traversal
      .final_travel_state.cumulative_actual_time.numerator, '3');
    const restartedCommits = restarted.commitCount();
    await restarted.runtime.submitTurn({ partyId: restarted.partyId,
      input: resumed });
    assert.equal(restarted.commitCount(), restartedCommits);
    assert.equal(Number(restarted.state.clock.whole_minutes), before + 3);
  });

test('same-time external and combat completions share canonical temporal order',
  async () => {
    const seed = fixture({ scenarioBundle: bundle,
      materializationBundle: bundle });
    const state = structuredClone(seed.state);
    const ratsha = state.npcs.find(({ participant_slot_ref: slot }) =>
      slot === 'ratsha_storehouse_helper');
    const shed = state.prepared_scenes.find(({ location_profile_ref: id }) =>
      id === 'trace_ld_v1_loc_old_drying_shed');
    const camp = state.prepared_scenes.find(({ location_profile_ref: id }) =>
      id === 'trace_ld_v1_loc_fishing_camp');
    const combatId = 'combat:phase4:same-time';
    const ratshaRef = { entity_kind: 'npc', entity_id: ratsha.instance_id };
    const playerRef = { entity_kind: 'player_character',
      entity_id: state.actor_id };
    const playerIntent = { schema: 'combat_intent_v1',
      intent_id: 'intent:player:same-time-break-contact', combat_id: combatId,
      actor_ref: playerRef, intent_kind: 'break_contact', target_refs: [],
      protected_refs: [], scope_ref: null, destination_ref: {
        entity_kind: 'location_anchor', entity_id: camp.anchor.instance_id },
      force_limit: 'ordinary', risk_posture: 'ordinary',
      persistence: 'until_decision_boundary',
      created_from_boundary_ref: { entity_kind: 'player_combat_response_boundary',
        entity_id: 'boundary:player:same-time-hold' },
      state_version: '1', status: 'active' };
    const session = { schema: 'combat_session_v1', combat_id: combatId,
      state_version: '1', status: 'active',
      started_at: structuredClone(state.clock), scope_ref: {
        entity_kind: 'location', entity_id: shed.location_profile_ref },
      participant_refs: [playerRef, ratshaRef], participant_states: [
        { actor_ref: playerRef, combat_status: 'active',
          current_intent: playerIntent, next_action_boundary_ref: null },
        { actor_ref: ratshaRef, combat_status: 'active',
          current_intent: null, next_action_boundary_ref: null }
      ], exchange_ordinal: 0, last_exchange_ref: null,
      player_response_required: false, last_change_set_ref: null };
    const external = boundary(state, addElapsedTime(state.clock, {
      exact_minutes: { numerator: '2', denominator: '1' } }));
    external.boundary_id = 'boundary:combat-same-time-hazard';
    external.idempotency_key = 'timer:combat-same-time-hazard:1';
    external.resolution_class = 'physical_hazard_access';
    const reaction = structuredClone(external);
    reaction.boundary_id = 'boundary:combat-same-time-reaction';
    reaction.idempotency_key = 'timer:combat-same-time-reaction:1';
    reaction.resolution_class = 'reaction_decision';
    reaction.rule_ref.entity_ref.entity_id = 'rule:combat-same-time-reaction';
    reaction.policy_ref.entity_ref.entity_id =
      'policy:combat-same-time-reaction';
    state.temporal_boundary_candidates = [external, reaction];
    let reactionObservedBlocked = false;
    const temporalAdvanceOwner = createTemporalAdvanceOwner({
      source_registrations: [{ rule_ref: external.rule_ref,
        policy_ref: external.policy_ref,
        resolve(_candidate, { projection }) {
          const next = structuredClone(projection);
          next.same_time_hazard_resolved = true;
          return { disposition: 'execute', proposals: [],
            state_projection: next, follow_up_candidates: [] };
        } }, { rule_ref: reaction.rule_ref, policy_ref: reaction.policy_ref,
        resolve(_candidate, { projection }) {
          const current = projection.combat_sessions.find(
            ({ combat_id: id }) => id === combatId).participant_states[0]
            .current_intent;
          assert.equal(current.status, 'invalidated');
          reactionObservedBlocked = true;
          return { disposition: 'execute', proposals: [],
            state_projection: projection, follow_up_candidates: [] };
        } }], effect_registrations:
        lowerDvinaTraceCombatTemporalEffectRegistrations() });
    const result = await prepareCombatExchange({ session,
      working_state: { ...projectTraceCombatWorkingState(state),
        combat_sessions: [structuredClone(session)],
        temporal_boundary_candidates: [external, reaction] },
      occurred_at: state.clock,
      idempotency_key: 'phase4-combat-same-time',
      random_source: { next: () => 0.5 }, ports: {
        advanceTemporalSlice: createTraceCombatTemporalSliceOwner({
          temporalAdvanceOwner, partyId: state.party_id,
          rootTurnId: 'turn:phase4-combat-same-time',
          idempotencyKey: 'phase4-combat-same-time' }),
        resolveCombatTiming: () => ({ occurred_at: state.clock,
          exact_duration: { exact_minutes: { numerator: '2',
            denominator: '1' } }, timing_profile_ref: 'hold-2m' }),
        orderTechnicalSteps: (input) => orderCombatTechnicalSteps(input),
        resolveExecutionProfile: ({ working_state: working }) => ({
          applicable: working.same_time_hazard_resolved !== true,
          preconditions_digest: 'b'.repeat(64), check_request: null,
          position_plan: { movement_ref: 'same-time-test-route' } }),
        applyItemTransitions: ({ working_state: working }) => ({
          working_state: working }),
        applyPositionTransitions: ({ working_state: working }) => ({
          working_state: working }),
        resolvePerceptionAndDecisionContexts: async ({ session: current,
          working_state: working }) => ({ session_after: current,
          working_state: working, signal_records: [] })
      } });
    const combat = result.prepared;
    const processed = combat.temporal_advance_results[0]
      .trace.processed_boundary_ids;
    assert.equal(processed.length, 3);
    assert.equal(processed[0], external.boundary_id);
    assert.match(processed[1], /^combat-step:/);
    assert.equal(processed[2], reaction.boundary_id);
    assert.equal(reactionObservedBlocked, true);
    assert.equal(combat.outcome_events.some(({ event_kind: kind,
      actor_ref: actor }) => kind === 'combat_step_blocked'
        && actor.entity_id === state.actor_id), true);
  });

function boundary(state, scheduledAt) {
  const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
  return { boundary_id: 'boundary:combat-external-recheck',
    boundary_kind: 'exact_timer', scheduled_at: scheduledAt,
    source_ref: ref('party_route_plan_execution_event',
      'timer:combat-external-recheck'),
    primary_subject_ref: ref('actor', state.actor_id), subject_refs: [],
    scope_ref: ref('party', state.party_id),
    rule_ref: { entity_ref: ref('action_contract',
      'rule:combat-external-recheck'), authoring_version: '1' },
    policy_ref: { entity_ref: ref('activity_contract',
      'policy:combat-external-recheck'), authoring_version: '1' },
    preconditions_digest: 'a'.repeat(64),
    resolution_class: 'execution_outcome', interrupt_effect: 'hard_interrupt',
    visibility_policy_ref: { entity_ref: ref('visibility_modifier',
      'visible:combat-external-recheck'), authoring_version: '1' },
    idempotency_key: 'timer:combat-external-recheck:1',
    causal_parent_refs: [] };
}

function holdPlan(request, state, shed) {
  return { schema: 'turn_step_plan_v1', request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision, step_index: request.step_index,
    interpretation: { player_goal: request.root_player_action,
      grounded_attempt: request.remaining_intent, adaptation: 'literal' },
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{ op: 'request_combat', actor_ref: state.actor_id,
      intent_kind: 'hold', target_refs: [], protected_refs: [],
      scope_ref: shed.location_profile_ref, destination_ref: null,
      force_limit: 'avoid_harm', risk_posture: 'ordinary' }],
    check: null, continuation: null, clarification: null,
    reason_code: 'combat_response',
    reason: 'Сохранить позицию до ближайшей временной границы.' };
}
