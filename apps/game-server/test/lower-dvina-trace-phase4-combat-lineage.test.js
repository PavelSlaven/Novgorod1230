import assert from 'node:assert/strict';
import test from 'node:test';
import { nextPhase4State } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-4-state.js';
import { initializeTracePhase4Combat } from
  '../src/runtime/lower-dvina-trace-phase-4-combat-initialization.js';
import {
  digest,
  phase4ArrivalState,
  phase4Factual,
  ref,
  runPhase4
} from './lower-dvina-trace-m2-conversation-fixture.js';

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
