import { readFileSync } from 'node:fs';
import { createForwardMigration, runForwardMigration } from './forward-migration.js';

const WORLD_SQL = readFileSync(
  new URL('../migrations/world/001_runtime_catalog_activation.sql', import.meta.url),
  'utf8'
);
const PARTY_SQL = readFileSync(
  new URL('../migrations/party/001_runtime_catalog_pins.sql', import.meta.url),
  'utf8'
);

export const WORLD_RUNTIME_CATALOG_MIGRATION = createForwardMigration({
  migrationId: 'world_runtime_catalog_activation_v2',
  schemaName: 'world_base',
  sourceSchemaFingerprint: '6138fa8253fb95373d42e8467793c70596825529d7e10e177f27f60b486eddb5',
  targetSchemaFingerprint: 'd932870f0ca0e1ad8a3ebe702f35083ba48f36282c420614cdd4385f78192679',
  sql: WORLD_SQL
});

export const PARTY_RUNTIME_CATALOG_MIGRATION = createForwardMigration({
  migrationId: 'party_runtime_catalog_pins_v2',
  schemaName: 'party_runtime',
  sourceSchemaFingerprint: '16f99b12e58ce60f6c87e29e0824518987ddb66b9ee6c7d945daebc2b0957817',
  targetSchemaFingerprint: '47cb21b39db8be7336d10533ed319fe314f5bda65d850f1297c8321de6c9d165',
  sql: PARTY_SQL
});

export function runWorldRuntimeCatalogMigration(pool) {
  return runForwardMigration({ pool, migration: WORLD_RUNTIME_CATALOG_MIGRATION });
}

export function runPartyRuntimeCatalogMigration(pool) {
  return runForwardMigration({ pool, migration: PARTY_RUNTIME_CATALOG_MIGRATION });
}
