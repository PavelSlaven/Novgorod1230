export function ordinaryMaterializationResponseShape(request) {
  if (!plain(request)) return null;
  const base = { schema: 'ordinary_materialization_plan_v1',
    request_id: request.request_id };
  const authority = request.authority_envelope;
  if (request.mode === 'seed_scope' && authority?.stage === 'seed_scope') {
    const group = authority.group_bases[0];
    if (!plain(group)) return null;
    return { ...base, resolution: 'seeded',
      density_band_proposal: authority.density_bands[0], background_groups: [{
        descriptor: '<semantic_group_descriptor>',
        functional_bucket: group.functional_buckets[0],
        availability_class: 'common',
        allowed_admission_classes: group.allowed_admission_classes,
        causal_basis: { basis_kind: 'seed_scope',
          basis_refs: [group.basis_ref] },
        property_basis_ref: request.context_refs.property_context_ref,
        permission_refs: group.permission_refs,
        disclosure_policy_ref: authority.disclosure_policy_refs[0]
      }], entities: [], presence_resolutions: [], reason_code: 'seeded' };
  }
  if (request.mode !== 'resolve_presence'
      || authority?.stage !== 'resolve_presence'
      || !plain(request.candidate_query)) return null;
  const candidate = request.candidate_query;
  if (authority.selected_supporting_basis_ref == null) return {
    ...base, resolution: 'absent', density_band_proposal: null,
    background_groups: [], entities: [], presence_resolutions: [{
      candidate_key: candidate.candidate_key,
      coverage_key: candidate.coverage_key, resolution: 'absent'
    }], reason_code: 'absent'
  };
  const basis = authority.allowed_supporting_bases.find(({ basis_ref }) =>
    basis_ref === authority.selected_supporting_basis_ref);
  const positionRef = authority.placement_refs[0];
  if (!plain(basis) || !text(positionRef)) return null;
  return { ...base, resolution: 'materialize', density_band_proposal: null,
    background_groups: [], presence_resolutions: [], entities: [{
      semantic_descriptor: { semantic_type: authority.candidate.semantic_type,
        name: '<semantic_ordinary_name>', facts: ['<semantic_ordinary_fact>'] },
      authority_class: 'ordinary',
      admission_class: authority.candidate.admission_class,
      availability_class: authority.candidate.availability_class,
      functional_bucket: authority.candidate.functional_bucket,
      presence_expectation: '<semantic_presence_expectation>',
      supporting_basis_ref: basis.basis_ref,
      causal_basis: { basis_kind: 'ordinary_presence',
        basis_refs: [basis.basis_ref] },
      property_basis_ref: authority.property_basis_ref,
      placement_proposal: { scope_ref: request.scope_ref.entity_id,
        position_ref: positionRef },
      mechanics_proposal: { mass_grams: '<semantic_integer_mass_grams>',
        external_hand_cost: '<semantic_integer_external_hand_cost>',
        carry_form: '<semantic_carry_form>',
        packing_slot_cost: '<semantic_integer_packing_slot_cost>',
        quantity: { value: '<semantic_integer_quantity>', unit: 'item' },
        container: null }
    }], reason_code: 'materialize' };
}

export function bindOrdinaryMaterializationPlan(request, output) {
  if (!plain(request) || !plain(output)) return output;
  if (request.mode === 'seed_scope' && output.resolution === 'no_change') {
    return noChangePlan(request, output.reason_code);
  }
  if (request.mode === 'seed_scope' && output.resolution === 'seeded') {
    const shape = ordinaryMaterializationResponseShape(request);
    if (shape == null) return output;
    shape.density_band_proposal = output.density_band_proposal;
    shape.background_groups[0].descriptor =
      output.background_groups?.[0]?.descriptor;
    shape.reason_code = output.reason_code;
    return shape;
  }
  if (request.mode !== 'resolve_presence') return output;
  if (['absent', 'no_change', 'authority_required'].includes(output.resolution)) {
    return negativePlan(request, output.resolution, output.reason_code);
  }
  if (output.resolution !== 'materialize' || !Array.isArray(output.entities)
      || output.entities.length !== 1 || !plain(output.entities[0])) return output;
  const authority = request.authority_envelope;
  const entity = output.entities[0];
  if (authority?.stage !== 'resolve_presence'
      || !plain(entity.semantic_descriptor)
      || !plain(entity.mechanics_proposal)
      || !text(authority.selected_supporting_basis_ref)
      || !authority.allowed_supporting_bases.some(({ basis_ref }) =>
        basis_ref === authority.selected_supporting_basis_ref)
      || !text(authority.placement_refs?.[0])) return output;
  const basisRef = authority.selected_supporting_basis_ref;
  return {
    schema: 'ordinary_materialization_plan_v1', request_id: request.request_id,
    resolution: 'materialize', density_band_proposal: null,
    background_groups: [], presence_resolutions: [],
    entities: [{ semantic_descriptor: entity.semantic_descriptor,
      authority_class: 'ordinary',
      admission_class: authority.candidate.admission_class,
      availability_class: authority.candidate.availability_class,
      functional_bucket: authority.candidate.functional_bucket,
      presence_expectation: entity.presence_expectation,
      supporting_basis_ref: basisRef,
      causal_basis: { basis_kind: 'ordinary_presence', basis_refs: [basisRef] },
      property_basis_ref: authority.property_basis_ref,
      placement_proposal: { scope_ref: request.scope_ref.entity_id,
        position_ref: authority.placement_refs[0] },
      mechanics_proposal: entity.mechanics_proposal }],
    reason_code: output.reason_code
  };
}

function noChangePlan(request, reasonCode) {
  return { schema: 'ordinary_materialization_plan_v1',
    request_id: request.request_id, resolution: 'no_change',
    density_band_proposal: null, background_groups: [], entities: [],
    presence_resolutions: [], reason_code: reasonCode };
}
function negativePlan(request, resolution, reasonCode) {
  return { ...noChangePlan(request, reasonCode), resolution,
    presence_resolutions: [{ candidate_key: request.candidate_query.candidate_key,
      coverage_key: request.candidate_query.coverage_key, resolution }] };
}
function plain(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
function text(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}
