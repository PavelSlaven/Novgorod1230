import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { digest } from './lower-dvina-v2-compiler.mjs';

export const CHARACTER_APPEARANCE_CANDIDATE_ROOT =
  'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v4';
export const CHARACTER_APPEARANCE_WORLD_REVISION =
  'novgorod_spatial_v3_production_v4_candidate_001';
export const CHARACTER_APPEARANCE_RELEASE_ID = 'spatial-v3-production-v4';

const REQUIRED_FACETS = new Set([
  'sex_category', 'age_category', 'build', 'skin_tone', 'face_shape',
  'hair_color', 'hair_length', 'hair_style', 'facial_hair', 'eye_color'
]);
const DEMOGRAPHIC_FACETS = new Set(['sex_category', 'age_category']);
const VISUAL_BINDINGS = new Set([
  'garment_kind', 'equipment_slot', 'neckline', 'sleeve_form', 'outer_form',
  'visible_fabric', 'trim', 'main_visible_color', 'secondary_visible_color',
  'headwear_kind'
]);
const GARMENT_TEMPLATES = new Set([
  'item_tpl_nov_linen_shirt_v1',
  'item_tpl_nov_wool_outer_garment_v1'
]);

export async function validateCharacterAppearanceV1(root = process.cwd()) {
  const candidateRoot = resolve(root, CHARACTER_APPEARANCE_CANDIDATE_ROOT);
  const errors = [];
  const issue = (code, details = {}) => errors.push({ code, ...details });
  const manifestBytes = await readFile(resolve(candidateRoot, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  const unsealed = structuredClone(manifest);
  const claimedSeal = unsealed.canonical_output_digest;
  delete unsealed.canonical_output_digest;
  if (claimedSeal !== digest(unsealed)) issue('appearance_manifest_seal_mismatch');
  if (manifest.schema_version !== 'rus.spatial-v3.world-base-authoring-bundle.v2'
    || manifest.release_id !== CHARACTER_APPEARANCE_RELEASE_ID
    || manifest.world_revision_id !== CHARACTER_APPEARANCE_WORLD_REVISION
    || manifest.release_status !== 'validated_candidate_not_active'
    || manifest.production_activation !== false
    || manifest.canonical_head_changed !== false
    || manifest.operator_db_touched !== false
    || manifest.runtime_selectable_in_canonical_production !== false) {
    issue('appearance_candidate_activation_boundary_invalid');
  }

  const parentPath = resolve(root, manifest.parent_manifest_path ?? '');
  const parentBytes = await readFile(parentPath);
  if (sha256(parentBytes) !== manifest.parent_manifest_sha256) {
    issue('appearance_parent_manifest_digest_mismatch');
  }

  const records = new Map();
  const tables = new Set();
  for (const item of manifest.datasets ?? []) {
    if (tables.has(item.table)) issue('appearance_dataset_table_duplicate', { table: item.table });
    tables.add(item.table);
    const bytes = await readFile(resolve(candidateRoot, item.file));
    if (sha256(bytes) !== item.sha256) issue('appearance_dataset_digest_mismatch', { table: item.table });
    const rows = JSON.parse(bytes);
    if (!Array.isArray(rows)) issue('appearance_dataset_not_array', { table: item.table });
    const ids = new Set();
    for (const row of rows) {
      if (!row?.id || ids.has(row.id)) issue('appearance_dataset_id_invalid', { table: item.table, id: row?.id ?? null });
      ids.add(row?.id);
    }
    records.set(item.table, rows);
  }
  const catalogEntries = (manifest.datasets ?? [])
    .filter(({ table }) => !['world_revisions', 'spatial_v3_world_revisions'].includes(table))
    .map(({ table, file, sha256: hash }) => ({ table, file, sha256: hash }));
  if (digest(catalogEntries) !== manifest.catalog_digest) issue('appearance_catalog_digest_mismatch');

  const worldRevision = records.get('world_revisions') ?? [];
  const spatialRevision = records.get('spatial_v3_world_revisions') ?? [];
  if (worldRevision.length !== 1 || spatialRevision.length !== 1
    || worldRevision[0]?.id !== CHARACTER_APPEARANCE_WORLD_REVISION
    || spatialRevision[0]?.id !== CHARACTER_APPEARANCE_WORLD_REVISION
    || worldRevision[0]?.catalog_digest !== manifest.catalog_digest
    || spatialRevision[0]?.catalog_digest !== manifest.catalog_digest) {
    issue('appearance_world_revision_pin_invalid');
  }

  const categories = new Map((records.get('universal_categories') ?? []).map((row) => [row.id, row]));
  const options = new Map((records.get('region_category_options') ?? []).map((row) => [row.id, row]));
  for (const option of options.values()) {
    if (option.world_revision_id !== CHARACTER_APPEARANCE_WORLD_REVISION
      || option.region_id !== 'region_novgorod_land'
      || option.status !== 'approved' || option.weight !== 1
      || !categories.has(option.category_id)) {
      issue('appearance_region_option_invalid', { id: option.id });
    }
  }

  const demographicProfiles = records.get('region_demographic_profiles') ?? [];
  const appearanceProfiles = records.get('region_appearance_profiles') ?? [];
  if (demographicProfiles.length !== 1 || appearanceProfiles.length !== 1
    || demographicProfiles[0]?.demographic_option_id !== null
    || appearanceProfiles[0]?.appearance_option_id !== null) {
    issue('appearance_normalized_profile_invalid');
  }
  const allEntries = [
    ...(records.get('region_demographic_profile_entries') ?? []).map((row) => ({ ...row, domain: 'demographic' })),
    ...(records.get('region_appearance_profile_entries') ?? []).map((row) => ({ ...row, domain: 'appearance' }))
  ];
  const presentFacets = new Set();
  for (const entry of allEntries) {
    const profileValid = entry.domain === 'demographic'
      ? entry.demographic_profile_id === demographicProfiles[0]?.id && DEMOGRAPHIC_FACETS.has(entry.facet)
      : entry.appearance_profile_id === appearanceProfiles[0]?.id && !DEMOGRAPHIC_FACETS.has(entry.facet);
    const option = options.get(entry.option_id);
    const category = categories.get(option?.category_id);
    if (!profileValid || !REQUIRED_FACETS.has(entry.facet) || entry.status !== 'approved'
      || entry.weight !== 1 || !option || category?.facet !== entry.facet
      || !String(category?.stable_code ?? '').startsWith(`actor.${entry.facet}.`)
      || !plainObject(entry.applicability)) {
      issue('appearance_profile_entry_invalid', { id: entry.id });
    }
    presentFacets.add(entry.facet);
  }
  for (const facet of REQUIRED_FACETS) if (!presentFacets.has(facet)) issue('appearance_required_facet_empty', { facet });

  const approvedItemRows = JSON.parse(await readFile(resolve(root,
    'data/knowledge-source/imports/item-container-120-v5/candidate/tables/item_templates.json')));
  const approvedItemIds = new Set(approvedItemRows.map((row) => row.id));
  const approval = JSON.parse(await readFile(resolve(root,
    'docs/implementation/item-container-120-approval-audit/evidence/FINAL_APPROVAL_ATTESTATION.json')));
  if (approval.decision !== 'approve_all_120') issue('appearance_item_template_approval_missing');
  const visualByTemplate = new Map();
  for (const binding of records.get('item_template_category_bindings') ?? []) {
    if (!GARMENT_TEMPLATES.has(binding.item_template_id) || !approvedItemIds.has(binding.item_template_id)
      || !VISUAL_BINDINGS.has(binding.binding_kind) || binding.status !== 'approved') {
      issue('appearance_garment_binding_invalid', { id: binding.id });
    }
    const category = categories.get(binding.category_id);
    if (!category || category.facet !== binding.binding_kind
      || !String(category.stable_code ?? '').startsWith(`garment.${binding.binding_kind}.`)) {
      issue('appearance_garment_category_invalid', { id: binding.id });
    }
    const set = visualByTemplate.get(binding.item_template_id) ?? new Set();
    if (set.has(binding.binding_kind)) issue('appearance_garment_binding_ambiguous', { id: binding.id });
    set.add(binding.binding_kind);
    visualByTemplate.set(binding.item_template_id, set);
  }
  for (const templateId of GARMENT_TEMPLATES) {
    const present = visualByTemplate.get(templateId) ?? new Set();
    for (const kind of VISUAL_BINDINGS) if (!present.has(kind)) issue('appearance_garment_binding_missing', { template_id: templateId, binding_kind: kind });
  }

  return Object.freeze({
    schema: 'rus.spatial-v3.character-appearance-validation.v1',
    pass: errors.length === 0,
    errors: Object.freeze(errors),
    release_id: manifest.release_id,
    world_revision_id: manifest.world_revision_id,
    actor_component_count: allEntries.length,
    garment_binding_count: (records.get('item_template_category_bindings') ?? []).length,
    production_activation: false
  });
}

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function plainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

async function main() {
  const result = await validateCharacterAppearanceV1(resolve(process.argv[2] ?? process.cwd()));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.pass) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
