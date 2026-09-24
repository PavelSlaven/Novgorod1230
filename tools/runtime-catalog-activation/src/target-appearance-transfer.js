import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Reviewable insert-only carry-forward. It neither promotes nor imports rows. */
export async function buildTargetAppearanceTransferCandidate({ repositoryRoot = process.cwd() } = {}) {
  const base = resolve(repositoryRoot, 'data/world-catalogs/novgorod');
  const basisBytes = await readFile(resolve(base, 'live-world-runtime-v17/player-basis-candidate.json'));
  const startBytes = await readFile(resolve(base, 'live-world-runtime-v17/target-start-candidate.json'));
  const basis = JSON.parse(basisBytes); const start = JSON.parse(startBytes);
  const approval = JSON.parse(await readFile(resolve(base, 'm2c-appearance-repin-data-approval.json'), 'utf8'));
  if (approval.decision !== 'APPROVE_DATA_ONLY'
    || approval.target_player_basis_candidate_sha256 !== digest(basisBytes)
    || approval.target_start_candidate_sha256 !== digest(startBytes)) {
    throw new Error('TARGET_APPEARANCE_SOURCE_APPROVAL_REQUIRED');
  }
  const source = {};
  for (const pin of basis.appearance.source_tables) {
    const bytes = await readFile(resolve(repositoryRoot, basis.appearance.source_directory, `${pin.table}.json`));
    if (digest(bytes) !== pin.sha256) throw new Error('TARGET_APPEARANCE_SOURCE_DIGEST_MISMATCH');
    source[pin.table] = JSON.parse(bytes);
  }
  const demographic = source.region_demographic_profile_entries.filter((row) =>
    row.demographic_profile_id === basis.appearance.demographic_profile_ref);
  const appearance = source.region_appearance_profile_entries.filter((row) =>
    row.appearance_profile_id === basis.appearance.appearance_profile_ref);
  const optionIds = new Set([...demographic, ...appearance].map((row) => row.option_id));
  const options = source.region_category_options.filter((row) => optionIds.has(row.id));
  const categoryIds = new Set(options.map((row) => row.category_id));
  const categories = source.universal_categories.filter((row) => categoryIds.has(row.id));
  if (options.length !== optionIds.size || categories.length !== categoryIds.size
    || [...demographic, ...appearance, ...options, ...categories].some((row) => row.status !== 'approved')) {
    throw new Error('TARGET_APPEARANCE_SOURCE_MEMBERSHIP_REQUIRED');
  }
  const targetId = (id) => `m2c_target__${id}`;
  const entry = (row) => ({ ...row, id: targetId(row.id), option_id: targetId(row.option_id), status: 'draft' });
  const worldSourcePath = 'data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_world_revisions.json';
  const worldBytes = await readFile(resolve(repositoryRoot, worldSourcePath));
  const world = JSON.parse(worldBytes).find((row) => row.id === start.world_pin.world_revision_id);
  if (world?.status !== 'approved' || world.catalog_digest !== start.world_pin.world_catalog_digest
    || world.parent_revision_id !== null) throw new Error('TARGET_APPEARANCE_WORLD_REGISTRATION_SOURCE_REQUIRED');
  return {
    schema: 'rus.target_actor_appearance_transfer_candidate.v1',
    candidate_id: 'novgorod_target_actor_appearance_transfer_v2', version: 2,
    status: 'pending_independent_data_approval', approved: false,
    import_authorized: false, activation_authorized: false,
    target_world: start.world_pin,
    source_basis_sha256: digest(basisBytes), source_start_sha256: digest(startBytes),
    source_directory: basis.appearance.source_directory,
    source_tables: basis.appearance.source_tables,
    world_registration: {
      source_path: worldSourcePath, source_sha256: digest(worldBytes), source_provenance_ref: world.provenance_ref,
      directness: 'exact_existing_spatial_world_identity_registration_for_legacy_foreign_keys',
      parent_semantics: 'Null preserves the approved Spatial target root; the v6 demonstration is not its parent.',
      digest_semantics: 'The existing approved target world catalog digest is an identity pin, not a digest of this appearance transfer.',
      status_semantics: 'Draft authoring row; promotion requires separate approval of these exact bytes. No activation is implied.',
      import_order: ['world_revisions', 'region_category_options', 'region_demographic_profile_entries', 'region_appearance_profile_entries'],
      readback_required: ['id', 'parent_revision_id', 'catalog_digest', 'status']
    },
    profile_refs: { demographic: basis.appearance.demographic_profile_ref,
      appearance: basis.appearance.appearance_profile_ref },
    directness: 'exact_insert_only_target_world_applicability_transfer',
    limits: [
      'The target Spatial root is registered in the existing legacy world_revisions owner before regional options; no historical revision is updated.',
      'Only target world option IDs and entry IDs change. Source category values, validity, weights and applicability remain exact.',
      'Existing profiles and categories are exact dependencies. No v4/v6 row or historical actor snapshot may be updated.',
      'Applicability is limited to the separately approved new player and target NPC bindings; no historical population frequency or language is inferred.',
      'Independent exact data approval, reviewed P12 import artifacts and operational release gates remain required.'
    ],
    existing_dependencies: {
      region_demographic_profiles: source.region_demographic_profiles.filter((row) => row.id === basis.appearance.demographic_profile_ref),
      region_appearance_profiles: source.region_appearance_profiles.filter((row) => row.id === basis.appearance.appearance_profile_ref),
      universal_categories: categories
    },
    proposed_insert_rows: {
      world_revisions: [{ id: world.id, parent_revision_id: world.parent_revision_id,
        title: 'Novgorod approved Spatial target identity for regional actor appearance',
        effective_from: null, effective_to: null, catalog_digest: world.catalog_digest, status: 'draft' }],
      region_category_options: options.map((row) => ({ ...row, id: targetId(row.id),
        world_revision_id: start.world_pin.world_revision_id, status: 'draft' })),
      region_demographic_profile_entries: demographic.map(entry),
      region_appearance_profile_entries: appearance.map(entry)
    },
    approval_request: { reviewer_role: 'independent_data_approver', model: 'gpt-6-sol', reasoning: 'high',
      author_may_approve: false, approval_attestation: null }
  };
}
function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

