// Validate items-weapons-armour outputs: ids, role links, denylist, reference resolution, place families, events.
// Usage: node scripts/validate.cjs   (writes validation_report.json; exit 1 on errors)
const fs = require('fs'), path = require('path');
const { pathToFileURL } = require('url');
const { ROOT, NOV, P, readJson, readCsv, readTsv, wkIndex } = require('./lib.cjs');

const errors = [], warnings = [], stats = {};
const err = (m) => errors.push(m), warn = (m) => warnings.push(m);
const split = v => (v || '').split(' | ').map(s => s.trim()).filter(Boolean);
const load = rel => readCsv(path.join(ROOT, rel));

const wp = load('items/weapons_armour.csv'), acc = load('items/weapon_status_access.csv'), eq = load('items/weapon_equipment_profiles.csv');
const cw = load('items/weapon_source_crosswalk.csv'), dn = load('items/weapon_denylist.csv');
const archiveLedger = load('items/archive_inclusion_ledger.csv');
const sec = load('military/security.csv'), ev = load('military/military_events.csv'), cl = load('military/combat_likelihood_by_role.csv');

// --- reference universes
const roles = readTsv(P.roles), occs = readTsv(P.occs);
const roleIds = new Set(roles.map(r => r.role_id)), occById = Object.fromEntries(occs.map(o => [o.occupation_id, o]));
const roleById = Object.fromEntries(roles.map(r => [r.role_id, r]));
const wk = wkIndex();
const pfIds = new Set(readJson(path.join(P.wkDir, 'place-first-cartography.json')).environment_families.map(f => f.id));
const master = new Set(readCsv(P.authoring('master_military_snapshot.csv')).map(r => r.item_id));
const costumeRows = readCsv(path.join(P.costume, 'catalog_items.csv'));
const costume = new Set(costumeRows.map(r => r.item_id));
const costumeItems = new Map(costumeRows.map(r => [r.item_id, r]));
const archiveMaterialItems = new Map();
for (const r of readCsv(path.join(NOV, 'sources', 'master-archive-v1', 'data', 'canonical', 'material_items.csv'))) {
  for (const ref of JSON.parse(r.legacy_references || '[]')) archiveMaterialItems.set(String(ref.legacy_id).toUpperCase(), r);
}
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
  if ((m = ref.match(/^master:mc:(.+)$/))) return master.has(m[1]) || archiveMaterialItems.has(m[1].toUpperCase()) ? null : 'master row missing';
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
  if (r.generation_policy === 'research_only') {
    if (r.confidence !== 'D' || !r.anachronism_risk.includes('критический') || !r.archive_ref || !r.archive_derivation) err(`${w}: research_only entity must retain D confidence, critical risk, and archive provenance`);
    if (!archiveMaterialItems.has(String(r.archive_derivation).toUpperCase())) err(`${w}: research_only provenance does not resolve to master archive`);
    const guard = dn.find(item => item.deny_id === r.generation_guard_id);
    if (!guard || !split(guard.source_refs).includes(`master:mc:${r.archive_derivation}`)) err(`${w}: research_only generation guard does not cite its archive item`);
  } else conf(w, r.confidence);
  if (r.generation_policy && !['research_only', 'reference_required'].includes(r.generation_policy)) err(`${w}: unknown generation_policy ${r.generation_policy}`);
  if (r.status !== 'candidate') err(`${w}: status must be candidate`);
}
// D39 research-only entities remain catalogued but cannot be generated automatically.
// needs_check entries are a source-request queue, not a ban: they do not block names.
// A match term is a lowercase substring, or 're:<pattern>' (case-insensitive, Unicode) when word boundaries matter.
const termHits = (text, term) => term.startsWith('re:') ? new RegExp(term.slice(3), 'iu').test(text) : text.toLocaleLowerCase('ru-RU').includes(term.toLocaleLowerCase('ru-RU'));
const denyTerms = dn.filter(d => d.kind !== 'needs_check').flatMap(d => split(d.match_terms).map(t => [d.deny_id, t]));
const scan = (where, text) => { const t = text || ''; for (const [id, term] of denyTerms) if (termHits(t, term)) err(`${where}: denylisted term '${term}' (${id})`); };
for (const [id, text, hit] of [['deny_katana', 'катана', true], ['deny_katana', 'Клинок катаны', true], ['deny_katana', 'katana', true], ['deny_katana', 'катаный', false], ['deny_katana', 'обкатанный', false], ['deny_katana', 'катание', false]]) {
  const d = dn.find(x => x.deny_id === id);
  if (!d || split(d.match_terms).some(term => termHits(text, term)) !== hit) err(`denylist probe: ${id} on '${text}' should ${hit ? '' : 'not '}match`);
}
for (const r of wp) if (r.generation_policy !== 'research_only') scan('wp ' + r.wp_id, [r.name_ru, r.name_en, r.material].join(' '));
for (const r of sec) scan('security ' + r.ms_id, r.name_ru);
for (const r of dn) { conf('deny ' + r.deny_id, r.confidence); checkRefs('deny ' + r.deny_id, split(r.source_refs)); }
for (const r of dn) if (r.kind === 'needs_check' && !/Запросить источник/.test(r.reason)) err(`deny ${r.deny_id}: needs_check entry lacks item-specific source request`);
// crosswalk completeness
for (const r of cw) { if (r.mapping === 'UNMAPPED') err(`crosswalk: ${r.source_id} unmapped`); for (const t of split(r.target)) if (r.mapping === 'wp' && !wpIds.has(t)) err(`crosswalk: ${r.source_id} -> missing wp ${t}`); }
// D rows can remain entities only under explicit research_only generation restriction.
for (const r of cw) if (r.mapping === 'wp' && r.source_confidence === 'D') {
  const k = wp.find(x => x.wp_id === split(r.target)[0]);
  if (k?.confidence === 'C' && k.note) warn(`D-row ${r.source_id} (${r.source_name_ru}) retained under ${r.target} as C with note`);
  else if (k?.confidence === 'D' && k.generation_policy === 'research_only' && k.anachronism_risk.includes('критический') && k.note) warn(`D-row ${r.source_id} (${r.source_name_ru}) retained as research_only entity; generation restricted`);
  else err(`crosswalk: D-row ${r.source_id} lacks valid confidence and generation restriction`);
}
// --- D39 archive inclusion ledger remains separate from weapon kinds.
const archiveManifest = readJson(P.authoring('archive_inclusion_manifest.json'));
const normName = value => String(value || '').normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const ledgerByRef = new Map(archiveLedger.map(r => [r.archive_ref, r]));
const denyIds = new Set(dn.map(r => r.deny_id));
const kindsDoc = readJson(P.authoring('weapon_kinds.json'));
function ownerTargetExists(targetRef, group) {
  const hash = String(targetRef || '').lastIndexOf('#');
  if (hash < 0) return false;
  const ownerPrefix = `${group}/`;
  const relative = targetRef.slice(0, hash);
  if (!relative.startsWith(ownerPrefix)) return false;
  const targetId = targetRef.slice(hash + 1);
  if (!targetId) return false;
  const base = path.resolve(NOV, 'game-base-v1');
  const targetPath = path.resolve(base, relative);
  if (!targetPath.startsWith(base + path.sep) || !fs.existsSync(targetPath)) return false;
  const idFields = ['id', 'item_id', 'it_id', 'bp_id', 'material_id', 'entity_id', 'of_id'];
  return readCsv(targetPath).some(row => idFields.some(field => row[field] === targetId));
}
for (const source of archiveManifest.records.filter(row => row.decision === 'routed')) {
  const token = `awaits_owner:${source.target_group}`;
  if (!source.target_group) {
    err(`archive ${source.derivation}: routed decision lacks target_group`);
  } else if (source.target_ref) {
    if (!ownerTargetExists(source.target_ref, source.target_group)) err(`archive ${source.derivation}: routed target_ref does not resolve in ${source.target_group}`);
    if (String(source.reason || '').includes(token)) err(`archive ${source.derivation}: resolved route retains ${token}`);
  } else if (!String(source.reason || '').includes(token)) {
    err(`archive ${source.derivation}: unresolved route requires ${token}`);
  }
}
const weaponNames = new Map();
for (const k of kindsDoc.kinds) for (const name of [k.name_ru, k.name_en, ...(k.aliases || [])]) weaponNames.set(normName(name), k.id);
const exactNameOwners = new Map();
for (const k of kindsDoc.kinds) for (const name of [k.name_ru, k.name_en, ...(k.aliases || [])]) {
  const normalized = normName(name), owner = exactNameOwners.get(normalized);
  if (owner && owner !== k.id) err(`weapon kinds: exact name/alias '${normalized}' shared by ${owner} and ${k.id}`);
  exactNameOwners.set(normalized, k.id);
}
// Negative probe: weapon family and substring overlap are not exact identity.
if (weaponNames.get(normName('Воинский кожаный пояс без поздней перегрузки декором')) !== 'wp_sword_belt'
  || weaponNames.get(normName('armour-piercing'))
  || weaponNames.get(normName('Кожаный доспех как самостоятельная кираса — недоказан'))
  || weaponNames.get(normName('Походный топор и лопата группы'))) err('archive exact-name dedup negative probe failed');
