import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { createSeededRandomSource } from '@rus/checks-rng';
import {
  createFirstPlayablePublicRuntime
} from '../../apps/game-server/src/runtime/first-playable-public-runtime.js';
import {
  createLowerDvinaTracePhase2Runtime
} from '../../apps/game-server/src/runtime/lower-dvina-trace-phase-2.js';
import {
  createLowerDvinaTracePhase1BProductionAdapter
} from '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-1b.js';
import {
  createLowerDvinaTracePhase2PostgresRepository
} from '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2.js';
import {
  createLowerDvinaTracePhase2DurableNarrator
} from '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2-presentation.js';
import {
  createSpatialV3PostgresCombinedAtomicCommitter
} from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import {
  firstPlayableCommitRecheck
} from '../../apps/game-server/src/infrastructure/postgres/first-playable/recheck.js';
import {
  loadLowerDvinaTraceMaterializationBundle
} from '../../apps/game-server/src/internal/lower-dvina-trace-phase-1a.js';
import {
  lowerDvinaTracePhase1ADomainPin
} from '../fixtures/lower-dvina-trace-phase-1a-domain-pin.mjs';
import {
  runPartyRuntimeCatalogMigration
} from '../../tools/runtime-catalog-activation/src/forward-migrations.js';

const docker = (args) => spawnSync(
  'docker', args, { encoding: 'utf8', timeout: 45_000 }
);
const world = Object.freeze({
  revision: 'novgorod_spatial_v3_production_v3_candidate_001',
  digest:
    '1cf914ed9a19801f94b8b1463a717dbb0be7f1d51ea2351e6d1d5a51c492215e'
});

