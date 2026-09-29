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
      if (sql.includes('state_version FROM party_runtime.parties')) {
        return { rows: [{ state_version: 3 }] };
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
