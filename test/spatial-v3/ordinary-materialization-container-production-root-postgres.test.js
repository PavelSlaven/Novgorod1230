import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { Pool } from 'pg';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { createSpatialV3ProductionComposition } from
  '@rus/turn/spatial-v3-target-composition';
import { buildCombinedWritePlan } from
  '../../packages/turn/src/spatial-v3-write-plan.js';
import {
  SPATIAL_V3_PRODUCTION_RELEASE,
  createSpatialV3ProductionCompositionRoot
} from '../../apps/game-server/src/composition/production-spatial-v3.js';
import { SPATIAL_V3_TARGET_MIGRATIONS } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';
import { PARTY_RUNTIME_CATALOG_MIGRATION } from
  '../../tools/runtime-catalog-activation/src/forward-migrations.js';
import { buildCommittedInventoryInput } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-committed-inventory.js';
import { createSpatialV3ProductionBindings } from
  '../../apps/game-server/src/runtime/releases/spatial-v3-production-binding-shared.js';
import { projectLowerDvinaTraceS1Capability } from
  '../../apps/game-server/src/runtime/releases/lower-dvina-trace-s1-production.js';
import { loadSpatialSemanticCommittedState } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-semantic-readback.js';
import { createLowerDvinaTracePhase2Runtime } from
  '../../apps/game-server/src/runtime/lower-dvina-trace-phase-2.js';
import { commitLowerDvinaTracePhase2 } from
  '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2-commit.js';
import { fixture as phase2Fixture } from
  '../../apps/game-server/test/lower-dvina-trace-phase-2-fixture.js';
import { loadLowerDvinaTraceMaterializationBundle } from
  '../../apps/game-server/src/internal/lower-dvina-trace-phase-1a-bundle.js';

const docker = (args) => spawnSync('docker', args,
  {encoding:'utf8',timeout:60_000});
const containerName = `ordinary-o2b-root-${process.pid}`;
const hex = 'e'.repeat(64);
const pouchRef = 'trace_ld_v1_container_player_small_pouch';
const pin = Object.freeze({
  schema:'rus.runtime_catalog_pin.v2',
  catalog_scope:'item_container_materialization_v2',
  catalog_revision_id:'catalog-revision-root-test',catalog_digest:'a'.repeat(64),
  activation_event_id:'activation-root-test',import_id:'import-root-test',
  import_audit_digest:'b'.repeat(64),record_registry_digest:'c'.repeat(64),
  runtime_contract_digest:SPATIAL_V3_PRODUCTION_RELEASE
    .runtime_catalog_contract_digest,
  compatible_world_revision_id:SPATIAL_V3_PRODUCTION_RELEASE.world_revision_id,
  compatible_world_catalog_digest:SPATIAL_V3_PRODUCTION_RELEASE.world_catalog_digest,
  compatible_world_pin_manifest_digest:hex
});

