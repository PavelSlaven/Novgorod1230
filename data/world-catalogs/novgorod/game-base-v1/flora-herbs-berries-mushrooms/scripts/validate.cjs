// Acceptance checks for the three flora domains (catalog game-base-v1). Exit 1 on any hard failure.
// Reads built CSVs in ../flora, WK bundle and place-first-cartography from the main checkout (read-only).
const { fs, path, ROOT, readTsv, readJson } = require('./lib.cjs');
const MAIN = process.env.NOVGOROD_MAIN || 'C:/Users/Slaven/Documents/Novgorod';
const WKDIR = path.join(MAIN, 'data/world-catalogs/novgorod/world-knowledge');
const GB = path.resolve(ROOT, '..', '..'); // data/world-catalogs/novgorod
function parseCsv(file) {
  const t = fs.readFileSync(path.join(ROOT, file), 'utf8'); const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) { const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch; }
  const head = rows.shift(); return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
const fails = [], warns = [], info = [];
const fail = m => fails.push(m), warn = m => warns.push(m);
const herbs = parseCsv('flora/herbs_mosses_aquatic.csv'), bf = parseCsv('flora/berries_mushrooms.csv'), cu = parseCsv('flora/cultivated_plants.csv');
const pres = parseCsv('flora/flora_habitat_presence.csv'), deny = parseCsv('flora/anachronism_denylist_flora.csv'), cal = parseCsv('flora/field_state_calendar.csv');
const all = [...herbs, ...bf, ...cu];
const byId = Object.fromEntries(all.map(r => [r.fl_id, r]));

