import {
  canonicalDigest,
  createOrdinaryAggregate
} from '@rus/materialization';

const PROFILE_ID = 'lower_dvina_trace_o2b_existing_container_profile_v2';

export async function provisionInitialOrdinaryContainer({ transaction,
  partyId, firstEntryBinding, loadedProfile } = {}) {
  if (loadedProfile == null) return Object.freeze({ provisioned:false });
  const profile = loadedProfile.profile;
  const initial = loadedProfile.initial_container;
  const spec = profile?.provisioning;
  const binding = profile?.container_bindings?.[0];
  if (!transaction?.query || profile?.profile_id !== PROFILE_ID
      || profile.scenario_definition_revision !== 20
      || initial?.container_id !== spec?.container_ref
      || binding?.container_ref !== spec?.container_ref
      || firstEntryBinding?.position_id == null) throw conflict('INVALID');
  const identity = await transaction.query(
    `SELECT pc.character_id,r.run_id
       FROM party_runtime.party_player_characters pc
       JOIN LATERAL (
         SELECT run_id FROM party_runtime.party_materialization_runs
          WHERE party_id=pc.party_id AND run_kind='baseline'
            AND status='committed' ORDER BY run_id LIMIT 1
       ) r ON TRUE
      WHERE pc.party_id=$1 ORDER BY pc.character_id`, [partyId]);
  if (identity.rowCount !== 1) throw conflict('ACTOR');
  const actorId = identity.rows[0].character_id;
  const expected = buildExpected({ partyId, actorId,
    runId:identity.rows[0].run_id, positionId:firstEntryBinding.position_id,
    loadedProfile });
  const existing = await transaction.query(
    `SELECT template_id,run_id,holder_character_id,physical_position,
            condition_state,closure_state,state
       FROM party_runtime.party_containers
      WHERE party_id=$1 AND container_id=$2 FOR UPDATE`,
    [partyId, spec.container_ref]);
  if (existing.rowCount === 1) {
    if (canonicalDigest(existing.rows[0])
        !== canonicalDigest(expected.containerProof)) throw conflict('CONFLICT');
    await assertLedger(transaction, partyId, expected);
    return Object.freeze({provisioned:false,
      container_ref:spec.container_ref,actor_id:actorId});
  }
  await transaction.query(`INSERT INTO party_runtime.party_containers
    (party_id,container_id,run_id,template_id,holder_character_id,
     physical_position,condition_state,closure_state,state)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`, [partyId,spec.container_ref,
    expected.runId,spec.template_id,actorId,
    initial.first_entry_placement.physical_position,'serviceable','closed',
    JSON.stringify(expected.containerState)]);
  await transaction.query(`INSERT INTO party_runtime.party_ownership
    (party_id,ownership_id,container_id,owner_character_id,
     controller_character_id,claim_state)
    VALUES ($1,$2,$3,$4,$4,'established')`, [partyId,
    `ownership:${spec.container_ref}`,spec.container_ref,actorId]);
  await transaction.query(`INSERT INTO party_runtime.party_ordinary_materialization_aggregates
    (party_id,scope_kind,scope_id,state_version,aggregate_payload)
    VALUES ($1,'container',$2,0,$3::jsonb)`, [partyId,spec.container_ref,
    JSON.stringify(expected.aggregate)]);
  await transaction.query(`INSERT INTO party_runtime.party_ordinary_materialization_contexts
    (party_id,scope_kind,scope_id,catalog_version,property_version,
     placement_version,supporting_basis_catalog_version,
     supporting_basis_catalog_digest,property_placement_context_digest,
     property_placement_base_snapshot)
    VALUES ($1,'container',$2,1,1,1,0,$3,$4,$5::jsonb)`, [partyId,
    spec.container_ref,expected.basisDigest,expected.propertyDigest,
    JSON.stringify(expected.propertyContext)]);
  await transaction.query(`INSERT INTO party_runtime.party_ordinary_materialization_basis_catalog
    (party_id,scope_kind,scope_id,basis_ref,origin_request_identity,basis_snapshot)
    VALUES ($1,'container',$2,$3,NULL,$4::jsonb)`, [partyId,
    spec.container_ref,expected.basis.basis_ref,JSON.stringify(expected.basis)]);
  await transaction.query(`INSERT INTO party_runtime.party_ordinary_materialization_enablements
    (party_id,scope_kind,scope_id,objective_snapshot,objective_digest,enabled)
    VALUES ($1,'container',$2,$3::jsonb,$4,TRUE)`, [partyId,
    spec.container_ref,JSON.stringify(expected.objective),expected.objectiveDigest]);
  return Object.freeze({provisioned:true,
    container_ref:spec.container_ref,actor_id:actorId});
}

