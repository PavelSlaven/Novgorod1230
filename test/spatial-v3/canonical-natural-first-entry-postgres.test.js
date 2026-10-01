import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { Pool } from 'pg';
import { computeSpatialV3CanonicalDigest as digest } from '@rus/contracts/spatial-v3/registry';
import { buildCombinedWritePlan } from '../../packages/turn/src/spatial-v3-write-plan.js';
import { createSpatialV3PostgresCombinedAtomicCommitter } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { createLowerDvinaTraceOrdinaryDiscoveryResolver } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-ordinary-discovery.js';
import { createTargetFiniteFirstEntryPorts } from
  '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-first-entry-provisioning.js';
import { readApprovedCanonicalFiniteApplicability } from
  '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-canonical-natural.js';
import { loadTargetFiniteFirstEntryProfile } from '../../apps/game-server/src/internal/target-runtime-profiles.js';
import { targetFiniteProfileCatalogFixture } from './target-finite-profile-fixture.js';
import { testContainerLabel } from '../helpers/test-containers.js';
import { createPostgresOrdinaryMaterializationEnablementRepository } from
  '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-enablement.js';
import { SPATIAL_V3_TARGET_MIGRATIONS } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';

const WORLD = 'novgorod_spatial_v3_target_contract_approval_001';
const G4 = 'g4v3__gn_nov_g3_xp017_yp026_r2_vikhtuy_locality';
const WATER = 'cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_water_access';
const file = JSON.parse(readFileSync(new URL(
  '../../data/world-catalogs/novgorod/m2c-items/canonical-finite-applicability.json', import.meta.url), 'utf8'));
const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });


