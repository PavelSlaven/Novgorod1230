// Acceptance + integrity checks for fauna-mammals-birds (catalog acceptance_ru of fauna_mammals and fauna_birds).
// Exit code 1 on any hard failure; writes validation-report.json.
'use strict';
const fs = require('fs');
const path = require('path');
const DOM = path.resolve(__dirname, '..');
const GB = path.resolve(DOM, '..');
const REPO = path.resolve(GB, '../../../..');
const MAIN = process.env.NOVGOROD_MAIN || 'C:/Users/Slaven/Documents/Novgorod';

function readCsv(f) {
  const t = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '');
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [h, ...rest] = rows; return rest.filter((r) => r.length > 1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}
const F = (n) => path.join(DOM, 'fauna', n);
const mammals = readCsv(F('mammals.csv')), birds = readCsv(F('birds.csv')), pres = readCsv(F('wild_habitat_presence.csv'));
const cats = new Set(readCsv(F('fauna_categories.csv')).map((r) => r.category_id));
const srcIds = new Set(readCsv(F('sources.csv')).map((r) => r.source_id));
const checks = readCsv(F('taxa_checks.csv'));
const pfs = new Set(readCsv(path.join(GB, 'places-binding/places/place_families.csv')).map((r) => r.pf_id));
const SEASONS = ['winter', 'spring', 'summer', 'autumn'];
const LEVELS = { rare: 1, contextual: 2, common: 4, ubiquitous: 8 };
const errors = [], warnings = [];
const err = (m) => errors.push(m), warn = (m) => warnings.push(m);

// ids
const all = [...mammals, ...birds]; const ids = new Set();
for (const t of all) { if (ids.has(t.fa_id)) err('duplicate fa_id ' + t.fa_id); ids.add(t.fa_id); if (!/^fa_[mb]_[a-z0-9_]+$/.test(t.fa_id)) err('bad fa_id ' + t.fa_id); if (!cats.has(t.category_ref)) err('category_ref missing ' + t.category_ref); if (!t.source_refs) err('no source_refs ' + t.fa_id); if (t.status !== 'candidate') err('status not candidate ' + t.fa_id); }
const pids = new Set();
for (const p of pres) {
  if (pids.has(p.presence_id)) err('dup presence ' + p.presence_id); pids.add(p.presence_id);
  if (!ids.has(p.fa_id)) err('presence fa_id unknown ' + p.fa_id);
  if (!pfs.has(p.pf_id)) err('pf_id not in place_families ' + p.pf_id);
  if (!SEASONS.includes(p.season)) err('bad season ' + p.season);
  if (LEVELS[p.frequency_class] !== +p.weight) err('weight mismatch ' + p.presence_id);
  if (!cats.has(p.category_ref)) err('presence category missing ' + p.category_ref);
}
// source ids resolve
const srcTok = (s) => s.split(';').map((x) => x.split('#')[0]).filter((x) => x.startsWith('SRC_'));
for (const r of [...all, ...pres, ...checks]) for (const s of srcTok(r.source_refs || '')) if (!srcIds.has(s)) err('unknown source ' + s + ' in ' + (r.fa_id || r.presence_id || r.check_id));

// WK refs resolve against WK production-v1
const wkDir = path.join(MAIN, 'data/world-catalogs/novgorod/world-knowledge/production-v1');
const wk = new Set();
if (fs.existsSync(wkDir)) for (const f of fs.readdirSync(wkDir).filter((x) => x.endsWith('.json'))) { try { const j = JSON.parse(fs.readFileSync(path.join(wkDir, f), 'utf8')); for (const c of j.concepts || []) wk.add(c.concept_ref); for (const c of j.claims || []) wk.add(c.claim_ref); } catch (e) { /* skip */ } }
else warn('WK dir not found: ' + wkDir);
for (const t of all) for (const r of (t.wk_refs || '').split(';').filter(Boolean)) if (wk.size && !wk.has(r)) err('WK ref not found ' + r + ' (' + t.fa_id + ')');
// MASTER hunting refs resolve
const mi = fs.readFileSync(path.join(REPO, 'data/world-catalogs/novgorod/sources/master-archive-v1/data/canonical/material_items.csv'), 'utf8');
for (const t of mammals) for (const r of (t.hunting_method_refs || '').split(';').filter(Boolean)) if (!mi.includes(r + ',')) err('MASTER item not found ' + r);
for (const t of mammals) for (const r of (t.hunting_method_refs || '').split(';').filter(Boolean)) if (/hnt00(22|24|28)/.test(r)) err('D-rated MASTER hunting item used ' + r);

