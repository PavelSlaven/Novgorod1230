import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createLowerDvinaTracePhase1ARepository } from '@rus/party-store/internal/lower-dvina-trace-phase-1a';

import { bootstrapV17Imports } from '../../scripts/bootstrap-live-world-v17.mjs';
import { digestEnvelope } from '../../tools/runtime-catalog-activation/src/artifact-contracts.js';
import { createSpatialV3ProductionCompositionRoot } from
  '../../apps/game-server/src/composition/production-spatial-v3.js';
import { readV17PartyProductionCatalogLedger } from
  '../../scripts/v17-party-production-catalog-ledger.mjs';
import { buildApprovedTemporalImportSql } from '../../tools/temporal-v4/import-approved-data.mjs';
import { buildImportWithReadbackSql } from '../../tools/spatial-v3/p12-authoring-importer.mjs';
import { turnStepOperationChoices } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-turn-step-operation-choices.js';
import { testContainerLabel } from '../helpers/test-containers.js';
import { TARGET_SMOKE_INPUT } from './target-http-browser-smoke.js';

export const POSTGRES_IMAGE = 'postgres:16.14-alpine';
export const WORLD_DB = 'novgorod_world_v17';
export const PARTY_DB = 'novgorod_party_v17';
export const VIKHTUY_MEETING_G5 = 'cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area';
export const VIKHTUY_LOCALITY_G4 = 'g4v3__gn_nov_g3_xp017_yp026_r2_vikhtuy_locality';
export const PF_RURAL_YARD = 'pf_rural_yard';
export const PF_PEASANT_HOMESTEAD = 'pf_peasant_homestead';
const TARGET_REV = 'novgorod_spatial_v3_target_contract_approval_001';
const waveRootRel = 'data/world-catalogs/novgorod/m2c-npc-wave/v1';

async function prepareApprovedWaveCopy(baseDir) {
  await cp(join(process.cwd(), waveRootRel), baseDir, { recursive: true });
  const manifestFile = join(baseDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  manifest.status = 'approved';
  await writeFile(manifestFile, JSON.stringify(manifest));
  return { manifestFile, approvalPath: join(baseDir, 'approval.json') };
}

export async function assertBootstrapV17PartyProductionLedger(partyPool) {
  const { row, fingerprint, release } = await readV17PartyProductionCatalogLedger(partyPool);
  assert.ok(row, 'bootstrap must record party_runtime_catalog_pins_v2 ledger row');
  assert.equal(row.migration_digest, release.party_runtime_catalog_migration_digest);
  assert.equal(row.target_schema_fingerprint, release.party_runtime_catalog_target_fingerprint);
  assert.equal(fingerprint, release.party_runtime_catalog_target_fingerprint);
}

/** Test-only enrichment: approved copy of draft m2c-npc-wave (production bootstrap does not import wave until D27). */
async function enrichV17WorldForTargetStarts(worldPool) {
  const temporalCount = Number((await worldPool.query(
    'SELECT count(*)::int AS count FROM world_base.temporal_authoring_records')).rows[0].count);
  assert.ok(temporalCount > 0, 'v17 bootstrap must import approved temporal-v4 before presence enrichment');
  const dir = await mkdtemp(join(tmpdir(), 'm2c-wave-presence-e2e-'));
  try {
    const { manifestFile, approvalPath } = await prepareApprovedWaveCopy(dir);
    await worldPool.query(await buildImportWithReadbackSql({
      root: process.cwd(), manifestPath: manifestFile, m2cWaveApprovalPath: approvalPath,
    }));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  await worldPool.query(
    `UPDATE world_base.presence_rules
        SET region_id = 'region_novgorod_land'
      WHERE world_revision_id = $1 AND region_id = 'novgorod_land'`,
    [TARGET_REV],
  );
}

const docker = (args, options = {}) => spawnSync('docker', args, {
  encoding: 'utf8',
  timeout: options.timeout ?? 90_000,
});

function databaseUrl(adminUrl, name) {
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.href;
}

export function startPostgres(name, { profile = 'default' } = {}) {
  const resourceArgs = profile === 'canonical-acceptance'
    ? ['--shm-size', '2g', '--memory', '6g']
    : [];
  const postgresArgs = profile === 'canonical-acceptance'
    ? ['-c', 'shared_buffers=512MB', '-c', 'max_connections=80']
    : [];
  const result = docker([
    'run', ...testContainerLabel(), '-d', '--name', name, '-p', '127.0.0.1::5432',
    ...resourceArgs,
    '-e', 'POSTGRES_PASSWORD=local_only',
    POSTGRES_IMAGE,
    ...postgresArgs,
  ]);
  assert.equal(result.status, 0, result.stderr);
}

async function waitForPostgres(name) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    const logs = docker(['logs', name]);
    const initialized = `${logs.stdout}\n${logs.stderr}`.includes(
      'PostgreSQL init process complete; ready for start up.');
    if (initialized && docker(['exec', name, 'pg_isready', '-U', 'postgres', '-d', 'postgres']).status === 0) {
      return;
    }
  }
  throw new Error(`${name} did not become ready.`);
}