/** Data-only v17 candidate: carry the 44 approved v4 dependency rows exactly. */
export async function buildTargetAppearanceTransferV3Candidate({ repositoryRoot = process.cwd() } = {}) {
  const v2 = await buildTargetAppearanceTransferCandidate({ repositoryRoot });
  const sourceRefs = {};
  for (const [table, rows] of Object.entries(v2.existing_dependencies)) {
    const pin = v2.source_tables.find((item) => item.table === table);
    if (!pin || rows.some((row) => row.status !== 'approved')) throw new Error('TARGET_APPEARANCE_DEPENDENCY_SOURCE_REQUIRED');
    sourceRefs[table] = rows.map((row) => ({
      row_id: row.id, source_ref: { file: `${v2.source_directory}/${table}.json`, sha256: pin.sha256, row_id: row.id },
      directness: 'exact_approved_row_transfer'
    }));
  }
  return {
    ...v2,
    candidate_id: 'novgorod_target_actor_appearance_transfer_v3', version: 3,
    world_registration: { ...v2.world_registration, import_order: [
      'world_revisions', 'universal_categories', 'region_demographic_profiles',
      'region_appearance_profiles', 'region_category_options',
      'region_demographic_profile_entries', 'region_appearance_profile_entries'
    ] },
    limits: v2.limits.map((limit) => limit === 'Existing profiles and categories are exact dependencies. No v4/v6 row or historical actor snapshot may be updated.'
      ? 'The two profiles and 42 categories are exact approved v4 row inserts; no v4/v6 row or historical actor snapshot may be updated.' : limit),
    existing_dependencies: {},
    proposed_insert_rows: {
      world_revisions: v2.proposed_insert_rows.world_revisions,
      universal_categories: v2.existing_dependencies.universal_categories,
      region_demographic_profiles: v2.existing_dependencies.region_demographic_profiles,
      region_appearance_profiles: v2.existing_dependencies.region_appearance_profiles,
      region_category_options: v2.proposed_insert_rows.region_category_options,
      region_demographic_profile_entries: v2.proposed_insert_rows.region_demographic_profile_entries,
      region_appearance_profile_entries: v2.proposed_insert_rows.region_appearance_profile_entries
    },
    dependency_source_refs: sourceRefs,
    approval_request: { ...v2.approval_request,
      scope: 'exact_44_approved_v4_dependencies_and_unchanged_85_v2_target_inserts' }
  };
}

