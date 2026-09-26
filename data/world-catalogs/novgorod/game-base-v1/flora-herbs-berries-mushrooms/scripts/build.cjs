// Build candidate flora tables (herbs/mosses/lichens/aquatic, berries/fungi, cultivated/weeds) from scripts/src/*.tsv.
// Deterministic: inputs = src/*.tsv, src/habitats.json, cache/gbif.json, cache/wiki.json. No model judgement here.
const { fs, path, ROOT, SRC, readTsv, months, writeCsv, wikiUrl, readJson } = require('./lib.cjs');
const H = readJson(path.join(SRC, 'habitats.json'));
const gbif = readJson(path.join(__dirname, 'cache', 'gbif.json'));
const SEASONS = Object.keys(H.seasons);
const W2C = { 8: 'ubiquitous', 4: 'common', 2: 'contextual', 1: 'rare' };
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const REGION = 'region_novgorod_land';
const RES = 'main:data/world-catalogs/novgorod/world-knowledge/research/';
const MASTER = 'data/world-catalogs/novgorod/sources/master-archive-v1/data/normalized_source_tables/food_system/ingredients.csv#';

const mRange = ms => { // [6,7,8] -> "VI–VIII"; handles wrap and gaps
  if (!ms.length) return '';
  const set = new Set(ms), runs = []; let used = new Set();
  for (const m of ms) { if (used.has(m)) continue; let a = m; while (set.has(a === 1 ? 12 : a - 1) && !used.has(a === 1 ? 12 : a - 1) && (a === 1 ? 12 : a - 1) !== m) a = a === 1 ? 12 : a - 1;
    let b = a, run = [a]; used.add(a); while (set.has(b % 12 + 1) && !used.has(b % 12 + 1)) { b = b % 12 + 1; used.add(b); run.push(b); } runs.push(run); }
  return runs.map(r => r.length === 1 ? ROMAN[r[0]] : ROMAN[r[0]] + '–' + ROMAN[r[r.length - 1]]).join(', ');
};
const seasonsOf = ms => SEASONS.filter(s => H.seasons[s].some(m => ms.includes(m)));

function expandRefs(refs, lat) {
  const out = [];
  for (const t of refs.split(/\s+/).filter(Boolean)) {
    if (t === 'gbif') { const g = gbif[lat]; if (g && g.usageKey) out.push('https://www.gbif.org/species/' + g.usageKey); }
    else if (t === 'wiki') out.push(wikiUrl(lat));
    else if (/^https?:/.test(t)) out.push(t);
    else if (t.startsWith('res:')) out.push(RES + t.slice(4));
    else if (t.startsWith('master:')) out.push('master:' + MASTER + t.slice(7));
    else out.push(t); // wk:claim:..., src:ID
  }
  return out.join(' ; ');
}
function habitats(spec) {
  const pf = {};
  for (const tok of (spec || '').split(/\s+/).filter(Boolean)) {
    const [h, w] = tok.split(':'); if (!H.habitats[h]) throw new Error('unknown habitat ' + h);
    for (const p of H.habitats[h].pf) pf[p] = Math.max(pf[p] || 0, +w);
  }
  return pf;
}
function phenology(r, vis, flow, fruit, fruitWord) {
  const o = {};
  for (const s of SEASONS) {
    const sm = H.seasons[s], parts = [];
    const f = flow.filter(m => sm.includes(m)), p = fruit.filter(m => sm.includes(m));
    if (f.length) parts.push('цветёт/колосится (' + mRange(f) + ')');
    if (p.length) parts.push(fruitWord + ' (' + mRange(p) + ')');
    const v = vis.filter(m => sm.includes(m));
    if (!parts.length) {
      if (!v.length) parts.push('надземной части не видно (' + (s === 'winter' ? 'под снегом или отмерла' : 'ещё не появилась или отмерла') + ')');
      else if (s === 'winter') parts.push(r.winter_look || 'зимний облик: см. perceptual_cues');
      else parts.push('вегетирует');
    } else if (s === 'winter' && r.winter_look) parts.push(r.winter_look);
    o[s] = parts.join('; ');
  }
  return o;
}
const lookIds = t => [...new Set((t || '').match(/fl_[a-z]{2}_[a-z0-9_]+/g) || [])];
const EDIB = { fresh: 'edible_fresh', after_processing_only: 'edible_after_processing', famine_only: 'famine_food', none: 'not_food' };
function edibility(r) {
  if (EDIB[r.edib]) return EDIB[r.edib];
  if (r.edib === 'no') return r.tox && r.tox !== '—' && r.tox !== 'нет' ? 'poisonous' : 'not_food_lookalike_risk';
  return r.edib;
}
const YIELD_NOTE = 'ед. сбора для материализации; количество задаёт код';

