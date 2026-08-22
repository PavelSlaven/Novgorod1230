import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { Pool } from 'pg';
import { computeSpatialV3CanonicalDigest as digest } from
  '@rus/contracts/spatial-v3/registry';
import { canonicalDigest,createOrdinaryAggregate } from '@rus/materialization';
import { createTemporalAdvanceOwner, npcTemporalEffectRegistrations } from
  '@rus/turn/temporal-advance';
import { buildCombinedWritePlan } from
  '../../packages/turn/src/spatial-v3-write-plan.js';
import { buildTurnStepDraftConsequence } from
  '../../packages/turn/src/turn-step-workflow-draft.js';
import { integrateSpatialV3TemporalWriteFragments } from
  '../../packages/turn/src/spatial-v3-temporal-write-integration.js';
import { createSpatialV3CombinedAtomicCommitter } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { SPATIAL_V3_TARGET_MIGRATIONS } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';
import { createLocalFireAtomicWritePlan, localFirePhysicalKeys } from
  '../../apps/game-server/src/infrastructure/postgres/local-fire-atomic-write-plan.js';
import { actionProducedPhysicalKeys,createActionProducedAtomicWritePlan } from
  '../../apps/game-server/src/infrastructure/postgres/action-produced-atomic-write-plan.js';
import { actionProducedTraceActionRef } from
  '../../apps/game-server/src/infrastructure/postgres/action-produced-causal-binding.js';
import { createActionProducedOutputIdentity,
  resolveActionProducedAllocationMechanics } from
  '@rus/items-property/action-produced-transition';
import { loadLocalFireCommittedContext } from
  '../../apps/game-server/src/infrastructure/postgres/local-fire-persistence.js';
import { loadTracePhase2TemporalSourceProof } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2-temporal-state.js';
import { assertLocalFireFuelMutationBound } from
  '../../apps/game-server/src/infrastructure/postgres/local-fire-p16-extension.js';
import { applyLocalFireTemporalProjection,
  localFireTemporalCandidateFromRuntime,
  lowerDvinaTraceLocalFireTemporalRegistration } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-local-fire-temporal.js';
import { createTracePhase2TemporalAdvance } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-phase-2-temporal.js';
import { lowerDvinaTraceTemporalSourceRegistrations } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-phase-6-temporal-source.js';
import { lowerDvinaTracePhase6TemporalEffectRegistrations } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-phase-6-temporal-effect-owner.js';
import { createLowerDvinaTraceF1ProductionResolverFactory,
  projectLowerDvinaTraceF1NpcCapability } from
  '../../apps/game-server/src/runtime/releases/lower-dvina-trace-f1-production.js';
import { createLowerDvinaTraceTurnStepVisibleProjector } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-turn-step-generic-owners.js';
import { phase2VisibleContextFromPayload } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2-projection.js';
import { lowerDvinaTracePhase7TemporalEffectRegistrations } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-phase-7-temporal-effect-owner.js';
import { approvedPhase7Contracts, phase7AutonomousPlan } from
  '../../apps/game-server/test/lower-dvina-trace-phase-7-contract-fixture.js';
import { phase7Command, phase7CommittedState, phase7PlayerInput } from
  '../../apps/game-server/test/lower-dvina-trace-phase-7-runtime-fixture.js';
import { deriveActionProducedResultItem } from
  '../../apps/game-server/src/infrastructure/postgres/action-produced-result-item.js';
import { createOrdinaryContainerContentsAtomicWritePlan } from
  '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-container-batch-plan.js';
import { ordinaryPhysicalKeys } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-ordinary-p16.js';
import { batchInput } from
  '../../apps/game-server/test/ordinary-materialization-container-batch-plan.test.js';

const docker = (args) => spawnSync('docker', args,
  { encoding: 'utf8', timeout: 60_000 });
const container = `local-fire-${process.pid}`;
const hex = 'd'.repeat(64);
const clock = (n) => ({ whole_minutes: String(n),
  subminute_numerator: '0', subminute_denominator: '1' });
const fireConsequence = (step,action,outcome,status) => ({visible_seed:{
  [`turn_step_world_process_${step}`]:{schema:
    'rus.lower_dvina_trace_turn_step_world_process_visible_result.v1',
  process_kind:'fire',action,outcome,status}}});
