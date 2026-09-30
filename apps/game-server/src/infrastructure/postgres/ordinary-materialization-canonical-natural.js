import { canonicalDigest } from '@rus/materialization';

const APPROVAL_FIELDS = ['approved_by', 'approved_on', 'approved_path', 'approved_commit'];
const unresolved = () => { throw Object.assign(new Error('M2C_NATURAL_ACCESS_CONTEXT_UNRESOLVED'),
  { code: 'M2C_NATURAL_ACCESS_CONTEXT_UNRESOLVED' }); };

/** Finite natural sources of canonical G5 places count only from an approved file (WR 21.1). */
export function readApprovedCanonicalFiniteApplicability(file, worldRevisionId) {
  if (file?.schema !== 'rus.m2c_canonical_finite_applicability.v1' || file.status !== 'approved'
      || file.world_revision_id !== worldRevisionId || !Array.isArray(file.rows)
      || !APPROVAL_FIELDS.every((key) => typeof file.approval?.[key] === 'string'
        && file.approval[key].length > 0)) return null;
  const profilesFor = (site, g4Id) => site?.origin === 'canonical'
    ? file.rows.filter((row) => row.canonical_g5_ref?.id === site.canonical_g5_ref?.entity_id
      && String(row.canonical_g5_ref?.version) === String(site.canonical_g5_ref?.authoring_version)
      && row.g4_ref?.id === g4Id).flatMap((row) => row.natural_finite_source_profile_refs) : [];
  return Object.freeze({ worldRevisionId, profilesFor,
    contextRef: `${file.schema}@${file.approval.approved_commit}` });
}

/** Commons of the approved rows are open under the free-gathering policy; no parcel right is invented. */
export function createCanonicalNaturalPropertyReader({ applicability, authoring }) {
  return async function readCanonicalNaturalSourceProperty({ transaction, partyId, g5Id, g4Id,
    sourceRef, profileId, operation, spatialProposal = null }) {
    const profiles = authoring.natural_finite_source_profiles.filter((row) =>
      row.profile_id === profileId && row.operation === operation);
    const party = await transaction.query(`SELECT world_revision_id
      FROM party_runtime.parties WHERE party_id=$1`, [partyId]);
    const sites = spatialProposal != null
      ? spatialProposal.inserts.filter((row) => row.target_table === 'party_g5_sites'
        && row.id === g5Id && row.record.party_id === partyId).map((row) => row.record)
      : (await transaction.query(`SELECT * FROM party_runtime.party_g5_sites
        WHERE party_id=$1 AND id=$2`, [partyId, g5Id])).rows;
    if (profiles.length !== 1 || party.rows[0]?.world_revision_id !== applicability.worldRevisionId
        || !authoring.gameplay_access_policy.operations.includes(operation)
        || sites.length !== 1 || sites[0].status !== 'active' || sites[0].parent_g4_id !== g4Id
        || !applicability.profilesFor(sites[0], g4Id).includes(profileId)
        || sourceRef !== `${profileId}:${canonicalDigest({ party_id: partyId, generated_g5_id: g5Id,
          profile_id: profileId, version: profiles[0].version }).slice(0, 24)}`) unresolved();
    if (spatialProposal != null) {
      return { lookup_state: 'complete', explicit_rule: null,
        context_ref: applicability.contextRef, context_sha256: null };
    }
    // Existing scope: the decision is the one committed with the source itself.
    const committed = await transaction.query(`SELECT e.objective_snapshot,n.property_basis_ref,
        n.access_policy_ref
      FROM party_runtime.party_g6_instances g
      JOIN party_runtime.party_ordinary_materialization_enablements e
        ON e.party_id=g.party_id AND e.scope_kind='g6' AND e.scope_id=g.id
      JOIN party_runtime.party_resource_nodes n ON n.party_id=g.party_id AND n.resource_node_id=$3
      WHERE g.party_id=$1 AND g.host_kind='g5_site' AND g.host_id=$2 AND g.status='active'
        AND g.scene_slot_key='main'`, [partyId, g5Id, sourceRef]);
    const caps = committed.rows[0]?.objective_snapshot?.execution_context
      ?.context_bound_capabilities?.filter((entry) => entry.source_ref === sourceRef) ?? [];
    if (committed.rowCount !== 1 || caps.length !== 1
        || caps[0].natural_property_context_ref !== applicability.contextRef
        || caps[0].context_refs?.property_context_ref !== committed.rows[0].property_basis_ref) unresolved();
    return { lookup_state: 'complete', explicit_rule: { decision: caps[0].access_decision,
      property_basis_ref: committed.rows[0].property_basis_ref,
      access_policy_ref: committed.rows[0].access_policy_ref.id },
    context_ref: applicability.contextRef, context_sha256: null };
  };
}
