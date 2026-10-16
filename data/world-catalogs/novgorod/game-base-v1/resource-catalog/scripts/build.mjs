import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsv, writeCsv, writeJson } from '../../nature-materials-weather/_shared/scripts/lib.mjs';
import { ACTIONS, ACTION_SKILLS, FAMILIES, FISH_SEASON_RULES, FREQUENCY_RULE, TENURE_DEFAULTS } from '../authoring/resource-data.mjs';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(DIR, '..');
const familyById = Object.fromEntries(FAMILIES.map((f) => [f.family_id, f]));
const actionsByFamily = ACTIONS.reduce((out, action) => {
  (out[action.family_id] ||= []).push(action);
  return out;
}, {});
const source = (relative) => readCsv(path.join(ROOT, relative));
const rows = {
  trees: source('flora-trees-shrubs/flora/trees_shrubs.csv'),
  berries: source('flora-herbs-berries-mushrooms/flora/berries_mushrooms.csv'),
  herbs: source('flora-herbs-berries-mushrooms/flora/herbs_mosses_aquatic.csv'),
  mammals: source('fauna-mammals-birds/fauna/mammals.csv'),
  birds: source('fauna-mammals-birds/fauna/birds.csv'),
  fish: source('fauna-fish-invertebrates-livestock/fauna/fish.csv'),
  invertebrates: source('fauna-fish-invertebrates-livestock/fauna/invertebrates_herps.csv'),
  materials: source('nature-materials-weather/natural_materials_soils/natural_materials.csv'),
};

const resourceFamilies = FAMILIES.map((f) => ({
  ...f,
  action_ids: (actionsByFamily[f.family_id] || []).map((a) => a.action_id),
}));

