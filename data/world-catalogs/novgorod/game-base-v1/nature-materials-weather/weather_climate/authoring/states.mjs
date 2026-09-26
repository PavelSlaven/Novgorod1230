// Weather states of the v2 inertia profile (D7). A state is a sky/precipitation-intensity regime;
// the precipitation phase (rain/sleet/snow) is NOT part of the state: it is resolved from the
// current air temperature (D7: "вид осадков зависит от температуры"). Values use the enums of
// pr98:packages/contracts/src/weather-state.js.
export const STATES = [
  { id: 'wx_clear', name_ru: 'Ясно', sky: 'clear', precip: false, wind: 'weak', visibility: 'none', movement: [1, 1], replaces_v1: 'clear_dry_calm' },
  { id: 'wx_partly_cloudy', name_ru: 'Переменная облачность', sky: 'broken', precip: false, wind: 'weak', visibility: 'none', movement: [1, 1], replaces_v1: null },
  { id: 'wx_overcast', name_ru: 'Пасмурно без осадков', sky: 'overcast', precip: false, wind: 'weak', visibility: 'none', movement: [1, 1], replaces_v1: 'overcast_dry_calm' },
  { id: 'wx_fog', name_ru: 'Туман', sky: 'obscured', precip: false, wind: 'none', visibility: 'heavily_reduced', movement: [5, 4], replaces_v1: 'dense_fog' },
  { id: 'wx_precip_light', name_ru: 'Слабые осадки (морось, небольшой дождь или снег)', sky: 'overcast', precip: 'light', wind: 'weak', visibility: 'reduced', movement: [5, 4], replaces_v1: 'light_snow' },
  { id: 'wx_precip_steady', name_ru: 'Обложные осадки (затяжной дождь или снегопад)', sky: 'overcast', precip: 'steady', wind: 'moderate', visibility: 'reduced', movement: [3, 2], replaces_v1: 'moderate_rain' },
  { id: 'wx_convective_storm', name_ru: 'Гроза с ливнем', sky: 'cumulonimbus', precip: 'shower', wind: 'strong', visibility: 'heavily_reduced', movement: [2, 1], replaces_v1: null, min_temp_c: 8 },
  { id: 'wx_windy_dry', name_ru: 'Сильный ветер без осадков', sky: 'variable', precip: false, wind: 'strong', visibility: 'none', movement: [5, 4], replaces_v1: 'strong_wind' },
  { id: 'wx_windy_precip', name_ru: 'Ветер с осадками (метель или ветреный дождь)', sky: 'overcast', precip: 'wind_driven', wind: 'dangerous', visibility: 'blocked', movement: [2, 1], replaces_v1: null },
];

// Precipitation phase by air temperature T (°C) — rule of thumb after Jennings et al. 2018.
export const PHASE = [
  { phase: 'snow', max_c: -1, contract_precipitation: 'snow' },
  { phase: 'sleet', min_c: -1, max_c: 2, contract_precipitation: 'sleet' },
  { phase: 'rain', min_c: 2, contract_precipitation: 'rain' },
];

// Temperature bands (contract TEMPERATURE_BANDS) — editorial cut points on air temperature.
export const BANDS = [
  { band: 'severe_cold', max_c: -15 }, { band: 'cold', min_c: -15, max_c: -3 }, { band: 'cool', min_c: -3, max_c: 5 },
  { band: 'mild', min_c: 5, max_c: 15 }, { band: 'warm', min_c: 15, max_c: 24 }, { band: 'hot', min_c: 24 },
];

// Persistent temperature anomaly chain (D7 "держащееся отклонение от нормы").
// delta_by_season overrides delta_c; winter values are calibrated by the check simulation so that
// days with a positive daily maximum approach the station thaw-day counts (Dec 12, Jan 8, Feb 6).
// Convective storm below its min_temp_c is realized as wx_precip_steady (fallback rule).
export const ANOMALIES = [
  { id: 'an_severe_cold', delta_c: -10, delta_by_season: { winter: -13 }, seasons: ['winter'], cls: 'rare', name_ru: 'крепкие морозы' },
  { id: 'an_cold', delta_c: -5, delta_by_season: { winter: -7 }, seasons: ['winter', 'spring', 'summer', 'autumn'], cls: 'common', name_ru: 'холоднее обычного' },
  { id: 'an_normal', delta_c: 0, seasons: ['winter', 'spring', 'summer', 'autumn'], cls: 'ubiquitous', name_ru: 'по сезону' },
  { id: 'an_warm', delta_c: 5, delta_by_season: { winter: 8 }, seasons: ['winter', 'spring', 'summer', 'autumn'], cls: 'common', name_ru: 'теплее обычного (зимой — оттепель)' },
  { id: 'an_hot', delta_c: 7, seasons: ['summer'], cls: 'rare', name_ru: 'жара' },
];
export const ANOMALY_ORDER = ['an_severe_cold', 'an_cold', 'an_normal', 'an_warm', 'an_hot'];

