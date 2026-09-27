// Acceptance checks for weather_climate (catalog acceptance_ru) + deterministic simulation report.
//  - per season x from-state: transition weights are integers and their sum > 0;
//  - snow impossible in bands above threshold, rain impossible in severe frost (matrix + simulation);
//  - every state available in a season is reachable from another state in that season;
//  - persistence_days in 1..3 for available states; anomaly chain rows sum > 0;
//  - every row has source_refs + confidence A/B/C; WK claim refs exist.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsv, fail, SEASONS, MAIN, writeJson } from '../../_shared/scripts/lib.mjs';
import { PHASE, BANDS, STATES, STATE_TEMP_MOD } from '../authoring/states.mjs';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const E = [];
const T = (f) => readCsv(path.join(DIR, f));
const clim = T('weather_season_climatology.csv');
const trans = T('weather_transitions.csv');
const anom = T('temperature_anomalies.csv');
const anomT = T('temperature_anomaly_transitions.csv');
const realized = T('realized_weather_matrix.csv');
const prof = T('temperature_profile.csv');

const wk = new Set();
const wkDir = path.join(MAIN, 'data/world-catalogs/novgorod/world-knowledge/production-v1');
for (const f of fs.readdirSync(wkDir).filter((f) => f.endsWith('.json') && !f.startsWith('verification'))) { try { for (const c of JSON.parse(fs.readFileSync(path.join(wkDir, f), 'utf8')).claims || []) wk.add(c.claim_ref); } catch { /* skip */ } }
for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith('.csv'))) {
  if (['water_profiles.csv', 'wind_air_profiles.csv'].includes(f)) continue;
  for (const r of T(f)) {
    if (!r.source_refs) E.push(`${f}: row without source_refs`);
    if (r.confidence && !['A', 'B', 'C'].includes(r.confidence)) E.push(`${f}: bad confidence ${r.confidence}`);
    for (const ref of (r.source_refs || '').split('|')) if (ref.startsWith('wk:claim:') && !wk.has(ref.slice(3))) E.push(`${f}: unknown WK ${ref}`);
  }
}

