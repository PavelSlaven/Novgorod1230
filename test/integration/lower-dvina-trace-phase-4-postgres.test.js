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
  createLowerDvinaTracePhase1ARepository
} from '@rus/party-store/internal/lower-dvina-trace-phase-1a';
import {
  getCommittedInventoryLoad
} from '../../apps/game-server/src/runtime/lower-dvina-trace-committed-inventory.js';
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
  digest: '1cf914ed9a19801f94b8b1463a717dbb0be7f1d51ea2351e6d1d5a51c492215e',
  manifest: '593ccb341084f7433ec4ae9d7d0b2ea8b1dea07833636ef385550ba5a295ecea'
});

test('Phase 4 PostgreSQL path commits, replays, rolls back, and rejects tampering', async (t) => {
  if (docker(['version']).status !== 0) {
    t.skip('Docker is required for isolated Phase 4 PostgreSQL integration');
    return;
  }
  const name = `lower-dvina-phase-4-${process.pid}`;
  let pool;
  t.after(async () => {
    if (pool) await pool.end();
    docker(['rm', '-f', name]);
  });
  const started = docker([
    'run', '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=local_only', '-e', 'POSTGRES_USER=phase4',
    '-e', 'POSTGRES_DB=phase4', 'postgres:16-alpine'
  ]);
  assert.equal(started.status, 0, started.stderr);
  await waitForPostgres(name);
  await new Promise((resolve) => setTimeout(resolve, 700));
  const port = Number(docker(['port', name, '5432']).stdout
    .match(/:(\d+)\s*$/u)?.[1]);
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'phase4',
    password: 'local_only', database: 'phase4', max: 8 });
  await installSchemas(pool);
  await installWorldLineage(pool);
  const bundle = await loadLowerDvinaTraceMaterializationBundle({
    scenarioDefinitionRevision: 10
  });
  const sourcePin = lowerDvinaTracePhase1ADomainPin(bundle);
  const runtimeCatalogPin = Object.freeze({
    ...sourcePin,
    compatible_world_revision_id: world.revision,
    compatible_world_catalog_digest: world.digest,
    compatible_world_pin_manifest_digest: world.manifest
  });
  const release = Object.freeze({
    release_id: 'phase-4-postgres-release',
    world_revision_id: world.revision,
    world_catalog_digest: world.digest,
    compatible_world_pin_manifest_digest: world.manifest
  });

  const runtime = buildRuntime({ pool, release, runtimeCatalogPin });
  const party = await createParty(runtime, 'phase-4-success');
  const internal = await createLowerDvinaTracePhase1ARepository({
    query: pool.query.bind(pool)
  }).loadInternal(party.party_id);
  const initialInventory = getCommittedInventoryLoad({
    party_id: party.party_id,
    actor_id: internal.player.instance_id,
    party_state: { state_version: 0 },
    position: internal.position,
    player_profile: internal.player.dossier,
    items: internal.items
  });
  assert.equal(initialInventory.mass.pass, true,
    JSON.stringify(initialInventory.mass.errors));
  await advanceToCampWithRouteKnowledge(runtime, party.party_id, 'success');
  const routeInput = turn('phase-4-route', 'Пройти известной тропой к старой сушильне.');
  const routed = await runtime.submitTurn(party.party_id, routeInput);
  assert.equal(routed.option_id, 'follow_known_route_to_drying_shed');
  assert.equal(
    routed.time_update.exact_elapsed.exact_minutes.numerator,
    '12'
  );
  assert.equal((await position(pool, party.party_id)).g5_anchor_id != null, true);
  assert.equal(await phase4RouteCount(pool, party.party_id), 1);
  const routedSnapshot = await latestSnapshot(pool, party.party_id);
  assert.equal(routedSnapshot.route_knowledge.includes(
    'trace_ld_v1_route_shed_to_camp'), true);
  assert.deepEqual((await pool.query(
    `SELECT knowledge_state,evidence
       FROM party_runtime.party_character_knowledge
      WHERE party_id=$1 AND character_id=$2
        AND fact_id='trace_ld_v1_route_shed_to_camp'`,
    [party.party_id, routedSnapshot.actor_id]
  )).rows, [{
    knowledge_state: 'known_from_committed_traversal',
    evidence: [
      routedSnapshot.last_turn.consequence.movement.traversal.ids.execution_id
    ]
  }]);
  const restarted = buildRuntime({ pool, release, runtimeCatalogPin });
  assert.deepEqual(await restarted.submitTurn(party.party_id, routeInput), routed);
  assert.equal(await phase4RouteCount(pool, party.party_id), 1);
  assert.equal((await latestSnapshot(pool, party.party_id)).route_knowledge
    .includes('trace_ld_v1_route_shed_to_camp'), true);

  const surrenderInput = turn('phase-4-surrender',
    'Предложить Ратше условную защиту и потребовать сдачи.');
  const surrendered = await restarted.submitTurn(party.party_id, surrenderInput);
  assert.equal(surrendered.option_id,
    'offer_conditional_protection_and_seek_surrender');
  assert.deepEqual((await pool.query(
    `SELECT result_kind
       FROM party_runtime.party_check_resolutions
      WHERE party_id=$1
        AND check_policy_ref->>'entity_id' =
          'trace_ld_v1_check_ratsha_surrender_attempt'`,
    [party.party_id]
  )).rows, [{ result_kind: 'success' }]);
  await assertSuccessRows(pool, party.party_id);
  const restartedAfterSurrender = buildRuntime({ pool, release, runtimeCatalogPin });
  assert.deepEqual(
    await restartedAfterSurrender.submitTurn(party.party_id, surrenderInput),
    surrendered
  );
  await assertSuccessRows(pool, party.party_id);

  await assertTamperRejected(pool, restartedAfterSurrender, party.party_id,
    `UPDATE party_runtime.party_item_placements p
        SET physical_position='worn'
       FROM party_runtime.party_items i
      WHERE p.party_id=i.party_id AND p.item_id=i.item_id
        AND p.party_id=$1 AND i.template_id='trace_ld_v1_item_ratsha_knife'`);
  await assertTamperRejected(pool, restartedAfterSurrender, party.party_id,
    `UPDATE party_runtime.party_items
        SET state=jsonb_set(state, '{property_state,accessibility}',
          '"quick"'::jsonb, true)
      WHERE party_id=$1 AND template_id='trace_ld_v1_item_ratsha_knife'`);
  await assertTamperRejected(pool, restartedAfterSurrender, party.party_id,
    `UPDATE party_runtime.party_ownership o
        SET owner_npc_id=o.controller_npc_id
       FROM party_runtime.party_items i
      WHERE o.party_id=i.party_id AND o.item_id=i.item_id
        AND o.party_id=$1 AND i.template_id='trace_ld_v1_item_ratsha_knife'`);
  await assertPhase4SemanticTamperingRejected(
    pool,
    restartedAfterSurrender,
    party.party_id
  );

  await runConfessionPath({ pool, release, runtimeCatalogPin });
  await runThreatPath({ pool, release, runtimeCatalogPin });
  await runAttackPath({ pool, release, runtimeCatalogPin });

  const rollbackParty = await createParty(runtime, 'phase-4-rollback');
  await advanceToCampWithRouteKnowledge(runtime, rollbackParty.party_id,
    'rollback');
  await runtime.submitTurn(rollbackParty.party_id,
    turn('phase-4-rollback-route', 'Пройти известной тропой к старой сушильне.'));
  await pool.query(
    `ALTER TABLE party_runtime.party_obligations
       ADD CONSTRAINT phase4_rollback_probe
       CHECK (current_state <> 'active') NOT VALID`
  );
  try {
    await assert.rejects(
      () => runtime.submitTurn(rollbackParty.party_id, turn(
        'phase-4-rollback-surrender',
        'Предложить Ратше условную защиту и потребовать сдачи.')),
      { code: 'TRACE_PHASE_4_COMMIT_FAILED' }
    );
  } finally {
    await pool.query(
      'ALTER TABLE party_runtime.party_obligations DROP CONSTRAINT phase4_rollback_probe'
    );
  }
  await assertRollbackRows(pool, rollbackParty.party_id);
});

