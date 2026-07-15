import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const catalogPath = resolve(root, 'data/knowledge-source/imports/universal-category-classification-2026-07-15/stage-3b1/ITEM_CATALOG_120.md');
const outputRoot = resolve(root, 'data/knowledge-source/imports/universal-category-classification-2026-07-15/stage-3b1/bundle');
const revisionId = 'world_revision_novgorod_1230_item_catalogue_001';
const sourceId = 'src_project_stage_3b1_physical_parameter_policy';

const rows = readFileSync(catalogPath, 'utf8').split(/\r?\n/u).flatMap((line) => {
  const match = line.match(/^\| (\d+) \| `([^`]+)` \| ([^|]+) \| `([^`]+)` \| `([^`]+)` \| `([^`]+)` \| `([^`]+)` \| `([^`]+)` \|$/u);
  return match ? [{ ordinal: Number(match[1]), id: match[2], title: match[3].trim(), kind: match[4], group: match[5], evidence: match[6], source_family: match[7], status: match[8] }] : [];
});
if (rows.length !== 120 || new Set(rows.map((row) => row.id)).size !== 120) throw new Error('ITEM_CATALOG_120_INVALID');

const category = (id, domain, facet, label) => ({
  id, domain, stable_code: id.toUpperCase(), facet, preferred_label: label,
  definition: `Черновая авторская категория «${label}» для нормализованного каталога.`,
  scope_note: 'Широкий тип для draft authoring; не подтверждает историческую частотность или runtime-допустимость.',
  inclusion_rules: 'Используется только в явно заданных нормализованных bindings этого supplemental bundle.',
  exclusion_rules: 'Не заменяет региональное разрешение, profile, rule или конкретный экземпляр.',
  title: label, status: 'draft'
});
const suffix = (id) => id.replace(/^(?:item|container)_tpl_nov_/u, '').replace(/_v1$/u, '');
const objectCategoryId = (row) => `cat_${row.kind}_${row.kind === 'container' ? 'form' : 'object'}_${suffix(row.id)}_v1`;
const functionCategoryId = (row) => `cat_item_primary_${row.group}_v1`;
const contextCategoryId = (row) => `cat_item_context_${row.group}_v1`;
const categories = [];
const labels = [];
const addCategory = (record) => { if (!categories.some((value) => value.id === record.id)) { categories.push(record); labels.push({ id: `label_${record.id}`, category_id: record.id, language: 'ru', label: record.preferred_label, label_type: 'preferred', source_id: sourceId }); } };
for (const row of rows) {
  addCategory(category(objectCategoryId(row), row.kind, row.kind === 'container' ? 'container_form' : 'object_type', row.title));
  if (row.kind === 'item') {
    addCategory(category(functionCategoryId(row), 'item', 'primary_function', row.group));
    addCategory(category(contextCategoryId(row), 'item', 'use_context', row.group));
  }
}

