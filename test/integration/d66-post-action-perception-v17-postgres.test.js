import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { createCombinedWritePlanBuilder } from '@rus/turn';
import { integrateSpatialV3TemporalWriteFragments } from
  '../../packages/turn/src/spatial-v3-temporal-write-integration.js';
import { testContainerLabel } from '../helpers/test-containers.js';
import { SPATIAL_V3_TARGET_MIGRATIONS } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';
import { createSpatialV3PostgresCombinedAtomicCommitter } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { createLowerDvinaTracePostAppliedActorStepOwner } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-post-applied-actor-step.js';

const partyId = 'party:d66-perception-v17';
const at = { whole_minutes: '10', subminute_numerator: '0',
  subminute_denominator: '1' };
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const POSTGRES_IMAGE = 'postgres:16.14-alpine';

test('v17 perception persists with injected environment snapshot; projection not checked',
  { timeout: 1_200_000 }, async (t) => {
    const container = `d66-perception-pg-${randomUUID().slice(0, 12)}`;
    assert.equal(docker(['version']).status, 0, 'Docker is required.');
    const started = docker(['run', ...testContainerLabel(), '-d',
      '--name', container, '-p', '127.0.0.1::5432',
      '-e', 'POSTGRES_PASSWORD=local_only', '-e', 'POSTGRES_USER=postgres',
      '-e', 'POSTGRES_DB=postgres', POSTGRES_IMAGE], 90_000);
    assert.equal(started.status, 0, started.stderr);
    let pool;
    t.after(async () => {
      await pool?.end();
      docker(['rm', '-fv', container], 30_000);
    });
    await waitForPostgres(container);
    pool = new pg.Pool({ connectionString: adminDatabaseUrl(container),
      max: 2 });
    for (const sql of SPATIAL_V3_TARGET_MIGRATIONS.slice(0, 11)) {
      await pool.query(sql);
    }

    const profile = JSON.parse(await readFile(
      new URL('../../data/world-catalogs/novgorod/live-world-runtime-v17/post-action-perception-profile.json',
        import.meta.url), 'utf8'));
    const approvedFixture = { ...profile, status: 'approved', approval: {
      approved_by: 'integration-test', approved_on: '2026-10-01',
      approved_path: 'test/integration/d66-post-action-perception-v17-postgres.test.js',
      approved_commit: 'fixture'
    } };
    const transientPins = { pins: [{ dependency_role: 'source_dependency',
      entity_ref: ref('source_record', 'transient-policy'),
      version_pin: { pin_kind: 'authoring_version', authoring_version: '1' } }] };
    transientPins.canonical_digest = computeSpatialV3CanonicalDigest(transientPins);
    const injectedEnvironmentSnapshot = {
      light_state_id: 'bright',
      environment_state_ref: ref('environment_overlay_state', 'environment:1'),
      environment_state_version: 1,
      weather_state_ref: ref('weather_state', 'weather:1'),
      weather_state_version: 1,
      weather_visibility_result: 'clear', weather_acoustic_loss: 0,
      transient_visibility_result: 'clear', transient_acoustic_loss: 0,
      transient_modifier_dependency_pins: transientPins,
      visibility_modifiers: []
    };
    const state = {
      party_id: partyId,
      party_state: { state_version: 1, turn_number: 3 },
      environment_snapshot: { schema: 'rus.approved_initial_environment.v1' },
      npcs: [{ instance_id: 'npc:1', machine_state: {
        runtime_status: 'available' } }],
      npc_schedule_runtime: [{ npc_id: 'npc:1', status: 'active',
        state_version: 1, current_position_node_id: 'position:1',
        attention_state_ref: ref('condition_set', 'attention:1'),
        knowledge_state_ref: ref('knowledge_fact', 'knowledge:1') }],
      post_action_perception_sources: [{ npc_id: 'npc:1',
        current_position_node_id: 'position:1', g6_instance_id: 'g6:1',
        position_state_version: 1, ambient_noise: 0,
        acoustic_state_version: 1,
        attention_state_ref: ref('condition_set', 'attention:1'),
        knowledge_state_ref: ref('knowledge_fact', 'knowledge:1') }],
      post_action_knowledge_states: [{ npc_id: 'npc:1', exists: false,
        state_version: null, fact_refs: [], hypothesis_refs: [] }]
    };
    const events = ['sound:1', 'sound:2'].map((id) => ({
      version: 1, schema: 'turn_step_factual_event_v1',
      event_ref: ref('sound_event', id),
      source_activity_ref: ref('semantic_activity', 'activity:1'),
      occurred_at: at, source_ref: ref('player_character', 'player:1'),
      source_scope_ref: ref('canonical_spatial_node', 'position:1'),
      rule_ref: { entity_kind: 'activity_profile', entity_id: 'speech',
        authoring_version: '1' },
      policy_ref: { entity_kind: 'turn_step_owner_profile_set',
        entity_id: 'turn-profile', authoring_version: '1' },
      profile_pin: { artifact_id: 'turn-profile', revision: 1,
        digest: 'a'.repeat(64) },
      perceptible_signal: { channel: 'acoustic', emission_strength: 3,
        duration_class: 'brief' }
    }));
    const owner = createLowerDvinaTracePostAppliedActorStepOwner({
      committedState: state, idempotencyKey: 'd66-perception-turn',
      perceptionProfile: approvedFixture,
      environmentPort: () => structuredClone(injectedEnvironmentSnapshot)
    });
    const result = await owner({ working_projection: {}, factual_events: events });
    const integrated = integrateSpatialV3TemporalWriteFragments({
      base_write_plan_input: { party_id: partyId,
        canonical_input_digest: computeSpatialV3CanonicalDigest({ input: 'd66' }),
        approved_write_sets: [{ appends: [], inserts: [], updates: [],
          deletes: [] }], expected_state_versions: [],
        lock_context: { physical_keys: [] } },
      temporal_result: result.temporal_results[0]
    });
    assert.equal(integrated.ok, true, JSON.stringify(integrated));
    const flattened = { inserts: [], updates: [], appends: [] };
    const physicalKeys = [`party_runtime.party_v3_change_sets:change:${partyId}:turn-step:4`];
    for (const writeSet of integrated.input.approved_write_sets) {
      for (const mode of Object.keys(flattened)) {
        flattened[mode].push(...(writeSet[mode] ?? []));
      }
    }
    physicalKeys.push(...integrated.input.lock_context.physical_keys);
    assert.equal(flattened.appends.filter(({ target_table }) =>
      target_table === 'party_perception_records').length, 2);
    assert.equal(flattened.inserts.filter(({ target_table }) =>
      target_table === 'party_npc_knowledge_merge_states').length, 1);

    await pool.query(`INSERT INTO party_runtime.parties
      (party_id,schema_version,world_revision_id,world_catalog_digest,
       materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
      VALUES ($1,3,'world:d66','catalog:d66','test','test','commands','profiles')`,
    [partyId]);
    await pool.query(`INSERT INTO party_runtime.party_materialization_runs
      (party_id,run_id,g4_id,run_kind,seed_digest,input_digest,catalog_digest,
       materializer_version,rng_version,result_digest,idempotency_key,status)
      VALUES ($1,'run:1','g4:1','baseline','seed','input','catalog','test','test',
       'result','run-key','committed')`, [partyId]);
    await pool.query(`INSERT INTO party_runtime.party_npcs
      (party_id,npc_id,run_id,profile_set_id,profile_level,machine_state)
      VALUES ($1,'npc:1','run:1','npc-profile','scene',$2::jsonb)`,
    [partyId, JSON.stringify({ runtime_status: 'available' })]);

    const changeSetId = `change:${partyId}:turn-step:4`;
    const visiblePayload = { schema: 'temporal_visible_package.v1',
      perceived_scene: 'События сохранены.', perceived_changes: [],
      sensory_details: [], visible_npcs: [], visible_objects: [],
      known_context: [], uncertainties: [], hypotheses: [],
      player_safe_interruption: null, allowed_action_affordances: [] };
    const digest = computeSpatialV3CanonicalDigest(visiblePayload);
    const commitRechecks = ['physical', 'state', 'pin', 'endpoint', 'route',
      'capacity', 'time', 'change_set'].map((kind) => ({ kind,
      digest: computeSpatialV3CanonicalDigest({ kind }) }));
    const builder = createCombinedWritePlanBuilder({
      verifyApproval: async () => ({ ok: true })
    });
    const built = await builder.build({
      plan_id: 'plan:d66', party_id: partyId,
      write_plan_kind: 'semantic_commit', operation_kind: 'move',
      canonical_input_digest: computeSpatialV3CanonicalDigest({ input: 'd66' }),
      expected_state_versions: [],
      validation_report: { status: 'pass', digest: computeSpatialV3CanonicalDigest({ validation: true }) },
      idempotency: { id: 'idem:d66', key: 'd66-perception-turn', request_id: null },
      change_set: { id: changeSetId },
      visible_package_envelope: {
        package_id: 'visible:d66', party_id: partyId, turn_id: 'turn:d66',
        committed_state_version: '1', change_set_id: changeSetId,
        package_digest: digest, visible_payload: visiblePayload,
        presentation_status: 'pending',
        projection_policy_ref: { entity_ref: ref('visibility_modifier', 'policy:1'),
          authoring_version: '1' },
        dependency_pins: { pins: [],
          canonical_digest: computeSpatialV3CanonicalDigest([]).replace('sha256:', '') },
        idempotency_record_id: 'idem:d66'
      },
      lock_context: { owner_keys: [], execution_keys: [], g4_keys: [],
        physical_keys: [...new Set(physicalKeys)] },
      commit_rechecks: commitRechecks,
      approved_write_sets: [{ ...flattened,
        appends: [...flattened.appends, { target_table: 'party_v3_change_sets',
          id: changeSetId, record: { id: changeSetId, party_id: partyId,
            operation_kind: 'move', idempotency_record_id: 'idem:d66',
            expected_state_version_set_digest: 'pending',
            expected_state_version_set: [], committed_state_version_set_digest: 'pending',
            write_plan_digest: 'pending', created_at_turn: 4, committed_at_turn: 4 } }] }]
    });
    assert.equal(built.ok, true, JSON.stringify(built));
    const committer = createSpatialV3PostgresCombinedAtomicCommitter({ pool,
      recheck: async () => ({ ok: true }) });
    const committed = await committer.commit({ plan: built.plan,
      created_at_turn: 4 });
    assert.equal(committed.ok, true, JSON.stringify(committed));
    assert.equal((await pool.query(`SELECT count(*)::int AS count
      FROM party_runtime.party_perception_records WHERE party_id=$1`,
    [partyId])).rows[0].count, 2);
    assert.equal((await pool.query(`SELECT count(*)::int AS count
      FROM party_runtime.party_npc_knowledge_merge_states WHERE party_id=$1`,
    [partyId])).rows[0].count, 1);
  });

function docker(args, timeout = 30_000) {
  return spawnSync('docker', args, { encoding: 'utf8', timeout });
}

async function waitForPostgres(container) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const logs = docker(['logs', container]);
    const initialized = `${logs.stdout}\n${logs.stderr}`.includes(
      'PostgreSQL init process complete; ready for start up.');
    if (initialized && docker(['exec', container, 'pg_isready', '-h',
      '127.0.0.1', '-U', 'postgres', '-d', 'postgres']).status === 0) return;
  }
  throw new Error(`${container} did not become ready.`);
}

function adminDatabaseUrl(container) {
  const output = docker(['port', container, '5432']).stdout;
  const port = Number(output.match(/:(\d+)\s*$/u)?.[1]);
  assert.ok(Number.isInteger(port));
  return `postgresql://postgres:local_only@127.0.0.1:${port}/postgres`;
}
