import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import pg from 'pg';
import { canonicalDigest, createRandomSource, deriveApprovedInitialEnvironment,
  materializeAuthoredStartPartyInstance } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest as digest } from '@rus/contracts/spatial-v3/registry';
import { materializeSpatialV3GeneratedScene } from '@rus/materialization/spatial-v3-materialization';
import { buildCombinedWritePlan } from '../../packages/turn/src/spatial-v3-write-plan.js';
import { buildLowerDvinaTracePhase1AWritePlan } from '../../packages/new-game/src/stages/stage-24-party-db-write-plan/code/build-lower-dvina-trace-phase-1a-plan.js';
import { createTargetGeneratedFirstEntry } from '../../apps/game-server/src/infrastructure/postgres/target-generated-first-entry.js';
import { createSpatialV3PostgresCombinedAtomicCommitter } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { SPATIAL_V3_TARGET_MIGRATIONS } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';
import { targetCanonicalStartFixture } from './target-canonical-start-fixture.js';
import { approvedNpcIdentityCatalog } from '../helpers/npc-identity-catalog.js';
import { testContainerLabel } from '../helpers/test-containers.js';

const fixture = await targetCanonicalStartFixture();
const approvedCatalog = await approvedNpcIdentityCatalog();
const soleNames = ['male', 'female'].map((sex) => {
  const entry = approvedCatalog.name_entries.find((row) => row.sex_category === sex);
  assert.ok(entry, `approved ${sex} name fixture exists`);
  return entry;
});
const identityCatalog = { ...approvedCatalog, name_entries: soleNames };
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const manifestPath = 'data/world-catalogs/novgorod/m2c-npc-import-manifest.json';
const manifest = await json(manifestPath);
const load = (table) => json(resolve(dirname(manifestPath),
  manifest.datasets.find((row) => row.table === table).file));
const canonical = fixture.canonical_npc_closure;
const composition = (await load('spatial_v3_g4_npc_composition_bindings'))
  .find((row) => row.g4_id === canonical.g4_ref.id && row.generation_template_id);
const template = (await load('spatial_v3_g5_generation_templates'))
  .find((row) => row.id === composition.generation_template_id);
const sceneCandidate = (await load('spatial_v3_scene_materialization_candidates'))
  .find((row) => row.profile_id === template.scene_materialization_profile_id
    && row.profile_version === template.scene_materialization_profile_version);
const generationScene = { header: (await load('spatial_v3_scene_templates'))
  .find((row) => row.id === sceneCandidate.scene_template_id
    && row.version === sceneCandidate.scene_template_version) };
for (const [key, table] of Object.entries({ g6_slots: 'spatial_v3_g6_template_slots',
  position_slots: 'spatial_v3_scene_position_templates', endpoint_slots: 'spatial_v3_scene_endpoint_slots',
  movement_edges: 'spatial_v3_scene_movement_edge_templates' })) {
  generationScene[key] = (await load(table)).filter((row) => row.scene_template_id === generationScene.header.id
    && row.scene_template_version === generationScene.header.version);
}
const acousticManifestPath = 'data/world-catalogs/novgorod/m2c-acoustic-import-manifest.json';
const acousticManifest = await json(acousticManifestPath);
const generationAcoustics = (await json(resolve(dirname(acousticManifestPath),
  acousticManifest.datasets.find((row) => row.table === 'spatial_v3_g6_acoustic_baselines').file)))
  .filter((row) => row.g5_template_id === template.id && row.g5_template_version === template.version
    && row.scene_template_id === generationScene.header.id
    && row.scene_template_version === generationScene.header.version)
  .map((row) => ({ ...row, authoring_digest: row.canonical_digest }));
const closure = { ...canonical, canonical_g5_ref: undefined, composition,
  generation_template_ref: { id: template.id, version: template.version },
  runtime_profiles: await load('spatial_v3_npc_runtime_profiles'),
  regional_context_profiles: await load('spatial_v3_npc_regional_context_profiles') };
const itemPin = fixture.domain_catalog_pin;
const actorProfile = fixture.actor_base_attributes_runtime_profile;
const actorPin = { ...itemPin, ...Object.fromEntries(['catalog_scope', 'catalog_revision_id',
  'catalog_digest', 'activation_event_id', 'import_id', 'import_audit_digest',
  'record_registry_digest', 'runtime_contract_digest'].map((key) => [key, actorProfile[key]])) };