function initializeBootstrapRoles(container) {
  for (const user of ['world_operator', 'party_operator']) {
    const role = docker([
      'exec', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres',
      '-d', 'postgres', '-c',
      `CREATE ROLE ${user} LOGIN SUPERUSER PASSWORD 'local_only'`,
    ]);
    assert.equal(role.status, 0, role.stderr);
  }
}

function adminDatabaseUrl(container) {
  const output = docker(['port', container, '5432']).stdout;
  const port = Number(output.match(/:(\d+)\s*$/u)?.[1]);
  assert.ok(Number.isInteger(port));
  return `postgresql://postgres:local_only@127.0.0.1:${port}/postgres`;
}

function buildFixtureApproval() {
  return async (stage, payload) => {
    const value = { ...payload, attested_by: 'isolated-postgres-test-fixture' };
    return { ...value, attestation_digest: digestEnvelope(value) };
  };
}

function buildAttest(fixtureApproval) {
  return ({ stage, request }) => {
    if (stage === 'item_baseline') {
      return fixtureApproval(stage, {
        schema: 'rus.baseline_registration_attestation.v2',
        registration_request_digest: request.registration_request_digest,
        parent_tuple: {
          parent_revision_id: request.parent_revision_id,
          parent_catalog_digest: request.parent_catalog_digest,
          parent_snapshot_manifest_digest: request.parent_snapshot_manifest_digest,
        },
        compatible_world_tuple: {
          compatible_world_revision_id: request.compatible_world_revision_id,
          compatible_world_catalog_digest: request.compatible_world_catalog_digest,
          compatible_world_pin_manifest_digest: request.compatible_world_pin_manifest_digest,
        },
        decision: 'approve_register_baseline',
        action: 'register_baseline',
      });
    }
    if (stage === 'item_import') {
      return fixtureApproval(stage, {
        schema: 'rus.item_container_overlay_approval_attestation.v2',
        approval_request_digest: request.approval_request_digest,
        decision: 'approve_overlay_import',
        activation_authorized: false,
      });
    }
    if (stage === 'item_activation') {
      return fixtureApproval(stage, {
        schema: 'rus.runtime_catalog_activation_attestation.v2',
        activation_request_digest: request.activation_request_digest,
        catalog_scope: request.catalog_scope,
        target_revision_id: request.target_revision_id,
        target_catalog_digest: request.target_catalog_digest,
        import_id: request.import_id,
        import_audit_digest: request.import_audit_digest,
        runtime_contract_digest: request.runtime_contract_digest,
        runtime_release_id: request.runtime_release_id,
        decision: 'approve_activation',
      });
    }
    if (stage === 'actor_import') {
      return fixtureApproval(stage, {
        schema: 'rus.actor_base_attributes_successor_import_attestation.v1',
        request_digest: request.request_digest,
        decision: 'approve_exact_actor_base_attributes_successor_import',
        reviewed_source_digest: request.compatible_world.compatible_world_pin_manifest_digest,
        independence_basis: 'Test-only approval fixture',
        database_mutated: false,
        authority: {
          import_authorized: true, activation_authorized: false,
          production_authorized: false, existing_party_migration_authorized: false,
          old_save_rematerialization_authorized: false,
        },
      });
    }
    if (stage === 'actor_activation') {
      return fixtureApproval(stage, {
        schema: 'rus.actor_base_attributes_successor_activation_attestation.v1',
        request_digest: request.request_digest,
        decision: 'approve_exact_actor_base_attributes_new_production_activation',
        reviewed_source_digest: request.import_request.compatible_world.compatible_world_pin_manifest_digest,
        independence_basis: 'Test-only approval fixture',
        database_mutated: false,
        authority: {
          import_authorized: false, activation_authorized: true,
          production_authorized: true, existing_party_migration_authorized: false,
          old_save_rematerialization_authorized: false,
        },
      });
    }
    throw new Error(`UNEXPECTED_ATTESTATION_STAGE:${stage}`);
  };
}

