// Candidate authoring for resource architecture #171, part A.
// No row is an active runtime binding or an approval.

const family = (id, cls, unit, renewal = '', options = {}) => ({
  family_id: id,
  class: cls,
  unit,
  renewal,
  category_ref: `resource.family.${id.toLowerCase()}`,
  policy_ref: options.policy || '',
  node_mode: options.nodeMode || ({ A: 'none', B: 'finite_node', C: 'household_stock_node', none: 'attempt_roll', constrained: 'constrained_policy' })[cls],
});

export const FAMILIES = [
  family('F01', 'A', 'g'), family('F02', 'A', 'g'), family('F03', 'A', 'g'),
  family('F04', 'A', 'g'), family('F05', 'A', 'g'), family('F06', 'A', 'l'),
  family('F07', 'B', 'g', 'by_year_season'), family('F08', 'B', 'g', 'by_season_wave'),
  family('F09', 'B', 'g', 'by_year_season'), family('F10', 'B', 'pcs', 'by_year_season'),
  family('F11', 'B', 'g', 'by_year_season'), family('F12', 'C', 'g', 'by_household_cycle'),
  family('F13', 'A', 'g'), family('F14', 'C', 'g', 'by_household_cycle'),
  family('F15', 'C', 'g', 'by_household_cycle'), family('F16', 'C', 'g', 'by_household_cycle'),
  family('F17', 'A', 'l'), family('F18', 'none', 'g'), family('F19', 'none', 'pcs'),
  family('F20', 'A', 'pcs'), family('F21', 'A', 'g'), family('F22', 'A', 'g'),
  family('F23', 'A', 'g'),
  family('F24', 'constrained', 'g', 'none', { policy: 'constrained-natural-resource-policy' }),
  family('F25', 'constrained', 'l', 'none', { policy: 'constrained-natural-resource-policy' }),
  family('F26', 'C', 'g', 'by_household_cycle'), family('F27', 'C', 'g', 'by_household_cycle'),
  family('F28', 'C', 'g', 'by_household_cycle'), family('F29', 'none', 'pcs'),
  family('F30', 'none', 'pcs'), family('F31', 'A', 'g'),
  family('F32', 'B', 'pcs', 'by_year_season'), family('F33', 'B', 'g', 'none'),
  family('F34', 'none', 'pcs'),
  family('F35', 'C', 'pcs', '', { policy: '@rus/items-property', nodeMode: 'property_modifier' }),
];

const BANDS = {
  standard: 'clean_success:rate_x1_5|success:normal|success_with_cost:time_x1_5|failure_with_consequence:apply_failure_consequence_kinds|severe_failure:apply_failure_consequence_kinds',
  search: 'clean_success:found_quickly|success:found|success_with_cost:found_time_x1_5|failure_with_consequence:not_found_lost_time|severe_failure:not_found_lost_time',
  identify: 'clean_success:identified|success:identified|success_with_cost:identified_slowly|failure_with_consequence:misidentification|severe_failure:misidentification',
  track: 'clean_success:found_fresh_tracks|success:found_tracks|success_with_cost:found_uncertain_tracks|failure_with_consequence:not_found_lost_time|severe_failure:not_found_lost_time',
  stalk: 'clean_success:game_found_unalerted|success:game_found|success_with_cost:game_found_game_alerted|failure_with_consequence:game_not_found_lost_time|severe_failure:game_not_found_game_alerted_lost_time',
  fishingTrap: 'clean_success:catch_found_gear_intact|success:catch_found|success_with_cost:catch_found_gear_damage|failure_with_consequence:catch_not_found_apply_failure_consequence_kinds|severe_failure:catch_not_found_apply_failure_consequence_kinds',
  crayfishTrap: 'clean_success:crayfish_found_gear_intact|success:crayfish_found|success_with_cost:crayfish_found_gear_damage|failure_with_consequence:crayfish_not_found_apply_failure_consequence_kinds|severe_failure:crayfish_not_found_apply_failure_consequence_kinds',
  huntingTrap: 'clean_success:game_found_gear_intact|success:game_found|success_with_cost:game_found_gear_damage|failure_with_consequence:game_not_found_apply_failure_consequence_kinds|severe_failure:game_not_found_apply_failure_consequence_kinds',
};
const action = (action_id, family_id, min_attempt_minutes, rate, tool_mode, tool_kinds = [], options = {}) => {
  const light_mode = options.lightMode || (options.light ? 'required' : 'none');
  return ({
    action_id, family_id, min_attempt_minutes, rate_or_minutes_per_unit: rate,
    tool_mode, tool_kinds, setup_mode: options.setup || 'immediate',
    light_mode, needs_light: light_mode === 'required', dc_id: options.dc || '', dc_without_tool: options.dcWithout || '',
  check_mode: options.dc ? (options.checkMode || 'always') : 'none',
  band_effects: options.dc ? BANDS[options.band || 'standard'] : '',
  failure_consequence_kinds: options.fail || (options.dc ? 'lost_time' : ''),
  blocked_when: options.blocked || [], bonus_when: options.bonus || [], penalty_when: options.penalty || [],
  allowed_months: options.months || [],
  basis: options.basis || 'editorial',
  });
};

