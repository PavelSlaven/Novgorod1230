// Builds weather_climate candidate tables (D7 inertia profile v2) from authoring/*.mjs.
// node weather_climate/scripts/build.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, writeCsv, writeJson, FREQ_WEIGHT, SEASONS, MAIN } from '../../_shared/scripts/lib.mjs';
import { SOURCES, MONTHLY, DAYCOUNTS, OCCUPANCY, SEASON_MONTHS, PHENOMENA, HISTORICAL } from '../authoring/climate_inputs.mjs';
import { STATES, PHASE, BANDS, ANOMALIES, ANOMALY_ORDER, STATE_TEMP_MOD, INTERVALS, LOCAL_MODIFIERS, GROUND_RULES, WATER_RULES } from '../authoring/states.mjs';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = (k) => SOURCES[k] || k;
const r1 = (x) => Math.round(x * 10) / 10;
const STEPS_PER_DAY = 4; // 6-hour grid of temporal-v4
const JULIAN_SHIFT_DAYS = 7; // 13th century: Julian = Gregorian - 7 days

// 1. monthly normals: Gregorian + Julian-month interpolation
const f = JULIAN_SHIFT_DAYS / 30.4;
const byM = Object.fromEntries(MONTHLY.map((r) => [r[0], r]));
const interp = (m, i) => r1(byM[m][i] + f * (byM[(m % 12) + 1][i] - byM[m][i]));
const normals = MONTHLY.map(([m, amax, mx, mean, mn, amin, pr]) => ({
  month: m, calendar: 'gregorian_station_normal', abs_max_c: amax, mean_max_c: mx, mean_c: mean, mean_min_c: mn, abs_min_c: amin, precip_mm: pr,
  julian_month_mean_max_c: interp(m, 2), julian_month_mean_c: interp(m, 3), julian_month_mean_min_c: interp(m, 4),
  julian_rule: `Julian month m ≈ Gregorian dates +${JULIAN_SHIFT_DAYS} d: value = G(m) + ${r1(f * 100) / 100} x (G(m+1) - G(m))`,
  source_refs: [S('ruwiki_table')], confidence: 'B', note: 'Современный (XX в.) аналог; поправка на климат 1230 г. не вводится', status: 'candidate',
}));
const jul = Object.fromEntries(normals.map((n) => [n.month, n]));

