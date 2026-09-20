import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const FAMILIES = Object.freeze([
  { binding_id: 'novgorod_wreck_shore_natural_v2', family: 'river_wreck_shore',
    scene_template_id: 'trace_ld_v1_tpl_wreck_shore',
    landscape_id: 'lt_low_alluvial_riverbank', water_id: 'wb_small_river',
    place_id: 'pt_river_landing', required_layers: ['surface', 'relief',
      'vegetation', 'environment', 'water', 'place_function'] },
  { binding_id: 'novgorod_fishing_worksite_v2', family: 'fishing_worksite',
    scene_template_id: 'trace_ld_v1_tpl_fishing_camp',
    landscape_id: 'lt_low_alluvial_riverbank', water_id: 'wb_small_river',
    land_use_id: 'lu_inland_capture_fishing', place_id: 'pt_fishing_station',
    item_profile_id: 'profile_fishing_v3', occupation_id: 'nov_occ_fisher',
    role_id: 'nov_role_fisher', required_layers: ['surface', 'relief',
      'vegetation', 'environment', 'water', 'work_zone', 'place_function',
      'tool', 'storage', 'work_material', 'npc'] },
  { binding_id: 'novgorod_old_drying_shed_v2', family: 'old_drying_shed',
    scene_template_id: 'trace_ld_v1_tpl_old_drying_shed',
    landscape_id: 'lt_dry_meadow', place_id: 'pt_forest_work_camp',
    item_profile_id: 'profile_craft_work_v3', occupation_id: 'nov_occ_carpenter',
    role_id: 'nov_role_craftsman_master', required_layers: ['surface', 'relief',
      'vegetation', 'environment', 'place_function', 'tool', 'storage',
      'work_material', 'npc'] }
]);

