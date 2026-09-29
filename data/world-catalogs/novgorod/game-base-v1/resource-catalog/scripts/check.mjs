import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsv, readJson, fail } from '../../nature-materials-weather/_shared/scripts/lib.mjs';
import { TOOL_KINDS } from '../authoring/resource-data.mjs';
import { GROUND_STATES, PRECIPITATION_KINDS } from '../../../../../../packages/contracts/src/weather-state.js';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(DIR, '..');
const errors = [];
const table = (name) => readCsv(path.join(DIR, name));
const families = table('resource_families.csv');
const species = table('species_resource_families.csv');
const materials = table('material_resource_families.csv');
const actions = table('extraction_actions.csv');
const skills = table('action_skill_map.csv');
const patches = table('patch_profiles.csv');
const tenure = table('tenure_defaults.csv');
const fishSeasons = table('fish_season_rules.csv');
const unbound = readJson(path.join(DIR, 'reports/species-unbound.json'));
const frequencyRule = readJson(path.join(DIR, 'frequency_rule.json'));
const startTerritoryFlag = process.argv.indexOf('--start-territory');
const startTerritoryPath = startTerritoryFlag >= 0 ? process.argv[startTerritoryFlag + 1] : '';

const ids = (rows, key, prefix, out = errors) => {
  const seen = new Set();
  for (const row of rows) {
    if (!row[key]) out.push(`${prefix}_ID_EMPTY`);
    else if (seen.has(row[key])) out.push(`${prefix}_ID_DUPLICATE:${row[key]}`);
    seen.add(row[key]);
  }
  return seen;
};
const familyIds = ids(families, 'family_id', 'FAMILY');
const actionIds = ids(actions, 'action_id', 'ACTION');
if (families.length !== 35) errors.push(`FAMILY_COUNT:${families.length}`);
if (actions.length < 50 || actions.length > 60) errors.push(`ACTION_COUNT:${actions.length}`);

const CLASSES = new Set(['A', 'B', 'C', 'none', 'constrained']);
const UNITS = new Set(['g', 'pcs', 'l']);
const RENEWALS = new Set(['none', 'by_year_season', 'by_season_wave', 'by_household_cycle']);
const NODE_MODES = new Set(['none', 'finite_node', 'household_stock_node', 'attempt_roll', 'constrained_policy', 'property_modifier']);
const TOOL_MODES = new Set(['required', 'bonus', 'container']);
const SETUP_MODES = new Set(['immediate', 'set_and_check']);
const DCS = new Set(['', 'dc_5', 'dc_10', 'dc_15', 'dc_20', 'dc_25', 'dc_30']);
const SKILLS = new Set(['athletics', 'stealth', 'melee_combat', 'ranged_combat', 'craft', 'household', 'survival', 'travel_transport', 'healing', 'observation', 'communication_trade', 'custom_law_literacy']);
const PURPOSES = new Set(['find', 'extract', 'identify', 'risk']);
const TENURES = new Set(['common', 'household', 'lord', 'church', 'rights_holder']);
const CHECK_MODES = new Set(['none', 'always', 'only_when_uncertain']);
const LIGHT_MODES = new Set(['none', 'required', 'bonus']);
const FAILURE_KINDS = new Set(['lost_time', 'tool_damage', 'injury', 'resource_damage', 'bait_loss', 'gear_loss', 'gear_damage', 'game_alerted', 'weapon_loss', 'misidentification']);
const EXCLUSION_REASONS = new Set(['anachronism', 'physically_impossible', 'duplicate']);
const BINDING_BASES = new Set(['sourced', 'logical_necessity', 'analogy']);
const split = (value) => value ? value.split('|').filter(Boolean) : [];
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
const shouldBindF20 = (row) => BAIT_PROPERTY_GROUPS.has(row.group) && !BAIT_EXCLUSIONS.has(row.fa_id) && row.status !== 'duplicate';

const validateFamily = (row, out) => {
  if (!CLASSES.has(row.class)) out.push(`FAMILY_CLASS_UNKNOWN:${row.family_id}:${row.class}`);
  if (!UNITS.has(row.unit)) out.push(`FAMILY_UNIT_UNKNOWN:${row.family_id}:${row.unit}`);
  if (!NODE_MODES.has(row.node_mode)) out.push(`FAMILY_NODE_MODE_UNKNOWN:${row.family_id}:${row.node_mode}`);
  const ordinaryMode = { A: 'none', B: 'finite_node', C: 'household_stock_node', none: 'attempt_roll', constrained: 'constrained_policy' }[row.class];
  if (!['F24', 'F25', 'F35'].includes(row.family_id) && ordinaryMode && row.node_mode !== ordinaryMode) out.push(`FAMILY_NODE_MODE_CLASS_MISMATCH:${row.family_id}`);
  if (['A', 'none'].includes(row.class) && row.renewal) out.push(`FAMILY_RENEWAL_FORBIDDEN:${row.family_id}`);
  if (['B', 'C'].includes(row.class) && row.node_mode !== 'property_modifier' && !RENEWALS.has(row.renewal)) out.push(`FAMILY_RENEWAL_UNKNOWN:${row.family_id}:${row.renewal}`);
  if (['F24', 'F25'].includes(row.family_id) && (row.class !== 'constrained' || row.renewal !== 'none' || row.node_mode !== 'constrained_policy' || row.policy_ref !== 'constrained-natural-resource-policy')) out.push(`FAMILY_CONSTRAINED_POLICY_INVALID:${row.family_id}`);
  if (row.family_id === 'F35' && (row.class !== 'C' || row.renewal || row.unit !== 'pcs' || row.node_mode !== 'property_modifier' || row.policy_ref !== '@rus/items-property')) out.push('FAMILY_F35_NOT_PROPERTY_MODIFIER');
  if (!row.category_ref) out.push(`FAMILY_CATEGORY_EMPTY:${row.family_id}`);
  for (const actionId of split(row.action_ids)) if (!actionIds.has(actionId)) out.push(`FAMILY_ACTION_UNKNOWN:${row.family_id}:${actionId}`);
};
for (const row of families) validateFamily(row, errors);

const sourceSpecs = [
  ['flora-trees-shrubs/flora/trees_shrubs.csv', 'trees_shrubs.csv', 'fl_id'],
  ['flora-herbs-berries-mushrooms/flora/berries_mushrooms.csv', 'berries_mushrooms.csv', 'fl_id'],
  ['flora-herbs-berries-mushrooms/flora/herbs_mosses_aquatic.csv', 'herbs_mosses_aquatic.csv', 'fl_id'],
  ['fauna-mammals-birds/fauna/mammals.csv', 'mammals.csv', 'fa_id'],
  ['fauna-mammals-birds/fauna/birds.csv', 'birds.csv', 'fa_id'],
  ['fauna-fish-invertebrates-livestock/fauna/fish.csv', 'fish.csv', 'fa_id'],
  ['fauna-fish-invertebrates-livestock/fauna/invertebrates_herps.csv', 'invertebrates_herps.csv', 'fa_id'],
];
const sourceSpecies = new Set();
const sourceRefsBySpecies = new Map();
const sourceRowsByRef = new Map();
for (const [file, name, key] of sourceSpecs)
  for (const row of readCsv(path.join(ROOT, file))) {
    sourceSpecies.add(`${name}:${row[key]}`);
    sourceRefsBySpecies.set(row[key], row.source_refs || '');
    sourceRowsByRef.set(`${name}:${row[key]}`, row);
  }
