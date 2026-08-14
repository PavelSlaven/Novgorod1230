import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  SPATIAL_V3_CATALOG_PREREQUISITE_MIGRATIONS,
  runSpatialV3TargetMigrations
} from '../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';
import {
  applyFirstPlayableV2ActivationBundle,
  buildFirstPlayableV2ActivationBundle
} from '../tools/runtime-catalog-activation/src/first-playable-v2-activation.js';
import {
  applyLowerDvinaBoundaryV3ActivationBundle,
  buildLowerDvinaBoundaryV3ActivationBundle
} from '../tools/runtime-catalog-activation/src/lower-dvina-boundary-v3-activation.js';
import {
  PARTY_RUNTIME_CATALOG_MIGRATION,
  runPartyRuntimeCatalogMigration,
  runWorldRuntimeCatalogMigration
} from '../tools/runtime-catalog-activation/src/forward-migrations.js';
import {
  buildLowerDvinaV2ImportSql
} from '../tools/spatial-v3/lower-dvina-v2-importer.mjs';
import {
  buildLowerDvinaBoundaryV1ImportSql
} from '../tools/spatial-v3/lower-dvina-boundary-v1-importer.mjs';

export async function applyFreshLowerDvinaProductionSetup({
  worldPool,
  partyPool,
  worldUrl,
  repositoryRoot = process.cwd(),
  gitCommitSha,
  authorizationRef
}) {
  requirePool(worldPool, 'worldPool');
  requirePool(partyPool, 'partyPool');
  const root = resolve(repositoryRoot);
  await assertFresh(worldPool, 'world');
  await assertFresh(partyPool, 'party');

  const promoted = spawnSync(
    process.execPath,
    ['scripts/run-pr17-item-container-stage3c.mjs', '--mode', 'lifecycle'],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 240_000,
      env: { ...process.env, PR17_TEST_DATABASE_URL: worldUrl }
    }
  );
  if (promoted.status !== 0) {
    fail('PRODUCTION_STAGE3C_IMPORT_FAILED',
      promoted.stderr.trim() || 'Stage 3C import failed');
  }
  const promotionResult = JSON.parse(promoted.stdout);
  if (promotionResult.pass !== true
      || promotionResult.applied !== true
      || promotionResult.activation_performed !== false) {
    fail('PRODUCTION_STAGE3C_EVIDENCE_INVALID',
      'Stage 3C did not produce the exact approved promoted state');
  }
  for (const file of ['18.sql', '19.sql', '20.sql']) {
    await worldPool.query(await readFile(
      resolve(root, 'infra/world-base/schema', file), 'utf8'));
  }
  await worldPool.query(await buildLowerDvinaV2ImportSql({ root }));
  for (const sql of SPATIAL_V3_CATALOG_PREREQUISITE_MIGRATIONS) {
    await partyPool.query(sql);
  }
  const worldMigration = await runWorldRuntimeCatalogMigration(worldPool);
  const partyMigration = await runPartyRuntimeCatalogMigration(partyPool);
  const bundleInput = {
    worldPool,
    partyPool,
    repositoryRoot: root,
    gitCommitSha: required(gitCommitSha, 'git commit SHA'),
    authorizationRef: required(authorizationRef, 'authorization reference')
  };
  const parentBundle = await buildFirstPlayableV2ActivationBundle(bundleInput);
  const parentActivation = await applyFirstPlayableV2ActivationBundle({
    worldPool, partyPool, bundle: parentBundle
  });
  await worldPool.query(await buildLowerDvinaBoundaryV1ImportSql({ root }));
  const bundle = await buildLowerDvinaBoundaryV3ActivationBundle(bundleInput);
  const activation = await applyLowerDvinaBoundaryV3ActivationBundle({
    worldPool, partyPool, bundle
  });
  await runSpatialV3TargetMigrations(partyPool, {
    exactAppliedMigration: {
      migration_id: PARTY_RUNTIME_CATALOG_MIGRATION.migration_id,
      migration_digest: PARTY_RUNTIME_CATALOG_MIGRATION.migration_digest,
      target_schema_fingerprint:
        PARTY_RUNTIME_CATALOG_MIGRATION.target_schema_fingerprint
    }
  });
  const readback = await readActivationReadback({
    worldPool, partyPool, bundle
  });
  return Object.freeze({
    promotion: Object.freeze({
      decision: promotionResult.decision,
      target_revision_id: promotionResult.target_revision_id,
      candidate_digest: promotionResult.candidate_digest
    }),
    migrations: Object.freeze({
      world: worldMigration,
      party: partyMigration
    }),
    bundle_digest: bundle.bundle_digest,
    parent_v2_activation: parentActivation,
    activation,
    readback
  });
}

async function assertFresh(pool, label) {
  const count = Number((await pool.query(
    `SELECT count(*)::int AS count
       FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog','information_schema')`
  )).rows[0]?.count);
  if (count !== 0) {
    fail('PRODUCTION_DATABASE_NOT_FRESH',
      `${label} database is not fresh.`);
  }
}

async function readActivationReadback({ worldPool, partyPool, bundle }) {
  const active = (await worldPool.query(
    `SELECT
       event_id,catalog_scope,catalog_revision_id,catalog_digest,
       runtime_contract_digest,compatible_world_revision_id,
       compatible_world_catalog_digest,
       compatible_world_pin_manifest_digest
     FROM world_base.runtime_catalog_activation_events
     WHERE request_digest=$1`,
    [bundle.activation_request.activation_request_digest]
  )).rows[0];
  const partyCount = Number((await partyPool.query(
    'SELECT count(*)::int AS count FROM party_runtime.parties'
  )).rows[0].count);
  if (!active || partyCount !== 0) {
    fail('PRODUCTION_ACTIVATION_READBACK_FAILED',
      'Exact active event or empty first-launch party state was not observed');
  }
  return Object.freeze({
    active_event: active,
    party_count_before_smoke: partyCount,
    release_status: 'active',
    production_activation: true,
    runtime_selectable_in_canonical_production: true
  });
}

function requirePool(pool, label) {
  if (typeof pool?.query !== 'function') {
    throw new TypeError(`${label} is required`);
  }
}

function required(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) fail('PRODUCTION_INPUT_REQUIRED', `${label} is required`);
  return normalized;
}

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}