export async function generateProceduralV6AuthoringOverlay(rootDir) {
  const root = resolve(rootDir);
  const candidateRoot = resolve(root,
    'data/knowledge-source/imports/item-container-120-v5/candidate');
  const tablesRoot = resolve(candidateRoot, 'tables');
  const spatialRoot = resolve(root,
    'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v6');
  const [candidate, approval, spatial, sceneTemplates, landscapes, waters,
    landUses, places, profiles, entries, itemTemplates, quantityProfiles,
    inventoryProfiles, sourceBindings, containerRules, occupations, roles] =
    await Promise.all([
      json(resolve(candidateRoot, 'manifest.json')),
      json(resolve(root, 'docs/implementation/item-container-120-approval-audit/evidence/FINAL_APPROVAL_ATTESTATION.json')),
      json(resolve(spatialRoot, 'manifest.json')),
      json(resolve(spatialRoot, 'datasets/spatial_v3_scene_templates.json')),
      json(resolve(root, 'infra/world-base/landscape_templates.seed.json')),
      json(resolve(root, 'infra/world-base/water_body_templates.seed.json')),
      json(resolve(root, 'infra/world-base/land_use_templates.seed.json')),
      json(resolve(root, 'infra/world-base/place_templates.seed.json')),
      json(resolve(tablesRoot, 'item_profile_sets.json')),
      json(resolve(tablesRoot, 'item_profile_entries.json')),
      json(resolve(tablesRoot, 'item_templates.json')),
      json(resolve(tablesRoot, 'item_template_quantity_profiles.json')),
      json(resolve(tablesRoot, 'item_template_inventory_profiles.json')),
      json(resolve(tablesRoot, 'item_template_source_bindings.json')),
      json(resolve(tablesRoot, 'g4_container_materialization_rules.json')),
      tsv(resolve(root, 'data/novgorod-region/novgorod_occupations_v1_enriched.tsv')),
      tsv(resolve(root, 'data/novgorod-region/novgorod_social_roles_v1_enriched.tsv'))
    ]);
  if (approval.decision !== 'approve_all_120'
      || approval.candidate_digest !== candidate.candidate_digest
      || approval.activation_authorized !== false
      || spatial.status !== 'approved') throw new Error(
    'PROCEDURAL_V6_SOURCE_APPROVAL_CHAIN_INVALID');

  const families = FAMILIES.map((family) => {
    const closure = exact(sceneTemplates, family.scene_template_id);
    const sourceRows = [
      owner('landscape_templates', exact(landscapes, family.landscape_id)),
      ...(family.water_id ? [owner('water_body_templates', exact(waters,
        family.water_id))] : []),
      ...(family.land_use_id ? [owner('land_use_templates', exact(landUses,
        family.land_use_id))] : []),
      owner('place_templates', exact(places, family.place_id))
    ];
    const gaps = sourceRows.filter(({ status }) => status !== 'approved')
      .map(({ owner_ref: ref }) => `SOURCE_NOT_APPROVED:${ref.table}:${ref.id}`);
    const itemAudit = family.item_profile_id == null ? null : auditItems({
      family, profiles, entries, itemTemplates, quantityProfiles,
      inventoryProfiles, sourceBindings, containerRules
    });
    if (itemAudit?.required_item_entry_count === 0) {
      gaps.push('REQUIRED_FUNCTIONAL_TOOL_MAPPING_MISSING');
    }
    if (itemAudit?.container_rule_count === 0) {
      gaps.push('REQUIRED_STORAGE_MAPPING_MISSING');
    }
    const actor = family.occupation_id == null ? null : {
      occupation: actorRef('novgorod_occupations_v1_enriched.tsv',
        exact(occupations, family.occupation_id, 'occupation_id'), 'occupation_id'),
      role: actorRef('novgorod_social_roles_v1_enriched.tsv',
        exact(roles, family.role_id, 'role_id'), 'role_id'),
      name_pool_ref: null
    };
    if (actor && (actor.occupation.status !== 'approved'
        || actor.role.status !== 'approved')) gaps.push('APPROVED_NPC_BASIS_MISSING');
    return {
      binding_id: family.binding_id, family: family.family,
      status: gaps.length === 0 ? 'approved' : 'blocked_data_gap',
      spatial_closure_ref: { table: 'spatial_v3_scene_templates',
        id: closure.id, version: closure.version,
        world_revision_id: closure.world_revision_id,
        canonical_digest: closure.canonical_digest },
      required_layers: [...family.required_layers].sort(), source_rows: sourceRows,
      item_audit: itemAudit, actor_basis: actor,
      temporal_refs: ['activity_categories_profiles',
        'calendar_daylight_light_profiles', 'npc_temporal_profiles_policies',
        'place_access_schedules', 'weather_transition_profiles_processes']
        .map((id) => ({ version: 4, approval_path:
          `data/world-catalogs/novgorod/temporal-v4/approvals/${id}.json` })),
      data_gap_codes: gaps.sort()
    };
  });
  const payload = {
    schema: 'rus.procedural_scene_authoring_overlay.v2', revision: 2,
    overlay_id: 'novgorod_procedural_v6_overlay_001',
    status: families.every(({ status }) => status === 'approved')
      ? 'approved' : 'blocked_data_gap',
    activation_authorized: false, activation_request: null,
    compatible_world_pin: { world_revision_id: spatial.world_revision_id,
      world_catalog_digest: spatial.catalog_digest },
    item120_source: { immutable_version: 5,
      candidate_digest: candidate.candidate_digest,
      approval_request_digest: approval.request_digest,
      approval_attestation_path:
        'docs/implementation/item-container-120-approval-audit/evidence/FINAL_APPROVAL_ATTESTATION.json' },
    families
  };
  return { ...payload, overlay_digest: digest(payload) };
}

