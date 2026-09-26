'use strict';
// Acceptance checks for crafts-tools-processes (catalog acceptance_ru of craft_tools_gear, craft_processes, workshops, materials_registry).
// Reads the built CSVs, writes validation-report.json and materials_registry/material_resolution.csv. Exit code 1 on any FAIL.
const L = require('./lib.cjs');
const { path, fs, split, readCsv, writeCsv, DOMAIN_ROOT, GAME_BASE } = L;
const P = rel => path.join(DOMAIN_ROOT, rel);

const tools = readCsv(P('craft_tools_gear/tools_gear.csv'));
const occTools = readCsv(P('craft_tools_gear/occupation_tools.csv'));
const procs = readCsv(P('craft_processes/processes.csv'));
const steps = readCsv(P('craft_processes/process_steps.csv'));
const prods = readCsv(P('craft_processes/process_products.csv'));
const shops = readCsv(P('workshops/workshops.csv'));
const mats = readCsv(P('materials_registry/materials.csv'));
const deny = readCsv(P('materials_registry/late_materials_denylist.csv'));
const occRows = L.loadOccupations();

const results = []; const add = (id, ok, detail) => results.push({ id, result: ok ? 'PASS' : 'FAIL', detail });
const dupes = (rows, key) => { const s = new Set(); const d = []; rows.forEach(r => (s.has(r[key]) ? d.push(r[key]) : s.add(r[key]))); return d; };
const tl = new Map(tools.map(t => [t.tl_id, t])); const mt = new Set(mats.map(m => m.mt_id)); const pr = new Set(prods.map(p => p.product_ref));
const pc = new Set(procs.map(p => p.pc_id));

for (const [name, rows, key] of [['tools', tools, 'tl_id'], ['processes', procs, 'pc_id'], ['steps', steps, 'step_id'], ['workshops', shops, 'ws_id'], ['materials', mats, 'mt_id'], ['denylist', deny, 'dl_id']]) {
  const d = dupes(rows, key); add(`unique_ids_${name}`, !d.length, d.length ? d.join(',') : `${rows.length} unique`);
}
for (const [name, rows] of [['tools', tools], ['processes', procs], ['workshops', shops], ['materials', mats]]) {
  const bad = rows.filter(r => !r.source_refs || !r.confidence || r.status !== 'candidate').map(r => Object.values(r)[0]);
  add(`source_confidence_status_${name}`, !bad.length, bad.length ? bad.join(',') : 'all rows have source_refs, confidence, status=candidate');
}

// --- craft_tools_gear ---
const byOcc = new Map(); occTools.forEach(r => { if (!byOcc.has(r.occupation_id)) byOcc.set(r.occupation_id, []); byOcc.get(r.occupation_id).push(r.tl_id); });
const unresolvedOccTools = occTools.filter(r => !tl.has(r.tl_id)).map(r => `${r.occupation_id}:${r.tl_id}`);
add('occupation_tools_resolve', !unresolvedOccTools.length, unresolvedOccTools.join(',') || `${occTools.length} links resolve`);
const approved = occRows.filter(o => /approved/i.test(o.status));
const lt2 = occRows.filter(o => new Set(byOcc.get(o.occupation_id) || []).size < 2).map(o => o.occupation_id);
add('every_occupation_ge2_tools', !lt2.length, lt2.length ? lt2.join(',') : `${occRows.length}/${occRows.length} occupations (approved-status rows: ${approved.length}) have >=2 tools in tools_gear`);
const lt2v5 = occRows.filter(o => new Set((byOcc.get(o.occupation_id) || []).filter(t => tl.get(t)?.item_template_ref)).size < 2).map(o => o.occupation_id);
add('info_occupations_ge2_tools_in_existing_v5_item_templates', true, `${occRows.length - lt2v5.length}/${occRows.length} reach >=2 via existing v5 item_templates; the rest rely on proposed_new categories: ${lt2v5.join(',')}`);
const unusedTools = tools.filter(t => !t.used_in_process_refs && !t.used_by_occupations).map(t => t.tl_id);
add('every_tool_used_by_process_or_occupation', !unusedTools.length, unusedTools.join(',') || `${tools.length}/${tools.length}`);
const toolMatBad = tools.filter(t => split(t.material).some(m => !mt.has(m))).map(t => t.tl_id);
add('tool_materials_resolve', !toolMatBad.length, toolMatBad.join(',') || 'all tool materials are mt_ ids');

