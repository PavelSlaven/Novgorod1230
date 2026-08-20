import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Pool } from 'pg';
import {
  applyOrdinaryAggregateTransition,
  canonicalDigest,
  createOrdinaryAggregate,
  validateOrdinaryBackgroundGroup
} from '@rus/materialization';
import {
  admitOrdinaryWorldMaterialization,
  ordinaryWorldPropertyPlacementContextDigest,
  resolveOrdinaryWorldPropertyPlacement
} from '@rus/items-property';
import { ORDINARY_ARMAMENT_MECHANICS_CAPABILITY,
  resolveOrdinaryArmamentMechanics } from '@rus/combat-health';
import {
  createOrdinaryMaterializationAtomicWritePlan,
  applyOrdinaryMaterializationAtomicWritePlanInTransaction,
  createPostgresOrdinaryMaterializationAtomicCommitter,
  createPostgresOrdinaryMaterializationPhase6Factory
} from '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-phase-6-commit.js';
import { createPostgresOrdinaryMaterializationEnablementRepository } from
  '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-enablement.js';
import { createLowerDvinaTraceOrdinaryDiscoveryResolver } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-ordinary-discovery.js';

const docker = (args, input) => spawnSync('docker', args, {
  input,
  encoding: 'utf8',
  timeout: 60_000
});
const container = `ordinary-phase6-${process.pid}`;
const migrations = ['001_party_runtime.sql', '002_party_runtime_v3.sql', '003_party_runtime_v3_planning.sql', '004_party_runtime_v3_journeys.sql', '005_party_runtime_v3_domain.sql', '006_party_runtime_v3_migration.sql', '007_party_runtime_temporal_world.sql', '008_party_runtime_pr8_first_entry.sql', '009_party_runtime_pr8_reaction_knowledge.sql', '010_party_runtime_pr8_reaction_options.sql', '011_party_runtime_first_playable.sql', '012_party_runtime_external_ownership.sql', '013_party_runtime_obligations.sql', '014_party_runtime_activity_resume_terminal.sql', '015_party_runtime_turn_step_items.sql', '016_party_runtime_npc_semantic_conversation.sql', '017_party_runtime_conversation_transcript.sql', '018_party_runtime_phase7_container_state.sql', '019_party_runtime_combat_sessions.sql', '020_party_runtime_actor_equipment.sql', '021_party_runtime_ordinary_materialization.sql', '022_party_runtime_ordinary_materialization_commit.sql', '023_party_runtime_ordinary_materialization_enablement.sql', '024_party_runtime_ordinary_world_items.sql', '025_party_runtime_finite_resource_transitions.sql', '026_party_runtime_existing_container_ordinary_contents.sql'];
const scope_ref = Object.freeze({ entity_kind: 'g6', entity_id: 'scope-a' });

function propertyPlacementContext() {
  return {
    scope_ref:{...scope_ref}, item_kind:'man_made',
    property_catalog_version_ref:'property-catalog-v1',
    placement_catalog_version_ref:'placement-catalog-v1',
    personal_communal_refs:[], occupied_site_refs:['occupied-source'],
    unowned_cause_refs:[], placement_context_refs:['placement-context'],
    property_catalog:[{property_basis_ref:'property',state:'committed',scope_ref:{...scope_ref},basis_class:'occupied_site_default',source_ref:'occupied-source',unowned_cause_ref:null}],
    placement_catalog:[{position_ref:'position',state:'committed',scope_ref:{...scope_ref},position_kind:'scene_position',g6_ref:scope_ref.entity_id,containment_depth:1,placement_context_ref:'placement-context'}]
  };
}

function propertyPlacementDigest(value = propertyPlacementContext()) {
  return ordinaryWorldPropertyPlacementContextDigest({
    ...value, supporting_basis_ref:'digest-only', causal_basis_refs:['digest-only'],
    requested_position_ref:'digest-only'
  });
}

function preparedGroup(request_id = 'seed-group-a') {
  return validateOrdinaryBackgroundGroup({
    request: { schema:'ordinary_materialization_request_v1',request_id,mode:'seed_scope',scope_ref:{...scope_ref},candidate_query:null,context_refs:{function_refs:[],property_context_ref:'property-a'},policy_refs:{context_bound_permission_refs:[],allowed_admission_classes:['common_mundane'],allowed_supporting_bases:[{basis_ref:'basis-a',basis_state:'committed'}]} },
    group: { descriptor:'ordinary household layer',functional_bucket:'household',availability_class:'common',allowed_admission_classes:['common_mundane'],causal_basis:{basis_kind:'household_use',basis_refs:['basis-a']},property_basis_ref:'property-a',permission_refs:[],disclosure_policy_ref:'disclosure-a' },
    basis_catalog:[{basis_ref:'basis-a',state:'committed',policy:{functional_buckets:['household'],allowed_admission_classes:['common_mundane'],permission_refs:[]}}],
    allowed_disclosure_policy_refs:['disclosure-a']
  });
}

function seed() {
  return applyOrdinaryAggregateTransition({
    aggregate: createOrdinaryAggregate({ scope_ref, resolution_record_cap: 8 }),
    transition: {
      kind: 'seed', request_identity: 'seed-a', expected_state_version: 0,
      density_band: 'ordinary', identity_budget: 3, background_groups: []
    }
  });
}

function basisDigest(supportingBases) {
  return canonicalDigest({
    domain: 'ordinary_supporting_basis_catalog_v1',
    supporting_bases: supportingBases
  });
}

function plan({ aggregate, party_state_version, request_identity,
  expected_supporting_basis_catalog, supporting_basis_catalog_version,
  expected_property_placement_context = propertyPlacementContext(),
  resolution = 'materialize', token = request_identity, scope = scope_ref,
  party_id = 'party-a', seal = true }) {
  const seedTransition = !aggregate.seeded ? {
    kind: 'seed', request_identity: `seed-${token}`, expected_state_version: aggregate.state_version,
    density_band: 'ordinary', identity_budget: 4, background_groups: [preparedGroup(`seed-${token}`)]
  } : null;
  const new_prepared_bases = seedTransition
    ? [{basis_ref:seedTransition.background_groups[0].group_ref,state:'prepared_seed',scope_ref:{...scope},prepared_seed_provenance:{seed_request_id:seedTransition.request_identity,mode:'seed_scope',candidate_query:null},functional_buckets:['household'],allowed_admission_classes:['common_mundane']}]
    : [];
  const next_supporting_basis_catalog = structuredClone([
    ...expected_supporting_basis_catalog,
    ...new_prepared_bases
  ].sort((left, right) => left.basis_ref.localeCompare(right.basis_ref)));
  const expectedDigest = basisDigest(expected_supporting_basis_catalog);
  const nextDigest = basisDigest(next_supporting_basis_catalog);
  const resolvingAggregate = seedTransition
    ? applyOrdinaryAggregateTransition({ aggregate, transition: seedTransition }) : aggregate;
  const transition = {
    kind: 'resolve_presence', request_identity,
    expected_state_version: resolvingAggregate.state_version,
    resolution_ref: `resolution-${token}`,
    candidate_key: `candidate-${token}`,
    coverage_key: `coverage-${token}`,
    category_key: `category-${token}`,
    context_version: 'ordinary_context_a', resolution,
    ...(resolution === 'materialize' ? { identity_key: `identity-${token}` } : {})
  };
  const next_aggregate = applyOrdinaryAggregateTransition({ aggregate: resolvingAggregate, transition });
  const supportingBasis = new_prepared_bases[0] ?? expected_supporting_basis_catalog[0];
  const item = resolution === 'materialize' ? admittedItem({ request_identity, supporting_basis_ref:supportingBasis.basis_ref, scope, propertyPlacement: expected_property_placement_context, ...transition }) : null;
  if (item) item.item_id = `ordinary_item_${canonicalDigest({
    party_id, scope_ref: scope, candidate_key: item.candidate_key,
    coverage_key: item.coverage_key, context_version: item.context_version
  }).slice(0, 24)}`;
  const value = {
    party_id, scope_ref: scope, request_identity,
    input_digest: `input-${token}`,
    transition_digest: canonicalDigest(transition),
    expected_versions: {
      party_state_version,
      ordinary_state_version: aggregate.state_version,
      catalog_version: 1, property_version: 1, placement_version: 1,
      supporting_basis_catalog_version,
      supporting_basis_catalog_digest: expectedDigest,
      property_placement_context_digest:
        propertyPlacementDigest(expected_property_placement_context)
    },
    expected_supporting_basis_catalog,
    new_prepared_bases,
    next_supporting_basis_catalog,
    next_supporting_basis_catalog_version: supporting_basis_catalog_version
      + (new_prepared_bases.length ? 1 : 0),
    next_supporting_basis_catalog_digest: nextDigest,
    expected_property_placement_context,
    resolution, transitions: seedTransition ? [seedTransition, transition] : [transition], next_aggregate, item
  };
  return seal ? createOrdinaryMaterializationAtomicWritePlan(value) : value;
}

function admittedItem({ request_identity, candidate_key, coverage_key, context_version, supporting_basis_ref, token = candidate_key, scope = scope_ref, propertyPlacement = propertyPlacementContext() }) {
  const property_basis_ref = 'property', position_ref = 'position', mechanics_policy_ref = `mechanics-${token}`;
  const evidence = structuredClone(resolveOrdinaryWorldPropertyPlacement({...propertyPlacement,supporting_basis_ref,causal_basis_refs:[supporting_basis_ref],requested_position_ref:position_ref}).evidence);
  const source_refs = [candidate_key,coverage_key,supporting_basis_ref,property_basis_ref,position_ref,mechanics_policy_ref,evidence.property_source_ref,evidence.property_catalog_version_ref,evidence.placement_catalog_version_ref,evidence.placement_context_ref,evidence.property_placement_context_digest].sort();
  return {candidate_key,coverage_key,context_version,functional_bucket:'household',admission_class:'common_mundane',supporting_basis_ref,causal_basis_refs:[supporting_basis_ref],property_basis_ref,position_ref,runtime_placement:{anchor_id:'ordinary-anchor'},mechanics_policy_ref,
    item_proposal:{schema:'ordinary_world_item_proposal_v1',request_id:request_identity,scope_ref:{...scope},candidate_key,coverage_key,context_version,semantic_descriptor:{semantic_type:'household_tool',name:'wooden spoon',facts:['ordinary']},supporting_basis_ref,property_basis_ref,property_placement_evidence:evidence,placement:{scope_ref:scope.entity_id,position_ref},runtime_item_mechanics_policy_ref:mechanics_policy_ref},
    mechanics_snapshot:{schema:'rus.items.runtime_instance_mechanics_snapshot.v2',version:2,provenance:{source_kind:'ordinary_world_materialization',causal_ref:`cause-${token}`,request_id:request_identity,candidate_key,coverage_key,context_version,policy_ref:mechanics_policy_ref,source_refs},mechanics:{mass_grams:80,external_hand_cost:0,carry_form:'compact',packing_slot_cost:1,quantity:{value:1,unit:'item'},container:null}}};
}

