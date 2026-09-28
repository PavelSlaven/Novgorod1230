// Build fauna-mammals-birds candidate tables from authored src/*.cjs + input_snapshots/*.json.
// Deterministic: same inputs -> same CSVs. Run: node scripts/build.cjs  (from the domain folder or anywhere)
'use strict';
const fs = require('fs');
const path = require('path');

const DOM = path.resolve(__dirname, '..');
const GB = path.resolve(DOM, '..');                       // game-base-v1
const REPO = path.resolve(GB, '../../../..');             // worktree root
const OUT = path.join(DOM, 'fauna');
const mammals = require('./src/mammals.cjs');
const birds = require('./src/birds.cjs');
const checks = require('./src/checks.cjs');
const sources = require('./src/sources.cjs');
const pant = require('./input_snapshots/panteleev2001_list.json').species;
const malf = require('./input_snapshots/malchevsky1983_flags.json').species;
const phaseRules = require('../fauna/activity_phase_rules.json');
const voicePhase = require('./voice-phase.cjs');
const startPf = new Set(fs.readFileSync(path.join(GB, 'places-binding/places/node_binding.csv'), 'utf8').trim().split(/\r?\n/).slice(1).map((line) => line.split(',')[4]).filter(Boolean));

const SEASONS = ['winter', 'spring', 'summer', 'autumn'];
const LEVELS = ['rare', 'contextual', 'common', 'ubiquitous'];
const BASE = { R: 0, X: 1, C: 2, U: 3 };
const WEIGHT = { rare: 1, contextual: 2, common: 4, ubiquitous: 8 };
const REGION_DEFAULT = 'region_novgorod_land';
const RULE_REF = 'fauna-mammals-birds/README.md#frequency-rule';

// Habitat group -> pf_id list (pf ids from places-binding/places/place_families.csv).
const HABITAT_GROUPS = {
  conif: ['pf_conifer_woodland'], mixed: ['pf_mixed_woodland'], broad: ['pf_broadleaf_woodland'],
  edge: ['pf_forest_edge'], margin: ['pf_field_margin'], bog: ['pf_bog'], stream: ['pf_marshy_stream'],
  river: ['pf_river_channel'], bank: ['pf_riverbank'], lake: ['pf_lake_shore'], flood: ['pf_floodplain_meadow'],
  hay: ['pf_hay_meadow'], pasture: ['pf_pasture'], field: ['pf_arable_field'], garden: ['pf_orchard_garden'],
  homestead: ['pf_peasant_homestead', 'pf_rural_yard'], lane: ['pf_village_lane'], outb: ['pf_outbuildings'],
  store: ['pf_cellar_granary', 'pf_mill', 'pf_grain_drying_shed_ovin'], threshing: ['pf_threshing_barn'],
  dwelling: ['pf_dwelling_interior'], town: ['pf_town_street', 'pf_town_courtyard', 'pf_town_wall_edge'],
  market: ['pf_market_square'], wharf: ['pf_river_wharf'], church: ['pf_churchyard', 'pf_monastery_yard'],
  ferry: ['pf_ferry_landing'], fishing: ['pf_fishing_camp'], road: ['pf_road', 'pf_bridge_crossing'],
  forest_track: ['pf_forest_track'],
};
const WOOD = ['conif', 'mixed', 'broad'];
const HUNT_SRC = ['conif', 'mixed', 'broad', 'edge', 'flood', 'lake', 'bog', 'stream'];
const WATER = ['river', 'lake'];

function mammalAudible(t, season) {
  return !(t.dorm || []).includes(season) && t.audible.split(';').includes(season);
}
// Bird seasons without regular vocal activity (song over, silent migrants) — in addition to quietW (winter).
const BIRD_QUIET = {
  fa_b_cuckoo: ['autumn'], fa_b_corncrake: ['autumn'], fa_b_quail: ['autumn'], fa_b_nightjar: ['autumn'], fa_b_thrush_nightingale: ['autumn'],
  fa_b_grasshopper_warbler: ['autumn'], fa_b_woodlark: ['autumn'], fa_b_tree_pipit: ['autumn'], fa_b_wryneck: ['autumn'], fa_b_smew: ['spring', 'autumn'],
};