// 2. season climatology: slot fractions -> class -> weight, persistence
const seasonMm = (s) => SEASON_MONTHS[s].reduce((a, m) => a + byM[m][6], 0);
const cls = (x) => (x >= 0.30 ? 'ubiquitous' : x >= 0.15 ? 'common' : x >= 0.06 ? 'contextual' : x > 0 ? 'rare' : 'absent');
const clim = [];
const frac = {};
for (const s of SEASONS) {
  const d = (k) => DAYCOUNTS[k][s][0] / 30;
  const thunder = d('thunder') * OCCUPANCY.thunder;
  const blizz = d('blizzard') * OCCUPANCY.blizzard;
  const windy = d('windy') * OCCUPANCY.windy;
  const fog = d('fog') * OCCUPANCY.fog;
  const clear = d('clear') * OCCUPANCY.clear;
  const mmpd = seasonMm(s) / (DAYCOUNTS.precip[s][0] * 3);
  const steadyShare = mmpd / (mmpd + 4);
  const precipAll = Math.max(0, d('precip') * OCCUPANCY.precip - thunder - blizz);
  const windyPrecip = blizz + windy * 0.5;
  const windyDry = windy * 0.5;
  const steady = precipAll * steadyShare;
  const light = precipAll - steady;
  const overcastDry = Math.max(0, d('overcast') - precipAll - fog - windyPrecip);
  const used = clear + fog + thunder + windyPrecip + windyDry + steady + light + overcastDry;
  const partly = Math.max(0.02, 1 - used);
  frac[s] = { wx_clear: clear, wx_partly_cloudy: partly, wx_overcast: overcastDry, wx_fog: fog, wx_precip_light: light, wx_precip_steady: steady, wx_convective_storm: thunder, wx_windy_dry: windyDry, wx_windy_precip: windyPrecip };
  const basis = {
    wx_clear: `clear days ${DAYCOUNTS.clear[s][0]}/30 (${DAYCOUNTS.clear[s][1]})`,
    wx_partly_cloudy: 'remainder 1 - Σ(other states)',
    wx_overcast: `overcast days ${DAYCOUNTS.overcast[s][0]}/30 minus precipitation, fog, windy-precip shares (${DAYCOUNTS.overcast[s][1]})`,
    wx_fog: `fog days ${DAYCOUNTS.fog[s][0]}/30 x occupancy ${OCCUPANCY.fog} (${DAYCOUNTS.fog[s][1]})`,
    wx_precip_light: `precip days ${DAYCOUNTS.precip[s][0]}/30 x ${OCCUPANCY.precip} x (1 - steady share ${r1(steadyShare * 100)}%); steady share = mm_per_precip_day/(mm_per_precip_day+4), mm/day=${r1(mmpd)}`,
    wx_precip_steady: `precip slots x steady share ${r1(steadyShare * 100)}%`,
    wx_convective_storm: `thunder days ${DAYCOUNTS.thunder[s][0]}/30 x ${OCCUPANCY.thunder} (${DAYCOUNTS.thunder[s][1]})`,
    wx_windy_dry: `windy days ${DAYCOUNTS.windy[s][0]}/30 x ${OCCUPANCY.windy} x 0.5 (${DAYCOUNTS.windy[s][1]})`,
    wx_windy_precip: `blizzard days ${DAYCOUNTS.blizzard[s][0]}/30 x ${OCCUPANCY.blizzard} + half of windy (${DAYCOUNTS.blizzard[s][1]})`,
  };
  for (const st of STATES) {
    const x = frac[s][st.id];
    const c = cls(x);
    const short = ['wx_fog', 'wx_convective_storm', 'wx_windy_precip', 'wx_windy_dry'].includes(st.id);
    const pd = c === 'absent' ? 0 : short ? 1 : c === 'ubiquitous' ? 3 : c === 'common' ? 2 : 1;
    clim.push({ row_id: `wxc_${s}__${st.id.slice(3)}`, season_period: s, wx_state_id: st.id, slot_fraction: Math.round(x * 1000) / 1000, frequency_class: c, class_weight: FREQ_WEIGHT[c], persistence_days: pd, entry_weight: c === 'absent' ? 0 : Math.max(1, Math.round((x / pd) * 100)),
      rule: 'class by slot fraction: >=0.30 ubiquitous, >=0.15 common, >=0.06 contextual, >0 rare (class_weight 8/4/2/1); persistence 3/2/1 for ubiquitous/common/other; fog, storm, windy states always 1; entry_weight = max(1, round(100 x slot_fraction / persistence_days)) so that the stationary share of the chain matches the slot fraction',
      basis: basis[st.id], source_refs: [S('klimat_novgoroda'), S('ruwiki_table'), ...(st.id === 'wx_windy_precip' || st.id === 'wx_windy_dry' ? [S('trasa')] : [])], confidence: st.id.startsWith('wx_windy') || st.id === 'wx_partly_cloudy' ? 'C' : 'B', status: 'candidate' });
  }
}
const climOf = (s, id) => clim.find((c) => c.season_period === s && c.wx_state_id === id);

// 3. transitions per 6 h: to t != s weight W(class_t); self = (4d-1) x Σ others  => mean run = d days
const trans = [];
for (const s of SEASONS) {
  const avail = STATES.filter((st) => climOf(s, st.id).entry_weight > 0);
  for (const from of STATES) {
    const others = avail.filter((t) => t.id !== from.id);
    const sumOthers = others.reduce((a, t) => a + climOf(s, t.id).entry_weight, 0);
    const c = climOf(s, from.id);
    for (const to of avail) {
      let w; let note;
      if (to.id === from.id) { w = (STEPS_PER_DAY * c.persistence_days - 1) * sumOthers; note = `self: (4 x ${c.persistence_days} - 1) x ${sumOthers} -> expected run ${c.persistence_days} d`; }
      else { w = climOf(s, to.id).entry_weight; note = `entry_weight(${to.id})`; }
      trans.push({ row_id: `wxt_${s}__${from.id.slice(3)}__${to.id.slice(3)}`, season_period: s, from_state: from.id, to_state: to.id, weight: w, from_available_in_season: c.entry_weight > 0, rule: note, source_refs: [S('d7'), `weather_season_climatology.csv#wxc_${s}__${to.id.slice(3)}`], confidence: 'C', status: 'candidate' });
    }
  }
}

