import { readFileSync } from 'node:fs';
import {
  classifyForwardMigrationState,
  createForwardMigration,
  runForwardMigration
} from './forward-migration.js';

const WORLD_SQL = readFileSync(
  new URL('../migrations/world/001_runtime_catalog_activation.sql', import.meta.url),
  'utf8'
);
const LEGACY_WORLD_BRIDGE_SQL = [
  ...Array.from({ length: 12 }, (_, index) => String(index + 9).padStart(2, '0'))
    .map((part) => readFileSync(
      new URL(`../../../infra/world-base/schema/${part}.sql`, import.meta.url),
      'utf8'
    )),
  readFileSync(
    new URL('../migrations/world/000_legacy_world_bridge_finalize.sql', import.meta.url),
    'utf8'
  )
].join('\n\n');
const PARTY_SQL = readFileSync(
  new URL('../migrations/party/001_runtime_catalog_pins.sql', import.meta.url),
  'utf8'
);

export const WORLD_LEGACY_SCHEMA_BRIDGE = createForwardMigration({
  migrationId: 'world_legacy_062_to_canonical_v1',
  schemaName: 'world_base',
  sourceSchemaFingerprint: '869021eded07633eec27048a102600385248e5a8e5f8dd499943d404e17fad8f',
  targetSchemaFingerprint: '9d1d4b187cd22049b60340f48c1cbcd4b6282f7cca0c08594d06c7ed0f067080',
  sql: LEGACY_WORLD_BRIDGE_SQL
});

export const WORLD_RUNTIME_CATALOG_MIGRATION = createForwardMigration({
  migrationId: 'world_runtime_catalog_activation_v2',
  schemaName: 'world_base',
  sourceSchemaFingerprint: '9d1d4b187cd22049b60340f48c1cbcd4b6282f7cca0c08594d06c7ed0f067080',
  targetSchemaFingerprint: 'e977fdd2e6a7f06fd801b32b23965f35106d057c63989200546f179c6193091d',
  sql: WORLD_SQL
});

export const PARTY_RUNTIME_CATALOG_MIGRATION = createForwardMigration({
  migrationId: 'party_runtime_catalog_pins_v2',
  schemaName: 'party_runtime',
  sourceSchemaFingerprint: '16f99b12e58ce60f6c87e29e0824518987ddb66b9ee6c7d945daebc2b0957817',
  targetSchemaFingerprint: '47cb21b39db8be7336d10533ed319fe314f5bda65d850f1297c8321de6c9d165',
  sql: PARTY_SQL
});

export function buildWorldRuntimeCatalogMigrationPreflight({
  actualSchemaFingerprint,
  ledgerRow
}) {
  const bridgeState = actualSchemaFingerprint === WORLD_LEGACY_SCHEMA_BRIDGE.source_schema_fingerprint
    ? 'ready'
    : actualSchemaFingerprint === WORLD_LEGACY_SCHEMA_BRIDGE.target_schema_fingerprint
      || actualSchemaFingerprint === WORLD_RUNTIME_CATALOG_MIGRATION.target_schema_fingerprint
      ? 'already_applied'
      : 'MIGRATION_SCHEMA_FINGERPRINT_UNKNOWN';
  let runtimeState;
  if (actualSchemaFingerprint === WORLD_LEGACY_SCHEMA_BRIDGE.source_schema_fingerprint) {
    runtimeState = 'ready_after_prerequisite';
  } else {
    try {
      runtimeState = classifyForwardMigrationState({
        migration: WORLD_RUNTIME_CATALOG_MIGRATION,
        actualSchemaFingerprint,
        ledgerRow
      }).status;
    } catch (error) {
      runtimeState = error.code;
    }
  }
  const checks = [
    {
      migration_id: WORLD_LEGACY_SCHEMA_BRIDGE.migration_id,
      migration_digest: WORLD_LEGACY_SCHEMA_BRIDGE.migration_digest,
      actual_schema_fingerprint: actualSchemaFingerprint,
      target_schema_fingerprint: WORLD_LEGACY_SCHEMA_BRIDGE.target_schema_fingerprint,
      state: bridgeState
    },
    {
      migration_id: WORLD_RUNTIME_CATALOG_MIGRATION.migration_id,
      migration_digest: WORLD_RUNTIME_CATALOG_MIGRATION.migration_digest,
      actual_schema_fingerprint: actualSchemaFingerprint,
      target_schema_fingerprint: WORLD_RUNTIME_CATALOG_MIGRATION.target_schema_fingerprint,
      state: runtimeState
    }
  ];
  return Object.freeze({
    status: checks.every(({ state }) =>
      ['ready', 'ready_after_prerequisite', 'already_applied'].includes(state))
      ? 'ready'
      : 'blocked',
    checks: Object.freeze(checks.map(Object.freeze))
  });
}

export async function runWorldRuntimeCatalogMigration(pool) {
  return runForwardMigration({
    pool,
    migration: WORLD_RUNTIME_CATALOG_MIGRATION,
    sourceBridge: WORLD_LEGACY_SCHEMA_BRIDGE
  });
}

export function runPartyRuntimeCatalogMigration(pool) {
  return runForwardMigration({ pool, migration: PARTY_RUNTIME_CATALOG_MIGRATION });
}