export const ACTIONS = [
  action('gather_wild_wood', 'F01', 20, '20 min/bundle', 'bonus', ['tool:axe']),
  action('fell_tree', 'F02', 120, '120 min/tree', 'required', ['tool:axe'], { dc: 'dc_15', dcWithout: 'dc_25', checkMode: 'only_when_uncertain', fail: 'lost_time|tool_damage|injury' }),
  action('strip_birch_bark', 'F03', 30, '30 min/sheet', 'bonus', ['tool:knife', 'tool:axe'], { months: [5, 6] }),
  action('strip_lime_bast', 'F03', 60, '60 min/bundle', 'bonus', ['tool:knife', 'tool:axe'], { months: [5, 6] }),
  action('strip_tree_bark', 'F03', 45, '45 min/bundle', 'bonus', ['tool:knife', 'tool:axe']),
  action('collect_pine_resin', 'F03', 30, '30 min/100 g', 'container', ['tool:knife', 'tool:container_bucket_or_vessel']),
  action('cut_osmol', 'F03', 60, '60 min/bundle', 'required', ['tool:axe']),
  action('gather_forest_plant_materials', 'F04', 30, '30 min/bundle', 'bonus', ['tool:knife', 'tool:axe']),
  action('gather_ground_cover', 'F05', 30, '30 min/sack', 'container', ['tool:hands', 'tool:container_basket_or_box']),
  action('set_sap_collection', 'F06', 30, '30 min/setup', 'required', ['tool:knife', 'tool:container_bucket_or_vessel'], { setup: 'set_and_check', months: [3, 4] }),
  action('check_sap_collection', 'F06', 10, '10 min/setup', 'container', ['tool:container_bucket_or_vessel'], { setup: 'set_and_check', months: [3, 4] }),
  action('search_berry_patch', 'F07', 20, '20 min/attempt', 'bonus', [], { light: true, dc: 'dc_10', band: 'search' }),
  action('pick_berries', 'F07', 10, 'profile g/h', 'container', ['tool:hands', 'tool:container_basket_or_box']),
  action('search_mushroom_patch', 'F08', 20, '20 min/attempt', 'bonus', [], { light: true, dc: 'dc_10', band: 'search' }),
  action('pick_mushrooms', 'F08', 10, 'profile g/h', 'container', ['tool:knife', 'tool:container_basket_or_box']),
  action('identify_mushroom', 'F08', 5, '5 min/batch', 'bonus', [], { light: true, dc: 'dc_15', band: 'identify', fail: 'misidentification' }),
  action('search_herbs_nuts', 'F09', 20, '20 min/attempt', 'bonus', [], { light: true, dc: 'dc_10', band: 'search' }),
  action('gather_herbs_nuts', 'F09', 10, 'profile g/h', 'container', ['tool:knife', 'tool:zastup_ironshod', 'tool:container_basket_or_box']),
  action('identify_herb', 'F09', 5, '5 min/batch', 'bonus', [], { light: true, dc: 'dc_15', band: 'identify', fail: 'misidentification' }),
  action('search_nest', 'F10', 30, '30 min/attempt', 'bonus', [], { light: true, dc: 'dc_15', band: 'search' }),
  action('collect_wild_eggs', 'F10', 15, '15 min/nest', 'container', ['tool:hands', 'tool:container_basket_or_box'], { dc: 'dc_10', fail: 'lost_time|injury|resource_damage' }),
  action('search_wild_hive', 'F11', 60, '60 min/attempt', 'bonus', [], { light: true, dc: 'dc_15', band: 'search' }),
  action('harvest_wild_honey', 'F11', 90, '90 min/hollow', 'container', ['tool:axe', 'tool:container_bucket_or_vessel'], { dc: 'dc_15', fail: 'lost_time|injury' }),
  action('inspect_bort', 'F12', 30, '30 min/bort', 'bonus', [], { light: true, dc: 'dc_10' }),
  action('harvest_bort', 'F12', 90, '90 min/bort', 'container', ['tool:axe', 'tool:container_bucket_or_vessel'], { dc: 'dc_15', fail: 'lost_time|injury|resource_damage' }),
  action('cut_grass', 'F13', 60, '60 min/load', 'bonus', ['tool:scythe', 'tool:sickle'], { blocked: ['water_condition:high_water'] }),
  action('harvest_field_crops', 'F14', 60, '60 min/load', 'bonus', ['tool:sickle']),
  action('pull_flax', 'F14', 60, '60 min/load', 'bonus', ['tool:hands']),
  action('gather_hay', 'F15', 30, '30 min/load', 'bonus', ['tool:hands']),
  action('gather_garden_crops', 'F16', 30, '30 min/load', 'container', ['tool:knife', 'tool:container_basket_or_box']),
  action('draw_water', 'F17', 5, '5 min/10 l', 'container', ['tool:container_bucket_or_vessel']),
  action('cut_ice', 'F17', 60, '60 min/block', 'required', ['tool:axe', 'tool:iron_pick_or_crowbar'], { dc: 'dc_10', fail: 'lost_time|tool_damage|injury', blocked: ['water_condition:open', 'water_condition:ice_forming', 'water_condition:ice_breaking'] }),
  action('gather_snow', 'F17', 10, '10 min/load', 'container', ['tool:hands', 'tool:container_bucket_or_vessel']),
  action('fish_with_rod', 'F18', 30, '30 min/attempt', 'required', ['fishing_rod', 'bait'], { dc: 'dc_10', dcWithout: 'dc_20', fail: 'lost_time|bait_loss|gear_loss' }),
  action('set_fishing_gear', 'F18', 30, '30 min/setup', 'required', ['net_or_trap'], { setup: 'set_and_check' }),
  action('check_fishing_gear', 'F18', 30, '30 min/setup', 'required', ['net_or_trap'], { setup: 'set_and_check', lightMode: 'bonus', dc: 'dc_10', band: 'fishingTrap', fail: 'lost_time|gear_damage|gear_loss' }),
  action('collect_mollusks', 'F19', 30, '30 min/batch', 'container', ['tool:hands', 'tool:container_basket_or_box'], { light: true, dc: 'dc_10' }),
  action('set_crayfish_trap', 'F19', 30, '30 min/setup', 'required', ['crayfish_trap', 'bait'], { setup: 'set_and_check' }),
  action('check_crayfish_trap', 'F19', 20, '20 min/setup', 'required', ['crayfish_trap'], { setup: 'set_and_check', lightMode: 'bonus', dc: 'dc_10', band: 'crayfishTrap', fail: 'lost_time|gear_loss' }),
  action('gather_bait', 'F20', 15, '15 min/batch', 'bonus', ['tool:hands', 'tool:zastup_ironshod']),
  action('cut_reeds_and_aquatic_plants', 'F21', 30, '30 min/bundle', 'bonus', ['tool:sickle', 'tool:knife']),
  action('dig_ground_material', 'F22', 30, '30 min/load', 'container', ['tool:zastup_ironshod', 'tool:container_basket_or_box']),
  action('gather_stone', 'F22', 20, '20 min/load', 'bonus', ['tool:hands', 'tool:lever_pole']),
  action('cut_turf', 'F22', 30, '30 min/load', 'required', ['tool:zastup_ironshod']),
  action('quarry_limestone', 'F23', 120, '120 min/load', 'required', ['tool:iron_pick_or_crowbar', 'tool:wedges_and_hammer'], { dc: 'dc_15', dcWithout: 'dc_25', fail: 'lost_time|tool_damage|injury' }),
  action('milk_livestock', 'F26', 20, '20 min/head', 'container', ['tool:container_bucket_or_vessel']),
  action('collect_domestic_eggs', 'F26', 10, '10 min/batch', 'container', ['tool:container_basket_or_box']),
  action('shear_wool', 'F26', 60, '60 min/head', 'required', ['shears'], { dc: 'dc_10', fail: 'lost_time|injury|resource_damage' }),
  action('collect_horsehair', 'F26', 20, '20 min/batch', 'bonus', ['tool:knife']),
  action('withdraw_household_stock', 'F28', 10, '10 min/load', 'container', ['tool:container_basket_or_box']),
  action('collect_household_byproducts', 'F28', 20, '20 min/load', 'container', ['tool:container_basket_or_box']),
  action('gather_tinder', 'F31', 10, '10 min/batch', 'bonus', ['tool:hands', 'tool:knife'], { penalty: ['precipitation:rain'] }),
  action('track_game', 'F29', 60, '60 min/attempt', 'bonus', [], { light: true, dc: 'dc_15', band: 'track', fail: 'lost_time', bonus: ['ground_state:snow'] }),
  action('stalk_game', 'F29', 30, '30 min/attempt', 'bonus', [], { light: true, dc: 'dc_15', band: 'stalk', fail: 'lost_time|game_alerted' }),
  action('strike_game', 'F29', 5, '5 min/attempt', 'required', ['hunting_weapon'], { light: true, dc: 'dc_15', fail: 'lost_time|weapon_loss|injury' }),
  action('set_hunting_trap', 'F29', 30, '30 min/setup', 'required', ['hunting_trap'], { setup: 'set_and_check' }),
  action('check_hunting_trap', 'F29', 30, '30 min/setup', 'required', ['hunting_trap'], { setup: 'set_and_check', light: true, dc: 'dc_15', band: 'huntingTrap', fail: 'lost_time|gear_loss|injury' }),
];

