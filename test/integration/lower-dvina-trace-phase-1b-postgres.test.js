import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { chromium } from 'playwright-core';
import { createGameHttpServer, createStaticAssetResolver, listen } from
  '@rus/game-server';
import { createSeededRandomSource } from '@rus/checks-rng';
import { createTemporalAdvanceOwner } from '@rus/turn/temporal-advance';
import {
  createLowerDvinaTracePublicRuntime
} from '../../apps/game-server/src/runtime/lower-dvina-trace-public-runtime.js';
import { createLowerDvinaTracePhase2Runtime } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-phase-2.js';
import { createLowerDvinaTracePhase2PostgresRepository } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2.js';
import { createLowerDvinaTracePhase2DurableNarrator } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2-presentation.js';
import { createSpatialV3PostgresCombinedAtomicCommitter } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { firstPlayableCommitRecheck } from
  '../../apps/game-server/src/runtime/releases/spatial-v3-production-binding-shared.js';
import { createLowerDvinaTraceS1ProductionResolverFactory } from
  '../../apps/game-server/src/runtime/releases/lower-dvina-trace-s1-production.js';
import { createLowerDvinaTraceN1ProductionResolverFactory } from
  '../../apps/game-server/src/runtime/releases/lower-dvina-trace-n1-production.js';
import { approvedNarration } from
  '../../apps/game-server/test/lower-dvina-trace-phase-2-fixture-support.js';
import {
  createLowerDvinaTracePhase1BProductionAdapter,
  readPartyDatabaseSchemaSnapshot
} from '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-1b.js';
import {
  createFirstPlayablePartyRepository
} from '../../apps/game-server/src/infrastructure/postgres/first-playable/repository.js';
import {
  loadActiveRuntimeCatalogPin
} from '../../apps/game-server/src/infrastructure/postgres/runtime-catalog-pin-loader.js';
import {
  runPartyRuntimeCatalogMigration,
  runWorldRuntimeCatalogMigration
} from '../../tools/runtime-catalog-activation/src/forward-migrations.js';
import {
  applyFirstPlayableV2ActivationBundle,
  buildFirstPlayableV2ActivationBundle
} from '../../tools/runtime-catalog-activation/src/first-playable-v2-activation.js';
import {
  applyLowerDvinaBoundaryV3ActivationBundle,
  buildLowerDvinaBoundaryV3ActivationBundle
} from '../../tools/runtime-catalog-activation/src/lower-dvina-boundary-v3-activation.js';
import {
  applySpatialV3ProductionV12ActivationBundle,
  buildSpatialV3ProductionV12ActivationBundle
} from '../../tools/runtime-catalog-activation/src/spatial-v3-production-v12-activation.js';
import { buildLowerDvinaBoundaryV1ImportSql } from
  '../../tools/spatial-v3/lower-dvina-boundary-v1-importer.mjs';
import { buildLowerDvinaV2ImportSql } from
  '../../tools/spatial-v3/lower-dvina-v2-importer.mjs';
import { buildCharacterAppearanceV1ImportSql } from
  '../../tools/spatial-v3/character-appearance-v1-importer.mjs';
import { buildS1AuthoringV6ImportSql } from
  '../../tools/spatial-v3/s1-authoring-v5-importer.mjs';
import { TRACE_REVISION32_PHASE_1A_MANIFEST_DIGEST } from
  '../../apps/game-server/src/internal/lower-dvina-trace-revision-32-publication.js';
import { loadLiveWorldAuthoredStartCatalog } from
  '../../apps/game-server/src/internal/live-world-authored-starts.js';
import { loadLowerDvinaTraceProductionMaterializationProfiles } from
  '../../apps/game-server/src/internal/lower-dvina-trace-production-materialization-profiles.js';
import { createOrdinaryMaterializationFirstEntryProvisioner } from
  '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-first-entry-provisioning.js';
import { createSpatialSemanticFirstEntryProvisioner } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-semantic-first-entry-provisioning.js';
import { hash as hashForTest } from
  '../../apps/game-server/src/runtime/first-playable/shared.js';
import { ensureLocalPostgres, LOCAL_POSTGRES } from
  '../../tools/local-play/local-postgres.js';

