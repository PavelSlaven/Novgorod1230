import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import {
  applyOrdinaryAggregateTransition,
  canonicalDigest,
  createOrdinaryAggregate
} from '@rus/materialization';
import { ordinaryWorldPropertyPlacementContextDigest } from '@rus/items-property';
import { createPostgresOrdinaryMaterializationEnablementRepository } from
  '../../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-enablement.js';
import { createLowerDvinaTraceOrdinaryDiscoveryResolver } from
  '../../../apps/game-server/src/runtime/lower-dvina-trace-ordinary-discovery.js';
import { applyOrdinaryMaterializationAtomicWritePlanInTransaction } from
  '../../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-phase-6-commit.js';

const migrations = [
  '001_party_runtime.sql', '002_party_runtime_v3.sql', '003_party_runtime_v3_planning.sql',
  '004_party_runtime_v3_journeys.sql', '005_party_runtime_v3_domain.sql',
  '006_party_runtime_v3_migration.sql', '007_party_runtime_temporal_world.sql',
  '008_party_runtime_pr8_first_entry.sql', '009_party_runtime_pr8_reaction_knowledge.sql',
  '010_party_runtime_pr8_reaction_options.sql', '011_party_runtime_first_playable.sql',
  '012_party_runtime_external_ownership.sql', '013_party_runtime_obligations.sql',
  '014_party_runtime_activity_resume_terminal.sql', '015_party_runtime_turn_step_items.sql',
  '016_party_runtime_npc_semantic_conversation.sql', '017_party_runtime_conversation_transcript.sql',
  '018_party_runtime_phase7_container_state.sql', '019_party_runtime_combat_sessions.sql',
  '020_party_runtime_actor_equipment.sql', '021_party_runtime_ordinary_materialization.sql',
  '022_party_runtime_ordinary_materialization_commit.sql',
  '023_party_runtime_ordinary_materialization_enablement.sql',
  '024_party_runtime_ordinary_world_items.sql',
  '025_party_runtime_finite_resource_transitions.sql',
  '026_party_runtime_existing_container_ordinary_contents.sql'
];
let databasePromise = null;

export function withIssue730Database(t) {
  if (databasePromise == null) databasePromise = initializeDatabase(t);
  return databasePromise;
}