const skill = (action_id, check_purpose, skill_ref, secondary_skill_ref = '') => ({
  action_id, check_purpose, skill_ref, secondary_skill_ref, attribute_ref: '',
});

const PRIMARY = {
  observation: new Set(['search_berry_patch', 'search_mushroom_patch', 'search_herbs_nuts', 'search_nest', 'search_wild_hive', 'inspect_bort']),
  survival: new Set(['identify_mushroom', 'fish_with_rod', 'check_fishing_gear', 'collect_mollusks', 'check_crayfish_trap', 'gather_bait', 'track_game']),
  healing: new Set(['identify_herb']),
  athletics: new Set(['collect_wild_eggs', 'harvest_wild_honey', 'harvest_bort', 'cut_ice']),
  craft: new Set(['set_fishing_gear', 'set_crayfish_trap', 'set_hunting_trap', 'check_hunting_trap', 'quarry_limestone']),
  stealth: new Set(['stalk_game']),
  ranged_combat: new Set(['strike_game']),
};
const purpose = (id) => id.startsWith('search_') || id === 'track_game' ? 'find'
  : id.startsWith('identify_') ? 'identify'
    : ['fell_tree', 'collect_wild_eggs', 'harvest_wild_honey', 'harvest_bort', 'cut_ice', 'quarry_limestone', 'stalk_game', 'strike_game', 'check_hunting_trap'].includes(id) ? 'risk' : 'extract';
