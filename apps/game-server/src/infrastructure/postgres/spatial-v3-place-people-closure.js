import { canonicalDigest } from '@rus/materialization';
import { readApprovedNpcRegionalContexts, readApprovedNpcRuntimeProfiles } from './spatial-v3-npc-profile-closure.js';

const fail = (reason, soft = false) => Object.freeze({ ok: false, reason, soft });

/**
 * Approved npc_binding candidates (id, version, role, occupation only) for the subjects of a canonical place and the
 * placement policy the G4 already uses for its NPC compositions. Read-only. `soft` marks plain absence of data (the
 * caller records a gap); every other failure is an invariant or an ambiguous approved reference (the caller fails).
 */
export async function readPlacePeopleCandidates(query, { g4, canonical_g5: canonical, subjects } = {}) {
  const revision = g4?.world_revision_id;
  if (typeof query !== 'function' || !g4?.id || !Number.isInteger(g4.version) || !revision
      || !canonical?.id || !Number.isInteger(canonical.version)
      || !Array.isArray(subjects) || subjects.length === 0) return fail('place_people_input_invalid');
  const place = await query(`SELECT n.id FROM world_base.spatial_v3_nodes n
    JOIN world_base.spatial_v3_node_parents parent
      ON parent.child_id=n.id AND parent.child_version=n.version AND parent.world_revision_id=n.world_revision_id
    JOIN world_base.spatial_v3_authoring_versions av
      ON av.entity_kind='spatial_node' AND av.entity_id=n.id AND av.version=n.version
     AND av.world_revision_id=n.world_revision_id AND av.status='approved' AND av.canonical_digest=n.canonical_digest
    WHERE n.id=$1 AND n.version=$2 AND n.world_revision_id=$3 AND n.spatial_level='G5' AND n.status='approved'
      AND parent.parent_id=$4 AND parent.parent_version=$5`,
  [canonical.id, canonical.version, revision, g4.id, g4.version]);
  if (place?.rows?.length !== 1) return fail('approved_canonical_g5_under_g4_missing');
  const ofKind = (kind) => subjects.filter((subject) => subject.subject_kind === kind).map((subject) => subject.subject_ref);
  const found = await query(`SELECT p.id,p.version,p.role_ref,p.occupation_ref
    FROM world_base.spatial_v3_npc_runtime_profiles p
    JOIN world_base.spatial_v3_authoring_versions av
      ON av.entity_kind=p.entity_kind AND av.entity_id=p.id AND av.version=p.version
     AND av.world_revision_id=p.world_revision_id AND av.status='approved' AND av.canonical_digest=p.canonical_digest
    WHERE p.world_revision_id=$1 AND p.profile_kind='npc_binding' AND p.status='approved'
      AND (p.id=ANY($2::text[]) OR p.role_ref=ANY($3::text[]) OR p.occupation_ref=ANY($4::text[]))
    ORDER BY p.id,p.version`,
  [revision, subjects.map((subject) => subject.profile_id).filter(Boolean), ofKind('social_role'), ofKind('occupation')]);
  const candidates = (found?.rows ?? []).map(({ id, version, role_ref, occupation_ref }) => ({ id, version, role_ref, occupation_ref }));
  const policies = await query(`SELECT DISTINCT c.payload->'placement_policy' AS policy
    FROM world_base.spatial_v3_g4_npc_composition_bindings c
    JOIN world_base.spatial_v3_authoring_versions av
      ON av.entity_kind=c.entity_kind AND av.entity_id=c.id AND av.version=c.version
     AND av.world_revision_id=c.world_revision_id AND av.status='approved' AND av.canonical_digest=c.canonical_digest
    WHERE c.world_revision_id=$1 AND c.g4_id=$2 AND c.g4_version=$3 AND c.status='approved'`,
  [revision, g4.id, g4.version]);
  const distinct = new Map((policies?.rows ?? []).filter((row) => row.policy)
    .map((row) => [canonicalDigest(row.policy), row.policy]));
  if (distinct.size === 0) return fail('g4_placement_policy_missing', true);
  if (distinct.size > 1) return fail('g4_placement_policy_ambiguous');
  return Object.freeze({ ok: true, candidates, placement_policy: structuredClone([...distinct.values()][0]) });
}

/** The runtime and regional closure of the chosen profile refs only (a broken unrelated row cannot matter). */
export async function readPlacePeopleClosure(query, { g4, canonical_g5: canonical, profile_refs: refs, placement_policy: policy } = {}) {
  const revision = g4?.world_revision_id;
  if (typeof query !== 'function' || !revision || !canonical?.id || !Array.isArray(refs) || refs.length === 0 || !policy) {
    return fail('place_people_input_invalid');
  }
  const runtimeProfiles = await readApprovedNpcRuntimeProfiles(query, revision, refs);
  if (!runtimeProfiles) return fail('approved_npc_runtime_profile_closure_invalid');
  const regionalProfiles = await readApprovedNpcRegionalContexts(query, revision, runtimeProfiles);
  if (!regionalProfiles) return fail('approved_npc_regional_context_closure_invalid');
  return Object.freeze({ ok: true, closure: structuredClone({
    schema: 'rus.place_people_binding_bundle.v1', world_revision_id: revision,
    g4_ref: { id: g4.id, version: g4.version, world_revision_id: revision },
    canonical_g5_ref: { id: canonical.id, version: canonical.version },
    placement_policy: policy, runtime_profiles: runtimeProfiles, regional_context_profiles: regionalProfiles }) });
}
