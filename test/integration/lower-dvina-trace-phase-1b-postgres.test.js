import test from 'node:test';
import assert from 'node:assert/strict';
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
import { adaptApprovedOpeningNarration } from '@rus/narration';
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
import { createLowerDvinaTracePhase1ARepository } from
  '@rus/party-store/internal/lower-dvina-trace-phase-1a';
import {
  runPartyRuntimeCatalogMigration,
  runWorldRuntimeCatalogMigration
} from '../../tools/runtime-catalog-activation/src/forward-migrations.js';
import { bootstrapProceduralFinalV2Disposable } from
  '../../tools/runtime-catalog-activation/src/procedural-final-disposable-bootstrap.js';
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

const openingChecks = ['schema_and_structure', 'visible_context_compliance',
  'new_fact_check', 'npc_check', 'item_check', 'container_check',
  'door_exit_route_check', 'time_light_weather_check', 'position_check',
  'g5_anchor_check', 'knowledge_boundary_check', 'hidden_state_leak_check',
  'rumor_uncertainty_check', 'action_options_check', 'technical_text_check',
  'literary_composition_check', 'must_include_check',
  'must_not_include_check', 'commit_readiness'];
const integrationOpeningNarration = Object.freeze({ run: async ({ requestId }) => {
  const audit = { version: 1, schema: 'narrator_prose_audit',
    request_id: requestId, pass: true,
    checks: Object.fromEntries(openingChecks.map((key) => [key, { pass: true }])),
    concerns: [], evidence: ['Integration opening is grounded.'],
    repair_route: null, commit_permission: { can_show_to_player: true,
      can_write_player_visible_message: true,
      can_mark_opening_scene_presented: true } };
  const stage22 = { version: 1, schema: 'stage22_narrator_prose_result',
    request_id: requestId, pass: true,
    visible_context_package_digest: 'integration-visible',
    narrator_starting_prose: { version: 1,
      schema: 'narrator_starting_prose', request_id: requestId,
      prose_status: 'drafted',
      prose: 'Любава готовит рыбацкий стан у Вихтуя к работе.',
      action_options: [], used_visible_context_refs: [],
      self_constraints_check: {} }, generation_history: [],
    handoff_permission: { can_send_to_prose_audit: true } };
  const stage23 = { version: 1,
    schema: 'stage23_narrator_prose_audit_result', request_id: requestId,
    pass: true, narrator_starting_prose_digest: 'integration-prose',
    narrator_prose_audit: audit, repair_route: null, audit_history: [],
    commit_permission: { can_show_to_player: true,
      can_write_player_visible_message: true,
      can_mark_opening_scene_presented: true } };
  const flow = adaptApprovedOpeningNarration({ stage22Result: stage22,
    stage23Result: stage23 });
  return { prose: flow.approved_output.prose, flow,
    stage22_result: stage22, stage23_result: stage23,
    original_stage23_audit: audit };
} });
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
import { createRuntimeCatalogLoader,
  loadApprovedProceduralSceneRecordBundle } from '@rus/runtime-catalog';
import { generateProceduralSceneProfileCatalog } from
  '../../scripts/generate-procedural-scene-profiles.mjs';