const visibleProjector=createLowerDvinaTraceTurnStepVisibleProjector({
  fallback:{project(){throw new Error('unexpected visible fallback');}}
});
const fireVisibleContext=async(...fragments)=>visibleProjector.project({
  retrieved_state:{current_visible_context:{version:1,
    schema:'visible_context_package',visible_scene:'Берег у костра.',
    visible_changes:[],sensory_details:['Шумит вода.'],visible_npc:[],
    visible_objects:[],known_context:['берег'],uncertainties:[],
    allowed_tensions:[],do_not_imply:['hidden_fact']}},
  consequence:buildTurnStepDraftConsequence({loop_result:{status:'resolved',
    completed_steps:[],clarification:null,consequence_fragments:fragments}}),
  body_update:{state_after:{}}
});
const persistedVisible=(context)=>({...context,do_not_imply:[]});
const keepWorkingProjection = ({ working_projection: value }) => value;
const objectiveProcess = (state) => ({ process_ref: state.process_ref,
  scope_ref: state.scope_ref, causal_basis_ref: state.causal_basis_ref,
  status: state.status, started_at: state.started_at,
  next_boundary_at: state.next_boundary_at,
  fuel_bindings: state.fuel_bindings });

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
    const physicallyReachable=await firePlan(pool,{action:'start',requestId:'foreign',
      changeSetId:'change-foreign',partyVersion:0,fuelIds:['fuel-1'],
      at:clock(10)});
    assert.equal(physicallyReachable.input_pins[0].ownership.owner_character_id,
      'foreign');
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
    assert.deepEqual((await pool.query(`SELECT p.anchor_id,p.container_id,
      p.holder_character_id,p.physical_position,o.owner_character_id
      FROM party_runtime.party_item_placements p
      JOIN party_runtime.party_ownership o USING (party_id,item_id)
      WHERE p.party_id='party-fire' AND p.item_id='fuel-1'`)).rows[0],{
      anchor_id:'scope-fire',container_id:null,holder_character_id:null,
      physical_position:null,owner_character_id:'pc'});
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
        local_fire_atomic_write_plans:null}),
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
    assert.deepEqual((await pool.query(`SELECT anchor_id,container_id,
      holder_character_id,physical_position FROM
      party_runtime.party_item_placements WHERE party_id='party-fire'
      AND item_id='fuel-2'`)).rows[0],{anchor_id:'scope-fire',
      container_id:null,holder_character_id:null,physical_position:null});

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
    const due=dueResolution.proposals[0].local_fire_atomic_write_plans[0];
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
      partyId:'party-fire',applyWorkingProjection:keepWorkingProjection});
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
    assert.equal(resolvedAdd.local_fire_atomic_write_plans[0]
      .transition_proposal.action,'add_fuel');
    assert.deepEqual(resolvedAdd.local_fire_atomic_write_plans[0]
      .transition_proposal.added_fuel_refs,['fuel-3']);
    assert.deepEqual(resolvedAdd.consequence_fragment,
      fireConsequence(1,'add_fuel','fuel_added','active'));
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
    const semanticQuantities=[];
    const waterResolver=createLowerDvinaTraceF1ProductionResolverFactory({pool,
      loadedProfile:{schema:'rus.lower_dvina_trace_f1_loaded_profile.v1',
        profile:profile()},worldProcessStepModel:async(request)=>{
          semanticCalls+=1;
          assert.deepEqual(request.process,objectiveProcess(
            waterStart.transition_proposal.process_after));
          semanticQuantities.push(request.subject_state.quantities[0]);
          const sourceRef=request.subject_state.source_refs[0];
          return {schema:'world_process_step_plan_v1',request_id:request.request_id,
            process_ref:request.process.process_ref,
            process_state_version:request.process_state_version,
            interpretation:{grounded_transition:'whole water portion extinguishes fire'},
            process_outcome:sourceRef==='water-1'?'no_effect'
              :sourceRef==='water-continue'?'continue':'complete',
            affected_refs:request.subject_state.source_refs,
            fact_changes:[],reason_code:'water_affects_fire'};
        }})({partyId:'party-fire',
          applyWorkingProjection:keepWorkingProjection});
    const waterResult=await waterResolver({operation:{op:'request_world_process',
      actor_ref:'pc',process_action:'affect',process_ref:waterProcess,
      process_kind:'fire',source_refs:['water-1'],target_refs:[],
      description:'вылить воду на огонь'},actor:{actor_id:'pc'},
    plan:{schema:'turn_step_plan_v1'},request:{request_id:'request-water',
      root_turn_id:'turn-water',step_index:1,committed_state_version:'7',
      player_safe_state:{local_world_process:{semantic_grounding_available:true,
         context_ref:'context-fire',scope_ref:'scope-fire',
         ignition_basis_refs:['ignition'],active_process_refs:[waterProcess]}}},
    working_projection:{},committed_state:{party_state:{turn_number:7},
      clock:clock(31),position:{location_ref:'scope-fire'}}});
    assert.equal(semanticCalls,1);
    assert.deepEqual(waterResult.consequence_fragment,
      fireConsequence(1,'affect','no_effect','active'));
    const waterVisible=await fireVisibleContext(waterResult.consequence_fragment);
    const waterCombined=await combinedPlan(
      waterResult.local_fire_atomic_write_plans[0],7,
      {visibleContext:waterVisible});
    assert.equal((await committer.commit({plan:waterCombined})).ok,true);
    assert.deepEqual(await committer.commit({plan:waterCombined}),{
      ok:true,replay:true,change_set_id:'change:party-fire:turn-step:8'});
    let visibleRows=(await pool.query(`SELECT visible_payload FROM
      party_runtime.party_visible_packages WHERE change_set_id=$1`,
    ['change:party-fire:turn-step:8'])).rows;
    assert.equal(visibleRows.length,1);
    assert.deepEqual(phase2VisibleContextFromPayload(
      visibleRows[0].visible_payload),persistedVisible(waterVisible));
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

    const continuedByWater=await waterResolver({operation:{
      op:'request_world_process',actor_ref:'pc',process_action:'affect',
      process_ref:waterProcess,process_kind:'fire',
      source_refs:['water-continue'],target_refs:[],
      description:'воздействовать ещё одной порцией воды'},
    actor:{actor_id:'pc'},plan:{schema:'turn_step_plan_v1'},request:{
      request_id:'request-water-continue',root_turn_id:'turn-water-continue',
      step_index:1,committed_state_version:'8',player_safe_state:{
        local_world_process:{semantic_grounding_available:true,
          context_ref:'context-fire',scope_ref:'scope-fire',
          ignition_basis_refs:['ignition'],active_process_refs:[waterProcess]}}},
    working_projection:{},committed_state:{party_state:{turn_number:8},
      clock:clock(32),position:{location_ref:'scope-fire'}}});
    assert.deepEqual(continuedByWater.consequence_fragment,
      fireConsequence(1,'affect','continue','active'));

    const completedByWater=await waterResolver({operation:{
      op:'request_world_process',actor_ref:'pc',process_action:'affect',
      process_ref:waterProcess,process_kind:'fire',source_refs:['water-2'],
      target_refs:[],description:'вылить вторую воду на огонь'},
    actor:{actor_id:'pc'},plan:{schema:'turn_step_plan_v1'},request:{
      request_id:'request-water-2',root_turn_id:'turn-water-2',step_index:1,
      committed_state_version:'8',player_safe_state:{local_world_process:{
         semantic_grounding_available:true,context_ref:'context-fire',
         scope_ref:'scope-fire',ignition_basis_refs:['ignition'],
         active_process_refs:[waterProcess]}}},
    working_projection:{},committed_state:{party_state:{turn_number:8},
      clock:clock(32),position:{location_ref:'scope-fire'}}});
    assert.equal(semanticCalls,3);
    assert.deepEqual(completedByWater.consequence_fragment,
      fireConsequence(1,'affect','complete','completed'));
    assert.deepEqual(semanticQuantities.map(({mass_grams:mass})=>mass),
      [700,850,1200]);
    const completedVisible=await fireVisibleContext(
      completedByWater.consequence_fragment);
    assert.equal((await committer.commit({plan:await combinedPlan(
      completedByWater.local_fire_atomic_write_plans[0],8,
      {visibleContext:completedVisible})})).ok,true);
    visibleRows=(await pool.query(`SELECT visible_payload FROM
      party_runtime.party_visible_packages WHERE change_set_id=$1`,
    ['change:party-fire:turn-step:9'])).rows;
    assert.equal(visibleRows.length,1);
    assert.deepEqual(phase2VisibleContextFromPayload(
      visibleRows[0].visible_payload),persistedVisible(completedVisible));
    assert.notDeepEqual(completedVisible.visible_changes,
      waterVisible.visible_changes);
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

    const loadedProfile={schema:'rus.lower_dvina_trace_f1_loaded_profile.v1',
      profile:profile()};
    const npcState=phase7DatabaseState();
    const npcContracts=approvedPhase7Contracts(npcState);
    const npcResolver=createLowerDvinaTraceF1ProductionResolverFactory({pool,
      loadedProfile})({partyId:'party-fire'});
    const npcTemporalOwner=createTemporalAdvanceOwner({
      source_registrations:lowerDvinaTraceTemporalSourceRegistrations([
        lowerDvinaTraceLocalFireTemporalRegistration(profile())]),
      effect_registrations:[...npcTemporalEffectRegistrations(),
        ...lowerDvinaTracePhase7TemporalEffectRegistrations()]});
    let npcResolverResult=null;
    const npcConsequence=await phase7Command({state:npcState,
      contracts:npcContracts,temporalAdvanceOwner:npcTemporalOwner,
      localFireProfile:loadedProfile,worldProcessResolver:async(input)=>{
        npcResolverResult=await npcResolver(input);return npcResolverResult;},
      projectNpcWorldProcessCapability:projectLowerDvinaTraceF1NpcCapability,
      model:async(request)=>{
        const allowed=request.decision_scope.operation_contract
          .request_world_process.allowed.find(
            ({process_action:action})=>action==='start');
        const operation={op:'request_world_process',actor_ref:request.npc_ref,
          ...structuredClone(allowed),
          description:'разжечь огонь'};
        const plan=phase7AutonomousPlan(request,'wait');
        plan.operations=[operation];
        return plan;
      }}).consequence({retrievedState:npcState,
      playerInput:phase7PlayerInput(npcState,'db-fire')});
    const npcPlan=npcConsequence.local_fire_atomic_write_plans[0];
    assert.equal(npcResolverResult.consequence_fragment,undefined);
    const npcDue=npcConsequence.phase7.schedule_temporal.result
      .combined_change_set.proposals.flatMap((proposal)=>
        proposal.local_fire_atomic_write_plans??[])[0];
    assert.equal(npcPlan.actor_ref,'npc-fire');
    assert.deepEqual(npcPlan.transition_proposal.at_timestamp,clock(125));
    assert.deepEqual(npcPlan.transition_proposal.process_after.started_at,
      clock(125));
    assert.deepEqual(npcPlan.transition_proposal.process_after.next_boundary_at,
      clock(130));
    assert.deepEqual(npcDue.transition_proposal.at_timestamp,clock(130));
    assert.equal(npcDue.transition_proposal.process_after.status,'completed');
    const npcCommitted=await committer.commit({
      plan:await combinedPlan(npcPlan,9,{localPlans:[npcPlan,npcDue]})});
    assert.equal(npcCommitted.ok,true,JSON.stringify(npcCommitted));
    const npcRows=(await pool.query(`SELECT
      (SELECT count(*)::int
      FROM party_runtime.party_local_world_process_fuel_bindings
      WHERE party_id='party-fire' AND fuel_item_id='npc-fuel'
        AND released_at_change_set_id IS NULL) AS active_bindings,
      (SELECT state->>'lifecycle_status' FROM party_runtime.party_items
       WHERE party_id='party-fire' AND item_id='npc-fuel') AS fuel_status`))
      .rows[0];
    assert.deepEqual(npcRows,{active_bindings:0,fuel_status:'retired'});

    const multiStart=await firePlan(pool,{action:'start',requestId:'multi',
      changeSetId:'change-multi-start',partyVersion:10,
      fuelIds:['fuel-m1','fuel-m2','fuel-m3'],at:clock(50)});
    assert.equal((await committer.commit({plan:await combinedPlan(
      multiStart,10)})).ok,true);
    const proof=await loadTracePhase2TemporalSourceProof(pool,'party-fire');
    const multiCandidate=proof.candidates.find(({source_ref:source})=>
      source.entity_id===multiStart.transition_proposal.process_after.process_ref);
    assert.deepEqual(multiCandidate.rule_ref,{entity_ref:{
      entity_kind:'action_contract',entity_id:'local_exact_fire_due_v1'},
    authoring_version:'1'});
    assert.deepEqual(multiCandidate.policy_ref,{entity_ref:{
      entity_kind:'activity_contract',entity_id:'policy-fire'},
    authoring_version:'1'});
    const multiRuntime=proof.local_fire_runtime.find(({process_state})=>
      process_state.process_ref===multiCandidate.source_ref.entity_id);
    assert.equal(multiCandidate.boundary_id,`local-fire:${multiRuntime
      .process_state.process_ref}:state:${multiRuntime.process_state.state_version}`);
    assert.deepEqual(multiCandidate.scheduled_at,
      multiRuntime.process_state.next_boundary_at);
    assert.deepEqual(multiCandidate.rule_ref,multiRuntime.rule_ref);
    assert.deepEqual(multiCandidate.policy_ref,multiRuntime.policy_ref);
    assert.equal(multiCandidate.resolution_class,'propagation_background');
    const temporalAdvanceOwner=createTemporalAdvanceOwner({
      source_registrations:lowerDvinaTraceTemporalSourceRegistrations([
        lowerDvinaTraceLocalFireTemporalRegistration(profile())]),
      effect_registrations:lowerDvinaTracePhase6TemporalEffectRegistrations()});
    const multiDue=await createTracePhase2TemporalAdvance({contracts:{activity:{
      nearest_temporal_boundary_rule:'split_before_earliest_boundary',
      duration_minutes:15}},temporalAdvanceOwner})({clock_before:clock(50),
      exact_elapsed:{exact_minutes:{numerator:'15',denominator:'1'}},
      relevant_state:{party_id:'party-fire',party_state:{state_version:11,
        turn_number:10},
        temporal_boundary_candidates:[multiCandidate],
        temporal_source_proof:{...proof,candidates:[multiCandidate],
          candidate_count:1,pending_event_count:0,active_schedule_count:0},
        local_fire_runtime:[multiRuntime]},
      root_turn_id:'turn-multi-due'});
    assert.equal(multiDue.local_fire_atomic_write_plans.length,3);
    const multiCombined=await combinedPlan(
      multiDue.local_fire_atomic_write_plans[0],11,{
        localPlans:multiDue.local_fire_atomic_write_plans});
    await pool.query(`UPDATE party_runtime.party_items SET state_version=2
      WHERE party_id='party-fire' AND item_id='fuel-m2'`);
    assert.equal((await committer.commit({plan:multiCombined})).ok,false);
    assert.deepEqual((await pool.query(`SELECT
      (SELECT state->>'lifecycle_status' FROM party_runtime.party_items
        WHERE party_id='party-fire' AND item_id='fuel-m1') AS first_state,
      (SELECT state_version::int FROM party_runtime.party_local_world_processes
        WHERE party_id='party-fire' AND process_ref=$1) AS process_version`,
    [multiCandidate.source_ref.entity_id])).rows[0],{
      first_state:'active',process_version:1});
    await pool.query(`UPDATE party_runtime.party_items SET state_version=1
      WHERE party_id='party-fire' AND item_id='fuel-m2'`);
    const multiCommitted=await committer.commit({plan:multiCombined});
    assert.equal(multiCommitted.ok,true,JSON.stringify(multiCommitted));
    assert.deepEqual(await committer.commit({plan:multiCombined}),{
      ok:true,replay:true,change_set_id:'change:party-fire:trace-phase7:11'});
    assert.deepEqual((await pool.query(`SELECT status,next_boundary_at,
      process_state->'fuel_bindings' AS fuels FROM
      party_runtime.party_local_world_processes WHERE party_id='party-fire'
      AND process_ref=$1`,[multiCandidate.source_ref.entity_id])).rows[0],{
      status:'completed',next_boundary_at:null,fuels:[]});

    const freshVersion=Number((await pool.query(`SELECT state_version
      FROM party_runtime.parties WHERE party_id='party-fire'`)).rows[0]
      .state_version);
    const preparedFire=await firePlan(pool,{action:'start',
      requestId:'prepared-water-fire',changeSetId:'change-prepared-water-fire',
      partyVersion:freshVersion,fuelIds:['fuel-5'],at:clock(70)});
    assert.equal((await committer.commit({plan:await combinedPlan(
      preparedFire,freshVersion)})).ok,true);
    const preparedVersion=Number((await pool.query(`SELECT state_version
      FROM party_runtime.parties WHERE party_id='party-fire'`)).rows[0]
      .state_version);
    const preparedChange=`change:party-fire:turn-step:${preparedVersion+1}`;
    const waterPlan=preparedWater(preparedVersion);
    await provisionPreparedWater(pool,waterPlan);
    const preparedProcess=preparedFire.transition_proposal.process_after
      .process_ref;
    const preparedResolver=createLowerDvinaTraceF1ProductionResolverFactory({pool,
      loadedProfile:{schema:'rus.lower_dvina_trace_f1_loaded_profile.v1',
        profile:profile()},worldProcessStepModel:async(request)=>({
          schema:'world_process_step_plan_v1',request_id:request.request_id,
          process_ref:request.process.process_ref,
          process_state_version:request.process_state_version,
          interpretation:{grounded_transition:'whole water portion extinguishes fire'},
          process_outcome:'complete',affected_refs:request.subject_state.source_refs,
          fact_changes:[],reason_code:'water_extinguishes'})})({
      partyId:'party-fire',applyWorkingProjection:keepWorkingProjection});
    const preparedEnvelope={operation:{op:'request_world_process',actor_ref:'pc',
      process_action:'affect',process_ref:preparedProcess,process_kind:'fire',
      source_refs:[waterPlan.items[0].item_id],target_refs:[],
      description:'вылить найденную воду на огонь'},actor:{actor_id:'pc'},
    plan:{schema:'turn_step_plan_v1'},request:{request_id:'request-prepared-water',
      root_turn_id:'turn-prepared-water',step_index:2,
      committed_state_version:String(preparedVersion),
      player_safe_state:{local_world_process:{semantic_grounding_available:true,
        context_ref:'context-fire',scope_ref:'scope-fire',
        ignition_basis_refs:[],active_process_refs:[preparedProcess]}}},
    prepared_ordinary_materialization_atomic_write_plan:waterPlan,
    prepared_action_production_atomic_write_plans:[],working_projection:{},
    committed_state:{party_state:{turn_number:preparedVersion},clock:clock(70),
      position:{location_ref:'scope-fire'}}};
    const preparedResult=await preparedResolver(preparedEnvelope);
    assert.equal(preparedResult.local_fire_atomic_write_plans[0].change_set_id,
      preparedChange);
    assert.equal(preparedResult.local_fire_atomic_write_plans[0].input_pins[0]
      .container.closure_state,'open');
    const unrelated=structuredClone(preparedEnvelope);
    unrelated.operation.source_refs=['forged-prepared-water'];
    await assert.rejects(preparedResolver(unrelated),
      {code:'LOCAL_FIRE_INPUT_STALE'});
    const preparedCombined=await combinedPlan(
      preparedResult.local_fire_atomic_write_plans[0],preparedVersion,
      {ordinaryPlan:waterPlan});
    const beforeProcess=(await pool.query(`SELECT process_state
      FROM party_runtime.party_local_world_processes
      WHERE party_id='party-fire' AND process_ref=$1`,[preparedProcess])).rows[0]
      .process_state;
    await pool.query(`UPDATE party_runtime.party_local_world_processes
      SET process_state=jsonb_set(process_state,'{state_version}',
        to_jsonb((state_version+1)::int)),state_version=state_version+1
      WHERE party_id='party-fire' AND process_ref=$1`,[preparedProcess]);
    assert.equal((await committer.commit({plan:preparedCombined})).ok,false);
    assert.deepEqual((await pool.query(`SELECT
      (SELECT count(*)::int FROM party_runtime.party_items
        WHERE party_id='party-fire' AND item_id=$1) AS items,
      (SELECT count(*)::int FROM party_runtime.party_ordinary_materialization_commits
        WHERE party_id='party-fire' AND request_identity=$2) AS commits,
      (SELECT state_version::int FROM party_runtime.party_containers
        WHERE party_id='party-fire' AND container_id='chest') AS container_version`,
    [waterPlan.items[0].item_id,waterPlan.request_identity])).rows[0],
    {items:0,commits:0,container_version:1});
    await pool.query(`UPDATE party_runtime.party_local_world_processes
      SET process_state=$1::jsonb,state_version=$2
      WHERE party_id='party-fire' AND process_ref=$3`,
    [JSON.stringify(beforeProcess),beforeProcess.state_version,preparedProcess]);
    const preparedCommitted=await committer.commit({plan:preparedCombined});
    assert.equal(preparedCommitted.ok,true,JSON.stringify(preparedCommitted));
    assert.deepEqual((await pool.query(`SELECT
      (SELECT state->>'lifecycle_status' FROM party_runtime.party_items
        WHERE party_id='party-fire' AND item_id=$1) AS water_state,
      (SELECT status FROM party_runtime.party_local_world_processes
        WHERE party_id='party-fire' AND process_ref=$2) AS process_status`,
    [waterPlan.items[0].item_id,preparedProcess])).rows[0],
    {water_state:'retired',process_status:'completed'});

    const a1Version=preparedVersion+1;
    const a1Change=`change:party-fire:turn-step:${a1Version+1}`;
    const occupiedAnchorItems=(await pool.query(`SELECT p.item_id
      FROM party_runtime.party_item_placements p
      JOIN party_runtime.party_items i USING (party_id,item_id)
      WHERE p.party_id='party-fire' AND p.anchor_id='scope-fire'
        AND COALESCE(i.state->>'lifecycle_status','active') <> 'retired'
      ORDER BY p.item_id`)).rows.map(({item_id:id})=>id);
    const a1Plan=preparedA1Fuel(a1Version,a1Change,occupiedAnchorItems);
    const a1ResultRef=a1Plan.result_items[0].item_id;
    const a1Envelope={operation:{op:'request_world_process',actor_ref:'pc',
      process_action:'start',process_ref:null,process_kind:'fire',
      source_refs:[a1ResultRef],target_refs:['ignition'],
      description:'разжечь огонь подготовленной растопкой'},actor:{actor_id:'pc'},
    plan:{schema:'turn_step_plan_v1'},request:{request_id:'request-prepared-a1',
      root_turn_id:'turn-prepared-a1',step_index:2,
      committed_state_version:String(a1Version),player_safe_state:{
        local_world_process:{semantic_grounding_available:true,
          context_ref:'context-fire',scope_ref:'scope-fire',
          ignition_basis_refs:['ignition'],active_process_refs:[]}}},
    prepared_ordinary_materialization_atomic_write_plan:null,
    prepared_action_production_atomic_write_plans:[a1Plan],working_projection:{},
    committed_state:{party_state:{turn_number:a1Version},clock:clock(80),
      position:{location_ref:'scope-fire'}}};
    const a1Result=await preparedResolver(a1Envelope);
    assert.equal(a1Result.local_fire_atomic_write_plans[0].change_set_id,a1Change);
    assert.deepEqual(a1Result.local_fire_atomic_write_plans[0]
      .transition_proposal.added_fuel_refs,[a1ResultRef]);
    const forgedA1=structuredClone(a1Envelope);
    forgedA1.prepared_action_production_atomic_write_plans[0]
      .transition_proposal.causal_identity.root_turn_id='turn-forged';
    await assert.rejects(preparedResolver(forgedA1),
      {code:'ACTION_PRODUCED_PREPARED_ITEM_INVALID'});
    const a1Combined=await combinedPlan(
      a1Result.local_fire_atomic_write_plans[0],a1Version,
      {actionPlans:[a1Plan]});
    const a1Process=a1Result.local_fire_atomic_write_plans[0]
      .transition_proposal.process_after.process_ref;
    await pool.query(`UPDATE party_runtime.party_items
      SET state_version=state_version+1
      WHERE party_id='party-fire' AND item_id='ignition'`);
    assert.equal((await committer.commit({plan:a1Combined})).ok,false);
    assert.deepEqual((await pool.query(`SELECT
      (SELECT count(*)::int FROM party_runtime.party_items
        WHERE party_id='party-fire' AND item_id=$1) AS result_items,
      (SELECT state_version::int FROM party_runtime.party_items
        WHERE party_id='party-fire' AND item_id='fuel-prepared-source')
        AS source_version,
      (SELECT count(*)::int FROM
        party_runtime.party_local_world_process_fuel_bindings
        WHERE party_id='party-fire' AND fuel_item_id=$1) AS bindings,
      (SELECT count(*)::int FROM party_runtime.party_local_world_processes
        WHERE party_id='party-fire' AND process_ref=$2) AS processes`,
    [a1ResultRef,a1Process])).rows[0],
    {result_items:0,source_version:1,bindings:0,processes:0});
    await pool.query(`UPDATE party_runtime.party_items SET state_version=1
      WHERE party_id='party-fire' AND item_id='ignition'`);
    const a1Committed=await committer.commit({plan:a1Combined});
    assert.equal(a1Committed.ok,true,JSON.stringify(a1Committed));
    assert.deepEqual((await pool.query(`SELECT
      (SELECT count(*)::int FROM party_runtime.party_items
        WHERE party_id='party-fire' AND item_id=$1) AS result_items,
      (SELECT count(*)::int FROM
        party_runtime.party_local_world_process_fuel_bindings
        WHERE party_id='party-fire' AND fuel_item_id=$1
          AND released_at_change_set_id IS NULL) AS active_bindings`,
    [a1ResultRef])).rows[0],{result_items:1,active_bindings:1});

    const chainVersion=Number((await pool.query(`SELECT state_version
      FROM party_runtime.parties WHERE party_id='party-fire'`)).rows[0]
      .state_version);
    const chainRoot='turn-same-root',chainRequest='request-same-root';
    const chainChange=`change:party-fire:turn-step:${chainVersion+1}`;
    const chainResolver=createLowerDvinaTraceF1ProductionResolverFactory({pool,
      loadedProfile,worldProcessStepModel:async(request)=>({
        schema:'world_process_step_plan_v1',request_id:request.request_id,
        process_ref:request.process.process_ref,
        process_state_version:request.process_state_version,
        interpretation:{grounded_transition:'whole water portion extinguishes fire'},
        process_outcome:'complete',affected_refs:request.subject_state.source_refs,
        fact_changes:[],reason_code:'water_extinguishes'})})({
      partyId:'party-fire',applyWorkingProjection:keepWorkingProjection});
    const chainEnvelope=(step,operation,prior=[],currentClock=clock(90))=>({operation,
      actor:{actor_id:'pc'},plan:{schema:'turn_step_plan_v1'},request:{
        request_id:`${chainRequest}:step:${step}`,root_turn_id:chainRoot,
        step_index:step,change_set_id:chainChange,
        committed_state_version:String(chainVersion),completed_steps:
          Array.from({length:step-1},(_,index)=>({step_index:index+1,
            summary:`step ${index+1}`})),player_safe_state:{local_world_process:{
          semantic_grounding_available:true,context_ref:'context-fire',
          scope_ref:'scope-fire',ignition_basis_refs:['ignition'],
          active_process_refs:step===1?[]:[operation.process_ref]}}},
      prior_local_fire_atomic_write_plans:prior,
      prepared_ordinary_materialization_atomic_write_plan:null,
      prepared_action_production_atomic_write_plans:[],working_projection:{},
      committed_state:{party_state:{turn_number:chainVersion},clock:currentClock,
        position:{location_ref:'scope-fire'}}});
    const startResult=await chainResolver(chainEnvelope(1,{
      op:'request_world_process',actor_ref:'pc',process_action:'start',
      process_ref:null,process_kind:'fire',source_refs:['fuel-chain-1'],
      target_refs:['ignition'],description:'разжечь огонь'}));
    assert.deepEqual(startResult.consequence_fragment,
      fireConsequence(1,'start','started','active'));
    const chainStart=startResult.local_fire_atomic_write_plans[0];
    const chainProcess=chainStart.transition_proposal.process_after.process_ref;
    const addOperation={op:'request_world_process',actor_ref:'pc',
      process_action:'affect',process_ref:chainProcess,process_kind:'fire',
      source_refs:['fuel-chain-2'],target_refs:[],description:'добавить топливо'};
    const addResult=await chainResolver(chainEnvelope(2,addOperation,[chainStart]));
    assert.deepEqual(addResult.consequence_fragment,
      fireConsequence(2,'add_fuel','fuel_added','active'));
    const chainAdd=addResult.local_fire_atomic_write_plans[0];
    const waterOperation={...addOperation,source_refs:['water-chain'],
      description:'залить водой'};
    const directWater=await chainResolver(chainEnvelope(2,waterOperation,
      [chainStart]));
    assert.equal(directWater.local_fire_atomic_write_plans[0]
      .transition_proposal.process_before.state_version,1);
    const waterResultSameRoot=await chainResolver(chainEnvelope(3,
      waterOperation,[chainStart,chainAdd]));
    assert.deepEqual(waterResultSameRoot.consequence_fragment,
      fireConsequence(3,'affect','complete','completed'));
    const chainWater=waterResultSameRoot.local_fire_atomic_write_plans[0];
    assert.equal(chainWater.transition_proposal.process_before.state_version,2);

    let mixedProjection=applyLocalFireTemporalProjection({
      local_fire_runtime:[]},chainStart);
    mixedProjection=applyLocalFireTemporalProjection(mixedProjection,chainAdd);
    const mixedCandidate=localFireTemporalCandidateFromRuntime(
      mixedProjection.local_fire_runtime[0]);
    const mixedResolution=lowerDvinaTraceLocalFireTemporalRegistration(profile())
      .resolve(mixedCandidate,{request:{base_state_version:String(chainVersion),
        idempotency_context:{change_set_id:chainChange}},
      projection:mixedProjection});
    const chainDue=mixedResolution.proposals[0]
      .local_fire_atomic_write_plans[0];
    const mixedWaterResult=await chainResolver(chainEnvelope(3,waterOperation,
      [chainStart,chainAdd,chainDue],chainDue.transition_proposal.at_timestamp));
    assert.deepEqual(mixedWaterResult.consequence_fragment,
      fireConsequence(3,'affect','complete','completed'));
    const mixedWater=mixedWaterResult.local_fire_atomic_write_plans[0];
    assert.equal(mixedWater.transition_proposal.process_before.state_version,3);

    for (const mutate of [
      (plan)=>{plan.party_id='forged-party';},
      (plan)=>{plan.actor_ref='forged-actor';},
      (plan)=>{plan.change_set_id='forged-change';},
      (plan)=>{plan.transition_proposal.cause.root_turn_id='forged-root';},
      (plan)=>{plan.transition_proposal.cause.step_index=2;},
      (plan)=>{plan.transition_proposal.cause.request_id='forged-request';}
    ]) {
      const forged=structuredClone(chainStart);mutate(forged);
      await assert.rejects(chainResolver(chainEnvelope(3,waterOperation,
        [forged,chainAdd])),/LOCAL_FIRE_/u);
    }
    await assert.rejects(chainResolver(chainEnvelope(3,waterOperation,
      [chainAdd,chainStart])),{code:'LOCAL_FIRE_PROCESS_STALE'});
    const staleBefore=structuredClone(chainStart.transition_proposal.process_after);
    staleBefore.state_version+=1;
    const staleProcessPlan=createLocalFireAtomicWritePlan({schema:
      'local_fire_atomic_write_request_v1',party_id:'party-fire',
    base_party_state_version:chainVersion,change_set_id:chainChange,
    actor_ref:'pc',profile_pin:chainAdd.profile_pin,process_state:staleBefore,
    input_pins:chainAdd.input_pins,ignition_basis_pin:null,action:'add_fuel',
    process_ref:chainProcess,at_timestamp:clock(90),cause:{kind:'actor_step',
      request_id:`${chainRequest}:step:2`,root_turn_id:chainRoot,step_index:2},
    qualitative_outcome:null});
    await assert.rejects(chainResolver(chainEnvelope(3,waterOperation,
      [chainStart,staleProcessPlan])),{code:'LOCAL_FIRE_PROCESS_STALE'});
    const stalePin=structuredClone(chainAdd.input_pins[0]);
    stalePin.placement={...stalePin.placement,anchor_id:'scope-fire',
      holder_character_id:null,physical_position:null};
    const staleItemPlan=createLocalFireAtomicWritePlan({schema:
      'local_fire_atomic_write_request_v1',party_id:'party-fire',
    base_party_state_version:chainVersion,change_set_id:chainChange,
    actor_ref:'pc',profile_pin:chainAdd.profile_pin,
    process_state:chainStart.transition_proposal.process_after,
    input_pins:[stalePin],ignition_basis_pin:null,action:'add_fuel',
    process_ref:chainProcess,at_timestamp:clock(90),cause:{kind:'actor_step',
      request_id:`${chainRequest}:step:2`,root_turn_id:chainRoot,step_index:2},
    qualitative_outcome:null});
    await assert.rejects(chainResolver(chainEnvelope(3,waterOperation,
      [chainStart,staleItemPlan])),{code:'LOCAL_FIRE_INPUT_STALE'});

    for(const mutate of [
      (plan)=>{plan.actor_ref='pc';},
      (plan)=>{plan.change_set_id='forged-change';},
      (plan)=>{plan.transition_proposal.cause.boundary_id='forged-boundary';},
      (plan)=>{plan.transition_proposal.cause
        .expected_process_state_version+=1;},
      (plan)=>{plan.transition_proposal.cause.due_at=clock(96);}
    ]){
      const forged=structuredClone(chainDue);mutate(forged);
      await assert.rejects(chainResolver(chainEnvelope(3,waterOperation,
        [chainStart,chainAdd,forged],clock(95))),/LOCAL_FIRE_/u);
    }
    await assert.rejects(chainResolver(chainEnvelope(3,waterOperation,
      [chainStart,chainDue,chainAdd],clock(95))),/LOCAL_FIRE_/u);

    const chainVisible=await fireVisibleContext(startResult.consequence_fragment,
      addResult.consequence_fragment,mixedWaterResult.consequence_fragment);
    const chainCombined=await combinedPlan(mixedWater,chainVersion,{
      localPlans:[chainStart,chainAdd,chainDue,mixedWater],
      visibleContext:chainVisible});
    await pool.query(`UPDATE party_runtime.party_items SET state_version=2
      WHERE party_id='party-fire' AND item_id='water-chain'`);
    assert.equal((await committer.commit({plan:chainCombined})).ok,false);
    assert.deepEqual((await pool.query(`SELECT
      (SELECT state_version::int FROM party_runtime.parties
        WHERE party_id='party-fire') AS party_version,
      (SELECT count(*)::int FROM party_runtime.party_local_world_processes
        WHERE party_id='party-fire' AND process_ref=$1) AS processes,
      (SELECT count(*)::int FROM
        party_runtime.party_local_world_process_fuel_bindings
        WHERE party_id='party-fire' AND process_ref=$1) AS bindings,
      (SELECT state->>'lifecycle_status' FROM party_runtime.party_items
        WHERE party_id='party-fire' AND item_id='fuel-chain-1') AS fuel_state,
      (SELECT state->>'lifecycle_status' FROM party_runtime.party_items
        WHERE party_id='party-fire' AND item_id='water-chain') AS water_state`,
    [chainProcess])).rows[0],{party_version:chainVersion,processes:0,
      bindings:0,fuel_state:'active',water_state:'active'});
    await pool.query(`UPDATE party_runtime.party_items SET state_version=1
      WHERE party_id='party-fire' AND item_id='water-chain'`);
    const chainCommitted=await committer.commit({plan:chainCombined});
    assert.equal(chainCommitted.ok,true,JSON.stringify(chainCommitted));
    assert.deepEqual(await committer.commit({plan:chainCombined}),{
      ok:true,replay:true,change_set_id:chainChange});
    visibleRows=(await pool.query(`SELECT visible_payload FROM
      party_runtime.party_visible_packages WHERE change_set_id=$1`,
    [chainChange])).rows;
    assert.equal(visibleRows.length,1);
    assert.deepEqual(phase2VisibleContextFromPayload(
      visibleRows[0].visible_payload),persistedVisible(chainVisible));
    assert.deepEqual(chainVisible.visible_changes,[
      'turn_step_world_process_1:local_fire:started',
      'turn_step_world_process_2:local_fire:fuel_added',
      'turn_step_world_process_3:local_fire:complete'
    ]);
    assert.deepEqual((await pool.query(`SELECT
      (SELECT state_version::int FROM party_runtime.parties
        WHERE party_id='party-fire') AS party_version,
      (SELECT status FROM party_runtime.party_local_world_processes
        WHERE party_id='party-fire' AND process_ref=$1) AS process_status,
      (SELECT state->>'lifecycle_status' FROM party_runtime.party_items
        WHERE party_id='party-fire' AND item_id='water-chain') AS water_state,
      (SELECT state->>'lifecycle_status' FROM party_runtime.party_items
        WHERE party_id='party-fire' AND item_id='fuel-chain-1') AS fuel_state,
      (SELECT count(*)::int FROM
        party_runtime.party_local_world_process_fuel_bindings
        WHERE party_id='party-fire' AND process_ref=$1
          AND released_at_change_set_id=$2) AS released_bindings`,
    [chainProcess,chainChange])).rows[0],{party_version:chainVersion+1,
      process_status:'completed',water_state:'retired',fuel_state:'retired',
      released_bindings:2});
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

