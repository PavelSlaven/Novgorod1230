import assert from 'node:assert/strict';
import test from 'node:test';
import { createCombatSession } from '@rus/turn';
import { canonicalDigest } from '@rus/materialization';
import {
  appendCombatSessionWrite,
  hydrateCombatSession
} from '../src/infrastructure/postgres/combat-session-persistence.js';
import { assertCombatSessionRows } from
  '../src/infrastructure/postgres/lower-dvina-trace-combat-read.js';

const at = { whole_minutes: '25', subminute_numerator: '0',
  subminute_denominator: '1' };
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });

test('combat session insert and CAS update hydrate exactly', () => {
  const inserts = [], updates = [];
  const initial = createCombatSession({ combat_id: 'combat-1', started_at: at,
    scope_ref: ref('location', 'storehouse'),
    participant_refs: [ref('npc', 'zhdanko'),
      ref('player_character', 'mikula')] });
  const committedInitial = appendCombatSessionWrite({ inserts, updates,
    partyId: 'party-1', changeSetId: 'change-1', session: initial,
    mode: 'insert' });
  assert.equal(inserts.length, 1);
  assert.deepEqual(hydrateCombatSession(inserts[0].record), committedInitial);

  const next = { ...structuredClone(committedInitial), state_version: '2',
    status: 'paused_for_player', player_response_required: true };
  const committedNext = appendCombatSessionWrite({ inserts, updates,
    partyId: 'party-1', changeSetId: 'change-2', session: next,
    previousSession: committedInitial, mode: 'update' });
  assert.equal(updates.length, 1);
  assert.deepEqual(hydrateCombatSession(updates[0].record), committedNext);
});

test('combat session persistence rejects skipped versions and tampering', () => {
  const inserts = [], updates = [];
  const initial = createCombatSession({ combat_id: 'combat-1', started_at: at,
    scope_ref: ref('location', 'storehouse'),
    participant_refs: [ref('npc', 'zhdanko'),
      ref('player_character', 'mikula')] });
  const committed = appendCombatSessionWrite({ inserts, updates,
    partyId: 'party-1', changeSetId: 'change-1', session: initial,
    mode: 'insert' });
  assert.throws(() => appendCombatSessionWrite({ inserts, updates,
    partyId: 'party-1', changeSetId: 'change-3',
    session: { ...structuredClone(committed), state_version: '3' },
    previousSession: committed, mode: 'update' }),
  /COMBAT_SESSION_PERSISTENCE_INVALID/);
  assert.throws(() => hydrateCombatSession({ ...inserts[0].record,
    status: 'ended' }), /COMBAT_SESSION_PERSISTENCE_INVALID/);
});

test('restart read verifies the committed current projection', async () => {
  const inserts = [], updates = [];
  const committed = appendCombatSessionWrite({ inserts, updates,
    partyId: 'party-1', changeSetId: 'change-1', session:
      createCombatSession({ combat_id: 'combat-1', started_at: at,
        scope_ref: ref('location', 'storehouse'),
        participant_refs: [ref('npc', 'zhdanko'),
          ref('player_character', 'mikula')] }), mode: 'insert' });
  const pool = { query: async () => ({ rows: [inserts[0].record] }) };
  await assert.doesNotReject(assertCombatSessionRows(pool, {
    party_id: 'party-1', combat_sessions: [committed] }));
  await assert.rejects(assertCombatSessionRows(pool, {
    party_id: 'party-1', combat_sessions: [] }));
});

test('restart current projection excludes a terminal combat session', async () => {
  let queryText = '';
  const pool = { query: async (text) => {
    queryText = text;
    return { rows: [] };
  } };
  await assert.doesNotReject(assertCombatSessionRows(pool, {
    party_id: 'party-1', combat_sessions: [] }));
  assert.match(queryText, /status <> 'ended'/u);
});

test('restart verifies factual combat events backing decision signals', async () => {
  const event = { event_id: 'combat-event:1:item',
    event_kind: 'combat_item_transition_completed', combat_id: 'combat-1',
    source_step_ref: ref('combat_technical_step', 'step-1') };
  const history = { occurred_at: at, outcome_event_refs: [event.event_id],
    outcome_events: [event], change_set_id: 'change-2' };
  const eventRow = { event_id: event.event_id, event_kind: event.event_kind,
    scheduled_at_whole_minutes: at.whole_minutes,
    scheduled_at_subminute_numerator: at.subminute_numerator,
    scheduled_at_subminute_denominator: at.subminute_denominator,
    preconditions_digest: canonicalDigest(event), change_set_id: 'change-2' };
  const payload = { party_id: 'party-1', combat_sessions: [],
    combat_history: [history], npc_decision_signals: [{ signal: {
      source_event_ref: ref('combat_event', event.event_id) } }] };
  const pool = { query: async (text) => ({ rows:
    text.includes('party_combat_sessions') ? [] : [eventRow] }) };
  await assert.doesNotReject(assertCombatSessionRows(pool, payload));
  const tampered = { ...eventRow, preconditions_digest: 'bad' };
  const badPool = { query: async (text) => ({ rows:
    text.includes('party_combat_sessions') ? [] : [tampered] }) };
  await assert.rejects(assertCombatSessionRows(badPool, payload));
  await assert.rejects(assertCombatSessionRows(pool, { ...payload,
    npc_decision_signals: [{ signal: { source_event_ref:
      ref('combat_event', 'missing-event') } }] }));
  await assert.rejects(assertCombatSessionRows(pool, { ...payload,
    combat_history: [{ ...history, outcome_event_refs: [],
      outcome_events: [event] }] }));
  const legacy = { ...history };
  delete legacy.outcome_events;
  await assert.doesNotReject(assertCombatSessionRows(pool, { ...payload,
    combat_history: [legacy] }));
  const missingPool = { query: async () => ({ rows: [] }) };
  await assert.rejects(assertCombatSessionRows(missingPool, { ...payload,
    combat_history: [legacy] }));
});
