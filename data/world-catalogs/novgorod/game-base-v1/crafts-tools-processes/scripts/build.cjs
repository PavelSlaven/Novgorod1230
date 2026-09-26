'use strict';
// Build crafts-tools-processes CSVs from authored sources in scripts/src/*.cjs.
// Deterministic: derives usage links, mass bands, condition/mark slots, category ids and material resolution.
// Usage: node scripts/build.cjs   (optional env MATCULT_CATALOG=<path to material_culture catalog_items.csv>)
const L = require('./lib.cjs');
const { path, split, uniq, writeCsv, DOMAIN_ROOT } = L;

const SOURCES = require('./src/sources.cjs');
const MATERIALS = require('./src/materials.cjs');
const DENY = require('./src/denylist.cjs');
const TOOLS = require('./src/tools.cjs');
const PROCESSES = [...require('./src/processes-a.cjs'), ...require('./src/processes-b.cjs'), ...require('./src/processes-c.cjs'), ...require('./src/processes-d.cjs')];
const WORKSHOPS = require('./src/workshops.cjs');
const OCC = require('./src/occupation-tools.cjs');

const STATUS = 'candidate';
const out = rel => path.join(DOMAIN_ROOT, rel);

// ---------- rules (stated in README) ----------
const MASS_BANDS = { M0: '<50 г', M1: '50–300 г', M2: '300 г–1,5 кг', M3: '1,5–5 кг', M4: '5–25 кг', M5: '>25 кг' };
const BAND_BOUNDS = [['M0', 50], ['M1', 300], ['M2', 1500], ['M3', 5000], ['M4', 25000], ['M5', Infinity]];
const MASS_RULE = { // material_class x size_class -> band
  metal: { tiny: 'M0', hand: 'M1', long_hand: 'M2', long: 'M3', fixture: 'M4', soft_goods: 'M3' },
  wood:  { tiny: 'M0', hand: 'M1', long_hand: 'M2', long: 'M3', fixture: 'M4', soft_goods: 'M3' },
  stone: { tiny: 'M0', hand: 'M2', long_hand: 'M3', long: 'M4', fixture: 'M5', soft_goods: 'M3' },
  clay:  { tiny: 'M0', hand: 'M1', long_hand: 'M3', long: 'M4', fixture: 'M5', soft_goods: 'M3' },
  light: { tiny: 'M0', hand: 'M0', long_hand: 'M1', long: 'M2', fixture: 'M3', soft_goods: 'M3' },
};
const FAMILY_CLASS = { ferrous: 'metal', nonferrous: 'metal', precious: 'metal', wood: 'wood', stone: 'stone', clay_ceramic: 'clay', glass: 'clay' };
const CONDITION = {
  metal: 'serviceable;dull_edge;nicked;rusted;loose_handle;cracked;broken',
  wood: 'serviceable;worn;cracked;warped;rotten;broken',
  stone: 'serviceable;chipped;worn_groove;broken',
  clay: 'intact;chipped;cracked;broken',
  light: 'serviceable;worn;frayed_or_torn;wet;rotten;broken',
};
const MARKS = {
  metal: 'repair_trace;wear_pattern',
  wood: 'owner_sign_carved;repair_trace;wear_pattern',
  stone: 'wear_pattern',
  clay: 'wear_pattern',
  light: 'owner_sign_carved;repair_trace;wear_pattern',
};
// Attested inscription/owner-mark carriers (source in README): Rybina 2015 (floats), Sedova/KYY (whorls), Kolchin 1968 (tallies).
const INSCRIBED = new Set(['tl_net_float', 'tl_spindle_whorl', 'tl_tally_stick']);
const WELDED_EDGE = new Set(['tl_axe_carpenter', 'tl_adze', 'tl_adze_boat', 'tl_chisel', 'tl_chisel_broad', 'tl_gouge', 'tl_drawknife', 'tl_sickle', 'tl_scythe_gorbusha', 'tl_knife_utility', 'tl_axe_household', 'tl_shoe_knife', 'tl_bone_knife', 'tl_carving_knife', 'tl_skinning_knife', 'tl_billhook', 'tl_firesteel']);

