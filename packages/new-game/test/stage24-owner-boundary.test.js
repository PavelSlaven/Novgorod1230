import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { NPC_ROUTINE_SCHEDULE_PROJECTION_COLUMNS } from
  '@rus/party-store/internal/lower-dvina-trace-phase-1a';
import { initialNpcRoutineRecords } from '../src/stages/stage-24-party-db-write-plan/index.js';

const stage24 = new URL('../src/stages/stage-24-party-db-write-plan/code/', import.meta.url);

test('Stage 24 remains write-plan serializer, not item materializer', async () => {
  const source = await readFile(new URL('build-lower-dvina-trace-phase-1a-plan.js',
    stage24), 'utf8');
  assert.doesNotMatch(source, /@rus\/items-property|allocationItemId|materialize.*item/iu);
  assert.match(source, /historical_events:\s*structuredClone\(party_creation_context\.historical_events \?\? \[\]\)/u);
  await assert.rejects(readFile(new URL('procedural-actor-allocation.js', stage24)),
    { code: 'ENOENT' });
  const stage16 = await readFile(new URL('../src/stages/stage-16-item-placement/'
    + 'finalize-procedural-actor-equipment.js', import.meta.url), 'utf8');
  assert.match(stage16, /@rus\/items-property/u);
  assert.match(stage16, /base_attributes/u);
});

test('written schedule record columns equal the read projection column list', () => {
  const [record] = initialNpcRoutineRecords({
    result: {}, partyId: 'party-1', changeSetId: 'change-set-1',
    npcs: [{ instance_id: 'npc-1', anchor_id: 'anchor-1', location_profile_ref: 'lp:1',
      routine_state: { status: 'active', profile: { profile_id: 'watch', revision: 1 },
        next_transition_at: { whole_minutes: 620, subminute_numerator: 0,
          subminute_denominator: 1 } } }]
  });
  assert.deepEqual(Object.keys(record), [...NPC_ROUTINE_SCHEDULE_PROJECTION_COLUMNS]);
});