const primarySkill = (id) => Object.entries(PRIMARY).find(([, ids]) => ids.has(id))?.[0] || 'household';

export const ACTION_SKILLS = ACTIONS.map((a) => skill(
  a.action_id,
  purpose(a.action_id),
  primarySkill(a.action_id),
  a.action_id === 'fell_tree' ? 'athletics'
    : ['fish_with_rod', 'check_fishing_gear'].includes(a.action_id) ? 'craft'
      : ['harvest_wild_honey', 'harvest_bort'].includes(a.action_id) ? 'household'
        : a.action_id === 'strike_game' ? 'melee_combat' : '',
));

export const TENURE_DEFAULTS = [
  ...['pf_broadleaf_woodland', 'pf_conifer_woodland', 'pf_mixed_woodland', 'pf_forest_edge'].flatMap((place) =>
    ['F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08', 'F09', 'F10', 'F11', 'F20', 'F31'].map((f) => [place, f, 'common', ''])),
  ...['pf_bog', 'pf_marshy_stream', 'pf_floodplain_meadow', 'pf_riverbank'].flatMap((place) =>
    ['F07', 'F08', 'F09'].map((f) => [place, f, 'common', ''])),
  ['pf_broadleaf_woodland', 'F12', 'rights_holder', ''],
  ['pf_mixed_woodland', 'F12', 'rights_holder', ''],
  ['pf_floodplain_meadow', 'F13', 'common', '1|2|3|4|5|6'],
  ['pf_hay_meadow', 'F13', 'household', ''],
  ['pf_hay_meadow', 'F15', 'household', ''],
  ['pf_arable_field', 'F14', 'household', ''],
  ['pf_orchard_garden', 'F16', 'household', ''],
  ['pf_peasant_homestead', 'F16', 'household', ''],
  ['pf_peasant_homestead', 'F28', 'household', ''],
  ['pf_outbuildings', 'F28', 'household', ''],
  ['pf_monastery_yard', 'F12', 'church', ''],
  ['pf_monastery_yard', 'F14', 'church', ''],
  ['pf_monastery_yard', 'F15', 'church', ''],
  ['pf_monastery_yard', 'F16', 'church', ''],
  ['pf_monastery_yard', 'F26', 'church', ''],
  ['pf_monastery_yard', 'F28', 'church', ''],
  ['pf_hunting_ground', 'F29', 'rights_holder', ''],
  ['pf_hunting_ground', 'F30', 'rights_holder', ''],
  ['pf_broadleaf_woodland', 'F29', 'common', ''],
  ['pf_conifer_woodland', 'F29', 'common', ''],
  ['pf_mixed_woodland', 'F29', 'common', ''],
  ['pf_forest_edge', 'F29', 'common', ''],
  ['pf_bog', 'F29', 'common', ''],
  ['pf_fishing_camp', 'F18', 'rights_holder', ''],
  ['pf_fishing_camp', 'F19', 'rights_holder', ''],
  ['pf_river_channel', 'F18', 'common', ''],
  ['pf_riverbank', 'F18', 'common', ''],
  ['pf_lake_shore', 'F18', 'common', ''],
  ['pf_riverbank', 'F20', 'common', ''],
  ['pf_floodplain_meadow', 'F20', 'common', ''],
  ['pf_riverbank', 'F21', 'common', ''],
  ['pf_marshy_stream', 'F21', 'common', ''],
].map(([place_family_ref, family_id, tenure, closed_months]) => ({ place_family_ref, family_id, tenure, closed_months }));

