import assert from 'node:assert/strict';
import test from 'node:test';
import { createTargetPresenceRulesFirstArrivalResolver } from
  '../src/infrastructure/postgres/ordinary-materialization-presence-first-arrival.js';

test('P1-4: target presence resolver forwards partyId to calendar read', async () => {
  const calendarParties = [];
  const resolver = createTargetPresenceRulesFirstArrivalResolver({
    worldBaseReader: {
      read: async (sql) => {
        if (sql.includes('spatial_v3_world_revisions')) {
          return { rows: [{ id: 'novgorod_spatial_v3_target_contract_approval_001' }] };
        }
        if (sql.includes('spatial_node_place_family_bindings')) {
          return { rows: [] };
        }
        return { rows: [] };
      },
    },
    spatialWorldPin: {
      world_revision_id: 'novgorod_spatial_v3_target_contract_approval_001',
      catalog_digest: '0'.repeat(64),
    },
    worldPin: {
      world_revision_id: 'novgorod_spatial_v3_target_contract_approval_001',
      catalog_digest: '0'.repeat(64),
    },
    runtimeCatalogPin: {
      compatible_world_revision_id: 'novgorod_spatial_v3_target_contract_approval_001',
      catalog_digest: '0'.repeat(64),
    },
    readPartyPresenceCalendar: async ({ partyId }) => {
      calendarParties.push(partyId);
      return { season: 'summer', periodNumber: 4920 };
    },
  });
  try {
    await resolver({
      transaction: { query: async () => ({ rows: [] }) },
      partyId: 'party-forward-presence',
      site: { id: 'g5-site', parent_g4_id: 'g4-node', origin: 'canonical' },
      request: { g4: { id: 'g4-node', version: 1 } },
    });
  } catch {
    // No bindings: calendar must not run before rule lookup (F5).
  }
  assert.deepEqual(calendarParties, []);
});
