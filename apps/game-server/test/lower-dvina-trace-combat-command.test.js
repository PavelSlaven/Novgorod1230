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
import { classifyTraceActionProducedWeapon,
  createLowerDvinaTraceActionProducedWeaponClassifier,
  resolveTraceOrdinaryWeaponDanger } from
  '../src/runtime/lower-dvina-trace-combat-ordinary-weapon.js';
import { createLlmRoleRunnerAdapter } from
  '../src/adapters/llm-role-runner.js';
import { lowerDvinaTraceCombatTemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-combat-temporal-effect-owner.js';
import { projectTraceCombatSubjectiveState } from
  '../src/runtime/lower-dvina-trace-combat-subjective.js';
import { ORDINARY_ARMAMENT_MECHANICS_CAPABILITY,
  resolveOrdinaryArmamentMechanics } from '@rus/combat-health';
import { createOrdinaryWorldRuntimeInstanceMechanicsSnapshot } from
  '@rus/items-property';

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
    items: [{ item_id: 'ordinary-spear', placement: {
      holder_character_id: 'mikula-1' }, state: {
      weapon_mechanics_snapshot: resolveOrdinaryArmamentMechanics({
        mechanics_capability_ref: ORDINARY_ARMAMENT_MECHANICS_CAPABILITY,
        condition_state: 'serviceable' }) } }], combat_sessions: [session] };
  const bundle = { definition_revision: 22,
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
  assert.equal(result.combat.exchange.technical_steps.find(({ actor_ref }) =>
    actor_ref.entity_id === 'mikula-1').check_request.weapon_danger, 0);
  assert.equal(result.combat.technical_step_timings.length, 2);
  assert.equal(result.combat.technical_step_timings.every(({ exact_duration }) =>
    exact_duration.exact_minutes.numerator === '2'), true);
});

test('combat owner reads a reloaded ordinary armament snapshot', () => {
  const snapshot = resolveOrdinaryArmamentMechanics({
    mechanics_capability_ref: ORDINARY_ARMAMENT_MECHANICS_CAPABILITY,
    condition_state: 'serviceable'
  });
  assert.equal(resolveTraceOrdinaryWeaponDanger([{
    item_id: 'ordinary-spear', placement: { holder_character_id: 'mikula-1' },
    state: { condition_state: 'serviceable',
      weapon_mechanics_snapshot: structuredClone(snapshot) }
  }], player), 1);
  assert.equal(resolveTraceOrdinaryWeaponDanger([{
    item_id: 'broken-spear', placement: { holder_character_id: 'mikula-1' },
    state: { condition_state: 'damaged',
      weapon_mechanics_snapshot: resolveOrdinaryArmamentMechanics({
      mechanics_capability_ref: ORDINARY_ARMAMENT_MECHANICS_CAPABILITY,
      condition_state: 'damaged' }) }
  }], player), null);
  assert.equal(resolveTraceOrdinaryWeaponDanger([{
    item_id: 'forged-spear', placement: { holder_character_id: 'mikula-1' },
    state: { condition_state: 'damaged',
      weapon_mechanics_snapshot: structuredClone(snapshot) }
  }], player), null);
});

