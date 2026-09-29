// Acceptance checks for the three flora domains (catalog game-base-v1). Exit 1 on any hard failure.
// Reads built CSVs in ../flora, WK bundle and place-first-cartography from the main checkout (read-only).
const { fs, path, ROOT, readTsv, readJson, months } = require('./lib.cjs');
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
const habitats = readJson(path.join(__dirname, 'src', 'habitats.json'));
const sourceRows = [readTsv('herbs.tsv'), readTsv('berries_fungi.tsv'), readTsv('cultivated.tsv')];
const woodyFoliage = readJson(path.join(__dirname, 'src', 'woody_foliage_state.json'));
const monthKeys = Array.from({ length: 12 }, (_, i) => String(i + 1));
const expectedFoliage = m => [12, 1, 2, 3].includes(m) ? 'leafless' : [4, 5].includes(m) ? 'leaf_out' : [6, 7, 8].includes(m) ? 'vegetative' : 'leaf_fall';
function checkSceneLayers(rows, authored) {
  const errors = [], ids = new Set(), output = Object.fromEntries(rows.map(r => [r.fl_id, r]));
  const scope = new Set(authored.filter(r => ['moss', 'lichen'].includes(r.group) && r.habitats.split(' ').some(h => habitats.habitats[h.split(':')[0]]?.pf.includes('conifer_woodland'))).map(r => r.id));
  for (const a of authored) {
    if (ids.has(a.id)) errors.push(`scene layer duplicate ${a.id}`);
    ids.add(a.id);
    const out = output[a.id];
    if (!out) { errors.push(`scene layer output missing ${a.id}`); continue; }
    if (!scope.has(a.id)) {
      if (a.scene_layer || out.scene_layer || out.scene_layer_refs || out.scene_layer_confidence) errors.push(`scene layer outside scope ${a.id}`);
      continue;
    }
    if (!a.scene_layer) errors.push(`scene layer missing ${a.id}`);
    const h = new Set(a.habitats.split(' ').map(t => t.split(':')[0]));
    const allowed = new Set(['no_source']);
    if (h.has('EPIPHYTE')) allowed.add('tree_bark');
    if (h.has('DEADWOOD')) allowed.add('stump_or_deadwood');
    if (h.has('PINEDRY') || h.has('CONIFER')) allowed.add('ground');
    if (!allowed.has(a.scene_layer)) errors.push(`scene layer unsupported ${a.id}: ${a.scene_layer}`);
    if (out.scene_layer !== a.scene_layer || out.scene_layer_refs !== out.source_refs || out.scene_layer_confidence !== a.conf) errors.push(`scene layer mismatch ${a.id}`);
  }
  if (output.fl_hb_hypogymnia_physodes?.scene_layer !== 'tree_bark' || !output.fl_hb_hypogymnia_physodes?.scene_layer_refs.includes('src:CHKHOBADZE2015')) errors.push('Hypogymnia physodes must be tree_bark with CHKHOBADZE2015');
  return errors;
}
function checkMonthly(tables) {
  const errors = [], gbif = readJson(path.join(__dirname, 'cache', 'gbif.json'));
  for (let t = 0; t < tables.length; t++) if (tables[t].length !== sourceRows[t].length) errors.push(`monthly row count ${t}`);
  for (let t = 0; t < tables.length; t++) for (let i = 0; i < sourceRows[t].length; i++) {
    const a = sourceRows[t][i], r = tables[t][i];
    if (!r || r.fl_id !== a.id) { errors.push(`monthly row mismatch ${a.id}`); continue; }
    const visible = new Set(months(a.vis));
    if (t === 1 && a.kind.startsWith('fungus') && a.vis !== '1-12') {
      const facet = gbif[a.name_lat]?.month_facet || {}, total = Object.values(facet).reduce((sum, n) => sum + n, 0);
      if (total >= 20) for (const [m, n] of Object.entries(facet)) if (n / total >= 0.1) visible.add(Number(m));
    }
    const flow = new Set(months(a.flow)), fruit = new Set(months(a[t === 0 ? 'fruit' : t === 1 ? 'ripe' : 'harvest']));
    let actual;
    try { actual = JSON.parse(r.phenology_by_month); } catch { errors.push(`monthly malformed ${a.id}`); continue; }
    if (!actual || Array.isArray(actual) || Object.keys(actual).length !== 12) { errors.push(`monthly shape ${a.id}`); continue; }
    for (let m = 1; m <= 12; m++) {
      const expected = !visible.has(m) ? 'not_visible' : flow.has(m) && fruit.has(m) ? 'flowering_and_fruiting' : fruit.has(m) ? (t === 2 ? 'ripe_or_harvest' : 'fruiting') : flow.has(m) ? 'flowering' : habitats.seasons.winter.includes(m) ? 'winter_form' : 'vegetative';
      if (actual[m] !== expected) errors.push(`monthly ${a.id} ${m}: ${actual[m]} != ${expected}`);
    }
  }
  return errors;
}
function checkWoodyCalendar(rows) {
  const errors = [];
  if (Object.keys(woodyFoliage).length !== 12 || monthKeys.some(k => !Object.hasOwn(woodyFoliage, k) || woodyFoliage[k] !== expectedFoliage(Number(k)))) errors.push('canonical woody foliage must cover months 1–12 with the agreed states');
  const trees = sourceRows[2].filter(r => r.life_form === 'tree' && r.allowed_1230 !== 'no');
  for (const t of trees) {
    const treeRows = rows.filter(r => r.fl_id === t.id);
    if (treeRows.length !== 12 || monthKeys.some(k => treeRows.filter(r => r.month === k).length !== 1)) { errors.push(`${t.id}: calendar must cover months 1–12 once`); continue; }
    const harvest = new Set(months(t.harvest)), flowers = new Set(months(t.flow));
    for (const row of treeRows) {
      const m = Number(row.month);
      let expected = { leafless: 'покой, голые деревья', leaf_out: 'распускание листвы', vegetative: 'в листве', leaf_fall: 'листопад' }[woodyFoliage[m]];
      if (harvest.has(m)) expected += ', сбор урожая';
      else if (flowers.has(m)) expected += ', цветение';
      else if (flowers.size && m < Math.min(...flowers) && woodyFoliage[m] === 'leaf_out') expected += ', бутоны';
      else if (flowers.size && harvest.size && m > Math.max(...flowers) && m < Math.min(...harvest)) expected += ', рост, завязи';
      else if (m > Math.max(...harvest) && woodyFoliage[m] === 'leaf_fall') expected = 'после сбора, ' + expected;
      if (row.field_state !== expected) errors.push(`${t.id}/${m}: ${row.field_state} != ${expected}`);
      if (woodyFoliage[m] === 'leaf_fall' && m > Math.max(...harvest) && !row.field_state.includes('после сбора')) errors.push(`${t.id}/${m}: post-harvest phase missing`);
    }
  }
  return errors;
}
fails.push(...checkSceneLayers(herbs, sourceRows[0]), ...checkMonthly([herbs, bf, cu]));
fails.push(...checkWoodyCalendar(cal));
const treeCalendarRow = cal.find(r => r.fl_id === 'fl_cu_prunus_cerasus' && r.month === '3');
if (!treeCalendarRow || !checkWoodyCalendar(cal.map(r => r === treeCalendarRow ? { ...r, field_state: 'распускание листвы' } : r)).some(e => e.includes('/3:'))) fail('woody March leafless probe failed');
const postHarvestRow = cal.find(r => r.fl_id === 'fl_cu_prunus_cerasus' && r.month === '9');
if (!postHarvestRow || !checkWoodyCalendar(cal.map(r => r === postHarvestRow ? { ...r, field_state: 'листопад' } : r)).some(e => e.includes('post-harvest phase missing'))) fail('woody post-harvest phase probe failed');
// Negative probes exercise the checker without changing the published CSVs.
const sceneSample = sourceRows[0].find(r => r.scene_layer);
if (!sceneSample) fail('scene layer probe has no fixture');
else {
  if (!checkSceneLayers(herbs.filter(r => r.fl_id !== sceneSample.id), sourceRows[0]).length) fail('scene layer deletion probe failed');
  if (!checkSceneLayers(herbs, sourceRows[0].map(r => r.id === sceneSample.id ? { ...r, scene_layer: '' } : r)).length) fail('scene layer authoring deletion probe failed');
  if (!checkSceneLayers(herbs, sourceRows[0].map(r => r.id === sceneSample.id ? { ...r, scene_layer: 'invalid' } : r)).length) fail('scene layer authoring value probe failed');
  if (!checkSceneLayers(herbs.map(r => r.fl_id === sceneSample.id ? { ...r, scene_layer: 'tree_bark' } : r), sourceRows[0]).length) fail('scene layer substitution probe failed');
}
if (!checkSceneLayers(herbs, sourceRows[0].map(r => r.id === 'fl_hb_dicranum_polysetum' ? { ...r, scene_layer: 'stump_or_deadwood' } : r)).some(e => e.includes('scene layer unsupported fl_hb_dicranum_polysetum'))) fail('scene layer CONIFER deadwood probe failed');
const overlap = sourceRows.flatMap((rows, t) => rows.map((r, i) => ({ r, i, t }))).find(({ r, t }) => months(r.flow).some(m => months(r[t === 0 ? 'fruit' : t === 1 ? 'ripe' : 'harvest']).includes(m) && months(r.vis).includes(m)));
if (!overlap) fail('monthly overlap probe has no fixture');
else {
  const m = months(overlap.r.flow).find(n => months(overlap.r[overlap.t === 0 ? 'fruit' : overlap.t === 1 ? 'ripe' : 'harvest']).includes(n) && months(overlap.r.vis).includes(n));
  const tables = [[...herbs], [...bf], [...cu]], row = tables[overlap.t][overlap.i];
  tables[overlap.t][overlap.i] = { ...row, phenology_by_month: JSON.stringify({ ...JSON.parse(row.phenology_by_month), [m]: 'flowering' }) };
  if (!checkMonthly(tables).length) fail('monthly overlap probe failed');
  tables[overlap.t][overlap.i] = { ...row, phenology_by_month: JSON.stringify({ ...JSON.parse(row.phenology_by_month), [m]: 'not_visible' }) };
  if (!checkMonthly(tables).length) fail('monthly month probe failed');
}

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
    dn_rice_local: { pos: ['местное выращивание риса', 'рисовая культура местная', 'рис на местной пашне', 'выращивание риса', 'Рис на местной пашне'], neg: ['привозной рис', 'импортная каша из риса', 'ирис', 'кипарис', 'нарисовал', 'рисовать', 'зарисовка', 'выращивание ирисов', 'касатик болотный (Iris pseudacorus)', 'местный ирис'] },
    dn_cucurbita: { pos: ['тыква', 'кабачок', 'Cucurbita pepo'], neg: ['горлянка', 'бутылочная тыква'] },
    dn_beta_sugar: { pos: ['сахарная свёкла', 'сахарной свеклы'], neg: ['сахар и свёкла'] },
    dn_carrot_orange: { pos: ['оранжевая морковь', 'оранжевой моркови'], neg: ['оранжевый и морковь'] },
    dn_capsicum: { pos: ['стручковый перец', 'паприка'], neg: ['чёрный перец'] },
  };
  deny.forEach((d, i) => {
    const t = DENY_TESTS[d.deny_id]; if (!t) return;
    for (const w of t.pos) if (!denyRu[i].test(w)) fail(`denylist self-test: ${d.deny_id} pattern should match "${w}"`);
    for (const w of t.neg) if (denyRu[i].test(w)) fail(`denylist self-test: ${d.deny_id} pattern falsely matches "${w}"`);
  });
}
for (const r of all) {
  const text = [r.name_ru, r.name_lat, r.uses, r.perceptual_cues].join(' ');
  deny.forEach((d, i) => { if (denyRu[i].test(r.name_ru) || r.name_lat.toLowerCase().startsWith(denyLat[i])) { if (!(r.allowed_1230 === 'no' && ['not_attested_1230', 'anachronism'].includes(d.deny_kind))) fail(`${r.fl_id}: denylisted ${d.deny_id}`); } else if (denyRu[i].test(text) && d.deny_kind === 'anachronism') fail(`${r.fl_id}: anachronism term ${d.deny_id} in uses/cues`); });
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

const report = { info, counts: { herbs: herbs.length, berries_mushrooms: bf.length, cultivated: cu.length, presence_rows: pres.length, refs_checked: nRefs }, family_coverage: famReport, fails, warns };
fs.writeFileSync(path.join(ROOT, 'flora', 'validation_report.json'), JSON.stringify(report, null, 1) + '\n');
console.log('refs', nRefs, 'fails', fails.length, 'warns', warns.length);
fails.forEach(f => console.log('FAIL', f)); warns.forEach(w => console.log('WARN', w));
console.log(JSON.stringify(famReport));
process.exit(fails.length ? 1 : 0);
