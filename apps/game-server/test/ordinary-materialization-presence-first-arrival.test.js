import assert from 'node:assert/strict';
import test from 'node:test';
import { GameServerError } from '../src/errors.js';
import {
  createTargetPresenceRulesFirstArrivalResolver,
  resolvePresenceRulesFirstArrivalForSite,
} from '../src/infrastructure/postgres/ordinary-materialization-presence-first-arrival.js';

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

test('resolver typed errors for missing site and G4 pin', async () => {
  const resolver = createTargetPresenceRulesFirstArrivalResolver({
    worldBaseReader: { read: async () => ({ rows: [] }) },
    spatialWorldPin: { world_revision_id: 'rev', catalog_digest: '0'.repeat(64) },
    worldPin: { world_revision_id: 'rev', world_catalog_digest: '0'.repeat(64) },
    runtimeCatalogPin: {
      schema: 'rus.runtime_catalog_pin.v2',
      catalog_scope: 'item_container_materialization_v2',
      catalog_revision_id: 'x',
      catalog_digest: '0'.repeat(64),
      compatible_world_revision_id: 'rev',
      compatible_world_catalog_digest: '0'.repeat(64),
    },
  });
  await expectPresenceCode(
    () => resolver({ partyId: 'p', site: null }),
    'PRESENCE_FIRST_ARRIVAL_SITE_MISSING',
  );
  await expectPresenceCode(
    () => resolver({
      partyId: 'p',
      site: { id: 'g5:site', origin: 'canonical', parent_g4_id: null },
      request: {},
    }),
    'PRESENCE_FIRST_ARRIVAL_G4_PIN_MISSING',
  );
});
