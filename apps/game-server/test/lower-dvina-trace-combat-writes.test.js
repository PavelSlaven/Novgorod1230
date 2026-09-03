import assert from 'node:assert/strict';
import test from 'node:test';
import { createCombatSession } from '@rus/turn';
import { combatWrites } from
  '../src/infrastructure/postgres/lower-dvina-trace-combat-writes.js';

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

function stamp() { return { whole_minutes: '1', subminute_numerator: '0',
  subminute_denominator: '1' }; }