test('combat owner classifies current reloaded A1 weapon only at combat use',
  async () => {
    const item = { item_id: 'a1-spear',
      placement: { holder_character_id: 'mikula-1' }, state: {
        condition_state: 'serviceable', ordinary_metadata: {
          name: 'заострённая жердь', semantic_type: 'weapon_capable',
          semantic_facts: [{ fact_id: 'fact:sharp', text: 'конец заострён' }]
        }, action_production: {
          schema: 'rus.items.action_production_item_state.v1',
          output_class: 'written_carrier', physical_form: 'long' } } };
    let calls = 0;
    const classified = await classifyTraceActionProducedWeapon({
      items: [item], actor_ref: player, request_id: 'combat-weapon:1',
      classify: async (request) => {
        calls += 1;
        assert.deepEqual(request.item.physical_facts, ['конец заострён']);
        assert.equal('semantic_type' in request.item, false);
        return { schema:
          'rus.combat.action_produced_weapon_classification.v1',
        request_id: request.request_id,
        qualitative_class: 'improvised_puncture_light' };
      }
    });
    assert.equal(calls, 1);
    assert.equal(resolveTraceOrdinaryWeaponDanger([item], player,
      classified), 1);
    assert.equal(resolveTraceOrdinaryWeaponDanger([{ ...item, state: {
      ...item.state, condition_state: 'damaged' } }], player, classified),
    null);
    const changed = structuredClone(item);
    changed.state.ordinary_metadata.semantic_facts = [{
      fact_id: 'fact:blunt', text: 'конец затуплён' }];
    const blunt = await classifyTraceActionProducedWeapon({ items: [changed],
      actor_ref: player, request_id: 'combat-weapon:changed',
      classify: async (request) => {
        calls += 1;
        assert.deepEqual(request.item.physical_facts, ['конец затуплён']);
        return { schema:
          'rus.combat.action_produced_weapon_classification.v1',
        request_id: request.request_id,
          qualitative_class: 'not_weapon_capable' };
      } });
    assert.equal(calls, 2);
    assert.equal(resolveTraceOrdinaryWeaponDanger([changed], player, blunt),
      undefined);
    const forged = await classifyTraceActionProducedWeapon({ items: [item],
      actor_ref: player, request_id: 'combat-weapon:2',
      classify: async (request) => ({ schema:
        'rus.combat.action_produced_weapon_classification.v1',
      request_id: request.request_id, qualitative_class: 'forged_class',
      weapon_danger: 900 }) });
    assert.equal(forged, null);
  });

test('O1 runtime marker does not block current A1 combat classification',
  async () => {
    const item = actionProducedItem('o1-stick', ['конец заострён'], 'long');
    delete item.state.condition_state;
    item.condition_state = 'ordinary_runtime_instance';
    item.state.runtime_instance_mechanics_snapshot =
      createOrdinaryWorldRuntimeInstanceMechanicsSnapshot({
      schema: 'rus.items.runtime_instance_mechanics_snapshot.v2', version: 2,
      provenance: { source_kind: 'ordinary_world_materialization',
        causal_ref: 'ordinary:o1-stick', request_id: 'request:o1-stick',
        candidate_key: 'candidate:o1-stick', coverage_key: 'coverage:o1-stick',
        context_version: 'context:1', policy_ref: 'policy:o1',
        source_refs: ['source:wood'] }, mechanics: {
        mass_grams: 700, external_hand_cost: 1, carry_form: 'long',
        packing_slot_cost: 3, quantity: { value: 1, unit: 'item' },
        container: null }
    });
    const result = await classifyTraceActionProducedWeapon({ items: [item],
      actor_ref: player, request_id: 'combat-weapon:o1',
      classify: async (request) => ({ schema:
        'rus.combat.action_produced_weapon_classification.v1',
      request_id: request.request_id,
      qualitative_class: 'improvised_puncture_light' }) });
    assert.equal(result.weapon_danger, 1);
    assert.equal(resolveTraceOrdinaryWeaponDanger([item], player, result), 1);
    const damaged = structuredClone(item);
    damaged.state.condition_state = 'damaged';
    assert.equal(await classifyTraceActionProducedWeapon({ items: [damaged],
      actor_ref: player, request_id: 'combat-weapon:o1-damaged',
      classify: async () => assert.fail('damaged item must fail closed') }),
    null);
  });

test('authored weapon fast path does not invoke semantic classification',
  async () => {
    const snapshot = resolveOrdinaryArmamentMechanics({
      mechanics_capability_ref: ORDINARY_ARMAMENT_MECHANICS_CAPABILITY,
      condition_state: 'serviceable'
    });
    let calls = 0;
    const items = [{ item_id: 'ordinary-spear', placement: {
      holder_character_id: 'mikula-1' }, state: {
      condition_state: 'serviceable', weapon_mechanics_snapshot: snapshot }
    }];
    assert.equal(await classifyTraceActionProducedWeapon({ items,
      actor_ref: player, request_id: 'combat-weapon:exact',
      classify: async () => { calls += 1; } }), null);
    assert.equal(calls, 0);
    assert.equal(resolveTraceOrdinaryWeaponDanger(items, player), 1);
  });

