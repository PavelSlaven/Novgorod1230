import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectWorldBaseSchema } from '../../scripts/check-world-base-schema.mjs';

test('world_base schema expands to exactly 121 unique tables', async () => {
  const result = await inspectWorldBaseSchema({ root: process.cwd() });
  assert.equal(result.schema, 'world_base');
  assert.equal(result.table_count, 121);
  assert.equal(result.table_names.length, 121);
  assert.deepEqual(result.duplicate_table_names, []);
  assert.equal(result.part_files.length, 11);
});

test('world_base schema keeps the read-only runtime role', async () => {
  const result = await inspectWorldBaseSchema({ root: process.cwd() });
  assert.equal(result.has_world_reader_role, true);
  assert.equal(result.revokes_public_create, true);
  assert.equal(result.grants_world_reader_usage, true);
  assert.equal(result.grants_world_reader_select, true);
  assert.equal(result.grants_default_world_reader_select, true);
  assert.equal(result.grants_world_reader_write, false);
});