async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('phase6 PostgreSQL operation timed out')), 5_000); })
    ]);
  } finally { clearTimeout(timer); }
}

test('Phase 6 ordinary PostgreSQL committer is atomic, exact, replay-safe and stale-safe', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required for isolated PostgreSQL test');
  let pool;
  t.after(async () => {
    if (pool) await pool.end();
    docker(['rm', '-f', container]);
  });
  const started = docker(['run', '-d', '--name', container, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=ordinary', '-e', 'POSTGRES_USER=ordinary',
    '-e', 'POSTGRES_DB=ordinary', 'postgres:16-alpine']);
  assert.equal(started.status, 0, started.stderr);
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await new Promise((done) => setTimeout(done, 250));
    if (docker(['exec', container, 'pg_isready', '-U', 'ordinary', '-d', 'ordinary']).status === 0) { ready = true; break; }
  }
  assert.equal(ready, true, 'isolated PostgreSQL must become ready');
  await new Promise((done) => setTimeout(done, 750));
  const port = Number(docker(['port', container, '5432/tcp']).stdout.match(/:(\d+)\s*$/u)?.[1]);
  assert.ok(Number.isSafeInteger(port));
  pool = new Pool({ host: '127.0.0.1', port, user: 'ordinary', password: 'ordinary', database: 'ordinary', max: 6, connectionTimeoutMillis: 5_000 });
  for (const file of migrations) await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  await pool.query(await readFile('schemas/party-db/025_party_runtime_finite_resource_transitions.sql', 'utf8'));
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ('party-a',2,'world','catalog','materializer','rng','commands','profiles')`);
  await insertPartyAnchor(pool, 'party-a');
  await assert.rejects(() => pool.query(`UPDATE party_runtime.parties SET state_version=9007199254740992 WHERE party_id='party-a'`));
  const initial = createOrdinaryAggregate({ scope_ref, resolution_record_cap: 8 });
  const emptyBasisCatalog = [];
  const emptyBasisDigest = basisDigest(emptyBasisCatalog);
  const propertyPlacement = propertyPlacementContext();
  const propertyPlacementContextDigest = propertyPlacementDigest(propertyPlacement);
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_aggregates
    (party_id,scope_kind,scope_id,state_version,aggregate_payload) VALUES ($1,$2,$3,$4,$5)`,
  ['party-a', scope_ref.entity_kind, scope_ref.entity_id, initial.state_version, initial]);
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_contexts
    (party_id,scope_kind,scope_id,catalog_version,property_version,placement_version,
     supporting_basis_catalog_version,supporting_basis_catalog_digest,
     property_placement_context_digest,property_placement_base_snapshot)
    VALUES ('party-a',$1,$2,1,1,1,0,$3,$4,$5::jsonb)`,
  [scope_ref.entity_kind, scope_ref.entity_id, emptyBasisDigest,
    propertyPlacementContextDigest, JSON.stringify(propertyPlacement)]);
  const committer = createPostgresOrdinaryMaterializationAtomicCommitter({ pool });
  let positive;
  const factory = createPostgresOrdinaryMaterializationPhase6Factory({
    pool,
    buildSanitizedRequest: async ({ committed }) => {
      assert.deepEqual(committed.supporting_bases, []);
      assert.deepEqual(committed.property_placement_context, propertyPlacement);
      return { schema: 'candidate_free_seed_then_presence_request' };
    },
    model: async () => {
      const transaction = await pool.query('SELECT txid_current_if_assigned() AS txid');
      assert.equal(transaction.rows[0].txid, null, 'model callback must run outside a transaction');
      return { request_identity: 'positive-a' };
    },
    validate: async ({ raw }) => raw,
    admit: async ({ validated }) => validated,
    buildPurePlan: async ({ admitted, committed }) => {
      positive = plan({
        aggregate: committed.aggregate,
        party_state_version: committed.version_pins.party_state_version,
        request_identity: admitted.request_identity,
        expected_supporting_basis_catalog: committed.supporting_bases,
        supporting_basis_catalog_version:
          committed.version_pins.supporting_basis_catalog_version,
        expected_property_placement_context:
          committed.property_placement_context
      });
      return positive;
    }
  });
  assert.deepEqual(await bounded(factory.execute({ party_id: 'party-a', scope_ref })),
    { status: 'committed', replay: false, state_version: 2 });
  const positiveRows = await pool.query(`SELECT c.resolution,c.transition_count,c.from_party_state_version,c.to_party_state_version,c.from_ordinary_state_version,c.to_ordinary_state_version,c.item_id,i.item_proposal,i.mechanics_snapshot,i.property_basis_ref,i.position_ref,i.property_placement_context_digest,i.property_catalog_version_ref,i.placement_catalog_version_ref,i.property_placement_evidence,a.aggregate_payload,p.state_version,ctx.catalog_version,ctx.property_version,ctx.placement_version,ctx.supporting_basis_catalog_version,ctx.supporting_basis_catalog_digest
    FROM party_runtime.party_ordinary_materialization_commits c
    JOIN party_runtime.party_ordinary_materialization_items i ON i.party_id=c.party_id AND i.request_identity=c.request_identity
    JOIN party_runtime.party_ordinary_materialization_aggregates a ON a.party_id=c.party_id AND a.scope_kind=c.scope_kind AND a.scope_id=c.scope_id
    JOIN party_runtime.party_ordinary_materialization_contexts ctx ON ctx.party_id=c.party_id AND ctx.scope_kind=c.scope_kind AND ctx.scope_id=c.scope_id
    JOIN party_runtime.parties p ON p.party_id=c.party_id WHERE c.party_id='party-a' AND c.request_identity='positive-a'`);
  assert.equal(positiveRows.rowCount, 1);
  assert.deepEqual(positiveRows.rows[0], {
    resolution: 'materialize', transition_count: 2, from_party_state_version: '0', to_party_state_version: '1',
    from_ordinary_state_version: '0', to_ordinary_state_version: '2', item_id: positive.item.item_id,
    item_proposal: positive.item.item_proposal, mechanics_snapshot: positive.item.mechanics_snapshot,
    property_basis_ref: 'property', position_ref: 'position',
    property_placement_context_digest: propertyPlacementContextDigest,
    property_catalog_version_ref: 'property-catalog-v1',
    placement_catalog_version_ref: 'placement-catalog-v1',
    property_placement_evidence: positive.item.item_proposal.property_placement_evidence,
    aggregate_payload: positive.next_aggregate, state_version: '1', catalog_version: '1',
    property_version: '1', placement_version: '1', supporting_basis_catalog_version: '1',
    supporting_basis_catalog_digest: positive.next_supporting_basis_catalog_digest
  });
  assert.equal(positive.next_aggregate.remaining_identity_budget, 3);
  assert.equal(positive.next_aggregate.background_groups.length, 1, 'candidate-free Stage A group is committed with the resolution');
  const persistedBasis = await pool.query(`SELECT basis_ref,origin_request_identity,basis_snapshot
    FROM party_runtime.party_ordinary_materialization_basis_catalog
    WHERE party_id='party-a' AND scope_kind='g6' AND scope_id='scope-a'`);
  assert.deepEqual(persistedBasis.rows, [{
    basis_ref: positive.new_prepared_bases[0].basis_ref,
    origin_request_identity: 'positive-a',
    basis_snapshot: positive.new_prepared_bases[0]
  }]);
  assert.equal((await pool.query(`SELECT count(*)::int AS count
    FROM party_runtime.party_ordinary_materialization_item_basis_refs
    WHERE party_id='party-a' AND item_id=$1`, [positive.item.item_id])).rows[0].count, 1);
  assert.equal(canonicalDigest(positive.transitions.at(-1)), positive.transition_digest);
  assert.deepEqual(await bounded(committer.commit(positive)), { status: 'committed', replay: true, state_version: 2 });
  const { schema: ignoredSchema, write_plan_digest: ignoredDigest, ...mutatedInput } = positive;
  await assert.rejects(
    () => bounded(committer.commit({ ...mutatedInput, input_digest: 'mutated-input' })),
    (error) => error.code === 'ORDINARY_PHASE6_IDEMPOTENCY_COLLISION'
  );

  const persistedBasisCatalog = positive.next_supporting_basis_catalog;
  const negative = plan({ aggregate: positive.next_aggregate, party_state_version: 1,
    request_identity: 'negative-a', resolution: 'absent',
    expected_supporting_basis_catalog: persistedBasisCatalog,
    supporting_basis_catalog_version: 1 });
  assert.equal(negative.transitions.length, 1, 'an already seeded aggregate uses exactly one resolution transition');
  assert.deepEqual(await bounded(committer.commit(negative)), { status: 'committed', replay: false, state_version: 3 });
  assert.equal((await pool.query(`SELECT count(*)::int AS count FROM party_runtime.party_ordinary_materialization_items WHERE party_id='party-a'`)).rows[0].count, 1);
  assert.equal(negative.next_aggregate.remaining_identity_budget, 3, 'negative result must not decrement budget');
  assert.deepEqual((await pool.query(`SELECT transition_count,from_ordinary_state_version,to_ordinary_state_version FROM party_runtime.party_ordinary_materialization_commits WHERE party_id='party-a' AND request_identity='negative-a'`)).rows[0], { transition_count: 1, from_ordinary_state_version: '2', to_ordinary_state_version: '3' });

  const staleParty = plan({ aggregate: negative.next_aggregate, party_state_version: 2,
    request_identity: 'stale-party-a', expected_supporting_basis_catalog: persistedBasisCatalog,
    supporting_basis_catalog_version: 1 });
  await pool.query(`UPDATE party_runtime.parties SET state_version=state_version+1 WHERE party_id='party-a'`);
  await assert.rejects(() => bounded(committer.commit(staleParty)), (error) => error.code === 'ORDINARY_PHASE6_PROPOSAL_STALE');
  await pool.query(`UPDATE party_runtime.parties SET state_version=state_version-1 WHERE party_id='party-a'`);
  const staleContext = plan({ aggregate: negative.next_aggregate, party_state_version: 2,
    request_identity: 'stale-context-a', expected_supporting_basis_catalog: persistedBasisCatalog,
    supporting_basis_catalog_version: 1 });
  await pool.query(`UPDATE party_runtime.party_ordinary_materialization_contexts SET catalog_version=2 WHERE party_id='party-a'`);
  await assert.rejects(() => bounded(committer.commit(staleContext)), (error) => error.code === 'ORDINARY_PHASE6_PROPOSAL_STALE');
  await pool.query(`UPDATE party_runtime.party_ordinary_materialization_contexts SET catalog_version=1 WHERE party_id='party-a'`);
  const staleBasisCatalog = plan({ aggregate: negative.next_aggregate, party_state_version: 2,
    request_identity: 'stale-basis-a', expected_supporting_basis_catalog: persistedBasisCatalog,
    supporting_basis_catalog_version: 1 });
  await pool.query(`UPDATE party_runtime.party_ordinary_materialization_contexts
    SET supporting_basis_catalog_version=2 WHERE party_id='party-a'`);
  await assert.rejects(() => bounded(committer.commit(staleBasisCatalog)),
    (error) => error.code === 'ORDINARY_PHASE6_PROPOSAL_STALE');
  await pool.query(`UPDATE party_runtime.party_ordinary_materialization_contexts
    SET supporting_basis_catalog_version=1 WHERE party_id='party-a'`);

  const stalePropertyPlacement = plan({ aggregate: negative.next_aggregate,
    party_state_version: 2, request_identity: 'stale-property-placement-a',
    expected_supporting_basis_catalog: persistedBasisCatalog,
    supporting_basis_catalog_version: 1 });
  const changedPropertyPlacement = propertyPlacementContext();
  changedPropertyPlacement.property_catalog_version_ref = 'property-catalog-v2';
  await pool.query(`UPDATE party_runtime.party_ordinary_materialization_contexts
    SET property_placement_context_digest=$1,property_placement_base_snapshot=$2::jsonb
    WHERE party_id='party-a'`, [propertyPlacementDigest(changedPropertyPlacement),
    JSON.stringify(changedPropertyPlacement)]);
  await assert.rejects(() => bounded(committer.commit(stalePropertyPlacement)),
    (error) => error.code === 'ORDINARY_PHASE6_PROPOSAL_STALE');
  await pool.query(`UPDATE party_runtime.party_ordinary_materialization_contexts
    SET property_placement_context_digest=$1,property_placement_base_snapshot=$2::jsonb
    WHERE party_id='party-a'`, [propertyPlacementContextDigest,
    JSON.stringify(propertyPlacement)]);

  const raceA = plan({ aggregate: negative.next_aggregate, party_state_version: 2,
    request_identity: 'race-a', expected_supporting_basis_catalog: persistedBasisCatalog,
    supporting_basis_catalog_version: 1 });
  const raceB = plan({ aggregate: negative.next_aggregate, party_state_version: 2,
    request_identity: 'race-b', expected_supporting_basis_catalog: persistedBasisCatalog,
    supporting_basis_catalog_version: 1 });
  const raced = await bounded(Promise.allSettled([committer.commit(raceA), committer.commit(raceB)]));
  assert.equal(raced.filter((entry) => entry.status === 'fulfilled').length, 1);
  assert.equal(raced.filter((entry) => entry.status === 'rejected' && entry.reason?.code === 'ORDINARY_PHASE6_PROPOSAL_STALE').length, 1);

  const state = (await pool.query(`SELECT aggregate_payload,p.state_version AS party_state_version FROM party_runtime.party_ordinary_materialization_aggregates a JOIN party_runtime.parties p ON p.party_id=a.party_id WHERE a.party_id='party-a' AND a.scope_kind='g6' AND a.scope_id='scope-a'`)).rows[0];
  const winner = raced.find((entry) => entry.status === 'fulfilled').value;
  const committedAggregate = (await pool.query(`SELECT aggregate_payload FROM party_runtime.party_ordinary_materialization_aggregates WHERE party_id='party-a' AND scope_kind='g6' AND scope_id='scope-a'`)).rows[0].aggregate_payload;
  assert.equal(committedAggregate.state_version, winner.state_version);

  const authoredBasis = { basis_ref: 'basis-authored', state: 'committed',
    scope_ref: { ...scope_ref }, prepared_seed_provenance: null,
    functional_buckets: ['household'],
    allowed_admission_classes: ['common_mundane'] };
  const catalogWithAuthored = structuredClone([...persistedBasisCatalog, authoredBasis]
    .sort((left, right) => left.basis_ref.localeCompare(right.basis_ref)));
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_basis_catalog
    (party_id,scope_kind,scope_id,basis_ref,origin_request_identity,basis_snapshot)
    VALUES ('party-a','g6','scope-a',$1,NULL,$2::jsonb)`,
  [authoredBasis.basis_ref, JSON.stringify(authoredBasis)]);
  await pool.query(`UPDATE party_runtime.party_ordinary_materialization_contexts
    SET supporting_basis_catalog_version=2,supporting_basis_catalog_digest=$1
    WHERE party_id='party-a'`, [basisDigest(catalogWithAuthored)]);
  const committedReuse = plan({ aggregate: committedAggregate,
    party_state_version: Number(state.party_state_version), request_identity: 'committed-reuse-a',
    expected_supporting_basis_catalog: catalogWithAuthored,
    supporting_basis_catalog_version: 2 });
  assert.equal(committedReuse.item.supporting_basis_ref, authoredBasis.basis_ref);
  assert.deepEqual(await bounded(committer.commit(committedReuse)),
    { status: 'committed', replay: false, state_version: committedAggregate.state_version + 1 });
  assert.equal((await pool.query(`SELECT count(*)::int AS count
    FROM party_runtime.party_ordinary_materialization_basis_catalog
    WHERE party_id='party-a'`)).rows[0].count, 2,
  'later committed-basis reuse must not redeclare or duplicate the persistent basis');

  const rollback = plan({ aggregate: committedReuse.next_aggregate,
    party_state_version: Number(state.party_state_version) + 1,
    request_identity: 'rollback-item-a',
    expected_supporting_basis_catalog: catalogWithAuthored,
    supporting_basis_catalog_version: 2 });
  await pool.query(`CREATE OR REPLACE FUNCTION party_runtime.reject_ordinary_phase6_item() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.request_identity='rollback-item-a' THEN RAISE EXCEPTION 'forced item failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_ordinary_phase6_item BEFORE INSERT ON party_runtime.party_ordinary_materialization_items FOR EACH ROW EXECUTE FUNCTION party_runtime.reject_ordinary_phase6_item();`);
  const beforeRollback = await pool.query(`SELECT p.state_version,a.state_version AS ordinary_state_version,(SELECT count(*)::int FROM party_runtime.party_ordinary_materialization_commits WHERE party_id='party-a') AS commits,(SELECT count(*)::int FROM party_runtime.party_ordinary_materialization_items WHERE party_id='party-a') AS items FROM party_runtime.parties p JOIN party_runtime.party_ordinary_materialization_aggregates a ON a.party_id=p.party_id WHERE p.party_id='party-a' AND a.scope_kind='g6' AND a.scope_id='scope-a'`);
  await assert.rejects(() => bounded(committer.commit(rollback)), /forced item failure/u);
  const afterRollback = await pool.query(`SELECT p.state_version,a.state_version AS ordinary_state_version,(SELECT count(*)::int FROM party_runtime.party_ordinary_materialization_commits WHERE party_id='party-a') AS commits,(SELECT count(*)::int FROM party_runtime.party_ordinary_materialization_items WHERE party_id='party-a') AS items FROM party_runtime.parties p JOIN party_runtime.party_ordinary_materialization_aggregates a ON a.party_id=p.party_id WHERE p.party_id='party-a' AND a.scope_kind='g6' AND a.scope_id='scope-a'`);
  assert.deepEqual(afterRollback.rows, beforeRollback.rows, 'failed physical write must leave no partial commit');
  const p16Plan = plan({ aggregate: committedReuse.next_aggregate,
    party_state_version: Number(afterRollback.rows[0].state_version),
    request_identity: 'p16-owned-ordinary-a',
    expected_supporting_basis_catalog: catalogWithAuthored,
    supporting_basis_catalog_version: 2 });
  const p16Before = structuredClone(afterRollback.rows[0]);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await applyOrdinaryMaterializationAtomicWritePlanInTransaction({
      client, input: p16Plan,
      partyStateVersionAfter: Number(p16Before.state_version) + 1
    });
    await client.query(`UPDATE party_runtime.parties SET state_version=state_version+1
      WHERE party_id='party-a' AND state_version=$1`, [p16Before.state_version]);
    await assert.rejects(() => client.query('SELECT 1/0'));
    await client.query('ROLLBACK');
    const rolledBackP16 = await pool.query(`SELECT p.state_version,a.state_version AS ordinary_state_version,(SELECT count(*)::int FROM party_runtime.party_ordinary_materialization_commits WHERE party_id='party-a') AS commits,(SELECT count(*)::int FROM party_runtime.party_ordinary_materialization_items WHERE party_id='party-a') AS items FROM party_runtime.parties p JOIN party_runtime.party_ordinary_materialization_aggregates a ON a.party_id=p.party_id WHERE p.party_id='party-a' AND a.scope_kind='g6' AND a.scope_id='scope-a'`);
    assert.deepEqual(rolledBackP16.rows[0], p16Before,
      'caller rollback must remove every ordinary write and its party bump');
    await client.query('BEGIN');
    await applyOrdinaryMaterializationAtomicWritePlanInTransaction({
      client, input: p16Plan,
      partyStateVersionAfter: Number(p16Before.state_version) + 1
    });
    const bump = await client.query(`UPDATE party_runtime.parties
      SET state_version=state_version+1 WHERE party_id='party-a' AND state_version=$1`,
    [p16Before.state_version]);
    assert.equal(bump.rowCount, 1, 'P16 remains the sole party-state writer');
    await client.query('COMMIT');
  } finally { client.release(); }
  const p16After = await pool.query(`SELECT p.state_version,a.state_version AS ordinary_state_version,(SELECT count(*)::int FROM party_runtime.party_ordinary_materialization_commits WHERE party_id='party-a') AS commits,(SELECT count(*)::int FROM party_runtime.party_ordinary_materialization_items WHERE party_id='party-a') AS items FROM party_runtime.parties p JOIN party_runtime.party_ordinary_materialization_aggregates a ON a.party_id=p.party_id WHERE p.party_id='party-a' AND a.scope_kind='g6' AND a.scope_id='scope-a'`);
  assert.equal(Number(p16After.rows[0].state_version), Number(p16Before.state_version) + 1,
    'ordinary helper must not independently double-bump party state');
  assert.equal(Number(p16After.rows[0].commits), Number(p16Before.commits) + 1);
  await assertFiniteSourceP16Integration(pool);
  await assertFiniteResolverReloadLifecycle(pool);
  await assertContextBoundO2aV2V3Integration(pool);
  await removePartyAnchor(pool, 'party-a');
  await pool.query(`DELETE FROM party_runtime.parties WHERE party_id='party-a'`);
  for (const table of ['party_ordinary_materialization_aggregates',
    'party_ordinary_materialization_contexts',
    'party_ordinary_materialization_commits',
    'party_ordinary_materialization_basis_catalog',
    'party_ordinary_materialization_items',
    'party_ordinary_materialization_item_basis_refs']) {
    assert.equal((await pool.query(`SELECT count(*)::int AS count FROM party_runtime.${table}`)).rows[0].count, 0,
      `${table} must remain party-owned and cascade with the party`);
  }
});