const docker = (args) => spawnSync(
  'docker',
  args,
  { encoding: 'utf8', timeout: 45_000 }
);
const executablePath = [
  process.env.RUS_CHROMIUM_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome'
].find((item) => item && existsSync(item));
test('Phase 1B public HTTP start commits, attaches, acknowledges and restarts', async (t) => {
  const dockerReady = docker(['version']).status === 0;
  const name = `lower-dvina-phase-1b-${process.pid}`;
  let pool;
  let server;
  let managed;
  let managedRoot;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (pool) await pool.end();
    if (managed) await managed.close();
    if (managedRoot) await rm(managedRoot, { recursive: true, force: true });
    if (dockerReady) docker(['rm', '-f', name]);
  });
  let databaseUrl;
  if (dockerReady) {
    const started = docker([
      'run', '-d', '--name', name, '-p', '127.0.0.1::5432',
      '-e', 'POSTGRES_PASSWORD=local_only',
      '-e', 'POSTGRES_USER=phase1b',
      '-e', 'POSTGRES_DB=pr17_phase1b',
      'postgres:16-alpine'
    ]);
    assert.equal(started.status, 0, started.stderr);
    await waitForPostgres(name);
    await new Promise((resolve) => setTimeout(resolve, 700));
    const port = Number(
      docker(['port', name, '5432']).stdout.match(/:(\d+)\s*$/u)?.[1]
    );
    databaseUrl = `postgresql://phase1b:local_only@127.0.0.1:${port}/pr17_phase1b`;
  } else {
    managedRoot = await mkdtemp(join(tmpdir(), 'novgorod-m2a-postgres-'));
    managed = await ensureLocalPostgres({ dataRoot: managedRoot,
      settings: { ...LOCAL_POSTGRES,
        worldDatabase: `pr17_m2a_world_${process.pid}`,
        partyDatabase: `pr17_m2a_party_${process.pid}`,
        worldUser: `m2a_world_${process.pid}`,
        partyUser: `m2a_party_${process.pid}` } });
    databaseUrl = managed.partyUrl;
  }
  pool = new pg.Pool({ connectionString: databaseUrl, max: 8 });
  await pool.query('SELECT 1');
  const partyFiles = (await readdir('schemas/party-db'))
    .filter((value) => /^\d+.*\.sql$/u.test(value)).sort();
  const catalogMigrationIndex = partyFiles.findIndex((file) =>
    file.startsWith('012_')
  );
  assert.equal(catalogMigrationIndex, 11);
  for (const file of partyFiles.slice(0, catalogMigrationIndex)) {
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
  assert.equal(
    (await runPartyRuntimeCatalogMigration(pool)).status,
    'applied'
  );
  const runtimeCatalogPin = await installActivatedRuntimeCatalog({
    pool,
    databaseUrl
  });
  for (const file of partyFiles.slice(catalogMigrationIndex)) {
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
  const schemaSnapshot = await readPartyDatabaseSchemaSnapshot(pool);
  assert.ok(schemaSnapshot.tables.some(
    ({ name }) => name === 'party_containers'
  ));
  assert.ok(schemaSnapshot.tables.some(
    ({ name }) => name === 'g6_acoustic_profiles'
  ));
  assert.ok(schemaSnapshot.foreign_keys.length > 0);
  assert.ok(schemaSnapshot.unique_constraints.length > 0);
  assert.ok(schemaSnapshot.check_constraints.length > 0);
  assert.ok(schemaSnapshot.indexes.length > 0);
  assert.deepEqual(
    schemaSnapshot.check_constraints.find((constraint) =>
      constraint.name === 'parties_schema_version_check')
      ?.allowed_values,
    [2, 3]
  );
  const incompleteMetadataPool = {
    async query(sql, parameters) {
      const result = await pool.query(sql, parameters);
      if (String(sql).includes("con.contype='c'")) {
        return {
          ...result,
          rows: result.rows.filter((row) =>
            row.name !== 'parties_schema_version_check')
        };
      }
      return result;
    }
  };
  await assert.rejects(
    () => readPartyDatabaseSchemaSnapshot(incompleteMetadataPool),
    { code: 'TRACE_PHASE_1B_PARTY_SCHEMA_INCOMPLETE' }
  );

  const release = Object.freeze({
    release_id: 'phase-1b-postgres-release',
    world_revision_id: runtimeCatalogPin.compatible_world_revision_id,
    world_catalog_digest: runtimeCatalogPin.compatible_world_catalog_digest,
    compatible_world_pin_manifest_digest:
      runtimeCatalogPin.compatible_world_pin_manifest_digest
  });
  const authoredStartCatalog = await loadLiveWorldAuthoredStartCatalog({
    phase1AManifestDigest: TRACE_REVISION32_PHASE_1A_MANIFEST_DIGEST,
    scenarioDefinitionRevision: 32
  });
  const materializationProfiles =
    await loadLowerDvinaTraceProductionMaterializationProfiles();
  const ordinaryProvisioner =
    createOrdinaryMaterializationFirstEntryProvisioner({
      profile: materializationProfiles.ordinaryMaterializationProfile,
      includeContextBoundCapabilities: false
    });
  const spatialProvisioner = createSpatialSemanticFirstEntryProvisioner({
    loadedProfile: authoredStartCatalog.ordinary_profiles.s1
  });
  const initialOrdinaryProvisioner = Object.freeze({
    async provision(input) {
      return { ordinary: await ordinaryProvisioner.provision(input),
        spatial: await spatialProvisioner.provision(input) };
    }
  });
  const makeRuntime = (partyRepository = null, {
    publicationLoader,
    adapterTransform,
    catalog = authoredStartCatalog,
    authoredStartResolver = catalog.resolveProfile,
    traceTurnRuntime = null,
    committer = { commit: async () => ({ ok: true }) }
  } = {}) => {
    const adapter = createLowerDvinaTracePhase1BProductionAdapter({
      partyPool: pool,
      worldPool: pool,
      release,
      runtimeCatalogPin,
      initialOrdinaryProvisioner,
      authoredStartResolver
    });
    const runtimeAdapter = adapterTransform
      ? adapterTransform(adapter)
      : adapter;
    return {
      runtime: createLowerDvinaTracePublicRuntime({
        partyPool: pool,
        committer,
        release,
        runtimeCatalogPin,
        activePhase1AManifestDigest:
          TRACE_REVISION32_PHASE_1A_MANIFEST_DIGEST,
        activeScenarioDefinitionRevision: 32,
        traceStartAdapter: runtimeAdapter,
        traceTurnRuntime,
        partyRepository,
        publicationLoader,
        authoredStartCatalog: catalog
      }),
      adapter
    };
  };

  const first = makeRuntime();
  assert.throws(
    () => first.adapter.assertExecutionSupport({
      materializer_version: 'code_materializer_v3',
      rng_algorithm_id: 'future_rng_v2'
    }),
    { code: 'TRACE_PHASE_1B_EXECUTION_VERSION_UNSUPPORTED' }
  );
  const here = dirname(fileURLToPath(import.meta.url));
  server = createGameHttpServer({
    root: Object.freeze({ ...first.runtime,
      getLlmSettings: () => ({ mode: 'local',
        compatibility: 'openai_compatible',
        base_url: 'http://127.0.0.1:8000/v1', model: 'test-not-used',
        api_key_present: false,
        local_runtime: { ready: true, reasons: [] } }),
      getTurnProgress: () => null }),
    staticAssets: createStaticAssetResolver({
      webRoot: resolve(here, '../../apps/game-web'),
      contractsRoot: resolve(here, '../../packages/contracts/src')
    }),
    developerMode: true
  });
  const address = await listen(server, { host: '127.0.0.1', port: 0 });
  const base = `http://127.0.0.1:${address.port}`;

  const catalog = await api(base, '/api/v1/scenarios');
  const scenarioIds = catalog.data.scenarios.map(({ scenario_id: id }) => id);
  assert.deepEqual(
    scenarioIds,
    ['lower_dvina_trace_v1', 'vikhtuy_fishing_camp_v1']
  );
  assert.equal(scenarioIds.includes('lower_dvina_late_summer_open_water_v1'), false);
  assert.equal(scenarioIds.includes('lower_dvina_trace_v1'), true);
  assert.equal(scenarioIds.includes('upper_msta_weavers_yard_v1'), false);
  await assert.rejects(
    () => api(base, '/api/v1/new-games', {
      scenario_id: 'lower_dvina_late_summer_open_water_v1',
      request_id: 'phase-1b-legacy-public'
    }),
    { code: 'SCENARIO_NOT_SUPPORTED' }
  );
  await assert.rejects(
    () => api(base, '/api/v1/new-games', {
      scenario_id: 'upper_msta_weavers_yard_v1',
      request_id: 'm2a-false-geography-alias'
    }),
    { code: 'SCENARIO_NOT_SUPPORTED' }
  );
  assert.equal(await count(pool, 'party_runtime.parties',
    `party:${hashForTest('m2a-false-geography-alias').slice(0, 24)}`), 0);
  const publicRequest = {
    scenario_id: 'lower_dvina_trace_v1',
    request_id: 'phase-1b-postgres-public'
  };
  const start = await api(base, '/api/v1/new-games', publicRequest);
  assert.equal(start.status, 201);
  assert.equal(start.data.screen.schema, 'first_game_screen');
  assert.equal(start.data.screen.panels.character.data.name, 'Микула');
  assert.deepEqual(start.data.screen.action_panel.suggested_actions, []);
  assertPublic(start);

  const partyId = start.data.party_id;
  const authoredRequest = {
    scenario_id: 'vikhtuy_fishing_camp_v1',
    request_id: 'm3-authored-public-v5'
  };
  const authoredStart = await api(base, '/api/v1/new-games', authoredRequest);
  assert.equal(authoredStart.status, 201);
  assert.equal(authoredStart.data.screen.scenario_id,
    'vikhtuy_fishing_camp_v1');
  assert.match(authoredStart.data.screen.main_prose, /Вихтуя/u);
  assert.doesNotMatch(authoredStart.data.screen.main_prose, /Мст/u);
  assert.equal(authoredStart.data.screen.panels.character.data.name, 'Любава');
  const authoredPartyId = authoredStart.data.party_id;
  const authoredInternal = await first.adapter.loadInternal(authoredPartyId);
  assert.equal(authoredInternal.npcs.length, 3);
  assert.equal(authoredInternal.items.length, 2);
  assert.equal(authoredInternal.position.g4_id,
    'g4v3__gn_nov_g3_xp017_yp026_r2_vikhtuy_river_approach');
  const demoInternal = await first.adapter.loadInternal(partyId);
  assert.notEqual(authoredInternal.position.g4_id, demoInternal.position.g4_id);
  const nodes = await pool.query(
    `SELECT party_id,state_payload#>'{immediate,spatial,node}' AS node
       FROM party_runtime.party_state_snapshots
      WHERE party_id=ANY($1::text[])`, [[partyId, authoredPartyId]]
  );
  const nodesByParty = new Map(nodes.rows.map((row) => [row.party_id, row.node]));
  assert.equal(nodesByParty.get(partyId).template_id,
    'trace_ld_v1_tpl_wreck_shore');
  assert.equal(nodesByParty.get(authoredPartyId).template_id,
    'trace_ld_v1_tpl_fishing_camp');
  assert.equal(nodesByParty.get(authoredPartyId).state.canonical_g5_ref.id,
    'trace_ld_v1_g5_fishing_camp');
  assert.deepEqual(authoredInternal.items.map(({ quantity }) => Number(quantity))
    .sort((a, b) => a - b), [1, 1]);
  const authoredMechanics = Object.fromEntries(authoredInternal.items.map(
    (item) => [item.template_id, item.state.inventory_profile_snapshot]));
  assert.deepEqual([
    authoredMechanics.item_tpl_nov_linen_shirt_v1.packing_slot_cost,
    authoredMechanics.item_tpl_nov_linen_shirt_v1.packing_bundle_size,
    authoredMechanics.item_tpl_nov_rope_v1.packing_slot_cost,
    authoredMechanics.item_tpl_nov_rope_v1.packing_bundle_size
  ], [3, 1, 6, 1]);
  assert.notEqual(authoredPartyId, partyId);
  assert.deepEqual(
    (await api(base, '/api/v1/new-games', authoredRequest)).data,
    authoredStart.data
  );
  assert.equal(await count(pool, 'party_runtime.parties', authoredPartyId), 1);
  assert.equal(await count(pool, 'party_runtime.party_materialization_runs', authoredPartyId), 1);
  assert.equal(await count(pool, 'party_runtime.party_server_sessions', authoredPartyId), 1);
  const authoredIdentity = (await pool.query(
    `SELECT stage26_result FROM party_runtime.party_server_sessions
      WHERE party_id=$1`, [authoredPartyId])).rows[0].stage26_result;
  assert.deepEqual(authoredIdentity.runtime_binding,
    authoredStartCatalog.runtime_binding);
  assert.equal(authoredIdentity.runtime_binding.revision, 5);
  assert.equal(authoredIdentity.materializer_binding_id,
    'live_world_authored_start_v3');
  assert.equal(authoredIdentity.materializer_version, 'code_materializer_v3');
  const authoredSnapshot = (await pool.query(
    `SELECT (state_payload->>'version')::int AS snapshot_version,
            state_payload->>'schema' AS snapshot_schema,
            (state_payload->>'materialization_result_version')::int
              AS result_version,
            state_payload->>'materialization_result_schema' AS result_schema
       FROM party_runtime.party_state_snapshots
      WHERE party_id=$1 AND state_version=0`, [authoredPartyId])).rows[0];
  assert.deepEqual(authoredSnapshot, {
    snapshot_version: 3,
    snapshot_schema: 'rus.authored_start_initial_party_snapshot.v3',
    result_version: 3,
    result_schema: 'rus.authored_start_party_materialization_result.v3'
  });
  assert.equal(await count(pool, 'party_runtime.parties', partyId), 1);
  const invalidCases = [
    ['g4', (profile) => { profile.geometry.start.g4_id = 'missing-g4'; }],
    ['node-template', (profile) => {
      profile.geometry.start.node_template_id = 'missing-template';
    }],
    ['location-profile', (profile) => {
      profile.geometry.start.location_profile_id = 'missing-profile';
    }],
    ['item-profile', (profile) => {
      profile.resources[0].inventory_profile_id = 'missing-profile';
    }],
    ['item-category', (profile) => {
      profile.resources[0].category_id = 'missing-category';
    }],
    ['environment', (profile) => {
      profile.environment.profile_id = 'missing-environment';
    }],
    ['player-known', (profile) => {
      profile.player.known_fact_refs = ['missing-fact'];
    }],
    ['player-role', (profile) => {
      profile.player.role_id = 'missing-role';
    }],
    ['player-occupation', (profile) => {
      profile.player.occupation_id = 'missing-occupation';
    }],
    ['npc-role', (profile) => {
      profile.people[0].role_id = 'missing-role';
    }],
    ['npc-occupation', (profile) => {
      profile.people[0].occupation_id = 'missing-occupation';
    }],
    ['player-incompatible-role-occupation', (profile) => {
      profile.player.occupation_id = 'nov_occ_boatman';
    }],
    ['npc-incompatible-role-occupation', (profile) => {
      profile.people[0].role_id = 'nov_role_fisher';
    }]
  ];
  for (const [name, mutate] of invalidCases) {
    const invalidProfile = structuredClone(
      authoredStartCatalog.resolveProfile('vikhtuy_fishing_camp_v1')
    );
    mutate(invalidProfile);
    const invalidRuntime = makeRuntime(null, {
      authoredStartResolver: (scenarioId) =>
        scenarioId === invalidProfile.scenario_id ? invalidProfile : null
    }).runtime;
    const requestId = `m2a-invalid-${name}`;
    await assert.rejects(() => invalidRuntime.startNewGame({
      scenario_id: invalidProfile.scenario_id,
      request_id: requestId
    }), { code: 'AUTHORED_START_PROFILE_INVALID' });
    const invalidPartyId =
      `party:${hashForTest(requestId).slice(0, 24)}`;
    assert.equal(await count(pool, 'party_runtime.parties', invalidPartyId), 0);
  }

  const unavailableDemoCatalog = await loadLiveWorldAuthoredStartCatalog({
    phase1AManifestDigest: TRACE_REVISION32_PHASE_1A_MANIFEST_DIGEST,
    scenarioDefinitionRevision: 32,
    externalPublicationLoader: async () => {
      throw Object.assign(new Error('demo unavailable'), {
        code: 'DEMO_PUBLICATION_UNAVAILABLE'
      });
    }
  });
  const neutralRuntime = makeRuntime(null, {
    catalog: unavailableDemoCatalog
  }).runtime;
  assert.equal((await neutralRuntime.listScenarios()).scenarios.some(
    ({ scenario_id: id }) => id === 'vikhtuy_fishing_camp_v1'), true);
  const neutralStart = await neutralRuntime.startNewGame({
    scenario_id: 'vikhtuy_fishing_camp_v1',
    request_id: 'm2a-neutral-with-demo-unavailable'
  });
  assert.equal(neutralStart.screen.scenario_id,
    'vikhtuy_fishing_camp_v1');
  const neutralOrdinary = await pool.query(
    `SELECT enablement.scope_id,position.g6_instance_id
       FROM party_runtime.party_ordinary_materialization_enablements enablement
       JOIN party_runtime.party_player_characters player
         ON player.party_id=enablement.party_id
       JOIN party_runtime.party_journey_locations journey
         ON journey.party_id=player.party_id AND journey.owner_kind='actor'
        AND journey.owner_id=player.character_id AND journey.location_kind='scene'
       JOIN party_runtime.scene_position_nodes position
         ON position.party_id=journey.party_id
        AND position.id=journey.scene_position_id
      WHERE enablement.party_id=$1`, [neutralStart.party_id]);
  assert.equal(neutralOrdinary.rowCount, 1);
  assert.equal(neutralOrdinary.rows[0].scope_id,
    neutralOrdinary.rows[0].g6_instance_id);
  await assert.rejects(() => neutralRuntime.startNewGame({
    scenario_id: 'lower_dvina_trace_v1',
    request_id: 'm2a-demo-unavailable'
  }), { code: 'DEMO_PUBLICATION_UNAVAILABLE' });

  assert.ok(executablePath, 'Chromium executable is required for M2a E2E.');
  const browser = await chromium.launch({ executablePath, headless: true,
    args: ['--no-sandbox', '--no-proxy-server', '--proxy-bypass-list=*'] });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(base);
  await page.waitForSelector('[data-start-new-game]');
  await page.click('[data-start-new-game]');
  await page.waitForSelector('[data-new-game-screen]');
  await page.click('[data-scenario-id="vikhtuy_fishing_camp_v1"]');
  await page.waitForSelector('[data-turn-form] textarea:not([disabled])');
  assert.match(await page.textContent('body'), /Любава|Вихтуй/u);
  const browserPartyId = await page.evaluate(() =>
    localStorage.getItem('rus.party_id'));
  assert.equal(await count(pool, 'party_runtime.parties', browserPartyId), 1);
  await page.click('[data-return-start]');
  await page.reload();
  await page.waitForSelector('[data-continue-party]');
  await page.click('[data-continue-party]');
  await page.waitForSelector('[data-screen-schema="first_game_screen"]');
  assert.equal(await page.evaluate(() => localStorage.getItem('rus.party_id')),
    browserPartyId);
  assert.match(await page.textContent('body'), /Любава|Вихтуй/u);
  await browser.close();
  const turnCommitter = createSpatialV3PostgresCombinedAtomicCommitter({
    pool, recheck: firstPlayableCommitRecheck,
    now: () => new Date('2026-09-19T08:00:00.000Z')
  });
  const phase2Repository = createLowerDvinaTracePhase2PostgresRepository({
    partyPool: pool, committer: turnCommitter,
    authoredRuntimeBindingResolver:
      authoredStartCatalog.resolveRuntimeBinding
  });
  const traceTurnRuntime = createLowerDvinaTracePhase2Runtime({
    repository: phase2Repository,
    semanticResolver: async () => ({ status: 'unknown',
      reason_code: 'free_intent' }),
    turnStepModel: m2bTurnPlan,
    playerConversationModel: async () => { throw new Error('unexpected'); },
    npcSemanticModel: async () => { throw new Error('unexpected'); },
    narrator: createLowerDvinaTracePhase2DurableNarrator({
      partyPool: pool,
      narrationService: { run: async (request) =>
        approvedNarration(request.request_id) }
    }),
    randomSourceFactory: () => createSeededRandomSource(
      'm2b-live-world-postgres'),
    temporalAdvanceOwner: createTemporalAdvanceOwner({}),
    decisionSecret: 'm2b-live-world-secret',
    authoredTurnProfile: authoredStartCatalog.turn_profile,
    now: () => '2026-09-19T08:00:00.000Z'
  });
  const neutralTraceTurnRuntime = createLowerDvinaTracePhase2Runtime({
    repository: phase2Repository,
    semanticResolver: async () => ({ status: 'unknown',
      reason_code: 'free_intent' }),
    turnStepModel: m3NeutralTurnPlan,
    playerConversationModel: async () => { throw new Error('unexpected'); },
    npcSemanticModel: async () => { throw new Error('unexpected'); },
    narrator: createLowerDvinaTracePhase2DurableNarrator({
      partyPool: pool,
      narrationService: { run: async (request) =>
        approvedNarration(request.request_id) }
    }),
    randomSourceFactory: () => createSeededRandomSource('m3-neutral-postgres'),
    temporalAdvanceOwner: createTemporalAdvanceOwner({}),
    decisionSecret: 'm3-neutral-secret',
    authoredTurnProfile: authoredStartCatalog.turn_profile,
    createTurnStepAuthoredSpatialSemanticResolver:
      createLowerDvinaTraceS1ProductionResolverFactory({ pool,
        resolveSpatialSemanticDescriptor: async ({ request }) => ({
          schema: 'rus.s1_spatial_semantic_proposal.v1',
          request_id: request.request_id, name: 'Плетёный навес',
          description: 'Низкий навес из прутьев защищает рабочий настил.',
          semantic_requirements: ['interior_space']
        }) }),
    authoredSpatialSemanticProfile: authoredStartCatalog.ordinary_profiles.s1,
    createTurnStepAuthoredBackgroundNpcResolver:
      createLowerDvinaTraceN1ProductionResolverFactory({
        loadedProfile: authoredStartCatalog.ordinary_profiles.n1,
        roleRunner: {},
        resolveNpcOrdinarySemanticRemainder: async ({ request }) => ({
          schema: 'npc_ordinary_semantic_remainder_proposal_v1',
          request_id: request.request_id,
          ordinary_descriptor: 'Коренастый мужчина в мокрой рубахе.',
          ordinary_activity: null
        })
      }),
    authoredNpcSemanticRemainderProfile:
      authoredStartCatalog.ordinary_profiles.n1,
    now: () => '2026-09-19T08:00:00.000Z'
  });
  const neutralPlayable = makeRuntime(null, {
    traceTurnRuntime: neutralTraceTurnRuntime,
    committer: turnCommitter
  }).runtime;
  await neutralPlayable.acknowledgeOpening(authoredPartyId, {
    client_ack_id: 'm3-neutral-opening'
  });
  for (const [index, rawText] of [
    'Осматриваю незнакомого рыбака.',
    'Осматриваю местную рабочую постройку.',
    'Захожу внутрь местной постройки.',
    'Возвращаюсь обратно на стоянку.'
  ].entries()) {
    const key = `m3-neutral-turn-${index + 1}`;
    const submitted = await neutralPlayable.submitTurn(authoredPartyId, {
      request_id: key, idempotency_key: key, raw_text: rawText
    });
    assert.equal(submitted.turn_number, index + 1);
  }
  const neutralRows = (await pool.query(`SELECT
      (SELECT count(*)::int FROM party_runtime.party_spatial_semantic_resolutions
        WHERE party_id=$1) AS spatial_resolutions,
      (SELECT count(*)::int FROM party_runtime.party_npcs
        WHERE party_id=$1 AND semantic_state ? 'n1_remainder') AS npc_remainders,
      (SELECT count(*)::int FROM party_runtime.scene_movement_edges
        WHERE party_id=$1) AS movement_edges,
      (SELECT count(*)::int FROM party_runtime.visibility_links
        WHERE party_id=$1) AS visibility_links`, [authoredPartyId])).rows[0];
  assert.deepEqual(neutralRows, { spatial_resolutions: 1, npc_remainders: 1,
    movement_edges: 2, visibility_links: 2 });
  const neutralState = await phase2Repository.loadPhase2State(authoredPartyId);
  assert.equal(neutralState.position.position_id,
    `position:${authoredInternal.position.g5_anchor_id}`);
  const neutralFinalScreen = await makeRuntime(null, {
    traceTurnRuntime: neutralTraceTurnRuntime,
    committer: turnCommitter
  }).runtime.getPartyScreen(authoredPartyId);
  assert.equal(neutralFinalScreen.turn_number, 4);
  const playable = makeRuntime(null, { traceTurnRuntime,
    committer: turnCommitter }).runtime;
  const turnServer = createGameHttpServer({
    root: Object.freeze({ ...playable,
      getLlmSettings: () => ({ mode: 'custom',
        compatibility: 'openai_compatible', base_url: 'http://127.0.0.1/v1',
        model: 'test-not-used', api_key_present: false,
        local_runtime: { ready: true, reasons: [] } }),
      getTurnProgress: () => null }),
    staticAssets: createStaticAssetResolver({
      webRoot: resolve(here, '../../apps/game-web'),
      contractsRoot: resolve(here, '../../packages/contracts/src')
    }), developerMode: true
  });
  t.after(() => turnServer.close());
  const turnAddress = await listen(turnServer, { host: '127.0.0.1', port: 0 });
  const turnBase = `http://127.0.0.1:${turnAddress.port}`;
  const m2aFixtureRaw = await readFile(resolve(here,
    '../fixtures/m2a-5f7e83cd-party-rows.json'));
  assert.equal(createHash('sha256').update(m2aFixtureRaw).digest('hex'),
    'f8fa571d16402fe0cca3fdff6c684f315a838e513286e1ff2c77f7517bf96083');
  const m2aFixture = JSON.parse(m2aFixtureRaw);
  assert.equal(m2aFixture.source_head,
    '5f7e83cd5f76b071382754ea1af20ec2bf295c81');
  await importM2aPartyRows(pool, m2aFixture);
  const m2aRuntime = makeRuntime(null, { traceTurnRuntime,
    committer: turnCommitter }).runtime;
  const m2aStart = { party_id: m2aFixture.party_id };
  const m2aBefore = await first.adapter.loadInternal(m2aStart.party_id);
  assert.equal(m2aBefore.player.dossier.attributes, undefined);
  assert.equal(m2aBefore.items.every((item) =>
    item.state.inventory_profile_snapshot == null), true);
  const m2aRunBefore = (await pool.query(
    `SELECT result_digest FROM party_runtime.party_materialization_runs
      WHERE party_id=$1`, [m2aStart.party_id])).rows[0].result_digest;
  await m2aRuntime.acknowledgeOpening(m2aStart.party_id, {
    client_ack_id: 'm2a-compat-opening'
  });
  const compatibleInitial = await phase2Repository.loadPhase2State(
    m2aStart.party_id);
  assert.equal(compatibleInitial.player_profile.attributes.strength.value, 10);
  const m2aFirstTurn = await m2aRuntime.submitTurn(m2aStart.party_id, {
    request_id: 'm2a-compat-turn-1', idempotency_key: 'm2a-compat-turn-1',
    raw_text: 'Осматриваюсь.'
  });
  assert.equal(m2aFirstTurn.turn_number, 1);
  const m2aRestarted = makeRuntime(null, { traceTurnRuntime,
    committer: turnCommitter }).runtime;
  assert.equal((await m2aRestarted.getPartyScreen(m2aStart.party_id))
    .turn_number, 1);
  const m2aSecondTurn = await m2aRestarted.submitTurn(m2aStart.party_id, {
    request_id: 'm2a-compat-turn-2', idempotency_key: 'm2a-compat-turn-2',
    raw_text: 'Оглядываюсь вокруг.'
  });
  assert.equal(m2aSecondTurn.turn_number, 2);
  const m2aReloadedState = await phase2Repository.loadPhase2State(
    m2aStart.party_id);
  const m2aReloadedMechanics = Object.fromEntries(
    m2aReloadedState.items.map((item) => [item.template_id,
      item.state.inventory_profile_snapshot]));
  assert.deepEqual([
    m2aReloadedMechanics.item_tpl_nov_linen_shirt_v1.packing_slot_cost,
    m2aReloadedMechanics.item_tpl_nov_linen_shirt_v1.packing_bundle_size,
    m2aReloadedMechanics.item_tpl_nov_rope_v1.packing_slot_cost,
    m2aReloadedMechanics.item_tpl_nov_rope_v1.packing_bundle_size
  ], [3, 1, 6, 1]);
  assert.equal(await count(pool, 'party_runtime.party_materialization_runs',
    m2aStart.party_id), 1);
  assert.equal((await pool.query(
    `SELECT result_digest FROM party_runtime.party_materialization_runs
      WHERE party_id=$1`, [m2aStart.party_id])).rows[0].result_digest,
  m2aRunBefore);

  const m2bFixtureRaw = await readFile(resolve(here,
    '../fixtures/m2b-328d2f99-party-rows.json'));
  assert.equal(createHash('sha256').update(m2bFixtureRaw).digest('hex'),
    '65d8178758bb1a9dc7886c316a70ab45b58d1abd4b72232cca4976c8cd430ac7');
  const m2bFixture = JSON.parse(m2bFixtureRaw);
  assert.equal(m2bFixture.source_head,
    '328d2f99ae888670087324e9b2f1197081f73733');
  await importM2aPartyRows(pool, m2bFixture);
  const m2bRuntime = makeRuntime(null, { traceTurnRuntime,
    committer: turnCommitter }).runtime;
  const m2bPartyId = m2bFixture.party_id;
  const m2bOpening = await m2bRuntime.getPartyScreen(m2bPartyId);
  assert.equal(m2bOpening.screen.scenario_id, 'vikhtuy_fishing_camp_v1');
  assert.equal(await count(pool,
    'party_runtime.party_ordinary_materialization_enablements', m2bPartyId), 0);
  const m2bRunBefore = (await pool.query(
    `SELECT result_digest FROM party_runtime.party_materialization_runs
      WHERE party_id=$1`, [m2bPartyId])).rows[0].result_digest;
  const m2bRequestId = m2bFixture.tables.party_server_sessions[0].request_id;
  await pool.query(`DELETE FROM party_runtime.party_server_sessions
    WHERE party_id=$1`, [m2bPartyId]);
  const m2bRecoveredStart = await m2bRuntime.startNewGame({
    scenario_id: 'vikhtuy_fishing_camp_v1', request_id: m2bRequestId
  });
  assert.deepEqual(m2bRecoveredStart.screen, m2bOpening.screen);
  assert.deepEqual(await m2bRuntime.startNewGame({
    scenario_id: 'vikhtuy_fishing_camp_v1', request_id: m2bRequestId
  }), m2bRecoveredStart);
  assert.equal(await count(pool,
    'party_runtime.party_ordinary_materialization_enablements', m2bPartyId), 0);
  await m2bRuntime.acknowledgeOpening(m2bPartyId, {
    client_ack_id: 'm2b-v4-compat-opening'
  });
  const m2bFirstTurn = await m2bRuntime.submitTurn(m2bPartyId, {
    request_id: 'm2b-v4-compat-turn-1',
    idempotency_key: 'm2b-v4-compat-turn-1', raw_text: 'Осматриваюсь.'
  });
  assert.equal(m2bFirstTurn.turn_number, 1);
  const m2bRestarted = makeRuntime(null, { traceTurnRuntime,
    committer: turnCommitter }).runtime;
  assert.equal((await m2bRestarted.getPartyScreen(m2bPartyId)).turn_number, 1);
  assert.deepEqual(await m2bRestarted.submitTurn(m2bPartyId, {
    request_id: 'm2b-v4-compat-turn-1',
    idempotency_key: 'm2b-v4-compat-turn-1', raw_text: 'Осматриваюсь.'
  }), m2bFirstTurn);
  assert.equal((await m2bRestarted.submitTurn(m2bPartyId, {
    request_id: 'm2b-v4-compat-turn-2',
    idempotency_key: 'm2b-v4-compat-turn-2', raw_text: 'Оглядываюсь вокруг.'
  })).turn_number, 2);
  assert.equal(await count(pool,
    'party_runtime.party_materialization_runs', m2bPartyId), 1);
  assert.equal((await pool.query(
    `SELECT result_digest FROM party_runtime.party_materialization_runs
      WHERE party_id=$1`, [m2bPartyId])).rows[0].result_digest,
  m2bRunBefore);
  const missingM2bBinding = makeRuntime(null, {
    catalog: Object.freeze({ ...authoredStartCatalog,
      resolveRuntimeBinding: () => null })
  });
  await assert.rejects(
    () => missingM2bBinding.runtime.getPartyScreen(m2bPartyId),
    { code: 'AUTHORED_START_RUNTIME_BINDING_MISSING' }
  );

  const playableStart = (await api(turnBase, '/api/v1/new-games', {
    scenario_id: 'vikhtuy_fishing_camp_v1',
    request_id: 'm2b-authored-turn-party'
  })).data;
  const playablePartyId = playableStart.party_id;
  await playable.acknowledgeOpening(playablePartyId, {
    client_ack_id: 'm2b-authored-opening'
  });
  for (let index = 0; index < 10; index += 1) {
    const key = `m2b-authored-turn-${index}`;
    const turnResult = (await api(turnBase,
      `/api/v1/parties/${encodeURIComponent(playablePartyId)}/turns`, {
      request_id: key, idempotency_key: key,
      raw_text: M2B_TURNS[index]
    })).data;
    assert.equal(turnResult.turn_number, index + 1);
    assert.equal(turnResult.screen.scenario_id, 'vikhtuy_fishing_camp_v1');
    assert.equal(turnResult.screen.schema, 'turn_screen');
    if (index === 0) {
      assert.deepEqual((await api(turnBase,
        `/api/v1/parties/${encodeURIComponent(playablePartyId)}/turns`, {
        request_id: key, idempotency_key: key, raw_text: M2B_TURNS[index]
      })).data, turnResult);
      await assert.rejects(() => api(turnBase,
        `/api/v1/parties/${encodeURIComponent(playablePartyId)}/turns`, {
        request_id: key, idempotency_key: key, raw_text: 'Другой payload.'
      }), { code: 'TRACE_PHASE_2_IDEMPOTENCY_CONFLICT' });
    }
  }
  assert.equal((await playable.getPartyScreen(playablePartyId)).turn_number, 10);
  const demoPlayableStart = await playable.startNewGame({
    scenario_id: 'lower_dvina_trace_v1',
    request_id: 'm2b-demo-turn-party'
  });
  await playable.acknowledgeOpening(demoPlayableStart.party_id, {
    client_ack_id: 'm2b-demo-opening'
  });
  for (let index = 0; index < 10; index += 1) {
    const key = `m2b-demo-turn-${index}`;
    const turnResult = (await api(turnBase,
      `/api/v1/parties/${encodeURIComponent(demoPlayableStart.party_id)}/turns`, {
      request_id: key, idempotency_key: key,
      raw_text: M2B_TURNS[index]
    })).data;
    assert.equal(turnResult.turn_number, index + 1);
    assert.equal(turnResult.screen.scenario_id, 'lower_dvina_trace_v1');
  }
  assert.equal((await playable.getPartyScreen(demoPlayableStart.party_id))
    .turn_number, 10);
  const continuedBrowser = await chromium.launch({ executablePath,
    headless: true,
    args: ['--no-sandbox', '--no-proxy-server', '--proxy-bypass-list=*'] });
  t.after(() => continuedBrowser.close());
  const continuedPage = await continuedBrowser.newPage();
  await continuedPage.goto(turnBase);
  await continuedPage.evaluate((partyId) =>
    localStorage.setItem('rus.party_id', partyId), playablePartyId);
  await continuedPage.reload();
  await continuedPage.waitForSelector('[data-continue-party]');
  await continuedPage.click('[data-continue-party]');
  await continuedPage.waitForSelector('[data-screen-schema="turn_screen"]');
  assert.match(await continuedPage.textContent('body'), /Вихту/iu);
  assert.equal(await continuedPage.evaluate(() => localStorage.getItem(
    'rus.party_id')), playablePartyId);
  await continuedBrowser.close();
  const beforeRestart = await first.adapter.loadInternal(partyId);
  assert.equal(
    (await count(pool, 'party_runtime.parties', partyId)),
    1
  );
  assert.equal(
    (await count(pool, 'party_runtime.party_materialization_runs', partyId)),
    1
  );
  assert.equal(
    (await count(pool, 'party_runtime.party_server_sessions', partyId)),
    1
  );
  const ack = await api(
    base,
    `/api/v1/parties/${encodeURIComponent(partyId)}/opening-ack`,
    { client_ack_id: 'phase-1b-ack' }
  );
  assert.equal(ack.data.delivery_status, 'acknowledged');
  const persistedFirstAck = (await pool.query(
    `SELECT delivery_ack_result,updated_at
       FROM party_runtime.party_server_sessions
      WHERE party_id=$1`,
    [partyId]
  )).rows[0];
  const publicScreen = await api(
    base,
    `/api/v1/parties/${encodeURIComponent(partyId)}/screen`
  );
  assert.deepEqual(publicScreen.data.screen, start.data.screen);

  await new Promise((resolve) => server.close(resolve));
  server = null;
  const restarted = makeRuntime();
  const screen = await restarted.runtime.getPartyScreen(partyId);
  assert.deepEqual(screen.screen, start.data.screen);
  assert.deepEqual(
    (await restarted.runtime.getPartyScreen(authoredPartyId)).screen,
    neutralFinalScreen.screen
  );
  const afterRestart = await restarted.adapter.loadInternal(partyId);
  assert.deepEqual(afterRestart.request_identity, beforeRestart.request_identity);
  assert.deepEqual(afterRestart.sealed_selections, beforeRestart.sealed_selections);
  assert.deepEqual(afterRestart.timestamp, beforeRestart.timestamp);
  assert.deepEqual(
    afterRestart.environment_snapshot,
    beforeRestart.environment_snapshot
  );
  const repeatedAck =
    await restarted.runtime.acknowledgeOpening(partyId, {
      client_ack_id: 'phase-1b-ack'
    });
  assert.equal(repeatedAck.delivery_status, 'acknowledged');
  assert.equal(
    repeatedAck.acknowledged_at,
    ack.data.acknowledged_at
  );
  const persistedRepeatedAck = (await pool.query(
    `SELECT delivery_ack_result,updated_at
       FROM party_runtime.party_server_sessions
      WHERE party_id=$1`,
    [partyId]
  )).rows[0];
  assert.deepEqual(
    persistedRepeatedAck.delivery_ack_result,
    persistedFirstAck.delivery_ack_result
  );
  assert.equal(
    persistedRepeatedAck.updated_at.toISOString(),
    persistedFirstAck.updated_at.toISOString()
  );
  await assert.rejects(
    () => restarted.runtime.acknowledgeOpening(partyId, {
      client_ack_id: 'phase-1b-ack-conflict'
    }),
    { code: 'OPENING_ACK_IDENTITY_CONFLICT' }
  );
  const historicalReplay = makeRuntime(null, {
    publicationLoader: async () => {
      throw Object.assign(
        new Error('current publication changed'),
        { code: 'CURRENT_PUBLICATION_REVISION_CHANGED' }
      );
    },
    adapterTransform: (adapter) => Object.freeze({
      ...adapter,
      async materialize() {
        throw Object.assign(
          new Error('historical party must not rematerialize'),
          { code: 'HISTORICAL_PARTY_MUST_NOT_REMATERIALIZE' }
        );
      }
    })
  });
  const replayedStart =
    await historicalReplay.runtime.startNewGame(publicRequest);
  assert.deepEqual(replayedStart.screen, start.data.screen);
  assert.equal(
    await count(pool, 'party_runtime.party_materialization_runs', partyId),
    1
  );
  assert.equal(
    await count(pool, 'party_runtime.party_server_sessions', partyId),
    1
  );
  assert.equal(
    (await pool.query(
      `SELECT updated_at
         FROM party_runtime.party_server_sessions
        WHERE party_id=$1`,
      [partyId]
    )).rows[0].updated_at.toISOString(),
    persistedRepeatedAck.updated_at.toISOString()
  );
  await assert.rejects(
    () => restarted.runtime.submitTurn(partyId, {
      raw_text: 'Осматриваюсь'
    }),
    { code: 'TRACE_PHASE_2_DEPENDENCY_MISSING' }
  );
  assert.equal(
    (await pool.query(
      `SELECT turn_number,delivery_ack_result->>'client_ack_id' AS ack
         FROM party_runtime.party_server_sessions
        WHERE party_id=$1`,
      [partyId]
    )).rows[0].turn_number,
    0
  );

  const actualRepository =
    createFirstPlayablePartyRepository({ partyPool: pool });
  const existingSession = await actualRepository.loadSession(partyId);
  await assert.rejects(
    () => actualRepository.attachCommittedOpeningSession({
      partyId,
      requestId: 'incompatible-request',
      sessionIdentity: existingSession.stage26_result,
      deliveryAttempt: existingSession.delivery_attempt,
      screen: existingSession.screen
    }),
    { code: 'TRACE_PHASE_1B_SESSION_IDENTITY_CONFLICT' }
  );
  let attachFailures = 1;
  const recoveryRepository = Object.freeze({
    ...actualRepository,
    async attachCommittedOpeningSession(input) {
      if (attachFailures > 0) {
        attachFailures -= 1;
        throw Object.assign(new Error('simulated session outage'), {
          code: 'SIMULATED_SESSION_FAILURE'
        });
      }
      return actualRepository.attachCommittedOpeningSession(input);
    }
  });
  const recovery = makeRuntime(recoveryRepository);
  const recoveryRequest = {
    scenario_id: 'lower_dvina_trace_v1',
    request_id: 'phase-1b-session-recovery'
  };
  await assert.rejects(
    () => recovery.runtime.startNewGame(recoveryRequest),
    { code: 'SIMULATED_SESSION_FAILURE' }
  );
  const recovered = await recovery.runtime.startNewGame(recoveryRequest);
  assert.equal(recovered.screen.panels.character.data.name, 'Микула');
  assert.equal(
    await count(pool, 'party_runtime.party_materialization_runs',
      recovered.party_id),
    1
  );
  assert.equal(
    await count(pool, 'party_runtime.party_player_characters',
      recovered.party_id),
    1
  );
  assert.equal(
    await count(pool, 'party_runtime.party_server_sessions',
      recovered.party_id),
    1
  );

});