const start = fixture.scenario_bundle.canonical_start.start.initial_environment_inputs;
const temporal = fixture.approved_actor_temporal_bundle.temporal_records;
const environment = deriveApprovedInitialEnvironment({
  calendar_record: temporal.find((row) => row.record_id === start.calendar_record_ref.id),
  weather_record: temporal.find((row) => row.record_id === start.weather_record_ref.id),
  calendar_date: start.calendar_date, local_minute_of_day: start.local_minute_of_day,
  random: createRandomSource({ seed: 31 }) });

const nameChoices = (choices) => choices.filter((choice) => choice.slot_key === 'name');
const npcRows = (result) => result.approved_write_sets.flatMap((set) => set.inserts)
  .filter((row) => row.target_table === 'party_npcs').map((row) => row.record);
const profileRows = (result) => result.approved_write_sets.flatMap((set) => set.inserts)
  .filter((row) => row.target_table === 'party_actor_profile_bindings').map((row) => row.record);

function assertNameTrace(choices, npcs) {
  const selected = nameChoices(choices);
  assert.equal(selected.length, npcs.length, 'one persisted choice for each named NPC');
  for (const npc of npcs) {
    const identity = npc.identity_state;
    const slot = npc.participant_slot_ref ?? npc.semantic_state.participant_slot_ref;
    const choice = selected.find((row) => row.choice_key === `npc:${slot}:name`);
    assert.ok(choice, `name choice for actor slot ${slot}`);
    for (const key of ['choice_key', 'candidate_digest', 'selected_id', 'rng_counter',
      'selected_weight', 'rejection_summary']) assert.ok(Object.hasOwn(choice, key), key);
    assert.equal(choice.selected_id, identity.name_provenance.entry_id);
    assert.equal(choice.rng_counter, 1);
    assert.equal(choice.candidate_digest, canonicalDigest(choice.candidate_ids));
    assert.equal(choice.candidate_set_digest, choice.candidate_digest);
    assert.equal(Number.isInteger(choice.rng_draw), true);
    assert.equal(Object.hasOwn(identity, 'choice'), false, 'trace stays outside identity');
    assert.equal(Object.hasOwn(identity, 'choices'), false, 'trace stays outside identity');
    assert.equal(Object.hasOwn(identity.name_provenance, 'candidate_digest'), false);
  }
  return selected;
}

// Imported generated scene/composition and its exact approved acoustic baselines.
// These tests call the real first-entry owner; natural facts are an empty isolated proposal.
function generatedSetup(catalog = identityCatalog) {
  const partyId = 'target-generated-743';
  const changeSetId = 'change';
  const g4 = { ...closure.g4_ref, world_revision_id: fixture.world_revision_id };
  const prepared = materializeSpatialV3GeneratedScene({ party_id: partyId, site_id: 'generated',
    baseline_id: 'base', change_set_id: changeSetId, materializer_version: 'm2c',
    materialization_trace_id: `trace:${changeSetId}`,
    generation_template: template, scene_closure: generationScene,
    acoustic_rows: generationAcoustics });
  assert.equal(prepared.ok, true, JSON.stringify(prepared.error));
  const context = { transaction: { query: async () => ({ rows: [itemPin, actorPin] }) },
    request: { party_id: partyId, g4 }, change_set_id: changeSetId,
    selection: { selected_template: { template_id: template.id,
      template_version: template.version, template_digest: template.canonical_digest } },
    dependency_pins: { pins: [{ dependency_role: 'source_authoring',
      entity_ref: { entity_kind: 'canonical_spatial_node', entity_id: g4.id },
      version_pin: { pin_kind: 'authoring_version', authoring_version: String(g4.version) } }],
    canonical_digest: canonicalDigest('fixture-pins') },
    proposal: { target_site_id: 'generated', inserts: [
      { target_table: 'party_g5_sites', id: 'generated', record: { id: 'generated', party_id: partyId,
        origin: 'generated', parent_g4_id: g4.id,
        generated_template_ref: { entity_id: template.id, authoring_version: String(template.version) },
        expansion_slot_ref: { entity_id: 'name-trace-slot', authoring_version: '1' },
        source_frontier_id: 'name-trace-frontier', generation_ordinal: 0,
        status: 'active', state_version: 1,
        created_change_set_id: changeSetId, updated_change_set_id: changeSetId } },
      ...prepared.proposal.rows] } };
  const actorBundle = structuredClone(fixture.approved_actor_temporal_bundle);
  actorBundle.npc_identity = structuredClone(catalog);
  actorBundle.actor_profiles.universal_categories.find((row) => row.facet === 'sex_category').stable_code = 'female';
  const options = { verifiedItemCatalog: fixture.domain_catalog,
    actorBaseAttributesBinding: { schema: 'rus.actor_base_attributes_runtime_binding.v1',
      pin: actorPin, runtime_profile: actorProfile }, approvedActorTemporalBundle: actorBundle,
    worldBaseReader: { readPinnedG4NpcCompositionClosure: async () => ({ ok: true, value: closure }) },
    prepareNaturalFirstEntry: async () => ({ ok: true,
      approved_write_sets: [{ inserts: [], updates: [], appends: [] }],
      recheck: async () => ({ ok: true }) }),
    readFactualContext: async () => ({ ok: true, party_id: partyId,
      world_revision_id: fixture.world_revision_id, environment,
      calendar_profile: fixture.calendar_profile,
      started_at: { whole_minutes: '0', subminute_numerator: '0', subminute_denominator: '1' },
      recheck: async () => ({ ok: true }) }) };
  return { context, options };
}

