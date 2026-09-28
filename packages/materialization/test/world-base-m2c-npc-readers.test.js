import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlacePopulationComposition, loadScheduleRoutineRules } from '../src/world-base-m2c-npc-readers.js';

test('loadScheduleRoutineRules filters by season and optional month', async () => {
  const calls = [];
  const worldBaseReader = {
    read: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [{ schedule_id: 'sch_a', routine_profile: { schema: 'npc_routine_profile_v1' }, authoring_payload: {} }] };
    },
  };
  const rows = await loadScheduleRoutineRules({
    worldBaseReader,
    worldRevisionId: 'rev',
    placeFamilyId: 'pf_ferry_landing',
    season: 'summer',
    month: 7,
  });
  assert.equal(rows.length, 1);
  assert.match(calls[0].sql, /months IS NULL OR \$4 = ANY\(months\)/u);
  assert.deepEqual(calls[0].params, ['rev', 'pf_ferry_landing', 'summer', 7]);
});

test('loadPlacePopulationComposition returns structured composition or null', async () => {
  const worldBaseReader = {
    read: async () => ({ rows: [{
      composition_id: 'pf_x',
      composition_version: 1,
      world_revision_id: 'rev',
      place_family_id: 'pf_x',
      population_groups: [{ group_id: 'g1' }],
      scheduled_absences: [{ subject_ref: 'nov_occ_ferryman', seasons: ['winter'] }],
      empty_reason: null,
      authoring_payload: { slot_relationships: [] },
    }] }),
  };
  const composition = await loadPlacePopulationComposition({
    worldBaseReader,
    worldRevisionId: 'rev',
    placeFamilyId: 'pf_x',
  });
  assert.deepEqual(composition.population_groups, [{ group_id: 'g1' }]);
  assert.equal(composition.scheduled_absences[0].seasons[0], 'winter');
});
