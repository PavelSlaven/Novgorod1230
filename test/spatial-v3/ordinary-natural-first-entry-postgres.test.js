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
import { createApprovedGeneratedNaturalPropertyReader } from
  '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-natural-property.js';
import { canonicalDigest } from '@rus/materialization';
import { applyOrdinaryMaterializationAtomicWritePlanInTransaction,
  createOrdinaryMaterializationAtomicWritePlan } from
  '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-phase-6-commit.js';
import { createOrdinaryMaterializationFirstEntryProvisioner,
  createOrdinaryGeneratedFirstEntryProposal, createTargetFiniteFirstEntryPorts } from
  '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-first-entry-provisioning.js';
import { loadTargetFiniteFirstEntryProfile } from '../../apps/game-server/src/internal/target-runtime-profiles.js';
import { targetFiniteProfileCatalogFixture } from './target-finite-profile-fixture.js';
import { testContainerLabel } from '../helpers/test-containers.js';
import { createPostgresOrdinaryMaterializationEnablementRepository } from
  '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-enablement.js';
import { SPATIAL_V3_TARGET_MIGRATIONS } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const candidateBytes = readFileSync(new URL(
  '../../data/world-catalogs/novgorod/m2c-items/candidate.json', import.meta.url), 'utf8');
const candidate = JSON.parse(candidateBytes);
const propertyBytes = readFileSync(new URL(
  '../../data/world-catalogs/novgorod/m2c-items/property-context-candidate.json', import.meta.url), 'utf8');
