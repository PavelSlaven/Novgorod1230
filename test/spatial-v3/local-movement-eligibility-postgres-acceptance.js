import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { buildTransactionalImportSql } from '../../tools/spatial-v3/p12-authoring-importer.mjs';
import { createSpatialV3LocalMovementEligibilityReader } from
  '../../apps/game-server/src/infrastructure/postgres/spatial-v3-local-movement-eligibility.js';
import { createSpatialV3LocalSceneRuntime } from '../../apps/game-server/src/runtime/spatial-v3-local-scene-runtime.js';
import { recheckS1LocalMovement } from '../../apps/game-server/src/infrastructure/postgres/first-playable/recheck-s1-local-movement.js';

const directory = 'data/world-catalogs/novgorod/m2c-scene-movement-edges/local-movement-eligibility-v1';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Isolated DB only: existing approved expansion bundle must already be imported. */
export async function assertLocalMovementEligibilityPostgres(pool) {
  const approval = JSON.parse(await readFile('data/world-catalogs/novgorod/m2c-sol-data-approval.json'));
  const bytes = await readFile(`${directory}/datasets/spatial_v3_local_movement_eligibility_profiles.json`);
  assert.equal(digest(bytes), approval.local_movement_eligibility_mapped_approval.dataset_sha256);
  assert.equal(digest(await readFile(`${directory}/manifest.json`)),
    approval.local_movement_eligibility_mapped_approval.manifest_sha256);
  const policies = JSON.parse(bytes);
  const original = await pool.query('SELECT * FROM world_base.spatial_v3_scene_movement_edge_templates ORDER BY scene_template_id,edge_slot_key');
  const sql = await buildTransactionalImportSql({ manifestPath: `${directory}/manifest.json` });
  await pool.query(sql);
  await pool.query(sql);
  const imported = (await pool.query('SELECT * FROM world_base.spatial_v3_local_movement_eligibility_profiles ORDER BY id')).rows;
  assert.deepEqual(imported, policies.toSorted((a, b) => a.id.localeCompare(b.id)));
  assert.deepEqual((await pool.query('SELECT * FROM world_base.spatial_v3_scene_movement_edge_templates ORDER BY scene_template_id,edge_slot_key')).rows, original.rows);
  await assert.rejects(pool.query('UPDATE world_base.spatial_v3_local_movement_eligibility_profiles SET max_root_owners_per_transition=2'), /append-only/u);
  for (const file of ['001_party_runtime.sql', '002_party_runtime_v3.sql',
    '003_party_runtime_v3_planning.sql', '004_party_runtime_v3_journeys.sql']) {
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
  const policy = policies.find((row) => row.scene_template_id === 'stfv3__g5_route_approach_v1'
    && row.from_position_slot_key === 'arrival');
  await seed(pool, policy);
  const pins = policies.map((row) => Object.fromEntries(['id', 'version', 'world_revision_id',
    'canonical_digest'].map((key) => [key, row[key]])));
  const readLocalMovementEligibility = createSpatialV3LocalMovementEligibilityReader({ worldPool: pool, pins });
  // Visibility is an explicit test owner. This test does not authorize production disclosure.
  const visible = async () => ['edge_1', 'edge_2', 'edge_3', 'edge_4'];
  const runtime = createSpatialV3LocalSceneRuntime({ pool, readLocalMovementEligibility, readVisibleLocalEdgeRefs: visible });
  const input = { partyId: 'adjunct-party', actorId: 'actor', state: state('arrival', 1) };
  assert.deepEqual(await createSpatialV3LocalSceneRuntime({ pool,
    readLocalMovementEligibility }).listLocalOptions(input), [], 'topology and policy grant no visibility');
  assert.deepEqual(await createSpatialV3LocalSceneRuntime({ pool,
    readVisibleLocalEdgeRefs: visible }).listLocalOptions(input), [], 'one-way edges need explicit imported adjunct');
  const prepared = await runtime.prepareLocalMovement({ ...input, edgeId: policy.edge_slot_key,
    playerInput: {}, inputDigest: 'adjunct-move' });
  const admission = prepared.position_transition.movement_admission;
  assert.equal(admission.reverse_edge_id, null);
  assert.equal(admission.edge_capacity, null);
  assert.equal(admission.max_root_owners_per_transition, 1);
  assert.equal(admission.opposing_edge_id, policy.opposing_edge_slot_key);
  const check = { actor_id: 'actor', journey_location_id: 'adjunct-journey', expected_journey_state_version: 1,
    from_position_ref: 'arrival', to_position_ref: 'focus', movement_edge_ref: policy.edge_slot_key,
    movement_admission: admission };
  const transaction = await pool.connect();
  const visibilityProof = async ({ transaction: tx, actorId, edgeId, positionId }) => {
    assert.equal(tx, transaction);
    assert.equal(actorId, 'actor');
    return { ok: edgeId === policy.edge_slot_key && positionId === 'arrival' };
  };
  const recheck = (value = check, reader = readLocalMovementEligibility, visibility = visibilityProof) => recheckS1LocalMovement({
    transaction, partyId: 'adjunct-party', check: value, readLocalMovementEligibility: reader,
    recheckLocalMovementVisibility: visibility });
  try {
    await transaction.query('BEGIN');
    assert.equal((await recheck()).ok, true);
    assert.equal((await recheck(check, null)).ok, false);
    assert.equal((await recheck(check, readLocalMovementEligibility, null)).ok, false);
    assert.equal((await recheck(check, readLocalMovementEligibility, async () => ({ ok: false }))).ok, false);
    const wrongPin = structuredClone(check);
    wrongPin.movement_admission.local_movement_eligibility_ref.canonical_digest = '0'.repeat(64);
    assert.equal((await recheck(wrongPin)).ok, false);
    await transaction.query('SAVEPOINT admission');
    await transaction.query("UPDATE party_runtime.scene_movement_edges SET state_version=2 WHERE id=$1", [admission.opposing_edge_id]);
    assert.equal((await recheck()).ok, false, 'changed opposing version rejected');
    await transaction.query('ROLLBACK TO SAVEPOINT admission');
    await transaction.query("UPDATE party_runtime.scene_movement_edges SET status='superseded',terminal_change_set_id='terminal' WHERE id=$1", [admission.opposing_edge_id]);
    assert.equal((await recheck()).ok, false, 'inactive opposite direction rejected');
    await transaction.query('ROLLBACK TO SAVEPOINT admission');
    await transaction.query(`INSERT INTO party_runtime.entity_placements
      (party_id,entity_kind,entity_id,placement_kind,position_node_id,occupies_capacity_units,state_version,updated_change_set_id)
      VALUES ('adjunct-party','npc','occupant','scene_position','focus',1,1,'seed')`);
    assert.equal((await recheck()).ok, false, 'unchanged position capacity one enforced');
    await transaction.query('ROLLBACK TO SAVEPOINT admission');
    await transaction.query("UPDATE party_runtime.parties SET world_catalog_digest='wrong' WHERE party_id='adjunct-party'");
    // Use same connection so the readback sees the uncommitted party world change.
    assert.equal((await recheck()).ok, false, 'party exact world digest enforced');
    await transaction.query('ROLLBACK TO SAVEPOINT admission');
    await transaction.query("UPDATE party_runtime.party_journey_locations SET scene_position_id='focus',state_version=2 WHERE id='adjunct-journey'");
    await transaction.query('ROLLBACK');
    assert.equal((await transaction.query("SELECT scene_position_id FROM party_runtime.party_journey_locations WHERE id='adjunct-journey'")).rows[0].scene_position_id, 'arrival');
    await transaction.query('BEGIN');
    assert.equal((await recheck()).ok, true);
    await transaction.query("UPDATE party_runtime.party_journey_locations SET scene_position_id='focus',state_version=2 WHERE id='adjunct-journey'");
    await transaction.query('COMMIT');
    assert.equal((await recheck()).ok, false, 'stale replay cannot move again');
    assert.deepEqual((await runtime.listLocalOptions({ ...input, state: state('focus', 2) }))
      .map((row) => row.edge_id), ['edge_2', 'edge_3']);
    assert.deepEqual((await pool.query('SELECT DISTINCT reverse_edge_id,capacity FROM party_runtime.scene_movement_edges')).rows,
      [{ reverse_edge_id: null, capacity: null }]);
  } finally { await transaction.query('ROLLBACK'); transaction.release(); }
}

function state(position, version) {
  return { party_id: 'adjunct-party', actor_id: 'actor', party_state: { state_version: 1 },
    position: { position_id: position }, journey_location: { id: 'adjunct-journey',
      scene_position_id: position, state_version: version } };
}

async function seed(pool, policy) {
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
    SELECT 'adjunct-party',3,id,catalog_digest,'fixture','fixture','fixture','fixture'
      FROM world_base.spatial_v3_world_revisions WHERE id=$1`, [policy.world_revision_id]);
  await pool.query(`INSERT INTO party_runtime.party_g5_sites
    (id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ('adjunct-site','adjunct-party','canonical','g4','{"entity_id":"canonical"}','active',1,'seed','seed')`);
  const template = { entity_id: policy.scene_template_id, authoring_version: String(policy.scene_template_version) };
  await pool.query(`INSERT INTO party_runtime.party_scene_baselines
    (id,party_id,host_kind,host_id,source_kind,scene_template_ref,materialization_trace_id,materializer_version,catalog_digest,status,state_version,created_change_set_id,updated_change_set_id)
    VALUES ('adjunct-baseline','adjunct-party','g5_site','adjunct-site','canonical_template',$1,'trace','fixture',$2,'active',1,'seed','seed')`, [template, policy.scene_template_digest]);
  await pool.query(`INSERT INTO party_runtime.party_g6_instances
    (id,party_id,scene_baseline_id,source_scene_template_ref,scene_slot_key,host_kind,host_id,physical_class_id,primary_scene_role_id,vertical_context_id,overhead_cover_id,intra_g6_visibility_mode,default_visibility_distance_band,acoustic_uniformity,status,state_version,created_change_set_id,updated_change_set_id)
    SELECT 'adjunct-g6','adjunct-party','adjunct-baseline',$1,scene_slot_key,'g5_site','adjunct-site',physical_class_id,primary_scene_role_id,vertical_context_id,overhead_cover_id,intra_g6_visibility_mode,default_visibility_distance_band,acoustic_uniformity,'active',1,'seed','seed'
      FROM world_base.spatial_v3_g6_template_slots WHERE scene_template_id=$2 AND scene_template_version=$3`, [template, policy.scene_template_id, policy.scene_template_version]);
  await pool.query(`INSERT INTO party_runtime.scene_position_nodes
    (id,party_id,g6_instance_id,position_type_id,template_slot_key,template_instance_ordinal,capacity,access_class_id,status,state_version,created_change_set_id,updated_change_set_id)
    SELECT position_slot_key,'adjunct-party','adjunct-g6',position_type_id,position_slot_key,0,capacity,access_class_id,'active',1,'seed','seed'
      FROM world_base.spatial_v3_scene_position_templates WHERE scene_template_id=$1 AND scene_template_version=$2`, [policy.scene_template_id, policy.scene_template_version]);
  await pool.query(`INSERT INTO party_runtime.scene_movement_edges
    (id,party_id,scene_baseline_id,source_scene_template_ref,source_edge_slot_key,from_position_id,to_position_id,passage_type_id,transition_environment_profile_ref,movement_orientation_profile_ref,cost_kind,action_units,capacity,reverse_edge_id,status,state_version,created_change_set_id,updated_change_set_id)
    SELECT edge_slot_key,'adjunct-party','adjunct-baseline',$1,edge_slot_key,from_position_slot_key,to_position_slot_key,passage_type_id,
      jsonb_build_object('entity_id',transition_environment_profile_id,'authoring_version',transition_environment_profile_version::text),
      jsonb_build_object('entity_id',movement_orientation_profile_id,'authoring_version',movement_orientation_profile_version::text),
      cost_kind,action_units,capacity,reverse_edge_slot_key,'active',1,'seed','seed'
      FROM world_base.spatial_v3_scene_movement_edge_templates WHERE scene_template_id=$2 AND scene_template_version=$3`, [template, policy.scene_template_id, policy.scene_template_version]);
  await pool.query(`INSERT INTO party_runtime.party_journey_locations
    (id,party_id,owner_kind,owner_id,location_kind,scene_position_id,state_version,updated_change_set_id)
    VALUES ('adjunct-journey','adjunct-party','actor','actor','scene','arrival',1,'seed')`);
}
