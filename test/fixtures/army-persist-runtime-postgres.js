import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { createSeededRandomSource } from '@rus/checks-rng';
import { createTemporalAdvanceOwner } from '@rus/turn/temporal-advance';
import { createLowerDvinaTracePublicRuntime } from '../../apps/game-server/src/runtime/lower-dvina-trace-public-runtime.js';
import { TRACE_REVISION26_PHASE_1A_MANIFEST_DIGEST } from '../../apps/game-server/src/internal/lower-dvina-trace-revision-26-publication.js';
import { createLowerDvinaTracePhase2Runtime } from '../../apps/game-server/src/runtime/lower-dvina-trace-phase-2.js';
import { createLowerDvinaTracePhase1BProductionAdapter } from '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-1b.js';
import { createLowerDvinaTracePhase2PostgresRepository } from '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2.js';
import { createLowerDvinaTracePhase2DurableNarrator } from '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2-presentation.js';
import { createSpatialV3PostgresCombinedAtomicCommitter } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { firstPlayableCommitRecheck } from '../../apps/game-server/src/infrastructure/postgres/first-playable/recheck.js';
import { lowerDvinaTraceConversationTemporalEffectRegistrations } from '../../apps/game-server/src/runtime/lower-dvina-trace-m2-conversation-temporal-effect-owner.js';
import { createM2ConversationModels } from '../../apps/game-server/test/lower-dvina-trace-m2-conversation-fixture.js';
import { createLowerDvinaTraceTurnStepTestModel } from '../../apps/game-server/test/lower-dvina-trace-turn-step-model-fixture.js';
import { runPartyRuntimeCatalogMigration } from '../../tools/runtime-catalog-activation/src/forward-migrations.js';
import { buildApprovedTemporalImportSql } from '../../tools/temporal-v4/import-approved-data.mjs';
import { testContainerLabel } from '../helpers/test-containers.js';
import { createPostgresTestBackend } from './postgres-test-backend.js';
import {
  installLowerDvinaTraceV5World,
  installLowerDvinaTraceV6World,
  lowerDvinaTraceV5World,
  lowerDvinaTraceV6World
} from './lower-dvina-trace-v5-world-fixture.js';

const docker = (args, timeout = 45_000) => spawnSync('docker', args,
  { encoding: 'utf8', timeout });

export async function createArmyPersistFixture(t, { worldVersion = 6 } = {}) {
  assert.ok([5, 6].includes(worldVersion), 'worldVersion must be 5 or 6');
  const backend = await createPostgresTestBackend('pr17_army_persist');
  let pool;
  let containerName = null;
  t.after(async () => {
    if (pool) await pool.end();
    if (backend) await backend.close();
    if (containerName) docker(['rm', '-fv', containerName]);
  });
  if (backend) {
    const databaseUrl = new URL(backend.worldUrl);
    pool = new pg.Pool({
      host: databaseUrl.hostname,
      port: Number(databaseUrl.port),
      user: decodeURIComponent(databaseUrl.username),
      password: decodeURIComponent(databaseUrl.password),
      database: decodeURIComponent(databaseUrl.pathname.slice(1)),
      max: 8
    });
  } else {
    if (docker(['version']).status !== 0) {
      t.skip('No supported PostgreSQL backend and Docker is unavailable');
      return null;
    }
    containerName = `army-persist-${process.pid}-${randomUUID().slice(0, 8)}`;
    const started = docker(['run', ...testContainerLabel(), '-d',
      '--name', containerName, '-p', '127.0.0.1::5432',
      '-e', 'POSTGRES_PASSWORD=local_only', '-e', 'POSTGRES_USER=army_persist',
      '-e', 'POSTGRES_DB=pr17_army_persist', 'postgres:16-alpine']);
    assert.equal(started.status, 0, started.stderr);
    await waitForPostgres(containerName);
    const port = Number(docker(['port', containerName, '5432']).stdout
      .match(/:(\d+)\s*$/u)?.[1]);
    assert.ok(Number.isInteger(port) && port > 0,
      'Docker did not publish PostgreSQL port');
    pool = new pg.Pool({ host: '127.0.0.1', port,
      user: 'army_persist', password: 'local_only',
      database: 'pr17_army_persist', max: 8 });
  }

  await installSchemas(pool);
  const world = worldVersion === 5 ? lowerDvinaTraceV5World
    : lowerDvinaTraceV6World;
  const { runtimeCatalogPin } = worldVersion === 5
    ? await installLowerDvinaTraceV5World(pool)
    : await installLowerDvinaTraceV6World(pool);
  await pool.query(await buildApprovedTemporalImportSql());
  const release = Object.freeze({
    release_id: `army-persist-v${worldVersion}-release`,
    world_revision_id: world.revision,
    world_catalog_digest: world.digest,
    compatible_world_pin_manifest_digest:
      runtimeCatalogPin.compatible_world_pin_manifest_digest
  });
  return { pool, release, runtimeCatalogPin, worldVersion };
}

