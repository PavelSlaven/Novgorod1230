import assert from 'node:assert/strict';
import test from 'node:test';
import {
  combatIntentFromPlan,
  createCombatSession,
  installCombatIntent
} from '@rus/turn';
import { createTemporalAdvanceOwner } from '@rus/turn/temporal-advance';
import { createTraceCombatCommand, traceCombatTargetRefs } from
  '../src/runtime/lower-dvina-trace-combat-command.js';
import { lowerDvinaTraceCombatTemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-combat-temporal-effect-owner.js';
import { projectTraceCombatSubjectiveState } from
  '../src/runtime/lower-dvina-trace-combat-subjective.js';

const at = { whole_minutes: '620', subminute_numerator: '0',
  subminute_denominator: '1' };
const player = { entity_kind: 'player_character', entity_id: 'mikula-1' };
const ratsha = { entity_kind: 'npc', entity_id: 'ratsha-1' };

test('combat target projection selects the active hostile intent', () => {
  const ally = { entity_kind: 'npc', entity_id: 'ally-1' };
  const hostile = { entity_kind: 'npc', entity_id: 'hostile-1' };
  assert.equal(traceCombatTargetRefs({ combat_sessions: [{
    status: 'paused_for_player', scope_ref: { entity_id: 'shed' },
    participant_refs: [player, ally, hostile], participant_states: [{
      actor_ref: ally, combat_status: 'active', current_intent: {
        intent_kind: 'control' }
    }, { actor_ref: hostile, combat_status: 'active', current_intent: {
      intent_kind: 'engage' }
    }]
  }] }).activeHostileNpc, 'hostile-1');
});

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
    temporalAdvanceOwner: combatTemporalOwner(),
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
  assert.equal(result.combat.technical_step_timings.length, 2);
  assert.equal(result.combat.technical_step_timings.every(({ exact_duration }) =>
    exact_duration.exact_minutes.numerator === '2'), true);
});

test('post-exchange subjective projection reads body and equipment from working state',
  () => {
    const state = {
      npcs: [{ instance_id: 'ratsha-1',
        participant_slot_ref: 'ratsha_storehouse_helper',
        machine_state: { body_condition: { health: 100 } } }],
      actor_states: { 'npc:ratsha-1': { body_state: { health: 63 } } },
      items: [{ item_id: 'knife-1', placement: {
        holder_npc_id: 'ratsha-1' }, ownership: {
        controller_npc_id: 'ratsha-1' } }, { item_id: 'axe-1', placement: {
        holder_npc_id: 'other-npc' }, ownership: {
        controller_npc_id: 'other-npc' } }]
    };
    const projected = projectTraceCombatSubjectiveState(ratsha, state);
    assert.equal(projected.body.health, 63);
    assert.deepEqual(projected.available_equipment, [{
      entity_kind: 'item', entity_id: 'knife-1' }]);
  });

test('incapacitated NPC does not require an LLM while other hostility continues',
  async () => {
    const firstNpc = { entity_kind: 'npc', entity_id: 'ratsha-1' };
    const secondNpc = { entity_kind: 'npc', entity_id: 'ratsha-2' };
    let current = createCombatSession({ combat_id: 'combat-party-2',
      started_at: at, scope_ref: { entity_kind: 'location', entity_id: 'shed' },
      participant_refs: [player, firstNpc, secondNpc] });
    for (const npc of [firstNpc, secondNpc]) {
      current = installCombatIntent(current, combatIntentFromPlan({
        combat_id: current.combat_id, npc_ref: npc,
        operation: { op: 'set_combat_intent', intent_kind: 'engage',
          target_refs: [player], protected_refs: [], scope_ref: null,
          destination_ref: null, force_limit: 'ordinary',
          risk_posture: 'ordinary' }
      }, { intent_id: `intent-${npc.entity_id}`,
        created_from_boundary_ref: { entity_kind: 'npc_decision_boundary',
          entity_id: `boundary-${npc.entity_id}` }, state_version: '1' }));
    }
    current = { ...structuredClone(current), status: 'paused_for_player',
      player_response_required: true };
    const state = { party_id: 'party-2', actor_id: 'mikula-1', clock: at,
      party_state: { state_version: 3, turn_number: 1 },
      body_state: { health: 100, energy: 80, satiety: 70,
        active_conditions: [], body_parts: {}, prose: null },
      npcs: [firstNpc, secondNpc].map((npc, index) => ({
        instance_id: npc.entity_id,
        participant_slot_ref: 'ratsha_storehouse_helper',
        machine_state: { body_condition: { health: index === 0 ? 5 : 100 } }
      })), combat_sessions: [current] };
    const attack = { attribute_value: 20, skill_bonus: 0,
      target_defense: 1, weapon_danger: 4, target_protection: 0,
      target_vulnerability: 0 };
    const bundle = { definition_revision: 16,
      turn_step_bindings: { player_execution_profiles: [{
        profile_id: 'player-engage', intent_kind: 'engage', status: 'approved',
        allowed_force_limits: ['ordinary'],
        allowed_risk_postures: ['ordinary'], check_request: attack
      }] }, combat_semantic_bindings: { exchange_timing_profile: {
        profile_id: 'combat-exchange-2m', status: 'approved',
        duration_minutes: 2 }, phase_4: {
        actor_slot: 'ratsha_storehouse_helper', scope_location_ref: 'shed',
        operation_contract: {}, execution_profiles: [{
          profile_id: 'ratsha-engage', intent_kind: 'engage',
          status: 'approved', check_request: attack }] } } };
    const command = createTraceCombatCommand({ state, bundle,
      inputDigest: 'digest-2', randomSource: { next: () => 0.99 },
      temporalAdvanceOwner: combatTemporalOwner(),
      npcCombatModel: async () => assert.fail(
        'incapacitated NPC must not receive a combat decision'),
      revalidateStateVersion: async () => 3 });
    const result = await command.consequence({ retrievedState: state,
      rootTurnId: 'turn:party-2:2', playerInput: {
        request_id: 'request-2', idempotency_key: 'idem-2' },
      semanticPlan: { operations: [{ op: 'request_combat',
        actor_ref: 'mikula-1', intent_kind: 'engage',
        target_refs: ['ratsha-1'], protected_refs: [], scope_ref: null,
        destination_ref: null, force_limit: 'ordinary',
        risk_posture: 'ordinary' }] } });
    assert.equal(result.combat.session_after.status, 'paused_for_player');
    assert.equal(result.combat.session_after.participant_states.find(
      ({ actor_ref: actor }) => actor.entity_id === 'ratsha-1')
      .combat_status, 'incapacitated');
    assert.equal(result.combat.check_results.length, 2);
    assert.deepEqual(result.combat.decision_results, []);
  });

function combatTemporalOwner() {
  return createTemporalAdvanceOwner({ effect_registrations:
    lowerDvinaTraceCombatTemporalEffectRegistrations() });
}