// Weather-state temperature modifiers by 6-hour interval (cloud radiative effect, WK
// claim:foundations-earth2-10-cloud-radiative-two-way-effect; magnitudes editorial C).
export const STATE_TEMP_MOD = {
  wx_clear: [-2, 0, 1, 0], wx_partly_cloudy: [-1, 0, 0, 0], wx_overcast: [1, 0, -1, 0], wx_fog: [0, -1, -1, 0],
  wx_precip_light: [1, 0, -1, 0], wx_precip_steady: [1, -1, -2, 0], wx_convective_storm: [0, 0, -4, -2], wx_windy_dry: [1, 0, 0, 0], wx_windy_precip: [1, -1, -2, 0],
};
// Diurnal rule: interval 00–06 = mean_min, 06–12 = mean, 12–18 = mean_max, 18–24 = mean (station normals).
export const INTERVALS = ['00-06', '06-12', '12-18', '18-24'];

// Local (G4 landscape) modifiers — D7 "одна цепочка на G0 с местными поправками по ландшафту".
export const LOCAL_MODIFIERS = [
  { id: 'wxl_forest_shelter', applies_to: 'light_exposure=limited (forest canopy)', wind_step: -1, visibility_step: 0, fog_note: '', snow_note: 'в ельнике снег мельче, на опушках — надувы', temp_note: 'ночью теплее открытого места (C)', src: ['wk:claim:foundations-earth-04-soil-thermal-buffer', 'd7'], conf: 'C' },
  { id: 'wxl_open_water_exposure', applies_to: 'light_exposure=open and water_body present', wind_step: 1, visibility_step: 0, fog_note: 'туман гуще у воды в тихие ясные ночи и утра (радиационный туман)', snow_note: 'на льду снег сдувается', temp_note: '', src: ['wk:claim:foundations-earth-28-radiation-fog', 'wk:claim:foundations-earth-29-advection-fog', 'd7'], conf: 'C' },
  { id: 'wxl_near_water_fog', applies_to: 'water_body present (any exposure)', wind_step: 0, visibility_step: 1, fog_note: 'при wx_fog видимость на шаг хуже; при wx_clear на рассвете осенью возможна дымка', snow_note: '', temp_note: '', src: ['wk:claim:foundations-earth-27-fog-visibility', 'wk:claim:foundations-earth-28-radiation-fog', 'd7'], conf: 'C' },
  { id: 'wxl_floodplain_flood', applies_to: 'landscape floodplain/riverbank/marsh during wxp_spring_flood', wind_step: 0, visibility_step: 0, fog_note: '', snow_note: '', temp_note: 'ground_state flooded вместо mud', src: ['volkhov_web', 'd7'], conf: 'B' },
  { id: 'wxl_marsh_bog', applies_to: 'landscape marsh/bog/swamp', wind_step: 0, visibility_step: 0, fog_note: 'испарения и туман чаще летними утрами', snow_note: 'зыбь промерзает позже соседнего грунта', temp_note: '', src: ['wk:claim:foundations-earth-28-radiation-fog'], conf: 'C' },
];

// Ground and water condition resolution (inputs: season phenomena, precipitation phase, temperature band).
export const GROUND_RULES = [
  { id: 'gr_snow', when: 'snow cover established (wxp_snow_cover_onset .. wxp_snow_cover_break) and band in [severe_cold, cold, cool]', ground_state: 'snow' },
  { id: 'gr_ice_glaze', when: 'phase sleet or rain with band cool after band cold, or thaw then refreeze', ground_state: 'ice' },
  { id: 'gr_flooded', when: 'wxp_spring_flood window and floodplain/riverbank/marsh landscape', ground_state: 'flooded' },
  { id: 'gr_mud', when: 'rasputitsa windows, or wx_precip_steady/wx_windy_precip/wx_convective_storm rain within last 24 h on non-sandy ground', ground_state: 'mud' },
  { id: 'gr_wet', when: 'any rain or sleet within last 12 h', ground_state: 'wet' },
  { id: 'gr_dry', when: 'otherwise', ground_state: 'dry' },
];
export const WATER_RULES = [
  { id: 'wr_ice', when: 'between wxp_volkhov_freeze_up and wxp_volkhov_break_up', water_condition: 'ice' },
  { id: 'wr_ice_forming', when: '7 days before freeze-up average, band cold or colder', water_condition: 'ice_forming' },
  { id: 'wr_ice_breaking', when: 'break-up .. +15 days (ice drift 10–20 days)', water_condition: 'ice_breaking' },
  { id: 'wr_flood', when: 'wxp_spring_flood window', water_condition: 'high_water' },
  { id: 'wr_open', when: 'otherwise', water_condition: 'open' },
];