function turn(request_id, raw_text) {
  return { request_id, idempotency_key: request_id, raw_text };
}

async function advanceToCampWithRouteKnowledge(runtime, partyId, suffix) {
  await runtime.submitTurn(partyId, turn(`phase-4-${suffix}-inspect`,
    'Осмотреть место крушения подробно.'));
  await runtime.submitTurn(partyId, turn(`phase-4-${suffix}-camp`,
    'Дойти до рыбацкого стана.'));
  await runtime.submitTurn(partyId, turn(`phase-4-${suffix}-route-knowledge`,
    'Показать Еремею синюю шерсть.'));
}

async function createParty(runtime, requestId) {
  const party = await runtime.startNewGame({
    scenario_id: 'lower_dvina_trace_v1', request_id: requestId
  });
  await runtime.acknowledgeOpening(party.party_id, {
    client_ack_id: `${requestId}-ack`
  });
  return party;
}

function buildRuntime({
  pool,
  release,
  runtimeCatalogPin,
  npcOption = 'surrender_without_confession',
  randomValue = 0.99,
  counters = null
}) {
  const committer = createSpatialV3PostgresCombinedAtomicCommitter({
    pool, recheck: firstPlayableCommitRecheck,
    now: () => new Date('2026-07-30T08:00:00.000Z')
  });
  const repository = createLowerDvinaTracePhase2PostgresRepository({
    partyPool: pool, committer
  });
  const traceTurnRuntime = createLowerDvinaTracePhase2Runtime({
    repository,
    semanticResolver: async ({ raw_text, action_set }) => ({
      option_id: semanticOption(raw_text, action_set)
    }),
    narrator: createLowerDvinaTracePhase2DurableNarrator({
      partyPool: pool, narrationService: { async run(request) {
        return approvedNarration(request.request_id);
      } }
    }),
    randomSourceFactory: ({ request_id }) => {
      if (counters) counters.rng += 1;
      return seededRoll(
        request_id,
        typeof randomValue === 'function'
          ? randomValue(request_id)
          : randomValue
      );
    },
    npcDecisionSelector: async (request) => {
      if (counters) counters.npc += 1;
      const option = request.options.find(
        ({ option_id }) => option_id === npcOption
      );
      assert.ok(option, `${npcOption}: ${request.options
        .map(({ option_id: id }) => id).join(',')}`);
      return { request_id: request.request_id, state_version: request.state_version,
        option_id: option.option_id, command_token: option.command_token };
    },
    decisionSecret: 'phase-4-postgres-secret',
    now: () => '2026-07-30T08:00:00.000Z'
  });
  return createFirstPlayablePublicRuntime({ partyPool: pool, committer, release,
    runtimeCatalogPin,
    traceStartAdapter: createLowerDvinaTracePhase1BProductionAdapter({
      partyPool: pool, worldPool: pool, release, runtimeCatalogPin
    }), traceTurnRuntime });
}

