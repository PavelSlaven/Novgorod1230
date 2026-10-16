import assert from 'node:assert/strict';
import test from 'node:test';
import { GameServerError } from '../src/errors.js';
import {
  createTargetPresenceRulesFirstArrivalResolver,
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
const rule = {
  rule_id: 'pr_unit_fixture', rule_version: 1, world_revision_id: REV, scope_kind: 'place_family',
  scope_ref: 'pf_rural_yard', region_id: null, subject_kind: 'category', subject_ref: 'cat_fixture',
  presence_probability_ppm: 0, count_limit: 1, allowed_seasons: ['all'], status: 'approved',
};

function readerWith({ g4Rows = [{ version: 1, canonical_digest: 'a'.repeat(64) }] } = {}) {
  const bindingReads = [];
  return {
    bindingReads,
    read: async (sql, params) => {
      const approved = { rows: [{ id: REV, catalog_digest: DIGEST, status: 'approved' }] };
      if (sql.includes('spatial_v3_world_revisions') || sql.includes('world_base.world_revisions')) return approved;
      if (sql.includes('runtime_catalog_activation_events')) {
        return { rows: [{ event_type: 'activate', catalog_scope: runtimeCatalogPin.catalog_scope,
          catalog_revision_id: runtimeCatalogPin.catalog_revision_id, catalog_digest: DIGEST,
          compatible_world_revision_id: REV, compatible_world_catalog_digest: DIGEST }] };
      }
      if (sql.includes('spatial_node_place_family_bindings')) {
        bindingReads.push(params);
        return { rows: [{ place_family_id: 'pf_rural_yard', binding_role: 'primary' }] };
      }
      if (sql.includes('FROM world_base.presence_rules')) return { rows: [rule] };
      if (sql.includes('parent_category_id')) return { rows: [] };
      if (sql.includes('WITH RECURSIVE chain')) return { rows: [{ id: 'region_novgorod_land' }] };
      if (sql.includes('spatial_v3_nodes')) return { rows: g4Rows };
      return { rows: [] };
    },
  };
}

const resolverFor = (worldBaseReader) => createTargetPresenceRulesFirstArrivalResolver({
  worldBaseReader,
  spatialWorldPin: { world_revision_id: REV, catalog_digest: DIGEST },
  worldPin: { world_revision_id: REV, world_catalog_digest: DIGEST },
  runtimeCatalogPin,
  readPartyPresenceCalendar: async () => ({ season: 'summer', periodNumber: 4920 }),
});

const rejectsWith = (run, code) => assert.rejects(run, (error) => {
  assert.ok(error instanceof GameServerError);
  assert.equal(error.code, code);
  return true;
});

test('generated site without an approved pinned G4 row does not borrow the version from the request', async () => {
  await rejectsWith(() => resolverFor(readerWith({ g4Rows: [] }))({
    partyId: 'p',
    site: { id: 'g5:site', origin: 'generated', parent_g4_id: 'g4-node' },
    request: { g4: { version: 3 } },
  }), 'PRESENCE_FIRST_ARRIVAL_G4_PIN_MISSING');
});

test('canonical G5 reference without a version is rejected, not defaulted to version 1', async () => {
  await rejectsWith(() => resolverFor(readerWith())({
    partyId: 'p',
    site: { id: 'g5:site', origin: 'canonical', parent_g4_id: 'g4-node',
      canonical_g5_ref: { entity_id: 'cg5-canonical-node' } },
    request: { g4: { id: 'g4-node', version: 1 } },
  }), 'PRESENCE_FIRST_ARRIVAL_SPATIAL_NODE_VERSION_INVALID');
});

test('resolver reads place-family bindings once per arrival', async () => {
  const reader = readerWith();
  const context = await resolverFor(reader)({
    partyId: 'p',
    site: { id: 'g5:site', origin: 'canonical', parent_g4_id: 'g4-node',
      canonical_g5_ref: { entity_id: 'cg5-canonical-node', authoring_version: 1 } },
    request: { g4: { id: 'g4-node', version: 1 } },
  });
  assert.equal(context.rules.length, 1);
  assert.equal(reader.bindingReads.length, 1);
});
