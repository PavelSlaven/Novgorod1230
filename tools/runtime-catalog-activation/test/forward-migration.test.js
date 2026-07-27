import assert from 'node:assert/strict';
import test from 'node:test';
import migrationContracts from '../../../data/runtime-catalog/forward-migration-contracts.v2.json'
  with { type: 'json' };
import {
  ForwardMigrationError,
  classifyForwardMigrationState,
  createForwardMigration,
  runForwardMigration
} from '../src/forward-migration.js';
import {
  PARTY_RUNTIME_CATALOG_MIGRATION,
  buildWorldRuntimeCatalogMigrationPreflight,
  WORLD_LEGACY_SCHEMA_BRIDGE,
  WORLD_RUNTIME_CATALOG_MIGRATION
} from '../src/forward-migrations.js';

const migration = createForwardMigration({
  migrationId: 'runtime_catalog_world_v1',
  schemaName: 'world_base',
  sourceSchemaFingerprint: 'a'.repeat(64),
  targetSchemaFingerprint: 'b'.repeat(64),
  sql: 'CREATE TABLE world_base.example(id TEXT PRIMARY KEY);'
});

test('published migration contracts exactly match executable security-aware migrations', () => {
  assert.equal(
    migrationContracts.fingerprint_algorithm,
    'rus.postgres_schema_fingerprint.v2'
  );
  const executableById = new Map([
    WORLD_LEGACY_SCHEMA_BRIDGE,
    WORLD_RUNTIME_CATALOG_MIGRATION,
    PARTY_RUNTIME_CATALOG_MIGRATION
  ].map((entry) => [entry.migration_id, entry]));
  for (const published of migrationContracts.migrations) {
    const executable = executableById.get(published.migration_id);
    assert.ok(executable, published.migration_id);
    assert.deepEqual(
      {
        migration_id: executable.migration_id,
        migration_digest: executable.migration_digest,
        schema_name: executable.schema_name,
        source_schema_fingerprint: executable.source_schema_fingerprint,
        target_schema_fingerprint: executable.target_schema_fingerprint
      },
      {
        migration_id: published.migration_id,
        migration_digest: published.migration_digest,
        schema_name: published.schema_name,
        source_schema_fingerprint: published.source_schema_fingerprint,
        target_schema_fingerprint: published.target_schema_fingerprint
      }
    );
  }
  assert.equal(executableById.size, migrationContracts.migrations.length);
});

test('forward migration state matrix accepts only exact legacy or exact applied target', () => {
  const cases = [
    {
      name: 'legacy',
      actualSchemaFingerprint: migration.source_schema_fingerprint,
      ledgerRow: null,
      expected: 'ready'
    },
    {
      name: 'target',
      actualSchemaFingerprint: migration.target_schema_fingerprint,
      ledgerRow: {
        migration_id: migration.migration_id,
        migration_digest: migration.migration_digest,
        source_schema_fingerprint: migration.source_schema_fingerprint,
        target_schema_fingerprint: migration.target_schema_fingerprint
      },
      expected: 'already_applied'
    }
  ];

  for (const scenario of cases) {
    assert.equal(classifyForwardMigrationState({
      migration,
      actualSchemaFingerprint: scenario.actualSchemaFingerprint,
      ledgerRow: scenario.ledgerRow
    }).status, scenario.expected, scenario.name);
  }
});

test('forward migration state matrix hard-blocks unknown, partial and conflicting ledger states', () => {
  const cases = [
    {
      name: 'unknown fingerprint',
      actualSchemaFingerprint: 'c'.repeat(64),
      ledgerRow: null,
      code: 'MIGRATION_SCHEMA_FINGERPRINT_UNKNOWN'
    },
    {
      name: 'target without ledger',
      actualSchemaFingerprint: migration.target_schema_fingerprint,
      ledgerRow: null,
      code: 'MIGRATION_PARTIAL_STATE'
    },
    {
      name: 'ledger on legacy',
      actualSchemaFingerprint: migration.source_schema_fingerprint,
      ledgerRow: { migration_id: migration.migration_id },
      code: 'MIGRATION_PARTIAL_STATE'
    },
    {
      name: 'digest mismatch',
      actualSchemaFingerprint: migration.target_schema_fingerprint,
      ledgerRow: {
        migration_id: migration.migration_id,
        migration_digest: 'd'.repeat(64),
        source_schema_fingerprint: migration.source_schema_fingerprint,
        target_schema_fingerprint: migration.target_schema_fingerprint
      },
      code: 'MIGRATION_LEDGER_CONFLICT'
    }
  ];

  for (const scenario of cases) {
    assert.throws(
      () => classifyForwardMigrationState({
        migration,
        actualSchemaFingerprint: scenario.actualSchemaFingerprint,
        ledgerRow: scenario.ledgerRow
      }),
      (error) => error instanceof ForwardMigrationError && error.code === scenario.code,
      scenario.name
    );
  }
});

