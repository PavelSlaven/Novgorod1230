import assert from 'node:assert/strict';
import test from 'node:test';
import { encodePresenceRulePeriodNumber } from '@rus/materialization';
import { readTargetPartyPresenceCalendar } from '../src/infrastructure/postgres/target-party-presence-calendar.js';

function startTransaction({ actorRows, stateVersion = 0, sessionPartyId = null }) {
  return {
    async query(sql) {
      if (sql.includes('FROM party_runtime.parties')) {
        return { rows: [{ state_version: stateVersion, session_party_id: sessionPartyId }] };
      }
      if (sql.includes('party_player_characters')) return { rows: actorRows };
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

test('at state_version 0 the calendar is the committed initial environment of the start actor', async () => {
  let currentCalls = 0;
  const initialInputs = [];
  const factualContext = {
    async readInitialEnvironment(input) {
      initialInputs.push(input);
      return { season: 'spring', calendar_date: { year: 1230 } };
    },
    async readCurrentEnvironment() { currentCalls += 1; return { season: 'winter', calendar_date: { year: 1231 } }; },
  };
  const transaction = startTransaction({ actorRows: [{ character_id: 'actor-1' }] });
  const calendar = await readTargetPartyPresenceCalendar({ transaction, partyId: 'party-a', factualContext });
  assert.equal(currentCalls, 0);
  assert.equal(initialInputs.length, 1);
  assert.equal(initialInputs[0].actorId, 'actor-1');
  assert.equal(initialInputs[0].partyId, 'party-a');
  assert.equal(initialInputs[0].transaction, transaction);
  assert.equal(calendar.season, 'spring');
  assert.equal(calendar.periodNumber, encodePresenceRulePeriodNumber({ year: 1230, season: 'spring' }));
});

test('at state_version 0 a party without a committed actor has no presence calendar', async () => {
  await assert.rejects(readTargetPartyPresenceCalendar({
    transaction: startTransaction({ actorRows: [] }), partyId: 'party-a',
    factualContext: { async readInitialEnvironment() { throw new Error('must not be read'); } },
  }), { code: 'SPATIAL_V3_PARTY_CALENDAR_REQUIRED' });
});

test('at state_version 0 with a server session the calendar uses the current party environment', async () => {
  const initialCalls = [];
  const currentCalls = [];
  const transaction = startTransaction({ actorRows: [{ character_id: 'actor-1' }], sessionPartyId: 'party-a' });
  const calendar = await readTargetPartyPresenceCalendar({
    transaction,
    partyId: 'party-a',
    factualContext: {
      async readInitialEnvironment(input) { initialCalls.push(input); return { season: 'spring', calendar_date: { year: 1230 } }; },
      async readCurrentEnvironment(input) { currentCalls.push(input); return { season: 'winter', calendar_date: { year: 1231 } }; },
    },
  });
  assert.deepEqual(initialCalls, []);
  assert.deepEqual(currentCalls, [{ transaction, partyId: 'party-a' }]);
  assert.equal(calendar.season, 'winter');
});

test('at state_version 0 with a server session the current calendar does not require a start actor lookup', async () => {
  const transaction = {
    async query(sql) {
      if (sql.includes('FROM party_runtime.parties')) {
        return { rows: [{ state_version: 0, session_party_id: 'party-a' }] };
      }
      if (sql.includes('party_player_characters')) throw new Error('must not read start actor for a session-backed party');
      throw new Error(`unexpected query: ${sql}`);
    },
  };
  const calendar = await readTargetPartyPresenceCalendar({
    transaction,
    partyId: 'party-a',
    factualContext: {
      async readInitialEnvironment() { throw new Error('must not read initial environment after session creation'); },
      async readCurrentEnvironment(input) {
        assert.deepEqual(input, { transaction, partyId: 'party-a' });
        return { season: 'autumn', calendar_date: { year: 1230 } };
      },
    },
  });
  assert.equal(calendar.season, 'autumn');
});