// stationary distribution check (report only)
const stationary = {};
for (const s of SEASONS) {
  const ids = STATES.map((x) => x.id);
  let p = Object.fromEntries(ids.map((i) => [i, 1 / ids.length]));
  const rows = trans.filter((t) => t.season_period === s);
  const tot = Object.fromEntries(ids.map((i) => [i, rows.filter((t) => t.from_state === i).reduce((a, t) => a + t.weight, 0)]));
  for (let k = 0; k < 4000; k++) {
    const q = Object.fromEntries(ids.map((i) => [i, 0]));
    for (const t of rows) q[t.to_state] += p[t.from_state] * t.weight / tot[t.from_state];
    p = q;
  }
  stationary[s] = Object.fromEntries(ids.map((i) => [i, { stationary: Math.round(p[i] * 1000) / 1000, target_fraction: climOf(s, i).slot_fraction }]));
}

// 4. temperature anomaly chain (adjacent moves only, persistence 3 d)
const anomTrans = [];
for (const s of SEASONS) {
  const avail = ANOMALIES.filter((a) => a.seasons.includes(s));
  for (const from of ANOMALIES) {
    const fi = ANOMALY_ORDER.indexOf(from.id);
    let nbrs = avail.filter((a) => Math.abs(ANOMALY_ORDER.indexOf(a.id) - fi) === 1);
    if (!avail.includes(from)) nbrs = [avail.reduce((b, a) => (Math.abs(ANOMALY_ORDER.indexOf(a.id) - fi) < Math.abs(ANOMALY_ORDER.indexOf(b.id) - fi) ? a : b))];
    const sumN = nbrs.reduce((a, n) => a + FREQ_WEIGHT[n.cls], 0);
    if (avail.includes(from)) anomTrans.push({ row_id: `ant_${s}__${from.id.slice(3)}__${from.id.slice(3)}`, season_period: s, from_anomaly: from.id, to_anomaly: from.id, weight: (STEPS_PER_DAY * 3 - 1) * sumN, rule: 'self: (4x3-1) x Σ neighbours -> anomaly holds ~3 days', source_refs: [S('d7')], confidence: 'C', status: 'candidate' });
    for (const n of nbrs) anomTrans.push({ row_id: `ant_${s}__${from.id.slice(3)}__${n.id.slice(3)}`, season_period: s, from_anomaly: from.id, to_anomaly: n.id, weight: FREQ_WEIGHT[n.cls], rule: avail.includes(from) ? `adjacent step, W(${n.cls})` : 'anomaly not allowed in this season: forced move to nearest allowed', source_refs: [S('d7')], confidence: 'C', status: 'candidate' });
  }
}
const anomRows = ANOMALIES.map((a) => ({ anomaly_id: a.id, name_ru: a.name_ru, delta_c: a.delta_c, delta_winter_c: a.delta_by_season?.winter ?? a.delta_c, seasons: a.seasons, frequency_class: a.cls, weight: FREQ_WEIGHT[a.cls], persistence_days: 3, source_refs: [S('d7'), S('klimat_novgoroda')], confidence: 'C', note: 'Величины отклонений — редакторские; абсолютные экстремумы станции (−45…+34 °C) сознательно не достигаются', status: 'candidate' }));

// 5. temperature profile by Julian month x 6-h interval (normal, before anomaly and state modifiers)
const tempProfile = [];
for (const n of normals) for (const [i, iv] of INTERVALS.entries()) {
  const t = [n.julian_month_mean_min_c, n.julian_month_mean_c, n.julian_month_mean_max_c, n.julian_month_mean_c][i];
  tempProfile.push({ row_id: `wtp_m${String(n.month).padStart(2, '0')}_${iv}`, julian_month: n.month, interval: iv, normal_temp_c: t,
    formula: 'T = normal_temp_c + anomaly.delta_c + STATE_TEMP_MOD[state][interval]', source_refs: [S('ruwiki_table')], confidence: 'B', status: 'candidate' });
}
const stateMod = STATES.map((st) => ({ wx_state_id: st.id, ...Object.fromEntries(INTERVALS.map((iv, k) => [`mod_${iv}`, STATE_TEMP_MOD[st.id][k]])), source_refs: ['wk:claim:foundations-earth2-10-cloud-radiative-two-way-effect'], confidence: 'C' }));

// 6. phases & bands
const phaseRows = PHASE.map((p) => ({ kind: 'precipitation_phase', id: p.phase, min_c: p.min_c ?? '', max_c: p.max_c ?? '', contract_value: p.contract_precipitation, source_refs: [S('rain_snow')], confidence: 'B' }))
  .concat(BANDS.map((b) => ({ kind: 'temperature_band', id: b.band, min_c: b.min_c ?? '', max_c: b.max_c ?? '', contract_value: b.band, source_refs: [S('contract')], confidence: 'C' })));

