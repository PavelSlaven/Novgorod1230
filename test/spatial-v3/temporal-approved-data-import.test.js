import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildApprovedTemporalImportSql,
  collectApprovedTemporalBundle
} from '../../tools/temporal-v4/import-approved-data.mjs';
import { inspectWorldBaseSchema } from '../../scripts/check-world-base-schema.mjs';

const root = process.cwd();

test('Temporal authoring DDL adds the four normalized read-only world_base tables', async () => {
  const schema = await inspectWorldBaseSchema({ root });
  assert.equal(schema.part_files.at(-1), 'infra/world-base/schema/18.sql');
  for (const table of [
    'temporal_source_history',
    'temporal_provenance',
    'temporal_authoring_records',
    'temporal_normalized_references'
  ]) {
    assert(schema.table_names.includes(table), `missing world_base.${table}`);
  }
});

test('approved Temporal bundle has exact family, record, reference and source coverage', async () => {
  const bundle = await collectApprovedTemporalBundle({ root });
  assert.equal(bundle.family_count, 13);
  assert.equal(bundle.record_count, 22);
  assert.equal(bundle.reference_count, 22);
  assert.equal(bundle.provenance_count, 14);
  assert.equal(bundle.source_count, 46);
  assert.equal(bundle.developer_table_binding_count, 0);
  assert.deepEqual(bundle.errors, []);
});

test('Temporal importer emits one atomic idempotent transaction and supports rollback drills', async () => {
  const commitSql = await buildApprovedTemporalImportSql({ root });
  const rollbackSql = await buildApprovedTemporalImportSql({ root, rollback: true });

  assert.match(commitSql, /^BEGIN;\nSELECT pg_advisory_xact_lock\(-748013240124003114\);/u);
  assert.match(commitSql, /INSERT INTO world_base\.temporal_source_history/u);
  assert.match(commitSql, /INSERT INTO world_base\.temporal_provenance/u);
  assert.match(commitSql, /INSERT INTO world_base\.temporal_authoring_records/u);
  assert.match(commitSql, /INSERT INTO world_base\.temporal_normalized_references/u);
  assert.match(commitSql, /TEMPORAL_APPROVED_ROW_MISMATCH/u);
  assert.match(commitSql, /COMMIT;\n$/u);
  assert.match(rollbackSql, /ROLLBACK;\n$/u);
  assert.equal(await buildApprovedTemporalImportSql({ root }), commitSql);
});

test('approved reaction policy uses the existing immutable Temporal record store without duplicate decision DDL', async () => {
  const schema = await inspectWorldBaseSchema({ root });
  const bundle = await collectApprovedTemporalBundle({ root });
  const records = bundle.families.flatMap((family) => family.records);
  const reactionPolicies = records.filter(
    ({ record_kind }) => record_kind === 'npc_reaction_policy'
  );

  assert.equal(reactionPolicies.length, 1);
  assert.equal(
    reactionPolicies[0].record_id,
    'record:npc_temporal_profiles_policies:reaction_signal_policy_v1'
  );
  assert.equal(schema.part_files.at(-1), 'infra/world-base/schema/18.sql');
  assert.equal(
    schema.table_names.some((name) =>
      name.startsWith('spatial_v3_decision_')
    ),
    false
  );
});

test('normalized references bind every returned record to the physical Temporal table', async () => {
  const base = 'data/world-catalogs/novgorod/temporal-v4';
  const matrix = JSON.parse(await readFile(
    'docs/work/temporal-world-v4/data-readiness.v1.json',
    'utf8'
  ));
  let count = 0;
  for (const family of matrix.families) {
    const references = JSON.parse(await readFile(
      `${base}/datasets/${family.id}.references.json`,
      'utf8'
    ));
    for (const reference of references) {
      assert.equal(reference.table, 'temporal_authoring_records');
      assert.equal(reference.record_id, reference.source_record_key);
      count += 1;
    }
  }
  assert.equal(count, 22);
});
