import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
const docker=(args,input)=>spawnSync('docker',args,{input,encoding:'utf8',timeout:45_000});
const name=`p11-ddl-${process.pid}`;
test('P11 applies fresh, reapplies, and rejects malformed finite scene authoring', async(t)=>{
  if(docker(['version']).status!==0)t.skip('Docker required for isolated P11 PostgreSQL test');
  t.after(()=>docker(['rm','-f',name]));
  assert.equal(docker(['run','-d','--name',name,'-e','POSTGRES_PASSWORD=p11_local_only','-e','POSTGRES_USER=p11','-e','POSTGRES_DB=p11','postgres:16-alpine']).status,0);
  let ready=false; for(let i=0;i<40;i+=1){await new Promise(r=>setTimeout(r,350));if(docker(['exec',name,'pg_isready','-U','p11','-d','p11']).status===0){await new Promise(r=>setTimeout(r,500));if(docker(['exec',name,'pg_isready','-U','p11','-d','p11']).status===0){ready=true;break;}}} assert.equal(ready,true);
  const sql=(await Promise.all(Array.from({length:14},(_,i)=>readFile(`infra/world-base/schema/${String(i+1).padStart(2,'0')}.sql`,'utf8')))).join('\n');
  const psql=(statement)=>docker(['exec','-i',name,'psql','-q','-v','ON_ERROR_STOP=1','-U','p11','-d','p11'],statement);
  assert.equal(psql(sql).status,0); assert.equal(psql(await readFile('infra/world-base/schema/14.sql','utf8')).status,0);
  for(const statement of [
    "INSERT INTO world_base.spatial_v3_g6_template_slots (scene_template_id,scene_template_version,scene_slot_key,physical_class_id,primary_scene_role_id,vertical_context_id,overhead_cover_id,intra_g6_visibility_mode,default_visibility_distance_band,acoustic_uniformity) VALUES ('x',1,'g','spatial.g6.open','r','surface','none','default_clear',NULL,'uniform');",
    "INSERT INTO world_base.spatial_v3_expansion_slots (id,version,world_revision_id,profile_id,profile_version,g4_id,g4_version,continuation_role,max_instances,terminal_policy_id,terminal_policy_version,status,provenance_ref,canonical_digest) VALUES ('x',1,'missing','p',1,'g',1,'through',1,'t',1,'approved','s',repeat('a',64));",
    "INSERT INTO world_base.spatial_v3_scene_movement_edge_templates (scene_template_id,scene_template_version,edge_slot_key,from_position_slot_key,to_position_slot_key,passage_type_id,transition_environment_profile_id,transition_environment_profile_version,movement_orientation_profile_id,movement_orientation_profile_version,cost_kind) VALUES ('x',1,'bad','a','b','p','e',1,'o',1,'time');",
    "INSERT INTO world_base.spatial_v3_g5_successor_frontier_rules (g5_template_id,g5_template_version,ordinal,successor_kind,target_expansion_slot_id,target_expansion_slot_version,scene_endpoint_slot_key,terminal_policy_id,terminal_policy_version) VALUES ('x',1,0,'through_successor','slot',1,'departure','terminal',1);",
    "INSERT INTO world_base.spatial_v3_portal_state_template_behaviors (portal_template_id,portal_template_version,relation_kind,state,behavior_id,behavior_version) VALUES ('missing',1,'movement','open','behavior',1);"
  ]) assert.notEqual(psql(statement).status,0,statement);
  // A complete approved scene authoring fixture proves that deferred validators
  // accept valid staging, then reject direct mutations of the approved graph.
  const approvedScene = `
    INSERT INTO world_base.source_records (id,status) VALUES ('p11-src','approved');
    INSERT INTO world_base.spatial_v3_world_revisions (id,catalog_digest,status,provenance_ref) VALUES ('p11-rev',repeat('a',64),'approved','p11-src');
    BEGIN;
    INSERT INTO world_base.spatial_v3_scene_templates VALUES ('p11-scene',1,'p11-rev','regional',1,'approved','p11-src',repeat('b',64));
    INSERT INTO world_base.spatial_v3_scene_templates VALUES ('p11-scene-extra',1,'p11-rev','regional',1,'retired','p11-src',repeat('c',64));
    INSERT INTO world_base.spatial_v3_scene_materialization_profiles VALUES ('p11-profile',1,'p11-rev','route_anchor_template','anchor',1,'selection',1,'approved','p11-src',repeat('d',64));
    INSERT INTO world_base.spatial_v3_scene_materialization_candidates VALUES ('p11-profile',1,'p11-scene',1,1,NULL,NULL);
    INSERT INTO world_base.spatial_v3_g6_template_slots VALUES ('p11-scene',1,'inside','spatial.g6.enclosed','role','surface','full','default_clear','near','uniform',NULL);
    INSERT INTO world_base.spatial_v3_scene_position_templates VALUES ('p11-scene',1,'a','inside',1,'standing',1,'public'),('p11-scene',1,'b','inside',1,'standing',1,'public');
    INSERT INTO world_base.spatial_v3_scene_endpoint_slots VALUES ('p11-scene',1,'branch-endpoint','departure','a',0);
    INSERT INTO world_base.spatial_v3_scene_movement_edge_templates (scene_template_id,scene_template_version,edge_slot_key,from_position_slot_key,to_position_slot_key,passage_type_id,transition_environment_profile_id,transition_environment_profile_version,movement_orientation_profile_id,movement_orientation_profile_version,cost_kind,action_units) VALUES ('p11-scene',1,'walk','a','b','passage','environment',1,'orientation',1,'action',1);
    COMMIT;`;
  const fixture = psql(approvedScene);
  assert.equal(fixture.status,0,fixture.stderr);
  const approvedExpansion = `BEGIN;
    INSERT INTO world_base.universal_categories (id,domain,stable_code,facet,preferred_label,definition,scope_note,inclusion_rules,exclusion_rules,title,status) VALUES ('p11-cat','spatial','p11-cat','class','P11 class','d','s','i','e','t','approved');
    INSERT INTO world_base.spatial_v3_authoring_versions (entity_kind,entity_id,version,world_revision_id,canonical_digest,status,provenance_ref) VALUES ('spatial_node','p11-g0',1,'p11-rev',repeat('1',64),'approved','p11-src'),('spatial_node','p11-g1',1,'p11-rev',repeat('2',64),'approved','p11-src'),('spatial_node','p11-g2',1,'p11-rev',repeat('3',64),'approved','p11-src'),('spatial_node','p11-g3',1,'p11-rev',repeat('4',64),'approved','p11-src'),('spatial_node','p11-g4',1,'p11-rev',repeat('5',64),'approved','p11-src');
    INSERT INTO world_base.spatial_v3_nodes (id,version,world_revision_id,spatial_level,primary_class_id,evidence_status,traversal_model,status,provenance_ref,canonical_digest) VALUES ('p11-g0',1,'p11-rev','G0','p11-cat','reviewed',NULL,'approved','p11-src',repeat('1',64)),('p11-g1',1,'p11-rev','G1','p11-cat','reviewed',NULL,'approved','p11-src',repeat('2',64)),('p11-g2',1,'p11-rev','G2','p11-cat','reviewed',NULL,'approved','p11-src',repeat('3',64)),('p11-g3',1,'p11-rev','G3','p11-cat','reviewed',NULL,'approved','p11-src',repeat('4',64)),('p11-g4',1,'p11-rev','G4','p11-cat','reviewed','bounded','approved','p11-src',repeat('5',64));
    INSERT INTO world_base.spatial_v3_node_classes SELECT id,1,'p11-cat',0 FROM world_base.spatial_v3_nodes WHERE id LIKE 'p11-g%';
    INSERT INTO world_base.spatial_v3_node_parents VALUES ('p11-g1',1,'p11-g0',1,'p11-rev'),('p11-g2',1,'p11-g1',1,'p11-rev'),('p11-g3',1,'p11-g2',1,'p11-rev'),('p11-g4',1,'p11-g3',1,'p11-rev');
    INSERT INTO world_base.spatial_v3_g1_grid_cells VALUES ('p11-g1',1,'p11-rev','p11-g0',1,'grid_east_north_v1',0,0,'P11');
    INSERT INTO world_base.spatial_v3_terminal_policies VALUES ('p11-terminal',1,'p11-rev','connect_existing',NULL,NULL,'approved','p11-src',repeat('6',64));
    INSERT INTO world_base.spatial_v3_g4_expansion_profiles VALUES ('p11-expansion',1,'p11-rev','p11-g4',1,'adjacency',1,'connectivity',1,'seed',1,'approved','p11-src',repeat('7',64));
    INSERT INTO world_base.spatial_v3_scene_materialization_profiles VALUES ('p11-template-profile',1,'p11-rev','g5_generation_template','p11-template',1,'selection',1,'approved','p11-src',repeat('8',64));
    INSERT INTO world_base.spatial_v3_scene_materialization_candidates VALUES ('p11-template-profile',1,'p11-scene',1,1,NULL,NULL);
    INSERT INTO world_base.spatial_v3_g5_generation_templates VALUES ('p11-template',1,'p11-rev','spatial.g5.parcel','regional',1,'p11-template-profile',1,'approved','p11-src',repeat('8',64));
    INSERT INTO world_base.spatial_v3_expansion_profile_template_limits VALUES ('p11-expansion',1,'p11-template',1,1);
    INSERT INTO world_base.spatial_v3_expansion_slots (id,version,world_revision_id,profile_id,profile_version,g4_id,g4_version,continuation_role,max_instances,terminal_policy_id,terminal_policy_version,status,provenance_ref,canonical_digest) VALUES ('p11-slot',1,'p11-rev','p11-expansion',1,'p11-g4',1,'branch',1,'p11-terminal',1,'approved','p11-src',repeat('9',64));
    INSERT INTO world_base.spatial_v3_expansion_slot_templates VALUES ('p11-slot',1,'p11-template',1,1,NULL,NULL);
    INSERT INTO world_base.spatial_v3_g5_successor_frontier_rules (g5_template_id,g5_template_version,ordinal,source_expansion_slot_id,source_expansion_slot_version,successor_kind,target_expansion_slot_id,target_expansion_slot_version,scene_endpoint_slot_key,terminal_policy_id,terminal_policy_version) VALUES ('p11-template',1,0,'p11-slot',1,'branch_frontier','p11-slot',1,'branch-endpoint','p11-terminal',1);
    COMMIT;`;
  const expansionResult=psql(approvedExpansion); assert.equal(expansionResult.status,0,expansionResult.stderr);
  assert.notEqual(psql("BEGIN; DELETE FROM world_base.spatial_v3_g5_successor_frontier_rules WHERE g5_template_id='p11-template'; COMMIT;").status,0,'approved template requires a successor rule');
  assert.notEqual(psql("BEGIN; UPDATE world_base.spatial_v3_g5_successor_frontier_rules SET successor_kind='through_successor' WHERE g5_template_id='p11-template'; COMMIT;").status,0,'successor role must match its source and target slots');
  assert.notEqual(psql("BEGIN; UPDATE world_base.spatial_v3_g5_generation_templates SET scene_materialization_profile_id='p11-profile' WHERE id='p11-template'; COMMIT;").status,0,'template profile must be pinned to its exact generation template');
  assert.notEqual(psql("BEGIN; UPDATE world_base.spatial_v3_g5_successor_frontier_rules SET scene_endpoint_slot_key='missing' WHERE g5_template_id='p11-template'; COMMIT;").status,0,'successor endpoint must exist for every chosen scene template');
  assert.notEqual(psql("BEGIN; INSERT INTO world_base.spatial_v3_scene_materialization_candidates VALUES ('p11-template-profile',1,'p11-scene-extra',1,1,NULL,NULL); COMMIT;").status,0,'every template-profile candidate must support its successor endpoint');
  assert.equal(psql("BEGIN; INSERT INTO world_base.spatial_v3_scene_materialization_candidates VALUES ('p11-profile',1,'p11-scene-extra',1,1,NULL,NULL); COMMIT;").status,0,'approved profile accepts a finite multi-candidate set');
  for (const mutation of [
    "DELETE FROM world_base.spatial_v3_scene_materialization_candidates WHERE profile_id='p11-profile';",
    "INSERT INTO world_base.spatial_v3_scene_position_templates VALUES ('p11-scene',1,'disconnected','inside',1,'standing',1,'public');"
  ]) assert.notEqual(psql(`BEGIN; ${mutation} COMMIT;`).status,0,`approved scene mutation must fail: ${mutation}`);
  const portalFixture = `BEGIN;
    INSERT INTO world_base.spatial_v3_portal_templates VALUES ('p11-portal',1,'p11-scene',1,'door','door','closed',NULL,'approved','p11-src',repeat('e',64));
    INSERT INTO world_base.spatial_v3_portal_state_template_behaviors VALUES
      ('p11-portal',1,'movement','open','allow',1),('p11-portal',1,'movement','closed','block',1),('p11-portal',1,'movement','locked','block',1),('p11-portal',1,'movement','destroyed','allow',1);
    INSERT INTO world_base.spatial_v3_scene_movement_edge_templates (scene_template_id,scene_template_version,edge_slot_key,from_position_slot_key,to_position_slot_key,passage_type_id,transition_environment_profile_id,transition_environment_profile_version,movement_orientation_profile_id,movement_orientation_profile_version,cost_kind,action_units,portal_template_id,portal_template_version,availability_condition_set_id,availability_condition_set_version) VALUES ('p11-scene',1,'door-edge','b','a','doorway','environment',1,'orientation',1,'action',1,'p11-portal',1,'condition',1);
    COMMIT;`;
  const portalResult=psql(portalFixture); assert.equal(portalResult.status,0,portalResult.stderr);
  assert.notEqual(psql("BEGIN; DELETE FROM world_base.spatial_v3_portal_state_template_behaviors WHERE portal_template_id='p11-portal' AND relation_kind='movement' AND state='locked'; COMMIT;").status,0,'all four portal movement states are required');
});
