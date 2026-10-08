import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loadCategoryParentMap,
  loadG1NodeIdForSpatialNode,
  loadPlacePopulationComposition,
  loadPresenceRulesForPlaceFamilies,
  loadScheduleRoutineRules,
  RuntimeCatalogError,
} from '../src/index.js';

const spatialWorldPin = {
  world_revision_id: 'rev-spatial',
  catalog_digest: 'a'.repeat(64),
};
const worldPin = {
  world_revision_id: 'rev-world',
  world_catalog_digest: 'b'.repeat(64),
};
const runtimeCatalogPin = {
  schema: 'rus.runtime_catalog_pin.v2',
  catalog_scope: 'item_container_materialization_v2',
  catalog_revision_id: 'pin-1',
  catalog_digest: 'c'.repeat(64),
  compatible_world_revision_id: 'rev-world',
  compatible_world_catalog_digest: 'b'.repeat(64),
};

function gateReader() {
  return {
    read: async (sql) => {
      if (sql.includes('spatial_v3_world_revisions')) {
        return { rows: [{ id: spatialWorldPin.world_revision_id, catalog_digest: spatialWorldPin.catalog_digest, status: 'approved' }] };
      }
      if (sql.includes('world_revisions') && !sql.includes('spatial_v3')) {
        return { rows: [{ id: worldPin.world_revision_id, catalog_digest: worldPin.world_catalog_digest, status: 'approved' }] };
      }
      if (sql.includes('runtime_catalog_activation_events')) {
        return { rows: [{
          event_type: 'activate',
          catalog_revision_id: runtimeCatalogPin.catalog_revision_id,
          catalog_digest: runtimeCatalogPin.catalog_digest,
          compatible_world_revision_id: worldPin.world_revision_id,
          compatible_world_catalog_digest: worldPin.world_catalog_digest,
        }] };
      }
      if (sql.includes('npc_schedule_routine_rules')) {
        return { rows: [{ schedule_id: 'sch_a', routine_profile: { schema: 'npc_routine_profile_v1' }, authoring_payload: {} }] };
      }
      if (sql.includes('place_population_composition_rules')) {
        return { rows: [{
          composition_id: 'composition-x',
          composition_version: 1,
          world_revision_id: spatialWorldPin.world_revision_id,
          place_family_id: 'pf_x',
          place_family_version: 2,
          population_groups: [{ group_id: 'g1' }],
          scheduled_absences: [{ subject_ref: 'nov_occ_ferryman', seasons: ['winter'] }],
          authoring_payload: { slot_relationships: [] },
        }] };
      }
      if (sql.includes('presence_rules')) {
        return { rows: [{
          rule_id: 'pr_a',
          rule_version: 1,
          world_revision_id: spatialWorldPin.world_revision_id,
          scope_kind: 'place_family',
          scope_ref: 'pf_x',
          subject_kind: 'category',
          subject_ref: 'cat_a',
          presence_probability_ppm: 1000,
          count_limit: 1,
          allowed_seasons: [],
          refresh_class: 'none',
          status: 'approved',
          variants: [],
          authoring_payload: {},
        }] };
      }
      if (sql.includes('universal_categories')) {
        return { rows: [{ id: 'cat_a', parent_category_id: 'cat_root' }] };
      }
      return { rows: [] };
    },
  };
}

test('loadScheduleRoutineRules filters by season and optional month after gate', async () => {
  const calls = [];
  const worldBaseReader = {
    read: async (sql, params) => {
      calls.push({ sql, params });
      return gateReader().read(sql, params);
    },
  };
  const rows = await loadScheduleRoutineRules({
    worldBaseReader,
    spatialWorldPin,
    worldPin,
    runtimeCatalogPin,
    placeFamilyId: 'pf_ferry_landing',
    season: 'summer',
    month: 7,
  });
  assert.equal(rows.length, 1);
  const scheduleQuery = calls.find((entry) => entry.sql.includes('npc_schedule_routine_rules'));
  assert.match(scheduleQuery.sql, /months IS NULL OR \$4 = ANY\(months\)/u);
  assert.deepEqual(scheduleQuery.params, ['rev-spatial', 'pf_ferry_landing', 'summer', 7]);
});

