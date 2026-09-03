import test from 'node:test';
import assert from 'node:assert/strict';
import { createLowerDvinaTracePhase1BProductionAdapter } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-1b.js';

test('production start provisions the pinned initial ordinary scope', async () => {
  const statements = [];
  let released = false;
  let provisionInput = null;
  const transaction = {
    async query(statement) {
      statements.push(statement);
      if (String(statement).includes('SELECT snapshot.state_payload')) {
        return { rowCount: 1, rows: [{
          location_ref: 'wreck', position_id: 'position:wreck',
          change_set_id: 'change:new-game'
        }] };
      }
      return { rowCount: 0, rows: [] };
    },
    release() { released = true; }
  };
  const worldDigest = 'a'.repeat(64);
  const adapter = createLowerDvinaTracePhase1BProductionAdapter({
    partyPool: {
      query: async () => ({ rowCount: 0, rows: [] }),
      connect: async () => transaction
    },
    worldPool: { query: async () => ({ rowCount: 0, rows: [] }) },
    release: {
      world_revision_id: 'world', world_catalog_digest: 'catalog',
      compatible_world_pin_manifest_digest: worldDigest
    },
    runtimeCatalogPin: {
      schema: 'rus.runtime_catalog_pin.v2',
      catalog_scope: 'item_container_materialization_v2',
      compatible_world_revision_id: 'world',
      compatible_world_catalog_digest: 'catalog',
      compatible_world_pin_manifest_digest: worldDigest
    },
    initialOrdinaryScopeBinding: { position_ref: 'wreck', g6_ref: 'g6:wreck' },
    initialOrdinaryProvisioner: {
      async provision(input) {
        provisionInput = input;
        return { provisioned: true };
      }
    }
  });
  assert.deepEqual(await adapter.provisionInitialOrdinary('party-1'),
    { provisioned: true });
  assert.equal(provisionInput.partyId, 'party-1');
  assert.equal(provisionInput.changeSetId, 'change:new-game');
  assert.deepEqual(provisionInput.firstEntryBinding, {
    g6_instance_id: 'g6:wreck', position_id: 'position:wreck'
  });
  assert.equal(statements[0], 'BEGIN');
  assert.equal(statements.at(-1), 'COMMIT');
  assert.equal(released, true);
});