test('production root provisions inherited O2b and active rev23 S1 in first-entry P16',
  async (t) => {
    if (docker(['version']).status !== 0) return t.skip('Docker required');
    let pool;
    let closed = false;
    t.after(async () => {
      if (pool && !closed) await pool.end();
      docker(['rm','-f',containerName]);
    });
    const started=docker(['run','-d','--name',containerName,
      '-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD=ordinary',
      '-e','POSTGRES_USER=ordinary','-e','POSTGRES_DB=ordinary',
      'postgres:16-alpine']);
    assert.equal(started.status,0,started.stderr);
    let ready=false;
    for (let attempt=0;attempt<50;attempt+=1) {
      await new Promise((done)=>setTimeout(done,250));
      if (docker(['exec',containerName,'pg_isready','-U','ordinary',
        '-d','ordinary']).status===0) { ready=true; break; }
    }
    assert.equal(ready,true);
    await new Promise((done)=>setTimeout(done,500));
    const port=Number(docker(['port',containerName,'5432/tcp']).stdout
      .match(/:(\d+)\s*$/u)?.[1]);
    pool=new Pool({host:'127.0.0.1',port,user:'ordinary',password:'ordinary',
      database:'ordinary',max:4,connectionTimeoutMillis:5000});
    for (const sql of SPATIAL_V3_TARGET_MIGRATIONS) {
      await pool.query(sql);
    }
    await pool.query(PARTY_RUNTIME_CATALOG_MIGRATION.sql);
    await pool.query(`INSERT INTO party_runtime.schema_migrations
      (migration_id,migration_digest,source_schema_fingerprint,
       target_schema_fingerprint,applied_by)
      VALUES ($1,$2,$3,$4,'production-root-pg-test')`,[
      PARTY_RUNTIME_CATALOG_MIGRATION.migration_id,
      PARTY_RUNTIME_CATALOG_MIGRATION.migration_digest,
      PARTY_RUNTIME_CATALOG_MIGRATION.source_schema_fingerprint,
      PARTY_RUNTIME_CATALOG_MIGRATION.target_schema_fingerprint]);
    const worldPool=fakeWorldPool();
    let committer=null;
    let loadedProfile=null;
    let loadedSpatialSemanticProfile=null;
    let phase2Ports=null;
    let phase2Runtime=null;
    const phase2States=new Map();
    const phase2Replays=new Map();
    const root=await createSpatialV3ProductionCompositionRoot({
      config:{runtimeCatalogPinManifestDigest:hex,
        traceTurnDecisionSecret:'production-root-s1-test'},
      pools:{partyPool:pool,worldPool,async close(){
        if (!closed) { closed=true; await pool.end(); }
      }},
      bindingsFactory:async (context)=>{
        loadedProfile=context.ordinaryContainerContentsProfile;
        loadedSpatialSemanticProfile=context.spatialSemanticProfile;
        const productionBindings = await createSpatialV3ProductionBindings(
          context, {
          technicalCommandBoundary: 'production-root-pg-test',
          createNpcRuntimePorts: () => ({
            playerConversationModel: unexpectedModel,
            npcSemanticModel: unexpectedModel,
            npcAutonomousModel: unexpectedModel,
            npcCombatModel: unexpectedModel
          }),
          createPhase2RuntimeFactory: (ports) => {
            phase2Ports = ports;
            phase2Runtime = createProductionS1Phase2Runtime({ ports, pool,
              getCommitter:()=>committer, phase2States, phase2Replays });
            return phase2Runtime;
          }
        });
        return Object.freeze({ ...productionBindings,
          commitRecheck: async ({ check }) => ({ ok: true,
            ...(check.kind === 'physical' ? { first_entry_binding:
              Object.fromEntries(bindingFields.map(
                (field) => [field, check[field]])) } : {}) }) });
      },
      targetRootFactory:(ports)=>{ committer=ports.committer;
        return createSpatialV3ProductionComposition(ports); }
    });
    assert.equal(loadedProfile.profile.scenario_definition_revision,20);
    assert.equal(loadedProfile.profile.container_bindings.length,1);
    assert.equal(loadedSpatialSemanticProfile.profile
      .scenario_definition_revision,23);
    assert.equal(loadedSpatialSemanticProfile.profile.envelopes.length,2);
    assert.equal(typeof committer?.commit,'function');

    const partyId='party-root-active';
    await seedFirstEntry(pool,partyId,'active');
    const plan=await firstEntryPlan(partyId,'active');
    const result=await committer.commit({plan});
    assert.equal(result.ok,true,JSON.stringify(result));
    assert.equal(result.replay,false);
    assert.deepEqual(await provisionedState(pool,partyId),{
      party_state_version:'1',containers:1,ownership:1,aggregates:1,
      contexts:1,bases:1,enablements:1,all_aggregates:2,all_contexts:2,
      all_bases:2,all_enablements:2,change_sets:1,idempotency:1,
      s1_envelopes:2,s1_reservations:0,s1_resolutions:0,
      s1_available_capacity:2
    });
    const container=(await pool.query(`SELECT template_id,holder_character_id,
        physical_position,closure_state,state
      FROM party_runtime.party_containers
      WHERE party_id=$1 AND container_id=$2`,[partyId,pouchRef])).rows[0];
    assert.equal(container.template_id,'container_tpl_nov_small_soft_bag_v1');
    assert.equal(container.holder_character_id,`pc:${partyId}`);
    assert.equal(container.closure_state,'closed');
    assert.equal(container.state.ordinary_contents_context.profile_digest,
      loadedProfile.artifact_digest);
    const reloadedInventory = buildCommittedInventoryInput({
      party_id: partyId, actor_id: `pc:${partyId}`,
      party_state: { state_version: 1 },
      position: { g5_anchor_id: 'position-new-active' },
      player_profile: { attributes: { strength: { value: 9 } } },
      items: [], containers: [{ container_id: pouchRef, ...container }],
      container_placements: []
    });
    assert.equal(reloadedInventory.container_profiles[0].capacity, 4);
    assert.equal(reloadedInventory.container_profiles[0].template_id,
      container.template_id);

    const replay=await committer.commit({plan});
    assert.deepEqual(replay,{ok:true,replay:true,
      change_set_id:'first-entry-active-cs'});
    assert.deepEqual(await provisionedState(pool,partyId),{
      party_state_version:'1',containers:1,ownership:1,aggregates:1,
      contexts:1,bases:1,enablements:1,all_aggregates:2,all_contexts:2,
      all_bases:2,all_enablements:2,change_sets:1,idempotency:1,
      s1_envelopes:2,s1_reservations:0,s1_resolutions:0,
      s1_available_capacity:2
    });
    await runProductionS1Turn({ pool, phase2Runtime,
      loadedSpatialSemanticProfile, phase2Ports, phase2States, partyId });

    const outsideParty='party-root-outside-s1';
    await seedFirstEntry(pool,outsideParty,'outside-s1');
    const outside=await committer.commit({plan:await firstEntryPlan(
      outsideParty,'outside-s1',{s1Eligible:false})});
    assert.equal(outside.ok,true,JSON.stringify(outside));
    assert.deepEqual(await provisionedState(pool,outsideParty),{
      party_state_version:'1',containers:1,ownership:1,aggregates:1,
      contexts:1,bases:1,enablements:1,all_aggregates:2,all_contexts:2,
      all_bases:2,all_enablements:2,change_sets:1,idempotency:1,
      s1_envelopes:0,s1_reservations:0,s1_resolutions:0,
      s1_available_capacity:0
    });

    const rollbackParty='party-root-rollback';
    await seedFirstEntry(pool,rollbackParty,'rollback');
    const failed=await committer.commit({plan:await firstEntryPlan(
      rollbackParty,'rollback',{lateFailure:true})});
    assert.equal(failed.ok,false);
    assert.equal(failed.error.code,'state_version_conflict');
    assert.deepEqual(await provisionedState(pool,rollbackParty),{
      party_state_version:'0',containers:0,ownership:0,aggregates:0,
      contexts:0,bases:0,enablements:0,all_aggregates:0,all_contexts:0,
      all_bases:0,all_enablements:0,change_sets:0,idempotency:0,
      s1_envelopes:0,s1_reservations:0,s1_resolutions:0,
      s1_available_capacity:0
    });
    await root.close();
  });