if (sourceSpecies.size !== 553) errors.push(`SOURCE_SPECIES_COUNT:${sourceSpecies.size}`);
const seenBindings = new Set();
const validateSpecies = (row, out) => {
  const key = `${row.source_table}:${row.species_ref}:${row.family_id}`;
  if (seenBindings.has(key)) out.push(`SPECIES_BINDING_DUPLICATE:${key}`);
  seenBindings.add(key);
  if (!sourceSpecies.has(`${row.source_table}:${row.species_ref}`)) out.push(`SPECIES_REF_UNKNOWN:${row.source_table}:${row.species_ref}`);
  if (!familyIds.has(row.family_id)) out.push(`SPECIES_FAMILY_UNKNOWN:${row.species_ref}:${row.family_id}`);
  const family = families.find((f) => f.family_id === row.family_id);
  if (family && row.category_ref !== family.category_ref) out.push(`SPECIES_CATEGORY_MISMATCH:${row.species_ref}:${row.family_id}`);
  if (!row.rule_id) out.push(`SPECIES_RULE_EMPTY:${row.species_ref}:${row.family_id}`);
  if (!BINDING_BASES.has(row.basis)) out.push(`SPECIES_BASIS_INVALID:${row.species_ref}:${row.family_id}:${row.basis || 'empty'}`);
  if (!row.derivation) out.push(`SPECIES_DERIVATION_EMPTY:${row.species_ref}:${row.family_id}`);
  const sourceRow = sourceRowsByRef.get(`${row.source_table}:${row.species_ref}`);
  if (sourceRow) {
    const expectedBasis = exactPropertyIsSourced(row.source_table, sourceRow, row.rule_id) ? 'sourced' : 'logical_necessity';
    if (row.basis !== expectedBasis) out.push(`SPECIES_BASIS_NOT_ROW_SUPPORTED:${row.species_ref}:${row.family_id}:${row.basis}:${expectedBasis}`);
  }
};
for (const row of species) validateSpecies(row, errors);
const covered = new Set(species.map((r) => `${r.source_table}:${r.species_ref}`));
const reportedUnbound = new Set(unbound.rows.map((r) => `${r.source_table}:${r.species_ref}`));
const validateUnboundRows = (rows, out) => {
  const seen = new Set();
  for (const row of rows) {
    const ref = `${row.source_table}:${row.species_ref}`;
    if (!sourceSpecies.has(ref)) out.push(`UNBOUND_REF_UNKNOWN:${ref}`);
    if (covered.has(ref)) out.push(`UNBOUND_ALSO_BOUND:${ref}`);
    if (seen.has(ref)) out.push(`UNBOUND_DUPLICATE:${ref}`);
    seen.add(ref);
    if (!row.reason) out.push(`UNBOUND_REASON_EMPTY:${ref}`);
    if (!EXCLUSION_REASONS.has(row.exclusion_reason)) out.push(`UNBOUND_REASON_INVALID:${ref}:${row.exclusion_reason || 'empty'}`);
  }
};
validateUnboundRows(unbound.rows, errors);
for (const ref of sourceSpecies) if (!covered.has(ref) && !reportedUnbound.has(ref)) errors.push(`SPECIES_MISSING_FROM_UNBOUND:${ref}`);
if (covered.size + reportedUnbound.size !== sourceSpecies.size) errors.push('SPECIES_COVERAGE_PARTITION');
const authoredDuplicates = new Set([...sourceRowsByRef]
  .filter(([, row]) => row.status === 'duplicate')
  .map(([ref]) => ref));
const authoredPhysicalExclusions = new Set([...BAIT_EXCLUSIONS.keys()].map((id) => `invertebrates_herps.csv:${id}`));
const authoredExclusions = new Set([...authoredDuplicates, ...authoredPhysicalExclusions]);
if (covered.size !== sourceSpecies.size - authoredExclusions.size || reportedUnbound.size !== authoredExclusions.size)
  errors.push(`SPECIES_COVERAGE_COUNTS:${covered.size}:${reportedUnbound.size}:${authoredExclusions.size}`);
for (const ref of authoredDuplicates) if (!reportedUnbound.has(ref)) errors.push(`AUTHORED_DUPLICATE_NOT_UNBOUND:${ref}`);
for (const ref of authoredPhysicalExclusions) if (!reportedUnbound.has(ref)) errors.push(`AUTHORED_PHYSICAL_EXCLUSION_NOT_UNBOUND:${ref}`);
for (const ref of reportedUnbound) if (!authoredExclusions.has(ref)) errors.push(`UNBOUND_NOT_AUTHORED_EXCLUSION:${ref}`);
for (const row of unbound.rows.filter((item) => item.exclusion_reason === 'physically_impossible')) {
  const expected = BAIT_EXCLUSIONS.get(row.species_ref);
  if (!expected || row.reason !== expected) errors.push(`PHYSICAL_EXCLUSION_REASON_MISMATCH:${row.species_ref}`);
}
const validateBaitTypedGap = (report, relationRows, out) => {
  const gap = Array.isArray(report.typed_gaps) ? report.typed_gaps.find((item) => item.property === 'bait_size_or_stage') : null;
  if (!gap || !/#178/.test(gap.owner || '') || !Array.isArray(gap.affected_species)) {
    out.push('BAIT_TYPED_GAP_MISSING');
    return;
  }
  const affected = new Set(gap.affected_species);
  const expected = new Set(BAIT_EXCLUSIONS.keys());
  if (affected.size !== expected.size || [...expected].some((id) => !affected.has(id))) out.push('BAIT_TYPED_GAP_SPECIES_MISMATCH');
  const boundF20 = new Set(relationRows
    .filter((row) => row.source_table === 'invertebrates_herps.csv' && row.family_id === 'F20')
    .map((row) => row.species_ref));
  for (const id of affected) if (boundF20.has(id)) out.push(`BAIT_TYPED_GAP_ALSO_BOUND:${id}`);
};
validateBaitTypedGap(unbound, species, errors);
const validateBaitBindingDerivations = (relationRows, out) => {
  for (const row of relationRows.filter((item) => item.source_table === 'invertebrates_herps.csv' && item.family_id === 'F20')) {
    if (/typed[_ -]?gap/i.test(row.derivation || '')) out.push(`BAIT_BOUND_DERIVATION_TYPED_GAP:${row.species_ref}`);
  }
};
validateBaitBindingDerivations(species, errors);

