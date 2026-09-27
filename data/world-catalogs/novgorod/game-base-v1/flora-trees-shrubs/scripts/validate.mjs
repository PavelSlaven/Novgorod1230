// Acceptance checks for flora-trees-shrubs (catalog.json domain flora_trees_shrubs.acceptance_ru). Exit 1 on failure.
// Usage: node scripts/validate.mjs
import fs from 'node:fs';
import path from 'node:path';
import { REPO, OUT, REPORTS, src, readJson, readCsv, SEASONS, FOREST_PF } from './lib.mjs';

const taxa = readCsv(path.join(OUT, 'trees_shrubs.csv'));
const pres = readCsv(path.join(OUT, 'tree_habitat_presence.csv'));
const deny = readCsv(path.join(OUT, 'woody_denylist.csv'));
const kol = readCsv(path.join(OUT, 'wood_use_kolchin1968.csv'));
const cats = readCsv(path.join(OUT, 'woody_categories.csv'));
const sources = new Map(src('sources.json').sources.map((s) => [s.src_id, s]));
const pfIds = new Set(readCsv(path.join(REPO, 'data/world-catalogs/novgorod/game-base-v1/places-binding/places/place_families.csv')).map((r) => r.pf_id));
const freqRule = readJson(path.join(REPO, 'data/world-catalogs/novgorod/game-base-v1/places-binding/presence/frequency_rule.json'));
const bundle = readJson(path.join(REPO, 'data/world-catalogs/novgorod/world-knowledge/production-v1/runtime-bundle.json'));
const claimIds = new Set(bundle.claims.map((c) => c.claim_ref));

const checks = [];
const check = (name, failures) => checks.push({ name, ok: failures.length === 0, failures: failures.slice(0, 50), failure_count: failures.length });
const WEIGHT = { ubiquitous: 8, common: 4, contextual: 2, rare: 1 };

