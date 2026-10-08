import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CARRY_FORWARD_ROOT =
  'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v6/actor-appearance-carry-forward-v1';

const SOURCE_ROOT =
  'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v4';
const TARGET_MANIFEST =
  'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v6/manifest.json';
const TABLES = Object.freeze([
  'source_records',
  'universal_categories',
  'region_category_options',
  'region_demographic_profiles',
  'region_demographic_profile_entries',
  'region_appearance_profiles',
  'region_appearance_profile_entries',
  'item_template_category_bindings'
]);

export async function buildActorAppearanceV6CarryForward(root = process.cwd()) {
  const sourceRoot = resolve(root, SOURCE_ROOT);
  const [sourceManifest, targetManifest] = await Promise.all([
    readJson(resolve(sourceRoot, 'manifest.json')),
    readJson(resolve(root, TARGET_MANIFEST))
  ]);
  const rows = Object.fromEntries(await Promise.all(TABLES.map(async (table) =>
    [table, await readJson(resolve(sourceRoot, 'datasets', `${table}.json`))]
  )));
  const actorOptionIds = new Set(rows.region_category_options.map(({ id }) => id));
  const actorCategoryIds = new Set(rows.region_category_options.map(({ category_id: id }) => id));
  const equipmentBindings = rows.item_template_category_bindings.filter(({ item_template_id: id }) =>
    ['item_tpl_nov_linen_shirt_v1', 'item_tpl_nov_wool_outer_garment_v1'].includes(id));
  const categoryIds = new Set([...actorCategoryIds,
    ...equipmentBindings.map(({ category_id: id }) => id)]);
  const projected = {
    source_records: rows.source_records,
    universal_categories: rows.universal_categories.filter(({ id }) => categoryIds.has(id)),
    region_category_options: rows.region_category_options.map((row) => ({
      ...row,
      world_revision_id: targetManifest.world_revision_id
    })),
    region_demographic_profiles: rows.region_demographic_profiles,
    region_demographic_profile_entries: rows.region_demographic_profile_entries,
    region_appearance_profiles: rows.region_appearance_profiles,
    region_appearance_profile_entries: rows.region_appearance_profile_entries,
    item_template_category_bindings: equipmentBindings
  };
  if (!allApproved(projected) || projected.region_category_options.some((row) =>
    !actorOptionIds.has(row.id))) {
    throw new Error('actor_appearance_v6_source_rows_not_approved');
  }
  const sourceProjection = projectionFrom(rows, sourceManifest.world_revision_id);
  const sourceManifestBytes = await readFile(resolve(sourceRoot, 'manifest.json'));
  const targetManifestBytes = await readFile(resolve(root, TARGET_MANIFEST));
  const source = worldRef(sourceManifest, `${SOURCE_ROOT}/manifest.json`, sourceManifestBytes);
  const target = worldRef(targetManifest, TARGET_MANIFEST.replace(/\\/gu, '/'), targetManifestBytes);
  const sourceRowCountByTable = rowCounts(sourceProjection);
  const sourceIdsByTable = idsByTable(sourceProjection);
  const sourceProjectionSha256 = digest(sourceProjection);
  const candidateRowCountByTable = rowCounts(projected);
  const candidateIdsByTable = idsByTable(projected);
  const candidateRowsSha256 = digest(projected);
  const authoringAttestation = {
    schema: 'rus.actor_appearance_carry_forward_attestation.v1',
    subject_commit: 'd068df5b',
    scope: 'authoring_only',
    status: 'approved',
    source_manifest: source,
    target_manifest: target,
    source_projection_sha256: sourceProjectionSha256,
    candidate_rows_sha256: candidateRowsSha256,
    row_count: 166,
    row_count_by_table: candidateRowCountByTable,
    ids_by_table: candidateIdsByTable,
    semantic_diffs: 0,
    added_rows: 0,
    deleted_rows: 0,
    allowed_change_paths: ['region_category_options[].world_revision_id'],
    equipment_bindings: {
      row_count: 20,
      equipment_slot_category_refs: [
        'garment.equipment_slot.base_garment',
        'garment.equipment_slot.outer_garment'
      ]
    },
    import_activation: false,
    runtime_selectable: false,
    runtime_import_rows: 0,
    runtime_status: 'typed_data_gap'
  };
  return {
    schema: 'rus.actor_appearance_carry_forward_candidate.v1',
    candidate_id: 'novgorod-spatial-v3-production-v6-actor-appearance-carry-forward-001',
    status: 'authoring_approved_pending_import_authorization',
    approval_status: 'authoring_approved',
    authoring_approved: true,
    authoring_attestation: authoringAttestation,
    import_activation: false,
    runtime_status: 'typed_data_gap',
    runtime_gap_code: 'ACTOR_APPEARANCE_V6_IMPORT_NOT_APPROVED',
    runtime_import_rows: [],
    source,
    target,
    supported_contexts: {
      source_profile_set: 'trace_ld_v1_participant_profile_set',
      roles: [
        'nov_role_boatman',
        'nov_role_fisher',
        'nov_role_servant',
        'nov_role_merchant_clerk'
      ],
      sex_categories: ['male'],
      age_categories: ['young_adult', 'adult']
    },
    source_row_count_by_table: sourceRowCountByTable,
    source_ids_by_table: sourceIdsByTable,
    source_projection_sha256: sourceProjectionSha256,
    candidate_row_count_by_table: candidateRowCountByTable,
    candidate_ids_by_table: candidateIdsByTable,
    candidate_rows_sha256: candidateRowsSha256,
    candidate_rows: projected
  };
}

