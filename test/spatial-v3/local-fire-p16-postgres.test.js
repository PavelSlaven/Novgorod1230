import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { Pool } from 'pg';
import { computeSpatialV3CanonicalDigest as digest } from
  '@rus/contracts/spatial-v3/registry';
import { buildNpcActionDecisionRequest, buildNpcStepPlan } from
  '@rus/npc-runtime';
import { createTurnStepExecutionRegistry, executeTurnStepActorStep } from
  '@rus/turn';
import { buildCombinedWritePlan } from
  '../../packages/turn/src/spatial-v3-write-plan.js';
import { integrateSpatialV3TemporalWriteFragments } from
  '../../packages/turn/src/spatial-v3-temporal-write-integration.js';
import { createSpatialV3CombinedAtomicCommitter } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { SPATIAL_V3_TARGET_MIGRATIONS } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';
import { createLocalFireAtomicWritePlan, localFirePhysicalKeys } from
  '../../apps/game-server/src/infrastructure/postgres/local-fire-atomic-write-plan.js';
import { loadLocalFireCommittedContext } from
  '../../apps/game-server/src/infrastructure/postgres/local-fire-persistence.js';
import { assertLocalFireFuelMutationBound } from
  '../../apps/game-server/src/infrastructure/postgres/local-fire-p16-extension.js';
import { lowerDvinaTraceLocalFireTemporalRegistration } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-local-fire-temporal.js';
import { createLowerDvinaTraceF1ProductionResolverFactory } from
  '../../apps/game-server/src/runtime/releases/lower-dvina-trace-f1-production.js';
import { deriveActionProducedResultItem } from
  '../../apps/game-server/src/infrastructure/postgres/action-produced-result-item.js';

const docker = (args) => spawnSync('docker', args,
  { encoding: 'utf8', timeout: 60_000 });
const container = `local-fire-${process.pid}`;
const hex = 'd'.repeat(64);
const clock = (n) => ({ whole_minutes: String(n),
  subminute_numerator: '0', subminute_denominator: '1' });