// 7. realized weather matrix state x phase -> contract weather_state fields
const realized = [];
const body = (st, ph) => ({ none: st.id === 'wx_clear' ? 'cold_at_night; при жаре — жажда' : st.id === 'wx_windy_dry' ? 'wind_chill' : st.id === 'wx_fog' ? 'disorientation' : 'none', rain: 'wet', sleet: 'wet_cold', snow: 'cold' }[ph]
  + (st.id === 'wx_windy_precip' ? ', exposure, disorientation' : '') + (st.id === 'wx_convective_storm' ? ', lightning' : ''));
for (const st of STATES) {
  const phases = st.precip ? (st.id === 'wx_convective_storm' ? ['rain'] : ['snow', 'sleet', 'rain']) : ['none'];
  for (const ph of phases) {
    let kind = { wx_clear: 'clear', wx_partly_cloudy: 'cloudy', wx_overcast: 'cloudy', wx_fog: 'fog', wx_windy_dry: 'wind' }[st.id];
    if (st.precip) kind = st.id === 'wx_convective_storm' ? 'storm' : st.id === 'wx_windy_precip' ? (ph === 'snow' ? 'snow' : 'storm') : ph === 'snow' ? 'snow' : 'rain';
    const allowedBands = ph === 'snow' ? ['severe_cold', 'cold', 'cool'] : ph === 'sleet' ? ['cool'] : ph === 'rain' ? (st.id === 'wx_convective_storm' ? ['mild', 'warm', 'hot'] : ['cool', 'mild', 'warm', 'hot']) : BANDS.map((b) => b.band);
    realized.push({ row_id: `wxr_${st.id.slice(3)}__${ph}`, wx_state_id: st.id, precipitation_phase: ph, weather_kind: kind,
      weather_kind_overrides: st.precip ? '' : 'band severe_cold -> frost; winter with T > 0 °C -> thaw',
      precipitation: ph === 'none' ? 'none' : ph, wind: st.wind, visibility_weather_modifier: ph === 'snow' && st.id === 'wx_precip_steady' ? 'heavily_reduced' : st.visibility,
      allowed_temperature_bands: allowedBands, ground_tendency: ph === 'snow' ? 'snow' : ph === 'sleet' ? 'wet_or_ice' : ph === 'rain' ? (st.precip === 'light' ? 'wet' : 'mud') : 'unchanged',
      body_state_risk: body(st, ph), movement_factor: `${st.movement[0]}/${st.movement[1]}`,
      name_ru: st.precip ? `${st.name_ru.split(' (')[0]}: ${{ snow: 'снег', sleet: 'мокрый снег с дождём', rain: 'дождь' }[ph]}${st.id === 'wx_windy_precip' && ph === 'snow' ? ' (метель)' : ''}` : st.name_ru,
      source_refs: [S('contract'), S('rain_snow'), S('temporal_v4')], confidence: 'C', status: 'candidate' });
  }
}

// 8. states table
const stateRows = STATES.map((st) => ({ wx_state_id: st.id, name_ru: st.name_ru, sky: st.sky, precipitation_regime: st.precip || 'none', wind: st.wind, visibility: st.visibility, movement_factor: `${st.movement[0]}/${st.movement[1]}`,
  min_temp_c: st.min_temp_c ?? '', seasons_available: SEASONS.filter((s) => climOf(s, st.id).entry_weight > 0), replaces_v1_state: st.replaces_v1 || '',
  persistence_days_by_season: SEASONS.map((s) => `${s}:${climOf(s, st.id).persistence_days}`), source_refs: [S('temporal_v4'), S('d7'), S('contract')], confidence: 'C', status: 'candidate' }));

