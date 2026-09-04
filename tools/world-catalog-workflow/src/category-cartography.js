export function validateCategoryCartography({ cartography, pack, locations,
  materializationProfiles, sourceClaimsByPath } = {}) {
  const errors = [];
  if (cartography?.schema !== 'world_knowledge_category_cartography_v1') return ['CARTOGRAPHY_SCHEMA_INVALID'];
  if (pack?.manifest?.status !== 'production') errors.push('CARTOGRAPHY_PACK_NOT_PRODUCTION');
  if (cartography.pack_ref !== pack?.manifest?.pack_ref || cartography.revision_id !== pack?.manifest?.revision_id) errors.push('CARTOGRAPHY_PACK_PIN_MISMATCH');
  const rollups = new Map((cartography.domain_rollups ?? []).map((family) => [family.id, family]));
  if (rollups.size !== cartography.domain_rollups?.length) errors.push('CARTOGRAPHY_DOMAIN_ROLLUP_DUPLICATE');
  for (const family of rollups.values()) {
    if (!pack?.manifest?.domains?.includes(family.domain) || family.claim_selector?.domain !== family.domain) errors.push(`CARTOGRAPHY_FAMILY_DOMAIN_INVALID:${family.id}`);
    if (family.coverage === 'complete') errors.push(`CARTOGRAPHY_FALSE_COMPLETENESS:${family.id}`);
    const refs = new Set((pack?.claims ?? []).filter((claim) => claim.domain === family.domain).map((claim) => claim.claim_ref));
    if (refs.size === 0) errors.push(`CARTOGRAPHY_CLAIMS_UNMAPPED:${family.id}`);
    for (const ref of family.claim_ref_samples ?? []) if (!refs.has(ref)) errors.push(`CARTOGRAPHY_CLAIM_REF_UNMAPPED:${ref}`);
  }
  const allClaimRefs = (pack?.claims ?? []).map((claim) => claim.claim_ref).sort();
  const categoryRefs = new Set((pack?.claims ?? []).map((claim) => claim.claim_ref));
  const classified = new Set();
  const familyIds = new Set();
  for (const family of cartography.families ?? []) {
    if (familyIds.has(family.id)) errors.push('CARTOGRAPHY_CATEGORY_FAMILY_DUPLICATE');
    familyIds.add(family.id);
    if (!text(family.id) || !pack?.manifest?.domains?.includes(family.domain)
        || !text(family.subdomain) || !text(family.family)
        || !text(family.location_applicability) || !text(family.coverage)
        || !['resource', 'material', 'process', 'npc'].every(key => text(family.applicability?.[key]))
        || !Array.isArray(family.claim_refs) || family.claim_refs.length === 0) errors.push(`CARTOGRAPHY_CATEGORY_FAMILY_INVALID:${family.id}`);
    for (const ref of family.claim_refs ?? []) {
      if (!categoryRefs.has(ref)) errors.push(`CARTOGRAPHY_CATEGORY_CLAIM_REF_UNMAPPED:${ref}`);
      classified.add(ref);
    }
  }
  if ([...classified].sort().join('\n') !== allClaimRefs.join('\n')) errors.push('CARTOGRAPHY_CATEGORY_CLAIM_COVERAGE_MISMATCH');
  const evidence = new Map((cartography.source_inventory ?? []).map((family) => [family.source_path, family]));
  if (evidence.size !== cartography.source_inventory?.length) errors.push('CARTOGRAPHY_SOURCE_INVENTORY_DUPLICATE');
  const evidenceRefs = [];
  for (const [path, claims] of sourceClaimsByPath ?? []) {
    const family = evidence.get(path);
    if (family == null) { errors.push(`CARTOGRAPHY_EVIDENCE_FAMILY_UNMAPPED:${path}`); continue; }
    const domains = [...new Set(claims.map((claim) => claim.domain))].sort();
    if (domains.join('\n') !== [...family.domains].sort().join('\n')) errors.push(`CARTOGRAPHY_EVIDENCE_DOMAIN_MISMATCH:${path}`);
    evidenceRefs.push(...claims.map((claim) => claim.claim_ref));
  }
  if (evidence.size !== (sourceClaimsByPath?.size ?? 0)) errors.push('CARTOGRAPHY_EVIDENCE_FAMILY_EXTRA_OR_DUPLICATE');
  if (new Set(evidenceRefs).size !== allClaimRefs.length || evidenceRefs.length !== allClaimRefs.length
      || [...new Set(evidenceRefs)].sort().join('\n') !== allClaimRefs.join('\n')) errors.push('CARTOGRAPHY_EVIDENCE_CLAIM_COVERAGE_MISMATCH');
  const profileMappings = new Map((cartography.world_knowledge_profile_mappings ?? []).map((entry) => [entry.profile_ref, entry]));
  const semanticFamilies = new Map((cartography.families ?? []).map((family) => [family.id, family]));
  const activeProfiles = (pack?.coverage_profiles ?? []).filter((profile) => profile.status === 'production');
  if (profileMappings.size !== activeProfiles.length || activeProfiles.some((profile) => !profileMappings.has(profile.profile_ref))) errors.push('CARTOGRAPHY_PROFILE_UNMAPPED');
  for (const profile of activeProfiles) validateFamilies(profileMappings.get(profile.profile_ref), semanticFamilies, null, errors);
  const locationMappings = new Map((cartography.location_profile_mappings ?? []).map((entry) => [entry.location_profile_id, entry]));
  const activeLocations = locations?.location_profiles ?? [];
  if (locationMappings.size !== activeLocations.length || activeLocations.some((profile) => !locationMappings.has(profile.location_profile_id))) errors.push('CARTOGRAPHY_LOCATION_UNMAPPED');
  for (const entry of locationMappings.values()) validateFamilies(entry, semanticFamilies, null, errors);
  const materializations = new Map((cartography.materialization_profile_mappings ?? []).map((entry) => [entry.profile_id, entry]));
  for (const profile of materializationProfiles ?? []) {
    const id = profile.profile_id ?? profile.presentation_id;
    const entry = materializations.get(id);
    if (entry == null) errors.push(`CARTOGRAPHY_MATERIALIZATION_PROFILE_UNMAPPED:${id}`);
    else if (profile.status !== 'approved') errors.push(`CARTOGRAPHY_MATERIALIZATION_PROFILE_NOT_APPROVED:${id}`);
    else validateFamilies(entry, semanticFamilies, null, errors);
  }
  if (materializations.size !== (materializationProfiles ?? []).length) errors.push('CARTOGRAPHY_MATERIALIZATION_PROFILE_EXTRA_OR_DUPLICATE');
  if (!Array.isArray(cartography.missing_families)
      || cartography.missing_families.some((family) => !['missing', 'partial'].includes(family.coverage)
        || !text(family.domain) || !text(family.subdomain) || !text(family.family)
        || !text(family.location_applicability) || !text(family.reason)
        || !Array.isArray(family.consumer_refs) || family.consumer_refs.length === 0
        || !['resource', 'material', 'process', 'npc'].every((key) => text(family.applicability?.[key])))) errors.push('CARTOGRAPHY_MISSING_FAMILY_INVALID');
  for (const family of cartography.missing_families ?? []) {
    for (const id of family.supporting_family_ids ?? []) if (!semanticFamilies.has(id)) errors.push(`CARTOGRAPHY_EXPECTED_CATEGORY_UNMAPPED:${id}`);
  }
  return Object.freeze(errors.sort());
}

function validateFamilies(entry, families, domain, errors) {
  if (!Array.isArray(entry?.expected_family_ids) || entry.expected_family_ids.length === 0) {
    errors.push('CARTOGRAPHY_EXPECTED_CATEGORY_UNMAPPED');
    return;
  }
  for (const id of entry.expected_family_ids) {
    const family = families.get(id);
    if (family == null || domain != null && family.domain !== domain) errors.push(`CARTOGRAPHY_EXPECTED_CATEGORY_UNMAPPED:${id}`);
  }
}

function text(value) { return typeof value === 'string' && value.trim() !== ''; }