async function initializeDatabase(t) {
  const connectionString = process.env.RUS_TEST_POSTGRES_ADMIN_URL;
  assert.ok(connectionString, 'run this test through pg-slot');
  const pool = new Pool({ connectionString, max: 6,
    connectionTimeoutMillis: 5_000 });
  t.after(async () => pool.end());
  for (const file of migrations) {
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
  return pool;
}

export async function setupParty(pool, suffix, { finite, quantity = 2 } = {}) {
  const partyId = `party-${suffix}`;
  const scope = { entity_kind: 'g6', entity_id: `scope-${suffix}` };
  const sourceRef = `source-${suffix}`;
  const positionRef = `position-${suffix}`;
  const propertyRef = `property-${suffix}`;
  const permissionRef = `permission-${suffix}`;
  const profileRef = `profile-${suffix}`;
  const query = 'ordinary material';
  const unitRef = { kind: 'unit', id: 'item' };
  const bounds = { minimum: { numerator: 1, denominator: 1, unit: 'item' },
    maximum: { numerator: quantity, denominator: 1, unit: 'item' } };
  const basis = { basis_ref: sourceRef, state: 'committed', scope_ref: { ...scope },
    prepared_seed_provenance: null, functional_buckets: ['other_ordinary'],
    allowed_admission_classes: ['common_mundane'],
    permission_refs: [],
    ...(finite ? { basis_kind: 'finite_source' } : {}) };
  const placement = propertyContext({ scope, sourceRef, propertyRef, positionRef });
  const objective = objectiveContext({ scope, sourceRef, positionRef, propertyRef,
    permissionRef, profileRef, bounds, basis, finite });
  const aggregate = seedAggregate(scope, suffix);
  const changeSetId = `fixture-${suffix}`;
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,
     materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ($1,2,'synthetic-world','synthetic-catalog','synthetic-materializer',
      'synthetic-rng','synthetic-commands','synthetic-profiles')`, [partyId]);
  await pool.query(`INSERT INTO party_runtime.party_v3_change_sets
    (id,party_id,operation_kind,expected_state_version_set_digest,
     expected_state_version_set,committed_state_version_set_digest,
     write_plan_digest,created_at_turn,committed_at_turn)
    VALUES ($1,$2,'fixture',$3,'[]'::jsonb,$3,$3,0,0)`,
  [changeSetId, partyId, 'f'.repeat(64)]);
  await insertAnchor(pool, partyId, scope.entity_id, positionRef, changeSetId);
  const placementDigest = ordinaryWorldPropertyPlacementContextDigest({ ...placement,
    supporting_basis_ref: 'ordinary_context_digest',
    causal_basis_refs: ['ordinary_context_digest'],
    requested_position_ref: 'ordinary_context_digest' });
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_aggregates
    (party_id,scope_kind,scope_id,state_version,aggregate_payload)
    VALUES ($1,'g6',$2,$3,$4::jsonb) ON CONFLICT (party_id,scope_kind,scope_id) DO NOTHING`,
  [partyId, scope.entity_id, aggregate.state_version, JSON.stringify(aggregate)]);
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_basis_catalog
    (party_id,scope_kind,scope_id,basis_ref,origin_request_identity,basis_snapshot)
    VALUES ($1,'g6',$2,$3,NULL,$4::jsonb) ON CONFLICT (party_id,scope_kind,scope_id,basis_ref) DO UPDATE
      SET basis_snapshot=EXCLUDED.basis_snapshot`,
  [partyId, scope.entity_id, sourceRef, JSON.stringify(basis)]);
  const catalogRows = (await pool.query(`SELECT basis_snapshot FROM
    party_runtime.party_ordinary_materialization_basis_catalog
    WHERE party_id=$1 AND scope_kind='g6' AND scope_id=$2 ORDER BY basis_ref`,
  [partyId, scope.entity_id])).rows;
  const basisDigest = canonicalDigest({ domain: 'ordinary_supporting_basis_catalog_v1',
    supporting_bases: catalogRows.map(({ basis_snapshot }) => basis_snapshot) });
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_contexts
    (party_id,scope_kind,scope_id,catalog_version,property_version,placement_version,
     supporting_basis_catalog_version,supporting_basis_catalog_digest,
     property_placement_context_digest,property_placement_base_snapshot)
    VALUES ($1,'g6',$2,1,1,1,1,$3,$4,$5::jsonb)
    ON CONFLICT (party_id,scope_kind,scope_id) DO UPDATE SET
      property_version=party_ordinary_materialization_contexts.property_version+1,
      placement_version=party_ordinary_materialization_contexts.placement_version+1,
      supporting_basis_catalog_version=party_ordinary_materialization_contexts.supporting_basis_catalog_version+1,
      supporting_basis_catalog_digest=EXCLUDED.supporting_basis_catalog_digest,
      property_placement_context_digest=EXCLUDED.property_placement_context_digest,
      property_placement_base_snapshot=EXCLUDED.property_placement_base_snapshot`,
  [partyId, scope.entity_id, basisDigest, placementDigest, JSON.stringify(placement)]);
  await pool.query(`INSERT INTO party_runtime.party_ordinary_materialization_enablements
    (party_id,scope_kind,scope_id,objective_snapshot,objective_digest,enabled)
    VALUES ($1,'g6',$2,$3::jsonb,$4,true) ON CONFLICT (party_id,scope_kind,scope_id) DO UPDATE
      SET objective_snapshot=EXCLUDED.objective_snapshot, objective_digest=EXCLUDED.objective_digest,
          enabled=EXCLUDED.enabled`,
  [partyId, scope.entity_id, JSON.stringify(objective), canonicalDigest(objective)]);
  if (finite) {
    await pool.query(`INSERT INTO party_runtime.party_resource_nodes
      (resource_node_id,party_id,source_resource_ref,position_node_id,
       quantity_numerator,quantity_denominator,quantity_unit_ref,quality_ref,
       access_policy_ref,state_version,created_change_set_id,updated_change_set_id,
       lifecycle_state,initial_amount_bounds,initialization_identity,
       property_basis_ref)
      VALUES ($1,$2,$3::jsonb,$4,$5,1,$6::jsonb,$3::jsonb,$3::jsonb,8,
      $7,$7,'active',NULL,NULL,$8)`,
    [sourceRef, partyId, JSON.stringify({ ref: sourceRef }), positionRef,
      quantity, JSON.stringify(unitRef), changeSetId, propertyRef]);
  }
  return { partyId, partyVersion: 0, scope, sourceRef, positionRef, propertyRef, permissionRef,
    profileRef, anchorRef: `anchor-${partyId}`, query, quantity: { value: 1, unit: 'item' },
    stock: quantity, finite };
}

function seedAggregate(scope, suffix) {
  return applyOrdinaryAggregateTransition({
    aggregate: createOrdinaryAggregate({ scope_ref: scope,
      resolution_record_cap: 8 }),
    transition: { kind: 'seed', request_identity: `seed-${suffix}`,
      expected_state_version: 0, density_band: 'ordinary', identity_budget: 4,
      background_groups: [] }
  });
}

