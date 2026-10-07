import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import pg from 'pg';
import { canonicalDigest, createRandomSource, deriveApprovedInitialEnvironment } from '@rus/materialization';
import { materializeSpatialV3GeneratedScene } from '@rus/materialization/spatial-v3-materialization';
import { computeSpatialV3CanonicalDigest as digest } from '@rus/contracts/spatial-v3/registry';
import { buildIdentityRows } from '../../scripts/v17-npc-identity-stage.mjs';
import { targetCanonicalStartFixture } from '../spatial-v3/target-canonical-start-fixture.js';
import { createTargetGeneratedFirstEntry } from '../../apps/game-server/src/infrastructure/postgres/target-generated-first-entry.js';
import { buildCombinedWritePlan } from '../../packages/turn/src/spatial-v3-write-plan.js';
import { createSpatialV3PostgresCombinedAtomicCommitter } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { SPATIAL_V3_TARGET_MIGRATIONS } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';
import { testContainerLabel } from '../helpers/test-containers.js';

// D102: pinned acceptance, production materializers and P16; no LLM calls.
// Reader ports/catalog admission below are isolated fixtures, not proof of live world_base activation.
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const base = 'data/world-catalogs/novgorod/';
const fixture = await targetCanonicalStartFixture();
const manifestPath = `${base}m2c-npc-import-manifest.json`;
const manifest = await json(manifestPath);
const load = (table) => json(resolve(dirname(manifestPath), manifest.datasets.find((row) => row.table === table).file));
const byVersion = (rows) => [...new Map(rows.map((row) => [`${row.id}@${row.version}`, row])).values()];
const runtimeProfiles = byVersion([
  ...await load('spatial_v3_npc_runtime_profiles'),
  ...await json(`${base}m2c-scene-movement-edges/open-capacity-v2-import/spatial_v3_npc_runtime_profiles.json`),
]);
const g4 = { ...fixture.canonical_npc_closure.g4_ref, world_revision_id: fixture.world_revision_id };
const canonical = fixture.canonical_npc_closure.canonical_g5_ref;
const placementPolicy = (await load('spatial_v3_g4_npc_composition_bindings'))
  .find((row) => row.g4_id === g4.id).payload.placement_policy;
// Only fixture regional applicability is extended to this fixture G4. D-2 relation/group facts stay verbatim.
const regionalProfiles = byVersion([
  ...await load('spatial_v3_npc_regional_context_profiles'),
  ...await json(`${base}m2c-scene-movement-edges/open-capacity-v2-import/spatial_v3_npc_regional_context_profiles.json`),
]).map((row) => ({ ...row, payload: { ...row.payload, applicability: [
  ...row.payload.applicability, { g4_ref: g4 },
] } }));
const rules = await json(`${base}m2c-npc-wave/v1/datasets/npc_relationship_materialization_rules.json`);
const source = (await json(`${base}m2c-npc-wave/v1/datasets/place_population_composition_rules.json`))
  .find((row) => row.composition_id === 'pf_peasant_homestead');
assert.equal(source.status, 'approved');
assert.equal(source.authoring_payload.slot_relationships.length, 1);
const identityTables = Object.fromEntries((await buildIdentityRows()).map((row) => [row.table, row.rows.filter((entry) => entry.status === 'approved')]));
const approvedBundle = { ...fixture.approved_actor_temporal_bundle,
  npc_relationship_materialization_rules: structuredClone(rules),
  npc_identity: { schema: 'rus.npc_identity_catalog.v1',
    name_bindings: identityTables.npc_regional_context_name_bindings,
    name_entries: identityTables.region_name_pool_entries,
    scale_entries: identityTables.npc_psychology_scale_entries,
    character_items: identityTables.occupation_character_items,
  },
};
const itemPin = fixture.domain_catalog_pin;
const actorProfile = fixture.actor_base_attributes_runtime_profile;
const actorPin = { ...itemPin, ...Object.fromEntries(['catalog_scope', 'catalog_revision_id', 'catalog_digest',
  'activation_event_id', 'import_id', 'import_audit_digest', 'record_registry_digest', 'runtime_contract_digest']
  .map((key) => [key, actorProfile[key]])) };
const start = fixture.scenario_bundle.canonical_start.start.initial_environment_inputs;
const temporal = approvedBundle.temporal_records;
const environment = deriveApprovedInitialEnvironment({
  calendar_record: temporal.find((row) => row.record_id === start.calendar_record_ref.id),
  weather_record: temporal.find((row) => row.record_id === start.weather_record_ref.id),
  calendar_date: start.calendar_date, local_minute_of_day: start.local_minute_of_day,
  random: createRandomSource({ seed: 31 }),
});