const PRODUCT_LABELS = {
  'pr:forged_iron_object': 'кованое железное изделие', 'pr:edge_tool': 'рубящее или режущее орудие со стальным лезвием', 'pr:forged_nail': 'кованый гвоздь',
  'pr:worn_iron_object': 'изношенная или сломанная железная вещь', 'pr:repaired_iron_object': 'починенная железная вещь', 'pr:cast_ornament': 'литое украшение или деталь',
  'pr:filigree_ornament': 'филигранное украшение', 'pr:embossed_mount': 'тиснёная накладка', 'pr:sealed_document': 'документ с вислой свинцовой печатью',
  'pr:seal_matrix': 'матрица печати (буллотирий) или клеймо', 'pr:leather_footwear': 'кожаная обувь', 'pr:worn_footwear': 'изношенная обувь', 'pr:flax_stems': 'тресты и стебли льна или конопли',
  'pr:yarn': 'пряжа', 'pr:woven_cloth': 'тканое полотно или сукно', 'pr:dyed_cloth': 'окрашенная ткань', 'pr:ceramic_pot': 'гончарный сосуд', 'pr:bone_comb': 'составной костяной гребень',
  'pr:bone_skate': 'костяной конёк', 'pr:glass_bracelet': 'стеклянный браслет', 'pr:log_frame': 'сруб', 'pr:hewn_board': 'тёсаная доска или плаха', 'pr:plank_boat': 'дощатая лодка',
  'pr:damaged_boat': 'повреждённая лодка', 'pr:dugout_boat': 'лодка-однодеревка', 'pr:turned_vessel': 'точёная деревянная посуда', 'pr:stave_vessel': 'клёпаный сосуд (кадь, ведро, бочонок)',
  'pr:fishing_net': 'рыболовная сеть', 'pr:net_float': 'сетевой поплавок', 'pr:fish_trap': 'верша', 'pr:hunting_bow': 'охотничий лук со стрелами', 'pr:birchbark_letter': 'берестяная грамота',
  'pr:unmarked_object': 'вещь без знака', 'pr:marked_object': 'вещь со знаком собственности или надписью', 'pr:lime_mortar': 'известковый раствор', 'pr:honeycomb': 'соты с воском',
  'pr:wax_candle': 'восковая свеча', 'pr:log': 'бревно', 'pr:street_pavement': 'деревянная мостовая', 'pr:sledge': 'сани', 'pr:garment': 'одежда (шитая вещь)', 'pr:leather_small_goods': 'ножны, кошель, ремень',
};

// ---------- external refs ----------
const wk = L.loadWk();
const pfs = L.loadPlaceFamilies();
const v5 = L.loadV5();
const occRows = L.loadOccupations();
const occById = new Map(occRows.map(o => [o.occupation_id, o]));
const matcult = L.loadOptionalCsv('MATCULT_CATALOG');
const matcultIds = matcult ? new Set(matcult.map(r => r.item_id)) : null;
const warnings = [];

const mtById = new Map(MATERIALS.map(m => [m[0], m]));
const srcIds = new Set(SOURCES.map(s => s[0]));

function checkRefs(where, refs) {
  for (const r of split(refs)) {
    if (r.startsWith('src:')) { if (!srcIds.has(r)) warnings.push(`${where}: unknown source ${r}`); }
    else if (r.startsWith('claim:')) { if (!wk.claims.has(r)) warnings.push(`${where}: unknown WK claim ${r}`); }
    else if (r.startsWith('wk:')) { if (!wk.concepts.has(r)) warnings.push(`${where}: unknown WK concept ${r}`); }
    else warnings.push(`${where}: unrecognised ref ${r}`);
  }
}