const esc = (v) => { const s = v === undefined || v === null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function writeCsv(file, cols, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n', 'utf8');
  return rows.length;
}
function parseHab(s) {
  const out = {};
  for (const part of (s || '').split(',').filter(Boolean)) {
    const [g, f] = part.split(':');
    if (!HABITAT_GROUPS[g]) throw new Error('unknown habitat group ' + g);
    out[g] = f === 'm' ? 'marginal' : 'core';
  }
  return out;
}
function pfFits(hab) {
  // returns Map pf_id -> fit, including derived overlays
  const m = new Map();
  const put = (pf, fit) => { const prev = m.get(pf); if (!prev || (prev === 'marginal' && fit === 'core')) m.set(pf, fit); };
  for (const [g, fit] of Object.entries(hab)) for (const pf of HABITAT_GROUPS[g]) put(pf, fit);
  const hunt = HUNT_SRC.filter((g) => hab[g]);
  if (hunt.length) put('pf_hunting_ground', hunt.some((g) => hab[g] === 'core') ? 'core' : 'marginal');
  if (!hab.forest_track && WOOD.some((g) => hab[g] === 'core')) put('pf_forest_track', 'marginal');
  return m;
}
const stepDown = (lvl, n) => Math.max(0, lvl - n);
const cat = (kind, grp, id) => `fauna.${kind}.${grp}.${id.replace(/^fa_[mb]_/, '')}`;
const slug = (s) => s.toLowerCase();
function malPage(b) { const n = b.mpage || b.mp; return n ? `https://zoomet.ru/mal/malchevski_${n}.html` : ''; }
// OCR of the cyberleninka text uses Cyrillic look-alikes and stray accents: normalise before matching.
const OCR = { 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'г': 'r', 'и': 'u', 'к': 'k', 'м': 'm', 'т': 't' };
const norm = (x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[а-яё]/g, (c) => OCR[c] || c).replace(/[^a-z]/g, '');
function pantEntry(b) {
  const want = [b.pl, b.lat].filter(Boolean).map(norm);
  for (const [k, v] of Object.entries(pant)) if (want.includes(norm(k.replace(/^\?/, '')))) return v;
  return null;
}

// ---- categories
const catRows = [];
const addCat = (id, parent, ru, en, extra = {}) => catRows.push({ category_id: id, domain: 'fauna', facet: extra.facet || 'taxon_group', stable_code: id, parent_category_id: parent, name_ru: ru, name_en: en, region_id: '', universal: 'true', source_refs: extra.src || 'fauna-mammals-birds/README.md', status: 'candidate' });
addCat('fauna.mammal', '', 'Дикие млекопитающие', 'Wild mammals', { facet: 'class' });
addCat('fauna.bird', '', 'Дикие птицы', 'Wild birds', { facet: 'class' });
const GROUP_RU = { ungulate: 'Копытные', large_predator: 'Крупные хищники', fur_predator: 'Пушные хищники', fur_small: 'Мелкие пушные куньи', small_predator: 'Мелкие хищники', fur_rodent: 'Пушные грызуны', game_small: 'Мелкая дичь', small_mammal: 'Мелкие звери (насекомоядные, грызуны)', bat: 'Летучие мыши', marine_mammal: 'Ластоногие',
  waterbird: 'Гагары и поганки', heron: 'Цапли и аисты', crane: 'Журавли', rail: 'Пастушковые', waterfowl: 'Гусеобразные (лебеди, гуси, утки)', raptor: 'Хищные птицы', gamebird: 'Куриные (боровая и полевая дичь)', wader: 'Кулики', gull: 'Чайки и крачки', pigeon: 'Голуби', other: 'Прочие (кукушка, козодой, стриж, зимородок)', owl: 'Совы', woodpecker: 'Дятлы', songbird: 'Воробьиные певчие', corvid: 'Врановые' };
for (const [kind, list] of [['mammal', mammals], ['bird', birds]]) {
  for (const g of [...new Set(list.map((t) => t.grp))]) addCat(`fauna.${kind}.${g}`, `fauna.${kind}`, GROUP_RU[g] || g, g);
  for (const t of list) addCat(cat(kind, t.grp, t.id), `fauna.${kind}.${t.grp}`, t.ru, t.en, { facet: 'taxon', src: (t.src || (kind === 'bird' ? 'SRC_PANT2001' : '')).split(';')[0] });
}

// ---- mammals
const mRows = mammals.map((t) => ({
  fa_id: t.id, name_ru: t.ru, name_ru_alt: t.alt || '', name_lat: t.lat, name_en: t.en, class: 'Mammalia', order: t.order, group: t.grp,
  category_ref: cat('mammal', t.grp, t.id), scope: 'universal_taxon', region_scope: t.region || REGION_DEFAULT, subregion_scope: t.subregion || '',
  base_frequency_class: LEVELS[BASE[t.base]], base_frequency_basis: t.baseBasis, presence_1230_confidence: t.pres, historical_evidence: t.evid || '',
  activity_time: t.act, dormant_seasons: (t.dorm || []).join(';'), audible_seasons: t.audible,
  season_winter: t.seas.winter || '', season_spring: t.seas.spring || '', season_summer: t.seas.summer || '', season_autumn: t.seas.autumn || '',
  rut_period: t.rut || '', moult: t.moult || '', winter_coat: t.coat || '',
  signs_tracks: t.tracks || '', signs_droppings: t.drop || '', signs_feeding: t.feed || '', signs_dens_nests: t.den || '', signs_sounds: t.sound || '', signs_smell: t.smell || '',
  behaviour_to_humans: t.human, danger_level: t.danger, products: t.products || '', hunting_methods: t.hunt || '', hunting_method_refs: t.huntRefs || '',
  wk_refs: t.wk || '', habitats: t.hab, source_refs: `${t.src}${t.taxonExtraSources ? ';' + t.taxonExtraSources : ''};mammals.csv#${t.id}.signs_sounds`, confidence: 'B', notes: t.note || '', status: 'candidate',
}));

// ---- birds
const MIG = { R: 'resident', B: 'breeding', P: 'passage', W: 'wintering', I: 'irregular', '-': 'absent' };
const bRows = birds.map((b) => {
  const pe = pantEntry(b); const mf = b.mp ? malf[String(b.mp)] : null;
  const quiet = new Set([...(b.quietW ? ['winter'] : []), ...(BIRD_QUIET[b.id] || [])]);
  const audible = SEASONS.filter((s, i) => b.mig[i] !== '-' && !quiet.has(s));
  const src = ['SRC_PANT2001', b.mp ? 'SRC_MALPUK1983' : '', ...(b.src ? b.src.split(';') : [])].filter(Boolean);
  return {
    fa_id: b.id, name_ru: b.ru, name_ru_alt: b.alt || '', name_lat: b.lat, name_en: b.en, class: 'Aves', order: b.order, group: b.grp,
    category_ref: cat('bird', b.grp, b.id), scope: 'universal_taxon', region_scope: REGION_DEFAULT,
    base_frequency_class: LEVELS[BASE[b.base]], base_frequency_basis: `Malchevsky head abundance flags: ${(mf && mf.abundance_flags_head.join('|')) || 'n/a'}${b.note ? '; note: ' + b.note : ''}`,
    presence_1230_confidence: b.pres, historical_evidence: b.evid || '',
    migration_winter: MIG[b.mig[0]], migration_spring: MIG[b.mig[1]], migration_summer: MIG[b.mig[2]], migration_autumn: MIG[b.mig[3]], mass_passage: b.massP ? 'true' : 'false',
    season_presence_conditions: Object.entries(b.seasonConditions || {}).map(([season, condition]) => `${season}=${condition}`).join(';'),
    activity_time: b.act, voice_description: b.voice, voice_sound_ru: b.sound, audible_seasons: audible.join(';'), nesting: b.nest, game_value: b.game, falconry_relevance: b.falc, products: b.products || '',
    habitats: b.hab, panteleev_2001_listed: pe ? 'true' : 'false', petrov_1885_priilmenye: pe && pe.petrov_1885 ? 'true' : 'false',
    malchevsky_page: malPage(b), malchevsky_status_flags: mf ? mf.status_flags.join('|') : '', malchevsky_heading_check: mf ? mf.latin_heading : '',
    wk_refs: b.wk || '', source_refs: src.join(';'), confidence: 'B', notes: b.note || '', status: 'candidate',
  };
});

// ---- presence
const pres = [];
function sigSummary(t, kind, season, state) {
  if (kind === 'bird') return state === 'breeding' ? 'voice;nest' : 'voice';
  if (state === 'dormant') return t.den ? 'dens_nests' : 'none';
  return ['tracks', 'drop', 'feed', 'den', 'sound', 'smell'].filter((k) => t[k]).map((k) => ({ tracks: 'tracks', drop: 'droppings', feed: 'feeding', den: 'dens_nests', sound: 'sounds', smell: 'smell' }[k])).join(';');
}
function presRowsFor(t, kind) {
  const hab = parseHab(t.hab); const fits = pfFits(hab);
  const base = BASE[t.base];
  const rows = [];
  for (const [si, season] of SEASONS.entries()) {
    if (t.seasonConditions?.[season]) continue;
    let state, sDelta = 0, audible = false;
    if (kind === 'mammal') {
      state = (t.dorm || []).includes(season) ? 'dormant' : 'active';
      audible = mammalAudible(t, season);
    } else {
      const c = t.mig[si]; if (c === '-') continue;
      state = MIG[c]; if (c === 'P' && !t.massP) sDelta = 1; if (c === 'I') sDelta = 1;
      // Autumn is post-breeding: a breeding-season bird is departing or on passage, not nesting.
      if (season === 'autumn' && state === 'breeding') state = t.massP ? 'passage' : 'present_departing';
      const quiet = (t.quietW && season === 'winter') || (BIRD_QUIET[t.id] || []).includes(season);
      audible = !quiet;
    }
    const fitsSeason = new Map(fits);
    if (season === 'winter' && state !== 'dormant') {
      const ice = WATER.some((g) => hab[g]) || hab.road;
      if (ice) fitsSeason.set('pf_winter_ice_crossing', 'marginal');
    }
    for (const [pf, fit] of fitsSeason) {
      let lvl = state === 'dormant' ? 0 : stepDown(base, (fit === 'marginal' ? 1 : 0) + sDelta);
      const presenceOverride = t.presenceOverrides?.[`${season}:${pf}`];
      const levelOverride = typeof presenceOverride === 'string' ? presenceOverride : presenceOverride?.frequency;
      if (levelOverride) {
        if (!LEVELS.includes(levelOverride)) throw new Error(`bad presence override ${t.id} ${season}:${pf}: ${levelOverride}`);
        lvl = LEVELS.indexOf(levelOverride);
      }
      const fc = LEVELS[lvl];
      rows.push({
        presence_id: `fhp_${t.id.replace(/^fa_/, '')}__${pf.replace(/^pf_/, '')}__${season}`, fa_id: t.id, category_ref: cat(kind, t.grp, t.id), pf_id: pf,
        region_id: t.region || REGION_DEFAULT, subregion_scope: t.subregion || '', season, frequency_class: fc, weight: WEIGHT[fc], fit, state, activity_time: state === 'dormant' ? 'dormant' : t.act,
        audible: audible ? 'true' : 'false', observable_signs: sigSummary(t, kind, season, state), refresh_class: 'by_year_season',
        rule_ref: RULE_REF, source_refs: [...new Set([...(kind === 'bird' ? ['SRC_PANT2001', t.mp ? 'SRC_MALPUK1983' : ''] : []), ...(t.src || '').split(';'), ...(typeof presenceOverride === 'object' ? (presenceOverride.sourceRefs || '').split(';') : []), 'SRC_PF', 'SRC_FREQ_RULE', 'SRC_TEMPORAL_V4', kind === 'mammal' && audible ? `mammals.csv#${t.id}.signs_sounds` : ''].filter(Boolean))].join(';'),
        confidence: t.pres === 'C' ? 'C' : 'B', status: 'candidate',
      });
    }
  }
  return rows;
}
for (const t of mammals) pres.push(...presRowsFor(t, 'mammal'));
for (const b of birds) pres.push(...presRowsFor(b, 'bird'));

// ---- checks + sources tables
const chkRows = checks.map((c, i) => ({ check_id: `fchk_${String(i + 1).padStart(3, '0')}`, taxon_ru: c.taxon, name_lat: c.lat, verdict: c.verdict, fa_ids: c.fa_id, reason: c.reason, source_refs: c.src, confidence: c.confidence, status: 'candidate' }));
const srcRows = sources.map((s) => ({ source_id: s.id, level: s.level, read_depth: s.read, title: s.title, url: s.url, use: s.use }));

const counts = {};
counts.mammals = writeCsv(path.join(OUT, 'mammals.csv'), Object.keys(mRows[0]), mRows);
counts.birds = writeCsv(path.join(OUT, 'birds.csv'), Object.keys(bRows[0]), bRows);
counts.wild_habitat_presence = writeCsv(path.join(OUT, 'wild_habitat_presence.csv'), Object.keys(pres[0]), pres);
counts.fauna_categories = writeCsv(path.join(OUT, 'fauna_categories.csv'), Object.keys(catRows[0]), catRows);
counts.taxa_checks = writeCsv(path.join(OUT, 'taxa_checks.csv'), Object.keys(chkRows[0]), chkRows);
counts.sources = writeCsv(path.join(OUT, 'sources.csv'), Object.keys(srcRows[0]), srcRows);
const phaseRows = [];
const scoped = new Set(pres.filter((p) => startPf.has(p.pf_id)).map((p) => `${p.fa_id}|${p.season}`));
for (const t of [...mRows, ...bRows]) for (const season of SEASONS) {
  if (!scoped.has(`${t.fa_id}|${season}`)) continue;
  const dormant = t.dormant_seasons?.split(';').includes(season);
  const audible = t.class === 'Aves' ? t.audible_seasons.split(';').includes(season) :
    pres.some((p) => p.fa_id === t.fa_id && p.season === season && p.audible === 'true');
  for (const phase of phaseRules.phases) {
    const mapped = dormant ? 'no' : phaseRules.rules[t.activity_time][phase];
    const voiceFact = voicePhase(t, season, phase, audible, dormant);
    let visibility = mapped;
    let voice = phaseRules.voice_rules[t.activity_time]?.[phase] && voiceFact !== 'yes' ? phaseRules.voice_rules[t.activity_time][phase] :
      voiceFact === null ? mapped : voiceFact;
    const owner = `${t.class === 'Aves' ? 'birds.csv' : 'mammals.csv'}#${t.fa_id}`;
    let source = dormant ? `${owner}.dormant_seasons` : voiceFact === 'yes' ?
      `${owner}.${t.class === 'Aves' ? 'voice_description' : 'signs_sounds'}` :
      t.class === 'Aves' && !audible ? `${owner}.audible_seasons` : '';
    let visibilityDirect = false;
    let voiceDirect = voiceFact === 'yes';
    const books = 'books-evidence-v1/fauna-mammals-birds.csv';
    if (t.fa_id === 'fa_m_mole') {
      visibility = 'no_source';
      source = '';
      visibilityDirect = false;
    }
    if (t.fa_id === 'fa_b_bittern' && ['spring', 'summer'].includes(season) && ['daylight', 'civil_dusk', 'night'].includes(phase)) {
      voice = 'yes'; source = `${books}#L178`; voiceDirect = true;
    }
    if (t.fa_id === 'fa_b_common_crane' && season === 'autumn' && phase === 'night') {
      voice = 'yes'; source = `${books}#L160`; voiceDirect = true;
    }
    if (t.fa_id === 'fa_m_wild_boar' && season === 'summer' && phase === 'civil_dusk') {
      visibility = 'yes'; source = `${books}#L68`; visibilityDirect = true;
    }
    if (t.fa_id === 'fa_b_capercaillie' && season === 'spring' && phase === 'civil_dusk') {
      visibility = 'yes'; source = `${books}#L147`; visibilityDirect = true;
    }
    if (t.fa_id === 'fa_b_swift' && season === 'summer' && phase === 'civil_dawn') {
      voice = 'yes'; source = `${books}#L299`; voiceDirect = true;
    }
    const completeGap = visibility === 'no_source' && voice === 'no_source' && t.fa_id !== 'fa_m_mole';
    if (completeGap) source = '';
    const ruleRef = t.fa_id === 'fa_m_mole' ? 'fauna/activity_phase_rules.json#subterranean-surface-sighting-gap' :
      !completeGap && !source ? `fauna/activity_phase_rules.json#${phaseRules.id}.${t.activity_time}.${phase}` : '';
    phaseRows.push({ phase_rule_id: `fpa_${t.fa_id}_${season}_${phase}`, fa_id: t.fa_id, season, phase,
      visibility_state: visibility, voice_state: voice, voice_text_ref: voice === 'yes' ?
        `${t.class === 'Aves' ? 'birds.csv' : 'mammals.csv'}#${t.fa_id}.${t.class === 'Aves' ? 'voice_description' : 'signs_sounds'}` : '',
      source_refs: source, rule_ref: ruleRef, no_source: completeGap ? 'visibility and voice phase unknown' : '',
      confidence: visibilityDirect && voiceDirect && visibility !== 'no_source' && voice !== 'no_source' ?
        (t.presence_1230_confidence === 'C' ? 'C' : t.confidence) : 'C', status: 'candidate' });
  }
}
counts.phase_activity = writeCsv(path.join(OUT, 'phase_activity.csv'), ['phase_rule_id', 'fa_id', 'season', 'phase', 'visibility_state', 'voice_state', 'voice_text_ref', 'source_refs', 'rule_ref', 'no_source', 'confidence', 'status'], phaseRows);
fs.writeFileSync(path.join(DOM, 'build-report.json'), JSON.stringify({ built_by: 'scripts/build.cjs', counts }, null, 1) + '\n');
console.log(counts);