function fakeWorldPool() {
  const query=async (sql)=>{
    if (/spatial_v3_world_revisions/u.test(sql)) return {rows:[{
      id:SPATIAL_V3_PRODUCTION_RELEASE.world_revision_id,
      catalog_digest:SPATIAL_V3_PRODUCTION_RELEASE.world_catalog_digest,
      status:'approved'}]};
    if (/runtime_catalog_activation_events/u.test(sql)) return {rows:[{
      event_id:pin.activation_event_id,...pin}]};
    return {rows:[{database_name:'world-root-test',user_name:'ordinary',ok:1}]};
  };
  return {query,connect:async()=>({query,release(){}})};
}

async function runProductionS1Turn({ pool, phase2Runtime,
  loadedSpatialSemanticProfile, phase2Ports, phase2States, partyId }) {
  assert.equal(typeof phase2Ports?.createTurnStepSpatialSemanticResolver,
    'function');
  const actorId = `pc:${partyId}`;
  const scenarioBundle = await loadLowerDvinaTraceMaterializationBundle({
    scenarioDefinitionRevision: 23 });
  const state = JSON.parse(JSON.stringify(phase2Fixture({ scenarioBundle,
    materializationBundle: scenarioBundle }).state));
  state.party_id = partyId;
  state.actor_id = actorId;
  state.party_state = { state_version: 1, turn_number: 0,
    session_state_version: 1, clock_state_version: 1,
    body_state_version: 1 };
  state.position = { ...state.position, position_id: 'position-new-active',
    g5_node_id: 'g5-new-active', g5_anchor_id: 'position-new-active' };
  state.spatial_semantic = await loadSpatialSemanticCommittedState(pool,
    partyId);
  assert.equal(projectLowerDvinaTraceS1Capability({ playerSafeState: {},
    committedState: state, loadedProfile: loadedSpatialSemanticProfile,
    resolverAvailable: true }).spatial_semantic?.position_ref,
  'position-new-active');
  phase2States.set(partyId, state);
  await pool.query(`INSERT INTO party_runtime.party_server_sessions
    (party_id,request_id,stage26_result,delivery_ack_result,screen,turn_number,
     last_turn_id,state_version,updated_change_set_id)
    VALUES ($1,'production-root-s1-session','{}'::jsonb,
      '{"pass":true}'::jsonb,'{}'::jsonb,0,NULL,1,'first-entry-active-cs')`,
  [partyId]);
  const baselineBefore = (await pool.query(`SELECT to_jsonb(b) AS snapshot
    FROM party_runtime.party_scene_baselines b
    WHERE party_id=$1 AND id='baseline-new-active'`, [partyId])).rows[0].snapshot;
  const input = { request_id: 'production-root-s1',
    idempotency_key: 'production-root-s1',
    raw_text: 'Осматриваю берег внимательнее.' };
  const committed = await phase2Runtime.submitTurn({ partyId, input });
  assert.equal(committed.state_version, 2);
  assert.equal(committed.turn_number, 1);
  const after = (await pool.query(`SELECT
    (SELECT state_version FROM party_runtime.parties WHERE party_id=$1)
      AS party_state_version,
    (SELECT count(*)::int FROM party_runtime.party_spatial_semantic_resolutions
      WHERE party_id=$1) AS resolutions,
    (SELECT count(*)::int FROM party_runtime.party_spatial_semantic_reservations
      WHERE party_id=$1 AND status='committed_consumed') AS consumed,
    (SELECT count(*)::int FROM party_runtime.party_state_snapshots
      WHERE party_id=$1 AND state_version=2) AS snapshots`, [partyId])).rows[0];
  assert.deepEqual(after, { party_state_version: '2', resolutions: 1,
    consumed: 1, snapshots: 1 });
  const durable = (await pool.query(`SELECT
      r.status, r.consumed_at_change_set_id,
      s.request_id, s.root_turn_id, s.step_index, s.p16_change_set_id
    FROM party_runtime.party_spatial_semantic_reservations r
    JOIN party_runtime.party_spatial_semantic_resolutions s
      ON s.party_id=r.party_id AND s.reservation_ref=r.reservation_ref
    WHERE r.party_id=$1`, [partyId])).rows[0];
  assert.deepEqual(durable, { status: 'committed_consumed',
    consumed_at_change_set_id: `change:${partyId}:turn-step:1`,
    request_id: `turn-step:${partyId}:1:step:1`,
    root_turn_id: `turn:${partyId}:1`, step_index: 1,
    p16_change_set_id: `change:${partyId}:turn-step:1` });
  assert.deepEqual((await pool.query(`SELECT to_jsonb(b) AS snapshot
    FROM party_runtime.party_scene_baselines b
    WHERE party_id=$1 AND id='baseline-new-active'`, [partyId])).rows[0].snapshot,
  baselineBefore);
  const replay = await phase2Runtime.submitTurn({ partyId, input });
  assert.deepEqual(replay, committed);
  assert.deepEqual((await pool.query(`SELECT state_version,
    (SELECT count(*)::int FROM party_runtime.party_spatial_semantic_resolutions
      WHERE party_id=$1) AS resolutions
    FROM party_runtime.parties WHERE party_id=$1`, [partyId])).rows[0],
  { state_version: '2', resolutions: 1 });
  const reloaded = { ...state,
    party_state: { ...state.party_state, state_version: 2, turn_number: 1 },
    spatial_semantic: await loadSpatialSemanticCommittedState(pool, partyId) };
  const revisited = projectLowerDvinaTraceS1Capability({ playerSafeState: {},
    committedState: reloaded, loadedProfile: loadedSpatialSemanticProfile,
    resolverAvailable: true });
  assert.equal(revisited.spatial_semantic_results.length, 1);
  assert.equal(JSON.stringify(revisited).includes('reservation_ref'), false);
  assert.equal(JSON.stringify(revisited).includes('authority_digest'), false);
}