async function installActivatedRuntimeCatalog({ pool, databaseUrl }) {
  const lifecycle = spawnSync(
    process.execPath,
    ['scripts/run-pr17-item-container-stage3c.mjs', '--mode', 'lifecycle'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 180_000,
      env: { ...process.env, PR17_TEST_DATABASE_URL: databaseUrl }
    }
  );
  assert.equal(lifecycle.status, 0, lifecycle.stderr);
  assert.equal(JSON.parse(lifecycle.stdout).pass, true);
  for (const file of ['18.sql', '19.sql', '20.sql']) {
    await pool.query(await readFile(`infra/world-base/schema/${file}`, 'utf8'));
  }
  await pool.query(await buildLowerDvinaV2ImportSql());
  assert.equal((await runWorldRuntimeCatalogMigration(pool)).status, 'applied');
  const commitSha = spawnSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8'
  }).stdout.trim();
  assert.match(commitSha, /^[a-f0-9]{40}$/u);
  const activation = async (build, apply) => {
    const bundle = await build({
      worldPool: pool,
      partyPool: pool,
      repositoryRoot: process.cwd(),
      gitCommitSha: commitSha,
      authorizationRef: 'Phase 1B PostgreSQL integration test'
    });
    await apply({ worldPool: pool, partyPool: pool, bundle });
  };
  await activation(
    buildFirstPlayableV2ActivationBundle,
    applyFirstPlayableV2ActivationBundle
  );
  await pool.query(await buildLowerDvinaBoundaryV1ImportSql());
  await activation(
    buildLowerDvinaBoundaryV3ActivationBundle,
    applyLowerDvinaBoundaryV3ActivationBundle
  );
  await pool.query(await readFile('infra/world-base/schema/21.sql', 'utf8'));
  await pool.query(await buildCharacterAppearanceV1ImportSql());
  await pool.query(await buildS1AuthoringV6ImportSql());
  await activation(
    buildSpatialV3ProductionV12ActivationBundle,
    applySpatialV3ProductionV12ActivationBundle
  );
  return loadActiveRuntimeCatalogPin(pool, 'item_container_materialization_v2');
}

