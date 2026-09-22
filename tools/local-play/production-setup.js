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
  buildSpatialV3ProductionV12ActivationBundle,
  SPATIAL_V3_M3_DEVELOPMENT_V14_RELEASE
} from '../runtime-catalog-activation/src/spatial-v3-production-v12-activation.js';
import {
  applyLowerDvinaBoundaryV3ActivationBundle,
  buildLowerDvinaBoundaryV3ActivationBundle
} from '../runtime-catalog-activation/src/lower-dvina-boundary-v3-activation.js';
import {
  runActorBaseAttributesOwnerMigrations,
  runPartyRuntimeCatalogMigration,
  runWorldRuntimeCatalogMigration
} from '../runtime-catalog-activation/src/forward-migrations.js';
import {
  activateSpatialV3M3DevelopmentV14
} from '../runtime-catalog-activation/src/spatial-v3-m3-development-v14-activation.js';
import { runActorBaseAttributesImport } from
  '../../scripts/run-actor-base-attributes-import.mjs';
import { runActorBaseAttributesRuntimeActivation } from
  '../../scripts/run-actor-base-attributes-runtime-activation.mjs';
import { loadActiveActorBaseAttributesBinding } from
  '../../apps/game-server/src/infrastructure/postgres/actor-base-attributes-profile-loader.js';
import { loadActiveRuntimeCatalogPin } from
  '../../apps/game-server/src/infrastructure/postgres/runtime-catalog-pin-loader.js';
import { buildLowerDvinaBoundaryV1ImportSql } from
  '../spatial-v3/lower-dvina-boundary-v1-importer.mjs';
import { buildLowerDvinaV2ImportSql } from
  '../spatial-v3/lower-dvina-v2-importer.mjs';
import { buildCharacterAppearanceV1ImportSql } from
  '../spatial-v3/character-appearance-v1-importer.mjs';
import { buildS1AuthoringV6ImportSql } from
  '../spatial-v3/s1-authoring-v5-importer.mjs';
import { LOCAL_PLAY_RUNTIME_CAPABILITIES_V1 } from './runtime-capabilities.js';

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
  for (const file of ['18.sql', '19.sql', '20.sql', '21.sql']) {
    await worldPool.query(await readFile(
      resolve(repositoryRoot, 'infra/world-base/schema', file),
      'utf8'
    ));
  }
  await worldPool.query(await buildLowerDvinaV2ImportSql({
    root: repositoryRoot
  }));
  await worldPool.query(await buildLowerDvinaBoundaryV1ImportSql({
    root: repositoryRoot
  }));
  await worldPool.query(await buildCharacterAppearanceV1ImportSql({
    root: repositoryRoot
  }));
  await worldPool.query(await buildS1AuthoringV6ImportSql({
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
    schema: 'rus.local_play_production_setup_result.v1',
    pinManifestDigest:
      v12Bundle.compatibility_manifest.compatible_world_pin_manifest_digest,
    v2Bundle,
    v3Bundle,
    v12Bundle,
    runtimeCapabilities: LOCAL_PLAY_RUNTIME_CAPABILITIES_V1
  });
}