function semanticOption(rawText, actionSet) {
  const text = rawText.toLowerCase();
  const option_id = text.includes('осмотр')
    ? 'inspect_wreck_in_detail'
    : text.includes('показ')
      ? 'show_clue_and_seek_eremey_cooperation'
      : text.includes('сушиль')
    ? 'follow_known_route_to_drying_shed'
    : text.includes('стан')
      ? 'follow_path_to_fishing_camp'
    : 'offer_conditional_protection_and_seek_surrender';
  assert.equal(actionSet.some((option) => option.option_id === option_id), true,
    `${rawText}: ${actionSet.map((option) => option.option_id).join(',')}`);
  return option_id;
}

function seededRoll(requestId, value = 0.99) {
  const source = createSeededRandomSource(`phase-4:${requestId}`);
  return { next: () => value, snapshot: () => source.snapshot() };
}

function approvedNarration(requestId) {
  return { version: 1, schema: 'narration_flow_result', request_id: requestId,
    surface: 'turn', status: 'approved', pass: true,
    approved_output: { version: 1, schema: 'narration_output',
      output_id: `narration:${requestId}`, prose: 'Факты сохранены.',
      action_options: [], used_references: [],
      self_check: { no_new_world_facts: true } },
    final_audit: { version: 1, schema: 'narration_audit', pass: true,
      concerns: [], evidence: [] }, repair_request: null,
    generation_history: [], audit_history: [], repair_history: [], diagnostics: {} };
}

async function runConfessionPath({ pool, release, runtimeCatalogPin }) {
  const counters = { rng: 0, npc: 0 };
  const runtime = buildRuntime({
    pool,
    release,
    runtimeCatalogPin,
    npcOption: 'surrender_and_confess',
    counters
  });
  const party = await createParty(runtime, 'phase-4-confession');
  await advanceToCampWithRouteKnowledge(runtime, party.party_id, 'confession');
  await runtime.submitTurn(party.party_id,
    turn('phase-4-confession-route',
      'Пройти известной тропой к старой сушильне.'));
  const input = turn('phase-4-confession-surrender',
    'Предложить Ратше условную защиту и потребовать сдачи.');
  const result = await runtime.submitTurn(party.party_id, input);
  await assertSuccessRows(pool, party.party_id);
  const interaction = (await pool.query(
    `SELECT terminal_evidence_ref
       FROM party_runtime.party_actor_npc_interactions
      WHERE party_id=$1 AND interaction_id LIKE '%:confession'`,
    [party.party_id]
  )).rows;
  assert.equal(interaction.length, 1);
  assert.equal(interaction[0].terminal_evidence_ref.truth_projection,
    'forbidden');
  assert.equal(
    interaction[0].terminal_evidence_ref.assertion.assertion_id,
    'trace_ld_v1_assertion_ratsha_confession'
  );
  assert.equal(interaction[0].terminal_evidence_ref.audience_ids.length, 3);
  assert.equal((await pool.query(
    `SELECT count(*)::int AS count
       FROM party_runtime.party_actor_npc_interaction_summaries s
       JOIN party_runtime.party_actor_npc_interactions i
         ON i.interaction_id=s.interaction_id
      WHERE i.party_id=$1 AND i.interaction_id LIKE '%:confession'`,
    [party.party_id]
  )).rows[0].count, 2);
  const forbiddenTruth = (await pool.query(
    `SELECT count(*)::int AS count
       FROM party_runtime.party_character_knowledge
      WHERE party_id=$1
        AND fact_id IN (
          'principal_zhdanko',
          'principal_zhdanko_established',
          'hidden_event_sequence',
          'hidden_motive'
        )`,
    [party.party_id]
  )).rows[0].count;
  assert.equal(forbiddenTruth, 0);
  const beforeReplay = { ...counters };
  const restarted = buildRuntime({
    pool,
    release,
    runtimeCatalogPin,
    npcOption: 'surrender_and_confess',
    counters
  });
  assert.deepEqual(await restarted.submitTurn(party.party_id, input), result);
  assert.deepEqual(counters, beforeReplay);
}