async function assertContextBoundO2aV2V3Integration(pool) {
  const partyId = 'party-o2a', scope = { entity_kind: 'g6', entity_id: 'o2a-scope' };
  const supportingBasis = { basis_ref: 'o2a-personal-basis', state: 'committed',
    scope_ref: { ...scope }, prepared_seed_provenance: null,
    functional_buckets: ['arms'], allowed_admission_classes: ['weapon_or_armament'],
    permission_refs: ['armament-profile-a'], basis_kind: 'personal_possession' };
  const propertyPlacement = {
    schema: 'rus.items.ordinary_world_property_placement_context.v2', version: 2,
    scope_ref: { ...scope }, item_kind: 'man_made',
    property_catalog_version_ref: 'o2a-property-catalog-v2',
    placement_catalog_version_ref: 'o2a-placement-catalog-v2',
    explicit_item_source_refs: [], personal_possession_refs: ['o2a-owner'],
    communal_public_service_refs: [], container_property_refs: [],
    occupied_site_refs: [], unowned_cause_refs: [],
    placement_context_refs: ['o2a-placement-context'],
    property_catalog: [{ property_basis_ref: 'o2a-property', state: 'committed',
      scope_ref: { ...scope }, basis_class: 'personal_possession',
      source_ref: 'o2a-owner', unowned_cause_ref: null, unowned_cause_kind: null }],
    placement_catalog: [{ position_ref: 'o2a-position', state: 'committed',
      scope_ref: { ...scope }, position_kind: 'scene_position', g6_ref: scope.entity_id,
      containment_depth: 1, placement_context_ref: 'o2a-placement-context' }]
  };
  const aggregate = seedFiniteAggregate(scope);
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,
     rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ($1,2,'world','catalog','materializer','rng','commands','profiles')`, [partyId]);
  await insertPartyAnchor(pool, partyId);
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_aggregates
    (party_id,scope_kind,scope_id,state_version,aggregate_payload)
    VALUES ($1,$2,$3,$4,$5::jsonb)`, [partyId, scope.entity_kind, scope.entity_id,
    aggregate.state_version, JSON.stringify(aggregate)]);
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_contexts
    (party_id,scope_kind,scope_id,catalog_version,property_version,placement_version,
     supporting_basis_catalog_version,supporting_basis_catalog_digest,
     property_placement_context_digest,property_placement_base_snapshot)
    VALUES ($1,$2,$3,1,1,1,1,$4,$5,$6::jsonb)`, [partyId, scope.entity_kind,
    scope.entity_id, basisDigest([supportingBasis]), propertyPlacementDigest(propertyPlacement),
    JSON.stringify(propertyPlacement)]);
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_basis_catalog
    (party_id,scope_kind,scope_id,basis_ref,origin_request_identity,basis_snapshot)
    VALUES ($1,$2,$3,$4,NULL,$5::jsonb)`, [partyId, scope.entity_kind,
    scope.entity_id, supportingBasis.basis_ref, JSON.stringify(supportingBasis)]);

  const requestIdentity = 'o2a-v2-v3-positive';
  const transition = {
    kind: 'resolve_presence', request_identity: requestIdentity,
    expected_state_version: aggregate.state_version, resolution_ref: 'o2a-resolution',
    candidate_key: 'o2a-candidate', coverage_key: 'o2a-coverage',
    category_key: 'o2a-category', context_version: 'o2a-context-v2',
    resolution: 'materialize', identity_key: 'o2a-identity'
  };
  const nextAggregate = applyOrdinaryAggregateTransition({ aggregate, transition });
  const propertyInput = { ...propertyPlacement, supporting_basis_ref: supportingBasis.basis_ref,
    causal_basis_refs: [supportingBasis.basis_ref], requested_position_ref: 'o2a-position' };
  const propertyEvidence = resolveOrdinaryWorldPropertyPlacement(propertyInput).evidence;
  const sourceRefs = ['armament-profile-a', 'o2a-candidate', 'o2a-coverage',
    'o2a-owner', 'o2a-placement-catalog-v2', 'o2a-placement-context', 'o2a-position',
    'o2a-property', 'o2a-property-catalog-v2', 'o2a-personal-basis',
    'o2a-mechanics', propertyEvidence.property_placement_context_digest].sort();
  const admission = admitOrdinaryWorldMaterialization({
    handoff: {
      schema: 'ordinary_pending_items_property_admission_v1',
      status: 'pending_items_property_admission', stage: 'presence_resolution',
      request_id: requestIdentity, scope_ref: { ...scope },
      candidate_key: transition.candidate_key, coverage_key: transition.coverage_key,
      context_version: transition.context_version,
      admission_evidence: { authority_class: 'ordinary',
        admission_class: 'weapon_or_armament', availability_class: 'context_bound',
        functional_bucket: 'arms', supporting_basis_ref: supportingBasis.basis_ref,
        property_basis_ref: 'o2a-property', permission_refs: ['armament-profile-a'],
        causal_basis_kind: 'personal_possession',
        condition_state: 'serviceable',
        runtime_item_mechanics_policy_ref: 'o2a-mechanics',
        property_placement_context_digest: propertyEvidence.property_placement_context_digest,
        property_catalog_version_ref: propertyEvidence.property_catalog_version_ref,
        placement_catalog_version_ref: propertyEvidence.placement_catalog_version_ref },
      proposed_item: { semantic_descriptor: { semantic_type: 'service_knife',
        name: 'служебный нож', facts: ['context-bound'] }, authority_class: 'ordinary',
        admission_class: 'weapon_or_armament', availability_class: 'context_bound',
        functional_bucket: 'arms', presence_expectation: 'routine',
        supporting_basis_ref: supportingBasis.basis_ref,
        causal_basis: { basis_kind: 'personal_possession',
          basis_refs: [supportingBasis.basis_ref] }, property_basis_ref: 'o2a-property',
        placement_proposal: { scope_ref: scope.entity_id, position_ref: 'o2a-position' },
        mechanics_proposal: { mass_grams: 180, external_hand_cost: 1,
          carry_form: 'compact', packing_slot_cost: 1,
          quantity: { value: 1, unit: 'item' }, container: null } }
    },
    admission_context: {
      schema: 'rus.items.ordinary_world_admission_context.v3', version: 3,
      approved_permission_refs: ['armament-profile-a'], supporting_bases: [supportingBasis],
      semantic_identity_profile: {
        schema: 'rus.items.ordinary_world_semantic_identity_profile.v1', version: 1,
        profile_ref: 'armament-profile-a', admission_class: 'weapon_or_armament',
        semantic_type: 'service_knife', public_name: 'служебный нож'
      },
      property_placement_input: propertyInput,
      mechanics_policy: { policy_ref: 'o2a-mechanics', max_mass_grams: 1000,
        allowed_external_hand_costs: [0, 1, 2],
        allowed_carry_forms: ['compact', 'regular'], max_packing_slot_cost: 10,
        max_quantity: 10 },
      causal_identity: { request_id: requestIdentity,
        candidate_key: transition.candidate_key, coverage_key: transition.coverage_key,
        context_version: transition.context_version, causal_ref: 'o2a-resolution',
        source_refs: sourceRefs }
    }
  });
  assert.equal(admission.pass, true);
  const item = {
    item_id: `ordinary_item_${canonicalDigest({ party_id: partyId, scope_ref: scope,
      candidate_key: transition.candidate_key, coverage_key: transition.coverage_key,
      context_version: transition.context_version }).slice(0, 24)}`,
    candidate_key: transition.candidate_key, coverage_key: transition.coverage_key,
    context_version: transition.context_version, functional_bucket: 'arms',
    admission_class: 'weapon_or_armament', supporting_basis_ref: supportingBasis.basis_ref,
    causal_basis_refs: [supportingBasis.basis_ref], causal_basis_kind: 'personal_possession',
    condition_state: 'serviceable', permission_refs: ['armament-profile-a'],
    property_basis_ref: 'o2a-property', position_ref: 'o2a-position',
    runtime_placement: { anchor_id: 'ordinary-anchor' },
    mechanics_policy_ref: 'o2a-mechanics',
    weapon_mechanics_snapshot: resolveOrdinaryArmamentMechanics({
      mechanics_capability_ref: ORDINARY_ARMAMENT_MECHANICS_CAPABILITY,
      condition_state: 'serviceable'
    }),
    item_proposal: admission.proposal,
    mechanics_snapshot: admission.runtime_instance_mechanics_snapshot
  };
  const rawPlan = {
    party_id: partyId, scope_ref: scope, request_identity: requestIdentity,
    input_digest: 'o2a-input', transition_digest: canonicalDigest(transition),
    expected_versions: { party_state_version: 0,
      ordinary_state_version: aggregate.state_version, catalog_version: 1,
      property_version: 1, placement_version: 1, supporting_basis_catalog_version: 1,
      supporting_basis_catalog_digest: basisDigest([supportingBasis]),
      property_placement_context_digest: propertyPlacementDigest(propertyPlacement) },
    expected_supporting_basis_catalog: [supportingBasis], new_prepared_bases: [],
    next_supporting_basis_catalog: [supportingBasis],
    next_supporting_basis_catalog_version: 1,
    next_supporting_basis_catalog_digest: basisDigest([supportingBasis]),
    expected_property_placement_context: propertyPlacement, resolution: 'materialize',
    transitions: [transition], next_aggregate: nextAggregate, item
  };
  const mismatchedCatalog = JSON.parse(JSON.stringify(rawPlan));
  mismatchedCatalog.expected_supporting_basis_catalog[0].basis_kind = 'stored_supply';
  mismatchedCatalog.next_supporting_basis_catalog[0].basis_kind = 'stored_supply';
  mismatchedCatalog.expected_versions.supporting_basis_catalog_digest =
    basisDigest(mismatchedCatalog.expected_supporting_basis_catalog);
  mismatchedCatalog.next_supporting_basis_catalog_digest =
    basisDigest(mismatchedCatalog.next_supporting_basis_catalog);
  assert.throws(() => createOrdinaryMaterializationAtomicWritePlan(mismatchedCatalog),
    { code: 'ORDINARY_PHASE6_POSITIVE_ITEM_INVALID' });
  assert.equal((await pool.query(`SELECT count(*)::int AS count
    FROM party_runtime.party_ordinary_materialization_items WHERE party_id=$1`,
  [partyId])).rows[0].count, 0, 'catalog-kind rejection must precede database writes');

  const sealed = createOrdinaryMaterializationAtomicWritePlan(
    JSON.parse(JSON.stringify(rawPlan)));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    assert.deepEqual(await applyOrdinaryMaterializationAtomicWritePlanInTransaction({
      client, input: sealed, partyStateVersionAfter: 1
    }), { status: 'committed', replay: false, state_version: 2 });
    const bump = await client.query(`UPDATE party_runtime.parties
      SET state_version=state_version+1 WHERE party_id=$1 AND state_version=0`, [partyId]);
    assert.equal(bump.rowCount, 1);
    await client.query('COMMIT');
  } finally { client.release(); }
  const persisted = await pool.query(`SELECT i.item_proposal,i.property_placement_evidence,
    p.state_version FROM party_runtime.party_ordinary_materialization_items i
    JOIN party_runtime.parties p ON p.party_id=i.party_id
    WHERE i.party_id=$1 AND i.item_id=$2`, [partyId, item.item_id]);
  assert.equal(persisted.rowCount, 1);
  assert.equal(persisted.rows[0].state_version, '1');
  assert.deepEqual(persisted.rows[0].item_proposal, item.item_proposal);
  assert.deepEqual(persisted.rows[0].property_placement_evidence,
    item.item_proposal.property_placement_evidence);
  assert.equal(persisted.rows[0].item_proposal.schema, 'ordinary_world_item_proposal_v3');
  assert.equal(persisted.rows[0].item_proposal.causal_basis_kind, 'personal_possession');
  assert.equal(persisted.rows[0].item_proposal.condition_state, 'serviceable');
  assert.equal(persisted.rows[0].property_placement_evidence.schema,
    'rus.items.ordinary_world_property_placement_evidence.v3');
  const runtimeItem = await pool.query(`SELECT state
    FROM party_runtime.party_items WHERE party_id=$1 AND item_id=$2`,
  [partyId, item.item_id]);
  assert.deepEqual(runtimeItem.rows[0].state.weapon_mechanics_snapshot,
    item.weapon_mechanics_snapshot);
  await removePartyAnchor(pool, partyId);
  await pool.query(`DELETE FROM party_runtime.parties WHERE party_id=$1`, [partyId]);
}