async function importM2aPartyRows(pool, fixture) {
  const order = [
    'parties', 'party_v3_change_sets', 'party_catalog_pins',
    'party_materialization_runs', 'party_materialization_run_catalog_pins',
    'party_materialization_choices', 'party_g5_nodes', 'party_g5_anchors',
    'party_player_characters', 'party_npcs', 'party_actor_profile_bindings',
    'party_actor_body_states', 'party_clocks', 'party_positions', 'party_items',
    'party_item_placements', 'party_ownership', 'party_state_snapshots',
    'party_server_sessions'
  ];
  const transaction = await pool.connect();
  try {
    await transaction.query('BEGIN');
    for (const table of order) {
      const rows = fixture.tables[table] ?? [];
      if (rows.length === 0) continue;
      await transaction.query(
        `INSERT INTO party_runtime."${table}"
         SELECT * FROM json_populate_recordset(
           NULL::party_runtime."${table}",$1::json)`,
        [JSON.stringify(rows)]);
    }
    await transaction.query('COMMIT');
  } catch (error) {
    await transaction.query('ROLLBACK');
    throw error;
  } finally {
    transaction.release();
  }
}

async function api(base, path, body = null) {
  const response = await fetch(`${base}${path}`, body == null ? {} : {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const value = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(value.error?.message), {
      code: value.error?.code,
      status: response.status
    });
  }
  return { status: response.status, ...value };
}

