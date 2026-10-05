import assert from 'node:assert/strict';
import test from 'node:test';
import { GameServerError } from '../src/errors.js';
import {
  createApprovedO1TemplateBackedItemRefs,
  createTargetPresenceRulesFirstArrivalResolver,
  resolvePresenceRulesFirstArrivalForSite,
} from '../src/infrastructure/postgres/ordinary-materialization-presence-first-arrival.js';

const REV = 'novgorod_spatial_v3_target_contract_approval_001';
const DIGEST = '0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e';

const runtimeCatalogPin = {
  schema: 'rus.runtime_catalog_pin.v2',
  catalog_scope: 'item_container_materialization_v2',
  catalog_revision_id: 'item_container_spatial_v3_target_001',
  catalog_digest: DIGEST,
  compatible_world_revision_id: REV,
  compatible_world_catalog_digest: DIGEST,
};

test('approved O1 template closure admits only the explicit refs backed by the pinned catalog', () => {
  const mappings = [
    'item_tpl_nov_awl_v1', 'item_tpl_nov_firesteel_v1', 'item_tpl_nov_striking_flint_v1',
    'item_tpl_nov_wooden_bowl_v1', 'item_tpl_nov_kindling_bundle_v1', 'item_tpl_nov_utility_knife_v1',
    'item_tpl_nov_pestle_v1', 'item_tpl_nov_rope_v1', 'item_tpl_nov_tinder_v1',
    'item_tpl_nov_trough_v1', 'item_tpl_nov_wooden_spoon_v1', 'item_tpl_nov_birch_bark_sheet_v1',
  ];
  const catalog = { schema: 'rus.verified_item_catalog.v2', verified: true,
    records_by_table: { item_templates: mappings.map((id) => ({ id })) } };
  const refs = createApprovedO1TemplateBackedItemRefs(catalog);
  assert.equal(refs.size, 12);
  assert.ok(refs.has('it_hh_awl'));
  assert.ok(refs.has('it_ps_bark_sheet_blank'));
  assert.throws(() => createApprovedO1TemplateBackedItemRefs({ ...catalog,
    records_by_table: { item_templates: catalog.records_by_table.item_templates.slice(1) } }),
  { code: 'PRESENCE_RULE_ITEM_TEMPLATE_DATA_GAP' });
});

function buildGateAwareReader({ bindingRows, presenceRuleRows = [], compositionRows = [],
  scheduleRuleRows = [], g0RegionId = 'region_novgorod_land' }) {
  return {
    read: async (sql, params) => {
      if (sql.includes('spatial_v3_world_revisions')) {
        return { rows: [{ id: REV, catalog_digest: DIGEST, status: 'approved' }] };
      }
      if (sql.includes('world_base.world_revisions')) {
        return { rows: [{ id: REV, catalog_digest: DIGEST, status: 'approved' }] };
      }
      if (sql.includes('runtime_catalog_activation_events')) {
        return { rows: [{
          event_type: 'activate',
          catalog_scope: 'item_container_materialization_v2',
          catalog_revision_id: 'item_container_spatial_v3_target_001',
          catalog_digest: DIGEST,
          compatible_world_revision_id: REV,
          compatible_world_catalog_digest: DIGEST,
        }] };
      }
      if (sql.includes('spatial_node_place_family_bindings')) {
        return { rows: bindingRows };
      }
      if (sql.includes('FROM world_base.presence_rules')) {
        return { rows: presenceRuleRows };
      }
      if (sql.includes('FROM world_base.place_population_composition_rules')) {
        return { rows: compositionRows };
      }
      if (sql.includes('FROM world_base.npc_schedule_routine_rules')) {
        return { rows: scheduleRuleRows.filter((row) => row.season === params[2]) };
      }
      if (sql.includes('parent_category_id')) {
        return { rows: [] };
      }
      if (sql.includes('WITH RECURSIVE chain') && sql.includes("spatial_level = 'G0'")) {
        if (g0RegionId === null) {
          return { rows: [{ id: null }] };
        }
        return { rows: [{ id: g0RegionId }] };
      }
      if (sql.includes('WITH RECURSIVE chain')) {
        return { rows: [{ id: 'region_novgorod_land' }] };
      }
      if (sql.includes('spatial_v3_nodes')) {
        return { rows: [{ version: 1, canonical_digest: 'a'.repeat(64) }] };
      }
      return { rows: [] };
    },
  };
}