test('PostgreSQL: a canonical commons G5 gets its approved finite source, and a take from it commits', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const container = `m2c-canonical-natural-${process.pid}`;
  let pool;
  t.after(async () => { if (pool) await pool.end(); docker(['rm', '-fv', container]); });
  const start = docker(['run', ...testContainerLabel(), '-d', '--name', container, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=ordinary', '-e', 'POSTGRES_USER=ordinary',
    '-e', 'POSTGRES_DB=ordinary', 'postgres:16-alpine']);
  assert.equal(start.status, 0, start.stderr);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'ordinary']).status === 0) { ready = true; break; }
  }
  assert.equal(ready, true);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const port = Number(docker(['port', container, '5432/tcp']).stdout.match(/:(\d+)\s*$/u)?.[1]);
  pool = new Pool({ host: '127.0.0.1', port, user: 'ordinary', password: 'ordinary',
    database: 'ordinary', connectionTimeoutMillis: 5000 });
  for (const sql of SPATIAL_V3_TARGET_MIGRATIONS) await pool.query(sql);
  await pool.query(readFileSync(new URL('../../tools/runtime-catalog-activation/migrations/party/001_runtime_catalog_pins.sql', import.meta.url), 'utf8'));
  await seedParty(pool);
  await seedCanonicalScene(pool, 'base', WATER);
  await seedCanonicalScene(pool, 'yard', 'cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_meeting_area');
  const verifiedCatalog = await targetFiniteProfileCatalogFixture();
  const loaded = await loadTargetFiniteFirstEntryProfile({ worldRevisionId: WORLD, verifiedCatalog });
  const { schema: _schema, ...catalogPin } = verifiedCatalog.pin;
  const pinFields = ['party_id', ...Object.keys(catalogPin)];
  await pool.query(`INSERT INTO party_runtime.party_catalog_pins (${pinFields.join(',')})
    VALUES (${pinFields.map((_, index) => `$${index + 1}`).join(',')})`, ['party-canon', ...Object.values(catalogPin)]);
  // The committed file is approved: the loaded profile already carries it.
  assert.notEqual(loaded.canonicalNaturalApplicability, null);
  const withRows = loaded;
  const request = { party_id: 'party-canon', g4: { id: G4, version: 1, world_revision_id: WORLD } };

  // Without an approved file nothing is provisioned for a canonical site (explicit unapproved copy).
  const unapproved = readApprovedCanonicalFiniteApplicability({ ...file,
    status: 'candidate_pending_independent_data_approval', approval: null }, WORLD);
  assert.equal(unapproved, null);
  const closed = createTargetFiniteFirstEntryPorts({ ...loaded, canonicalNaturalApplicability: unapproved });
  const proposalWater = await proposalFor(pool, 'base');
  const yardProposal = await proposalFor(pool, 'yard');
  // The proposal rows are the only copy: the site is created by the entry commit itself.
  for (const table of ['scene_position_nodes', 'party_g6_instances', 'party_scene_baselines', 'party_g5_sites']) {
    await pool.query(`DELETE FROM party_runtime.${table} WHERE party_id='party-canon'`);
  }
  await assert.rejects(() => closed.prepareFirstEntry({ transaction: pool, request,
    proposal: proposalWater, change_set_id: 'entry-canon' }), { code: 'ORDINARY_NATURAL_FIRST_ENTRY_BINDING_INVALID' });

  const ports = createTargetFiniteFirstEntryPorts(withRows);
  const committer = createSpatialV3PostgresCombinedAtomicCommitter({ pool,
    recheck: async () => ({ ok: true }), readNaturalSourceProperty: ports.readNaturalSourceProperty });
  const prepared = await ports.prepareFirstEntry({ transaction: pool, request,
    proposal: proposalWater, change_set_id: 'entry-canon' });
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  const nodes = prepared.approved_write_sets[0].inserts.filter((row) => row.target_table === 'party_resource_nodes');
  assert.equal(nodes.length, 1);
  assert.match(nodes[0].id, /^m2c_finite_driftwood_v1:/u);
  assert.equal(nodes[0].record.quantity_numerator, 100);
  const entry = await committer.commit({ plan: await generatedPlan(proposalWater, prepared.approved_write_sets,
    { changeId: 'entry-canon' }) });
  assert.equal(entry.ok, true, JSON.stringify(entry));
  const stock = () => pool.query(`SELECT quantity_numerator FROM party_runtime.party_resource_nodes
    WHERE party_id='party-canon' AND resource_node_id=$1`, [nodes[0].id]);
  assert.equal((await stock()).rows[0].quantity_numerator, '100');

  // A canonical place outside the approved rows (a yard) gets no finite source.
  await assert.rejects(() => ports.prepareFirstEntry({ transaction: pool, request, proposal: yardProposal,
    change_set_id: 'entry-yard' }), { code: 'ORDINARY_NATURAL_FIRST_ENTRY_BINDING_INVALID' });

  // A take (scripted Stage B, code-owned seed) commits and decrements the shared stock.
  await pool.query(`INSERT INTO party_runtime.party_player_characters
    (party_id,character_id,profile) VALUES ('party-canon','canon-actor','{}'::jsonb)`);
  await pool.query(`INSERT INTO party_runtime.party_journey_locations
    (id,party_id,owner_kind,owner_id,location_kind,scene_position_id,state_version,updated_change_set_id)
    VALUES ('canon-journey','party-canon','actor','canon-actor','scene','pos:base',1,'entry-canon')`);
  const repository = createPostgresOrdinaryMaterializationEnablementRepository({ pool });
  const enabled = await repository.load({ partyId: 'party-canon',
    scopeRef: { entity_kind: 'g6', entity_id: 'g6:base' } });
  assert.equal(enabled.execution_context.scope_presence_enabled, false);
  const cap = enabled.execution_context.context_bound_capabilities[0];
  const model = async (input) => {
    assert.equal(input.mode, 'resolve_presence', 'Stage A is never asked for a finite-only scope');
    return { schema: 'ordinary_materialization_plan_v1', request_id: input.request_id,
      resolution: 'materialize', density_band_proposal: null, background_groups: [],
      presence_resolutions: [], reason_code: 'finite-natural-source', entities: [{ semantic_descriptor: {
        semantic_type: cap.candidate_context.semantic_type, name: 'плавник', facts: [] },
      authority_class: 'ordinary', admission_class: 'common_mundane', availability_class: 'common',
      functional_bucket: 'other_ordinary', presence_expectation: 'routine',
      supporting_basis_ref: cap.source_ref,
      causal_basis: { basis_kind: 'finite_source', basis_refs: [cap.source_ref] },
      property_basis_ref: cap.context_refs.property_context_ref,
      placement_proposal: { scope_ref: 'g6:base', position_ref: 'pos:base' },
      mechanics_proposal: { mass_grams: 150, external_hand_cost: 2, carry_form: 'long',
        packing_slot_cost: 8, quantity: { value: 3, unit: 'item' }, container: null } }] };
  };
  model.verifyStageBCutover = async () => true;
  const take = createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId: 'party-canon',
    inputDigest: 'canon-take', loadEnablement: (input) => repository.load(input),
    ordinaryMaterializationModel: model });
  const output = await take({ request: { root_turn_id: 'canon-take-1' },
    operation: { target_refs: [cap.source_ref], query: 'плавник', quantity: { value: 3, unit: 'item' } },
    committed_state: { position: { g6_id: 'g6:base', position_id: 'pos:base' } }, working_projection: {} });
  const plan = output.ordinary_materialization_atomic_write_plan;
  assert.ok(plan?.item, JSON.stringify(output));
  const taken = await committer.commit({ plan: await generatedPlan({ inserts: [] }, [],
    { ordinary: plan, changeId: 'canon-take-1' }) });
  assert.equal(taken.ok, true, JSON.stringify(taken));
  assert.equal((await stock()).rows[0].quantity_numerator, '97');
});