const presence = []; // long form
function base(r, table, fruitCol, fruitWord) {
  let vis = months(r.vis);
  // fungi: visible (fruiting-body) months = authored months U GBIF NW months with >=10% of records (n>=20)
  if ((r.kind || '').startsWith('fungus') && !(r.vis === '1-12')) { const gm = gbifMonths(r.name_lat); if (gm) vis = [...new Set([...vis, ...gm.split(' ').map(Number)])].sort((a, b) => a - b); }
  const flow = months(r.flow), fruit = months(r[fruitCol]);
  const pf = habitats(r.habitats);
  const seas = seasonsOf(vis);
  for (const [p, w] of Object.entries(pf).sort()) for (const s of seas) {
    const sm = H.seasons[s];
    const state = fruit.some(m => sm.includes(m)) ? (table === 'cultivated' ? 'ripe_or_harvest' : 'fruiting') : flow.some(m => sm.includes(m)) ? 'flowering' : s === 'winter' ? 'winter_form' : 'vegetative';
    presence.push({ region_id: REGION, fl_id: r.id, table, pf_id: p, season: s, frequency_class: W2C[w], weight: w, visible_state: state, confidence: r.conf, basis: 'habitat_class ' + r.habitats + ' -> ' + p + ' (max); season from visible months ' + mRange(vis), status: 'candidate' });
  }
  const g = gbif[r.name_lat] || {};
  return {
    fl_id: r.id, name_ru: r.name_ru, name_lat: r.name_lat, name_en: r.name_en,
    region_id: '', universal_taxon: 'true', category_ref: 'proposed:flora/' + (r.group || r.kind || r.crop_kind),
    life_form: r.life_form,
    habitat_classes: r.habitats,
    habitat_presence: Object.entries(pf).sort().map(([p, w]) => `${p}:${W2C[w]}`).join('; ') + (seas.length ? ' | seasons: ' + seas.join(',') : ''),
    visible_months: vis.join(' '), flowering_months: flow.join(' '),
    phenology_by_season: JSON.stringify(phenology(r, vis, flow, fruit, fruitWord)),
    winter_look: r.winter_look, perceptual_cues: r.cues,
    uses: r.uses === '—' ? '' : r.uses,
    toxicity: r.tox === '—' ? '' : r.tox, lookalike_ids: lookIds(r.look).join(' '), lookalikes: r.look === '—' ? '' : r.look,
    edibility: edibility(r), yield_unit: r.yield === '—' ? '' : r.yield, yield_note: r.yield && r.yield !== '—' ? YIELD_NOTE : '',
    evidence_1230: r.ev, source_refs: expandRefs(r.refs, r.name_lat), confidence: r.conf,
    gbif_usage_key: g.usageKey || '', gbif_nw_count: g.nw_count == null ? '' : g.nw_count,
    status: 'candidate', notes: r.notes,
  };
}

// herbs, mosses, lichens, aquatic
const herbs = readTsv('herbs.tsv').map(r => Object.assign(base(r, 'herbs', 'fruit', 'плодоносит/спороносит'), { group: r.group, fruiting_months: months(r.fruit).join(' '), medicinal_practice_epoch: /лечебн|народная практика/.test(r.uses) ? r.uses.split(';').filter(u => /лечебн|народная практика/.test(u)).join(';') : 'не засвидетельствовано для Новгорода XIII в.' }));
const HCOLS = ['fl_id', 'name_ru', 'name_lat', 'name_en', 'group', 'life_form', 'region_id', 'universal_taxon', 'category_ref', 'habitat_classes', 'habitat_presence', 'visible_months', 'flowering_months', 'fruiting_months', 'phenology_by_season', 'winter_look', 'perceptual_cues', 'uses', 'medicinal_practice_epoch', 'toxicity', 'lookalike_ids', 'lookalikes', 'edibility', 'yield_unit', 'yield_note', 'evidence_1230', 'source_refs', 'confidence', 'gbif_usage_key', 'gbif_nw_count', 'status', 'notes'];
writeCsv('flora/herbs_mosses_aquatic.csv', herbs, HCOLS);