function objectiveContext({ scope, sourceRef, positionRef, propertyRef,
  permissionRef, profileRef, bounds, basis, finite }) {
  const contextRefs = { period_ref: 'period', region_ref: 'region',
    function_refs: [], environment_refs: ['environment'],
    occupation_household_refs: [], economic_context_ref: 'economy',
    occupancy_state_ref: 'occupied', material_culture_refs: [],
    property_context_ref: propertyRef };
  const policyRefs = { authority_policy_ref: 'authority',
    density_policy_ref: 'density', ordinary_presence_policy_ref: 'presence',
    runtime_item_mechanics_policy_ref: `mechanics-${scope.entity_id}`,
    allowed_admission_classes: ['common_mundane'],
    context_bound_permission_refs: [],
    allowed_supporting_bases: [{ basis_ref: basis.basis_ref,
      basis_state: 'committed' }] };
  const execution = { allowed_disclosure_policy_refs: [],
    supporting_bases: [basis], density_policy: { version: 'density',
      mappings: [{ scope_kind: 'g6', function_ref: null,
        bands: { sparse: 0, ordinary: 1, dense: 1 } }] },
    candidate_context: { target_ref: scope.entity_id,
      candidate_ref_namespace: `namespace-${scope.entity_id}`,
      normalizer_version: 'normalizer-v1', semantic_type: 'ordinary_object_candidate',
      candidate_hint: null, functional_bucket: 'other_ordinary',
      admission_class: 'common_mundane',
      availability_class: 'common', coverage_kind: 'visible_surface',
      coverage_ref: `coverage-${scope.entity_id}`, policy_version: 'presence' },
    stage_b_classification_eval: {}, mechanics_policy: {
      policy_ref: policyRefs.runtime_item_mechanics_policy_ref,
      max_mass_grams: 100, allowed_external_hand_costs: [0, 1],
      allowed_carry_forms: ['compact'], max_packing_slot_cost: 4,
      max_quantity: 1, mass_grams_per_quantity_unit: 12 },
    causal_ref: `cause-${scope.entity_id}`, source_refs: [sourceRef],
    identity_budget: 4 };
  if (finite) {
    const authority = { schema: 'rus.items.finite_source_authority.v1',
      version: 1, state: 'committed', source_basis_ref: sourceRef,
      finite_source: { source_resource_node_id: sourceRef,
        quantity_unit_ref: { kind: 'unit', id: 'item' }, position_ref: positionRef,
        property_basis_ref: propertyRef, initial_amount_bounds: bounds } };
    execution.finite_source_authority = authority;
    execution.context_bound_capabilities = [{ source_ref: sourceRef,
      public_name: 'ordinary material', disclosure_state: 'visible', access_decision: 'allow',
      candidate_context: { ...execution.candidate_context, target_ref: sourceRef,
        coverage_kind: 'finite_source', coverage_ref: sourceRef,
        semantic_type: 'ordinary_object_candidate', availability_class: 'common' },
      supporting_bases: [basis], context_bound_ordinary_profile: null,
      constrained_natural_resource_profile: null,
      finite_source_authority: authority,
      context_refs: { ...contextRefs, property_context_ref: propertyRef },
      policy_refs: { ...policyRefs, allowed_admission_classes: ['common_mundane'],
        context_bound_permission_refs: [] } }];
  }
  if (!finite) {
    execution.candidate_context.admission_class = 'common_mundane';
    execution.candidate_context.availability_class = 'common';
    execution.candidate_context.semantic_type = 'ordinary_object_candidate';
  }
  return { request_id: `enablement-${scope.entity_id}`, scope_ref: { ...scope },
    context_refs: contextRefs, policy_refs: policyRefs,
    technical_limits: { max_new_entities: 1, max_new_background_groups: 1,
      max_resolution_records: 8 }, execution_context: execution };
}

function propertyContext({ scope, sourceRef, propertyRef, positionRef }) {
  return { schema: 'rus.items.ordinary_world_property_placement_context.v2',
    version: 2, scope_ref: { ...scope }, item_kind: 'natural_resource_portion',
    property_catalog_version_ref: 'property-catalog',
    placement_catalog_version_ref: 'placement-catalog',
    explicit_item_source_refs: [sourceRef], personal_possession_refs: [],
    communal_public_service_refs: [], container_property_refs: [],
    occupied_site_refs: [], unowned_cause_refs: [],
    placement_context_refs: [`placement-${scope.entity_id}`],
    property_catalog: [{ property_basis_ref: propertyRef, state: 'committed',
      scope_ref: { ...scope }, basis_class: 'explicit_source_item',
      source_ref: sourceRef, unowned_cause_ref: null, unowned_cause_kind: null }],
    placement_catalog: [{ position_ref: positionRef, state: 'committed',
      scope_ref: { ...scope }, position_kind: 'scene_position',
      g6_ref: scope.entity_id, containment_depth: 0,
      placement_context_ref: `placement-${scope.entity_id}` }] };
}