async function generated(catalog = identityCatalog) {
  const setup = generatedSetup(catalog);
  const result = await createTargetGeneratedFirstEntry(setup.options)(setup.context);
  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.equal(npcRows(result).length, 2, 'fixed imported composition creates two NPCs');
  return { ...setup, result };
}

test('issue #601: generated first-entry hands off the original and exhausted name traces', async () => {
  const first = await generated();
  const npcs = npcRows(first.result);
  const choices = assertNameTrace(first.result.materialization_trace.choices, npcs);
  assert.equal(choices[0].rejection_summary.occupied_name_count, 0);
  assert.equal(choices[1].rejection_summary.occupied_name_count, 1);
  assert.equal(choices[1].rejection_summary.reason, 'scene_pool_exhausted');
  assert.equal(npcs[1].identity_state.name_provenance.reason, 'scene_pool_exhausted');
  assert.equal(choices[1].candidate_digest, choices[0].candidate_digest,
    'exhaustion traces the reused full applicable pool, not an empty filtered pool');
  for (const profile of profileRows(first.result)) {
    const npc = npcs.find((row) => row.npc_id === profile.actor_id);
    assert.deepEqual(profile.name_profile_snapshot, {
      canonical_name: npc.identity_state.canonical_name,
      name_provenance: npc.identity_state.name_provenance });
  }
  assert.deepEqual((await generated()).result.materialization_trace, first.result.materialization_trace);
});

function canonicalPlan() {
  const input = structuredClone(fixture);
  input.idempotency_key = 'army-284-canonical-7';
  input.approved_actor_temporal_bundle.npc_identity = structuredClone(identityCatalog);
  const result = materializeAuthoredStartPartyInstance(input);
  assert.equal(result.immediate.npcs.length, 2, 'fixed canonical-start seed creates two NPCs');
  const context = { party_id: result.party_id, idempotency_key: input.idempotency_key,
    schema_version: 'party_runtime_v2', domain_catalog_pin: itemPin,
    actor_base_attributes_catalog_pin: actorPin,
    version_pins: { world_revision_id: input.world_revision_id,
      world_catalog_digest: input.world_catalog_digest, materializer_version: input.materializer_version,
      rng_version: input.rng_algorithm_id, command_catalog_digest: input.scenario_manifest_digest,
      profile_bundle_digest: canonicalDigest(result.policy_profile_pins) } };
  const plan = buildLowerDvinaTracePhase1AWritePlan({ request_id: 'name-trace-stage24',
    party_creation_context: context, world_base_reference_digest: result.validation_report.world_base_reference_digest,
    party_db_write_plan_input_digest: canonicalDigest('name-trace-stage24'),
    approved_pipeline_outputs: { materialization_result: result,
      player_character_audit: result.validation_report, sealed_selection_closure: { pass: true } } });
  return { result, plan };
}