test('Phase 3 movement and Eremey conversations commit atomically and survive restart', async (t) => {
  if (docker(['version']).status !== 0) {
    t.skip('Docker is required for isolated Phase 3 PostgreSQL integration');
    return;
  }
  const name = `lower-dvina-phase-3-${process.pid}`;
  let pool;
  t.after(async () => {
    if (pool) await pool.end();
    docker(['rm', '-f', name]);
  });
  const started = docker([
    'run', '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=local_only',
    '-e', 'POSTGRES_USER=phase3',
    '-e', 'POSTGRES_DB=phase3',
    'postgres:16-alpine'
  ]);
  assert.equal(started.status, 0, started.stderr);
  await waitForPostgres(name);
  await new Promise((resolve) => setTimeout(resolve, 700));
  const port = Number(
    docker(['port', name, '5432']).stdout.match(/:(\d+)\s*$/u)?.[1]
  );
  pool = new pg.Pool({
    host: '127.0.0.1',
    port,
    user: 'phase3',
    password: 'local_only',
    database: 'phase3',
    max: 8
  });
  await installSchemas(pool);
  await installWorldLineage(pool);
  const bundle = await loadLowerDvinaTraceMaterializationBundle({
    scenarioDefinitionRevision: 9
  });
  const sourcePin = lowerDvinaTracePhase1ADomainPin(bundle);
  const runtimeCatalogPin = Object.freeze({
    ...sourcePin,
    compatible_world_revision_id: world.revision,
    compatible_world_catalog_digest: world.digest,
    compatible_world_pin_manifest_digest:
      '593ccb341084f7433ec4ae9d7d0b2ea8b1dea07833636ef385550ba5a295ecea'
  });
  const release = Object.freeze({
    release_id: 'phase-3-postgres-release',
    world_revision_id: world.revision,
    world_catalog_digest: world.digest,
    compatible_world_pin_manifest_digest:
      runtimeCatalogPin.compatible_world_pin_manifest_digest
  });

  const pathA = buildRuntime({
    pool, release, runtimeCatalogPin
  });
  const partyA = await createParty(pathA, 'phase-3-path-a');
  const movedA = await pathA.submitTurn(partyA.party_id, {
    request_id: 'phase-3-a-move',
    idempotency_key: 'phase-3-a-move',
    raw_text: 'Пройти по тропе к рыбацкому стану.'
  });
  assert.equal(movedA.option_id, 'follow_path_to_fishing_camp');
  assert.equal(movedA.movement.result.elapsed_minutes, 8);
  assert.equal(movedA.check, null);
  assert.equal(await count(pool,
    'party_runtime.party_route_plans', partyA.party_id), 1);
  assert.equal(await count(pool,
    'party_runtime.party_route_plan_executions', partyA.party_id), 1);
  assert.equal(await count(pool,
    'party_runtime.traveller_travel_states', partyA.party_id), 1);
  assert.equal(await traversalIntervalCount(pool, partyA.party_id), 1);
  assert.equal(await traversalLifecycleCount(pool, partyA.party_id), 3);
  const firstTalk = await pathA.submitTurn(partyA.party_id, {
    request_id: 'phase-3-a-talk',
    idempotency_key: 'phase-3-a-talk',
    raw_text: 'Поговорить с Еремеем о крушении.'
  });
  assert.equal(firstTalk.conversation.decision.trace.option_id,
    'evade_and_withhold');
  assert.equal(firstTalk.time_update.exact_elapsed.exact_minutes.numerator,
    '5');
  assert.equal(await count(pool,
    'party_runtime.party_actor_npc_interactions', partyA.party_id), 1);
  assert.equal(await summariesFor(pool, partyA.party_id), 2);
  assert.equal(await count(pool,
    'party_runtime.party_npc_decision_traces', partyA.party_id), 1);
  assert.equal(await knowledgeCount(pool, partyA.party_id,
    'trace_ld_v1_route_camp_to_shed'), 0);

  const restartedA = buildRuntime({ pool, release, runtimeCatalogPin });
  const restoredA = await restartedA.getPartyScreen(partyA.party_id);
  assert.deepEqual(restoredA.screen, firstTalk.screen);
  const replayA = await restartedA.submitTurn(partyA.party_id, {
    request_id: 'phase-3-a-talk',
    idempotency_key: 'phase-3-a-talk',
    raw_text: 'Поговорить с Еремеем о крушении.'
  });
  assert.deepEqual(replayA, firstTalk);
  assert.equal(await count(pool,
    'party_runtime.party_actor_npc_interactions', partyA.party_id), 1);
  const repeatedTalk = await restartedA.submitTurn(partyA.party_id, {
    request_id: 'phase-3-a-talk-repeat',
    idempotency_key: 'phase-3-a-talk-repeat',
    raw_text: 'Ещё раз спросить Еремея о крушении.'
  });
  assert.equal(repeatedTalk.conversation.statement_is_new, false);
  assert.equal(await count(pool,
    'party_runtime.party_actor_npc_interactions', partyA.party_id), 2);
  assert.equal(await summariesFor(pool, partyA.party_id), 2);

  const pathB = buildRuntime({
    pool, release, runtimeCatalogPin,
    rollForRequest: () => 0.99
  });
  const partyB = await createParty(pathB, 'phase-3-path-b');
  const inspectedB = await inspectAndMove(pathB, partyB.party_id, 'b');
  const ownership = await blueWoolOwnership(pool, partyB.party_id);
  assert.deepEqual(ownership.owner_external_ref, {
    entity_kind: 'participant_slot',
    entity_id: 'ratsha_storehouse_helper'
  });
  assert.equal(ownership.controller_character_id,
    inspectedB.clue.placement.holder_character_id);
  assert.equal(ownership.claim_state, 'owner_preserved_evidence_held');
  const positionBefore = await positionFor(pool, partyB.party_id);
  const disclosureInput = {
    request_id: 'phase-3-b-disclosure',
    idempotency_key: 'phase-3-b-disclosure',
    raw_text: 'Показать Еремею синюю шерсть.'
  };
  const disclosed = await pathB.submitTurn(partyB.party_id, disclosureInput);
  assert.equal(disclosed.check.outcome.success, true);
  assert.equal(disclosed.conversation.decision.trace.option_id,
    'bounded_disclosure');
  assert.equal(disclosed.conversation.statement_ref,
    'trace_ld_v1_statement_eremey_disclosure');
  assert.equal(disclosed.time_update.exact_elapsed.exact_minutes.numerator,
    '10');
  assert.deepEqual(await positionFor(pool, partyB.party_id), positionBefore);
  assert.equal(await knowledgeCount(pool, partyB.party_id,
    'trace_ld_v1_route_camp_to_shed'), 1);
  assert.equal(await knowledgeCount(pool, partyB.party_id,
    'trace_ld_v1_statement_eremey_disclosure'), 1);
  assert.equal(await count(pool,
    'party_runtime.party_actor_npc_interactions', partyB.party_id), 1);
  await assert.rejects(
    () => pathB.submitTurn(partyB.party_id, {
      request_id: 'phase-3-b-post-disclosure-talk',
      idempotency_key: 'phase-3-b-post-disclosure-talk',
      raw_text: 'Снова спросить Еремея о крушении.'
    }),
    { code: 'TURN_SEMANTIC_OPTION_INVALID' }
  );
  assert.equal(await summariesFor(pool, partyB.party_id), 2);
  assert.equal(await count(pool,
    'party_runtime.party_check_resolutions', partyB.party_id), 2);

  const restartedB = buildRuntime({
    pool, release, runtimeCatalogPin,
    rollForRequest: () => {
      throw new Error('replay must not draw RNG');
    }
  });
  assert.deepEqual(
    await restartedB.submitTurn(partyB.party_id, disclosureInput),
    disclosed
  );
  assert.equal(await count(pool,
    'party_runtime.party_actor_npc_interactions', partyB.party_id), 1);
  await pool.query(
    `UPDATE party_runtime.party_ownership o
        SET owner_external_ref=$2::jsonb
       FROM party_runtime.party_items i
      WHERE i.party_id=o.party_id AND i.item_id=o.item_id
        AND o.party_id=$1
        AND i.template_id='trace_ld_v1_item_blue_wool_fragment'`,
    [partyB.party_id, JSON.stringify({
      entity_kind: 'participant_slot',
      entity_id: 'eremey_fisher'
    })]
  );
  await assert.rejects(
    () => restartedB.getPartyScreen(partyB.party_id),
    { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' }
  );
  await pool.query(
    `UPDATE party_runtime.party_ownership o
        SET owner_external_ref=$2::jsonb
       FROM party_runtime.party_items i
      WHERE i.party_id=o.party_id AND i.item_id=o.item_id
        AND o.party_id=$1
        AND i.template_id='trace_ld_v1_item_blue_wool_fragment'`,
    [partyB.party_id, JSON.stringify({
      entity_kind: 'participant_slot',
      entity_id: 'ratsha_storehouse_helper'
    })]
  );
  const tamperClient = await pool.connect();
  try {
    await tamperClient.query(
      `ALTER TABLE party_runtime.party_check_resolutions
         DISABLE TRIGGER USER`
    );
    await tamperClient.query(
      `UPDATE party_runtime.party_check_resolutions
          SET roll_value=roll_value+1
        WHERE party_id=$1
          AND check_scope_key->>'option_id'=
            'show_clue_and_seek_eremey_cooperation'`,
      [partyB.party_id]
    );
  } finally {
    await tamperClient.query(
      `ALTER TABLE party_runtime.party_check_resolutions
         ENABLE TRIGGER USER`
    );
    tamperClient.release();
  }
  await assert.rejects(
    () => restartedB.getPartyScreen(partyB.party_id),
    { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' }
  );

  const pathC = buildRuntime({
    pool, release, runtimeCatalogPin,
    rollForRequest: (requestId) =>
      requestId === 'phase-3-c-evidence' ? 0 : 0.99
  });
  const partyC = await createParty(pathC, 'phase-3-path-c');
  await inspectAndMove(pathC, partyC.party_id, 'c');
  const guarded = await pathC.submitTurn(partyC.party_id, {
    request_id: 'phase-3-c-evidence',
    idempotency_key: 'phase-3-c-evidence',
    raw_text: 'Показать улику Еремею и попросить помочь.'
  });
  assert.equal(guarded.check.outcome.success, false);
  assert.equal(guarded.conversation.decision.trace.option_id,
    'evade_and_withhold');
  assert.equal(guarded.conversation.route_knowledge_ref, null);
  assert.equal(await knowledgeCount(pool, partyC.party_id,
    'trace_ld_v1_route_camp_to_shed'), 0);
  assert.equal(
    JSON.stringify(guarded.screen).includes('must-not-reach-llm'),
    false
  );
});

async function createParty(runtime, requestId) {
  const party = await runtime.startNewGame({
    scenario_id: 'lower_dvina_trace_v1',
    request_id: requestId
  });
  await runtime.acknowledgeOpening(party.party_id, {
    client_ack_id: `${requestId}-ack`
  });
  return party;
}

async function inspectAndMove(runtime, partyId, suffix) {
  const inspected = await runtime.submitTurn(partyId, {
    request_id: `phase-3-${suffix}-inspection`,
    idempotency_key: `phase-3-${suffix}-inspection`,
    raw_text: 'Осмотреть место крушения подробно.'
  });
  assert.equal(inspected.check.outcome.success, true);
  assert.equal(inspected.clue.placement.physical_position, 'hands');
  await runtime.submitTurn(partyId, {
    request_id: `phase-3-${suffix}-move`,
    idempotency_key: `phase-3-${suffix}-move`,
    raw_text: 'Дойти до рыбацкого стана.'
  });
  return inspected;
}

function buildRuntime({
  pool,
  release,
  runtimeCatalogPin,
  rollForRequest = () => 0.99
}) {
  const committer = createSpatialV3PostgresCombinedAtomicCommitter({
    pool,
    recheck: firstPlayableCommitRecheck,
    now: () => new Date('2026-07-30T08:00:00.000Z')
  });
  const repository = createLowerDvinaTracePhase2PostgresRepository({
    partyPool: pool,
    committer
  });
  const traceTurnRuntime = createLowerDvinaTracePhase2Runtime({
    repository,
    semanticResolver: async (request) => ({
      option_id: semanticOption(request.raw_text, request.action_set)
    }),
    narrator: createLowerDvinaTracePhase2DurableNarrator({
      partyPool: pool,
      narrationService: {
        async run(request) {
          assert.equal(JSON.stringify(request).includes('must-not-reach-llm'),
            false);
          return approvedNarration(request.request_id);
        }
      }
    }),
    randomSourceFactory: ({ request_id: requestId }) => {
      const source = createSeededRandomSource(`phase-3:${requestId}`);
      let counter = 0;
      return {
        next() {
          counter += 1;
          return rollForRequest(requestId);
        },
        snapshot: () => ({
          ...source.snapshot(),
          counter
        })
      };
    },
    decisionSecret: 'phase-3-postgres-secret',
    now: () => '2026-07-30T08:00:00.000Z'
  });
  return createFirstPlayablePublicRuntime({
    partyPool: pool,
    committer,
    release,
    runtimeCatalogPin,
    traceStartAdapter:
      createLowerDvinaTracePhase1BProductionAdapter({
        partyPool: pool,
        worldPool: pool,
        release,
        runtimeCatalogPin
      }),
    traceTurnRuntime
  });
}

function semanticOption(rawText, actionSet) {
  const normalized = rawText.toLowerCase();
  const selected = normalized.includes('осмотр')
    ? 'inspect_wreck_in_detail'
    : normalized.includes('показ')
      ? 'show_clue_and_seek_eremey_cooperation'
      : normalized.includes('стан')
        ? 'follow_path_to_fishing_camp'
        : 'ask_eremey_about_wreck';
  const available = actionSet.some(({ option_id: id }) => id === selected);
  assert.equal(available, !normalized.includes('снова'));
  return selected;
}

function approvedNarration(requestId) {
  return {
    version: 1,
    schema: 'narration_flow_result',
    request_id: requestId,
    surface: 'turn',
    status: 'approved',
    pass: true,
    approved_output: {
      version: 1,
      schema: 'narration_output',
      output_id: `narration:${requestId}`,
      prose: 'Сохранённое видимое состояние описано без новых фактов.',
      action_options: [],
      used_references: [],
      self_check: { no_new_world_facts: true }
    },
    final_audit: {
      version: 1,
      schema: 'narration_audit',
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
  for (const file of partyFiles.filter((value) =>
    !value.startsWith('012_') && !value.startsWith('013_'))) {
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
  assert.equal(
    (await runPartyRuntimeCatalogMigration(pool)).status,
    'applied'
  );
  await pool.query(await readFile(
    'schemas/party-db/012_party_runtime_external_ownership.sql',
    'utf8'
  ));
  await pool.query(await readFile(
    'schemas/party-db/013_party_runtime_obligations.sql',
    'utf8'
  ));
}

async function installWorldLineage(pool) {
  await pool.query('CREATE SCHEMA IF NOT EXISTS world_base');
  await pool.query(`
    CREATE TABLE world_base.spatial_v3_world_revisions (
      id text PRIMARY KEY,
      parent_revision_id text
        REFERENCES world_base.spatial_v3_world_revisions(id),
      catalog_digest text NOT NULL,
      status text NOT NULL
    )`);
  await pool.query(
    `INSERT INTO world_base.spatial_v3_world_revisions
       (id,parent_revision_id,catalog_digest,status)
     VALUES
       ('novgorod_spatial_v3_target_contract_approval_001',NULL,
        '0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e','approved'),
       ('novgorod_spatial_v3_production_v2_candidate_001',
        'novgorod_spatial_v3_target_contract_approval_001',
        'fd75d9cb1ad0e949ff3b0bb5ef044e510f340a967f43867e9c4d41c16ba9f255','approved'),
       ('novgorod_spatial_v3_production_v3_candidate_001',
        'novgorod_spatial_v3_production_v2_candidate_001',
        '1cf914ed9a19801f94b8b1463a717dbb0be7f1d51ea2351e6d1d5a51c492215e','approved')`
  );
}

async function count(pool, table, partyId) {
  return (await pool.query(
    `SELECT count(*)::int AS count FROM ${table} WHERE party_id=$1`,
    [partyId]
  )).rows[0].count;
}

async function summariesFor(pool, partyId) {
  return (await pool.query(
    `SELECT count(*)::int AS count
       FROM party_runtime.party_actor_npc_interaction_summaries s
       JOIN party_runtime.party_actor_npc_interactions i
         ON i.interaction_id=s.interaction_id
      WHERE i.party_id=$1`,
    [partyId]
  )).rows[0].count;
}

async function knowledgeCount(pool, partyId, factId) {
  return (await pool.query(
    `SELECT count(*)::int AS count
       FROM party_runtime.party_character_knowledge
      WHERE party_id=$1 AND fact_id=$2`,
    [partyId, factId]
  )).rows[0].count;
}

async function positionFor(pool, partyId) {
  return (await pool.query(
    `SELECT g4_id,g5_node_id,g5_anchor_id
       FROM party_runtime.party_positions WHERE party_id=$1`,
    [partyId]
  )).rows[0];
}

async function traversalIntervalCount(pool, partyId) {
  return (await pool.query(
    `SELECT count(*)::int AS count
       FROM party_runtime.party_traversal_interval_results r
       JOIN party_runtime.party_route_plan_executions e
         ON e.id=r.route_plan_execution_id
      WHERE e.party_id=$1`,
    [partyId]
  )).rows[0].count;
}

async function traversalLifecycleCount(pool, partyId) {
  return (await pool.query(
    `SELECT count(*)::int AS count
       FROM party_runtime.party_route_plan_execution_events v
       JOIN party_runtime.party_route_plan_executions e
         ON e.id=v.execution_id
      WHERE e.party_id=$1`,
    [partyId]
  )).rows[0].count;
}

async function blueWoolOwnership(pool, partyId) {
  return (await pool.query(
    `SELECT o.owner_external_ref,o.controller_character_id,o.claim_state
       FROM party_runtime.party_ownership o
       JOIN party_runtime.party_items i
         ON i.party_id=o.party_id AND i.item_id=o.item_id
      WHERE o.party_id=$1
        AND i.template_id='trace_ld_v1_item_blue_wool_fragment'`,
    [partyId]
  )).rows[0];
}

async function waitForPostgres(name) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (docker(['exec', name, 'pg_isready']).status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('PostgreSQL did not become ready');
}