// 9. phenomena with Julian dates
const toJulian = (g) => { if (!/^\d\d-\d\d$/.test(g)) return g; const d = new Date(Date.UTC(1231, Number(g.slice(0, 2)) - 1, Number(g.slice(3)))); d.setUTCDate(d.getUTCDate() - JULIAN_SHIFT_DAYS); return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };
// light nights from daylight dataset
const dl = readJson(path.join(MAIN, 'data/world-catalogs/novgorod/temporal-v4/datasets/calendar_daylight_light_profiles.json'))[0].payload.daylight_boundary_rules.year_daily_boundaries['1230'];
const dlE = Array.isArray(dl) ? dl : Object.entries(dl);
const light = [];
for (let m = 1; m <= 12; m++) {
  const days = dlE.filter(([k]) => Number(k.slice(0, 2)) === m).map(([, v]) => ({ dawn: +v.civil_dawn_minute_of_day, rise: +v.sunrise_minute_of_day, set: +v.sunset_minute_of_day, dusk: +v.civil_dusk_minute_of_day }));
  const avg = (k) => Math.round(days.reduce((a, d) => a + d[k], 0) / days.length);
  const hm = (x) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
  const dark = 1440 - avg('dusk') + avg('dawn');
  light.push({ row_id: `wxlight_m${String(m).padStart(2, '0')}`, julian_month: m, season_period: SEASONS.find((s) => SEASON_MONTHS[s].includes(m)), avg_civil_dawn_lmst: hm(avg('dawn')), avg_sunrise_lmst: hm(avg('rise')), avg_sunset_lmst: hm(avg('set')), avg_civil_dusk_lmst: hm(avg('dusk')),
    day_length_h: r1((avg('set') - avg('rise')) / 60), dark_night_h: r1(dark / 60), light_night: dark < 240,
    light_character_ru: dark < 240 ? 'светлые ночи: небо не темнеет полностью' : (avg('set') - avg('rise')) < 480 ? 'короткий день, низкое солнце, долгие сумерки' : (avg('set') - avg('rise')) > 900 ? 'долгий день, высокое солнце' : 'умеренный день',
    source_refs: [S('daylight_v4')], confidence: 'A', status: 'candidate' });
}
const lightMonths = light.filter((l) => l.light_night).map((l) => l.julian_month);
const phenRows = PHENOMENA.map((p) => ({ phenomenon_id: p.id, name_ru: p.name_ru, kind: p.kind,
  gregorian_avg: p.greg.avg, gregorian_early: p.greg.early || '', gregorian_late: p.greg.late || '',
  julian_avg: p.id === 'wxp_light_nights' ? `months ${lightMonths.join(',')}` : toJulian(p.greg.avg), julian_early: toJulian(p.greg.early || ''), julian_late: toJulian(p.greg.late || ''),
  value_ru: p.value, game_effect: p.effect, source_refs: p.src.map(S), confidence: p.conf, status: 'candidate' }));
const histRows = HISTORICAL.map((h) => ({ event_id: h.id, year_ad: h.year, chronicle_year_am: h.chron_year, julian_date: h.julian, name_ru: h.name_ru, summary_ru: h.text, source_refs: h.src.map(S), confidence: h.conf, use: 'historical_phase_local_effect / narration; not a generator rule', status: 'candidate' }));
const localRows = LOCAL_MODIFIERS.map((l) => ({ ...l, src: undefined, source_refs: l.src.map(S), confidence: l.conf, status: 'candidate' }));
const gwRows = GROUND_RULES.map((g) => ({ rule_id: g.id, target: 'ground_state', value: g.ground_state, when: g.when, source_refs: [S('contract'), 'weather_climate/seasonal_phenomena.csv'], confidence: 'C', status: 'candidate' }))
  .concat(WATER_RULES.map((w) => ({ rule_id: w.id, target: 'water_condition', value: w.water_condition, when: w.when, source_refs: [S('volkhov_web'), S('klimat_novgoroda')], confidence: 'B', status: 'candidate' })));

const counts = {
  climate_monthly_normals: writeCsv(path.join(DIR, 'climate_monthly_normals.csv'), normals),
  weather_states: writeCsv(path.join(DIR, 'weather_states.csv'), stateRows),
  weather_season_climatology: writeCsv(path.join(DIR, 'weather_season_climatology.csv'), clim),
  weather_transitions: writeCsv(path.join(DIR, 'weather_transitions.csv'), trans),
  temperature_anomalies: writeCsv(path.join(DIR, 'temperature_anomalies.csv'), anomRows),
  temperature_anomaly_transitions: writeCsv(path.join(DIR, 'temperature_anomaly_transitions.csv'), anomTrans),
  temperature_profile: writeCsv(path.join(DIR, 'temperature_profile.csv'), tempProfile),
  weather_state_temperature_modifiers: writeCsv(path.join(DIR, 'weather_state_temperature_modifiers.csv'), stateMod),
  precipitation_phase_and_bands: writeCsv(path.join(DIR, 'precipitation_phase_and_bands.csv'), phaseRows),
  realized_weather_matrix: writeCsv(path.join(DIR, 'realized_weather_matrix.csv'), realized),
  seasonal_phenomena: writeCsv(path.join(DIR, 'seasonal_phenomena.csv'), phenRows),
  historical_weather_1224_1231: writeCsv(path.join(DIR, 'historical_weather_1224_1231.csv'), histRows),
  light_profile_by_month: writeCsv(path.join(DIR, 'light_profile_by_month.csv'), light),
  local_landscape_modifiers: writeCsv(path.join(DIR, 'local_landscape_modifiers.csv'), localRows, ['id', 'applies_to', 'wind_step', 'visibility_step', 'fog_note', 'snow_note', 'temp_note', 'source_refs', 'confidence', 'status']),
  ground_water_condition_rules: writeCsv(path.join(DIR, 'ground_water_condition_rules.csv'), gwRows),
};