const waterProfiles = T('water_profiles.csv');
const airProfiles = T('wind_air_profiles.csv');
const waterFacets = ['current', 'color', 'sound', 'width', 'opposite_bank_visible', 'ice'];
const states = T('weather_states.csv');
const waterTemplates = readCsv(path.join(DIR, '../../fauna-fish-invertebrates-livestock/scripts/input_snapshots/world_db_water_body_templates.csv'));
const riverFamily = readCsv(path.join(DIR, '../../places-binding/places/place_families.csv')).find((r) => r.pf_id === 'pf_river_channel');
const keys = (row, expected) => Object.keys(row).sort().join('|') === [...expected].sort().join('|');
const waterColumns = 'water_profile_id,scope_kind,scope_ref,pf_id,season,facet,variant_id,weight,value_ru,value_num,unit,value_ref,condition,source_refs,rule_ref,no_source,confidence,status'.split(',');
const airColumns = 'air_profile_id,season,weather_state_ref,facet,value_ru,condition,source_refs,rule_ref,no_source,confidence,status'.split(',');
const evidence = (row) => ['source_refs', 'rule_ref', 'no_source'].filter((key) => Boolean(row[key])).length === 1 && ['A', 'B', 'C'].includes(row.confidence);
const waterIds = new Set();
for (const row of waterProfiles) {
  if (!keys(row, waterColumns) || waterIds.has(row.water_profile_id)) E.push(`${row.water_profile_id}: keys/id`);
  waterIds.add(row.water_profile_id);
  if (!SEASONS.includes(row.season) || !waterFacets.includes(row.facet) || row.scope_kind !== 'water_body_template' || !waterTemplates.some((x) => x.id === row.scope_ref) || row.pf_id !== 'pf_river_channel' || !riverFamily?.water_body_template_refs.split(';').includes(row.scope_ref) || row.variant_id !== 'v1' || row.weight !== '1' || row.status !== 'candidate') E.push(`${row.water_profile_id}: scope/season/facet/status`);
  if (!evidence(row) || (row.no_source ? Boolean(row.value_ru || row.value_num || row.value_ref) : !Boolean(row.value_ru || row.value_num || row.value_ref))) E.push(`${row.water_profile_id}: evidence/value`);
  if (row.scope_kind === 'water_body_template' && row.facet === 'ice' && !row.no_source) E.push(`${row.water_profile_id}: generic template cannot inherit local ice timing`);
  if (row.scope_kind === 'water_body_template' && /ground_water_condition_rules\.csv#|seasonal_phenomena\.csv#/.test(`${row.rule_ref}|${row.source_refs}`)) E.push(`${row.water_profile_id}: local water evidence requires specific water-body scope`);
  if (['width', 'opposite_bank_visible'].includes(row.facet) && !row.no_source && !/^(water_body|spatial|geometry):/.test(row.source_refs || row.rule_ref)) E.push(`${row.water_profile_id}: geometry required`);
  if (row.rule_ref?.startsWith('world_db_water_body_templates.csv#') && row.rule_ref !== `world_db_water_body_templates.csv#${row.scope_ref}.flow_type`) E.push(`${row.water_profile_id}: template rule`);
}
for (const season of SEASONS) for (const facet of waterFacets) if (waterProfiles.filter((r) => r.season === season && r.facet === facet).length !== 1) E.push(`water coverage ${season}/${facet}`);
const airIds = new Set();
for (const row of airProfiles) {
  if (!keys(row, airColumns) || airIds.has(row.air_profile_id)) E.push(`${row.air_profile_id}: keys/id`);
  airIds.add(row.air_profile_id);
  const state = states.find((s) => s.wx_state_id === row.weather_state_ref);
  if (!state || !state.seasons_available.split('|').includes(row.season) || !['wind', 'air_sensation'].includes(row.facet) || row.status !== 'candidate' || !evidence(row)) E.push(`${row.air_profile_id}: ref/facet/evidence`);
  if (state && (row.rule_ref !== `weather_states.csv#${state.wx_state_id}.wind` || !row.condition.includes(`wind=${state.wind}`))) E.push(`${row.air_profile_id}: wind mismatch`);
  if (row.no_source ? Boolean(row.value_ru) : !row.value_ru) E.push(`${row.air_profile_id}: value/gap`);
}
for (const state of states) for (const season of state.seasons_available.split('|')) for (const facet of ['wind', 'air_sensation']) if (airProfiles.filter((r) => r.weather_state_ref === state.wx_state_id && r.season === season && r.facet === facet).length !== 1) E.push(`air coverage ${state.wx_state_id}/${season}/${facet}`);

for (const s of SEASONS) {
  const avail = clim.filter((c) => c.season_period === s && Number(c.entry_weight) > 0).map((c) => c.wx_state_id);
  for (const c of clim.filter((c) => c.season_period === s && Number(c.entry_weight) > 0)) {
    const d = Number(c.persistence_days); if (!(d >= 1 && d <= 3)) E.push(`persistence ${c.row_id} = ${d}`);
  }
  for (const st of STATES) {
    const rows = trans.filter((t) => t.season_period === s && t.from_state === st.id);
    const sum = rows.reduce((a, t) => { if (!/^\d+$/.test(t.weight)) E.push(`non-integer weight ${t.row_id}`); return a + Number(t.weight); }, 0);
    if (!(sum > 0)) E.push(`zero row ${s}/${st.id}`);
    for (const t of rows) if (!avail.includes(t.to_state)) E.push(`transition to unavailable state ${t.row_id}`);
  }
  for (const a of avail) if (!trans.some((t) => t.season_period === s && t.to_state === a && t.from_state !== a && Number(t.weight) > 0)) E.push(`${a} unreachable in ${s}`);
  if (s === 'winter' && avail.includes('wx_convective_storm')) E.push('thunderstorm available in winter');
  for (const a of anom.filter((x) => x.seasons.split('|').includes(s))) {
    const sum = anomT.filter((t) => t.season_period === s && t.from_anomaly === a.anomaly_id).reduce((x, t) => x + Number(t.weight), 0);
    if (!(sum > 0)) E.push(`anomaly row empty ${s}/${a.anomaly_id}`);
  }
}

// matrix: phase vs bands
const band = (t) => BANDS.find((b) => (b.min_c === undefined || t >= b.min_c) && (b.max_c === undefined || t < b.max_c)).band;
const phase = (t) => (t <= -1 ? 'snow' : t < 2 ? 'sleet' : 'rain');
for (const r of realized) {
  const bands = r.allowed_temperature_bands.split('|');
  if (r.precipitation === 'snow' && bands.some((b) => ['mild', 'warm', 'hot'].includes(b))) E.push(`snow allowed in warm band ${r.row_id}`);
  if (r.precipitation === 'rain' && bands.some((b) => ['severe_cold', 'cold'].includes(b))) E.push(`rain allowed in frost band ${r.row_id}`);
}
if (PHASE.find((p) => p.phase === 'snow').max_c > BANDS.find((b) => b.band === 'mild').min_c) E.push('snow threshold above mild band');
if (PHASE.find((p) => p.phase === 'rain').min_c < BANDS.find((b) => b.band === 'cold').max_c) E.push('rain threshold inside cold band');

// deterministic simulation: 4 Julian years (1230–1233), 6-h steps, mulberry32 seed 1230
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(1230);
const pick = (rows, key) => { const tot = rows.reduce((a, r) => a + Number(r.weight), 0); let x = rnd() * tot; for (const r of rows) { x -= Number(r.weight); if (x < 0) return r[key]; } return rows[rows.length - 1][key]; };
const seasonOf = (m) => SEASONS.find((s) => ({ winter: [12, 1, 2], spring: [3, 4, 5], summer: [6, 7, 8], autumn: [9, 10, 11] })[s].includes(m));
const deltas = Object.fromEntries(anom.map((a) => [a.anomaly_id, Number(a.delta_c)]));
const deltasW = Object.fromEntries(anom.map((a) => [a.anomaly_id, Number(a.delta_winter_c)]));
const thaw = {}; let dayMax = -99;
const normal = Object.fromEntries(prof.map((p) => [`${p.julian_month}_${p.interval}`, Number(p.normal_temp_c)]));
const IV = ['00-06', '06-12', '12-18', '18-24'];
const mdays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
let st = 'wx_overcast'; let an = 'an_normal';
const stats = {}; const runs = []; let run = 0; let spells = 0;
for (let y = 0; y < 4; y++) for (let m = 1; m <= 12; m++) for (let d = 0; d < mdays[m - 1] + (m === 2 && y === 2 ? 1 : 0); d++) for (let k = 0; k < 4; k++) {
  const s = seasonOf(m);
  const prev = st;
  st = pick(trans.filter((t) => t.season_period === s && t.from_state === st), 'to_state');
  an = pick(anomT.filter((t) => t.season_period === s && t.from_anomaly === an), 'to_anomaly');
  if (st === prev) run++; else { runs.push(run + 1); run = 0; }
  const temp = normal[`${m}_${IV[k]}`] + (s === 'winter' ? deltasW : deltas)[an] + STATE_TEMP_MOD[st][k];
  dayMax = Math.max(dayMax, temp); if (k === 3) { if (dayMax > 0) thaw[m] = (thaw[m] || 0) + 1; dayMax = -99; }
  const def = STATES.find((x) => x.id === st);
  let ph = def.precip ? phase(temp) : 'none';
  if (st === 'wx_convective_storm' && temp < (def.min_temp_c ?? 8)) { ph = 'suppressed_storm_too_cold'; }
  const b = band(temp);
  const key = `${s}`; stats[key] = stats[key] || { steps: 0, snow: 0, sleet: 0, rain: 0, snow_in_mild_plus: 0, rain_in_cold_minus: 0, storm_suppressed: 0, min_t: 99, max_t: -99 };
  const x = stats[key]; x.steps++; if (ph in x) x[ph]++; x.min_t = Math.min(x.min_t, temp); x.max_t = Math.max(x.max_t, temp);
  if (ph === 'snow' && ['mild', 'warm', 'hot'].includes(b)) x.snow_in_mild_plus++;
  if (ph === 'rain' && ['severe_cold', 'cold'].includes(b)) x.rain_in_cold_minus++;
  if (ph === 'suppressed_storm_too_cold') x.storm_suppressed++;
}
for (const [s, x] of Object.entries(stats)) { if (x.snow_in_mild_plus) E.push(`sim: snow in mild+ band (${s})`); if (x.rain_in_cold_minus) E.push(`sim: rain in cold band (${s})`); }
const meanRunSteps = runs.reduce((a, b) => a + b, 0) / runs.length;
const thawPerMonth = Object.fromEntries([12, 1, 2].map((m) => [m, Math.round(((thaw[m] || 0) / 4) * 10) / 10]));
const report = { seed: 1230, years: 4, per_season: stats, thaw_days_per_winter_month: thawPerMonth, thaw_target: { 12: 12, 1: 8, 2: 6 }, mean_state_run_days: Math.round((meanRunSteps / 4) * 100) / 100, runs: runs.length };
writeJson(path.join(DIR, 'reports', 'simulation_report.json'), report);
console.log('simulation:', JSON.stringify(report));
fail(E, 'weather_climate check');
