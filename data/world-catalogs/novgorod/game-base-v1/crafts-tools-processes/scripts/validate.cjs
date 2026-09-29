'use strict';
// Acceptance checks for crafts-tools-processes (catalog acceptance_ru of craft_tools_gear, craft_processes, workshops, materials_registry).
// Reads the built CSVs, writes validation-report.json and materials_registry/material_resolution.csv. Exit code 1 on any FAIL.
const L = require('./lib.cjs');
const { path, fs, split, readCsv, writeCsv, DOMAIN_ROOT, GAME_BASE } = L;
const ARCHIVE_INCLUSIONS = require('./archive-inclusions.cjs');
const P = rel => path.join(DOMAIN_ROOT, rel);

const tools = readCsv(P('craft_tools_gear/tools_gear.csv'));
const occTools = readCsv(P('craft_tools_gear/occupation_tools.csv'));
const procs = readCsv(P('craft_processes/processes.csv'));
const steps = readCsv(P('craft_processes/process_steps.csv'));
const prods = readCsv(P('craft_processes/process_products.csv'));
const butchery = readCsv(P('craft_processes/butchery_profiles.csv'));
const fishCleaning = readCsv(P('craft_processes/fish_cleaning_products.csv'));
const fish = readCsv(path.join(GAME_BASE, 'fauna-fish-invertebrates-livestock/fauna/fish.csv'));
const shops = readCsv(P('workshops/workshops.csv'));
const mats = readCsv(P('materials_registry/materials.csv'));
const deny = readCsv(P('materials_registry/late_materials_denylist.csv'));
const archiveLedger = readCsv(P('archive_inclusion_ledger.csv'));
const archiveEntities = readCsv(P('materials_registry/material_entities.csv'));
const occRows = L.loadOccupations();

const results = []; const add = (id, ok, detail) => results.push({ id, result: ok ? 'PASS' : 'FAIL', detail });
const dupes = (rows, key) => { const s = new Set(); const d = []; rows.forEach(r => (s.has(r[key]) ? d.push(r[key]) : s.add(r[key]))); return d; };
const tl = new Map(tools.map(t => [t.tl_id, t])); const mt = new Set(mats.map(m => m.mt_id)); const pr = new Set(prods.map(p => p.product_ref));
const pc = new Set(procs.map(p => p.pc_id));