function setup(partyId, { withFact = true, missingActor = false } = {}) {
  const changeId = `entry:${partyId}`;
  const siteId = `site:${partyId}`;
  const scene = materializeSpatialV3GeneratedScene({ party_id: partyId, site_id: siteId, baseline_id: `base:${partyId}`,
    change_set_id: changeId, materializer_version: 'm2c', materialization_trace_id: `trace:${changeId}`,
    canonical_g5: { ...canonical, world_revision_id: fixture.world_revision_id },
    scene_closure: fixture.world_base_reference_snapshot.scene_template_closures[0],
    acoustic_rows: fixture.canonical_acoustic_rows });
  assert.equal(scene.ok, true, JSON.stringify(scene.error));
  const composition = { place_family_id: source.place_family_id, place_family_version: source.place_family_version,
    composition_ref: { id: source.composition_id, version: source.composition_version, world_revision_id: source.world_revision_id },
    population_groups: structuredClone(missingActor ? source.population_groups.slice(0, 1) : source.population_groups),
    scheduled_absences: structuredClone(source.scheduled_absences),
    slot_relationships: structuredClone(withFact ? source.authoring_payload.slot_relationships : []),
  };
  const context = { transaction: { query: async () => ({ rows: [itemPin, actorPin] }) },
    request: { party_id: partyId, g4 }, change_set_id: changeId,
    dependency_pins: { pins: [{ dependency_role: 'source_authoring',
      entity_ref: { entity_kind: 'canonical_spatial_node', entity_id: g4.id },
      version_pin: { pin_kind: 'authoring_version', authoring_version: String(g4.version) } }],
    canonical_digest: canonicalDigest('fixture-pins') },
    proposal: { target_site_id: siteId, inserts: [{ target_table: 'party_g5_sites', id: siteId, record: {
      id: siteId, party_id: partyId, origin: 'canonical', parent_g4_id: g4.id,
      canonical_g5_ref: { entity_id: canonical.id, authoring_version: String(canonical.version) },
      status: 'active', state_version: 1, created_change_set_id: changeId, updated_change_set_id: changeId,
    } }, ...scene.proposal.rows] },
  };
  const options = { verifiedItemCatalog: fixture.domain_catalog,
    actorBaseAttributesBinding: { schema: 'rus.actor_base_attributes_runtime_binding.v1', pin: actorPin, runtime_profile: actorProfile },
    approvedActorTemporalBundle: approvedBundle,
    worldBaseReader: {
      readPinnedG4NpcCompositionClosure: async () => { throw new Error('canonical people reader must own this path'); },
      readPlacePeopleCandidates: async () => ({ ok: true, placement_policy: placementPolicy,
        candidates: runtimeProfiles.filter((row) => row.profile_kind === 'npc_binding')
          .map(({ id, version, role_ref, occupation_ref }) => ({ id, version, role_ref, occupation_ref })) }),
      readPlacePeopleClosure: async () => ({ ok: true, closure: { schema: 'rus.place_people_binding_bundle.v1',
        world_revision_id: fixture.world_revision_id, g4_ref: g4, canonical_g5_ref: canonical,
        placement_policy: placementPolicy, runtime_profiles: runtimeProfiles, regional_context_profiles: regionalProfiles } }),
    },
    resolvePresenceRulesFirstArrival: async () => ({ partyId, scopeInstanceRef: `g5:${siteId}`, rules: [],
      people: { compositions: [composition], schedule_routine_rules_by_place_family: [] } }),
    finiteFirstEntryProfile: { technical_limits: { max_resolution_records: 8 } },
    prepareNaturalFirstEntry: async () => { throw new Error('canonical path only'); },
    readFactualContext: async () => ({ ok: true, party_id: partyId, world_revision_id: fixture.world_revision_id,
      environment, calendar_profile: fixture.calendar_profile,
      started_at: { whole_minutes: '0', subminute_numerator: '0', subminute_denominator: '1' },
      recheck: async () => ({ ok: true }) }),
  };
  return { options, context };
}

async function prepare(partyId, settings) {
  const { options, context } = setup(partyId, settings);
  const result = await createTargetGeneratedFirstEntry(options)(context);
  assert.equal(result.ok, true, JSON.stringify(result.error));
  const inserts = result.approved_write_sets.flatMap((set) => set.inserts);
  const npcs = inserts.filter((row) => row.target_table === 'party_npcs').map((row) => row.record);
  assert.equal(npcs.length, settings?.missingActor ? 1 : 2,
    `real materializer must create the D-2 endpoints: ${JSON.stringify(result.materialization_trace)}`);
  for (const npc of npcs) {
    assert.equal(typeof npc.identity_state.canonical_name, 'string');
    assert.ok(npc.identity_state.canonical_name.trim());
    assert.equal(npc.semantic_state.source_binding.place_population_composition_ref.id, source.composition_id);
  }
  return { result, context, inserts, npcs };
}

