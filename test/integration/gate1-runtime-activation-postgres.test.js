import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import pg from 'pg';

import { createRuntimeCatalogLoader } from '@rus/runtime-catalog';
import { RUNTIME_CATALOG_CONTRACT_DIGEST } from
  '@rus/runtime-catalog/runtime-contract';
import { loadActiveRuntimeCatalogPin } from
  '../../apps/game-server/src/infrastructure/postgres/runtime-catalog-pin-loader.js';
import { activateGate1RuntimeCatalog } from
  '../../tools/runtime-catalog-activation/src/gate1-runtime-activation.js';
import { runPartyRuntimeCatalogMigration,
  runWorldRuntimeCatalogMigration } from
  '../../tools/runtime-catalog-activation/src/forward-migrations.js';
import { ensureLocalPostgres, LOCAL_POSTGRES } from
  '../../tools/local-play/local-postgres.js';

test('Gate1 registers already-imported rows and activates V5 exactly across restart',
  async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'novgorod-gate1-activation-'));
    const settings = { ...LOCAL_POSTGRES,
      worldDatabase: `pr17_gate1_activation_${process.pid}`,
      partyDatabase: `pr17_gate1_activation_party_${process.pid}`,
      worldUser: 'postgres', partyUser: 'postgres' };
    let managed = await ensureLocalPostgres({ dataRoot, settings });
    let pool;
    t.after(async () => {
      await pool?.end();
      await managed.close();
      await rm(dataRoot, { recursive: true, force: true });
    });
    const imported = spawnSync(process.execPath,
      ['scripts/run-pr17-item-container-stage3c.mjs', '--mode',
        'fixture-bootstrap'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, PR17_TEST_DATABASE_URL: managed.worldUrl }
      });
    assert.equal(imported.status, 0, imported.stderr);
    pool = new pg.Pool({ connectionString: managed.worldUrl, max: 4 });
    const partyFiles = (await readdir('schemas/party-db'))
      .filter((file) => /^\d+.*\.sql$/u.test(file)).sort();
    const migrationIndex = partyFiles.findIndex((file) => file.startsWith('012_'));
    for (const file of partyFiles.slice(0, migrationIndex)) {
      await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
    }
    await runPartyRuntimeCatalogMigration(pool);
    for (const file of partyFiles.slice(migrationIndex)) {
      await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
    }
    for (let part = 18; part <= 20; part += 1) {
      await pool.query(await readFile(
        `infra/world-base/schema/${String(part).padStart(2, '0')}.sql`, 'utf8'));
    }
    await runWorldRuntimeCatalogMigration(pool);
    const first = await activateGate1RuntimeCatalog({
      worldPool: pool, partyPool: pool, repositoryRoot: process.cwd(),
      worldReleaseId: 'spatial-v3-production-v5'
    });
    assert.equal(first.status, 'activated');
    const pin = await loadActiveRuntimeCatalogPin(pool,
      'item_container_materialization_v2');
    assert.equal(pin.activation_scope, 'new_development_parties_only');
    const catalog = await createRuntimeCatalogLoader({
      worldBaseReader: { read: (sql, parameters) => pool.query(sql, parameters) },
      supportedRuntimeContractDigests: [RUNTIME_CATALOG_CONTRACT_DIGEST]
    }).loadApprovedItemCatalog({ pin });
    assert.equal(catalog.verified, true);
    assert.equal(catalog.import_audit.imported_by,
      'gate1-approved-import-readback-registration');
    assert.equal(catalog.import_audit.target_catalog_digest,
      '1d5fd4cd3c7dd9946d68276011cd3264e6e2ccd12f67486171928e18b56451f5');
    assert.ok(Object.values(catalog.records_by_table).flat().length > 0);

    const managedPartyPool = new pg.Pool({ connectionString: managed.partyUrl,
      max: 1 });
    for (const file of partyFiles.slice(0, migrationIndex)) {
      await managedPartyPool.query(await readFile(`schemas/party-db/${file}`,
        'utf8'));
    }
    await runPartyRuntimeCatalogMigration(managedPartyPool);
    for (const file of partyFiles.slice(migrationIndex)) {
      await managedPartyPool.query(await readFile(`schemas/party-db/${file}`,
        'utf8'));
    }
    await managedPartyPool.end();

    await pool.end();
    pool = null;
    await managed.close();
    managed = await ensureLocalPostgres({ dataRoot, settings });
    pool = new pg.Pool({ connectionString: managed.worldUrl, max: 4 });
    const repeated = await activateGate1RuntimeCatalog({
      worldPool: pool, partyPool: pool, repositoryRoot: process.cwd(),
      worldReleaseId: 'spatial-v3-production-v5'
    });
    assert.equal(repeated.status, 'already_active');
    const reloaded = await loadActiveRuntimeCatalogPin(pool,
      'item_container_materialization_v2');
    assert.deepEqual(reloaded, pin);
  });