// ---------- processes & steps ----------
const toolUse = new Map();   // tl -> Set(pc)
const mtUse = new Map();     // mt -> Set(pc/tl/ws)
const addUse = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };
const procRows = []; const stepRows = [];
const prodBy = new Map(); const prodIn = new Map();
for (const p of PROCESSES) {
  const stepTools = p.steps.flatMap(s => split(s[3]));
  const stepExtras = p.steps.flatMap(s => split(s[2]));
  const inputs = uniq([...split(p.inputs), ...stepExtras, p.steps[0][1]].filter(x => !x.startsWith('st:')));
  const tools = uniq([...split(p.tools), ...stepTools]);
  tools.forEach(t => addUse(toolUse, t, p.id));
  inputs.filter(x => x.startsWith('mt_')).forEach(m => addUse(mtUse, m, p.id));
  split(p.outputs).filter(x => x.startsWith('mt_')).forEach(m => addUse(mtUse, m, p.id));
  inputs.filter(x => x.startsWith('pr:')).forEach(x => addUse(prodIn, x, p.id));
  split(p.outputs).filter(x => x.startsWith('pr:')).forEach(x => addUse(prodBy, x, p.id));
  checkRefs(p.id, p.wk); checkRefs(p.id, p.sources);
  if (!pfs.has(p.workplace)) warnings.push(`${p.id}: unknown workplace ${p.workplace}`);
  procRows.push({
    pc_id: p.id, name_ru: p.name_ru, name_en: p.name_en, craft_group: p.group, master_family_ref: p.master_family, workplace_pf_id: p.workplace,
    inputs: inputs.join(';'), tools: tools.join(';'), fuel_heat: p.fuel_heat, outputs: p.outputs, waste_traces: p.waste, skill_level: p.skill,
    total_duration_band: p.total_duration, step_count: p.steps.length, season_constraints: p.season, failure_modes: p.failure_modes, defect_signs: p.defect_signs,
    player_feasibility_ru: p.feasibility, authenticity_owner: p.authenticity, region_id: '', wk_claim_refs: p.wk, source_refs: p.sources, confidence: p.conf, status: STATUS, note: p.note,
  });
  p.steps.forEach((s, i) => stepRows.push({
    step_id: `${p.id}__s${String(i + 1).padStart(2, '0')}`, pc_id: p.id, step_no: i + 1, action_ru: s[0], in_state: s[1], extra_inputs: s[2], tools: s[3],
    out_state: s[4], waste: s[5], duration_band: s[6], skill_level: s[7], checks_and_defects_ru: s[8], confidence: s[9], source_refs: p.sources, status: STATUS,
  }));
}

// ---------- occupations ----------
// Rule (README/VERIFICATION 2026-09-26): a link's confidence cannot exceed the tool's own confidence
// (occupations-v1 only names tool groups in general words, not specific tools), and its source_refs
// must be the tool's own source_refs, not a blanket occupations-v1 reference the TSV can't support.
const CONF_RANK = { A: 3, B: 2, C: 1, D: 0 };
const minConf = (a, b) => {
  if (!a) return b; if (!b) return a;
  return (CONF_RANK[a] ?? 0) <= (CONF_RANK[b] ?? 0) ? a : b;
};
const toolMetaById = new Map(TOOLS.map(t => [t[0], { conf: t[13], srcs: t[12] }]));
const occToolRows = []; const toolOcc = new Map();
for (const [occ, carried, wp, loc, conf, note] of OCC) {
  if (!occById.has(occ)) warnings.push(`occupation map: unknown occupation ${occ}`);
  for (const [kind, list] of [['carried', carried], ['workplace', wp]]) {
    for (const t of split(list)) {
      addUse(toolOcc, t, occ);
      const meta = toolMetaById.get(t);
      if (!meta) warnings.push(`occupation_tools: unknown tool ${t} for ${occ}`);
      const linkConf = meta ? minConf(conf, meta.conf) : conf;
      const linkSrc = meta && meta.srcs ? meta.srcs : 'src:occupations-v1';
      occToolRows.push({ occupation_id: occ, occupation_title: occById.get(occ)?.occupation_title || '', tl_id: t, carry_kind: kind, work_location_note_ru: loc, confidence: linkConf, source_refs: linkSrc, status: STATUS, note });
    }
  }
}