function assertPublic(value) {
  const serialized = JSON.stringify(value);
  for (const forbidden of [
    'hidden_truth',
    'culprit',
    'motive',
    'hidden_sequence',
    'sealed_selections',
    'clue_placements',
    'lies_and_statements',
    'materialization_trace'
  ]) assert.doesNotMatch(serialized, new RegExp(forbidden, 'u'));
}

async function count(pool, table, partyId) {
  return (await pool.query(
    `SELECT count(*)::int AS count FROM ${table} WHERE party_id=$1`,
    [partyId]
  )).rows[0].count;
}

async function waitForPostgres(name) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (docker([
      'exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'phase1b', '-d', 'pr17_phase1b'
    ]).status === 0) return;
  }
  assert.fail('PostgreSQL container did not become ready');
}

const M2B_TURNS = Object.freeze([
  'Осматриваюсь.',
  'Оглядываюсь вокруг.',
  'Говорю вслух: «Проверю сети».',
  'Прыгну к облакам и останусь там.',
  'После неудачи снова спокойно осматриваюсь.',
  'Осматриваюсь, затем кричу: «Эй!»',
  'Жду здесь один час.',
  'Проверяю, что изменилось вокруг.',
  'Ещё раз оглядываюсь другими словами.',
  'Спокойно наблюдаю за станом.'
]);