function preparedWater(partyVersion){
  const sealed=batchInput({masses:[800],party:'party-fire',
    partyStateVersion:partyVersion,
    containerStateVersion:1,requestIdentity:'o2-water',
    ownerControllerRef:'pc',rootTurnId:'turn-prepared-water',stepIndex:1});
  const raw=structuredClone(sealed);delete raw.schema;delete raw.write_plan_digest;
  raw.mechanics.inventory_input.container_placements=[{party_id:'party-fire',
    container_id:'chest',holder_character_id:'pc',physical_position:'hands'}];
  raw.mechanics.inventory_input.container_profiles[0].external_hand_cost=1;
  raw.container_pin.mechanics_profile_digest=canonicalDigest(
    raw.mechanics.inventory_input.container_profiles[0]);
  raw.mechanics.expected_total_mass_grams=800;
  raw.items[0].item_proposal.semantic_descriptor={semantic_type:'water_portion',
    name:'порция воды',facts:['обычная вода']};
  return createOrdinaryContainerContentsAtomicWritePlan(raw);
}

function preparedA1Fuel(partyVersion,changeSetId,usedItemIds=[]){
  const sourceRef='fuel-prepared-source',root='turn-prepared-a1',step=1;
  const approved=preparedA1ApprovedPlan();
  const actionRef=actionProducedTraceActionRef({rootTurnId:root,
    stepIndex:step,approvedPlan:approved});
  const ownership={ownership_id:`own:${sourceRef}`,owner_npc_id:null,
    owner_character_id:'pc',owner_party:false,controller_npc_id:null,
    controller_character_id:'pc',claim_state:'owned'};
  const sourceState={lifecycle_status:'active',property_state:{kind:'fuel'},
    local_fire_fuel:{schema:
    'rus.items.local_fire_fuel.v1',fuel_class:'ordinary_solid_fuel_unit',
    whole_unit:true,provenance:{source_refs:[`authored:${sourceRef}`]}},
  inventory_profile_snapshot:{inventory_profile_id:`profile:${sourceRef}`,
    item_template_ref:`template:${sourceRef}`,mass_grams:700,
    carry_form:'compact',external_hand_cost:0,packing_slot_cost:1,
    quantity:{value:1,unit:'item'},container:null}};
  const item={item_id:sourceRef,run_id:'run-fire',
    template_id:`template:${sourceRef}`,profile_id:`profile:${sourceRef}`,
    category_id:'fuel',quantity:1,condition_state:'serviceable',
    legal_status:'owned',state:sourceState,state_version:1};
  const placement={anchor_id:null,container_id:null,holder_npc_id:null,
    holder_character_id:'pc',physical_position:'hands',
    equipment_slot_category_id:null,attached_item_id:null};
  const entity={schema:'rus.items.action_produced_committed_entity_snapshot.v1',
    commit_state:'committed',role:'source',entity_ref:sourceRef,
    state_version:String(partyVersion),lifecycle_state:'active',
    access_state:'immediate',holder_ref:'pc',controller_ref:'pc',
    ownership_snapshot:structuredClone(ownership),finite_resource:null};
  const resultRef=createActionProducedOutputIdentity({root_turn_id:root,
    action_ref:actionRef,ordinal:1});
  const causal={request_id:'request-prepared-a1',root_turn_id:root,
    action_ref:actionRef,step_index:step};
  const qualitative={intended_transformation:'отделить сухую растопку',
    material_extent:'minor',output_class:'ordinary_mundane',result_descriptor:{
      display_name:'отделённая сухая растопка',
      physical_description:'небольшая сухая часть',qualitative_facts:[
        'отделённая сухая растопка'],inscription_text:null,
      physical_form:'compact',source_fact_delta:{physical_description:
        'от источника отделена часть',qualitative_facts:[],
      removed_physical_fact_refs:[],physical_form:'compact'}}};
  const owner=resolveActionProducedAllocationMechanics({mechanics_request:{
    schema:'rus.items.action_produced_mechanics_request.v1',
    causal_identity:causal,identity_mode:'independent_outputs',
    origin:'direct_partition',result_class:'partial_transformation',
    source_inputs:[{entity_ref:sourceRef,state_version:String(partyVersion),
      holder_ref:'pc',controller_ref:'pc',ownership_snapshot:ownership,
      finite_resource:null}],tool_inputs:[],qualitative_intent:qualitative,
    technical_limits:{policy_ref:
      'lower_dvina_trace:a1:personal_tool_policy_v1',policy_version:1,
      max_new_entities:4}},source_mechanics:[{source_ref:sourceRef,mechanics:{
      mass_grams:700,external_hand_cost:0,carry_form:'compact',
      packing_slot_cost:1,quantity:{value:1,unit:'item'},container:null}}],
    requested_output_count:1});
  const request={schema:'action_production_atomic_write_request_v1',
    party_id:'party-fire',base_party_state_version:partyVersion,
    change_set_id:changeSetId,committed_load:{schema:
      'action_produced_committed_context_load_v1',party_id:'party-fire',
    party_state_version:partyVersion,output_destination_pin:{schema:
      'action_production_output_destination_pin_v1',destination_kind:
      'party_current_anchor',anchor_id:'scope-fire',item_capacity:20,
    used_item_ids:usedItemIds},output_destination:{schema:
      'rus.items.action_produced_output_destination.v1',placement_kind:'anchor',
    target_ref:'scope-fire',holder_ref:null,controller_ref:'pc'},
    admission_profile:{schema:'rus.items.action_produced_admission_profile.v1',
      profile_ref:'lower_dvina_trace_a1_open_physical_action_profile_v1',
      profile_version:'1',status:'committed',context_ref:
      'lower_dvina_trace:a1:personal_tool_transform',
    context_state_version:String(partyVersion),allowed_access_states:
      ['immediate','quick'],allowed_identity_modes:['preserve_source',
        'independent_outputs','no_useful_result'],allowed_origins:
      ['direct_partition','crafted'],allowed_result_classes:[
        'ordinary_physical_result','partial_transformation',
        'nonworking_construction','waste','written_carrier','no_useful_result']},
    technical_policy:{schema:'rus.items.action_produced_technical_policy.v1',
      version:1,status:'committed',policy_ref:
      'lower_dvina_trace:a1:personal_tool_policy_v1',profile_ref:
      'lower_dvina_trace_a1_open_physical_action_profile_v1',
    profile_version:'1',max_new_entities:4},committed_context:{schema:
      'rus.items.action_produced_committed_context.v1',context_ref:
      'lower_dvina_trace:a1:personal_tool_transform',
    state_version:String(partyVersion),commit_state:'committed',
    root_turn_id:root,action_ref:actionRef,step_index:step,actor_ref:'pc',
    entities:[{entity_ref:sourceRef,state_version:String(partyVersion),
      lifecycle_state:'active',access_state:'immediate',
      accessible_actor_ref:'pc',holder_ref:'pc',controller_ref:'pc',
      role_membership:['source']}]},source_snapshots:[structuredClone(entity)],
    tool_snapshots:[],row_pins:[{role:'source',item_id:sourceRef,item,
      placement,ownership:structuredClone(ownership),
      entity_snapshot:structuredClone(entity),finite_resource_row:null}]},
    transition_proposal:{schema:
      'rus.items.action_produced_transition_proposal.v1',version:1,
    causal_identity:causal,context_pin:{context_ref:
      'lower_dvina_trace:a1:personal_tool_transform',
    context_state_version:String(partyVersion),profile_ref:
      'lower_dvina_trace_a1_open_physical_action_profile_v1',profile_version:'1'},
    technical_policy_pin:{policy_ref:
      'lower_dvina_trace:a1:personal_tool_policy_v1',version:1,
      max_new_entities:4},identity_mode:'independent_outputs',
    origin:'direct_partition',result_class:'partial_transformation',
    actual_output_count:1,source_transitions:[{entity_ref:sourceRef,before:{
      state_version:String(partyVersion),holder_ref:'pc',controller_ref:'pc'},
    after:{state_version:String(partyVersion+1),mechanics_snapshot:owner
      .source_effects[0].mechanics_snapshot_after,
      holder_ref:'pc',controller_ref:'pc'},finite_resource_transition:null}],
    tool_state_pins:[],results:[{entity_ref:resultRef,
      identity_kind:'independent_output',source_ref:sourceRef,
      mechanics_snapshot:owner.outputs[0].mechanics_snapshot,
      holder_ref:null,controller_ref:'pc',
      physical_facts:['отделённая сухая растопка'],inscription_text:null,
      output_authority:{schema:
        'rus.items.action_produced_output_authority.v1',
      mode:'new_non_authoritative',canonical_identity_status:'absent',
      currency_status:'not_currency',legal_tender_status:'not_legal_tender',
      official_status:'not_official',objective_truth_status:'not_projected',
      knowledge_status:'not_projected'},material_allocations:
        owner.outputs[0].material_allocations}],known_waste:owner.known_waste,
    qualitative_result:qualitative}};
  return createActionProducedAtomicWritePlan(request);
}