const archiveCheck = ARCHIVE_INCLUSIONS.buildLedger({ tools, materials: mats, workshops: shops, processes: procs, products: prods }, deny.map(d => [d.dl_id, d.term_ru, d.match_stems, d.kind, d.verdict, d.reason_ru]));
const ledgerSame = archiveLedger.length === archiveCheck.ledger.length && archiveLedger.every((row, i) => ARCHIVE_INCLUSIONS.LEDGER_HEADER.every(key => row[key] === String(archiveCheck.ledger[i][key] ?? '')));
add('archive_inclusion_ledger_candidate_provenance', !archiveCheck.errors.length && ledgerSame, archiveCheck.errors.join(' | ') || `${archiveLedger.length} rows; ${archiveCheck.summary.included_new} new + ${archiveCheck.summary.included_variants} variants; ${archiveCheck.summary.rejected} rejected; ${archiveCheck.summary.needs_check} queued; runtime activation=false`);
const queuedRows = ARCHIVE_INCLUSIONS.NEEDS_CHECK_ROWS;
const queueById = new Map(queuedRows.map(row => [row.archive_id, row]));
const authoredById = new Map(ARCHIVE_INCLUSIONS.authoredRows.map(row => [row[0].split(':').at(-1), row]));
const ledgerById = new Map(archiveLedger.map(row => [row.archive_ref.split(':').at(-1), row]));
const queuePartitionIssues = [];
if (queueById.size !== queuedRows.length) queuePartitionIssues.push('duplicate queue ID');
if (authoredById.size !== ARCHIVE_INCLUSIONS.authoredRows.length || ledgerById.size !== archiveLedger.length) queuePartitionIssues.push('duplicate archive ID');
if (authoredById.size !== 1269 || ledgerById.size !== 1269) queuePartitionIssues.push(`archive partition ${authoredById.size}/${ledgerById.size}, expected 1269`);
for (const [id, queued] of queueById) {
  const source = authoredById.get(id), row = ledgerById.get(id);
  if (!source || !row) { queuePartitionIssues.push(`${id} missing from authored source or ledger`); continue; }
  if (row.record_type !== 'needs_check' || row.disposition !== 'needs_check' || row.status !== 'needs_check') queuePartitionIssues.push(`${id} is not needs_check in all three terminal fields`);
  if (row.game_base_ref || row.target_group || row.target_ref) queuePartitionIssues.push(`${id} leaks a decision target into the generated queue row`);
}
for (const [id, row] of ledgerById) if ((row.record_type === 'needs_check' || row.disposition === 'needs_check' || row.status === 'needs_check') && !queueById.has(id)) queuePartitionIssues.push(`${id} is needs_check but absent from authoring queue`);
const queuedEntityRefs = archiveEntities.flatMap(row => {
  let refs = []; try { refs = JSON.parse(row.source_refs || '[]'); } catch { return [`${row.item_id}:invalid source_refs`]; }
  return refs.flatMap(ref => [...queueById.keys()].filter(id => ref.endsWith(`:${id}`)).map(id => `${row.item_id}:${id}`));
});
if (queuedEntityRefs.length) queuePartitionIssues.push(`queued IDs appear in material entity source_refs: ${queuedEntityRefs.join(',')}`);
add('archive_needs_check_partition', !queuePartitionIssues.length, queuePartitionIssues.join(' | ') || `${authoredById.size} archive IDs partitioned exactly once; ${queuedRows.length} queue rows have record_type/disposition/status=needs_check; no queued entity source refs`);
const expectedEntities = ARCHIVE_INCLUSIONS.buildMaterialEntities(archiveCheck.ledger);
const entityTableSame = archiveEntities.length === expectedEntities.entities.length && archiveEntities.every((row, i) => expectedEntities.header.every(key => row[key] === String(expectedEntities.entities[i][key] ?? '')));
add('archive_material_entity_table', entityTableSame, `${archiveEntities.length} entity rows; expected ${expectedEntities.entities.length}; generated from included new crafts owners`);

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
const rank = { A: 3, B: 2, C: 1, D: 0 };
const sourceConfidence = new Map(readCsv(P('sources/sources.csv')).map(s => [s.src_id, s.base_confidence]));
const claims = JSON.parse(fs.readFileSync(path.join(L.NOVGOROD, 'world-knowledge', 'production-v1', 'runtime-bundle.json'), 'utf8')).claims;
const claimConfidence = new Map(claims.map(c => [c.claim_ref, c.qualifiers.directness === 'direct' ? 'A' : c.qualifiers.directness === 'inferred' ? 'B' : 'C']));
const overconfidentTools = tools.filter(t => {
  const best = Math.max(...split(t.source_refs).map(r => rank[sourceConfidence.get(r) || claimConfidence.get(r)] ?? -1));
  return (rank[t.confidence] ?? 99) > best;
}).map(t => t.tl_id);
add('tool_source_confidence', !overconfidentTools.length, overconfidentTools.join(',') || 'tools do not exceed their best source');
const overconfidentLinks = occTools.filter(r => tl.has(r.tl_id) && (rank[r.confidence] ?? 99) > (rank[tl.get(r.tl_id).confidence] ?? -1)).map(r => `${r.occupation_id}:${r.tl_id}`);
add('occupation_link_confidence', !overconfidentLinks.length, overconfidentLinks.join(',') || 'links do not exceed tool confidence');
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