// Acceptance fauna_mammals
const presBy = (fa) => pres.filter((p) => p.fa_id === fa);
for (const t of mammals) {
  if (!['signs_tracks', 'signs_droppings', 'signs_feeding', 'signs_dens_nests', 'signs_sounds', 'signs_smell'].some((k) => t[k])) err('mammal without signs ' + t.fa_id);
  if (!presBy(t.fa_id).length) err('mammal without habitat_presence ' + t.fa_id);
}
const FOREST_RIPARIAN = ['pf_conifer_woodland', 'pf_mixed_woodland', 'pf_broadleaf_woodland', 'pf_forest_edge', 'pf_riverbank', 'pf_lake_shore', 'pf_marshy_stream', 'pf_river_channel', 'pf_floodplain_meadow', 'pf_bog'];
const mset = new Set(mammals.map((m) => m.fa_id));
const accM = {};
for (const pf of FOREST_RIPARIAN) for (const s of SEASONS) {
  const n = new Set(pres.filter((p) => p.pf_id === pf && p.season === s && mset.has(p.fa_id) && p.observable_signs && p.observable_signs !== 'none').map((p) => p.fa_id)).size;
  accM[pf + '/' + s] = n; if (n < 6) err(`fewer than 6 mammal taxa with signs in ${pf} ${s}: ${n}`);
}
for (const t of mammals.filter((m) => m.dormant_seasons.includes('winter'))) for (const p of presBy(t.fa_id).filter((p) => p.season === 'winter')) if (p.state !== 'dormant' || p.audible !== 'false' || p.activity_time !== 'dormant') err('hibernator active in winter ' + p.presence_id);

// Acceptance fauna_birds
if (birds.length < 40) err('fewer than 40 bird taxa: ' + birds.length);
for (const b of birds) { if (!b.voice_description) err('bird without voice ' + b.fa_id); for (const s of SEASONS) if (!b['migration_' + s]) err('bird migration missing ' + b.fa_id + ' ' + s); if (!presBy(b.fa_id).length) err('bird without presence ' + b.fa_id); }
const INTERIOR = new Set(['pf_dwelling_interior', 'pf_cellar_granary', 'pf_mill', 'pf_grain_drying_shed_ovin', 'pf_outbuildings', 'pf_threshing_barn', 'pf_church_interior', 'pf_ordinary_workshop', 'pf_bathhouse', 'pf_smithy']);
const bset = new Set(birds.map((b) => b.fa_id));
const openPfs = [...new Set(pres.map((p) => p.pf_id))].filter((pf) => !INTERIOR.has(pf));
const accB = {};
for (const pf of openPfs) for (const s of SEASONS) {
  if (pf === 'pf_winter_ice_crossing' && s !== 'winter') continue; // seasonal overlay exists only in winter
  const n = new Set(pres.filter((p) => p.pf_id === pf && p.season === s && bset.has(p.fa_id) && p.audible === 'true').map((p) => p.fa_id)).size;
  accB[pf + '/' + s] = n; if (n < 3) err(`fewer than 3 audible bird species in ${pf} ${s}: ${n}`);
}
const outdoorNotCovered = [...pfs].filter((pf) => !INTERIOR.has(pf) && !openPfs.includes(pf));
if (outdoorNotCovered.length) warn('outdoor place families without any fauna rows: ' + outdoorNotCovered.join(','));

