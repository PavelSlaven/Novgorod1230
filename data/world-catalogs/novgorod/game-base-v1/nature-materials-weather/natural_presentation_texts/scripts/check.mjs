// Acceptance checks for natural_presentation_texts (catalog acceptance_ru):
//  - every G4 x season x applicable layer (13 layers) has >=1 row with clear_text AND partial_text;
//  - every taxon mentioned in a text is in that G4's habitat allowlist (dictionary = member taxon_words);
//  - no anachronism/regional-absent terms (shared denylist); no season contradictions
//    (summer text with snow/ice, winter text with green leaves/thunder);
//  - acoustic rows carry loudness 1..3; ids unique; every member in use has 4 seasons of visual phrases.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsv, readJson, fail, scentGroundForFamilies, SEASONS, SHARED, GROUP_DIR, denyRegex } from '../../_shared/scripts/lib.mjs';
import { GROUND_STATES } from '../../../../../../../packages/contracts/src/weather-state.js';
import MEMBERS, { EXTRA_MEMBERS } from '../authoring/members.mjs';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const E = [];
const rows = readCsv(path.join(DIR, 'presentation_texts.csv'));
const coverage = readCsv(path.join(DIR, 'sensory_coverage.csv'));
const mrows = readCsv(path.join(DIR, 'member_phrases.csv'));
const allow = readCsv(path.join(DIR, 'habitat_allowlist.csv'));
const g4index = readJson(path.join(SHARED, 'g4_nature_index.json'));
const bindings = readCsv(path.resolve(DIR, '../../places-binding/places/node_binding.csv'));
const placeFamilies = readCsv(path.resolve(DIR, '../../places-binding/places/place_families.csv'));
const groundRows = readCsv(path.join(GROUP_DIR, 'natural_materials_soils', 'ground_types.csv'));
const ground = new Map(groundRows.map((g) => [g.soil_ground_type, g]));
const scentGround = scentGroundForFamilies(placeFamilies, groundRows);
const landscapeByG4 = new Map(bindings.filter((b) => b.node_level === 'G4').map((b) => [b.node_ref.replace(/@1$/, ''), b.landscape_template_id]));
const landscapeByPF = new Map(placeFamilies.map((pf) => [pf.pf_id, new Set(pf.landscape_template_refs.split(';').filter(Boolean))]));
const deny = readJson(path.join(SHARED, 'anachronism_denylist.json'));
const denyRe = denyRegex(deny.terms_ru.concat(deny.terms_en));
const ALL = { ...MEMBERS, ...EXTRA_MEMBERS };
const LAYERS = ['surface', 'relief', 'water_body', 'bank_structure', 'tree_layer', 'shrub_layer', 'ground_cover', 'riparian_vegetation', 'natural_materials', 'seasonal_state', 'light', 'weather', 'audible_context'];
const W = '[A-Za-zА-Яа-яЁё]';
const dict = Object.entries(ALL).flatMap(([ref, m]) => m.taxon_words.map((w) => ({ ref, re: new RegExp(`(?<!${W})${w}`, 'i') })));
const allowBy = {}; for (const a of allow) (allowBy[a.g4_ref] ||= new Set()).add(a.member_ref);
const SEASON_DENY = { summer: denyRegex(['снег', 'снеж', 'лёд', 'льд', 'лед', 'метел', 'иней', 'шуг', 'мороз', 'сугроб']), winter: denyRegex(['зелен', 'зелён', 'ливен', 'гроз', 'жар', 'комар', 'цвет', 'листв!']) };

