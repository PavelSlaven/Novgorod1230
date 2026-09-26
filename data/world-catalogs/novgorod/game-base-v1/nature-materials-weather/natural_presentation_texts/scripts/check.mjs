// Acceptance checks for natural_presentation_texts (catalog acceptance_ru):
//  - every G4 x season x applicable layer (13 layers) has >=1 row with clear_text AND partial_text;
//  - every taxon mentioned in a text is in that G4's habitat allowlist (dictionary = member taxon_words);
//  - no anachronism/regional-absent terms (shared denylist); no season contradictions
//    (summer text with snow/ice, winter text with green leaves/thunder);
//  - acoustic rows carry loudness 1..3; ids unique; every member in use has 4 seasons of visual phrases.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsv, readJson, fail, SEASONS, SHARED, denyRegex } from '../../_shared/scripts/lib.mjs';
import MEMBERS, { EXTRA_MEMBERS } from '../authoring/members.mjs';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const E = [];
const rows = readCsv(path.join(DIR, 'presentation_texts.csv'));
const mrows = readCsv(path.join(DIR, 'member_phrases.csv'));
const allow = readCsv(path.join(DIR, 'habitat_allowlist.csv'));
const g4index = readJson(path.join(SHARED, 'g4_nature_index.json'));
const deny = readJson(path.join(SHARED, 'anachronism_denylist.json'));
const denyRe = denyRegex(deny.terms_ru.concat(deny.terms_en));
const ALL = { ...MEMBERS, ...EXTRA_MEMBERS };
const LAYERS = ['surface', 'relief', 'water_body', 'bank_structure', 'tree_layer', 'shrub_layer', 'ground_cover', 'riparian_vegetation', 'natural_materials', 'seasonal_state', 'light', 'weather', 'audible_context'];
const W = '[A-Za-zА-Яа-яЁё]';
const dict = Object.entries(ALL).flatMap(([ref, m]) => m.taxon_words.map((w) => ({ ref, re: new RegExp(`(?<!${W})${w}`, 'i') })));
const allowBy = {}; for (const a of allow) (allowBy[a.g4_ref] ||= new Set()).add(a.member_ref);
const SEASON_DENY = { summer: denyRegex(['снег', 'снеж', 'лёд', 'льд', 'лед', 'метел', 'иней', 'шуг', 'мороз', 'сугроб']), winter: denyRegex(['зелен', 'зелён', 'ливен', 'гроз', 'жар', 'комар', 'цвет', 'листв!']) };

const snowWordRe = /сне[гж]|сугроб/i;
const ids = new Set();
for (const r of rows) {
  if (ids.has(r.npt_id)) E.push('duplicate ' + r.npt_id); ids.add(r.npt_id);
  const text = `${r.clear_text} ${r.partial_text}`;
  if (!r.clear_text || !r.partial_text) E.push(`empty text ${r.npt_id}`);
  if (!r.source_refs) E.push(`no source_refs ${r.npt_id}`);
  const hit = text.match(denyRe); if (hit) E.push(`anachronism "${hit[0]}" in ${r.npt_id}`);
  for (const d of dict) if (d.re.test(text) && !allowBy[r.g4_ref]?.has(d.ref)) E.push(`taxon ${d.ref} not in habitat allowlist: ${r.npt_id}`);
  const sd = SEASON_DENY[r.season_period]; if (sd) { const h = text.match(sd); if (h) E.push(`season contradiction "${h[0]}" in ${r.npt_id}`); }
  if (r.channel === 'acoustic' && !['1', '2', '3'].includes(r.loudness)) E.push(`acoustic without loudness ${r.npt_id}`);
  if (r.channel === 'visual' && r.loudness) E.push(`visual with loudness ${r.npt_id}`);
  if (snowWordRe.test(text) && !r.requires) E.push(`snow word with empty requires: ${r.npt_id}`);
}
let cells = 0;
for (const g of g4index.g4) for (const s of SEASONS) for (const layer of LAYERS) {
  if (g.applicability[layer] !== 'present') continue;
  cells++;
  if (!rows.some((r) => r.g4_ref === g.g4_id && r.season_period === s && r.layer === layer && r.clear_text && r.partial_text)) E.push(`missing ${g.g4_short}/${s}/${layer}`);
}
const used = new Set(allow.map((a) => a.member_ref));
for (const g of g4index.g4) for (const m of g.members) used.add(m.ref);
for (const ref of used) for (const s of SEASONS) if (!mrows.some((m) => m.member_ref === ref && m.season_period === s && m.channel === 'visual' && m.clear_text && m.partial_text)) E.push(`member phrase missing ${ref}/${s}`);
const mids = new Set();
for (const m of mrows) {
  if (mids.has(m.npm_id)) E.push('duplicate ' + m.npm_id); mids.add(m.npm_id);
  const h = `${m.clear_text} ${m.partial_text}`.match(denyRe); if (h) E.push(`anachronism in member ${m.npm_id}`); const sd = SEASON_DENY[m.season_period]; if (sd && sd.test(`${m.clear_text} ${m.partial_text}`)) E.push(`season contradiction member ${m.npm_id}`); if (m.channel === 'acoustic' && !['1', '2', '3'].includes(m.loudness)) E.push(`member acoustic loudness ${m.npm_id}`);
}
console.log(`checked: ${rows.length} texts, ${cells} G4 x season x layer cells, ${mrows.length} member phrases, ${allow.length} allowlist rows, ${dict.length} taxon words`);
fail(E, 'natural_presentation_texts check');