function preparedA1ApprovedPlan(){return{resolution:'domain_request',
  operations:[{op:'request_item_use',actor_ref:'pc',
    item_ref:'fuel-prepared-source',target_refs:[],action_production:{
      source_refs:['fuel-prepared-source'],tool_refs:[]}}]};}

async function provisionPreparedWater(pool,plan){
  const context={mechanics_profile_ref:plan.container_pin.mechanics_profile_ref,
    mechanics_profile_digest:plan.container_pin.mechanics_profile_digest,
    context_digest:plan.container_pin.context_digest,ordinary_policy:{schema:
      'rus.items.existing_container_ordinary_policy.v2',version:2,
    unresolved_ordinary_contents:true,technical_limits:plan.technical_limits}};
  await pool.query(`INSERT INTO party_runtime.party_containers
    (party_id,container_id,run_id,template_id,holder_character_id,
     physical_position,closure_state,state,state_version)
    VALUES ('party-fire','chest','run-fire','chest-template','pc','hands',
      'closed',$1::jsonb,1)`,[JSON.stringify({ordinary_contents_context:context})]);
  await pool.query(`INSERT INTO party_runtime.party_ownership
    (party_id,ownership_id,container_id,owner_character_id,owner_party,
     controller_character_id,claim_state)
    VALUES ('party-fire','ownership:chest','chest','pc',false,'pc','owned')`);
  const initial=createOrdinaryAggregate({scope_ref:plan.scope_ref,
    resolution_record_cap:32});
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_aggregates
    (party_id,scope_kind,scope_id,state_version,aggregate_payload)
    VALUES ('party-fire','container','chest',0,$1::jsonb)`,
  [JSON.stringify(initial)]);
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_contexts
    (party_id,scope_kind,scope_id,catalog_version,property_version,
     placement_version,supporting_basis_catalog_version,
     supporting_basis_catalog_digest,property_placement_context_digest,
     property_placement_base_snapshot)
    VALUES ('party-fire','container','chest',1,1,1,1,$1,$2,'{}'::jsonb)`,
  [plan.expected_versions.supporting_basis_catalog_digest,
    plan.expected_versions.property_placement_context_digest]);
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_basis_catalog
    (party_id,scope_kind,scope_id,basis_ref,origin_request_identity,basis_snapshot)
    VALUES ('party-fire','container','chest',$1,NULL,$2::jsonb)`,
  [plan.expected_supporting_basis_catalog[0].basis_ref,
    JSON.stringify(plan.expected_supporting_basis_catalog[0])]);
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_enablements
    (party_id,scope_kind,scope_id,objective_snapshot,objective_digest,enabled)
    VALUES ('party-fire','container','chest',$1::jsonb,$2,true)`,
  [JSON.stringify({scope_ref:plan.scope_ref}),plan.enablement_pin.objective_digest]);
}

