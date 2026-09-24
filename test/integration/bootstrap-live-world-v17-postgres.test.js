import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import pg from 'pg';

import { bootstrapV17Imports } from '../../scripts/bootstrap-live-world-v17.mjs';
import { ensureLocalPostgres, LOCAL_POSTGRES } from '../../tools/local-play/local-postgres.js';

test('v17 bootstrap imports schema, Gate1, P12 and appearance into a fresh isolated pair',
  { timeout: 1_200_000 }, async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'novgorod-v17-bootstrap-test-'));
    const settings = { ...LOCAL_POSTGRES,
      worldDatabase: 'pr17_bootstrap_old_world',
      partyDatabase: 'pr17_bootstrap_old_party' };
    const managed = await ensureLocalPostgres({ dataRoot, settings });
    t.after(async () => {
      await managed.close();
      await rm(dataRoot, { recursive: true, force: true });
    });
    const adminUrl = new URL(managed.worldUrl);
    adminUrl.username = 'postgres';
    adminUrl.pathname = '/postgres';
    const result = await bootstrapV17Imports({ adminUrl: adminUrl.href });
    assert.equal(result.schema.world_tables, 208);
    assert.equal(result.schema.party_migrations, 36);
    assert.equal(result.gate1.status, 'imported_exact_readback_verified');
    assert.equal(result.p12.inserted_rows, 12359);
    assert.equal(result.appearance_v3.inserted_rows, 129);
    assert.equal(result.activation_performed, false);
    const admin = new pg.Pool({ connectionString: adminUrl.href, max: 1 });
    try {
      const rows = (await admin.query(`SELECT datname FROM pg_database
        WHERE datname LIKE 'pr17_bootstrap_old_%' ORDER BY datname`)).rows;
      assert.deepEqual(rows.map(({ datname }) => datname),
        ['pr17_bootstrap_old_party', 'pr17_bootstrap_old_world']);
    } finally { await admin.end(); }
  });
