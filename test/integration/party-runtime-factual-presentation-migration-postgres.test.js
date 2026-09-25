import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { runPartyRuntimeCatalogMigration } from
  '../../tools/runtime-catalog-activation/src/forward-migrations.js';

const docker = (args) => spawnSync(
  'docker', args, { encoding: 'utf8', timeout: 45_000 }
);

test('factual presentation migration preserves predecessor checks and accepts only valid delivery rows', async (t) => {
  if (docker(['version']).status !== 0) {
    t.skip('Docker is required for isolated factual-presentation migration');
    return;
  }
  const name = `factual-presentation-migration-${process.pid}`;
  let pool;
  t.after(async () => {
    if (pool) await pool.end();
    docker(['rm', '-fv', name]);
  });
  const started = docker([
    'run', '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=local_only',
    '-e', 'POSTGRES_USER=factual_migration',
    '-e', 'POSTGRES_DB=factual_migration', 'postgres:16-alpine'
  ]);
  assert.equal(started.status, 0, started.stderr);
  await waitForPostgres(name);
  const port = Number(
    docker(['port', name, '5432']).stdout.match(/:(\d+)\s*$/u)?.[1]
  );
  pool = new pg.Pool({
    host: '127.0.0.1', port, user: 'factual_migration',
    password: 'local_only', database: 'factual_migration', max: 2
  });

  const files = (await readdir('schemas/party-db'))
    .filter((file) => /^\d+.*\.sql$/u.test(file)).sort();
  const catalogIndex = files.findIndex((file) => file.startsWith('012_'));
  const factualIndex = files.findIndex((file) => file.startsWith('032_'));
  for (const file of files.slice(0, catalogIndex)) {
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
  assert.equal((await runPartyRuntimeCatalogMigration(pool)).status, 'applied');
  for (const file of files.slice(catalogIndex, factualIndex)) {
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
  await pool.query(`
    ALTER TABLE party_runtime.party_narration_jobs
      ADD CONSTRAINT party_narration_jobs_sentinel_check
      CHECK (job_id <> 'sentinel-forbidden')
  `);
  await pool.query(`
    ALTER TABLE party_runtime.party_narration_attempts
      ADD CONSTRAINT party_narration_attempts_sentinel_check
      CHECK (attempt_id <> 'sentinel-forbidden')
  `);
  const factualMigrationSql = await readFile(
    `schemas/party-db/${files[factualIndex]}`, 'utf8'
  );
  await pool.query(factualMigrationSql);
  await pool.query(factualMigrationSql);

  assert.equal((await pool.query(`
    SELECT count(*)::int AS count FROM pg_constraint
    WHERE conrelid='party_runtime.party_narration_jobs'::regclass
      AND conname='party_narration_jobs_sentinel_check'
  `)).rows[0].count, 1);
  assert.equal((await pool.query(`
    SELECT count(*)::int AS count FROM pg_constraint
    WHERE conrelid='party_runtime.party_narration_attempts'::regclass
      AND conname='party_narration_attempts_sentinel_check'
  `)).rows[0].count, 1);
  await pool.query(`
    INSERT INTO party_runtime.parties(
      party_id,schema_version,world_revision_id,world_catalog_digest,
      materializer_version,rng_version,command_catalog_digest,profile_bundle_digest
    ) VALUES ('party',2,'world','catalog','materializer','rng','commands','profile');
    INSERT INTO party_runtime.party_visible_packages(
      package_id,party_id,turn_id,committed_state_version,change_set_id,
      package_digest,visible_payload,presentation_status,projection_policy_ref,
      dependency_pins,idempotency_record_id
    ) VALUES (
      'package','party','turn',1,'change','digest','{}'::jsonb,'pending',
      '{}'::jsonb,'{}'::jsonb,'idempotency'
    );
    INSERT INTO party_runtime.party_narration_jobs(
      job_id,party_id,package_id,status,idempotency_key,next_attempt_ordinal,
      narration_output,output_digest,state_version
    ) VALUES (
      'narrated','party','package','delivered','narrated',1,
      '{}'::jsonb,'digest',1
    );
    INSERT INTO party_runtime.party_narration_attempts(
      attempt_id,job_id,attempt_ordinal,outcome,output_digest
    ) VALUES ('narrated-attempt','narrated',0,'delivered','digest');
    INSERT INTO party_runtime.party_visible_packages(
      package_id,party_id,turn_id,committed_state_version,change_set_id,
      package_digest,visible_payload,presentation_status,projection_policy_ref,
      dependency_pins,idempotency_record_id
    ) VALUES (
      'package-factual','party','turn-factual',1,'change-factual','digest-factual',
      '{}'::jsonb,'pending','{}'::jsonb,'{}'::jsonb,'idempotency-factual'
    );
    INSERT INTO party_runtime.party_narration_jobs(
      job_id,party_id,package_id,status,idempotency_key,next_attempt_ordinal,
      delivery_mode,factual_screen,state_version
    ) VALUES ('factual','party','package-factual','delivered','factual',1,
      'factual','{}'::jsonb,1);
  `);
  await pool.query(`
    INSERT INTO party_runtime.party_narration_attempts(
      attempt_id,job_id,attempt_ordinal,outcome
    ) VALUES ('factual-attempt','factual',0,'factual_delivered');
  `);
  await assert.rejects(() => pool.query(`
    INSERT INTO party_runtime.party_narration_jobs(
      job_id,party_id,package_id,status,idempotency_key,next_attempt_ordinal,
      delivery_mode,state_version
    ) VALUES ('invalid-factual','party','package','pending','invalid',0,'factual',1)
  `), { code: '23514' });
  await assert.rejects(() => pool.query(`
    INSERT INTO party_runtime.party_narration_attempts(
      attempt_id,job_id,attempt_ordinal,outcome,output_digest
    ) VALUES ('invalid-attempt','factual',1,'factual_delivered','digest')
  `), { code: '23514' });
  await assert.rejects(() => pool.query(`
    INSERT INTO party_runtime.party_narration_jobs(
      job_id,party_id,package_id,status,idempotency_key,next_attempt_ordinal
    ) VALUES ('sentinel-forbidden','party','package','pending','sentinel',0)
  `), { code: '23514' });
  await assert.rejects(() => pool.query(`
    INSERT INTO party_runtime.party_narration_attempts(
      attempt_id,job_id,attempt_ordinal,outcome,output_digest
    ) VALUES ('sentinel-forbidden','narrated',1,'delivered','digest')
  `), { code: '23514' });
});

async function waitForPostgres(name) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (docker(['exec', name, 'pg_isready', '-h', '127.0.0.1',
      '-U', 'factual_migration', '-d', 'factual_migration']).status === 0) return;
  }
  throw new Error('PostgreSQL did not become ready');
}
