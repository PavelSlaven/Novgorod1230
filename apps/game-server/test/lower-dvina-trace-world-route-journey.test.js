import assert from 'node:assert/strict';
import test from 'node:test';
import { appendWorldRouteJourney } from
  '../src/infrastructure/postgres/lower-dvina-trace-world-route-journey.js';
import { recheckWorldRouteArrival } from
  '../src/infrastructure/postgres/first-playable/recheck-world-route-arrival.js';

const state = { actor_id: 'actor', journey_location: {
  id: 'journey', state_version: 3, scene_position_id: 'source' } };
const writes = () => ({ inserts: [], updates: [], deletes: [] });

test('world route journey writes delete legacy roots and insert or update S1 arrivals', () => {
  const legacy = writes();
  appendWorldRouteJourney({ writes: legacy, partyId: 'party', state,
    movement: { destination: { scene_position_id: null } }, changeSetId: 'change' });
  assert.equal(legacy.deletes[0].id, 'journey');
  const update = writes();
  appendWorldRouteJourney({ writes: update, partyId: 'party', state,
    movement: { destination: { scene_position_id: 'target' } }, changeSetId: 'change' });
  assert.equal(update.updates[0].record.scene_position_id, 'target');
  const insert = writes();
  appendWorldRouteJourney({ writes: insert, partyId: 'party',
    state: { actor_id: 'actor', journey_location: null },
    movement: { destination: { scene_position_id: 'target' } }, changeSetId: 'change' });
  assert.equal(insert.inserts[0].id, 'journey-location:party:actor');
  assert.equal(insert.inserts[0].record.state_version, 1);
});

test('world route S1 recheck rejects full, wrong-access and stale roots', async (t) => {
  const check = { actor_id: 'actor', destination_position_id: 'target',
    destination_capacity: 2, destination_access_class: 'public',
    expected_journey_state_version: 3 };
  for (const [name, row, used, ok] of [
    ['pass', { capacity: 2, access_class_id: 'public', journey_id: 'journey', journey_state_version: 3 }, 1, true],
    ['full', { capacity: 2, access_class_id: 'public', journey_id: 'journey', journey_state_version: 3 }, 2, false],
    ['access', { capacity: 2, access_class_id: 'sealed', journey_id: 'journey', journey_state_version: 3 }, 1, false],
    ['stale', { capacity: 2, access_class_id: 'public', journey_id: 'journey', journey_state_version: 4 }, 1, false]
  ]) await t.test(name, async () => {
    let calls = 0;
    const result = await recheckWorldRouteArrival({ partyId: 'party', check,
      transaction: { async query() {
        calls += 1;
        return calls === 1 ? { rowCount: 1, rows: [row] }
          : calls === 2 ? { rowCount: row.journey_id ? 1 : 0,
            rows: row.journey_id ? [{ id: row.journey_id,
              state_version: row.journey_state_version }] : [] }
            : { rowCount: 1, rows: [{ used }] };
      } } });
    assert.equal(result.ok, ok);
  });
});