function createProductionS1Phase2Runtime({ ports, pool, getCommitter,
  phase2States, phase2Replays }) {
  const repository = {
    async loadPhase2State(partyId) {
      const state = phase2States.get(partyId);
      if (state == null) throw new Error(`missing test state for ${partyId}`);
      return structuredClone({ ...state,
        spatial_semantic: await loadSpatialSemanticCommittedState(pool,
          partyId) });
    },
    async loadPhase2Replay({ partyId, idempotencyKey }) {
      const replay = phase2Replays.get(`${partyId}:${idempotencyKey}`);
      return replay == null ? null : structuredClone(replay);
    },
    async replayPhase2Turn({ replay }) {
      return structuredClone(replay.public_result);
    },
    async loadPhase2VisibleContext() {
      return { version: 1, schema: 'visible_context_package',
        visible_scene: 'Берег у места высадки.', visible_changes: [],
        sensory_details: [],
        visible_npc: [], visible_objects: [], known_context: [],
        uncertainties: [], allowed_tensions: [], do_not_imply: [] };
    },
    async commitPhase2Turn(input) {
      return commitLowerDvinaTracePhase2({ ...input,
        loadState: (partyId) => repository.loadPhase2State(partyId),
        committer: getCommitter() });
    },
    async persistPhase2Screen({ inputDigest, result }) {
      const partyId = result.checkpoint.stages.persistence_plan.party_id;
      const idempotencyKey = result.checkpoint.stages.persistence_plan
        .turn_step_commit.player_input.idempotency_key;
      const publicResult = { party_id: partyId,
        state_version: result.commit.state_version,
        turn_number: result.commit.turn_number,
        package_id: result.commit.package_id };
      phase2Replays.set(`${partyId}:${idempotencyKey}`, {
        input_digest: inputDigest, public_result: publicResult });
      return structuredClone(publicResult);
    }
  };
  return createLowerDvinaTracePhase2Runtime({ ...ports, repository,
    semanticResolver: async () => ({ status: 'unknown' }),
    turnStepModel: productionS1TurnStepModel,
    narrator: { run: async ({ request_id: requestId }) =>
      approvedNarration(requestId) } });
}

