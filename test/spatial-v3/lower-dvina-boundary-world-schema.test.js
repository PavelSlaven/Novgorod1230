import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('world schema 20 adds queryable policy owners without a second engine', async () => {
  const ddl = await readFile('infra/world-base/schema/20.sql', 'utf8');
  for (const table of [
    'spatial_v3_traversal_availability_policies',
    'spatial_v3_traversal_check_policies',
    'spatial_v3_traversal_consequence_policies',
    'spatial_v3_traversal_risk_profiles'
  ]) {
    assert.match(ddl, new RegExp(`CREATE TABLE IF NOT EXISTS world_base\\.${table}`, 'u'));
  }
  assert.match(ddl, /identity_scope_kind = 'traversal_interval_result_id'/u);
  assert.match(ddl, /CHECK \(NOT fatality_allowed\)/u);
  assert.match(ddl, /CHECK \(NOT craft_destruction_allowed\)/u);
  assert.doesNotMatch(ddl, /party_runtime\./u);
});

test('canonical world schema entrypoint appends 20 after 19', async () => {
  const entrypoint = await readFile('infra/world-base/schema.sql', 'utf8');
  assert.match(entrypoint, /\\ir schema\/19\.sql\r?\n\\ir schema\/20\.sql/u);
});
