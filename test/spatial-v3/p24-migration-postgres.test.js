import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { applySpatialV3PartyMigration, buildSpatialV3MigrationInventory, readV2PartySource } from '../../tools/spatial-v3/p24-migration.mjs';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });
const port = 56600 + (process.pid % 500); const name = `p24-${process.pid}`;
test('P24 party migration reads actual v2 relation, applies exact reviewed mapping, dry-runs and rolls back an earlier write on failure', async (t) => {
  if (docker(['version']).status !== 0) t.skip('Docker required');
  t.after(() => docker(['rm', '-f', name])); assert.equal(docker(['run','-d','--name',name,'-p',`${port}:5432`,'-e','POSTGRES_PASSWORD=p24','-e','POSTGRES_USER=p24','-e','POSTGRES_DB=p24','postgres:16-alpine']).status, 0);
  const pool = new pg.Pool({ host:'127.0.0.1', port, user:'p24', password:'p24', database:'p24' }); t.after(() => pool.end());
  for (let i=0;i<40;i+=1) { try { await pool.query('SELECT 1'); break; } catch { await new Promise((r)=>setTimeout(r,250)); if(i===39) throw new Error('postgres unavailable'); } }
  for (const file of ['001_party_runtime.sql','002_party_runtime_v3.sql','003_party_runtime_v3_planning.sql','004_party_runtime_v3_journeys.sql','005_party_runtime_v3_domain.sql']) await pool.query(await readFile(`schemas/party-db/${file}`,'utf8'));
  await pool.query("INSERT INTO party_runtime.parties(party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest) VALUES('p',3,'w','d','m','r','c','b')");
  await pool.query("INSERT INTO party_runtime.party_positions(party_id,g4_id) VALUES('p','legacy-g4')");
  let source_extract = await readV2PartySource(pool);
  const source = source_extract.records.find((row) => row.source_identity === 'party_runtime.party_positions:p');
  assert.ok(source, 'read-only adapter must enumerate actual v2 party row');
  const mapping = { old_identity: source.source_identity, old_type: 'party_position', old_level: 'G5', target_contract: 'party_g5_site', action: 'migrate', reason: 'exact export', evidence: source.evidence, pin_mapping: source.pin_mapping, review_status: 'reviewed' };
  const inventory = buildSpatialV3MigrationInventory({ party_records:[mapping] }); const record = { id:'site', source_identity:source.source_identity, evidence:source.evidence, classification:'canonical_projection', canonical_g5_ref:{ entity_id:'g5', authoring_version:1 }, pin_mapping:source.pin_mapping, target_site:{ id:'site', parent_g4_id:'g4' } };
  // An actual extra legacy row is a typed coverage gap.  The check happens
  // before BEGIN/INSERT, so a partially reviewed source can never create a
  // target row.
  await pool.query("INSERT INTO party_runtime.parties(party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest) VALUES('q',3,'w','d','m','r','c','b')");
  await pool.query("INSERT INTO party_runtime.party_positions(party_id,g4_id) VALUES('q','legacy-g4')");
  const extraSourceExtract = await readV2PartySource(pool);
  const extra = await applySpatialV3PartyMigration(pool,{ inventory, source_extract:extraSourceExtract, party_id:'p', change_set_id:'cs-extra', g5_records:[record] });
  assert.equal(extra.ok,false); assert.ok(extra.errors.some((error) => error.code === 'migration_source_inventory_coverage_gap' && error.subject_ref === 'party_runtime.party_positions:q'));
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM party_runtime.party_g5_sites")).rows[0].n,0, 'unreviewed actual v2 row must prevent all target writes');
  await pool.query("DELETE FROM party_runtime.party_positions WHERE party_id='q'");
  await pool.query("DELETE FROM party_runtime.parties WHERE party_id='q'");
  source_extract = await readV2PartySource(pool);
  assert.equal((await applySpatialV3PartyMigration(pool,{ inventory, source_extract, party_id:'p', change_set_id:'cs', g5_records:[record], dry_run:true })).ok,true);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM party_runtime.party_g5_sites")).rows[0].n,0);
  assert.equal((await applySpatialV3PartyMigration(pool,{ inventory, source_extract, party_id:'p', change_set_id:'cs', g5_records:[record] })).applied,1);
  assert.equal((await pool.query("SELECT origin FROM party_runtime.party_g5_sites WHERE id='site'")).rows[0].origin,'canonical');
  await assert.rejects(() => applySpatialV3PartyMigration(pool,{ inventory, source_extract, party_id:'p', change_set_id:'cs', g5_records:[record] }), /duplicate key/u);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM party_runtime.party_g5_sites WHERE id='site'")).rows[0].n,1);
  const valid = { ...record, id:'site-middle' };
  const duplicate = { ...record, id:'site' };
  await assert.rejects(() => applySpatialV3PartyMigration(pool,{ inventory, source_extract, party_id:'p', change_set_id:'cs', g5_records:[valid, duplicate] }), /duplicate key/u);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM party_runtime.party_g5_sites WHERE id='site-middle'")).rows[0].n,0, 'first write must be rolled back after later target failure');

  // Complete target-only P24 witness: dynamic runtime domain, reconstructable
  // P14 journey and approved migration anchor all travel through the same tool.
  await pool.query("INSERT INTO party_runtime.party_materialization_runs(party_id,run_id,g4_id,run_kind,seed_digest,input_digest,catalog_digest,materializer_version,rng_version,result_digest,idempotency_key,status) VALUES('p','run','g4','baseline','s','i','c','m','r','z','k','committed')");
  await pool.query("INSERT INTO party_runtime.party_player_characters(party_id,character_id,profile) VALUES('p','pc','{}')");
  const fullSource = source;
  const fullExtract = source_extract;
  const fullMapping = mapping;
  const common = (table, values) => ({ table, values:{ party_id:'p', ...values }, source_identity:fullSource.source_identity, evidence:fullSource.evidence, pin_mapping:fullSource.pin_mapping });
  const dynamic = [
    common('party_scene_baselines',{id:'base',host_kind:'g5_site',host_id:'site-full',source_kind:'migration',scene_template_ref:{entity_id:'scene'},materialization_trace_id:'trace',materializer_version:'m',catalog_digest:'c',status:'active',state_version:0,created_change_set_id:'cs',updated_change_set_id:'cs'}),
    common('party_g6_instances',{id:'g6',scene_baseline_id:'base',source_scene_template_ref:{entity_id:'scene'},scene_slot_key:'slot',host_kind:'g5_site',host_id:'site-full',physical_class_id:'class',primary_scene_role_id:'role',vertical_context_id:'v',overhead_cover_id:'o',intra_g6_visibility_mode:'default_clear',default_visibility_distance_band:'near',acoustic_uniformity:'uniform',status:'active',state_version:0,created_change_set_id:'cs',updated_change_set_id:'cs'}),
    common('scene_position_nodes',{id:'pos',g6_instance_id:'g6',position_type_id:'floor',template_slot_key:'p',template_instance_ordinal:0,capacity:9,access_class_id:'open',status:'active',state_version:0,created_change_set_id:'cs',updated_change_set_id:'cs'}),
    ...['npc:n','item:i','container:c'].map((id) => { const [entity_kind,entity_id]=id.split(':'); return common('entity_placements',{entity_kind,entity_id,placement_kind:'scene_position',position_node_id:'pos',occupies_capacity_units:1,state_version:0,updated_change_set_id:'cs'}); }),
    common('party_entity_controls',{entity_kind:'item',entity_id:'i',owner_ref:{entity_id:'pc'},holder_ref:{entity_id:'pc'},controller_ref:{entity_id:'pc'},access_profile_ref:{entity_id:'access'},capacity_units:1,state_version:0,updated_change_set_id:'cs'}),
    common('party_npc_spatial_schedules',{id:'sched',npc_id:'n',current_position_node_id:'pos',schedule_profile_ref:{entity_id:'schedule'},dependency_pins:{p:1},causal_state_ref:{id:'cause'},status:'active',state_version:0,updated_change_set_id:'cs'}),
    common('party_containers',{container_id:'c',run_id:'run',template_id:'ct',holder_character_id:'pc',physical_position:'hands',closure_state:'open'}),
    common('party_items',{item_id:'i',run_id:'run',template_id:'it',profile_id:'profile',category_id:'category',quantity:1,condition_state:'new',legal_status:'legal'}),
    common('party_item_placements',{item_id:'i',holder_character_id:'pc',physical_position:'hands'}),
    common('party_ownership',{ownership_id:'own',item_id:'i',owner_character_id:'pc',controller_character_id:'pc',claim_state:'owned'})
  ];
  const journeyRows = [
    common('party_route_plans',{id:'plan',journey_owner_ref:{entity_id:'pc'},journey_scope:'world_travel',request_kind:'migration',administrative_authorization_pins:{approved:true},planning_request_id:'req',path_query_digest:'pq',option_id:'opt',knowledge_scope:'factual',source_endpoint_snapshot:{id:'from'},target_request:{id:'to'},resolved_factual_target_ref:{id:'to'},target_resolution_dependency_pins:{p:1},world_revision_id:'w',catalog_digest:'c',planning_algorithm_version:'v',planning_state_version:0,planning_context_dependency_pins:{p:1},canonical_serialization_digest:'serial',status:'ready',lifecycle_state_version:1,created_change_set_id:'cs',lifecycle_change_set_id:'cs',created_at_turn:0}),
    {table:'party_route_plan_steps',values:{route_plan_id:'plan',ordinal:0,step_kind:'timed_traversal',departure_endpoint_snapshot:{id:'from'},arrival_endpoint_snapshot:{id:'to'},static_contract_snapshot:{snapshot_kind:'timed_traversal',segment_id:'seg'}},source_identity:fullSource.source_identity,evidence:fullSource.evidence,pin_mapping:fullSource.pin_mapping},
    common('party_route_plan_executions',{id:'exec',route_plan_id:'plan',journey_owner_ref:{entity_id:'pc'},journey_scope:'world_travel',status:'planned',current_step_ordinal:0,current_endpoint_ref:{id:'from'},state_version:1,updated_change_set_id:'cs'}),
    {table:'party_route_plan_execution_events',values:{execution_id:'exec',event_ordinal:0,event_kind:'planned',to_status:'planned',step_ordinal:0,location_snapshot:{id:'from'},change_set_id:'cs',idempotency_record_id:'idem',occurred_at_turn:0},source_identity:fullSource.source_identity,evidence:fullSource.evidence,pin_mapping:fullSource.pin_mapping},
    common('traveller_travel_states',{id:'travel',route_plan_execution_id:'exec',plan_step_ordinal:0,movement_carrier_ref:{entity_id:'carrier'},segment_progress_ppm:500000,cumulative_actual_time_numerator:0,cumulative_actual_time_denominator:1,next_interval_ordinal:0,intended_direction_id:'east',navigation_state:'on_course',last_confirmed_endpoint_ref:{id:'from'},status:'active',state_version:1,updated_change_set_id:'cs'}),
    common('party_route_anchor_identities',{id:'anchor',anchor_kind:'migration_checkpoint',source_dependency_pins:{p:1},factual_context_snapshot:{id:'fact'},status:'active',resolution_kind:'persistent_consequence',state_version:0,created_change_set_id:'cs',updated_change_set_id:'cs'}),
    { table:'party_route_anchor_location_bindings', values:{id:'anchor-bind',route_anchor_id:'anchor',scene_baseline_id:'base',g6_instance_id:'g6',position_node_id:'pos',dependency_pins:{p:1},status:'active',state_version:0,activated_change_set_id:'cs'}, source_identity:fullSource.source_identity,evidence:fullSource.evidence,pin_mapping:fullSource.pin_mapping }
  ];
  const journey = {id:'journey',source_identity:fullSource.source_identity,evidence:fullSource.evidence,classification:'reconstructable',segment_id:'seg',direction_id:'east',carrier_id:'carrier',progress_ppm:500000,pin_mapping:fullSource.pin_mapping,reviewed_target_rows:journeyRows.slice(0,5)};
  const g5 = {id:'site-full',source_identity:fullSource.source_identity,evidence:fullSource.evidence,classification:'canonical_projection',canonical_g5_ref:{entity_id:'g5-full',authoring_version:1},pin_mapping:fullSource.pin_mapping,target_site:{id:'site-full',parent_g4_id:'g4'}};
  const fullDry = await applySpatialV3PartyMigration(pool,{inventory:buildSpatialV3MigrationInventory({party_records:[fullMapping]}),source_extract:fullExtract,party_id:'p',change_set_id:'cs',g5_records:[g5],target_rows:dynamic,journeys:[journey],dry_run:true}); assert.equal(fullDry.ok,true);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM party_runtime.party_route_plans WHERE id='plan'")).rows[0].n,0);
  const full = await applySpatialV3PartyMigration(pool,{inventory:buildSpatialV3MigrationInventory({party_records:[fullMapping]}),source_extract:fullExtract,party_id:'p',change_set_id:'cs',g5_records:[g5],target_rows:dynamic,journeys:[journey]});
  assert.equal(full.ok,true); assert.equal((await pool.query("SELECT count(*)::int AS n FROM party_runtime.party_entity_controls WHERE entity_id='i'")).rows[0].n,1); assert.equal((await pool.query("SELECT segment_progress_ppm FROM party_runtime.traveller_travel_states WHERE id='travel'")).rows[0].segment_progress_ppm,500000);

  // Safe explicit anchors are not an in-memory classification-only branch: the
  // reviewed approval, evidence, pins and both P14 anchor rows travel through
  // the real isolated PostgreSQL migration and read back from the target.
  const anchorJourney = {id:'anchor-journey',source_identity:fullSource.source_identity,evidence:fullSource.evidence,classification:'safe_explicit_anchor',anchor_id:'anchor',anchor_approved:true,approved_anchor_evidence:'review-board:anchor',pin_mapping:fullSource.pin_mapping,reviewed_target_rows:journeyRows.slice(5)};
  const missingApproval = await applySpatialV3PartyMigration(pool,{inventory:buildSpatialV3MigrationInventory({party_records:[fullMapping]}),source_extract:fullExtract,party_id:'p',change_set_id:'cs-anchor-denied',journeys:[{...anchorJourney,anchor_approved:false}]});
  assert.equal(missingApproval.ok,false); assert.ok(missingApproval.errors.some((error) => error.code === 'journey_migration_gap'));
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM party_runtime.party_route_anchor_identities WHERE id='anchor'")).rows[0].n,0, 'missing approval must write no anchor');
  const anchored = await applySpatialV3PartyMigration(pool,{inventory:buildSpatialV3MigrationInventory({party_records:[fullMapping]}),source_extract:fullExtract,party_id:'p',change_set_id:'cs-anchor',journeys:[anchorJourney]});
  assert.equal(anchored.ok,true); assert.equal(anchored.journey_modes[0],'safe_explicit_anchor');
  const anchorReadback = await pool.query("SELECT a.id, b.position_node_id FROM party_runtime.party_route_anchor_identities a JOIN party_runtime.party_route_anchor_location_bindings b ON b.route_anchor_id=a.id WHERE a.id='anchor'");
  assert.deepEqual(anchorReadback.rows,[{id:'anchor',position_node_id:'pos'}]);
});
