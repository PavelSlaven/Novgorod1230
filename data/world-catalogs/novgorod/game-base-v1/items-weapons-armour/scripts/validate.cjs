// Validate items-weapons-armour outputs: ids, role links, denylist, reference resolution, place families, events.
// Usage: node scripts/validate.cjs   (writes validation_report.json; exit 1 on errors)
const fs = require('fs'), path = require('path');
const { ROOT, P, readJson, readCsv, readTsv, wkIndex } = require('./lib.cjs');

const errors = [], warnings = [], stats = {};
const err = (m) => errors.push(m), warn = (m) => warnings.push(m);
const split = v => (v || '').split(' | ').map(s => s.trim()).filter(Boolean);
const load = rel => readCsv(path.join(ROOT, rel));

const wp = load('items/weapons_armour.csv'), acc = load('items/weapon_status_access.csv'), eq = load('items/weapon_equipment_profiles.csv');
const cw = load('items/weapon_source_crosswalk.csv'), dn = load('items/weapon_denylist.csv');
const sec = load('military/security.csv'), ev = load('military/military_events.csv'), cl = load('military/combat_likelihood_by_role.csv');

// --- reference universes
const roles = readTsv(P.roles), occs = readTsv(P.occs);
const roleIds = new Set(roles.map(r => r.role_id)), occById = Object.fromEntries(occs.map(o => [o.occupation_id, o]));
const roleById = Object.fromEntries(roles.map(r => [r.role_id, r]));
const wk = wkIndex();
const pfIds = new Set(readJson(path.join(P.wkDir, 'place-first-cartography.json')).environment_families.map(f => f.id));
const master = new Set(readCsv(P.authoring('master_military_snapshot.csv')).map(r => r.item_id));
const costume = new Set(readCsv(path.join(P.costume, 'catalog_items.csv')).map(r => r.item_id));
const costumeAnti = new Set(readCsv(path.join(P.costume, 'anti_patterns.csv')).map(r => r.anti_id));
const v5 = new Set();
for (const f of ['universal_categories.json', 'item_templates.json', 'container_templates.json']) {
  const j = readJson(path.join(P.v5, f)); const a = Array.isArray(j) ? j : Object.values(j).find(Array.isArray); a.forEach(x => v5.add(x.id));
}
const tlIds = new Set(readJson(P.timeline).timeline.map(e => e.event_id));
const sr = readJson(P.statusRules);
const statusRuleIds = new Set([...sr.status_interaction_rules.map(r => 'statusrules:' + r.rule_id), ...sr.conflict_rules.map(r => 'statusrules:conflict:' + r.conflict)]);
const lit = new Set(readJson(P.authoring('literature.json')).sources.map(s => s.id));
const bible = fs.readFileSync(P.bible, 'utf8');
const bibleItems = new Set(readJson(P.bibleItems).map(x => x.id));
const catalog = readJson(P.catalog);
let sqliteKeys = null;
try {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(P.sqlite, { readOnly: true });
  const keyCol = { city_features: 'id', institutions: 'id', law: 'id', persons_1230: 'id', events: 'date', social_groups: 'group_name' };
  sqliteKeys = {};
  for (const [t, c] of Object.entries(keyCol)) sqliteKeys[t] = new Set(db.prepare(`SELECT "${c}" AS k FROM "${t}"`).all().map(r => String(r.k)));
  db.close();
} catch (e) { warn('sqlite not readable, sqlite: refs not resolved: ' + e.message); }
const eqIds = new Set(eq.map(r => r.profile_id)), wpIds = new Set(wp.map(r => r.wp_id));

