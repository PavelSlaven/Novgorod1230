import assert from 'node:assert/strict';
import test from 'node:test';
import { nextPhase4State } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-4-state.js';
import { routeToShedEffect } from
  '../src/runtime/lower-dvina-trace-phase-4-effects.js';
import { phase4Writes } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-4-write-projection.js';
import { initializeTracePhase4Combat } from
  '../src/runtime/lower-dvina-trace-phase-4-combat-initialization.js';
import { resolveTracePhase4Contracts } from
  '../src/runtime/lower-dvina-trace-phase-4-contracts.js';
import { projectLowerDvinaTraceS1Capability } from
  '../src/runtime/releases/lower-dvina-trace-s1-production.js';
import {
  digest,
  phase4ArrivalState,
  phase4Factual,
  phase3State,
  ref,
  revision14Bundle,
  runPhase4
} from './lower-dvina-trace-m2-conversation-fixture.js';

test('Phase 4 shed handoff drops stale camp S1 position marker', () => {
  const state = phase3State();
  state.position = { ...state.position, position_id: 'position:camp',
    g6_id: 'g6:camp' };
  state.spatial_semantic = [{ envelope_ref: 'envelope:camp',
    status: 'committed', capacity_total: 1, consumed_count: 0,
    envelope: { position_ref: 'position:camp' }, resolutions: [] }];
  state.route_knowledge = ['trace_ld_v1_route_camp_to_shed'];
  const contracts = resolveTracePhase4Contracts({ state,
    bundle: revision14Bundle });
  const factual = {
    player_input: { request_id: 'request:phase4-shed',
      idempotency_key: 'idempotency:phase4-shed', raw_text: 'Идти к сушильне.' },
    mode_resolution: { option_id: contracts.ids.routeOption,
      decision_trace: { action_set_digest: 'phase4-shed' } },
    consequence: routeToShedEffect({ contracts, inputDigest: digest('s'), state,
      playerInput: { idempotency_key: 'idempotency:phase4-shed' } })
  };
  factual.time_update = { clock_after:
    factual.consequence.movement.traversal.clock_update.world_time_after };
  const next = nextPhase4State({ state, factual,
    nextVersion: state.party_state.state_version + 1,
    turnNumber: state.party_state.turn_number + 1, inputDigest: digest('s'),
    changeSetId: 'change:phase4-shed', contracts,
    rootTurnId: 'turn:phase4-shed', workingRevision: 0 });

  assert.equal(next.position.location_ref, contracts.ids.shed);
  assert.equal(Object.hasOwn(next.position, 'position_id'), false);
  assert.equal(Object.hasOwn(next.position, 'g6_id'), false);
  assert.deepEqual(next.route_history.at(-1), {
    route_ref: 'trace_ld_v1_route_camp_to_shed',
    activity_ref: 'trace_ld_v1_activity_route_to_drying_shed',
    started_at: factual.consequence.movement.traversal.clock_before,
    ended_at: factual.time_update.clock_after,
    change_set_id: 'change:phase4-shed'
  });
  const writes = phase4Writes({ partyId: state.party_id, state, next, factual,
    visibleEnvelope: null, pendingScreen: null,
    nextVersion: next.party_state.state_version,
    turnNumber: next.party_state.turn_number, changeSetId: 'change:phase4-shed',
    idemId: 'idem:phase4-shed', contracts, scenarioRevision: 14 });
  assert.equal(writes.updates.find(({ target_table: table }) =>
    table === 'party_positions').record.g5_anchor_id,
  next.position.g5_anchor_id);
  assert.equal(Object.hasOwn(projectLowerDvinaTraceS1Capability({
    playerSafeState: { known_context: [] }, committedState: next,
    resolverAvailable: true
  }), 'spatial_semantic'), false);
  state.journey_location = { id: 'journey:camp', state_version: 1 };
  const firstEntryWrites = phase4Writes({ partyId: state.party_id, state, next,
    factual, visibleEnvelope: null, pendingScreen: null,
    nextVersion: next.party_state.state_version,
    turnNumber: next.party_state.turn_number, changeSetId: 'change:phase4-shed',
    idemId: 'idem:phase4-shed', contracts, scenarioRevision: 14,
    firstEntry: { operation_kind: 'first_entry' } });
  assert.equal([...firstEntryWrites.updates, ...firstEntryWrites.deletes].some(
    ({ target_table: table }) => table === 'party_journey_locations'
  ), false, 'the lifecycle owns the initial journey row');
  const reentryWrites = phase4Writes({ partyId: state.party_id, state, next,
    factual, visibleEnvelope: null, pendingScreen: null,
    nextVersion: next.party_state.state_version,
    turnNumber: next.party_state.turn_number, changeSetId: 'change:phase4-shed',
    idemId: 'idem:phase4-shed', contracts, scenarioRevision: 14,
    firstEntry: {} });
  assert.equal([...reentryWrites.updates, ...reentryWrites.deletes].some(
    ({ target_table: table }) => table === 'party_journey_locations'
  ), true, 'a prepared member uses the ordinary journey owner');

  const memberOneState = structuredClone(state);
  memberOneState.first_entry_spatial_v3 = { members: [{ target: {
    position_id: 'position:shed', g6_instance_id: 'g6:shed'
  } }] };
  memberOneState.first_entry_preparation = { members: [{}, { npcs: [{
    instance_id: 'npc:member-one', anchor_id: 'shed-anchor'
  }] }] };
  const memberOneNext = nextPhase4State({ state: memberOneState, factual,
    nextVersion: memberOneState.party_state.state_version + 1,
    turnNumber: memberOneState.party_state.turn_number + 1,
    inputDigest: digest('member-one'), changeSetId: 'change:member-one',
    contracts, rootTurnId: 'turn:member-one', workingRevision: 0,
    firstEntry: { operation_kind: 'first_entry' } });
  assert.equal(memberOneNext.position.position_id, 'position:shed');
  assert.equal(memberOneNext.position.g6_id, 'g6:shed');
  assert.equal(memberOneNext.npcs.some(({ instance_id: id }) =>
    id === 'npc:member-one'
  ), true);
});