const presenceRuleFixture = [{
  rule_id: 'pr_unit_fixture',
  rule_version: 1,
  world_revision_id: REV,
  scope_kind: 'place_family',
  scope_ref: 'pf_rural_yard',
  region_id: null,
  subject_kind: 'category',
  subject_ref: 'cat_fixture',
  presence_probability_ppm: 0,
  count_limit: 1,
  allowed_seasons: ['all'],
  status: 'approved',
}];

async function expectPresenceCode(run, code) {
  await assert.rejects(run, (error) => {
    assert.ok(error instanceof GameServerError);
    assert.equal(error.code, code);
    return true;
  });
}

test('PRESENCE_FIRST_ARRIVAL_SITE_CONTEXT_INVALID for missing spatial pin', async () => {
  await expectPresenceCode(
    () => resolvePresenceRulesFirstArrivalForSite({
      worldBaseReader: null,
      spatialWorldPin: { world_revision_id: 'rev', catalog_digest: '0'.repeat(64) },
      spatialNodeId: 'node',
      spatialNodeVersion: 1,
      partyId: 'p',
      siteId: 'g5:x',
      regionId: 'region_novgorod_land',
      season: 'summer',
    }),
    'PRESENCE_FIRST_ARRIVAL_SITE_CONTEXT_INVALID',
  );
});

test('PRESENCE_FIRST_ARRIVAL_CALENDAR_CONTEXT_INVALID for blank season', async () => {
  await expectPresenceCode(
    () => resolvePresenceRulesFirstArrivalForSite({
      worldBaseReader: { read: async () => ({ rows: [] }) },
      spatialWorldPin: { world_revision_id: 'rev', catalog_digest: '0'.repeat(64) },
      spatialNodeId: 'node',
      spatialNodeVersion: 1,
      partyId: 'p',
      siteId: 'g5:x',
      regionId: 'region_novgorod_land',
      season: '   ',
    }),
    'PRESENCE_FIRST_ARRIVAL_CALENDAR_CONTEXT_INVALID',
  );
});

test('PRESENCE_FIRST_ARRIVAL_SITE_MISSING when resolver has no site', async () => {
  const resolver = createTargetPresenceRulesFirstArrivalResolver({
    worldBaseReader: buildGateAwareReader({ bindingRows: [] }),
    spatialWorldPin: { world_revision_id: REV, catalog_digest: DIGEST },
    worldPin: { world_revision_id: REV, world_catalog_digest: DIGEST },
    runtimeCatalogPin,
  });
  await expectPresenceCode(
    () => resolver({ partyId: 'p', site: null }),
    'PRESENCE_FIRST_ARRIVAL_SITE_MISSING',
  );
});

test('PRESENCE_FIRST_ARRIVAL_G4_PIN_MISSING when parent G4 cannot be pinned', async () => {
  const resolver = createTargetPresenceRulesFirstArrivalResolver({
    worldBaseReader: buildGateAwareReader({ bindingRows: [] }),
    spatialWorldPin: { world_revision_id: REV, catalog_digest: DIGEST },
    worldPin: { world_revision_id: REV, world_catalog_digest: DIGEST },
    runtimeCatalogPin,
  });
  await expectPresenceCode(
    () => resolver({
      partyId: 'p',
      site: { id: 'g5:site', origin: 'canonical', parent_g4_id: null },
      request: {},
    }),
    'PRESENCE_FIRST_ARRIVAL_G4_PIN_MISSING',
  );
});

test('PRESENCE_FIRST_ARRIVAL_HOST_SITE_MISSING when G6 host cannot be resolved', async () => {
  const resolver = createTargetPresenceRulesFirstArrivalResolver({
    worldBaseReader: buildGateAwareReader({ bindingRows: [] }),
    spatialWorldPin: { world_revision_id: REV, catalog_digest: DIGEST },
    worldPin: { world_revision_id: REV, world_catalog_digest: DIGEST },
    runtimeCatalogPin,
  });
  await expectPresenceCode(
    () => resolver({
      transaction: { query: async () => ({ rows: [] }) },
      partyId: 'p',
      site: null,
      scope: { entity_id: 'g6:missing-host' },
    }),
    'PRESENCE_FIRST_ARRIVAL_HOST_SITE_MISSING',
  );
});

test('PRESENCE_FIRST_ARRIVAL_SPATIAL_NODE_VERSION_INVALID for canonical G5 version', async () => {
  const resolver = createTargetPresenceRulesFirstArrivalResolver({
    worldBaseReader: buildGateAwareReader({ bindingRows: [] }),
    spatialWorldPin: { world_revision_id: REV, catalog_digest: DIGEST },
    worldPin: { world_revision_id: REV, world_catalog_digest: DIGEST },
    runtimeCatalogPin,
  });
  await expectPresenceCode(
    () => resolver({
      partyId: 'p',
      site: {
        id: 'g5:site',
        origin: 'canonical',
        parent_g4_id: 'g4-node',
        canonical_g5_ref: { entity_id: 'cg5-canonical-node', authoring_version: 0 },
      },
      request: { g4: { id: 'g4-node', version: 1 } },
    }),
    'PRESENCE_FIRST_ARRIVAL_SPATIAL_NODE_VERSION_INVALID',
  );
});

