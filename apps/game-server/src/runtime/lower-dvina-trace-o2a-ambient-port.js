import {
  ambientOrdinaryCommittedContextDigest,
  createAmbientOrdinaryPortionAdmission
} from '@rus/items-property';

// This is intentionally a small production adapter.  The authored profile is
// the only source of a source/profile; the plan supplies only a measurement.
export function createLowerDvinaTraceO2aAmbientPort({ profile, committedState } = {}) {
  const ambient = profile?.o2a_ambient;
  const g6 = committedState?.position?.g6_id ?? committedState?.position?.g6_ref;
  const actor = committedState?.actor_id;
  if (ambient?.status !== 'approved' || g6 !== ambient?.scope_binding?.g6_ref
      || committedState?.position?.location_ref !== ambient?.scope_binding?.position_ref
      || !text(actor)) return null;
  const snapshot = {
    schema: 'rus.items.ambient_ordinary_committed_context.v1', version: 1,
    context_pin_ref: ambient.context_pin_ref,
    scope_ref: { entity_kind: 'g6', entity_id: g6 },
    ambient_sources: [{ source_ref: ambient.source_ref, state: 'committed',
      basis_kind: 'ambient_ordinary_source', scope_ref: { entity_kind: 'g6', entity_id: g6 },
      environment_ref: ambient.environment_ref, source_class: ambient.source_class,
      property_basis_ref: ambient.property_basis_ref,
      finite_portion_profile_refs: [ambient.portion_profile.profile_ref],
      topology_claims: [], hazard_claims: [] }],
    finite_portion_profiles: [{ ...ambient.portion_profile, state: 'committed',
      source_class: ambient.source_class }],
    property_bases: [{ property_basis_ref: ambient.property_basis_ref,
      state: 'committed', scope_ref: { entity_kind: 'g6', entity_id: g6 },
      environment_ref: ambient.environment_ref }],
    destinations: [{ destination_ref: actor, state: 'committed', kind: 'holder',
      target_ref: actor, scope_ref: { entity_kind: 'g6', entity_id: g6 } }]
  };
  const context_digest = ambientOrdinaryCommittedContextDigest(snapshot);
  if (!context_digest) return null;
  return createAmbientOrdinaryPortionAdmission({
    loadCommittedContext: async () => ({ context_pin_ref: ambient.context_pin_ref,
      context_digest, snapshot })
  });
}

function text(value) { return typeof value === 'string' && value.length > 0 && value.trim() === value; }
