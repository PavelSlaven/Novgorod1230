import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { Pool } from 'pg';
import { computeSpatialV3CanonicalDigest as digest } from
  '@rus/contracts/spatial-v3/registry';
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
    for (const sql of SPATIAL_V3_TARGET_MIGRATIONS.slice(-1)) {
      await pool.query(sql);
    }
    await provision(pool);
    const committer=combinedCommitter(pool);

    await pool.query(`UPDATE party_runtime.party_ownership
      SET owner_character_id='foreign'
      WHERE party_id='party-fire' AND item_id='fuel-1'`);
    await assert.rejects(firePlan(pool,{action:'start',requestId:'foreign',
      changeSetId:'change-foreign',partyVersion:0,fuelIds:['fuel-1'],
      at:clock(10)}),{code:'LOCAL_FIRE_FUEL_ACCESS_DENIED'});
    await pool.query(`UPDATE party_runtime.party_ownership
      SET owner_character_id='pc'
      WHERE party_id='party-fire' AND item_id='fuel-1'`);
    await pool.query(`UPDATE party_runtime.party_item_placements
      SET holder_character_id='foreign',physical_position='hands',
        anchor_id=NULL
      WHERE party_id='party-fire' AND item_id='fuel-1'`);
    await assert.rejects(firePlan(pool,{action:'start',requestId:'remote',
      changeSetId:'change-remote',partyVersion:0,fuelIds:['fuel-1'],
      at:clock(10)}),{code:'LOCAL_FIRE_FUEL_ACCESS_DENIED'});
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
    assert.equal(ignitionPlacementDrift.ok,false);
    assert.equal(ignitionPlacementDrift.error.code,'state_version_conflict');
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
      contextRef:'context-fire',fuelItemIds:['fuel-1','fuel-2'],processRef,
      requireActorAccess:false});
    const registration=lowerDvinaTraceLocalFireTemporalRegistration({
      schema:'rus.lower_dvina_trace_local_fire_profile.v1',revision:1,
      status:'approved',policy_ref:'policy-fire',policy_version:1});
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
    const manualDue=await combinedPlan(due,2,{expectBuildFailure:true});
    assert.equal(manualDue.ok,false);
    assert.equal(manualDue.error.code,'generated_schema_mismatch');
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
      (SELECT count(*)::int FROM party_runtime.party_local_world_process_commits
       WHERE party_id='party-fire' AND request_id='due-1') AS commits`,
    [processRef])).rows[0];
    assert.deepEqual(rows,{party_version:2,process_version:2,
      fuel_state:'active',commits:0});

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
      (SELECT count(*)::int FROM party_runtime.party_local_world_process_commits
       WHERE party_id='party-fire') AS commits`,[processRef])).rows[0];
    assert.deepEqual(rows,{party_version:3,status:'active',
      first_state:'retired',commits:3});

    const afterFirstDue=await loadLocalFireCommittedContext({client:pool,
      partyId:'party-fire',actorRef:'system:local_fire_boundary',
      contextRef:'context-fire',fuelItemIds:['fuel-2'],processRef,
      requireActorAccess:false});
    assert.equal(afterFirstDue.process_state.fuel_bindings[0].fuel_ref,'fuel-2');
    const productionResolver=createLowerDvinaTraceF1ProductionResolverFactory({
      pool,loadedProfile:{schema:'rus.lower_dvina_trace_f1_loaded_profile.v1',
        profile:{schema:'rus.lower_dvina_trace_local_fire_profile.v1',
          status:'approved',profile_id:'profile-fire',revision:1,
          context_ref:'context-fire',policy_ref:'policy-fire',policy_version:1}}})({
      partyId:'party-fire'});
    const resolvedAdd=await productionResolver({operation:{
      op:'request_world_process',actor_ref:'pc',process_action:'affect',
      process_ref:processRef,process_kind:'fire',source_refs:['fuel-3'],
      target_refs:[],description:'добавить подготовленное топливо'},
    actor:{actor_id:'pc'},plan:{schema:'turn_step_plan_v1'},request:{
      request_id:'request-add-late',root_turn_id:'turn-add-late',step_index:1,
      committed_state_version:'3',player_safe_state:{local_world_process:{
        semantic_grounding_available:true,context_ref:'context-fire',
        ignition_basis_ref:'ignition',approved_fuel_refs:['fuel-3'],
        active_process_refs:[processRef]}}},working_projection:{},
    committed_state:{party_state:{turn_number:3},clock:clock(16)}});
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
  });

