/** Exact approved npc_binding closure readers shared by the NPC composition and place-people readers. */
const exactRefs = (refs) => Array.isArray(refs) && refs.every((ref) =>
  ref && typeof ref.id === 'string' && ref.id.trim()
    && Number.isInteger(ref.version) && ref.version > 0);

/** Runtime profile rows for the given refs and everything they reference; null when any is missing or invalid. */
export async function readApprovedNpcRuntimeProfiles(query, revision, refs) {
  const rowsByRef = new Map();
  let pending = refs;
  while (pending.length) {
    const uniquePending = [...new Map(pending.map((ref) =>
      [`${ref.id}:${ref.version}`, ref])).values()]
      .filter((ref) => !rowsByRef.has(`${ref.id}:${ref.version}`));
    if (!uniquePending.length) break;
    const result = await query(`SELECT p.entity_kind,p.id,p.version,
      p.world_revision_id,p.profile_kind,p.role_ref,p.occupation_ref,p.payload,
      p.status,p.provenance_ref,p.directness,p.confidence,p.canonical_digest,
      av.status AS authoring_status,av.canonical_digest AS authoring_digest
      FROM unnest($1::text[],$2::int[]) AS wanted(id,version)
      JOIN world_base.spatial_v3_npc_runtime_profiles p
        ON p.id=wanted.id AND p.version=wanted.version
       AND p.world_revision_id=$3
      JOIN world_base.spatial_v3_authoring_versions av
        ON av.entity_kind=p.entity_kind AND av.entity_id=p.id
       AND av.version=p.version AND av.world_revision_id=p.world_revision_id
       AND av.status='approved' AND av.canonical_digest=p.canonical_digest
      WHERE p.status='approved' ORDER BY p.id,p.version`,
    [uniquePending.map((ref) => ref.id), uniquePending.map((ref) => ref.version), revision]);
    const rows = result?.rows;
    if (!Array.isArray(rows) || rows.length !== uniquePending.length) return null;
    const next = [];
    for (const row of rows) {
      if (row.entity_kind !== 'npc_runtime_profile'
          || row.world_revision_id !== revision || row.status !== 'approved'
          || row.authoring_status !== 'approved'
          || row.authoring_digest !== row.canonical_digest
          || !row.profile_kind || !row.provenance_ref || !row.directness
          || !row.confidence || !row.payload || typeof row.payload !== 'object') return null;
      const key = `${row.id}:${row.version}`;
      rowsByRef.set(key, row);
      if (row.profile_kind === 'npc_binding') {
        if (!row.role_ref || !row.occupation_ref
            || row.payload.role_ref !== row.role_ref
            || row.payload.occupation_ref !== row.occupation_ref
            || !exactRefs(row.payload.runtime_profile_refs)
            || !exactRefs(row.payload.regional_context_refs)
            || row.payload.runtime_profile_refs.length === 0
            || row.payload.regional_context_refs.length === 0) return null;
        next.push(...row.payload.runtime_profile_refs);
      } else if (row.payload.runtime_profile_refs !== undefined) {
        if (!exactRefs(row.payload.runtime_profile_refs)) return null;
        next.push(...row.payload.runtime_profile_refs);
      }
    }
    pending = next;
  }
  return [...rowsByRef.values()].sort((left, right) =>
    left.id.localeCompare(right.id) || left.version - right.version);
}

/** Approved regional contexts named by the given npc_binding rows; null when any is missing or invalid. */
export async function readApprovedNpcRegionalContexts(query, revision, runtimeProfiles) {
  const regionalRefs = [...new Map(runtimeProfiles
    .filter((row) => row.profile_kind === 'npc_binding')
    .flatMap((row) => row.payload.regional_context_refs)
    .map((ref) => [`${ref.id}:${ref.version}`, ref])).values()];
  const regionalResult = regionalRefs.length === 0 ? { rows: [] }
    : await query(`SELECT p.entity_kind,p.id,p.version,p.world_revision_id,
      p.payload,p.status,p.provenance_ref,p.directness,p.confidence,p.canonical_digest,
      av.status AS authoring_status,av.canonical_digest AS authoring_digest
      FROM unnest($1::text[],$2::int[]) AS wanted(id,version)
      JOIN world_base.spatial_v3_npc_regional_context_profiles p
        ON p.id=wanted.id AND p.version=wanted.version
       AND p.world_revision_id=$3
      JOIN world_base.spatial_v3_authoring_versions av
        ON av.entity_kind=p.entity_kind AND av.entity_id=p.id
       AND av.version=p.version AND av.world_revision_id=p.world_revision_id
       AND av.status='approved' AND av.canonical_digest=p.canonical_digest
      WHERE p.status='approved' ORDER BY p.id,p.version`,
    [regionalRefs.map((ref) => ref.id), regionalRefs.map((ref) => ref.version), revision]);
  const regionalProfiles = regionalResult?.rows;
  if (!Array.isArray(regionalProfiles) || regionalProfiles.length !== regionalRefs.length
      || regionalProfiles.some((row) => row.entity_kind !== 'npc_regional_context_profile'
        || row.world_revision_id !== revision || row.status !== 'approved'
        || row.authoring_status !== 'approved' || row.authoring_digest !== row.canonical_digest
        || !row.provenance_ref || !row.directness || !row.confidence
        || !row.payload || typeof row.payload !== 'object'
        || row.payload.id !== row.id || row.payload.version !== row.version
        || row.payload.world_revision_id !== revision
        || !Array.isArray(row.payload.applicability))) {
    return null;
  }
  return regionalProfiles;
}
