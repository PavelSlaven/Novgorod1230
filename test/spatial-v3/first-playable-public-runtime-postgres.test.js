import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { validateActorBaseAppearance } from '@rus/actors';

import {
  createFirstPlayablePublicRuntime
} from '../../apps/game-server/src/runtime/first-playable-public-runtime.js';
import {
  createSpatialV3PostgresCombinedAtomicCommitter
} from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import {
  firstPlayableCommitRecheck
} from '../../apps/game-server/src/runtime/releases/spatial-v3-production-v2-bindings.js';
import {
  recognizeFirstPlayableSemanticCommand
} from '../../apps/game-server/src/runtime/first-playable-semantic-recognizer.js';
import {
  ACTIVITY_PROFILES
} from '../../apps/game-server/src/runtime/first-playable/shared.js';
import {
  assertNoHiddenFields
} from '../../apps/game-web/src/api/contracts.js';

const container = `first-playable-runtime-${randomUUID().slice(0, 12)}`;
const docker = (args, input) =>
  spawnSync('docker', args, { input, encoding: 'utf8', timeout: 45_000 });
const hex = (letter) => letter.repeat(64);
const sha256 = (value) =>
  createHash('sha256').update(String(value)).digest('hex');

test('local first playable persists exact state, enrichment and ownership across restart', async (t) => {
  if (docker(['version']).status !== 0) t.skip('Docker required');
  t.after(() => docker(['rm', '-f', container]));
  assert.equal(docker([
    'run', '-d', '--name', container, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=first_playable',
    '-e', 'POSTGRES_USER=first_playable',
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
      if (docker(['exec', container, 'pg_isready', '-U', 'first_playable', '-d', 'party']).status === 0) {
        await new Promise((done) => setTimeout(done, 750));
        if (docker(['exec', container, 'pg_isready', '-U', 'first_playable', '-d', 'party']).status === 0) {
          ready = true;
          break;
        }
      }
    }
  }
  assert.ok(port);
  assert.equal(ready, true);
  const migrations = (await import(
    '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js'
  )).SPATIAL_V3_TARGET_MIGRATIONS;
  const migrated = docker([
    'exec', '-i', container, 'psql', '-q', '-v', 'ON_ERROR_STOP=1',
    '-U', 'first_playable', '-d', 'party'
  ], migrations.join('\n'));
  assert.equal(migrated.status, 0, migrated.stderr);
  const pool = new pg.Pool({
    connectionString: `postgres://first_playable:first_playable@127.0.0.1:${port}/party`
  });
  t.after(() => pool.end());
  await pool.query(await readFile(
    'tools/runtime-catalog-activation/migrations/party/001_runtime_catalog_pins.sql',
    'utf8'
  ));
  const release = {
    release_id: 'spatial-v3-production-v2',
    world_revision_id: 'novgorod_spatial_v3_production_v2_candidate_001',
    world_catalog_digest: hex('a'),
    production_activation: false
  };
  const pin = {
    catalog_scope: 'item_container_materialization_v2',
    catalog_revision_id: 'world_revision_novgorod_1230_item_container_approved_001',
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
  const ids = ['new'];
  const committer = createSpatialV3PostgresCombinedAtomicCommitter({
    pool,
    recheck: firstPlayableCommitRecheck
  });
  const runtime = createFirstPlayablePublicRuntime({
    partyPool: pool,
    committer,
    release,
    runtimeCatalogPin: pin,
    idFactory: () => ids.shift(),
    now: () => '2026-08-20T12:00:00.000Z'
  });
  const started = await runtime.startNewGame({
    scenario_id: 'lower_dvina_late_summer_open_water_v1',
    request_id: 'new-game-e2e'
  });
  await runtime.acknowledgeOpening(started.party_id, { client_ack_id: 'ack' });
  await runtime.submitTurn(started.party_id, {
    selected_action_option_id: 'action:look',
    request_id: 'look'
  });
  const moved = await runtime.submitTurn(started.party_id, {
    selected_action_option_id: 'action:move',
    request_id: 'move'
  });
  assert.doesNotThrow(() => assertNoHiddenFields(moved));
  const landingRepositoryState = await runtimeState(pool, started.party_id);
  assert.equal(landingRepositoryState.landing_materialized, true);
  assert.equal(validateActorBaseAppearance(
    landingRepositoryState.npc.identity).ok, true);
  const landingNpc = (await pool.query(
    `SELECT identity_state
       FROM party_runtime.party_npcs
      WHERE party_id=$1 AND npc_id=$2`,
    [started.party_id, `npc:${started.party_id}:fisher`]
  )).rows[0];
  assert.equal(validateActorBaseAppearance(landingNpc.identity_state).ok, true);
  assert.equal(landingNpc.identity_state.appearance_contract_version,
    'actor_base_appearance_v1');
  const landingItems = (await pool.query(
    `SELECT i.item_id,i.state,p.holder_npc_id,p.physical_position,
            p.equipment_slot_category_id,o.owner_npc_id,o.controller_npc_id
       FROM party_runtime.party_items i
       JOIN party_runtime.party_item_placements p
         ON p.party_id=i.party_id AND p.item_id=i.item_id
       JOIN party_runtime.party_ownership o
         ON o.party_id=i.party_id AND o.item_id=i.item_id
      WHERE i.party_id=$1
        AND i.item_id = ANY($2::text[])
      ORDER BY i.item_id`,
    [started.party_id, [
      `item:${started.party_id}:fisher:fishing-net`,
      `item:${started.party_id}:fisher:linen-shirt`,
      `item:${started.party_id}:fisher:wool-outer-garment`
    ]]
  )).rows;
  assert.deepEqual(landingItems.map((item) => ({
    item_id: item.item_id,
    holder_npc_id: item.holder_npc_id,
    physical_position: item.physical_position,
    equipment_slot_category_id: item.equipment_slot_category_id,
    owner_npc_id: item.owner_npc_id,
    controller_npc_id: item.controller_npc_id,
    visual_slot: item.state.visual_profile_snapshot?.equipment_slot ?? null
  })), [
    {
      item_id: `item:${started.party_id}:fisher:fishing-net`,
      holder_npc_id: `npc:${started.party_id}:fisher`,
      physical_position: 'hands',
      equipment_slot_category_id: null,
      owner_npc_id: `npc:${started.party_id}:fisher`,
      controller_npc_id: `npc:${started.party_id}:fisher`,
      visual_slot: null
    },
    {
      item_id: `item:${started.party_id}:fisher:linen-shirt`,
      holder_npc_id: `npc:${started.party_id}:fisher`,
      physical_position: 'equipped',
      equipment_slot_category_id: 'base_garment',
      owner_npc_id: `npc:${started.party_id}:fisher`,
      controller_npc_id: `npc:${started.party_id}:fisher`,
      visual_slot: 'base_garment'
    },
    {
      item_id: `item:${started.party_id}:fisher:wool-outer-garment`,
      holder_npc_id: `npc:${started.party_id}:fisher`,
      physical_position: 'equipped',
      equipment_slot_category_id: 'outer_garment',
      owner_npc_id: `npc:${started.party_id}:fisher`,
      controller_npc_id: `npc:${started.party_id}:fisher`,
      visual_slot: 'outer_garment'
    }
  ]);
  const landingBasket = (await pool.query(
    `SELECT c.holder_npc_id,c.physical_position,o.owner_npc_id,
            o.controller_npc_id,e.placement_kind,e.host_entity_ref
       FROM party_runtime.party_containers c
       JOIN party_runtime.party_ownership o
         ON o.party_id=c.party_id AND o.container_id=c.container_id
       JOIN party_runtime.entity_placements e
         ON e.party_id=c.party_id AND e.entity_kind='container'
        AND e.entity_id=c.container_id
      WHERE c.party_id=$1 AND c.container_id=$2`,
    [started.party_id,
      `container:${started.party_id}:fisher-basket`]
  )).rows[0];
  assert.deepEqual(landingBasket, {
    holder_npc_id: `npc:${started.party_id}:fisher`,
    physical_position: 'external',
    owner_npc_id: `npc:${started.party_id}:fisher`,
    controller_npc_id: `npc:${started.party_id}:fisher`,
    placement_kind: 'attached_to_entity',
    host_entity_ref: {
      version: 1,
      entity_kind: 'npc',
      entity_id: `npc:${started.party_id}:fisher`
    }
  });
  const landingRestart = createFirstPlayablePublicRuntime({
    partyPool: pool,
    committer,
    release,
    runtimeCatalogPin: pin
  });
  const landingScreen = await landingRestart.getPartyScreen(started.party_id);
  assert.equal(landingScreen.turn_number, 2);
  assert.equal(landingScreen.screen.visible_context.place,
    'посадочная кромка');
  const talked = await runtime.submitTurn(started.party_id, {
    selected_action_option_id: 'action:talk',
    request_id: 'talk'
  });
  assert.match(talked.screen.main_prose, /отвечает/u);
  const conversationSnapshot = (await pool.query(
    `SELECT activity_snapshot
     FROM party_runtime.party_timed_activity_executions
     WHERE id=$1`,
    [`activity:${started.party_id}:3`]
  )).rows[0].activity_snapshot;
  assert.deepEqual(
    conversationSnapshot.resolved_profile,
    ACTIVITY_PROFILES.find((profile) =>
      profile.activity_profile_id ===
        'activity_conversation_brief_v1')
  );
  assert.equal(
    conversationSnapshot.applicability_resolution.result,
    'single_approved_profile'
  );
  assert.equal(
    typeof conversationSnapshot.canonical_digest,
    'string'
  );
  const water = await runtime.submitTurn(started.party_id, {
    selected_action_option_id: 'action:collect_water',
    request_id: 'water'
  });
  assert.equal(water.screen.panels.inventory.data.water_ml, 1000);
  await runtime.submitTurn(started.party_id, {
    selected_action_option_id: 'action:give',
    request_id: 'give'
  });
  const worked = await runtime.submitTurn(started.party_id, {
    selected_action_option_id: 'action:perform_simple_work',
    request_id: 'work'
  });
  assert.equal(worked.screen.panels.people.data.relation, 1);
  const controls = await pool.query(
    `SELECT owner_ref,holder_ref,controller_ref
     FROM party_runtime.party_entity_controls
     WHERE party_id=$1 AND entity_id=$2`,
    [started.party_id, `item:${started.party_id}:rope`]
  );
  assert.equal(controls.rows[0].owner_ref.entity_kind, 'actor');
  assert.equal(controls.rows[0].holder_ref.entity_kind, 'actor');
  const relation = await pool.query(
    `SELECT causal_evidence_kind,causal_evidence_ref,relation_state
     FROM party_runtime.party_actor_relations WHERE party_id=$1`,
    [started.party_id]
  );
  assert.equal(relation.rows[0].causal_evidence_kind, 'terminal_activity_attempt');
  assert.equal(relation.rows[0].causal_evidence_ref.attempt_ordinal, 0);
  assert.equal(relation.rows[0].relation_state.value, 1);
  const resource = await pool.query(
    `SELECT quantity_numerator::int AS quantity
     FROM party_runtime.party_resource_nodes
     WHERE party_id=$1 AND resource_node_id=$2`,
    [started.party_id, `resource:${started.party_id}:surface-water`]
  );
  assert.equal(resource.rows[0].quantity, 99_000);
  const binding = await pool.query(
    `SELECT binding_kind,consumption_policy_ref
     FROM party_runtime.party_activity_resource_bindings
     WHERE resource_id=$1`,
    [`item:${started.party_id}:rope`]
  );
  assert.equal(binding.rows[0].binding_kind, 'required_tool');
  assert.equal(
    binding.rows[0].consumption_policy_ref.entity_id,
    'resource_policy_temporary_rope_holder_v1'
  );
  const interactions = await pool.query(
    'SELECT count(*)::int AS count FROM party_runtime.party_actor_npc_interactions WHERE party_id=$1',
    [started.party_id]
  );
  assert.equal(interactions.rows[0].count, 1);
  const visiblePackages = await pool.query(
    `SELECT count(*)::int AS count,
            bool_and(presentation_status='pending') AS all_pending
     FROM party_runtime.party_visible_packages
     WHERE party_id=$1`,
    [started.party_id]
  );
  assert.deepEqual(visiblePackages.rows[0], {
    count: 6,
    all_pending: true
  });
  await runtime.submitTurn(started.party_id, {
    selected_action_option_id: 'action:board',
    request_id: 'board'
  });
  const boarded = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM party_runtime.party_journey_locations
        WHERE party_id=$1 AND owner_kind='actor') AS actor_roots,
       (SELECT count(*)::int FROM party_runtime.party_carrier_attachments
        WHERE party_id=$1 AND subject_kind='actor' AND status='active') AS attachments,
       (SELECT count(*)::int FROM party_runtime.party_actor_carrier_positions
        WHERE party_id=$1 AND status='active') AS carrier_positions`,
    [started.party_id]
  );
  assert.deepEqual(boarded.rows[0], {
    actor_roots: 0,
    attachments: 1,
    carrier_positions: 0
  });
  const restarted = createFirstPlayablePublicRuntime({
    partyPool: pool,
    committer,
    release,
    runtimeCatalogPin: pin
  });
  const restored = await restarted.getPartyScreen(started.party_id);
  assert.equal(restored.screen.panels.inventory.data.water_ml, 1000);
  assert.equal(restored.screen.panels.people.data.relation, 1);
  await restarted.submitTurn(started.party_id, {
    selected_action_option_id: 'action:alight',
    request_id: 'alight'
  });
  const alighted = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM party_runtime.party_journey_locations
        WHERE party_id=$1 AND owner_kind='actor') AS actor_roots,
       (SELECT count(*)::int FROM party_runtime.party_carrier_attachments
        WHERE party_id=$1 AND subject_kind='actor' AND status='active') AS attachments`,
    [started.party_id]
  );
  assert.deepEqual(alighted.rows[0], { actor_roots: 1, attachments: 0 });
  const p16Evidence = (await pool.query(
    `SELECT
       count(*)::int AS count,
       bool_and(jsonb_array_length(expected_state_version_set)>0)
         AS every_turn_has_cas,
       bool_and(write_plan_digest<>'') AS every_turn_has_plan
     FROM party_runtime.party_v3_change_sets
     WHERE party_id=$1 AND operation_kind<>'new_game'`,
    [started.party_id]
  )).rows[0];
  assert.equal(p16Evidence.count, 8);
  assert.equal(p16Evidence.every_turn_has_cas, true);
  assert.equal(p16Evidence.every_turn_has_plan, true);

  const ropeGuard = await runtime.startNewGame({
    scenario_id: 'lower_dvina_late_summer_open_water_v1',
    request_id: 'new-game-rope-guard'
  });
  await runtime.acknowledgeOpening(ropeGuard.party_id, {
    client_ack_id: 'rope-guard-ack'
  });
  await runtime.submitTurn(ropeGuard.party_id, {
    selected_action_option_id: 'action:move',
    request_id: 'rope-guard-move'
  });
  await assert.rejects(
    runtime.submitTurn(ropeGuard.party_id, {
      selected_action_option_id: 'action:perform_simple_work',
      request_id: 'rope-guard-direct-work'
    }),
    { code: 'RESOURCE_BINDING_RECHECK_FAILED' }
  );
  await runtime.submitTurn(ropeGuard.party_id, {
    selected_action_option_id: 'action:give',
    request_id: 'rope-guard-give'
  });
  await pool.query(
    `UPDATE party_runtime.party_entity_controls
     SET holder_ref=$2::jsonb,controller_ref=$2::jsonb,
         state_version=state_version+1
     WHERE party_id=$1 AND entity_kind='item'
       AND entity_id=$3`,
    [
      ropeGuard.party_id,
      JSON.stringify({
        entity_kind: 'actor',
        entity_id: `actor:${ropeGuard.party_id}:player`
      }),
      `item:${ropeGuard.party_id}:rope`
    ]
  );
  const beforeRejectedWork = (await pool.query(
    `SELECT state_version
     FROM party_runtime.parties WHERE party_id=$1`,
    [ropeGuard.party_id]
  )).rows[0].state_version;
  await assert.rejects(
    runtime.submitTurn(ropeGuard.party_id, {
      selected_action_option_id: 'action:perform_simple_work',
      request_id: 'rope-guard-stale-work'
    }),
    { code: 'STATE_VERSION_CONFLICT' }
  );
  const rejectedWorkEvidence = (await pool.query(
    `SELECT
       (SELECT state_version FROM party_runtime.parties
        WHERE party_id=$1) AS party_state_version,
       (SELECT count(*)::int
        FROM party_runtime.party_timed_activity_executions
        WHERE id LIKE 'activity:' || $1 || ':%') AS activities,
       (SELECT holder_ref->>'entity_kind'
        FROM party_runtime.party_entity_controls
        WHERE party_id=$1 AND entity_id=$2) AS holder_kind`,
    [ropeGuard.party_id, `item:${ropeGuard.party_id}:rope`]
  )).rows[0];
  assert.equal(
    rejectedWorkEvidence.party_state_version,
    beforeRejectedWork
  );
  assert.equal(rejectedWorkEvidence.activities, 0);
  assert.equal(rejectedWorkEvidence.holder_kind, 'actor');

  const staleParty = await runtime.startNewGame({
    scenario_id: 'lower_dvina_late_summer_open_water_v1',
    request_id: 'new-game-stale-cas'
  });
  await runtime.acknowledgeOpening(staleParty.party_id, {
    client_ack_id: 'stale-cas-ack'
  });
  const staleRuntime = createFirstPlayablePublicRuntime({
    partyPool: pool,
    release,
    runtimeCatalogPin: pin,
    committer: {
      commit: async (input) => {
        await pool.query(
          `UPDATE party_runtime.parties
           SET state_version=state_version+1
           WHERE party_id=$1`,
          [staleParty.party_id]
        );
        return committer.commit(input);
      }
    }
  });
  await assert.rejects(
    staleRuntime.submitTurn(staleParty.party_id, {
      selected_action_option_id: 'action:look',
      request_id: 'stale-cas-look'
    }),
    { code: 'STATE_VERSION_CONFLICT' }
  );
  const staleEvidence = (await pool.query(
    `SELECT
       (SELECT count(*)::int FROM party_runtime.party_state_snapshots
        WHERE party_id=$1) AS snapshots,
       (SELECT count(*)::int FROM party_runtime.party_visible_packages
        WHERE party_id=$1) AS visible_packages,
       (SELECT count(*)::int FROM party_runtime.party_v3_change_sets
        WHERE party_id=$1) AS change_sets`,
    [staleParty.party_id]
  )).rows[0];
  assert.deepEqual(staleEvidence, {
    snapshots: 1,
    visible_packages: 0,
    change_sets: 1
  });

  const riskyStarted = await runtime.startNewGame({
    scenario_id: 'lower_dvina_late_summer_open_water_v1',
    request_id: 'new-game-risk-e2e'
  });
  await runtime.acknowledgeOpening(riskyStarted.party_id, {
    client_ack_id: 'risk-ack'
  });
  const riskStateResult = await pool.query(
    `SELECT state_payload
     FROM party_runtime.party_state_snapshots
     WHERE party_id=$1 AND state_version=0`,
    [riskyStarted.party_id]
  );
  const riskState = riskStateResult.rows[0].state_payload;
  let failedRequestId = null;
  for (let candidate = 0; candidate < 100; candidate += 1) {
    const requestId = `risk-failure-${candidate}`;
    const recognized = recognizeFirstPlayableSemanticCommand({
      partyId: riskyStarted.party_id,
      actorId: riskState.player.id,
      selectedActionOptionId: 'action:move_risky',
      visibleEntityRefs: [],
      currentLocation: 'high_platform',
      baseStateVersion: 0,
      requestId,
      idempotencyKey: requestId,
      dependencyPins: riskState.exact_pins
    });
    assert.equal(recognized.ok, true);
    const rollDigest = sha256(
      `${recognized.command.canonical_digest}:local-traversal-d20`
    );
    const roll = (Number.parseInt(rollDigest.slice(0, 8), 16) % 20) + 1;
    if (roll + riskState.player.skills.survival < 10) {
      failedRequestId = requestId;
      break;
    }
  }
  assert.ok(failedRequestId, 'a deterministic request-bound failure exists');
  const failedMove = await runtime.submitTurn(riskyStarted.party_id, {
    selected_action_option_id: 'action:move_risky',
    request_id: failedRequestId
  });
  assert.equal(failedMove.screen.visible_context.place,
    'защищённая высокая площадка');
  assert.equal(failedMove.screen.visible_context.time_minutes, 5);
  assert.equal(failedMove.screen.panels.character.data.energy,
    riskState.player.energy - 2);
  assert.deepEqual(
    failedMove.screen.panels.character.data.conditions,
    ['wet']
  );
  const failureEvidence = await pool.query(
    `SELECT
       (SELECT count(*)::int
        FROM party_runtime.party_check_resolutions
        WHERE party_id=$1
          AND check_scope_kind='traversal_interval') AS checks,
       (SELECT count(*)::int
        FROM party_runtime.party_traversal_interval_results r
        JOIN party_runtime.party_route_plan_executions e
          ON e.id=r.route_plan_execution_id
        WHERE e.party_id=$1
          AND r.result_kind='blocked_before_progress'
          AND r.actual_time_numerator=5) AS failed_intervals,
       (SELECT count(*)::int
        FROM party_runtime.party_actor_active_conditions
        WHERE party_id=$1 AND condition_id='wet'
          AND status='active') AS wet_conditions`,
    [riskyStarted.party_id]
  );
  assert.deepEqual(failureEvidence.rows[0], {
    checks: 1,
    failed_intervals: 1,
    wet_conditions: 1
  });
  const replayedFailure = await runtime.submitTurn(riskyStarted.party_id, {
    selected_action_option_id: 'action:move_risky',
    request_id: failedRequestId
  });
  assert.deepEqual(replayedFailure, failedMove);
  const replayEvidence = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM party_runtime.party_check_resolutions
        WHERE party_id=$1) AS checks,
       (SELECT count(*)::int
        FROM party_runtime.party_traversal_interval_results r
        JOIN party_runtime.party_route_plan_executions e
          ON e.id=r.route_plan_execution_id
        WHERE e.party_id=$1) AS intervals,
       (SELECT whole_minutes::int FROM party_runtime.party_clocks
        WHERE party_id=$1) AS minutes`,
    [riskyStarted.party_id]
  );
  assert.deepEqual(replayEvidence.rows[0], {
    checks: 1,
    intervals: 1,
    minutes: 5
  });
});

async function runtimeState(pool, partyId) {
  return (await pool.query(
    `SELECT s.state_payload
       FROM party_runtime.parties p
       JOIN party_runtime.party_state_snapshots s
         ON s.party_id=p.party_id AND s.state_version=p.state_version
      WHERE p.party_id=$1`,
    [partyId]
  )).rows[0].state_payload;
}
