import {
  canonicalDigest,
  createOrdinaryAggregate
} from '@rus/materialization';
import {
  ordinaryWorldPropertyPlacementContextDigest
} from '@rus/items-property';
import {
  assertOrdinaryMaterializationRequestV1
} from '@rus/contracts/ordinary-materialization-v1';

export function createOrdinaryMaterializationFirstEntryProvisioner({
  profile
} = {}) {
  if (profile == null || typeof profile !== 'object') {
    throw new TypeError('ordinary first-entry provisioning requires a versioned profile');
  }
  return Object.freeze({
    async provision({ transaction, partyId, firstEntryBinding, changeSetId }) {
      if (!transaction?.query || !text(partyId) || !text(firstEntryBinding?.g6_instance_id)
          || !text(firstEntryBinding?.position_id) || !text(changeSetId)) {
        throw code('ORDINARY_FIRST_ENTRY_PROVISIONING_INVALID');
      }
      const scope = { entity_kind: 'g6', entity_id: firstEntryBinding.g6_instance_id };
      const rows = buildRows({ profile, partyId, scope, positionRef: firstEntryBinding.position_id });
      const existing = await transaction.query(
        `SELECT e.objective_snapshot,e.objective_digest,e.enabled,
                a.aggregate_payload,a.state_version,c.catalog_version,
                c.property_version,c.placement_version,
                c.supporting_basis_catalog_version,c.supporting_basis_catalog_digest,
                c.property_placement_context_digest,c.property_placement_base_snapshot,
                COALESCE((SELECT jsonb_agg(b.basis_snapshot ORDER BY b.basis_ref)
                  FROM party_runtime.party_ordinary_materialization_basis_catalog b
                  WHERE b.party_id=e.party_id AND b.scope_kind=e.scope_kind
                    AND b.scope_id=e.scope_id), '[]'::jsonb) AS bases
           FROM party_runtime.party_ordinary_materialization_enablements e
           JOIN party_runtime.party_ordinary_materialization_aggregates a
             ON a.party_id=e.party_id AND a.scope_kind=e.scope_kind AND a.scope_id=e.scope_id
           JOIN party_runtime.party_ordinary_materialization_contexts c
             ON c.party_id=e.party_id AND c.scope_kind=e.scope_kind AND c.scope_id=e.scope_id
          WHERE e.party_id=$1 AND e.scope_kind=$2 AND e.scope_id=$3
          FOR UPDATE OF e,a,c`, [partyId, scope.entity_kind, scope.entity_id]);
      if (existing.rowCount === 1) {
        if (!sameExisting(existing.rows[0], rows)) throw code('ORDINARY_FIRST_ENTRY_PROVISIONING_CONFLICT');
        return Object.freeze({ provisioned: false, scope_ref: Object.freeze(scope) });
      }
      await transaction.query(`INSERT INTO party_runtime.party_ordinary_materialization_aggregates
        (party_id,scope_kind,scope_id,state_version,aggregate_payload)
        VALUES ($1,$2,$3,0,$4::jsonb)`, [partyId, scope.entity_kind, scope.entity_id,
        JSON.stringify(rows.aggregate)]);
      await transaction.query(`INSERT INTO party_runtime.party_ordinary_materialization_contexts
        (party_id,scope_kind,scope_id,catalog_version,property_version,placement_version,
         supporting_basis_catalog_version,supporting_basis_catalog_digest,
         property_placement_context_digest,property_placement_base_snapshot)
        VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9::jsonb)`, [partyId, scope.entity_kind,
        scope.entity_id, profile.catalog_version, profile.property_version,
        profile.placement_version, rows.basis_digest, rows.property_digest,
        JSON.stringify(rows.property_placement_context)]);
      for (const basis of rows.bases) {
        await transaction.query(`INSERT INTO party_runtime.party_ordinary_materialization_basis_catalog
          (party_id,scope_kind,scope_id,basis_ref,origin_request_identity,basis_snapshot)
          VALUES ($1,$2,$3,$4,NULL,$5::jsonb)`, [partyId, scope.entity_kind,
          scope.entity_id, basis.basis_ref, JSON.stringify(basis)]);
      }
      await transaction.query(`INSERT INTO party_runtime.party_ordinary_materialization_enablements
        (party_id,scope_kind,scope_id,objective_snapshot,objective_digest,enabled)
        VALUES ($1,$2,$3,$4::jsonb,$5,TRUE)`, [partyId, scope.entity_kind, scope.entity_id,
        JSON.stringify(rows.objective), rows.objective_digest]);
      await insertFiniteSource({ transaction, partyId, changeSetId,
        source: rows.finite_source });
      return Object.freeze({ provisioned: true, scope_ref: Object.freeze(scope) });
    }
  });
}

