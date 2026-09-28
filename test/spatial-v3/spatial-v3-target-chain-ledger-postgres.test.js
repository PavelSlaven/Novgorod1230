import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import pg from 'pg';

import {
  SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST,
  SPATIAL_V3_TARGET_MIGRATIONS
} from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';
import {
  runSpatialV3TargetMigrationsWithChainLedger,
  spatialV3TargetChainMigrationId
} from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-chain-ledger.js';
import { runSpatialV3TargetMigrationsForProductionRestart } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migration-restart.js';
import { readPostgresSchemaFingerprint } from
  '../../tools/runtime-catalog-activation/src/forward-migration.js';
import { SPATIAL_V3_PRODUCTION_RELEASE } from
  '../../apps/game-server/src/composition/production-spatial-v3-release-v16.js';
import { PARTY_RUNTIME_CATALOG_MIGRATION } from
  '../../tools/runtime-catalog-activation/src/forward-migrations.js';
import { testContainerLabel } from '../helpers/test-containers.js';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 60_000 });

function attachDdlAudit(pool) {
  const ddl = [];
  const connect = pool.connect.bind(pool);
  pool.connect = async () => {
    const client = await connect();
    const query = client.query.bind(client);
    client.query = async (sql, ...args) => {
      const text = typeof sql === 'string' ? sql : sql.text ?? '';
      if (/^\s*(CREATE|ALTER|DROP)\b/im.test(text)) ddl.push(text);
      return query(sql, ...args);
    };
    return client;
  };
  pool.releaseDdlAudit = () => ddl.slice();
  return pool;
}

async function startContainer(name) {
  if (docker(['version']).status !== 0) return null;
  const started = docker([
    'run', ...testContainerLabel(), '-d', '--name', name,
    '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=ledger_local',
    '-e', 'POSTGRES_USER=ledger',
    '-e', 'POSTGRES_DB=ledger',
    'postgres:16-alpine'
  ]);
  assert.equal(started.status, 0, started.stderr);
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    if (docker(['exec', name, 'pg_isready', '-U', 'ledger', '-d', 'ledger']).status === 0) {
      ready = true;
      break;
    }
  }
  assert.equal(ready, true);
  const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)\s*$/u)?.[1]);
  return new pg.Pool({
    host: '127.0.0.1', port, user: 'ledger', password: 'ledger_local', database: 'ledger'
  });
}

async function seedExtendedHead(pool) {
  for (const sql of SPATIAL_V3_TARGET_MIGRATIONS) {
    await pool.query(sql);
  }
  await pool.query(PARTY_RUNTIME_CATALOG_MIGRATION.sql);
  await pool.query(`
    INSERT INTO party_runtime.schema_migrations (
      migration_id,migration_digest,source_schema_fingerprint,
      target_schema_fingerprint,applied_by
    ) VALUES ($1,$2,$3,$4,$5)
  `, [
    SPATIAL_V3_PRODUCTION_RELEASE.party_runtime_catalog_migration_id,
    SPATIAL_V3_PRODUCTION_RELEASE.party_runtime_catalog_migration_digest,
    PARTY_RUNTIME_CATALOG_MIGRATION.source_schema_fingerprint,
    SPATIAL_V3_PRODUCTION_RELEASE.party_runtime_catalog_target_fingerprint,
    'ledger-test'
  ]);
  const client = await pool.connect();
  try {
    const targetFingerprint = await readPostgresSchemaFingerprint(
      client,
      'party_runtime'
    );
    await client.query(`
      INSERT INTO party_runtime.schema_migrations (
        migration_id,migration_digest,source_schema_fingerprint,
        target_schema_fingerprint,applied_by
      ) VALUES ($1,$2,$3,$4,$5)
    `, [
      spatialV3TargetChainMigrationId(),
      SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST,
      targetFingerprint,
      targetFingerprint,
      'ledger-test'
    ]);
  } finally {
    client.release();
  }
}

