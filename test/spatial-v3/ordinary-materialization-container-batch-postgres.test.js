import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Pool } from 'pg';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import {
  applyOrdinaryAggregateTransition,
  createOrdinaryAggregate
} from '@rus/materialization';
import { buildCombinedWritePlan } from
  '../../packages/turn/src/spatial-v3-write-plan.js';
import { createSpatialV3CombinedAtomicCommitter } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { ordinaryPhysicalKeys } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-ordinary-p16.js';
import {
  applyOrdinaryMaterializationAtomicWritePlanInTransaction
} from '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-phase-6-commit.js';
import { batchInput } from
  '../../apps/game-server/test/ordinary-materialization-container-batch-plan.test.js';
import { createPostgresOrdinaryContainerContentsLoader } from
  '../../apps/game-server/src/infrastructure/postgres/ordinary-container-contents-loader.js';
import { createLowerDvinaTraceO2bContainerResolver } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-o2b-container-resolver.js';
import { activeProfile, containerRef, modelPlan, operationIdentity, partyId,
  seedRequest } from
  '../../apps/game-server/test/lower-dvina-trace-o2b-production-fixture.js';
import { provisionProductionO2bFixture } from
  './ordinary-materialization-container-production-postgres-fixture.js';
import { loadLowerDvinaTraceProductionMaterializationProfiles } from
  '../../apps/game-server/src/internal/lower-dvina-trace-production-materialization-profiles.js';
import { createOrdinaryMaterializationFirstEntryProvisioner } from
  '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-first-entry-provisioning.js';
import { buildExistingContainerOrdinarySeedRequest } from '@rus/items-property';
import { projectLowerDvinaTracePlayerSafeState } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-player-safe-state.js';

const docker = (args) => spawnSync('docker', args,
  { encoding:'utf8',timeout:60_000 });
const container = `ordinary-o2b-${process.pid}`;
const hex = 'b'.repeat(64);