// 1. ids unique, prefix, lat unique within table
for (const [n, t] of [['herbs', herbs], ['bf', bf], ['cu', cu]]) {
  const ids = new Set(), lats = new Set();
  for (const r of t) { if (ids.has(r.fl_id)) fail(`dup id ${r.fl_id}`); ids.add(r.fl_id); if (lats.has(r.name_lat)) fail(`dup lat ${n} ${r.name_lat}`); lats.add(r.name_lat);
    if (!/^fl_(hb|br|fu|cu)_[a-z0-9_]+$/.test(r.fl_id)) fail('bad id ' + r.fl_id);
    if (!/^[ABC]$/.test(r.confidence)) fail('bad confidence ' + r.fl_id);
    if (!r.source_refs) fail('no source_refs ' + r.fl_id);
    if (r.status !== 'candidate') fail('status not candidate ' + r.fl_id); }
}
// 2. pf ids exist in WK place-first-cartography
const pfc = readJson(path.join(WKDIR, 'production-v1/place-first-cartography.json'));
const pfIds = new Set(pfc.environment_families.map(f => f.id));
for (const p of pres) { if (!pfIds.has(p.pf_id)) fail('unknown pf ' + p.pf_id); if (!['8', '4', '2', '1'].includes(p.weight)) fail('bad weight ' + p.fp_id); if (!byId[p.fl_id]) fail('presence for unknown taxon ' + p.fl_id); }
// 3. references resolve
const bundle = readJson(path.join(WKDIR, 'production-v1/runtime-bundle.json'));
const claimIds = new Set(bundle.claims.map(c => c.claim_ref));
const srcIds = new Set(readTsv('sources.tsv').map(s => s.src_id));
const ingCsv = fs.readFileSync(path.join(GB, 'sources/master-archive-v1/data/normalized_source_tables/food_system/ingredients.csv'), 'utf8');
const ingIds = new Set((ingCsv.match(/^\uFEFF?ING\d{4}/gm) || []).map(s => s.replace('\uFEFF', '')));
const wiki = readJson(path.join(__dirname, 'cache', 'wiki.json'));
let nRefs = 0;
for (const r of [...all, ...deny.map(d => ({ fl_id: d.deny_id, source_refs: d.refs }))]) for (const ref of r.source_refs.split(' ; ').filter(Boolean)) {
  nRefs++;
  if (ref.startsWith('wk:claim:')) { if (!claimIds.has(ref.slice(3))) fail(`${r.fl_id}: WK claim not in bundle ${ref}`); }
  else if (ref.startsWith('src:')) { if (!srcIds.has(ref.slice(4))) fail(`${r.fl_id}: unknown source ${ref}`); }
  else if (ref.startsWith('master:')) { const id = ref.split('#')[1]; if (!ingIds.has(id)) fail(`${r.fl_id}: MASTER ingredient missing ${id}`); }
  else if (ref.startsWith('main:')) { const [p, a] = ref.slice(5).split('#'); const f = path.join(MAIN, p); if (!fs.existsSync(f)) fail(`${r.fl_id}: research file missing ${p}`); else if (a && !fs.readFileSync(f, 'utf8').includes(a)) fail(`${r.fl_id}: anchor ${a} not in ${p}`); }
  else if (ref.startsWith('https://www.gbif.org/species/')) { /* key from cache/gbif.json */ }
  else if (ref.startsWith('https://en.wikipedia.org/')) { if (wiki[ref] !== 200) fail(`${r.fl_id}: wiki not 200 ${ref}`); }
  else if (/^https?:/.test(ref)) { if (wiki[ref] !== 200) warn(`${r.fl_id}: url status ${wiki[ref]} ${ref}`); }
  else fail(`${r.fl_id}: unparsed ref ${ref}`);
}
// 4. lookalike ids resolve; poisonous taxa have toxicity + lookalikes
for (const r of all) {
  for (const id of r.lookalike_ids.split(' ').filter(Boolean)) if (!byId[id]) fail(`${r.fl_id}: lookalike ${id} unknown`);
  if (r.edibility === 'poisonous' && (!r.toxicity || !r.lookalikes)) (r.fl_id.startsWith('fl_hb_') ? fail : warn)(`poisonous without toxicity/lookalikes: ${r.fl_id}`);
}
// 5. herbs: per habitat family >=8 understorey taxa in summer, >=3 visible in winter
const FAM = { bog: ['bog', 'marshy_stream'], meadow: ['floodplain_meadow', 'hay_meadow', 'pasture'], riparian: ['riverbank', 'lake_shore'], forest: ['conifer_woodland', 'mixed_woodland', 'broadleaf_woodland', 'forest_edge'] };
const herbPres = pres.filter(p => p.table === 'herbs');
const famReport = {};
for (const [fam, pfs] of Object.entries(FAM)) for (const pf of pfs) {
  const s = new Set(herbPres.filter(p => p.pf_id === pf && p.season === 'summer').map(p => p.fl_id)).size;
  const w = new Set(herbPres.filter(p => p.pf_id === pf && p.season === 'winter').map(p => p.fl_id)).size;
  famReport[pf] = { family: fam, summer: s, winter: w };
  if (s < 8) fail(`${pf}: only ${s} understorey taxa in summer`); if (w < 3) fail(`${pf}: only ${w} taxa visible in winter`);
}
// 6. berries/fungi: ripening months in 1..12, allowed seasons consistent, refresh_class, edible fungus <-> poisonous lookalike link
const SEAS = readJson(path.join(__dirname, 'src', 'habitats.json')).seasons;
for (const r of bf) {
  const rm = r.ripening_months.split(' ').filter(Boolean).map(Number);
  if (!rm.length || rm.some(m => !(m >= 1 && m <= 12))) fail(`${r.fl_id}: ripening_months invalid`);
  const exp = Object.keys(SEAS).filter(s => SEAS[s].some(m => rm.includes(m))).join(' ');
  if (exp !== r.allowed_seasons) fail(`${r.fl_id}: allowed_seasons ${r.allowed_seasons} != ${exp}`);
  const presSeasons = new Set(pres.filter(p => p.fl_id === r.fl_id).map(p => p.season));
  for (const s of r.allowed_seasons.split(' ')) if (!presSeasons.has(s)) fail(`${r.fl_id}: ripening season ${s} absent from presence`);
  if (r.refresh_class !== 'season') fail(`${r.fl_id}: refresh_class`);
  if (r.gbif_nw_obs_months) { const g = r.gbif_nw_obs_months.split(' ').map(Number); const miss = g.filter(m => !r.visible_months.split(' ').map(Number).includes(m)); if (miss.length) warn(`${r.fl_id}: GBIF NW observation months ${miss} outside visible_months ${r.visible_months}`); }
}
for (const p of bf.filter(r => r.kind === 'fungus' && r.edibility === 'poisonous')) for (const e of p.lookalike_ids.split(' ').filter(Boolean)) {
  const ed = byId[e]; if (ed && ed.kind === 'fungus' && /^edible/.test(ed.edibility) && !ed.lookalike_ids.split(' ').includes(p.fl_id)) fail(`edible ${e} lacks back-link to poisonous lookalike ${p.fl_id}`);
}
for (const r of bf.filter(r => r.kind === 'fungus' && /^edible/.test(r.edibility))) if (!r.lookalike_ids) warn(`edible fungus without any lookalike: ${r.fl_id}`);
// 7. cultivated: denylist absent; sowing/harvest periods; attestation or C with note
// patterns use \p{L} Unicode property escapes for word boundaries (JS \b is ASCII-only and
// silently fails to match Cyrillic words), so they must be compiled with the 'u' flag.
const denyRu = deny.map(d => new RegExp(d.pattern_ru, 'iu')), denyLat = deny.map(d => d.pattern_lat.toLowerCase());
// regression test for the Unicode-boundary fix: positive words must match, negative words
// (false positives under naive substring or ASCII \b matching) must not.
{
  const DENY_TESTS = {
    dn_glycine_max: { pos: ['соя', 'соевое масло', 'каша из сои'], neg: ['стоя', 'настоящий'] },
    dn_acorus_calamus: { pos: ['аир', 'аир болотный', 'корень аира'], neg: ['заир', 'наираз'] },
    dn_tea: { pos: ['чай', 'чаю крепкого', 'чая', 'чаепитие'], neg: ['стоячая', 'жгучая', 'непахучая', 'иван-чай узколистный (кипрей)'] },
    dn_rice_local: { pos: ['рис', 'каша из риса', 'рисовая'], neg: ['ирис', 'кипарис'] },
  };
  deny.forEach((d, i) => {
    const t = DENY_TESTS[d.deny_id]; if (!t) return;
    for (const w of t.pos) if (!denyRu[i].test(w)) fail(`denylist self-test: ${d.deny_id} pattern should match "${w}"`);
    for (const w of t.neg) if (denyRu[i].test(w)) fail(`denylist self-test: ${d.deny_id} pattern falsely matches "${w}"`);
  });
}
for (const r of all) {
  const text = [r.name_ru, r.name_lat, r.uses, r.perceptual_cues].join(' ');
  deny.forEach((d, i) => { if (denyRu[i].test(r.name_ru) || r.name_lat.toLowerCase().startsWith(denyLat[i])) { if (!(r.allowed_1230 === 'no' && d.deny_kind === 'not_attested_1230')) fail(`${r.fl_id}: denylisted ${d.deny_id}`); } else if (denyRu[i].test(text) && d.deny_kind === 'anachronism') fail(`${r.fl_id}: anachronism term ${d.deny_id} in uses/cues`); });
}
for (const r of cu.filter(r => !r.crop_kind.startsWith('weed'))) {
  if (r.allowed_1230 === 'no') { if (pres.some(p => p.fl_id === r.fl_id)) fail(`${r.fl_id}: disallowed crop has presence`); continue; }
  if (!r.sowing_months || !r.harvest_months) fail(`${r.fl_id}: sowing/harvest missing`);
  if (!r.archaeobotanical_attestation && r.confidence !== 'C') fail(`${r.fl_id}: no attestation and not C`);
  if (r.confidence === 'C' && !r.notes && !r.archaeobotanical_attestation) fail(`${r.fl_id}: C without note`);
  if (!cal.some(c => c.fl_id === r.fl_id)) fail(`${r.fl_id}: no field calendar`);
}
for (const n of ['Zea mays', 'Glycine max', 'Solanum tuberosum', 'Helianthus annuus', 'Solanum lycopersicum']) if (all.some(r => r.name_lat === n)) fail('denylisted crop present ' + n);
// 7b. source-claim cross-checks against extracted caches (extract-sources.py)
const kal = readJson(path.join(__dirname, 'cache', 'kalinina2020.json')).entries;
for (const r of bf.filter(r => r.source_refs.includes('src:KALININA2020'))) {
  const k = kal[r.name_lat];
  if (!k) fail(`${r.fl_id}: cites KALININA2020 but species not in extracted list`);
  else if (/Новгородская обл/.test(r.evidence_1230) && !k.novgorod_record) fail(`${r.fl_id}: claims Novgorod record, thesis has none`);
}
const kir = readJson(path.join(__dirname, 'cache', 'kiryanova1979.json')).tables;
const nov2 = (kir.table_2 || {})['Новгород'] || {};
const KIRCOL = { fl_cu_secale_cereale: 'Рожь', fl_cu_triticum_aestivum: 'Пшеница', fl_cu_hordeum_vulgare: 'Ячмень', fl_cu_avena_sativa: 'Овес', fl_cu_panicum_miliaceum: 'Просо', fl_cu_vicia_faba: 'Бобы', fl_cu_pisum_sativum: 'Горох', fl_cu_lens_culinaris: 'Чечевица', fl_cu_cannabis_sativa: 'Конопля' };
for (const [id, col] of Object.entries(KIRCOL)) if (!nov2[col]) fail(`${id}: Kiryanova table 2 Novgorod lacks ${col}`);
if (nov2['Гречиха']) fail('Kiryanova table 2 unexpectedly lists buckwheat for Novgorod');
info.push({ kiryanova_table2_novgorod: nov2 });
// 8. GBIF regional check (warning only: modern occurrence in NW bbox)
for (const r of all) if (r.gbif_nw_count === '0') warn(`${r.fl_id}: 0 GBIF occurrences in NW bbox`);

const report = { info, checked_at: new Date().toISOString().slice(0, 10), counts: { herbs: herbs.length, berries_mushrooms: bf.length, cultivated: cu.length, presence_rows: pres.length, refs_checked: nRefs }, family_coverage: famReport, fails, warns };
fs.writeFileSync(path.join(ROOT, 'flora', 'validation_report.json'), JSON.stringify(report, null, 1) + '\n');
console.log('refs', nRefs, 'fails', fails.length, 'warns', warns.length);
fails.forEach(f => console.log('FAIL', f)); warns.forEach(w => console.log('WARN', w));
console.log(JSON.stringify(famReport));
process.exit(fails.length ? 1 : 0);