test('held A1 note does not disable the authored weapon fast path',
  async () => {
    const items = [{ item_id: 'ordinary-spear', placement: {
      holder_character_id: 'mikula-1' }, state: {
      condition_state: 'serviceable', weapon_mechanics_snapshot:
        resolveOrdinaryArmamentMechanics({ mechanics_capability_ref:
          ORDINARY_ARMAMENT_MECHANICS_CAPABILITY,
        condition_state: 'serviceable' }) }
    }, actionProducedItem('a1-note', ['на бересте написано имя'], 'compact')];
    let calls = 0;
    assert.equal(await classifyTraceActionProducedWeapon({ items,
      actor_ref: player, request_id: 'combat-weapon:exact-plus-note',
      classify: async () => { calls += 1; } }), null);
    assert.equal(calls, 0);
    assert.equal(resolveTraceOrdinaryWeaponDanger(items, player), 1);
  });

test('combat classifies held A1 items and selects the sole weapon result',
  async () => {
    const spear = actionProducedItem('a1-spear', ['конец заострён'], 'long');
    const note = actionProducedItem('a1-note', ['на бересте написано имя'],
      'compact');
    const seen = [];
    const classified = await classifyTraceActionProducedWeapon({
      items: [spear, note], actor_ref: player,
      request_id: 'combat-weapon:a1-candidates', classify: async (request) => {
        seen.push(request.item.item_ref);
        return { schema:
          'rus.combat.action_produced_weapon_classification.v1',
        request_id: request.request_id,
        qualitative_class: request.item.item_ref === 'a1-spear'
          ? 'improvised_puncture_light' : 'not_weapon_capable' };
      } });
    assert.deepEqual(seen, ['a1-spear', 'a1-note']);
    assert.equal(classified.item_ref, 'a1-spear');
    assert.equal(resolveTraceOrdinaryWeaponDanger([spear, note], player,
      classified), 1);

    const ambiguous = await classifyTraceActionProducedWeapon({
      items: [spear, actionProducedItem('a1-club', ['тяжёлый конец'], 'long')],
      actor_ref: player, request_id: 'combat-weapon:ambiguous',
      classify: async (request) => ({ schema:
        'rus.combat.action_produced_weapon_classification.v1',
      request_id: request.request_id,
      qualitative_class: 'improvised_impact_light' }) });
    assert.equal(ambiguous, null);
  });

test('valid A1 non-weapons resolve as unarmed while classification failures close',
  async () => {
    const note = actionProducedItem('a1-note', ['на бересте написано имя'],
      'compact');
    const token = actionProducedItem('a1-token', ['деревянный счётный знак'],
      'compact');
    const unarmed = await classifyTraceActionProducedWeapon({
      items: [note, token], actor_ref: player,
      request_id: 'combat-weapon:unarmed', classify: async (request) => ({
        schema: 'rus.combat.action_produced_weapon_classification.v1',
        request_id: request.request_id,
        qualitative_class: 'not_weapon_capable'
      })
    });
    assert.deepEqual(unarmed, { item_ref: null, weapon_danger: 0 });
    assert.equal(resolveTraceOrdinaryWeaponDanger([note, token], player,
      unarmed), undefined);

    for (const classify of [
      async (request) => ({ schema:
        'rus.combat.action_produced_weapon_classification.v1',
      request_id: request.request_id, qualitative_class: 'unknown' }),
      async () => { throw new Error('classifier unavailable'); }
    ]) {
      const failed = await classifyTraceActionProducedWeapon({ items: [note],
        actor_ref: player, request_id: 'combat-weapon:invalid', classify });
      assert.equal(failed, null);
      assert.equal(resolveTraceOrdinaryWeaponDanger([note], player, failed),
        null);
    }
  });