test('O2b PostgreSQL batch is atomic, normalized, replay-safe and one-bump',
  async (t) => {
    if (docker(['version']).status !== 0) return t.skip('Docker required');
    let pool;
    t.after(async () => { if (pool) await pool.end(); docker(['rm','-f',container]); });
    const started = docker(['run','-d','--name',container,
      '-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD=ordinary',
      '-e','POSTGRES_USER=ordinary','-e','POSTGRES_DB=ordinary',
      'postgres:16-alpine']);
    assert.equal(started.status,0,started.stderr);
    let ready = false;
    for (let attempt=0; attempt<50; attempt+=1) {
      await new Promise((done) => setTimeout(done,250));
      if (docker(['exec',container,'pg_isready','-U','ordinary','-d','ordinary']).status===0) {
        ready=true; break;
      }
    }
    assert.equal(ready,true);
    await new Promise((done) => setTimeout(done,750));
    const port=Number(docker(['port',container,'5432/tcp']).stdout
      .match(/:(\d+)\s*$/u)?.[1]);
    pool=new Pool({host:'127.0.0.1',port,user:'ordinary',password:'ordinary',
      database:'ordinary',max:4,connectionTimeoutMillis:5000});
    const files=(await import('../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js'))
      .SPATIAL_V3_TARGET_MIGRATIONS;
    for (const sql of files) await pool.query(sql);
    await pool.query(await readFile(
      'schemas/party-db/025_party_runtime_existing_container_ordinary_contents.sql','utf8'));
    const plan=batchInput({masses:[80,120]});
    await provision(pool,plan);

    await assert.rejects(() => staleAttempt(pool, plan, `UPDATE
      party_runtime.party_ordinary_materialization_aggregates
      SET state_version=2,
          aggregate_payload=jsonb_set(aggregate_payload,'{state_version}','2')
      WHERE party_id='party-o2b' AND scope_kind='container'
        AND scope_id='chest'`),
    {code:'ORDINARY_PHASE6_PROPOSAL_STALE'});
    await assert.rejects(() => staleAttempt(pool, plan, `UPDATE
      party_runtime.party_containers SET state_version=2
      WHERE party_id='party-o2b' AND container_id='chest'`),
    {code:'ORDINARY_CONTAINER_BATCH_CONTAINER_STALE'});

    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      await applyOrdinaryMaterializationAtomicWritePlanInTransaction({client,
        input:plan,partyStateVersionAfter:1,updatePartyState:true,
        p16ChangeSetId:'change-o2b'});
      await assert.rejects(() => client.query('SELECT 1/0'));
      await client.query('ROLLBACK');
    } finally { client.release(); }
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM
      party_runtime.party_ordinary_materialization_commits
      WHERE party_id='party-o2b'`)).rows[0].n,0);
    assert.equal((await pool.query(`SELECT closure_state,state_version FROM
      party_runtime.party_containers WHERE party_id='party-o2b'
      AND container_id='chest'`)).rows[0].closure_state,'closed');

    const committed=await commit(pool,plan,'change-o2b');
    assert.deepEqual(committed,{status:'committed',replay:false,state_version:4});
    const rows=await pool.query(`SELECT c.plan_schema,c.item_count,
        c.max_new_entities,
        c.transition_count,p.state_version,x.closure_state,x.state_version AS container_version,
        (SELECT count(*)::int FROM party_runtime.party_items i
          WHERE i.party_id=c.party_id AND i.template_id IS NULL) AS runtime_items,
        (SELECT count(*)::int FROM party_runtime.party_item_placements q
          WHERE q.party_id=c.party_id AND q.container_id='chest') AS placements
      FROM party_runtime.party_ordinary_materialization_commits c
      JOIN party_runtime.parties p ON p.party_id=c.party_id
      JOIN party_runtime.party_containers x ON x.party_id=c.party_id
        AND x.container_id=c.scope_id
      WHERE c.party_id='party-o2b' AND c.request_identity=$1`,
    [plan.request_identity]);
    assert.deepEqual(rows.rows[0],{plan_schema:plan.schema,item_count:2,
      max_new_entities:plan.technical_limits.max_new_entities,
      transition_count:3,state_version:'1',closure_state:'open',
      container_version:'2',runtime_items:2,placements:2});
    await assert.rejects(() => pool.query(`UPDATE
      party_runtime.party_ordinary_materialization_commits
      SET max_new_entities=1 WHERE party_id='party-o2b'
        AND request_identity=$1`,[plan.request_identity]),{code:'23514'});
    assert.deepEqual(await commit(pool,plan,'change-o2b-replay'),
      {status:'committed',replay:true,state_version:4});
    await assert.rejects(() => commit(pool,
      batchInput({masses:[90,110]}),'change-o2b-collision'),
    {code:'ORDINARY_PHASE6_IDEMPOTENCY_COLLISION'});
    assert.equal((await pool.query(`SELECT state_version FROM
      party_runtime.parties WHERE party_id='party-o2b'`)).rows[0].state_version,'1');

    await resetParty(pool);
    const empty=batchInput({masses:[]});
    await provision(pool,empty);
    assert.deepEqual(await commit(pool,empty,'change-o2b-empty'),
      {status:'committed',replay:false,state_version:2});
    const closure=await pool.query(`SELECT c.item_count,x.closure_state,
        (SELECT count(*)::int FROM party_runtime.party_items i
          WHERE i.party_id=c.party_id) AS runtime_items
      FROM party_runtime.party_ordinary_materialization_commits c
      JOIN party_runtime.party_containers x ON x.party_id=c.party_id
        AND x.container_id=c.scope_id
      WHERE c.party_id='party-o2b' AND c.request_identity=$1`,
    [empty.request_identity]);
    assert.deepEqual(closure.rows[0],{item_count:0,closure_state:'open',
      runtime_items:0});

    await resetParty(pool);
    const combined=combinedCommitter(pool);
    const staleContainerBatch=batchInput({masses:[80]});
    await provision(pool,staleContainerBatch);
    await pool.query(`UPDATE party_runtime.party_containers SET state_version=2
      WHERE party_id='party-o2b' AND container_id='chest'`);
    const staleContainer=await combined.commit({plan:
      await makeCombinedPlan(staleContainerBatch,'stale-container')});
    assert.equal(staleContainer.ok,false);
    assert.equal(staleContainer.error.code,'state_version_conflict');
    await assertEmptyCombinedFailure(pool);

    await resetParty(pool);
    const staleAggregateBatch=batchInput({masses:[80]});
    await provision(pool,staleAggregateBatch);
    await pool.query(`UPDATE party_runtime.party_ordinary_materialization_aggregates
      SET state_version=2,
          aggregate_payload=jsonb_set(aggregate_payload,'{state_version}','2')
      WHERE party_id='party-o2b' AND scope_kind='container'
        AND scope_id='chest'`);
    const staleAggregate=await combined.commit({plan:
      await makeCombinedPlan(staleAggregateBatch,'stale-aggregate')});
    assert.equal(staleAggregate.ok,false);
    assert.equal(staleAggregate.error.code,'state_version_conflict');
    await assertEmptyCombinedFailure(pool);

    await resetParty(pool);
    const rollbackBatch=batchInput({masses:[80,120]});
    await provision(pool,rollbackBatch);
    const lateFailure=await combined.commit({plan:
      await makeCombinedPlan(rollbackBatch,'late-failure',{missingClock:true})});
    assert.equal(lateFailure.ok,false);
    assert.equal(lateFailure.error.code,'state_version_conflict');
    await assertEmptyCombinedFailure(pool);

    await resetParty(pool);
    const combinedBatch=batchInput({masses:[80,120]});
    await provision(pool,combinedBatch);
    const combinedPlan=await makeCombinedPlan(combinedBatch,'success');
    const combinedResult=await combined.commit({plan:combinedPlan});
    assert.equal(combinedResult.ok,true,JSON.stringify(combinedResult));
    assert.equal(combinedResult.replay,false);
    assert.equal(combinedResult.change_set_id,'o2b-success-cs');
    assert.deepEqual((await pool.query(`SELECT p.state_version,
        x.closure_state,x.state_version AS container_version,
        (SELECT count(*)::int FROM party_runtime.party_items i
          WHERE i.party_id=p.party_id) AS item_count,
        (SELECT count(*)::int FROM party_runtime.party_visible_packages v
          WHERE v.party_id=p.party_id AND v.change_set_id='o2b-success-cs')
          AS visible_count
      FROM party_runtime.parties p JOIN party_runtime.party_containers x
        ON x.party_id=p.party_id WHERE p.party_id='party-o2b'`)).rows[0],
    {state_version:'1',closure_state:'open',container_version:'2',
      item_count:2,visible_count:1});
    assert.deepEqual(await combined.commit({plan:combinedPlan}),{
      ok:true,replay:true,change_set_id:'o2b-success-cs'});
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM
      party_runtime.party_ordinary_materialization_items
      WHERE party_id='party-o2b'`)).rows[0].n,2);
    assert.equal((await pool.query(`SELECT state_version FROM
      party_runtime.parties WHERE party_id='party-o2b'`)).rows[0].state_version,'1');
    const different=await makeCombinedPlan(
      batchInput({masses:[90,110]}),'success');
    const collision=await combined.commit({plan:different});
    assert.equal(collision.ok,false);
    assert.equal(collision.error.code,'state_version_conflict');

    await provisionProductionO2bFixture(pool);
    const loader=createPostgresOrdinaryContainerContentsLoader({pool});
    let modelCalls=0;
    const resolver=createLowerDvinaTraceO2bContainerResolver({partyId,
      inputDigest:'resolver-pg',loadedProfile:activeProfile(),
    loadCommittedContainer:loader,ordinaryMaterializationModel:async(request)=>{
      modelCalls+=1; return modelPlan(request); }});
    const resolved=await resolver({stage_a_request:seedRequest(),
      operation_identity:operationIdentity()});
    assert.equal(resolved.pass,true);
    assert.equal(modelCalls,1);
    const resolverPlan=await makeCombinedPlan(
      resolved.ordinary_materialization_atomic_write_plan,'resolver-success',
      {partyId});
    assert.equal((await combined.commit({plan:resolverPlan})).ok,true);
    const reloaded=await loader({party_id:partyId,
      container_ref:containerRef});
    assert.equal(reloaded.capacity_snapshot.length,1);
    assert.equal(reloaded.container.closure_state,'open');
    const reopened=createLowerDvinaTraceO2bContainerResolver({partyId,
      inputDigest:'resolver-pg',loadedProfile:activeProfile(),
    loadCommittedContainer:loader,ordinaryMaterializationModel:async()=>{
      throw Error('reopen must not reroll'); }});
    const replay=await reopened({stage_a_request:seedRequest(),
      operation_identity:operationIdentity()});
    assert.equal(replay.pass,true);
    assert.equal(replay.ordinary_materialization_atomic_write_plan,null);
    assert.equal(modelCalls,1);

    const activeParty='party-o2b-revision20';
    await provisionFirstEntryParty(pool,activeParty);
    const profiles=await loadLowerDvinaTraceProductionMaterializationProfiles();
    const provisioner=createOrdinaryMaterializationFirstEntryProvisioner({
      profile:profiles.ordinaryMaterializationProfile,
      ordinaryContainerContentsProfile:
        profiles.ordinaryContainerContentsProfile});
    await inTransaction(pool,async(transaction)=>provisioner.provision({
      transaction,partyId:activeParty,firstEntryBinding:{
        g6_instance_id:'g6:revision20',position_id:'position:revision20'}}));
    const replayProvision=await inTransaction(pool,async(transaction)=>
      provisioner.provision({transaction,partyId:activeParty,
        firstEntryBinding:{g6_instance_id:'g6:revision20',
          position_id:'position:revision20'}}));
    assert.equal(replayProvision.provisioned,false);
    const activeRef='trace_ld_v1_container_player_small_pouch';
    const activeLoader=createPostgresOrdinaryContainerContentsLoader({pool});
    const activeCommitted=await activeLoader({party_id:activeParty,
      container_ref:activeRef});
    assert.equal(activeCommitted.container.template_id,
      'container_tpl_nov_small_soft_bag_v1');
    assert.equal(activeCommitted.container.placement.holder_character_id,
      'pc:revision20');
    assert.equal(activeCommitted.capacity_snapshot.length,0);
    const beforeAccess=projectLowerDvinaTracePlayerSafeState({
      committed_state:{actor_id:'pc:revision20',position:{},items:[],
        containers:[activeCommitted.container],container_placements:[{
          ...activeCommitted.container.placement,container_id:activeRef,
          parent_container_id:activeCommitted.container.placement.container_id}]},
      actor_id:'pc:revision20'}).player_safe_state;
    assert.equal(beforeAccess.items.some(({item_id:id})=>id===activeRef),true);
    assert.equal(beforeAccess.items.some((item)=>item.placement?.container_id
      ===activeRef),false);
    const activeContext=activeCommitted.container.state
      .ordinary_contents_context;
    const activeSeed=buildExistingContainerOrdinarySeedRequest({
      container_context:{container_ref:activeContext.container_ref,
        template_id:activeContext.template_id,
        mechanics_profile_ref:activeContext.mechanics_profile_ref,
        owner_controller_ref:activeContext.owner_controller_ref,
        property_ref:activeContext.property_ref,
        site_function_ref:activeContext.site_function_ref,
        economic_context_ref:activeContext.economic_context_ref,
        context_bound_permission_refs:
          activeContext.context_bound_permission_refs,
        ordinary_policy:activeContext.ordinary_policy},prior_resolutions:[]});
    let driftModelCalls=0;
    const driftResolver=createLowerDvinaTraceO2bContainerResolver({
      partyId:activeParty,inputDigest:'revision20-drift',
      loadedProfile:profiles.ordinaryContainerContentsProfile,
      loadCommittedContainer:async(input)=>{
        const drifted=structuredClone(await activeLoader(input));
        drifted.container.ownership.owner_character_id='pc:other';
        return drifted;
      },ordinaryMaterializationModel:async()=>{ driftModelCalls+=1; }});
    const drifted=await driftResolver({stage_a_request:activeSeed,
      operation_identity:{root_turn_id:'turn-revision20-drift',step_index:1,
        operation_ref:`request_container_access:${activeRef}`}});
    assert.equal(drifted.pass,false);
    assert.equal(driftModelCalls,0);
    let activeModelCalls=0;
    const activeResolver=createLowerDvinaTraceO2bContainerResolver({
      partyId:activeParty,inputDigest:'revision20-access',
      loadedProfile:profiles.ordinaryContainerContentsProfile,
      loadCommittedContainer:activeLoader,
      ordinaryMaterializationModel:async(request)=>{
        activeModelCalls+=1;
        const basis=request.policy_refs.allowed_supporting_bases[0].basis_ref;
        const ordinary={semantic_descriptor:{semantic_type:
          'household_supply_wooden_spoon',name:'wooden spoon',facts:[]},
        authority_class:'ordinary',admission_class:'common_mundane',
        availability_class:'common',functional_bucket:'household',
        presence_expectation:'routine',supporting_basis_ref:basis,
        causal_basis:{basis_kind:'household_use',basis_refs:[basis]},
        property_basis_ref:activeContext.property_ref,
        placement_proposal:{scope_ref:activeRef,position_ref:activeRef},
        mechanics_proposal:{mass_grams:80,external_hand_cost:0,
          carry_form:'compact',packing_slot_cost:1,
          quantity:{value:1,unit:'item'},container:null}};
        return modelPlan(request,[ordinary]); }});
    const activeResolution=await activeResolver({stage_a_request:activeSeed,
      operation_identity:{root_turn_id:'turn-revision20',step_index:1,
        operation_ref:`request_container_access:${activeRef}`}});
    assert.equal(activeResolution.pass,true,
      JSON.stringify(activeResolution.errors));
    assert.equal(activeModelCalls,1);
    const activePlan=await makeCombinedPlan(
      activeResolution.ordinary_materialization_atomic_write_plan,
      'revision20-access',{partyId:activeParty});
    assert.equal((await combined.commit({plan:activePlan})).ok,true);
    const activeReload=await activeLoader({party_id:activeParty,
      container_ref:activeRef});
    assert.equal(activeReload.capacity_snapshot.length,1);
    const activeReopened=createLowerDvinaTraceO2bContainerResolver({
      partyId:activeParty,inputDigest:'revision20-access',
      loadedProfile:profiles.ordinaryContainerContentsProfile,
      loadCommittedContainer:activeLoader,
      ordinaryMaterializationModel:async()=>{
        throw Error('active revision 20 reopen must not reroll'); }});
    assert.equal((await activeReopened({stage_a_request:activeSeed,
      operation_identity:{root_turn_id:'turn-revision20',step_index:1,
        operation_ref:`request_container_access:${activeRef}`}}))
      .ordinary_materialization_atomic_write_plan,null);

    const rollbackParty='party-o2b-revision20-rollback';
    await provisionFirstEntryParty(pool,rollbackParty);
    const rollbackClient=await pool.connect();
    try { await rollbackClient.query('BEGIN');
      await provisioner.provision({transaction:rollbackClient,partyId:rollbackParty,
        firstEntryBinding:{g6_instance_id:'g6:rollback',
          position_id:'position:rollback'}});
      await rollbackClient.query('ROLLBACK');
    } finally { rollbackClient.release(); }
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM
      party_runtime.party_containers WHERE party_id=$1`,[rollbackParty]))
      .rows[0].n,0);
  });

function combinedCommitter(pool) {
  return createSpatialV3CombinedAtomicCommitter({
    now:()=>new Date('2030-01-01T00:00:00.000Z'),
    recheck:async()=>({ok:true}),
    withTransaction:async(work)=>{
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        const result=await work(client);
        await client.query('COMMIT');
        return result;
      } catch(error) {
        await client.query('ROLLBACK').catch(()=>{});
        throw error;
      } finally { client.release(); }
    }
  });
}

async function makeCombinedPlan(ordinaryPlan,suffix,{missingClock=false,
  partyId='party-o2b'}={}) {
  const changeSetId=`o2b-${suffix}-cs`;
  const visiblePayload={schema:'temporal_visible_package.v1',
    perceived_scene:'Содержимое контейнера открыто.',
    perceived_changes:['Содержимое зафиксировано.'],sensory_details:[],
    visible_npcs:[],visible_objects:ordinaryPlan.items.map((item)=>({
      entity_ref:{entity_kind:'item',entity_id:item.item_id},
      display_label:item.item_proposal.semantic_descriptor.name,
      recognition:'recognized',visible_status:'замечен'})),known_context:[],
    uncertainties:[],hypotheses:[],player_safe_interruption:null,
    allowed_action_affordances:[]};
  const pins=[{dependency_role:'source_authoring',entity_ref:{
    entity_kind:'world_revision',entity_id:'o2b-test'},version_pin:{
    pin_kind:'authoring_version',authoring_version:'test-v1',
    state_version:null}}];
  const expected=[{target_table:'parties',id:partyId,state_version:0},
    ...(missingClock?[{target_table:'party_clocks',id:partyId,
      state_version:1}]:[])];
  const updates=[{target_table:'parties',id:partyId,record:{
    party_id:partyId,profile_bundle_digest:'profiles'}},
    ...(missingClock?[{target_table:'party_clocks',id:partyId,record:{
      party_id:partyId,whole_minutes:0,subminute_numerator:0,
      subminute_denominator:1,clock_owner_kind:'party',clock_owner_id:null,
      updated_change_set_id:changeSetId}}]:[])];
  const built=await buildCombinedWritePlan({plan_id:`o2b-${suffix}-plan`,
    party_id:partyId,write_plan_kind:'semantic_commit',
    operation_kind:'move',canonical_input_digest:`sha256:${hex}`,
    expected_state_versions:expected,validation_report:{status:'pass',
      digest:`sha256:${hex}`},idempotency:{id:`o2b-${suffix}-idem`,
      key:`o2b-${suffix}-key`},change_set:{id:changeSetId},
    visible_package_envelope:{package_id:`visible-${suffix}`,
      party_id:partyId,turn_id:`turn-${suffix}`,
      committed_state_version:'1',change_set_id:changeSetId,
      package_digest:computeSpatialV3CanonicalDigest(visiblePayload),
      visible_payload:visiblePayload,presentation_status:'pending',
      projection_policy_ref:{entity_ref:{entity_kind:'visibility_modifier',
        entity_id:'projection-v1'},authoring_version:'test-v1'},
      dependency_pins:{pins,canonical_digest:
        computeSpatialV3CanonicalDigest(pins).replace('sha256:','')},
      idempotency_record_id:`o2b-${suffix}-idem`},
    lock_context:{owner_keys:[],execution_keys:[],g4_keys:[],physical_keys:[
      `party_runtime.party_v3_change_sets:${changeSetId}`,
      `party_runtime.parties:${partyId}`,
      ...(missingClock?[`party_runtime.party_clocks:${partyId}`]:[]),
      ...ordinaryPhysicalKeys(ordinaryPlan)]},
    commit_rechecks:['physical','state','pin','endpoint','route','capacity',
      'time','change_set'].map((kind)=>({kind,digest:`sha256:${hex}`})),
    approved_write_sets:[{inserts:[],updates,appends:[{
      target_table:'party_v3_change_sets',id:changeSetId,record:{id:changeSetId,
        party_id:partyId,operation_kind:'move',
        idempotency_record_id:`o2b-${suffix}-idem`,
        expected_state_version_set_digest:'expected',
        expected_state_version_set:[],
        committed_state_version_set_digest:'committed',
        write_plan_digest:`${changeSetId}-write`,created_at_turn:0,
        committed_at_turn:0}}]}],
    ordinary_materialization_atomic_write_plan:ordinaryPlan
  },{verifyApproval:async()=>({ok:true})});
  assert.equal(built.ok,true,JSON.stringify(built));
  return built.plan;
}

async function assertEmptyCombinedFailure(pool) {
  const row=(await pool.query(`SELECT p.state_version,x.closure_state,
      (SELECT count(*)::int FROM
        party_runtime.party_ordinary_materialization_commits c
        WHERE c.party_id=p.party_id) AS commits,
      (SELECT count(*)::int FROM party_runtime.party_items i
        WHERE i.party_id=p.party_id) AS items,
      (SELECT count(*)::int FROM party_runtime.party_item_placements q
        WHERE q.party_id=p.party_id) AS placements,
      (SELECT count(*)::int FROM party_runtime.party_visible_packages v
        WHERE v.party_id=p.party_id) AS visible
    FROM party_runtime.parties p JOIN party_runtime.party_containers x
      ON x.party_id=p.party_id WHERE p.party_id='party-o2b'`)).rows[0];
  assert.deepEqual(row,{state_version:'0',closure_state:'closed',commits:0,
    items:0,placements:0,visible:0});
}

async function staleAttempt(pool,plan,mutation) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(mutation);
    await applyOrdinaryMaterializationAtomicWritePlanInTransaction({client,
      input:plan,partyStateVersionAfter:1,updatePartyState:true,
      p16ChangeSetId:'change-o2b-stale'});
  } finally {
    await client.query('ROLLBACK').catch(()=>{});
    client.release();
  }
}

async function resetParty(pool) {
  await pool.query(`DELETE FROM party_runtime.party_change_set_write_plans
    WHERE change_set_id IN (SELECT id FROM party_runtime.party_v3_change_sets
      WHERE party_id='party-o2b')`);
  for (const table of [
    'party_item_placements','party_items',
    'party_ordinary_materialization_commit_items',
    'party_ordinary_materialization_item_basis_refs',
    'party_ordinary_materialization_items',
    'party_ordinary_materialization_commits',
    'party_ordinary_materialization_basis_catalog',
    'party_ordinary_materialization_enablements',
    'party_ordinary_materialization_contexts',
    'party_ordinary_materialization_aggregates','party_containers',
    'party_narration_jobs','party_visible_packages',
    'party_command_idempotency','party_v3_change_sets',
    'party_player_characters','party_materialization_runs','parties'
  ]) {
    await pool.query(`DELETE FROM party_runtime.${table}
      WHERE party_id='party-o2b'`);
  }
}

async function provisionFirstEntryParty(pool,id) {
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,
     materializer_version,rng_version,command_catalog_digest,
     profile_bundle_digest)
    VALUES ($1,2,'world','catalog','materializer','rng','commands','profiles')`,
  [id]);
  await pool.query(`INSERT INTO party_runtime.party_materialization_runs
    (party_id,run_id,g4_id,run_kind,seed_digest,input_digest,catalog_digest,
     materializer_version,rng_version,result_digest,idempotency_key,status)
    VALUES ($1,$2,'g4','baseline','s','i','c','m','r','z','k','committed')`,
  [id,`run:${id}`]);
  await pool.query(`INSERT INTO party_runtime.party_player_characters
    (party_id,character_id,profile) VALUES ($1,'pc:revision20','{}')`,[id]);
}