/** @returns {Promise<{ container, dataRoot, worldPool, partyPool, approvals, rootDir, releaseContext }>} */
export async function bootstrapV17PresenceE2e(t, {
  postgresProfile = 'default',
  withTestWaveEnrichment = true,
} = {}) {
  assert.equal(docker(['version']).status, 0, 'Docker is required.');
  const dataRoot = await mkdtemp(join(tmpdir(), 'novgorod-presence-e2e-'));
  const container = `presence-e2e-pg-${randomUUID().slice(0, 12)}`;
  startPostgres(container, { profile: postgresProfile });
  await waitForPostgres(container);
  initializeBootstrapRoles(container);
  const adminUrl = adminDatabaseUrl(container);
  const fixtureApproval = buildFixtureApproval();
  const activationApprovalsPath = join(dataRoot, 'v17-activation-approvals.json');
  await bootstrapV17Imports({ adminUrl, activationApprovalsPath, attest: buildAttest(fixtureApproval) });
  const approvals = JSON.parse(await readFile(activationApprovalsPath, 'utf8'));
  const worldPool = new pg.Pool({ connectionString: databaseUrl(adminUrl, WORLD_DB), max: 4 });
  const partyPool = new pg.Pool({ connectionString: databaseUrl(adminUrl, PARTY_DB), max: 4 });
  t.after(async () => {
    await Promise.allSettled([worldPool.end(), partyPool.end()]);
    docker(['rm', '-fv', container]);
    await rm(dataRoot, { recursive: true, force: true });
  });
  if (withTestWaveEnrichment) {
    await enrichV17WorldForTargetStarts(worldPool);
  } else {
    const temporalCount = Number((await worldPool.query(
      'SELECT count(*)::int AS count FROM world_base.temporal_authoring_records')).rows[0].count);
    assert.ok(temporalCount > 0, 'bare v17 bootstrap must still include approved temporal-v4');
  }
  await assertBootstrapV17PartyProductionLedger(partyPool);
  const rootDir = resolve(import.meta.dirname, '../..');
  return {
    container, dataRoot, worldPool, partyPool, approvals, rootDir,
  };
}

/**
 * Movement choice from the planner's own operation data, never from text: the transition
 * (`movement_kind: 'route'`) once the actor stands at departure, otherwise the approach
 * (a local hop that carries `route_ref` of the exit it leads to), otherwise the local hop
 * whose edge was taken least often so far (so a site with several local edges is explored
 * instead of ping-ponging over the first one).
 */
function pickMovementChoice(request, localHopVisits) {
  const movementChoices = turnStepOperationChoices(request).filter(({ operation }) =>
    operation.op === 'request_movement'
    && ['local', 'route'].includes(operation.movement_kind));
  const decisive = movementChoices.find(({ operation }) => operation.movement_kind === 'route')
    ?? movementChoices.find(({ operation }) => operation.route_ref != null);
  if (decisive) return decisive;
  const visits = ({ operation }) => localHopVisits.get(operation.target_ref) ?? 0;
  const pick = movementChoices.reduce((best, choice) =>
    (best == null || visits(choice) < visits(best) ? choice : best), null);
  if (pick) localHopVisits.set(pick.operation.target_ref, visits(pick) + 1);
  return pick;
}