export async function installM3DevelopmentV14NewPartyRuntime({
  worldPool,
  partyPool,
  worldUrl,
  partyUrl,
  repositoryRoot
}) {
  requireSetupInputs({ worldPool, partyPool, worldUrl, partyUrl,
    repositoryRoot });
  await assertNoExistingParties(partyPool);
  const activeRevision = await readActiveItemCatalogRevision(worldPool);
  let base = null;
  let v14;
  if (activeRevision === null) {
    base = await installActivatedRuntimeCatalog({ worldPool, partyPool,
      worldUrl, repositoryRoot });
    v14 = await activateSpatialV3M3DevelopmentV14({ worldPool, partyPool,
      repositoryRoot });
  } else if (activeRevision ===
      SPATIAL_V3_M3_DEVELOPMENT_V14_RELEASE.domainRevision) {
    const pin = await loadActiveRuntimeCatalogPin(worldPool,
      'item_container_materialization_v2');
    if (pin.catalog_revision_id !== activeRevision
        || pin.compatible_world_revision_id !==
          SPATIAL_V3_M3_DEVELOPMENT_V14_RELEASE.worldRevision
        || pin.compatible_world_catalog_digest !==
          SPATIAL_V3_M3_DEVELOPMENT_V14_RELEASE.worldCatalogDigest) {
      throw setupError('M3_V14_ACTIVE_PIN_INVALID',
        'Active M3 v14 item catalog pin is not exact.');
    }
    v14 = Object.freeze({ status: 'already_active_exact_readback', pin });
  } else {
    v14 = await activateSpatialV3M3DevelopmentV14({ worldPool, partyPool,
      repositoryRoot });
  }
  const migrations = await runActorBaseAttributesOwnerMigrations({ worldPool,
    partyPool });
  let actorBinding = await readActorBindingIfActive(worldPool);
  const actorImport = actorBinding == null
    ? await runActorBaseAttributesImport({ databaseUrl: worldUrl })
    : JSON.parse(await readFile(resolve(repositoryRoot,
      'data/world-catalogs/novgorod/procedural-scene-v2/'
      + 'actor-base-attributes-v1/runtime-import-v1/'
      + 'import-readback-result.json'), 'utf8'));
  const actorActivation = await runActorBaseAttributesRuntimeActivation({
    databaseUrl: worldUrl });
  actorBinding = await loadActiveActorBaseAttributesBinding(worldPool);
  await assertNoExistingParties(partyPool);
  return Object.freeze({
    schema: 'rus.m3_development_v14_new_party_setup_result.v1',
    status: 'ready_for_new_development_party',
    activation_scope: 'new_development_parties_only',
    base,
    v14,
    migrations,
    actorImport,
    actorActivation,
    actorBinding,
    runtimeCapabilities: LOCAL_PLAY_RUNTIME_CAPABILITIES_V1,
    existing_party_count: 0,
    production_authorized: false,
    default_runtime_cutover_authorized: false,
    existing_party_migration_authorized: false,
    old_save_rematerialization_authorized: false,
    runtime_item_creation_authorized: false,
    functional_allocation_runtime_selection_authorized: false,
    equipment_allocation_activation_authorized: false
  });
}

async function readActorBindingIfActive(worldPool) {
  try {
    return await loadActiveActorBaseAttributesBinding(worldPool);
  } catch (error) {
    if (error?.code === 'ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_DATA_GAP') {
      return null;
    }
    throw error;
  }
}

function requireSetupInputs({ worldPool, partyPool, worldUrl, partyUrl,
  repositoryRoot }) {
  if (!worldPool?.query || !partyPool?.query || !worldUrl || !partyUrl
      || !repositoryRoot) {
    throw new TypeError('M3 v14 setup requires exact pools, URLs and root.');
  }
}

async function assertNoExistingParties(partyPool) {
  let count;
  try {
    count = Number((await partyPool.query(
      'SELECT count(*) AS count FROM party_runtime.parties')).rows[0].count);
  } catch (error) {
    if (error?.code === '42P01') return;
    throw error;
  }
  if (count !== 0) throw setupError('M3_V14_EXISTING_PARTIES_FORBIDDEN',
    'M3 v14 setup is restricted to a database with zero existing parties.');
}

async function readActiveItemCatalogRevision(worldPool) {
  try {
    return (await worldPool.query(
      `SELECT catalog_revision_id
         FROM world_base.runtime_catalog_activation_events
        WHERE catalog_scope='item_container_materialization_v2'
        ORDER BY event_sequence DESC LIMIT 1`)).rows[0]
      ?.catalog_revision_id ?? null;
  } catch (error) {
    if (error?.code === '42P01') return null;
    throw error;
  }
}

function setupError(code, message) {
  return Object.assign(new Error(message), { code });
}