// ---------- workshops ----------
const wsRows = []; const toolWs = new Map();
for (const w of WORKSHOPS) {
  if (!pfs.has(w.pf)) warnings.push(`${w.id}: unknown pf ${w.pf}`);
  split(w.tools).forEach(t => addUse(toolWs, t, w.id));
  split(w.stocks).filter(x => x.startsWith('mt_')).forEach(m => addUse(mtUse, m, w.id));
  checkRefs(w.id, w.sources);
  wsRows.push({ ws_id: w.id, name_ru: w.name_ru, pf_id: w.pf, bt_id_proposed: w.bt, tools: w.tools, stocks: w.stocks, waste_traces: w.waste, ambience_sound_ru: w.sound, ambience_smell_ru: w.smell,
    light_fire_ru: w.light_fire, occupations: w.occupations, process_refs: w.processes, work_location: w.work_location, master_workshop_ref: w.master_ref, matcult_scene_ref: w.scene_ref,
    region_id: '', source_refs: w.sources, confidence: w.conf, status: STATUS, note: w.note });
}

// ---------- tools ----------
const bandOfGrams = g => BAND_BOUNDS.find(([, max]) => g < max)[0];
const toolRows = [];
for (const t of TOOLS) {
  const [id, ru, en, group, v5slug, wkc, mc, mats, size, massAtt, wp, extraPc, srcs, conf, note] = t;
  const matList = split(mats);
  matList.forEach(m => { if (!mtById.has(m)) warnings.push(`${id}: unknown material ${m}`); addUse(mtUse, m, id); });
  const dom = mtById.get(matList[0]);
  const mclass = FAMILY_CLASS[dom?.[3]] || 'light';
  let band = MASS_RULE[mclass][size]; let basis = `rule:${mclass}x${size}`;
  const grams = (massAtt.match(/(\d[\d\s]*)\s*г(?![а-я])/g) || []).map(x => parseInt(x.replace(/\D/g, ''), 10));
  if (grams.length) {
    const ab = bandOfGrams(Math.max(...grams));
    if (/головк/.test(massAtt)) { basis = 'attested_head_only;rule_for_whole'; band = ab > band ? ab : band; } // head mass is a lower bound
    // Named override for thin/long/soft/empty items the material_class x size_class rule misclassifies
    // (README/VERIFICATION 2026-09-26): a reasoned physical estimate, not an archaeological find.
    else if (/оценочно/.test(massAtt)) { band = ab; basis = 'estimated_physical'; }
    else { band = ab; basis = 'attested'; }
  }
  const tplId = v5slug ? `item_tpl_nov_${v5slug}_v1` : '';
  if (tplId && !v5.tpl.has(tplId)) warnings.push(`${id}: unknown v5 template ${tplId}`);
  const v5mass = tplId ? v5.mass.get(tplId) : undefined;
  const v5band = v5mass !== undefined ? bandOfGrams(v5mass) : '';
  if (wkc && !wk.concepts.has(`wk:material_culture:${wkc}`)) warnings.push(`${id}: unknown WK concept ${wkc}`);
  if (!pfs.has(wp)) warnings.push(`${id}: unknown workplace ${wp}`);
  if (matcultIds) split(mc).forEach(x => { if (!matcultIds.has(x)) warnings.push(`${id}: unknown matcult id ${x}`); });
  checkRefs(id, srcs); split(extraPc).forEach(r => checkRefs(id, r));
  let marks = MARKS[mclass];
  if (WELDED_EDGE.has(id)) marks += ';weld_seam_visible';
  if (INSCRIBED.has(id)) marks = 'owner_sign_or_inscription;' + marks;
  const procs = uniq([...(toolUse.get(id) || []), ...split(extraPc)]);
  toolRows.push({
    tl_id: id, name_ru: ru, name_en: en, craft_group: group,
    category_id: tplId ? `cat_item_object_${v5slug}_v1` : `cat_item_object_${id.replace(/^tl_/, '')}_v1`, category_status: tplId ? 'existing_v5' : 'proposed_new',
    item_template_ref: tplId, wk_concept_ref: wkc ? `wk:material_culture:${wkc}` : '', matcult_refs: mc, material: matList.join(';'), material_class: mclass, size_class: size,
    mass_band: band, mass_band_range: MASS_BANDS[band], mass_basis: basis, mass_attested: massAtt, v5_policy_mass_g: v5mass ?? '', v5_policy_band: v5band,
    used_in_process_refs: procs.join(';'), used_by_occupations: [...(toolOcc.get(id) || [])].join(';'), in_workshops: [...(toolWs.get(id) || [])].join(';'),
    workplace_pf_id: wp, condition_states: CONDITION[mclass], mark_slots: marks, region_id: '', source_refs: srcs, confidence: conf, status: STATUS, note,
  });
}

