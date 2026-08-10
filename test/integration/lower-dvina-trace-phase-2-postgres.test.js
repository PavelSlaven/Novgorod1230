import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { canonicalDigest } from '@rus/materialization';
import { createSeededRandomSource } from '@rus/checks-rng';
import {
  createFirstPlayablePublicRuntime
} from '../../apps/game-server/src/runtime/first-playable-public-runtime.js';
import {
  createLowerDvinaTracePhase2Runtime
} from '../../apps/game-server/src/runtime/lower-dvina-trace-phase-2.js';
import {
  createM2ConversationModels
} from '../../apps/game-server/test/lower-dvina-trace-m2-conversation-fixture.js';
import {
  createLowerDvinaTraceTurnStepTestModel
} from '../../apps/game-server/test/lower-dvina-trace-turn-step-model-fixture.js';
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

test('Phase 2 free-text inspection commits atomically, restarts and rejects tamper', async (t) => {
  if (docker(['version']).status !== 0) {
    t.skip('Docker is required for isolated Phase 2 PostgreSQL integration');
    return;
  }
  const name = `lower-dvina-phase-2-${process.pid}`;
  let pool;
  t.after(async () => {
    if (pool) await pool.end();
    docker(['rm', '-f', name]);
  });
  const started = docker([
    'run', '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=local_only',
    '-e', 'POSTGRES_USER=phase2',
    '-e', 'POSTGRES_DB=phase2',
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
    user: 'phase2',
    password: 'local_only',
    database: 'phase2',
    max: 8
  });
  await installSchemas(pool);
  await installWorldLineage(pool);
  const bundle = await loadLowerDvinaTraceMaterializationBundle();
  const sourcePin = lowerDvinaTracePhase1ADomainPin(bundle);
  const runtimeCatalogPin = Object.freeze({
    ...sourcePin,
    compatible_world_revision_id: world.revision,
    compatible_world_catalog_digest: world.digest,
    compatible_world_pin_manifest_digest:
      '593ccb341084f7433ec4ae9d7d0b2ea8b1dea07833636ef385550ba5a295ecea'
  });
  const release = Object.freeze({
    release_id: 'phase-2-postgres-release',
    world_revision_id: world.revision,
    world_catalog_digest: world.digest,
    compatible_world_pin_manifest_digest:
      runtimeCatalogPin.compatible_world_pin_manifest_digest
  });
  const runtimeFactory = () => buildRuntime({
    pool, release, runtimeCatalogPin
  });
  const first = runtimeFactory();
  const opened = await first.startNewGame({
    scenario_id: 'lower_dvina_trace_v1',
    request_id: 'phase-2-postgres-party'
  });
  await first.acknowledgeOpening(opened.party_id, {
    client_ack_id: 'phase-2-ack'
  });
  await pool.query(
    `INSERT INTO party_runtime.party_temporal_events(
       event_id,party_id,event_kind,status,
       scheduled_at_whole_minutes,
       scheduled_at_subminute_numerator,
       scheduled_at_subminute_denominator,
       rule_ref,policy_ref,preconditions_digest,
       idempotency_key,change_set_id
     ) VALUES($1,$2,'phase_2_test_boundary','pending',
       333070,0,1,$3::jsonb,$4::jsonb,$5,$6,$7)`,
    [
      'event:phase-2-pending',
      opened.party_id,
      JSON.stringify({ id: 'test-rule', version: 1 }),
      JSON.stringify({ id: 'test-policy', version: 1 }),
      'a'.repeat(64),
      'phase-2-pending',
      'phase-2-test-change'
    ]
  );
  await assert.rejects(
    () => first.submitTurn(opened.party_id, {
      request_id: 'phase-2-blocked-by-pending-event',
      idempotency_key: 'phase-2-blocked-by-pending-event',
      raw_text:
        'Осмотреть лодку, верёвку и следы. Понять, что здесь случилось.'
    }),
    { code: 'TRACE_PHASE_2_TEMPORAL_BINDING_GAP' }
  );
  assert.equal(await count(pool, 'party_runtime.party_check_resolutions',
    opened.party_id), 0);
  await pool.query(
    `DELETE FROM party_runtime.party_temporal_events
      WHERE event_id=$1 AND party_id=$2`,
    ['event:phase-2-pending', opened.party_id]
  );
  const turnInput = {
    request_id: 'phase-2-inspection',
    idempotency_key: 'phase-2-inspection',
    raw_text:
      'Хочу внимательно изучить повреждения судна и всё, что осталось на берегу.'
  };
  const result = await first.submitTurn(opened.party_id, turnInput);
  assert.equal(result.option_id, 'inspect_wreck_in_detail');
  assert.equal(result.turn_number, 1);
  assert.equal(result.state_version, 1);
  assert.equal(result.check.difficulty, 12);
  assert.equal(result.check.outcome.success, true);
  assert.equal(result.time_update.clock_after.whole_minutes, '333075');
  assert.equal(result.clue.template_id,
    'trace_ld_v1_item_blue_wool_fragment');
  assert.deepEqual(result.clue.placement, {
    holder_character_id: result.clue.property_state.holder_ref,
    physical_position: 'hands'
  });
  const persistedCluePlacement = (await pool.query(
    `SELECT p.anchor_id,p.holder_character_id,p.physical_position,
            i.state,i.profile_id,i.quantity,i.legal_status
       FROM party_runtime.party_items i
       JOIN party_runtime.party_item_placements p
         ON p.party_id=i.party_id AND p.item_id=i.item_id
      WHERE i.party_id=$1 AND i.template_id=$2`,
    [opened.party_id, 'trace_ld_v1_item_blue_wool_fragment']
  )).rows[0];
  assert.equal(persistedCluePlacement.anchor_id, null);
  assert.equal(persistedCluePlacement.holder_character_id,
    result.clue.property_state.holder_ref);
  assert.equal(persistedCluePlacement.physical_position, 'hands');
  assert.equal(persistedCluePlacement.profile_id, result.clue.profile_id);
  assert.equal(persistedCluePlacement.quantity, 1);
  assert.equal(persistedCluePlacement.legal_status,
    'owner_preserved_evidence_held');
  assert.deepEqual(persistedCluePlacement.state.property_state,
    result.clue.property_state);
  assert.deepEqual(persistedCluePlacement.state.inventory_profile_snapshot,
    result.clue.inventory_profile);
  assert.equal(
    persistedCluePlacement.state.pickup_transition.source_placement_ref,
    'trace_ld_v1_slot_wreck_willow_branch'
  );
  assert.deepEqual(
    persistedCluePlacement.state.pickup_transition.inventory_before,
    { total_mass_grams: 400, hands_used: 0, hands_free: 2,
      load_category: 'light' }
  );
  assert.deepEqual(
    persistedCluePlacement.state.pickup_transition.inventory_after,
    { total_mass_grams: 410, hands_used: 0, hands_free: 2,
      load_category: 'light' }
  );
  const persistedOwnership = (await pool.query(
    `SELECT o.owner_external_ref,o.controller_character_id,o.claim_state
       FROM party_runtime.party_ownership o
       JOIN party_runtime.party_items i
         ON i.party_id=o.party_id AND i.item_id=o.item_id
      WHERE o.party_id=$1 AND i.template_id=$2`,
    [opened.party_id, 'trace_ld_v1_item_blue_wool_fragment']
  )).rows[0];
  assert.deepEqual(persistedOwnership.owner_external_ref, {
    entity_kind: 'participant_slot',
    entity_id: 'ratsha_storehouse_helper'
  });
  assert.equal(persistedOwnership.controller_character_id,
    result.clue.property_state.controller_ref);
  assert.equal(persistedOwnership.claim_state,
    'owner_preserved_evidence_held');
  assert.equal(await count(pool, 'party_runtime.party_check_resolutions',
    opened.party_id), 1);
  assert.deepEqual((await pool.query(
    `SELECT template_id
       FROM party_runtime.party_items
      WHERE party_id=$1
      ORDER BY template_id`,
    [opened.party_id]
  )).rows.map(({ template_id: id }) => id), [
    'trace_ld_v1_item_bandage_cloth',
    'trace_ld_v1_item_blue_wool_fragment',
    'trace_ld_v1_item_mikula_knife',
    'trace_ld_v1_item_ratsha_knife',
    'trace_ld_v1_item_zhdanko_axe'
  ]);
  assert.equal((await pool.query(
    `SELECT count(*)::int AS count
       FROM party_runtime.party_narration_attempts attempts
       JOIN party_runtime.party_narration_jobs jobs
         ON jobs.job_id=attempts.job_id
      WHERE jobs.party_id=$1`,
    [opened.party_id]
  )).rows[0].count, 1);
  const firstSnapshot = (await pool.query(
    `SELECT state_payload
       FROM party_runtime.party_state_snapshots
      WHERE party_id=$1 AND state_version=1`,
    [opened.party_id]
  )).rows[0].state_payload;
  assert.equal('relevant_hidden_state' in firstSnapshot, false);
  assert.equal(
    containsObjectKey(firstSnapshot, 'hidden_truth'),
    false
  );
  assert.equal(
    result.time_update.boundary_trace.owner,
    '@rus/time-events-history/temporal-boundaries'
  );

  const restarted = runtimeFactory();
  const restored = await restarted.getPartyScreen(opened.party_id);
  assert.deepEqual(restored.screen, result.screen);
  const replay = await restarted.submitTurn(opened.party_id, turnInput);
  assert.deepEqual(replay, result);
  assert.equal(await count(pool, 'party_runtime.party_check_resolutions',
    opened.party_id), 1);
  assert.equal(await count(pool, 'party_runtime.party_items',
    opened.party_id), 5);

  await assertResealedSnapshotTamper(pool, restarted, opened.party_id,
    (snapshot) => {
      snapshot.last_turn.action_set_digest = 'f'.repeat(64);
    });
  await assertResealedSnapshotTamper(pool, restarted, opened.party_id,
    (snapshot) => {
      snapshot.last_turn.option_id = 'invented_option';
    });
  await assertResealedSnapshotTamper(pool, restarted, opened.party_id,
    (snapshot) => {
      snapshot.last_turn.check_result.audit.counter = 99;
    });
  await assertResealedSnapshotTamper(pool, restarted, opened.party_id,
    (snapshot) => {
      snapshot.clock.whole_minutes = '333076';
    });
  await assertResealedSnapshotTamper(pool, restarted, opened.party_id,
    (snapshot) => {
      snapshot.last_turn.consequence.evidence_relations = [];
    });
  await assertResealedSnapshotTamper(pool, restarted, opened.party_id,
    (snapshot) => {
      snapshot.items.find((item) =>
        item.template_id === 'trace_ld_v1_item_blue_wool_fragment')
        .placement.holder_character_id = 'tampered-holder';
    });
  await assertBlueWoolOwnershipTamper(pool, restarted, opened.party_id);
  await assertScreenTamper(pool, restarted, opened.party_id);

  const repeated = await restarted.submitTurn(opened.party_id, {
    request_id: 'phase-2-inspection-repeat',
    idempotency_key: 'phase-2-inspection-repeat',
    raw_text:
      'Осмотреть лодку, верёвку и следы. Понять, что здесь случилось.'
  });
  assert.equal(repeated.clue, null);
  assert.equal(repeated.time_update.clock_after.whole_minutes, '333090');
  assert.equal(repeated.body_update.state_after.energy, 38);
  assert.equal(
    repeated.body_update.proposal.execution_variant_id,
    'repeated_mild_shivering'
  );
  assert.deepEqual(
    repeated.body_update.proposal.condition_transitions.find(
      (transition) =>
        transition.condition_profile_ref
          === 'trace_ld_v1_condition_cold_shivering'
    ),
    {
      condition_profile_ref: 'trace_ld_v1_condition_cold_shivering',
      from: 'mild_shivering',
      to: 'mild_shivering',
      outcome: 'persists'
    }
  );
  assert.equal(await count(pool, 'party_runtime.party_check_resolutions',
    opened.party_id), 2);
  assert.equal(await count(pool, 'party_runtime.party_body_temporal_history',
    opened.party_id), 2);
  assert.equal(await count(pool, 'party_runtime.party_items',
    opened.party_id), 5);
  const attempts = (await pool.query(
    `SELECT effect_ref->>'activity_attempt_id' AS activity_attempt_id
       FROM party_runtime.party_body_temporal_history
      WHERE party_id=$1 ORDER BY history_id`,
    [opened.party_id]
  )).rows.map(({ activity_attempt_id: id }) => id);
  assert.equal(new Set(attempts).size, 2);
  const historicalReplay = await restarted.submitTurn(
    opened.party_id,
    turnInput
  );
  assert.deepEqual(historicalReplay, result);
  assert.equal(await count(pool, 'party_runtime.party_check_resolutions',
    opened.party_id), 2);
  assert.equal(await count(pool, 'party_runtime.party_items',
    opened.party_id), 5);

  let failureRolls = 0;
  const failureRuntime = buildRuntime({
    pool,
    release,
    runtimeCatalogPin,
    randomValue: 0,
    randomDrawObserver() {
      failureRolls += 1;
    }
  });
  const failureParty = await failureRuntime.startNewGame({
    scenario_id: 'lower_dvina_trace_v1',
    request_id: 'phase-2-failure-party'
  });
  await failureRuntime.acknowledgeOpening(failureParty.party_id, {
    client_ack_id: 'phase-2-failure-ack'
  });
  const failureInput = {
    request_id: 'phase-2-failure-turn',
    idempotency_key: 'phase-2-failure-turn',
    raw_text:
      'Осмотреть лодку, верёвку и следы. Понять, что здесь случилось.'
  };
  const failure = await failureRuntime.submitTurn(
    failureParty.party_id,
    failureInput
  );
  assert.equal(failure.check.roll, 1);
  assert.equal(failure.check.outcome.success, false);
  assert.equal(failure.time_update.clock_after.whole_minutes, '333075');
  assert.deepEqual(failure.body_update.proposal.exact_deltas, {
    health: 0,
    satiety: 0,
    energy: -1
  });
  assert.equal(failure.body_update.state_after.energy, 39);
  assert.deepEqual(failure.observations.map(({ fact_id: id }) => id), [
    'visible:wreck_present',
    'trace_ld_v1_evidence_onisim_barefoot_tracks',
    'trace_ld_v1_evidence_boot_track',
    'visible:road_bag_missing'
  ]);
  assert.deepEqual(failure.evidence.map(({ evidence_id: id }) => id), [
    'trace_ld_v1_evidence_onisim_barefoot_tracks',
    'trace_ld_v1_evidence_boot_track'
  ]);
  assert.equal(failure.clue, null);
  assert.equal(await count(pool, 'party_runtime.party_check_resolutions',
    failureParty.party_id), 1);
  assert.equal(await count(pool, 'party_runtime.party_items',
    failureParty.party_id), 4);
  assert.equal((await pool.query(
    `SELECT consequence_policy_ref->>'entity_id' AS consequence_ref
       FROM party_runtime.party_check_resolutions
      WHERE party_id=$1`,
    [failureParty.party_id]
  )).rows[0].consequence_ref,
  'trace_ld_v1_consequence_inspection_failure');
  assert.equal((await pool.query(
    `SELECT count(*)::int AS count
       FROM party_runtime.party_items
      WHERE party_id=$1 AND template_id=$2`,
    [
      failureParty.party_id,
      'trace_ld_v1_item_blue_wool_fragment'
    ]
  )).rows[0].count, 0);
  const failureRestart = buildRuntime({
    pool,
    release,
    runtimeCatalogPin,
    randomValue: 0,
    randomDrawObserver() {
      failureRolls += 1;
    }
  });
  assert.deepEqual(
    (await failureRestart.getPartyScreen(failureParty.party_id)).screen,
    failure.screen
  );
  assert.deepEqual(
    await failureRestart.submitTurn(failureParty.party_id, failureInput),
    failure
  );
  assert.equal(failureRolls, 1);
  assert.equal(await count(pool, 'party_runtime.party_check_resolutions',
    failureParty.party_id), 1);
  assert.equal(await count(pool, 'party_runtime.party_body_temporal_history',
    failureParty.party_id), 1);
  assert.equal((await pool.query(
    `SELECT whole_minutes::text
       FROM party_runtime.party_clocks
      WHERE party_id=$1`,
    [failureParty.party_id]
  )).rows[0].whole_minutes, '333075');
  assert.equal(Number((await pool.query(
    `SELECT energy
       FROM party_runtime.party_actor_body_states
      WHERE party_id=$1 AND actor_kind='player_character'`,
    [failureParty.party_id]
  )).rows[0].energy), 39);

  let narrationCalls = 0;
  let retrySemanticCalls = 0;
  let retryRolls = 0;
  const retryRuntime = buildRuntime({
    pool,
    release,
    runtimeCatalogPin,
    semanticObserver() {
      retrySemanticCalls += 1;
    },
    randomDrawObserver() {
      retryRolls += 1;
    },
    narrationService: {
      async run(request) {
        narrationCalls += 1;
        if (narrationCalls === 1) {
          throw new Error('retryable narration failure');
        }
        return approvedNarration(request.request_id);
      }
    }
  });
  const retryParty = await retryRuntime.startNewGame({
    scenario_id: 'lower_dvina_trace_v1',
    request_id: 'phase-2-narration-retry-party'
  });
  await retryRuntime.acknowledgeOpening(retryParty.party_id, {
    client_ack_id: 'phase-2-narration-retry-ack'
  });
  const retryInput = {
    request_id: 'phase-2-narration-retry-turn',
    idempotency_key: 'phase-2-narration-retry-turn',
    raw_text:
      'Хочу внимательно изучить повреждения судна и всё, что осталось на берегу.'
  };
  await assert.rejects(
    () => retryRuntime.submitTurn(retryParty.party_id, retryInput),
    /retryable narration failure/u
  );
  assert.equal(await count(pool, 'party_runtime.party_check_resolutions',
    retryParty.party_id), 1);
  assert.equal(await count(pool, 'party_runtime.party_body_temporal_history',
    retryParty.party_id), 1);
  assert.equal(retrySemanticCalls, 1);
  assert.equal(retryRolls, 1);
  await assert.rejects(
    () => retryRuntime.submitTurn(retryParty.party_id, {
      request_id: 'phase-2-new-turn-while-presentation-pending',
      idempotency_key: 'phase-2-new-turn-while-presentation-pending',
      raw_text:
        'Хочу внимательно изучить повреждения судна и всё, что осталось на берегу.'
    }),
    { code: 'TRACE_PHASE_2_PRESENTATION_PENDING' }
  );
  assert.equal(await count(pool, 'party_runtime.party_check_resolutions',
    retryParty.party_id), 1);
  assert.equal(await count(pool, 'party_runtime.party_body_temporal_history',
    retryParty.party_id), 1);
  assert.equal(retrySemanticCalls, 1);
  assert.equal(retryRolls, 1);
  assert.equal(
    (await pool.query(
      `SELECT whole_minutes
         FROM party_runtime.party_clocks
        WHERE party_id=$1`,
      [retryParty.party_id]
    )).rows[0].whole_minutes,
    '333075'
  );
  const afterNarrationRetry = await retryRuntime.submitTurn(
    retryParty.party_id,
    retryInput
  );
  assert.equal(afterNarrationRetry.option_id, 'inspect_wreck_in_detail');
  assert.equal(narrationCalls, 2);
  assert.equal(retrySemanticCalls, 1);
  assert.equal(retryRolls, 1);
  assert.equal(await count(pool, 'party_runtime.party_check_resolutions',
    retryParty.party_id), 1);
  const afterPendingResolved = await retryRuntime.submitTurn(
    retryParty.party_id,
    {
      request_id: 'phase-2-new-turn-after-presentation',
      idempotency_key: 'phase-2-new-turn-after-presentation',
      raw_text:
        'Хочу внимательно изучить повреждения судна и всё, что осталось на берегу.'
    }
  );
  assert.equal(afterPendingResolved.turn_number, 2);
  assert.equal(retrySemanticCalls, 2);
  assert.equal(retryRolls, 2);
  assert.equal(await count(pool, 'party_runtime.party_check_resolutions',
    retryParty.party_id), 2);
  const historicalAfterPending = await retryRuntime.submitTurn(
    retryParty.party_id,
    retryInput
  );
  assert.deepEqual(historicalAfterPending, afterNarrationRetry);
  assert.equal(retrySemanticCalls, 2);
  assert.equal(retryRolls, 2);

  await assertConcurrentStaleCommitBlocked({
    pool,
    release,
    runtimeCatalogPin,
    pendingPresentation: false
  });
  await assertConcurrentStaleCommitBlocked({
    pool,
    release,
    runtimeCatalogPin,
    pendingPresentation: true
  });
});

