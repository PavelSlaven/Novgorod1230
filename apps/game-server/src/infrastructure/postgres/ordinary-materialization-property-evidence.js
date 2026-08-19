import { canonicalDigest } from '@rus/materialization';
import { ordinaryWorldPropertyPlacementContextDigest,
  resolveOrdinaryWorldPropertyPlacement } from '@rus/items-property';

export function propertyPlacementBaseDigest(base) {
  return ordinaryWorldPropertyPlacementContextDigest({ ...base,
    supporting_basis_ref: 'phase6_context_digest_only',
    causal_basis_refs: ['phase6_context_digest_only'],
    requested_position_ref: 'phase6_context_digest_only' });
}

export function propertyPlacementEvidenceMatches({ base, item }) {
  const result = resolveOrdinaryWorldPropertyPlacement({ ...base,
    supporting_basis_ref: item.supporting_basis_ref,
    causal_basis_refs: item.causal_basis_refs,
    requested_position_ref: item.position_ref });
  return result.pass === true
    && (result.evidence.property_basis_class !== 'explicit_source_item'
      || item.supporting_basis_ref === result.evidence.property_source_ref
      || item.causal_basis_refs.includes(result.evidence.property_source_ref))
    && canonicalDigest(result.evidence)
      === canonicalDigest(item.item_proposal.property_placement_evidence);
}
