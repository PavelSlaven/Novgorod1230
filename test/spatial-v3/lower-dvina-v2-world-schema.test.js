import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = 'infra/world-base/schema/19.sql';

test('world schema 19 owns exact immutable external dependency pins', async () => {
  const ddl = await readFile(migrationPath, 'utf8');

  for (const column of [
    'registry_type',
    'registry_id',
    'registry_version',
    'registry_digest',
    'dependency_id',
    'dependency_version',
    'dependency_digest',
    'status',
    'approval_ref',
    'approval_digest',
    'canonical_digest'
  ]) {
    assert.match(ddl, new RegExp(`\\b${column}\\b`, 'u'));
  }
  assert.match(ddl, /status TEXT NOT NULL CHECK \(status = 'approved'\)/u);
  assert.match(ddl, /approved external dependency rows are immutable/u);
});

test('world schema 19 enforces internal/external target XOR without proxies', async () => {
  const ddl = await readFile(migrationPath, 'utf8');

  assert.match(ddl, /target_entity_kind <> 'external_dependency'/u);
  assert.match(ddl, /target_entity_kind = 'external_dependency'/u);
  assert.match(ddl, /spatial_v3_authoring_versions target/u);
  assert.match(ddl, /spatial_v3_external_dependency_versions dependency/u);
  assert.doesNotMatch(ddl, /navigation_zone@2/u);
});

test('canonical world schema entrypoint appends 19 after 18', async () => {
  const entrypoint = await readFile('infra/world-base/schema.sql', 'utf8');
  assert.match(entrypoint, /\\ir schema\/18\.sql\r?\n\\ir schema\/19\.sql/u);
});