function buildRows({ profile, partyId, scope, positionRef }) {
  const basisRef = `${profile.profile_id}:basis`;
  const propertyBasisRef = profile.context_refs?.property_context_ref;
  const placementContextRef = `${profile.profile_id}:placement`;
  const basis = { basis_ref: basisRef, state: 'committed', scope_ref: scope,
    prepared_seed_provenance: null, functional_buckets: ['other_ordinary'],
    allowed_admission_classes: ['common_mundane'] };
  const o2a = buildContextBoundCapability({ profile, partyId, scope, positionRef });
  const bases = [basis, o2a.basis].sort((left, right) =>
    left.basis_ref.localeCompare(right.basis_ref));
  const policyRefs = { ...profile.policy_refs,
    allowed_supporting_bases: bases.map(({ basis_ref }) => ({ basis_ref,
      basis_state: 'committed' })) };
  const property = { schema: 'rus.items.ordinary_world_property_placement_context.v2',
    version: 2, scope_ref: scope, item_kind: 'man_made',
    property_catalog_version_ref: `${profile.profile_id}:property-catalog`,
    placement_catalog_version_ref: `${profile.profile_id}:placement-catalog`,
    explicit_item_source_refs: [o2a.basis.basis_ref],
    personal_possession_refs: [], communal_public_service_refs: [],
    container_property_refs: [], occupied_site_refs: [basisRef], unowned_cause_refs: [],
    placement_context_refs: [placementContextRef], property_catalog: [{
      property_basis_ref: propertyBasisRef, state: 'committed', scope_ref: scope,
      basis_class: 'occupied_site_default', source_ref: basisRef,
      unowned_cause_ref: null, unowned_cause_kind: null
    }, {
      property_basis_ref: o2a.property_basis_ref, state: 'committed', scope_ref: scope,
      basis_class: 'explicit_source_item', source_ref: o2a.basis.basis_ref,
      unowned_cause_ref: null, unowned_cause_kind: null
    }], placement_catalog: [{ position_ref: positionRef, state: 'committed',
      scope_ref: scope, position_kind: 'scene_position', g6_ref: scope.entity_id,
      containment_depth: 1, placement_context_ref: placementContextRef }] };
  const objective = { request_id: `${profile.profile_id}:${scope.entity_id}`,
    scope_ref: scope, context_refs: structuredClone(profile.context_refs), policy_refs: policyRefs,
    technical_limits: structuredClone(profile.technical_limits), execution_context: {
      ...structuredClone(profile.execution), supporting_bases: [basis],
      context_bound_capabilities: [o2a.capability],
      stage_b_classification_eval:
        structuredClone(profile.stage_b_classification_eval),
      candidate_context: { ...structuredClone(profile.execution.candidate_context),
        target_ref: scope.entity_id }, source_refs: [basisRef, propertyBasisRef,
        positionRef, placementContextRef].sort() } };
  try {
    assertOrdinaryMaterializationRequestV1({ schema: 'ordinary_materialization_request_v1',
      request_id: objective.request_id, mode: 'seed_scope', scope_ref: objective.scope_ref,
      context_refs: objective.context_refs, policy_refs: objective.policy_refs,
      ordinary_state: { seeded: false, density_band: null, remaining_identity_budget: 0,
        background_groups: [], presence_resolutions: [], closed_observation_scopes: [] },
      candidate_query: null, technical_limits: objective.technical_limits });
  } catch { throw code('ORDINARY_FIRST_ENTRY_PROVISIONING_INVALID'); }
  return { aggregate: createOrdinaryAggregate({ scope_ref: scope,
    resolution_record_cap: profile.technical_limits.max_resolution_records }),
  bases, finite_source: o2a.finite_source,
  basis_digest: canonicalDigest({ domain: 'ordinary_supporting_basis_catalog_v1',
    supporting_bases: bases }), property_placement_context: property,
  property_digest: ordinaryWorldPropertyPlacementContextDigest({ ...property,
    supporting_basis_ref: 'phase6_context_digest_only',
    causal_basis_refs: ['phase6_context_digest_only'],
    requested_position_ref: 'phase6_context_digest_only' }), objective,
  objective_digest: canonicalDigest(objective) };
}

