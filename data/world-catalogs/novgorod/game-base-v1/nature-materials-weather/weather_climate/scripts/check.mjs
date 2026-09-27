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
  for (const r of T(f)) {
    if (!r.source_refs) E.push(`${f}: row without source_refs`);
    if (r.confidence && !['A', 'B', 'C'].includes(r.confidence)) E.push(`${f}: bad confidence ${r.confidence}`);
    for (const ref of (r.source_refs || '').split('|')) if (ref.startsWith('wk:claim:') && !wk.has(ref.slice(3))) E.push(`${f}: unknown WK ${ref}`);
  }
}

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