const latinBinomial = (value) => String(value || '').match(/\b([A-Z][a-z]+)\s+([a-z][a-z-]+)/)?.slice(1, 3).join(' ') || '';
const latinGenera = (value) => new Set([...String(value || '').matchAll(/\b([A-Z][a-z]+)(?=\s)/g)].map((m) => m[1]));
const duplicateTargetIds = (reason) => String(reason || '').split('+').map((ref) =>
  ref.match(/^fauna-mammals-birds\/fauna\/mammals\.csv#(fa_m_[a-z0-9_]+)$/)?.[1] || '');
const bindingFamilies = (tableName, speciesRef, rows = species) => new Set(rows
  .filter((row) => row.source_table === tableName && row.species_ref === speciesRef)
  .map((row) => row.family_id));
const locallyNestingBird = (row) => Boolean(row.nesting) && (
  ['breeding', 'resident'].some((state) => [row.migration_spring, row.migration_summer].includes(state))
  || (row.migration_winter === 'irregular' && /гнездится.*зимой/i.test(row.nesting))
);
const validateDuplicateSemantics = (rows, out) => {
  for (const row of rows.filter((item) => item.exclusion_reason === 'duplicate')) {
    const sourceRow = sourceRowsByRef.get(`${row.source_table}:${row.species_ref}`);
    const targetIds = duplicateTargetIds(row.reason);
    if (!targetIds.length || targetIds.some((id) => !id)) { out.push(`DUPLICATE_TARGET_REF_INVALID:${row.species_ref}`); continue; }
    const targets = targetIds.map((id) => sourceRowsByRef.get(`mammals.csv:${id}`));
    if (targets.some((target) => !target)) { out.push(`DUPLICATE_TARGET_UNKNOWN:${row.species_ref}`); continue; }
    if (targetIds.some((id) => !bindingFamilies('mammals.csv', id).has('F29'))) out.push(`DUPLICATE_TARGET_NOT_BOUND_F29:${row.species_ref}`);
    if (/spp\.|,/.test(sourceRow.name_lat)) {
      const sourceGenera = latinGenera(sourceRow.name_lat);
      const targetGenera = new Set(targets.flatMap((target) => [...latinGenera(target.name_lat)]));
      if ([...sourceGenera].some((genus) => !targetGenera.has(genus))) out.push(`DUPLICATE_TAXON_MISMATCH:${row.species_ref}`);
    } else if (!targets.some((target) => latinBinomial(target.name_lat) === latinBinomial(sourceRow.name_lat))) {
      out.push(`DUPLICATE_TAXON_MISMATCH:${row.species_ref}`);
    }
  }
};
validateDuplicateSemantics(unbound.rows, errors);

const validateTraitBindings = (rows, out) => {
  for (const [ref, sourceRow] of sourceRowsByRef) {
    const [tableName, speciesRef] = ref.split(':');
    const boundFamilies = bindingFamilies(tableName, speciesRef, rows);
    if (tableName === 'mammals.csv') {
      if (!boundFamilies.has('F29')) out.push(`TRAIT_MAMMAL_GAME_BINDING_MISSING:${ref}`);
      if (!boundFamilies.has('F30')) out.push(`TRAIT_MAMMAL_PELT_BINDING_MISSING:${ref}`);
    }
    if (tableName === 'birds.csv' && sourceRow.group === 'raptor') {
      if (boundFamilies.has('F29')) out.push(`TRAIT_RAPTOR_GAME_BOUND:${ref}`);
      if (!boundFamilies.has('F34')) out.push(`TRAIT_RAPTOR_CAPTURE_BINDING_MISSING:${ref}`);
    }
    if (tableName === 'birds.csv' && sourceRow.group !== 'raptor' && !boundFamilies.has('F29')) out.push(`TRAIT_NON_RAPTOR_GAME_BINDING_MISSING:${ref}`);
    if (tableName === 'birds.csv' && !boundFamilies.has('F32')) out.push(`TRAIT_BIRD_FEATHER_BINDING_MISSING:${ref}`);
    if (tableName === 'birds.csv') {
      const locallyNesting = locallyNestingBird(sourceRow);
      if (locallyNesting && !boundFamilies.has('F10')) out.push(`TRAIT_NESTING_BIRD_EGG_BINDING_MISSING:${ref}`);
      if (!locallyNesting && boundFamilies.has('F10')) out.push(`TRAIT_NON_NESTING_BIRD_EGG_BOUND:${ref}`);
    }
    if (tableName === 'invertebrates_herps.csv' && sourceRow.status !== 'duplicate') {
      if (shouldBindF20(sourceRow) && !boundFamilies.has('F20')) out.push(`TRAIT_PHYSICAL_BAIT_BINDING_MISSING:${ref}`);
      if (BAIT_EXCLUSIONS.has(sourceRow.fa_id) && boundFamilies.has('F20')) out.push(`TRAIT_PHYSICALLY_IMPOSSIBLE_BAIT_BOUND:${ref}`);
    }
    if (tableName === 'invertebrates_herps.csv' && sourceRow.status !== 'duplicate' && ['amphibian', 'reptile', 'rodent_pest'].includes(sourceRow.group) && !boundFamilies.has('F29')) out.push(`TRAIT_SMALL_GAME_BINDING_MISSING:${ref}`);
    if (sourceRow.status === 'duplicate' && boundFamilies.size) out.push(`TRAIT_DUPLICATE_BOUND:${ref}`);
  }
};
validateTraitBindings(species, errors);
if (!bindingFamilies('berries_mushrooms.csv', 'fl_fu_claviceps_purpurea').has('F09')) errors.push('ERGOT_F09_BINDING_MISSING');

const waterConditions = readCsv(path.join(ROOT, 'nature-materials-weather/weather_climate/ground_water_condition_rules.csv'))
  .filter((row) => row.target === 'water_condition')
  .map((row) => row.value);
const OWNER_STATES = new Set([
  ...GROUND_STATES.filter((value) => value !== 'unknown').map((value) => `ground_state:${value}`),
  ...PRECIPITATION_KINDS.filter((value) => value !== 'unknown').map((value) => `precipitation:${value}`),
  ...waterConditions.map((value) => `water_condition:${value}`),
]);

const validateAction = (row, out) => {
  if (!familyIds.has(row.family_id)) out.push(`ACTION_FAMILY_UNKNOWN:${row.action_id}:${row.family_id}`);
  if (!(Number(row.min_attempt_minutes) > 0)) out.push(`ACTION_MINUTES_NONPOSITIVE:${row.action_id}`);
  if (!TOOL_MODES.has(row.tool_mode)) out.push(`ACTION_TOOL_MODE_UNKNOWN:${row.action_id}:${row.tool_mode}`);
  if (!SETUP_MODES.has(row.setup_mode)) out.push(`ACTION_SETUP_MODE_UNKNOWN:${row.action_id}:${row.setup_mode}`);
  if (!LIGHT_MODES.has(row.light_mode)) out.push(`ACTION_LIGHT_MODE_UNKNOWN:${row.action_id}:${row.light_mode}`);
  if (!['true', 'false'].includes(row.needs_light)) out.push(`ACTION_NEEDS_LIGHT_INVALID:${row.action_id}`);
  if ((row.light_mode === 'required') !== (row.needs_light === 'true')) out.push(`ACTION_LIGHT_MODE_NEEDS_MISMATCH:${row.action_id}`);
  if (!DCS.has(row.dc_id) || !DCS.has(row.dc_without_tool)) out.push(`ACTION_DC_UNKNOWN:${row.action_id}`);
  if (!CHECK_MODES.has(row.check_mode)) out.push(`ACTION_CHECK_MODE_UNKNOWN:${row.action_id}:${row.check_mode}`);
  if ((!row.dc_id && row.check_mode !== 'none') || (row.dc_id && row.check_mode === 'none')) out.push(`ACTION_CHECK_MODE_DC_MISMATCH:${row.action_id}`);
  if ((row.dc_id && !row.band_effects) || (!row.dc_id && row.band_effects)) out.push(`ACTION_BAND_DC_MISMATCH:${row.action_id}`);
  for (const kind of split(row.failure_consequence_kinds)) if (!FAILURE_KINDS.has(kind)) out.push(`ACTION_FAILURE_KIND_UNKNOWN:${row.action_id}:${kind}`);
  for (const tool of split(row.tool_kinds)) if (!TOOL_KINDS.has(tool)) out.push(`ACTION_TOOL_UNKNOWN:${row.action_id}:${tool}`);
  for (const state of [...split(row.blocked_when), ...split(row.bonus_when), ...split(row.penalty_when)]) if (!OWNER_STATES.has(state)) out.push(`ACTION_OWNER_STATE_UNKNOWN:${row.action_id}:${state}`);
  for (const month of split(row.allowed_months)) if (!(Number(month) >= 1 && Number(month) <= 12)) out.push(`ACTION_MONTH_INVALID:${row.action_id}:${month}`);
  if (!['editorial', 'sourced'].includes(row.basis)) out.push(`ACTION_BASIS_UNKNOWN:${row.action_id}:${row.basis}`);
  if (row.action_id.startsWith('identify_') && (row.failure_consequence_kinds !== 'misidentification' || /injury/.test(row.band_effects))) out.push(`ACTION_IDENTIFY_OUTCOME_INVALID:${row.action_id}`);
  if (row.action_id.startsWith('search_') && (row.failure_consequence_kinds !== 'lost_time' || /injury/.test(row.band_effects))) out.push(`ACTION_SEARCH_OUTCOME_INVALID:${row.action_id}`);
};
for (const row of actions) validateAction(row, errors);
for (const familyId of ['F13', 'F17', 'F29', 'F31']) {
  if (!actions.some((row) => row.family_id === familyId && (row.blocked_when || row.bonus_when || row.penalty_when))) errors.push(`ACTION_MODIFIER_FAMILY_MISSING:${familyId}`);
}
const actionById = Object.fromEntries(actions.map((row) => [row.action_id, row]));
for (const actionId of ['gather_stone', 'gather_tinder']) if (actionById[actionId].dc_id || actionById[actionId].check_mode !== 'none') errors.push(`ACTION_SHOULD_NOT_ROLL:${actionId}`);
if (actionById.fell_tree.check_mode !== 'only_when_uncertain') errors.push('ACTION_FELL_TREE_CHECK_MODE');
if (actionById.draw_water.blocked_when) errors.push('ACTION_DRAW_WATER_ICE_BLOCK_FORBIDDEN');
if (actionById.fish_with_rod.needs_light !== 'false') errors.push('ACTION_FISH_ROD_LIGHT_FORBIDDEN');
for (const actionId of ['check_fishing_gear', 'check_crayfish_trap']) if (actionById[actionId].light_mode !== 'bonus' || actionById[actionId].needs_light !== 'false') errors.push(`ACTION_TRAP_LIGHT_NOT_BONUS:${actionId}`);
if (actionById.collect_mollusks.dc_id !== 'dc_10') errors.push('ACTION_MOLLUSK_DC');
for (const actionId of ['set_sap_collection', 'check_sap_collection']) if (actionById[actionId].allowed_months !== '3|4') errors.push(`ACTION_SAP_MONTHS:${actionId}`);
for (const actionId of ['strip_birch_bark', 'strip_lime_bast']) if (actionById[actionId].allowed_months !== '5|6') errors.push(`ACTION_BARK_MONTHS:${actionId}`);
for (const [actionId, token] of [['track_game', 'tracks'], ['stalk_game', 'game_found'], ['check_fishing_gear', 'catch_found'], ['check_crayfish_trap', 'crayfish_found'], ['check_hunting_trap', 'game_found']]) {
  if (!actionById[actionId].band_effects.includes(token) || /rate_x|quickly|time_x1_5/.test(actionById[actionId].band_effects)) errors.push(`ACTION_RESULT_BAND_INVALID:${actionId}`);
}

const validateSkill = (row, out) => {
  if (!actionIds.has(row.action_id)) out.push(`SKILL_ACTION_UNKNOWN:${row.action_id}`);
  if (!PURPOSES.has(row.check_purpose)) out.push(`SKILL_PURPOSE_UNKNOWN:${row.action_id}:${row.check_purpose}`);
  if (!SKILLS.has(row.skill_ref)) out.push(`SKILL_REF_UNKNOWN:${row.action_id}:${row.skill_ref}`);
  if (row.secondary_skill_ref && !SKILLS.has(row.secondary_skill_ref)) out.push(`SKILL_SECONDARY_UNKNOWN:${row.action_id}:${row.secondary_skill_ref}`);
  if (row.secondary_skill_ref && row.secondary_skill_ref === row.skill_ref) out.push(`SKILL_SECONDARY_DUPLICATES_PRIMARY:${row.action_id}`);
};
for (const row of skills) validateSkill(row, errors);
const validateSkillBijection = (rows, out) => {
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.action_id)) out.push(`SKILL_MAP_DUPLICATE:${row.action_id}`);
    seen.add(row.action_id);
  }
  for (const actionId of actionIds) if (!seen.has(actionId)) out.push(`SKILL_MAP_MISSING:${actionId}`);
  if (rows.length !== actions.length) out.push(`SKILL_MAP_COUNT:${rows.length}:${actions.length}`);
};
validateSkillBijection(skills, errors);
if (skills.find((row) => row.action_id === 'strike_game')?.secondary_skill_ref !== 'melee_combat') errors.push('SKILL_STRIKE_GAME_MELEE_SECONDARY');

