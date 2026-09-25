import { createHash } from 'node:crypto';
import { canonicalDigest } from '@rus/materialization';
import { deriveApprovedGeneratedSceneV2Bindings } from './approved-generated-scene-v2-bindings.js';

export function readApprovedNaturalFirstEntryAuthoring({ candidateBytes, approval,
  capacityApproval, sceneTemplateBytes, materializationProfileBytes } = {}) {
  if (typeof candidateBytes !== 'string'
      || approval?.decision !== 'APPROVE_M2C_ITEMS_AUTHORING_V1'
      || approval.approval_scope !== 'items_and_finite_stocks_authoring_data_only'
      || createHash('sha256').update(candidateBytes).digest('hex')
        !== approval.candidate_sha256) fail('ORDINARY_NATURAL_AUTHORING_NOT_APPROVED');
  const candidate = JSON.parse(candidateBytes);
  if (approval.candidate_ref !== `${candidate.candidate_id}@${candidate.version}`
      || !Array.isArray(candidate.family_profiles)
      || !Array.isArray(candidate.natural_finite_source_profiles)) {
    fail('ORDINARY_NATURAL_AUTHORING_NOT_APPROVED');
  }
  return capacityApproval == null ? candidate
    : deriveApprovedGeneratedSceneV2Bindings(candidate, { capacityApproval, sceneTemplateBytes,
      materializationProfileBytes });
}

export async function buildFirstEntryNaturalCapabilities({ authoring, binding,
  readProperty, transaction, partyId, scope, positionRef, profile, spatialProposal = null }) {
  if (authoring == null) return [];
  if (!binding || typeof readProperty !== 'function' || !text(binding.g5_id)
      || binding.world_revision_id !== authoring.target.world_revision_id) {
    fail('ORDINARY_NATURAL_FIRST_ENTRY_BINDING_INVALID');
  }
  const matches = authoring.family_profiles.filter(({ exact_match: match }) =>
    match.world_revision_id === binding.world_revision_id
      && match.g5_generation_template_id === binding.g5_generation_template_id
      && match.g5_generation_template_version === binding.g5_generation_template_version
      && match.g4_refs.some(({ id, version }) => id === binding.g4_id
        && version === binding.g4_version)
      && match.scene_template_refs.includes(
        `${binding.scene_template_id}@${binding.scene_template_version}`));
  if (matches.length !== 1) fail('ORDINARY_NATURAL_FIRST_ENTRY_BINDING_INVALID');
  const spatial = spatialProposal == null ? await transaction.query(`SELECT s.generated_template_ref,
      g.source_scene_template_ref,g.scene_slot_key,p.template_slot_key
    FROM party_runtime.party_g5_sites s
    JOIN party_runtime.parties party ON party.party_id=s.party_id
    JOIN party_runtime.party_g6_instances g ON g.party_id=s.party_id
      AND g.host_kind='g5_site' AND g.host_id=s.id
    JOIN party_runtime.scene_position_nodes p ON p.party_id=s.party_id
      AND p.g6_instance_id=g.id
    WHERE s.party_id=$1 AND s.id=$2 AND s.parent_g4_id=$3
      AND s.origin='generated' AND s.status='active'
      AND party.world_revision_id=$4 AND g.id=$5 AND g.status='active'
      AND p.id=$6 AND p.status='active'`, [partyId, binding.g5_id,
    binding.g4_id, binding.world_revision_id, scope.entity_id, positionRef])
    : await proposedSpatialBinding({ transaction, partyId, binding, scope,
      positionRef, proposal: spatialProposal });
  const bound = spatial.rows[0];
  if (spatial.rowCount !== 1
      || bound.generated_template_ref?.entity_id !== binding.g5_generation_template_id
      || String(bound.generated_template_ref?.authoring_version)
        !== String(binding.g5_generation_template_version)
      || bound.source_scene_template_ref?.entity_id !== binding.scene_template_id
      || String(bound.source_scene_template_ref?.authoring_version)
        !== String(binding.scene_template_version)
      || bound.scene_slot_key !== binding.g6_slot_key
      || bound.template_slot_key !== binding.position_slot_key) {
    fail('ORDINARY_NATURAL_FIRST_ENTRY_BINDING_INVALID');
  }
  const policy = authoring.gameplay_access_policy;
  const results = [];
  for (const id of matches[0].natural_finite_source_profile_refs ?? []) {
    const selected = authoring.natural_finite_source_profiles.filter((row) => row.profile_id === id);
    if (selected.length !== 1) fail('ORDINARY_NATURAL_FIRST_ENTRY_BINDING_INVALID');
    const row = selected[0];
    if (row.access_policy_ref !== policy.policy_id
        || !policy.operations.includes(row.operation)
        || row.placement.g6_slot_key !== binding.g6_slot_key
        || row.placement.position_slot_key !== binding.position_slot_key
        || row.quantity_unit_ref.id !== 'item'
        || !Number.isSafeInteger(row.output_mechanics.mass_grams_per_unit)
        || row.output_mechanics.mass_grams_per_unit < 1) {
      fail('ORDINARY_NATURAL_FIRST_ENTRY_BINDING_INVALID');
    }
    const sourceRef = `${row.profile_id}:${canonicalDigest({ party_id: partyId,
      generated_g5_id: binding.g5_id, profile_id: row.profile_id,
      version: row.version }).slice(0, 24)}`;
    const rights = await readProperty({ transaction, partyId,
      g5Id: binding.g5_id, sourceRef, profileId: row.profile_id,
      operation: row.operation, g4Id: binding.g4_id,
      spatialProposal });
    if (rights?.lookup_state !== 'complete' || !Object.hasOwn(rights, 'explicit_rule')) {
      fail('M2C_NATURAL_ACCESS_CONTEXT_UNRESOLVED');
    }
    const explicit = rights.explicit_rule;
    if (explicit != null && (!['allow', 'deny', 'conditional'].includes(explicit.decision)
        || !text(explicit.property_basis_ref) || !text(explicit.access_policy_ref))) {
      fail('M2C_NATURAL_ACCESS_CONTEXT_UNRESOLVED');
    }
    const propertyRef = explicit?.property_basis_ref ?? `${sourceRef}:property:${policy.policy_id}`;
    const accessRef = explicit?.access_policy_ref ?? policy.policy_id;
    const basis = { basis_ref: sourceRef, state: 'committed', scope_ref: scope,
      prepared_seed_provenance: null, functional_buckets: [row.functional_bucket],
      allowed_admission_classes: [row.admission_class], permission_refs: [],
      basis_kind: 'finite_source' };
    const finiteSource = { source_resource_node_id: sourceRef,
      quantity_unit_ref: structuredClone(row.quantity_unit_ref), position_ref: positionRef,
      property_basis_ref: propertyRef,
      initial_amount_bounds: structuredClone(row.initial_amount_bounds) };
    const mechanics = { ...structuredClone(row.mechanics_policy),
      mass_grams_per_quantity_unit: row.output_mechanics.mass_grams_per_unit };
    results.push({ basis, property_basis_ref: propertyRef,
      finite_source: { ...finiteSource, initial_quantity: row.initial_quantity,
        quality_ref: { kind: 'ordinary_material_quality', id: row.resource_class },
        access_policy_ref: { kind: 'ordinary_resource_access', id: accessRef } },
      capability: { capability_ref: row.profile_id, source_ref: sourceRef,
        public_name: row.public_name, disclosure_state: 'visible',
        item_kind: row.item_kind, operation: row.operation,
        access_decision: explicit?.decision ?? 'allow',
        access_policy_ref: accessRef,
        natural_property_context_ref: rights.context_ref ?? null,
        natural_property_context_sha256: rights.context_sha256 ?? null,
        candidate_context: { target_ref: sourceRef,
          candidate_ref_namespace: `${sourceRef}:candidate`,
          normalizer_version: profile.execution.candidate_context.normalizer_version,
          semantic_type: row.semantic_type, candidate_hint: null,
          functional_bucket: row.functional_bucket, admission_class: row.admission_class,
          availability_class: 'common', coverage_kind: 'finite_source', coverage_ref: sourceRef,
          policy_version: profile.policy_refs.ordinary_presence_policy_ref },
        supporting_bases: [basis], context_bound_ordinary_profile: null,
        constrained_natural_resource_profile: null,
        finite_source_authority: { schema: 'rus.items.finite_source_authority.v1',
          version: 1, state: 'committed', source_basis_ref: sourceRef,
          finite_source: finiteSource },
        execution_context: { mechanics_policy: mechanics },
        context_refs: { ...structuredClone(profile.context_refs), property_context_ref: propertyRef },
        policy_refs: { ...structuredClone(profile.policy_refs),
          runtime_item_mechanics_policy_ref: mechanics.policy_ref,
          allowed_admission_classes: [row.admission_class], context_bound_permission_refs: [],
          allowed_supporting_bases: [{ basis_ref: sourceRef, basis_state: 'committed' }] }
      } });
  }
  return results;
}

