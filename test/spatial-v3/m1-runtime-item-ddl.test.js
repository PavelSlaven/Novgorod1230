import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL(
  '../../schemas/party-db/015_party_runtime_turn_step_items.sql',
  import.meta.url
);

test('M1 forward DDL admits only authored or strict direct-runtime item mechanics', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /CREATE OR REPLACE FUNCTION\s+party_runtime\.runtime_item_jsonb_exact_keys/u);
  assert.match(sql, /FROM jsonb_object_keys\(value\)/u);
  assert.match(sql, /CREATE OR REPLACE FUNCTION\s+party_runtime\.runtime_item_jsonb_exact_text/u);
  for (const escape of [
    '\\0009', '\\000A', '\\000D', '\\00A0', '\\2003', '\\FEFF'
  ]) assert.ok(sql.includes(escape), escape);
  assert.match(sql, /btrim\([\s\S]*U&'/u);
  assert.match(sql, /CREATE OR REPLACE FUNCTION\s+party_runtime\.runtime_instance_mechanics_snapshot_valid\(value jsonb\)/u);
  assert.match(sql, /IMMUTABLE[\s\S]*PARALLEL SAFE/u);
  assert.match(sql, /ARRAY\['schema','version','provenance','mechanics'\]/u);
  assert.match(sql, /rus\.items\.runtime_instance_mechanics_snapshot\.v1/u);
  assert.match(sql, /ordinary_direct_action_result/u);
  assert.match(sql, /'source_kind','root_turn_id','step_index','operation_ref'/u);
  assert.match(sql, /numeric_value <= 0[\s\S]*numeric_value > 8[\s\S]*numeric_value <> trunc\(numeric_value\)/u);
  assert.match(sql, /jsonb_typeof\(source_refs\) <> 'array'/u);
  assert.match(sql, /source_ref_text = ANY\(seen_source_refs\)/u);
  assert.match(sql, /'mass_grams','external_hand_cost','carry_form','packing_slot_cost'/u);
  assert.match(sql, /'compact','regular','long','bulky'/u);
  assert.match(sql, /numeric_value NOT IN \(0, 1, 2\)/u);
  assert.equal((sql.match(/numeric_value > 9007199254740991/gu) ?? []).length, 2);
  assert.match(sql, /mechanics->'container' <> 'null'::jsonb/u);
  assert.match(sql, /ARRAY\['value','unit'\]/u);
  assert.match(sql, /numeric_value > 1\.7976931348623157e308/u);
  assert.match(sql, /numeric_value < 4\.9406564584124654e-324/u);
  assert.doesNotMatch(sql, /::double precision/u);
  assert.match(sql, /ALTER COLUMN run_id DROP NOT NULL/u);
  assert.match(sql, /ALTER COLUMN template_id DROP NOT NULL/u);
  assert.match(sql, /ALTER COLUMN profile_id DROP NOT NULL/u);
  assert.match(sql, /ALTER COLUMN category_id DROP NOT NULL/u);
  assert.match(sql, /AND NOT state \? 'runtime_instance_mechanics_snapshot'/u);
  assert.match(sql, /run_id IS NULL[\s\S]*template_id IS NULL[\s\S]*profile_id IS NULL[\s\S]*category_id IS NULL[\s\S]*runtime_instance_mechanics_snapshot_valid/u);
  assert.match(sql, /DROP CONSTRAINT IF EXISTS party_items_mechanics_source_check/u);
  assert.match(sql,
    /to_regprocedure\([\s\S]*ordinary_world_runtime_instance_mechanics_snapshot_valid\(jsonb\)[\s\S]*IS NULL THEN[\s\S]*DROP CONSTRAINT IF EXISTS party_items_mechanics_source_check/u);
  assert.doesNotMatch(sql, /sentinel/iu);
});

test('M1 forward DDL adds same-party, exclusive, non-self item attachment', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /ADD COLUMN IF NOT EXISTS attached_item_id text/u);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS scene_position_id text/u);
  assert.match(sql, /party_item_placements_owner_check/u);
  assert.match(sql,
    /CASE WHEN scene_position_id IS NULL THEN 0 ELSE 1 END/u);
  assert.match(sql, /CASE WHEN attached_item_id IS NULL THEN 0 ELSE 1 END\) = 1/u);
  assert.match(sql, /FOREIGN KEY \(party_id, attached_item_id\)[\s\S]*REFERENCES party_runtime\.party_items\(party_id, item_id\)/u);
  assert.match(sql, /CHECK \(attached_item_id IS NULL OR attached_item_id <> item_id\)/u);
  for (const constraint of [
    'party_item_placements_owner_check',
    'party_item_placements_attached_item_fk',
    'party_item_placements_no_self_attachment_check'
  ]) {
    assert.match(sql, new RegExp(`DROP CONSTRAINT IF EXISTS ${constraint}`, 'u'));
    assert.match(sql, new RegExp(`ADD CONSTRAINT ${constraint}`, 'u'));
  }
});