test('F1 start/add/due share P16 atomic replay and survive actor absence',
  async (t) => {
    if (docker(['version']).status !== 0) return t.skip('Docker required');
    let pool;
    t.after(async () => { if (pool) await pool.end();
      docker(['rm','-f',container]); });
    const started = docker(['run','-d','--name',container,
      '-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD=fire',
      '-e','POSTGRES_USER=fire','-e','POSTGRES_DB=fire','postgres:16-alpine']);
    assert.equal(started.status,0,started.stderr);
    for (let attempt=0; attempt<50; attempt+=1) {
      await new Promise((done)=>setTimeout(done,250));
      if (docker(['exec',container,'pg_isready','-U','fire','-d','fire'])
        .status===0) break;
      if (attempt===49) assert.fail('PostgreSQL not ready');
    }
    await new Promise((done)=>setTimeout(done,750));
    const port=Number(docker(['port',container,'5432/tcp']).stdout
      .match(/:(\d+)\s*$/u)?.[1]);
    pool=new Pool({host:'127.0.0.1',port,user:'fire',password:'fire',
      database:'fire',max:4});
    for (const sql of SPATIAL_V3_TARGET_MIGRATIONS) await pool.query(sql);
    await provision(pool);
    const committer=combinedCommitter(pool);

    await pool.query(`UPDATE party_runtime.party_ownership
      SET owner_character_id='foreign'
      WHERE party_id='party-fire' AND item_id='fuel-1'`);
    await assert.rejects(firePlan(pool,{action:'start',requestId:'foreign',
      changeSetId:'change-foreign',partyVersion:0,fuelIds:['fuel-1'],
      at:clock(10)}),{code:'LOCAL_FIRE_INPUT_NOT_ADMITTED'});
    await pool.query(`UPDATE party_runtime.party_ownership
      SET owner_character_id='pc'
      WHERE party_id='party-fire' AND item_id='fuel-1'`);
    await pool.query(`UPDATE party_runtime.party_item_placements
      SET holder_character_id='foreign',physical_position='hands',
        anchor_id=NULL
      WHERE party_id='party-fire' AND item_id='fuel-1'`);
    await assert.rejects(firePlan(pool,{action:'start',requestId:'remote',
      changeSetId:'change-remote',partyVersion:0,fuelIds:['fuel-1'],
      at:clock(10)}),{code:'LOCAL_FIRE_INPUT_NOT_ADMITTED'});
    await pool.query(`UPDATE party_runtime.party_item_placements
      SET holder_character_id='pc',physical_position='hands',anchor_id=NULL
      WHERE party_id='party-fire' AND item_id='fuel-1'`);

    const start=await firePlan(pool,{action:'start',requestId:'start',
      changeSetId:'change-start',partyVersion:0,fuelIds:['fuel-1'],at:clock(10)});
    const startCombined=await combinedPlan(start,0);
    await pool.query(`UPDATE party_runtime.party_item_placements
      SET holder_character_id='foreign'
      WHERE party_id='party-fire' AND item_id='ignition'`);
    const ignitionPlacementDrift=await committer.commit({plan:startCombined});
    assert.equal(ignitionPlacementDrift.ok,false,
      JSON.stringify(ignitionPlacementDrift));
    assert.equal(ignitionPlacementDrift.error.code,'state_version_conflict',
      JSON.stringify(ignitionPlacementDrift));
    await pool.query(`UPDATE party_runtime.party_item_placements
      SET holder_character_id='pc'
      WHERE party_id='party-fire' AND item_id='ignition'`);
    await pool.query(`UPDATE party_runtime.party_ownership
      SET owner_character_id='foreign'
      WHERE party_id='party-fire' AND item_id='ignition'`);
    const ignitionOwnershipDrift=await committer.commit({plan:startCombined});
    assert.equal(ignitionOwnershipDrift.ok,false);
    assert.equal(ignitionOwnershipDrift.error.code,'state_version_conflict');
    await pool.query(`UPDATE party_runtime.party_ownership
      SET owner_character_id='pc'
      WHERE party_id='party-fire' AND item_id='ignition'`);
    await pool.query(`UPDATE party_runtime.party_ownership
      SET owner_character_id='foreign'
      WHERE party_id='party-fire' AND item_id='fuel-1'`);
    const ownershipDrift=await committer.commit({plan:startCombined});
    assert.equal(ownershipDrift.ok,false);
    assert.equal(ownershipDrift.error.code,'state_version_conflict');
    await pool.query(`UPDATE party_runtime.party_ownership
      SET owner_character_id='pc'
      WHERE party_id='party-fire' AND item_id='fuel-1'`);
    const conflictingStart=await combinedPlan(start,0,{fuelMutation:true});
    const conflictResult=await committer.commit({plan:conflictingStart});
    assert.equal(conflictResult.ok,false);
    assert.deepEqual((await pool.query(`SELECT state_version::int AS version,
      (SELECT count(*)::int FROM
        party_runtime.party_local_world_processes
       WHERE party_id='party-fire') AS processes
      FROM party_runtime.parties WHERE party_id='party-fire'`)).rows[0],
    {version:0,processes:0});
    assert.equal((await committer.commit({plan:startCombined})).ok,true);
    assert.deepEqual(await committer.commit({plan:startCombined}),{
      ok:true,replay:true,change_set_id:'change-start'});
    const processRef=start.transition_proposal.process_after.process_ref;
    const guardClient=await pool.connect();
    try {
      await guardClient.query('BEGIN');
      await assert.rejects(assertLocalFireFuelMutationBound(guardClient,{
        party_id:'party-fire',inserts:[],updates:[
          {target_table:'party_item_placements',id:'fuel-1',
            record:{item_id:'fuel-1'}},
          {target_table:'party_ownership',id:'own:fuel-1',
            record:{item_id:'fuel-1'}}],deletes:[],
        local_fire_atomic_write_plan:null}),
      (error)=>error?.spatialCode==='state_version_conflict');
      await guardClient.query('ROLLBACK');
    } finally { guardClient.release(); }

    const add=await firePlan(pool,{action:'add_fuel',requestId:'add',
      changeSetId:'change-add',partyVersion:1,fuelIds:['fuel-2'],
      processRef,at:clock(11)});
    const addCombined=await combinedPlan(add,1);
    await pool.query(`UPDATE party_runtime.party_items SET state_version=2
      WHERE party_id='party-fire' AND item_id='fuel-2'`);
    const staleAdd=await committer.commit({plan:addCombined});
    assert.equal(staleAdd.ok,false);
    assert.equal((await pool.query(`SELECT state_version::int AS version FROM
      party_runtime.party_local_world_processes WHERE party_id='party-fire'
      AND process_ref=$1`,[processRef])).rows[0].version,1);
    await pool.query(`UPDATE party_runtime.party_items SET state_version=1
      WHERE party_id='party-fire' AND item_id='fuel-2'`);
    assert.equal((await committer.commit({plan:addCombined})).ok,true);

    const dueContext=await loadLocalFireCommittedContext({client:pool,
      partyId:'party-fire',actorRef:'system:local_fire_boundary',
      profilePin:profilePin(),inputItemIds:['fuel-1','fuel-2'],processRef});
    const registration=lowerDvinaTraceLocalFireTemporalRegistration(profile());
    const forgedCandidate=fireCandidate(dueContext,clock(15));
    forgedCandidate.boundary_id=`${forgedCandidate.boundary_id}:forged`;
    forgedCandidate.idempotency_key=forgedCandidate.boundary_id;
    assert.throws(()=>registration.resolve(forgedCandidate,{
      request:{base_state_version:'2',turn_id:'turn-due-forged',
        idempotency_context:{change_set_id:'change-due-forged',
          idempotency_key:'due-forged'}},
      projection:{local_fire_runtime:[dueContext]}}),{
      code:'LOCAL_FIRE_TEMPORAL_CONTEXT_STALE'});
    const dueResolution=registration.resolve(
      fireCandidate(dueContext,clock(15)),{
      request:{base_state_version:'2',turn_id:'turn-due-1',
        idempotency_context:{change_set_id:'change-due-1',
          idempotency_key:'due-1'}},
      projection:{local_fire_runtime:[dueContext]}
    });
    const due=dueResolution.proposals[0].local_fire_atomic_write_plan;
    const temporalResult={canonical_digest:digest(dueResolution),
      combined_change_set:{proposals:dueResolution.proposals}};
    const failing=await combinedPlan(due,2,{missingClock:true,temporalResult});
    const late=await committer.commit({plan:failing});
    assert.equal(late.ok,false);
    let rows=(await pool.query(`SELECT
      (SELECT state_version::int FROM party_runtime.parties
       WHERE party_id='party-fire') AS party_version,
      (SELECT state_version::int FROM party_runtime.party_local_world_processes
       WHERE party_id='party-fire' AND process_ref=$1) AS process_version,
      (SELECT state->>'lifecycle_status' FROM party_runtime.party_items
       WHERE party_id='party-fire' AND item_id='fuel-1') AS fuel_state,
      (SELECT count(*)::int FROM party_runtime.party_local_world_process_fuel_bindings
       WHERE party_id='party-fire' AND released_at_change_set_id IS NOT NULL) AS released`,
    [processRef])).rows[0];
    assert.deepEqual(rows,{party_version:2,process_version:2,
      fuel_state:'active',released:0});

    const dueCombined=await combinedPlan(due,2,{temporalResult});
    assert.equal((await committer.commit({plan:dueCombined})).ok,true);
    assert.deepEqual(await committer.commit({plan:dueCombined}),{
      ok:true,replay:true,change_set_id:'change-due-1'});
    rows=(await pool.query(`SELECT
      (SELECT state_version::int FROM party_runtime.parties
       WHERE party_id='party-fire') AS party_version,
      (SELECT status FROM party_runtime.party_local_world_processes
       WHERE party_id='party-fire' AND process_ref=$1) AS status,
      (SELECT state->>'lifecycle_status' FROM party_runtime.party_items
       WHERE party_id='party-fire' AND item_id='fuel-1') AS first_state,
      (SELECT count(*)::int FROM party_runtime.party_local_world_process_fuel_bindings
       WHERE party_id='party-fire' AND released_at_change_set_id IS NOT NULL) AS released`,[processRef])).rows[0];
    assert.deepEqual(rows,{party_version:3,status:'active',
      first_state:'retired',released:1});

    const afterFirstDue=await loadLocalFireCommittedContext({client:pool,
      partyId:'party-fire',actorRef:'system:local_fire_boundary',
      profilePin:profilePin(),inputItemIds:['fuel-2'],processRef});
    assert.equal(afterFirstDue.process_state.fuel_bindings[0].fuel_ref,'fuel-2');
    assert.deepEqual((await pool.query(`SELECT template_id,
      state->'local_fire_fuel'->>'fuel_class' AS fuel_class
      FROM party_runtime.party_items
      WHERE party_id='party-fire' AND item_id='fuel-3'`)).rows[0],{
      template_id:null,fuel_class:'ordinary_solid_fuel_unit'});
    const productionResolver=createLowerDvinaTraceF1ProductionResolverFactory({
      pool,loadedProfile:{schema:'rus.lower_dvina_trace_f1_loaded_profile.v1',
        profile:profile()}})({
      partyId:'party-fire'});
    const resolvedAdd=await productionResolver({operation:{
      op:'request_world_process',actor_ref:'pc',process_action:'affect',
      process_ref:processRef,process_kind:'fire',source_refs:['fuel-3'],
      target_refs:[],description:'добавить подготовленное топливо'},
    actor:{actor_id:'pc'},plan:{schema:'turn_step_plan_v1'},request:{
      request_id:'request-add-late',root_turn_id:'turn-add-late',step_index:1,
      committed_state_version:'3',player_safe_state:{local_world_process:{
        semantic_grounding_available:true,context_ref:'context-fire',
        scope_ref:'scope-fire',ignition_basis_refs:['ignition'],
        active_process_refs:[processRef],
        process_ignition_basis_refs:{[processRef]:'ignition'}}}},
    working_projection:{},
    committed_state:{party_state:{turn_number:3},clock:clock(16),
      position:{location_ref:'scope-fire'}}});
    assert.equal(resolvedAdd.local_fire_atomic_write_plan
      .transition_proposal.action,'add_fuel');
    assert.deepEqual(resolvedAdd.local_fire_atomic_write_plan
      .transition_proposal.added_fuel_refs,['fuel-3']);
    const appended=await firePlan(pool,{action:'add_fuel',requestId:'add-late',
      changeSetId:'change-add-late',partyVersion:3,fuelIds:['fuel-3'],
      processRef,at:clock(16)});
    const appendedCommit=await committer.commit({
      plan:await combinedPlan(appended,3)});
    assert.equal(appendedCommit.ok,true,JSON.stringify(appendedCommit));
    assert.deepEqual((await pool.query(`SELECT fuel_item_id,binding_ordinal
      FROM party_runtime.party_local_world_process_fuel_bindings
      WHERE party_id='party-fire' AND process_ref=$1
        AND released_at_change_set_id IS NULL ORDER BY binding_ordinal`,
    [processRef])).rows,[{fuel_item_id:'fuel-2',binding_ordinal:1},
      {fuel_item_id:'fuel-3',binding_ordinal:2}]);

    await pool.query(`UPDATE party_runtime.party_player_characters
      SET profile='{"status":"dead"}'::jsonb
      WHERE party_id='party-fire' AND character_id='pc'`);
    const finalDue=await temporalDue(pool,{processRef,
      fuelIds:['fuel-2','fuel-3'],partyVersion:4,requestId:'due-2',
      changeSetId:'change-due-2',at:clock(20)});
    const finalCommit = await committer.commit({
      plan: await combinedPlan(finalDue.local,4,
        {temporalResult:finalDue.temporalResult}) });
    assert.equal(finalCommit.ok, true, JSON.stringify(finalCommit));
    const completion=await temporalDue(pool,{processRef,fuelIds:['fuel-3'],
      partyVersion:5,requestId:'due-3',changeSetId:'change-due-3',at:clock(25)});
    assert.equal((await committer.commit({
      plan:await combinedPlan(completion.local,5,
        {temporalResult:completion.temporalResult})})).ok,true);
    rows=(await pool.query(`SELECT status,next_boundary_at,
      process_state->'fuel_bindings' AS fuels
      FROM party_runtime.party_local_world_processes
      WHERE party_id='party-fire' AND process_ref=$1`,[processRef])).rows[0];
    assert.deepEqual(rows,{status:'completed',next_boundary_at:null,fuels:[]});

    const waterStart=await firePlan(pool,{action:'start',requestId:'water-start',
      changeSetId:'change-water-start',partyVersion:6,fuelIds:['fuel-4'],
      at:clock(30)});
    assert.equal((await committer.commit({
      plan:await combinedPlan(waterStart,6)})).ok,true);
    const waterProcess=waterStart.transition_proposal.process_after.process_ref;
    let semanticCalls=0;
    const waterResolver=createLowerDvinaTraceF1ProductionResolverFactory({pool,
      loadedProfile:{schema:'rus.lower_dvina_trace_f1_loaded_profile.v1',
        profile:profile()},worldProcessStepModel:async(request)=>{
          semanticCalls+=1;
          return {schema:'world_process_step_plan_v1',request_id:request.request_id,
            process_ref:request.process.process_ref,
            process_state_version:request.process_state_version,
            interpretation:{grounded_transition:'whole water portion extinguishes fire'},
            process_outcome:request.subject_state.source_refs[0]==='water-1'
              ?'no_effect':'complete',affected_refs:request.subject_state.source_refs,
            fact_changes:[],reason_code:'water_affects_fire'};
        }})({partyId:'party-fire'});
    const waterResult=await waterResolver({operation:{op:'request_world_process',
      actor_ref:'pc',process_action:'affect',process_ref:waterProcess,
      process_kind:'fire',source_refs:['water-1'],target_refs:[],
      description:'вылить воду на огонь'},actor:{actor_id:'pc'},
    plan:{schema:'turn_step_plan_v1'},request:{request_id:'request-water',
      root_turn_id:'turn-water',step_index:1,committed_state_version:'7',
      player_safe_state:{local_world_process:{semantic_grounding_available:true,
        context_ref:'context-fire',scope_ref:'scope-fire',
        ignition_basis_refs:['ignition'],active_process_refs:[waterProcess],
        process_ignition_basis_refs:{[waterProcess]:'ignition'}}}},
    working_projection:{},committed_state:{party_state:{turn_number:7},
      clock:clock(31),position:{location_ref:'scope-fire'}}});
    assert.equal(semanticCalls,1);
    const waterCombined=await combinedPlan(
      waterResult.local_fire_atomic_write_plan,7);
    assert.equal((await committer.commit({plan:waterCombined})).ok,true);
    assert.deepEqual(await committer.commit({plan:waterCombined}),{
      ok:true,replay:true,change_set_id:'change:party-fire:turn-step:8'});
    rows=(await pool.query(`SELECT
      (SELECT status FROM party_runtime.party_local_world_processes
       WHERE party_id='party-fire' AND process_ref=$1) AS status,
      (SELECT state->>'lifecycle_status' FROM party_runtime.party_items
       WHERE party_id='party-fire' AND item_id='water-1') AS water_state,
      (SELECT released_at_change_set_id FROM
        party_runtime.party_local_world_process_fuel_bindings
       WHERE party_id='party-fire' AND process_ref=$1 AND fuel_item_id='fuel-4')
       AS fuel_release`,[waterProcess])).rows[0];
    assert.deepEqual(rows,{status:'active',water_state:'retired',
      fuel_release:null});

    const completedByWater=await waterResolver({operation:{
      op:'request_world_process',actor_ref:'pc',process_action:'affect',
      process_ref:waterProcess,process_kind:'fire',source_refs:['water-2'],
      target_refs:[],description:'вылить вторую воду на огонь'},
    actor:{actor_id:'pc'},plan:{schema:'turn_step_plan_v1'},request:{
      request_id:'request-water-2',root_turn_id:'turn-water-2',step_index:1,
      committed_state_version:'8',player_safe_state:{local_world_process:{
        semantic_grounding_available:true,context_ref:'context-fire',
        scope_ref:'scope-fire',ignition_basis_refs:['ignition'],
        active_process_refs:[waterProcess],
        process_ignition_basis_refs:{[waterProcess]:'ignition'}}}},
    working_projection:{},committed_state:{party_state:{turn_number:8},
      clock:clock(32),position:{location_ref:'scope-fire'}}});
    assert.equal(semanticCalls,2);
    assert.equal((await committer.commit({plan:await combinedPlan(
      completedByWater.local_fire_atomic_write_plan,8)})).ok,true);
    rows=(await pool.query(`SELECT
      (SELECT status FROM party_runtime.party_local_world_processes
       WHERE party_id='party-fire' AND process_ref=$1) AS status,
      (SELECT state->>'lifecycle_status' FROM party_runtime.party_items
       WHERE party_id='party-fire' AND item_id='water-2') AS water_state,
      (SELECT released_at_change_set_id FROM
        party_runtime.party_local_world_process_fuel_bindings
       WHERE party_id='party-fire' AND process_ref=$1 AND fuel_item_id='fuel-4')
       AS fuel_release`,[waterProcess])).rows[0];
    assert.deepEqual(rows,{status:'completed',water_state:'retired',
      fuel_release:'change:party-fire:turn-step:9'});

    const npcResolver=createLowerDvinaTraceF1ProductionResolverFactory({pool,
      loadedProfile:{schema:'rus.lower_dvina_trace_f1_loaded_profile.v1',
        profile:profile()}})({partyId:'party-fire'});
    const npcOperation={op:'request_world_process',
      actor_ref:'npc-fire',process_action:'start',process_ref:null,
      process_kind:'fire',source_refs:['npc-fuel'],
      target_refs:['npc-ignition'],description:'разжечь огонь'};
    const npcRequest=buildNpcActionDecisionRequest(
      npcWorldProcessRequest(npcOperation,9));
    const npcStepPlan=buildNpcStepPlan(npcWorldProcessPlan(
      npcRequest,npcOperation),npcRequest);
    const npcState={party_state:{turn_number:9},clock:clock(40),
      position:{location_ref:'player-scope'}};
    const npcRegistry=createTurnStepExecutionRegistry({domain:{
      request_world_process:(execution)=>npcResolver({...execution,
        actor:{npc_id:'npc-fire'},committed_state:npcState})},
    operationContract:npcRequest.decision_scope.operation_contract});
    const npcExecution=await executeTurnStepActorStep({plan:npcStepPlan,
      request:npcRequest,workingProjection:{},preparedChainContext:null,
      preparedOrdinaryPlan:null,preparedActionProductionPlans:[],
      registry:npcRegistry,ports:{}});
    const npcPlan=npcExecution.local_fire_atomic_write_plan;
    assert.equal(npcPlan.actor_ref,'npc-fire');
    assert.equal((await committer.commit({
      plan:await combinedPlan(npcPlan,9)})).ok,true);
    assert.equal((await pool.query(`SELECT count(*)::int AS count
      FROM party_runtime.party_local_world_process_fuel_bindings
      WHERE party_id='party-fire' AND fuel_item_id='npc-fuel'
        AND released_at_change_set_id IS NULL`)).rows[0].count,1);
  });