// Regional list / heading checks (warnings, not failures)
for (const b of birds) { if (b.panteleev_2001_listed !== 'true') warn('bird not matched in Пантелеев 2001 list: ' + b.fa_id + ' ' + b.name_lat); }
// Anachronism: excluded taxa must not appear as rows
const excluded = checks.filter((c) => c.verdict === 'excluded_anachronism' || c.verdict.startsWith('excluded_')).map((c) => c.name_lat.toLowerCase());
for (const t of all) if (excluded.some((e) => e && t.name_lat.toLowerCase() === e)) err('excluded taxon present ' + t.fa_id);
const DENY = /(Nyctereutes|Ondatra|Neogale|Rattus norvegicus|Oryctolagus|Phasianus|Streptopelia decaocto|Cervus nippon)/;
for (const t of all) if (DENY.test(t.name_lat)) err('denylist taxon ' + t.fa_id);
// town rows for magpie/starling forbidden (SRC_ZIN2025)
const TOWN = new Set(['pf_town_street', 'pf_town_courtyard', 'pf_town_wall_edge', 'pf_market_square', 'pf_river_wharf', 'pf_churchyard', 'pf_monastery_yard']);
for (const p of pres) if (['fa_b_magpie', 'fa_b_starling'].includes(p.fa_id) && TOWN.has(p.pf_id)) err('later-medieval town coloniser placed in town ' + p.presence_id);

const report = {
  checked_by: 'scripts/validate.cjs', ok: errors.length === 0,
  counts: { mammals: mammals.length, birds: birds.length, presence_rows: pres.length, place_families_with_rows: new Set(pres.map((p) => p.pf_id)).size,
    presence_by_class: Object.fromEntries(Object.keys(LEVELS).map((k) => [k, pres.filter((p) => p.frequency_class === k).length])),
    presence_confidence: { B: pres.filter((p) => p.confidence === 'B').length, C: pres.filter((p) => p.confidence === 'C').length },
    taxa_presence_1230_confidence: ['A', 'B', 'C'].reduce((a, k) => ((a[k] = all.filter((t) => t.presence_1230_confidence === k).length), a), {}),
    birds_in_pantelev_2001: birds.filter((b) => b.panteleev_2001_listed === 'true').length, birds_petrov_1885: birds.filter((b) => b.petrov_1885_priilmenye === 'true').length },
  acceptance: { mammal_signs_min_per_forest_riparian_pf_season: Math.min(...Object.values(accM)), audible_birds_min_per_open_pf_season: Math.min(...Object.values(accB)) },
  errors, warnings,
};
fs.writeFileSync(path.join(DOM, 'validation-report.json'), JSON.stringify(report, null, 1) + '\n');
console.log(JSON.stringify({ ok: report.ok, counts: report.counts, acceptance: report.acceptance, errors: errors.length, warnings: warnings.length }, null, 1));
if (errors.length) { console.log(errors.slice(0, 40).join('\n')); process.exit(1); }
if (warnings.length) console.log(warnings.join('\n'));
// Post-check (warning): Мальчевский species heading epithet vs bird latin epithet (catches wrong mp numbers).
{
  const bad = [];
  for (const b of birds) {
    if (!b.malchevsky_heading_check) continue;
    const ep = (s) => (s.split(/\s+/)[1] || '').toLowerCase().replace(/^(korschun)$/, 'migrans');
    const cand = [b.name_lat, b.notes].join(' ').toLowerCase();
    if (!cand.includes(ep(b.malchevsky_heading_check).slice(0, 5))) bad.push(`${b.fa_id}: ${b.name_lat} vs heading ${b.malchevsky_heading_check}`);
  }
  if (bad.length) { console.log('malchevsky heading epithet mismatches (check synonyms):\n' + bad.join('\n')); }
}
