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
  migrationId: 'world_runtime_catalog_activation_v1',
  schemaName: 'world_base',
  sourceSchemaFingerprint: '486ef58ba51684f6f2580e444b9421e658508cf23633025a19dad53192694be6',
  targetSchemaFingerprint: '7f85a1a17155fb2c3e63344a0ba0c8311f70204b40dcae5cac129c84fbe6e4a1',
  sql: WORLD_SQL
});

export const PARTY_RUNTIME_CATALOG_MIGRATION = createForwardMigration({
  migrationId: 'party_runtime_catalog_pins_v1',
  schemaName: 'party_runtime',
  sourceSchemaFingerprint: 'bff629c600558782d860ad120a5ea8eab24f2f98b4caf6f49c70bc4ef7079a82',
  targetSchemaFingerprint: '329a84c3c5ccd76e4a84b67454bcbd6e6c176fafbd285e77d44824dddcd8d2dd',
  sql: PARTY_SQL
});

export function runWorldRuntimeCatalogMigration(pool) {
  return runForwardMigration({ pool, migration: WORLD_RUNTIME_CATALOG_MIGRATION });
}

export function runPartyRuntimeCatalogMigration(pool) {
  return runForwardMigration({ pool, migration: PARTY_RUNTIME_CATALOG_MIGRATION });
}