function resolve(ref) {
  let m;
  if ((m = ref.match(/^wk:(claim:.+)$/))) { const c = wk.claims[m[1]]; if (!c) return 'WK claim missing'; if (c.status !== 'approved') return 'WK claim not approved: ' + c.status; return null; }
  if ((m = ref.match(/^master:mc:(.+)$/))) return master.has(m[1]) ? null : 'master row missing';
  if ((m = ref.match(/^costume:anti:(.+)$/))) return costumeAnti.has(m[1]) ? null : 'costume anti-pattern missing';
  if ((m = ref.match(/^costume:(.+)$/))) return costume.has(m[1]) ? null : 'costume item missing';
  if ((m = ref.match(/^v5:(.+)$/))) return v5.has(m[1]) ? null : 'v5 id missing';
  if ((m = ref.match(/^tsv:role:([^#]+)#(.+)$/))) return !roleById[m[1]] ? 'role missing' : !(m[2] in roleById[m[1]]) ? 'role field missing' : null;
  if ((m = ref.match(/^tsv:occ:([^#]+)#(.+)$/))) return !occById[m[1]] ? 'occupation missing' : !(m[2] in occById[m[1]]) ? 'occupation field missing' : null;
  if ((m = ref.match(/^timeline:(.+)$/))) return tlIds.has(m[1]) ? null : 'timeline event missing';
  if ((m = ref.match(/^sqlite:([^:]+):(.+)$/))) { if (!sqliteKeys) return null; const s = sqliteKeys[m[1]]; return !s ? 'sqlite table not indexed' : s.has(m[2]) ? null : 'sqlite key missing'; }
  if ((m = ref.match(/^lit:(.+)$/))) return lit.has(m[1]) ? null : 'literature id missing';
  if (ref.startsWith('statusrules:')) return statusRuleIds.has(ref) ? null : 'status rule missing';
  if ((m = ref.match(/^bible:§\d+ (.+)$/))) { const t = m[1].replace(/\s*\(.*\)\s*$/, ''); return bible.includes(t) ? null : 'bible heading/text not found'; }
  if ((m = ref.match(/^chbible:items\.json#(.+)$/))) return bibleItems.has(m[1]) ? null : 'bible item missing';
  if ((m = ref.match(/^catalog:conventions\.(.+)$/))) return catalog.conventions && catalog.conventions[m[1]] ? null : 'catalog convention missing';
  if ((m = ref.match(/^items\/weapon_status_access\.csv#tier=(.+)$/))) return acc.some(r => r.tier === m[1]) ? null : 'tier missing';
  return 'unknown ref scheme';
}
const refStats = { total: 0, byScheme: {} };
function checkRefs(where, refs) {
  if (!refs.length) err(`${where}: empty source_refs`);
  for (const r of refs) { refStats.total++; const s = r.split(':')[0]; refStats.byScheme[s] = (refStats.byScheme[s] || 0) + 1; const e = resolve(r); if (e) err(`${where}: ref ${r} -> ${e}`); }
}
const uniq = (rows, f, name) => { const seen = new Set(); for (const r of rows) { if (seen.has(r[f])) err(`${name}: duplicate id ${r[f]}`); seen.add(r[f]); } };
const conf = (where, c) => { if (!['A', 'B', 'C'].includes(c)) err(`${where}: bad confidence '${c}'`); };

// --- weapons_armour
uniq(wp, 'wp_id', 'weapons_armour');
for (const r of wp) {
  const w = 'wp ' + r.wp_id;
  const sa = split(r.status_access);
  if (!sa.length) err(`${w}: status_access empty`);
  for (const id of [...sa, ...split(r.expected_for_roles)]) if (!roleIds.has(id)) err(`${w}: unknown role ${id}`);
  if (r.parent_wp_id && !wpIds.has(r.parent_wp_id)) err(`${w}: parent missing`);
  if (!(+r.period_from <= 1230 && +r.period_to >= 1230 && +r.period_to <= 1260)) err(`${w}: period ${r.period_from}-${r.period_to} does not cover 1230 inside 1100–1260`);
  if (!split(r.condition_states).length) err(`${w}: no condition_states`);
  if (!r.category_id) err(`${w}: no category_id`);
  if (r.category_status === 'existing_v5_candidate' && !v5.has(r.category_id)) err(`${w}: category ${r.category_id} not in v5`);
  if (!/^cat_(item|container)_[a-z_]+_v1$/.test(r.category_id)) err(`${w}: category id format`);
  checkRefs(w, split(r.source_refs)); split(r.legal_right_ref).forEach(x => { const e = resolve(x); if (e) err(`${w}: legal ref ${x} -> ${e}`); });
  conf(w, r.confidence); if (r.status !== 'candidate') err(`${w}: status must be candidate`);
}
// denylist scan over generated names/materials/summaries
const denyTerms = dn.flatMap(d => split(d.match_terms).map(t => [d.deny_id, t.toLowerCase()]));
const scan = (where, text) => { const t = (text || '').toLowerCase(); for (const [id, term] of denyTerms) if (t.includes(term)) err(`${where}: denylisted term '${term}' (${id})`); };
for (const r of wp) scan('wp ' + r.wp_id, [r.name_ru, r.name_en, r.material].join(' '));
for (const r of sec) scan('security ' + r.ms_id, r.name_ru);
for (const r of dn) { conf('deny ' + r.deny_id, r.confidence); checkRefs('deny ' + r.deny_id, split(r.source_refs)); }
// crosswalk completeness
for (const r of cw) { if (r.mapping === 'UNMAPPED') err(`crosswalk: ${r.source_id} unmapped`); for (const t of split(r.target)) if (r.mapping === 'wp' && !wpIds.has(t)) err(`crosswalk: ${r.source_id} -> missing wp ${t}`); }
// D-confidence MASTER rows must not be mapped into wp as a normal kind unless kind is confidence C with note
for (const r of cw) if (r.mapping === 'wp' && r.source_confidence === 'D') { const k = wp.find(x => x.wp_id === split(r.target)[0]); if (!k || k.confidence !== 'C' || !k.note) err(`crosswalk: D-row ${r.source_id} mapped to ${r.target} without C+note`); else warn(`D-row ${r.source_id} (${r.source_name_ru}) kept under ${r.target} as C with note`); }
// status access table
for (const r of acc) { if (!roleIds.has(r.role_id)) err('access: unknown role ' + r.role_id); checkRefs('access ' + r.role_id + '/' + r.tier, split(r.source_refs)); }
// equipment profiles
for (const r of eq) {
  const w = 'eq ' + r.entry_id;
  if (!wpIds.has(r.wp_id)) err(`${w}: unknown wp ${r.wp_id}`);
  if (r.role_id && !roleIds.has(r.role_id)) err(`${w}: unknown role`);
  if (r.occupation_id && !occById[r.occupation_id]) err(`${w}: unknown occupation`);
  for (const b of split(r.base_role_ids)) if (!roleIds.has(b)) err(`${w}: unknown base role ${b}`);
  if (!r.role_id && !r.occupation_id && !split(r.base_role_ids).length) err(`${w}: profile has no role/occupation/base roles`);
  if (!['1', '2', '4', '8'].includes(r.weight)) err(`${w}: weight ${r.weight} not in 8/4/2/1`);
  if (r.required === 'true' && r.weight !== '8') err(`${w}: required entry must weigh 8`);
  checkRefs(w, split(r.source_refs)); conf(w, r.confidence);
}
// every elite/common wp used by roles in status_access? (info)
// --- military security
uniq(sec, 'ms_id', 'security');
const secIds = new Set(sec.map(r => r.ms_id));
for (const r of sec) {
  const w = 'security ' + r.ms_id;
  const pfs = split(r.pf_ids); if (!pfs.length) err(`${w}: no pf_id`); for (const p of pfs) if (!pfIds.has(p)) err(`${w}: unknown pf_id ${p}`);
  const rs = split(r.roles); if (!rs.length) err(`${w}: no roles`); for (const x of rs) if (!roleIds.has(x)) err(`${w}: unknown role ${x}`);
  for (const o of split(r.occupations)) if (!occById[o]) err(`${w}: unknown occupation ${o}`);
  for (const e of split(r.equipment_profile_ref)) if (!eqIds.has(e)) err(`${w}: unknown equipment profile ${e}`);
  for (const d of split(r.duty_schedule_ref)) { const e = resolve(d); if (e) err(`${w}: duty ref ${d} -> ${e}`); }
  for (const e of split(r.event_refs)) if (!tlIds.has(e)) err(`${w}: unknown event ${e}`);
  if (['unit', 'post'].includes(r.unit_or_post_kind) && !split(r.equipment_profile_ref).length && r.ms_id !== 'ms_post_yard_gate') warn(`${w}: unit/post without equipment profile`);
  checkRefs(w, split(r.source_refs)); conf(w, r.confidence);
}
uniq(ev, 'ms_event_id', 'events');
for (const r of ev) {
  const w = 'event ' + r.ms_event_id;
  if (r.event_ref && !tlIds.has(r.event_ref)) err(`${w}: event_ref not in historical timeline`);
  if (!r.event_ref && +r.year >= 1230) err(`${w}: event in 1230+ without historical_events ref`);
  for (const u of [...split(r.units), ...split(r.consequences)]) if (!secIds.has(u)) err(`${w}: unknown security id ${u}`);
  checkRefs(w, split(r.source_refs)); conf(w, r.confidence);
}
for (const r of cl) { if (!roleIds.has(r.role_id)) err('combat: unknown role ' + r.role_id); if (r.combat_likelihood !== 'unknown') checkRefs('combat ' + r.role_id, split(r.source_refs)); else warn('combat: role ' + r.role_id + ' has unknown combat_likelihood (gap)'); }

Object.assign(stats, { weapons_armour: wp.length, status_access_rows: acc.length, equipment_entries: eq.length, equipment_profiles: eqIds.size, crosswalk: cw.length, denylist: dn.length, security: sec.length, events: ev.length, combat_roles: cl.length, refs: refStats });
const report = { checked: new Date().toISOString().slice(0, 10), ok: errors.length === 0, stats, errors, warnings };
fs.writeFileSync(path.join(ROOT, 'validation_report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ok: report.ok, stats, errors: errors.length, warnings: warnings.length }, null, 1));
if (errors.length) { console.log(errors.slice(0, 60).join('\n')); process.exit(1); }
