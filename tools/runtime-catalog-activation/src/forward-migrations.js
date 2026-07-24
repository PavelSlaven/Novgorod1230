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
  sourceSchemaFingerprint: '8f5d28619bb2f666c5efae6c376f89c0b9f21c0e9b90889c3b975c772cecdb08',
  targetSchemaFingerprint: 'd6eb5c68e8df74989443de56b77145569e65d43988953ddeb0bff6256f3df89f',
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