async function runThreatPath({ pool, release, runtimeCatalogPin }) {
  const counters = { rng: 0, npc: 0 };
  const runtime = buildRuntime({
    pool,
    release,
    runtimeCatalogPin,
    npcOption: 'threaten_and_bargain',
    randomValue: (requestId) =>
      requestId.includes('threat-attempt')
        || requestId.includes('threat-second-attempt')
        ? 0
        : 0.99,
    counters
  });
  const party = await createParty(runtime, 'phase-4-threat');
  await advanceToCampWithRouteKnowledge(runtime, party.party_id, 'threat');
  await runtime.submitTurn(party.party_id, turn(
    'phase-4-threat-route',
    'Пройти известной тропой к старой сушильне.'
  ));
  const input = turn('phase-4-threat-attempt',
    'Предложить Ратше условную защиту и потребовать сдачи.');
  const result = await runtime.submitTurn(party.party_id, input);
  await assertHostileRows(pool, party.party_id, {
    optionId: 'threaten_and_bargain',
    attack: false
  });
  const offeredSnapshot = await latestSnapshot(pool, party.party_id);
  const offeredPromise = offeredSnapshot.promise_instances[0];
  const offeredNormalized = (await pool.query(
    `SELECT created_change_set_id,last_change_set_id,state_version
       FROM party_runtime.party_obligations
      WHERE party_id=$1`,
    [party.party_id]
  )).rows[0];
  assert.deepEqual({
    created_change_set_id: offeredPromise.created_change_set_id,
    last_change_set_id: offeredPromise.last_change_set_id,
    state_version: Number(offeredPromise.state_version)
  }, {
    ...offeredNormalized,
    state_version: Number(offeredNormalized.state_version)
  });
  const threat = (await pool.query(
    `SELECT terminal_evidence_ref
       FROM party_runtime.party_actor_npc_interactions
      WHERE party_id=$1 AND interaction_id LIKE '%:threat'`,
    [party.party_id]
  )).rows;
  assert.equal(threat.length, 1);
  assert.deepEqual({
    source_rule: threat[0].terminal_evidence_ref.source_rule,
    immediate_threat: threat[0].terminal_evidence_ref.immediate_threat,
    truth_projection: threat[0].terminal_evidence_ref.truth_projection
  }, {
    source_rule: 'speaker_current_threat_or_offer_only',
    immediate_threat: true,
    truth_projection: 'forbidden'
  });
  const beforeReplay = { ...counters };
  const restarted = buildRuntime({
    pool,
    release,
    runtimeCatalogPin,
    npcOption: 'threaten_and_bargain',
    randomValue: (requestId) =>
      requestId.includes('threat-attempt')
        || requestId.includes('threat-repeat-')
        ? 0
        : 0.99,
    counters
  });
  assert.deepEqual(await restarted.submitTurn(party.party_id, input), result);
  assert.deepEqual(counters, beforeReplay);
  let repeatedAttempts = 0;
  let current = await latestSnapshot(pool, party.party_id);
  while (current.party_state.turn_number < 10) {
    const targetTurn = current.party_state.turn_number + 1;
    await restarted.submitTurn(party.party_id, turn(
      `phase-4-threat-repeat-${targetTurn}`,
      'Ещё раз предложить Ратше условную защиту и потребовать сдачи.'
    ));
    repeatedAttempts += 1;
    current = await latestSnapshot(pool, party.party_id);
  }
  assert.equal(current.party_state.turn_number, 10);
  assert.equal(await count(pool,
    'party_runtime.party_obligation_transitions', party.party_id), 1);
  assert.deepEqual(counters, {
    rng: beforeReplay.rng + repeatedAttempts,
    npc: beforeReplay.npc + repeatedAttempts
  });
  const repeatedPromise = current.promise_instances[0];
  const repeatedNormalized = (await pool.query(
    `SELECT created_change_set_id,last_change_set_id,state_version
       FROM party_runtime.party_obligations
      WHERE party_id=$1`,
    [party.party_id]
  )).rows[0];
  assert.deepEqual({
    created_change_set_id: repeatedPromise.created_change_set_id,
    last_change_set_id: repeatedPromise.last_change_set_id,
    state_version: Number(repeatedPromise.state_version)
  }, {
    ...repeatedNormalized,
    state_version: Number(repeatedNormalized.state_version)
  });
  assert.equal(repeatedPromise.last_change_set_id,
    offeredPromise.last_change_set_id);
  assert.equal(Number(repeatedPromise.state_version),
    Number(offeredPromise.state_version));
  const afterRestart = buildRuntime({
    pool,
    release,
    runtimeCatalogPin,
    npcOption: 'threaten_and_bargain',
    counters
  });
  await afterRestart.getPartyScreen(party.party_id);
}

