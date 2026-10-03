import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

import pg from 'pg';
import { ACTOR_BASE_ATTRIBUTE_KEYS } from '@rus/materialization';
import { adaptApprovedOpeningNarration } from '@rus/narration';
import { finalizeProceduralActorEquipment } from
  '../../packages/new-game/src/stages/stage-16-item-placement/finalize-procedural-actor-equipment.js';
import { createLowerDvinaTracePublicRuntime } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-public-runtime.js';
import { createLowerDvinaTracePhase1BProductionAdapter } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-1b.js';
import { loadLiveWorldAuthoredStartCatalog } from
  '../../apps/game-server/src/internal/live-world-authored-starts.js';
import { createLowerDvinaTracePhase1ARepository } from
  '@rus/party-store/internal/lower-dvina-trace-phase-1a';
import { loadActiveRuntimeCatalogPin } from
  '../../apps/game-server/src/infrastructure/postgres/runtime-catalog-pin-loader.js';
import { loadActiveActorBaseAttributesBinding } from
  '../../apps/game-server/src/infrastructure/postgres/actor-base-attributes-profile-loader.js';
import { runPartyRuntimeCatalogMigration } from
  '../../tools/runtime-catalog-activation/src/forward-migrations.js';
import { installM3DevelopmentV14NewPartyRuntime } from
  '../../tools/local-play/production-setup.js';
import { createPostgresTestBackend } from
  '../fixtures/postgres-test-backend.js';
import { installLowerDvinaTraceV6World } from
  '../fixtures/lower-dvina-trace-v5-world-fixture.js';