function m3NeutralTurnPlan(request) {
  const actorRef = request.actor.actor_id;
  const text = request.remaining_intent;
  let operation;
  if (text.includes('рыбака')) {
    operation = { op: 'request_discovery', discovery_kind: 'inspect',
      actor_ref: actorRef, target_refs: [request.player_safe_state
        .background_npc_remainder.eligible_npc_refs[0]], query: text };
  } else if (text.includes('Осматриваю местную')) {
    operation = { op: 'request_discovery', discovery_kind: 'look',
      actor_ref: actorRef, target_refs: [request.player_safe_state
        .spatial_semantic.position_ref], query: text };
  } else {
    const local = request.player_safe_state.visible_objects.find(
      ({ entity_ref: ref }) =>
        ref?.entity_kind === 'spatial_local_reference');
    operation = { op: 'request_movement', movement_kind: 'local',
      actor_ref: actorRef, target_ref: local.entity_ref.entity_id };
  }
  return { schema: 'turn_step_plan_v1', request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision, step_index: request.step_index,
    interpretation: { player_goal: request.root_player_action,
      grounded_attempt: text, adaptation: 'literal' }, resolution: 'domain_request',
    goal_result: 'pending', activity: { owner: 'domain',
      duration_class: null, effort: null }, operations: [operation],
    check: null, continuation: null, clarification: null,
    direct_result_kind: null, reason_code: 'm3_neutral_owner_probe',
    reason: 'Запрос передан существующему владельцу.' };
}

