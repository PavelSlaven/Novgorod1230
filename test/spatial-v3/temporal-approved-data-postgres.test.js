import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildApprovedTemporalImportSql } from '../../tools/temporal-v4/import-approved-data.mjs';

const name = `temporal-approved-${process.pid}`;
const docker = (args, input) => spawnSync('docker', args, {
  input,
  encoding: 'utf8',
  timeout: 90_000
});

test('approved Temporal data imports atomically and idempotently in isolated PostgreSQL', async (t) => {
  if (docker(['version']).status !== 0) {
    return t.skip('Docker required for isolated Temporal PostgreSQL test');
  }
  t.after(() => docker(['rm', '-f', name]));
  const started = docker([
    'run',
    '-d',
    '--name',
    name,
    '-e',
    'POSTGRES_PASSWORD=temporal_local',
    '-e',
    'POSTGRES_USER=temporal',
    '-e',
    'POSTGRES_DB=temporal',
    'postgres:16-alpine'
  ]);
  assert.equal(started.status, 0, started.stderr);

  const psql = (sql, { tuples = false } = {}) => docker([
    'exec',
    '-i',
    name,
    'psql',
    '-q',
    ...(tuples ? ['-A', '-t'] : []),
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'temporal',
    '-d',
    'temporal'
  ], sql);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = psql('SELECT 1;', { tuples: true });
    if (probe.status === 0 && probe.stdout.trim() === '1') {
      if (ready) break;
      ready = true;
    } else {
      ready = false;
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  assert.equal(ready, true, 'target database did not become stably queryable');

  const ddl = (await Promise.all(
    Array.from({ length: 18 }, (_, index) =>
      readFile(
        `infra/world-base/schema/${String(index + 1).padStart(2, '0')}.sql`,
        'utf8'
      )
    )
  )).join('\n');
  const ddlResult = psql(ddl);
  assert.equal(ddlResult.status, 0, ddlResult.stderr);

  const rollbackResult = psql(await buildApprovedTemporalImportSql({
    root: process.cwd(),
    rollback: true
  }));
  assert.equal(rollbackResult.status, 0, rollbackResult.stderr);
  const emptyCounts = psql(`
    SELECT json_build_array(
      (SELECT count(*) FROM world_base.temporal_source_history),
      (SELECT count(*) FROM world_base.temporal_provenance),
      (SELECT count(*) FROM world_base.temporal_authoring_records),
      (SELECT count(*) FROM world_base.temporal_normalized_references)
    );
  `, { tuples: true });
  assert.equal(emptyCounts.status, 0, emptyCounts.stderr);
  assert.deepEqual(JSON.parse(emptyCounts.stdout), [0, 0, 0, 0]);

  const commitSql = await buildApprovedTemporalImportSql({ root: process.cwd() });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = psql(commitSql);
    assert.equal(result.status, 0, result.stderr);
  }
  const committedCounts = psql(`
    SELECT json_build_array(
      (SELECT count(*) FROM world_base.temporal_source_history),
      (SELECT count(*) FROM world_base.temporal_provenance),
      (SELECT count(*) FROM world_base.temporal_authoring_records),
      (SELECT count(*) FROM world_base.temporal_normalized_references)
    );
  `, { tuples: true });
  assert.equal(committedCounts.status, 0, committedCounts.stderr);
  assert.deepEqual(JSON.parse(committedCounts.stdout), [46, 14, 22, 22]);

  const readerSelect = psql(`
    SET ROLE world_reader;
    SELECT count(*) FROM world_base.temporal_authoring_records;
  `, { tuples: true });
  assert.equal(readerSelect.status, 0, readerSelect.stderr);
  assert.match(readerSelect.stdout, /22/u);
  const reactionReadback = psql(`
    SET ROLE world_reader;
    SELECT json_build_object(
      'record_id', record_id,
      'record_version', record_version,
      'record_kind', record_kind,
      'status', status,
      'command_ids', (
        SELECT json_agg(command_record->'command_ref'->'entity_ref'->>'entity_id'
          ORDER BY command_record->'command_ref'->'entity_ref'->>'entity_id')
        FROM jsonb_array_elements(payload->'command_records') command_record
      )
    )
    FROM world_base.temporal_authoring_records
    WHERE record_id =
      'record:npc_temporal_profiles_policies:reaction_signal_policy_v1'
      AND record_version = '1'
      AND record_kind = 'npc_reaction_policy'
      AND status = 'approved';
  `, { tuples: true });
  assert.equal(reactionReadback.status, 0, reactionReadback.stderr);
  assert.deepEqual(JSON.parse(reactionReadback.stdout), {
    record_id:
      'record:npc_temporal_profiles_policies:reaction_signal_policy_v1',
    record_version: '1',
    record_kind: 'npc_reaction_policy',
    status: 'approved',
    command_ids: [
      'npc_investigate_signal',
      'npc_report_to_authority',
      'npc_seek_safety'
    ]
  });
  const readerWrite = psql(`
    SET ROLE world_reader;
    INSERT INTO world_base.temporal_authoring_records (
      record_id, family_id, record_kind, record_version, applicability,
      status, provenance_refs, normalized_reference_ids, source_history_refs,
      payload, canonical_digest
    ) VALUES (
      'forbidden', 'forbidden', 'forbidden', '1', ARRAY['novgorod'],
      'approved', ARRAY['forbidden'], ARRAY['forbidden'], ARRAY['forbidden'],
      '{}'::jsonb, '${'f'.repeat(64)}'
    );
  `);
  assert.notEqual(readerWrite.status, 0);
  assert.match(readerWrite.stderr, /permission denied/u);

  const corrupted = psql(`
    ALTER TABLE world_base.temporal_source_history
      DISABLE TRIGGER temporal_source_history_immutable;
    UPDATE world_base.temporal_source_history
      SET family_id = 'corrupted'
      WHERE source_id = (
        SELECT source_id FROM world_base.temporal_source_history ORDER BY source_id LIMIT 1
      );
    ALTER TABLE world_base.temporal_source_history
      ENABLE TRIGGER temporal_source_history_immutable;
  `);
  assert.equal(corrupted.status, 0, corrupted.stderr);
  const rejected = psql(commitSql);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /TEMPORAL_APPROVED_ROW_MISMATCH/u);

  const immutable = psql(`
    UPDATE world_base.temporal_authoring_records
      SET family_id = family_id
      WHERE record_id = (
        SELECT record_id FROM world_base.temporal_authoring_records LIMIT 1
      );
  `);
  assert.notEqual(immutable.status, 0);
  assert.match(immutable.stderr, /immutable/u);
});
