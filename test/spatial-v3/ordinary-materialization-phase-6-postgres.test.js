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
  ordinaryWorldPropertyPlacementContextDigest,
  resolveOrdinaryWorldPropertyPlacement
} from '@rus/items-property';
import {
  createOrdinaryMaterializationAtomicWritePlan,
  applyOrdinaryMaterializationAtomicWritePlanInTransaction,
  createPostgresOrdinaryMaterializationAtomicCommitter,
  createPostgresOrdinaryMaterializationPhase6Factory
} from '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-phase-6-commit.js';

const docker = (args, input) => spawnSync('docker', args, {
  input,
  encoding: 'utf8',
  timeout: 60_000
});
const container = `ordinary-phase6-${process.pid}`;
const migrations = ['001_party_runtime.sql', '002_party_runtime_v3.sql', '003_party_runtime_v3_planning.sql', '004_party_runtime_v3_journeys.sql', '005_party_runtime_v3_domain.sql', '006_party_runtime_v3_migration.sql', '007_party_runtime_temporal_world.sql', '008_party_runtime_pr8_first_entry.sql', '009_party_runtime_pr8_reaction_knowledge.sql', '010_party_runtime_pr8_reaction_options.sql', '011_party_runtime_first_playable.sql', '012_party_runtime_external_ownership.sql', '013_party_runtime_obligations.sql', '014_party_runtime_activity_resume_terminal.sql', '015_party_runtime_turn_step_items.sql', '016_party_runtime_npc_semantic_conversation.sql', '017_party_runtime_conversation_transcript.sql', '018_party_runtime_phase7_container_state.sql', '019_party_runtime_combat_sessions.sql', '020_party_runtime_actor_equipment.sql', '021_party_runtime_ordinary_materialization.sql', '022_party_runtime_ordinary_materialization_commit.sql'];
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
  resolution = 'materialize', token = request_identity }) {
  const seedTransition = !aggregate.seeded ? {
    kind: 'seed', request_identity: `seed-${token}`, expected_state_version: aggregate.state_version,
    density_band: 'ordinary', identity_budget: 4, background_groups: [preparedGroup(`seed-${token}`)]
  } : null;
  const new_prepared_bases = seedTransition
    ? [{basis_ref:seedTransition.background_groups[0].group_ref,state:'prepared_seed',scope_ref:{...scope_ref},prepared_seed_provenance:{seed_request_id:seedTransition.request_identity,mode:'seed_scope',candidate_query:null},functional_buckets:['household'],allowed_admission_classes:['common_mundane']}]
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
  const item = resolution === 'materialize' ? admittedItem({ request_identity, supporting_basis_ref:supportingBasis.basis_ref, ...transition }) : null;
  if (item) item.item_id = `ordinary_item_${canonicalDigest({
    party_id: 'party-a', scope_ref, candidate_key: item.candidate_key,
    coverage_key: item.coverage_key, context_version: item.context_version
  }).slice(0, 24)}`;
  return createOrdinaryMaterializationAtomicWritePlan({
    party_id: 'party-a', scope_ref, request_identity,
    input_digest: `input-${token}`,
    transition_digest: next_aggregate.committed_request_fingerprints.at(-1).transition_digest,
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
  });
}

function admittedItem({ request_identity, candidate_key, coverage_key, context_version, supporting_basis_ref, token = candidate_key }) {
  const property_basis_ref = 'property', position_ref = 'position', mechanics_policy_ref = `mechanics-${token}`;
  const evidence = structuredClone(resolveOrdinaryWorldPropertyPlacement({...propertyPlacementContext(),supporting_basis_ref,causal_basis_refs:[supporting_basis_ref],requested_position_ref:position_ref}).evidence);
  const source_refs = [candidate_key,coverage_key,supporting_basis_ref,property_basis_ref,position_ref,mechanics_policy_ref,evidence.property_source_ref,evidence.property_catalog_version_ref,evidence.placement_catalog_version_ref,evidence.placement_context_ref,evidence.property_placement_context_digest].sort();
  return {candidate_key,coverage_key,context_version,functional_bucket:'household',admission_class:'common_mundane',supporting_basis_ref,causal_basis_refs:[supporting_basis_ref],property_basis_ref,position_ref,mechanics_policy_ref,
    item_proposal:{schema:'ordinary_world_item_proposal_v1',request_id:request_identity,scope_ref:{...scope_ref},candidate_key,coverage_key,context_version,semantic_descriptor:{semantic_type:'household_tool',name:'wooden spoon',facts:['ordinary']},supporting_basis_ref,property_basis_ref,property_placement_evidence:evidence,placement:{scope_ref:scope_ref.entity_id,position_ref},runtime_item_mechanics_policy_ref:mechanics_policy_ref},
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
  await pool.query(await readFile('schemas/party-db/022_party_runtime_ordinary_materialization_commit.sql', 'utf8'));
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ('party-a',2,'world','catalog','materializer','rng','commands','profiles')`);
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
  assert.equal(positive.next_aggregate.committed_request_fingerprints.at(-1).transition_digest, positive.transition_digest);
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