test('production LLM role resolves A1 weapon classification at combat boundary',
  async () => {
    const previousFetch = globalThis.fetch;
    let requestBody = null;
    globalThis.fetch = async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ choices: [{ message: { content:
        JSON.stringify({ schema:
          'rus.combat.action_produced_weapon_classification.v1',
        request_id: 'combat-weapon:production',
        qualitative_class: 'improvised_two_hand_heavy' }) } }] }),
        { status: 200 });
    };
    try {
      const classify = createLowerDvinaTraceActionProducedWeaponClassifier({
        roleRunner: createLlmRoleRunnerAdapter({ env: {
          DEEPSEEK_API_KEY: 'fixture-key',
          DEEPSEEK_BASE_URL: 'https://fixture.invalid'
        } })
      });
      const item = actionProducedItem('a1-spear', ['конец заострён'], 'long');
      const result = await classifyTraceActionProducedWeapon({ items: [item],
        actor_ref: player, request_id: 'combat-weapon:production', classify });
      assert.deepEqual(result, { item_ref: 'a1-spear', weapon_danger: 2 });
      assert.equal(resolveTraceOrdinaryWeaponDanger([item], player, result), 2);
      assert.equal(requestBody.max_tokens, 500);
      assert.equal(requestBody.temperature, 0);
      assert.deepEqual(requestBody.response_format, { type: 'json_object' });
    } finally {
      globalThis.fetch = previousFetch;
    }
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
      })), items: [{ item_id: 'crafted-pole', placement: {
      holder_character_id: 'mikula-1' }, state: { condition_state: 'serviceable',
        ordinary_metadata: { name: 'заострённая жердь',
          semantic_type: 'weapon_capable', semantic_facts: [{
            fact_id: 'fact:sharp', text: 'конец заострён' }] },
        action_production: {
          schema: 'rus.items.action_production_item_state.v1',
          output_class: 'weapon_capable', physical_form: 'long' } } }],
      combat_sessions: [current] };
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
    let weaponClassifierCalls = 0;
    const command = createTraceCombatCommand({ state, bundle,
      inputDigest: 'digest-2', randomSource: { next: () => 0.99 },
      temporalAdvanceOwner: combatTemporalOwner(),
      actionProducedWeaponClassifier: async (request) => {
        weaponClassifierCalls += 1;
        assert.deepEqual(request.item.physical_facts, ['конец заострён']);
        return { schema:
          'rus.combat.action_produced_weapon_classification.v1',
        request_id: request.request_id,
        qualitative_class: 'improvised_puncture_light' };
      },
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
    assert.equal(result.combat.exchange.technical_steps.find(({ actor_ref }) =>
      actor_ref.entity_id === 'mikula-1').check_request.weapon_danger, 1);
    assert.equal(weaponClassifierCalls, 1);
    assert.deepEqual(result.combat.decision_results, []);

    const unarmedState = structuredClone(state);
    unarmedState.items = [actionProducedItem('a1-note',
      ['на бересте написано имя'], 'compact')];
    const unarmedBundle = structuredClone(bundle);
    unarmedBundle.turn_step_bindings.player_execution_profiles[0]
      .check_request.weapon_danger = 0;
    const unarmedCommand = createTraceCombatCommand({ state: unarmedState,
      bundle: unarmedBundle, inputDigest: 'digest-unarmed',
      randomSource: { next: () => 0.99 },
      temporalAdvanceOwner: combatTemporalOwner(),
      actionProducedWeaponClassifier: async (request) => ({ schema:
        'rus.combat.action_produced_weapon_classification.v1',
      request_id: request.request_id,
      qualitative_class: 'not_weapon_capable' }),
      npcCombatModel: async () => assert.fail(
        'unarmed profile must remain applicable without NPC reroll'),
      revalidateStateVersion: async () => 3 });
    const unarmedResult = await unarmedCommand.consequence({
      retrievedState: unarmedState, rootTurnId: 'turn:party-2:unarmed',
      playerInput: { request_id: 'request-unarmed',
        idempotency_key: 'idem-unarmed' }, semanticPlan: { operations: [{
        op: 'request_combat', actor_ref: 'mikula-1', intent_kind: 'engage',
        target_refs: ['ratsha-1'], protected_refs: [], scope_ref: null,
        destination_ref: null, force_limit: 'ordinary',
        risk_posture: 'ordinary' }] } });
    assert.equal(unarmedResult.combat.exchange.technical_steps.find(
      ({ actor_ref: actor }) => actor.entity_id === 'mikula-1')
      .check_request.weapon_danger, 0);
  });

function combatTemporalOwner() {
  return createTemporalAdvanceOwner({ effect_registrations:
    lowerDvinaTraceCombatTemporalEffectRegistrations() });
}

function actionProducedItem(itemId, facts, physicalForm) {
  return { item_id: itemId,
    placement: { holder_character_id: 'mikula-1' }, state: {
      condition_state: 'serviceable', ordinary_metadata: {
        name: itemId, semantic_type: 'ordinary_object',
        semantic_facts: facts.map((text, index) => ({
          fact_id: `${itemId}:fact:${index + 1}`, text }))
      }, action_production: {
        schema: 'rus.items.action_production_item_state.v1',
        physical_form: physicalForm } } };
}