test('PRESENCE_FIRST_ARRIVAL_REGION_MISSING when G0 region id is absent', async () => {
  const resolver = createTargetPresenceRulesFirstArrivalResolver({
    worldBaseReader: buildGateAwareReader({
      bindingRows: [{ place_family_id: 'pf_rural_yard', binding_role: 'primary' }],
      presenceRuleRows: presenceRuleFixture,
      g0RegionId: null,
    }),
    spatialWorldPin: { world_revision_id: REV, catalog_digest: DIGEST },
    worldPin: { world_revision_id: REV, world_catalog_digest: DIGEST },
    runtimeCatalogPin,
    readPartyPresenceCalendar: async () => ({ season: 'summer', periodNumber: 4920 }),
  });
  await expectPresenceCode(
    () => resolver({
      transaction: { query: async () => ({ rows: [] }) },
      partyId: 'p',
      site: {
        id: 'g5:site',
        origin: 'canonical',
        parent_g4_id: 'g4-node',
        canonical_g5_ref: { entity_id: 'cg5-canonical-node', authoring_version: 1 },
      },
      request: { g4: { id: 'g4-node', version: 1 } },
    }),
    'PRESENCE_FIRST_ARRIVAL_REGION_MISSING',
  );
});

test('canonical first arrival returns all pinned D-1 seasons with month applicability and unchanged D-2 people', async () => {
  const calls = [];
  const reader = buildGateAwareReader({
    bindingRows: [
      { place_family_id: 'pf_ferry_landing', binding_role: 'primary' },
      { place_family_id: 'pf_secondary', binding_role: 'secondary' },
    ],
    presenceRuleRows: presenceRuleFixture,
    compositionRows: [{ composition_id: 'composition-ferry', composition_version: 1,
      world_revision_id: REV, place_family_id: 'pf_ferry_landing',
      population_groups: [{ group_id: 'carriers', count: 2 }], scheduled_absences: [
        { group_id: 'carriers', season: 'winter', location_ref: 'pf_winter_ice_crossing' },
      ] }],
    scheduleRuleRows: [
      { schedule_id: 'schedule-ferry-winter', schedule_version: 1,
        world_revision_id: REV, scope_kind: 'place_family', scope_ref: 'pf_ferry_landing',
        subject_kind: 'occupation', subject_ref: 'carrier', season: 'winter', months: [12, 1, 2],
        routine_profile: { phase: 'crossing' }, status: 'approved' },
      { schedule_id: 'schedule-ferry-summer', schedule_version: 1,
        world_revision_id: REV, scope_kind: 'place_family', scope_ref: 'pf_ferry_landing',
        subject_kind: 'occupation', subject_ref: 'carrier', season: 'summer', months: [6, 7, 8],
        routine_profile: { phase: 'ferry' }, status: 'approved' },
    ],
  });
  const worldBaseReader = { read: async (sql, params) => {
    calls.push({ sql, params });
    return reader.read(sql, params);
  } };
  const resolver = createTargetPresenceRulesFirstArrivalResolver({
    worldBaseReader,
    spatialWorldPin: { world_revision_id: REV, catalog_digest: DIGEST },
    worldPin: { world_revision_id: REV, world_catalog_digest: DIGEST },
    runtimeCatalogPin,
    readPartyPresenceCalendar: async () => ({ season: 'winter', month: 1, periodNumber: 4920 }),
  });
  const result = await resolver({
    transaction: { query: async () => ({ rows: [] }) },
    partyId: 'p',
    site: { id: 'g5:site', origin: 'canonical', parent_g4_id: 'g4-node',
      canonical_g5_ref: { entity_id: 'cg5-ferry', authoring_version: 1 } },
    request: { g4: { id: 'g4-node', version: 1 } },
    withPlacePeople: true,
  });
  const scheduleQueries = calls.filter(({ sql }) => sql.includes('FROM world_base.npc_schedule_routine_rules'));
  assert.deepEqual(scheduleQueries.map(({ params }) => params), [
    [REV, 'pf_ferry_landing', 'spring'], [REV, 'pf_ferry_landing', 'summer'],
    [REV, 'pf_ferry_landing', 'autumn'], [REV, 'pf_ferry_landing', 'winter'],
  ]);
  assert.deepEqual(result.people.compositions, [{ place_family_id: 'pf_ferry_landing', composition_ref: {
    id: 'composition-ferry', version: 1, world_revision_id: REV,
  }, population_groups: [{ group_id: 'carriers', count: 2 }], scheduled_absences: [
    { group_id: 'carriers', season: 'winter', location_ref: 'pf_winter_ice_crossing' },
  ] }]);
  assert.equal(result.people.compositions[0].scheduled_absences[0].location_ref,
    'pf_winter_ice_crossing');
  assert.deepEqual(result.people.schedule_routine_rules_by_place_family.map((entry) => entry.place_family_id),
    ['pf_ferry_landing']);
  const scheduleRules = result.people.schedule_routine_rules_by_place_family[0].rules;
  assert.deepEqual(scheduleRules.map((rule) => rule.season), ['summer', 'winter']);
  assert.deepEqual(scheduleRules.find((rule) => rule.season === 'winter').months, [12, 1, 2]);
  assert.deepEqual(scheduleRules.find((rule) => rule.season === 'summer').months, [6, 7, 8]);
  assert.equal(result.people.absent_people, undefined);
  assert.equal(result.people.identity_choices, undefined);
  assert.equal(scheduleQueries.length, 4);
});

