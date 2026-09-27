// Acceptance checks for natural_materials_soils (catalog acceptance_ru):
//  - every one of the 32 G4 has >=1 ground and >=3 natural raw materials;
//  - stock_portions equals FREQ_WEIGHT[class] x BASE_PORTIONS (formula recomputed);
//  - season_access agrees with the calendar: digging-type materials closed in winter (frozen ground);
//  - every row has source_refs and confidence A/B/C; every wk:claim ref exists in WK production-v1;
//  - ids unique; no anachronism terms (shared denylist).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsv, readJson, fail, FREQ_WEIGHT, SHARED, MAIN, denyRegex } from '../../_shared/scripts/lib.mjs';
import { BASE_PORTIONS } from '../authoring/materials.mjs';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const g4index = readJson(path.join(SHARED, 'g4_nature_index.json'));
const mats = readCsv(path.join(DIR, 'natural_materials.csv'));
const ground = readCsv(path.join(DIR, 'ground_types.csv'));
const g4rows = readCsv(path.join(DIR, 'g4_ground_and_materials.csv'));
const pres = readCsv(path.join(DIR, 'material_landscape_presence.csv'));
const matById = Object.fromEntries(mats.map((m) => [m.nm_id, m]));

// WK claim index
const wkDir = path.join(MAIN, 'data/world-catalogs/novgorod/world-knowledge/production-v1');
const wkClaims = new Set();
for (const f of fs.readdirSync(wkDir).filter((f) => f.endsWith('.json') && !f.startsWith('verification'))) {
  try { for (const c of JSON.parse(fs.readFileSync(path.join(wkDir, f), 'utf8')).claims || []) wkClaims.add(c.claim_ref); } catch { /* not a claim file */ }
}
const deny = JSON.parse(fs.readFileSync(path.join(SHARED, 'anachronism_denylist.json'), 'utf8'));
const denyRe = denyRegex(deny.terms_ru.concat(deny.terms_en));

for (const [name, rows, idk] of [['natural_materials', mats, 'nm_id'], ['ground_types', ground, 'nm_id'], ['g4_ground_and_materials', g4rows, 'row_id'], ['material_landscape_presence', pres, 'presence_id']]) {
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r[idk])) errors.push(`${name}: duplicate id ${r[idk]}`); seen.add(r[idk]);
    if (!r.source_refs) errors.push(`${name}:${r[idk]} missing source_refs`);
    if (!['A', 'B', 'C'].includes(r.confidence)) errors.push(`${name}:${r[idk]} bad confidence ${r.confidence}`);
    for (const ref of r.source_refs.split('|')) if (ref.startsWith('wk:claim:') && !wkClaims.has(ref.slice(3))) errors.push(`${name}:${r[idk]} unknown WK ${ref}`);
    const text = Object.values(r).join(' ');
    const hit = text.match(denyRe); if (hit) errors.push(`${name}:${r[idk]} anachronism term "${hit[0]}"`);
  }
}

const expect = (cls) => FREQ_WEIGHT[cls] * BASE_PORTIONS;
for (const r of [...g4rows.filter((x) => x.role === 'raw_material'), ...pres]) {
  if (r.stock_portions === 'unbounded') { if (!/water/.test(r.nm_id)) errors.push(`${r.nm_id} unbounded but not water`); continue; }
  if (Number(r.stock_portions) !== expect(r.frequency_class)) errors.push(`stock formula mismatch ${r.row_id || r.presence_id}: ${r.stock_portions} != ${expect(r.frequency_class)}`);
  if (Number(r.weight) !== FREQ_WEIGHT[r.frequency_class]) errors.push(`weight mismatch ${r.row_id || r.presence_id}`);
}

const DIG_KINDS = ['mineral_ground', 'organic_ground', 'ore'];
for (const m of mats) {
  const winter = m.season_winter.split(':')[0];
  if (DIG_KINDS.includes(m.material_kind) && winter !== 'closed') errors.push(`calendar: ${m.nm_id} dig material not closed in winter (${winter})`);
  for (const s of ['season_winter', 'season_spring', 'season_summer', 'season_autumn']) if (!/^(open|limited|closed)/.test(m[s])) errors.push(`${m.nm_id} bad ${s}`);
}
for (const r of g4rows.filter((x) => x.role === 'raw_material')) {
  const m = matById[r.nm_id];
  if (!m) { errors.push(`g4 row unknown material ${r.nm_id}`); continue; }
  if (r.season_winter !== m.season_winter.split(':')[0]) errors.push(`season copy mismatch ${r.row_id}`);
}

const per = {};
for (const g of g4index.g4) per[g.g4_id] = { ground: 0, raw: 0 };
for (const r of g4rows) { if (!per[r.g4_ref]) { errors.push('unknown g4 ' + r.g4_ref); continue; } per[r.g4_ref][r.role === 'ground' ? 'ground' : 'raw']++; }
for (const [g, c] of Object.entries(per)) {
  if (c.ground < 1) errors.push(`G4 ${g} has no ground`);
  if (c.raw < 3) errors.push(`G4 ${g} has only ${c.raw} raw materials`);
}
const groundIds = new Set(ground.map((x) => x.nm_id));
for (const r of g4rows.filter((x) => x.role === 'ground')) if (!groundIds.has(r.nm_id)) errors.push(`ground ref missing ${r.nm_id}`);

console.log(`checked: materials ${mats.length}, ground ${ground.length}, presence ${pres.length}, g4 rows ${g4rows.length}, G4 ${Object.keys(per).length}, WK claims indexed ${wkClaims.size}`);
console.log('min raw materials per G4:', Math.min(...Object.values(per).map((c) => c.raw)));
fail(errors, 'natural_materials_soils check');