// 10. successor profile in the temporal-v4 record shape (authoring candidate, not approved)
writeJson(path.join(DIR, 'weather_transition_profile_v2.candidate.json'), {
  record_id: 'record:weather_transition_profiles_processes:novgorod_weather_v2_inertia',
  family_id: 'weather_transition_profiles_processes', record_kind: 'weather_transition_profile', status: 'candidate', version: '2',
  supersedes: 'record:weather_transition_profiles_processes:novgorod_weather_v2 (version 1, equal weights)',
  applicability: ['novgorod'],
  payload: {
    weather_profile_id: 'novgorod_six_hour_inertia_climatology_v2',
    decision_ref: S('d7'),
    region_season_applicability: { region: 'novgorod', calendar_system: 'Julian', calendar_seasons: Object.fromEntries(SEASONS.map((s) => [s, SEASON_MONTHS[s].map(String)])) },
    exact_duration_or_boundary_ranges: { boundary_grid_minutes_from_local_midnight: ['0', '360', '720', '1080', '1440'], transition_interval_minutes: '360' },
    weather_states: stateRows.map((r) => ({ weather_state_id: r.wx_state_id, sky: r.sky, precipitation_regime: r.precipitation_regime, wind: r.wind, visibility: r.visibility, movement_factor: r.movement_factor })),
    transition_rules: {
      method: 'deterministic weighted selection from the row of the previous committed state in the current season; weights are integers; self weight encodes persistence',
      persistence_rule: 'self = (4 x persistence_days - 1) x Σ(weights of other available states) => expected run length persistence_days (geometric)',
      weights_meaning: 'entry weight of target = round(100 x climatological slot fraction / persistence_days) from 20th-century Novgorod station day counts; not measured 1230 probabilities',
      seasonal_rows: Object.fromEntries(SEASONS.map((s) => [s, Object.fromEntries(STATES.map((from) => [from.id, Object.fromEntries(trans.filter((t) => t.season_period === s && t.from_state === from.id).map((t) => [t.to_state, String(t.weight)]))]))])),
      random_source: { algorithm_id: 'mulberry32_v1', key: '(party seed, G0 zone, 6-hour interval number)', owner: '@rus/turn selects; @rus/environment-state validates and applies (D7)' },
    },
    temperature: {
      formula: 'T = normal(julian_month, interval) + anomaly.delta + state_modifier(interval)',
      normals_by_julian_month_interval: Object.fromEntries(normals.map((n) => [String(n.month), [n.julian_month_mean_min_c, n.julian_month_mean_c, n.julian_month_mean_max_c, n.julian_month_mean_c]])),
      anomaly_states: anomRows.map((a) => ({ id: a.anomaly_id, delta_c: a.delta_c, delta_winter_c: a.delta_winter_c, seasons: a.seasons })),
      anomaly_transitions: Object.fromEntries(SEASONS.map((s) => [s, Object.fromEntries(ANOMALIES.map((a) => [a.id, Object.fromEntries(anomTrans.filter((t) => t.season_period === s && t.from_anomaly === a.id).map((t) => [t.to_anomaly, String(t.weight)]))]))])),
      state_modifiers: STATE_TEMP_MOD,
      bands: BANDS,
    },
    precipitation_phase_rule: PHASE,
    local_modifiers_ref: 'local_landscape_modifiers.csv',
    ground_and_water_rules_ref: 'ground_water_condition_rules.csv',
  },
  stationary_distribution_report: stationary,
});
console.log(JSON.stringify(counts));
console.log('stationary vs target (winter):', JSON.stringify(stationary.winter));