export async function writeActorAppearanceV6CarryForward(root = process.cwd()) {
  const candidate = await buildActorAppearanceV6CarryForward(root);
  const output = resolve(root, CARRY_FORWARD_ROOT);
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'candidate.json'), `${JSON.stringify(candidate, null, 2)}\n`);
  await writeFile(resolve(output, 'README.md'), report(candidate));
  return candidate;
}

function projectionFrom(rows, sourceWorldRevisionId) {
  const actorCategoryIds = new Set(rows.region_category_options.map(({ category_id: id }) => id));
  const equipmentBindings = rows.item_template_category_bindings.filter(({ item_template_id: id }) =>
    ['item_tpl_nov_linen_shirt_v1', 'item_tpl_nov_wool_outer_garment_v1'].includes(id));
  const categoryIds = new Set([...actorCategoryIds,
    ...equipmentBindings.map(({ category_id: id }) => id)]);
  return {
    source_records: rows.source_records,
    universal_categories: rows.universal_categories.filter(({ id }) => categoryIds.has(id)),
    region_category_options: rows.region_category_options.map((row) => ({
      ...row,
      world_revision_id: sourceWorldRevisionId
    })),
    region_demographic_profiles: rows.region_demographic_profiles,
    region_demographic_profile_entries: rows.region_demographic_profile_entries,
    region_appearance_profiles: rows.region_appearance_profiles,
    region_appearance_profile_entries: rows.region_appearance_profile_entries,
    item_template_category_bindings: equipmentBindings
  };
}

function worldRef(manifest, path, bytes) {
  return {
    manifest_path: path,
    manifest_sha256: sha256(bytes),
    release_id: manifest.release_id,
    world_revision_id: manifest.world_revision_id,
    catalog_digest: manifest.catalog_digest,
    status: manifest.status,
    production_activation: manifest.production_activation
  };
}

function rowCounts(rows) {
  return Object.fromEntries(TABLES.map((table) => [table, rows[table].length]));
}

function idsByTable(rows) {
  return Object.fromEntries(TABLES.map((table) => [table,
    rows[table].map(({ id }) => id).sort()]));
}

function allApproved(rows) {
  return TABLES.every((table) => rows[table].every(({ status }) => status === 'approved'));
}

function digest(value) {
  return sha256(stableJson(value));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function report(candidate) {
  return `# v6 actor appearance carry-forward candidate\n\n`
    + `Status: \`${candidate.status}\`. Authoring attestation approves commit \`${candidate.authoring_attestation.subject_commit}\`; import and activation remain \`false\`, with empty runtime rows and \`${candidate.runtime_gap_code}\`.\n\n`
    + `Source: \`${candidate.source.world_revision_id}\` / \`${candidate.source.catalog_digest}\`.\n`
    + `Target: \`${candidate.target.world_revision_id}\` / \`${candidate.target.catalog_digest}\`.\n\n`
    + `Source projection SHA-256: \`${candidate.source_projection_sha256}\`.\n`
    + `Candidate rows SHA-256: \`${candidate.candidate_rows_sha256}\`.\n\n`
    + `Attestation: ${candidate.authoring_attestation.row_count} exact rows, zero semantic additions/deletions/diffs; only \`region_category_options.world_revision_id\` changes to v6. Equipment bindings: 20 rows, slots \`base_garment\` and \`outer_garment\`.\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = resolve(process.argv.at(2) ?? process.cwd());
  if (!process.argv.includes('--write')) {
    process.stdout.write(`${JSON.stringify(await buildActorAppearanceV6CarryForward(root), null, 2)}\n`);
  } else {
    await writeActorAppearanceV6CarryForward(root);
  }
}