test('issue #601: canonical start and Stage24 preserve full name trace and unchanged name snapshots', () => {
  const { result, plan } = canonicalPlan();
  const selected = assertNameTrace(result.trace.choices, result.immediate.npcs);
  const records = (table) => plan.write_batches.find((batch) => batch.target_table === table).records;
  const run = records('party_materialization_runs')[0];
  assert.deepEqual(nameChoices(run.trace.choices), selected);
  const snapshot = records('party_state_snapshots')[0].state_payload;
  assert.deepEqual(nameChoices(snapshot.materialization_trace.choices), selected);
  assert.deepEqual(nameChoices(snapshot.persisted_projection.materialization_run.trace.choices), selected);
  for (const choice of selected) {
    const saved = records('party_materialization_choices').find((row) => row.choice_ordinal === choice.choice_ordinal);
    assert.equal(saved.selected_id, choice.selected_id);
    assert.equal(saved.candidate_set_digest, choice.candidate_digest);
    assert.deepEqual(saved.candidate_ids, choice.candidate_ids);
    assert.equal(saved.rng_draw, choice.rng_draw);
  }
  for (const npc of result.immediate.npcs) {
    const profile = records('party_actor_profile_bindings').find((row) => row.actor_id === npc.instance_id);
    assert.deepEqual(profile.name_profile_snapshot, {
      canonical_name: npc.identity_state.canonical_name,
      name_provenance: npc.identity_state.name_provenance });
  }
  assert.equal(selected[1].rejection_summary.reason, 'scene_pool_exhausted');
});