test('Phase 4 combat snapshot keeps authoritative semantic working revision',
  async () => {
    const { state, contracts } = phase4ArrivalState();
    const combatContracts = { ...contracts, combatBindings: {
      scope_location_ref: contracts.ids.shed,
      signal_descriptor: { category: 'objective', significance: 'material',
        perception_required: false },
      operation_contract: {
        allowed_intent_kinds: ['engage', 'break_contact'],
        allowed_force_limits: ['ordinary'],
        allowed_risk_postures: ['ordinary']
      }
    } };
    const inputDigest = digest('b');
    const exchange = await runPhase4({ state, contracts,
      rawText: 'Что ты сделаешь?', inputDigest,
      responseKind: 'combat_handoff', checkResult: null,
      offerStage: null, checkRequest: null });
    const combat = await initializeTracePhase4Combat({
      state, contracts: combatContracts, semanticExchange: exchange.result,
      playerInput: { request_id: `request:${inputDigest.slice(0, 12)}` },
      revalidateStateVersion: async () => state.party_state.state_version,
      npcCombatModel: (request) => combatPlan(request, state.actor_id)
    });
    const factual = phase4Factual({ state, contracts: combatContracts,
      result: exchange.result, inputDigest });
    factual.mode_resolution.turn_id = combat.root_turn_id;
    factual.consequence.negotiation.combat_initialization = combat;
    const next = nextPhase4State({ state, factual,
      nextVersion: state.party_state.state_version + 1,
      turnNumber: state.party_state.turn_number + 1,
      inputDigest, changeSetId: `change:${inputDigest.slice(0, 12)}`,
      contracts: combatContracts,
      rootTurnId: factual.mode_resolution.turn_id,
      workingRevision: 3 });
    const combatRef = next.npc_semantic_decision_refs.find(
      ({ request_id: requestId }) => requestId
        === combat.decision_records[0].request.request_id);
    assert.equal(combatRef.working_revision, 3);
    assert.equal(combatRef.root_turn_id, factual.mode_resolution.turn_id);
  });

function combatPlan(request, playerId) {
  return {
    schema: 'npc_combat_intent_plan_v1',
    request_id: request.request_id,
    boundary_id: request.boundary_id,
    state_version: request.state_version,
    combat_id: request.combat_id,
    npc_ref: request.npc_ref,
    decision: { intent_summary: 'Break away from the confrontation.',
      grounded_goal: 'Reach the visible exit.', adaptation: 'literal' },
    operation: { op: 'set_combat_intent', intent_kind: 'engage',
      target_refs: [ref('player_character', playerId)],
      protected_refs: [], scope_ref: null, destination_ref: null,
      force_limit: 'ordinary', risk_posture: 'ordinary' },
    combat_statement: null,
    reason: 'Ратша готовится удерживать угрозу перед собой.'
  };
}