export function makeResolver(context, pool,
  repository = createPostgresOrdinaryMaterializationEnablementRepository({ pool }),
  { resolution = 'materialize' } = {}) {
  const model = async (request) => ({ schema: 'ordinary_materialization_plan_v1',
    request_id: request.request_id, resolution,
    density_band_proposal: null, background_groups: [],
    presence_resolutions: resolution === 'materialize' ? [] : [{
      candidate_key: request.candidate_query.candidate_key,
      coverage_key: request.candidate_query.coverage_key, resolution }],
    reason_code: 'committed-source', entities: resolution === 'materialize' ? [{ semantic_descriptor: {
      semantic_type: 'synthetic_material',
      name: 'ordinary material', facts: [] },
      authority_class: 'ordinary', admission_class: 'common_mundane',
      availability_class: 'common',
      functional_bucket: 'other_ordinary',
      presence_expectation: 'routine', supporting_basis_ref: context.sourceRef,
      causal_basis: { basis_kind: context.finite ? 'finite_source' : 'committed_context',
        basis_refs: [context.sourceRef] }, property_basis_ref: context.propertyRef,
      placement_proposal: { scope_ref: context.scope.entity_id,
        position_ref: context.positionRef }, mechanics_proposal: {
        mass_grams: 12, external_hand_cost: 0, carry_form: 'compact',
        packing_slot_cost: 1, quantity: { value: 1, unit: 'item' },
        container: null } }] : [] });
  model.verifyStageBCutover = async () => true;
  return createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId: context.partyId,
    inputDigest: `input-${context.partyId}`,
    loadEnablement: (input) => repository.load(input),
    ordinaryMaterializationModel: model });
}

export function resolve(resolver, context, rootTurnId, visibleItem = null,
  discoveryKind = 'search') {
  return resolver({ request: { root_turn_id: rootTurnId, step_index: 0,
    ...(visibleItem == null ? {} : { player_safe_state: { items: [{
      item_id: visibleItem.item_id,
      name: visibleItem.item_proposal.semantic_descriptor.name,
      semantic_type: visibleItem.item_proposal.semantic_descriptor.semantic_type
    }] } }) },
    committed_state: { position: { g6_id: context.scope.entity_id,
      g5_anchor_id: context.anchorRef, position_id: context.positionRef } },
    operation: { op: 'request_discovery', discovery_kind: discoveryKind,
      target_refs: [context.finite ? context.sourceRef
      : context.scope.entity_id], query: context.query,
      quantity: context.quantity }, working_projection: {} });
}

export async function commitPlan(pool, plan, changeSetId, partyVersion) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await applyOrdinaryMaterializationAtomicWritePlanInTransaction({
      client, input: plan, partyStateVersionAfter: partyVersion + 1,
      p16ChangeSetId: changeSetId
    });
    if (!result.replay) {
      await client.query(`INSERT INTO party_runtime.party_v3_change_sets
        (id,party_id,operation_kind,expected_state_version_set_digest,
         expected_state_version_set,committed_state_version_set_digest,
         write_plan_digest,created_at_turn,committed_at_turn)
        VALUES ($1,$2,'ordinary-discovery',$3,'[]'::jsonb,$3,$3,1,1)`,
      [changeSetId, plan.party_id, plan.write_plan_digest.replace('sha256:', '')]);
      const party = await client.query(`UPDATE party_runtime.parties
        SET state_version=state_version+1 WHERE party_id=$1 AND state_version=$2`,
      [plan.party_id, partyVersion]);
      assert.equal(party.rowCount, 1);
    }
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function counts(pool, partyId) {
  const result = await pool.query(`SELECT
    (SELECT count(*)::int FROM party_runtime.party_items WHERE party_id=$1) AS items,
    (SELECT count(*)::int FROM party_runtime.party_ordinary_materialization_items
      WHERE party_id=$1) AS materializations,
    (SELECT count(*)::int FROM party_runtime.party_resource_node_decrements
      WHERE party_id=$1) AS decrements`, [partyId]);
  return result.rows[0];
}

