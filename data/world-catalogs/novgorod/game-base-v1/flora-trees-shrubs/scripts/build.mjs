// Build flora-trees-shrubs candidate tables from scripts/src/*.json. Deterministic; no network.
// Usage: node scripts/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { REPO, OUT, REPORTS, SRC, src, readJson, readCsv, writeCsv, months, seasonsOf, SEASONS, FOREST_PF } from './lib.mjs';

const taxaSrc = src('taxa.json');
const rolesSrc = src('habitat_roles.json');
const sources = src('sources.json').sources;
const deny = src('denylist.json').entries;
const kol = src('kolchin_table1.json');
const freqRule = readJson(path.join(REPO, 'data/world-catalogs/novgorod/game-base-v1/places-binding/presence/frequency_rule.json'));
const pfRows = readCsv(path.join(REPO, 'data/world-catalogs/novgorod/game-base-v1/places-binding/places/place_families.csv'));
const pfById = new Map(pfRows.map((r) => [r.pf_id, r]));

const ROLE = rolesSrc.rule.classes; // role -> [class, weight]
const CONF_ORDER = { A: 0, B: 1, C: 2 };
const worse = (a, b) => (CONF_ORDER[a] >= CONF_ORDER[b] ? a : b);
const ppm = (cls) => freqRule.classes[cls].probability_ppm;
const PHEN_REFS = {
  leaf_out: 'src:src_priroda_novgorod_climate',
  leaf_fall: 'wk:claim:final-nature-deciduous-trees-have-seasonal-leaf-state-unlike-evergreen-conifers',
};

function phenology(t) {
  const p = t.phen || {};
  const flS = seasonsOf(months(p.flower));
  const frS = seasonsOf(months(p.fruit));
  const sdS = seasonsOf(months(p.seed_release));
  const persistsWinter = /зим/.test(`${p.fruit_note || ''} ${p.winter_retains || ''}`);
  // Only dwarf shrubs are buried by snow in winter; a free-text winter_look regex previously
  // false-matched picea_abies ("под снегом ветви провисают" describes branch droop, not burial).
  // Fix per verifier note VERIFICATION.md#tree_habitat_presence.csv item 2 (2026-09-26).
  const underSnow = t.life_form === 'dwarf_shrub';
  const out = {};
  for (const s of SEASONS) {
    const ev = [];
    if (t.leaf_habit.startsWith('evergreen')) ev.push('evergreen');
    else ev.push({ winter: 'leafless', spring: p.leaf_out === 'spring' ? 'leaf_out' : 'leafing', summer: 'in_leaf', autumn: 'leaf_colouring_and_fall' }[s]);
    if (flS.includes(s)) ev.push('flowering');
    else if (!p.flower && p.flower_before_leaves && s === 'spring') ev.push('flowering_before_leaves');
    if (frS.includes(s)) ev.push('fruit_ripe');
    if (sdS.includes(s)) ev.push('seed_release');
    if (s === 'winter' && persistsWinter) ev.push('fruit_or_dry_leaves_persist');
    if (s === 'winter' && underSnow) ev.push('mostly_under_snow');
    out[s] = ev;
  }
  return out;
}

const refsOfUse = (u) => u.refs || [];
const taxa = taxaSrc.taxa;
const kolByFl = new Map();
for (const r of kol.rows) { if (r.fl_id) kolByFl.set(r.fl_id, r.count); }