test('canonical D-1 bundle loads all seasons when committed calendar has no month', async () => {
  const calls = [];
  const reader = buildGateAwareReader({
    bindingRows: [{ place_family_id: 'pf_ferry_landing', binding_role: 'primary' }],
    presenceRuleRows: presenceRuleFixture,
    scheduleRuleRows: [],
  });
  const resolver = createTargetPresenceRulesFirstArrivalResolver({
    worldBaseReader: { read: async (sql, params) => {
      calls.push({ sql, params });
      return reader.read(sql, params);
    } },
    spatialWorldPin: { world_revision_id: REV, catalog_digest: DIGEST },
    worldPin: { world_revision_id: REV, world_catalog_digest: DIGEST },
    runtimeCatalogPin,
    readPartyPresenceCalendar: async () => ({ season: 'summer', periodNumber: 4920 }),
  });
  const result = await resolver({
    transaction: { query: async () => ({ rows: [] }) },
    partyId: 'p',
    site: { id: 'g5:site', origin: 'canonical', parent_g4_id: 'g4-node',
      canonical_g5_ref: { entity_id: 'cg5-ferry', authoring_version: 1 } },
    request: { g4: { id: 'g4-node', version: 1 } },
    withPlacePeople: true,
  });
  const scheduleQueries = calls.filter(({ sql }) => sql.includes('FROM world_base.npc_schedule_routine_rules'));
  assert.deepEqual(scheduleQueries.map(({ params }) => params.map((param) => param)), [
    [REV, 'pf_ferry_landing', 'spring'], [REV, 'pf_ferry_landing', 'summer'],
    [REV, 'pf_ferry_landing', 'autumn'], [REV, 'pf_ferry_landing', 'winter'],
  ]);
  assert.deepEqual(result.people.schedule_routine_rules_by_place_family, [
    { place_family_id: 'pf_ferry_landing', rules: [] },
  ]);
});

test('generated-site first arrival leaves canonical D-1 handoff unused', async () => {
  const calls = [];
  const reader = buildGateAwareReader({
    bindingRows: [{ place_family_id: 'pf_ferry_landing', binding_role: 'primary' }],
    presenceRuleRows: presenceRuleFixture,
  });
  const resolver = createTargetPresenceRulesFirstArrivalResolver({
    worldBaseReader: { read: async (sql, params) => {
      calls.push({ sql, params });
      return reader.read(sql, params);
    } },
    spatialWorldPin: { world_revision_id: REV, catalog_digest: DIGEST },
    worldPin: { world_revision_id: REV, world_catalog_digest: DIGEST },
    runtimeCatalogPin,
    readPartyPresenceCalendar: async () => ({ season: 'winter', month: 1, periodNumber: 4920 }),
  });
  const result = await resolver({
    transaction: { query: async () => ({ rows: [] }) },
    partyId: 'p',
    site: { id: 'g5:generated', origin: 'generated', parent_g4_id: 'g4-node',
      generated_template_ref: { entity_id: 'template', authoring_version: 1 } },
    request: { g4: { id: 'g4-node', version: 1 } },
    withPlacePeople: true,
  });
  assert.equal(calls.some(({ sql }) => sql.includes('npc_schedule_routine_rules')), false);
  assert.equal(result.people, undefined);
});