test('production restart skip emits no DDL when chain ledger matches head',
  async (t) => {
    const container = `spatial-v3-chain-skip-${process.pid}`;
    const pool = await startContainer(container);
    if (!pool) {
      t.skip('Docker is required for the chain ledger PostgreSQL gate.');
      return;
    }
    t.after(async () => {
      await pool.end();
      docker(['rm', '-fv', container]);
    });
    await seedExtendedHead(pool);
    attachDdlAudit(pool);
    const result = await runSpatialV3TargetMigrationsForProductionRestart(pool, {
      exactAppliedMigration: {
        migration_id:
          SPATIAL_V3_PRODUCTION_RELEASE.party_runtime_catalog_migration_id,
        migration_digest:
          SPATIAL_V3_PRODUCTION_RELEASE.party_runtime_catalog_migration_digest,
        target_schema_fingerprint:
          SPATIAL_V3_PRODUCTION_RELEASE.party_runtime_catalog_target_fingerprint
      }
    });
    assert.equal(result.execution_mode, 'extended_existing_current');
    assert.equal(pool.releaseDdlAudit().length, 0);
  });

async function seedCatalogLedgerWithoutChainRow(pool) {
  for (const sql of SPATIAL_V3_TARGET_MIGRATIONS.slice(0, 11)) {
    await pool.query(sql);
  }
  await pool.query(PARTY_RUNTIME_CATALOG_MIGRATION.sql);
  await pool.query(`
    INSERT INTO party_runtime.schema_migrations (
      migration_id,migration_digest,source_schema_fingerprint,
      target_schema_fingerprint,applied_by
    ) VALUES ($1,$2,$3,$4,$5)
  `, [
    SPATIAL_V3_PRODUCTION_RELEASE.party_runtime_catalog_migration_id,
    SPATIAL_V3_PRODUCTION_RELEASE.party_runtime_catalog_migration_digest,
    PARTY_RUNTIME_CATALOG_MIGRATION.source_schema_fingerprint,
    SPATIAL_V3_PRODUCTION_RELEASE.party_runtime_catalog_target_fingerprint,
    'ledger-test'
  ]);
}

const exactCatalogAppliedMigration = Object.freeze({
  migration_id:
    SPATIAL_V3_PRODUCTION_RELEASE.party_runtime_catalog_migration_id,
  migration_digest:
    SPATIAL_V3_PRODUCTION_RELEASE.party_runtime_catalog_migration_digest,
  target_schema_fingerprint:
    SPATIAL_V3_PRODUCTION_RELEASE.party_runtime_catalog_target_fingerprint
});

test('chain ledger full run records row when chain row is missing',
  async (t) => {
    const container = `spatial-v3-chain-full-${process.pid}`;
    const pool = await startContainer(container);
    if (!pool) {
      t.skip('Docker is required for the chain ledger PostgreSQL gate.');
      return;
    }
    t.after(async () => {
      await pool.end();
      docker(['rm', '-fv', container]);
    });
    await seedCatalogLedgerWithoutChainRow(pool);
    const result = await runSpatialV3TargetMigrationsWithChainLedger(pool, {
      exactAppliedMigration: exactCatalogAppliedMigration
    });
    assert.equal(result.applied, SPATIAL_V3_TARGET_MIGRATIONS.length);
    const row = (await pool.query(
      `SELECT migration_id,migration_digest
       FROM party_runtime.schema_migrations
       WHERE migration_id=$1`,
      [spatialV3TargetChainMigrationId()]
    )).rows[0];
    assert.equal(row.migration_digest, SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST);
  });

test('chain ledger rejects conflicting persisted digest',
  async (t) => {
    const container = `spatial-v3-chain-conflict-${process.pid}`;
    const pool = await startContainer(container);
    if (!pool) {
      t.skip('Docker is required for the chain ledger PostgreSQL gate.');
      return;
    }
    t.after(async () => {
      await pool.end();
      docker(['rm', '-fv', container]);
    });
    await seedCatalogLedgerWithoutChainRow(pool);
    const staleDigest = createHash('sha256').update('stale-chain').digest('hex');
    await pool.query(`
      INSERT INTO party_runtime.schema_migrations (
        migration_id,migration_digest,source_schema_fingerprint,
        target_schema_fingerprint,applied_by
      ) VALUES ($1,$2,$3,$4,$5)
    `, [
      spatialV3TargetChainMigrationId(),
      staleDigest,
      'a'.repeat(64),
      'b'.repeat(64),
      'ledger-test'
    ]);
    await assert.rejects(
      runSpatialV3TargetMigrationsWithChainLedger(pool, {
        exactAppliedMigration: exactCatalogAppliedMigration
      }),
      (error) => error.code === 'SPATIAL_V3_MIGRATION_LEDGER_MISMATCH'
    );
  });