async function runAttackPath({ pool, release, runtimeCatalogPin }) {
  const counters = { rng: 0, npc: 0 };
  const runtime = buildRuntime({
    pool,
    release,
    runtimeCatalogPin,
    npcOption: 'attack_and_escape',
    randomValue: (requestId) =>
      requestId.includes('attack-attempt') ? 0 : 0.99,
    counters
  });
  const party = await createParty(runtime, 'phase-4-attack');
  await advanceToCampWithRouteKnowledge(runtime, party.party_id, 'attack');
  await runtime.submitTurn(party.party_id, turn(
    'phase-4-attack-route',
    'Пройти известной тропой к старой сушильне.'
  ));
  const before = await latestSnapshot(pool, party.party_id);
  const input = turn('phase-4-attack-attempt',
    'Предложить Ратше условную защиту и потребовать сдачи.');
  const result = await runtime.submitTurn(party.party_id, input);
  const after = await latestSnapshot(pool, party.party_id);
  assert.equal(
    Number(after.clock.whole_minutes) - Number(before.clock.whole_minutes),
    12
  );
  assert.deepEqual(after.body_state, before.body_state);
  assert.deepEqual(after.player_response_boundary, {
    activity_ref: 'trace_ld_v1_activity_ratsha_attack_and_escape_attempt',
    time_profile_ref: 'trace_ld_v1_time_2m',
    duration_minutes: 2,
    status: 'player_response_required',
    automatic_harm: false,
    automatic_escape: false
  });
  const activities = (await pool.query(
    `SELECT original_total_minutes::int AS minutes,
            a.actual_time_numerator::int AS actual,e.status,a.result_kind,
            e.started_at_whole_minutes::int AS execution_start,
            e.last_processed_at_whole_minutes::int AS execution_end,
            a.started_at_whole_minutes::int AS attempt_start,
            a.ended_at_whole_minutes::int AS attempt_end
       FROM party_runtime.party_timed_activity_executions e
       JOIN party_runtime.party_timed_activity_attempts a
         ON a.activity_execution_id=e.id
      WHERE left(e.id,length($1))=$1
      ORDER BY e.series_ordinal`,
    [`activity:${party.party_id}:trace-phase4:5:`]
  )).rows;
  assert.deepEqual(activities, [
    { minutes: 10, actual: 10, status: 'completed',
      result_kind: 'completed',
      execution_start: Number(before.clock.whole_minutes),
      execution_end: Number(before.clock.whole_minutes) + 10,
      attempt_start: Number(before.clock.whole_minutes),
      attempt_end: Number(before.clock.whole_minutes) + 10 },
    { minutes: 2, actual: 2, status: 'completed',
      result_kind: 'completed',
      execution_start: Number(before.clock.whole_minutes) + 10,
      execution_end: Number(before.clock.whole_minutes) + 12,
      attempt_start: Number(before.clock.whole_minutes) + 10,
      attempt_end: Number(before.clock.whole_minutes) + 12 }
  ]);
  await assertHostileRows(pool, party.party_id, {
    optionId: 'attack_and_escape',
    attack: true
  });
  const beforeReplay = { ...counters };
  const restarted = buildRuntime({
    pool,
    release,
    runtimeCatalogPin,
    npcOption: 'attack_and_escape',
    randomValue: (requestId) =>
      requestId.includes('attack-attempt') ? 0 : 0.99,
    counters
  });
  assert.deepEqual(await restarted.submitTurn(party.party_id, input), result);
  assert.deepEqual(counters, beforeReplay);
  assert.deepEqual(await latestSnapshot(pool, party.party_id), after);
}

async function assertHostileRows(pool, partyId, { optionId, attack }) {
  const promise = (await pool.query(
    `SELECT current_state,current_state_fact
       FROM party_runtime.party_obligations
      WHERE party_id=$1`,
    [partyId]
  )).rows;
  assert.deepEqual(promise, [{
    current_state: 'offered',
    current_state_fact: 'promise_current_offered'
  }]);
  assert.equal(await count(pool,
    'party_runtime.party_obligation_transitions', partyId), 1);
  const decision = (await pool.query(
    `SELECT option_id
       FROM party_runtime.party_npc_decision_traces d
       JOIN party_runtime.party_v3_change_sets c
         ON c.party_id=d.party_id AND c.id=d.change_set_id
      WHERE d.party_id=$1 AND c.operation_kind='trace_phase_4_turn'`,
    [partyId]
  )).rows;
  assert.deepEqual(decision, [{ option_id: optionId }]);
  const knife = (await pool.query(
    `SELECT o.owner_npc_id,o.controller_npc_id,p.holder_npc_id,
            p.physical_position
       FROM party_runtime.party_items i
       JOIN party_runtime.party_item_placements p
         ON p.party_id=i.party_id AND p.item_id=i.item_id
       JOIN party_runtime.party_ownership o
         ON o.party_id=i.party_id AND o.item_id=i.item_id
      WHERE i.party_id=$1
        AND i.template_id='trace_ld_v1_item_ratsha_knife'`,
    [partyId]
  )).rows[0];
  assert.equal(knife.owner_npc_id, knife.controller_npc_id);
  assert.equal(knife.owner_npc_id, knife.holder_npc_id);
  assert.equal(knife.physical_position, 'worn_quick');
  assert.equal((await pool.query(
    `SELECT count(*)::int AS count
       FROM party_runtime.party_character_knowledge
      WHERE party_id=$1
        AND fact_id='ratsha_surrender_without_further_harm_committed'`,
    [partyId]
  )).rows[0].count, 0);
  if (attack) {
    const facts = (await pool.query(
      `SELECT fact_id
         FROM party_runtime.party_character_knowledge
        WHERE party_id=$1
          AND fact_id IN (
            'ratsha_attack_attempt_committed',
            'ratsha_attack_player_response_required'
          )
        ORDER BY fact_id`,
      [partyId]
    )).rows;
    assert.deepEqual(facts, [
      { fact_id: 'ratsha_attack_attempt_committed' },
      { fact_id: 'ratsha_attack_player_response_required' }
    ]);
  }
}

