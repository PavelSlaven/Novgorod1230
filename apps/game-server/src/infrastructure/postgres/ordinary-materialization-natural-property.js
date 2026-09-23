import { createHash } from 'node:crypto';
import { canonicalDigest } from '@rus/materialization';

const ITEMS = 'data/world-catalogs/novgorod/m2c-items/candidate.json';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const unresolved = () => { throw Object.assign(new Error('M2C_NATURAL_ACCESS_CONTEXT_UNRESOLVED'),
  { code: 'M2C_NATURAL_ACCESS_CONTEXT_UNRESOLVED' }); };

/** Reads the existing ordinary source property context; no separate rights store. */
export function createApprovedGeneratedNaturalPropertyReader({ candidateBytes, approval,
  sourceBytesByPath } = {}) {
  if (typeof candidateBytes !== 'string'
      || approval?.decision !== 'APPROVE_M2C_GENERATED_PROPERTY_CONTEXT_AUTHORING_V1'
      || approval.approval_scope !== 'generated_property_context_authoring_data_only'
      || hash(candidateBytes) !== approval.candidate_sha256) unresolved();
  const candidate = JSON.parse(candidateBytes);
  const contextRef = `${candidate.candidate_id}@${candidate.version}`;
  if (approval.candidate_ref !== contextRef || !Array.isArray(candidate.source_set)
      || candidate.source_set.some((pin) => typeof sourceBytesByPath?.[pin.path] !== 'string'
        || hash(sourceBytesByPath[pin.path]) !== pin.sha256)) unresolved();
  const items = JSON.parse(sourceBytesByPath[ITEMS]);
  return async function readNaturalSourceProperty({ transaction, partyId, g5Id,
    g4Id, sourceRef, profileId, operation, spatialProposal = null }) {
    if (!transaction?.query || !candidate.operations.includes(operation)) unresolved();
    const profiles = items.natural_finite_source_profiles.filter((row) =>
      row.profile_id === profileId && row.operation === operation);
    if (profiles.length !== 1 || sourceRef !== `${profileId}:${canonicalDigest({
      party_id: partyId, generated_g5_id: g5Id, profile_id: profileId,
      version: profiles[0].version }).slice(0, 24)}`) unresolved();
    const party = await transaction.query(`SELECT world_revision_id
      FROM party_runtime.parties WHERE party_id=$1`, [partyId]);
    if (party.rows[0]?.world_revision_id !== candidate.target.world_revision_id) unresolved();
    let sites;
    if (spatialProposal != null) {
      sites = spatialProposal.inserts.filter((row) => row.target_table === 'party_g5_sites'
        && row.id === g5Id && row.record.party_id === partyId).map((row) => row.record);
    } else {
      sites = (await transaction.query(`SELECT * FROM party_runtime.party_g5_sites
        WHERE party_id=$1 AND id=$2`, [partyId, g5Id])).rows;
    }
    if (sites.length !== 1) unresolved();
    const site = sites[0];
    const g4 = candidate.g4_bindings.find((row) => row.g4_id === g4Id);
    const families = candidate.family_bindings.filter((row) =>
      row.g5_generation_template_id === site.generated_template_ref?.entity_id
      && String(row.g5_generation_template_version) === String(site.generated_template_ref?.authoring_version)
      && row.g4_refs.some((ref) => ref.id === g4Id && ref.version === g4?.g4_version));
    if (site.origin !== 'generated' || site.status !== 'active' || site.parent_g4_id !== g4Id
        || families.length !== 1 || !g4?.slot_refs.some((ref) =>
          ref.id === site.expansion_slot_ref?.entity_id
          && String(ref.version) === String(site.expansion_slot_ref?.authoring_version))) unresolved();
    const itemFamily = items.family_profiles.find((row) =>
      row.exact_match.g5_generation_template_id === families[0].g5_generation_template_id);
    if (!itemFamily?.natural_finite_source_profile_refs.includes(profileId)) unresolved();
    // A committed exact source override lives in the same objective/property catalogs
    // used by admission and P16. An orphan or conflicting assignment is unresolved.
    const lookup = await transaction.query(`SELECT e.objective_snapshot,e.objective_digest,e.enabled,
        c.property_placement_base_snapshot,n.property_basis_ref,n.access_policy_ref,n.resource_node_id,
        g.id AS g6_id,p.g6_instance_id AS source_g6_id,g.source_scene_template_ref
      FROM party_runtime.party_g6_instances g
      LEFT JOIN party_runtime.party_ordinary_materialization_enablements e
        ON e.party_id=g.party_id AND e.scope_kind='g6' AND e.scope_id=g.id
      LEFT JOIN party_runtime.party_ordinary_materialization_contexts c
        ON c.party_id=g.party_id AND c.scope_kind='g6' AND c.scope_id=g.id
      LEFT JOIN party_runtime.party_resource_nodes n ON n.party_id=g.party_id AND n.resource_node_id=$3
      LEFT JOIN party_runtime.scene_position_nodes p ON p.party_id=n.party_id AND p.id=n.position_node_id
      WHERE g.party_id=$1 AND g.host_kind='g5_site' AND g.host_id=$2 AND g.status='active'
        AND g.scene_slot_key='main'`,
    [partyId, g5Id, sourceRef]);
    const contexts = lookup.rows.filter((row) => row.objective_snapshot != null || row.resource_node_id != null);
    const decisions = [];
    for (const row of contexts) {
      const caps = row.objective_snapshot?.execution_context?.context_bound_capabilities?.filter(
        (entry) => entry.source_ref === sourceRef) ?? [];
      if (!row.enabled || canonicalDigest(row.objective_snapshot) !== row.objective_digest
          || caps.length !== 1 || row.resource_node_id !== sourceRef
          || row.g6_id !== row.source_g6_id
          || !families[0].scene_template_refs.includes(
            `${row.source_scene_template_ref?.entity_id}@${row.source_scene_template_ref?.authoring_version}`)) unresolved();
      const cap = caps[0];
      const entries = row.property_placement_base_snapshot?.property_catalog?.filter(
        (entry) => entry.source_ref === sourceRef) ?? [];
      if (entries.length !== 1 || entries[0].property_basis_ref !== row.property_basis_ref
          || entries[0].state !== 'committed' || entries[0].basis_class !== 'explicit_source_item'
          || entries[0].scope_ref?.entity_kind !== 'g6' || entries[0].scope_ref?.entity_id !== row.g6_id
          || cap.context_refs.property_context_ref !== row.property_basis_ref
          || cap.access_policy_ref !== row.access_policy_ref?.id
          || cap.natural_property_context_ref !== contextRef
          || cap.natural_property_context_sha256 !== approval.candidate_sha256
          || !['allow', 'deny', 'conditional'].includes(cap.access_decision)) unresolved();
      decisions.push({ decision: cap.access_decision, property_basis_ref: row.property_basis_ref,
        access_policy_ref: row.access_policy_ref.id });
    }
    if (decisions.length > 1) unresolved();
    // Existing scope with no exact source cannot be reinterpreted as a new parcel.
    if (spatialProposal == null && decisions.length !== 1) unresolved();
    const overrides = candidate.explicit_authored_overrides.filter((row) =>
      row.g4_id === g4Id && row.g5_generation_template_id === families[0].g5_generation_template_id
      && row.profile_id === profileId && row.operation === operation);
    if (overrides.length > 1) unresolved();
    return { lookup_state: 'complete', explicit_rule: decisions[0] ?? overrides[0] ?? null,
      context_ref: contextRef, context_sha256: approval.candidate_sha256 };
  };
}
