import assert from 'node:assert/strict';
import test from 'node:test';
import { createCombatSession } from '@rus/turn';
import { combatWrites } from
  '../src/infrastructure/postgres/lower-dvina-trace-combat-writes.js';
import { expectedVersions } from
  '../src/infrastructure/postgres/lower-dvina-trace-combat-commit.js';
import { withSceneNpcs } from
  '../src/infrastructure/postgres/scene-npcs-readback.js';

test('combat body write preserves a first-entry NPC legacy anchor', () => {
  const player = { entity_kind: 'player_character', entity_id: 'player-1' };
  const npc = { entity_kind: 'npc', entity_id: 'npc-1' };
  const session = createCombatSession({ combat_id: 'combat-1',
    started_at: stamp(), scope_ref: { entity_kind: 'location', entity_id: 'camp' },
    participant_refs: [player, npc] });
  const state = { actor_id: player.entity_id,
    party_state: { body_state_version: 1 }, body_state: { health: 100 },
    clock: stamp(), knowledge: [], items: [], combat_sessions: [session],
    npcs: [{ instance_id: npc.entity_id, anchor_id: 'scene-anchor:not-a-g5',
      machine_state: { body_condition: { health: 100 } } }] };
  const next = { ...structuredClone(state), party_state: {
    ...state.party_state, state_version: 2, body_state_version: 1 },
  npcs: [{ ...state.npcs[0], machine_state: {
    body_condition: { health: 90 } } }] };
  const writes = combatWrites({ partyId: 'party-1', state, next,
    factual: { player_input: { idempotency_key: 'combat' },
      mode_resolution: { turn_id: 'turn-1', decision_trace: {} },
      time_update: { clock_after: stamp() }, consequence: { combat: {
        session_after: { ...session, state_version: '2', exchange_ordinal: 1 },
        check_results: [], outcome_events: [], position_transitions: [],
        body_transitions: [], decision_records: [], signal_records: [] } } },
    turnNumber: 2, changeSetId: 'change-1', idemId: 'idem-1',
    visibleEnvelope: {}, pendingScreen: {} });
  const npcWrite = writes.updates.find(({ target_table, id }) =>
    target_table === 'party_npcs' && id === npc.entity_id);
  assert.deepEqual(npcWrite.record, { party_id: 'party-1',
    npc_id: npc.entity_id, machine_state: { body_condition: { health: 90 } } });
});

test('combat body histories have stable distinct idempotency records', () => {
  const player = { entity_kind: 'player_character', entity_id: 'player-1' };
  const npc = { entity_kind: 'npc', entity_id: 'npc-1' };
  const session = createCombatSession({ combat_id: 'combat-1',
    started_at: stamp(), scope_ref: { entity_kind: 'location', entity_id: 'camp' },
    participant_refs: [player, npc] });
  const writes = combatWrites({ partyId: 'party-1', state: {
    actor_id: player.entity_id, party_state: { body_state_version: 1 },
    body_state: { health: 100 }, clock: stamp(), knowledge: [], items: [],
    combat_sessions: [session], npcs: []
  }, next: { party_state: { state_version: 2, body_state_version: 1 },
    clock: stamp() }, factual: {
    player_input: { idempotency_key: 'combat' },
    mode_resolution: { turn_id: 'turn-1', decision_trace: {} },
    time_update: { clock_after: stamp() }, consequence: { combat: {
      session_after: { ...session, state_version: '2', exchange_ordinal: 1 },
      check_results: [], outcome_events: [], position_transitions: [],
      decision_records: [], signal_records: [], body_transitions: [
        { actor_ref: player, threshold_crossings: [] },
        { actor_ref: npc, threshold_crossings: [] }
      ]
    } }
  }, turnNumber: 2, changeSetId: 'change-1', idemId: 'idem-1',
  visibleEnvelope: {}, pendingScreen: {} });
  const history = writes.appends.filter(({ target_table }) =>
    target_table === 'party_body_temporal_history').map(({ record }) =>
    ({ id: record.history_id, idempotency: record.idempotency_record_id }));
  const ids = history.map(({ idempotency }) => idempotency);
  assert.deepEqual(ids, ['idem-1:combat-body:0', 'idem-1:combat-body:1']);
  assert.deepEqual(history.map(({ id }) => id), [
    'body-history:party-1:combat:combat-1:1:0',
    'body-history:party-1:combat:combat-1:1:1'
  ]);
});

