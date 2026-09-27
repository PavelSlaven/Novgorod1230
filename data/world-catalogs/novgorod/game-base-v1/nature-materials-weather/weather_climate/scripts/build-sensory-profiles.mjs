import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsv, writeCsv, SEASONS } from '../../_shared/scripts/lib.mjs';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAME = path.resolve(DIR, '..', '..');
const states = readCsv(path.join(DIR, 'weather_states.csv'));
const water = readCsv(path.join(GAME, 'fauna-fish-invertebrates-livestock/scripts/input_snapshots/world_db_water_body_templates.csv'))
  .find((row) => row.id === 'wb_river_channel');
const waterRows = [];
const facets = ['current', 'color', 'sound', 'width', 'opposite_bank_visible', 'ice'];
for (const season of SEASONS) for (const facet of facets) {
  const known = facet === 'current';
  waterRows.push({
    water_profile_id: `wp_river_channel_${season}_${facet}`, scope_kind: 'water_body_template', scope_ref: water.id,
    pf_id: 'pf_river_channel', season, facet, variant_id: 'v1', weight: 1,
    value_ru: known ? 'течение от слабого до умеренного' : '',
    value_num: '', unit: '', value_ref: known ? `${water.id}.flow_type` : '',
    condition: 'водоём соответствует шаблону',
    source_refs: '', rule_ref: known ? 'world_db_water_body_templates.csv#wb_river_channel.flow_type' : '',
    no_source: known ? '' : 'нет подтверждения для конкретного водоёма', confidence: 'C', status: 'candidate',
  });
}
writeCsv(path.join(DIR, 'water_profiles.csv'), waterRows);

const windNames = { none: 'безветрие', weak: 'слабый ветер', moderate: 'умеренный ветер', strong: 'сильный ветер', dangerous: 'опасный ветер' };
const airRows = [];
for (const season of SEASONS) for (const state of states.filter((row) => row.seasons_available.split('|').includes(season))) {
  for (const facet of ['wind', 'air_sensation']) airRows.push({
    air_profile_id: `ap_${season}_${state.wx_state_id}_${facet}`, season, weather_state_ref: state.wx_state_id, facet,
    value_ru: facet === 'wind' ? windNames[state.wind] : `${windNames[state.wind]}; ${state.name_ru.toLowerCase()}`,
    condition: `weather_state=${state.wx_state_id}; wind=${state.wind}`,
    source_refs: '', rule_ref: `weather_states.csv#${state.wx_state_id}.wind`, no_source: '', confidence: 'C', status: 'candidate',
  });
}
writeCsv(path.join(DIR, 'wind_air_profiles.csv'), airRows);
console.log(`sensory profiles: water=${waterRows.length}, wind_air=${airRows.length}`);