const snowWordRe = /снег|снеж|сугроб|занес[её]н/i;
const ids = new Set();
for (const r of rows) {
  if (ids.has(r.npt_id)) E.push('duplicate ' + r.npt_id); ids.add(r.npt_id);
  const text = `${r.clear_text} ${r.partial_text}`;
  if (!r.clear_text || !r.partial_text) E.push(`empty text ${r.npt_id}`);
  if (!r.source_refs) E.push(`no source_refs ${r.npt_id}`);
  for (const [, state] of r.requires.matchAll(/\bground_state!?=([a-z_]+)/g)) if (!GROUND_STATES.includes(state)) E.push(`invalid ground_state ${state} in ${r.npt_id}`);
  const hit = text.match(denyRe); if (hit) E.push(`anachronism "${hit[0]}" in ${r.npt_id}`);
  for (const d of dict) if (d.re.test(text) && !allowBy[r.g4_ref]?.has(d.ref)) E.push(`taxon ${d.ref} not in habitat allowlist: ${r.npt_id}`);
  const sd = SEASON_DENY[r.season_period]; if (sd) { const h = text.match(sd); if (h) E.push(`season contradiction "${h[0]}" in ${r.npt_id}`); }
  if (r.channel === 'acoustic' && !['1', '2', '3'].includes(r.loudness)) E.push(`acoustic without loudness ${r.npt_id}`);
  if (r.channel === 'visual' && r.loudness) E.push(`visual with loudness ${r.npt_id}`);
  if (r.channel === 'olfactory') {
    if (r.layer !== 'ground_scent' || r.loudness || r.season_period === 'winter' || !r.source_refs.includes(`ground_types.csv#soil_ground_type=${r.layer_class}`) || !ground.get(r.layer_class)?.perceptual_cues.includes('запах:')) E.push(`unsupported scent ${r.npt_id}`);
    if (/люд|челов|дым|кост[её]р|печ[ьи]|скот|навоз/i.test(text)) E.push(`human ambience in natural scent ${r.npt_id}`);
  }
  const snowText = text.replace(/бесснеж\p{L}*/giu, '');
  if (snowWordRe.test(snowText) && (!r.requires || r.requires.includes('ground_state!=snow') || !/ground_state=snow|weather_state=|water_condition=/.test(r.requires))) E.push(`snow word without snow condition: ${r.npt_id}`);
}
let cells = 0;
for (const g of g4index.g4) for (const s of SEASONS) for (const layer of LAYERS) {
  if (g.applicability[layer] !== 'present') continue;
  cells++;
  if (!rows.some((r) => r.g4_ref === g.g4_id && r.season_period === s && r.layer === layer && r.clear_text && r.partial_text)) E.push(`missing ${g.g4_short}/${s}/${layer}`);
  if (s === 'winter' && layer === 'tree_layer' && !rows.some((r) => r.g4_ref === g.g4_id && r.season_period === s && r.layer === layer && ['default', 'no_snow'].includes(r.condition))) E.push(`missing no-snow trees ${g.g4_short}`);
}
const TARGET_PF = ['bog', 'conifer_woodland', 'ferry_landing', 'floodplain_meadow', 'forest_edge', 'forest_track', 'hunting_ground', 'marshy_stream', 'outbuildings', 'peasant_homestead', 'river_channel', 'riverbank', 'road', 'rural_yard', 'village_lane', 'winter_ice_crossing'];
const indexedG4 = new Set(g4index.g4.map((g) => g.g4_id));
const matrix = { visual: { sourced: 0, partial: 0, no_source: 0 }, acoustic: { sourced: 0, partial: 0, no_source: 0 }, olfactory: { sourced: 0, partial: 0, no_source: 0 } };
const coverageKeys = new Set();
const coverageMismatch = (actual, expectedCoverage, expectedBasis) => actual.coverage !== expectedCoverage || actual.basis_ref !== expectedBasis;
let negativeProbe = false;
for (const c of coverage) {
  const key = `${c.pf_id}/${c.season_period}/${c.aspect}`;
  if (coverageKeys.has(key)) E.push(`duplicate sensory coverage ${key}`);
  coverageKeys.add(key);
  if (!TARGET_PF.includes(c.pf_id) || !SEASONS.includes(c.season_period) || !matrix[c.aspect] || (c.pf_id === 'winter_ice_crossing' && c.season_period !== 'winter')) E.push(`invalid sensory scope ${key}`);
  if (!['sourced', 'partial', 'no_source'].includes(c.coverage) || c.status !== 'candidate') E.push(`invalid sensory coverage ${key}`);
  if (matrix[c.aspect]?.[c.coverage] !== undefined) matrix[c.aspect][c.coverage]++;
}
for (const pf of TARGET_PF) {
  const primaryRefs = bindings.filter((b) => b.node_level === 'G4' && b.pf_id === `pf_${pf}`).map((b) => b.node_ref.replace(/@1$/, ''));
  const secondaryRefs = bindings.filter((b) => b.node_level === 'G4' && b.pf_id !== `pf_${pf}` && b.pf_secondary.split(';').includes(`pf_${pf}`)).map((b) => b.node_ref.replace(/@1$/, ''));
  const g4refs = primaryRefs.concat(secondaryRefs);
  if (!g4refs.some((ref) => indexedG4.has(ref))) E.push(`no natural G4 binding for ${pf}`);
  for (const s of (pf === 'winter_ice_crossing' ? ['winter'] : SEASONS)) for (const aspect of Object.keys(matrix)) {
    const key = `${pf}/${s}/${aspect}`;
    const matches = (r) => r.season_period === s && r.channel === aspect && (aspect !== 'olfactory' || scentGround.get(`pf_${pf}`)?.has(r.layer_class)) && r.clear_text && r.partial_text && r.source_refs;
    const preferred = landscapeByPF.get(`pf_${pf}`);
    const candidates = (refs) => rows.filter((r) => refs.includes(r.g4_ref) && matches(r));
    const primary = candidates(primaryRefs);
    const secondary = candidates(secondaryRefs);
    const best = (items) => items.find((r) => preferred?.has(landscapeByG4.get(r.g4_ref))) || items[0];
    const primaryEvidence = best(primary);
    const evidence = primaryEvidence || best(secondary);
    const expectedCoverage = primaryEvidence ? 'sourced' : evidence ? 'partial' : 'no_source';
    const expectedBasis = evidence ? evidence.npt_id : `no_source:${aspect}_pf_season`;
    const c = coverage.find((x) => x.pf_id === pf && x.season_period === s && x.aspect === aspect);
    if (!c) E.push(`missing sensory coverage ${key}`);
    else if (coverageMismatch(c, expectedCoverage, expectedBasis)) E.push(`sensory coverage mismatch ${key}`);
    const oldChoice = primary[0] || secondary[0];
    if (oldChoice && oldChoice.npt_id !== expectedBasis) {
      negativeProbe ||= coverageMismatch({ coverage: expectedCoverage, basis_ref: oldChoice.npt_id }, expectedCoverage, expectedBasis);
    }
  }
}
if (!negativeProbe) E.push('sensory preference negative probe did not reject the first incompatible G4 evidence');
const used = new Set(allow.map((a) => a.member_ref));
for (const g of g4index.g4) for (const m of g.members) used.add(m.ref);
for (const ref of used) for (const s of SEASONS) if (!mrows.some((m) => m.member_ref === ref && m.season_period === s && m.channel === 'visual' && m.clear_text && m.partial_text)) E.push(`member phrase missing ${ref}/${s}`);
const mids = new Set();
for (const m of mrows) {
  if (mids.has(m.npm_id)) E.push('duplicate ' + m.npm_id); mids.add(m.npm_id);
  const h = `${m.clear_text} ${m.partial_text}`.match(denyRe); if (h) E.push(`anachronism in member ${m.npm_id}`); const sd = SEASON_DENY[m.season_period]; if (sd && sd.test(`${m.clear_text} ${m.partial_text}`)) E.push(`season contradiction member ${m.npm_id}`); if (m.channel === 'acoustic' && !['1', '2', '3'].includes(m.loudness)) E.push(`member acoustic loudness ${m.npm_id}`);
}
console.log(`checked: ${rows.length} texts, ${cells} G4 x season x layer cells, ${mrows.length} member phrases, ${allow.length} allowlist rows, ${dict.length} taxon words`);
console.log(`checked: ${coverage.length} target PF x season x aspect cells (winter crossing only winter): ${JSON.stringify(matrix)}`);
fail(E, 'natural_presentation_texts check');