const propertyCandidate = JSON.parse(propertyBytes);
const propertyApproval = json('../../data/world-catalogs/novgorod/m2c-items/property-context-approval.json');
const sourceBytes = Object.fromEntries(propertyCandidate.source_set.map(({ path }) =>
  [path, readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')]));
const propertyReader = () => createApprovedGeneratedNaturalPropertyReader({ candidateBytes: propertyBytes,
  approval: propertyApproval, sourceBytesByPath: sourceBytes });
const approval = json('../../data/world-catalogs/novgorod/m2c-items/approval-attestation.json');
const profile = json('../../data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m22-content/ordinary-materialization-profile.json');
const family = candidate.family_profiles.find((row) =>
  row.authoring_axes.landscape === 'forest' && row.authoring_axes.function === 'forest_tract');
const binding = (g5) => ({ g5_id: g5, world_revision_id: candidate.target.world_revision_id,
  g4_id: family.exact_match.g4_refs[0].id, g4_version: 1,
  g5_generation_template_id: family.exact_match.g5_generation_template_id,
  g5_generation_template_version: 1, scene_template_id: 'stfv3__g5_general_hazard_v1',
  scene_template_version: 1, g6_slot_key: 'main', position_slot_key: 'focus' });
const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });

test('natural first-entry rejects changed authoring before database access', () => {
  assert.throws(() => createOrdinaryGeneratedFirstEntryProposal({ profile, naturalSourceAuthoring: {
    candidateBytes: `${candidateBytes} `, approval } }),
  { code: 'ORDINARY_NATURAL_AUTHORING_NOT_APPROVED' });
  for (const sourceBytesByPath of [{}, { ...sourceBytes,
    [propertyCandidate.source_set[0].path]: 'changed' }]) {
    assert.throws(() => createApprovedGeneratedNaturalPropertyReader({ candidateBytes: propertyBytes,
      approval: propertyApproval, sourceBytesByPath }), { code: 'M2C_NATURAL_ACCESS_CONTEXT_UNRESOLVED' });
  }
});

test('PostgreSQL natural first-entry preserves finite stock, exact G5 identity and property precedence', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const container = `m2c-natural-entry-${process.pid}`;
  let pool;
  t.after(async () => { if (pool) await pool.end(); docker(['rm', '-fv', container]); });
  const start = docker(['run', ...testContainerLabel(), '-d', '--name', container, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=ordinary', '-e', 'POSTGRES_USER=ordinary',
    '-e', 'POSTGRES_DB=ordinary', 'postgres:16-alpine']);
  assert.equal(start.status, 0, start.stderr);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (docker(['exec', container, 'pg_isready', '-U', 'ordinary']).status === 0) {
      ready = true; break;
    }
  }
  assert.equal(ready, true);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const port = Number(docker(['port', container, '5432/tcp']).stdout.match(/:(\d+)\s*$/u)?.[1]);
  pool = new Pool({ host: '127.0.0.1', port, user: 'ordinary', password: 'ordinary',
    database: 'ordinary', connectionTimeoutMillis: 5000 });
  for (const sql of SPATIAL_V3_TARGET_MIGRATIONS) await pool.query(sql);
  await pool.query(readFileSync(new URL('../../tools/runtime-catalog-activation/migrations/party/001_runtime_catalog_pins.sql', import.meta.url), 'utf8'));
  await seedParty(pool);
  for (const g5 of ['first', 'second', 'rights', 'unknown']) await seedScene(pool, g5);
  const legacy = createOrdinaryMaterializationFirstEntryProvisioner({ profile });
  const invokeLegacy = () => inTransaction(pool, (transaction) => legacy.provision({
    transaction, partyId: 'party-natural', changeSetId: 'entry',
    firstEntryBinding: { g6_instance_id: 'g6:first', position_id: 'pos:first' } }));
  assert.equal((await invokeLegacy()).provisioned, true);
  assert.equal((await invokeLegacy()).provisioned, false);
  const repository = createPostgresOrdinaryMaterializationEnablementRepository({ pool });
  const load = (g5) => repository.load({ partyId: 'party-natural',
    scopeRef: { entity_kind: 'g6', entity_id: `g6:${g5}` } });
  assert.equal((await load('first')).execution_context.context_bound_capabilities.length, 1);
  assert.equal((await pool.query('SELECT count(*)::int n FROM party_runtime.party_resource_nodes')).rows[0].n, 1);
  const proposal = await cloneSceneProposal(pool, 'first', 'generated');
  const verifiedCatalog = await targetFiniteProfileCatalogFixture();
  const targetProfile = await loadTargetFiniteFirstEntryProfile({ worldRevisionId: candidate.target.world_revision_id, verifiedCatalog });
  const targetPorts = createTargetFiniteFirstEntryPorts(targetProfile);
  const readProperty = targetPorts.readNaturalSourceProperty;
  await assert.rejects(() => readProperty({ transaction: pool, partyId: 'party-natural',
    g5Id: 'unknown', g4Id: binding('unknown').g4_id,
    sourceRef: `m2c_finite_deadwood_v1:${canonicalDigest({ party_id: 'party-natural',
      generated_g5_id: 'unknown', profile_id: 'm2c_finite_deadwood_v1', version: 1 }).slice(0, 24)}`,
    profileId: 'm2c_finite_deadwood_v1', operation: 'gather_deadwood' }),
  { code: 'M2C_NATURAL_ACCESS_CONTEXT_UNRESOLVED' });
  const prepare = targetPorts.prepareFirstEntry;
  await assert.rejects(prepare({ transaction: pool, request: { party_id: 'party-natural' } }),
    { code: 'ORDINARY_FINITE_CATALOG_PIN_MISMATCH' });
  const { schema: _schema, ...catalogPin } = verifiedCatalog.pin;
  const pinFields = ['party_id', ...Object.keys(catalogPin)];
  await pool.query(`INSERT INTO party_runtime.party_catalog_pins (${pinFields.join(',')})
    VALUES (${pinFields.map((_, index) => `$${index + 1}`).join(',')})`, ['party-natural', ...Object.values(catalogPin)]);
  let failBeforeCommit = true;
  const committer = createSpatialV3PostgresCombinedAtomicCommitter({ pool,
    recheck: async () => ({ ok: true }) });
  const generate = () => committer.prepareExpansion({ party_id: 'party-natural',
    g4_id: binding('generated').g4_id, idempotency_key: 'natural-generated',
    canonical_input_digest: digest('natural-generated'), prepare: async ({ transaction }) => {
      const admitted = await prepare({ transaction, request: { party_id: 'party-natural',
        g4: { id: binding('generated').g4_id, version: 1,
          world_revision_id: candidate.target.world_revision_id } },
        proposal, change_set_id: 'entry-generated' });
      const plan = await generatedPlan(proposal, admitted.approved_write_sets);
      return { ok: true, plan, recheck: async (context) => {
        const current = await admitted.recheck(context);
        return failBeforeCommit ? { ok: false, code: 'state_version_conflict' } : current;
      }, created_at_turn: 0 };
    } });
  assert.equal((await generate()).ok, false);
  assert.equal((await pool.query("SELECT count(*)::int n FROM party_runtime.party_g5_sites WHERE id='generated'")).rows[0].n, 0);
  assert.equal((await pool.query('SELECT count(*)::int n FROM party_runtime.party_resource_nodes')).rows[0].n, 1);
  assert.equal((await pool.query("SELECT count(*)::int n FROM party_runtime.party_command_idempotency WHERE idempotency_key='natural-generated'")).rows[0].n, 0);
  failBeforeCommit = false;
  const generated = await generate();
  assert.equal(generated.ok, true, JSON.stringify(generated));
  const generatedLoad = await load('generated');
  assert.equal(generatedLoad.property_placement_context.item_kind, 'natural_resource_portion');
  assert.equal(generatedLoad.execution_context.context_bound_capabilities.length, 2);
  assert.equal(generatedLoad.execution_context.scope_presence_enabled, false);
  assert.deepEqual(generatedLoad.execution_context.allowed_disclosure_policy_refs, []);
  assert.equal(generatedLoad.execution_context.stage_b_classification_eval.version, 2);
  assert.equal(generatedLoad.execution_context.stage_b_classification_eval.cases.length, 13);
  assert.equal(generatedLoad.objective_context.context_refs.region_ref, targetProfile.profile.context_refs.region_ref);
  for (const cap of generatedLoad.execution_context.context_bound_capabilities) {
    assert.equal(cap.execution_context.mechanics_policy.mass_grams_per_quantity_unit, 50);
    assert.equal(cap.finite_source_authority.finite_source.quantity_unit_ref.id, 'item');
  }
  assert.equal((await pool.query('SELECT count(*)::int n FROM party_runtime.party_resource_nodes')).rows[0].n, 3,
    'legacy stock and two generated stocks coexist without duplication');
  const model = async () => assert.fail('natural-only scope cannot authorize generic man-made discovery');
  model.verifyStageBCutover = async () => true;
  const discover = createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId: 'party-natural',
    loadEnablement: (input) => repository.load(input), ordinaryMaterializationModel: model });
  const unavailable = await discover({ request: { root_turn_id: 'man-made-probe' },
    operation: { target_refs: ['g6:generated'], query: 'найти ложку' },
    committed_state: { position: { g6_id: 'g6:generated', location_ref: 'pos:generated' } } });
  assert.equal(unavailable.consequence_fragment.visible_seed.ordinary_presence_seed.resolution, 'no_change');
  const generatedSource = generatedLoad.execution_context.committed_finite_sources.find(
    (row) => row.source_resource_node_id.startsWith('m2c_finite_deadwood_v1:'));
  assert.equal(generatedSource.quantity.numerator, 60);
  const lookup = () => readProperty({ transaction: pool, partyId: 'party-natural',
    g5Id: 'generated', g4Id: binding('generated').g4_id,
    sourceRef: generatedSource.source_resource_node_id,
    profileId: 'm2c_finite_deadwood_v1', operation: 'gather_deadwood' });
  assert.equal((await lookup()).explicit_rule.decision, 'allow');
  const objectiveRow = (await pool.query(`SELECT objective_snapshot FROM
    party_runtime.party_ordinary_materialization_enablements WHERE scope_id='g6:generated'`)).rows[0];
  const objective = objectiveRow.objective_snapshot;
  const updateObjective = async (value) => pool.query(`UPDATE
    party_runtime.party_ordinary_materialization_enablements SET objective_snapshot=$1::jsonb,
    objective_digest=$2 WHERE scope_id='g6:generated'`, [JSON.stringify(value), canonicalDigest(value)]);
  const deniedObjective = structuredClone(objective);
  const deniedCapability = deniedObjective.execution_context.context_bound_capabilities.find(
    (row) => row.source_ref === generatedSource.source_resource_node_id);
  deniedCapability.access_decision = 'deny';
  await updateObjective(deniedObjective);
  assert.equal((await lookup()).explicit_rule.decision, 'deny', 'current explicit override wins');
  const deniedTurn = await discover({ request: { root_turn_id: 'foreign-owned-source' },
    operation: { target_refs: [generatedSource.source_resource_node_id],
      query: 'взять дерево с чужого участка' },
    committed_state: { position: { g6_id: 'g6:generated', position_id: 'pos:generated' } },
    working_projection: {} });
  assert.equal(deniedTurn.ordinary_materialization_atomic_write_plan, undefined);
  assert.equal((await load('generated')).execution_context.committed_finite_sources.find(
    (row) => row.source_resource_node_id === generatedSource.source_resource_node_id).quantity.numerator, 60);
  deniedObjective.execution_context.context_bound_capabilities.push(structuredClone(deniedCapability));
  await updateObjective(deniedObjective);
  await assert.rejects(lookup, { code: 'M2C_NATURAL_ACCESS_CONTEXT_UNRESOLVED' });
  await updateObjective(objective);
  await pool.query(`INSERT INTO party_runtime.party_player_characters
    (party_id,character_id,profile) VALUES ('party-natural','natural-actor','{}'::jsonb)`);
  await pool.query(`INSERT INTO party_runtime.party_journey_locations
    (id,party_id,owner_kind,owner_id,location_kind,scene_position_id,state_version,updated_change_set_id)
    VALUES ('natural-journey','party-natural','actor','natural-actor','scene','pos:generated',1,'entry-generated')`);
  const sourceCap = objective.execution_context.context_bound_capabilities.find(
    (row) => row.source_ref === generatedSource.source_resource_node_id);
  let extractionCalls = 0;
  const extractionModel = async (request) => { extractionCalls += 1; return ({ schema: 'ordinary_materialization_plan_v1',
    request_id: request.request_id, resolution: request.mode === 'seed_scope' ? 'seeded' : 'materialize',
    density_band_proposal: request.mode === 'seed_scope' ? 'ordinary' : null,
    background_groups: [], presence_resolutions: [], reason_code: 'finite-natural-source',
    entities: request.mode === 'seed_scope' ? [] : [{ semantic_descriptor: {
      semantic_type: sourceCap.candidate_context.semantic_type, name: 'порция валежника', facts: [] },
    authority_class: 'ordinary', admission_class: 'common_mundane', availability_class: 'common',
    functional_bucket: 'other_ordinary', presence_expectation: 'routine',
    supporting_basis_ref: sourceCap.source_ref,
    causal_basis: { basis_kind: 'finite_source', basis_refs: [sourceCap.source_ref] },
    property_basis_ref: sourceCap.context_refs.property_context_ref,
    placement_proposal: { scope_ref: 'g6:generated', position_ref: 'pos:generated' },
    mechanics_proposal: { mass_grams: 1000, external_hand_cost: 1, carry_form: 'regular',
      packing_slot_cost: 4, quantity: { value: 20, unit: 'item' }, container: null } }] }); };
  extractionModel.verifyStageBCutover = async () => true;
  const extract = createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId: 'party-natural',
    inputDigest: 'generated-extraction', loadEnablement: (input) => repository.load(input),
    ordinaryMaterializationModel: extractionModel });
  for (let turn = 1; turn <= 3; turn += 1) {
    const output = await extract({ request: { root_turn_id: `generated-take-${turn}` },
      operation: { target_refs: [sourceCap.source_ref], query: `собрать порцию валежника ${turn}` },
      committed_state: { position: { g6_id: 'g6:generated', position_id: 'pos:generated' } },
      working_projection: {} });
    const plan = output.ordinary_materialization_atomic_write_plan;
    assert.ok(plan?.item, JSON.stringify(output));
    if (turn === 1) {
      for (const decision of ['deny', 'missing']) {
        const changed = structuredClone(objective);
        const caps = changed.execution_context.context_bound_capabilities;
        if (decision === 'missing') changed.execution_context.context_bound_capabilities = caps.filter(
          (row) => row.source_ref !== sourceCap.source_ref);
        else caps.find((row) => row.source_ref === sourceCap.source_ref).access_decision = decision;
        await updateObjective(changed);
        const { schema: ignoredSchema, write_plan_digest: ignoredDigest,
          ...raw } = structuredClone(plan);
        raw.enablement_pin.objective_digest = canonicalDigest(changed);
        await assert.rejects(() => inTransaction(pool, (client) =>
          applyOrdinaryMaterializationAtomicWritePlanInTransaction({ client,
            input: createOrdinaryMaterializationAtomicWritePlan(raw), updatePartyState: true,
            p16ChangeSetId: 'entry-generated', readNaturalSourceProperty: readProperty })),
        { code: decision === 'deny' ? 'ORDINARY_PHASE6_SOURCE_ACCESS_DENIED'
          : 'ORDINARY_PHASE6_SOURCE_ACCESS_UNRESOLVED' });
        assert.equal((await pool.query(`SELECT quantity_numerator FROM party_runtime.party_resource_nodes
          WHERE resource_node_id=$1`, [sourceCap.source_ref])).rows[0].quantity_numerator, '60');
      }
      await updateObjective(objective);
      await assert.rejects(() => inTransaction(pool, (client) =>
        applyOrdinaryMaterializationAtomicWritePlanInTransaction({ client, input: plan,
          updatePartyState: true, p16ChangeSetId: 'entry-generated' })),
      { code: 'ORDINARY_PHASE6_SOURCE_ACCESS_UNRESOLVED' });
    }
    const combined = createSpatialV3PostgresCombinedAtomicCommitter({ pool,
      recheck: async () => ({ ok: true }), readNaturalSourceProperty: readProperty });
    const extracted = await combined.commit({ plan: await generatedPlan({ inserts: [] }, [], {
      ordinary: plan, changeId: `natural-take-${turn}` }) });
    assert.equal(extracted.ok, true, JSON.stringify(extracted));
  }
  assert.equal((await generate()).ok, true);
  const replaySource = (await load('generated')).execution_context.committed_finite_sources.find(
    (row) => row.source_resource_node_id === generatedSource.source_resource_node_id);
  assert.equal(replaySource.quantity.numerator, 0, 'P16 replay never refills generated source');
  assert.equal(replaySource.lifecycle_state, 'depleted');
  const beforeAbsent = extractionCalls;
  for (const [target, query] of [[sourceCap.source_ref, 'взять ещё валежника'],
    ['berries-without-source', 'взять ягоды']]) {
    const absent = await extract({ request: { root_turn_id: `absent:${target}` },
      operation: { target_refs: [target], query },
      committed_state: { position: { g6_id: 'g6:generated', position_id: 'pos:generated' } },
      working_projection: {} });
    assert.equal(absent.ordinary_materialization_atomic_write_plan, undefined);
  }
  assert.equal(extractionCalls, beforeAbsent, 'absent or depleted source does not call Stage B');
  assert.equal((await pool.query(`SELECT sum((mechanics_snapshot->'mechanics'->>'mass_grams')::int)::int grams
    FROM party_runtime.party_ordinary_materialization_items WHERE scope_id='g6:generated'`)).rows[0].grams, 3000);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM party_runtime.party_resource_nodes
    WHERE resource_node_id=$1`, [generatedSource.source_resource_node_id])).rows[0].n, 1);
});

async function cloneSceneProposal(pool, from, to) {
  const inserts = [];
  for (const [target_table, id] of [['party_g5_sites', from],
    ['party_scene_baselines', `baseline:${from}`], ['party_g6_instances', `g6:${from}`],
    ['scene_position_nodes', `pos:${from}`]]) {
    const result = await pool.query(`SELECT * FROM party_runtime.${target_table}
      WHERE party_id='party-natural' AND id=$1`, [id]);
    const record = JSON.parse(JSON.stringify(result.rows[0]), (_, value) =>
      typeof value === 'string' ? value === from ? to : value.replaceAll(`:${from}`, `:${to}`) : value);
    record.created_change_set_id = 'entry-generated';
    record.updated_change_set_id = 'entry-generated';
    record.state_version = Number(record.state_version);
    if (target_table === 'party_g5_sites') record.generation_ordinal = 4;
    inserts.push({ target_table, id: record.id, record });
  }
  return { inserts, updates: [], target_site_id: to, target_position_id: `pos:${to}` };
}

async function generatedPlan(proposal, sets, { ordinary = null, changeId = 'entry-generated' } = {}) {
  const change = { target_table: 'party_v3_change_sets', id: changeId, record: {
    id: changeId, party_id: 'party-natural', operation_kind: 'resolve_frontier',
    idempotency_record_id: `idem:${changeId}` } };
  const updates = ordinary == null ? [] : [{ target_table: 'parties', id: 'party-natural',
    record: { party_id: 'party-natural', schema_version: 2,
      state_version: ordinary.expected_versions.party_state_version + 1 } }];
  const payload = { schema: 'temporal_visible_package.v1', perceived_scene: 'Лес.',
    perceived_changes: [], sensory_details: [], visible_npcs: [], visible_objects: [],
    known_context: [], uncertainties: [], hypotheses: [], player_safe_interruption: null,
    allowed_action_affordances: [] };
  const pins = [{ dependency_role: 'source_authoring', entity_ref: {
    entity_kind: 'world_revision', entity_id: candidate.target.world_revision_id },
    version_pin: { pin_kind: 'authoring_version', authoring_version: '1', state_version: null } }];
  const result = await buildCombinedWritePlan({ plan_id: `plan:${changeId}`,
    party_id: 'party-natural', write_plan_kind: 'semantic_commit', operation_kind: 'resolve_frontier',
    canonical_input_digest: digest(ordinary == null ? 'natural-generated' : changeId),
    expected_state_versions: ordinary == null ? [] : [{ target_schema: 'party_runtime',
      target_table: 'parties', id: 'party-natural', state_version: ordinary.expected_versions.party_state_version }],
    validation_report: { status: 'pass', digest: digest('natural-generated') },
    idempotency: { id: `idem:${changeId}`, key: ordinary == null ? 'natural-generated' : changeId }, change_set: { id: changeId },
    visible_package_envelope: { package_id: `visible:${changeId}`, party_id: 'party-natural',
      turn_id: changeId, committed_state_version: String(ordinary == null ? 1 : ordinary.expected_versions.party_state_version + 1),
      change_set_id: changeId,
      package_digest: digest(payload), visible_payload: payload, presentation_status: 'pending',
      projection_policy_ref: { entity_ref: { entity_kind: 'visibility_modifier', entity_id: 'projection' },
        authoring_version: '1' }, dependency_pins: { pins, canonical_digest: digest(pins).slice(7) },
      idempotency_record_id: `idem:${changeId}` },
    ordinary_materialization_atomic_write_plan: ordinary,
    approved_write_sets: [{ inserts: proposal.inserts, updates, appends: [change] }, ...sets],
    lock_context: { owner_keys: [], execution_keys: [], g4_keys: [`party-natural:${binding('generated').g4_id}`],
      physical_keys: [...proposal.inserts, ...sets.flatMap((set) => set.inserts), ...updates, change]
        .map((row) => `party_runtime.${row.target_table}:${row.id}`).concat(ordinary == null ? [] : [
          'party_runtime.party_ordinary_materialization_aggregates:party-natural:g6:g6:generated',
          `party_runtime.party_resource_nodes:party-natural:${ordinary.finite_resource_transition.source_resource_node_id}`]) },
    commit_rechecks: ['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set']
      .map((kind) => ({ kind, digest: digest(kind) }))
  }, { verifyApproval: async () => ({ ok: true }) });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.plan;
}

async function seedParty(pool) {
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,
     rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ('party-natural',2,$1,'catalog','materializer','rng','commands','profiles')`,
  [candidate.target.world_revision_id]);
  await pool.query(`INSERT INTO party_runtime.party_v3_change_sets
    (id,party_id,operation_kind,expected_state_version_set_digest,expected_state_version_set,
     committed_state_version_set_digest,write_plan_digest,created_at_turn,committed_at_turn)
    VALUES ('entry','party-natural','first_entry','fixture','[]','fixture','fixture',0,0)`);
}