function m2bTurnPlan(request) {
  const base = {
    schema: 'turn_step_plan_v1', request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision, step_index: request.step_index,
    interpretation: { player_goal: request.root_player_action,
      grounded_attempt: 'осмотреть доступную обстановку',
      adaptation: 'literal' },
    resolution: 'direct', goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    operations: [], check: null, continuation: null, clarification: null,
    direct_result_kind: 'player_safe_observation',
    reason_code: 'observe_current_scene',
    reason: 'Наблюдение использует только player-safe состояние.'
  };
  const text = request.remaining_intent;
  if (text.includes('Жду здесь')) return { ...base,
    interpretation: { player_goal: request.root_player_action,
      grounded_attempt: text, adaptation: 'literal' },
    activity: { owner: 'semantic', duration_class: 'extended', effort: 'none',
      requested_duration_minutes: 60 }, direct_result_kind: null,
    reason_code: 'wait_sixty_minutes' };
  if (text.includes('облакам')) return { ...base,
    interpretation: { player_goal: request.root_player_action,
      grounded_attempt: 'подпрыгнуть настолько высоко, насколько возможно',
      adaptation: 'reality_limited' }, goal_result: 'not_achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'light' },
    direct_result_kind: null, reason_code: 'impossible_height' };
  if (text.includes('затем кричу') && request.step_index === 1) return { ...base,
    goal_result: 'pending', continuation: {
      remaining_intent: 'кричу: «Эй!»', depends_on_refs: []
    } };
  if (text.includes('Говорю вслух') || text.includes('кричу:')) {
    const utteranceText = text.includes('Эй') ? 'Эй!' : 'Проверю сети';
    return { ...base, interpretation: { player_goal: request.root_player_action,
      grounded_attempt: text, adaptation: 'literal' },
      direct_result_kind: 'player_utterance', utterance: {
        speaker_ref: request.actor.actor_id, utterance_text: utteranceText,
        input_mode: 'verbatim',
        delivery: { loudness: 2, duration_class: 'instant' }
      }, reason_code: 'speak_verbatim' };
  }
  return base;
}
