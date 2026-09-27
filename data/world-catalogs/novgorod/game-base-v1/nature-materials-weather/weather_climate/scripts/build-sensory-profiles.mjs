import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsv, writeCsv, SEASONS } from '../../_shared/scripts/lib.mjs';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAME = path.resolve(DIR, '..', '..');
const states = readCsv(path.join(DIR, 'weather_states.csv'));
const waterTemplates = new Map(readCsv(path.join(GAME, 'fauna-fish-invertebrates-livestock/scripts/input_snapshots/world_db_water_body_templates.csv')).map((row) => [row.id, row]));
const nodes = readCsv(path.join(GAME, 'places-binding/places/node_binding.csv')).filter((row) => row.node_level === 'G4' && row.water_body_template_id);
const families = readCsv(path.join(GAME, 'places-binding/places/place_families.csv'));
const presentations = readCsv(path.join(GAME, 'nature-materials-weather/natural_presentation_texts/presentation_texts.csv'));
const scopes = new Map();
for (const node of nodes) {
  for (const pf of [node.pf_id, ...node.pf_secondary.split(';').filter(Boolean)]) {
    const family = families.find((row) => row.pf_id === pf);
    if (pf === node.pf_id || family?.water_body_template_refs.split(';').includes(node.water_body_template_id)) {
      const key = `${node.water_body_template_id}|${pf}`;
      if (!scopes.has(key)) scopes.set(key, []);
      scopes.get(key).push(node.node_ref.replace(/@\d+$/, ''));
    }
  }
}
// Some water families have no G4 of their own yet; keep their template gaps explicit.
for (const family of families) for (const template of family.water_body_template_refs.split(';').filter((id) => nodes.some((node) => node.water_body_template_id === id))) {
  const key = `${template}|${family.pf_id}`;
  if (!scopes.has(key)) scopes.set(key, []);
}
const waterRows = [];
const facets = ['current', 'color', 'sound', 'width', 'opposite_bank_visible', 'ice'];
for (const [key, g4s] of scopes) {
  const [templateId, pf] = key.split('|');
  const water = waterTemplates.get(templateId);
  if (!water) throw new Error(`missing water template ${templateId}`);
  for (const season of SEASONS) for (const facet of facets) {
    const field = facet === 'current' ? 'flow_type' : facet === 'ice' && season === 'winter' ? 'freeze_pattern' : '';
    const value = field && water[field] ? water[field] : '';
    waterRows.push({
      water_profile_id: `wp_${templateId}_${pf}_${season}_${facet}`, scope_kind: 'water_body_template', scope_ref: templateId,
      pf_id: pf, season, facet, variant_id: 'base', weight: 1,
      value_ru: '', value_num: '', unit: '', value_ref: value ? `${templateId}.${field}` : '',
      condition: `water_body_template=${templateId}${facet === 'current' ? '; water_condition=open' : facet === 'ice' && value ? '; water_condition=ice' : ''}`,
      source_refs: '', rule_ref: value ? `world_db_water_body_templates.csv#${templateId}.${field}` : '',
      no_source: value ? '' : ['width', 'opposite_bank_visible'].includes(facet) ? 'нужна геометрия конкретного водоёма' : 'нет шаблонного признака; локальный текст возможен только для привязанного G4 и водного режима', confidence: 'C', status: 'candidate',
    });
  }
  for (const season of SEASONS) for (const waterCondition of ['high_water', 'ice_breaking']) waterRows.push({
    water_profile_id: `wp_${templateId}_${pf}_${season}_current_gap_${waterCondition}`, scope_kind: 'water_body_template', scope_ref: templateId,
    pf_id: pf, season, facet: 'current', variant_id: `gap_${waterCondition}`, weight: 1,
    value_ru: '', value_num: '', unit: '', value_ref: '',
    condition: `water_body_template=${templateId}; water_condition=${waterCondition}`,
    source_refs: '', rule_ref: '', no_source: `течение при ${waterCondition} для конкретного водоёма не установлено`, confidence: 'C', status: 'candidate',
  });
  if (templateId === 'wb_river_channel') for (const claim of [
    ['winter', 'ice', 'ice', 'над течением лёд может быть тоньше', 'residual-nature-ice-current-thin-areas'],
    ['spring', 'ice_breaking', 'current', 'ледяной затор может препятствовать течению', 'foundations-earth2-11-river-ice-jam-flow-obstruction'],
  ]) waterRows.push({
    water_profile_id: `wp_${templateId}_${pf}_${claim[4]}`, scope_kind: 'water_body_template', scope_ref: templateId,
    pf_id: pf, season: claim[0], facet: claim[2], variant_id: `wk_${claim[4]}`, weight: 1,
    value_ru: claim[3], value_num: '', unit: '', value_ref: '',
    condition: `water_body_template=${templateId}; water_condition=${claim[1]}`,
    source_refs: `wk:claim:${claim[4]}`, rule_ref: '', no_source: '', confidence: 'C', status: 'candidate',
  });
  for (const row of presentations.filter((row) => g4s.includes(row.g4_ref) && ['water_body', 'audible_context'].includes(row.layer) && row.requires.includes('water_condition='))) {
    const facet = row.layer === 'water_body' ? 'color' : 'sound';
    waterRows.push({
      water_profile_id: `wp_${templateId}_${pf}_${row.npt_id}`, scope_kind: 'water_body_template', scope_ref: templateId,
      pf_id: pf, season: row.season_period, facet, variant_id: row.npt_id, weight: 1,
      value_ru: '', value_num: '', unit: '', value_ref: `presentation_texts.csv#${row.npt_id}`,
      condition: `water_body_template=${templateId}; g4_ref=${row.g4_ref}; ${row.requires}`,
      source_refs: '', rule_ref: `presentation_texts.csv#${row.npt_id}`, no_source: '', confidence: 'C', status: 'candidate',
    });
  }
}
writeCsv(path.join(DIR, 'water_profiles.csv'), waterRows);

const windNames = { none: 'безветрие', weak: 'слабый ветер', moderate: 'умеренный ветер', strong: 'сильный ветер', dangerous: 'опасный ветер' };
const airRows = [];
for (const season of SEASONS) for (const state of states.filter((row) => row.seasons_available.split('|').includes(season))) {
  for (const facet of ['wind', 'air_sensation']) airRows.push({
    air_profile_id: `ap_${season}_${state.wx_state_id}_${facet}`, season, weather_state_ref: state.wx_state_id, facet,
    value_ru: facet === 'wind' ? windNames[state.wind] : '',
    condition: `weather_state=${state.wx_state_id}; wind=${state.wind}`,
    source_refs: '', rule_ref: facet === 'wind' ? `weather_states.csv#${state.wx_state_id}.wind` : '', no_source: facet === 'air_sensation' ? 'ощущение воздуха не задано; температура доступна в temperature_profile.csv' : '', confidence: 'C', status: 'candidate',
  });
}
writeCsv(path.join(DIR, 'wind_air_profiles.csv'), airRows);
console.log(`sensory profiles: water=${waterRows.length}, wind_air=${airRows.length}`);