const boundPairs = new Set(species.map((r) => `${r.species_ref}:${r.family_id}`));
const RATE_CLASSES = new Set(['small_berry', 'bush_or_ground_berry', 'woody_fruit', 'fungus', 'herb', 'ergot_sclerotia', 'acorn', 'hazelnut']);
const validatePatch = (row, out) => {
  if (!['F07', 'F08', 'F09'].includes(row.family_id)) out.push(`PATCH_FAMILY_UNKNOWN:${row.species_ref}:${row.family_id}`);
  if (!boundPairs.has(`${row.species_ref}:${row.family_id}`)) out.push(`PATCH_SPECIES_UNBOUND:${row.species_ref}:${row.family_id}`);
  const ripe = split(row.ripe_curve_by_month).map(Number);
  if (ripe.length !== 12 || ripe.some((n) => !Number.isFinite(n) || n < 0 || n > 1)) out.push(`PATCH_CURVE_INVALID:${row.species_ref}`);
  else if (!ripe.some((n) => n > 0)) out.push(`PATCH_CURVE_ALL_ZERO:${row.species_ref}`);
  if (!(Number(row.cycle_total_min_g) > 0) || Number(row.cycle_total_max_g) < Number(row.cycle_total_min_g)) out.push(`PATCH_TOTAL_INVALID:${row.species_ref}`);
  if (!(Number(row.pick_rate_g_per_h) > 0)) out.push(`PATCH_RATE_INVALID:${row.species_ref}`);
  if (!RATE_CLASSES.has(row.rate_class)) out.push(`PATCH_RATE_CLASS_INVALID:${row.species_ref}:${row.rate_class}`);
  if (!(Number(row.near_settlement_factor) >= 0.3 && Number(row.near_settlement_factor) <= 0.5)) out.push(`PATCH_NEAR_FACTOR_INVALID:${row.species_ref}`);
  if (row.basis !== 'editorial') out.push(`PATCH_BASIS_NOT_EDITORIAL:${row.species_ref}`);
  if (!row.source_ref) out.push(`PATCH_SOURCE_EMPTY:${row.species_ref}`);
  else if (sourceRefsBySpecies.get(row.species_ref) !== row.source_ref) out.push(`PATCH_SOURCE_MISMATCH:${row.species_ref}`);
  const sourceRow = [...sourceRowsByRef.entries()].find(([ref]) => ref.endsWith(`:${row.species_ref}`))?.[1];
  if (row.family_id === 'F08') {
    if (sourceRow?.subkind === 'fungus_bracket' && row.wave_period_days) out.push(`PATCH_BRACKET_WAVE_FORBIDDEN:${row.species_ref}`);
    if (sourceRow?.subkind !== 'fungus_bracket' && Number(row.wave_period_days) !== 14) out.push(`PATCH_WAVE_INVALID:${row.species_ref}`);
  }
  if (row.family_id === 'F09' && sourceRow?.phenology_by_month) {
    const states = JSON.parse(sourceRow.phenology_by_month);
    for (const [month, state] of Object.entries(states)) if (['winter_form', 'not_visible', 'leafless'].includes(state) && ripe[Number(month) - 1] !== 0) out.push(`PATCH_PHENOLOGY_EXCLUDED_MONTH_NONZERO:${row.species_ref}:${month}`);
  }
};
for (const row of patches) validatePatch(row, errors);
const validatePatchCoverage = (rows, out) => {
  const seen = new Set(rows.map((row) => `${row.species_ref}:${row.family_id}`));
  for (const pair of boundPairs) {
    const familyId = pair.slice(pair.lastIndexOf(':') + 1);
    if (['F07', 'F08', 'F09'].includes(familyId) && !seen.has(pair)) out.push(`PATCH_BINDING_MISSING:${pair}`);
  }
};
validatePatchCoverage(patches, errors);
const patchBySpecies = Object.fromEntries(patches.map((row) => [row.species_ref, row]));
if (patchBySpecies.fl_br_fragaria_vesca?.pick_rate_g_per_h !== '300') errors.push('PATCH_STRAWBERRY_RATE');
if (patchBySpecies.fl_br_oxycoccus_palustris && ![4, 5].every((month) => Number(split(patchBySpecies.fl_br_oxycoccus_palustris.ripe_curve_by_month)[month - 1]) > 0)) errors.push('PATCH_CRANBERRY_SPRING_MONTHS');
for (const speciesRef of ['fl_ts_sorbus_aucuparia', 'fl_ts_prunus_padus', 'fl_ts_malus_sylvestris', 'fl_ts_viburnum_opulus']) {
  const row = patchBySpecies[speciesRef];
  if (!row || row.cycle_total_min_g !== '10000' || row.cycle_total_max_g !== '30000' || row.pick_rate_g_per_h !== '3000') errors.push(`PATCH_HIGH_YIELD_WOODY_INVALID:${speciesRef}`);
}
const oakPatch = patchBySpecies.fl_ts_quercus_robur;
if (!oakPatch || oakPatch.cycle_total_min_g !== '10000' || oakPatch.cycle_total_max_g !== '30000' || Number(oakPatch.pick_rate_g_per_h) <= 3000) errors.push('PATCH_ACORN_RATE_NOT_ABOVE_3000');