async function firePlan(pool,{action,requestId,changeSetId,partyVersion,
  fuelIds,processRef=null,at,system=false}) {
  const loaded=await loadLocalFireCommittedContext({client:pool,
    partyId:'party-fire',actorRef:system?'system:local_fire_boundary':'pc',
    profilePin:profilePin(),inputItemIds:fuelIds,processRef,
    ignitionBasisRef:action==='start'?'ignition':null});
  return createLocalFireAtomicWritePlan({
    schema:'local_fire_atomic_write_request_v1',party_id:'party-fire',
    base_party_state_version:partyVersion,change_set_id:changeSetId,
    actor_ref:system?'system:local_fire_boundary':'pc',
    profile_pin:loaded.profile_pin,
    ignition_basis_pin:loaded.ignition_basis_pin,
    process_state:loaded.process_state,input_pins:loaded.input_pins,
    action,process_ref:action==='start'
      ?`local-fire:party-fire:turn-${requestId}:1`:processRef,
    at_timestamp:at,cause:action==='due_boundary'
      ?{kind:'temporal_boundary',boundary_id:requestId,
        expected_process_state_version:loaded.process_state.state_version,
        due_at:at}
      :{kind:'actor_step',request_id:requestId,
        root_turn_id:`turn-${requestId}`,step_index:1},
    qualitative_outcome:null});
}

