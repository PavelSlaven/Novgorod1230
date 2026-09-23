import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { SPATIAL_V3_TARGET_MIGRATION_FILES } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';
import { buildPartyRuntimeSchemaReference } from '../../scripts/generate-party-runtime-schema-reference.mjs';

test('party_runtime reference covers the current ordered migration chain and committed output', async () => {
  const root = process.cwd();
  const files = (await readdir(resolve(root, 'schemas/party-db'))).filter((file) => /^\d{3}_.*\.sql$/u.test(file)).sort();
  assert.deepEqual(SPATIAL_V3_TARGET_MIGRATION_FILES, files);

  const result = await buildPartyRuntimeSchemaReference({ root });
  const committed = await readFile(resolve(root, 'infra/party-db/SCHEMA_REFERENCE.md'), 'utf8');
  assert.equal(result.migration_count, 33);
  assert.equal(result.table_count, 131);
  assert.equal(result.markdown, committed);
  assert.equal([...committed.matchAll(/^## `party_runtime\.[a-z_][a-z0-9_]*`$/gmu)].length, 131);
  assert.match(committed, /party_runtime\.party_spatial_semantic_resolutions/u);
  assert.match(committed, /029_party_runtime_spatial_semantic_remainder\.sql/u);
  assert.match(committed, /ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'narrated'/u);
  assert.match(committed, /ADD COLUMN IF NOT EXISTS factual_screen jsonb/u);
  assert.match(committed, /CHECK \(state_version >= 0\)/u);
  assert.match(committed, /DROP INDEX IF EXISTS party_runtime\.party_activity_one_nonterminal_uq/u);
  assert.match(committed, /'ALTER TABLE party_runtime\.party_activity_resource_bindings DROP CONSTRAINT %I'/u);
  assert.match(committed, /## Полный SQL миграций/u);
});