function productionS1TurnStepModel(request) {
  return { schema: 'turn_step_plan_v1', request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision, step_index: request.step_index,
    interpretation: { player_goal: request.root_player_action,
      grounded_attempt: request.remaining_intent, adaptation: 'literal' },
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{ op: 'request_discovery', actor_ref: request.actor.actor_id,
      discovery_kind: 'look',
      target_refs: [request.player_safe_state.spatial_semantic.position_ref],
      query: 'осматриваю берег' }], check: null,
    continuation: null, clarification: null,
    reason_code: 'production_root_s1_test', reason: 'Exact S1 test request.' };
}

function approvedNarration(requestId) {
  return { version: 1, schema: 'narration_flow_result',
    request_id: requestId, surface: 'turn', status: 'approved', pass: true,
    approved_output: { version: 1, schema: 'narration_output',
      output_id: `narration:${requestId}`, prose: 'Отмечена местная деталь.',
      action_options: [], used_references: [],
      self_check: { no_new_world_facts: true } },
    final_audit: { version: 1, schema: 'narration_audit', pass: true,
      concerns: [], evidence: ['Persisted visible context only.'] },
    repair_request: null, generation_history: [], audit_history: [],
    repair_history: [], diagnostics: {} };
}

async function unexpectedModel() {
  throw new Error('Unexpected non-S1 model call');
}

const bindingFields=['baseline_disposition','g4_id','preparation_snapshot_id',
  'preparation_member_ordinal','preparation_snapshot_digest',
  'preparation_member_digest','route_plan_id','route_plan_digest',
  'route_plan_execution_id','preparation_claim_id','scene_baseline_id',
  'g5_site_id','g6_instance_id','position_id'];