async function latestSnapshot(pool, partyId) {
  return (await pool.query(
    `SELECT state_payload
       FROM party_runtime.party_state_snapshots
      WHERE party_id=$1
      ORDER BY state_version DESC
      LIMIT 1`,
    [partyId]
  )).rows[0].state_payload;
}

async function assertSuccessRows(pool, partyId) {
  const knife = (await pool.query(
    `SELECT o.owner_npc_id,o.controller_npc_id,p.holder_npc_id,p.physical_position,
            COALESCE(
              i.state->'property_state'->>'accessibility',
              i.state->>'accessibility'
            ) AS accessibility
       FROM party_runtime.party_items i
       JOIN party_runtime.party_item_placements p ON p.party_id=i.party_id AND p.item_id=i.item_id
       JOIN party_runtime.party_ownership o ON o.party_id=i.party_id AND o.item_id=i.item_id
      WHERE i.party_id=$1 AND i.template_id='trace_ld_v1_item_ratsha_knife'`,
    [partyId])).rows[0];
  const actors = (await pool.query(
    `SELECT npc_id,semantic_state->>'participant_slot_ref' AS participant_slot_ref
       FROM party_runtime.party_npcs
      WHERE party_id=$1`,
    [partyId])).rows;
  const actor = (slot) => {
    const value = actors.find((row) => row.participant_slot_ref === slot);
    assert.ok(value, `${slot}: ${JSON.stringify(actors)}`);
    return value.npc_id;
  };
  const witnessIds = (await pool.query(
    `SELECT witness_refs
       FROM party_runtime.party_obligations
      WHERE party_id=$1`,
    [partyId]
  )).rows[0].witness_refs.map(({ entity_id: id }) => id);
  const fisher = actors.find((row) =>
    /^background_fisher_[12]$/u.test(row.participant_slot_ref)
      && witnessIds.includes(row.npc_id)).npc_id;
  assert.deepEqual(knife, { owner_npc_id: actor('ratsha_storehouse_helper'),
    controller_npc_id: fisher, holder_npc_id: fisher,
    physical_position: 'hands', accessibility: 'secured_not_available_to_ratsha' });
  const promise = (await pool.query(
    `SELECT current_state,current_state_fact FROM party_runtime.party_obligations WHERE party_id=$1`,
    [partyId])).rows;
  assert.deepEqual(promise, [{ current_state: 'active',
    current_state_fact: 'promise_current_active' }]);
  assert.equal(await count(pool, 'party_runtime.party_obligation_transitions', partyId), 2);
}

async function assertTamperRejected(pool, runtime, partyId, sql) {
  const before = await pool.query(
    `SELECT state_payload FROM party_runtime.party_state_snapshots
      WHERE party_id=$1 ORDER BY state_version DESC LIMIT 1`, [partyId]);
  const original = before.rows[0].state_payload;
  await pool.query(sql, [partyId]);
  await assert.rejects(() => runtime.getPartyScreen(partyId), {
    code: 'TRACE_PHASE_2_SESSION_READ_INVALID'
  });
  const knife = original.items.find(({ template_id }) =>
    template_id === 'trace_ld_v1_item_ratsha_knife');
  await pool.query(
    `UPDATE party_runtime.party_item_placements SET holder_npc_id=$2,
       physical_position=$3 WHERE party_id=$1 AND item_id=$4`,
    [partyId, knife.placement.holder_npc_id, knife.placement.physical_position,
      knife.item_id]);
  await pool.query(
    `UPDATE party_runtime.party_ownership SET owner_npc_id=$2,controller_npc_id=$3
      WHERE party_id=$1 AND item_id=$4`,
    [partyId, knife.ownership.owner_npc_id, knife.ownership.controller_npc_id,
      knife.item_id]);
  await pool.query(
    `UPDATE party_runtime.party_items SET state=$2::jsonb
      WHERE party_id=$1 AND item_id=$3`, [partyId, JSON.stringify(knife.state), knife.item_id]);
}

