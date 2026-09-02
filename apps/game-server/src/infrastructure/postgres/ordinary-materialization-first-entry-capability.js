import { canonicalDigest } from '@rus/materialization';

export function buildFirstEntryContextBoundCapability({
  profile, partyId, scope, positionRef
}) {
  const value = structuredClone(profile.o2a_context_bound.capability);
  const sourceBasisRef = `${value.source_basis_ref}:${canonicalDigest({
    domain: 'trace_ld_v1_o2a_finite_source_identity_v1', party_id: partyId,
    authored_source_ref: value.source_basis_ref }).slice(0, 24)}`;
  const permissions = [value.regional_permission_ref,
    value.resource_permission_ref].sort();
  const basis = {
    basis_ref: sourceBasisRef, state: 'committed', scope_ref: scope,
    prepared_seed_provenance: null,
    functional_buckets: [value.functional_bucket],
    allowed_admission_classes: [value.admission_class],
    permission_refs: permissions, basis_kind: value.basis_kind
  };
  const finiteSource = {
    source_resource_node_id: sourceBasisRef,
    quantity_unit_ref: value.quantity_unit_ref,
    position_ref: positionRef,
    property_basis_ref: value.property_basis_ref,
    initial_amount_bounds: value.initial_amount_bounds
  };
  const constrainedProfile = {
    schema: 'rus.items.constrained_natural_resource_profile.v1', version: 1,
    profile_ref: value.profile_ref, state: 'committed', scope_ref: scope,
    environment_ref: value.environment_ref, semantic_type: value.semantic_type,
    functional_bucket: value.functional_bucket,
    admission_class: value.admission_class,
    regional_permission_ref: value.regional_permission_ref,
    resource_permission_ref: value.resource_permission_ref,
    source_basis_ref: sourceBasisRef, public_name: value.public_name,
    finite_source: finiteSource
  };
  const capability = {
    capability_ref: value.capability_ref,
    source_ref: sourceBasisRef,
    public_name: value.public_name,
    disclosure_state: value.disclosure_state,
    candidate_context: {
      target_ref: sourceBasisRef,
      candidate_ref_namespace: `${value.capability_ref}:candidate`,
      normalizer_version: 'trace_ld_v1_o2a_candidate_normalizer_v1',
      semantic_type: value.semantic_type, candidate_hint: null,
      functional_bucket: value.functional_bucket,
      admission_class: value.admission_class,
      availability_class: 'context_bound', coverage_kind: 'finite_source',
      coverage_ref: sourceBasisRef,
      policy_version: profile.policy_refs.ordinary_presence_policy_ref
    },
    supporting_bases: [basis], context_bound_ordinary_profile: null,
    constrained_natural_resource_profile: constrainedProfile,
    context_refs: {
      ...structuredClone(profile.context_refs),
      property_context_ref: value.property_basis_ref
    },
    policy_refs: {
      ...structuredClone(profile.policy_refs),
      allowed_admission_classes: [value.admission_class],
      context_bound_permission_refs: permissions,
      allowed_supporting_bases: [{
        basis_ref: sourceBasisRef, basis_state: 'committed'
      }]
    }
  };
  return {
    capability,
    basis,
    property_basis_ref: value.property_basis_ref,
    finite_source: { ...finiteSource, initial_quantity: value.initial_quantity }
  };
}

export async function insertFirstEntryFiniteSource({
  transaction, partyId, changeSetId, source
}) {
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