test('explicit M3 v14 setup persists exact NPC attributes for one new party',
  async (t) => {
    const backend = await createPostgresTestBackend('pr17_m3_v14_party');
    if (!backend) return t.skip('No supported PostgreSQL test backend');
    let worldPool = poolFor(backend.worldUrl);
    let partyPool = poolFor(backend.partyUrl);
    t.after(async () => {
      await Promise.all([worldPool?.end(), partyPool?.end()]);
      await backend.close();
    });
    await Promise.all([installCatalogPartySchema(worldPool),
      installCatalogPartySchema(partyPool)]);
    await installLowerDvinaTraceV6World(worldPool);

    const setup = await installM3DevelopmentV14NewPartyRuntime({
      worldPool, partyPool, worldUrl: backend.worldUrl,
      partyUrl: backend.partyUrl, repositoryRoot: process.cwd()
    });
    assert.equal(setup.status, 'ready_for_new_development_party');
    assert.equal(setup.migrations.world.status, 'applied');
    assert.equal(setup.migrations.party.status, 'applied');
    assert.equal(setup.actorImport.status, 'imported_exact_readback_verified');
    assert.equal(setup.actorActivation.status,
      'activated_exact_readback_verified');
    assert.equal(setup.existing_party_count, 0);
    const repeatedSetup = await installM3DevelopmentV14NewPartyRuntime({
      worldPool, partyPool, worldUrl: backend.worldUrl,
      partyUrl: backend.partyUrl, repositoryRoot: process.cwd()
    });
    assert.equal(repeatedSetup.migrations.world.status, 'already_applied');
    assert.equal(repeatedSetup.migrations.party.status, 'already_applied');
    assert.deepEqual(repeatedSetup.actorActivation, setup.actorActivation);
    await assertActorBindingFailures(worldPool);

    await installRemainingPartySchema(partyPool);
    const runtimeCatalogPin = await loadActiveRuntimeCatalogPin(worldPool,
      'item_container_materialization_v2');
    const release = Object.freeze({ release_id: 'm3-v14-new-party-test',
      world_revision_id: runtimeCatalogPin.compatible_world_revision_id,
      world_catalog_digest: runtimeCatalogPin.compatible_world_catalog_digest,
      compatible_world_pin_manifest_digest:
        runtimeCatalogPin.compatible_world_pin_manifest_digest });
    const authored = await loadLiveWorldAuthoredStartCatalog();
    const adapter = createLowerDvinaTracePhase1BProductionAdapter({
      partyPool, worldPool, release, runtimeCatalogPin,
      authoredStartResolver: authored.resolveProfile,
      approvedActorCatalog: authored.actor_catalog,
      actorBaseAttributesBinding: setup.actorBinding
    });
    const runtime = createLowerDvinaTracePublicRuntime({ partyPool,
      committer: { commit: async () => ({ ok: true }) }, release,
      runtimeCatalogPin, traceStartAdapter: adapter,
      authoredStartCatalog: authored,
      traceTurnRuntime: { authoredOpeningNarration: testOpeningNarration },
      publicationLoader: async () => null });
    const started = await runtime.startNewGame({
      scenario_id: 'vikhtuy_fishing_camp_v1',
      request_id: 'm3-v14-new-party-001'
    });
    const partyId = started.party_id;
    const rows = (await partyPool.query(
      `SELECT actor_id,attribute_profile_snapshot
         FROM party_runtime.party_actor_profile_bindings
        WHERE party_id=$1 AND actor_kind='npc' ORDER BY actor_id`,
      [partyId])).rows;
    const npcCount = Number((await partyPool.query(
      `SELECT count(*) AS count FROM party_runtime.party_npcs
        WHERE party_id=$1`, [partyId])).rows[0].count);
    assert.equal(rows.length, npcCount);
    assert.ok(npcCount > 0);
    for (const row of rows) assert.deepEqual(
      Object.keys(row.attribute_profile_snapshot.values).sort(),
      [...ACTOR_BASE_ATTRIBUTE_KEYS].sort());
    const pins = (await partyPool.query(
      `SELECT catalog_revision_id,catalog_digest,activation_event_id
         FROM party_runtime.party_catalog_pins
        WHERE party_id=$1 AND catalog_scope='actor_base_attributes_v1'`,
      [partyId])).rows;
    assert.deepEqual(pins, [{
      catalog_revision_id: setup.actorBinding.pin.catalog_revision_id,
      catalog_digest: setup.actorBinding.pin.catalog_digest,
      activation_event_id: setup.actorBinding.pin.activation_event_id
    }]);
    const beforeRestart = rows.map((row) => ({ id: row.actor_id,
      attributes: row.attribute_profile_snapshot }));
    const replayed = await runtime.startNewGame({
      scenario_id: 'vikhtuy_fishing_camp_v1',
      request_id: 'm3-v14-new-party-001'
    });
    assert.equal(replayed.party_id, partyId);
    assert.deepEqual((await attributes(partyPool, partyId)), beforeRestart);

    const persistedNpc = (await createLowerDvinaTracePhase1ARepository({
      query: partyPool.query.bind(partyPool) }).loadInternal(partyId)).npcs[0];
    assert.throws(() => finalizeProceduralActorEquipment({ party_id: partyId,
      immediate: { npcs: [persistedNpc] }, procedural_scene_packages: {
        packages: [{ allocation_policy: {
          status: 'approved_for_stage16_materialization',
          actor_instance_id: persistedNpc.instance_id } }] }
    }), { code: 'PROCEDURAL_NPC_EQUIPMENT_DATA_GAP' });

    await assert.rejects(() => installM3DevelopmentV14NewPartyRuntime({
      worldPool, partyPool, worldUrl: backend.worldUrl,
      partyUrl: backend.partyUrl, repositoryRoot: process.cwd()
    }), { code: 'M3_V14_EXISTING_PARTIES_FORBIDDEN' });
    assert.deepEqual((await attributes(partyPool, partyId)), beforeRestart);

    await Promise.all([worldPool.end(), partyPool.end()]);
    worldPool = null; partyPool = null;
    if (backend.supportsServerRestart) await backend.restart();
    else await assert.rejects(() => backend.restart(), {
      code: 'POSTGRES_SERVER_RESTART_UNSUPPORTED' });
    worldPool = poolFor(backend.worldUrl);
    partyPool = poolFor(backend.partyUrl);
    assert.deepEqual(await attributes(partyPool, partyId), beforeRestart);
  });