async function seedScene(pool, id) {
  const b = binding(id);
  const ref = (entity_id) => JSON.stringify({ entity_id, authoring_version: '1' });
  await pool.query(`INSERT INTO party_runtime.party_g5_sites
    (id,party_id,origin,parent_g4_id,generated_template_ref,expansion_slot_ref,source_frontier_id,
     generation_ordinal,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ($1,'party-natural','generated',$2,$3::jsonb,$4::jsonb,$5,$6,'active',1,'entry','entry')`,
  [id, b.g4_id, ref(b.g5_generation_template_id),
    ref(propertyCandidate.g4_bindings.find((row) => row.g4_id === b.g4_id).slot_refs[0].id), `frontier:${id}`,
    ['first', 'second', 'rights', 'unknown'].indexOf(id)]);
  await pool.query(`INSERT INTO party_runtime.party_scene_baselines
    (id,party_id,host_kind,host_id,source_kind,scene_template_ref,materialization_trace_id,
     materializer_version,catalog_digest,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ($1,'party-natural','g5_site',$2,'generated_template',$3::jsonb,'trace',
      'materializer','catalog','active',1,'entry','entry')`,
  [`baseline:${id}`, id, ref(b.scene_template_id)]);
  await pool.query(`INSERT INTO party_runtime.party_g6_instances
    (id,party_id,scene_baseline_id,source_scene_template_ref,scene_slot_key,host_kind,host_id,
     physical_class_id,primary_scene_role_id,vertical_context_id,overhead_cover_id,
     intra_g6_visibility_mode,default_visibility_distance_band,acoustic_uniformity,
     status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ($1,'party-natural',$2,$3::jsonb,'main','g5_site',$4,'open','primary','surface',
      'none','default_clear','short','uniform','active',1,'entry','entry')`,
  [`g6:${id}`, `baseline:${id}`, ref(b.scene_template_id), id]);
  await pool.query(`INSERT INTO party_runtime.scene_position_nodes
    (id,party_id,g6_instance_id,position_type_id,template_slot_key,template_instance_ordinal,
     capacity,access_class_id,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ($1,'party-natural',$2,'work','focus',0,1,'default','active',1,'entry','entry')`,
  [`pos:${id}`, `g6:${id}`]);
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