import { resolveOptionalProceduralSceneCatalog } from
  '../../apps/game-server/src/internal/procedural-scene-start-boundary.js';
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
  let worldPool;
  let server;
  let managed;
  let managedRoot;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (pool) await pool.end();
    if (worldPool) await worldPool.end();
    if (managed) await managed.close();
    if (managedRoot) await rm(managedRoot, { recursive: true, force: true });
    if (dockerReady) docker(['rm', '-f', name]);
  });
  let databaseUrl;
  let worldDatabaseUrl;
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
    worldDatabaseUrl = `postgresql://phase1b:local_only@127.0.0.1:${port}/pr17_phase1b_world`;
  } else {
    managedRoot = await mkdtemp(join(tmpdir(), 'novgorod-m2a-postgres-'));
    managed = await ensureLocalPostgres({ dataRoot: managedRoot,
      settings: { ...LOCAL_POSTGRES,
        worldDatabase: `pr17_m2a_world_${process.pid}`,
        partyDatabase: `pr17_m2a_party_${process.pid}`,
        worldUser: 'postgres', partyUser: 'postgres' } });
    databaseUrl = managed.partyUrl;
    worldDatabaseUrl = managed.worldUrl;
  }
  pool = new pg.Pool({ connectionString: databaseUrl, max: 8 });
  await pool.query('SELECT 1');
  if (dockerReady) await pool.query('CREATE DATABASE pr17_phase1b_world');
  worldPool = new pg.Pool({ connectionString: worldDatabaseUrl, max: 8 });
  await worldPool.query('SELECT 1');
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
    worldPool,
    partyPool: pool,
    worldDatabaseUrl
  });
  const proceduralBindings = JSON.parse(await readFile(
    'data/world-catalogs/novgorod/procedural-scene-v1/authoring-bindings.json',
    'utf8'));
  const catalogLoader = createRuntimeCatalogLoader({ worldBaseReader: {
    read: (sql, parameters) => worldPool.query(sql, parameters)
  }, supportedRuntimeContractDigests: [runtimeCatalogPin.runtime_contract_digest] });
  const verifiedItemCatalog = await catalogLoader.loadApprovedItemCatalog({
    pin: runtimeCatalogPin });
  const proceduralRecords = await loadApprovedProceduralSceneRecordBundle({
    worldBaseReader: { read: (sql, parameters) => worldPool.query(sql, parameters) },
    worldPin: { world_revision_id: runtimeCatalogPin.compatible_world_revision_id,
      world_catalog_digest: runtimeCatalogPin.compatible_world_catalog_digest },
    runtimeCatalogPin, bindings: proceduralBindings, verifiedItemCatalog });
  assert.equal(resolveOptionalProceduralSceneCatalog({
    generate: generateProceduralSceneProfileCatalog,
    bindings: proceduralBindings, approvedRecordBundle: proceduralRecords
  }), null);
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
    runtimeCatalogLoader = null,
    committer = { commit: async () => ({ ok: true }) }
  } = {}) => {
    const adapter = createLowerDvinaTracePhase1BProductionAdapter({
      partyPool: pool,
      worldPool,
      release,
      runtimeCatalogPin,
      initialOrdinaryProvisioner,
      authoredStartResolver,
      runtimeCatalogLoader
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
        traceTurnRuntime: Object.freeze({ ...(traceTurnRuntime ?? {}),
          authoredOpeningNarration: integrationOpeningNarration }),
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
      getLlmSettings: () => ({ mode: 'custom',
        compatibility: 'openai_compatible',
        base_url: 'http://127.0.0.1:8000/v1',
        model: 'qwen3.8-27b-uncensored-w4a16-tp2',
        api_key_present: false,
        default_model: 'qwen3.8-27b-uncensored-w4a16-tp2' }),
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
  const publicPackages = (await pool.query(
    `SELECT trace FROM party_runtime.party_materialization_runs
      WHERE party_id=$1`, [partyId]
  )).rows[0].trace.procedural_scene_packages.packages;
  assert.ok(publicPackages.some(({ family }) => family === 'natural_shore'));
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
  const sceneRepository = createLowerDvinaTracePhase1ARepository({
    query: pool.query.bind(pool)
  });
  const packageTrace = (await pool.query(
    `SELECT trace FROM party_runtime.party_materialization_runs
      WHERE party_id=$1`, [authoredPartyId])).rows[0].trace;
  const scenePackages = packageTrace.procedural_scene_packages;
  assert.equal(scenePackages.packages.length, 3);
  const fishingPackage = scenePackages.packages.find(({ family }) =>
    family === 'inland_fishing_worksite');
  assert.equal(fishingPackage.allocation_policy.status,
    'pending_p16_inventory_validation');
  assert.equal(fishingPackage.profile.readiness.functional_layers.find(
    ({ layer }) => layer === 'tool').status, 'pending_p16_owner');
  assert.equal(fishingPackage.profile.readiness.functional_layers.find(
    ({ layer }) => layer === 'container').status, 'unresolved');
  assert.deepEqual(await sceneRepository.loadPlayerSafeScenePackages(
    authoredPartyId), await sceneRepository.loadPlayerSafeScenePackages(
    authoredPartyId));
  const safePackages = await sceneRepository.loadPlayerSafeScenePackages(
    authoredPartyId);
  assert.ok(safePackages.every((entry) => Object.keys(entry).every((key) => [
    'scene_package_id', 'family', 'g5_node_id', 'g6_instance_id',
    'position_id', 'environment_facets', 'functional_groups',
    'allocation_status'
  ].includes(key))));
  assert.equal(safePackages.find(({ family }) => family ===
    'inland_fishing_worksite').allocation_status, 'resolved');
  const allocatedFishingItems = (await pool.query(
    `SELECT item.template_id,item.profile_id,item.quantity,item.state,
            placement.holder_npc_id,placement.physical_position,
            ownership.owner_npc_id,ownership.controller_npc_id
       FROM party_runtime.party_items item
       JOIN party_runtime.party_item_placements placement
         ON placement.party_id=item.party_id AND placement.item_id=item.item_id
       JOIN party_runtime.party_ownership ownership
         ON ownership.party_id=item.party_id AND ownership.item_id=item.item_id
      WHERE item.party_id=$1
        AND item.state->>'causal_basis'='procedural_actor_allocation_v1'
      ORDER BY item.template_id`, [authoredPartyId])).rows;
  assert.deepEqual(allocatedFishingItems.map((item) => [item.template_id,
    item.profile_id, Number(item.quantity)]), [
    ['item_tpl_nov_fishing_line_v1',
      'inventory_item_tpl_nov_fishing_line_v1', 1],
    ['item_tpl_nov_fishing_net_v1',
      'inventory_item_tpl_nov_fishing_net_v1', 1]
  ]);
  const fisherId = fishingPackage.allocation_policy.actor_instance_id;
  assert.ok(allocatedFishingItems.every((item) =>
    item.holder_npc_id === fisherId && item.owner_npc_id === fisherId
      && item.controller_npc_id === fisherId
      && ['hands', 'external'].includes(item.physical_position)
      && item.state.allocation_evidence?.policy_id
        === fishingPackage.allocation_policy.policy_id));
  assert.deepEqual(await sceneRepository.loadPlayerSafeScenePackages(
    'party-v1-development'), []);
  assert.equal((await pool.query(
    `SELECT catalog_revision_id FROM party_runtime.party_catalog_pins
      WHERE party_id='party-v1-development'`)).rows[0].catalog_revision_id,
  'procedural_scene_final_candidate_v1_001');
  const authoredInternal = await first.adapter.loadInternal(authoredPartyId);
  assert.equal(authoredInternal.npcs.length, 3);
  assert.equal(authoredInternal.items.length, 4);
  assert.ok(authoredInternal.npcs.every((npc) =>
    npc.semantic_state.approved_runtime_basis.schedule.source_ref.endsWith(
      ':daily_schedule_summer')
      && npc.semantic_state.approved_runtime_basis.tool_requirement.source_ref
        .includes(`:${npc.profile_id}:typical_tools`)));
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
    .sort((a, b) => a - b), [1, 1, 1, 1]);
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
  assert.equal((await pool.query(
    `SELECT count(*)::int AS count FROM party_runtime.party_items
      WHERE party_id=$1
        AND state->>'causal_basis'='procedural_actor_allocation_v1'`,
    [authoredPartyId])).rows[0].count, 2);
  assert.deepEqual((await pool.query(
    `SELECT trace FROM party_runtime.party_materialization_runs
      WHERE party_id=$1`, [authoredPartyId])).rows[0].trace
    .procedural_scene_packages, scenePackages);
  const tamperedTop = structuredClone(packageTrace);
  tamperedTop.procedural_scene_packages.digest = '0'.repeat(64);
  await pool.query(`UPDATE party_runtime.party_materialization_runs
    SET trace=$2::jsonb WHERE party_id=$1`, [authoredPartyId,
    JSON.stringify(tamperedTop)]);
  await assert.rejects(() => sceneRepository.loadPlayerSafeScenePackages(
    authoredPartyId));
  const tamperedPackage = structuredClone(packageTrace);
  tamperedPackage.procedural_scene_packages.packages[0].scene_package_digest =
    '0'.repeat(64);
  await pool.query(`UPDATE party_runtime.party_materialization_runs
    SET trace=$2::jsonb WHERE party_id=$1`, [authoredPartyId,
    JSON.stringify(tamperedPackage)]);
  await assert.rejects(() => sceneRepository.loadPlayerSafeScenePackages(
    authoredPartyId));
  await pool.query(`UPDATE party_runtime.party_materialization_runs
    SET trace=$2::jsonb WHERE party_id=$1`, [authoredPartyId,
    JSON.stringify(packageTrace)]);
  assert.equal(await count(pool, 'party_runtime.parties', authoredPartyId), 1);
  assert.equal(await count(pool, 'party_runtime.party_materialization_runs', authoredPartyId), 1);
  assert.equal(await count(pool, 'party_runtime.party_server_sessions', authoredPartyId), 1);
  const authoredIdentity = (await pool.query(
    `SELECT stage26_result FROM party_runtime.party_server_sessions
      WHERE party_id=$1`, [authoredPartyId])).rows[0].stage26_result;
  assert.deepEqual(authoredIdentity.runtime_binding,
    authoredStartCatalog.runtime_binding);
  assert.equal(authoredIdentity.runtime_binding.revision, 6);
  assert.equal(authoredIdentity.materializer_binding_id,
    'live_world_authored_start_v3');
  assert.equal(authoredIdentity.materializer_version, 'code_materializer_v3');
  assert.equal(authoredIdentity.opening_narration_flow.status, 'approved');
  assert.equal(authoredIdentity.opening_narration_flow.approved_output.prose,
    authoredStart.data.screen.main_prose);
  assert.equal(authoredIdentity.opening_stage23_original_audit.schema,
    'narrator_prose_audit');
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
  assert.equal((await pool.query(
    `SELECT count(*)::int AS count FROM party_runtime.party_items
      WHERE party_id=$1
        AND state->>'causal_basis'='procedural_actor_allocation_v1'`,
    [partyId])).rows[0].count, 0);
  const malformedRequestId = 'm3-p16-malformed-policy';
  const malformedRuntime = makeRuntime(null, { runtimeCatalogLoader: {
    async loadApprovedItemCatalog(input) {
      const value = structuredClone(await catalogLoader.loadApprovedItemCatalog(input));
      value.records_by_table.item_template_inventory_profiles.find((profile) =>
        profile.id === 'inventory_item_tpl_nov_fishing_net_v1').mass_grams = 5001;
      return value;
    }
  } }).runtime;
  await assert.rejects(() => malformedRuntime.startNewGame({
    scenario_id: 'vikhtuy_fishing_camp_v1', request_id: malformedRequestId
  }), (error) => error?.message.includes(
    'P16_ALLOCATION_INVENTORY_PROFILE_INVALID'));
  const malformedPartyId = `party:${hashForTest(malformedRequestId).slice(0, 24)}`;
  for (const table of ['parties', 'party_materialization_runs', 'party_items']) {
    assert.equal(await count(pool, `party_runtime.${table}`, malformedPartyId), 0);
  }
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
        model: 'qwen3.8-27b-uncensored-w4a16-tp2',
        api_key_present: false,
        default_model: 'qwen3.8-27b-uncensored-w4a16-tp2' }),
      getTurnProgress: () => null }),
    staticAssets: createStaticAssetResolver({
      webRoot: resolve(here, '../../apps/game-web'),
      contractsRoot: resolve(here, '../../packages/contracts/src')
    }), developerMode: true
  });
  t.after(() => turnServer.close());
  const turnAddress = await listen(turnServer, { host: '127.0.0.1', port: 0 });
  const turnBase = `http://127.0.0.1:${turnAddress.port}`;
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
  assert.equal((await pool.query(
    `SELECT count(*)::int AS count FROM party_runtime.party_items
      WHERE party_id=$1
        AND state->>'causal_basis'='procedural_actor_allocation_v1'`,
    [authoredPartyId])).rows[0].count, 2);
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