const placeIds = new Set(readCsv(path.join(ROOT, 'places-binding/places/place_families.csv')).map((r) => r.pf_id));
const validateTenure = (row, out) => {
  if (!placeIds.has(row.place_family_ref)) out.push(`TENURE_PLACE_UNKNOWN:${row.place_family_ref}`);
  if (!familyIds.has(row.family_id)) out.push(`TENURE_FAMILY_UNKNOWN:${row.family_id}`);
  if (!TENURES.has(row.tenure)) out.push(`TENURE_KIND_UNKNOWN:${row.tenure}`);
  for (const month of split(row.closed_months)) if (!(Number(month) >= 1 && Number(month) <= 12)) out.push(`TENURE_MONTH_INVALID:${row.place_family_ref}:${month}`);
};
for (const row of tenure) validateTenure(row, errors);
const tenureKeys = new Set();
for (const row of tenure) {
  const key = `${row.place_family_ref}:${row.family_id}`;
  if (tenureKeys.has(key)) errors.push(`TENURE_DUPLICATE:${key}`);
  tenureKeys.add(key);
}
const tenureByKey = Object.fromEntries(tenure.map((row) => [`${row.place_family_ref}:${row.family_id}`, row]));
if (tenureByKey['pf_floodplain_meadow:F13']?.tenure !== 'common' || tenureByKey['pf_floodplain_meadow:F13']?.closed_months !== '1|2|3|4|5|6') errors.push('TENURE_F13_FLOODPLAIN_INVALID');
if (tenureByKey['pf_hay_meadow:F13']?.closed_months) errors.push('TENURE_F13_HAY_MEADOW_CLOSED_FORBIDDEN');
for (const placeRef of ['pf_broadleaf_woodland', 'pf_conifer_woodland', 'pf_mixed_woodland', 'pf_forest_edge', 'pf_bog']) if (tenureByKey[`${placeRef}:F29`]?.tenure !== 'common') errors.push(`TENURE_F29_COMMON_MISSING:${placeRef}`);

const naturalMaterialRows = readCsv(path.join(ROOT, 'nature-materials-weather/natural_materials_soils/natural_materials.csv'));
const nmIds = new Set(naturalMaterialRows.map((r) => r.nm_id));
const validateMaterial = (row, out) => {
  if (!nmIds.has(row.nm_ref)) out.push(`MATERIAL_REF_UNKNOWN:${row.nm_ref}`);
  if (row.family_id && !familyIds.has(row.family_id)) out.push(`MATERIAL_FAMILY_UNKNOWN:${row.nm_ref}:${row.family_id}`);
  if (!row.family_id || row.status !== 'candidate') out.push(`MATERIAL_UNBOUND:${row.nm_ref}`);
};
for (const row of materials) validateMaterial(row, errors);
const baitMaterial = naturalMaterialRows.find((row) => row.nm_id === 'nm_bait');
if (!baitMaterial || !/species refs.*resource-catalog F20/i.test(baitMaterial.note || '') || /authored|физич|тело|стади|uses=/i.test(baitMaterial.note || '')) errors.push('NM_BAIT_F20_RULE_STALE');

const calibration = frequencyRule;
const expectedFrequencyFamilies = ['F07', 'F08', 'F09', 'F18', 'F29'];
const expectedFrequencyExcluded = ['F10', 'F11', 'F32', 'F33'];
const validateFrequency = (row, out) => {
  if (!row || row.basis !== 'editorial') { out.push('FREQUENCY_CALIBRATION_MISSING'); return; }
  if (row.status !== 'candidate_owner_approval_required' || row.scope !== 'suitable_environment_only') out.push('FREQUENCY_STATUS_SCOPE_INVALID');
  if (Number(row.empty_probability_ppm) >= 50000) out.push(`FREQUENCY_EMPTY_NOT_LT_5_PERCENT:${row.empty_probability_ppm}`);
  if (Number(row.probability_ppm) + Number(row.empty_probability_ppm) !== 1000000) out.push('FREQUENCY_PPM_SUM');
  for (const familyId of row.family_ids || []) if (!familyIds.has(familyId)) out.push(`FREQUENCY_FAMILY_UNKNOWN:${familyId}`);
  if ([...(row.family_ids || [])].sort().join('|') !== [...expectedFrequencyFamilies].sort().join('|')) out.push('FREQUENCY_FAMILY_SET_INVALID');
  if ([...(row.excluded_until_patch_profiles || [])].sort().join('|') !== [...expectedFrequencyExcluded].sort().join('|')) out.push('FREQUENCY_EXCLUDED_SET_INVALID');
  if ((row.family_ids || []).some((familyId) => (row.excluded_until_patch_profiles || []).includes(familyId))) out.push('FREQUENCY_EXCLUDED_FAMILY_INCLUDED');
  const suitability = row.suitable_environment;
  if (!suitability || suitability.predicate !== 'at_least_one_bound_species_has_qualifying_habitat') out.push('FREQUENCY_SUITABILITY_PREDICATE_INVALID');
  if (suitability?.bindings_ref !== 'species_resource_families.csv') out.push('FREQUENCY_SUITABILITY_BINDINGS_INVALID');
  if ([...(suitability?.node_scope_fields || [])].sort().join('|') !== 'place_family_ref|water_body_template_ref' || suitability?.scope_ref_normalization !== 'optional_pf_prefix') out.push('FREQUENCY_SUITABILITY_SCOPE_INVALID');
  if ([...(suitability?.qualifying_frequency_classes || [])].sort().join('|') !== 'common|ubiquitous') out.push('FREQUENCY_SUITABILITY_CLASSES_INVALID');
  if (suitability?.generation_season_field !== 'season' || suitability?.season_match !== 'habitat_season_contains_generation_season' || suitability?.season_aliases?.spring_rasputitsa !== 'spring') out.push('FREQUENCY_SUITABILITY_SEASON_INVALID');
  if (suitability?.fallback_when !== 'no_qualifying_bound_species_for_node_scope') out.push('FREQUENCY_FALLBACK_CONDITION_INVALID');
  const habitatSources = suitability?.habitat_sources || [];
  if (habitatSources.length !== 5) out.push(`FREQUENCY_HABITAT_SOURCE_COUNT:${habitatSources.length}`);
  for (const source of habitatSources) {
    const sourcePath = path.resolve(DIR, source.ref || 'missing');
    if (!source.ref || !fs.existsSync(sourcePath)) { out.push(`FREQUENCY_HABITAT_REF_MISSING:${source.ref || 'empty'}`); continue; }
    const sourceRows = readCsv(sourcePath);
    if (!sourceRows.length || ![source.species_field, source.scope_field, source.season_field].every((field) => field && Object.hasOwn(sourceRows[0], field))) out.push(`FREQUENCY_HABITAT_FIELDS_INVALID:${source.ref}`);
    if (source.frequency_field !== 'embedded_scope_frequency_pairs' && (!source.frequency_field || !Object.hasOwn(sourceRows[0], source.frequency_field))) out.push(`FREQUENCY_HABITAT_FREQUENCY_FIELD_INVALID:${source.ref}`);
  }
  const fallbackRef = suitability?.fallback_rule_ref || '';
  const [fallbackFile, fallbackAnchor] = fallbackRef.split('#');
  const fallbackPath = fallbackFile ? path.resolve(DIR, fallbackFile) : '';
  if (!fallbackFile || !fs.existsSync(fallbackPath) || fallbackAnchor !== 'presence_ppm_from_frequency_class@v1') out.push('FREQUENCY_FALLBACK_REF_INVALID');
  else {
    const fallback = readJson(fallbackPath);
    if (fallback.rule_id !== 'presence_ppm_from_frequency_class' || fallback.rule_version !== 1) out.push('FREQUENCY_FALLBACK_TARGET_INVALID');
  }
  const rare = row.deferred_rare_family_ppm || {};
  if (Object.keys(rare).sort().join('|') !== 'F11|F32|F33') out.push('FREQUENCY_RARE_SET_INVALID');
  for (const [familyId, ppm] of Object.entries(rare)) if (!(Number(ppm) > 0 && Number(ppm) < 500000)) out.push(`FREQUENCY_RARE_PPM_INVALID:${familyId}`);
  if (!/encounter_roll_is_separate_by_place_day_day_phase/.test(row.family_semantics?.F29 || '')) out.push('FREQUENCY_F29_SEMANTICS_INVALID');
};
validateFrequency(calibration, errors);

