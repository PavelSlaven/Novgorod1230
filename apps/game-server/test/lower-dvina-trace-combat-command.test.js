import assert from 'node:assert/strict';
import test from 'node:test';
import {
  combatIntentFromPlan,
  createCombatSession,
  installCombatIntent
} from '@rus/turn';
import { createTraceCombatCommand } from
  '../src/runtime/lower-dvina-trace-combat-command.js';

const at = { whole_minutes: '620', subminute_numerator: '0',
  subminute_denominator: '1' };
const player = { entity_kind: 'player_character', entity_id: 'mikula-1' };
const ratsha = { entity_kind: 'npc', entity_id: 'ratsha-1' };

test('player combat response resolves one common two-minute exchange', async () => {
  let session = createCombatSession({ combat_id: 'combat-party-1-ratsha',
    started_at: at, scope_ref: { entity_kind: 'location', entity_id: 'shed' },
    participant_refs: [player, ratsha] });
  session = installCombatIntent(session, combatIntentFromPlan({
    combat_id: session.combat_id, npc_ref: ratsha,
    operation: { op: 'set_combat_intent', intent_kind: 'engage',
      target_refs: [player], protected_refs: [], scope_ref: null,
      destination_ref: null, force_limit: 'ordinary', risk_posture: 'ordinary' }
  }, { intent_id: 'ratsha-intent', created_from_boundary_ref: {
    entity_kind: 'npc_decision_boundary', entity_id: 'ratsha-boundary' },
  state_version: '1' }));
  session = { ...structuredClone(session), status: 'paused_for_player',
    player_response_required: true };
  const state = { party_id: 'party-1', actor_id: 'mikula-1', clock: at,
    party_state: { state_version: 7, turn_number: 3 },
    body_state: { health: 100, energy: 80, satiety: 70,
      active_conditions: [], body_parts: {}, prose: null },
    npcs: [{ instance_id: 'ratsha-1',
      participant_slot_ref: 'ratsha_storehouse_helper',
      machine_state: { body_condition: { health: 100 } } }],
    combat_sessions: [session] };
  const bundle = { definition_revision: 16,
    turn_step_bindings: { player_execution_profiles: [{
      profile_id: 'player-control', intent_kind: 'control', status: 'approved',
      allowed_force_limits: ['nonlethal_if_possible'],
      allowed_risk_postures: ['ordinary'], check_request: {
        attribute_value: 12, skill_bonus: 1, target_defense: 12,
        weapon_danger: 0, target_protection: 0, target_vulnerability: 0 }
    }] }, combat_semantic_bindings: { exchange_timing_profile: {
      profile_id: 'combat-exchange-2m', status: 'approved',
      duration_minutes: 2 }, phase_4: {
      actor_slot: 'ratsha_storehouse_helper', scope_location_ref: 'shed',
      operation_contract: {}, execution_profiles: [{ profile_id: 'ratsha-engage',
        intent_kind: 'engage', status: 'approved', check_request: {
          attribute_value: 12, skill_bonus: 1, target_defense: 30,
          weapon_danger: 1, target_protection: 0, target_vulnerability: 0 } }] } } };
  const command = createTraceCombatCommand({ state, bundle,
    inputDigest: 'digest', randomSource: { next: () => 0.5 },
    npcCombatModel: async () => assert.fail('ordinary exchange needs no LLM'),
    revalidateStateVersion: async () => 7 });
  const result = await command.consequence({ retrievedState: state,
    rootTurnId: 'turn:party-1:4', playerInput: {
      request_id: 'request-1', idempotency_key: 'idem-1' },
    semanticPlan: { operations: [{ op: 'request_combat',
      actor_ref: 'mikula-1', intent_kind: 'control', target_refs: ['ratsha-1'],
      protected_refs: [], scope_ref: null, destination_ref: null,
      force_limit: 'nonlethal_if_possible', risk_posture: 'ordinary' }] } });
  assert.equal(result.combat_kind, 'exchange');
  assert.equal(result.duration_minutes, 2);
  assert.equal(result.combat.session_after.exchange_ordinal, 1);
  assert.equal(result.combat.session_after.status, 'paused_for_player');
  assert.equal(result.combat.check_results.length, 2);
});
