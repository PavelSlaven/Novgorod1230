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
    async provision({ transaction, partyId, firstEntryBinding }) {
      if (!transaction?.query || !text(partyId) || !text(firstEntryBinding?.g6_instance_id)
          || !text(firstEntryBinding?.position_id)) {
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
      await transaction.query(`INSERT INTO party_runtime.party_ordinary_materialization_basis_catalog
        (party_id,scope_kind,scope_id,basis_ref,origin_request_identity,basis_snapshot)
        VALUES ($1,$2,$3,$4,NULL,$5::jsonb)`, [partyId, scope.entity_kind, scope.entity_id,
        rows.basis.basis_ref, JSON.stringify(rows.basis)]);
      await transaction.query(`INSERT INTO party_runtime.party_ordinary_materialization_enablements
        (party_id,scope_kind,scope_id,objective_snapshot,objective_digest,enabled)
        VALUES ($1,$2,$3,$4::jsonb,$5,TRUE)`, [partyId, scope.entity_kind, scope.entity_id,
        JSON.stringify(rows.objective), rows.objective_digest]);
      return Object.freeze({ provisioned: true, scope_ref: Object.freeze(scope) });
    }
  });
}

function buildRows({ profile, scope, positionRef }) {
  const basisRef = `${profile.profile_id}:basis`;
  const propertyBasisRef = profile.context_refs?.property_context_ref;
  const placementContextRef = `${profile.profile_id}:placement`;
  const basis = { basis_ref: basisRef, state: 'committed', scope_ref: scope,
    prepared_seed_provenance: null, functional_buckets: ['other_ordinary'],
    allowed_admission_classes: ['common_mundane'] };
  const policyRefs = { ...profile.policy_refs,
    allowed_supporting_bases: [{ basis_ref: basisRef, basis_state: 'committed' }] };
  const property = { scope_ref: scope, item_kind: 'man_made',
    property_catalog_version_ref: `${profile.profile_id}:property-catalog`,
    placement_catalog_version_ref: `${profile.profile_id}:placement-catalog`,
    personal_communal_refs: [], occupied_site_refs: [basisRef], unowned_cause_refs: [],
    placement_context_refs: [placementContextRef], property_catalog: [{
      property_basis_ref: propertyBasisRef, state: 'committed', scope_ref: scope,
      basis_class: 'occupied_site_default', source_ref: basisRef, unowned_cause_ref: null
    }], placement_catalog: [{ position_ref: positionRef, state: 'committed',
      scope_ref: scope, position_kind: 'scene_position', g6_ref: scope.entity_id,
      containment_depth: 1, placement_context_ref: placementContextRef }] };
  const objective = { request_id: `${profile.profile_id}:${scope.entity_id}`,
    scope_ref: scope, context_refs: structuredClone(profile.context_refs), policy_refs: policyRefs,
    technical_limits: structuredClone(profile.technical_limits), execution_context: {
      ...structuredClone(profile.execution), supporting_bases: [basis],
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
  basis, basis_digest: canonicalDigest({ domain: 'ordinary_supporting_basis_catalog_v1',
    supporting_bases: [basis] }), property_placement_context: property,
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
    && canonicalDigest(row.bases) === canonicalDigest([expected.basis]);
}
function text(value) { return typeof value === 'string' && value.trim() === value && value.length > 0; }
function code(value) { return Object.assign(new Error(value), { code: value, spatialCode: 'state_version_conflict' }); }