async function combinedPlan(local,partyVersion,{missingClock=false,
  temporalResult=null,fuelMutation=false,expectBuildFailure=false,
  localPlans=[local],ordinaryPlan=null,actionPlans=[],visibleContext=null}={}) {
  const cause=local.transition_proposal.cause;
  const due=cause.kind==='temporal_boundary';
  const id=due?cause.boundary_id:cause.request_id;
  const changeSetId=local.change_set_id;
  const payload={schema:'temporal_visible_package.v1',
    perceived_scene:visibleContext?.visible_scene??'Огонь.',
    perceived_changes:visibleContext?.visible_changes??[],
    sensory_details:visibleContext?.sensory_details??[],
    visible_npcs:visibleContext?.visible_npc??[],
    visible_objects:visibleContext?.visible_objects??[],
    known_context:visibleContext?.known_context??[],
    uncertainties:visibleContext?.uncertainties??[],hypotheses:[],
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
  const operationKind=actionPlans.length?'trace_turn_step':'local_fire_command';
  let input={plan_id:`plan-${id}`,
    party_id:'party-fire',write_plan_kind:'semantic_commit',
    operation_kind:operationKind,canonical_input_digest:digest({id}),
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
          operation_kind:operationKind,idempotency_record_id:`idem-${id}`}}]}],
    lock_context:{owner_keys:due?[]:[`actor:${local.actor_ref}`],execution_keys:[],g4_keys:[],
      physical_keys:[`party_runtime.party_v3_change_sets:${changeSetId}`,
        'party_runtime.parties:party-fire',
        ...(missingClock?['party_runtime.party_clocks:party-fire']:[]),
        ...(fuelMutation?['party_runtime.party_items:fuel-1',
          'party_runtime.party_item_placements:fuel-1',
          'party_runtime.party_ownership:own:fuel-1']:[]),
        ...(ordinaryPlan==null?[]:ordinaryPhysicalKeys(ordinaryPlan)),
        ...actionPlans.flatMap(actionProducedPhysicalKeys),
        ...(temporalResult===null?localPlans.flatMap(localFirePhysicalKeys):[])]},
    ordinary_materialization_atomic_write_plan:ordinaryPlan,
    action_production_atomic_write_plans:actionPlans,
    local_fire_atomic_write_plans:temporalResult===null?localPlans:[],
    idempotency:idempotency(local,id,due,actionPlans,localPlans),
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
  return {local:resolution.proposals[0].local_fire_atomic_write_plans[0],
    temporalResult:{canonical_digest:digest(resolution),
      combined_change_set:{proposals:resolution.proposals}}};
}