export function buildArmyPersistRuntime(options) {
  const { pool, release, runtimeCatalogPin } = options;
  const worldVersion = options.worldVersion ?? 6;
  assert.ok(pool && release && runtimeCatalogPin,
    'pool, release, and runtimeCatalogPin are required');
  const counters = options.counters ?? {};
  for (const field of ['turnStepModel', 'playerConversationModel',
    'npcSemanticModel', 'semanticResolver', 'narration']) {
    counters[field] ??= 0;
  }
  const observe = (field, callback, request) => {
    counters[field] += 1;
    callback?.(structuredClone(request));
  };

  const committer = createSpatialV3PostgresCombinedAtomicCommitter({
    pool,
    recheck: firstPlayableCommitRecheck,
    now: () => new Date('2026-07-30T08:00:00.000Z')
  });
  const innerNarrationService = options.narrationService ?? {
    async run(request) { return approvedNarration(request); }
  };
  const narrationService = {
    async run(request, serviceOptions) {
      observe('narration', options.onNarrationRequest, request);
      return innerNarrationService.run(request, serviceOptions);
    }
  };
  let repository = createLowerDvinaTracePhase2PostgresRepository({
    partyPool: pool,
    committer,
    narrationService
  });
  if (options.repositoryDecorator) {
    repository = options.repositoryDecorator(repository);
  }

  const baseModels = createM2ConversationModels();
  const playerConversationModel = (request) => {
    observe('playerConversationModel', options.onPlayerConversationRequest,
      request);
    return options.playerConversationModel
      ? options.playerConversationModel(request)
      : baseModels.playerConversationModel(request);
  };
  const npcSemanticModel = (request) => {
    observe('npcSemanticModel', options.onNpcSemanticRequest, request);
    return options.npcSemanticModel
      ? options.npcSemanticModel(request)
      : baseModels.npcSemanticModel(request);
  };
  const defaultTurnStep = createLowerDvinaTraceTurnStepTestModel();
  const turnStepModel = (request) => {
    observe('turnStepModel', options.onTurnStepRequest, request);
    return options.turnStepModel
      ? options.turnStepModel(request)
      : defaultTurnStep(request);
  };
  const semanticResolver = async (request) => {
    observe('semanticResolver', options.onSemanticRequest, request);
    return options.semanticResolver
      ? options.semanticResolver(request)
      : { option_id: request.action_set.find(({ option_id: id }) =>
        id === 'inspect_wreck_in_detail')?.option_id };
  };
  const traceTurnRuntime = createLowerDvinaTracePhase2Runtime({
    repository,
    turnStepModel,
    playerConversationModel,
    npcSemanticModel,
    semanticResolver,
    narrator: createLowerDvinaTracePhase2DurableNarrator({
      partyPool: pool,
      narrationService
    }),
    randomSourceFactory: ({ request_id: requestId }) =>
      createSeededRandomSource(`army-persist:${requestId}`),
    decisionSecret: 'army-persist-test-secret',
    temporalAdvanceOwner: createTemporalAdvanceOwner({
      effect_registrations:
        lowerDvinaTraceConversationTemporalEffectRegistrations()
    }),
    now: () => '2026-07-30T08:00:00.000Z'
  });
  const runtime = createLowerDvinaTracePublicRuntime({
    partyPool: pool,
    committer,
    release,
    runtimeCatalogPin,
    ...(worldVersion === 6 ? {
      activePhase1AManifestDigest: TRACE_REVISION26_PHASE_1A_MANIFEST_DIGEST,
      activeScenarioDefinitionRevision: 26
    } : {}),
    traceStartAdapter: createLowerDvinaTracePhase1BProductionAdapter({
      partyPool: pool,
      worldPool: pool,
      release,
      runtimeCatalogPin
    }),
    traceTurnRuntime
  });
  return { runtime, repository, counters };
}

export function approvedNarration(request) {
  const { request_id: requestId, surface } = request;
  return {
    version: 1,
    schema: 'narration_flow_result',
    request_id: requestId,
    surface,
    status: 'approved',
    pass: true,
    approved_output: {
      version: 1,
      schema: 'narration_output',
      output_id: requestId,
      prose: 'На берегу проступает ясная картина повреждений.',
      action_options: [],
      used_references: [],
      self_check: { no_new_world_facts: true }
    },
    final_audit: {
      version: 1,
      schema: 'narration_audit',
      artistic_verdict: 'pass',
      technical_verdict: 'pass',
      coverage: { visible_changes: [], uncertainties: [] },
      pass: true,
      concerns: [],
      evidence: ['persisted visible context']
    },
    repair_request: null,
    generation_history: [],
    audit_history: [],
    repair_history: [],
    diagnostics: {}
  };
}

async function installSchemas(pool) {
  await pool.query('SELECT 1');
  const partyFiles = (await readdir('schemas/party-db'))
    .filter((value) => /^\d+.*\.sql$/u.test(value)).sort();
  const catalogMigrationIndex = partyFiles.findIndex((file) =>
    file.startsWith('012_'));
  assert.equal(catalogMigrationIndex, 11);
  for (const file of partyFiles.slice(0, catalogMigrationIndex)) {
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
  assert.equal((await runPartyRuntimeCatalogMigration(pool)).status, 'applied');
  for (const file of partyFiles.slice(catalogMigrationIndex)) {
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
}

async function waitForPostgres(containerName) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (docker(['exec', containerName, 'pg_isready', '-h', '127.0.0.1'])
      .status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('PostgreSQL did not become ready');
}