async function combinedPlan(local,partyVersion,{missingClock=false,
  temporalResult=null,fuelMutation=false,expectBuildFailure=false}={}) {
  const cause=local.transition_proposal.cause;
  const due=cause.kind==='temporal_boundary';
  const id=due?cause.boundary_id:cause.request_id;
  const changeSetId=local.change_set_id;
  const payload={schema:'temporal_visible_package.v1',perceived_scene:'Огонь.',
    perceived_changes:[],sensory_details:[],visible_npcs:[],visible_objects:[],
    known_context:[],uncertainties:[],hypotheses:[],
    player_safe_interruption:null,allowed_action_affordances:[]};
  const pins=[{dependency_role:'source_authoring',entity_ref:{
    entity_kind:'world_revision',entity_id:'fire-test'},version_pin:{
    pin_kind:'authoring_version',authoring_version:'1',state_version:null}}];
  const updates=[{target_table:'parties',id:'party-fire',record:{
    party_id:'party-fire',profile_bundle_digest:'profiles'}},
  ...(missingClock?[{target_table:'party_clocks',id:'party-fire',record:{
    party_id:'party-fire',whole_minutes:15,subminute_numerator:0,
    subminute_denominator:1,clock_owner_kind:'party',clock_owner_id:null,
    updated_change_set_id:changeSetId}}]:[]),
  ...(fuelMutation?[{target_table:'party_items',id:'fuel-1',record:{
    party_id:'party-fire',item_id:'fuel-1',state:{lifecycle_status:'retired'}}},
  {target_table:'party_item_placements',id:'fuel-1',record:{
    party_id:'party-fire',item_id:'fuel-1',anchor_id:'scope-foreign',
    container_id:null,holder_npc_id:null,holder_character_id:null,
    physical_position:null,equipment_slot_category_id:null,
    attached_item_id:null}},
  {target_table:'party_ownership',id:'own:fuel-1',record:{
    party_id:'party-fire',ownership_id:'own:fuel-1',item_id:'fuel-1',
    owner_npc_id:null,owner_character_id:'foreign',owner_party:false,
    owner_external_ref:null,controller_npc_id:null,
    controller_character_id:'foreign',claim_state:'owned'}}]:[])];
  const expected=[{target_table:'parties',id:'party-fire',
    state_version:partyVersion},...(missingClock?[{target_table:'party_clocks',
      id:'party-fire',state_version:1}]:[])];
  let input={plan_id:`plan-${id}`,
    party_id:'party-fire',write_plan_kind:'semantic_commit',
    operation_kind:'local_fire_command',canonical_input_digest:digest({id}),
    expected_state_versions:expected,validation_report:{status:'pass',
      digest:`sha256:${hex}`},
    change_set:{id:changeSetId},visible_package_envelope:{
      package_id:`visible-${id}`,party_id:'party-fire',
      turn_id:due?`turn-${id}`:cause.root_turn_id,
      committed_state_version:String(partyVersion+1),change_set_id:changeSetId,
      package_digest:digest(payload),visible_payload:payload,
      presentation_status:'pending',projection_policy_ref:{entity_ref:{
        entity_kind:'visibility_modifier',entity_id:'projection-v1'},
      authoring_version:'1'},dependency_pins:{pins,
        canonical_digest:digest(pins).replace('sha256:','')},
      idempotency_record_id:`idem-${id}`},approved_write_sets:[{inserts:[],
      updates,appends:[{target_table:'party_v3_change_sets',id:changeSetId,
        record:{id:changeSetId,party_id:'party-fire',
          operation_kind:'local_fire_command',idempotency_record_id:`idem-${id}`}}]}],
    lock_context:{owner_keys:due?[]:[`actor:${local.actor_ref}`],execution_keys:[],g4_keys:[],
      physical_keys:[`party_runtime.party_v3_change_sets:${changeSetId}`,
        'party_runtime.parties:party-fire',
        ...(missingClock?['party_runtime.party_clocks:party-fire']:[]),
        ...(fuelMutation?['party_runtime.party_items:fuel-1',
          'party_runtime.party_item_placements:fuel-1',
          'party_runtime.party_ownership:own:fuel-1']:[]),
        ...(temporalResult===null?localFirePhysicalKeys(local):[])]},
    ...(temporalResult===null?{local_fire_atomic_write_plan:local}:{}),
    idempotency:idempotency(local,id,due),
    commit_rechecks:['physical','state','pin','endpoint','route','capacity',
      'time','change_set'].map((kind)=>({kind,digest:`sha256:${hex}`}))
  };
  if (temporalResult!==null) {
    const integrated=integrateSpatialV3TemporalWriteFragments({
      base_write_plan_input:input,temporal_result:temporalResult});
    assert.equal(integrated.ok,true,JSON.stringify(integrated.error));
    input=integrated.input;
  }
  const built=await buildCombinedWritePlan(input,
    {verifyApproval:async()=>({ok:true})});
  if (expectBuildFailure) return built;
  assert.equal(built.ok,true,JSON.stringify(built.error));
  return built.plan;
}