test('fixture reaches real D-2 materialization with two named, source-bound endpoints', async () => {
  const prepared = await prepare('fixture-check');
  assert.deepEqual(prepared.npcs.map((row) => row.semantic_state.source_binding.group_id).sort(),
    ['pf_peasant_homestead.householder', 'pf_peasant_homestead.mistress']);
  const again = await prepare('fixture-check');
  assert.deepEqual(again.inserts, prepared.inserts);
  assert.deepEqual(again.result.materialization_trace, prepared.result.materialization_trace);
});

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });
test('approved relationship guards persist and replay atomically through PostgreSQL P16', { timeout: 180_000 }, async (t) => {
  assert.equal(docker(['version']).status, 0, 'run this pinned PG acceptance through fleet pg-request');
  const name = `npc-relations-consumer-${process.pid}`;
  let pool;
  t.after(async () => { await pool?.end(); docker(['rm', '-fv', name]); });
  const started = docker(['run', ...testContainerLabel(), '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=fixture_only', '-e', 'POSTGRES_USER=npc', '-e', 'POSTGRES_DB=npc', 'postgres:16-alpine']);
  assert.equal(started.status, 0, started.stderr);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'npc']).status === 0) { ready = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.equal(ready, true, 'isolated test PostgreSQL must become ready');
  await new Promise((resolve) => setTimeout(resolve, 600));
  const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)/)[1]);
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'npc', password: 'fixture_only', database: 'npc' });
  for (const sql of SPATIAL_V3_TARGET_MIGRATIONS) await pool.query(sql);
  const committer = createSpatialV3PostgresCombinedAtomicCommitter({ pool, recheck: async () => ({ ok: true }) });
  const seedParty = (partyId) => pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ($1,3,$2,$3,'materializer','rng','commands','profiles')`,
  [partyId, fixture.world_revision_id, fixture.world_catalog_digest]);
  const read = async (partyId) => ({
    npcs: (await pool.query('SELECT npc_id,identity_state,semantic_state FROM party_runtime.party_npcs WHERE party_id=$1 ORDER BY npc_id', [partyId])).rows,
    relations: (await pool.query(`SELECT from_npc_id,to_npc_id,relation_category_id,state
      FROM party_runtime.party_npc_relations WHERE party_id=$1 ORDER BY from_npc_id,to_npc_id,relation_category_id`, [partyId])).rows,
  });

  for (const [label, settings] of [['same roles without fact', { withFact: false }], ['missing endpoint', { missingActor: true }]]) {
    await t.test(`guard absent: ${label}`, async () => {
      const partyId = `negative:${label}`;
      await seedParty(partyId);
      const prepared = await prepare(partyId, settings);
      const plan = await buildPlan(partyId, prepared);
      const outcome = await committer.commit({ plan });
      assert.equal(outcome.ok, true, JSON.stringify(outcome));
      const saved = await read(partyId);
      assert.equal(saved.npcs.length, settings.missingActor ? 1 : 2);
      assert.deepEqual(saved.relations, []);
      for (const npc of saved.npcs) assert.deepEqual(npc.semantic_state.relationships ?? [], []);
    });
  }

  await t.test('D-2 fact commits one spouse pair, reciprocal semantic links and unchanged replay/re-entry', async () => {
    const partyId = 'positive';
    await seedParty(partyId);
    const prepared = await prepare(partyId);
    const plan = await buildPlan(partyId, prepared);
    const request = { party_id: partyId, g4_id: g4.id, idempotency_key: 'entry', canonical_input_digest: digest('entry') };
    const outcome = await committer.prepareExpansion({ ...request, prepare: async () => ({ ok: true, plan }) });
    assert.equal(outcome.ok, true, JSON.stringify(outcome));
    const saved = await read(partyId);
    assert.equal(saved.npcs.length, 2);
    assert.equal(saved.relations.length, 1, 'fulfilled D-2 guard must persist one canonical spouse pair');
    const [edge] = saved.relations;
    assert.equal(edge.relation_category_id, 'spouse');
    const ids = saved.npcs.map((row) => row.npc_id);
    assert.deepEqual([edge.from_npc_id, edge.to_npc_id], [...ids].sort());
    for (const npc of saved.npcs) {
      const projected = npc.semantic_state.relationships;
      assert.equal(projected.length, 1, 'NPC semantic_state must persist the same relation');
      assert.deepEqual({ target_actor_id: projected[0].target_actor_id, kind: projected[0].kind },
        { target_actor_id: ids.find((id) => id !== npc.npc_id), kind: 'spouse' });
      assert.equal(projected[0].standing, undefined);
    }
    assert.equal((await committer.commit({ plan })).replay, true);
    const again = await committer.prepareExpansion({ ...request, prepare: async () => {
      throw new Error('committed first-entry must not read changed sources or rematerialize NPCs');
    } });
    assert.equal(again.ok, true, JSON.stringify(again));
    assert.equal(again.replay, true);
    assert.deepEqual(await read(partyId), saved, 'replay keeps persisted identities, evidence and relationship state');
  });

  await t.test('failure inserting the relationship rolls back both NPC semantic states and the scene', async () => {
    const partyId = 'atomic-failure';
    await seedParty(partyId);
    // Failure injection lives only in the isolated acceptance DB; no production trigger/DDL change.
    await pool.query(`CREATE FUNCTION party_runtime.reject_acceptance_relation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.party_id='atomic-failure' THEN RAISE EXCEPTION 'acceptance relation write rejected'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER acceptance_relation_failure BEFORE INSERT ON party_runtime.party_npc_relations
      FOR EACH ROW EXECUTE FUNCTION party_runtime.reject_acceptance_relation()`);
    const prepared = await prepare(partyId);
    const plan = await buildPlan(partyId, prepared);
    const outcome = await committer.commit({ plan });
    assert.equal(outcome.ok, false, 'the production proposal must contain a guarded relation insert');
    assert.match(outcome.error.diagnostics.reason, /acceptance relation write rejected/);
    assert.deepEqual(await read(partyId), { npcs: [], relations: [] });
    for (const table of ['party_g5_sites', 'party_materialization_runs', 'party_command_idempotency', 'party_v3_change_sets']) {
      assert.equal(Number((await pool.query(`SELECT count(*) AS n FROM party_runtime.${table} WHERE party_id=$1`, [partyId])).rows[0].n), 0,
        `${table} must roll back with the relationship`);
    }
  });
});

async function buildPlan(partyId, prepared) {
  const changeId = prepared.context.change_set_id;
  const runId = `trace:${changeId}`;
  const idempotencyId = `idem:${partyId}`;
  const row = (target_table, id, record) => ({ target_table, id, record: { party_id: partyId, ...record } });
  const inserts = [...prepared.context.proposal.inserts, ...prepared.inserts];
  const appends = [row('party_materialization_runs', runId, {
    run_id: runId, g4_id: g4.id, run_kind: 'expansion', occurrence: 0,
    seed_digest: digest('seed'), input_digest: digest('input'), catalog_digest: digest('catalog'),
    materializer_version: '1', rng_version: 'mulberry32_v1', result_digest: digest(prepared.result.materialization_trace),
    idempotency_key: 'entry', status: 'committed', validation_report: prepared.result.materialization_trace.validation_report,
    trace: { created_change_set_id: changeId }, created_refs: [],
  }), row('party_v3_change_sets', changeId, { id: changeId, operation_kind: 'resolve_frontier', idempotency_record_id: idempotencyId })];
  const payload = { schema: 'temporal_visible_package.v1', perceived_scene: 'Местность.',
    perceived_changes: [], sensory_details: [], visible_npcs: [], visible_objects: [], known_context: [],
    uncertainties: [], hypotheses: [], player_safe_interruption: null, allowed_action_affordances: [] };
  const pins = [{ dependency_role: 'source_authoring', entity_ref: { entity_kind: 'world_revision', entity_id: fixture.world_revision_id },
    version_pin: { pin_kind: 'authoring_version', authoring_version: '1', state_version: null } }];
  const result = await buildCombinedWritePlan({ plan_id: `plan:${partyId}`, party_id: partyId, write_plan_kind: 'semantic_commit',
    operation_kind: 'resolve_frontier', canonical_input_digest: digest('entry'), expected_state_versions: [],
    validation_report: { status: 'pass', digest: digest('validation') },
    idempotency: { id: idempotencyId, key: 'entry' }, change_set: { id: changeId },
    visible_package_envelope: { package_id: `visible:${partyId}`, party_id: partyId, turn_id: 'entry', committed_state_version: '1',
      change_set_id: changeId, package_digest: digest(payload), visible_payload: payload, presentation_status: 'pending',
      projection_policy_ref: { entity_ref: { entity_kind: 'visibility_modifier', entity_id: 'projection' }, authoring_version: '1' },
      dependency_pins: { pins, canonical_digest: digest(pins).slice(7) }, idempotency_record_id: idempotencyId },
    approved_write_sets: [{ inserts, updates: [], appends }],
    lock_context: { owner_keys: [], execution_keys: [], g4_keys: [`${partyId}:${g4.id}`],
      physical_keys: [...inserts, ...appends].map((row) => `party_runtime.${row.target_table}:${row.id}`) },
    commit_rechecks: ['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set']
      .map((kind) => ({ kind, digest: digest(kind) })) }, { verifyApproval: async () => ({ ok: true }) });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.plan;
}
