import assert from 'node:assert/strict';
import test from 'node:test';
import { encodePresenceRulePeriodNumber } from '@rus/materialization';
import { readTargetPartyPresenceCalendar } from '../src/infrastructure/postgres/target-party-presence-calendar.js';

test('F1: after first turn, presence calendar follows current clock not snapshot at state_version 1', async () => {
  let initialCalls = 0;
  const factualContext = {
    async readInitialEnvironment() {
      initialCalls += 1;
      return { season: 'summer', calendar_date: { year: 1230 } };
    },
    async readCurrentEnvironment() {
      return { season: 'winter', calendar_date: { year: 1230 } };
    },
  };
  const transaction = {
    async query(sql) {
      if (sql.includes('FROM party_runtime.parties')) {
        return { rows: [{ state_version: 3, session_party_id: null }] };
      }
      if (sql.includes('party_state_snapshots')) {
        throw new Error('must not read frozen first-turn snapshot for presence calendar');
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };
  const calendar = await readTargetPartyPresenceCalendar({
    transaction,
    partyId: 'party-b',
    factualContext,
  });
  assert.equal(initialCalls, 0);
  assert.equal(calendar.season, 'winter');
  assert.equal(calendar.periodNumber, encodePresenceRulePeriodNumber({ year: 1230, season: 'winter' }));
});

test('at state_version 1 without a server session the calendar uses the current party environment', async () => {
  const calls = [];
  const transaction = {
    async query(sql) {
      if (sql.includes('FROM party_runtime.parties')) {
        return { rows: [{ state_version: 1, session_party_id: null }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };
  const calendar = await readTargetPartyPresenceCalendar({
    transaction,
    partyId: 'party-c',
    factualContext: {
      async readInitialEnvironment() { throw new Error('must not read initial environment after first turn'); },
      async readCurrentEnvironment(input) {
        calls.push(input);
        return { season: 'winter', calendar_date: { year: 1231 } };
      },
    },
  });
  assert.deepEqual(calls, [{ transaction, partyId: 'party-c' }]);
  assert.equal(calendar.season, 'winter');
});

test('at state_version 1 with a server session the calendar still uses current party time', async () => {
  const transaction = {
    async query(sql) {
      if (sql.includes('FROM party_runtime.parties')) {
        return { rows: [{ state_version: 1, session_party_id: 'party-d' }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };
  const calendar = await readTargetPartyPresenceCalendar({
    transaction,
    partyId: 'party-d',
    factualContext: {
      async readInitialEnvironment() { throw new Error('must not read initial environment after first turn'); },
      async readCurrentEnvironment() { return { season: 'summer', calendar_date: { year: 1232 } }; },
    },
  });
  assert.equal(calendar.season, 'summer');
});