async function firePlan(pool,{action,requestId,changeSetId,partyVersion,
  fuelIds,processRef=null,at,system=false}) {
  const loaded=await loadLocalFireCommittedContext({client:pool,
    partyId:'party-fire',actorRef:system?'system:local_fire_boundary':'pc',
    contextRef:'context-fire',fuelItemIds:fuelIds,processRef,
    requireActorAccess:!system});
  return createLocalFireAtomicWritePlan({
    schema:'local_fire_atomic_write_request_v1',party_id:'party-fire',
    base_party_state_version:partyVersion,change_set_id:changeSetId,
    actor_ref:system?'system:local_fire_boundary':'pc',
    authority_pin:loaded.authority_pin,
    ignition_basis_pin:loaded.ignition_basis_pin,
    process_state:loaded.process_state,fuel_pins:loaded.fuel_pins,
    action,at_timestamp:at,causal_identity:{request_id:requestId,
      root_turn_id:`turn-${requestId}`,
      action_ref:action==='due_boundary'
        ?`local-fire-boundary:${requestId}`:`local-fire-command:${requestId}`,
      step_index:1}});
}

async function combinedPlan(local,partyVersion,{missingClock=false,
  temporalResult=null,fuelMutation=false,expectBuildFailure=false}={}) {
  const id=local.transition_proposal.causal_identity.request_id;
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
      digest:`sha256:${hex}`},idempotency:{id:`idem-${id}`,key:id},
    change_set:{id:changeSetId},visible_package_envelope:{
      package_id:`visible-${id}`,party_id:'party-fire',
      turn_id:local.transition_proposal.causal_identity.root_turn_id,
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
    lock_context:{owner_keys:[`actor:${local.actor_ref}`],execution_keys:[],g4_keys:[],
      physical_keys:[`party_runtime.party_v3_change_sets:${changeSetId}`,
        'party_runtime.parties:party-fire',
        ...(missingClock?['party_runtime.party_clocks:party-fire']:[]),
        ...(fuelMutation?['party_runtime.party_items:fuel-1',
          'party_runtime.party_item_placements:fuel-1',
          'party_runtime.party_ownership:own:fuel-1']:[]),
        ...(temporalResult===null?localFirePhysicalKeys(local):[])]},
    ...(temporalResult===null?{local_fire_atomic_write_plan:local}:{}),
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
    contextRef:'context-fire',fuelItemIds:fuelIds,processRef,
    requireActorAccess:false});
  const registration=lowerDvinaTraceLocalFireTemporalRegistration({
    schema:'rus.lower_dvina_trace_local_fire_profile.v1',revision:1,
    status:'approved',policy_ref:'policy-fire',policy_version:1});
  const resolution=registration.resolve(fireCandidate(loaded,at),{
    request:{base_state_version:String(partyVersion),
      turn_id:`turn-${requestId}`,idempotency_context:{change_set_id:changeSetId,
        idempotency_key:requestId}},
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
    entity_id:loaded.authority_pin.persisted_row.policy_ref},
  authoring_version:String(loaded.authority_pin.persisted_row.policy_version)};
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
  for (const [id,kind,mass] of [['ignition','ignition',180],
    ['fuel-1','fuel',300],['fuel-2','fuel',700],['fuel-3','fuel',400]]) {
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
  const row={party_id:'party-fire',context_ref:'context-fire',
    profile_ref:'profile-fire',profile_version:'1',policy_ref:'policy-fire',
    policy_version:1,scope_ref:'scope-fire',
    ignition_basis_item_id:'ignition',
    approved_fuel_item_ids:['fuel-1','fuel-2','fuel-3'],
    recheck_interval:{exact_minutes:{numerator:'5',denominator:'1'}},
    fuel_unit_mass_grams_min:100,fuel_unit_mass_grams_max:1000,
    authority_state_version:1,status:'committed'};
  await pool.query(`INSERT INTO party_runtime.party_local_fire_authorities
    (party_id,context_ref,profile_ref,profile_version,policy_ref,policy_version,
     scope_ref,ignition_basis_item_id,approved_fuel_item_ids,recheck_interval,
     fuel_unit_mass_grams_min,fuel_unit_mass_grams_max,authority_state_version,
     authority_digest,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,
      $10::jsonb,$11,$12,$13,$14,$15)`,[...Object.values(row).slice(0,8),
      JSON.stringify(row.approved_fuel_item_ids),JSON.stringify(row.recheck_interval),
      row.fuel_unit_mass_grams_min,row.fuel_unit_mass_grams_max,
      row.authority_state_version,digest(row),row.status]);
}