function sameExisting(row, expected) {
  return row.enabled === true && row.objective_digest === expected.objective_digest
    && canonicalDigest(row.objective_snapshot) === expected.objective_digest
    && canonicalDigest(row.aggregate_payload) === canonicalDigest(expected.aggregate)
    && Number(row.state_version) === 0
    && Number(row.catalog_version) === 1 && Number(row.property_version) === 1
    && Number(row.placement_version) === 1 && Number(row.supporting_basis_catalog_version) === 0
    && row.supporting_basis_catalog_digest === expected.basis_digest
    && row.property_placement_context_digest === expected.property_digest
    && canonicalDigest(row.property_placement_base_snapshot)
      === canonicalDigest(expected.property_placement_context)
    && canonicalDigest(row.bases) === canonicalDigest(expected.bases);
}
function buildContextBoundCapability({ profile, partyId, scope, positionRef }) {
  const value = structuredClone(profile.o2a_context_bound.capability);
  const sourceBasisRef = `${value.source_basis_ref}:${canonicalDigest({
    domain: 'trace_ld_v1_o2a_finite_source_identity_v1', party_id: partyId,
    authored_source_ref: value.source_basis_ref }).slice(0, 24)}`;
  const permissions = [value.regional_permission_ref,
    value.resource_permission_ref].sort();
  const basis = { basis_ref: sourceBasisRef, state: 'committed',
    scope_ref: scope, prepared_seed_provenance: null,
    functional_buckets: [value.functional_bucket],
    allowed_admission_classes: [value.admission_class],
    permission_refs: permissions, basis_kind: value.basis_kind };
  const finiteSource = { source_resource_node_id: sourceBasisRef,
    quantity_unit_ref: value.quantity_unit_ref, position_ref: positionRef,
    property_basis_ref: value.property_basis_ref,
    initial_amount_bounds: value.initial_amount_bounds };
  const constrainedProfile = {
    schema: 'rus.items.constrained_natural_resource_profile.v1', version: 1,
    profile_ref: value.profile_ref, state: 'committed', scope_ref: scope,
    environment_ref: value.environment_ref, semantic_type: value.semantic_type,
    functional_bucket: value.functional_bucket,
    admission_class: value.admission_class,
    regional_permission_ref: value.regional_permission_ref,
    resource_permission_ref: value.resource_permission_ref,
    source_basis_ref: sourceBasisRef, public_name: value.public_name,
    finite_source: finiteSource };
  const capability = { capability_ref: value.capability_ref,
    public_name: value.public_name,
    candidate_context: { target_ref: value.capability_ref,
      candidate_ref_namespace: `${value.capability_ref}:candidate`,
      normalizer_version: 'trace_ld_v1_o2a_candidate_normalizer_v1',
      semantic_type: value.semantic_type, candidate_hint: null,
      functional_bucket: value.functional_bucket,
      admission_class: value.admission_class,
      availability_class: 'context_bound', coverage_kind: 'finite_source',
      coverage_ref: sourceBasisRef,
      policy_version: profile.policy_refs.ordinary_presence_policy_ref },
    supporting_bases: [basis], context_bound_ordinary_profile: null,
    constrained_natural_resource_profile: constrainedProfile,
    context_refs: { ...structuredClone(profile.context_refs),
      property_context_ref: value.property_basis_ref },
    policy_refs: { ...structuredClone(profile.policy_refs),
      allowed_admission_classes: [value.admission_class],
      context_bound_permission_refs: permissions,
      allowed_supporting_bases: [{ basis_ref: sourceBasisRef,
        basis_state: 'committed' }] } };
  return { capability, basis, property_basis_ref: value.property_basis_ref,
    finite_source: { ...finiteSource, initial_quantity: value.initial_quantity } };
}
async function insertFiniteSource({ transaction, partyId, changeSetId, source }) {
  await transaction.query(`INSERT INTO party_runtime.party_resource_nodes
    (resource_node_id,party_id,source_resource_ref,position_node_id,
     quantity_numerator,quantity_denominator,quantity_unit_ref,quality_ref,
     access_policy_ref,state_version,created_change_set_id,updated_change_set_id,
     lifecycle_state,initial_amount_bounds,initialization_identity,
     initial_amount_evidence,property_basis_ref)
    VALUES ($1,$2,$3::jsonb,$4,$5,1,$6::jsonb,$7::jsonb,$8::jsonb,1,$9,$9,
      'active',$10::jsonb,$9,NULL,$11)`, [source.source_resource_node_id,
    partyId, JSON.stringify({ entity_kind: 'ordinary_finite_source',
      entity_id: source.source_resource_node_id }), source.position_ref,
    source.initial_quantity, JSON.stringify(source.quantity_unit_ref),
    JSON.stringify({ kind: 'ordinary_material_quality', id: 'prepared' }),
    JSON.stringify({ kind: 'ordinary_resource_access', id: 'context_bound' }),
    changeSetId, JSON.stringify(source.initial_amount_bounds),
    source.property_basis_ref]);
}
function text(value) { return typeof value === 'string' && value.trim() === value && value.length > 0; }
function code(value) { return Object.assign(new Error(value), { code: value, spatialCode: 'state_version_conflict' }); }
