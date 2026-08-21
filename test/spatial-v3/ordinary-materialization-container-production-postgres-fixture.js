import { committedFixture } from
  '../../apps/game-server/test/lower-dvina-trace-o2b-production-fixture.js';

export async function provisionProductionO2bFixture(pool) {
  const fixture = committedFixture();
  const { container } = fixture;
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,
     materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ('party-o2b-production',2,'world','catalog','materializer','rng','commands','profiles')`);
  await pool.query(`INSERT INTO party_runtime.party_materialization_runs
    (party_id,run_id,g4_id,run_kind,seed_digest,input_digest,catalog_digest,
     materializer_version,rng_version,result_digest,idempotency_key,status)
    VALUES ('party-o2b-production','run','g4','baseline','s','i','c','m','r','z','k','committed')`);
  await pool.query(`INSERT INTO party_runtime.party_player_characters
    (party_id,character_id,profile) VALUES ('party-o2b-production','pc','{}')`);
  await pool.query(`INSERT INTO party_runtime.party_containers
    (party_id,container_id,run_id,template_id,holder_character_id,
     physical_position,closure_state,state,state_version)
    VALUES ('party-o2b-production',$1,'run',$2,'pc','hands','closed',$3::jsonb,$4)`,
  [container.container_id,container.template_id,JSON.stringify(container.state),
    container.state_version]);
  await pool.query(`INSERT INTO party_runtime.party_ownership
    (party_id,ownership_id,container_id,owner_character_id,
     controller_character_id,claim_state)
    VALUES ('party-o2b-production',$1,$2,'pc','pc','owned')`,
  [`ownership:${container.container_id}`,container.container_id]);
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_aggregates
    (party_id,scope_kind,scope_id,state_version,aggregate_payload)
    VALUES ('party-o2b-production','container',$1,$2,$3::jsonb)`,
  [container.container_id,fixture.ordinary_state_version,
    JSON.stringify(fixture.ordinary_aggregate)]);
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_contexts
    (party_id,scope_kind,scope_id,catalog_version,property_version,
     placement_version,supporting_basis_catalog_version,
     supporting_basis_catalog_digest,property_placement_context_digest,
     property_placement_base_snapshot)
    VALUES ('party-o2b-production','container',$1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
  [container.container_id,fixture.catalog_version,fixture.property_version,
    fixture.placement_version,fixture.supporting_basis_catalog_version,
    fixture.supporting_basis_catalog_digest,
    fixture.property_placement_context_digest,
    JSON.stringify(fixture.property_placement_context)]);
  for (const basis of fixture.supporting_bases) {
    await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_basis_catalog
      (party_id,scope_kind,scope_id,basis_ref,origin_request_identity,basis_snapshot)
      VALUES ('party-o2b-production','container',$1,$2,NULL,$3::jsonb)`,
    [container.container_id,basis.basis_ref,JSON.stringify(basis)]);
  }
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_enablements
    (party_id,scope_kind,scope_id,objective_snapshot,objective_digest,enabled)
    VALUES ('party-o2b-production','container',$1,$2::jsonb,$3,true)`,
  [container.container_id,JSON.stringify(fixture.enablement.objective_snapshot),
    fixture.enablement.objective_digest]);
}