// 1. every taxon has >=1 presence row with existing pf_id and class in {8,4,2,1}
{
  const f = [];
  for (const t of taxa) if (!pres.some((p) => p.fl_id === t.fl_id)) f.push(`${t.fl_id}: no habitat_presence`);
  for (const p of pres) {
    if (!pfIds.has(p.pf_id)) f.push(`${p.presence_id}: unknown pf_id ${p.pf_id}`);
    if (![8, 4, 2, 1].includes(Number(p.weight)) || WEIGHT[p.frequency_class] !== Number(p.weight)) f.push(`${p.presence_id}: bad class/weight ${p.frequency_class}/${p.weight}`);
    if (!SEASONS.includes(p.season)) f.push(`${p.presence_id}: season ${p.season} not in dictionary`);
    const exp = Math.round(1000000 * Number(p.weight) / 8);
    if (Number(p.probability_ppm) !== exp || freqRule.classes[p.frequency_class].probability_ppm !== exp) f.push(`${p.presence_id}: ppm ${p.probability_ppm} != ${exp}`);
    if (!taxa.some((t) => t.fl_id === p.fl_id)) f.push(`${p.presence_id}: unknown fl_id`);
  }
  check('presence_rows_valid', f);
}
// 2. no duplicate (fl, pf, season); ids unique
{
  const f = []; const seen = new Set();
  for (const p of pres) { const k = `${p.fl_id}|${p.pf_id}|${p.season}`; if (seen.has(k)) f.push(`dup ${k}`); seen.add(k); }
  const ids = new Set(); for (const p of pres) { if (ids.has(p.presence_id)) f.push(`dup id ${p.presence_id}`); ids.add(p.presence_id); }
  const fl = new Set(); for (const t of taxa) { if (fl.has(t.fl_id)) f.push(`dup fl_id ${t.fl_id}`); fl.add(t.fl_id); if (!/^fl_ts_[a-z_]+$/.test(t.fl_id)) f.push(`bad fl_id ${t.fl_id}`); }
  check('ids_unique', f);
}
// 3. lat unique
{
  const f = []; const seen = new Set();
  for (const t of taxa) { const k = t.name_lat.toLowerCase(); if (seen.has(k)) f.push(`dup lat ${t.name_lat}`); seen.add(k); }
  check('lat_unique', f);
}
// 4. source_refs resolve
function resolve(ref) {
  if (ref.startsWith('wk:')) return claimIds.has(ref.slice(3)) || `wk claim not in runtime-bundle: ${ref}`;
  if (ref.startsWith('src:')) {
    const s = sources.get(ref.slice(4)); if (!s) return `unknown src ${ref}`;
    if (/^https?:\/\/\S+\.\S+/.test(s.url)) return true;
    if (s.url.startsWith('file:')) { const p = s.url.slice(5); const abs = path.isAbsolute(p) ? p : path.join(path.dirname(OUT), p); return fs.existsSync(abs) || `file missing ${p}`; }
    return `bad url for ${ref}`;
  }
  if (ref.startsWith('master:')) {
    const [p, id] = ref.slice(7).split('#'); const abs = path.join(REPO, p);
    if (!fs.existsSync(abs)) return `master file missing ${p}`;
    return fs.readFileSync(abs, 'utf8').includes(id) || `row ${id} not in ${p}`;
  }
  return `unknown ref scheme ${ref}`;
}
{
  const f = []; let n = 0;
  const all = [...taxa.map((t) => [t.fl_id, t.source_refs]), ...pres.map((p) => [p.presence_id, p.source_refs]), ...deny.map((d) => [d.deny_id, d.source_refs]), ...kol.map((k) => [k.wood_ru, k.source_refs])];
  for (const t of taxa) for (const u of JSON.parse(t.uses)) all.push([`${t.fl_id}/use:${u.use}`, u.refs.join(' ')]);
  for (const t of taxa) for (const h of JSON.parse(t.hazards)) all.push([`${t.fl_id}/hazard:${h.hazard}`, h.refs.join(' ')]);
  for (const [who, refs] of all) {
    const list = refs.split(/\s+/).filter(Boolean);
    if (!list.length) f.push(`${who}: empty source_refs`);
    for (const r of list) { n++; const ok = resolve(r); if (ok !== true) f.push(`${who}: ${ok}`); }
  }
  check('source_refs_resolve', f);
  checks[checks.length - 1].refs_checked = n;
}
// 5. no denylist taxa among taxa (lat genus/species or ru keyword)
{
  const f = [];
  for (const t of taxa) for (const d of deny) {
    const dl = d.name_lat.toLowerCase(); const tl = t.name_lat.toLowerCase();
    if (tl === dl || (!dl.includes(' ') && tl.split(' ')[0] === dl)) f.push(`${t.fl_id} matches denylist ${d.name_lat}`);
    for (const k of d.keywords_ru.split(';').filter(Boolean)) if (` ${t.name_ru} `.toLowerCase().includes(k)) f.push(`${t.fl_id} name_ru contains denylist keyword '${k}'`);
  }
  check('no_denylist_taxa', f);
}
// 6. each forest pf has >=5 woody taxa per season
{
  const f = []; const counts = {};
  for (const pf of FOREST_PF) for (const s of SEASONS) {
    const n = new Set(pres.filter((p) => p.pf_id === pf && p.season === s).map((p) => p.fl_id)).size;
    counts[`${pf}/${s}`] = n; if (n < 5) f.push(`${pf}/${s}: ${n} < 5`);
  }
  check('forest_pf_min5_per_season', f);
  checks[checks.length - 1].counts = counts;
}
// 7. every taxon has phenology for all seasons, row has confidence and status candidate
{
  const f = [];
  for (const t of taxa) {
    const ph = JSON.parse(t.phenology_by_season);
    for (const s of SEASONS) if (!Array.isArray(ph[s]) || !ph[s].length) f.push(`${t.fl_id}: phenology missing ${s}`);
    if (!['A', 'B', 'C'].includes(t.confidence)) f.push(`${t.fl_id}: confidence`);
    if (t.status !== 'candidate') f.push(`${t.fl_id}: status ${t.status}`);
  }
  for (const p of pres) if (!['A', 'B', 'C'].includes(p.confidence) || p.status !== 'candidate') f.push(`${p.presence_id}: confidence/status`);
  check('phenology_confidence_status', f);
}
// 8. categories: stable_code unique, parent exists, every taxon has a category
{
  const f = []; const ids = new Set(cats.map((c) => c.category_id)); const codes = new Set();
  for (const c of cats) { if (codes.has(c.stable_code)) f.push(`dup code ${c.stable_code}`); codes.add(c.stable_code); if (c.parent_category_id && !ids.has(c.parent_category_id)) f.push(`${c.category_id}: parent missing`); }
  for (const t of taxa) if (!codes.has(t.category_code)) f.push(`${t.fl_id}: category ${t.category_code} missing`);
  check('categories_consistent', f);
}
// 9. Kolchin table sums to declared total 909
{
  const sum = kol.reduce((a, r) => a + Number(r.artefact_count), 0);
  check('kolchin_table1_sum_909', sum === 909 ? [] : [`sum ${sum}`]);
}

const ok = checks.every((c) => c.ok);
const report = { generated_by: 'scripts/validate.mjs', ok, taxa: taxa.length, presence_rows: pres.length, checks };
fs.mkdirSync(REPORTS, { recursive: true });
fs.writeFileSync(path.join(REPORTS, 'validate-report.json'), JSON.stringify(report, null, 2) + '\n');
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.name}${c.failure_count ? ` (${c.failure_count})` : ''}${c.refs_checked ? ` refs=${c.refs_checked}` : ''}`);
if (!ok) { for (const c of checks) if (!c.ok) console.log(c.name, c.failures); process.exit(1); }