/** Prepare approved-status mapping for independent review; it does not execute SQL. */
export async function buildTargetAppearanceTransferImportArtifacts({ repositoryRoot = process.cwd() } = {}) {
  const directory = 'data/world-catalogs/novgorod/live-world-runtime-v17';
  const candidatePath = `${directory}/appearance-transfer-v2-candidate.json`;
  const bytes = await readFile(resolve(repositoryRoot, candidatePath));
  const candidate = JSON.parse(bytes);
  const approval = JSON.parse(await readFile(resolve(repositoryRoot,
    'data/world-catalogs/novgorod/m2c-appearance-repin-data-approval.json'), 'utf8'));
  if (approval.decision !== 'APPROVE_DATA_ONLY'
    || approval.target_appearance_transfer_approval?.candidate_sha256 !== digest(bytes)
    || approval.target_appearance_mapped_approval?.source_candidate_sha256 !== digest(bytes)
    || JSON.stringify(candidate) !== JSON.stringify(await buildTargetAppearanceTransferCandidate({ repositoryRoot }))) {
    throw new Error('TARGET_APPEARANCE_EXACT_DATA_APPROVAL_REQUIRED');
  }
  const datasets = Object.fromEntries(Object.entries(candidate.proposed_insert_rows).map(([table, rows]) =>
    [table, rows.map((row) => ({ ...row, status: 'approved' }))]));
  const dependencies = { world_revisions: [], region_category_options: ['world_revisions'],
    region_demographic_profile_entries: ['region_category_options'], region_appearance_profile_entries: ['region_category_options'] };
  const manifest = {
    schema_version: 'rus.spatial-v3.world-base-authoring-bundle.v2',
    bundle_id: 'novgorod-target-actor-appearance-transfer-v2',
    status: 'approved', release_status: 'validated_candidate_not_active',
    production_activation: false, canonical_head_changed: false, operator_db_touched: false,
    runtime_selectable_in_canonical_production: false, delete_policy: 'forbid',
    world_revision_id: candidate.target_world.world_revision_id,
    catalog_digest: candidate.target_world.world_catalog_digest,
    source_candidate_path: candidatePath, source_candidate_sha256: digest(bytes),
    datasets: Object.entries(datasets).map(([table, rows]) => ({ table,
      file: `appearance-transfer-v2-datasets/${table}.json`,
      sha256: digest(`${JSON.stringify(rows, null, 2)}\n`), status: 'approved',
      delete_policy: 'forbid', depends_on: dependencies[table] })),
    existing_dependencies: candidate.existing_dependencies,
    authority: { data_mapping_only: true, import_approval_required: true, activation_authorized: false }
  };
  if (approval.target_appearance_mapped_approval?.import_manifest_sha256 !== digest(`${JSON.stringify(manifest, null, 2)}\n`)
    || manifest.datasets.some(({ table, sha256 }) => approval.target_appearance_mapped_approval?.dataset_sha256?.[table] !== sha256)) {
    throw new Error('TARGET_APPEARANCE_EXACT_IMPORT_MAPPING_APPROVAL_REQUIRED');
  }
  return { manifest, datasets };
}