export function installPresenceProductionE2eFetch({
  observeText = TARGET_SMOKE_INPUT,
} = {}) {
  const MATERIALIZATION_ROLES = Object.freeze([
    'ordinary_materialization', 'spatial_semantic_descriptor',
    'npc_ordinary_semantic_remainder', 'npc_ordinary_semantic_remainder_auditor',
  ]);
  const localHopVisits = new Map();
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://target-acceptance.invalid/chat/completions');
    const call = JSON.parse(init.body);
    const modelInput = JSON.parse(call.messages.find((message) => message.role === 'user').content);
    const system = call.messages[0].content.replace(/^Return a valid json object\.\s*/u, '');
    let output;
    if (system.includes('schema must equal world_knowledge_query_plan_v1.')) {
      output = {
        schema: 'world_knowledge_query_plan_v1', query_locale: 'ru',
        domains: [], focus_refs: [], requested_predicates: [], search_hints: [],
      };
    } else if (system.startsWith('Resolve the raw Russian player text')) {
      output = { status: 'unknown', reason_code: 'unknown_intent' };
    } else if (system.startsWith('Return only one JSON object containing the semantic choice for one turn step.')) {
      const request = modelInput.request ?? modelInput;
      if (request.root_player_action === observeText) {
        output = {
          operation_choice: null, interpretation: { adaptation: 'literal' },
          resolution: 'direct', goal_result: 'achieved',
          activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
          operations: [], check: null, continuation: null, clarification: null,
          direct_result_kind: 'player_safe_observation',
          reason_code: 'review_supplied_visible_surroundings',
          reason: 'Обзор ограничен уже предоставленными видимыми сведениями.',
        };
      } else {
        const pick = pickMovementChoice(request, localHopVisits);
        assert.ok(pick, `no movement operation in planner request: ${request.root_player_action}`);
        output = {
          interpretation: {
            player_goal: request.root_player_action,
            grounded_attempt: pick.operation.description ?? request.root_player_action,
            adaptation: 'literal',
          },
          resolution: 'domain_request', goal_result: 'pending',
          activity: { owner: 'domain', duration_class: null, effort: null },
          operation_family: 'request_movement',
          operation_choice: pick.choice_id,
          check: null, continuation: null, clarification: null,
          direct_result_kind: null, reason_code: 'visible_movement',
          reason: 'Следую выбранному видимому пути.',
        };
      }
    } else if (system.startsWith('Return only {"prose"') && modelInput.required_current_beat) {
      const sources = [...modelInput.required_current_beat.changes,
        ...modelInput.required_current_beat.uncertainties];
      // A turn without required beats (arrival on a new site) still needs non-empty prose:
      // fall back to the visible scene the request itself supplies.
      const support = modelInput.optional_support;
      const fallback = [support?.visible_scene, ...(support?.sensory_details ?? [])].filter(Boolean);
      output = { prose: (sources.length > 0 ? sources.map(({ text }) => text) : fallback).join('\n\n') };
    } else if (system.startsWith('You are a strict evidence auditor of Russian game prose.')) {
      const ids = modelInput.segments.map(({ segment_id }) => segment_id);
      const sources = [...modelInput.required_current_beat.changes,
        ...modelInput.required_current_beat.uncertainties];
      output = {
        reviewed_segments: ids,
        source_reviews: sources.map(({ ref }) => ({ ref, segment_choices: ids })),
        unsupported: [], literary_failures: [],
        evidence: ['Deterministic test source-copy.'],
      };
    } else if (system.startsWith('Return only {"prose"')) {
      const facts = modelInput.visible_context_package.visible_scene_dossier.must_include
        .map((entry) => entry.text);
      const split = Math.ceil(facts.length / 2);
      output = {
        prose: [facts.slice(0, split).join(' '), facts.slice(split).join(' ')]
          .filter(Boolean).join('\n\n'),
      };
    } else if (system.startsWith('Return only {"pass"')) {
      output = {
        pass: true, failed_checks: [], concerns: [],
        evidence: ['Test response uses the supplied committed visible facts.'],
      };
    } else if (MATERIALIZATION_ROLES.some((role) => system.includes(role))) {
      throw new Error(`unexpected materialization LLM role in presence e2e: ${system.slice(0, 120)}`);
    } else {
      throw new Error(`presence production e2e: unconfigured LLM role: ${system.slice(0, 160)}`);
    }
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(output) } }],
    }), { status: 200 });
  };
  return () => { globalThis.fetch = previousFetch; };
}

