import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

import {
  createSpatialV3PostgresCombinedAtomicCommitter
} from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import {
  firstPlayableCommitRecheck
} from '../../apps/game-server/src/infrastructure/postgres/first-playable/recheck.js';
import {
  createFirstPlayablePublicRuntime
} from '../../apps/game-server/src/runtime/first-playable-public-runtime.js';
import {
  recognizeFirstPlayableSemanticCommand
} from '../../apps/game-server/src/runtime/first-playable-semantic-recognizer.js';

const container =
  `lower-dvina-boundary-runtime-${randomUUID().slice(0, 12)}`;
const docker = (args, input) =>
  spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout: 45_000
  });
const hex = (letter) => letter.repeat(64);

test('boundary journey, outbound dispatch and reverse route persist atomically', async (t) => {
  if (docker(['version']).status !== 0) t.skip('Docker required');
  t.after(() => docker(['rm', '-f', container]));
  assert.equal(docker([
    'run', '-d', '--name', container, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=boundary',
    '-e', 'POSTGRES_USER=boundary',
    '-e', 'POSTGRES_DB=party',
    'postgres:16-alpine'
  ]).status, 0);
  let port;
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await new Promise((done) => setTimeout(done, 250));
    const mapping = docker(['port', container, '5432/tcp']).stdout.trim();
    if (mapping) {
      port = mapping.split(':').at(-1);
      if (docker([
        'exec', container, 'pg_isready',
        '-U', 'boundary', '-d', 'party'
      ]).status === 0) {
        await new Promise((done) => setTimeout(done, 750));
        if (docker([
          'exec', container, 'pg_isready',
          '-U', 'boundary', '-d', 'party'
        ]).status === 0) {
          ready = true;
          break;
        }
      }
    }
  }
  assert.equal(ready, true);
  const { SPATIAL_V3_TARGET_MIGRATIONS: migrations } = await import(
    '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js'
  );
  const migrated = docker([
    'exec', '-i', container, 'psql', '-q', '-v', 'ON_ERROR_STOP=1',
    '-U', 'boundary', '-d', 'party'
  ], migrations.join('\n'));
  assert.equal(migrated.status, 0, migrated.stderr);
  const pool = new pg.Pool({
    connectionString:
      `postgres://boundary:boundary@127.0.0.1:${port}/party`
  });
  t.after(() => pool.end());
  await pool.query(await readFile(
    'tools/runtime-catalog-activation/migrations/party/001_runtime_catalog_pins.sql',
    'utf8'
  ));
  const release = {
    release_id: 'spatial-v3-production-v3',
    world_revision_id:
      'novgorod_spatial_v3_production_v3_candidate_001',
    world_catalog_digest: hex('a'),
    production_activation: false,
    boundary_crossing_capability: 'ready_for_runtime_acceptance'
  };
  const pin = {
    catalog_scope: 'item_container_materialization_v2',
    catalog_revision_id:
      'world_revision_novgorod_1230_item_container_approved_001',
    catalog_digest: hex('b'),
    activation_event_id: 'activation:test',
    import_id: 'import:test',
    import_audit_digest: hex('c'),
    record_registry_digest: hex('d'),
    runtime_contract_digest: hex('e'),
    compatible_world_revision_id: release.world_revision_id,
    compatible_world_catalog_digest: release.world_catalog_digest,
    compatible_world_pin_manifest_digest: hex('f')
  };
  const committer = createSpatialV3PostgresCombinedAtomicCommitter({
    pool,
    recheck: firstPlayableCommitRecheck
  });
  const runtime = createFirstPlayablePublicRuntime({
    partyPool: pool,
    committer,
    release,
    runtimeCatalogPin: pin
  });
  const started = await runtime.startNewGame({
    scenario_id: 'lower_dvina_late_summer_open_water_v1',
    request_id: 'boundary-new-game'
  });
  await runtime.acknowledgeOpening(started.party_id, {
    client_ack_id: 'boundary-ack'
  });
  await runtime.submitTurn(started.party_id, {
    selected_action_option_id: 'action:move',
    request_id: 'boundary-move'
  });
  await runtime.submitTurn(started.party_id, {
    selected_action_option_id: 'action:board',
    request_id: 'boundary-board'
  });
  const approached = await runtime.submitTurn(started.party_id, {
    selected_action_option_id: 'action:journey_to_boundary',
    request_id: 'boundary-approach'
  });
  assert.equal(
    approached.screen.visible_context.place,
    'южный пограничный якорь yp026'
  );
  assert.equal(approached.screen.visible_context.time_minutes, 505);
  await runtime.submitTurn(started.party_id, {
    selected_action_option_id: 'action:save',
    request_id: 'boundary-anchor-save'
  });
  const restarted = createFirstPlayablePublicRuntime({
    partyPool: pool,
    committer,
    release,
    runtimeCatalogPin: pin
  });
  const restored = await restarted.getPartyScreen(started.party_id);
  assert.equal(
    restored.screen.visible_context.place,
    'южный пограничный якорь yp026'
  );
  await appendConditionTimeline(
    pool,
    started.party_id,
    [{
      effective_after_minutes: 0,
      snapshot: approvedBoundaryCondition({
        daylight_state: 'dark'
      })
    }]
  );
  const beforeDarkness = await boundaryMutationEvidence(
    pool,
    started.party_id
  );
  await assert.rejects(
    restarted.submitTurn(started.party_id, {
      selected_action_option_id: 'action:cross_boundary',
      request_id: 'boundary-darkness-block'
    }),
    (error) => error.code === 'BOUNDARY_DAYLIGHT_REQUIRED'
  );
  assert.deepEqual(
    await boundaryMutationEvidence(pool, started.party_id),
    beforeDarkness
  );
  const adverseSnapshot = await appendConditionTimeline(
    pool,
    started.party_id,
    [{
      effective_after_minutes: 0,
      snapshot: approvedBoundaryCondition({
        current_band: 'moderate_cross'
      })
    }]
  );
  const failedRequestId = findFailingBoundaryRequest({
    partyId: started.party_id,
    state: adverseSnapshot.state,
    stateVersion: adverseSnapshot.stateVersion,
    scope: 'activation:0'
  });
  const beforeFailure = await boundaryMutationEvidence(
    pool,
    started.party_id
  );
  await assert.rejects(
    restarted.submitTurn(started.party_id, {
      selected_action_option_id: 'action:cross_boundary',
      request_id: failedRequestId
    }),
    (error) => {
      assert.equal(error.code, 'BOUNDARY_PRE_DISPATCH_CHECK_FAILED');
      assert.equal(error.details.elapsed_minutes, 0);
      assert.equal(error.details.context_switched, false);
      assert.equal(error.details.outgoing_traversal_created, false);
      return true;
    }
  );
  const afterFailure = await boundaryMutationEvidence(
    pool,
    started.party_id
  );
  assert.deepEqual(afterFailure, beforeFailure);
  await appendConditionTimeline(pool, started.party_id, [{
    effective_after_minutes: 0,
    snapshot: approvedBoundaryCondition()
  }]);
  const crossed = await restarted.submitTurn(started.party_id, {
    selected_action_option_id: 'action:cross_boundary',
    request_id: 'boundary-forward-dispatch'
  });
  assert.equal(
    crossed.screen.visible_context.place,
    'принимающий водный плёс Нижней Двины'
  );
  assert.equal(crossed.screen.visible_context.time_minutes, 535);
  const reverseApproach = await restarted.submitTurn(started.party_id, {
    selected_action_option_id: 'action:journey_to_boundary',
    request_id: 'boundary-reverse-approach'
  });
  assert.equal(reverseApproach.screen.visible_context.time_minutes, 555);
  const reversed = await restarted.submitTurn(started.party_id, {
    selected_action_option_id: 'action:cross_boundary',
    request_id: 'boundary-reverse-dispatch'
  });
  assert.equal(reversed.screen.visible_context.time_minutes, 565);
  const evidence = (await pool.query(
    `SELECT
       (SELECT count(*)::int
          FROM party_runtime.party_traversal_interval_results r
          JOIN party_runtime.party_route_plan_executions e
            ON e.id=r.route_plan_execution_id
         WHERE e.party_id=$1) AS intervals,
       (SELECT count(*)::int
          FROM party_runtime.party_g5_sites
         WHERE party_id=$1
           AND id LIKE '%yp025-navigation') AS receiving_sites,
       (SELECT count(*)::int
          FROM party_runtime.party_transit_anchors
         WHERE party_id=$1 AND status='active') AS anchors,
       (SELECT count(*)::int
          FROM party_runtime.party_journey_locations
         WHERE party_id=$1 AND owner_kind='actor') AS actor_roots,
       (SELECT count(*)::int
          FROM party_runtime.party_carrier_attachments
         WHERE party_id=$1 AND subject_kind='actor'
           AND status='active') AS attachments,
       (SELECT scene_template_ref->>'version'
          FROM party_runtime.party_scene_baselines
         WHERE party_id=$1
           AND id LIKE '%yp025-navigation') AS receiving_template_version,
       (SELECT scene_template_ref->>'version'
          FROM party_runtime.party_scene_baselines
         WHERE party_id=$1
           AND id LIKE '%yp026-south-entry') AS source_template_version`,
    [started.party_id]
  )).rows[0];
  assert.deepEqual(evidence, {
    intervals: 14,
    receiving_sites: 1,
    anchors: 1,
    actor_roots: 0,
    attachments: 1,
    receiving_template_version: '2',
    source_template_version: '2'
  });

  const paused = await runtime.startNewGame({
    scenario_id: 'lower_dvina_late_summer_open_water_v1',
    request_id: 'boundary-paused-new-game'
  });
  await runtime.acknowledgeOpening(paused.party_id, {
    client_ack_id: 'boundary-paused-ack'
  });
  await runtime.submitTurn(paused.party_id, {
    selected_action_option_id: 'action:move',
    request_id: 'boundary-paused-move'
  });
  await runtime.submitTurn(paused.party_id, {
    selected_action_option_id: 'action:board',
    request_id: 'boundary-paused-board'
  });
  await runtime.submitTurn(paused.party_id, {
    selected_action_option_id: 'action:journey_to_boundary',
    request_id: 'boundary-paused-approach'
  });
  const pausedSnapshot = await appendConditionTimeline(
    pool,
    paused.party_id,
    [
      {
        effective_after_minutes: 0,
        snapshot: approvedBoundaryCondition()
      },
      {
        effective_after_minutes: 15,
        snapshot: approvedBoundaryCondition({
          current_band: 'moderate_cross'
        })
      }
    ]
  );
  const pausedRequestId = findFailingBoundaryRequest({
    partyId: paused.party_id,
    state: pausedSnapshot.state,
    stateVersion: pausedSnapshot.stateVersion,
    scope:
      'recheck:wrsegv3__lower_dvina_yp026_to_yp025__01:15'
  });
  const partial = await runtime.submitTurn(paused.party_id, {
    selected_action_option_id: 'action:cross_boundary',
    request_id: pausedRequestId
  });
  assert.equal(
    partial.screen.visible_context.place,
    'в пути через пограничный речной сегмент'
  );
  assert.equal(partial.screen.visible_context.time_minutes, 525);
  assert.equal(partial.screen.panels.character.data.energy, 78);
  assert.deepEqual(
    partial.screen.panels.character.data.conditions,
    ['wet']
  );
  const partialEvidence = (await pool.query(
    `SELECT
       (SELECT count(*)::int
          FROM party_runtime.party_traversal_interval_results i
          JOIN party_runtime.party_route_plan_executions e
            ON e.id=i.route_plan_execution_id
         WHERE e.party_id=$1
           AND i.result_kind IN ('progressed','paused_in_transit'))
         AS partial_intervals,
       (SELECT segment_progress_ppm
          FROM party_runtime.traveller_travel_states t
         WHERE t.party_id=$1 AND t.status='paused_in_transit')
         AS progress_ppm,
       (SELECT status
          FROM party_runtime.party_route_plan_executions e
         WHERE e.party_id=$1 AND e.status='active')
         AS execution_status,
       (SELECT id
          FROM party_runtime.party_route_plan_executions e
         WHERE e.party_id=$1 AND e.status='active')
         AS execution_id,
       (SELECT location_kind
          FROM party_runtime.party_journey_locations l
         WHERE l.party_id=$1 AND l.owner_kind='transport')
         AS location_kind,
       (SELECT active_side
          FROM party_runtime.party_transit_anchors a
         WHERE a.party_id=$1 AND a.status='active')
         AS active_side,
       (SELECT energy
          FROM party_runtime.party_actor_body_states b
         WHERE b.party_id=$1 AND b.actor_kind='player_character')
         AS body_energy,
       (SELECT count(*)::int
          FROM party_runtime.party_actor_active_conditions c
         WHERE c.party_id=$1 AND c.condition_id='wet'
           AND c.status='active') AS wet_conditions`,
    [paused.party_id]
  )).rows[0];
  const {
    execution_id: pausedExecutionId,
    ...partialFacts
  } = partialEvidence;
  assert.match(pausedExecutionId, /^route-execution:/u);
  assert.deepEqual(partialFacts, {
    partial_intervals: 2,
    progress_ppm: 500000,
    execution_status: 'active',
    location_kind: 'in_transit',
    active_side: 'forward_departure_side',
    body_energy: '78',
    wet_conditions: 1
  });
  const resumedRuntime = createFirstPlayablePublicRuntime({
    partyPool: pool,
    committer,
    release,
    runtimeCatalogPin: pin
  });
  const pausedScreen = await resumedRuntime.getPartyScreen(
    paused.party_id
  );
  assert.ok(pausedScreen.screen.action_panel.suggested_actions.some(
    ({ option_id: optionId }) =>
      optionId === 'action:resume_boundary_traversal'
  ));
  await appendConditionTimeline(pool, paused.party_id, [{
    effective_after_minutes: 0,
    snapshot: approvedBoundaryCondition()
  }]);
  const executionCountBeforeResume = (await pool.query(
    `SELECT count(*)::int AS count
       FROM party_runtime.party_route_plan_executions
      WHERE party_id=$1`,
    [paused.party_id]
  )).rows[0].count;
  const resumed = await resumedRuntime.submitTurn(paused.party_id, {
    selected_action_option_id:
      'action:resume_boundary_traversal',
    request_id: 'boundary-paused-resume'
  });
  assert.equal(
    resumed.screen.visible_context.place,
    'принимающий водный плёс Нижней Двины'
  );
  assert.equal(resumed.screen.visible_context.time_minutes, 540);
  const resumeEvidence = (await pool.query(
    `SELECT
       (SELECT count(*)::int
          FROM party_runtime.party_route_plan_executions
         WHERE party_id=$1) AS execution_count,
       (SELECT status
          FROM party_runtime.party_route_plan_executions
         WHERE party_id=$1 AND id=$2)
         AS execution_status,
       (SELECT status
          FROM party_runtime.traveller_travel_states
         WHERE party_id=$1
           AND route_plan_execution_id=$2) AS travel_status,
       (SELECT count(*)::int
          FROM party_runtime.party_traversal_interval_results i
          JOIN party_runtime.party_route_plan_executions e
            ON e.id=i.route_plan_execution_id
         WHERE e.party_id=$1
           AND e.id=$2) AS interval_count,
       (SELECT count(*)::int
          FROM party_runtime.party_g5_sites
         WHERE party_id=$1 AND id LIKE '%yp025-navigation')
         AS receiving_sites`,
    [
      paused.party_id,
      pausedExecutionId
    ]
  )).rows[0];
  assert.deepEqual(resumeEvidence, {
    execution_count: executionCountBeforeResume,
    execution_status: 'completed',
    travel_status: 'closed',
    interval_count: 3,
    receiving_sites: 1
  });
});