function buildRuntime({
  pool,
  release,
  runtimeCatalogPin,
  semanticObserver = () => {},
  randomDrawObserver = () => {},
  randomValue = null,
  repositoryDecorator = (value) => value,
  narrationService = {
    async run(request) {
      return approvedNarration(request.request_id);
    }
  }
}) {
  const committer = createSpatialV3PostgresCombinedAtomicCommitter({
    pool,
    recheck: firstPlayableCommitRecheck,
    now: () => new Date('2026-07-30T08:00:00.000Z')
  });
  const repository = repositoryDecorator(
    createLowerDvinaTracePhase2PostgresRepository({
      partyPool: pool,
      committer
    })
  );
  const { playerConversationModel, npcSemanticModel } =
    createM2ConversationModels();
  const turnStepModel = createLowerDvinaTraceTurnStepTestModel({
    onCall: semanticObserver
  });
  const traceTurnRuntime = createLowerDvinaTracePhase2Runtime({
    repository,
    turnStepModel,
    playerConversationModel,
    npcSemanticModel,
    semanticResolver: async (request) => {
      semanticObserver(request);
      return {
        option_id: request.action_set.find(
          ({ option_id: id }) => id === 'inspect_wreck_in_detail'
        )?.option_id
      };
    },
    narrator: createLowerDvinaTracePhase2DurableNarrator({
      partyPool: pool,
      narrationService
    }),
    randomSourceFactory: () => {
      const source = createSeededRandomSource(
        'lower-dvina-trace-phase-2-acceptance'
      );
      let fixedRollCounter = 0;
      return {
        next() {
          randomDrawObserver();
          if (randomValue == null) return source.next();
          fixedRollCounter += 1;
          return randomValue;
        },
        snapshot: () => randomValue == null
          ? source.snapshot()
          : {
              algorithm: 'mulberry32_v1',
              seed_ref: 'lower-dvina-trace-phase-2-fixed-postgres-test',
              counter: fixedRollCounter
            }
      };
    },
    decisionSecret: 'phase-2-postgres-secret',
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

async function assertConcurrentStaleCommitBlocked({
  pool,
  release,
  runtimeCatalogPin,
  pendingPresentation
}) {
  const suffix = pendingPresentation ? 'pending' : 'ready';
  const secondKey = `phase-2-concurrent-b-${suffix}`;
  const gate = commitGate(secondKey);
  let narrationCalls = 0;
  const runtime = buildRuntime({
    pool,
    release,
    runtimeCatalogPin,
    repositoryDecorator: gate.decorate,
    narrationService: {
      async run(request) {
        narrationCalls += 1;
        if (pendingPresentation && narrationCalls === 1) {
          throw new Error('concurrent pending presentation');
        }
        return approvedNarration(request.request_id);
      }
    }
  });
  const party = await runtime.startNewGame({
    scenario_id: 'lower_dvina_trace_v1',
    request_id: `phase-2-concurrent-party-${suffix}`
  });
  await runtime.acknowledgeOpening(party.party_id, {
    client_ack_id: `phase-2-concurrent-ack-${suffix}`
  });
  const rawText =
    'Хочу внимательно изучить повреждения судна и всё, что осталось на берегу.';
  const secondInput = {
    request_id: secondKey,
    idempotency_key: secondKey,
    raw_text: rawText
  };
  const second = runtime.submitTurn(party.party_id, secondInput);
  await gate.waitUntilBlocked();
  const firstInput = {
    request_id: `phase-2-concurrent-a-${suffix}`,
    idempotency_key: `phase-2-concurrent-a-${suffix}`,
    raw_text: rawText
  };
  try {
    if (pendingPresentation) {
      await assert.rejects(
        () => runtime.submitTurn(party.party_id, firstInput),
        /concurrent pending presentation/u
      );
    } else {
      await runtime.submitTurn(party.party_id, firstInput);
    }
  } finally {
    gate.release();
  }
  await assert.rejects(
    () => second,
    {
      code: pendingPresentation
        ? 'TRACE_PHASE_2_PRESENTATION_PENDING'
        : 'TRACE_PHASE_2_STALE_STATE'
    }
  );
  await assertSingleInspectionState(pool, party.party_id);
  if (pendingPresentation) {
    await runtime.submitTurn(party.party_id, firstInput);
  }
  const retried = await runtime.submitTurn(party.party_id, secondInput);
  assert.equal(retried.turn_number, 2);
  assert.equal(await count(pool, 'party_runtime.party_check_resolutions',
    party.party_id), 2);
}

function commitGate(blockedIdempotencyKey) {
  let unblock;
  let reached;
  const blocked = new Promise((resolve) => {
    reached = resolve;
  });
  const released = new Promise((resolve) => {
    unblock = resolve;
  });
  return {
    decorate(repository) {
      return {
        ...repository,
        async commitPhase2Turn(input) {
          const key = input.writePlan.write_targets.find(
            ({ target }) => target === 'party_state'
          )?.value?.player_input?.idempotency_key;
          if (key === blockedIdempotencyKey) {
            reached();
            await released;
          }
          return repository.commitPhase2Turn(input);
        }
      };
    },
    waitUntilBlocked() {
      return blocked;
    },
    release() {
      unblock();
    }
  };
}

async function assertSingleInspectionState(pool, partyId) {
  const state = (await pool.query(
    `SELECT p.state_version,s.turn_number,c.whole_minutes,b.energy
       FROM party_runtime.parties p
       JOIN party_runtime.party_server_sessions s
         ON s.party_id=p.party_id
       JOIN party_runtime.party_clocks c ON c.party_id=p.party_id
       JOIN party_runtime.party_actor_body_states b
         ON b.party_id=p.party_id
        AND b.actor_kind='player_character'
      WHERE p.party_id=$1`,
    [partyId]
  )).rows[0];
  assert.equal(Number(state.state_version), 1);
  assert.equal(Number(state.turn_number), 1);
  assert.equal(state.whole_minutes, '333075');
  assert.equal(Number(state.energy), 39);
  assert.equal(await count(pool, 'party_runtime.party_check_resolutions',
    partyId), 1);
  assert.equal(await count(pool, 'party_runtime.party_body_temporal_history',
    partyId), 1);
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
      prose: 'На берегу проступает ясная картина повреждений.',
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

async function assertResealedSnapshotTamper(pool, runtime, partyId, mutate) {
  const original = (await pool.query(
    `SELECT state_payload,state_digest
       FROM party_runtime.party_state_snapshots
      WHERE party_id=$1 AND state_version=1`,
    [partyId]
  )).rows[0];
  const changed = structuredClone(original.state_payload);
  mutate(changed);
  await pool.query(
    `UPDATE party_runtime.party_state_snapshots
        SET state_payload=$2::jsonb,state_digest=$3
      WHERE party_id=$1 AND state_version=1`,
    [partyId, JSON.stringify(changed), canonicalDigest(changed)]
  );
  await assert.rejects(
    () => runtime.getPartyScreen(partyId),
    { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' }
  );
  await pool.query(
    `UPDATE party_runtime.party_state_snapshots
        SET state_payload=$2::jsonb,state_digest=$3
      WHERE party_id=$1 AND state_version=1`,
    [partyId, JSON.stringify(original.state_payload), original.state_digest]
  );
}

async function assertBlueWoolOwnershipTamper(pool, runtime, partyId) {
  const original = (await pool.query(
    `SELECT ownership_id,owner_external_ref
       FROM party_runtime.party_ownership o
       JOIN party_runtime.party_items i
         ON i.party_id=o.party_id AND i.item_id=o.item_id
      WHERE o.party_id=$1
        AND i.template_id='trace_ld_v1_item_blue_wool_fragment'`,
    [partyId]
  )).rows[0];
  await pool.query(
    `UPDATE party_runtime.party_ownership
        SET owner_external_ref=$3::jsonb
      WHERE party_id=$1 AND ownership_id=$2`,
    [partyId, original.ownership_id, JSON.stringify({
      entity_kind: 'participant_slot', entity_id: 'tampered-owner'
    })]
  );
  await assert.rejects(
    () => runtime.getPartyScreen(partyId),
    { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' }
  );
  await pool.query(
    `UPDATE party_runtime.party_ownership
        SET owner_external_ref=$3::jsonb
      WHERE party_id=$1 AND ownership_id=$2`,
    [partyId, original.ownership_id,
      JSON.stringify(original.owner_external_ref)]
  );
}

async function assertScreenTamper(pool, runtime, partyId) {
  const original = (await pool.query(
    `SELECT screen FROM party_runtime.party_server_sessions
      WHERE party_id=$1`,
    [partyId]
  )).rows[0].screen;
  const changed = structuredClone(original);
  changed.visible_context.visible_scene = 'Подменённая сцена.';
  const { screen_digest: _digest, ...payload } = changed;
  changed.screen_digest = canonicalDigest(payload);
  await pool.query(
    `UPDATE party_runtime.party_server_sessions SET screen=$2::jsonb
      WHERE party_id=$1`,
    [partyId, JSON.stringify(changed)]
  );
  await assert.rejects(
    () => runtime.getPartyScreen(partyId),
    { code: 'TRACE_PHASE_1B_SESSION_READ_INVALID' }
  );
  await pool.query(
    `UPDATE party_runtime.party_server_sessions SET screen=$2::jsonb
      WHERE party_id=$1`,
    [partyId, JSON.stringify(original)]
  );
}

async function installSchemas(pool) {
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
  for (const file of partyFiles.slice(catalogMigrationIndex)) {
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
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

function containsObjectKey(value, forbiddenKey) {
  if (Array.isArray(value)) {
    return value.some((entry) => containsObjectKey(entry, forbiddenKey));
  }
  if (value == null || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, entry]) =>
    key === forbiddenKey || containsObjectKey(entry, forbiddenKey));
}

async function count(pool, table, partyId, partyColumn = 'party_id') {
  return (await pool.query(
    `SELECT count(*)::int AS count FROM ${table} WHERE ${partyColumn}=$1`,
    [partyId]
  )).rows[0].count;
}

async function waitForPostgres(name) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (docker(['exec', name, 'pg_isready']).status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('PostgreSQL did not become ready');
}