export const TOOL_KINDS = new Set([
  'tool:hands', 'tool:axe', 'tool:knife', 'tool:sickle', 'tool:scythe', 'tool:zastup_ironshod',
  'tool:lever_pole', 'tool:wedges_and_hammer', 'tool:iron_pick_or_crowbar',
  'tool:container_basket_or_box', 'tool:container_bucket_or_vessel',
  'fishing_rod', 'bait', 'net_or_trap', 'crayfish_trap', 'shears', 'hunting_weapon', 'hunting_trap',
]);

export const FREQUENCY_RULE = {
  rule_id: 'resource_family_suitable_environment_v1',
  status: 'candidate_owner_approval_required',
  family_ids: ['F07', 'F08', 'F09', 'F18', 'F29'],
  scope: 'suitable_environment_only',
  suitable_environment: {
    predicate: 'at_least_one_bound_species_has_qualifying_habitat',
    bindings_ref: 'species_resource_families.csv',
    node_scope_fields: ['place_family_ref', 'water_body_template_ref'],
    scope_ref_normalization: 'optional_pf_prefix',
    habitat_sources: [
      { ref: '../flora-herbs-berries-mushrooms/flora/flora_habitat_presence.csv', species_field: 'fl_id', scope_field: 'pf_id', frequency_field: 'frequency_class', season_field: 'season' },
      { ref: '../flora-trees-shrubs/flora/tree_habitat_presence.csv', species_field: 'fl_id', scope_field: 'pf_id', frequency_field: 'frequency_class', season_field: 'season' },
      { ref: '../fauna-fish-invertebrates-livestock/fauna/fish.csv', species_field: 'fa_id', scope_field: 'wb_frequency', frequency_field: 'embedded_scope_frequency_pairs', season_field: 'season_presence' },
      { ref: '../fauna-mammals-birds/fauna/wild_habitat_presence.csv', species_field: 'fa_id', scope_field: 'pf_id', frequency_field: 'frequency_class', season_field: 'season' },
    ],
    qualifying_frequency_classes: ['ubiquitous', 'common'],
    generation_season_field: 'season',
    season_match: 'habitat_season_contains_generation_season',
    season_aliases: { spring_rasputitsa: 'spring' },
    fallback_when: 'no_qualifying_bound_species_for_node_scope',
    fallback_rule_ref: '../places-binding/presence/frequency_rule.json#presence_ppm_from_frequency_class@v1',
  },
  probability_ppm: 960000,
  empty_probability_ppm: 40000,
  excluded_until_patch_profiles: ['F10', 'F11', 'F32', 'F33'],
  deferred_rare_family_ppm: { F11: 125000, F32: 125000, F33: 125000 },
  family_semantics: { F29: 'inhabits_or_observable_signs; encounter_roll_is_separate_by_place_day_day_phase' },
  basis: 'editorial',
  note: 'Family-aware calibration for resource architecture #171; no change to global places-binding frequency classes.',
};

export const FISH_SEASON_RULES = [{
  family_id: 'F18',
  allowed_seasons: ['winter', 'spring', 'summer', 'autumn'],
  peak_seasons: ['winter', 'spring', 'autumn'],
  source_ref: 'book:622242 §1467',
  basis: 'sourced',
  status: 'candidate',
}];