function buildExpected({ actorId, runId, positionId, loadedProfile }) {
  const profile = loadedProfile.profile;
  const spec = profile.provisioning;
  const binding = profile.container_bindings[0];
  const scope = {entity_kind:'container',entity_id:spec.container_ref};
  const basis = {basis_ref:`${profile.profile_id}:stored-road-kit`,
    state:'committed',scope_ref:scope,prepared_seed_provenance:null,
    functional_buckets:['household'],
    allowed_admission_classes:['common_mundane'],permission_refs:[]};
  const context = {schema:profile.policy.required_context_schema,
    profile_ref:profile.profile_id,profile_digest:loadedProfile.artifact_digest,
    policy_ref:profile.policy.policy_ref,container_ref:spec.container_ref,
    template_id:spec.template_id,
    mechanics_profile_ref:spec.mechanics_profile_ref,
    mechanics_profile_digest:binding.mechanics_profile_digest,
    context_digest:binding.context_digest,
    owner_controller_ref:spec.owner_controller_ref,
    property_ref:spec.property_ref,site_function_ref:spec.site_function_ref,
    economic_context_ref:spec.economic_context_ref,
    context_bound_permission_refs:spec.context_bound_permission_refs,
    ordinary_policy:spec.ordinary_policy,
    authoritative_status:spec.authoritative_status,
    container_inventory_profile:spec.container_inventory_profile,
    container_compatibility:spec.container_compatibility,
    mechanics_policy:spec.mechanics_policy};
  const objective = {schema:'rus.items.existing_container_ordinary_enablement.v1',
    profile_ref:profile.profile_id,profile_digest:loadedProfile.artifact_digest,
    policy_ref:profile.policy.policy_ref,
    context_refs:spec.objective_context_refs,policy_refs:{
      authority_policy_ref:'trace_ld_v1_o2b_ordinary_authority_v1',
      density_policy_ref:'trace_ld_v1_o2b_container_density_v1',
      ordinary_presence_policy_ref:'trace_ld_v1_o2b_container_presence_v1',
      runtime_item_mechanics_policy_ref:spec.mechanics_policy.policy_ref,
      allowed_admission_classes:['common_mundane'],
      context_bound_permission_refs:spec.context_bound_permission_refs},
    allowed_disclosure_policy_refs:[],identity_budget:{
      policy_version:'trace_ld_v1_o2b_container_density_v1',
      density_band:'ordinary',identity_budget:spec.identity_budget,
      source:'policy'}};
  const propertyContext = {property_catalog_version_ref:
      `${profile.profile_id}:property-v1`,placement_catalog_version_ref:
      `${profile.profile_id}:placement-v1`,owner_character_id:actorId,
    position_ref:positionId,container_ref:spec.container_ref};
  const containerState = {...structuredClone(
    loadedProfile.initial_container.container_state),
    first_entry_position_ref:positionId,owner_character_id:actorId,
    controller_character_id:actorId,ordinary_contents_context:context};
  return {runId,containerState,containerProof:{template_id:spec.template_id,
    run_id:runId,holder_character_id:actorId,physical_position:
      loadedProfile.initial_container.first_entry_placement.physical_position,
    condition_state:'serviceable',closure_state:'closed',state:containerState},
  aggregate:createOrdinaryAggregate({scope_ref:scope,
    resolution_record_cap:spec.resolution_record_cap}),basis,
  basisDigest:canonicalDigest({domain:'ordinary_supporting_basis_catalog_v1',
    supporting_bases:[basis]}),propertyContext,
  propertyDigest:canonicalDigest(propertyContext),objective,
  objectiveDigest:canonicalDigest(objective)};
}

async function assertLedger(transaction, partyId, expected) {
  const result = await transaction.query(
    `SELECT a.aggregate_payload,c.supporting_basis_catalog_digest,
            c.property_placement_context_digest,c.property_placement_base_snapshot,
            e.objective_snapshot,e.objective_digest,e.enabled,
            (SELECT jsonb_agg(basis_snapshot ORDER BY basis_ref)
               FROM party_runtime.party_ordinary_materialization_basis_catalog b
              WHERE b.party_id=a.party_id AND b.scope_kind=a.scope_kind
                AND b.scope_id=a.scope_id) AS bases
       FROM party_runtime.party_ordinary_materialization_aggregates a
       JOIN party_runtime.party_ordinary_materialization_contexts c
         USING (party_id,scope_kind,scope_id)
       JOIN party_runtime.party_ordinary_materialization_enablements e
         USING (party_id,scope_kind,scope_id)
      WHERE a.party_id=$1 AND a.scope_kind='container' AND a.scope_id=$2`,
    [partyId,expected.containerProof.state.ordinary_contents_context.container_ref]);
  const row = result.rows[0];
  if (result.rowCount !== 1 || row.enabled !== true
      || canonicalDigest(row.aggregate_payload) !== canonicalDigest(expected.aggregate)
      || row.supporting_basis_catalog_digest !== expected.basisDigest
      || row.property_placement_context_digest !== expected.propertyDigest
      || canonicalDigest(row.property_placement_base_snapshot)
        !== canonicalDigest(expected.propertyContext)
      || row.objective_digest !== expected.objectiveDigest
      || canonicalDigest(row.objective_snapshot) !== expected.objectiveDigest
      || canonicalDigest(row.bases) !== canonicalDigest([expected.basis])) {
    throw conflict('CONFLICT');
  }
}

function conflict(suffix) { return Object.assign(new Error(
  `ORDINARY_CONTAINER_FIRST_ENTRY_PROVISIONING_${suffix}`), {
  code:`ORDINARY_CONTAINER_FIRST_ENTRY_PROVISIONING_${suffix}`,
  spatialCode:'state_version_conflict'}); }