export async function sourceState(pool, context) {
  return (await pool.query(`SELECT state_version,lifecycle_state,
    quantity_numerator FROM party_runtime.party_resource_nodes
    WHERE party_id=$1 AND resource_node_id=$2`,
  [context.partyId, context.sourceRef])).rows[0];
}

async function insertAnchor(pool, partyId, scopeId, positionId, changeSetId) {
  const runId = `run-${partyId}`;
  const nodeId = `node-${partyId}`;
  const anchorId = `anchor-${partyId}`;
  const siteId = `site-${partyId}`;
  const baselineId = `baseline-${partyId}`;
  await pool.query(`INSERT INTO party_runtime.party_materialization_runs
    (party_id,run_id,g4_id,run_kind,seed_digest,input_digest,catalog_digest,
     materializer_version,rng_version,result_digest,idempotency_key,status)
    VALUES ($1,$2,'synthetic-g4','baseline','seed','input','catalog',
      'materializer','rng','result',$2,'committed')`, [partyId, runId]);
  await pool.query(`INSERT INTO party_runtime.party_g5_nodes
    (party_id,g5_node_id,run_id,parent_g4_id,template_id,slot_key)
    VALUES ($1,$2,$3,'synthetic-g4','node','main')`, [partyId, nodeId, runId]);
  await pool.query(`INSERT INTO party_runtime.party_g5_anchors
    (party_id,anchor_id,g5_node_id,template_id,slot_key,item_capacity)
    VALUES ($1,$2,$3,'anchor','main',16)`, [partyId, anchorId, nodeId]);
  await pool.query(`INSERT INTO party_runtime.party_positions
    (party_id,g4_id,g5_node_id,g5_anchor_id)
    VALUES ($1,'synthetic-g4',$2,$3)`, [partyId, nodeId, anchorId]);
  await pool.query(`INSERT INTO party_runtime.party_g5_sites
    (id,party_id,origin,parent_g4_id,canonical_g5_ref,status,state_version,
     created_change_set_id,updated_change_set_id)
    VALUES ($1,$2,'canonical','synthetic-g4',$3::jsonb,'active',1,$4,$4)`,
  [siteId, partyId, JSON.stringify({ entity_kind: 'g5', entity_id: siteId }), changeSetId]);
  await pool.query(`INSERT INTO party_runtime.party_scene_baselines
    (id,party_id,host_kind,host_id,source_kind,scene_template_ref,
     materialization_trace_id,materializer_version,catalog_digest,status,
     state_version,created_change_set_id,updated_change_set_id)
    VALUES ($1,$2,'g5_site',$3,'canonical_template',$4::jsonb,'trace',
      'materializer','catalog','active',1,$5,$5)`,
  [baselineId, partyId, siteId, JSON.stringify({ entity_kind: 'scene_template',
    entity_id: `scene-${partyId}` }), changeSetId]);
  await pool.query(`INSERT INTO party_runtime.party_g6_instances
    (id,party_id,scene_baseline_id,source_scene_template_ref,scene_slot_key,
     host_kind,host_id,physical_class_id,primary_scene_role_id,
     vertical_context_id,overhead_cover_id,intra_g6_visibility_mode,
     default_visibility_distance_band,acoustic_uniformity,status,state_version,
     created_change_set_id,updated_change_set_id)
    VALUES ($1,$2,$3,$4::jsonb,'main','g5_site',$5,'ordinary','ordinary',
      'ground','open','default_clear','near','uniform','active',1,$6,$6)`,
  [scopeId, partyId, baselineId, JSON.stringify({ entity_kind: 'scene_template',
    entity_id: `scene-${partyId}` }), siteId, changeSetId]);
  await pool.query(`INSERT INTO party_runtime.scene_position_nodes
    (id,party_id,g6_instance_id,position_type_id,template_slot_key,
     template_instance_ordinal,capacity,access_class_id,status,state_version,
     created_change_set_id,updated_change_set_id)
    VALUES ($1,$2,$3,'ground','main',0,16,'open','active',1,$4,$4)`,
  [positionId, partyId, scopeId, changeSetId]);
  const actorId = `actor-${partyId}`;
  await pool.query(`INSERT INTO party_runtime.party_player_characters
    (party_id,character_id,profile) VALUES ($1,$2,'{}'::jsonb)`,
  [partyId, actorId]);
  await pool.query(`INSERT INTO party_runtime.party_journey_locations
    (id,party_id,owner_kind,owner_id,location_kind,scene_position_id,
     state_version,updated_change_set_id)
    VALUES ($1,$2,'actor',$3,'scene',$4,1,$5)`,
  [`journey-${partyId}`, partyId, actorId, positionId, changeSetId]);
}