function fireCandidate(loaded,scheduledAt) {
  const process=loaded.process_state;
  const boundaryId=`local-fire:${process.process_ref}:state:${
    process.state_version}`;
  const subjects=process.fuel_bindings.map(({fuel_ref:ref})=>({
    entity_kind:'item',entity_id:ref}));
  const policy={entity_ref:{entity_kind:'activity_contract',
    entity_id:loaded.profile_pin.policy.policy_ref},authoring_version:String(
      loaded.profile_pin.policy.version)};
  return {boundary_id:boundaryId,boundary_kind:'propagation',
    scheduled_at:scheduledAt,source_ref:{entity_kind:'propagation_process',
      entity_id:process.process_ref},primary_subject_ref:{...subjects[0]},
    scope_ref:{entity_kind:'party',entity_id:loaded.party_id},rule_ref:{
      entity_ref:{entity_kind:'action_contract',
        entity_id:'local_exact_fire_due_v1'},authoring_version:'1'},
    policy_ref:structuredClone(policy),preconditions_digest:digest({process_state:process,
      expected_state_version:process.state_version}),
    resolution_class:'propagation_background',interrupt_effect:'background',
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
  await pool.query(`INSERT INTO party_runtime.party_g5_nodes
    (party_id,g5_node_id,run_id,parent_g4_id,template_id,slot_key,state)
    VALUES ('party-fire','g5-fire','run-fire','g4','g5-template','main','{}')`);
  await pool.query(`INSERT INTO party_runtime.party_g5_anchors
    (party_id,anchor_id,g5_node_id,template_id,slot_key,item_capacity)
    VALUES ('party-fire','scope-fire','g5-fire','anchor-template','ground',20)`);
  await pool.query(`INSERT INTO party_runtime.party_positions
    (party_id,g4_id,g5_node_id,g5_anchor_id)
    VALUES ('party-fire','g4','g5-fire','scope-fire')`);
  await pool.query(`INSERT INTO party_runtime.party_npcs
    (party_id,npc_id,run_id,profile_set_id,profile_level)
    VALUES ('party-fire','npc-fire','run-fire','profile:npc-fire','background')`);
  for (const [id,kind,mass] of [['ignition','ignition',180],
    ['fuel-1','fuel',300],['fuel-2','fuel',700],
    ['fuel-4','fuel',500],['fuel-5','fuel',500],['fuel-m1','fuel',250],
    ['fuel-m2','fuel',350],['fuel-m3','fuel',450],
    ['fuel-chain-1','fuel',400],['fuel-chain-2','fuel',450],
    ['fuel-prepared-source','fuel',700]]) {
    const state={lifecycle_status:'active',property_state:{kind},
      inventory_profile_snapshot:{inventory_profile_id:`profile:${id}`,
        item_template_ref:`template:${id}`,mass_grams:mass,
        carry_form:'compact',external_hand_cost:0,packing_slot_cost:1,
        quantity:{value:1,unit:'item'},container:null},
      ...(kind==='fuel'?{local_fire_fuel:{
        schema:'rus.items.local_fire_fuel.v1',
        fuel_class:'ordinary_solid_fuel_unit',whole_unit:true,
        provenance:{source_refs:[`authored:${id}`]}}}:{
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
  const waterState=(mass)=>({lifecycle_status:'active',ordinary_metadata:{
    semantic_type:'water_portion',semantic_category:'ordinary_mundane'},
    runtime_instance_mechanics_snapshot:{
      schema:'rus.items.runtime_instance_mechanics_snapshot.v2',version:2,
      provenance:{source_kind:'ordinary_world_materialization',
        causal_ref:'cause:water',request_id:'request:water',
        candidate_key:'candidate:water',coverage_key:'coverage:water',
        context_version:'1',policy_ref:'policy:water',source_refs:['river']},
      mechanics:{mass_grams:mass,external_hand_cost:1,carry_form:'compact',
        packing_slot_cost:1,quantity:{value:1,unit:'item'},container:null}}});
  await pool.query(`INSERT INTO party_runtime.party_items
    (party_id,item_id,run_id,template_id,profile_id,category_id,quantity,
     condition_state,legal_status,state,state_version)
    VALUES ('party-fire','water-1',NULL,NULL,NULL,NULL,1,
      'ordinary_runtime_instance','ordinary',$1::jsonb,1),
      ('party-fire','water-2',NULL,NULL,NULL,NULL,1,
      'ordinary_runtime_instance','ordinary',$2::jsonb,1),
      ('party-fire','water-continue',NULL,NULL,NULL,NULL,1,
      'ordinary_runtime_instance','ordinary',$3::jsonb,1),
      ('party-fire','water-chain',NULL,NULL,NULL,NULL,1,
      'ordinary_runtime_instance','ordinary',$4::jsonb,1)`,
  [JSON.stringify(waterState(700)),JSON.stringify(waterState(1200)),
    JSON.stringify(waterState(850)),JSON.stringify(waterState(900))]);
  await pool.query(`INSERT INTO party_runtime.party_item_placements
    (party_id,item_id,holder_character_id,physical_position)
    VALUES ('party-fire','water-1','pc','hands'),
      ('party-fire','water-2','pc','hands'),
      ('party-fire','water-continue','pc','hands'),
      ('party-fire','water-chain','pc','hands')`);
  await pool.query(`INSERT INTO party_runtime.party_ownership
    (party_id,ownership_id,item_id,owner_character_id,owner_party,
     controller_character_id,claim_state)
    VALUES ('party-fire','own:water-1','water-1','pc',false,'pc','owned'),
      ('party-fire','own:water-2','water-2','pc',false,'pc','owned'),
      ('party-fire','own:water-continue','water-continue','pc',false,'pc','owned'),
      ('party-fire','own:water-chain','water-chain','pc',false,'pc','owned')`);
  for (const [id,kind,mass] of [['npc-ignition','ignition',180],
    ['npc-fuel','fuel',350]]) {
    const state={lifecycle_status:'active',inventory_profile_snapshot:{
      inventory_profile_id:`profile:${id}`,item_template_ref:`template:${id}`,
      mass_grams:mass,carry_form:'compact',external_hand_cost:0,
      packing_slot_cost:1},...(kind==='fuel'?{local_fire_fuel:{
      schema:'rus.items.local_fire_fuel.v1',
      fuel_class:'ordinary_solid_fuel_unit',whole_unit:true,
      provenance:{source_refs:[`authored:${id}`]}}}:{local_fire_ignition_basis:{
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
        provenance:{source_refs:['authored:fuel-2']}}}},ownership,entity_snapshot:{
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
    allowed_actions:['start','affect'],
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

function phase7DatabaseState() {
  const state=phase7CommittedState();
  state.party_id='party-fire';
  state.party_state.state_version=9;
  state.party_state.turn_number=9;
  const npc=state.npcs.find(({participant_slot_ref:slot})=>
    slot==='zhdanko_storehouse_controller');
  npc.instance_id='npc-fire';
  npc.anchor_id='scope-fire';
  state.containers[0].holder_npc_id='npc-fire';
  state.containers[0].state.controller_npc_id='npc-fire';
  state.items.push(phase7DatabaseItem('npc-fuel','fuel'),
    phase7DatabaseItem('npc-ignition','ignition'));
  return state;
}

function phase7DatabaseItem(itemId,kind) {
  const mass=kind==='fuel'?350:180;
  return{item_id:itemId,run_id:'run-fire',template_id:`template:${itemId}`,
    profile_id:`profile:${itemId}`,category_id:kind,quantity:1,
    condition_state:'serviceable',legal_status:'owned',state_version:1,
    placement:{item_id:itemId,holder_npc_id:'npc-fire',
      holder_character_id:null,anchor_id:null,container_id:null,
      physical_position:'hands',equipment_slot_category_id:null,
      attached_item_id:null},ownership:{ownership_id:`own:${itemId}`,
      item_id:itemId,owner_npc_id:'npc-fire',owner_character_id:null,
      owner_party:false,controller_npc_id:'npc-fire',
      controller_character_id:null,claim_state:'owned'},state:{
      lifecycle_status:'active',inventory_profile_snapshot:{
        inventory_profile_id:`profile:${itemId}`,
        item_template_ref:`template:${itemId}`,mass_grams:mass,
        carry_form:'compact',external_hand_cost:0,packing_slot_cost:1},
      ...(kind==='fuel'?{local_fire_fuel:{
        schema:'rus.items.local_fire_fuel.v1',
        fuel_class:'ordinary_solid_fuel_unit',whole_unit:true,
        provenance:{source_refs:[`authored:${itemId}`]}}}:{
        local_fire_ignition_basis:{
          schema:'rus.items.local_fire_ignition_basis.v1'}})}};
}

function semanticSnapshot(local,actionPlans=[],localPlans=[local]) {
  const proposal=local.transition_proposal;
  const steps=Array.from({length:proposal.cause.step_index},(_,index)=>{
    const step=index+1;
    const fire=localPlans.find((plan)=>plan.transition_proposal.cause.step_index===step);
    const action=actionPlans.some((plan)=>plan
      .transition_proposal.causal_identity.step_index===step);
    return {step_index:step,plan_request:{request_id:
      fire?.transition_proposal.cause.request_id??`prior-step-${step}`,
    root_turn_id:proposal.cause.root_turn_id,step_index:step},
    approved_plan:action?preparedA1ApprovedPlan():{operations:
      fire==null?[]:[semanticFireOperation(fire)]}};
  });
  return {semantic_trace:{step_traces:steps}};
}

function semanticFireOperation(local){const proposal=local.transition_proposal;
  return {op:'request_world_process',actor_ref:local.actor_ref,
    process_action:proposal.action==='start'?'start':'affect',
    process_ref:proposal.action==='start'?null:proposal.process_before.process_ref,
    process_kind:'fire',source_refs:proposal.action==='affect'
      ?[proposal.consumed_item_ref]:proposal.added_fuel_refs,
    target_refs:proposal.action==='start'
      ?[local.profile_pin.ignition_basis_ref]:[]};}

function idempotency(local,id,due,actionPlans=[],localPlans=[local]) {
  if (due) return {id:`idem-${id}`,key:id,request_id:null,
    semantic_command_snapshot:null,semantic_command_digest:null,
    semantic_dependency_pins:null};
  const snapshot=semanticSnapshot(local,actionPlans,localPlans);
  return {id:`idem-${id}`,key:id,request_id:local.transition_proposal.cause.request_id,
    semantic_command_snapshot:snapshot,semantic_command_digest:digest(snapshot),
    semantic_dependency_pins:{}};
}