const parseList = (value) => String(value || '').split(';').filter(Boolean);
const habitatRows = readCsv(path.join(ROOT, 'fauna-fish-invertebrates-livestock/fauna/fauna_presence.csv'));
const validateFaunaPresenceSeasons = (rows, out) => {
  for (const row of rows) {
    const sourceTable = `${row.taxon_table}.csv`;
    const sourceRow = sourceRowsByRef.get(`${sourceTable}:${row.fa_id}`);
    if (!sourceRow) { out.push(`FAUNA_HABITAT_SPECIES_UNKNOWN:${sourceTable}:${row.fa_id}`); continue; }
    const expected = row.taxon_table === 'fish'
      ? parseList(sourceRow.season_presence)
      : parseList(row.activity_state === 'active' ? sourceRow.active_seasons : sourceRow.dormant_seasons);
    if (row.activity_state !== 'hidden' && !expected.includes(row.season_period))
      out.push(`FAUNA_HABITAT_SEASON_MISMATCH:${sourceTable}:${row.fa_id}:${row.activity_state}:${row.season_period}`);
  }
};
validateFaunaPresenceSeasons(habitatRows, errors);
const validateDuplicatePresence = (rows, out) => {
  for (const ref of authoredDuplicates) {
    const [sourceTable, speciesRef] = ref.split(':');
    if (sourceTable === 'invertebrates_herps.csv' && rows.some((row) => row.taxon_table === 'invertebrates_herps' && row.fa_id === speciesRef))
      out.push(`DUPLICATE_HAS_HABITAT_PRESENCE:${speciesRef}`);
  }
};
validateDuplicatePresence(habitatRows, errors);

const faunaHabitatCoverage = (territory, rows = habitatRows) => {
  const placeRefs = new Set((territory.place_types || []).map((ref) => ref.replace(/^pf_/, '')));
  const territoryRegion = territory.region_id || territory._meta?.region_id || '';
  const territorySubregion = territory.subregion_scope || territory._meta?.subregion_scope || '';
  const geographicScopeEvaluated = Boolean(territoryRegion || territorySubregion);
  const relevant = [...new Set(species
    .filter((row) => ['fish.csv', 'invertebrates_herps.csv'].includes(row.source_table))
    .map((row) => `${row.source_table}:${row.species_ref}`))].sort();
  const uncovered = [];
  const onlyLowFrequency = [];
  let withAny = 0;
  let withQualifying = 0;
  for (const ref of relevant) {
    const [sourceTable, speciesRef] = ref.split(':');
    const taxonTable = sourceTable.replace(/\.csv$/, '');
    const allActive = rows.filter((row) => row.taxon_table === taxonTable && row.fa_id === speciesRef && row.activity_state === 'active');
    const scopedActive = allActive.filter((row) =>
      (!territoryRegion || row.region_id === territoryRegion)
      && (!territorySubregion || row.subregion_scope === territorySubregion));
    const startRows = scopedActive.filter((row) => placeRefs.has(row.pf_id));
    if (startRows.length) withAny += 1;
    const qualifying = startRows.filter((row) => ['common', 'ubiquitous'].includes(row.frequency_class));
    if (qualifying.length) withQualifying += 1;
    else if (startRows.length) onlyLowFrequency.push({ source_table: sourceTable, species_ref: speciesRef, frequencies: [...new Set(startRows.map((row) => row.frequency_class))].sort() });
    if (!startRows.length) {
      let reason = 'no_active_habitat_in_start_place_families';
      if (!allActive.length) reason = 'no_active_habitat_rows';
      else if (geographicScopeEvaluated && !scopedActive.length) reason = 'presence_only_outside_start_geographic_scope';
      uncovered.push({
        source_table: sourceTable,
        species_ref: speciesRef,
        reason,
        available_place_families: [...new Set(scopedActive.map((row) => `pf_${row.pf_id}`))].sort(),
      });
    }
  }
  return {
    evaluation_scope: geographicScopeEvaluated ? 'start_place_types_and_geographic_scope' : 'start_place_types_only',
    geographic_scope_evaluated: geographicScopeEvaluated,
    geographic_scope_note: geographicScopeEvaluated ? '' : 'territory input has no region_id or subregion_scope',
    relevant_species: relevant.length,
    with_compatible_start_place_type: withAny,
    with_qualifying_start_place_type: withQualifying,
    uncovered,
    only_low_frequency: onlyLowFrequency,
  };
};
let habitatCoverage = null;
if (startTerritoryFlag >= 0) {
  if (!startTerritoryPath) errors.push('START_TERRITORY_PATH_MISSING');
  else if (!fs.existsSync(startTerritoryPath)) errors.push(`START_TERRITORY_NOT_FOUND:${startTerritoryPath}`);
  else {
    const territory = readJson(startTerritoryPath);
    if (!Array.isArray(territory.place_types) || !territory.place_types.length) errors.push('START_TERRITORY_PLACE_TYPES_MISSING');
    else habitatCoverage = faunaHabitatCoverage(territory);
  }
}

const groups = readJson(path.join(ROOT, 'scripts/groups.src.json'));
const validateGroupRegistration = (rows, out) => {
  const resourceGroups = rows.filter((row) => row.id === 'resource-catalog');
  if (resourceGroups.length !== 1) out.push(`GROUP_REGISTRATION_COUNT:${resourceGroups.length}`);
};
validateGroupRegistration(Array.isArray(groups) ? groups : (groups.groups || []), errors);