// --- craft_processes ---
const stepsBy = new Map(); steps.forEach(s => { if (!stepsBy.has(s.pc_id)) stepsBy.set(s.pc_id, []); stepsBy.get(s.pc_id).push(s); });
const chainErr = []; const inputErr = []; const toolErr = []; const wkErr = [];
for (const p of procs) {
  const ss = (stepsBy.get(p.pc_id) || []).sort((a, b) => a.step_no - b.step_no);
  ss.forEach((s, i) => { if (Number(s.step_no) !== i + 1) chainErr.push(`${p.pc_id}: step numbering gap at ${s.step_no}`); });
  for (let i = 0; i + 1 < ss.length; i++) if (ss[i].out_state !== ss[i + 1].in_state) chainErr.push(`${p.pc_id}: s${i + 1}.out ${ss[i].out_state} != s${i + 2}.in ${ss[i + 1].in_state}`);
  if (ss.length && !split(p.outputs).includes(ss[ss.length - 1].out_state)) chainErr.push(`${p.pc_id}: last out ${ss[ss.length - 1].out_state} not in outputs`);
  if (ss.length && !split(p.inputs).includes(ss[0].in_state)) chainErr.push(`${p.pc_id}: first in ${ss[0].in_state} not in inputs`);
  const ins = [...split(p.inputs), ...ss.flatMap(s => split(s.extra_inputs))];
  ins.forEach(x => { if (x.startsWith('mt_') ? !mt.has(x) : x.startsWith('pr:') ? !pr.has(x) : true) inputErr.push(`${p.pc_id}:${x}`); });
  [...split(p.tools), ...ss.flatMap(s => split(s.tools))].forEach(t => { if (!tl.has(t)) toolErr.push(`${p.pc_id}:${t}`); });
  if (!split(p.wk_claim_refs).some(r => r.startsWith('claim:'))) wkErr.push(p.pc_id);
}
add('steps_ordered_and_chained', !chainErr.length, chainErr.join(' | ') || `${procs.length} chains, ${steps.length} steps`);
add('process_inputs_resolve_to_materials_or_items', !inputErr.length, inputErr.join(',') || 'all inputs are mt_ ids or pr: products');
add('process_tools_resolve', !toolErr.length, toolErr.join(',') || 'ok');
add('process_has_wk_claim', !wkErr.length, wkErr.join(',') || `${procs.length}/${procs.length} have >=1 WK claim`);

// --- workshops ---
const wsErr = [];
for (const w of shops) {
  split(w.tools).forEach(t => { if (!tl.has(t)) wsErr.push(`${w.ws_id}:${t}`); });
  split(w.stocks).forEach(s => { if (s.startsWith('mt_') ? !mt.has(s) : s.startsWith('pr:') ? !pr.has(s) : true) wsErr.push(`${w.ws_id}:${s}`); });
  split(w.process_refs).forEach(x => { if (!pc.has(x)) wsErr.push(`${w.ws_id}:${x}`); });
}
add('workshop_tools_stocks_processes_resolve', !wsErr.length, wsErr.join(',') || `${shops.length} workshops`);
const craftGroups = new Set(['ремесло', 'промысел']);
const wsOcc = new Set(shops.flatMap(w => split(w.occupations)));
const locNote = new Set(occTools.filter(r => r.work_location_note_ru).map(r => r.occupation_id));
const craftOcc = occRows.filter(o => craftGroups.has(o.occupation_group));
const noPlace = craftOcc.filter(o => !wsOcc.has(o.occupation_id) && !locNote.has(o.occupation_id)).map(o => o.occupation_id);
add('craft_occupations_have_workshop_or_location_note', !noPlace.length, noPlace.join(',') || `${craftOcc.length} occupations of groups ремесло/промысел covered`);