async function installActivatedRuntimeCatalog({ worldPool, partyPool,
  worldDatabaseUrl }) {
  const lifecycle = spawnSync(
    process.execPath,
    ['scripts/run-pr17-item-container-stage3c.mjs', '--mode', 'lifecycle'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 180_000,
      env: { ...process.env, PR17_TEST_DATABASE_URL: worldDatabaseUrl }
    }
  );
  assert.equal(lifecycle.status, 0, lifecycle.stderr);
  assert.equal(JSON.parse(lifecycle.stdout).pass, true);
  for (const file of ['18.sql', '19.sql', '20.sql', '21.sql']) {
    await worldPool.query(await readFile(`infra/world-base/schema/${file}`, 'utf8'));
  }
  await worldPool.query(await buildLowerDvinaV2ImportSql());
  await worldPool.query(await buildLowerDvinaBoundaryV1ImportSql());
  await worldPool.query(await buildCharacterAppearanceV1ImportSql());
  await seedSpatialV5Revision(worldPool);
  await worldPool.query(await buildS1AuthoringV6ImportSql());
  assert.equal((await runWorldRuntimeCatalogMigration(worldPool)).status, 'applied');
  return (await bootstrapProceduralFinalV2Disposable({ worldPool,
    partyPool, repositoryRoot: process.cwd() })).v2Pin;
}

async function seedSpatialV5Revision(pool) {
  const root = 'data/world-catalogs/novgorod/spatial-v3/candidates/'
    + 'spatial-v3-production-v5/datasets';
  for (const [table, file] of [
    ['source_records', 'source_records.json'],
    ['world_revisions', 'world_revisions.json'],
    ['spatial_v3_world_revisions', 'spatial_v3_world_revisions.json']
  ]) {
    for (const row of JSON.parse(await readFile(`${root}/${file}`, 'utf8'))) {
      const columns = Object.keys(row);
      await pool.query(`INSERT INTO world_base.${table} (${columns.join(',')})
        VALUES (${columns.map((_, index) => `$${index + 1}`).join(',')})
        ON CONFLICT DO NOTHING`, columns.map((column) => row[column]));
    }
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