async function temporalDue(pool,{processRef,fuelIds,partyVersion,requestId,
  changeSetId,at}) {
  const loaded=await loadLocalFireCommittedContext({client:pool,
    partyId:'party-fire',actorRef:'system:local_fire_boundary',
    profilePin:profilePin(),inputItemIds:fuelIds,processRef});
  const registration=lowerDvinaTraceLocalFireTemporalRegistration(profile());
  const candidate=fireCandidate(loaded,at);
  const resolution=registration.resolve(candidate,{
    request:{base_state_version:String(partyVersion),
      turn_id:`turn-${requestId}`,idempotency_context:{change_set_id:changeSetId,
        idempotency_key:candidate.boundary_id}},
    projection:{local_fire_runtime:[loaded]}});
  return {local:resolution.proposals[0].local_fire_atomic_write_plan,
    temporalResult:{canonical_digest:digest(resolution),
      combined_change_set:{proposals:resolution.proposals}}};
}

function fireCandidate(loaded,scheduledAt) {
  const process=loaded.process_state;
  const boundaryId=`local-fire:${process.process_ref}:state:${
    process.state_version}`;
  const subjects=process.fuel_bindings.map(({fuel_ref:ref})=>({
    entity_kind:'item',entity_id:ref}));
  const policy={entity_ref:{entity_kind:'world_process_policy',
    entity_id:loaded.profile_pin.context_ref},authoring_version:'1'};
  return {boundary_id:boundaryId,boundary_kind:'world_process',
    scheduled_at:scheduledAt,source_ref:{entity_kind:'local_world_process',
      entity_id:process.process_ref},primary_subject_ref:{...subjects[0]},
    scope_ref:{entity_kind:'party',entity_id:loaded.party_id},rule_ref:{
      entity_ref:{entity_kind:'world_process_rule',
        entity_id:'local_exact_fire_due_v1'},authoring_version:'1'},
    policy_ref:structuredClone(policy),preconditions_digest:digest({process_state:process,
      expected_state_version:process.state_version}),
    resolution_class:'local_exact_fire_due',interrupt_effect:'background',
    visibility_policy_ref:structuredClone(policy),idempotency_key:boundaryId,
    subject_refs:structuredClone(subjects),causal_parent_refs:[]};
}