async function proposedSpatialBinding({ transaction, partyId, binding, scope,
  positionRef, proposal }) {
  const one = (table, id) => {
    const rows = proposal.inserts?.filter((write) => write.target_table === table
      && write.id === id && write.record?.party_id === partyId) ?? [];
    return rows.length === 1 ? rows[0].record : null;
  };
  const site = one('party_g5_sites', binding.g5_id);
  const g6 = one('party_g6_instances', scope.entity_id);
  const position = one('scene_position_nodes', positionRef);
  const baseline = one('party_scene_baselines', g6?.scene_baseline_id);
  const party = await transaction.query(`SELECT world_revision_id
    FROM party_runtime.parties WHERE party_id=$1`, [partyId]);
  if (party.rows[0]?.world_revision_id !== binding.world_revision_id
      || site?.origin !== 'generated' || site.status !== 'active'
      || site.parent_g4_id !== binding.g4_id || proposal.target_site_id !== site.id
      || g6?.host_kind !== 'g5_site' || g6.host_id !== site.id || g6.status !== 'active'
      || baseline?.host_kind !== 'g5_site' || baseline.host_id !== site.id
      || baseline.status !== 'active' || position?.g6_instance_id !== g6.id
      || position.status !== 'active') fail('ORDINARY_NATURAL_FIRST_ENTRY_BINDING_INVALID');
  return { rowCount: 1, rows: [{ generated_template_ref: site.generated_template_ref,
    source_scene_template_ref: g6.source_scene_template_ref,
    scene_slot_key: g6.scene_slot_key, template_slot_key: position.template_slot_key }] };
}

function text(value) { return typeof value === 'string' && value.trim() === value && value.length > 0; }
function fail(code) { throw Object.assign(new Error(code), { code }); }
