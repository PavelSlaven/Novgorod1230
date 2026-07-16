import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLegacyClassificationInventory } from '../src/legacy-classification-inventory.js';

const exported_at = '2026-07-16T09:00:00Z';

test('unverified operator source never claims that legacy rows are absent', () => {
  const result = buildLegacyClassificationInventory({ source: { kind: 'operator_database', verified: false, verification_reason: 'not_accessible' } });
  assert.equal(result.complete, false);
  assert.equal(result.legacy_field_row_count, null);
  assert.equal(result.resolution_counts.mapped, null);
  assert.equal(result.issues[0].code, 'LEGACY_SOURCE_NOT_VERIFIED');
});

test('verified rows receive all four deterministic resolution statuses', () => {
  const input = {
    source: { kind: 'postgresql', verified: true, identity: { database: 'world', schema: 'world_base' } }, exported_at,
    rows_by_table: { item_templates: [{ id: 'a', item_type: 'knife', function: 'cutting', typical_material: 'iron', rarity: 'common' }, { id: 'b', item_type: 'unknown', function: 'stale' }] },
    approved_category_ids: ['cat_knife'], existing_resolutions: [
      { legacy_table_name: 'item_templates', legacy_record_id: 'a', legacy_field_name: 'item_type', legacy_value: 'knife', resolution_status: 'mapped', resolved_category_id: 'cat_knife' },
      { legacy_table_name: 'item_templates', legacy_record_id: 'a', legacy_field_name: 'function', legacy_value: 'cutting', resolution_status: 'migration_conflict' },
      { legacy_table_name: 'item_templates', legacy_record_id: 'b', legacy_field_name: 'function', legacy_value: 'old', resolution_status: 'mapped', resolved_category_id: 'cat_knife' }
    ]
  };
  const left = buildLegacyClassificationInventory(input);
  const right = buildLegacyClassificationInventory(input);
  assert.deepEqual(left, right);
  assert.deepEqual(left.resolution_counts, { mapped: 1, data_gap: 2, migration_conflict: 2, deferred: 1 });
  assert.match(left.source_snapshot_digest, /^[a-f0-9]{64}$/u);
});

test('mapped resolution requires an approved category', () => {
  const result = buildLegacyClassificationInventory({ source: { kind: 'postgresql', verified: true, identity: { database: 'world' } }, exported_at, rows_by_table: { item_templates: [{ id: 'a', item_type: 'knife' }] }, existing_resolutions: [{ legacy_table_name: 'item_templates', legacy_record_id: 'a', legacy_field_name: 'item_type', legacy_value: 'knife', resolution_status: 'mapped', resolved_category_id: 'not_approved' }] });
  assert.equal(result.rows[0].resolution_status, 'migration_conflict');
  assert.equal(result.rows[0].resolved_category_id, undefined);
});