async function proposalFor(pool, id) {
  const inserts = [];
  for (const [target_table, rowId] of [['party_g5_sites', id], ['party_scene_baselines', `baseline:${id}`],
    ['party_g6_instances', `g6:${id}`], ['scene_position_nodes', `pos:${id}`]]) {
    const result = await pool.query(`SELECT * FROM party_runtime.${target_table}
      WHERE party_id='party-canon' AND id=$1`, [rowId]);
    const record = JSON.parse(JSON.stringify(result.rows[0]));
    record.created_change_set_id = 'entry-canon';
    record.updated_change_set_id = 'entry-canon';
    record.state_version = Number(record.state_version);
    inserts.push({ target_table, id: record.id, record });
  }
  return { inserts, updates: [], target_site_id: id, target_position_id: `pos:${id}` };
}

async function seedParty(pool) {
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,
     rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ('party-canon',2,$1,'catalog','materializer','rng','commands','profiles')`, [WORLD]);
  await pool.query(`INSERT INTO party_runtime.party_v3_change_sets
    (id,party_id,operation_kind,expected_state_version_set_digest,expected_state_version_set,
     committed_state_version_set_digest,write_plan_digest,created_at_turn,committed_at_turn)
    VALUES ('entry','party-canon','first_entry','fixture','[]','fixture','fixture',0,0)`);
}

async function seedCanonicalScene(pool, id, canonicalRef) {
  const ref = (entity_id) => JSON.stringify({ entity_id, authoring_version: '1' });
  await pool.query(`INSERT INTO party_runtime.party_g5_sites
    (id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ($1,'party-canon','canonical',$2,$3::jsonb,'active',1,'entry','entry')`, [id, G4, ref(canonicalRef)]);
  await pool.query(`INSERT INTO party_runtime.party_scene_baselines
    (id,party_id,host_kind,host_id,source_kind,scene_template_ref,materialization_trace_id,
     materializer_version,catalog_digest,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ($1,'party-canon','g5_site',$2,'canonical_template',$3::jsonb,'trace',
      'materializer','catalog','active',1,'entry','entry')`,
  [`baseline:${id}`, id, ref('stfv3__g5_resource_v1')]);
  await pool.query(`INSERT INTO party_runtime.party_g6_instances
    (id,party_id,scene_baseline_id,source_scene_template_ref,scene_slot_key,host_kind,host_id,
     physical_class_id,primary_scene_role_id,vertical_context_id,overhead_cover_id,
     intra_g6_visibility_mode,default_visibility_distance_band,acoustic_uniformity,
     status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ($1,'party-canon',$2,$3::jsonb,'main','g5_site',$4,'open','primary','surface',
      'none','default_clear','short','uniform','active',1,'entry','entry')`,
  [`g6:${id}`, `baseline:${id}`, ref('stfv3__g5_resource_v1'), id]);
  await pool.query(`INSERT INTO party_runtime.scene_position_nodes
    (id,party_id,g6_instance_id,position_type_id,template_slot_key,template_instance_ordinal,
     capacity,access_class_id,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ($1,'party-canon',$2,'work','focus',0,1,'default','active',1,'entry','entry')`,
  [`pos:${id}`, `g6:${id}`]);
}

async function generatedPlan(proposal, sets, { ordinary = null, changeId = 'entry-generated' } = {}) {
  const change = { target_table: 'party_v3_change_sets', id: changeId, record: {
    id: changeId, party_id: 'party-canon', operation_kind: 'resolve_frontier',
    idempotency_record_id: `idem:${changeId}` } };
  const updates = ordinary == null ? [] : [{ target_table: 'parties', id: 'party-canon',
    record: { party_id: 'party-canon', schema_version: 2,
      state_version: ordinary.expected_versions.party_state_version + 1 } }];
  const payload = { schema: 'temporal_visible_package.v1', perceived_scene: 'Лес.',
    perceived_changes: [], sensory_details: [], visible_npcs: [], visible_objects: [],
    known_context: [], uncertainties: [], hypotheses: [], player_safe_interruption: null,
    allowed_action_affordances: [] };
  const pins = [{ dependency_role: 'source_authoring', entity_ref: {
    entity_kind: 'world_revision', entity_id: WORLD },
    version_pin: { pin_kind: 'authoring_version', authoring_version: '1', state_version: null } }];
  const result = await buildCombinedWritePlan({ plan_id: `plan:${changeId}`,
    party_id: 'party-canon', write_plan_kind: 'semantic_commit', operation_kind: 'resolve_frontier',
    canonical_input_digest: digest(ordinary == null ? 'natural-generated' : changeId),
    expected_state_versions: ordinary == null ? [] : [{ target_schema: 'party_runtime',
      target_table: 'parties', id: 'party-canon', state_version: ordinary.expected_versions.party_state_version }],
    validation_report: { status: 'pass', digest: digest('natural-generated') },
    idempotency: { id: `idem:${changeId}`, key: ordinary == null ? 'natural-generated' : changeId }, change_set: { id: changeId },
    visible_package_envelope: { package_id: `visible:${changeId}`, party_id: 'party-canon',
      turn_id: changeId, committed_state_version: String(ordinary == null ? 1 : ordinary.expected_versions.party_state_version + 1),
      change_set_id: changeId,
      package_digest: digest(payload), visible_payload: payload, presentation_status: 'pending',
      projection_policy_ref: { entity_ref: { entity_kind: 'visibility_modifier', entity_id: 'projection' },
        authoring_version: '1' }, dependency_pins: { pins, canonical_digest: digest(pins).slice(7) },
      idempotency_record_id: `idem:${changeId}` },
    ordinary_materialization_atomic_write_plan: ordinary,
    approved_write_sets: [{ inserts: proposal.inserts, updates, appends: [change] }, ...sets],
    lock_context: { owner_keys: [], execution_keys: [], g4_keys: [`party-canon:${G4}`],
      physical_keys: [...proposal.inserts, ...sets.flatMap((set) => set.inserts), ...updates, change]
        .map((row) => `party_runtime.${row.target_table}:${row.id}`).concat(ordinary == null ? [] : [
          'party_runtime.party_ordinary_materialization_aggregates:party-canon:g6:g6:base',
          `party_runtime.party_resource_nodes:party-canon:${ordinary.finite_resource_transition.source_resource_node_id}`]) },
    commit_rechecks: ['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set']
      .map((kind) => ({ kind, digest: digest(kind) }))
  }, { verifyApproval: async () => ({ ok: true }) });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.plan;
}

async function inTransaction(pool, work) {
  const transaction = await pool.connect();
  try {
    await transaction.query('BEGIN');
    const result = await work(transaction);
    await transaction.query('COMMIT');
    return result;
  } catch (error) {
    await transaction.query('ROLLBACK');
    throw error;
  } finally { transaction.release(); }
}