// berries and fungi
function gbifMonths(lat) { return gbifMonthsImpl(lat); }
const gbifMonthsImpl = lat => { const g = gbif[lat]; if (!g || !g.month_facet) return ''; const tot = Object.values(g.month_facet).reduce((a, b) => a + b, 0); if (tot < 20) return ''; return Object.entries(g.month_facet).filter(([m, c]) => c / tot >= 0.1).map(([m]) => +m).sort((a, b) => a - b).join(' '); };
const bf = readTsv('berries_fungi.tsv').map(r => {
  const b = base(r, 'berries_fungi', 'ripe', r.kind === 'berry' ? 'ягоды созревают' : 'плодовые тела');
  const ripe = months(r.ripe);
  return Object.assign(b, { kind: r.kind.startsWith('fungus') ? 'fungus' : 'berry', subkind: r.kind, ripening_months: ripe.join(' '), ripening_period: mRange(ripe), allowed_seasons: seasonsOf(ripe).join(' '), refresh_class: 'season', preparation_needed: r.prep === '—' ? '' : r.prep, food_ingredient_ref: r.food && r.food !== '—' ? 'master:' + MASTER + r.food.replace(/^master:/, '') : '', gbif_nw_obs_months: gbifMonths(r.name_lat), medicinal_practice_epoch: 'не засвидетельствовано для Новгорода XIII в.' });
});
const BCOLS = ['fl_id', 'name_ru', 'name_lat', 'name_en', 'kind', 'subkind', 'life_form', 'region_id', 'universal_taxon', 'category_ref', 'habitat_classes', 'habitat_presence', 'ripening_months', 'ripening_period', 'allowed_seasons', 'refresh_class', 'visible_months', 'flowering_months', 'phenology_by_season', 'winter_look', 'perceptual_cues', 'uses', 'medicinal_practice_epoch', 'edibility', 'toxicity', 'lookalike_ids', 'lookalikes', 'preparation_needed', 'yield_unit', 'yield_note', 'food_ingredient_ref', 'evidence_1230', 'source_refs', 'confidence', 'gbif_usage_key', 'gbif_nw_count', 'gbif_nw_obs_months', 'status', 'notes'];
writeCsv('flora/berries_mushrooms.csv', bf, BCOLS);

// cultivated crops and arable weeds
const calendar = [];
const cu = readTsv('cultivated.tsv').map(r => {
  const b = base(r, 'cultivated', 'harvest', 'созревание и уборка');
  const sow = months(r.sow), harv = months(r.harvest), flow = months(r.flow);
  const isCrop = !r.crop_kind.startsWith('weed');
  const perennial = /orchard|vine/.test(r.crop_kind);
  const winterCrop = r.crop_kind === 'cereal_winter';
  let look = {};
  if (isCrop && r.allowed_1230 !== 'no' && harv.length) {
    for (let m = 1; m <= 12; m++) {
      let st;
      if (harv.includes(m)) st = perennial ? 'сбор урожая' : 'созревание, жатва/уборка';
      else if (sow.includes(m)) st = winterCrop ? 'сев озимых, всходы' : 'сев, всходы';
      else if (flow.includes(m)) st = perennial ? 'цветение' : 'цветение/колошение';
      else if (perennial) {
        // non-winter months outside flowering/harvest: before first bloom = budding,
        // after last harvest = post-harvest/leaf-fall, otherwise fruit is still developing.
        if (H.seasons.winter.includes(m)) st = 'покой, голые растения';
        else if (flow.length && m < Math.min(...flow)) st = 'распускание, бутоны';
        else if (harv.length && m > Math.max(...harv)) st = 'после сбора, листопад';
        else st = 'рост, завязи';
      }
      else {
        // growing window: from sow to harvest (cyclic)
        const s0 = sow[0], h0 = harv[0];
        const inGrow = s0 && ((s0 < h0 && m > s0 && m < h0) || (s0 > h0 && (m > s0 || m < h0)));
        if (inGrow) st = winterCrop && H.seasons.winter.includes(m) ? 'озимь под снегом' : winterCrop && m < h0 ? 'озимь отрастает' : 'всходы и рост';
        else st = H.seasons.winter.includes(m) ? 'поле под снегом (жнивьё или пар)' : 'жнивьё или пар';
      }
      calendar.push({ fl_id: r.id, name_ru: r.name_ru, month: m, month_roman: ROMAN[m], season: SEASONS.find(s => H.seasons[s].includes(m)), field_state: st, rule: 'derived: sow=' + (mRange(sow) || 'perennial') + ' flow=' + mRange(flow) + ' harvest=' + mRange(harv), confidence: 'C', status: 'candidate' });
    }
    for (const s of SEASONS) look[s] = [...new Set(calendar.filter(c => c.fl_id === r.id && c.season === s).map(c => c.field_state))].join(' → ');
  }
  return Object.assign(b, { crop_kind: r.crop_kind, allowed_1230: r.allowed_1230, sowing_months: perennial ? 'perennial' : sow.join(' '), sowing_period: perennial ? 'многолетник (не сеется ежегодно)' : mRange(sow), harvest_months: harv.join(' '), harvest_period: mRange(harv), field_look_by_season: Object.keys(look).length ? JSON.stringify(look) : '', archaeobotanical_attestation: r.archaeobot, place_family_refs: Object.keys(habitats(r.habitats)).sort().join(' '), food_ingredient_ref: r.food && r.food !== '—' ? 'master:' + MASTER + r.food.replace(/^master:/, '') : '', medicinal_practice_epoch: 'не засвидетельствовано для Новгорода XIII в.' });
});
const CCOLS = ['fl_id', 'name_ru', 'name_lat', 'name_en', 'crop_kind', 'life_form', 'allowed_1230', 'region_id', 'universal_taxon', 'category_ref', 'habitat_classes', 'habitat_presence', 'place_family_refs', 'sowing_months', 'sowing_period', 'harvest_months', 'harvest_period', 'flowering_months', 'visible_months', 'field_look_by_season', 'phenology_by_season', 'winter_look', 'perceptual_cues', 'uses', 'medicinal_practice_epoch', 'edibility', 'toxicity', 'lookalike_ids', 'lookalikes', 'yield_unit', 'yield_note', 'food_ingredient_ref', 'archaeobotanical_attestation', 'evidence_1230', 'source_refs', 'confidence', 'gbif_usage_key', 'gbif_nw_count', 'status', 'notes'];
writeCsv('flora/cultivated_plants.csv', cu, CCOLS);
writeCsv('flora/field_state_calendar.csv', calendar, ['fl_id', 'name_ru', 'month', 'month_roman', 'season', 'field_state', 'rule', 'confidence', 'status']);

