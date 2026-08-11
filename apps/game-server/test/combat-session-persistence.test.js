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

test('restart verifies route movement event traversal lineage', async () => {
  const event = { event_id: 'combat-event:1:movement',
    event_kind: 'combat_position_transition_completed', combat_id: 'combat-1',
    source_step_ref: ref('combat_technical_step', 'step-1'),
    actor_ref: ref('npc', 'ratsha-1'), movement_ref: 'shed-to-camp',
    exact_elapsed: { mode: 'exact_minutes',
      exact_minutes: { numerator: '12', denominator: '1' } },
    traversal_execution_ref: ref('route_plan_execution', 'execution-1'),
    traversal_interval_ref: ref('traversal_interval_result', 'interval-1') };
  const history = { occurred_at: at, outcome_event_refs: [event.event_id],
    outcome_events: [event], change_set_id: 'change-2' };
  const eventRow = { event_id: event.event_id, event_kind: event.event_kind,
    scheduled_at_whole_minutes: at.whole_minutes,
    scheduled_at_subminute_numerator: at.subminute_numerator,
    scheduled_at_subminute_denominator: at.subminute_denominator,
    rule_ref: event.traversal_interval_ref,
    preconditions_digest: canonicalDigest(event), change_set_id: 'change-2' };
  const lineage = { interval_id: 'interval-1',
    route_plan_execution_id: 'execution-1', plan_step_ordinal: 0,
    result_kind: 'segment_completed', planned_time_numerator: 12,
    planned_time_denominator: 1,
    actual_progress_after_ppm: 1_000_000, actual_time_numerator: 12,
    actual_time_denominator: 1, cumulative_time_before_numerator: 0,
    cumulative_time_before_denominator: 1,
    cumulative_time_after_numerator: 12,
    cumulative_time_after_denominator: 1,
    result_change_set_id: 'change-2',
    party_id: 'party-1', execution_status: 'completed',
    updated_change_set_id: 'change-2', option_id: 'shed-to-camp',
    journey_owner_ref: event.actor_ref, created_change_set_id: 'change-2',
    step_ordinal: 0, step_kind: 'timed_traversal',
    static_contract_snapshot: { base_minutes: 12 },
    travel_status: 'closed', closed_result: 'completed',
    segment_progress_ppm: 1_000_000, travel_step_ordinal: 0,
    cumulative_actual_time_numerator: 12,
    cumulative_actual_time_denominator: 1,
    travel_change_set_id: 'change-2' };
  const payload = { party_id: 'party-1', combat_sessions: [],
    combat_history: [history] };
  const pool = routePool(eventRow, lineage);
  await assert.doesNotReject(assertCombatSessionRows(pool, payload));
  await assert.rejects(assertCombatSessionRows(routePool(eventRow, null),
    payload));
  await assert.rejects(assertCombatSessionRows(routePool(eventRow, {
    ...lineage, route_plan_execution_id: 'other-execution' }), payload));
  await assert.rejects(assertCombatSessionRows(routePool(eventRow, {
    ...lineage, option_id: 'other-route' }), payload));
  await assert.rejects(assertCombatSessionRows(routePool(eventRow, {
    ...lineage, party_id: 'foreign-party' }), payload));
  await assert.rejects(assertCombatSessionRows(routePool(eventRow, {
    ...lineage, journey_owner_ref: ref('npc', 'other-npc') }), payload));
  await assert.rejects(assertCombatSessionRows(routePool(eventRow, {
    ...lineage, actual_time_numerator: 1 }), payload));
  await assert.rejects(assertCombatSessionRows(routePool(eventRow, {
    ...lineage, cumulative_actual_time_numerator: 1 }), payload));
  await assert.rejects(assertCombatSessionRows(routePool({ ...eventRow,
    rule_ref: ref('traversal_interval_result', 'other-interval') }, lineage),
  payload));
});

function routePool(eventRow, lineage) {
  return { query: async (text) => ({ rows:
    text.includes('party_combat_sessions') ? []
      : text.includes('party_traversal_interval_results')
        ? lineage == null ? [] : [lineage]
        : [eventRow] }) };
}