async function seedFirstEntry(pool,partyId,suffix) {
  const actor=`pc:${partyId}`;
  const refs={run:`run:${suffix}`,oldG5:`g5-old-${suffix}`,
    oldBaseline:`baseline-old-${suffix}`,oldG6:`g6-old-${suffix}`,
    oldPosition:`position-old-${suffix}`,location:`location-${suffix}`,
    snapshot:`snapshot-${suffix}`,request:`request-${suffix}`,
    route:`route-${suffix}`,execution:`execution-${suffix}`,
    claim:`claim-${suffix}`};
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,
     materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ($1,3,$2,$3,'materializer','rng','commands','profiles')`,[partyId,
    SPATIAL_V3_PRODUCTION_RELEASE.world_revision_id,
    SPATIAL_V3_PRODUCTION_RELEASE.world_catalog_digest]);
  await pool.query(`INSERT INTO party_runtime.party_materialization_runs
    (party_id,run_id,g4_id,run_kind,seed_digest,input_digest,catalog_digest,
     materializer_version,rng_version,result_digest,idempotency_key,status)
    VALUES ($1,$2,'g4-root','baseline','s','i','c','m','r','z','k','committed')`,
  [partyId,refs.run]);
  await pool.query(`INSERT INTO party_runtime.party_player_characters
    (party_id,character_id,profile) VALUES ($1,$2,'{}')`,[partyId,actor]);
  await pool.query(`INSERT INTO party_runtime.party_g5_sites
    (id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,
     created_change_set_id,updated_change_set_id)
    VALUES ($1,$2,'canonical','g4-root','{"entity_kind":"canonical_g5",
      "entity_id":"old"}','active',0,'seed','seed')`,[refs.oldG5,partyId]);
  await pool.query(`INSERT INTO party_runtime.party_scene_baselines
    (id,party_id,host_kind,host_id,source_kind,scene_template_ref,
     materialization_trace_id,materializer_version,catalog_digest,status,
     state_version,created_change_set_id,updated_change_set_id)
    VALUES ($1,$2,'g5_site',$3,'canonical_template','{"entity_ref":{
      "entity_kind":"scene_template","entity_id":"old"},
      "authoring_version":"v1"}','trace','v1',$4,'active',0,'seed','seed')`,
  [refs.oldBaseline,partyId,refs.oldG5,hex]);
  await pool.query(`INSERT INTO party_runtime.party_g6_instances
    (id,party_id,scene_baseline_id,source_scene_template_ref,scene_slot_key,
     host_kind,host_id,physical_class_id,primary_scene_role_id,
     vertical_context_id,overhead_cover_id,intra_g6_visibility_mode,
     default_visibility_distance_band,acoustic_uniformity,status,state_version,
     created_change_set_id,updated_change_set_id)
    VALUES ($1,$2,$3,'{"entity_ref":{"entity_kind":"scene_template",
      "entity_id":"old"},"authoring_version":"v1"}','entry','g5_site',$4,
      'spatial.g6.open','entry','surface','none','default_clear','near','uniform',
      'active',0,'seed','seed')`,[refs.oldG6,partyId,refs.oldBaseline,
    refs.oldG5]);
  await pool.query(`INSERT INTO party_runtime.scene_position_nodes
    (id,party_id,g6_instance_id,position_type_id,template_slot_key,
     template_instance_ordinal,capacity,access_class_id,status,state_version,
     created_change_set_id,updated_change_set_id)
    VALUES ($1,$2,$3,'scene_position.central','arrival',0,10,'open','active',0,
      'seed','seed')`,[refs.oldPosition,partyId,refs.oldG6]);
  await pool.query(`INSERT INTO party_runtime.party_journey_locations
    (id,party_id,owner_kind,owner_id,location_kind,scene_position_id,
     state_version,updated_change_set_id)
    VALUES ($1,$2,'actor',$3,'scene',$4,0,'seed')`,[
    refs.location,partyId,actor,refs.oldPosition]);
  await pool.query(`INSERT INTO party_runtime.preparation_snapshots
    (id,party_id,planning_request_id,planning_request_digest,
     immutable_members_digest,canonical_digest,created_at_turn,
     created_change_set_id)
    VALUES ($1,$2,$3,$4,$4,$4,0,'seed')`,[
    refs.snapshot,partyId,refs.request,hex]);
  await pool.query(`INSERT INTO party_runtime.preparation_snapshot_members
    (preparation_snapshot_id,ordinal,member_kind,source_authoring_ref,
     prepared_scene_materialization,dependency_pins,share_mode,member_digest)
    VALUES ($1,0,'transfer_scene','{}',$2::jsonb,'{}','execution_exclusive',$3)`,
  [refs.snapshot,JSON.stringify({g4_id:'g4-root',
    g5_site_id:`g5-new-${suffix}`,scene_baseline_id:`baseline-new-${suffix}`,
    g6_instance_id:`g6-new-${suffix}`,position_id:`position-new-${suffix}`,
    canonical_digest:hex}),hex]);
  await pool.query(`INSERT INTO party_runtime.party_route_plans
    (id,party_id,journey_owner_ref,journey_scope,request_kind,
     planning_request_id,path_query_digest,option_id,knowledge_scope,
     source_endpoint_snapshot,target_request,resolved_factual_target_ref,
     target_resolution_dependency_pins,world_revision_id,catalog_digest,
     planning_algorithm_version,planning_state_version,
     planning_context_dependency_pins,preparation_snapshot_id,
     preparation_snapshot_digest,canonical_serialization_digest,status,
     lifecycle_state_version,created_change_set_id,lifecycle_change_set_id,
     created_at_turn)
    VALUES ($1,$2,'{}','world_travel','ordinary',$3,$4,'option','factual','{}',
      '{}','{}','{}','world',$4,'v1',0,'{}',$5,$4,$4,'ready',1,'seed','seed',0)`,
  [refs.route,partyId,refs.request,hex,refs.snapshot]);
  await pool.query(`INSERT INTO party_runtime.party_route_plan_steps
    (route_plan_id,ordinal,step_kind,departure_endpoint_snapshot,
     arrival_endpoint_snapshot,static_contract_snapshot)
    VALUES ($1,0,'timed_traversal','{}','{}','{"snapshot_kind":
      "timed_traversal"}')`,[refs.route]);
  const transaction=await pool.connect();
  try {
    await transaction.query('BEGIN');
    await transaction.query(`INSERT INTO party_runtime.party_route_plan_executions
      (id,party_id,route_plan_id,journey_owner_ref,journey_scope,status,
       current_step_ordinal,current_endpoint_ref,state_version,
       updated_change_set_id)
      VALUES ($1,$2,$3,'{}','world_travel','planned',0,'{}',1,'seed')`,
    [refs.execution,partyId,refs.route]);
    await transaction.query(`INSERT INTO
      party_runtime.party_route_plan_execution_events
      (execution_id,event_ordinal,event_kind,to_status,step_ordinal,
       location_snapshot,change_set_id,idempotency_record_id,occurred_at_turn)
      VALUES ($1,0,'planned','planned',0,'{}','seed','seed-idem',0)`,
    [refs.execution]);
    await transaction.query(`INSERT INTO party_runtime.preparation_claims
      (id,preparation_snapshot_id,preparation_member_ordinal,
       route_plan_execution_id,claim_status,state_version,reserved_change_set_id)
      VALUES ($1,$2,0,$3,'reserved',1,'seed')`,[
      refs.claim,refs.snapshot,refs.execution]);
    await transaction.query('COMMIT');
  } catch (error) {
    await transaction.query('ROLLBACK').catch(()=>{});
    throw error;
  } finally { transaction.release(); }
}