async function assertFiniteSourceP16Integration(pool) {
  const partyId = 'party-finite', finiteScope = {
    entity_kind: 'g6', entity_id: 'finite-scope'
  }, sourceBasis = { basis_ref: 'finite-source-node', state: 'committed',
    scope_ref: { ...finiteScope }, prepared_seed_provenance: null,
    functional_buckets: ['household'],
    allowed_admission_classes: ['common_mundane'],
    permission_refs: [], basis_kind: 'finite_source' }, initialAmountBounds = {
      minimum: { numerator: 1, denominator: 1, unit: 'item' },
      maximum: { numerator: 10, denominator: 1, unit: 'item' }
    };
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ($1,2,'world','catalog','materializer','rng','commands','profiles')`,
  [partyId]);
  await insertPartyAnchor(pool, partyId);
  await pool.query(`INSERT INTO party_runtime.party_v3_change_sets
    (id,party_id,operation_kind,expected_state_version_set_digest,
     expected_state_version_set,committed_state_version_set_digest,
     write_plan_digest,created_at_turn,committed_at_turn)
    VALUES ('finite-fixture',$1,'fixture',$2,'[]'::jsonb,$2,$2,0,0)`,
  [partyId, 'f'.repeat(64)]);
  await pool.query(`INSERT INTO party_runtime.party_g5_sites
    (id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,
     created_change_set_id,updated_change_set_id)
    VALUES ('finite-g5',$1,'canonical','finite-g4',$2::jsonb,'active',0,
      'finite-fixture','finite-fixture')`, [partyId,
    JSON.stringify({ entity_id: 'finite-g5' })]);
  await pool.query(`INSERT INTO party_runtime.party_scene_baselines
    (id,party_id,host_kind,host_id,source_kind,scene_template_ref,
     materialization_trace_id,materializer_version,catalog_digest,status,
     state_version,created_change_set_id,updated_change_set_id)
    VALUES ('finite-baseline',$1,'g5_site','finite-g5','canonical_template',
      $2::jsonb,'trace','materializer','catalog','active',0,
      'finite-fixture','finite-fixture')`, [partyId,
    JSON.stringify({ entity_id: 'finite-scene' })]);
  await pool.query(`INSERT INTO party_runtime.party_g6_instances
    (id,party_id,scene_baseline_id,source_scene_template_ref,scene_slot_key,
     host_kind,host_id,physical_class_id,primary_scene_role_id,
     vertical_context_id,overhead_cover_id,intra_g6_visibility_mode,
     default_visibility_distance_band,acoustic_uniformity,status,state_version,
     created_change_set_id,updated_change_set_id)
    VALUES ('finite-g6',$1,'finite-baseline',$2::jsonb,'main','g5_site',
      'finite-g5','interior','room','ground','open','default_clear','near',
      'uniform','active',0,'finite-fixture','finite-fixture')`, [partyId,
    JSON.stringify({ entity_id: 'finite-scene' })]);
  await pool.query(`INSERT INTO party_runtime.scene_position_nodes
    (id,party_id,g6_instance_id,position_type_id,template_slot_key,
     template_instance_ordinal,capacity,access_class_id,status,state_version,
     created_change_set_id,updated_change_set_id)
    VALUES ('position',$1,'finite-g6','ground','source',0,4,'open',
      'active',0,'finite-fixture','finite-fixture')`, [partyId]);
  const aggregate = seedFiniteAggregate(finiteScope);
  const placement = finitePropertyPlacementContext(finiteScope);
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_aggregates
    (party_id,scope_kind,scope_id,state_version,aggregate_payload)
    VALUES ($1,$2,$3,$4,$5::jsonb)`, [partyId, finiteScope.entity_kind,
    finiteScope.entity_id, aggregate.state_version, JSON.stringify(aggregate)]);
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_contexts
    (party_id,scope_kind,scope_id,catalog_version,property_version,
     placement_version,supporting_basis_catalog_version,
     supporting_basis_catalog_digest,property_placement_context_digest,
     property_placement_base_snapshot)
    VALUES ($1,$2,$3,1,1,1,1,$4,$5,$6::jsonb)`, [partyId,
    finiteScope.entity_kind, finiteScope.entity_id, basisDigest([sourceBasis]),
    propertyPlacementDigest(placement), JSON.stringify(placement)]);
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_basis_catalog
    (party_id,scope_kind,scope_id,basis_ref,origin_request_identity,basis_snapshot)
    VALUES ($1,$2,$3,$4,NULL,$5::jsonb)`, [partyId, finiteScope.entity_kind,
    finiteScope.entity_id, sourceBasis.basis_ref, JSON.stringify(sourceBasis)]);
  await insertFiniteResource(pool, partyId, 'finite-source-node', initialAmountBounds);
  const firstOptions = { partyId, scope: finiteScope, aggregate,
    partyStateVersion: 0, sourceStateVersion: 2,
    before: { numerator: 3, denominator: 1, unit: 'item' },
    decrement: { numerator: 1, denominator: 1, unit: 'item' },
    requestIdentity: 'finite-first', sourceResourceNodeId: 'finite-source-node',
    initialize: true, sourceBasis, placement };
  const bypass = finitePlanInput(firstOptions);
  delete bypass.item.causal_basis_kind;
  bypass.item.item_proposal.schema = 'ordinary_world_item_proposal_v1';
  delete bypass.item.item_proposal.causal_basis_kind;
  bypass.finite_resource_initialization = null;
  bypass.finite_resource_transition = null;
  assert.throws(() => createOrdinaryMaterializationAtomicWritePlan(bypass),
    /ORDINARY_PHASE6_POSITIVE_ITEM_INVALID/u,
    'a common item cannot erase its finite basis and conservation effect');
  const first = finitePlan(firstOptions);
  await commitFiniteInP16(pool, first, 'finite-change-1', 0);
  const firstRows = await pool.query(`SELECT r.state_version,r.quantity_numerator,
    r.quantity_denominator,r.lifecycle_state,r.initialization_identity,
    r.initial_amount_bounds,r.updated_change_set_id,d.causal_transition_identity,
    d.result_item_id,d.before_numerator,d.decrement_numerator,d.after_numerator,
    d.lifecycle_state_after,d.result_item_mechanics_digest,
    d.result_item_property_placement_digest,d.p16_change_set_id
    FROM party_runtime.party_resource_nodes r JOIN
    party_runtime.party_resource_node_decrements d ON d.party_id=r.party_id
      AND d.resource_node_id=r.resource_node_id
    WHERE r.party_id=$1 AND r.resource_node_id='finite-source-node'`, [partyId]);
  assert.deepEqual(firstRows.rows[0], {
    state_version: '3', quantity_numerator: '2', quantity_denominator: '1',
    lifecycle_state: 'active', initialization_identity: 'finite-first',
    initial_amount_bounds: null, updated_change_set_id: 'finite-change-1',
    causal_transition_identity: 'finite-first', result_item_id: first.item.item_id,
    before_numerator: '3', decrement_numerator: '1', after_numerator: '2',
    lifecycle_state_after: 'active',
    result_item_mechanics_digest: canonicalDigest(first.item.mechanics_snapshot),
    result_item_property_placement_digest: canonicalDigest(
      first.item.item_proposal.property_placement_evidence),
    p16_change_set_id: 'finite-change-1'
  });
  await replayFiniteInP16(pool, first, 'finite-change-1');
  assert.equal((await pool.query(`SELECT count(*)::int AS count FROM
    party_runtime.party_resource_node_decrements WHERE party_id=$1`,
  [partyId])).rows[0].count, 1, 'exact replay must not decrement twice');
  const { schema, write_plan_digest, ...mutated } = structuredClone(first);
  const collision = createOrdinaryMaterializationAtomicWritePlan({ ...mutated,
    input_digest: 'finite-mutated' });
  await assert.rejects(() => replayFiniteInP16(pool, collision,
    'finite-change-1'), (error) =>
    error.code === 'ORDINARY_PHASE6_IDEMPOTENCY_COLLISION');
  const second = finitePlan({ partyId, scope: finiteScope,
    aggregate: first.next_aggregate, partyStateVersion: 1, sourceStateVersion: 3,
    before: { numerator: 2, denominator: 1, unit: 'item' },
    decrement: { numerator: 1, denominator: 1, unit: 'item' },
    requestIdentity: 'finite-second', sourceResourceNodeId: 'finite-source-node',
    initialize: false, sourceBasis, placement });
  await commitFiniteInP16(pool, second, 'finite-change-2', 1);
  const stale = finitePlan({ partyId, scope: finiteScope,
    aggregate: second.next_aggregate, partyStateVersion: 2, sourceStateVersion: 4,
    before: { numerator: 1, denominator: 1, unit: 'item' },
    decrement: { numerator: 1, denominator: 1, unit: 'item' },
    requestIdentity: 'finite-stale', sourceResourceNodeId: 'finite-source-node',
    initialize: false, sourceBasis, placement });
  await pool.query(`UPDATE party_runtime.party_resource_nodes SET state_version=5
    WHERE party_id=$1 AND resource_node_id='finite-source-node'`, [partyId]);
  await assert.rejects(() => commitFiniteInP16(pool, stale, 'finite-change-stale', 2),
    (error) => error.code === 'ORDINARY_PHASE6_FINITE_SOURCE_STALE');
  await pool.query(`UPDATE party_runtime.party_resource_nodes SET state_version=4
    WHERE party_id=$1 AND resource_node_id='finite-source-node'`, [partyId]);
  const insufficient = finitePlanInput({ partyId, scope: finiteScope,
    aggregate: second.next_aggregate, partyStateVersion: 2, sourceStateVersion: 4,
    before: { numerator: 1, denominator: 1, unit: 'item' },
    decrement: { numerator: 2, denominator: 1, unit: 'item' },
    requestIdentity: 'finite-insufficient', sourceResourceNodeId: 'finite-source-node',
    sourceBasis, placement });
  assert.throws(() => createOrdinaryMaterializationAtomicWritePlan(insufficient),
    { code: 'ORDINARY_PHASE6_FINITE_SOURCE_INVALID' });
  const rollback = finitePlan({ partyId, scope: finiteScope,
    aggregate: second.next_aggregate, partyStateVersion: 2, sourceStateVersion: 4,
    before: { numerator: 1, denominator: 1, unit: 'item' },
    decrement: { numerator: 1, denominator: 1, unit: 'item' },
    requestIdentity: 'finite-rollback', sourceResourceNodeId: 'finite-source-node',
    initialize: false, sourceBasis, placement });
  await assert.rejects(() => commitFiniteInP16(pool, rollback,
    'finite-change-rollback', 3, true));
  const rollbackRows = await pool.query(`SELECT lifecycle_state,quantity_numerator,
    initialization_identity FROM party_runtime.party_resource_nodes
    WHERE party_id=$1 AND resource_node_id='finite-source-node'`, [partyId]);
  assert.deepEqual(rollbackRows.rows[0], { lifecycle_state: 'active',
    quantity_numerator: '1', initialization_identity: 'finite-first' });
  assert.equal((await pool.query(`SELECT count(*)::int AS count FROM
    party_runtime.party_resource_node_decrements WHERE party_id=$1
      AND causal_transition_identity='finite-rollback'`, [partyId])).rows[0].count, 0);
  const exhausted = finitePlan({ partyId, scope: finiteScope,
    aggregate: second.next_aggregate, partyStateVersion: 2, sourceStateVersion: 4,
    before: { numerator: 1, denominator: 1, unit: 'item' },
    decrement: { numerator: 1, denominator: 1, unit: 'item' },
    requestIdentity: 'finite-exhausted', sourceResourceNodeId: 'finite-source-node',
    initialize: false, sourceBasis, placement });
  await commitFiniteInP16(pool, exhausted, 'finite-change-3', 2);
  const retired = await pool.query(`SELECT lifecycle_state,quantity_numerator,
    retired_by_causal_identity,updated_change_set_id FROM party_runtime.party_resource_nodes
    WHERE party_id=$1 AND resource_node_id='finite-source-node'`, [partyId]);
  assert.deepEqual(retired.rows[0], { lifecycle_state: 'depleted',
    quantity_numerator: '0', retired_by_causal_identity: 'finite-exhausted',
    updated_change_set_id: 'finite-change-3' });
  await pool.query(`DELETE FROM party_runtime.party_resource_node_decrements
    WHERE party_id=$1`, [partyId]);
  await removePartyAnchor(pool, partyId);
  await pool.query(`DELETE FROM party_runtime.parties WHERE party_id=$1`, [partyId]);
}

