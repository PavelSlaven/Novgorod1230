import { ambientOrdinaryCommittedContextDigest } from
  '@rus/items-property/ambient-ordinary-portion';

export function ambientContextPort() {
  const scope_ref = { entity_kind: 'g6', entity_id: 'shore' };
  const snapshot = { schema: 'rus.items.ambient_ordinary_committed_context.v1', version: 1,
    context_pin_ref: 'ambient:shore:v1', scope_ref, ambient_sources: [{
      source_ref: 'ambient:shore', state: 'committed', basis_kind: 'ambient_ordinary_source',
      scope_ref: structuredClone(scope_ref), environment_ref: 'shore', source_class: 'wet_sand',
      property_basis_ref: 'property:shore', finite_portion_profile_refs: ['portion:wet-sand'],
      topology_claims: [], hazard_claims: [] }], finite_portion_profiles: [{
      profile_ref: 'portion:wet-sand', state: 'committed', source_class: 'wet_sand',
      semantic_type: 'material_portion', display_name: 'горсть мокрого песка',
      material_class: 'ordinary', quantity_unit: 'handful', min_quantity: 1, max_quantity: 1,
      min_mass_grams: 100, max_mass_grams: 300, external_hand_cost: 1,
      carry_form: 'compact', packing_slot_cost: 1 }], property_bases: [{
      property_basis_ref: 'property:shore', state: 'committed', scope_ref: structuredClone(scope_ref),
      environment_ref: 'shore' }], destinations: [{ destination_ref: 'mikula', state: 'committed',
      kind: 'holder', target_ref: 'mikula', scope_ref: structuredClone(scope_ref) }] };
  return { context_pin_ref: snapshot.context_pin_ref,
    context_digest: ambientOrdinaryCommittedContextDigest(snapshot), snapshot };
}