export async function createPresenceProductionRoot({
  worldPool, partyPool, approvals, rootDir,
}) {
  const pinDigest = approvals.itemApproval.request.compatible_world_pin_manifest_digest;
  const rootOptions = {
    env: {
      DEEPSEEK_API_KEY: 'isolated-fixture-key',
      DEEPSEEK_BASE_URL: 'https://target-acceptance.invalid',
    },
    config: {
      spatialV3BindingsModule: 'builtin:spatial-v3-production-v17',
      rootDir,
      runtimeCatalogPinManifestDigest: pinDigest,
      targetCatalogActivationApprovals: {
        itemApproval: approvals.itemApproval,
        actorApproval: approvals.actorApproval,
      },
      traceTurnDecisionSecret: 'isolated-presence-e2e-secret',
    },
    pools: {
      worldPool: {
        query: worldPool.query.bind(worldPool),
        async connect() {
          const client = await worldPool.connect();
          return {
            query: client.query.bind(client),
            release() { client.release(true); },
          };
        },
      },
      partyPool,
      async close() {},
    },
    worldKnowledgeEncoderFactory: () => ({
      async ready() {},
      async encode() { return new Float32Array(1024); },
      async close() {},
    }),
  };
  const runtime = await createSpatialV3ProductionCompositionRoot(rootOptions);
  return { runtime, rootOptions };
}

/**
 * Walking subtests need visible movement options at the start; dense fog (weather visibility
 * `poor`) leaves the planner none (open problem D47.9, task rt-walk). Start seed is fixed by the
 * request id in publicStartScenario, so a foggy start is a fixture problem: change the request id.
 */
export async function assertStartVisibilityAllowsMovement(partyPool, partyId) {
  const state = await createLowerDvinaTracePhase1ARepository({
    query: partyPool.query.bind(partyPool) }).loadInternal(partyId);
  const weather = state?.environment_snapshot?.weather_state;
  assert.ok(weather?.visibility, `start weather of ${partyId} is unreadable`);
  assert.notEqual(weather.visibility, 'poor',
    `start weather ${weather.weather_state_id} (visibility poor) offers no movement operation; `
    + 'pick another start request id for this walking subtest');
}

export function routeMovementLabels(screen) {
  const route = screen?.panels?.route;
  if (!route?.visible) return [];
  const options = route.data?.movement?.options ?? route.choices ?? route.options ?? [];
  return options
    .filter((entry) => entry.knowledge_state === 'known' || entry.knowledge_state == null)
    .map((entry) => entry.label ?? entry.text ?? entry.description)
    .filter(Boolean);
}

export const PRESENCE_E2E_MOVE_TEXT = 'Иду по видимому пути.';

export async function publicStartScenario(runtime, scenarioId) {
  const opening = await runtime.startNewGame({
    scenario_id: scenarioId,
    request_id: `presence-e2e-start-${scenarioId}`,
  });
  assert.equal(opening.screen.schema, 'first_game_screen');
  await runtime.acknowledgeOpening(opening.party_id, {
    client_ack_id: `presence-e2e-ack-${scenarioId}`,
  });
  return opening.party_id;
}

export async function submitObserveTurn(runtime, partyId, observeText) {
  await runtime.submitTurn(partyId, {
    raw_text: observeText,
    request_id: `presence-e2e-observe-${partyId}`,
  });
}

export async function walkRouteUntil({
  runtime, partyPool, partyId, observeText, maxSteps = 24,
  sitePredicate,
}) {
  for (let step = 0; step < maxSteps; step += 1) {
    if (await sitePredicate({ partyPool, partyId })) return step;
    let screen = (await runtime.getPartyScreen(partyId)).screen;
    let labels = routeMovementLabels(screen);
    if (labels.length === 0 && step === 0) {
      await submitObserveTurn(runtime, partyId, observeText);
    }
    await runtime.submitTurn(partyId, {
      raw_text: PRESENCE_E2E_MOVE_TEXT,
      request_id: `presence-e2e-move-${partyId}-${step}`,
    });
  }
  assert.fail(`site predicate not met within ${maxSteps} movement steps`);
}