async function installCatalogPartySchema(pool) {
  const files = await partyFiles();
  for (const file of files.slice(0, 11)) {
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
  await runPartyRuntimeCatalogMigration(pool);
}

async function installRemainingPartySchema(pool) {
  const files = await partyFiles();
  for (const file of files.slice(11)) {
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
}

async function partyFiles() {
  return (await readdir('schemas/party-db'))
    .filter((file) => /^\d+.*\.sql$/u.test(file)).sort();
}

async function attributes(pool, partyId) {
  return (await pool.query(
    `SELECT actor_id AS id,attribute_profile_snapshot AS attributes
       FROM party_runtime.party_actor_profile_bindings
      WHERE party_id=$1 AND actor_kind='npc' ORDER BY actor_id`,
    [partyId])).rows;
}

async function assertActorBindingFailures(pool) {
  await withRollback(pool, async (client) => {
    await client.query(`ALTER TABLE
      world_base.runtime_catalog_activation_events
      DISABLE TRIGGER runtime_catalog_activation_events_append_only`);
    await client.query(`DELETE FROM world_base.runtime_catalog_activation_events
      WHERE catalog_scope='actor_base_attributes_v1'`);
    await assert.rejects(() => loadActiveActorBaseAttributesBinding(client),
      { code: 'ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_DATA_GAP' });
  });
  await withRollback(pool, async (client) => {
    await client.query(`ALTER TABLE world_base.actor_base_attribute_profiles
      DISABLE TRIGGER actor_base_attribute_profiles_append_only`);
    await client.query('DELETE FROM world_base.actor_base_attribute_profiles');
    await assert.rejects(() => loadActiveActorBaseAttributesBinding(client),
      { code: 'ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_DATA_GAP' });
  });
  await withRollback(pool, async (client) => {
    await client.query(`ALTER TABLE
      world_base.runtime_catalog_activation_events
      DISABLE TRIGGER runtime_catalog_activation_events_append_only`);
    await client.query(
      `UPDATE world_base.runtime_catalog_activation_events
          SET catalog_digest=repeat('0',64)
        WHERE catalog_scope='actor_base_attributes_v1'`);
    await assert.rejects(() => loadActiveActorBaseAttributesBinding(client),
      { code: 'ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_INVALID' });
  });
  await loadActiveActorBaseAttributesBinding(pool);
}

async function withRollback(pool, operation) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await operation(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

function poolFor(databaseUrl) {
  const url = new URL(databaseUrl);
  return new pg.Pool({ host: url.hostname, port: Number(url.port),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password), database: url.pathname.slice(1),
    max: 4 });
}

const testOpeningNarration = Object.freeze({
  async run({ requestId }) {
    const audit = { version: 1, schema: 'narrator_prose_audit',
      request_id: requestId, pass: true,
      checks: Object.fromEntries(OPENING_CHECKS.map((key) =>
        [key, { pass: true }])),
      concerns: [], evidence: ['M3 v14 integration narration is grounded.'],
      repair_route: null, commit_permission: { can_show_to_player: true,
        can_write_player_visible_message: true,
        can_mark_opening_scene_presented: true } };
    const stage22Result = { version: 1,
      schema: 'stage22_narrator_prose_result', request_id: requestId,
      pass: true, visible_context_package_digest: 'm3-v14-test-visible',
      narrator_starting_prose: { version: 1,
        schema: 'narrator_starting_prose', request_id: requestId,
        prose_status: 'drafted', prose: 'Рыбацкий стан готов к работе.',
        action_options: [], used_visible_context_refs: [],
        self_constraints_check: {} }, generation_history: [],
      handoff_permission: { can_send_to_prose_audit: true } };
    const stage23Result = { version: 1,
      schema: 'stage23_narrator_prose_audit_result', request_id: requestId,
      pass: true, narrator_starting_prose_digest: 'm3-v14-test-prose',
      narrator_prose_audit: audit, repair_route: null, audit_history: [],
      commit_permission: audit.commit_permission };
    const flow = adaptApprovedOpeningNarration({ stage22Result,
      stage23Result });
    return { prose: flow.approved_output.prose, flow,
      stage22_result: stage22Result, stage23_result: stage23Result,
      original_stage23_audit: audit };
  }
});

const OPENING_CHECKS = ['schema_and_structure',
  'visible_context_compliance', 'new_fact_check', 'npc_check', 'item_check',
  'container_check', 'door_exit_route_check', 'time_light_weather_check',
  'position_check', 'g5_anchor_check', 'knowledge_boundary_check',
  'hidden_state_leak_check', 'rumor_uncertainty_check',
  'action_options_check', 'technical_text_check', 'literary_composition_check',
  'must_include_check', 'must_not_include_check', 'commit_readiness'];
