'use strict';

const { rows: authoredRows, semanticVariants, semanticDuplicates, semanticKeepReasons, craftsOwnerHandoffs, craftsBicHandoffs } = require('./src/archive-inclusions.cjs');
const { fs, path, REPO, DOMAIN_ROOT, readCsv } = require('./lib.cjs');
const NEEDS_CHECK_HEADER = ['archive_id', 'current_result', 'current_target_group', 'current_target_ref', 'reason_code', 'finding_ref', 'cluster_id', 'note'];
const NEEDS_CHECK_ROWS = readCsv(path.join(DOMAIN_ROOT, 'authoring/needs_check.csv'));
if (Object.keys(NEEDS_CHECK_ROWS[0] || {}).join(',') !== NEEDS_CHECK_HEADER.join(',')) throw new Error('needs_check.csv header does not match the approved schema');
const NEEDS_CHECK_BY_ID = new Map();
for (const row of NEEDS_CHECK_ROWS) {
  if (!/^[A-Z]{2,4}\d{3,5}$/.test(row.archive_id) || NEEDS_CHECK_BY_ID.has(row.archive_id)) throw new Error(`needs_check.csv has invalid or duplicate archive id ${row.archive_id}`);
  if (!row.current_result || !/^(?:ICA_[A-Z0-9_]+|review_finding|unresolved)$/.test(row.reason_code)) throw new Error(`needs_check.csv has incomplete decision metadata for ${row.archive_id}`);
  if (row.finding_ref && !/^(?:round3-(?:crafts|bicw)\.md#L\d+|REVIEW-B-1#\d+)$/.test(row.finding_ref)) throw new Error(`needs_check.csv has invalid finding locator for ${row.archive_id}`);
  NEEDS_CHECK_BY_ID.set(row.archive_id, row);
}
const ROUND3_RECONCILIATION = readCsv(path.join(DOMAIN_ROOT, 'authoring/round3_merge_reconciliation.csv'));
const ROUND3_BY_ID = new Map(ROUND3_RECONCILIATION.map(row => [row.archive_id, row]));
if (ROUND3_RECONCILIATION.length !== 732 || ROUND3_BY_ID.size !== 732) throw new Error(`Expected 732 unique round-three crafts reconciliation rows, found ${ROUND3_RECONCILIATION.length}/${ROUND3_BY_ID.size}`);
const MASTER_SOURCE_ROOT = path.join(REPO, 'data/world-catalogs/novgorod/sources/master-archive-v1');
const CANONICAL_ITEMS = readCsv(path.join(MASTER_SOURCE_ROOT, 'data/canonical/material_items.csv'));
const COSTUME_ITEMS = readCsv(path.join(REPO, 'data/world-catalogs/novgorod/sources/costume-dataset-v1/data/catalog_items.csv'));
const SOURCE_CSV_CACHE = new Map();
const CANONICAL_BY_LEGACY_ID = new Map();
for (const item of CANONICAL_ITEMS) {
  let refs;
  try { refs = JSON.parse(item.legacy_references || '[]'); } catch { refs = []; }
  for (const ref of refs) {
    if (!CANONICAL_BY_LEGACY_ID.has(ref.legacy_id)) CANONICAL_BY_LEGACY_ID.set(ref.legacy_id, []);
    CANONICAL_BY_LEGACY_ID.get(ref.legacy_id).push(item);
  }
}
const COSTUME_BY_ID = new Map(COSTUME_ITEMS.map(item => [item.item_id, item]));
const MATERIAL_MASTER_DIR = path.join(MASTER_SOURCE_ROOT, 'data/normalized_source_tables/material_entities');
const MATERIAL_MASTER_ROWS = new Map(readCsv(path.join(MATERIAL_MASTER_DIR, 'material_entities.csv')).map(row => [row.item_id, row]));
const STATE_MASTER_ROWS = new Map(readCsv(path.join(MATERIAL_MASTER_DIR, 'state_variants.csv')).map(row => [row.state_id, row]));
// Deduplicated from master source_item_links.csv (sha256 8ec5dbcb016f48e2e973bce07a5f1c9fbb6f6429812f853c8a05222660281ddc).
// Keep the evidence role in authoring so builds do not depend on an unpacked archive outside the repo.
const CATEGORY_EVIDENCE_ROWS = readCsv(path.join(DOMAIN_ROOT, 'authoring/category_evidence_ids.csv'));
if (CATEGORY_EVIDENCE_ROWS.some(row => row.support_role !== 'category_form_material_process_or_context')) throw new Error('Invalid category evidence role');
const CATEGORY_EVIDENCE_IDS = new Set(CATEGORY_EVIDENCE_ROWS.map(row => row.archive_id));

function archiveRowById(id) {
  if (MATERIAL_MASTER_ROWS.has(id)) return MATERIAL_MASTER_ROWS.get(id);
  if (STATE_MASTER_ROWS.has(id)) return STATE_MASTER_ROWS.get(id);
  if (COSTUME_BY_ID.has(id)) return COSTUME_BY_ID.get(id);
  const candidates = CANONICAL_BY_LEGACY_ID.get(id) || [];
  if (candidates.length === 1) {
    try { return JSON.parse(candidates[0].source_record || '{}'); } catch { return null; }
  }
  const entry = authoredRows.find(row => row[0].split(':').at(-1) === id);
  return entry ? sourceRowFor(entry).row || null : null;
}

// Hold the whole hunting/fishing ownership boundary together, using structured
// archive taxonomy rather than an ID list or incidental words in item names.
function isHuntingFishingCluster(id) {
  const source = archiveRowById(id) || {};
  const base = source.base_item_id ? archiveRowById(source.base_item_id) || {} : {};
  const category = source.category || base.category || '';
  const subcategory = source.subcategory || base.subcategory || '';
  const family = source.family_key || base.family_key || '';
  const func = source.function || base.function || '';
  return category === 'hunting' || category === 'fishing'
    || ['fishing_hooks_floats_sinkers_bait_and_trap_parts',
      'hunting_trapping_bait_and_carcass_small_parts',
      'nets_lines_and_mesh_components'].includes(subcategory)
    || /(?:^|_)(?:fish|fishing|hunting|bird|carcass|bait|trap|snare)(?:_|$)/.test(family)
    || /рыболовн.{0,24}поплавк/iu.test(func)
    || (/сеть/iu.test(func) && /(?:net|fish|fishing|float|sinker|weight)/i.test(family))
    || family.startsWith('net_repair_')
    || /(?:^|_)netting_(?:gauge|tool)(?:_|$)/.test(family);
}

function periodFromSource(source) {
  if (source.period_from && source.period_to) return `${source.period_from}–${source.period_to}`;
  const scope = String(source.period_scope || '').match(/\b(\d{4})\D{0,12}(\d{4})\b/);
  return scope ? `${scope[1]}–${scope[2]}` : '';
}

if (craftsOwnerHandoffs.size !== 84) throw new Error(`Expected 84 explicit clothing→crafts handoff decisions, found ${craftsOwnerHandoffs.size}`);
for (const [archiveId, decision] of craftsOwnerHandoffs) {
  if (authoredRows.some(row => row[0].split(':').at(-1) === archiveId)) throw new Error(`Duplicate crafts authoring for owner handoff ${archiveId}`);
  const source = archiveRowById(archiveId);
  if (!source) throw new Error(`Owner handoff ${archiveId} has no canonical source row`);
  const isCostume = archiveId === 'FW022';
  const archive_ref = isCostume
    ? `downloads/Novgorod1230_costume_dataset_v1/data/catalog_items.csv:${archiveId}`
    : `data/normalized_source_tables/material_entities/material_entities.csv:${archiveId}`;
  const derivation = isCostume ? archiveId : `data/normalized_source_tables/material_entities/material_entities.csv#${archiveId}`;
  const confidence = source.historical_confidence || 'B';
  const basis = confidence === 'A' ? 'sourced' : confidence === 'B' ? 'logical_necessity' : 'analogy';
  const period = isCostume ? '1180–1260' : periodFromSource(source);
  const region = source.region_scope || source.region || '';
  const archive_name = source.name_ru || source.archive_name || '';
  if (!archive_name) throw new Error(`Owner handoff ${archiveId} has no source name`);
  authoredRows.push([
    archive_ref, archive_name, decision.type === 'entity' ? 'new' : 'variant', decision.ref, basis, derivation, confidence, period, region,
    decision.type === 'variant' ? 'add_variant' : 'include_d39', 'include', decision.reason,
  ]);
}
if (craftsBicHandoffs.size !== 93) throw new Error(`Expected 93 explicit crafts incoming-owner decisions, found ${craftsBicHandoffs.size}`);
for (const [archiveId, decision] of craftsBicHandoffs) {
  if (authoredRows.some(row => row[0].split(':').at(-1) === archiveId)) throw new Error(`Duplicate crafts authoring for BIC owner handoff ${archiveId}`);
  const source = archiveRowById(archiveId);
  if (!source) throw new Error(`BIC owner handoff ${archiveId} has no canonical source row`);
  const isMasterItem = /^OMI/.test(archiveId);
  const archive_ref = archiveId.startsWith('STA')
    ? `data/normalized_source_tables/material_entities/state_variants.csv:${archiveId}`
    : /^MUS|^CON|^MSC|^WRT|^HNT|^FSH|^MIL|^AGR/.test(archiveId)
      ? `downloads/Novgorod1230_material_culture_dataset_v1/Novgorod1230_material_culture_dataset_v1/data/catalog_items.csv:${archiveId}`
      : `data/normalized_source_tables/material_entities/material_entities.csv:${archiveId}`;
  const confidence = source.historical_confidence || 'B';
  const basis = confidence === 'A' ? 'sourced' : confidence === 'B' ? 'logical_necessity' : 'analogy';
  const targetType = decision.type === 'entity' ? 'new' : 'variant';
  const derivation = archiveId.startsWith('STA')
    ? `data/normalized_source_tables/material_entities/state_variants.csv#${archiveId}`
    : isMasterItem ? `data/normalized_source_tables/material_entities/material_entities.csv#${archiveId}` : archiveId;
  authoredRows.push([
    archive_ref, source.name_ru || source.archive_name, targetType, decision.ref || '', basis,
    derivation,
    confidence, periodFromSource(source), source.region_scope || source.region || '',
    targetType === 'variant' ? 'add_variant' : 'include_d39', 'include', decision.reason,
    decision.target_group || '', decision.target_ref || '',
  ]);
}

// Kind-owner decisions from REVIEW-imp-crafts. IHP placement refs do not imply
// entity ownership; only rows in entity tables are owners.
const ROUTED = new Map();
const route = (group, ids) => ids.split(/\s+/).filter(Boolean).forEach(id => ROUTED.set(id, { group, ref: '' }));
route('transport-health-recreation', 'LTR0003 LTR0004 LTR0005 LTR0006 LTR0008 LTR0010 LTR0011 LTR0012 LTR0013 LTR0014 LTR0015 LTR0016 LTR0018 LTR0019 LTR0020 LTR0021 LTR0023 LTR0026 LTR0029 LTR0031 LTR0032 WTR0002 WTR0003 WTR0008 WTR0009 WTR0014 WTR0015 WTR0016 WTR0020 WTR0021 WTR0022 WTR0024 WTR0025 WTR0026 WTR0028 WTR0030 WTR0034 WTR0035 WTR0036 WTR0037 HRS0003 HRS0004 HRS0005 HRS0006 HRS0007 HRS0008 HRS0009 HRS0010 HRS0011 HRS0012 HRS0013 HRS0014 HRS0015 HRS0016 HRS0017 HRS0018 HRS0019 HRS0020 HRS0021 HRS0022 HRS0023 HRS0024 HRS0025 HRS0026 HRS0027 HRS0028 HRS0029 HRS0030 HRS0031 HRS0032 HRS0033 HRS0036 FRN0011 FRN0035 FRN0041 FRN0051');
route('fauna-fish-invertebrates-livestock', 'HNT0013 FSH0025 OMI02061 OMI02062 OMI02063 OMI02064 OMI02065');
route('food-drink', 'CRF0054 OMI00548');
route('buildings-interiors-containers', 'AGR0004 AGR0005');
route('buildings-interiors-containers', 'OMI00422 OMI00423');
route('items-household-personal', 'OMI00101 OMI00104 OMI00316 OMI00317 OMI00374 OMI01686 OMI01749 OMI00293 WTR0023');
route('clothing-appearance', 'OMI01220');
route('food-drink', 'FOD0009');
route('nature-materials-weather', 'OMI00037 OMI00048 OMI00050 OMI00113 OMI00114 OMI00115 OMI00135 OMI00136 OMI00143 OMI00149 OMI00155 OMI00157 OMI00158 OMI01009 OMI01010 OMI01011 OMI01034 OMI01035 OMI01036 OMI01151 OMI01152 OMI01517');
const ROUTED_REFS = new Map([
  ['LTR0021', 'transport-health-recreation/transport_travel/transport_entities.csv#trv_023'], ['LTR0026', 'transport-health-recreation/transport_travel/transport_entities.csv#trv_024'],
  ['LTR0008', 'transport-health-recreation/transport_travel/transport_entities.csv#trv_026'], ['HRS0004', 'transport-health-recreation/transport_travel/transport_entities.csv#trv_029'],
  ['HRS0021', 'transport-health-recreation/transport_travel/transport_entities.csv#trv_030'], ['WTR0002', 'transport-health-recreation/transport_travel/transport_entities.csv#trv_021'],
  ['WTR0037', 'transport-health-recreation/transport_travel/transport_entities.csv#trv_011'], ['LTR0014', 'transport-health-recreation/transport_travel/transport_entities.csv#trv_032'],
  ['LTR0019', 'transport-health-recreation/transport_travel/transport_entities.csv#trv_032'],
  ['OMI01220', 'clothing-appearance/adornment_appearance/adornment.csv#ad_ac020'],
  ['OMI00422', 'buildings-interiors-containers/interiors/matcult_item_refs.csv#TRD0007'], ['OMI00423', 'buildings-interiors-containers/interiors/matcult_item_refs.csv#TRD0008'],
  ['FSH0025', 'fauna-fish-invertebrates-livestock/fauna/fishing_methods.csv#fm_weir_zakol'],
  ['OMI02061', 'fauna-fish-invertebrates-livestock/fauna/livestock_products.csv#lp_manure'], ['OMI02062', 'fauna-fish-invertebrates-livestock/fauna/livestock_products.csv#lp_manure'],
  ['OMI02063', 'fauna-fish-invertebrates-livestock/fauna/livestock_products.csv#lp_manure'], ['OMI02064', 'fauna-fish-invertebrates-livestock/fauna/livestock_products.csv#lp_manure'],
  ['OMI02065', 'fauna-fish-invertebrates-livestock/fauna/livestock_products.csv#lp_manure'],
  ['CRF0054', 'food-drink/food/ingredients.csv#fd_dried_malt'], ['OMI01736', 'food-drink/food/ingredients.csv#fd_egg_chicken'],
  ['OMI00025', 'items-household-personal/items/household.csv#it_hh_splint'], ['OMI00152', 'items-household-personal/items/household.csv#it_hh_tinder'],
  ['OMI00293', 'items-household-personal/items/household.csv#it_hh_thread_skein'],
  ['WTR0023', 'items-household-personal/items/household.csv#it_hh_repair_clamp'], ['FOD0009', 'food-drink/food/ingredients.csv#fd_animal_fat'],
  ['OMI00037', 'nature-materials-weather/natural_materials_soils/natural_materials.csv#nm_dry_brushwood'], ['OMI00048', 'nature-materials-weather/natural_materials_soils/natural_materials.csv#nm_deadwood'],
  ['OMI00050', 'nature-materials-weather/natural_materials_soils/natural_materials.csv#nm_driftwood'],
  ['OMI00113', 'nature-materials-weather/natural_materials_soils/natural_materials.csv#nm_birch_bark'], ['OMI00114', 'nature-materials-weather/natural_materials_soils/natural_materials.csv#nm_birch_bark'], ['OMI00115', 'nature-materials-weather/natural_materials_soils/natural_materials.csv#nm_birch_bark'],
  ['OMI00135', 'nature-materials-weather/natural_materials_soils/natural_materials.csv#nm_lime_bast'], ['OMI00136', 'nature-materials-weather/natural_materials_soils/natural_materials.csv#nm_lime_bast'],
  ['OMI00143', 'nature-materials-weather/natural_materials_soils/natural_materials.csv#nm_spruce_roots'], ['OMI00149', 'nature-materials-weather/natural_materials_soils/natural_materials.csv#nm_tinder_kindling'],
  ['OMI00155', 'nature-materials-weather/natural_materials_soils/natural_materials.csv#nm_pine_resin'], ['OMI00157', 'nature-materials-weather/natural_materials_soils/natural_materials.csv#nm_pine_resin'], ['OMI00158', 'nature-materials-weather/natural_materials_soils/natural_materials.csv#nm_pine_resin'],
  ['OMI01009', 'nature-materials-weather/natural_materials_soils/natural_materials.csv#nm_clay'], ['OMI01010', 'nature-materials-weather/natural_materials_soils/natural_materials.csv#nm_clay'], ['OMI01011', 'nature-materials-weather/natural_materials_soils/natural_materials.csv#nm_clay'],
  ['OMI01034', 'nature-materials-weather/natural_materials_soils/natural_materials.csv#nm_clay'], ['OMI01035', 'nature-materials-weather/natural_materials_soils/natural_materials.csv#nm_clay'], ['OMI01036', 'nature-materials-weather/natural_materials_soils/natural_materials.csv#nm_clay'],
  ['OMI01151', 'nature-materials-weather/natural_materials_soils/natural_materials.csv#nm_sand'], ['OMI01152', 'nature-materials-weather/natural_materials_soils/natural_materials.csv#nm_gravel_pebbles'], ['OMI01517', 'nature-materials-weather/natural_materials_soils/natural_materials.csv#nm_moss'],
]);
const ROUTED_REASONS = new Map([
  ['OMI01220', 'A string of glass beads is a finished adornment; its identity belongs to clothing-appearance, not generic textile material.'],
  ['OMI00422', 'Сырая кунья шкурка как переносимый меховой товар совпадает с BIC trade reference TRD0007; материал остаётся Crafts-owned, а предметный рынок/учёт — BIC.'],
  ['OMI00423', 'Связка сырых беличьих шкурок совпадает с BIC trade reference TRD0008; вид и связка описывают товарную партию, не новый меховой материал crafts.'],
]);
for (const [id, target] of ROUTED) target.ref = ROUTED_REFS.get(id) || '';

const D38_REJECTS = new Map([
  ['CRF0057', 'D38: research_only reconstruction with D confidence and critical generation risk; reject rather than materialize an unattested water-wheel form.'],
  ['WTR0024', 'D38: source period 1450–1700 excludes 1230; research-only late vessel.'],
  ['WTR0015', 'D38: D-confidence, research_only, critical anachronism risk.'],
  ['HRS0021', 'D38: D-confidence, research_only, critical anachronism risk.'],
  ['HNT0028', 'D38: D-confidence, research_only, critical anachronism risk.'],
  ['CRF0061', 'D38: D-confidence, research_only, critical anachronism risk.'],
]);
const REVIEW_VARIANTS = new Map([
  ['CRF0099', ['crafts-tools-processes/craft_tools_gear/tools_gear.csv#tl_auger_spoon', 'Коловорот — вариант применения существующего сверла/буравчика.']],
  ['WTR0033', ['crafts-tools-processes/craft_tools_gear/tools_gear.csv#tl_boat_pole', 'Полюс лодочника — вариант существующего boat pole.']],
  ['OMI00208', ['crafts-tools-processes/materials_registry/material_entities.csv#n1230:material_item:omi00062', 'Сломанная деревянная спица — состояние заготовки спицы.']],
  ['OMI02132', ['crafts-tools-processes/craft_processes/process_products.csv#pr:whole_carcass', 'Освежёванная туша — состояние pr:whole_carcass.']],
  ['OMI02126', ['crafts-tools-processes/craft_processes/process_products.csv#pr:feathers_down', 'Пух и перья — вариант feathers/down process product.']],
  ['OMI00929', ['crafts-tools-processes/craft_tools_gear/tools_gear.csv#tl_netting_needle', 'Костяная пластинка для плетения сетей — точная форма существующей сетевязальной иглы и мерки ячеи.']],
  ['OMI02104', ['crafts-tools-processes/craft_tools_gear/tools_gear.csv#tl_net_float', 'Поплавок-маркер остаётся сетным поплавком; маркировка не меняет класс орудия.']],
]);
const addVariants = (ids, target, reason) => ids.split(/\s+/).filter(Boolean).forEach(id => REVIEW_VARIANTS.set(id, [target, reason]));
addVariants('AGR0032 CRF0058 OMI01122', 'crafts-tools-processes/craft_tools_gear/tools_gear.csv#tl_mill_stone', 'Archive form/state of the existing millstone tool.');
REVIEW_VARIANTS.set('OMI01122', ['crafts-tools-processes/craft_tools_gear/tools_gear.csv#tl_whetstone', 'Whetstone form; reuse existing sharpening tool.']);
addVariants('CRF0085', 'crafts-tools-processes/materials_registry/materials.csv#mt_bark_tanning', 'Tanning-bark form of the existing bark-tanning material.');
addVariants('CRF0122', 'crafts-tools-processes/materials_registry/materials.csv#mt_forge_slag', 'Forge-slag material; do not create duplicate type.');
addVariants('CRF0033 OMI01738 OMI01739 OMI01740 OMI01741 OMI01742 OMI00861 OMI00862 OMI00863', 'crafts-tools-processes/materials_registry/materials.csv#mt_enamel', 'Color or grain form of existing enamel materials.');
addVariants('CRF0031', 'crafts-tools-processes/materials_registry/materials.csv#mt_textile_dyes', 'Textile-dye variant of existing dye material.');
addVariants('WRT0019', 'crafts-tools-processes/craft_processes/process_products.csv#pr:seal_matrix', 'Seal matrix material variant; existing product owns identity.');
addVariants('FSH0032 FSH0009 OMI00396 OMI00398 OMI00409', 'crafts-tools-processes/craft_processes/process_products.csv#pr:fishing_net', 'Net material state or fragment; reuse existing fishing-net product.');
addVariants('OMI01181 OMI01182', 'crafts-tools-processes/materials_registry/materials.csv#mt_chalk', 'Chalk size/condition only.');
addVariants('OMI01177 OMI01178 OMI01179 OMI01180', 'crafts-tools-processes/materials_registry/materials.csv#mt_ochre', 'Ochre color/form property.');
addVariants('OMI01184 OMI01666', 'crafts-tools-processes/materials_registry/materials.csv#mt_carbon_black', 'Carbon-black form/state.');
addVariants('OMI00170 OMI00171', 'crafts-tools-processes/materials_registry/materials.csv#mt_wood_ash_lye', 'Ash/lye state of existing wood ash material.');
addVariants('OMI00238', 'crafts-tools-processes/materials_registry/materials.csv#mt_hemp', 'Plant-fibre material; reuse existing hemp identity.');
addVariants('OMI02049 OMI02050 OMI02051', 'crafts-tools-processes/materials_registry/materials.csv#mt_hay', 'Hay size or processing-state property.');
addVariants('OMI02045 OMI02047 OMI00229 OMI00217', 'crafts-tools-processes/craft_processes/process_products.csv#pr:flax_stems', 'Flax-stem processing or state variant.');
addVariants('OMI00748', 'crafts-tools-processes/craft_processes/process_products.csv#pr:worn_iron_object', 'Worn iron salvage state; existing product owns identity.');
addVariants('OMI01020 OMI01021', 'crafts-tools-processes/materials_registry/materials.csv#mt_temper', 'Temper condition/property, not a separate material type.');
addVariants('OMI01112 OMI01110 OMI01139', 'crafts-tools-processes/materials_registry/materials.csv#mt_fieldstone', 'Stone kind/size property of existing fieldstone material.');
addVariants('OMI00414 OMI00416 OMI00417 OMI00419 OMI00420 OMI00426 OMI00427 OMI00429 OMI00431 OMI00433 OMI00434 OMI00435 OMI00436 OMI00437', 'crafts-tools-processes/materials_registry/materials.csv#mt_hide_raw', 'Species, form, or state is a property of raw hide.');
addVariants('OMI00460', 'crafts-tools-processes/materials_registry/materials.csv#mt_rawhide', 'Rawhide state; corrected target from vegetable-tanned leather.');
addVariants('OMI00741 OMI00746', 'crafts-tools-processes/materials_registry/materials.csv#mt_iron', 'Corroded iron salvage, not forge slag.');
addVariants('OMI01206 OMI01207 OMI01208 OMI01209 OMI01210', 'crafts-tools-processes/materials_registry/materials.csv#mt_glass', 'Glass color/form belongs in properties, not a new material identity.');
addVariants('OMI01221 OMI01222 OMI01223', 'crafts-tools-processes/materials_registry/materials.csv#mt_glass', 'Glass-inlay shape/state is a material property.');
addVariants('OMI00977', 'crafts-tools-processes/materials_registry/material_entities.csv#n1230:material_item:omi00976', 'Same object identity as archive OMI00976.');
addVariants('OMI00912', 'crafts-tools-processes/materials_registry/material_entities.csv#n1230:material_item:omi00910', 'Same object identity as archive OMI00910.');
addVariants('OMI00903', 'crafts-tools-processes/materials_registry/material_entities.csv#n1230:material_item:omi00882', 'Bone/antler item kind property; reuse OMI00882 identity.');
addVariants('OMI02113', 'crafts-tools-processes/craft_tools_gear/tools_gear.csv#tl_snare', 'Snare form/state; reuse existing trap tool.');
addVariants('OMI01667', 'crafts-tools-processes/materials_registry/material_entities.csv#n1230:material_item:omi01183', 'Same carbon-black item identity as OMI01183.');
addVariants('OMI02096', 'crafts-tools-processes/materials_registry/material_entities.csv#n1230:material_item:omi00040', 'Quantity/form of existing wooden peg item.');
addVariants('OMI01755', 'crafts-tools-processes/materials_registry/material_entities.csv#n1230:material_item:omi01754', 'Ash form/state of the existing candidate.');
addVariants('OMI00961 OMI00962 OMI00965', 'crafts-tools-processes/materials_registry/material_entities.csv#n1230:material_item:omi00901', 'Tooth size/count properties of existing animal-tooth material.');
addVariants('OMI00949', 'crafts-tools-processes/materials_registry/material_entities.csv#n1230:material_item:omi00948', 'Same archive family/object identity; size is a property.');
addVariants('OMI01760', 'crafts-tools-processes/materials_registry/material_entities.csv#n1230:material_item:omi01759', 'Same object identity; size/state is a property.');
addVariants('OMI01747', 'crafts-tools-processes/materials_registry/material_entities.csv#n1230:material_item:omi01746', 'Wear is an instance state, not a second type.');
addVariants('OMI01054', 'crafts-tools-processes/materials_registry/material_entities.csv#n1230:material_item:omi01053', 'Same tool/workpiece identity; size is a property.');
addVariants('OMI00057', 'crafts-tools-processes/materials_registry/material_entities.csv#n1230:material_item:omi00056', 'Broken handle state.');
addVariants('OMI00206', 'crafts-tools-processes/materials_registry/material_entities.csv#n1230:material_item:omi00059', 'Removed wooden bushing state/part.');
addVariants('OMI01244', 'crafts-tools-processes/materials_registry/material_entities.csv#n1230:material_item:omi01243', 'Amber form/size property.');
addVariants('OMI01216 OMI01217 OMI01218', 'crafts-tools-processes/materials_registry/material_entities.csv#n1230:material_item:omi01219', 'Glass-bead condition/unfinished state; reuse stable glass-bead stock identity OMI01219.');
addVariants('OMI01248', 'crafts-tools-processes/materials_registry/material_entities.csv#n1230:material_item:omi01247', 'Amber-bead form/size variant.');
addVariants('OMI00069', 'crafts-tools-processes/craft_tools_gear/tools_gear.csv#tl_oar', 'Oar blank is a state of the existing oar tool.');
addVariants('OMI01119', 'crafts-tools-processes/craft_tools_gear/tools_gear.csv#tl_whetstone', 'Whetstone blank/use form.');
addVariants('OMI02137', 'crafts-tools-processes/materials_registry/materials.csv#mt_fur', 'Fur-bearing animal tail is a size/form property of fur material.');
addVariants('OMI00987 OMI00990 OMI00991 OMI00992 OMI00993', 'crafts-tools-processes/materials_registry/materials.csv#mt_bone', 'Bone material state or form.');
addVariants('OMI01005 OMI00888 OMI00889', 'crafts-tools-processes/materials_registry/materials.csv#mt_horn', 'Horn or antler material kind property.');
addVariants('OMI01237 OMI01238 OMI01239 OMI01240 OMI01254 OMI01255', 'crafts-tools-processes/materials_registry/materials.csv#mt_amber', 'Amber state, color, or size property.');
addVariants('OMI00565 OMI00566', 'crafts-tools-processes/materials_registry/materials.csv#mt_leather_veg', 'Rawhide scraps belong to the existing leather material.');
addVariants('OMI00376 OMI00377 OMI00378', 'crafts-tools-processes/materials_registry/materials.csv#mt_cordage', 'Knotted, unravelled, or rotten hemp rope remains cordage stock; the source names rope and hemp fibre rather than leather.');
addVariants('OMI02050 OMI02051', 'crafts-tools-processes/materials_registry/materials.csv#mt_hay', 'Hay size/form property.');
addVariants('OMI00139', 'crafts-tools-processes/materials_registry/materials.csv#mt_bast_linden', 'Linden-bast kind/state property.');
addVariants('OMI00147', 'crafts-tools-processes/materials_registry/materials.csv#mt_firewood', 'Firewood size/form property.');
addVariants('OMI00155 OMI00157', 'nature-materials-weather/natural_materials_soils/natural_materials.csv#nm_pine_resin', 'Pine-resin state is owned by the existing nature material.');
addVariants('OMI00166 OMI00858 OMI01756', 'crafts-tools-processes/materials_registry/materials.csv#mt_charcoal', 'Charcoal state/form property.');
addVariants('OMI01193 OMI02069', 'crafts-tools-processes/materials_registry/materials.csv#mt_salt', 'Salt grain or state property.');
addVariants('OMI01490 OMI01491 OMI01492', 'crafts-tools-processes/materials_registry/materials.csv#mt_beeswax', 'Beeswax form/state property.');
addVariants('OMI00833', 'crafts-tools-processes/materials_registry/materials.csv#mt_silver', 'Silver form/state property.');
addVariants('OMI00747', 'crafts-tools-processes/materials_registry/materials.csv#mt_iron', 'Iron is a property of the existing iron material.');
addVariants('OMI00809', 'crafts-tools-processes/materials_registry/materials.csv#mt_lead', 'The archive explicitly identifies lead cuttings intended for remelting; use the lead material identity.');
addVariants('CRF0055 CRF0056', 'crafts-tools-processes/materials_registry/materials.csv#mt_iron', 'Iron strip or wire is a form of stable iron stock.');
addVariants('CRF0046 CRF0149', 'crafts-tools-processes/materials_registry/materials.csv#mt_nonferrous_generic', 'Archive materials do not resolve the specific alloy; retain a generic nonferrous material identity.');
addVariants('OMI00957 OMI01684 OMI00956', 'crafts-tools-processes/materials_registry/materials.csv#mt_feather', 'Feather size/species is a material property.');
addVariants('OMI00260 OMI02070', 'crafts-tools-processes/materials_registry/materials.csv#mt_horsehair', 'Horsehair size/use property.');
addVariants('OMI00353', 'crafts-tools-processes/craft_tools_gear/tools_gear.csv#tl_rope_coil', 'Rope coil/bundle form; reuse rope tool identity.');
addVariants('OMI00350 OMI00351 OMI00354 OMI00363 OMI00364', 'crafts-tools-processes/materials_registry/materials.csv#mt_cordage', 'Cordage size/form/purpose property.');
addVariants('OMI00555 OMI00556 OMI00557', 'crafts-tools-processes/materials_registry/material_entities.csv#n1230:material_item:crf0025', 'Leather offcut length/width/count are properties of the stable cobbler offcut entity CRF0025.');
addVariants('OMI00954 OMI00955', 'crafts-tools-processes/materials_registry/material_entities.csv#n1230:material_item:omi00953', 'Eggshell residue size/species variants share the independent eggshell-waste entity OMI00953.');
addVariants('OMI00971', 'crafts-tools-processes/materials_registry/material_entities.csv#n1230:material_item:omi00970', 'Small fish-scale heap is a particle-size/quantity variant of the fish-scale waste entity OMI00970.');
addVariants('OMI00999 OMI01004', 'crafts-tools-processes/materials_registry/materials.csv#mt_horn', 'Horn shaving size is a property of stable horn material, not of an unrelated leather entity.');
const REVIEW_DUPLICATES = new Map([
]);

const LEDGER_HEADER = [
  'archive_ref', 'archive_name', 'record_type', 'disposition', 'game_base_ref', 'basis', 'derivation',
  'confidence', 'period', 'region', 'source_action', 'anachronism_result', 'anachronism_reason',
  'dedup_result', 'dedup_reason', 'metadata_note', 'generation_policy', 'anachronism_risk',
  'target_group', 'target_ref', 'status',
];

function normalizeName(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[\p{P}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

const SEMANTIC_MODIFIERS = new Set('blank broken small large fine piece fragment raw tied wet dried dry caked down powdered collected selected prepared bundle hewn snapped marked drilled cut unsewn fresh medium narrow wide low high без с отверстий отверстиями малого малая малый малая малые мелкий мелкая мелкие крупный крупная крупные сырой сырая сырое сухой сухая сухое сухие влажный мокрый сломанный сломанная сломанное обломок кусок связка пучок мелкая мелкий большой большая большое малый малая малое без с для после пробный пробная пробное обугленный обугленная необработанный необработанная отрезок заготовка заготовки порция связанный связанная связанное'.split(' '));

function semanticRootSignature(value) {
  return normalizeName(value).split(' ').filter(word => word && !SEMANTIC_MODIFIERS.has(word))
    .map(word => word.replace(/(иями|ями|ами|ого|ему|ому|ыми|ими|ая|яя|ое|ее|ые|ие|ый|ий|ой|ую|юю|ых|их|ым|им|ом|ем|а|я|ы|и|у|ю|е|о)$/u, ''))
    .filter(word => word.length > 2).sort().join(' ');
}

function semanticEnglishSignature(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('en-US').replace(/[\p{P}]+/gu, ' ')
    .split(/\s+/).filter(word => word && !SEMANTIC_MODIFIERS.has(word)).sort().join(' ');
}

function semanticFamilyMatches(familyKey, entities) {
  const roots = semanticEnglishSignature(familyKey);
  if (!roots) return [];
  const candidate = new Set(roots.split(' '));
  return entities.filter(entity => [entity.englishRoots, entity.idRoots].some(signature => {
    const existing = new Set(signature.split(' ').filter(Boolean));
    return [...candidate].every(word => existing.has(word));
  }));
}

function basisFromEvidence(entry, source) {
  const confidence = entry[6];
  const evidence = String(source.evidence_basis || '').toLocaleLowerCase('ru-RU');
  const archiveId = entry[0].split(':').at(-1);
  if (craftsBicHandoffs.has(archiveId)) return confidence === 'A' ? 'sourced' : confidence === 'B' ? 'logical_necessity' : ['C', 'D'].includes(confidence) ? 'analogy' : '';
  if (entry[9] === 'include_analogy') return 'analogy';
  if (confidence === 'A' && /прям|direct|attest/u.test(evidence)) return 'sourced';
  if (confidence === 'B' && /реконструкц|reconstruction|category|context|аналог/u.test(evidence)) return 'logical_necessity';
  if (['C', 'D'].includes(confidence) && /гипотез|hypothes|реконструкц|reconstruction|аналог|analog|спорно|disput/u.test(evidence)) return 'analogy';
  return '';
}

function basisMatches(entry, source) {
  return !!basisFromEvidence(entry, source) && entry[4] === basisFromEvidence(entry, source);
}

function sourceRowFor(entry) {
  const [archiveRef, , , , , derivation] = entry;
  const archiveId = archiveRef.split(':').at(-1);
  if (derivation.includes('/')) {
    const relativePath = derivation.split('#')[0];
    const sourcePath = path.resolve(MASTER_SOURCE_ROOT, relativePath);
    if (!sourcePath.startsWith(`${MASTER_SOURCE_ROOT}${path.sep}`)) return { error: `source path escapes master snapshot: ${relativePath}` };
    if (!SOURCE_CSV_CACHE.has(sourcePath)) SOURCE_CSV_CACHE.set(sourcePath, readCsv(sourcePath));
    const rows = SOURCE_CSV_CACHE.get(sourcePath);
    const match = rows.filter(row => row.item_id === archiveId || row.state_id === archiveId);
    return match.length === 1 ? { row: match[0] } : { error: `${relativePath}#${archiveId} resolves to ${match.length} rows` };
  }
  if (archiveRef.includes('costume_dataset')) {
    const row = COSTUME_BY_ID.get(archiveId);
    return row ? { row } : { error: `costume snapshot has no ${archiveId}` };
  }
  if (archiveRef.includes('material_culture_dataset')) {
    const matches = CANONICAL_BY_LEGACY_ID.get(archiveId) || [];
    if (matches.length !== 1) return { error: `master canonical legacy refs resolve ${archiveId} to ${matches.length} rows` };
    let row;
    try { row = JSON.parse(matches[0].source_record || '{}'); } catch { return { error: `invalid source_record for ${archiveId}` }; }
    return row.item_id === archiveId ? { row } : { error: `master canonical source_record does not identify ${archiveId}` };
  }
  return { error: `no snapshot resolver for ${archiveRef}` };
}

function sourceRowIssues(entry) {
  const [archiveRef, archiveName, , , , , confidence, period, region] = entry;
  const resolved = sourceRowFor(entry);
  if (!resolved.row) return [`${archiveRef}: ${resolved.error}`];
  const source = resolved.row;
  const issues = [];
  if (source.name_ru !== archiveName) issues.push(`${archiveRef}: source name differs (${source.name_ru})`);
  if (source.historical_confidence && source.historical_confidence !== confidence) issues.push(`${archiveRef}: source confidence ${source.historical_confidence} != ${confidence}`);
  let sourcePeriod = '';
  if (source.period_from && source.period_to) sourcePeriod = `${source.period_from}–${source.period_to}`;
  else if (source.period_scope) {
    const years = source.period_scope.match(/\b(\d{4})\D{0,12}(\d{4})\b/);
    if (years) sourcePeriod = `${years[1]}–${years[2]}`;
  }
  if (sourcePeriod && sourcePeriod !== period) issues.push(`${archiveRef}: source period ${sourcePeriod} != ${period}`);
  const sourceRegion = source.region_scope || source.region || '';
  if (sourceRegion && sourceRegion !== region) issues.push(`${archiveRef}: source region differs (${sourceRegion})`);
  return issues;
}

function denylistMatches(name, deny) {
  const words = normalizeName(name).match(/[\p{L}\p{N}]+/gu) || [];
  const text = normalizeName(name);
  return deny.flatMap(d => {
    const [dlId, , stems, , verdict, reason] = d;
    const hits = (stems || '').split(';').map(s => s.trim().toLocaleLowerCase('ru-RU')).filter(Boolean)
      .filter(stem => stem.includes(' ') ? text.includes(stem) : words.some(word => word.startsWith(stem)));
    return hits.length ? [{ dlId, verdict, reason, hits }] : [];
  });
}

function makeExistingEntities({ tools, materials, workshops, processes, products }) {
  return [
    ...tools.map(r => [r.name_ru, r.name_en, `craft_tools_gear/tools_gear.csv#${r.tl_id}`]),
    ...materials.map(r => [r.name_ru, r.name_en, `materials_registry/materials.csv#${r.mt_id}`]),
    ...workshops.map(r => [r.name_ru, r.name_en, `workshops/workshops.csv#${r.ws_id}`]),
    ...processes.map(r => [r.name_ru, r.name_en, `craft_processes/processes.csv#${r.pc_id}`]),
    ...products.map(r => [r.name_ru, r.product_ref, `craft_processes/process_products.csv#${r.product_ref}`]),
  ].filter(([name]) => name).map(([name, english, ref]) => ({ name, english, ref, normalized: normalizeName(name), semanticRoots: semanticRootSignature(name), englishRoots: semanticEnglishSignature(english), idRoots: semanticEnglishSignature(ref.split('#').at(-1)) }));
}

function variantTargetExists(ref, { tools, materials, workshops, processes, products }) {
  const match = /^crafts-tools-processes\/(.+)#(.+)$/.exec(ref || '');
  if (!match) return false;
  const [, file, id] = match;
  const keys = {
    'craft_tools_gear/tools_gear.csv': ['tl_id', tools],
    'materials_registry/materials.csv': ['mt_id', materials],
    'workshops/workshops.csv': ['ws_id', workshops],
    'craft_processes/processes.csv': ['pc_id', processes],
    'craft_processes/process_products.csv': ['product_ref', products],
  };
  const target = keys[file];
  if (target && target[1].some(row => row[target[0]] === id)) return true;
  if (file === 'materials_registry/material_entities.csv') {
    const archiveId = id.replace(/^n1230:material_item:/i, '').toUpperCase();
    return authoredRows.some(row => row[0].endsWith(`:${archiveId}`) && row[2] === 'new' && row[10] === 'include');
  }
  return false;
}

const MATERIAL_CONCEPTS = {
  iron: ['желез', 'iron'], silver: ['серебр', 'silver'], copper: ['медн', 'copper'], bronze: ['бронз', 'bronze'],
  lead: ['свинц', 'lead'], wax: ['воск', 'wax', 'beeswax'], resin: ['смол', 'resin', 'pitch'],
  wood: ['дерев', 'древес', 'wood'], clay: ['глин', 'clay'], glass: ['стекл', 'glass'], stone: ['камен', 'stone'], amber: ['янтар', 'amber'],
  sand: ['песок', 'песоч', 'quartz', 'sand'], bone: ['кост', 'bone'], antler: ['рог', 'antler'], horn: ['horn'],
  leather: ['кож', 'leather', 'hide'], cordage: ['верев', 'верёв', 'канат', 'шнур', 'cordage', 'rope'],
  linen: ['льн', 'лен', 'linen', 'flax'], hemp: ['пеньк', 'коноп', 'hemp'],
  charcoal: ['уголь', 'charcoal', 'сажа', 'soot'], salt: ['соль', 'солян', 'salt'],
};

function materialConcepts(value) {
  const tokens = String(value || '').toLocaleLowerCase('ru-RU').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return new Set(Object.entries(MATERIAL_CONCEPTS)
    .filter(([, stems]) => tokens.some(token => stems.some(stem => token.startsWith(stem))))
    .map(([concept]) => concept));
}

function materialConceptsCompatible(source, target) {
  if ([...source].some(concept => target.has(concept))) return true;
  const fiber = new Set(['cordage', 'linen', 'hemp']);
  return [...source].some(concept => fiber.has(concept)) && [...target].some(concept => fiber.has(concept));
}

function targetIdentity(ref, domain) {
  const match = /^crafts-tools-processes\/(.+)#(.+)$/.exec(ref || '');
  if (!match) return '';
  const [, file, id] = match;
  const rows = {
    'materials_registry/materials.csv': [domain.materials, 'mt_id'],
    'craft_tools_gear/tools_gear.csv': [domain.tools, 'tl_id'],
    'workshops/workshops.csv': [domain.workshops, 'ws_id'],
    'craft_processes/processes.csv': [domain.processes, 'pc_id'],
    'craft_processes/process_products.csv': [domain.products, 'product_ref'],
  }[file];
  const row = rows?.[0]?.find(candidate => candidate[rows[1]] === id);
  if (row) return [id, row.name_ru, row.material_family, row.material, row.material_class, row.category, row.subcategory].join(' ');
  if (file === 'materials_registry/material_entities.csv') {
    const targetId = id.replace(/^n1230:material_item:/i, '').toUpperCase();
    const target = authoredRows.find(candidate => candidate[0].endsWith(`:${targetId}`) && candidate[2] === 'new');
    return target ? [target[1], sourceRowFor(target).row?.primary_material, sourceRowFor(target).row?.materials, sourceRowFor(target).row?.category, sourceRowFor(target).row?.subcategory].join(' ') : '';
  }
  return '';
}

function variantIdentityIssues(source, targetRef, domain, reason = '') {
  if (!source) return [];
  const sourceConcepts = materialConcepts([
    source.name_ru, source.primary_material, source.material, source.materials,
    source.category, source.subcategory,
  ].join(' '));
  const targetConceptSet = materialConcepts(targetIdentity(targetRef, domain));
  if (!sourceConcepts.size || !targetConceptSet.size || materialConceptsCompatible(sourceConcepts, targetConceptSet)) return [];
  const sameReasonCount = authoredRows.filter(entry => {
    const id = entry[0].split(':').at(-1);
    return (ROUND3_BY_ID.get(id)?.reason || entry[11] || REVIEW_VARIANTS.get(id)?.[1] || '') === reason;
  }).length;
  const reasonConcepts = materialConcepts(reason);
  const uniqueConcreteReason = reason && sameReasonCount === 1 &&
    [...sourceConcepts].some(concept => reasonConcepts.has(concept)) &&
    [...targetConceptSet].some(concept => reasonConcepts.has(concept));
  return uniqueConcreteReason ? [] : [`incompatible variant identity: source material/category [${[...sourceConcepts].join(', ')}] does not match target material/class [${[...targetConceptSet].join(', ')}]`];
}

function round3TargetRef(group, ref) {
  if (!ref) return '';
  if (ref.startsWith(`${group}/`)) return ref;
  if (group === 'crafts-tools-processes') {
    if (/^(materials_registry|craft_tools_gear|craft_processes|workshops)\//.test(ref)) return `${group}/${ref}`;
    if (/^mt_[a-z0-9_]+$/.test(ref)) return `${group}/materials_registry/materials.csv#${ref}`;
    if (/^tl_[a-z0-9_]+$/.test(ref)) return `${group}/craft_tools_gear/tools_gear.csv#${ref}`;
    if (ref.startsWith('pr:')) return `${group}/craft_processes/process_products.csv#${ref}`;
    if (ref.startsWith('n1230:material_item:')) return `${group}/materials_registry/material_entities.csv#${ref}`;
  }
  return ref;
}

function buildLedger(domain, deny, needsCheckRows = NEEDS_CHECK_ROWS) {
  const entities = makeExistingEntities(domain);
  const needsCheckById = new Map(needsCheckRows.map(row => [row.archive_id, row]));
  if (needsCheckById.size !== needsCheckRows.length) throw new Error('needs_check rows contain duplicate archive ids');
  const authoredIds = new Set(authoredRows.map(entry => entry[0].split(':').at(-1)));
  for (const id of needsCheckById.keys()) if (!authoredIds.has(id)) throw new Error(`needs_check.csv references unknown crafts archive id ${id}`);
  const newNames = new Map();
  const errors = [];
  const ledger = authoredRows.map((entry, index) => {
    const [archive_ref, archive_name, authoredType, authoredRef, basis, derivation, confidence, authoredPeriod, authoredRegion, source_action, authoredDisposition] = entry;
    const sourceResolution = sourceRowFor(entry);
    const source = sourceResolution.row || {};
    const archiveId = archive_ref.split(':').at(-1);
    const period = authoredPeriod || periodFromSource(source) || (source.base_item_id ? periodFromSource(archiveRowById(source.base_item_id) || {}) : '');
    const baseSource = source.base_item_id ? archiveRowById(source.base_item_id) : null;
    const region = authoredRegion || source.region_scope || source.region || baseSource?.region_scope || baseSource?.region || '';
    const queued = needsCheckById.get(archiveId);
    const mergeDecision = ROUND3_BY_ID.get(archiveId);
    const handoffTarget = craftsBicHandoffs.get(archiveId);
    const mergeRoute = mergeDecision?.decision === 'routed'
      ? { group: mergeDecision.target_group, ref: round3TargetRef(mergeDecision.target_group, mergeDecision.target_ref) || ROUTED_REFS.get(archiveId) || '' }
      : undefined;
    const routeTarget = D38_REJECTS.has(archiveId) || mergeDecision?.decision === 'reject' ? undefined
      : mergeDecision ? mergeRoute
        : ROUTED.get(archiveId) || (handoffTarget?.type === 'routed' ? { group: handoffTarget.group, ref: handoffTarget.ref } : undefined);
    const manualVariant = REVIEW_VARIANTS.get(archiveId);
    const manualDuplicate = REVIEW_DUPLICATES.get(archiveId);
    const reconciledType = mergeDecision?.decision === 'variant' || mergeDecision?.decision === 'ref' ? 'variant' : 'new';
    const record_type = mergeDecision ? reconciledType : routeTarget ? 'new' : manualVariant ? 'variant' : authoredType;
    const game_base_ref = mergeDecision
      ? record_type === 'variant' ? round3TargetRef(mergeDecision.target_group, mergeDecision.target_ref) : ''
      : routeTarget ? '' : manualVariant?.[0] || manualDuplicate?.[0] || authoredRef;
    const expectedDisposition = D38_REJECTS.has(archiveId) || manualDuplicate || mergeDecision?.decision === 'reject'
      ? 'rejected' : routeTarget ? 'routed' : mergeDecision ? 'include' : authoredDisposition;
    if (queued) {
      const proposalResult = `${record_type}/${expectedDisposition}`;
      const proposalTargetRef = record_type === 'variant' ? game_base_ref : routeTarget?.ref || entry[13] || '';
      const proposalTargetGroup = record_type === 'variant' ? 'crafts-tools-processes' : routeTarget?.group || entry[12] || '';
      const ownEntityRef = `crafts-tools-processes/materials_registry/material_entities.csv#n1230:material_item:${archiveId.toLowerCase()}`;
      const targetMatchesProposal = queued.current_target_group === proposalTargetGroup && queued.current_target_ref === proposalTargetRef;
      const targetIsImplicitOwnEntity = !proposalTargetGroup && !proposalTargetRef && record_type === 'new' && expectedDisposition === 'include'
        && ((queued.current_target_group === '' && queued.current_target_ref === '')
          || (queued.current_target_group === 'crafts-tools-processes' && ['', ownEntityRef].includes(queued.current_target_ref)));
      if (queued.current_result !== proposalResult || (!targetMatchesProposal && !targetIsImplicitOwnEntity)) {
        errors.push(`${archive_ref}: needs_check proposal metadata differs from authored decision (expected ${proposalResult}/${proposalTargetGroup}/${proposalTargetRef})`);
      }
      return {
        archive_ref, archive_name, record_type: 'needs_check', disposition: 'needs_check', game_base_ref: '',
        basis, derivation, confidence, period, region, source_action: 'needs_check',
        anachronism_result: 'needs_check', anachronism_reason: queued.reason_code,
        dedup_result: 'needs_check', dedup_reason: queued.note,
        metadata_note: `Needs-check queue: ${queued.reason_code}${queued.finding_ref ? ` (${queued.finding_ref})` : ''}; authored proposal retained in authoring/needs_check.csv.`,
        generation_policy: source.generation_policy || '', anachronism_risk: source.anachronism_risk || '',
        target_group: '', target_ref: '', status: 'needs_check',
      };
    }
    const resolvedBasis = basis;
    const generationPolicy = source.generation_policy || '';
    const anachronismRisk = source.anachronism_risk || '';
    const denyHits = denylistMatches(archive_name, deny);
    const blocked = denyHits.some(hit => ['deny', 'deny_as_local', 'restricted'].includes(hit.verdict));
    const anachronismResult = D38_REJECTS.has(archiveId) ? 'rejected' : denyHits.length ? (blocked ? 'rejected' : 'restricted') : 'passed';
    const existing = record_type === 'new' ? entities.filter(e => e.normalized === normalizeName(archive_name)) : [];
    const prior = record_type === 'new' ? newNames.get(normalizeName(archive_name)) : undefined;
    const semanticPrior = record_type === 'new' ? newNames.get(`semantic:${semanticRootSignature(archive_name)}`) : undefined;
    const keepReason = semanticKeepReasons[archiveId];
    if (record_type === 'new' && expectedDisposition === 'include') {
      if (!prior) newNames.set(normalizeName(archive_name), archive_ref);
      if (semanticRootSignature(archive_name) && !semanticPrior) newNames.set(`semantic:${semanticRootSignature(archive_name)}`, archive_ref);
    }
    const forcedSemanticReject = semanticDuplicates[archiveId];
    const actualDisposition = D38_REJECTS.has(archiveId) || manualDuplicate || mergeDecision?.decision === 'reject' || blocked
      ? 'rejected' : routeTarget ? 'routed' : existing.length || prior || (semanticPrior && !keepReason) || forcedSemanticReject ? 'rejected' : 'include';
    const targetExists = record_type !== 'variant' || variantTargetExists(game_base_ref, domain) || authoredRows.some(candidate => candidate[0].endsWith(`#${game_base_ref.split('#').at(-1)}`) && candidate[2] === 'new' && candidate[10] === 'include');
    const expectedBasis = basisFromEvidence(entry, source);
    if (!archive_ref || !archive_name || !['new', 'variant'].includes(record_type)) errors.push(`row ${index + 1}: missing archive identity or invalid record_type`);
    if (!['sourced', 'analogy', 'logical_necessity'].includes(resolvedBasis) || !basisMatches(entry, source)) errors.push(`${archive_ref}: basis ${resolvedBasis} conflicts with source evidence/confidence/action ${source.evidence_basis || '(missing)'}/${confidence}/${source_action}; expected ${expectedBasis || '(manual review)'}`);
    if (!['A', 'B', 'C', 'D'].includes(confidence)) errors.push(`${archive_ref}: invalid confidence ${confidence}`);
    if (!derivation) errors.push(`${archive_ref}: missing derivation/archive id`);
    errors.push(...sourceRowIssues(entry));
    if (period && !/^\d{4}–\d{4}$/.test(period)) errors.push(`${archive_ref}: invalid period ${period}`);
    if (expectedDisposition === 'include' && (!period || Number(period.slice(0, 4)) > 1230 || Number(period.slice(-4)) < 1230)) errors.push(`${archive_ref}: included entity period ${period || '(missing)'} does not include 1230`);
    if (expectedDisposition === 'include' && (generationPolicy === 'research_only' || (confidence === 'D' && /critical/i.test(anachronismRisk)))) errors.push(`${archive_ref}: D38 reject required for research_only/critical-risk entry`);
    if (record_type === 'variant' && !targetExists) errors.push(`${archive_ref}: unresolved variant target ${game_base_ref}`);
    if (record_type === 'variant' && expectedDisposition === 'include' && targetExists) {
      const reason = entry[11] || manualVariant?.[1] || '';
      for (const issue of variantIdentityIssues(source, game_base_ref, domain, mergeDecision?.reason || reason)) errors.push(`${archive_ref}: ${issue}`);
    }
    if (D38_REJECTS.has(archiveId) && expectedDisposition === 'rejected' && anachronismResult !== 'rejected') errors.push(`${archive_ref}: D38 rejection has anachronism_result ${anachronismResult}, expected rejected`);
    if (actualDisposition !== expectedDisposition) errors.push(`${archive_ref}: disposition ${expectedDisposition} but checks require ${actualDisposition}`);
    const familyKey = source.family_key || '';
    const familyMatches = semanticFamilyMatches(familyKey, entities);
    const explicitVariant = semanticVariants[archiveId];
    if (record_type === 'new' && expectedDisposition === 'include' && familyMatches.length && !keepReason) errors.push(`${archive_ref}: unresolved semantic family match ${familyMatches.map(e => e.ref).join('; ')}`);
    if (semanticPrior && !semanticDuplicates[archiveId] && !semanticKeepReasons[archiveId]) errors.push(`${archive_ref}: unresolved semantic-name collision with ${semanticPrior}`);

    const denyReason = denyHits.map(hit => `${hit.dlId} (${hit.verdict}): ${hit.reason}`).join('; ');
    const duplicateRefs = existing.map(e => e.ref);
    if (prior) duplicateRefs.push(`incoming:${prior}`);
    const dedupResult = manualDuplicate || forcedSemanticReject || semanticPrior ? 'semantic_duplicate' : record_type === 'variant' ? 'variant_target' : duplicateRefs.length ? 'duplicate' : 'unique';
    const semanticReason = mergeDecision?.reason || entry[11] || keepReason || (record_type === 'new'
      ? `Reviewed semantic roots [${semanticRootSignature(archive_name)}] and family_key [${familyKey || 'source has no family_key'}]; no object identity collapsed after ignoring state/size/container/use modifiers.`
      : '');
    const dedupReason = manualDuplicate ? manualDuplicate[1] : routeTarget ? (mergeDecision?.reason || ROUTED_REASONS.get(archiveId) || `Kind owner routed to ${routeTarget.group}.`) : record_type === 'variant'
      ? `${semanticReason ? `${semanticReason} ` : ''}Reuses existing crafts owner ${game_base_ref}.`
      : forcedSemanticReject || (semanticPrior && !semanticKeepReasons[archiveId]) ? semanticDuplicates[archiveId] || `Semantic roots match ${semanticPrior}.`
        : duplicateRefs.length ? `Normalized name matches ${duplicateRefs.join('; ')}. ${semanticReason}` : semanticReason || 'No normalized-name or semantic-root match in existing crafts entities or included new rows.';
    const categoryEvidence = CATEGORY_EVIDENCE_IDS.has(archiveId) || /category_form_material_process_or_context/u.test(String(source.evidence_basis || ''));
    const evidenceNote = confidence === 'A'
      ? categoryEvidence ? 'A: category-level evidence (category_form_material_process_or_context).' : 'A: direct evidence; linked sources may attest category/form/material/process rather than this exact specimen.'
      : confidence === 'B' ? 'B: reconstruction/category/context evidence; basis logical_necessity, not direct item attestation.'
        : `Confidence ${confidence}: analogue/hypothesis; basis analogy.`;
    const derivationNote = mergeDecision?.reason || manualVariant?.[1] || manualDuplicate?.[1] || D38_REJECTS.get(archiveId) || (routeTarget ? (ROUTED_REASONS.get(archiveId) || `Kind owner routed to ${routeTarget.group}.`) : '');
    return {
      archive_ref, archive_name, record_type, disposition: expectedDisposition, game_base_ref, basis: resolvedBasis,
      derivation: categoryEvidence && confidence === 'A' ? `category-level evidence (category_form_material_process_or_context): ${derivation}` : derivation,
      confidence, period, region, source_action,
      anachronism_result: anachronismResult,
      anachronism_reason: D38_REJECTS.get(archiveId) || denyReason || 'No denylist stem matched the archive name.',
      dedup_result: dedupResult, dedup_reason: dedupReason,
      metadata_note: [period && region ? '' : 'Archive source leaves period and/or region blank; values preserved without inference.', evidenceNote, derivationNote].filter(Boolean).join(' '),
      generation_policy: generationPolicy, anachronism_risk: anachronismRisk,
      target_group: routeTarget?.group || (mergeDecision?.decision === 'entity' ? mergeDecision.target_group : entry[12] || ''),
      target_ref: routeTarget?.ref || (mergeDecision?.decision === 'entity' ? round3TargetRef(mergeDecision.target_group, mergeDecision.target_ref) : entry[13] || ''),
      status: expectedDisposition === 'include' ? 'candidate' : expectedDisposition,
    };
  });

  const includedFamilies = new Map();
  for (const entry of authoredRows) {
    if (entry[2] !== 'new' || entry[10] !== 'include') continue;
    const id = entry[0].split(':').at(-1);
    if (needsCheckById.has(id)) continue;
    const source = sourceRowFor(entry).row || {};
    const family = semanticEnglishSignature(source.family_key || '');
    if (!family) continue;
    const prior = includedFamilies.get(family);
    if (prior && !semanticKeepReasons[id]) errors.push(`${entry[0]}: semantic family ${family} collides with ${prior}; explicit variant/reject/keep decision required`);
    else if (!prior) includedFamilies.set(family, entry[0]);
  }

  const included = ledger.filter(row => row.disposition === 'include');
  const includedNew = included.filter(row => row.record_type === 'new').length;
  const includedVariants = included.filter(row => row.record_type === 'variant').length;
  const rejected = ledger.filter(row => row.disposition === 'rejected');
  const routed = ledger.filter(row => row.disposition === 'routed');
  const needsCheck = ledger.filter(row => row.disposition === 'needs_check');
  const actionCounts = ledger.reduce((counts, row) => ((counts[row.source_action] = (counts[row.source_action] || 0) + 1), counts), {});
  return {
    ledger, errors,
    summary: {
      runtime_activation: false, status: 'candidate', action_counts: actionCounts,
      ledger_rows: ledger.length, included_new: includedNew, included_variants: includedVariants,
      rejected: rejected.length, routed: routed.length, needs_check: needsCheck.length,
    },
  };
}

function selfTest(domain, deny) {
  if (normalizeName('Ёжик—Костяной!') !== 'ежик костяной') throw new Error('archive name normalization probe failed');
  if (denylistMatches('Узкая меховая опушка', deny).length) throw new Error('archive denylist matched opushka as firearm');
  if (!denylistMatches('Железный капкан', deny).some(hit => hit.dlId === 'dl_steel_trap')) throw new Error('archive denylist missed steel trap');
  const entities = makeExistingEntities(domain);
  if (!entities.some(e => e.normalized === normalizeName('Костяной конёк'))) throw new Error('archive dedup probe target missing');
  if (variantTargetExists('crafts-tools-processes/materials_registry/materials.csv#missing', domain)) throw new Error('archive variant probe resolved missing target');
  if (sourceRowIssues(authoredRows[0]).length) throw new Error(`archive source snapshot probe failed: ${sourceRowIssues(authoredRows[0]).join('; ')}`);
  const bRow = authoredRows.find(row => row[6] === 'B');
  const bSource = sourceRowFor(bRow).row;
  if (!basisMatches(bRow, bSource) || basisFromEvidence(bRow, bSource) !== 'logical_necessity') throw new Error('B reconstruction basis must be logical_necessity');
  const badBasis = [...bRow]; badBasis[4] = 'sourced';
  if (basisMatches(badBasis, bSource)) throw new Error('negative basis probe accepted B reconstruction as sourced');
  if (!semanticVariants.OMI02112 || !semanticVariants.OMI00911 || !semanticKeepReasons.LTR0003) throw new Error('semantic dedup review decisions incomplete');
  if (craftsOwnerHandoffs.size !== 84) throw new Error(`clothing owner reconciliation incomplete: expected 84 missing crafts decisions, found ${craftsOwnerHandoffs.size}`);
  const bicTargetIds = `OMI00021 OMI00054 OMI00161 OMI00174 OMI00175 OMI00178 OMI00180 OMI00184 OMI00608 OMI01518 OMI01546 OMI01564 OMI01569 OMI01585 OMI01601 OMI01766 OMI01767 OMI02161 OMI02170 OMI02182 OMI02184 OMI02185 OMI02186 OMI02187 OMI02188 OMI02189 OMI02191 OMI02192 OMI02199 OMI02206 OMI02213 OMI02228 OMI02233 OMI02238 OMI02247 OMI02248 OMI02249 OMI02250 OMI02251 OMI02252 OMI02253 OMI02254 OMI02255 OMI02257 OMI02258 OMI02259 OMI02260 OMI02261 OMI02262 OMI02264 OMI02265 OMI02266 OMI02267 OMI02268 OMI02269 OMI02270 OMI02271 OMI02272 OMI02273 OMI02274 OMI02275 WRT0015 MUS0007 MUS0011 CON0017 CON0018 CON0039 CON0040 MSC0009 MSC0045 STA0003 STA0036 STA0052 STA0087 STA0089 STA0090 OMI00323 OMI00346 OMI00347 OMI00853 OMI01133 STA0021 STA0033 HNT0010 MSC0038`.split(/\s+/);
  if (bicTargetIds.length !== 85 || new Set(bicTargetIds).size !== 85) throw new Error('BIC→crafts expected-ID snapshot is not 85 unique IDs');
  const bicCovered = bicTargetIds.filter(id => craftsBicHandoffs.has(id) || authoredRows.some(row => row[0].split(':').at(-1) === id));
  if (bicCovered.length !== 85) throw new Error(`BIC→crafts owner reconciliation incomplete: ${bicCovered.length}/85`);
  for (const id of bicTargetIds) {
    const decision = craftsBicHandoffs.get(id);
    if (decision && (!decision.reason || (decision.type === 'variant' && !decision.ref) || (decision.type === 'routed' && !decision.group))) throw new Error(`BIC handoff lacks explicit stable decision: ${id}`);
  }
  const handoffEntities = [...craftsOwnerHandoffs].filter(([, decision]) => decision.type === 'entity').map(([id]) => id).sort();
  const expectedHandoffEntities = ['OMI00226', 'OMI00234', 'OMI00235', 'OMI00251', 'OMI00257', 'OMI00263', 'OMI00265', 'OMI00295', 'OMI00340', 'OMI00341'].sort();
  if (handoffEntities.join('|') !== expectedHandoffEntities.join('|')) throw new Error(`clothing owner entity decisions differ from reviewer-approved standalone set: ${handoffEntities.join(',')}`);
  for (const [id, decision] of craftsOwnerHandoffs) {
    const handoff = authoredRows.find(row => row[0].split(':').at(-1) === id);
    const authoredType = decision.type === 'entity' ? 'new' : 'variant';
    if (!handoff || handoff[2] !== authoredType || handoff[3] !== decision.ref || !decision.reason) throw new Error(`clothing owner handoff is not explicit authoring: ${id}`);
    if (decision.type === 'variant' && !decision.ref.includes('#')) throw new Error(`clothing variant has no stable target: ${id}`);
  }
  if (!semanticFamilyMatches('broken_bone_blank', entities).some(entity => entity.ref.endsWith('#mt_bone'))) throw new Error('semantic family negative probe missed existing bone owner');
  const checked = buildLedger(domain, deny);
  const byId = new Map(checked.ledger.map(row => [row.archive_ref.split(':').at(-1), row]));
  const militaryKit = byId.get('MIL0031');
  const militaryEntity = authoredRows.find(row => row[0].endsWith(':MIL0031'));
  const militaryQueue = NEEDS_CHECK_BY_ID.get('MIL0031');
  if (!militaryKit || militaryKit.record_type !== 'needs_check' || militaryKit.disposition !== 'needs_check' || militaryKit.status !== 'needs_check'
    || militaryQueue?.current_target_group !== 'crafts-tools-processes'
    || militaryQueue?.current_target_ref !== 'crafts-tools-processes/materials_registry/material_entities.csv#n1230:material_item:mil0031'
    || !militaryEntity?.[11]?.includes('tl_axe_household') || !militaryEntity?.[11]?.includes('tl_spade')) {
    throw new Error('MIL0031 queue must preserve its reviewed axe/spade entity proposal without activating it');
  }
  for (const [id, target] of [['CRF0068', 'crafts-tools-processes/materials_registry/materials.csv#mt_iron'], ['OMI00161', 'crafts-tools-processes/materials_registry/materials.csv#mt_beeswax']]) {
    const source = archiveRowById(id);
    if (!variantIdentityIssues(source, target, domain).length) throw new Error(`negative variant identity probe accepted ${id} -> ${target}`);
  }
  const fixture = { name_ru: 'Серебряный слиток', material: 'silver', category: 'precious_metal_stock' };
  if (!variantIdentityIssues(fixture, 'crafts-tools-processes/materials_registry/materials.csv#mt_iron', domain).length) throw new Error('fixture variant identity probe accepted silver -> mt_iron');
  if (!CATEGORY_EVIDENCE_IDS.size) throw new Error('category_evidence_ids.csv is required to calculate category-level evidence');
  const linkedAIds = new Set(authoredRows.filter(entry => entry[6] === 'A' && CATEGORY_EVIDENCE_IDS.has(entry[0].split(':').at(-1))
    && !NEEDS_CHECK_BY_ID.has(entry[0].split(':').at(-1))).map(entry => entry[0].split(':').at(-1)));
  for (const id of linkedAIds) {
    const row = byId.get(id);
    if (!row || !row.derivation.startsWith('category-level evidence (category_form_material_process_or_context):')) throw new Error(`source_item_links category evidence formula missing for ${id}`);
  }
  if (!CATEGORY_EVIDENCE_IDS.has('OMI00161') || (!linkedAIds.has('OMI00161') && !NEEDS_CHECK_BY_ID.has('OMI00161'))) throw new Error('source_item_links category evidence probe missing OMI00161');
  const proposalRef = id => NEEDS_CHECK_BY_ID.get(id)?.current_target_ref || byId.get(id)?.game_base_ref;
  if (proposalRef('OMI00349') !== 'crafts-tools-processes/materials_registry/materials.csv#mt_cordage') throw new Error('woolen-cord clothing route must preserve stable crafts cordage target');
  if (proposalRef('OMI00054') !== 'crafts-tools-processes/craft_tools_gear/tools_gear.csv#tl_axe_carpenter') throw new Error('BIC tool handoff must preserve stable carpenter-axe handle component target');
  for (const id of ['WTR0024', 'WTR0015', 'HRS0021', 'HNT0028', 'CRF0061']) {
    const queued = NEEDS_CHECK_BY_ID.get(id);
    if (queued ? queued.current_result !== 'new/rejected' : byId.get(id)?.disposition !== 'rejected') throw new Error(`D38 negative probe failed: ${id} rejection proposal is not preserved`);
    if (!queued && byId.get(id)?.anachronism_result !== 'rejected') throw new Error(`D38 result probe failed: ${id} is ${byId.get(id)?.anachronism_result}`);
  }
  for (const id of ['OMI00037', 'OMI00149']) {
    if (byId.get(id)?.disposition !== 'routed' || !byId.get(id)?.target_ref) throw new Error(`nature-owner route probe failed: ${id}`);
  }
  if (proposalRef('OMI02131') !== 'crafts-tools-processes/craft_processes/process_products.csv#pr:whole_carcass' || proposalRef('OMI02132') !== 'crafts-tools-processes/craft_processes/process_products.csv#pr:whole_carcass') throw new Error('whole-carcass variant proposal probe failed');
  const included = checked.ledger.filter(row => row.disposition === 'include' && row.record_type === 'new');
  for (const row of included) if (!row.period || Number(row.period.slice(0, 4)) > 1230 || Number(row.period.slice(-4)) < 1230) throw new Error(`period inheritance probe failed: ${row.archive_ref} ${row.period}`);
  for (const row of checked.ledger.filter(row => row.confidence === 'A' && row.disposition === 'include' && /category_form_material_process_or_context/u.test(row.derivation))) {
    if (!row.derivation.startsWith('category-level evidence (category_form_material_process_or_context):')) throw new Error(`A category evidence formula missing: ${row.archive_ref}`);
  }
}

function buildMaterialEntities(ledger) {
  const masterPath = path.join(MASTER_SOURCE_ROOT, 'data/normalized_source_tables/material_entities/material_entities.csv');
  const sources = readCsv(masterPath);
  const entities = [];
  const refsForEntity = new Map();
  for (const row of ledger) {
    if (row.disposition !== 'include') continue;
    const archiveId = row.archive_ref.split(':').at(-1);
    if (row.record_type === 'new') {
      const entry = authoredRows.find(candidate => candidate[0] === row.archive_ref);
      const source = entry ? sourceRowFor(entry).row : null;
      if (!source || !source.item_id) continue;
      const itemId = `n1230:material_item:${archiveId.toLowerCase()}`;
      const ref = row.archive_ref.includes('material_entities.csv:')
        ? `sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv:${archiveId}`
        : row.archive_ref;
      const derivation = row.confidence === 'A' && /category_form_material_process_or_context/u.test(row.derivation)
        ? `category-level evidence (category_form_material_process_or_context): ${source.evidence_basis || ''}`
        : source.evidence_basis || row.derivation;
      const entity = {
        ...source, item_id: itemId, record_origin: 'imp_crafts_archive_addition',
        basis: row.basis, derivation, source_refs: [ref], confidence: row.confidence, status: 'candidate',
      };
      if (archiveId === 'MIL0031') {
        entity.description_ru = `${source.description_ru} Состав: походный топор tl_axe_household и лопата tl_spade; это комплект имеющихся инструментов, а не новый тип каждого из них.`;
        entity.input_item_ids = ['tl_axe_household', 'tl_spade'];
      }
      entities.push(entity);
      refsForEntity.set(itemId, entity);
    } else if (row.record_type === 'variant') {
      const match = /material_entities\.csv#(n1230:material_item:[a-z0-9_]+)/.exec(row.game_base_ref || '');
      if (match) {
        const target = refsForEntity.get(match[1]);
        if (target) {
          target.source_refs = [...new Set([...(Array.isArray(target.source_refs) ? target.source_refs : JSON.parse(target.source_refs || '[]')), `sources/master-archive-v1/${row.derivation}`])];
          target.derivation = `${target.derivation}; archive variant ${archiveId}: ${row.dedup_reason || row.metadata_note}`;
        }
      }
    }
  }
  const sourceHeader = Object.keys(sources[0] || {});
  const header = [...sourceHeader, 'basis', 'derivation', 'source_refs', 'confidence', 'status'];
  return { entities: entities.map(row => ({ ...row, source_refs: JSON.stringify(row.source_refs) })), header };
}

module.exports = { LEDGER_HEADER, NEEDS_CHECK_HEADER, NEEDS_CHECK_ROWS, authoredRows, buildLedger, buildMaterialEntities, selfTest, normalizeName, semanticRootSignature, semanticEnglishSignature, isHuntingFishingCluster };
