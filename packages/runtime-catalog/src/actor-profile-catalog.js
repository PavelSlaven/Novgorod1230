import {
  deepFreeze,
  fail,
  isDigest,
  isIsoDate,
  rowsFrom
} from './shared.js';

export async function loadApprovedActorProfileCatalog({
  worldBaseReader,
  worldPin,
  regionId,
  effectiveDate
}) {
  if (!worldBaseReader || typeof worldBaseReader.read !== 'function') {
    throw new TypeError('worldBaseReader.read is required.');
  }
  if (typeof worldPin?.world_revision_id !== 'string'
    || !isDigest(worldPin?.world_catalog_digest)
    || typeof regionId !== 'string'
    || regionId.length === 0
    || !isIsoDate(effectiveDate)) {
    throw new TypeError(
      'Exact worldPin, regionId and ISO effectiveDate are required.'
    );
  }
  const worldParams = [
    worldPin.world_revision_id,
    worldPin.world_catalog_digest
  ];
  const profileParams = [worldPin.world_revision_id, regionId];
  const entryParams = [worldPin.world_revision_id, regionId, effectiveDate];
  const worldRevisions = rowsFrom(await worldBaseReader.read(
    `SELECT id,parent_revision_id,title,effective_from,effective_to,catalog_digest,status
     FROM world_base.world_revisions
     WHERE id=$1 AND catalog_digest=$2 AND status='approved'
     LIMIT 2`,
    worldParams
  ));
  if (worldRevisions.length !== 1) {
    fail('RUNTIME_ACTOR_PROFILE_WORLD_PIN_MISMATCH',
      'The approved actor profile world revision does not match the exact world pin.');
  }
  const [worldRevision] = worldRevisions;
  if (worldRevision.id !== worldPin.world_revision_id
    || worldRevision.catalog_digest !== worldPin.world_catalog_digest
    || worldRevision.status !== 'approved') {
    fail('RUNTIME_ACTOR_PROFILE_WORLD_PIN_MISMATCH',
      'The actor profile world revision row does not match the exact approved pin.');
  }

  const regionCategoryOptions = rowsFrom(await worldBaseReader.read(
    `SELECT id,world_revision_id,region_id,category_id,valid_from,valid_to,
            weight,applicability,status
     FROM world_base.region_category_options
     WHERE world_revision_id=$1 AND region_id=$2 AND status='approved'
       AND (valid_from IS NULL OR valid_from <= $3::date)
       AND (valid_to IS NULL OR valid_to >= $3::date)
     ORDER BY id`,
    entryParams
  ));
  const demographicProfiles = rowsFrom(await worldBaseReader.read(
    `SELECT DISTINCT p.id,p.region_id,p.demographic_option_id,p.minimum_age,
            p.maximum_age,p.weight,p.status
     FROM world_base.region_demographic_profiles p
     JOIN world_base.region_demographic_profile_entries e
       ON e.demographic_profile_id=p.id AND e.status='approved'
     JOIN world_base.region_category_options o
       ON o.id=e.option_id AND o.world_revision_id=$1
     WHERE p.region_id=$2 AND p.status='approved'
     ORDER BY p.id`,
    profileParams
  ));
  const demographicEntries = rowsFrom(await worldBaseReader.read(
    `SELECT e.id,e.demographic_profile_id,e.facet,e.option_id,e.weight,
            e.applicability,e.status
     FROM world_base.region_demographic_profile_entries e
     JOIN world_base.region_demographic_profiles p
       ON p.id=e.demographic_profile_id AND p.status='approved'
     JOIN world_base.region_category_options o
       ON o.id=e.option_id AND o.world_revision_id=$1
     WHERE p.region_id=$2 AND e.status='approved'
       AND (o.valid_from IS NULL OR o.valid_from <= $3::date)
       AND (o.valid_to IS NULL OR o.valid_to >= $3::date)
     ORDER BY e.id`,
    entryParams
  ));
  const appearanceProfiles = rowsFrom(await worldBaseReader.read(
    `SELECT DISTINCT p.id,p.region_id,p.appearance_option_id,p.weight,p.status
     FROM world_base.region_appearance_profiles p
     JOIN world_base.region_appearance_profile_entries e
       ON e.appearance_profile_id=p.id AND e.status='approved'
     JOIN world_base.region_category_options o
       ON o.id=e.option_id AND o.world_revision_id=$1
     WHERE p.region_id=$2 AND p.status='approved'
     ORDER BY p.id`,
    profileParams
  ));
  const appearanceEntries = rowsFrom(await worldBaseReader.read(
    `SELECT e.id,e.appearance_profile_id,e.facet,e.option_id,e.weight,
            e.applicability,e.status
     FROM world_base.region_appearance_profile_entries e
     JOIN world_base.region_appearance_profiles p
       ON p.id=e.appearance_profile_id AND p.status='approved'
     JOIN world_base.region_category_options o
       ON o.id=e.option_id AND o.world_revision_id=$1
     WHERE p.region_id=$2 AND e.status='approved'
       AND (o.valid_from IS NULL OR o.valid_from <= $3::date)
       AND (o.valid_to IS NULL OR o.valid_to >= $3::date)
     ORDER BY e.id`,
    entryParams
  ));
  const universalCategories = rowsFrom(await worldBaseReader.read(
    `SELECT DISTINCT c.id,c.domain,c.parent_category_id,c.stable_code,c.facet,
            c.preferred_label,c.definition,c.scope_note,c.inclusion_rules,
            c.exclusion_rules,c.title,c.status
     FROM world_base.universal_categories c
     JOIN world_base.region_category_options o ON o.category_id=c.id
     WHERE o.world_revision_id=$1 AND o.region_id=$2
       AND c.status='approved' AND o.status='approved'
       AND (o.valid_from IS NULL OR o.valid_from <= $3::date)
       AND (o.valid_to IS NULL OR o.valid_to >= $3::date)
     ORDER BY c.id`,
    entryParams
  ));

  return deepFreeze({
    schema: 'rus.verified_actor_profile_catalog.v1',
    verified: true,
    world_pin: structuredClone(worldPin),
    records_by_table: {
      world_revisions: worldRevisions,
      universal_categories: universalCategories,
      region_category_options: regionCategoryOptions,
      region_demographic_profiles: demographicProfiles,
      region_demographic_profile_entries: demographicEntries,
      region_appearance_profiles: appearanceProfiles,
      region_appearance_profile_entries: appearanceEntries
    }
  });
}