test('combat first P16 persists participant body and updates persisted body row', async () => {
  const player = { entity_kind: 'player_character', entity_id: 'player-1' };
  const npc = { entity_kind: 'npc', entity_id: 'npc-1' };
  const session = createCombatSession({ combat_id: 'combat-1',
    started_at: stamp(), scope_ref: { entity_kind: 'location', entity_id: 'camp' },
    participant_refs: [player, npc] });
  const baseState = { actor_id: player.entity_id,
    party_state: { body_state_version: 1 }, body_state: { health: 100 },
    clock: stamp(), knowledge: [], items: [], combat_sessions: [session] };
  const factual = { player_input: { idempotency_key: 'combat' },
    mode_resolution: { turn_id: 'turn-1', decision_trace: {} },
    time_update: { clock_after: stamp() }, consequence: { combat: {
      session_after: { ...session, state_version: '2', exchange_ordinal: 1 },
      check_results: [], outcome_events: [], position_transitions: [],
      decision_records: [], signal_records: [], body_transitions: [],
      working_state_after: { npcs: [{ instance_id: npc.entity_id,
        body_profile_ref: { entity_ref: { entity_kind: 'body_state_profile',
          entity_id: npc.entity_id }, authoring_version: 'v1' } }],
      actor_states: { [`npc:${npc.entity_id}`]: { body_state: {
        health: 80, energy: 70, satiety: 60 } } } }
    } } };
  const writesFor = (priorNpc, exchangeFactual = factual,
    priorSession = session) => combatWrites({ partyId: 'party-1',
    state: { ...baseState, combat_sessions: [priorSession], npcs: [priorNpc] },
    next: { party_state: { state_version: 2, body_state_version: 1 },
      clock: stamp(), npcs: [priorNpc] }, factual: exchangeFactual,
    turnNumber: 2, changeSetId: 'change-1', idemId: 'idem-1',
    visibleEnvelope: {}, pendingScreen: {} });

  const inserted = writesFor({ instance_id: npc.entity_id,
    machine_state: {}, body_state_persisted: false });
  assert.deepEqual(inserted.inserts.find(({ target_table }) =>
    target_table === 'party_actor_body_states').record, {
    party_id: 'party-1', actor_kind: 'npc', actor_id: 'npc-1',
    body_profile_ref: factual.consequence.combat.working_state_after.npcs[0]
      .body_profile_ref, health: 80, energy: 70, satiety: 60,
    updated_change_set_id: 'change-1'
  });
  assert.equal(inserted.updates.some(({ target_table }) =>
    target_table === 'party_actor_body_states'), false);

  const profileRef = factual.consequence.combat.working_state_after.npcs[0]
    .body_profile_ref;
  const reloaded = await withSceneNpcs({ query: async () => ({ rows: [{
    actor_id: npc.entity_id, body_profile_ref: profileRef,
    health: '80', energy: '70', satiety: '60', body_state_version: '1'
  }] }) }, 'party-1', { npcs: [{ instance_id: npc.entity_id,
    machine_state: {},
    body_state_profile: { schema: 'test-profile' },
    body_state_persisted: false }],
  combat_sessions: [session] });
  assert.equal(reloaded.npcs[0].body_state_persisted, true);
  assert.equal(reloaded.npcs[0].body_state_version, 1);
  assert.deepEqual(reloaded.npcs[0].body_state,
    { health: 80, energy: 70, satiety: 60 });

  const secondFactual = structuredClone(factual);
  const firstSession = { ...session, state_version: '2', exchange_ordinal: 1,
    last_exchange_ref: { entity_kind: 'combat_exchange',
      entity_id: 'combat-exchange:1' } };
  secondFactual.consequence.combat.session_after = { ...firstSession,
    state_version: '3', exchange_ordinal: 2,
    last_exchange_ref: { entity_kind: 'combat_exchange',
      entity_id: 'combat-exchange:2' } };
  secondFactual.consequence.combat.working_state_after.actor_states[
    `npc:${npc.entity_id}`].body_state.health = 65;
  const updated = writesFor(reloaded.npcs[0], secondFactual, firstSession);
  assert.deepEqual(expectedVersions({ partyId: 'party-1',
    state: { ...baseState, combat_sessions: [firstSession],
      npcs: [reloaded.npcs[0]] }, factual: secondFactual
  }).filter(({ target_table }) =>
    target_table === 'party_actor_body_states'), [{
    target_table: 'party_actor_body_states', id: `npc:${npc.entity_id}`,
    state_version: 1
  }]);
  assert.equal(updated.inserts.some(({ target_table }) =>
    target_table === 'party_actor_body_states'), false);
  assert.deepEqual(updated.updates.find(({ target_table }) =>
    target_table === 'party_actor_body_states').record, {
    party_id: 'party-1', actor_kind: 'npc', actor_id: npc.entity_id,
    body_profile_ref: profileRef, health: 65, energy: 70,
    satiety: 60, updated_change_set_id: 'change-1'
  });
});

test('combat expected body version applies only to persisted participant row', () => {
  const player = { entity_kind: 'player_character', entity_id: 'player-1' };
  const npc = { entity_kind: 'npc', entity_id: 'npc-1' };
  const session = createCombatSession({ combat_id: 'combat-1',
    started_at: stamp(), scope_ref: { entity_kind: 'location', entity_id: 'camp' },
    participant_refs: [player, npc] });
  const expectedFor = (npcState) => expectedVersions({ partyId: 'party-1',
    state: { actor_id: player.entity_id, party_state: { state_version: 1,
      session_state_version: 1, clock_state_version: 1, body_state_version: 1 },
    combat_sessions: [session], npcs: [npcState] },
    factual: { consequence: { combat: { session_after: session,
      body_transitions: [], position_transitions: [], working_state_after: {
        actor_states: { [`npc:${npc.entity_id}`]: { body_state: {
          health: 80, energy: 50, satiety: 40 } } }
      } } } } });
  const persisted = expectedFor({ instance_id: npc.entity_id,
    body_state_persisted: true, body_state_version: 4,
    body_state: { health: 90, energy: 50, satiety: 40 } });
  assert.deepEqual(persisted.filter(({ target_table }) =>
    target_table === 'party_actor_body_states'), [{ target_table:
      'party_actor_body_states', id: 'npc:npc-1', state_version: 4 }]);

  const firstWrite = expectedFor({ instance_id: npc.entity_id,
    body_state_persisted: false });
  assert.equal(firstWrite.some(({ target_table, id }) =>
    target_table === 'party_actor_body_states' && id === 'npc:npc-1'), false);
});

function stamp() { return { whole_minutes: '1', subminute_numerator: '0',
  subminute_denominator: '1' }; }