async function appendConditionTimeline(pool, partyId, timeline) {
  const loaded = (await pool.query(
    `SELECT p.state_version,ss.state_payload
       FROM party_runtime.parties p
       JOIN party_runtime.party_state_snapshots ss
         ON ss.party_id=p.party_id
        AND ss.state_version=p.state_version
      WHERE p.party_id=$1`,
    [partyId]
  )).rows[0];
  const state = structuredClone(loaded.state_payload);
  state.boundary_condition_timeline = timeline;
  const stateVersion = Number(loaded.state_version) + 1;
  const stateDigest = createHash('sha256')
    .update(JSON.stringify(state))
    .digest('hex');
  await pool.query('BEGIN');
  try {
    await pool.query(
      `INSERT INTO party_runtime.party_state_snapshots
         (party_id,state_version,state_payload,state_digest)
       VALUES ($1,$2,$3::jsonb,$4)`,
      [partyId, stateVersion, JSON.stringify(state), stateDigest]
    );
    await pool.query(
      `UPDATE party_runtime.parties
          SET state_version=$2
        WHERE party_id=$1 AND state_version=$3`,
      [partyId, stateVersion, Number(loaded.state_version)]
    );
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
  return { state, stateVersion };
}

function findFailingBoundaryRequest({
  partyId,
  state,
  stateVersion,
  scope
}) {
  for (let ordinal = 0; ordinal < 100; ordinal += 1) {
    const requestId = `boundary-failed-dispatch-${ordinal}`;
    const recognized = recognizeFirstPlayableSemanticCommand({
      partyId,
      actorId: state.player.id,
      selectedActionOptionId: 'action:cross_boundary',
      visibleEntityRefs: [],
      currentLocation: state.location,
      currentBoundaryDirection: state.boundary_dispatch_direction,
      baseStateVersion: stateVersion,
      requestId,
      idempotencyKey: requestId,
      dependencyPins: state.exact_pins
    });
    const rollValue =
      (Number.parseInt(createHash('sha256')
        .update(
          `${recognized.command.canonical_digest}:boundary-d20:${scope}`
        )
        .digest('hex')
        .slice(0, 8), 16) % 20) + 1;
    const modifier = Number(state.player.skills.travel_transport ?? 0);
    if (rollValue + modifier < 10) return requestId;
  }
  throw new Error('Unable to derive deterministic failed boundary request.');
}

async function boundaryMutationEvidence(pool, partyId) {
  return (await pool.query(
    `SELECT p.state_version,c.whole_minutes,
            (SELECT count(*)::int
               FROM party_runtime.party_route_plan_executions e
              WHERE e.party_id=p.party_id) AS execution_count
       FROM party_runtime.parties p
       JOIN party_runtime.party_clocks c ON c.party_id=p.party_id
      WHERE p.party_id=$1`,
    [partyId]
  )).rows[0];
}

function approvedBoundaryCondition(overrides = {}) {
  return {
    availability_policy_ref: {
      entity_kind: 'traversal_availability_policy',
      entity_id: 'availability.lower_dvina_late_summer_daylight_v1',
      version: 1
    },
    season_mode: 'late_summer_open_water',
    daylight_state: 'daylight',
    water_surface_state: 'open_water',
    wind_band: 'calm',
    visibility_band: 'clear',
    craft_state: 'serviceable',
    load_state: 'within_approved_capacity',
    controller_state: 'approved_boatman_in_control',
    current_band: 'calm',
    craft_control_state: 'stable',
    landmark_confidence: 'sufficient',
    ...overrides
  };
}