async function assertPhase4SemanticTamperingRejected(pool, runtime, partyId) {
  await assertMutableRowTamperRejected({
    pool, runtime, partyId,
    selectSql: `SELECT obligation_id,current_state,current_state_fact,
                       state_version,last_change_set_id
                  FROM party_runtime.party_obligations
                 WHERE party_id=$1`,
    tamperSql: `UPDATE party_runtime.party_obligations
                   SET current_state='offered',
                       current_state_fact='promise_current_offered'
                 WHERE party_id=$1`,
    restoreSql: `UPDATE party_runtime.party_obligations
                    SET current_state=$2,current_state_fact=$3,
                        state_version=$4,last_change_set_id=$5
                  WHERE party_id=$1 AND obligation_id=$6`,
    restoreValues: (row) => [
      row.current_state, row.current_state_fact, row.state_version,
      row.last_change_set_id, row.obligation_id
    ]
  });
  await assertMutableRowTamperRejected({
    pool, runtime, partyId,
    table: 'party_runtime.party_obligations',
    trigger: 'party_obligation_current_immutable',
    selectSql: `SELECT obligation_id,witness_refs
                  FROM party_runtime.party_obligations
                 WHERE party_id=$1`,
    tamperSql: `UPDATE party_runtime.party_obligations
                   SET witness_refs='[]'::jsonb
                 WHERE party_id=$1`,
    restoreSql: `UPDATE party_runtime.party_obligations
                    SET witness_refs=$2::jsonb
                  WHERE party_id=$1 AND obligation_id=$3`,
    restoreValues: (row) => [
      JSON.stringify(row.witness_refs), row.obligation_id
    ]
  });
  await assertMutableRowTamperRejected({
    pool, runtime, partyId,
    table: 'party_runtime.party_obligation_transitions',
    trigger: 'party_obligation_transition_append_only',
    selectSql: `SELECT obligation_transition_id,causal_basis
                  FROM party_runtime.party_obligation_transitions
                 WHERE party_id=$1
                 ORDER BY transition_ordinal LIMIT 1`,
    tamperSql: `UPDATE party_runtime.party_obligation_transitions
                   SET causal_basis='{"committed_fact_ids":["tampered"]}'::jsonb
                 WHERE obligation_transition_id=(
                   SELECT obligation_transition_id
                     FROM party_runtime.party_obligation_transitions
                    WHERE party_id=$1
                    ORDER BY transition_ordinal LIMIT 1
                 )`,
    restoreSql: `UPDATE party_runtime.party_obligation_transitions
                    SET causal_basis=$2::jsonb
                  WHERE party_id=$1 AND obligation_transition_id=$3`,
    restoreValues: (row) => [
      JSON.stringify(row.causal_basis), row.obligation_transition_id
    ]
  });
  await assertMutableRowTamperRejected({
    pool, runtime, partyId,
    selectSql: `SELECT npc_id,semantic_state
                  FROM party_runtime.party_npcs
                 WHERE party_id=$1
                   AND semantic_state->>'participant_slot_ref'=
                     'ratsha_storehouse_helper'`,
    tamperSql: `UPDATE party_runtime.party_npcs
                   SET semantic_state=jsonb_set(
                     semantic_state,
                     '{surrender_fact}',
                     '"tampered"'::jsonb,
                     true
                   )
                 WHERE party_id=$1
                   AND semantic_state->>'participant_slot_ref'=
                     'ratsha_storehouse_helper'`,
    restoreSql: `UPDATE party_runtime.party_npcs
                    SET semantic_state=$2::jsonb
                  WHERE party_id=$1 AND npc_id=$3`,
    restoreValues: (row) => [
      JSON.stringify(row.semantic_state), row.npc_id
    ]
  });
  await assertMutableRowTamperRejected({
    pool, runtime, partyId,
    table: 'party_runtime.party_npc_decision_traces',
    trigger: 'temporal_append_only',
    selectSql: `SELECT request_id,option_id
                  FROM party_runtime.party_npc_decision_traces
                 WHERE party_id=$1
                   AND option_id IN (
                     'surrender_without_confession',
                     'surrender_and_confess'
                   )
                 ORDER BY request_id LIMIT 1`,
    tamperSql: `UPDATE party_runtime.party_npc_decision_traces
                   SET option_id='threaten_and_bargain'
                 WHERE request_id=(
                   SELECT request_id
                     FROM party_runtime.party_npc_decision_traces
                    WHERE party_id=$1
                      AND option_id IN (
                        'surrender_without_confession',
                        'surrender_and_confess'
                      )
                    ORDER BY request_id LIMIT 1
                 )`,
    restoreSql: `UPDATE party_runtime.party_npc_decision_traces
                    SET option_id=$2
                  WHERE party_id=$1 AND request_id=$3`,
    restoreValues: (row) => [row.option_id, row.request_id]
  });
}

async function assertMutableRowTamperRejected({
  pool,
  runtime,
  partyId,
  table,
  trigger,
  selectSql,
  tamperSql,
  restoreSql,
  restoreValues
}) {
  const original = (await pool.query(selectSql, [partyId])).rows;
  assert.equal(original.length, 1);
  if (table && trigger) {
    await pool.query(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`);
  }
  try {
    await pool.query(tamperSql, [partyId]);
    await assert.rejects(() => runtime.getPartyScreen(partyId), {
      code: 'TRACE_PHASE_2_SESSION_READ_INVALID'
    });
  } finally {
    await pool.query(restoreSql, [partyId, ...restoreValues(original[0])]);
    if (table && trigger) {
      await pool.query(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`);
    }
  }
}

