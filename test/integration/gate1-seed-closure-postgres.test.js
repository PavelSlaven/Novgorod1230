import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import pg from 'pg';

import { ensureLocalPostgres, LOCAL_POSTGRES } from
  '../../tools/local-play/local-postgres.js';
import { deriveGate1SeedPersistedClosure } from
  '../../scripts/generate-gate1-seed-persisted-closure.mjs';
import { buildGate1SeedClosureArtifacts } from
  '../../scripts/generate-gate1-seed-closure-request.mjs';
import { assertCanonicalSeedTableClosure,
  readCanonicalSeedTableClosure } from
  '../../tools/world-catalog-workflow/src/seed-closure-readback.js';

const closureRoot = 'data/world-catalogs/novgorod/runtime-catalog/'
  + 'gate1-owner-data-v1/seed-closure-v1';
const seedPath = 'tools/rus13-world-base-importer/'
  + 'world_base_importer_v1/world_base_seed_v1.sql.gz';

test('Gate1 closure accepts graph-node newline normalization but rejects content mutation',
  async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'novgorod-seed-closure-'));
    const managed = await ensureLocalPostgres({ dataRoot,
      settings: { ...LOCAL_POSTGRES,
        worldDatabase: `pr17_seed_closure_${process.pid}`,
        partyDatabase: `pr17_seed_party_${process.pid}`,
        worldUser: 'postgres', partyUser: 'postgres' } });
    const pool = new pg.Pool({ connectionString: managed.worldUrl, max: 1 });
    t.after(async () => {
      await pool.end();
      await managed.close();
      await rm(dataRoot, { recursive: true, force: true });
    });

    const derived = await deriveGate1SeedPersistedClosure(pool);
    const generated = await buildGate1SeedClosureArtifacts({
      tableClosure: derived.table_closure
    });
    if (process.env.GATE1_SEED_CLOSURE_WRITE === '1') {
      await Promise.all(Object.entries(generated).map(([name, value]) =>
        writeFile(`${closureRoot}/${name}.json`,
          `${JSON.stringify(value, null, 2)}\n`)));
    }
    const checked = {
      candidate: JSON.parse(await readFile(`${closureRoot}/candidate.json`,
        'utf8')),
      request: JSON.parse(await readFile(`${closureRoot}/request.json`,
        'utf8'))
    };
    assert.deepEqual(generated, checked);
    assert.equal(derived.table_count, 30);
    assert.equal(derived.total_row_count, 42577);

    const seedSql = gunzipSync(await readFile(seedPath)).toString('utf8');
    const startMarker = 'SET CONSTRAINTS ALL DEFERRED;';
    await pool.query('BEGIN');
    try {
      await pool.query('SET CONSTRAINTS ALL DEFERRED');
      await pool.query(seedSql.slice(seedSql.indexOf(startMarker)
        + startMarker.length, seedSql.lastIndexOf('COMMIT;')));
      const beforeCount = Number((await pool.query(`SELECT count(*) AS count
        FROM world_base.graph_nodes`)).rows[0].count);
      const crlfSource = await pool.query(`UPDATE world_base.graph_nodes
        SET audit_notes=replace(audit_notes, E'\\n', E'\\r\\n')
        WHERE position(E'\\n' in audit_notes) > 0`);
      assert.ok(crlfSource.rowCount > 0);
      const crlfReadback = await readCanonicalSeedTableClosure(pool,
        checked.candidate.derived_outputs.table_closure.map(({ table }) =>
          table));
      assert.equal(assertCanonicalSeedTableClosure(crlfReadback,
        checked.candidate.derived_outputs.table_closure), true);
      const normalized = await pool.query(`UPDATE world_base.graph_nodes
        SET audit_notes=replace(audit_notes, E'\\r\\n', E'\\n')
        WHERE position(E'\\r\\n' in audit_notes) > 0`);
      assert.equal(normalized.rowCount, crlfSource.rowCount);
      const newlineOnly = await readCanonicalSeedTableClosure(pool,
        checked.candidate.derived_outputs.table_closure.map(({ table }) =>
          table));
      assert.equal(assertCanonicalSeedTableClosure(newlineOnly,
        checked.candidate.derived_outputs.table_closure), true);
      const updated = await pool.query(`UPDATE world_base.graph_nodes
        SET audit_notes=audit_notes || ' content mutation'
        WHERE id=(SELECT id FROM world_base.graph_nodes
          WHERE audit_notes IS NOT NULL ORDER BY id LIMIT 1)`);
      assert.equal(updated.rowCount, 1);
      const afterCount = Number((await pool.query(`SELECT count(*) AS count
        FROM world_base.graph_nodes`)).rows[0].count);
      assert.equal(afterCount, beforeCount);
      const tampered = await readCanonicalSeedTableClosure(pool,
        checked.candidate.derived_outputs.table_closure.map(({ table }) =>
          table));
      assert.throws(() => assertCanonicalSeedTableClosure(tampered,
        checked.candidate.derived_outputs.table_closure),
      /GATE1_SEED_TABLE_PAYLOAD_MISMATCH:graph_nodes/u);
    } finally {
      await pool.query('ROLLBACK');
    }
  }, { timeout: 300_000 });