const archiveNames = new Set();
const archiveSemanticRoots = new Map();
if (archiveLedger.length !== archiveManifest.records.length) err(`archive ledger: rows ${archiveLedger.length} != manifest ${archiveManifest.records.length}`);
for (const authored of archiveManifest.records) {
  const w = `archive ${authored.derivation || authored.archive_ref}`;
  const r = ledgerByRef.get(authored.archive_ref);
  if (!r) { err(`${w}: generated ledger row missing`); continue; }
  for (const field of ['archive_ref', 'archive_name', 'match_type', 'basis', 'derivation', 'confidence', 'period', 'region', 'decision']) {
    if (!Object.hasOwn(authored, field) || !Object.hasOwn(r, field)) err(`${w}: ${field} column missing`);
    if (!String(r[field] ?? '').trim()) err(`${w}: ${field} required`);
    if (r[field] !== authored[field]) err(`${w}: generated ${field} differs from authoring manifest`);
  }
  for (const field of ['target_group', 'target_ref', 'generation_policy', 'anachronism_risk']) if ((r[field] || '') !== (authored[field] || '')) err(`${w}: generated ${field} differs from authoring manifest`);
  for (const field of ['generation_policy', 'anachronism_risk']) {
    if (!String(authored[field] || '').trim() || !String(r[field] || '').trim()) err(`${w}: ${field} required for every archive decision`);
  }
  if ((r.generation_guard_id || '') !== (authored.guard_id || '')) err(`${w}: generated generation_guard_id differs from authoring guard_id`);
  if (!Object.hasOwn(r, 'selected_action') || r.selected_action !== archiveManifest.selected_action || !['include_d39', 'include_analogy', 'add_variant'].includes(r.selected_action)) err(`${w}: original selected_action missing, invalid, or differs from authored manifest`);
  if (!Object.hasOwn(authored, 'game_base_ref') || !Object.hasOwn(r, 'game_base_ref')) err(`${w}: game_base_ref column missing`);
  if (!Object.hasOwn(r, 'basis_note') || (r.basis_note || '') !== (authored.basis_note || '')) err(`${w}: generated basis_note differs from manifest`);
  for (const field of ['guard_result', 'dedup_result', 'reason']) if (!String(r[field] || '').trim()) err(`${w}: ${field} required`);
  const idMatch = authored.archive_ref.match(/:([A-Z0-9]+)$/);
  const archiveId = idMatch?.[1] || '';
  let sourceName = '', sourceConfidence = '', sourcePeriod = '', sourceRegion = '', sourceEvidence = '', sourceExists = false;
  if (authored.derivation === archiveId && authored.archive_ref.includes('costume_dataset_v1/')) {
    const source = costumeItems.get(archiveId);
    if (source) { sourceExists = true; sourceName = source.name_ru; sourceConfidence = source.historical_confidence; sourcePeriod = source.period_scope; sourceRegion = source.region_scope; sourceEvidence = source.evidence_basis || ''; }
  } else if (authored.derivation === archiveId && archiveMaterialItems.has(archiveId)) {
    const source = archiveMaterialItems.get(archiveId), detail = JSON.parse(source.source_record || '{}');
    sourceExists = true; sourceName = source.name_ru; sourceConfidence = source.historical_confidence; sourceEvidence = detail.evidence_basis || '';
    sourcePeriod = `${detail.period_from || ''}–${detail.period_to || ''}`; sourceRegion = detail.region_scope || '';
  }
  if (!sourceExists) err(`${w}: archive_ref does not resolve in canonical source`);
  if (sourceName && sourceName !== authored.archive_name) err(`${w}: archive name differs from canonical source`);
  if (sourceConfidence && sourceConfidence !== authored.confidence) err(`${w}: confidence differs from canonical source (${sourceConfidence})`);
  if (sourcePeriod && normName(sourcePeriod) !== normName(authored.period)) err(`${w}: period differs from canonical source (${sourcePeriod})`);
  if (sourceRegion && normName(sourceRegion) !== normName(authored.region)) err(`${w}: region differs from canonical source`);
  if (!['new', 'variant'].includes(authored.match_type)) err(`${w}: invalid match_type`);
  if (!['sourced', 'analogy', 'logical_necessity'].includes(authored.basis)) err(`${w}: invalid basis`);
  if (!['A', 'B', 'C', 'D'].includes(authored.confidence)) err(`${w}: invalid confidence`);
  const evidence = sourceEvidence.toLocaleLowerCase('ru-RU');
  const evidenceBasis = authored.confidence === 'A' && /прямое|прямой|археологическ.*комплекс/.test(evidence)
    ? 'sourced'
    : authored.confidence === 'B' && /реконструкц|комплекс|аналог|функциональн|органическ|музей/.test(evidence)
      ? 'logical_necessity'
      : 'analogy';
  if (authored.basis !== evidenceBasis) err(`${w}: basis ${authored.basis} disagrees with source evidence (${evidenceBasis}: ${sourceEvidence})`);
  if (authored.basis === 'sourced' && !/уровень категории/i.test(authored.basis_note || '')) err(`${w}: sourced basis requires explicit category-level caveat`);
  if (!authored.period.trim() || !authored.region.trim()) err(`${w}: period and region required`);
  if (authored.decision === 'candidate') {
    const years = [...authored.period.matchAll(/\b(1[0-9]{3}|20[0-9]{2})\b/g)].map(m => Number(m[1]));
    const around1230 = /1230/.test(authored.period);
    if (!around1230 && !(years.length >= 2 && Math.min(...years) <= 1230 && Math.max(...years) >= 1230)) err(`${w}: candidate period does not cover 1230`);
    if (!/новгород/i.test(authored.region)) err(`${w}: candidate region is not anchored to Novgorod`);
    if (authored.guard_id || r.guard_result !== 'passed') err(`${w}: candidate failed guard`);
    if (authored.game_base_ref) err(`${w}: new candidate has game_base_ref`);
    const name = normName(authored.archive_name), duplicateKind = weaponNames.get(name) || semanticDuplicate(authored.archive_name), duplicateArchive = archiveNames.has(name);
    const familyRoots = semanticRoots(authored.archive_name).filter(root => [...semanticAliases.values()].includes(root));
    const duplicateArchiveRoot = familyRoots.map(root => archiveSemanticRoots.get(root)).find(Boolean);
    if (duplicateKind || duplicateArchive || duplicateArchiveRoot) err(`${w}: normalized/semantic name duplicate (${duplicateKind || duplicateArchiveRoot || 'archive candidate'})`);
    archiveNames.add(name);
    familyRoots.forEach(root => archiveSemanticRoots.set(root, authored.derivation));
    if (r.dedup_result !== 'unique') err(`${w}: dedup result is ${r.dedup_result}`);
    const denyTerms = dn.filter(d => d.kind !== 'needs_check').flatMap(d => split(d.match_terms));
    if (denyTerms.some(term => term && termHits(authored.archive_name, term))) err(`${w}: candidate name matches weapon denylist`);
  } else if (authored.decision === 'rejected') {
    const ownerMismatch = !authored.guard_id && /^Owner mismatch:/i.test(authored.reason || '');
    if (!ownerMismatch && (!authored.guard_id || !denyIds.has(authored.guard_id))) err(`${w}: rejection lacks resolvable denylist guard or explicit owner-mismatch reason`);
    const guard = dn.find(x => x.deny_id === authored.guard_id);
    const sourceRef = authored.archive_ref.includes('costume_dataset_v1/') ? `costume:${archiveId}` : `master:mc:${archiveId}`;
    if (guard && !split(guard.source_refs).includes(sourceRef)) err(`${w}: denylist guard does not reference ${sourceRef}`);
    const expectedGuard = guard ? `rejected:denylist:${authored.guard_id}` : 'rejected:owner_mismatch';
    if (r.guard_result !== expectedGuard) err(`${w}: rejection guard result mismatch`);
    if (ownerMismatch) {
      const ownerMap = authored.archive_ref.includes('costume_dataset_v1/') ? kindsDoc.out_of_scope.costume : kindsDoc.out_of_scope.master;
      const ownerLabel = String(ownerMap[archiveId] || '').split(' (')[0];
      if (!ownerLabel || !authored.reason.includes(ownerLabel)) err(`${w}: owner mismatch does not resolve to out_of_scope mapping`);
    }
    const exactDup = weaponNames.get(normName(authored.archive_name));
    if (exactDup && !String(r.dedup_result).includes(exactDup)) err(`${w}: exact weapon duplicate ${exactDup} not recorded`);
    if (authored.game_base_ref) err(`${w}: rejected candidate has game_base_ref`);
  } else if (authored.decision === 'variant') {
    const targetId = authored.game_base_ref.match(/#([^#]+)$/)?.[1] || '';
    const target = kindsDoc.kinds.find(k => k.id === targetId);
    if (authored.match_type !== 'variant' || !target) err(`${w}: variant game_base_ref does not resolve to weapon kind`);
    const duplicate = weaponNames.get(normName(authored.archive_name));
    if (!duplicate || duplicate !== targetId) err(`${w}: variant exact name/alias identity does not resolve to ${targetId}`);
    if (r.guard_result !== 'passed' || r.dedup_result !== `variant:${targetId}`) err(`${w}: variant guard/dedup result mismatch`);
  } else if (authored.decision === 'entity') {
    const targetId = authored.game_base_ref.match(/#([^#]+)$/)?.[1] || '';
    const entity = wp.find(x => x.wp_id === targetId);
    if (!entity || entity.archive_ref !== authored.archive_ref || entity.archive_derivation !== authored.derivation || entity.archive_confidence !== authored.confidence || entity.archive_basis !== authored.basis || entity.archive_period !== authored.period || entity.archive_region !== authored.region) err(`${w}: archive entity is missing from weapons_armour.csv or provenance differs`);
    const expectedEntityGuard = authored.generation_policy === 'research_only' ? `restricted:denylist:${authored.guard_id}` : 'passed';
    if (r.guard_result !== expectedEntityGuard || r.dedup_result !== `entity:${targetId}`) err(`${w}: entity guard/dedup result mismatch`);
    if (authored.generation_policy !== (entity?.generation_policy || '') || authored.guard_id !== (entity?.generation_guard_id || '') || authored.anachronism_risk !== (entity?.anachronism_risk || '')) err(`${w}: entity generation restriction differs`);
    if (authored.guard_id && !denyIds.has(authored.guard_id)) err(`${w}: entity generation restriction lacks denylist entry`);
    if (entity?.generation_policy === 'research_only' && !split(entity.source_refs).includes(`master:mc:${authored.derivation}`)) err(`${w}: research-only entity lacks archive source ref`);
    if (authored.generation_policy === 'research_only' && r.guard_result !== `restricted:denylist:${authored.guard_id}`) err(`${w}: research-only guard is not represented as generation restriction`);
  } else if (authored.decision === 'needs_check') {
    if (authored.game_base_ref || authored.guard_id || r.guard_result !== 'needs_check' || r.dedup_result !== 'needs_check') err(`${w}: needs_check proposal must stay out of entity, denylist and dedup decisions`);
    if (!authored.reason || !/source|источник|свидетельств/i.test(authored.reason)) err(`${w}: needs_check proposal lacks item-specific source request`);
  } else if (authored.decision === 'routed') {
    if (!authored.target_group || !r.target_group || !String(r.dedup_result).startsWith(`routed:${authored.target_group}`)) err(`${w}: routed owner handoff lacks target_group`);
    if (authored.game_base_ref) err(`${w}: routed row unexpectedly claims weapon entity`);
    if (r.guard_result !== 'passed') err(`${w}: routed row has unexpected generation guard`);
  } else err(`${w}: invalid decision ${authored.decision}`);
}
for (const r of archiveLedger) if (!archiveManifest.records.some(x => x.archive_ref === r.archive_ref)) err(`archive ledger: unexpected ref ${r.archive_ref}`);

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

const checkerPath = path.join(NOV, 'game-base-v1', 'scripts', 'check-archive-ownership.mjs');
const writeReport = () => {
  Object.assign(stats, { weapons_armour: wp.length, status_access_rows: acc.length, equipment_entries: eq.length, equipment_profiles: eqIds.size, crosswalk: cw.length, denylist: dn.length, security: sec.length, events: ev.length, combat_roles: cl.length, refs: refStats });
  const report = { ok: errors.length === 0, stats, errors, warnings };
  fs.writeFileSync(path.join(ROOT, 'validation_report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ok: report.ok, stats, errors: errors.length, warnings: warnings.length }, null, 1));
  if (errors.length) { console.log(errors.slice(0, 60).join('\n')); process.exitCode = 1; }
};
import(pathToFileURL(checkerPath).href).then(({ checkArchiveOwnership }) => {
  const checker = checkArchiveOwnership(path.join(NOV, 'game-base-v1'));
  for (const message of checker.errors) err(`archive ownership checker: ${message}`);
  writeReport();
}).catch(error => {
  err(`archive ownership checker could not run: ${error.message}`);
  writeReport();
});