const profileFor = (row) => {
  const id = suffix(row.id);
  const long = /(spear|scythe|shovel|rake|pitchfork|fishing_net|rope|bow)/u.test(id);
  const bulky = /(quern|cauldron|trough|mortar|mail_armour)/u.test(id);
  const compact = /(needle|hook|flint|tinder|seal|key|weight_set|stylus|comb|razor|cross)/u.test(id);
  return { mass_grams: bulky ? 4000 : long ? 1200 : compact ? 80 : 500, carry_form: bulky ? 'bulky' : long ? 'long' : compact ? 'compact' : 'regular', external_hand_cost: bulky ? 2 : long ? 1 : 0 };
};
const containerProfile = (row) => {
  const id = suffix(row.id);
  const stationary = /(chest|tub|cask|storage_pot)/u.test(id);
  const specialized = /(quiver|sheath|scabbard|needle_case)/u.test(id);
  const capacity = stationary ? 24 : specialized ? 2 : /(sack|basket)/u.test(id) ? 12 : /(bucket|jug)/u.test(id) ? 6 : 4;
  return { capacity, packing_slot_cost: specialized ? 1 : stationary ? 6 : 2, mass_grams: stationary ? 5000 : specialized ? 150 : 700, carry_form: stationary ? 'bulky' : 'regular', external_hand_cost: stationary ? 2 : 0, inventory_role: stationary ? 'none' : specialized ? 'quick_container' : 'primary_container' };
};
const itemRows = rows.filter((row) => row.kind === 'item');
const containerRows = rows.filter((row) => row.kind === 'container');
const itemTemplates = itemRows.map((row) => ({ id: row.id, world_revision_id: revisionId, region_id: 'region_novgorod_land', category_id: objectCategoryId(row), source_id: sourceId, title: row.title, status: 'draft' }));
const containerTemplates = containerRows.map((row) => ({ ...(() => { const p = containerProfile(row); return { id: row.id, world_revision_id: revisionId, region_id: 'region_novgorod_land', category_id: objectCategoryId(row), source_id: sourceId, capacity: p.capacity, packing_slot_cost: p.packing_slot_cost, capacity_policy: { version: 1, mode: 'packing_slots', unit: 'packing_slot' }, access_policy: { version: 1, mode: 'manual' }, status: 'draft' }; })() }));
const itemBindings = itemRows.flatMap((row) => [
  { id: `bind_${row.id}_object_type`, item_template_id: row.id, category_id: objectCategoryId(row), binding_kind: 'object_type', status: 'draft' },
  { id: `bind_${row.id}_primary_function`, item_template_id: row.id, category_id: functionCategoryId(row), binding_kind: 'primary_function', exclusivity_group: 'primary_function', status: 'draft' },
  { id: `bind_${row.id}_use_context`, item_template_id: row.id, category_id: contextCategoryId(row), binding_kind: 'use_context', status: 'draft' }
]);
const itemProfiles = itemRows.map((row) => ({ id: `inventory_${row.id}`, item_template_id: row.id, world_revision_id: revisionId, source_id: sourceId, ...profileFor(row), status: 'draft' }));
const containerInventoryProfiles = containerRows.map((row) => { const { capacity, packing_slot_cost, ...inventory } = containerProfile(row); return { id: `inventory_${row.id}`, container_template_id: row.id, world_revision_id: revisionId, source_id: sourceId, ...inventory, status: 'draft' }; });
const containerFacets = containerRows.map((row) => ({ id: `facet_${row.id}_form`, container_template_id: row.id, category_id: objectCategoryId(row), facet: 'container_form', status: 'draft' }));
const specialContents = new Map([
  ['container_tpl_nov_knife_sheath_v1', 'item_tpl_nov_utility_knife_v1'], ['container_tpl_nov_sword_scabbard_v1', 'item_tpl_nov_sword_v1'],
  ['container_tpl_nov_quiver_v1', 'item_tpl_nov_arrow_v1'], ['container_tpl_nov_needle_case_v1', 'item_tpl_nov_sewing_needle_v1']
]);
const contentProfiles = containerRows.map((row) => ({ id: `content_${row.id}`, container_template_id: row.id, empty_allowed: !specialContents.has(row.id), status: 'draft' }));
const contentEntries = [...specialContents].map(([containerId, item_template_id]) => ({ id: `content_entry_${containerId}`, profile_id: `content_${containerId}`, item_template_id, min_quantity: 1, max_quantity: 1, required: false, weight: 1 }));
const profileGroups = ['household_kitchen_basic','household_storage_basic','traveler_basic','fisher_basic','farmer_basic','woodworker_basic','smith_basic','textile_worker_basic','merchant_trade_tools','scribe_trade_writing','hunter_basic','guard_service','warrior_service','religious_personal','market_food_stock','market_craft_stock'];
const itemProfileSets = profileGroups.map((context_domain) => ({ id: `profile_${context_domain}_v1`, world_revision_id: revisionId, region_id: 'region_novgorod_land', context_domain, applicability: { version: 1, mode: 'draft_authoring' }, status: 'draft' }));
const representativeByGroup = new Map(itemRows.map((row) => [row.group, row]));
const itemProfileEntries = profileGroups.flatMap((group, index) => { const row = representativeByGroup.get(group.replace(/_basic$|_tools$|_writing$|_service$|_personal$|_stock$/u, '')) ?? itemRows[index]; return row ? [{ id: `profile_entry_${group}_v1`, profile_id: `profile_${group}_v1`, item_template_id: row.id, slot_key: 'draft_candidate', min_quantity: 1, max_quantity: 1, required: false, weight: 1 }] : []; });
const propertyKinds = ['personal_possession','household_property','workshop_tool_property','trade_stock','service_equipment','military_service_gear','religious_object','communal_resource','borrowed_entrusted_item','pledged_disputed_property'];
const propertyCategoryId = (kind) => `cat_item_property_${kind}_v1`;
for (const kind of propertyKinds) addCategory(category(propertyCategoryId(kind), 'item', 'property_category', kind));
const propertyProfiles = propertyKinds.map((kind) => ({ id: `property_${kind}_v1`, world_revision_id: revisionId, region_id: 'region_novgorod_land', property_category_id: propertyCategoryId(kind), status: 'draft' }));
const propertyRules = propertyProfiles.map((profile) => ({ id: `rule_${profile.id}`, property_profile_id: profile.id, owner_kind: 'person', holder_kind: 'person', controller_kind: 'person', access_policy: { version: 1, mode: 'explicit' }, claim_conditions: { version: 1, mode: 'none' }, status: 'draft' }));
const equipmentProfiles = [{ id: 'equipment_guard_service_v1', region_id: 'region_novgorod_land', social_role_id: 'nov_role_guard', status: 'draft' }];
const equipmentEntries = [{ id: 'equipment_entry_guard_utility_knife_v1', equipment_profile_id: 'equipment_guard_service_v1', item_template_id: 'item_tpl_nov_utility_knife_v1', slot_key: 'belt', required: false, weight: 1 }];
const regionOptions = categories.map((record) => ({ id: `region_option_${record.id}`, world_revision_id: revisionId, region_id: 'region_novgorod_land', category_id: record.id, valid_from: '1200-01-01', valid_to: '1250-12-31', weight: 1, applicability: { weight_semantics: 'neutral_draft_not_historical_commonness' }, status: 'draft' }));
const migrationInventory = [];
const canonicalCatalogDigest = digest(rows.map(({ ordinal, id, title, kind, group, evidence, source_family, status }) => ({ ordinal, id, title, kind, group, evidence, source_family, status })));
const datasets = {
  source_records: [{ id: sourceId, title: 'Stage 3B-1 physical parameter authoring policy', source_type: 'project_note', summary: 'Норматив для игровых инженерных оценок физического профиля; не является историческим доказательством.', status: 'draft', confidence: 'medium' }],
  world_revisions: [{ id: revisionId, parent_revision_id: 'novgorod_1230_research_revision_001', title: 'Novgorod 1230 item catalogue revision 001', catalog_digest: canonicalCatalogDigest, status: 'draft' }],
  universal_categories: categories, category_labels: labels, region_category_options: regionOptions,
  item_templates: itemTemplates, item_template_category_bindings: itemBindings, item_template_inventory_profiles: itemProfiles,
  container_templates: containerTemplates, container_template_facet_bindings: containerFacets, container_template_inventory_profiles: containerInventoryProfiles,
  container_content_profiles: contentProfiles, container_content_profile_entries: contentEntries,
  item_profile_sets: itemProfileSets, item_profile_entries: itemProfileEntries,
  property_profiles: propertyProfiles, property_profile_rules: propertyRules,
  region_equipment_profiles: equipmentProfiles, region_equipment_profile_entries: equipmentEntries,
  item_classification_migration_inventory: migrationInventory
};
const schemaIds = {
  source_records: 'rus.source_records.v1', world_revisions: 'rus.world_revisions.v1', universal_categories: 'rus.universal_categories.v1', category_labels: 'rus.category_labels.v1', region_category_options: 'rus.region_category_options.v1',
  item_templates: 'rus.item_templates.v1', item_template_category_bindings: 'rus.item_template_category_bindings.v1', item_template_inventory_profiles: 'rus.item_template_inventory_profiles.v1',
  container_templates: 'rus.container_templates.v1', container_template_facet_bindings: 'rus.container_template_facet_bindings.v1', container_template_inventory_profiles: 'rus.container_template_inventory_profiles.v1',
  container_content_profiles: 'rus.container_content_profiles.v1', container_content_profile_entries: 'rus.container_content_profile_entries.v1',
  item_profile_sets: 'rus.item_profile_sets.v1', item_profile_entries: 'rus.item_profile_entries.v1', property_profiles: 'rus.property_profiles.v1', property_profile_rules: 'rus.property_profile_rules.v1',
  region_equipment_profiles: 'rus.region_equipment_profiles.v1', region_equipment_profile_entries: 'rus.region_equipment_profile_entries.v1', item_classification_migration_inventory: 'rus.item_classification_migration_inventory.v1'
};
const order = Object.keys(datasets);
for (const table of order) writeJson(resolve(outputRoot, `${table}.json`), datasets[table]);
const manifest = { schema_version: 1, bundle_id: 'novgorod_1230_item_catalogue_draft_001', world_revision_id: revisionId, parent_bundles: ['rus13_world_base_v1'], approval: 'draft', deletion_policy: 'none', provenance: { source_ids: [sourceId], effective_at: '1230-01-01', historical_presence_gate: 'broad_type_only' }, datasets: order.map((table, dependency_order) => ({ table, path: `${table}.json`, schema_id: schemaIds[table], record_count: datasets[table].length, sha256: digest(datasets[table]), dependency_order })) };
writeJson(resolve(outputRoot, 'manifest.json'), manifest);
writeFileSync(resolve(root, 'data/knowledge-source/imports/universal-category-classification-2026-07-15/stage-3b1/PHYSICAL_PARAMETER_REVIEW_TABLE.md'), [
  '# Stage 3B-1 — review физических параметров', '',
  'Все значения ниже — `gameplay_estimate` из project policy, status `draft`; они не являются историческими измерениями.', '',
  '| template_id | kind | mass_grams | mass_basis | carry_form | external_hand_cost | packing_slot_cost | packing_bundle_size | container_capacity | inventory_role | derivation_kind | source_id | confidence | status | review_note |',
  '|---|---|---:|---|---|---:|---:|---:|---:|---|---|---|---|---|---|',
  ...rows.map((row) => { const p = row.kind === 'container' ? containerProfile(row) : profileFor(row); return `| ${row.id} | ${row.kind} | ${p.mass_grams} | project authoring class | ${p.carry_form} | ${p.external_hand_cost} | ${row.kind === 'container' ? p.packing_slot_cost : ''} |  | ${row.kind === 'container' ? p.capacity : ''} | ${row.kind === 'container' ? p.inventory_role : ''} | gameplay_estimate | ${sourceId} | medium | draft | promotion requires physical review |`; })
].join('\n') + '\n', 'utf8');
writeFileSync(resolve(root, 'data/knowledge-source/imports/universal-category-classification-2026-07-15/stage-3b1/NORMALIZATION_COVERAGE_REPORT.md'), [
  '# Stage 3B-1 — normalization coverage matrix', '',
  '| template_id | kind | source_record_resolved | object_type_resolved | primary_function_resolved | materials_resolved | use_context_resolved | template_record_created | regional_permission_created | inventory_profile_created | container_facets_created | content_profile_created | item_profile_membership | property_profile_membership | equipment_profile_membership | physical_parameters_status | normalization_status | blocking_gaps |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((row) => `| ${row.id} | ${row.kind} | authoring_policy_only | yes | ${row.kind === 'item' ? 'yes' : 'n/a'} | no | ${row.kind === 'item' ? 'yes' : 'n/a'} | yes | yes (draft) | yes (draft) | ${row.kind === 'container' ? 'yes' : 'n/a'} | ${row.kind === 'container' ? 'yes' : 'n/a'} | partial | partial | ${row.id === 'item_tpl_nov_utility_knife_v1' ? 'yes' : 'no'} | gameplay_estimate_review | partial_draft | HISTORICAL_PRESENCE_EVIDENCE_REQUIRED; PHYSICAL_PARAMETER_EVIDENCE_REQUIRED; ${row.group === 'food_raw_trade' ? 'BULK_GOOD_QUANTITY_UNIT_MODEL_REQUIRED' : 'MATERIAL_EVIDENCE_REQUIRED'} |`)
].join('\n') + '\n', 'utf8');

function digest(value) { return createHash('sha256').update(stable(value), 'utf8').digest('hex'); }
function stable(value) { if (Array.isArray(value)) return JSON.stringify(value.map(sort)); return JSON.stringify(sort(value)); }
function sort(value) { if (Array.isArray(value)) return value.map(sort); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sort(value[key])])); }
function writeJson(path, value) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