test('loadScheduleRoutineRules rejects missing activation pin', async () => {
  const worldBaseReader = gateReader();
  await assert.rejects(() => loadScheduleRoutineRules({
    worldBaseReader,
    spatialWorldPin,
    worldPin: { ...worldPin, world_revision_id: 'wrong' },
    runtimeCatalogPin,
    placeFamilyId: 'pf_x',
    season: 'summer',
  }), (error) => error instanceof TypeError);
});

test('loadScheduleRoutineRules fails closed when spatial pin missing', async () => {
  const worldBaseReader = {
    read: async (sql) => {
      if (sql.includes('spatial_v3_world_revisions')) return { rows: [] };
      return gateReader().read(sql);
    },
  };
  await assert.rejects(() => loadScheduleRoutineRules({
    worldBaseReader,
    spatialWorldPin,
    worldPin,
    runtimeCatalogPin,
    placeFamilyId: 'pf_x',
    season: 'summer',
  }), (error) => error instanceof RuntimeCatalogError && error.code === 'M2C_NPC_WAVE_SPATIAL_PIN_MISSING');
});

test('loadPlacePopulationComposition returns structured composition or null', async () => {
  const composition = await loadPlacePopulationComposition({
    worldBaseReader: gateReader(),
    spatialWorldPin,
    worldPin,
    runtimeCatalogPin,
    placeFamilyId: 'pf_x',
  });
  assert.deepEqual(composition.population_groups, [{ group_id: 'g1' }]);
  assert.equal(composition.scheduled_absences[0].seasons[0], 'winter');
  assert.equal(composition.place_family_id, 'pf_x');
  assert.equal(composition.place_family_version, 2);
  assert.deepEqual(composition.composition_ref, { id: 'composition-x', version: 1,
    world_revision_id: spatialWorldPin.world_revision_id });
});

test('loadPresenceRulesForPlaceFamilies returns frozen rows after gate', async () => {
  const rows = await loadPresenceRulesForPlaceFamilies({
    worldBaseReader: gateReader(),
    spatialWorldPin,
    worldPin,
    runtimeCatalogPin,
    placeFamilyIds: ['pf_x'],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rule_id, 'pr_a');
});

test('loadG1NodeIdForSpatialNode returns the unique pinned G1 ancestor', async () => {
  const calls = [];
  const worldBaseReader = {
    read: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("spatial_level = 'G1'")) return { rows: [{ id: 'gn_nov_g1_xp017_yp026' }] };
      return gateReader().read(sql, params);
    },
  };
  const id = await loadG1NodeIdForSpatialNode({
    worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin,
    nodeId: 'canonical-g5', nodeVersion: 1,
  });
  assert.equal(id, 'gn_nov_g1_xp017_yp026');
  const ancestry = calls.find(({ sql }) => sql.includes("spatial_level = 'G1'"));
  assert.deepEqual(ancestry.params, ['canonical-g5', 1, 'rev-spatial']);
  assert.match(ancestry.sql, /p\.world_revision_id = \$3/u);
  assert.match(ancestry.sql, /pn\.status = 'approved'/u);
});

test('loadG1NodeIdForSpatialNode fails closed when the pinned G1 ancestor is missing or ambiguous', async () => {
  for (const rows of [[], [{ id: 'g1-a' }, { id: 'g1-b' }]]) {
    const worldBaseReader = {
      read: async (sql, params) => sql.includes("spatial_level = 'G1'")
        ? { rows } : gateReader().read(sql, params),
    };
    await assert.rejects(() => loadG1NodeIdForSpatialNode({
      worldBaseReader, spatialWorldPin, worldPin, runtimeCatalogPin,
      nodeId: 'canonical-g5', nodeVersion: 1,
    }), (error) => error instanceof RuntimeCatalogError
      && error.code === 'PRESENCE_G1_REGION_AMBIGUOUS');
  }
});

test('loadCategoryParentMap returns ancestor links for object_type facet', async () => {
  const parentById = await loadCategoryParentMap({
    worldBaseReader: gateReader(),
    spatialWorldPin,
    worldPin,
    runtimeCatalogPin,
    categoryIds: ['cat_a'],
  });
  assert.equal(parentById.get('cat_a'), 'cat_root');
});