const bindings = [];
const unbound = [];
const RULE_DERIVATIONS = {
  life_form_tree_or_small_tree: 'life_form is tree or small_tree, so the standing woody organism belongs to F02',
  woody_use_codes_bark_bast_resin_dye_tanning: 'authored woody use code names bark, bast, resin, dye or tanning material, so the species supplies F03',
  woody_use_codes_rods_roots_browse_or_small_craftwood: 'authored woody use code names rods, roots, browse or small craft wood, so the species supplies F04',
  woody_use_code_sap: 'authored use_codes contains sap, so the species supplies F06',
  woody_use_code_food_fruit: 'authored use_codes contains food_fruit, so the species supplies F07',
  woody_use_code_nut_or_mast: 'authored use_codes contains food_nut or fodder_mast, so the species supplies F09',
  woody_use_code_kindling_or_tinder: 'authored use_codes contains fuel_kindling or tinder, so the species supplies F31',
  d39_collectible_woody_shrub_material: 'a shrub or dwarf shrub has physically collectible woody material even when no use code is authored',
  kind_berry: 'kind=berry makes the fruit a physically collectible F07 resource',
  tinder_fungus_moved_from_f08: 'Fomes fomentarius is the authored tinder fungus and therefore belongs to F31 rather than edible-mushroom F08',
  d39_ergot_sclerotia_gathered_from_cereal_ears: 'ergot sclerotia physically occur on cereal ears and can be gathered as F09',
  kind_fungus_without_tinder_fungus: 'kind=fungus makes the non-tinder fruiting body a collectible F08 resource',
  group_grass_sedge_horsetail_or_catalogued_bracken: 'grass, sedge, rush, horsetail and catalogued bracken have cuttable above-ground biomass in F13',
  group_moss_or_lichen: 'moss or lichen forms physically collectible ground cover in F05',
  group_forb: 'forb group has physically collectible herb biomass in F09',
  d39_collectible_fern_or_clubmoss: 'fern or clubmoss biomass is physically collectible in F09 even without a listed use',
  group_aquatic: 'aquatic plant group has cuttable aquatic biomass in F21',
  uses_bait: 'authored uses explicitly identifies the plant as bait, so it belongs to F20',
  uses_tinder_or_kindling: 'authored uses explicitly identifies tinder or kindling, so the plant belongs to F31',
  d39_all_mammals_are_physically_catchable_game: 'a present mammal is a physically catchable animal; usefulness is not an admission condition for F29',
  d40_mammalian_hair_cover_yields_pelt: 'class=Mammalia establishes a physically removable hair-bearing skin; this does not claim commercial fur value',
  product_antler: 'authored products contains antler, so the mammal supplies F32',
  d40_local_nesting_bird_lays_eggs: 'authored nesting plus local breeding/resident status (or explicit irregular winter nesting) establishes a local nest that can physically contain F10 eggs',
  d39_all_non_raptor_birds_are_physically_catchable_game: 'a present non-raptor bird is physically catchable game; listed usefulness is not required for F29',
  d39_all_birds_have_collectible_feathers: 'every bird physically bears feathers and therefore supplies F32',
  raptor_live_capture_deferred: 'raptor identity makes live capture physically meaningful, but F34 execution remains deferred',
  group_crustacean: 'crustacean group in the aquatic fauna table belongs to F19',
  fish_table_non_crustacean: 'a non-crustacean row in fish.csv is a fish resource in F18',
  group_mollusc: 'mollusc group is a physically collectible F19 resource',
  d40_group_physical_bait_possibility: 'the authored fauna group establishes physical F20 possibility; customary use and species-specific suitability are not asserted; structured size/stage remains owned by #178',
  wild_honeybee: 'authored uses records honey and wax from a wild honeybee colony, so it supplies F11',
  managed_honeybee: 'authored uses records honey and wax and permits the managed-colony F12 relation',
  d39_small_catchable_game: 'the authored amphibian, reptile or non-duplicate pest-rodent group is physically catchable F29 game; uses text is not a gate',
};
const TREE_USE_RULES = new Map([
  ['woody_use_codes_bark_bast_resin_dye_tanning', /bark|bast|resin|dye|tann/],
  ['woody_use_codes_rods_roots_browse_or_small_craftwood', /rod|pole|root|hoop|timber_craft|brooms_bedding|fodder_(leaf|browse)/],
  ['woody_use_code_sap', /^sap$/], ['woody_use_code_food_fruit', /^food_fruit$/],
  ['woody_use_code_nut_or_mast', /^(food_nut|fodder_mast)$/],
  ['woody_use_code_kindling_or_tinder', /^(fuel_kindling|tinder)$/],
]);
const unsupportedProperty = /не (?:подтвержден|засвидетельствован)|реконструк|аналог|провер|gap/i;
const parsedUses = (row) => { try { const value = JSON.parse(row.uses || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
const exactPropertyIsSourced = (table, row, ruleId) => {
  const matcher = table === 'trees_shrubs.csv' ? TREE_USE_RULES.get(ruleId) : null;
  if (matcher) return parsedUses(row).some((use) => matcher.test(use.use || '') && (use.refs || []).length && !unsupportedProperty.test(use.note || ''));
  if (ruleId === 'd40_group_physical_bait_possibility' && /наживка|bait/i.test(row.uses || ''))
    return /claim:static-bait-|\.uses(?:;|$)/.test(row.source_refs || '') && !unsupportedProperty.test(row.notes || '');
  return false;
};
const BAIT_TOO_SMALL_REASON = 'typical individual or represented mountable stage is below about 5 mm and is not collected as bait';
const BAIT_EXCLUSIONS = new Map([
  'fa_ins_head_louse', 'fa_ins_body_louse', 'fa_ins_fleas', 'fa_ins_bedbug', 'fa_ins_aphids',
  'fa_ins_biting_midges', 'fa_ins_mosquitoes', 'fa_ins_blackflies', 'fa_arach_ticks',
  'fa_ins_granary_weevil', 'fa_ins_bark_beetles',
].map((id) => [id, BAIT_TOO_SMALL_REASON]));
const BAIT_PROPERTY_GROUPS = new Set(['insect', 'arachnid', 'annelid', 'amphibian']);
const isBaitPhysicalCandidate = (row) => BAIT_PROPERTY_GROUPS.has(row.group) && !BAIT_EXCLUSIONS.has(row.fa_id);
const locallyNestingBird = (row) => Boolean(row.nesting) && (
  ['breeding', 'resident'].some((state) => [row.migration_spring, row.migration_summer].includes(state))
  || (row.migration_winter === 'irregular' && /гнездится.*зимой/i.test(row.nesting))
);
const relationDerivation = (row, ruleId) => {
  if (ruleId === 'd40_group_physical_bait_possibility') return `group=${row.group}; a separate individual or represented stage is physically possible as F20; customary or species-specific bait suitability is not asserted; structured size/stage remains owned by #178`;
  if (ruleId === 'd40_mammalian_hair_cover_yields_pelt') {
    if (row.fa_id === 'fa_m_hedgehog') return 'class=Mammalia establishes hair-bearing skin; for the hedgehog this is a spine-bearing skin, not a claim of valuable fur';
    return `class=${row.class}; ${row.winter_coat ? `winter_coat=${row.winter_coat}` : 'mammalian hair cover'}; removable skin is F30 without claiming an authored use`;
  }
  if (ruleId === 'd40_local_nesting_bird_lays_eggs') {
    if (row.fa_id === 'fa_b_cuckoo') return `nesting=${row.nesting}; eggs occur in host nests; local status spring=${row.migration_spring}, summer=${row.migration_summer}`;
    return `nesting=${row.nesting}; local status spring=${row.migration_spring}, summer=${row.migration_summer}, winter=${row.migration_winter}`;
  }
  return RULE_DERIVATIONS[ruleId] || '';
};
const bind = (table, row, speciesRef, sourceCategoryRef, familyId, ruleId) => bindings.push({
  source_table: table,
  species_ref: speciesRef,
  family_id: familyId,
  source_category_ref: sourceCategoryRef,
  category_ref: familyById[familyId].category_ref,
  rule_id: ruleId,
  basis: exactPropertyIsSourced(table, row, ruleId) ? 'sourced' : 'logical_necessity',
  derivation: relationDerivation(row, ruleId),
  status: 'candidate',
});
const track = (table, sourceRows, idKey, categoryKey, mapper, reason = () => 'no P1 resource-family rule for the row fields') => {
  for (const row of sourceRows) {
    const before = bindings.length;
    mapper(row, (familyId, ruleId) => bind(table, row, row[idKey], row[categoryKey] || '', familyId, ruleId));
    if (bindings.length === before) {
      const detail = reason(row);
      unbound.push({
        source_table: table,
        species_ref: row[idKey],
        name_ru: row.name_ru,
        exclusion_reason: typeof detail === 'object' ? detail.code : 'unmapped',
        reason: typeof detail === 'object' ? detail.note : detail,
      });
    }
  }
};

track('trees_shrubs.csv', rows.trees, 'fl_id', 'category_code', (r, add) => {
  if (['tree', 'small_tree'].includes(r.life_form)) add('F02', 'life_form_tree_or_small_tree');
  const codes = new Set(r.use_codes.split(';').filter(Boolean));
  if ([...codes].some((x) => /bark|bast|resin|dye|tann/.test(x))) add('F03', 'woody_use_codes_bark_bast_resin_dye_tanning');
  if ([...codes].some((x) => /rod|pole|root|hoop|timber_craft|brooms_bedding|fodder_(leaf|browse)/.test(x))) add('F04', 'woody_use_codes_rods_roots_browse_or_small_craftwood');
  if (codes.has('sap')) add('F06', 'woody_use_code_sap');
  if (codes.has('food_fruit')) add('F07', 'woody_use_code_food_fruit');
  if (codes.has('food_nut') || codes.has('fodder_mast')) add('F09', 'woody_use_code_nut_or_mast');
  if (codes.has('fuel_kindling') || codes.has('tinder')) add('F31', 'woody_use_code_kindling_or_tinder');
  if (!codes.size && ['shrub', 'dwarf_shrub'].includes(r.life_form)) add('F04', 'd39_collectible_woody_shrub_material');
}, (r) => `life_form=${r.life_form}; use_codes=${r.use_codes || 'empty'}: not a standing tree and no explicit P1 resource use`);
track('berries_mushrooms.csv', rows.berries, 'fl_id', 'category_ref', (r, add) => {
  if (r.kind === 'berry') add('F07', 'kind_berry');
  else if (r.fl_id === 'fl_fu_fomes_fomentarius') add('F31', 'tinder_fungus_moved_from_f08');
  else if (r.fl_id === 'fl_fu_claviceps_purpurea') add('F09', 'd39_ergot_sclerotia_gathered_from_cereal_ears');
  else if (r.kind === 'fungus') add('F08', 'kind_fungus_without_tinder_fungus');
}, (r) => `kind=${r.kind}: no P1 resource-family rule`);
track('herbs_mosses_aquatic.csv', rows.herbs, 'fl_id', 'category_ref', (r, add) => {
  if (['grass', 'sedge_rush', 'horsetail'].includes(r.group) || r.fl_id === 'fl_hb_pteridium_aquilinum') add('F13', 'group_grass_sedge_horsetail_or_catalogued_bracken');
  if (['moss', 'lichen'].includes(r.group)) add('F05', 'group_moss_or_lichen');
  if (r.group.startsWith('forb_')) add('F09', 'group_forb');
  if (['fern', 'clubmoss'].includes(r.group) && r.fl_id !== 'fl_hb_pteridium_aquilinum') add('F09', 'd39_collectible_fern_or_clubmoss');
  if (r.group.startsWith('aquatic_')) add('F21', 'group_aquatic');
  if (/наживка|bait/.test(r.uses)) add('F20', 'uses_bait');
  if (/трут|растоп|tinder/.test(r.uses)) add('F31', 'uses_tinder_or_kindling');
}, (r) => `group=${r.group}: catalog P1 assigns no resource family without an explicit uses rule`);
track('mammals.csv', rows.mammals, 'fa_id', 'category_ref', (r, add) => {
  const products = new Set(r.products.split(';').filter(Boolean));
  add('F29', 'd39_all_mammals_are_physically_catchable_game');
  add('F30', 'd40_mammalian_hair_cover_yields_pelt');
  if (products.has('antler')) add('F32', 'product_antler');
});
track('birds.csv', rows.birds, 'fa_id', 'category_ref', (r, add) => {
  if (r.group !== 'raptor') add('F29', 'd39_all_non_raptor_birds_are_physically_catchable_game');
  if (locallyNestingBird(r))
    add('F10', 'd40_local_nesting_bird_lays_eggs');
  add('F32', 'd39_all_birds_have_collectible_feathers');
  if (r.group === 'raptor') add('F34', 'raptor_live_capture_deferred');
});
track('fish.csv', rows.fish, 'fa_id', 'category_ref', (r, add) => {
  add(r.group === 'crustacean' ? 'F19' : 'F18', r.group === 'crustacean' ? 'group_crustacean' : 'fish_table_non_crustacean');
});
track('invertebrates_herps.csv', rows.invertebrates, 'fa_id', 'category_ref', (r, add) => {
  if (r.status === 'duplicate') return;
  if (r.group === 'mollusc') add('F19', 'group_mollusc');
  if (isBaitPhysicalCandidate(r)) add('F20', 'd40_group_physical_bait_possibility');
  if (/мёд, воск/.test(r.uses)) { add('F11', 'wild_honeybee'); add('F12', 'managed_honeybee'); }
  if (['amphibian', 'reptile', 'rodent_pest'].includes(r.group)) add('F29', 'd39_small_catchable_game');
}, (r) => r.status === 'duplicate'
  ? { code: 'duplicate', note: r.notes.match(/duplicate_of=([^;]+)/)?.[1] || 'duplicate target missing' }
  : BAIT_EXCLUSIONS.has(r.fa_id)
    ? { code: 'physically_impossible', note: BAIT_EXCLUSIONS.get(r.fa_id) }
  : `group=${r.group}; uses=${r.uses || 'empty'}: no extraction role in catalog P1`);

bindings.sort((a, b) => `${a.source_table}\0${a.species_ref}\0${a.family_id}`.localeCompare(`${b.source_table}\0${b.species_ref}\0${b.family_id}`, 'en'));
unbound.sort((a, b) => `${a.source_table}\0${a.species_ref}`.localeCompare(`${b.source_table}\0${b.species_ref}`, 'en'));

const materialFamily = (m) => {
  if (['nm_deadwood', 'nm_dry_brushwood', 'nm_driftwood'].includes(m.nm_id)) return 'F01';
  if (['nm_birch_bark', 'nm_lime_bast', 'nm_tree_bark', 'nm_pine_resin', 'nm_osmol_resinous_stumps'].includes(m.nm_id)) return 'F03';
  if (['nm_willow_rods', 'nm_spruce_roots', 'nm_spruce_boughs_poles'].includes(m.nm_id)) return 'F04';
  if (['nm_moss', 'nm_forest_litter'].includes(m.nm_id)) return 'F05';
  if (m.nm_id === 'nm_sedge_grass') return 'F13';
  if (['nm_water', 'nm_ice', 'nm_snow'].includes(m.nm_id)) return 'F17';
  if (m.nm_id === 'nm_bait') return 'F20';
  if (m.nm_id === 'nm_reeds') return 'F21';
  if (['nm_clay', 'nm_sand', 'nm_gravel_pebbles', 'nm_boulders_fieldstone', 'nm_peat', 'nm_river_silt', 'nm_turf'].includes(m.nm_id)) return 'F22';
  if (m.nm_id === 'nm_limestone_slab') return 'F23';
  if (m.nm_id === 'nm_bog_iron_ore') return 'F24';
  if (m.nm_id === 'nm_tinder_kindling') return 'F31';
  return '';
};
const materialBindings = rows.materials.map((m) => ({
  nm_ref: m.nm_id,
  family_id: materialFamily(m),
  category_ref: m.category_code,
  rule_id: 'exact_nm_id_crosswalk',
  status: materialFamily(m) ? 'candidate' : 'unbound',
}));

const monthList = (raw) => {
  const out = new Set();
  for (const token of String(raw || '').trim().split(/\s+/).filter(Boolean)) {
    const range = token.match(/^(\d{1,2})-(\d{1,2})$/);
    if (range) for (let m = Number(range[1]); m <= Number(range[2]); m++) out.add(m);
    else if (/^\d{1,2}$/.test(token)) out.add(Number(token));
  }
  return [...out].filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b);
};
const curve = (months) => Array.from({ length: 12 }, (_, i) => months.includes(i + 1) ? 1 : 0);
const patch = (species_ref, family_id, months, min, max, rate, rate_class, wave, source_ref) => ({
  species_ref, family_id, cycle_total_min_g: min, cycle_total_max_g: max,
  ripe_curve_by_month: curve(months), wave_period_days: wave,
  pick_rate_g_per_h: rate, rate_class, near_settlement_factor: 0.4,
  basis: 'editorial', source_ref,
});
const patchProfiles = [];
for (const r of rows.berries.filter((x) => x.kind === 'berry')) {
  const isStrawberry = r.fl_id === 'fl_br_fragaria_vesca';
  const months = monthList(r.ripening_months);
  if (r.fl_id === 'fl_br_oxycoccus_palustris') months.push(4, 5);
  patchProfiles.push(patch(r.fl_id, 'F07', [...new Set(months)].sort((a, b) => a - b), 2000, 6000,
    isStrawberry ? 300 : 800, isStrawberry ? 'small_berry' : 'bush_or_ground_berry', '', r.source_refs));
}
const highYieldWoodyFruit = new Set(['fl_ts_sorbus_aucuparia', 'fl_ts_prunus_padus', 'fl_ts_malus_sylvestris', 'fl_ts_viburnum_opulus']);
for (const r of rows.trees.filter((x) => x.use_codes.split(';').includes('food_fruit'))) {
  const months = monthList(r.fruit_months);
  // The source row for wild apple has no fruit_months. Keep the bound species and
  // make its August–October curve an explicit editorial value, like the quantities.
  const highYield = highYieldWoodyFruit.has(r.fl_id);
  patchProfiles.push(patch(r.fl_id, 'F07', months.length ? months : [8, 9, 10],
    highYield ? 10000 : 2000, highYield ? 30000 : 6000,
    highYield ? 3000 : 800, highYield ? 'woody_fruit' : 'bush_or_ground_berry', '', r.source_refs));
}
for (const r of rows.berries.filter((x) => x.kind === 'fungus' && !['fl_fu_fomes_fomentarius', 'fl_fu_claviceps_purpurea'].includes(x.fl_id)))
  patchProfiles.push(patch(r.fl_id, 'F08', monthList(r.ripening_months), 1000, 5000, 600, 'fungus', r.subkind === 'fungus_bracket' ? '' : 14, r.source_refs));
const availablePhenologyMonths = (row) => Object.entries(JSON.parse(row.phenology_by_month || '{}'))
  .filter(([, state]) => !['winter_form', 'not_visible', 'leafless'].includes(state))
  .map(([month]) => Number(month));
for (const r of rows.herbs.filter((x) => x.group.startsWith('forb_')))
  patchProfiles.push(patch(r.fl_id, 'F09', availablePhenologyMonths(r), 300, 1500, 300, 'herb', '', r.source_refs));
for (const r of rows.herbs.filter((x) => ['fern', 'clubmoss'].includes(x.group) && x.fl_id !== 'fl_hb_pteridium_aquilinum'))
  patchProfiles.push(patch(r.fl_id, 'F09', availablePhenologyMonths(r), 300, 1500, 300, 'herb', '', r.source_refs));
const ergot = rows.berries.find((x) => x.fl_id === 'fl_fu_claviceps_purpurea');
patchProfiles.push(patch(ergot.fl_id, 'F09', monthList(ergot.ripening_months), 50, 300, 100, 'ergot_sclerotia', '', ergot.source_refs));
for (const r of rows.trees.filter((x) => ['fl_ts_corylus_avellana', 'fl_ts_quercus_robur'].includes(x.fl_id))) {
  const isOak = r.fl_id === 'fl_ts_quercus_robur';
  patchProfiles.push(patch(r.fl_id, 'F09', monthList(r.fruit_months), isOak ? 10000 : 2000, isOak ? 30000 : 8000,
    isOak ? 4000 : 1000, isOak ? 'acorn' : 'hazelnut', '', r.source_refs));
}
patchProfiles.sort((a, b) => a.species_ref.localeCompare(b.species_ref, 'en'));

const counts = {
  resource_families: writeCsv(path.join(DIR, 'resource_families.csv'), resourceFamilies),
  species_resource_families: writeCsv(path.join(DIR, 'species_resource_families.csv'), bindings),
  material_resource_families: writeCsv(path.join(DIR, 'material_resource_families.csv'), materialBindings),
  extraction_actions: writeCsv(path.join(DIR, 'extraction_actions.csv'), ACTIONS),
  action_skill_map: writeCsv(path.join(DIR, 'action_skill_map.csv'), ACTION_SKILLS),
  patch_profiles: writeCsv(path.join(DIR, 'patch_profiles.csv'), patchProfiles),
  tenure_defaults: writeCsv(path.join(DIR, 'tenure_defaults.csv'), TENURE_DEFAULTS),
  fish_season_rules: writeCsv(path.join(DIR, 'fish_season_rules.csv'), FISH_SEASON_RULES),
  frequency_rule: 1,
};
writeJson(path.join(DIR, 'frequency_rule.json'), FREQUENCY_RULE);
const familySummary = resourceFamilies.map((f) => ({
  family_id: f.family_id,
  species_count: new Set(bindings.filter((b) => b.family_id === f.family_id).map((b) => b.species_ref)).size,
  action_count: (actionsByFamily[f.family_id] || []).length,
}));
writeJson(path.join(DIR, 'reports/species-unbound.json'), {
  schema: 'game_base_v1.resource_species_unbound.v2', status: 'candidate',
  source_rows: Object.values(rows).slice(0, 7).reduce((n, list) => n + list.length, 0),
  bound_unique_species: new Set(bindings.map((b) => `${b.source_table}:${b.species_ref}`)).size,
  unbound_count: unbound.length,
  typed_gaps: [{ property: 'bait_size_or_stage', owner: 'fauna property contract #178',
    need: 'structured size or separately collectible life stage for F20 derivation',
    affected_species: [...BAIT_EXCLUSIONS.keys()].sort() }],
  rows: unbound,
});
writeJson(path.join(DIR, 'reports/family-summary.json'), { status: 'candidate', rows: familySummary });
writeJson(path.join(DIR, 'reports/counts.json'), counts);
console.log(JSON.stringify({ ...counts, unbound_species: unbound.length }));