async function firstEntryPlan(partyId,suffix,{lateFailure=false,
  s1Eligible=true}={}) {
  const changeSetId=`first-entry-${suffix}-cs`;
  const physical=physicalCheck(partyId,suffix);
  const inserts=sceneWrites(partyId,suffix,changeSetId,{s1Eligible});
  const updates=[{target_table:'parties',id:partyId,record:{party_id:partyId,
    profile_bundle_digest:'profiles-after'}},{target_table:'party_journey_locations',
    id:`location-${suffix}`,record:{id:`location-${suffix}`,party_id:partyId,
      owner_kind:'actor',owner_id:`pc:${partyId}`,location_kind:'scene',
      scene_position_id:`position-new-${suffix}`,transit_anchor_id:null,
      travel_state_id:null,updated_change_set_id:changeSetId}},
  {target_table:'preparation_claims',id:`claim-${suffix}`,record:{
    id:`claim-${suffix}`,claim_status:'consumed',terminal_change_set_id:changeSetId}},
  ...(lateFailure?[{target_table:'party_clocks',id:partyId,record:{
    party_id:partyId,whole_minutes:0,subminute_numerator:0,
    subminute_denominator:1,clock_owner_kind:'party',clock_owner_id:null,
    updated_change_set_id:changeSetId}}]:[])];
  const expected=updates.map((write)=>({target_table:write.target_table,
    id:write.id,state_version:write.target_table==='preparation_claims'?1:0}));
  const visible={schema:'temporal_visible_package.v1',
    perceived_scene:'Вход завершён.',perceived_changes:[],sensory_details:[],
    visible_npcs:[],visible_objects:[],known_context:[],uncertainties:[],
    hypotheses:[],player_safe_interruption:null,allowed_action_affordances:[]};
  const pins=[{dependency_role:'source_authoring',entity_ref:{
    entity_kind:'world_revision',entity_id:'rev20'},version_pin:{
    pin_kind:'authoring_version',authoring_version:'20',state_version:null}}];
  const built=await buildCombinedWritePlan({plan_id:`plan-${suffix}`,
    party_id:partyId,write_plan_kind:'semantic_commit',operation_kind:'first_entry',
    canonical_input_digest:`sha256:${hex}`,expected_state_versions:expected,
    validation_report:{status:'pass',digest:`sha256:${hex}`},idempotency:{
      id:`idem-${suffix}`,key:`key-${suffix}`},change_set:{id:changeSetId},
    visible_package_envelope:{package_id:`visible-${suffix}`,party_id:partyId,
      turn_id:`turn-${suffix}`,committed_state_version:'1',change_set_id:changeSetId,
      package_digest:computeSpatialV3CanonicalDigest(visible),
      visible_payload:visible,presentation_status:'pending',projection_policy_ref:{
        entity_ref:{entity_kind:'visibility_modifier',entity_id:'projection-v1'},
        authoring_version:'1'},dependency_pins:{pins,canonical_digest:
        computeSpatialV3CanonicalDigest(pins).replace('sha256:','')},
      idempotency_record_id:`idem-${suffix}`},lock_context:{owner_keys:[],
      execution_keys:[],g4_keys:[`${partyId}:g4-root`],physical_keys:[
        physical.materialization_scope_key,
        `party_runtime.party_v3_change_sets:${changeSetId}`,
        ...inserts.map(writeKey),
        ...updates.map(writeKey)]},commit_rechecks:['physical','state','pin',
      'endpoint','route','capacity','time','change_set'].map((kind)=>({kind,
        digest:`sha256:${hex}`,...(kind==='physical'?physical:{})})),
    approved_write_sets:[{inserts,updates,appends:[{target_table:
      'party_v3_change_sets',id:changeSetId,record:{id:changeSetId,
      party_id:partyId,operation_kind:'first_entry',
      idempotency_record_id:`idem-${suffix}`,
      expected_state_version_set_digest:'expected',expected_state_version_set:[],
      committed_state_version_set_digest:'committed',write_plan_digest:'write',
      created_at_turn:0,committed_at_turn:0}}]}]},
  {verifyApproval:async()=>({ok:true})});
  assert.equal(built.ok,true,JSON.stringify(built));
  return built.plan;
}

function physicalCheck(partyId,suffix) {
  const payload={kind:'physical',materialization_scope_key:
    `party_runtime.party_scene_baselines:baseline-new-${suffix}`,
  baseline_disposition:'create',g4_id:'g4-root',
  preparation_snapshot_id:`snapshot-${suffix}`,preparation_member_ordinal:0,
  preparation_snapshot_digest:hex,preparation_member_digest:hex,
  route_plan_id:`route-${suffix}`,route_plan_digest:hex,
  route_plan_execution_id:`execution-${suffix}`,
  preparation_claim_id:`claim-${suffix}`,
  scene_baseline_id:`baseline-new-${suffix}`,g5_site_id:`g5-new-${suffix}`,
  g6_instance_id:`g6-new-${suffix}`,position_id:`position-new-${suffix}`};
  return {...payload,digest:computeSpatialV3CanonicalDigest(payload)};
}