async function assertRollbackRows(pool, partyId) {
  const rows = await Promise.all([
    count(pool, 'party_runtime.party_obligation_transitions', partyId),
    pool.query(
      `SELECT count(*)::int AS count
         FROM party_runtime.party_check_resolutions
        WHERE party_id=$1 AND left(check_resolution_id,length($2))=$2`,
      [partyId, `check:${partyId}:trace-phase4:`]
    ).then(({ rows: result }) => result[0].count),
    pool.query(
      `SELECT count(*)::int AS count
         FROM party_runtime.party_npc_decision_traces d
         JOIN party_runtime.party_v3_change_sets c
           ON c.party_id=d.party_id AND c.id=d.change_set_id
        WHERE d.party_id=$1 AND c.operation_kind='trace_phase_4_turn'`,
      [partyId]
    ).then(({ rows: result }) => result[0].count),
    pool.query(`SELECT o.owner_npc_id,o.controller_npc_id,p.holder_npc_id,p.physical_position,
                       COALESCE(
                         i.state->'property_state'->>'accessibility',
                         i.state->>'accessibility'
                       ) AS accessibility
                  FROM party_runtime.party_items i
                  JOIN party_runtime.party_item_placements p ON p.party_id=i.party_id AND p.item_id=i.item_id
                  JOIN party_runtime.party_ownership o ON o.party_id=i.party_id AND o.item_id=i.item_id
                 WHERE i.party_id=$1 AND i.template_id='trace_ld_v1_item_ratsha_knife'`, [partyId]),
    pool.query(`SELECT current_state FROM party_runtime.party_obligations WHERE party_id=$1`, [partyId])
  ]);
  assert.deepEqual(rows.slice(0, 3), [0, 0, 0]);
  assert.equal(rows[3].rows[0].holder_npc_id, rows[3].rows[0].owner_npc_id);
  assert.equal(rows[3].rows[0].controller_npc_id, rows[3].rows[0].owner_npc_id);
  assert.equal(rows[3].rows[0].physical_position, 'worn_quick');
  assert.equal(rows[3].rows[0].accessibility, 'quick');
  assert.deepEqual(rows[4].rows, [{ current_state: 'not_offered' }]);
}

async function installSchemas(pool) {
  const partyFiles = (await readdir('schemas/party-db'))
    .filter((value) => /^\d+.*\.sql$/u.test(value)).sort();
  const catalogMigrationIndex = partyFiles.findIndex((file) =>
    file.startsWith('012_')
  );
  assert.equal(catalogMigrationIndex, 11);
  for (const file of partyFiles.slice(0, catalogMigrationIndex)) {
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
  assert.equal((await runPartyRuntimeCatalogMigration(pool)).status, 'applied');
  for (const file of partyFiles.slice(catalogMigrationIndex)) {
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
}

async function installWorldLineage(pool) {
  await pool.query('CREATE SCHEMA IF NOT EXISTS world_base');
  await pool.query(`CREATE TABLE world_base.spatial_v3_world_revisions (
    id text PRIMARY KEY, parent_revision_id text REFERENCES world_base.spatial_v3_world_revisions(id),
    catalog_digest text NOT NULL, status text NOT NULL)`);
  await pool.query(`INSERT INTO world_base.spatial_v3_world_revisions
    (id,parent_revision_id,catalog_digest,status) VALUES
    ('novgorod_spatial_v3_target_contract_approval_001',NULL,'0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e','approved'),
    ('novgorod_spatial_v3_production_v2_candidate_001','novgorod_spatial_v3_target_contract_approval_001','fd75d9cb1ad0e949ff3b0bb5ef044e510f340a967f43867e9c4d41c16ba9f255','approved'),
    ('novgorod_spatial_v3_production_v3_candidate_001','novgorod_spatial_v3_production_v2_candidate_001','1cf914ed9a19801f94b8b1463a717dbb0be7f1d51ea2351e6d1d5a51c492215e','approved')`);
}

async function count(pool, table, partyId) {
  return (await pool.query(`SELECT count(*)::int AS count FROM ${table} WHERE party_id=$1`,
    [partyId])).rows[0].count;
}

async function position(pool, partyId) {
  return (await pool.query(
    'SELECT g4_id,g5_node_id,g5_anchor_id FROM party_runtime.party_positions WHERE party_id=$1',
    [partyId])).rows[0];
}

async function phase4RouteCount(pool, partyId) {
  return (await pool.query(
    `SELECT count(*)::int AS count FROM party_runtime.party_route_plans
      WHERE party_id=$1 AND id LIKE $2`,
    [partyId, `route-plan:${partyId}:trace-phase4:%`]
  )).rows[0].count;
}

async function waitForPostgres(name) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (docker(['exec', name, 'pg_isready']).status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('PostgreSQL did not become ready');
}
