// Explicitly refreshes the local PR #98 and main input snapshots.
// Run: node _shared/scripts/refresh-inputs.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { GROUP_DIR, SHARED, readCsv, writeJson } from './lib.mjs';

const PR98 = process.env.PR98_ROOT || 'C:/Users/Slaven/Documents/Novgorod-runtime';
const MAIN = process.env.MAIN_ROOT || 'C:/Users/Slaven/Documents/Novgorod';

const rel = 'data/world-catalogs/novgorod/m2c-natural/nature-successor-candidate-v2.json';
const src = path.join(PR98, rel);
const buf = fs.readFileSync(src);
const j = JSON.parse(buf);
const v = (x, k) => (x && x.value ? x.value[k] ?? null : null);
const PREFIX = 'g4v3__gn_nov_g3_xp017_yp026_r2_';

const g4 = j.natural_profiles.map((p) => {
  const la = p.natural_profile.layer_applicability;
  const members = [];
  for (const layer of Object.keys(la)) for (const a of la[layer].alternatives || []) {
    members.push({ layer, kind: a.kind, ref: a.taxon_or_material_ref, frequency_category: a.frequency_category, weight: a.editorial_weight, season_condition: a.season_condition || '', member_id: a.id });
  }
  const applicability = Object.fromEntries(Object.entries(la).map(([k, x]) => [k, x.applicability]));
  return {
    g4_id: p.g4_ref.id,
    g4_short: p.g4_ref.id.replace(PREFIX, ''),
    natural_profile_id: p.profile_id,
    place_function: p.exact_scene_features.source_place_type,
    landscape_template_id: p.template_refs.landscape_template_id,
    water_body_template_id: p.template_refs.water_body_template_id,
    axes: { landscape: p.authoring_axes.landscape, land_use: p.authoring_axes.land_use, family_ref: p.authoring_axes.family_ref },
    surface: v(la.surface, 'class'), relief: v(la.relief, 'class'),
    water_body_type: la.water_body.value ? la.water_body.value.water_body_type : null,
    bank: v(la.bank_structure, 'class'),
    tree: v(la.tree_layer, 'class'), shrub: v(la.shrub_layer, 'class'), ground: v(la.ground_cover, 'class'), riparian: v(la.riparian_vegetation, 'class'),
    ambient_materials: v(la.natural_materials, 'ambient_materials') || [],
    audible: v(la.audible_context, 'class'), light_exposure: v(la.light, 'exposure'), seasonal_stability: v(la.seasonal_state, 'stability'),
    applicability, members,
  };
});

writeJson(path.join(SHARED, 'g4_nature_index.json'), {
  schema: 'game_base_v1.g4_nature_index.v1',
  status: 'derived_read_only_index',
  source: { root: 'pr98', path: rel, sha256: crypto.createHash('sha256').update(buf).digest('hex'), candidate_status: j.status },
  g4_count: g4.length,
  g4,
});
console.log('g4_nature_index.json:', g4.length, 'G4');

const mainSources = [];
const source = (rel) => {
  const bytes = fs.readFileSync(path.join(MAIN, rel));
  mainSources.push({ path: rel, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), size_bytes: bytes.length });
  return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
};
const daylightPath = 'data/world-catalogs/novgorod/temporal-v4/datasets/calendar_daylight_light_profiles.json';
const daylight = source(daylightPath)[0].payload.daylight_boundary_rules.year_daily_boundaries['1230'];
const needed = new Set();
for (const dir of ['natural_materials_soils', 'weather_climate']) {
  for (const file of fs.readdirSync(path.join(GROUP_DIR, dir)).filter((name) => name.endsWith('.csv'))) {
    for (const row of readCsv(path.join(GROUP_DIR, dir, file))) {
      for (const ref of (row.source_refs || '').split('|')) if (ref.startsWith('wk:claim:')) needed.add(ref.slice(3));
    }
  }
}
const found = new Set();
const wkDir = 'data/world-catalogs/novgorod/world-knowledge/production-v1';
for (const file of fs.readdirSync(path.join(MAIN, wkDir)).filter((name) => name.endsWith('.json') && !name.startsWith('verification')).sort()) {
  const rel = `${wkDir}/${file}`;
  const bytes = fs.readFileSync(path.join(MAIN, rel));
  let claims;
  try { claims = JSON.parse(bytes).claims || []; } catch { continue; }
  const refs = claims.map((claim) => claim.claim_ref).filter((ref) => needed.has(ref));
  if (!refs.length) continue;
  mainSources.push({ path: rel, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), size_bytes: bytes.length });
  for (const ref of refs) found.add(ref);
}
const missing = [...needed].filter((ref) => !found.has(ref));
if (missing.length) throw new Error(`missing main claim refs: ${missing.join(', ')}`);
writeJson(path.join(SHARED, 'main_inputs.json'), {
  schema: 'game_base_v1.nature_main_inputs.v1',
  sources: mainSources,
  daylight_1230: daylight,
  claim_refs: [...found].sort(),
});
console.log('main_inputs.json:', Object.keys(daylight).length, 'daylight boundaries,', found.size, 'claim refs,', mainSources.length, 'source files');