async function assertFiniteResolverReloadLifecycle(pool) {
  const partyId = 'party-finite-reload';
  const scope = { entity_kind: 'g6', entity_id: 'finite-reload-scope' };
  const sourceRef = 'finite-reload-node';
  const permissions = ['finite-reload-profile', 'finite-reload-source'];
  const bounds = { minimum: { numerator: 1, denominator: 1, unit: 'item' },
    maximum: { numerator: 8, denominator: 1, unit: 'item' } };
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,
     materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ($1,2,'world','catalog','materializer','rng','commands','profiles')`, [partyId]);
  await insertPartyAnchor(pool, partyId);
  await pool.query(`INSERT INTO party_runtime.party_v3_change_sets
    (id,party_id,operation_kind,expected_state_version_set_digest,
     expected_state_version_set,committed_state_version_set_digest,
     write_plan_digest,created_at_turn,committed_at_turn)
    VALUES ('finite-reload-fixture',$1,'fixture',$2,'[]'::jsonb,$2,$2,0,0)`,
  [partyId, 'e'.repeat(64)]);
  await pool.query(`INSERT INTO party_runtime.party_g5_sites
    (id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,
     created_change_set_id,updated_change_set_id)
    VALUES ('finite-reload-g5',$1,'canonical','finite-reload-g4',$2::jsonb,
      'active',0,'finite-reload-fixture','finite-reload-fixture')`,
  [partyId, JSON.stringify({ entity_id: 'finite-reload-g5' })]);
  await pool.query(`INSERT INTO party_runtime.party_scene_baselines
    (id,party_id,host_kind,host_id,source_kind,scene_template_ref,
     materialization_trace_id,materializer_version,catalog_digest,status,
     state_version,created_change_set_id,updated_change_set_id)
    VALUES ('finite-reload-baseline',$1,'g5_site','finite-reload-g5',
      'canonical_template',$2::jsonb,'trace','materializer','catalog','active',0,
      'finite-reload-fixture','finite-reload-fixture')`,
  [partyId, JSON.stringify({ entity_id: 'finite-reload-scene' })]);
  await pool.query(`INSERT INTO party_runtime.party_g6_instances
    (id,party_id,scene_baseline_id,source_scene_template_ref,scene_slot_key,
     host_kind,host_id,physical_class_id,primary_scene_role_id,vertical_context_id,
     overhead_cover_id,intra_g6_visibility_mode,default_visibility_distance_band,
     acoustic_uniformity,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ('finite-reload-g6',$1,'finite-reload-baseline',$2::jsonb,'main',
      'g5_site','finite-reload-g5','interior','room','ground','open','default_clear',
      'near','uniform','active',0,'finite-reload-fixture','finite-reload-fixture')`,
  [partyId, JSON.stringify({ entity_id: 'finite-reload-scene' })]);
  await pool.query(`INSERT INTO party_runtime.scene_position_nodes
    (id,party_id,g6_instance_id,position_type_id,template_slot_key,
     template_instance_ordinal,capacity,access_class_id,status,state_version,
     created_change_set_id,updated_change_set_id)
    VALUES ('position-reload',$1,'finite-reload-g6','ground','source',0,4,'open',
      'active',0,'finite-reload-fixture','finite-reload-fixture')`, [partyId]);
  const aggregate = seedFiniteAggregate(scope);
  const basis = { basis_ref: sourceRef, state: 'committed', scope_ref: { ...scope },
    prepared_seed_provenance: null, functional_buckets: ['other_ordinary'],
    allowed_admission_classes: ['specialized_or_valuable'],
    permission_refs: [...permissions], basis_kind: 'finite_source' };
  const placement = finiteResolverPropertyContext(scope, sourceRef);
  const objective = finiteResolverObjective(scope, sourceRef, permissions, bounds);
  const placementDigest = ordinaryWorldPropertyPlacementContextDigest({ ...placement,
    supporting_basis_ref: 'ordinary_enablement_context_digest',
    causal_basis_refs: ['ordinary_enablement_context_digest'],
    requested_position_ref: 'ordinary_enablement_context_digest' });
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_aggregates
    (party_id,scope_kind,scope_id,state_version,aggregate_payload)
    VALUES ($1,$2,$3,$4,$5::jsonb)`,
  [partyId, scope.entity_kind, scope.entity_id, aggregate.state_version,
    JSON.stringify(aggregate)]);
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_contexts
    (party_id,scope_kind,scope_id,catalog_version,property_version,placement_version,
     supporting_basis_catalog_version,supporting_basis_catalog_digest,
     property_placement_context_digest,property_placement_base_snapshot)
    VALUES ($1,$2,$3,1,1,1,1,$4,$5,$6::jsonb)`,
  [partyId, scope.entity_kind, scope.entity_id, basisDigest([basis]), placementDigest,
    JSON.stringify(placement)]);
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_basis_catalog
    (party_id,scope_kind,scope_id,basis_ref,origin_request_identity,basis_snapshot)
    VALUES ($1,$2,$3,$4,NULL,$5::jsonb)`,
  [partyId, scope.entity_kind, scope.entity_id, sourceRef, JSON.stringify(basis)]);
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_enablements
    (party_id,scope_kind,scope_id,objective_snapshot,objective_digest,enabled)
    VALUES ($1,$2,$3,$4::jsonb,$5,true)`,
  [partyId, scope.entity_kind, scope.entity_id, JSON.stringify(objective),
    canonicalDigest(objective)]);
  await pool.query(`INSERT INTO party_runtime.party_resource_nodes
    (resource_node_id,party_id,source_resource_ref,position_node_id,
     quantity_numerator,quantity_denominator,quantity_unit_ref,quality_ref,
     access_policy_ref,state_version,created_change_set_id,updated_change_set_id,
     lifecycle_state,initial_amount_bounds,initialization_identity,
     initial_amount_evidence,property_basis_ref)
    VALUES ($1,$2,$3::jsonb,'position-reload',2,1,$4::jsonb,$3::jsonb,$3::jsonb,
      8,'finite-reload-fixture','finite-reload-fixture','active',NULL,
      'finite-reload-provision',NULL,'property-reload')`,
  [sourceRef, partyId, JSON.stringify({ ref: sourceRef }),
    JSON.stringify({ kind: 'unit', id: 'item' })]);
  const repository = createPostgresOrdinaryMaterializationEnablementRepository({ pool });
  let modelCalls = 0;
  const model = async (request) => {
    modelCalls += 1;
    assert.equal(request.mode, 'resolve_presence');
    return finiteResolverModelPlan(request, sourceRef);
  };
  model.verifyStageBCutover = async () => true;
  const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId,
    inputDigest: 'finite-reload-input', loadEnablement: (input) => repository.load(input),
    ordinaryMaterializationModel: model });
  const firstResult = await resolver(finiteResolverRequest('turn:finite:1',
    'взять первую порцию'));
  const first = firstResult.ordinary_materialization_atomic_write_plan;
  assert.equal(first.item.item_proposal.semantic_descriptor.name,
    'обычная речная глина');
  assert.deepEqual(first.finite_resource_transition.before_quantity,
    { numerator: 2, denominator: 1, unit: 'item' });
  assert.equal(first.finite_resource_transition.expected_state_version, 8);
  await commitFiniteInP16(pool, first, 'finite-reload-change-1', 0);
  const secondResult = await resolver(finiteResolverRequest('turn:finite:2',
    'взять оставшуюся порцию'));
  const second = secondResult.ordinary_materialization_atomic_write_plan;
  assert.equal(second.item.item_proposal.semantic_descriptor.name,
    'обычная речная глина');
  assert.deepEqual(second.finite_resource_transition.before_quantity,
    { numerator: 1, denominator: 1, unit: 'item' });
  assert.equal(second.finite_resource_transition.expected_state_version, 9);
  assert.equal(second.finite_resource_transition.lifecycle_state_after, 'depleted');
  await commitFiniteInP16(pool, second, 'finite-reload-change-2', 1);
  assert.equal(modelCalls, 2, 'each fresh discovery performs one Stage B call');
  const persistedNames = await pool.query(`SELECT state->'ordinary_metadata'->>'name' AS name
    FROM party_runtime.party_items WHERE party_id=$1 ORDER BY item_id`, [partyId]);
  assert.deepEqual(persistedNames.rows, [
    { name: 'обычная речная глина' }, { name: 'обычная речная глина' }
  ]);
  const exhausted = await pool.query(`SELECT state_version,lifecycle_state,
    quantity_numerator FROM party_runtime.party_resource_nodes
    WHERE party_id=$1 AND resource_node_id=$2`, [partyId, sourceRef]);
  assert.deepEqual(exhausted.rows[0], { state_version: '10',
    lifecycle_state: 'depleted', quantity_numerator: '0' });
  await pool.query(`DELETE FROM party_runtime.party_resource_node_decrements
    WHERE party_id=$1`, [partyId]);
  await removePartyAnchor(pool, partyId);
  await pool.query(`DELETE FROM party_runtime.parties WHERE party_id=$1`, [partyId]);
}

function finiteResolverObjective(scope, sourceRef, permissions, bounds) {
  return { request_id: 'finite-reload-enablement', scope_ref: { ...scope },
    context_refs: { period_ref: 'period', region_ref: 'region', function_refs: [],
      environment_refs: ['environment-reload'], occupation_household_refs: [],
      economic_context_ref: 'economy', occupancy_state_ref: 'occupied',
      material_culture_refs: [], property_context_ref: 'property-reload' },
    policy_refs: { authority_policy_ref: 'authority', density_policy_ref: 'density',
      ordinary_presence_policy_ref: 'presence',
      runtime_item_mechanics_policy_ref: 'mechanics-reload',
      allowed_admission_classes: ['specialized_or_valuable'],
      context_bound_permission_refs: [...permissions],
      allowed_supporting_bases: [{ basis_ref: sourceRef, basis_state: 'committed' }] },
    technical_limits: { max_new_entities: 1, max_new_background_groups: 1,
      max_resolution_records: 8 }, execution_context: {
      allowed_disclosure_policy_refs: [], density_policy: { version: 'density',
        mappings: [{ scope_kind: 'g6', function_ref: null,
          bands: { sparse: 0, ordinary: 1, dense: 1 } }] },
      candidate_context: { target_ref: scope.entity_id,
        candidate_ref_namespace: 'finite-reload-candidate',
        normalizer_version: 'ordinary-normalizer-v1', semantic_type: 'river_clay',
        candidate_hint: null, functional_bucket: 'other_ordinary',
        admission_class: 'specialized_or_valuable', availability_class: 'context_bound',
        coverage_kind: 'visible_surface', coverage_ref: 'finite-reload-surface',
        policy_version: 'presence' }, stage_b_classification_eval: {},
      mechanics_policy: { policy_ref: 'mechanics-reload', max_mass_grams: 1000,
        allowed_external_hand_costs: [0, 1, 2],
        allowed_carry_forms: ['compact', 'regular'], max_packing_slot_cost: 10,
        max_quantity: 10 }, causal_ref: 'finite-reload-cause', source_refs: [sourceRef],
      constrained_natural_resource_profile: {
        schema: 'rus.items.constrained_natural_resource_profile.v1', version: 1,
        profile_ref: permissions[0], state: 'committed', scope_ref: { ...scope },
        environment_ref: 'environment-reload', semantic_type: 'river_clay',
        functional_bucket: 'other_ordinary', admission_class: 'specialized_or_valuable',
        regional_permission_ref: permissions[0], resource_permission_ref: permissions[1],
        source_basis_ref: sourceRef, public_name: 'обычная речная глина',
        finite_source: { source_resource_node_id: sourceRef,
          quantity_unit_ref: { kind: 'unit', id: 'item' },
          position_ref: 'position-reload', property_basis_ref: 'property-reload',
          initial_amount_bounds: structuredClone(bounds) } } } };
}

function finiteResolverPropertyContext(scope, sourceRef) {
  return { schema: 'rus.items.ordinary_world_property_placement_context.v2', version: 2,
    scope_ref: { ...scope }, item_kind: 'natural_resource_portion',
    property_catalog_version_ref: 'property-reload-v1',
    placement_catalog_version_ref: 'placement-reload-v1',
    explicit_item_source_refs: [sourceRef], personal_possession_refs: [],
    communal_public_service_refs: [], container_property_refs: [], occupied_site_refs: [],
    unowned_cause_refs: [], placement_context_refs: ['placement-reload'],
    property_catalog: [{ property_basis_ref: 'property-reload', state: 'committed',
      scope_ref: { ...scope }, basis_class: 'explicit_source_item', source_ref: sourceRef,
      unowned_cause_ref: null, unowned_cause_kind: null }],
    placement_catalog: [{ position_ref: 'position-reload', state: 'committed',
      scope_ref: { ...scope }, position_kind: 'scene_position', g6_ref: scope.entity_id,
      containment_depth: 0, placement_context_ref: 'placement-reload' }] };
}

function finiteResolverRequest(rootTurnId, query) {
  return { request: { root_turn_id: rootTurnId }, committed_state: { position: {
    g6_id: 'finite-reload-scope', g5_anchor_id: 'ordinary-anchor' } },
  operation: { target_refs: ['finite-reload-scope'], query }, working_projection: {} };
}

function finiteResolverModelPlan(request, sourceRef) {
  return { schema: 'ordinary_materialization_plan_v1', request_id: request.request_id,
    resolution: 'materialize', density_band_proposal: null, background_groups: [],
    presence_resolutions: [], reason_code: 'committed-finite-source', entities: [{
      semantic_descriptor: { semantic_type: 'river_clay',
        name: 'подлинная княжеская монета из глины', facts: [] },
      authority_class: 'ordinary', admission_class: 'specialized_or_valuable',
      availability_class: 'context_bound', functional_bucket: 'other_ordinary',
      presence_expectation: 'routine', supporting_basis_ref: sourceRef,
      causal_basis: { basis_kind: 'finite_source', basis_refs: [sourceRef] },
      property_basis_ref: 'property-reload', placement_proposal: {
        scope_ref: 'finite-reload-scope', position_ref: 'position-reload' },
      mechanics_proposal: { mass_grams: 300, external_hand_cost: 1,
        carry_form: 'regular', packing_slot_cost: 1,
        quantity: { value: 1, unit: 'item' }, container: null } }] };
}

function seedFiniteAggregate(scope) {
  return applyOrdinaryAggregateTransition({
    aggregate: createOrdinaryAggregate({ scope_ref: scope, resolution_record_cap: 8 }),
    transition: { kind: 'seed', request_identity: 'finite-seed',
      expected_state_version: 0, density_band: 'ordinary', identity_budget: 8,
      background_groups: [] }
  });
}

function finitePropertyPlacementContext(scope) {
  const context = propertyPlacementContext();
  context.scope_ref = structuredClone(scope);
  context.property_catalog[0].scope_ref = structuredClone(scope);
  context.placement_catalog[0].scope_ref = structuredClone(scope);
  context.placement_catalog[0].g6_ref = scope.entity_id;
  return context;
}

function finitePlan(options) {
  return createOrdinaryMaterializationAtomicWritePlan(finitePlanInput(options));
}

function finitePlanInput({ partyId, scope, aggregate, partyStateVersion,
  sourceStateVersion, before, decrement, requestIdentity, sourceResourceNodeId,
  initialize = false, sourceBasis, placement }) {
  const raw = plan({ aggregate, party_state_version: partyStateVersion,
    request_identity: requestIdentity, expected_supporting_basis_catalog: [sourceBasis],
    supporting_basis_catalog_version: 1,
    expected_property_placement_context: placement, scope, party_id: partyId,
    seal: false });
  const originalRef = raw.item.supporting_basis_ref;
  raw.item.supporting_basis_ref = sourceBasis.basis_ref;
  raw.item.causal_basis_refs = [sourceBasis.basis_ref];
  raw.item.causal_basis_kind = 'finite_source';
  raw.item.item_proposal.schema = 'ordinary_world_item_proposal_v2';
  raw.item.item_proposal.causal_basis_kind = 'finite_source';
  raw.item.item_proposal.scope_ref = structuredClone(scope);
  raw.item.item_proposal.supporting_basis_ref = sourceBasis.basis_ref;
  raw.item.item_proposal.placement.scope_ref = scope.entity_id;
  raw.item.item_proposal.property_placement_evidence.scope_ref = structuredClone(scope);
  raw.item.mechanics_snapshot.provenance.source_refs = raw.item.mechanics_snapshot
    .provenance.source_refs.map((ref) => ref === originalRef ? sourceBasis.basis_ref : ref)
    .sort();
  raw.item.item_id = `ordinary_item_${canonicalDigest({ party_id: partyId,
    scope_ref: scope, candidate_key: raw.item.candidate_key,
    coverage_key: raw.item.coverage_key,
    context_version: raw.item.context_version }).slice(0, 24)}`;
  const transition = {
    source_resource_node_id: sourceResourceNodeId,
    expected_state_version: sourceStateVersion,
    causal_transition_identity: requestIdentity,
    quantity_unit_ref: { kind: 'unit', id: 'item' },
    before_quantity: structuredClone(before),
    decrement_quantity: structuredClone(decrement),
    after_quantity: { numerator: before.numerator - decrement.numerator,
      denominator: 1, unit: before.unit },
    next_state_version: sourceStateVersion + 1,
    lifecycle_state_after: before.numerator === decrement.numerator
      ? 'depleted' : 'active'
  };
  raw.finite_resource_transition = transition;
  if (initialize) raw.finite_resource_initialization = {
    source_resource_node_id: sourceResourceNodeId,
    expected_state_version: sourceStateVersion - 1,
    initialization_identity: requestIdentity,
    quantity_unit_ref: structuredClone(transition.quantity_unit_ref),
    estimated_amount: structuredClone(before),
    approved_bounds: {
      minimum: { numerator: 1, denominator: 1, unit: before.unit },
      maximum: { numerator: 10, denominator: 1, unit: before.unit }
    }
  };
  return raw;
}

async function insertFiniteResource(pool, partyId, id, initialAmountBounds) {
  await pool.query(`INSERT INTO party_runtime.party_resource_nodes
    (resource_node_id,party_id,source_resource_ref,position_node_id,
     quantity_numerator,quantity_denominator,quantity_unit_ref,quality_ref,
     access_policy_ref,state_version,created_change_set_id,updated_change_set_id,
     lifecycle_state,initial_amount_bounds,initialization_identity,
     initial_amount_evidence,property_basis_ref)
    VALUES ($1,$2,$3::jsonb,'position',0,1,$4::jsonb,$3::jsonb,
      $3::jsonb,1,'finite-fixture','finite-fixture','uninitialized',$5::jsonb,
      NULL,NULL,'property')`, [id, partyId, JSON.stringify({ ref: id }),
    JSON.stringify({ kind: 'unit', id: 'item' }),
    JSON.stringify(initialAmountBounds)]);
}

async function insertPartyAnchor(pool, partyId) {
  await pool.query(`INSERT INTO party_runtime.party_materialization_runs
      (party_id,run_id,g4_id,run_kind,seed_digest,input_digest,catalog_digest,
       materializer_version,rng_version,result_digest,idempotency_key,status)
    VALUES ($1,'ordinary-run','ordinary-g4','baseline','seed','input','catalog',
      'materializer','rng','result','ordinary-run-key','committed')`, [partyId]);
  await pool.query(`INSERT INTO party_runtime.party_g5_nodes
      (party_id,g5_node_id,run_id,parent_g4_id,template_id,slot_key)
    VALUES ($1,'ordinary-node','ordinary-run','ordinary-g4','node-template','main')`,
  [partyId]);
  await pool.query(`INSERT INTO party_runtime.party_g5_anchors
      (party_id,anchor_id,g5_node_id,template_id,slot_key,item_capacity)
    VALUES ($1,'ordinary-anchor','ordinary-node','anchor-template','main',16)`,
  [partyId]);
  await pool.query(`INSERT INTO party_runtime.party_positions
      (party_id,g4_id,g5_node_id,g5_anchor_id)
    VALUES ($1,'ordinary-g4','ordinary-node','ordinary-anchor')`, [partyId]);
}

async function removePartyAnchor(pool, partyId) {
  await pool.query(`DELETE FROM party_runtime.party_item_placements
    WHERE party_id=$1`, [partyId]);
  await pool.query(`DELETE FROM party_runtime.party_positions
    WHERE party_id=$1`, [partyId]);
  await pool.query(`DELETE FROM party_runtime.party_g5_anchors
    WHERE party_id=$1`, [partyId]);
  await pool.query(`DELETE FROM party_runtime.party_g5_nodes
    WHERE party_id=$1`, [partyId]);
  await pool.query(`DELETE FROM party_runtime.party_materialization_runs
    WHERE party_id=$1`, [partyId]);
}

async function commitFiniteInP16(pool, plan, changeSetId, partyVersion,
  forceRollback = false) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await applyOrdinaryMaterializationAtomicWritePlanInTransaction({ client,
      input: plan, partyStateVersionAfter: partyVersion + 1,
      p16ChangeSetId: changeSetId });
    await client.query(`INSERT INTO party_runtime.party_v3_change_sets
      (id,party_id,operation_kind,expected_state_version_set_digest,
       expected_state_version_set,committed_state_version_set_digest,
       write_plan_digest,created_at_turn,committed_at_turn)
      VALUES ($1,$2,'finite-ordinary',$3,'[]'::jsonb,$3,$3,1,1)`,
    [changeSetId, plan.party_id, plan.write_plan_digest.replace('sha256:', '')]);
    const party = await client.query(`UPDATE party_runtime.parties
      SET state_version=state_version+1 WHERE party_id=$1 AND state_version=$2`,
    [plan.party_id, partyVersion]);
    assert.equal(party.rowCount, 1);
    if (forceRollback) {
      await assert.rejects(() => client.query('SELECT 1/0'));
      await client.query('ROLLBACK');
      throw new Error('forced finite P16 rollback');
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

async function replayFiniteInP16(pool, plan, changeSetId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const party = await client.query(`SELECT state_version FROM party_runtime.parties
      WHERE party_id=$1 FOR UPDATE`, [plan.party_id]);
    const result = await applyOrdinaryMaterializationAtomicWritePlanInTransaction({
      client, input: plan, partyStateVersionAfter:
        Number(party.rows[0].state_version) + 1,
      p16ChangeSetId: changeSetId
    });
    assert.equal(result.replay, true);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}
