import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresPartyStore } from '../src/infrastructure/postgres/party-store.js';

const DOMAIN_DIGEST = 'd'.repeat(64);
const WORLD_DIGEST = 'w'.repeat(64);

test('first-entry request is bound to the persisted item/container domain pin', async () => {
  const queries = [];
  let loaderInput;
  const transaction = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes('FROM party_runtime.parties')) return { rows: [persistedPartyAndPin()] };
      if (sql.includes('FROM party_runtime.party_catalog_pins')) return { rows: [persistedPartyAndPin()] };
      if (sql.includes('count(*)::int AS count')) return { rows: [{ count: 0 }] };
      return { rows: [] };
    }
  };
  const catalogBundle = {
    player_start_anchor_slot_key: 'entry',
    rules: [],
    candidates: []
  };
  const store = createPostgresPartyStore({
    pool: fakePool(transaction),
    catalogBundleLoader: async (input) => {
      loaderInput = input;
      return {
        world_revision_id: 'world-revision',
        catalog_digest: DOMAIN_DIGEST,
        region_id: 'novgorod',
        g1_id: 'g1-novgorod',
        historical_frame: { calendar: { year: 1230 } },
        catalog_bundle: catalogBundle
      };
    }
  });

  const request = await store.buildMaterializationRequest({
    partyId: 'party-1',
    g4Id: 'g4-1',
    trigger: 'first_entry',
    transaction
  });

  assert.equal(request.world_revision_id, 'world-revision');
  assert.equal(request.catalog_digest, DOMAIN_DIGEST);
  assert.equal(loaderInput.domain_catalog_pin.catalog_digest, DOMAIN_DIGEST);
  assert.equal(loaderInput.domain_catalog_pin.compatible_world_catalog_digest, WORLD_DIGEST);
  assert.equal(loaderInput.party.world_catalog_digest, WORLD_DIGEST);
  assert.ok(queries.some(({ sql }) => /party_catalog_pins/u.test(sql)));
});

test('first-entry request fails closed for missing or incompatible persisted domain pins', async (t) => {
  const cases = [
    {
      name: 'missing pin',
      row: { ...persistedPartyAndPin(), catalog_revision_id: null },
      code: 'PARTY_CATALOG_PIN_MISSING'
    },
    {
      name: 'incompatible world tuple',
      row: { ...persistedPartyAndPin(), compatible_world_catalog_digest: 'other-world-digest' },
      code: 'PARTY_CATALOG_PIN_MISMATCH'
    }
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      let loaderCalls = 0;
      const transaction = {
        async query(sql) {
          if (sql.includes('FROM party_runtime.parties')) return { rows: [scenario.row] };
          if (sql.includes('FROM party_runtime.party_catalog_pins')) return { rows: [scenario.row] };
          return { rows: [] };
        }
      };
      const store = createPostgresPartyStore({
        pool: fakePool(transaction),
        catalogBundleLoader: async () => {
          loaderCalls += 1;
          return {};
        }
      });
      await assert.rejects(
        () => store.buildMaterializationRequest({
          partyId: 'party-1',
          g4Id: 'g4-1',
          trigger: 'first_entry',
          transaction
        }),
        (error) => error.code === scenario.code
      );
      assert.equal(loaderCalls, 0);
    });
  }
});

test('materialization commit writes the exact persisted domain pin atomically with its run', async () => {
  const queries = [];
  const transaction = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.includes('FROM party_runtime.parties')) return { rows: [persistedPartyAndPin()] };
      if (sql.includes('FROM party_runtime.party_catalog_pins')) return { rows: [persistedPartyAndPin()] };
      if (sql.includes('INSERT INTO party_runtime.commit_idempotency')) return { rows: [{ idempotency_key: params[0] }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    }
  };
  const store = createPostgresPartyStore({
    pool: fakePool(transaction),
    catalogBundleLoader: async () => ({})
  });

  const result = await store.commitMaterializationAndMovement({
    partyId: 'party-1',
    g4Id: 'g4-1',
    materialization: materializationResult(),
    writePlan: {},
    idempotencyKey: 'first-entry:party-1:g4-1'
  }, { transaction });

  assert.equal(result.materialized, true);
  const pinInsert = queries.find(({ sql }) => /INSERT INTO "party_runtime"\."party_materialization_run_catalog_pins"/u.test(sql));
  assert.ok(pinInsert);
  assert.deepEqual(pinInsert.params, [
    'party-1',
    'run-1',
    'item_container_materialization_v2',
    'domain-revision',
    DOMAIN_DIGEST,
    'import-1',
    'a'.repeat(64),
    'r'.repeat(64),
    'c'.repeat(64),
    'activation-1'
  ]);
  const runInsertIndex = queries.findIndex(({ sql }) => /INSERT INTO "party_runtime"\."party_materialization_runs"/u.test(sql));
  const pinInsertIndex = queries.indexOf(pinInsert);
  assert.ok(runInsertIndex >= 0 && pinInsertIndex > runInsertIndex);
});

function persistedPartyAndPin() {
  return {
    party_id: 'party-1',
    schema_version: 2,
    world_revision_id: 'world-revision',
    world_catalog_digest: WORLD_DIGEST,
    materializer_version: 'code_materializer_v2',
    rng_version: 'mulberry32_v1',
    command_catalog_digest: 'commands',
    profile_bundle_digest: 'profiles',
    state_version: 0,
    catalog_scope: 'item_container_materialization_v2',
    catalog_revision_id: 'domain-revision',
    catalog_digest: DOMAIN_DIGEST,
    import_id: 'import-1',
    import_audit_digest: 'a'.repeat(64),
    record_registry_digest: 'r'.repeat(64),
    runtime_contract_digest: 'c'.repeat(64),
    compatible_world_revision_id: 'world-revision',
    compatible_world_catalog_digest: WORLD_DIGEST,
    compatible_world_pin_manifest_digest: 'm'.repeat(64),
    activation_event_id: 'activation-1'
  };
}

function materializationResult() {
  const run = {
    party_id: 'party-1',
    run_id: 'run-1',
    g4_id: 'g4-1',
    run_kind: 'baseline',
    catalog_digest: DOMAIN_DIGEST
  };
  return {
    party_id: 'party-1',
    run_id: 'run-1',
    g4_id: 'g4-1',
    trace: {
      run_id: 'run-1',
      world_revision_id: 'world-revision',
      catalog_digest: DOMAIN_DIGEST
    },
    player_start_position: null,
    proposed_write_set: {
      transaction: {
        write_order: ['materialization_party_materialization_runs']
      },
      write_batches: [{
        batch_id: 'materialization_party_materialization_runs',
        target_schema: 'party_runtime',
        target_table: 'party_materialization_runs',
        operation_mode: 'insert_only',
        records: [run]
      }]
    }
  };
}

function fakePool(transaction) {
  return {
    async connect() {
      return {
        ...transaction,
        release() {}
      };
    }
  };
}