// ---- presence
const presence = [];
const rolesByTaxon = rolesSrc.roles;
const W = (t) => `src:src_wiki_${t.lat.toLowerCase().replace(/[^a-z]+/g, '_').replace(/_+$/, '')}`;
function expandRefs(t, refs) {
  const L = { K: 'src:src_kolchin_1968', VP: 'src:src_valdaypark_flora', VN: 'src:src_valdaypark_nature', NB: 'src:src_nbcrs_novgorod_flora', W: W(t) };
  return refs.map((r) => L[r] || r);
}
const phenCache = new Map();
for (const t of taxa) {
  phenCache.set(t.id, phenology(t));
  const authored = rolesByTaxon[t.id] || {};
  const cells = new Map(); // pf -> {role, basis, refs, derivation}
  for (const [pf, [role, basis, refs]] of Object.entries(authored)) cells.set(pf, { role, basis, refs: expandRefs(t, refs), derivation: 'authored' });
  // Overlay is capped at 'component': a taxon confined to one place family (e.g. broadleaf
  // woodland, bog) must not become guaranteed-present (edificator/ubiquitous) on the overlay
  // pf just because it dominates its one source habitat. Fix per verifier note
  // VERIFICATION.md#tree_habitat_presence.csv item 1 (2026-09-26).
  const OVERLAY_CAP = 'component';
  const overlay = (target, from) => {
    let best = null;
    for (const f of from) { const c = cells.get(f); if (c && c.derivation === 'authored' && (!best || ROLE[c.role][1] > ROLE[best.role][1])) best = { ...c, from: f }; }
    if (!best) return;
    const cappedRole = ROLE[best.role][1] > ROLE[OVERLAY_CAP][1] ? OVERLAY_CAP : best.role;
    const cur = cells.get(target);
    if (cur && ROLE[cur.role][1] >= ROLE[cappedRole][1]) return;
    cells.set(target, { role: cappedRole, basis: `overlay from ${best.from} (capped at ${OVERLAY_CAP}): ${best.basis}`, refs: best.refs, derivation: `overlay:${best.from}` });
  };
  overlay('pf_forest_track', FOREST_PF);
  overlay('pf_hunting_ground', [...FOREST_PF, 'pf_forest_edge', 'pf_bog']);
  const ph = phenCache.get(t.id);
  for (const [pf, c] of [...cells.entries()].sort()) {
    const [cls, weight] = ROLE[c.role];
    const conf = /\(C/.test(c.basis) ? worse(t.confidence, 'C') : t.confidence;
    for (const s of SEASONS) {
      presence.push({
        presence_id: `flp_${t.id.replace(/^fl_ts_/, '')}__${pf.replace(/^pf_/, '')}__${s}`,
        fl_id: t.id, name_lat: t.lat, name_ru: t.name_ru,
        pf_id: pf, wk_family_ref: pfById.get(pf)?.wk_family_ref || '',
        region_id: 'region_novgorod_land', season: s,
        frequency_class: cls, weight, probability_ppm: ppm(cls), probability_rule_ref: `places-binding/presence/frequency_rule.json#${freqRule.rule_id}@v${freqRule.rule_version}`,
        habitat_role: c.role, class_rule_ref: `flora-trees-shrubs/scripts/src/habitat_roles.json#${rolesSrc.rule.rule_id}`,
        derivation: c.derivation, refresh_class: 'none',
        seasonal_state: ph[s].join(';'),
        visible_above_snow: s === 'winter' && ph[s].includes('mostly_under_snow') ? 'mostly_no' : 'yes',
        basis_ru: c.basis, source_refs: c.refs.join(' '), confidence: conf, status: 'candidate',
      });
    }
  }
}

// ---- taxa table
const presByTaxon = new Map();
for (const p of presence) if (p.season === 'summer') { (presByTaxon.get(p.fl_id) || presByTaxon.set(p.fl_id, []).get(p.fl_id)).push(`${p.pf_id}:${p.weight}`); }
const taxaRows = taxa.map((t) => {
  const refs = new Set([...(t.name_folk_refs || []), ...(t.wk_refs || []), W(t)]);
  for (const u of t.uses) refsOfUse(u).forEach((r) => refs.add(r));
  for (const h of t.hazards) (h.refs || []).forEach((r) => refs.add(r));
  if (t.kolchin_name) refs.add('src:src_kolchin_1968');
  const ph = phenCache.get(t.id);
  if (!t.leaf_habit.startsWith('evergreen')) { refs.add(PHEN_REFS.leaf_out); refs.add(PHEN_REFS.leaf_fall); }
  const refList = [...refs]; // resolution is checked by validate.mjs
  return {
    fl_id: t.id,
    category_code: `flora.woody.${t.life_form}.${t.lat.toLowerCase().replace(/[^a-z]+/g, '_')}`,
    name_ru: t.name_ru, name_folk: (t.name_folk || []).join('; '), name_old_ru: t.name_old_ru || '',
    name_lat: t.lat, lat_synonyms: t.lat_syn || '', name_en: t.name_en, family: t.family,
    life_form: t.life_form, leaf_habit: t.leaf_habit, region_scope: 'universal_category; presence only via tree_habitat_presence (region_novgorod_land)',
    moisture: t.moisture.join(';'), soil: t.soil, light: t.light,
    flowering_months: t.phen?.flower || '', fruit_months: t.phen?.fruit || '', seed_release_months: t.phen?.seed_release || '',
    flowers_before_leaves: t.phen?.flower_before_leaves === true ? 'yes' : '',
    phenology_note: [t.phen?.flower_note, t.phen?.fruit_note, t.phen?.autumn_colour && `осень: ${t.phen.autumn_colour}`, t.phen?.winter_retains].filter(Boolean).join(' | '),
    phenology_by_season: ph,
    winter_look: t.winter_look,
    cue_bark: t.cues.bark, cue_leaf: t.cues.leaf, cue_smell: t.cues.smell, cue_sound: t.cues.sound, cue_other: t.cues.other,
    use_codes: t.uses.map((u) => u.use).join(';'),
    uses: t.uses.map((u) => ({ use: u.use, part: u.part, quality: u.quality, note: u.note, refs: u.refs })),
    building_timber: t.building_timber, craft_wood: t.craft_wood, timber_note: t.timber_note,
    hazard_codes: t.hazards.map((h) => h.hazard).join(';'),
    hazards: t.hazards,
    yield_units: t.yield_units.join(';'),
    kolchin_1968_wood_count: kolByFl.get(t.id) ?? '',
    habitat_presence_summer: (presByTaxon.get(t.id) || []).join(';'),
    wk_claim_refs: (t.wk_refs || []).join(' '),
    source_refs: refList.join(' '),
    confidence: t.confidence, confidence_note: t.confidence_note, status: 'candidate', notes: t.notes || '',
  };
});

const TAXA_HEADER = Object.keys(taxaRows[0]);
const PRES_HEADER = Object.keys(presence[0]);
const nTaxa = writeCsv(path.join(OUT, 'trees_shrubs.csv'), TAXA_HEADER, taxaRows);
const nPres = writeCsv(path.join(OUT, 'tree_habitat_presence.csv'), PRES_HEADER, presence);

// ---- Kolchin wood table
const kolRows = kol.rows.map((r) => ({ wood_ru: r.wood_ru, lat: r.lat || taxa.find((t) => t.id === r.fl_id)?.lat || (r.genus || ''), fl_id: r.fl_id || '', fl_id_also: (r.fl_id_also || []).join(';'), origin: r.origin, artefact_count: r.count, share_of_909: (r.count / kol.declared_total).toFixed(4), origin_note: r.origin_note || '', source_refs: 'src:src_kolchin_1968', locator: kol.locator, confidence: r.origin === 'imported' ? 'A' : 'A', caveat: 'artefact identification count, not forest abundance' }));
const nKol = writeCsv(path.join(OUT, 'wood_use_kolchin1968.csv'), Object.keys(kolRows[0]), kolRows);
const kolSum = kol.rows.reduce((a, r) => a + r.count, 0);

// ---- denylist
const denyRows = deny.map((d) => ({ deny_id: `fldeny_${d.lat.toLowerCase().replace(/[^a-z]+/g, '_')}`, name_lat: d.lat, name_ru: d.name_ru, keywords_ru: d.keywords_ru.join(';'), kind: d.kind, wood_import_allowed: d.wood_import ? 'yes' : 'no', reason: d.reason, source_refs: d.refs.join(' '), confidence: d.confidence, status: 'candidate' }));
const nDeny = writeCsv(path.join(OUT, 'woody_denylist.csv'), Object.keys(denyRows[0]), denyRows);

// ---- proposed categories (same header as places-binding category_registry.csv)
const LF = { tree: ['дерево', 'tree'], small_tree: ['небольшое дерево', 'small tree'], shrub: ['кустарник', 'shrub'], dwarf_shrub: ['кустарничек', 'dwarf shrub'] };
const cats = [{ category_id: 'cat_flora_woody', domain: 'flora', facet: 'growth_group', stable_code: 'flora.woody', parent_category_id: '', name_ru: 'Древесные растения', name_en: 'Woody plants', region_id: '', origin: 'game_base_v1:flora-trees-shrubs', source_domain_file: 'data/world-catalogs/novgorod/game-base-v1/flora-trees-shrubs/flora/woody_categories.csv', status: 'candidate' }];
for (const [lf, [ru, en]] of Object.entries(LF)) cats.push({ ...cats[0], category_id: `cat_flora_woody_${lf}`, facet: 'life_form', stable_code: `flora.woody.${lf}`, parent_category_id: 'cat_flora_woody', name_ru: ru, name_en: en });
for (const r of taxaRows) cats.push({ ...cats[0], category_id: `cat_${r.category_code.replace(/\./g, '_')}`, facet: 'taxon', stable_code: r.category_code, parent_category_id: `cat_flora_woody_${r.life_form}`, name_ru: r.name_ru, name_en: `${r.name_en} (${r.name_lat})` });
const nCats = writeCsv(path.join(OUT, 'woody_categories.csv'), Object.keys(cats[0]), cats);

// ---- sources register
const srcRows = sources.map((s) => ({ src_id: s.src_id, kind: s.kind, reliability: s.reliability, title: s.title, url: s.url, locator_note: s.locator_note || '' }));
const nSrc = writeCsv(path.join(OUT, 'sources.csv'), Object.keys(srcRows[0]), srcRows);

// ---- world_db landscape_templates dominant_vegetation check
const TOK = [
  ['сосн', 'fl_ts_pinus_sylvestris'], ['ель', 'fl_ts_picea_abies'], ['хвойн', 'fl_ts_picea_abies|fl_ts_pinus_sylvestris'], ['берёз', 'fl_ts_betula_pendula|fl_ts_betula_pubescens'], ['осин', 'fl_ts_populus_tremula'],
  ['ольх', 'fl_ts_alnus_glutinosa|fl_ts_alnus_incana'], ['ив', 'fl_ts_salix_*'], ['ивняк', 'fl_ts_salix_*'], ['широколиствен', 'fl_ts_tilia_cordata|fl_ts_quercus_robur|fl_ts_acer_platanoides'],
  ['лиственниц', 'DENY:Larix'], ['пихт', 'DENY:Abies'], ['тополь', 'CHECK:Populus (only P. tremula native; black poplar not in Novgorod land per collector sources)'],
];
const lt = fs.readFileSync(path.join(SRC, 'world_db_landscape_templates_snapshot.tsv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split('\t'));
const ltRows = lt.map(([id, veg, moist, status]) => {
  const words = veg.toLowerCase().split(/[^а-яё]+/).filter(Boolean);
  const hits = []; const flags = [];
  for (const [k, v] of TOK) if (words.some((w) => w.startsWith(k) && !(k === 'ив' && !/^ив(а|ы|у|ой|ня)?$|^ивняк/.test(w)) && !(k === 'ель' && w !== 'ель'))) (v.startsWith('DENY') || v.startsWith('CHECK') ? flags : hits).push(`${k}=>${v}`);
  return { landscape_template_id: id, dominant_vegetation: veg, moisture_level: moist, world_db_status: status, mapped_fl_ids: hits.join('; '), region_flags: flags.join('; '), finding: flags.length ? 'names a woody taxon not native to region_novgorod_land 1230; regional use must not materialize it' : '' };
});
const nLt = writeCsv(path.join(OUT, 'landscape_template_woody_check.csv'), Object.keys(ltRows[0]), ltRows);

// ---- report
const byClass = {}; for (const p of presence) if (p.season === 'summer') byClass[p.frequency_class] = (byClass[p.frequency_class] || 0) + 1;
const byLf = {}; for (const t of taxa) byLf[t.life_form] = (byLf[t.life_form] || 0) + 1;
const byConf = {}; for (const t of taxa) byConf[t.confidence] = (byConf[t.confidence] || 0) + 1;
const pairs = new Set(presence.map((p) => `${p.fl_id}|${p.pf_id}`));
const report = {
  generated_by: 'scripts/build.mjs', files: {
    'flora/trees_shrubs.csv': nTaxa, 'flora/tree_habitat_presence.csv': nPres, 'flora/wood_use_kolchin1968.csv': nKol,
    'flora/woody_denylist.csv': nDeny, 'flora/woody_categories.csv': nCats, 'flora/sources.csv': nSrc, 'flora/landscape_template_woody_check.csv': nLt,
  },
  taxa_by_life_form: byLf, taxa_by_confidence: byConf,
  taxon_pf_pairs: pairs.size, pf_used: [...new Set(presence.map((p) => p.pf_id))].sort(),
  summer_presence_rows_by_class: byClass,
  kolchin_table1_sum: kolSum, kolchin_declared_total: kol.declared_total,
  landscape_templates_flagged: ltRows.filter((r) => r.region_flags).map((r) => r.landscape_template_id),
};
fs.mkdirSync(REPORTS, { recursive: true });
fs.writeFileSync(path.join(REPORTS, 'build-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