const seasonIds = new Set(['winter', 'spring', 'summer', 'autumn']);
const evidence = readCsv(path.join(ROOT, 'nature-materials-weather/natural_materials_soils/sources/book_evidence_m2c_b3.csv'));
const evidenceRefs = new Set(evidence.map((r) => `book:${r.book_id} §${r.para_no}`));
const validateFishSeason = (row, out) => {
  if (row.family_id !== 'F18') out.push(`FISH_SEASON_FAMILY_UNKNOWN:${row.family_id}`);
  const allowed = split(row.allowed_seasons);
  const peaks = split(row.peak_seasons);
  for (const season of [...allowed, ...peaks]) if (!seasonIds.has(season)) out.push(`FISH_SEASON_UNKNOWN:${season}`);
  if (allowed.length !== 4 || ![...seasonIds].every((season) => allowed.includes(season))) out.push('FISH_ALLOWED_SEASONS_NOT_ALL');
  for (const peak of peaks) if (!allowed.includes(peak)) out.push(`FISH_PEAK_NOT_ALLOWED:${peak}`);
  if ([...new Set(peaks)].sort().join('|') !== 'autumn|spring|winter') out.push('FISH_PEAK_SEASONS_NOT_EXACT');
  if (!evidenceRefs.has(row.source_ref)) out.push(`FISH_SOURCE_NOT_IN_SNAPSHOT:${row.source_ref}`);
  if (row.basis !== 'sourced' || row.status !== 'candidate') out.push('FISH_SEASON_BASIS_STATUS');
};
const validateFishRows = (rows, out) => {
  for (const row of rows) validateFishSeason(row, out);
  if (rows.length !== 1) out.push(`FISH_SEASON_ROW_COUNT:${rows.length}`);
};
validateFishRows(fishSeasons, errors);

