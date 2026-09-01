import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { getSpatialV3TargetMigrationsBeforeCatalogMigration } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';
import {
  applyFirstPlayableV2ActivationBundle,
  buildFirstPlayableV2ActivationBundle
} from '../runtime-catalog-activation/src/first-playable-v2-activation.js';
import {
  applySpatialV3ProductionV12ActivationBundle,
  buildSpatialV3ProductionV12ActivationBundle
} from '../runtime-catalog-activation/src/spatial-v3-production-v12-activation.js';
import {
  applyLowerDvinaBoundaryV3ActivationBundle,
  buildLowerDvinaBoundaryV3ActivationBundle
} from '../runtime-catalog-activation/src/lower-dvina-boundary-v3-activation.js';
import {
  runPartyRuntimeCatalogMigration,
  runWorldRuntimeCatalogMigration
} from '../runtime-catalog-activation/src/forward-migrations.js';
import { buildLowerDvinaBoundaryV1ImportSql } from
  '../spatial-v3/lower-dvina-boundary-v1-importer.mjs';
import { buildLowerDvinaV2ImportSql } from
  '../spatial-v3/lower-dvina-v2-importer.mjs';
import { buildCharacterAppearanceV1ImportSql } from
  '../spatial-v3/character-appearance-v1-importer.mjs';
import { buildS1AuthoringV6ImportSql } from
  '../spatial-v3/s1-authoring-v5-importer.mjs';

export async function installActivatedRuntimeCatalog({
  worldPool,
  partyPool,
  worldUrl,
  repositoryRoot,
  authorizationRef = 'Local play current production setup'
}) {
  if (!worldPool?.query || !partyPool?.query) {
    throw new TypeError('worldPool and partyPool must provide query().');
  }
  if (typeof worldUrl !== 'string' || worldUrl.length === 0) {
    throw new TypeError('worldUrl must be a non-empty string.');
  }
  if (typeof repositoryRoot !== 'string' || repositoryRoot.length === 0) {
    throw new TypeError('repositoryRoot must be a non-empty string.');
  }
  if (typeof authorizationRef !== 'string' || authorizationRef.length === 0) {
    throw new TypeError('authorizationRef must be a non-empty string.');
  }
  const lifecycle = spawnSync(
    process.execPath,
    ['scripts/run-pr17-item-container-stage3c.mjs', '--mode', 'local-play'],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      timeout: 180_000,
      env: { ...process.env, PR17_TEST_DATABASE_URL: worldUrl }
    }
  );
  if (lifecycle.status !== 0) {
    throw new Error(`Stage 3c lifecycle failed: ${lifecycle.stderr}`);
  }
  const lifecycleResult = JSON.parse(lifecycle.stdout);
  if (lifecycleResult?.pass !== true) {
    throw new Error('Stage 3c lifecycle did not pass.');
  }
  for (const file of ['18.sql', '19.sql', '20.sql']) {
    await worldPool.query(await readFile(
      resolve(repositoryRoot, 'infra/world-base/schema', file),
      'utf8'
    ));
  }
  await worldPool.query(await buildLowerDvinaV2ImportSql({
    root: repositoryRoot
  }));
  for (const migration of getSpatialV3TargetMigrationsBeforeCatalogMigration()) {
    await partyPool.query(migration);
  }
  await Promise.all([
    runWorldRuntimeCatalogMigration(worldPool),
    runPartyRuntimeCatalogMigration(partyPool)
  ]);
  const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8'
  }).trim();
  const v2Bundle = await buildFirstPlayableV2ActivationBundle({
    worldPool,
    partyPool,
    repositoryRoot,
    gitCommitSha: commitSha,
    authorizationRef
  });
  await applyFirstPlayableV2ActivationBundle({
    worldPool,
    partyPool,
    bundle: v2Bundle
  });
  await worldPool.query(await buildLowerDvinaBoundaryV1ImportSql({
    root: repositoryRoot
  }));
  const v3Bundle = await buildLowerDvinaBoundaryV3ActivationBundle({
    worldPool,
    partyPool,
    repositoryRoot,
    gitCommitSha: commitSha,
    authorizationRef
  });
  await applyLowerDvinaBoundaryV3ActivationBundle({
    worldPool,
    partyPool,
    bundle: v3Bundle
  });
  await worldPool.query(await readFile(
    resolve(repositoryRoot, 'infra/world-base/schema/21.sql'),
    'utf8'
  ));
  await worldPool.query(await buildCharacterAppearanceV1ImportSql({
    root: repositoryRoot
  }));
  await worldPool.query(await buildS1AuthoringV6ImportSql({
    root: repositoryRoot
  }));
  const v12Bundle = await buildSpatialV3ProductionV12ActivationBundle({
    worldPool,
    partyPool,
    repositoryRoot,
    gitCommitSha: commitSha,
    authorizationRef
  });
  await applySpatialV3ProductionV12ActivationBundle({
    worldPool,
    partyPool,
    bundle: v12Bundle
  });
  return Object.freeze({
    pinManifestDigest:
      v12Bundle.compatibility_manifest.compatible_world_pin_manifest_digest,
    v2Bundle,
    v3Bundle,
    v12Bundle
  });
}