// ---------- materials ----------
const matRows = MATERIALS.map(m => {
  const [id, ru, en, fam, taxon, hard, brit, flam, buoy, work, dens, cues, origin, access, att, region, wkr, srcs, conf, aliases, note] = m;
  checkRefs(id, wkr); checkRefs(id, srcs);
  return { mt_id: id, name_ru: ru, name_en: en, material_family: fam, source_taxon_or_mineral_ref: taxon, hardness: hard, brittleness: brit, flammability: flam, buoyancy: buoy,
    workability: work, density: typeof dens === 'number' ? `${dens} г/см³` : dens, perceptual_cues_ru: cues, origin, access_class: access, attestation: att, region_id: region,
    referenced_by_count: (mtUse.get(id) || new Set()).size, aliases_ru: aliases, wk_refs: wkr, source_refs: srcs, confidence: conf, status: STATUS, note };
});

// ---------- products (bridge to items domains) ----------
const prodRows = uniq([...prodBy.keys(), ...prodIn.keys()]).sort().map(k => ({ product_ref: k, name_ru: PRODUCT_LABELS[k] || '', produced_by: [...(prodBy.get(k) || [])].join(';'), consumed_by: [...(prodIn.get(k) || [])].join(';'), items_domain_ref: '', status: STATUS }));
prodRows.filter(r => !r.name_ru).forEach(r => warnings.push(`product without label ${r.product_ref}`));

// ---------- write ----------
const counts = {};
counts['craft_tools_gear/tools_gear.csv'] = writeCsv(out('craft_tools_gear/tools_gear.csv'), Object.keys(toolRows[0]), toolRows);
counts['craft_tools_gear/occupation_tools.csv'] = writeCsv(out('craft_tools_gear/occupation_tools.csv'), Object.keys(occToolRows[0]), occToolRows);
counts['craft_processes/processes.csv'] = writeCsv(out('craft_processes/processes.csv'), Object.keys(procRows[0]), procRows);
counts['craft_processes/process_steps.csv'] = writeCsv(out('craft_processes/process_steps.csv'), Object.keys(stepRows[0]), stepRows);
counts['craft_processes/process_products.csv'] = writeCsv(out('craft_processes/process_products.csv'), Object.keys(prodRows[0]), prodRows);
counts['workshops/workshops.csv'] = writeCsv(out('workshops/workshops.csv'), Object.keys(wsRows[0]), wsRows);
counts['materials_registry/materials.csv'] = writeCsv(out('materials_registry/materials.csv'), Object.keys(matRows[0]), matRows);
const denyRows = DENY.map(d => ({ dl_id: d[0], term_ru: d[1], match_stems: d[2], kind: d[3], verdict: d[4], reason_ru: d[5], source_refs: d[6], status: STATUS }));
counts['materials_registry/late_materials_denylist.csv'] = writeCsv(out('materials_registry/late_materials_denylist.csv'), Object.keys(denyRows[0]), denyRows);
const srcRows = SOURCES.map(s => ({ src_id: s[0], citation: s[1], url_or_path: s[2], kind: s[3], base_confidence: s[4], used_for_ru: s[5] }));
counts['sources/sources.csv'] = writeCsv(out('sources/sources.csv'), Object.keys(srcRows[0]), srcRows);

L.fs.writeFileSync(out('build-report.json'), JSON.stringify({ built_by: 'scripts/build.cjs', counts, matcult_checked: !!matcultIds, warnings }, null, 2) + '\n');
console.log(JSON.stringify({ counts, warnings: warnings.length, matcult_checked: !!matcultIds }, null, 2));
if (warnings.length) { console.log(warnings.join('\n')); process.exitCode = 1; }