function butcheryIssues(rows, processRows) {
  const issues = [];
  const intervalSemantics = 'min_inclusive_max_exclusive;empty_max_unbounded';
  const bp = processRows.find(p => p.pc_id === 'proc_butcher_carcass');
  if (!bp) issues.push('missing proc_butcher_carcass');
  else {
    if (!split(bp.inputs).includes('pr:whole_carcass')) issues.push('process lacks whole carcass input');
    if (!split(bp.tools).includes('tl_skinning_knife')) issues.push('process lacks required skinning knife');
    for (const outRef of ['pr:raw_meat','mt_hide_raw','mt_bone','mt_tallow','mt_sinew_gut','mt_horn','pr:feathers_down']) if (!split(bp.outputs).includes(outRef)) issues.push('missing output ' + outRef);
  }
  const ids = new Set();
  const fractionPairs = ['meat','raw_hide','bone','fat','sinew','horn','feathers_down'];
  for (const r of rows) {
    if (ids.has(r.carcass_class_id)) issues.push('duplicate class ' + r.carcass_class_id); ids.add(r.carcass_class_id);
    if (!['bird','mammal'].includes(r.animal_class)) issues.push('bad animal class ' + r.carcass_class_id);
    if (r.live_mass_interval !== intervalSemantics) issues.push('bad mass interval semantics ' + r.carcass_class_id);
    if (r.yield_basis !== 'editorial' || r.yield_source_refs) issues.push('numeric yield not explicitly source-free editorial ' + r.carcass_class_id);
    if (r.output_source_refs !== 'fauna-mammals-birds/fauna/mammals.csv#products;fauna-mammals-birds/fauna/birds.csv#products;fauna-fish-invertebrates-livestock/fauna/livestock_products.csv') issues.push('bad output source rule ' + r.carcass_class_id);
    if (!(+r.duration_min_minutes > 0 && +r.duration_max_minutes >= +r.duration_min_minutes)) issues.push('bad duration ' + r.carcass_class_id);
    let minSum = 0, maxSum = 0;
    for (const k of fractionPairs) {
      const lo = +r[`${k}_fraction_min`], hi = +r[`${k}_fraction_max`];
      if (!(lo >= 0 && hi >= lo && hi <= 1)) issues.push(`bad ${k} fraction ${r.carcass_class_id}`);
      minSum += lo; maxSum += hi;
    }
    if (minSum > 1 || maxSum > 1) issues.push('outputs exceed live mass ' + r.carcass_class_id);
  }
  for (const animalClass of ['bird','mammal']) {
    const classRows = rows.filter(r => r.animal_class === animalClass).sort((a, b) => +a.live_mass_min_kg - +b.live_mass_min_kg);
    for (let i = 1; i < classRows.length; i += 1) {
      const previousMax = classRows[i - 1].live_mass_max_kg;
      const currentMin = classRows[i].live_mass_min_kg;
      if (!previousMax || +previousMax > +currentMin) issues.push('overlapping mass profiles ' + classRows[i - 1].carcass_class_id + '/' + classRows[i].carcass_class_id);
      if (+previousMax < +currentMin) issues.push('gap between mass profiles ' + classRows[i - 1].carcass_class_id + '/' + classRows[i].carcass_class_id);
    }
  }
  const matchesMass = (animalClass, mass) => rows.filter(r => r.animal_class === animalClass && mass >= +r.live_mass_min_kg && (!r.live_mass_max_kg || mass < +r.live_mass_max_kg));
  for (const [animalClass, mass, expected] of [['bird', 0.099, 'bc_bird_very_small'], ['bird', 0.1, 'bc_bird_small'], ['bird', 2, 'bc_bird_large'], ['mammal', 0.099, 'bc_mammal_very_small'], ['mammal', 0.1, 'bc_mammal_small'], ['mammal', 5, 'bc_mammal_medium'], ['mammal', 50, 'bc_mammal_large']]) {
    const matches = matchesMass(animalClass, mass);
    if (matches.length !== 1 || matches[0].carcass_class_id !== expected) issues.push(`mass boundary ${animalClass}/${mass} does not select exactly ${expected}`);
  }
  for (const required of ['bc_bird_very_small','bc_bird_small','bc_bird_large','bc_mammal_very_small','bc_mammal_small','bc_mammal_medium','bc_mammal_large']) if (!ids.has(required)) issues.push('missing class ' + required);
  return issues;
}
const butcheryErr = butcheryIssues(butchery, procs);
add('butchery_process_and_profiles', !butcheryErr.length, butcheryErr.join(' | ') || `${butchery.length} size profiles; knife required; mass conserved`);