function combinedCommitter(pool) {
  return createSpatialV3CombinedAtomicCommitter({
    now:()=>new Date('2030-01-01T00:00:00Z'),recheck:async()=>({ok:true}),
    withTransaction:async(work)=>{const client=await pool.connect();try{
      await client.query('BEGIN');const result=await work(client);
      await client.query('COMMIT');return result;}catch(error){
      await client.query('ROLLBACK').catch(()=>{});throw error;
    }finally{client.release();}}});
}

async function provision(pool) {
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,
     materializer_version,rng_version,command_catalog_digest,
     profile_bundle_digest,state_version)
    VALUES ('party-fire',2,'world','catalog','materializer','rng','commands',
      'profiles',0)`);
  await pool.query(`INSERT INTO party_runtime.party_materialization_runs
    (party_id,run_id,g4_id,run_kind,seed_digest,input_digest,catalog_digest,
     materializer_version,rng_version,result_digest,idempotency_key,status)
    VALUES ('party-fire','run-fire','g4','baseline','s','i','c','m','r','z','k',
      'committed')`);
  await pool.query(`INSERT INTO party_runtime.party_player_characters
    (party_id,character_id,profile) VALUES
      ('party-fire','pc','{}'),('party-fire','foreign','{}')`);
  await pool.query(`INSERT INTO party_runtime.party_npcs
    (party_id,npc_id,run_id,profile_set_id,profile_level)
    VALUES ('party-fire','npc-fire','run-fire','profile:npc-fire','background')`);
  for (const [id,kind,mass] of [['ignition','ignition',180],
    ['fuel-1','fuel',300],['fuel-2','fuel',700],
    ['fuel-4','fuel',500]]) {
    const state={lifecycle_status:'active',property_state:{kind},
      ...(kind==='fuel'?{local_fire_fuel:{
        schema:'rus.items.local_fire_fuel.v1',
        fuel_class:'ordinary_solid_fuel_unit',whole_unit:true,mechanics:{
          mass_grams:mass,external_hand_cost:0,carry_form:'compact',
          packing_slot_cost:1,quantity:1,container:null}}}:{
        local_fire_ignition_basis:{
          schema:'rus.items.local_fire_ignition_basis.v1',
          ignition_kind:'authored_manual',mechanics:{mass_grams:mass}}})};
    await pool.query(`INSERT INTO party_runtime.party_items
      (party_id,item_id,run_id,template_id,profile_id,category_id,quantity,
       condition_state,legal_status,state,state_version)
      VALUES ('party-fire',$1,'run-fire',$2,$3,$4,1,'serviceable','owned',
        $5::jsonb,1)`,[id,`template:${id}`,`profile:${id}`,kind,JSON.stringify(state)]);
    await pool.query(`INSERT INTO party_runtime.party_item_placements
      (party_id,item_id,holder_character_id,physical_position)
      VALUES ('party-fire',$1,'pc','hands')`,[id]);
    await pool.query(`INSERT INTO party_runtime.party_ownership
      (party_id,ownership_id,item_id,owner_character_id,owner_party,
       controller_character_id,claim_state)
      VALUES ('party-fire',$1,$2,'pc',false,'pc','owned')`,[`own:${id}`,id]);
  }
  await insertA1Fuel(pool);
  const waterState={lifecycle_status:'active',ordinary_metadata:{
    semantic_type:'water_portion',semantic_category:'ordinary_mundane'},
    runtime_instance_mechanics_snapshot:{
      schema:'rus.items.runtime_instance_mechanics_snapshot.v2',version:2,
      provenance:{source_kind:'ordinary_world_materialization',
        causal_ref:'cause:water',request_id:'request:water',
        candidate_key:'candidate:water',coverage_key:'coverage:water',
        context_version:'1',policy_ref:'policy:water',source_refs:['river']},
      mechanics:{mass_grams:700,external_hand_cost:1,carry_form:'compact',
        packing_slot_cost:1,quantity:{value:1,unit:'item'},container:null}}};
  await pool.query(`INSERT INTO party_runtime.party_items
    (party_id,item_id,run_id,template_id,profile_id,category_id,quantity,
     condition_state,legal_status,state,state_version)
    VALUES ('party-fire','water-1',NULL,NULL,NULL,NULL,1,
      'ordinary_runtime_instance','ordinary',$1::jsonb,1),
      ('party-fire','water-2',NULL,NULL,NULL,NULL,1,
      'ordinary_runtime_instance','ordinary',$1::jsonb,1)`,
  [JSON.stringify(waterState)]);
  await pool.query(`INSERT INTO party_runtime.party_item_placements
    (party_id,item_id,holder_character_id,physical_position)
    VALUES ('party-fire','water-1','pc','hands'),
      ('party-fire','water-2','pc','hands')`);
  await pool.query(`INSERT INTO party_runtime.party_ownership
    (party_id,ownership_id,item_id,owner_character_id,owner_party,
     controller_character_id,claim_state)
    VALUES ('party-fire','own:water-1','water-1','pc',false,'pc','owned'),
      ('party-fire','own:water-2','water-2','pc',false,'pc','owned')`);
  for (const [id,kind,mass] of [['npc-ignition','ignition',180],
    ['npc-fuel','fuel',350]]) {
    const state={lifecycle_status:'active',...(kind==='fuel'?{local_fire_fuel:{
      schema:'rus.items.local_fire_fuel.v1',
      fuel_class:'ordinary_solid_fuel_unit',whole_unit:true,
      mechanics:{mass_grams:mass}}}:{local_fire_ignition_basis:{
      schema:'rus.items.local_fire_ignition_basis.v1'}})};
    await pool.query(`INSERT INTO party_runtime.party_items
      (party_id,item_id,run_id,template_id,profile_id,category_id,quantity,
       condition_state,legal_status,state,state_version)
      VALUES ('party-fire',$1,'run-fire',$2,$3,$4,1,'serviceable','owned',
        $5::jsonb,1)`,[id,`template:${id}`,`profile:${id}`,kind,
      JSON.stringify(state)]);
    await pool.query(`INSERT INTO party_runtime.party_item_placements
      (party_id,item_id,holder_npc_id,physical_position)
      VALUES ('party-fire',$1,'npc-fire','hands')`,[id]);
    await pool.query(`INSERT INTO party_runtime.party_ownership
      (party_id,ownership_id,item_id,owner_npc_id,owner_party,
       controller_npc_id,claim_state)
      VALUES ('party-fire',$1,$2,'npc-fire',false,'npc-fire','owned')`,
    [`own:${id}`,id]);
  }
}

async function insertA1Fuel(pool){
  const ownership={ownership_id:'own:fuel-2',owner_npc_id:null,
    owner_character_id:'pc',owner_party:false,controller_npc_id:null,
    controller_character_id:'pc',claim_state:'owned'};
  const sourcePins=[{item_id:'fuel-2',item:{item_id:'fuel-2',
    condition_state:'serviceable',state:{lifecycle_status:'active',
      local_fire_fuel:{schema:'rus.items.local_fire_fuel.v1',
        fuel_class:'ordinary_solid_fuel_unit',whole_unit:true,
        mechanics:{mass_grams:700}}}},ownership,entity_snapshot:{
      controller_ref:'pc',ownership_snapshot:ownership}}];
  const mechanics={schema:'rus.items.runtime_instance_mechanics_snapshot.v1',
    version:1,provenance:{source_kind:'ordinary_direct_action_result',
      root_turn_id:'turn-a1-fuel',step_index:1,operation_ref:'action-a1-fuel',
      origin_kind:'direct_partition',source_refs:['fuel-2']},mechanics:{
      mass_grams:400,external_hand_cost:0,carry_form:'compact',
      packing_slot_cost:1,quantity:{value:1,unit:'item'},container:null}};
  const produced=deriveActionProducedResultItem({entity_ref:'fuel-3',
    source_ref:'fuel-2',holder_ref:null,controller_ref:'pc',
    mechanics_snapshot:mechanics,physical_facts:['отделённая сухая часть'],
    inscription_text:null,output_authority:{
      schema:'rus.items.action_produced_output_authority.v1',
      mode:'new_non_authoritative',canonical_identity_status:'absent',
      currency_status:'not_currency',legal_tender_status:'not_legal_tender',
      official_status:'not_official',objective_truth_status:'not_projected',
      knowledge_status:'not_projected'},material_allocations:[{
      source_ref:'fuel-2',quantity:{numerator:4,denominator:7,
        unit:'whole_item'}}]},sourcePins,{causal_identity:{
      action_ref:'action-a1-fuel'},result_class:'partial_transformation',
      qualitative_result:{output_class:'ordinary_mundane',result_descriptor:{
        display_name:'отделённая сухая растопка',physical_description:null,
        physical_form:'compact'}}},'change-a1-fuel',{schema:
      'action_production_output_destination_pin_v1',destination_kind:
      'party_current_anchor',anchor_id:'scope-fire',item_capacity:20,
      used_item_ids:[]},'pc');
  await pool.query(`INSERT INTO party_runtime.party_items
    (party_id,item_id,run_id,template_id,profile_id,category_id,quantity,
     condition_state,legal_status,state,state_version)
    VALUES ('party-fire',$1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,[
    produced.item_id,produced.item_row.run_id,produced.item_row.template_id,
    produced.item_row.profile_id,produced.item_row.category_id,
    produced.item_row.quantity,produced.item_row.condition_state,
    produced.item_row.legal_status,JSON.stringify(produced.item_row.state),
    produced.item_row.state_version]);
  await pool.query(`INSERT INTO party_runtime.party_item_placements
    (party_id,item_id,holder_character_id,physical_position)
    VALUES ('party-fire',$1,'pc','hands')`,[produced.item_id]);
  await pool.query(`INSERT INTO party_runtime.party_ownership
    (party_id,ownership_id,item_id,owner_character_id,owner_party,
     controller_character_id,claim_state)
    VALUES ('party-fire',$1,$2,$3,$4,$5,$6)`,[
    produced.ownership_row.ownership_id,produced.item_id,
    produced.ownership_row.owner_character_id,produced.ownership_row.owner_party,
    produced.ownership_row.controller_character_id,
    produced.ownership_row.claim_state]);
}