function sceneWrites(partyId,suffix,changeSetId,{s1Eligible}) {
  const g5=`g5-new-${suffix}`,baseline=`baseline-new-${suffix}`,
    g6=`g6-new-${suffix}`,position=`position-new-${suffix}`;
  const common={party_id:partyId,status:'active',state_version:0,
    created_change_set_id:changeSetId,updated_change_set_id:changeSetId,
    terminal_change_set_id:null};
  return [{target_table:'party_g5_sites',id:g5,record:{id:g5,...common,
    origin:'generated',parent_g4_id:'g4-root',canonical_g5_ref:null,
    generated_template_ref:{entity_ref:{entity_kind:'g5_template',
      entity_id:'generated-site'},authoring_version:'1'},expansion_slot_ref:{
      entity_ref:{entity_kind:'expansion_slot',entity_id:'slot'},
      authoring_version:'1'},source_frontier_id:'frontier',generation_ordinal:0,
    direction_context_id:null,continuation_chain_id:null,continuation_ordinal:null,
    superseded_by_site_id:null}},{target_table:'party_scene_baselines',
    id:baseline,record:{id:baseline,...common,host_kind:'g5_site',host_id:g5,
      source_kind:'generated_template',scene_template_ref:{entity_ref:{
        entity_kind:'scene_template',entity_id:'scene'},authoring_version:'1'},
      materialization_trace_id:`trace-${suffix}`,materializer_version:'v1',
      catalog_digest:hex}},{target_table:'party_g6_instances',id:g6,record:{
      id:g6,...common,scene_baseline_id:baseline,source_scene_template_ref:{
        entity_ref:{entity_kind:'scene_template',
          entity_id:s1Eligible?'trace_ld_v1_tpl_wreck_shore':'other-template'},
        authoring_version:'1'},scene_slot_key:'entry',
      enclosing_stable_structure_id:null,host_kind:'g5_site',host_id:g5,
      physical_class_id:'spatial.g6.open',primary_scene_role_id:'entry',
      vertical_context_id:'surface',overhead_cover_id:'none',
      intra_g6_visibility_mode:'default_clear',
      default_visibility_distance_band:'near',acoustic_uniformity:'uniform'}},
  {target_table:'scene_position_nodes',id:position,record:{id:position,...common,
    g6_instance_id:g6,position_type_id:'scene_position',
    template_slot_key:'arrival',template_instance_ordinal:0,stable_basis_ref:null,
    capacity:10,access_class_id:'open',light_profile_ref:null,
    hazard_profile_ref:null}}];
}

const writeKey=(write)=>`party_runtime.${write.target_table}:${write.id}`;

async function provisionedState(pool,partyId) {
  const row=(await pool.query(`SELECT
    (SELECT state_version FROM party_runtime.parties WHERE party_id=$1)
      AS party_state_version,
    (SELECT count(*)::int FROM party_runtime.party_containers
      WHERE party_id=$1 AND container_id=$2) AS containers,
    (SELECT count(*)::int FROM party_runtime.party_ownership
      WHERE party_id=$1 AND container_id=$2) AS ownership,
    (SELECT count(*)::int FROM party_runtime.party_ordinary_materialization_aggregates
      WHERE party_id=$1 AND scope_kind='container' AND scope_id=$2) AS aggregates,
    (SELECT count(*)::int FROM party_runtime.party_ordinary_materialization_contexts
      WHERE party_id=$1 AND scope_kind='container' AND scope_id=$2) AS contexts,
    (SELECT count(*)::int FROM party_runtime.party_ordinary_materialization_basis_catalog
      WHERE party_id=$1 AND scope_kind='container' AND scope_id=$2) AS bases,
    (SELECT count(*)::int FROM party_runtime.party_ordinary_materialization_enablements
      WHERE party_id=$1 AND scope_kind='container' AND scope_id=$2 AND enabled)
      AS enablements,
    (SELECT count(*)::int FROM party_runtime.party_ordinary_materialization_aggregates
      WHERE party_id=$1) AS all_aggregates,
    (SELECT count(*)::int FROM party_runtime.party_ordinary_materialization_contexts
      WHERE party_id=$1) AS all_contexts,
    (SELECT count(*)::int FROM party_runtime.party_ordinary_materialization_basis_catalog
      WHERE party_id=$1) AS all_bases,
    (SELECT count(*)::int FROM party_runtime.party_ordinary_materialization_enablements
      WHERE party_id=$1) AS all_enablements,
    (SELECT count(*)::int FROM party_runtime.party_v3_change_sets
      WHERE party_id=$1) AS change_sets,
    (SELECT count(*)::int FROM party_runtime.party_command_idempotency
      WHERE party_id=$1) AS idempotency,
    (SELECT count(*)::int FROM party_runtime.party_spatial_semantic_envelopes
      WHERE party_id=$1) AS s1_envelopes,
    (SELECT count(*)::int FROM party_runtime.party_spatial_semantic_reservations
      WHERE party_id=$1) AS s1_reservations,
    (SELECT count(*)::int FROM party_runtime.party_spatial_semantic_resolutions
      WHERE party_id=$1) AS s1_resolutions,
    (SELECT COALESCE(sum((capacity->>'remaining')::int),0)::int
      FROM party_runtime.party_spatial_semantic_envelopes
      WHERE party_id=$1) AS s1_available_capacity`,[partyId,pouchRef])).rows[0];
  return row;
}