if (process.argv.includes('--self-test')) {
  const selfUnbound = { source_table: species[0].source_table, species_ref: species[0].species_ref, name_ru: 'self-test', exclusion_reason: 'physically_impossible', reason: 'self-test only' };
  const probes = [
    [() => { const out = []; validateFamily({ ...families[0], family_id: 'SELF_A', class: 'A', renewal: 'none' }, out); return out; }, 'FAMILY_RENEWAL_FORBIDDEN'],
    [() => { const out = []; validateAction({ ...actions[0], family_id: 'F99' }, out); return out; }, 'ACTION_FAMILY_UNKNOWN'],
    [() => { const out = []; validateAction({ ...actions[0], min_attempt_minutes: '0' }, out); return out; }, 'ACTION_MINUTES_NONPOSITIVE'],
    [() => { const out = []; validateAction({ ...actions[0], tool_mode: 'magic' }, out); return out; }, 'ACTION_TOOL_MODE_UNKNOWN'],
    [() => { const out = []; validateAction({ ...actions[0], blocked_when: 'weather:magic' }, out); return out; }, 'ACTION_OWNER_STATE_UNKNOWN'],
    [() => { const out = []; validateAction({ ...actions.find((row) => row.action_id === 'search_berry_patch'), failure_consequence_kinds: 'lost_time|injury' }, out); return out; }, 'ACTION_SEARCH_OUTCOME_INVALID'],
    [() => { const out = []; validateAction({ ...actions.find((row) => row.action_id === 'identify_herb'), failure_consequence_kinds: 'lost_time' }, out); return out; }, 'ACTION_IDENTIFY_OUTCOME_INVALID'],
    [() => { const out = []; validateAction({ ...actions[0], check_mode: 'always' }, out); return out; }, 'ACTION_CHECK_MODE_DC_MISMATCH'],
    [() => { const out = []; validateAction({ ...actions.find((row) => row.dc_id), failure_consequence_kinds: 'explosion' }, out); return out; }, 'ACTION_FAILURE_KIND_UNKNOWN'],
    [() => { const out = []; validateSpecies({ ...species[0], species_ref: 'fl_missing' }, out); return out; }, 'SPECIES_REF_UNKNOWN'],
    [() => { const out = []; validateSpecies({ ...species[0], basis: '' }, out); return out; }, 'SPECIES_BASIS_INVALID'],
    [() => { const out = []; validateSpecies({ ...species[0], derivation: '' }, out); return out; }, 'SPECIES_DERIVATION_EMPTY'],
    [() => { const out = []; validateUnboundRows([{ ...selfUnbound, species_ref: 'missing' }], out); return out; }, 'UNBOUND_REF_UNKNOWN'],
    [() => { const out = []; validateUnboundRows([selfUnbound, selfUnbound], out); return out; }, 'UNBOUND_DUPLICATE'],
    [() => { const out = []; validateUnboundRows([selfUnbound], out); return out; }, 'UNBOUND_ALSO_BOUND'],
    [() => { const out = []; validateUnboundRows([{ ...selfUnbound, exclusion_reason: 'not_useful' }], out); return out; }, 'UNBOUND_REASON_INVALID'],
    [() => { const out = []; validateDuplicateSemantics([{ source_table: 'invertebrates_herps.csv', species_ref: 'fa_mamm_house_mouse', exclusion_reason: 'duplicate', reason: 'bad-ref' }], out); return out; }, 'DUPLICATE_TARGET_REF_INVALID'],
    [() => { const out = []; validateDuplicateSemantics([{ source_table: 'invertebrates_herps.csv', species_ref: 'fa_mamm_house_mouse', exclusion_reason: 'duplicate', reason: 'fauna-mammals-birds/fauna/mammals.csv#fa_m_house_mouse+bad-ref' }], out); return out; }, 'DUPLICATE_TARGET_REF_INVALID'],
    [() => { const out = []; validateDuplicatePresence([{ taxon_table: 'invertebrates_herps', fa_id: 'fa_mamm_house_mouse' }], out); return out; }, 'DUPLICATE_HAS_HABITAT_PRESENCE'],
    [() => { const out = []; const [ref] = [...sourceRowsByRef].find(([key, row]) => key.startsWith('birds.csv:') && row.group === 'raptor'); const [source_table, species_ref] = ref.split(':'); validateTraitBindings([...species, { source_table, species_ref, family_id: 'F29' }], out); return out; }, 'TRAIT_RAPTOR_GAME_BOUND'],
    [() => { const out = []; const row = [...sourceRowsByRef.values()].find((item) => item.fa_id && locallyNestingBird(item)); validateTraitBindings(species.filter((item) => !(item.source_table === 'birds.csv' && item.species_ref === row.fa_id && item.family_id === 'F10')), out); return out; }, 'TRAIT_NESTING_BIRD_EGG_BINDING_MISSING'],
    [() => { const out = []; const row = [...sourceRowsByRef.values()].find((item) => item.fa_id && item.nesting && !locallyNestingBird(item)); validateTraitBindings([...species, { source_table: 'birds.csv', species_ref: row.fa_id, family_id: 'F10' }], out); return out; }, 'TRAIT_NON_NESTING_BIRD_EGG_BOUND'],
    [() => { const out = []; validateSpecies({ ...species.find((item) => item.species_ref === 'fl_ts_calluna_vulgaris' && item.family_id === 'F04'), basis: 'sourced' }, out); return out; }, 'SPECIES_BASIS_NOT_ROW_SUPPORTED'],
    [() => { const out = []; validateTraitBindings(species.filter((item) => !(item.source_table === 'invertebrates_herps.csv' && item.species_ref === 'fa_amph_common_frog' && item.family_id === 'F20')), out); return out; }, 'TRAIT_PHYSICAL_BAIT_BINDING_MISSING'],
    [() => { const out = []; validateTraitBindings(species.filter((item) => !(item.source_table === 'invertebrates_herps.csv' && item.species_ref === 'fa_ins_bumblebees' && item.family_id === 'F20')), out); return out; }, 'TRAIT_PHYSICAL_BAIT_BINDING_MISSING'],
    [() => { const out = []; validateTraitBindings([...species, { source_table: 'invertebrates_herps.csv', species_ref: 'fa_arach_ticks', family_id: 'F20' }], out); return out; }, 'TRAIT_PHYSICALLY_IMPOSSIBLE_BAIT_BOUND'],
    [() => { const out = []; validateBaitTypedGap({ typed_gaps: [{ property: 'bait_size_or_stage', owner: 'fauna property contract #178', affected_species: [...BAIT_EXCLUSIONS.keys(), 'fa_ins_bumblebees'] }] }, species, out); return out; }, 'BAIT_TYPED_GAP_ALSO_BOUND'],
    [() => { const out = []; validateBaitTypedGap({ typed_gaps: [{ property: 'bait_size_or_stage', owner: 'fauna property contract #178', affected_species: [...BAIT_EXCLUSIONS.keys()].slice(1) }] }, species, out); return out; }, 'BAIT_TYPED_GAP_SPECIES_MISMATCH'],
    [() => { const out = []; validateBaitBindingDerivations(species.map((item) => item.source_table === 'invertebrates_herps.csv' && item.family_id === 'F20' ? { ...item, derivation: `${item.derivation}; typed_gap:bait_size_or_stage` } : item), out); return out; }, 'BAIT_BOUND_DERIVATION_TYPED_GAP'],
    [() => { const out = []; validateTraitBindings(species.filter((item) => !(item.source_table === 'mammals.csv' && item.species_ref === 'fa_m_hedgehog' && item.family_id === 'F30')), out); return out; }, 'TRAIT_MAMMAL_PELT_BINDING_MISSING'],
    [() => { const out = []; validateTraitBindings(species.filter((item) => !(item.source_table === 'invertebrates_herps.csv' && item.species_ref === 'fa_amph_common_frog' && item.family_id === 'F29')), out); return out; }, 'TRAIT_SMALL_GAME_BINDING_MISSING'],
    [() => { const out = []; validateFaunaPresenceSeasons([{ ...habitatRows[0], season_period: 'not_a_season' }], out); return out; }, 'FAUNA_HABITAT_SEASON_MISMATCH'],
    [() => { const out = []; validateSkill({ ...skills[0], skill_ref: 'riding' }, out); return out; }, 'SKILL_REF_UNKNOWN'],
    [() => { const out = []; validateSkill({ ...skills[0], secondary_skill_ref: skills[0].skill_ref }, out); return out; }, 'SKILL_SECONDARY_DUPLICATES_PRIMARY'],
    [() => { const out = []; validateSkillBijection([skills[0], skills[0], ...skills.slice(1)], out); return out; }, 'SKILL_MAP_DUPLICATE'],
    [() => { const out = []; validatePatch({ ...patches[0], ripe_curve_by_month: Array(12).fill(0).join('|') }, out); return out; }, 'PATCH_CURVE_ALL_ZERO'],
    [() => { const out = []; validatePatch({ ...patches[0], source_ref: 'missing' }, out); return out; }, 'PATCH_SOURCE_MISMATCH'],
    [() => { const out = []; validatePatch({ ...patches[0], rate_class: 'generic' }, out); return out; }, 'PATCH_RATE_CLASS_INVALID'],
    [() => { const out = []; validatePatch({ ...patches[0], near_settlement_factor: '0.75' }, out); return out; }, 'PATCH_NEAR_FACTOR_INVALID'],
    [() => { const out = []; validatePatchCoverage(patches.slice(1), out); return out; }, 'PATCH_BINDING_MISSING'],
    [() => { const out = []; validateTenure({ ...tenure[0], place_family_ref: 'pf_missing' }, out); return out; }, 'TENURE_PLACE_UNKNOWN'],
    [() => { const out = []; validateTenure({ ...tenure[0], tenure: 'king' }, out); return out; }, 'TENURE_KIND_UNKNOWN'],
    [() => { const out = []; validateTenure({ ...tenure[0], closed_months: '13' }, out); return out; }, 'TENURE_MONTH_INVALID'],
    [() => { const out = []; validateMaterial({ ...materials[0], nm_ref: 'nm_missing' }, out); return out; }, 'MATERIAL_REF_UNKNOWN'],
    [() => { const out = []; validateFrequency({ ...calibration, empty_probability_ppm: 50000, probability_ppm: 950000 }, out); return out; }, 'FREQUENCY_EMPTY_NOT_LT_5_PERCENT'],
    [() => { const out = []; validateFrequency({ ...calibration, family_ids: ['F07', 'F08'] }, out); return out; }, 'FREQUENCY_FAMILY_SET_INVALID'],
    [() => { const out = []; validateFrequency({ ...calibration, suitable_environment: {} }, out); return out; }, 'FREQUENCY_SUITABILITY_PREDICATE_INVALID'],
    [() => { const out = []; validateFrequency({ ...calibration, suitable_environment: { ...calibration.suitable_environment, season_match: '' } }, out); return out; }, 'FREQUENCY_SUITABILITY_SEASON_INVALID'],
    [() => { const out = []; validateFrequency({ ...calibration, family_ids: [...calibration.family_ids, 'F11'] }, out); return out; }, 'FREQUENCY_EXCLUDED_FAMILY_INCLUDED'],
    [() => { const out = []; validateGroupRegistration([], out); return out; }, 'GROUP_REGISTRATION_COUNT'],
    [() => { const out = []; validateFishSeason({ ...fishSeasons[0], source_ref: 'book:1 §1' }, out); return out; }, 'FISH_SOURCE_NOT_IN_SNAPSHOT'],
    [() => { const out = []; validateFishSeason({ ...fishSeasons[0], peak_seasons: 'summer' }, out); return out; }, 'FISH_PEAK_SEASONS_NOT_EXACT'],
    [() => { const out = []; validateFishRows([fishSeasons[0], fishSeasons[0]], out); return out; }, 'FISH_SEASON_ROW_COUNT'],
    [() => { const out = []; validateFamily({ ...families.find((f) => f.family_id === 'F24'), policy_ref: '' }, out); return out; }, 'FAMILY_CONSTRAINED_POLICY_INVALID'],
    [() => { const out = []; validateFamily({ ...families.find((f) => f.family_id === 'F24'), class: 'B' }, out); return out; }, 'FAMILY_CONSTRAINED_POLICY_INVALID'],
    [() => { const out = []; validateFamily({ ...families[0], family_id: 'SELF_UNKNOWN', class: 'magic' }, out); return out; }, 'FAMILY_CLASS_UNKNOWN'],
    [() => { const out = []; validateFamily({ ...families.find((f) => f.family_id === 'F35'), class: 'none' }, out); return out; }, 'FAMILY_F35_NOT_PROPERTY_MODIFIER'],
  ];
  for (const [run, code] of probes) {
    const out = run() || [];
    if (!out.some((e) => e.startsWith(code))) errors.push(`SELF_TEST_MISSING_CODE:${code}`);
  }
  if (!errors.some((e) => e.startsWith('SELF_TEST_MISSING_CODE:'))) console.log(`negative probes PASS: ${probes.map(([, code]) => code).join(',')}`);
}

console.log(`checked: families ${families.length}, source species ${sourceSpecies.size}, bindings ${species.length}, bound unique ${covered.size}, unbound ${reportedUnbound.size}, actions ${actions.length}, skills ${skills.length}, patches ${patches.length}, tenure ${tenure.length}, fish seasons ${fishSeasons.length}, materials ${materials.length}`);
if (habitatCoverage) console.log(`fauna start-place-type habitat coverage: ${JSON.stringify(habitatCoverage)}`);
fail(errors, 'resource-catalog check');
