import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRuntimeCatalogCoordinator,
  RuntimeCatalogBoundaryError
} from '../src/runtime/runtime-catalog.js';

const pin = Object.freeze({
  schema: 'rus.runtime_catalog_pin.v2',
  catalog_scope: 'item_container_materialization_v2',
  catalog_revision_id: 'catalog-v2',
  catalog_digest: 'a'.repeat(64),
  import_id: 'import-v2',
  import_audit_digest: 'b'.repeat(64),
  record_registry_digest: 'c'.repeat(64),
  runtime_contract_digest: 'd'.repeat(64),
  compatible_world_revision_id: 'world-v2',
  compatible_world_catalog_digest: 'e'.repeat(64),
  compatible_world_pin_manifest_digest: 'f'.repeat(64),
  activation_event_id: 'activation-v2'
});
const worldPin = Object.freeze({
  world_revision_id: pin.compatible_world_revision_id,
  world_catalog_digest: pin.compatible_world_catalog_digest
});

test('runtime catalog boundary uses active state only for a new party and historical pin thereafter', async () => {
  const calls = [];
  const loader = {
    async loadActivePin() {
      calls.push('active');
      return pin;
    },
    assertCompatibleWorldPin({ domainPin, worldPin: actual }) {
      assert.equal(domainPin.catalog_revision_id, pin.catalog_revision_id);
      assert.deepEqual(actual, worldPin);
      calls.push('compatible');
    },
    async loadApprovedItemCatalog({ pin: actual }) {
      calls.push(`catalog:${actual.catalog_revision_id}`);
      return Object.freeze({ schema: 'verified', records_by_table: {} });
    },
    selectApplicableItemCatalog() {
      calls.push('projection');
      return Object.freeze({ schema: 'projection' });
    }
  };
  const partyPool = {
    async query() {
      return {
        rows: [{
          ...pin,
          world_revision_id: worldPin.world_revision_id,
          world_catalog_digest: worldPin.world_catalog_digest
        }]
      };
    }
  };
  const coordinator = createRuntimeCatalogCoordinator({ loader, partyPool });

  const created = await coordinator.prepareNewPartyContext({
    worldPin,
    regionId: 'novgorod',
    effectiveDate: '1230-01-01'
  });
  assert.equal(created.source, 'active');
  assert.deepEqual(calls, ['active', 'compatible', 'catalog:catalog-v2', 'projection']);

  calls.length = 0;
  const reloaded = await coordinator.loadPartyContext({ partyId: 'party-1' });
  assert.equal(reloaded.source, 'persisted_party');
  assert.deepEqual(calls, ['compatible', 'catalog:catalog-v2']);
});

test('runtime catalog boundary fails closed for a missing party or run pin', async () => {
  const coordinator = createRuntimeCatalogCoordinator({
    loader: {
      assertCompatibleWorldPin() {},
      async loadApprovedItemCatalog() { return {}; },
      selectApplicableItemCatalog() { return {}; }
    },
    partyPool: { async query() { return { rows: [] }; } }
  });

  for (const operation of [
    () => coordinator.loadPartyContext({ partyId: 'missing' }),
    () => coordinator.assertMaterializationRunPin({
      partyId: 'missing',
      runId: 'run',
      expectedPin: pin
    })
  ]) {
    await assert.rejects(
      operation,
      (error) => error instanceof RuntimeCatalogBoundaryError
        && error.code === 'PARTY_CATALOG_PIN_MISSING'
    );
  }
});

test('runtime catalog boundary verifies normalized run pin and legacy catalog_digest equality', async () => {
  const coordinator = createRuntimeCatalogCoordinator({
    loader: {},
    partyPool: {
      async query() {
        return {
          rows: [{
            ...pin,
            materialization_catalog_digest: pin.catalog_digest
          }]
        };
      }
    }
  });
  assert.equal((await coordinator.assertMaterializationRunPin({
    partyId: 'party-1',
    runId: 'run-1',
    expectedPin: pin
  })).pass, true);
});