async function inTransaction(pool,work) { const client=await pool.connect();
  try { await client.query('BEGIN'); const result=await work(client);
    await client.query('COMMIT'); return result;
  } catch(error) { await client.query('ROLLBACK').catch(()=>{}); throw error; }
  finally { client.release(); } }

async function provision(pool, plan) {
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,
     materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ('party-o2b',2,'world','catalog','materializer','rng','commands','profiles')`);
  await pool.query(`INSERT INTO party_runtime.party_materialization_runs
    (party_id,run_id,g4_id,run_kind,seed_digest,input_digest,catalog_digest,
     materializer_version,rng_version,result_digest,idempotency_key,status)
    VALUES ('party-o2b','run','g4','baseline','s','i','c','m','r','z','k','committed')`);
  await pool.query(`INSERT INTO party_runtime.party_player_characters
    (party_id,character_id,profile) VALUES ('party-o2b','pc','{}')`);
  await pool.query(`INSERT INTO party_runtime.party_containers
    (party_id,container_id,run_id,template_id,holder_character_id,
     physical_position,closure_state,state,state_version)
    VALUES ('party-o2b','chest','run','chest-template','pc','hands','closed',$1::jsonb,1)`,
  [JSON.stringify({ordinary_contents_context:{mechanics_profile_ref:
    plan.container_pin.mechanics_profile_ref,mechanics_profile_digest:
    plan.container_pin.mechanics_profile_digest,context_digest:
    plan.container_pin.context_digest,ordinary_policy:{schema:
      'rus.items.existing_container_ordinary_policy.v2',version:2,
      unresolved_ordinary_contents:true,
      technical_limits:plan.technical_limits}}})]);
  const initial=applyOrdinaryAggregateTransition({aggregate:
    createOrdinaryAggregate({scope_ref:plan.scope_ref,resolution_record_cap:32}),
    transition:{kind:'seed',request_identity:'seed:chest',expected_state_version:0,
      density_band:'ordinary',identity_budget:16,background_groups:[]}});
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_aggregates
    (party_id,scope_kind,scope_id,state_version,aggregate_payload)
    VALUES ('party-o2b','container','chest',1,$1::jsonb)`,[JSON.stringify(initial)]);
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_contexts
    (party_id,scope_kind,scope_id,catalog_version,property_version,
     placement_version,supporting_basis_catalog_version,
     supporting_basis_catalog_digest,property_placement_context_digest,
     property_placement_base_snapshot)
    VALUES ('party-o2b','container','chest',1,1,1,1,$1,$2,'{}'::jsonb)`,
  [plan.expected_versions.supporting_basis_catalog_digest,
    plan.expected_versions.property_placement_context_digest]);
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_basis_catalog
    (party_id,scope_kind,scope_id,basis_ref,origin_request_identity,basis_snapshot)
    VALUES ('party-o2b','container','chest',$1,NULL,$2::jsonb)`,
  [plan.expected_supporting_basis_catalog[0].basis_ref,
    JSON.stringify(plan.expected_supporting_basis_catalog[0])]);
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_enablements
    (party_id,scope_kind,scope_id,objective_snapshot,objective_digest,enabled)
    VALUES ('party-o2b','container','chest',$1::jsonb,$2,true)`,
  [JSON.stringify({scope_ref:plan.scope_ref}),plan.enablement_pin.objective_digest]);
}

async function commit(pool,plan,changeSetId) {
  const client=await pool.connect();
  try { await client.query('BEGIN');
    const current=await client.query(`SELECT state_version FROM
      party_runtime.parties WHERE party_id=$1 FOR UPDATE`,[plan.party_id]);
    const result=await applyOrdinaryMaterializationAtomicWritePlanInTransaction({
      client,input:plan,partyStateVersionAfter:Number(current.rows[0].state_version)+1,
      updatePartyState:true,p16ChangeSetId:changeSetId});
    await client.query('COMMIT'); return result;
  } catch(error) { await client.query('ROLLBACK').catch(()=>{}); throw error; }
  finally { client.release(); }
}
