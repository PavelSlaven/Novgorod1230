import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { Pool } from 'pg';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import {
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
import { createLowerDvinaTraceTurnStepRuntimePorts } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-turn-step-runtime-ports.js';
import { createLowerDvinaTracePlayerSafeWorkingProjectionAuthority } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-player-safe-working.js';
import { ordinaryContainerRuntimeItemState } from
  '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-container-batch-item.js';

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
      transition_count:4,state_version:'1',closure_state:'open',
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
    assert.equal(staleContainer.error.code,'state_version_conflict',
      JSON.stringify(staleContainer));
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
    const combinedPlan=await makeCombinedPlan(combinedBatch,'success',{
      moveItem:combinedBatch.items[0]});
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
    const moved=(await pool.query(`SELECT p.container_id,
        p.holder_character_id,p.physical_position,i.state
      FROM party_runtime.party_items i
      JOIN party_runtime.party_item_placements p
        ON p.party_id=i.party_id AND p.item_id=i.item_id
      WHERE i.party_id='party-o2b' AND i.item_id=$1`,
    [combinedBatch.items[0].item_id])).rows[0];
    assert.equal(moved.container_id,null);
    assert.equal(moved.holder_character_id,'pc');
    assert.equal(moved.physical_position,'hands');
    assert.equal(moved.state.ordinary_metadata.operation_history.at(-1).result,
      'moved');
    assert.equal(moved.state.created_change_set_id,'o2b-success-cs');
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
    const resolverCommit=await combined.commit({plan:resolverPlan});
    assert.equal(resolverCommit.ok,true,JSON.stringify(resolverCommit));
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
    await provisionFirstEntryParty(pool,activeParty,{
      g6Id:'g6:revision20',positionId:'position:revision20'});
    const profiles=await loadLowerDvinaTraceProductionMaterializationProfiles();
    const provisioner=createOrdinaryMaterializationFirstEntryProvisioner({
      profile:profiles.ordinaryMaterializationProfile,
      ordinaryContainerContentsProfile:
        profiles.ordinaryContainerContentsProfile});
    await inTransaction(pool,async(transaction)=>provisioner.provision({
      transaction,partyId:activeParty,changeSetId:`first-entry:${activeParty}`,
      firstEntryBinding:{
        g6_instance_id:'g6:revision20',position_id:'position:revision20'}}));
    const replayProvision=await inTransaction(pool,async(transaction)=>
      provisioner.provision({transaction,partyId:activeParty,
        changeSetId:`first-entry:${activeParty}`,
        firstEntryBinding:{g6_instance_id:'g6:revision20',
          position_id:'position:revision20'}}));
    assert.equal(replayProvision.provisioned,false);
    const unseeded=(await pool.query(`SELECT aggregate_payload FROM
      party_runtime.party_ordinary_materialization_aggregates
      WHERE party_id=$1 AND scope_kind='g6' AND scope_id='g6:revision20'`,
    [activeParty])).rows[0].aggregate_payload;
    assert.equal(unseeded.seeded,false);

    const seededParty='party-o1-initial-seed';
    await provisionFirstEntryParty(pool,seededParty,{
      g6Id:'g6:initial-wreck',positionId:'position:initial-wreck'});
    const initialProvisioner=createOrdinaryMaterializationFirstEntryProvisioner({
      profile:profiles.ordinaryMaterializationProfile,
      includeContextBoundCapabilities:false,
      initialSceneSeed:{descriptor:'обжитой берег у места крушения',density_band:'ordinary'}});
    const seededInput={transaction:null,partyId:seededParty,
      changeSetId:`first-entry:${seededParty}`,firstEntryBinding:{
        g6_instance_id:'g6:initial-wreck',position_id:'position:initial-wreck'}};
    const firstSeed=await inTransaction(pool,async(transaction)=>
      initialProvisioner.provision({...seededInput,transaction}));
    const replaySeed=await inTransaction(pool,async(transaction)=>
      initialProvisioner.provision({...seededInput,transaction}));
    assert.equal(firstSeed.provisioned,true);
    assert.equal(replaySeed.provisioned,false);
    const seeded=(await pool.query(`SELECT aggregate_payload FROM
      party_runtime.party_ordinary_materialization_aggregates
      WHERE party_id=$1 AND scope_kind='g6' AND scope_id='g6:initial-wreck'`,
    [seededParty])).rows[0].aggregate_payload;
    assert.equal(seeded.seeded,true);
    assert.equal(seeded.density_band,'ordinary');
    assert.deepEqual(seeded.background_groups.map(({descriptor})=>descriptor),
      ['обжитой берег у места крушения']);
    const seedBases=(await pool.query(`SELECT origin_request_identity,basis_snapshot
      FROM party_runtime.party_ordinary_materialization_basis_catalog
      WHERE party_id=$1 AND scope_kind='g6' AND scope_id='g6:initial-wreck'
      ORDER BY basis_ref`,[seededParty])).rows;
    assert.ok(seedBases.every(({origin_request_identity:identity})=>
      identity===null));
    assert.ok(seedBases.every(({basis_snapshot:basis})=>
      basis.state==='committed'&&basis.prepared_seed_provenance===null));
    const activeRef='trace_ld_v1_container_player_small_pouch';
    const activeLoader=createPostgresOrdinaryContainerContentsLoader({pool});
    const activeCommitted=await activeLoader({party_id:activeParty,
      container_ref:activeRef});
    assert.equal(activeCommitted.container.template_id,
      'container_tpl_nov_small_soft_bag_v1');
    assert.equal(activeCommitted.container.placement.holder_character_id,
      'pc:revision20');
    assert.equal(activeCommitted.capacity_snapshot.length,0);
    const activeState={actor_id:'pc:revision20',position:{},items:[],
      player_profile:runtimePlayerProfile(),
      containers:[activeCommitted.container],container_placements:[{
        ...activeCommitted.container.placement,container_id:activeRef,
        parent_container_id:activeCommitted.container.placement.container_id}]};
    const beforeAccess=projectLowerDvinaTracePlayerSafeState({
      committed_state:activeState,
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
        operation_ref:`request_container_access:${activeRef}`,
        resolution_mode:'reveal'}});
    assert.equal(drifted.pass,false);
    assert.equal(driftModelCalls,0);
    let activeModelCalls=0;
    const activeResolver=createLowerDvinaTraceO2bContainerResolver({
      partyId:activeParty,inputDigest:'revision20-access',
      loadedProfile:profiles.ordinaryContainerContentsProfile,
      loadCommittedContainer:activeLoader,
      ordinaryMaterializationModel:async(request)=>{
        activeModelCalls+=1;
        return modelPlan(request,[activeOrdinary(request,activeContext)]); }});
    const projectionAuthority=
      createLowerDvinaTracePlayerSafeWorkingProjectionAuthority();
    const runtime=createLowerDvinaTraceTurnStepRuntimePorts({
      committedState:activeState,
      ordinaryContainerContentsResolver:activeResolver,
      workingProjectionAuthority:projectionAuthority});
    const accessOperation={op:'request_container_access',
      actor_ref:'pc:revision20',container_ref:activeRef,
      access_kind:'open_and_view'};
    const activeResolution=await runtime.executionRegistry
      .domain(accessOperation)({plan:{},request:{root_turn_id:'turn-revision20',
        step_index:1,actor:runtimeActor()},
      operation:accessOperation,
      working_projection:projectionAuthority.admit(beforeAccess),
      check_result:null});
    assert.equal(activeResolution.working_projection.items.some((item)=>
      item.placement?.container_id===activeRef),true);
    assert.equal(activeModelCalls,1);
    const activePlan=await makeCombinedPlan(
      activeResolution.ordinary_materialization_atomic_write_plan,
      'revision20-access',{partyId:activeParty});
    const activeCommit=await combined.commit({plan:activePlan});
    assert.equal(activeCommit.ok,true,JSON.stringify(activeCommit));
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
        operation_ref:`request_container_access:${activeRef}`,
        resolution_mode:'reveal'}}))
      .ordinary_materialization_atomic_write_plan,null);

    const concealedParty='party-o2b-concealed';
    await provisionFirstEntryParty(pool,concealedParty,{
      g6Id:'g6:concealed',positionId:'position:concealed'});
    await inTransaction(pool,async(transaction)=>provisioner.provision({
      transaction,partyId:concealedParty,
      changeSetId:`first-entry:${concealedParty}`,firstEntryBinding:{
        g6_instance_id:'g6:concealed',position_id:'position:concealed'}}));
    const concealedLoader=createPostgresOrdinaryContainerContentsLoader({pool});
    const concealedCommitted=await concealedLoader({party_id:concealedParty,
      container_ref:activeRef});
    const concealedContext=concealedCommitted.container.state
      .ordinary_contents_context;
    const concealedSeed=buildExistingContainerOrdinarySeedRequest({
      container_context:seedContext(concealedContext),prior_resolutions:[]});
    let concealedModelCalls=0;
    const concealedResolver=createLowerDvinaTraceO2bContainerResolver({
      partyId:concealedParty,inputDigest:'revision20-concealed',
      loadedProfile:profiles.ordinaryContainerContentsProfile,
      loadCommittedContainer:concealedLoader,
      ordinaryMaterializationModel:async(request)=>{
        concealedModelCalls+=1;
        return modelPlan(request,[activeOrdinary(request,concealedContext)]);
      }});
    const concealedResolution=await concealedResolver({
      stage_a_request:concealedSeed,
      operation_identity:{root_turn_id:'turn-concealed',step_index:1,
        operation_ref:`move_entity:${activeRef}`,
        resolution_mode:'concealed'}});
    const concealedPlan=concealedResolution
      .ordinary_materialization_atomic_write_plan;
    assert.equal(concealedPlan.container_transition.access_kind,
      'resolve_concealed');
    const movedContainer={party_id:concealedParty,container_id:activeRef,
      condition_state:null,closure_state:'closed',state:{
        ...concealedCommitted.container.state,
        ...concealedPlan.container_transition.state_patch},anchor_id:null,
      parent_container_id:null,holder_npc_id:null,
      holder_character_id:'pc:revision20',physical_position:'hands',
      equipment_slot_category_id:null,
      state_version:concealedCommitted.container.state_version,
      updated_change_set_id:'o2b-concealed-cs'};
    const concealedCommit=await combined.commit({plan:await makeCombinedPlan(
      concealedPlan,'concealed',{partyId:concealedParty,
        moveContainer:movedContainer})});
    assert.equal(concealedCommit.ok,true,JSON.stringify(concealedCommit));
    const concealedReload=await concealedLoader({party_id:concealedParty,
      container_ref:activeRef});
    assert.equal(concealedReload.container.closure_state,'closed');
    assert.equal(concealedReload.container.state_version,3);
    assert.equal(concealedReload.container.placement.physical_position,'hands');
    assert.equal(concealedReload.container.state.contents_state,
      'resolved_concealed');
    assert.equal(concealedReload.capacity_snapshot.length,1);
    const concealedItems=concealedReload.capacity_snapshot.map((item)=>({
      ...item,name:item.state.ordinary_metadata.name,
      semantic_type:item.state.ordinary_metadata.semantic_type,
      runtime_instance_mechanics_snapshot:
        item.state.runtime_instance_mechanics_snapshot}));
    const concealedState={actor_id:'pc:revision20',position:{},
      player_profile:runtimePlayerProfile(),
      items:concealedItems,containers:[concealedReload.container],
      container_placements:[{...concealedReload.container.placement,
        container_id:activeRef,parent_container_id:
          concealedReload.container.placement.container_id}]};
    const concealedBefore=projectLowerDvinaTracePlayerSafeState({
      committed_state:concealedState,
      actor_id:'pc:revision20'}).player_safe_state;
    assert.equal(concealedBefore.items.some(({name})=>name==='wooden spoon'),
      false);
    const reopenedRuntime=createLowerDvinaTraceTurnStepRuntimePorts({
      committedState:concealedState,
      ordinaryContainerContentsResolver:async()=>{
        throw Error('resolved concealed contents must not reroll');
      },workingProjectionAuthority:projectionAuthority});
    const reopenedResult=await reopenedRuntime.executionRegistry
      .domain(accessOperation)({plan:{},request:{root_turn_id:'turn-reopen',
        step_index:1,actor:runtimeActor()},
      operation:accessOperation,
      working_projection:projectionAuthority.admit(concealedBefore),
      check_result:null});
    const visibleChild=reopenedResult.working_projection.items.find(
      ({name})=>name==='wooden spoon');
    assert.equal(visibleChild.semantic_type,'household_supply_wooden_spoon');
    assert.equal(concealedModelCalls,1);

    const rollbackParty='party-o2b-revision20-rollback';
    await provisionFirstEntryParty(pool,rollbackParty,{
      g6Id:'g6:rollback',positionId:'position:rollback'});
    const rollbackClient=await pool.connect();
    try { await rollbackClient.query('BEGIN');
      await provisioner.provision({transaction:rollbackClient,partyId:rollbackParty,
        changeSetId:`first-entry:${rollbackParty}`,
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
  partyId='party-o2b',moveItem=null,moveContainer=null}={}) {
  const changeSetId=`o2b-${suffix}-cs`;
  const revealed=new Set(ordinaryPlan.container_transition.revealed_refs);
  const visiblePayload={schema:'temporal_visible_package.v1',
    perceived_scene:'Содержимое контейнера открыто.',
    perceived_changes:['Содержимое зафиксировано.'],sensory_details:[],
    visible_npcs:[],visible_objects:ordinaryPlan.items
      .filter(({item_id:id})=>revealed.has(id)).map((item)=>({
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
    ...(moveContainer==null?[]:[{target_table:'party_containers',
      id:moveContainer.container_id,state_version:moveContainer.state_version}]),
    ...(missingClock?[{target_table:'party_clocks',id:partyId,
      state_version:1}]:[])];
  const movedState=moveItem == null ? null
    : ordinaryContainerRuntimeItemState(moveItem,changeSetId);
  if (movedState != null) movedState.ordinary_metadata.operation_history.push({
    operation_id:'same-turn-move',root_turn_id:'turn-same-turn-move',
    step_index:2,operation_kind:'move_entity',result:'moved'});
  const updates=[{target_table:'parties',id:partyId,record:{
    party_id:partyId,profile_bundle_digest:'profiles'}},
    ...(moveItem==null?[]:[{target_table:'party_items',id:moveItem.item_id,
      record:{party_id:partyId,item_id:moveItem.item_id,quantity:1,
        condition_state:moveItem.condition_state,
        legal_status:'ordinary_container_content',state:movedState}},
    {target_table:'party_item_placements',id:moveItem.item_id,record:{
      party_id:partyId,item_id:moveItem.item_id,anchor_id:null,
      container_id:null,holder_npc_id:null,holder_character_id:'pc',
      physical_position:'hands',equipment_slot_category_id:null,
      attached_item_id:null}}]),
    ...(moveContainer==null?[]:[{target_table:'party_containers',
      id:moveContainer.container_id,record:moveContainer}]),
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
      ...(moveContainer==null?[]:[
        `party_runtime.party_containers:${moveContainer.container_id}`]),
      ...(moveItem==null?[]:[`party_runtime.party_items:${moveItem.item_id}`,
        `party_runtime.party_item_placements:${moveItem.item_id}`]),
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

async function provisionFirstEntryParty(pool,id,{g6Id,positionId}) {
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
  await pool.query(`INSERT INTO party_runtime.party_v3_change_sets
    (id,party_id,operation_kind,expected_state_version_set_digest,
     expected_state_version_set,committed_state_version_set_digest,
     write_plan_digest,created_at_turn,committed_at_turn)
    VALUES ($2,$1,'first_entry','fixture','[]'::jsonb,'fixture','fixture',0,0)`,
  [id,`first-entry:${id}`]);
  await pool.query(`INSERT INTO party_runtime.party_g5_sites
    (id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,
     created_change_set_id,updated_change_set_id)
    VALUES ($2,$1,'canonical','g4',$3::jsonb,'active',0,$4,$4)`,
  [id,`g5:${id}`,JSON.stringify({entity_id:`g5:${id}`}),`first-entry:${id}`]);
  await pool.query(`INSERT INTO party_runtime.party_scene_baselines
    (id,party_id,host_kind,host_id,source_kind,scene_template_ref,
     materialization_trace_id,materializer_version,catalog_digest,status,
     state_version,created_change_set_id,updated_change_set_id)
    VALUES ($2,$1,'g5_site',$3,'canonical_template',$4::jsonb,'trace',
      'materializer','catalog','active',0,$5,$5)`,
  [id,`baseline:${id}`,`g5:${id}`,
    JSON.stringify({entity_id:`scene:${id}`}),`first-entry:${id}`]);
  await pool.query(`INSERT INTO party_runtime.party_g6_instances
    (id,party_id,scene_baseline_id,source_scene_template_ref,scene_slot_key,
     host_kind,host_id,physical_class_id,primary_scene_role_id,
     vertical_context_id,overhead_cover_id,intra_g6_visibility_mode,
     default_visibility_distance_band,acoustic_uniformity,status,state_version,
     created_change_set_id,updated_change_set_id)
    VALUES ($2,$1,$3,$4::jsonb,'slot','g5_site',$5,'interior','room',
      'ground','open','default_clear','near','uniform','active',0,$6,$6)`,
  [id,g6Id,`baseline:${id}`,JSON.stringify({entity_id:`scene:${id}`}),
    `g5:${id}`,`first-entry:${id}`]);
  await pool.query(`INSERT INTO party_runtime.scene_position_nodes
    (id,party_id,g6_instance_id,position_type_id,template_slot_key,
     template_instance_ordinal,capacity,access_class_id,status,state_version,
     created_change_set_id,updated_change_set_id)
    VALUES ($2,$1,$3,'ground','source',0,4,'open','active',0,$4,$4)`,
  [id,positionId,g6Id,`first-entry:${id}`]);
}

async function inTransaction(pool,work) { const client=await pool.connect();
  try { await client.query('BEGIN'); const result=await work(client);
    await client.query('COMMIT'); return result;
  } catch(error) { await client.query('ROLLBACK').catch(()=>{}); throw error; }
  finally { client.release(); } }

function seedContext(context) { return {
  container_ref:context.container_ref,template_id:context.template_id,
  mechanics_profile_ref:context.mechanics_profile_ref,
  owner_controller_ref:context.owner_controller_ref,
  property_ref:context.property_ref,
  site_function_ref:context.site_function_ref,
  economic_context_ref:context.economic_context_ref,
  context_bound_permission_refs:context.context_bound_permission_refs,
  ordinary_policy:context.ordinary_policy}; }

function activeOrdinary(request,context) {
  const basis=request.policy_refs.allowed_supporting_bases[0].basis_ref;
  return {semantic_descriptor:{semantic_type:
    'household_supply_wooden_spoon',name:'wooden spoon',facts:[]},
  authority_class:'ordinary',admission_class:'common_mundane',
  availability_class:'common',functional_bucket:'household',
  presence_expectation:'routine',supporting_basis_ref:basis,
  causal_basis:{basis_kind:'household_use',basis_refs:[basis]},
  property_basis_ref:context.property_ref,
  placement_proposal:{scope_ref:context.container_ref,
    position_ref:context.container_ref},mechanics_proposal:{mass_grams:80,
    external_hand_cost:0,carry_form:'compact',packing_slot_cost:1,
    quantity:{value:1,unit:'item'},container:null}};
}

function runtimePlayerProfile() { return {
  attributes:{strength:{value:12}},inventory:{items:[],
    total_weight:{grams:0},load_category:'light',occupied_hands:0}}; }

function runtimeActor() { return {actor_id:'pc:revision20',
  attributes:{strength:{value:12}}}; }

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
  await pool.query(`INSERT INTO party_runtime.party_ownership
    (party_id,ownership_id,container_id,owner_character_id,
     controller_character_id,claim_state)
    VALUES ('party-o2b','ownership:chest','chest','pc','pc','owned')`);
  const initial=createOrdinaryAggregate({scope_ref:plan.scope_ref,
    resolution_record_cap:32});
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_aggregates
    (party_id,scope_kind,scope_id,state_version,aggregate_payload)
    VALUES ('party-o2b','container','chest',0,$1::jsonb)`,[JSON.stringify(initial)]);
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