function fishCleaningIssues(rows, processRows, fishRows) {
  const issues = [];
  const process = processRows.find(p => p.pc_id === 'proc_clean_fish');
  if (!process) issues.push('missing proc_clean_fish');
  else {
    if (!split(process.inputs).includes('pr:whole_fish')) issues.push('fish process lacks whole fish input');
    if (!split(process.outputs).includes('pr:gutted_fish')) issues.push('fish process lacks gutted fish output');
    if (!split(process.tools).includes('tl_knife_utility')) issues.push('fish process lacks required knife');
  }
  const allFish = fishRows.filter(r => r.fa_id.startsWith('fa_fish_'));
  const eligible = new Map(allFish.filter(r => r.food_ingredient_ref).map(r => [r.fa_id, r.food_ingredient_ref]));
  for (const fish of allFish) if (!fish.food_ingredient_ref) issues.push('fish species lacks fresh product ' + fish.fa_id);
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r.fa_id)) issues.push('duplicate fish cleaning species ' + r.fa_id); seen.add(r.fa_id);
    if (!eligible.has(r.fa_id)) issues.push('fish cleaning species lacks product ' + r.fa_id);
    if (eligible.get(r.fa_id) !== r.input_food_ingredient_ref) issues.push('fish input product mismatch ' + r.fa_id);
    if (r.output_food_ingredient_ref !== 'master:food_system:ING0144') issues.push('bad gutted fish output ' + r.fa_id);
    if (r.process_ref !== 'proc_clean_fish' || r.basis !== 'logical_necessity') issues.push('bad fish cleaning derivation class ' + r.fa_id);
    if (!r.derivation.includes('recipes.csv#RCP0166') || !r.derivation.includes('material_items.csv#n1230:material_item:fod0012')) issues.push('missing fish archive derivation ' + r.fa_id);
    if (!r.anachronism_check.startsWith('passed')) issues.push('missing fish anachronism check ' + r.fa_id);
  }
  for (const id of eligible.keys()) if (!seen.has(id)) issues.push('missing fish cleaning species ' + id);
  return issues;
}
const fishCleaningErr = fishCleaningIssues(fishCleaning, procs, fish);
add('fish_cleaning_process_and_species_products', !fishCleaningErr.length, fishCleaningErr.join(' | ') || `${fishCleaning.length} species products; knife required; generic output preserves fa_id`);
if (process.argv.includes('--self-test')) {
  ARCHIVE_INCLUSIONS.selfTest({ tools, materials: mats, workshops: shops, processes: procs, products: prods }, deny.map(d => [d.dl_id, d.term_ru, d.match_stems, d.kind, d.verdict, d.reason_ru]));
  const noKnife = procs.map(p => p.pc_id === 'proc_butcher_carcass' ? { ...p, tools: '' } : p);
  if (!butcheryIssues(butchery, noKnife).some(x => x.includes('required skinning knife'))) throw new Error('butchery missing-knife negative probe passed');
  const overYield = butchery.map((r, i) => i ? r : { ...r, meat_fraction_max: '0.95' });
  if (!butcheryIssues(overYield, procs).some(x => x.includes('outputs exceed live mass'))) throw new Error('butchery over-yield negative probe passed');
  const sourcedEditorial = butchery.map((r, i) => i ? r : { ...r, yield_source_refs: 'unsupported:number' });
  if (!butcheryIssues(sourcedEditorial, procs).some(x => x.includes('source-free editorial'))) throw new Error('butchery unsupported-source negative probe passed');
  const overlap = butchery.map(r => r.carcass_class_id === 'bc_bird_large' ? { ...r, live_mass_min_kg: '1.9' } : r);
  if (!butcheryIssues(overlap, procs).some(x => x.includes('overlapping mass profiles'))) throw new Error('butchery mass-overlap negative probe passed');
  const gap = butchery.map(r => r.carcass_class_id === 'bc_mammal_medium' ? { ...r, live_mass_min_kg: '5.1' } : r);
  if (!butcheryIssues(gap, procs).some(x => x.includes('gap between mass profiles'))) throw new Error('butchery mass-gap negative probe passed');
  const missingTiny = butchery.filter(r => r.carcass_class_id !== 'bc_mammal_very_small');
  if (!butcheryIssues(missingTiny, procs).some(x => x.includes('missing class bc_mammal_very_small'))) throw new Error('butchery very-small negative probe passed');
  const missingFish = fishCleaning.slice(1);
  if (!fishCleaningIssues(missingFish, procs, fish).some(x => x.includes('missing fish cleaning species'))) throw new Error('fish cleaning missing-species negative probe passed');
  const productlessFish = fish.map((r, i) => i ? r : { ...r, food_ingredient_ref: '' });
  if (!fishCleaningIssues(fishCleaning, procs, productlessFish).some(x => x.includes('lacks fresh product'))) throw new Error('fish cleaning productless-species negative probe passed');
  const modernOutput = fishCleaning.map((r, i) => i ? r : { ...r, output_food_ingredient_ref: 'pr:modern_fillet' });
  if (!fishCleaningIssues(modernOutput, procs, fish).some(x => x.includes('bad gutted fish output'))) throw new Error('fish cleaning output negative probe passed');
}

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
