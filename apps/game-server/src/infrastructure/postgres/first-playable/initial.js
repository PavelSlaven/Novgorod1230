import {
  CONTENT_DIGEST, HIGH_G5, LANDING_G5, START_G4, hash, json, ref
} from '../../../runtime/first-playable/shared.js';
import { insertBoatAndInventory } from './inventory.js';
import { tableExists } from './repository-support.js';

export async function insertInitialParty(tx, { state, screen, release, runtimeCatalogPin, now }) {
  const partyId = state.party_id;
  const changeSet = `change:${partyId}:start`;
  const runId = `run:${partyId}:baseline`;
  const highSite = `site:${partyId}:high`;
  const landingSite = `site:${partyId}:landing`;
  const highBaseline = `baseline:${partyId}:high`;
  const landingBaseline = `baseline:${partyId}:landing`;
  const highG6 = `g6:${partyId}:high`;
  const landingG6 = `g6:${partyId}:landing`;
  const highPosition = `position:${partyId}:high`;
  const landingPosition = `position:${partyId}:landing`;
  const zero = '0'.repeat(64);
  await tx.query(
    `INSERT INTO party_runtime.parties
      (party_id,schema_version,world_revision_id,world_catalog_digest,
       materializer_version,rng_version,command_catalog_digest,
       profile_bundle_digest,state_version,status)
     VALUES ($1,3,$2,$3,'first-playable-materializer@1','request-bound-sha256@1',
       $4,$5,0,'active')`,
    [partyId, release.world_revision_id, release.world_catalog_digest, CONTENT_DIGEST, CONTENT_DIGEST]
  );
  await tx.query(
    `INSERT INTO party_runtime.party_v3_change_sets
      (id,party_id,operation_kind,expected_state_version_set_digest,
       expected_state_version_set,committed_state_version_set_digest,
       write_plan_digest,created_at_turn,committed_at_turn)
     VALUES ($1,$2,'new_game',$3,'[]'::jsonb,$3,$3,0,0)`,
    [changeSet, partyId, zero]
  );
  await tx.query(
    `INSERT INTO party_runtime.party_materialization_runs
      (party_id,run_id,g4_id,run_kind,seed_digest,input_digest,catalog_digest,
       materializer_version,rng_version,result_digest,idempotency_key,status,
       validation_report,trace,created_refs,committed_at)
     VALUES ($1,$2,$3,'baseline',$4,$4,$5,'first-playable-materializer@1',
       'request-bound-sha256@1',$4,$6,'committed','{"pass":true}'::jsonb,
       '{}'::jsonb,'[]'::jsonb,$7::timestamptz)`,
    [partyId, runId, START_G4, hash(state.request_id), runtimeCatalogPin.catalog_digest,
      `first-entry:${partyId}:baseline`, now]
  );
  if (await tableExists(tx, 'party_runtime.party_catalog_pins')) {
    await tx.query(
      `INSERT INTO party_runtime.party_catalog_pins
       (party_id,catalog_scope,catalog_revision_id,catalog_digest,import_id,
        import_audit_digest,record_registry_digest,runtime_contract_digest,
        compatible_world_revision_id,compatible_world_catalog_digest,
        compatible_world_pin_manifest_digest,activation_event_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [partyId, runtimeCatalogPin.catalog_scope, runtimeCatalogPin.catalog_revision_id,
        runtimeCatalogPin.catalog_digest, runtimeCatalogPin.import_id,
        runtimeCatalogPin.import_audit_digest, runtimeCatalogPin.record_registry_digest,
        runtimeCatalogPin.runtime_contract_digest, runtimeCatalogPin.compatible_world_revision_id,
        runtimeCatalogPin.compatible_world_catalog_digest,
        runtimeCatalogPin.compatible_world_pin_manifest_digest,
        runtimeCatalogPin.activation_event_id]
    );
    await tx.query(
      `INSERT INTO party_runtime.party_materialization_run_catalog_pins
       (party_id,run_id,catalog_scope,catalog_revision_id,catalog_digest,
        import_id,import_audit_digest,record_registry_digest,runtime_contract_digest,
        activation_event_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [partyId, runId, runtimeCatalogPin.catalog_scope,
        runtimeCatalogPin.catalog_revision_id, runtimeCatalogPin.catalog_digest,
        runtimeCatalogPin.import_id, runtimeCatalogPin.import_audit_digest,
        runtimeCatalogPin.record_registry_digest, runtimeCatalogPin.runtime_contract_digest,
        runtimeCatalogPin.activation_event_id]
    );
  }
  for (const [id, canonicalG5] of [[highSite, HIGH_G5], [landingSite, LANDING_G5]]) {
    await tx.query(
      `INSERT INTO party_runtime.party_g5_sites
       (id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,
        created_change_set_id,updated_change_set_id)
       VALUES ($1,$2,'canonical',$3,$4::jsonb,'active',1,$5,$5)`,
      [id, partyId, START_G4, json(ref('canonical_g5', canonicalG5, 2)), changeSet]
    );
  }
  for (const row of [
    [highBaseline, highSite, highG6, highPosition, 'high_platform'],
    [landingBaseline, landingSite, landingG6, landingPosition, 'landing_edge']
  ]) {
    await tx.query(
      `INSERT INTO party_runtime.party_scene_baselines
       (id,party_id,host_kind,host_id,source_kind,scene_template_ref,
        materialization_trace_id,materializer_version,catalog_digest,status,
        state_version,created_change_set_id,updated_change_set_id)
       VALUES ($1,$2,'g5_site',$3,'canonical_template',$4::jsonb,$5,
        'first-playable-materializer@1',$6,'active',1,$7,$7)`,
      [row[0], partyId, row[1], json(ref('scene_template', 'stfv3__g5_open_ground_v1', 2)),
        runId, release.world_catalog_digest, changeSet]
    );
    await tx.query(
      `INSERT INTO party_runtime.party_g6_instances
       (id,party_id,scene_baseline_id,source_scene_template_ref,scene_slot_key,
        host_kind,host_id,physical_class_id,primary_scene_role_id,vertical_context_id,
        overhead_cover_id,intra_g6_visibility_mode,default_visibility_distance_band,
        acoustic_uniformity,status,state_version,created_change_set_id,updated_change_set_id)
       VALUES ($1,$2,$3,$4::jsonb,'main','g5_site',$5,'spatial.g6.outdoor',
        'scene.main','level','open_sky','default_clear','local','uniform','active',1,$6,$6)`,
      [row[2], partyId, row[0], json(ref('scene_template', 'stfv3__g5_open_ground_v1', 2)),
        row[1], changeSet]
    );
    await tx.query(
      `INSERT INTO party_runtime.scene_position_nodes
       (id,party_id,g6_instance_id,position_type_id,template_slot_key,
        template_instance_ordinal,capacity,access_class_id,status,state_version,
        created_change_set_id,updated_change_set_id)
       VALUES ($1,$2,$3,'standing',$4,0,8,'public','active',1,$5,$5)`,
      [row[3], partyId, row[2], row[4], changeSet]
    );
  }
  await tx.query(
    `INSERT INTO party_runtime.party_player_characters
     (party_id,character_id,profile) VALUES ($1,$2,$3::jsonb)`,
    [partyId, state.player.id, json(state.player)]
  );
  await tx.query(
    `INSERT INTO party_runtime.party_actor_profile_bindings
     (party_id,actor_kind,actor_id,role_ref,occupation_ref,skill_profile_snapshot,
      name_profile_snapshot,language_profile_snapshot,knowledge_profile_snapshot,
      profile_candidate_set_digest,state_version,created_change_set_id,updated_change_set_id)
     VALUES ($1,'player_character',$2,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,
      $7::jsonb,$8::jsonb,$9,1,$10,$10)`,
    [partyId, state.player.id, json(ref('role', state.player.role_id)),
      json(ref('occupation', state.player.occupation_id)), json(state.player.skills),
      json({ name_id: state.player.name_id, display_name: state.player.name }),
      json(state.player.language_profile),
      json(state.player.knowledge_profile),
      state.player.profile_candidate_set_digest, changeSet]
  );
  await tx.query(
    `INSERT INTO party_runtime.party_actor_body_states
     (party_id,actor_kind,actor_id,body_profile_ref,health,energy,satiety,
      state_version,updated_change_set_id)
     VALUES ($1,'player_character',$2,$3::jsonb,$4,$5,$6,1,$7)`,
    [partyId, state.player.id, json(ref('body_profile', state.player.body_profile_id)),
      state.player.health, state.player.energy, state.player.satiety, changeSet]
  );
  await tx.query(
    `INSERT INTO party_runtime.party_clocks
     (party_id,whole_minutes,subminute_numerator,subminute_denominator,
      clock_owner_kind,state_version,updated_change_set_id)
     VALUES ($1,0,0,1,'party',1,$2)`,
    [partyId, changeSet]
  );
  await tx.query(
    `INSERT INTO party_runtime.party_journey_locations
     (id,party_id,owner_kind,owner_id,location_kind,scene_position_id,
      state_version,updated_change_set_id)
     VALUES ($1,$2,'actor',$3,'scene',$4,1,$5)`,
    [`location:${partyId}:player`, partyId, state.player.id, highPosition, changeSet]
  );
  if (state.boat) {
    await insertBoatAndInventory(tx, {
      state, changeSet, runId, landingPosition
    });
  }
  await tx.query(
    `INSERT INTO party_runtime.party_state_snapshots
     (party_id,state_version,state_payload,state_digest)
     VALUES ($1,0,$2::jsonb,$3)`,
    [partyId, json(state), hash(json(state))]
  );
  await tx.query(
    `INSERT INTO party_runtime.party_server_sessions
     (party_id,request_id,stage26_result,delivery_attempt,delivery_ack_result,
      screen,turn_number,last_turn_id)
     VALUES ($1,$2,NULL,$3::jsonb,NULL,$4::jsonb,0,NULL)`,
    [partyId, state.request_id, json({ status: 'sent' }), json(screen)]
  );
}