test('forward migration applies DDL and ledger row in one transaction with exact target readback', async () => {
  const calls = [];
  const fingerprints = [
    migration.source_schema_fingerprint,
    migration.target_schema_fingerprint
  ];
  const client = {
    async query(sql, parameters = []) {
      calls.push({ sql, parameters });
      if (sql.includes('to_regclass')) return { rows: [{ ledger_exists: false }] };
      if (sql.includes('FROM world_base.schema_migrations')) return { rows: [] };
      if (sql.includes('INSERT INTO world_base.schema_migrations')) return { rowCount: 1, rows: [] };
      return { rows: [] };
    },
    release() {
      calls.push({ sql: 'RELEASE', parameters: [] });
    }
  };
  const pool = { async connect() { return client; } };

  const result = await runForwardMigration({
    pool,
    migration,
    readSchemaFingerprint: async () => fingerprints.shift()
  });

  assert.equal(result.status, 'applied');
  assert.equal(calls[0].sql, 'BEGIN');
  assert.ok(calls.some(({ sql }) => sql === migration.sql));
  assert.ok(calls.some(({ sql }) => sql.includes('INSERT INTO world_base.schema_migrations')));
  assert.equal(calls.at(-2).sql, 'COMMIT');
  assert.equal(calls.at(-1).sql, 'RELEASE');
});

test('forward migration rolls back when target fingerprint is not exact', async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes('to_regclass')) return { rows: [{ ledger_exists: false }] };
      return { rows: [] };
    },
    release() {}
  };

  await assert.rejects(
    () => runForwardMigration({
      pool: { async connect() { return client; } },
      migration,
      readSchemaFingerprint: async () => migration.source_schema_fingerprint
    }),
    (error) => error instanceof ForwardMigrationError
      && error.code === 'MIGRATION_TARGET_FINGERPRINT_MISMATCH'
  );
  assert.equal(calls.at(-1), 'ROLLBACK');
});

test('forward migration rolls back bridge and target DDL in one transaction', async () => {
  const bridge = createForwardMigration({
    migrationId: 'legacy_world_bridge',
    schemaName: 'world_base',
    sourceSchemaFingerprint: 'c'.repeat(64),
    targetSchemaFingerprint: migration.source_schema_fingerprint,
    sql: 'ALTER TABLE world_base.legacy_example ADD COLUMN canonical_id TEXT;'
  });
  const calls = [];
  const fingerprints = [
    bridge.source_schema_fingerprint,
    bridge.target_schema_fingerprint
  ];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes('to_regclass')) return { rows: [{ ledger_exists: false }] };
      if (sql === migration.sql) throw Object.assign(new Error('target DDL failed'), { code: 'XX000' });
      return { rows: [] };
    },
    release() {}
  };

  await assert.rejects(
    () => runForwardMigration({
      pool: { async connect() { return client; } },
      migration,
      sourceBridge: bridge,
      readSchemaFingerprint: async () => fingerprints.shift()
    }),
    (error) => error?.code === 'XX000'
  );
  assert.ok(calls.includes(bridge.sql));
  assert.ok(calls.includes(migration.sql));
  assert.equal(calls.at(-1), 'ROLLBACK');
  assert.equal(calls.filter((sql) => sql === 'BEGIN').length, 1);
  assert.equal(calls.includes('COMMIT'), false);
});

test('world migration preflight exposes the exact bridge and runtime chain', () => {
  const legacy = buildWorldRuntimeCatalogMigrationPreflight({
    actualSchemaFingerprint: WORLD_LEGACY_SCHEMA_BRIDGE.source_schema_fingerprint,
    ledgerRow: null
  });
  assert.deepEqual(legacy.checks.map(({ migration_id, state }) => ({
    migration_id,
    state
  })), [
    {
      migration_id: WORLD_LEGACY_SCHEMA_BRIDGE.migration_id,
      state: 'ready'
    },
    {
      migration_id: WORLD_RUNTIME_CATALOG_MIGRATION.migration_id,
      state: 'ready_after_prerequisite'
    }
  ]);
  assert.equal(legacy.status, 'ready');

  const canonicalSource = buildWorldRuntimeCatalogMigrationPreflight({
    actualSchemaFingerprint: WORLD_RUNTIME_CATALOG_MIGRATION.source_schema_fingerprint,
    ledgerRow: null
  });
  assert.deepEqual(
    canonicalSource.checks.map(({ state }) => state),
    ['already_applied', 'ready']
  );

  const final = buildWorldRuntimeCatalogMigrationPreflight({
    actualSchemaFingerprint: WORLD_RUNTIME_CATALOG_MIGRATION.target_schema_fingerprint,
    ledgerRow: WORLD_RUNTIME_CATALOG_MIGRATION
  });
  assert.deepEqual(
    final.checks.map(({ state }) => state),
    ['already_applied', 'already_applied']
  );
  assert.equal(final.status, 'ready');
});