function profile() {
  return { schema:'rus.lower_dvina_trace_local_fire_profile.v1',
    profile_id:'profile-fire',revision:1,status:'approved',
    context_ref:'context-fire',policy_ref:'policy-fire',policy_version:1,
    recheck_interval:{exact_minutes:{numerator:'5',denominator:'1'}},
    fuel_unit_mass_grams_min:100,fuel_unit_mass_grams_max:1000 };
}

function profilePin() {
  const value=profile();
  return {profile_ref:value.profile_id,profile_version:value.revision,
    context_ref:value.context_ref,scope_ref:'scope-fire',
    ignition_basis_ref:'ignition',policy:{schema:'local_fire_policy_v1',
      policy_ref:value.policy_ref,version:value.policy_version,
      recheck_interval:value.recheck_interval,
      fuel_unit_mass_grams_min:value.fuel_unit_mass_grams_min,
      fuel_unit_mass_grams_max:value.fuel_unit_mass_grams_max}};
}

function npcWorldProcessRequest(operation,partyVersion){
  return{schema:'npc_action_decision_request_v1',request_id:'request-npc-fire',
    root_turn_id:'turn-npc-fire',boundary_id:'boundary-npc-fire',
    committed_state_version:partyVersion,working_revision:0,decision_index:1,
    occurred_at:clock(40),npc_ref:'npc-fire',decision_reasons:{
      significance:'material',categories:['environment','objective'],
      signal_refs:[{entity_kind:'npc_decision_signal',entity_id:'signal-fire'}],
      perceived_changes:['NPC располагает топливом и кресалом.']},
    historical_context:{year:1230,season:'summer',region:'Нижняя Двина',
      applicable_norms:[],known_local_customs:[]},npc:{profile_level:'scene',
      identity:{name_or_label:'NPC',age_range:'adult',origin:null},
      social_role:{role_ref:null,status:null,authority:[],dependencies:[]},
      attributes:[],skills:[],body_state:{summary:null,conditions:[]},mood:null,
      temperament:[],values:[],goals:[],fears:[],obligations:[],relationships:[],
      current_activity:{activity_ref:null,summary:null,status:'idle',
        can_continue_automatically:false},available_resources:[
        {item_ref:'npc-fuel'},{item_ref:'npc-ignition'}]},perception:{
      visible_scene:[],perceived_changes:[],heard:[],felt:[],present_actors:[],
      visible_objects:[{item_ref:'npc-fuel'},{item_ref:'npc-ignition'}],
      known_routes_and_exits:[],uncertainties:[]},knowledge:{known_facts:[],
      beliefs:[],hypotheses:[]},memory:{recent_events:[],
      relevant_long_term_events:[],previous_decisions:[]},decision_scope:{
      mode:'autonomous_action',allowed_attribute_refs:[],allowed_skill_refs:[],
      operation_contract:{request_world_process:{
        owner:'@rus/world-processes',context_ref:'context-fire',
        scope_ref:'scope-fire',ignition_basis_refs:['npc-ignition'],
        active_process_refs:[],process_ignition_basis_refs:{},allowed:[{
          process_action:operation.process_action,
          process_ref:operation.process_ref,process_kind:operation.process_kind,
          source_refs:operation.source_refs,target_refs:operation.target_refs}]}}}};
}
function npcWorldProcessPlan(request,operation){return{
  schema:'npc_step_plan_v1',request_id:request.request_id,
  root_turn_id:request.root_turn_id,boundary_id:request.boundary_id,
  committed_state_version:request.committed_state_version,
  working_revision:request.working_revision,decision_index:request.decision_index,
  npc_ref:request.npc_ref,interpretation:{npc_goal:'разжечь огонь',
    grounded_attempt:'использовать топливо и кресало',adaptation:'literal'},
  resolution:'domain_request',goal_result:'pending',activity:{owner:'domain',
    duration_class:null,effort:null},operations:[operation],check:null,
  reason_code:'local_fire_needed',reason:'Доступны топливо и кресало.'};}

function semanticSnapshot(local) {
  const proposal=local.transition_proposal;
  return {semantic_trace:{step_traces:[{step_index:proposal.cause.step_index,
    approved_plan:{operations:[{op:'request_world_process',
      actor_ref:local.actor_ref,process_action:proposal.action==='start'
        ?'start':'affect',process_ref:proposal.action==='start'?null
          :proposal.process_before.process_ref,process_kind:'fire',
      source_refs:proposal.action==='affect'?[proposal.consumed_item_ref]
        :proposal.added_fuel_refs,
      target_refs:proposal.action==='start'
        ?[local.profile_pin.ignition_basis_ref]:[]}]}}]}};
}

function idempotency(local,id,due) {
  if (due) return {id:`idem-${id}`,key:id,request_id:null,
    semantic_command_snapshot:null,semantic_command_digest:null,
    semantic_dependency_pins:null};
  const snapshot=semanticSnapshot(local);
  return {id:`idem-${id}`,key:id,request_id:local.transition_proposal.cause.request_id,
    semantic_command_snapshot:snapshot,semantic_command_digest:digest(snapshot),
    semantic_dependency_pins:{}};
}