// Boundary: the first_entry run record below is a harness composition in the existing
// generated expansion shape. It calls real first-entry/P16 owners, not the expansion wrapper.
async function generatedCommitPlan({ context, result }) {
  const partyId = context.request.party_id;
  const changeSetId = context.change_set_id;
  const runId = `trace:${changeSetId}`;
  const row = (target_table, id, record) => ({ target_table, id, record: { party_id: partyId, ...record } });
  const inserts = [...context.proposal.inserts, ...result.approved_write_sets.flatMap((set) => set.inserts)];
  const appends = [row('party_materialization_runs', runId, { run_id: runId,
    g4_id: context.request.g4.id, run_kind: 'expansion', occurrence: 0,
    seed_digest: canonicalDigest('name-trace-seed'), input_digest: canonicalDigest('name-trace-input'),
    catalog_digest: itemPin.catalog_digest, materializer_version: 'm2c', rng_version: 'mulberry32_v1',
    result_digest: canonicalDigest(result.materialization_trace), idempotency_key: 'name-trace-entry',
    status: 'committed', validation_report: result.materialization_trace.validation_report,
    trace: { created_change_set_id: changeSetId, first_entry: result.materialization_trace },
    created_refs: inserts.map((write) => ({ table: write.target_table, id: write.id })) }),
  row('party_v3_change_sets', changeSetId, { id: changeSetId,
    operation_kind: 'resolve_frontier', idempotency_record_id: 'idem:name-trace-entry' })];
  const payload = { schema: 'temporal_visible_package.v1', perceived_scene: 'Местность.',
    perceived_changes: [], sensory_details: [], visible_npcs: [], visible_objects: [], known_context: [],
    uncertainties: [], hypotheses: [], player_safe_interruption: null, allowed_action_affordances: [] };
  const pins = [{ dependency_role: 'source_authoring',
    entity_ref: { entity_kind: 'world_revision', entity_id: fixture.world_revision_id },
    version_pin: { pin_kind: 'authoring_version', authoring_version: '1', state_version: null } }];
  const prepared = await buildCombinedWritePlan({ plan_id: 'plan:name-trace-entry', party_id: partyId,
    write_plan_kind: 'semantic_commit', operation_kind: 'resolve_frontier',
    canonical_input_digest: digest('name-trace-entry'), expected_state_versions: [],
    validation_report: { status: 'pass', digest: digest('name-trace-validation') },
    idempotency: { id: 'idem:name-trace-entry', key: 'name-trace-entry' }, change_set: { id: changeSetId },
    visible_package_envelope: { package_id: 'visible:name-trace-entry', party_id: partyId,
      turn_id: changeSetId, committed_state_version: '1', change_set_id: changeSetId,
      package_digest: digest(payload), visible_payload: payload, presentation_status: 'pending',
      projection_policy_ref: { entity_ref: { entity_kind: 'visibility_modifier', entity_id: 'projection' },
        authoring_version: '1' }, dependency_pins: { pins, canonical_digest: digest(pins).slice(7) },
      idempotency_record_id: 'idem:name-trace-entry' },
    approved_write_sets: [{ inserts, updates: [], appends }],
    lock_context: { owner_keys: [], execution_keys: [], g4_keys: [`${partyId}:${context.request.g4.id}`],
      physical_keys: [...inserts, ...appends].map((write) => `party_runtime.${write.target_table}:${write.id}`) },
    commit_rechecks: ['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set']
      .map((kind) => ({ kind, digest: digest(kind) })) }, { verifyApproval: async () => ({ ok: true }) });
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  return prepared.plan;
}

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });
test('issue #601 PostgreSQL: committed name trace, identity and snapshot survive catalog replacement and replay',
  { timeout: 180_000 }, async (t) => {
    if (docker(['version']).status !== 0) return t.skip('Docker required; run through pg-request');
    const container = `npc-name-trace-601-${process.pid}`;
    let pool;
    t.after(async () => { await pool?.end(); docker(['rm', '-fv', container]); });
    assert.equal(docker(['run', ...testContainerLabel(), '-d', '-p', '127.0.0.1::5432', '--name', container,
      '-e', 'POSTGRES_PASSWORD=test', '-e', 'POSTGRES_USER=test', '-e', 'POSTGRES_DB=test',
      'postgres:16-alpine']).status, 0);
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'test']).status === 0) {
        ready = true; break;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    assert.equal(ready, true, 'isolated PostgreSQL is ready');
    await new Promise((resolve) => setTimeout(resolve, 600));
    pool = new pg.Pool({ host: '127.0.0.1',
      port: Number(docker(['port', container, '5432']).stdout.match(/:(\d+)/)[1]),
      user: 'test', password: 'test', database: 'test' });
    for (const sql of SPATIAL_V3_TARGET_MIGRATIONS) await pool.query(sql);
    const first = await generated();
    const partyId = first.context.request.party_id;
    await pool.query(`INSERT INTO party_runtime.parties
      (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
      VALUES ($1,3,$2,$3,'m2c','mulberry32_v1','commands','profiles')`,
    [partyId, fixture.world_revision_id, fixture.world_catalog_digest]);
    const plan = await generatedCommitPlan(first);
    const committer = createSpatialV3PostgresCombinedAtomicCommitter({ pool, recheck: async () => ({ ok: true }) });
    const committed = await committer.commit({ plan });
    assert.equal(committed.ok, true, JSON.stringify(committed));
    const readback = async () => ({
      npcs: (await pool.query(`SELECT n.npc_id,n.identity_state,p.name_profile_snapshot
        FROM party_runtime.party_npcs n JOIN party_runtime.party_actor_profile_bindings p
          ON p.party_id=n.party_id AND p.actor_kind='npc' AND p.actor_id=n.npc_id
        WHERE n.party_id=$1 ORDER BY n.npc_id`, [partyId])).rows,
      runs: (await pool.query(`SELECT run_id,trace FROM party_runtime.party_materialization_runs
        WHERE party_id=$1 ORDER BY run_id`, [partyId])).rows });
    const before = await readback();
    assert.equal(before.runs.length, 1);
    assert.deepEqual(before.runs[0].trace.first_entry.choices, first.result.materialization_trace.choices);
    const expectedNpcIds = npcRows(first.result).map((npc) => npc.npc_id).sort();
    assert.deepEqual(before.npcs.map((npc) => npc.npc_id).sort(), expectedNpcIds,
      'readback includes every materialized NPC and its name snapshot');
    for (const npc of before.npcs) {
      const expected = npcRows(first.result).find((row) => row.npc_id === npc.npc_id);
      assert.deepEqual(npc.identity_state, expected.identity_state);
      assert.deepEqual(npc.name_profile_snapshot,
        profileRows(first.result).find((row) => row.actor_id === npc.npc_id).name_profile_snapshot);
    }
    const replacementCatalog = { ...identityCatalog, name_entries: soleNames.map((entry) => ({ ...entry,
      id: `${entry.id}-replacement`, name_form: `Новое ${entry.name_form}` })) };
    const fresh = await generated(replacementCatalog);
    assert.notDeepEqual(npcRows(fresh.result).map((npc) => npc.identity_state.canonical_name),
      npcRows(first.result).map((npc) => npc.identity_state.canonical_name),
      'replacement catalog changes a fresh uncommitted materialization');
    assert.notEqual(nameChoices(fresh.result.materialization_trace.choices)[0].candidate_digest,
      nameChoices(first.result.materialization_trace.choices)[0].candidate_digest);
    assert.notEqual(nameChoices(fresh.result.materialization_trace.choices)[0].selected_id,
      nameChoices(first.result.materialization_trace.choices)[0].selected_id);
    const replay = await committer.commit({ plan });
    assert.equal(replay.ok, true, JSON.stringify(replay));
    assert.equal(replay.replay, true);
    assert.deepEqual((await readback()).npcs.map((npc) => npc.npc_id).sort(), expectedNpcIds,
      'replay readback includes every materialized NPC and its name snapshot');
    assert.deepEqual(await readback(), before,
      'replay retains committed choices, identities and name snapshots after catalog replacement');
  });