// presence long form (exclude taxa not allowed in 1230)
const disallowed = new Set(cu.filter(c => c.allowed_1230 === 'no').map(c => c.fl_id));
const pres = presence.filter(p => !disallowed.has(p.fl_id)).map((p, i) => Object.assign({ fp_id: 'fp_' + p.fl_id.slice(3) + '__' + p.pf_id + '__' + p.season }, p));
writeCsv('flora/flora_habitat_presence.csv', pres, ['fp_id', 'region_id', 'fl_id', 'table', 'pf_id', 'season', 'frequency_class', 'weight', 'visible_state', 'confidence', 'basis', 'status']);

// denylist and sources
const deny = readTsv('denylist.tsv').map(r => Object.assign({}, r, { refs: expandRefs(r.refs, r.name_lat), status: 'candidate' }));
writeCsv('flora/anachronism_denylist_flora.csv', deny, ['deny_id', 'name_ru', 'name_lat', 'pattern_ru', 'pattern_lat', 'reason_ru', 'deny_kind', 'status', 'refs']);
const srcs = readTsv('sources.tsv');
writeCsv('flora/sources.csv', srcs, Object.keys(srcs[0]));

// counts
const cnt = (a, k) => a.reduce((o, x) => (o[x[k]] = (o[x[k]] || 0) + 1, o), {});
const counts = {
  herbs_mosses_aquatic: herbs.length, herbs_by_group: cnt(herbs, 'group'), herbs_by_confidence: cnt(herbs, 'confidence'),
  berries_mushrooms: bf.length, bf_by_kind: cnt(bf, 'subkind'), bf_by_edibility: cnt(bf, 'edibility'), bf_by_confidence: cnt(bf, 'confidence'),
  cultivated_plants: cu.length, cu_by_kind: cnt(cu, 'crop_kind'), cu_by_allowed_1230: cnt(cu, 'allowed_1230'), cu_by_confidence: cnt(cu, 'confidence'),
  flora_habitat_presence: pres.length, presence_by_table: cnt(pres, 'table'), presence_by_season: cnt(pres, 'season'), presence_by_class: cnt(pres, 'frequency_class'), pf_covered: Object.keys(cnt(pres, 'pf_id')).length,
  field_state_calendar: calendar.length, anachronism_denylist_flora: deny.length, sources: srcs.length,
};
fs.writeFileSync(path.join(ROOT, 'flora', 'counts.json'), JSON.stringify(counts, null, 1) + '\n');
console.log(JSON.stringify(counts));
