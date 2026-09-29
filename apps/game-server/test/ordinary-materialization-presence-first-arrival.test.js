import assert from 'node:assert/strict';
import test from 'node:test';
import { GameServerError } from '../src/errors.js';
import {
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

function buildGateAwareReader({ bindingRows, presenceRuleRows = [], g0RegionId = 'region_novgorod_land' }) {
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