// --- materials_registry ---
const noOrigin = mats.filter(m => !m.origin || !m.source_refs).map(m => m.mt_id);
add('materials_have_origin_and_sources', !noOrigin.length, noOrigin.join(',') || `${mats.length}`);
const xwPath = P('materials_registry/material_crosswalk.csv');
const crosswalk = fs.existsSync(xwPath) ? readCsv(xwPath) : [];
const resolveValue = L.makeResolver(mats, deny, crosswalk);
function* walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') yield* walk(p); } else if (e.name.endsWith('.csv')) yield p; } }
const resRows = []; const perFile = {};
for (const f of walk(GAME_BASE)) {
  if (f.includes(`${path.sep}materials_registry${path.sep}`)) continue;
  let rows; try { rows = readCsv(f); } catch { continue; }
  if (!rows.length) continue;
  const cols = Object.keys(rows[0]).filter(c => /^material(s)?$|^material_|_material$|^materials_|typical_material/i.test(c) && !/class|family|note|basis/i.test(c));
  if (!cols.length) continue;
  const rel = path.relative(GAME_BASE, f).split(path.sep).join('/');
  const st = perFile[rel] = { values: 0, fully_resolved: 0, with_unresolved_tokens: 0, out_of_scope_tokens: 0, deny_hits: 0 };
  for (const r of rows) for (const c of cols) {
    const v = (r[c] || '').trim(); if (!v) continue;
    const x = resolveValue(v); st.values++;
    if (!x.unresolved.length) st.fully_resolved++; else st.with_unresolved_tokens++;
    if (x.deny.length) st.deny_hits++;
    if (x.outOfScope.length) st.out_of_scope_tokens++;
    resRows.push({ file: rel, row_key: Object.values(r)[0], column: c, value: v, mt_ids: x.mt.join(';'), unresolved_tokens: x.unresolved.join(' | '), out_of_scope_tokens: x.outOfScope.join(' | '), denylist_hits: x.deny.join(';') });
  }
}
writeCsv(P('materials_registry/material_resolution.csv'), ['file', 'row_key', 'column', 'value', 'mt_ids', 'unresolved_tokens', 'out_of_scope_tokens', 'denylist_hits'], resRows);
const own = perFile['crafts-tools-processes/craft_tools_gear/tools_gear.csv'];
add('own_domain_material_values_resolve', own && own.with_unresolved_tokens === 0, JSON.stringify(own));
const others = Object.entries(perFile).filter(([k]) => !k.startsWith('crafts-tools-processes/'));
const tot = others.reduce((a, [, s]) => ({ v: a.v + s.values, ok: a.ok + s.fully_resolved, d: a.d + s.deny_hits, o: a.o + s.out_of_scope_tokens }), { v: 0, ok: 0, d: 0, o: 0 });
add('info_other_domains_material_resolution_snapshot', true, `${others.length} files, ${tot.ok}/${tot.v} values fully resolved, ${tot.o} values with soil-class tokens (out of scope), ${tot.d} denylist hits; per-file in validation-report.json, rows in materials_registry/material_resolution.csv`);

// --- info: coverage against MASTER technology families and workshop profiles (optional env MASTER_TP_DIR) ---
if (process.env.MASTER_TP_DIR && fs.existsSync(process.env.MASTER_TP_DIR)) {
  const fam = readCsv(path.join(process.env.MASTER_TP_DIR, 'process_families.csv')).map(r => r.id);
  const wsp = readCsv(path.join(process.env.MASTER_TP_DIR, 'workshop_profiles.csv')).map(r => r.id);
  const usedFam = new Set(procs.map(p => p.master_family_ref)); const usedWs = new Set(shops.map(w => w.master_workshop_ref));
  add('info_master_family_coverage', true, `${fam.filter(f => usedFam.has(f)).length}/${fam.length} MASTER process families have >=1 chain; uncovered: ${fam.filter(f => !usedFam.has(f)).join(',')}`);
  add('info_master_workshop_profile_coverage', true, `${wsp.filter(f => usedWs.has(f)).length}/${wsp.length} MASTER workshop_profiles mapped; unmapped: ${wsp.filter(f => !usedWs.has(f)).join(',')}`);
}
{
  const mism = tools.filter(t => t.v5_policy_band && t.v5_policy_band !== t.mass_band);
  add('info_mass_band_vs_v5_policy', true, `${tools.filter(t => t.v5_policy_band).length} tools have a v5 policy mass; ${mism.length} differ in band: ${mism.map(t => `${t.tl_id}(${t.mass_band}/${t.v5_policy_band})`).join(',')}`);
}

const failed = results.filter(r => r.result === 'FAIL');
fs.writeFileSync(P('validation-report.json'), JSON.stringify({ checked_by: 'scripts/validate.cjs', pass: results.length - failed.length, fail: failed.length, results, material_resolution_per_file: perFile }, null, 2) + '\n');
for (const r of results) console.log(`${r.result}  ${r.id}  ${String(r.detail).slice(0, 300)}`);
if (failed.length) process.exitCode = 1;
