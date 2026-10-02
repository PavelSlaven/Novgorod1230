import assert from 'node:assert/strict';
import test from 'node:test';
import { createTargetPresenceRulesFirstArrivalResolver } from
  '../src/infrastructure/postgres/ordinary-materialization-presence-first-arrival.js';

const REV = 'novgorod_spatial_v3_target_contract_approval_001';
const DIGEST = '0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e';

function buildGateAwareReader({ bindingRows, presenceRuleRows = [] }) {
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

const runtimeCatalogPin = {
  schema: 'rus.runtime_catalog_pin.v2',
  catalog_scope: 'item_container_materialization_v2',
  catalog_revision_id: 'item_container_spatial_v3_target_001',
  catalog_digest: DIGEST,
  compatible_world_revision_id: REV,
  compatible_world_catalog_digest: DIGEST,
};

test('P1-4: target presence resolver forwards partyId to calendar read', async () => {
  const calendarParties = [];
  const resolver = createTargetPresenceRulesFirstArrivalResolver({
    worldBaseReader: buildGateAwareReader({
      bindingRows: [{ place_family_id: 'pf_rural_yard', binding_role: 'primary' }],
      presenceRuleRows: [{
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
      }],
    }),
    spatialWorldPin: { world_revision_id: REV, catalog_digest: DIGEST },
    worldPin: { world_revision_id: REV, world_catalog_digest: DIGEST },
    runtimeCatalogPin,
    readPartyPresenceCalendar: async ({ partyId }) => {
      calendarParties.push(partyId);
      return { season: 'summer', periodNumber: 4920 };
    },
  });
  const result = await resolver({
    transaction: { query: async () => ({ rows: [] }) },
    partyId: 'party-forward-presence',
    site: {
      id: 'g5-site',
      origin: 'canonical',
      parent_g4_id: 'g4-node',
      canonical_g5_ref: { entity_id: 'cg5-canonical-node', authoring_version: 1 },
    },
    request: { g4: { id: 'g4-node', version: 1 } },
  });
  assert.ok(result?.rules?.length >= 0);
  assert.deepEqual(calendarParties, ['party-forward-presence']);
});

test('no bindings returns empty presence with diagnostic gap (no calendar read)', async () => {
  const calendarParties = [];
  const resolver = createTargetPresenceRulesFirstArrivalResolver({
    worldBaseReader: buildGateAwareReader({ bindingRows: [] }),
    spatialWorldPin: { world_revision_id: REV, catalog_digest: DIGEST },
    worldPin: { world_revision_id: REV, world_catalog_digest: DIGEST },
    runtimeCatalogPin,
    readPartyPresenceCalendar: async ({ partyId }) => {
      calendarParties.push(partyId);
      return { season: 'summer', periodNumber: 4920 };
    },
  });
  const result = await resolver({
    transaction: { query: async () => ({ rows: [] }) },
    partyId: 'party-gap',
    site: { id: 'g5-site', origin: 'canonical', parent_g4_id: 'g4-node' },
    request: { g4: { id: 'g4-node', version: 1 } },
  });
  assert.equal(result.presence_gap, 'no_place_family_binding');
  assert.deepEqual(calendarParties, []);
});