function auditItems({ family, profiles, entries, itemTemplates,
  quantityProfiles, inventoryProfiles, sourceBindings, containerRules }) {
  const profile = exact(profiles, family.item_profile_id);
  const selected = entries.filter(({ profile_id: id }) => id === profile.id)
    .sort(byId);
  return {
    profile_ref: { table: 'item_profile_sets', id: profile.id,
      source_status: profile.status, approved_by:
        'FINAL_APPROVAL_ATTESTATION.json' },
    entry_count: selected.length,
    required_item_entry_count: selected.filter(({ required }) => required).length,
    container_rule_count: containerRules.filter((row) =>
      row.applicability?.context_domain === profile.context_domain).length,
    entries: selected.map((entry) => {
      const item = exact(itemTemplates, entry.item_template_id);
      const quantity = exact(quantityProfiles, item.id, 'item_template_id');
      const inventory = exact(inventoryProfiles, item.id, 'item_template_id');
      return { owner_ref: { table: 'item_profile_entries', id: entry.id },
        item_template_ref: item.id, source_status: entry.status ?? 'approved_by_parent',
        required: entry.required, selection_weight: entry.weight,
        quantity_bounds: { minimum: entry.min_quantity,
          maximum: entry.max_quantity }, slot_key: entry.slot_key,
        quantity_profile: { owner_ref: { table:
          'item_template_quantity_profiles', id: quantity.id },
        quantity_unit_id: quantity.quantity_unit_id,
        quantity_dimension: quantity.quantity_dimension,
        minimum_quantity: quantity.minimum_quantity,
        maximum_quantity: quantity.maximum_quantity,
        mass_grams_per_unit: quantity.mass_grams_per_unit,
        stackable: quantity.stackable,
        partial_consumption_allowed: quantity.partial_consumption_allowed,
        source_id: quantity.source_id },
        inventory_profile: { owner_ref: { table:
          'item_template_inventory_profiles', id: inventory.id },
        mass_grams: inventory.mass_grams, carry_form: inventory.carry_form,
        external_hand_cost: inventory.external_hand_cost,
        source_id: inventory.source_id },
        source_refs: sourceBindings.filter((row) =>
          row.item_template_id === item.id).map(({ id, source_id: sourceId }) =>
          ({ id, source_id: sourceId })).sort((a, b) => a.id.localeCompare(b.id)) };
    })
  };
}

function owner(table, row) { return { owner_ref: { table, id: row.id },
  status: row.status, source_refs: [...(row.sources ?? [])].sort() }; }
function actorRef(table, row, key) { return { owner_ref: { table, id: row[key] },
  status: row.status, source_refs: split(row.sources),
  legal_status_archetype_id: row.legal_status_archetype_id ?? null,
  social_position_archetype_id: row.social_position_archetype_id ?? null }; }
function split(value) { return String(value ?? '').split(';').map((v) => v.trim())
  .filter(Boolean).sort(); }
function exact(rows, id, key = 'id') { const found = rows.filter((row) =>
  row[key] === id); if (found.length !== 1) throw new Error(
  `PROCEDURAL_V6_SOURCE_ROW_INVALID:${key}:${id}`); return found[0]; }
function byId(a, b) { return a.id.localeCompare(b.id); }
function digest(value) { return createHash('sha256').update(JSON.stringify(value))
  .digest('hex'); }
async function json(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function tsv(path) { const [header, ...lines] = (await readFile(path, 'utf8'))
  .replace(/^\uFEFF/u, '').trimEnd().split(/\r?\n/u); const keys = header.split('\t');
  return lines.map((line) => Object.fromEntries(line.split('\t').map((value,
    index) => [keys[index], value]))); }

async function main(argv) {
  const root = resolve(argv[0] ?? '.');
  const output = resolve(root,
    'data/world-catalogs/novgorod/procedural-scene-v2/authoring-overlay.json');
  const overlay = await generateProceduralV6AuthoringOverlay(root);
  const approvalOutput = resolve(root,
    'data/world-catalogs/novgorod/procedural-scene-v2/approval-attestation.json');
  const approval = { schema: 'rus.procedural_scene_overlay_approval.v1',
    overlay_id: overlay.overlay_id, overlay_digest: overlay.overlay_digest,
    decision: 'approve_authoring_audit_only', activation_authorized: false,
    import_authorized: false, unresolved_data_gaps:
      overlay.families.flatMap(({ binding_id: bindingId, data_gap_codes: codes }) =>
        codes.map((code) => ({ binding_id: bindingId, code }))) };
  const sealedApproval = { ...approval, attestation_digest: digest(approval) };
  const expected = `${JSON.stringify(overlay, null, 2)}\n`;
  const expectedApproval = `${JSON.stringify(sealedApproval, null, 2)}\n`;
  if (argv.includes('--check')) {
    if (await readFile(output, 'utf8') !== expected
        || await readFile(approvalOutput, 'utf8') !== expectedApproval) throw new Error(
      'PROCEDURAL_V6_AUTHORING_OVERLAY_STALE');
  } else { await mkdir(resolve(output, '..'), { recursive: true });
    await Promise.all([writeFile(output, expected),
      writeFile(approvalOutput, expectedApproval)]); }
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main(process.argv.slice(2));
}
