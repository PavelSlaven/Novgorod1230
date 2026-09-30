// Build candidate tables for domains weapons_armour (items/) and military_security (military/).
// Inputs: authoring/*.json, authoring/master_military_snapshot.csv, repo TSV roles/occupations, costume dataset.
// Usage: node scripts/build.cjs
const fs = require('fs'), path = require('path');
const { writeCsv } = require('./csv.cjs');
const { ROOT, P, readJson, readCsv, readTsv, FREQ_W, COMBAT_ORDER, COMBAT_W } = require('./lib.cjs');

const kindsDoc = readJson(P.authoring('weapon_kinds.json'));
const access = readJson(P.authoring('access.json'));
const eqDoc = readJson(P.authoring('equipment_profiles.json'));
const mil = readJson(P.authoring('military.json'));
const deny = readJson(P.authoring('denylist.json'));
const archiveManifest = readJson(P.authoring('archive_inclusion_manifest.json'));
const master = readCsv(P.authoring('master_military_snapshot.csv'));
const needsCheck = readCsv(path.join(ROOT, '..', 'crafts-tools-processes', 'authoring', 'needs_check.csv'));
const needsCheckById = Object.fromEntries(needsCheck.map(row => [row.archive_id, row]));
const masterById = Object.fromEntries(master.map(r => [r.item_id, r]));
const costume = readCsv(path.join(P.costume, 'catalog_items.csv'));
const costumeById = Object.fromEntries(costume.map(r => [r.item_id, r]));
const roles = readTsv(P.roles);
const occs = readTsv(P.occs);
const REGION = 'region_novgorod_land';
const counts = {};

// Condition vocabularies per material family (code-assigned states). Basis: MASTER wear_and_condition of mapped rows
// + WK approved readiness claims (wet inspection, oil film, field maintenance). Vocabulary itself is reconstruction (C).
const CONDITION = {
  iron_edge: ['исправное', 'заточенное', 'затуплённое', 'с зазубринами', 'в поверхностной ржавчине', 'промасленное', 'погнутое', 'сломанное', 'чиненое'],
  iron_edge_shaft: ['исправное', 'затуплённый наконечник', 'наконечник в ржавчине', 'шатается на древке', 'треснувшее древко', 'сломанное древко', 'отсыревшее древко', 'чиненое'],
  wood_shaft: ['целое', 'сухое', 'отсыревшее', 'треснувшее', 'сломанное', 'покоробленное', 'чиненое'],
  impact: ['исправное', 'со сбитым навершием', 'расшатанная рукоять', 'в ржавчине', 'сломанное'],
  bow: ['снаряжённый (тетива натянута)', 'с снятой тетивой', 'сухой', 'отсыревший', 'с перетёртой тетивой', 'треснувший', 'сломанный'],
  mail: ['целая', 'с разрывом колец', 'с заплатой', 'в поверхностной ржавчине', 'промасленная', 'с потёртой окантовкой'],
  helmet: ['исправный', 'с вмятинами', 'с царапинами', 'в ржавчине', 'без подкладки', 'чиненый'],
  shield: ['целый', 'иссечённый', 'с облупившейся краской', 'с отставшей обтяжкой', 'расколотый', 'чиненый'],
  leather_textile: ['целое', 'потёртое', 'промокшее', 'порванное', 'чиненое', 'пересохшее']
};
const CONDITION_REFS = ['wk:claim:military-world-wet-equipment-benefits-from-inspection', 'wk:claim:military-world-field-maintenance-is-conditional', 'wk:claim:candidate-v9-thin-oil-film-temporarily-reduces-iron-rusting'];
const MARK_SLOT_RU = { owner_sign: 'знак собственности', maker_mark: 'клеймо или надпись мастера', decoration: 'украшение, инкрустация', repair_trace: 'след починки', wear_trace: 'след износа', paint: 'окраска' };

// --- rights classes for roles
const textToClass = Object.fromEntries(access.rights_classes.map(c => [c.weapon_rights_text, c.class]));
const roleClass = {}; const unmatched = [];
for (const r of roles) { const c = textToClass[r.weapon_rights.trim()]; if (!c) unmatched.push(r.role_id); roleClass[r.role_id] = c || 'R_variable'; }
if (unmatched.length) console.warn('roles with unmatched weapon_rights text:', unmatched);
const overrides = {}; for (const o of access.overrides) for (const t of o.tiers) overrides[o.role_id + '|' + t] = o;
function accessFor(roleId, tier) {
  const o = overrides[roleId + '|' + tier];
  if (o) return { level: o.level, override: o };
  return { level: access.matrix[roleClass[roleId]][tier] };
}

// --- items/weapon_status_access.csv (role x tier)
const accRows = [];
for (const r of roles) for (const tier of ['tool_weapon', 'common_war', 'elite_war']) {
  const a = accessFor(r.role_id, tier);
  accRows.push({ role_id: r.role_id, role_title: r.role_title, social_rank: r.social_rank, role_status: r.status, rights_class: roleClass[r.role_id], weapon_rights_text: r.weapon_rights, tier, access_level: a.level,
    basis: a.override ? 'override: ' + a.override.note : 'matrix ' + roleClass[r.role_id] + ' × ' + tier,
    source_refs: a.override ? a.override.source_refs : ['tsv:role:' + r.role_id + '#weapon_rights', 'statusrules:status_weapon'],
    confidence: a.override ? a.override.confidence : 'B', status: 'candidate' });
}

// --- items/weapons_armour.csv
const kinds = kindsDoc.kinds; const kindById = Object.fromEntries(kinds.map(k => [k.id, k]));
const archiveByWeaponId = Object.fromEntries(archiveManifest.records
  .filter(r => r.decision === 'entity')
  .map(r => [r.game_base_ref.match(/#([^#]+)$/)?.[1], r]));
const effTier = k => k.tier === 'component' ? effTier(kindById[k.parent]) : k.tier;
const listed = new Set(access.status_access_levels_listed);
const wpRows = kinds.map(k => {
  const tier = effTier(k);
  const statusAccess = roles.filter(r => listed.has(accessFor(r.role_id, tier).level)).map(r => r.role_id);
  const expected = roles.filter(r => accessFor(r.role_id, tier).level === 'expected').map(r => r.role_id);
  const wear = [...new Set(k.master.map(id => masterById[id] && masterById[id].wear_and_condition).filter(Boolean))];
  const legal = ['statusrules:status_weapon', 'items/weapon_status_access.csv#tier=' + tier];
  if (tier !== 'tool_weapon') legal.push('sqlite:law:L07');
  if (k.group === 'sword' || k.group === 'impact') legal.push('lit:russkaya_pravda_pp23');
  const refs = [...k.master.map(i => 'master:mc:' + i), ...k.costume.map(i => 'costume:' + i), ...k.v5.map(i => 'v5:' + i), ...k.wk.map(i => 'wk:' + i), ...k.lit.map(i => 'lit:' + i), ...k.other];
  return {
    wp_id: k.id, name_ru: k.name_ru, name_en: k.name_en, kind: k.kind, group: k.group, parent_wp_id: k.parent || '', tier: k.tier, effective_tier: tier,
    category_id: k.category_id, category_status: k.category_status, layer: 'universal_category+regional_permission', region_id: REGION,
    period_from: k.period[0], period_to: k.period[1], material: k.material, mass_rule: k.mass_rule,
    freq_general: k.freq_general, weight_general: FREQ_W[k.freq_general], freq_armed: k.freq_armed, weight_armed: FREQ_W[k.freq_armed], freq_basis: k.freq_basis,
    status_access: statusAccess, expected_for_roles: expected, legal_right_ref: legal,
    condition_family: k.condition_family, condition_states: CONDITION[k.condition_family], source_wear_notes: wear,
    mark_slots: k.mark_slots.map(s => s + ':' + MARK_SLOT_RU[s]), attestation: k.attestation,
    source_refs: refs, confidence: k.confidence, priority: k.priority, status: 'candidate', note: k.note || '',
    archive_ref: archiveByWeaponId[k.id]?.archive_ref || '',
    archive_refs: archiveByWeaponId[k.id]?.archive_ref || '',
    archive_basis: archiveByWeaponId[k.id]?.basis || '',
    archive_derivation: archiveByWeaponId[k.id]?.derivation || '',
    archive_confidence: archiveByWeaponId[k.id]?.confidence || '',
    archive_period: archiveByWeaponId[k.id]?.period || '',
    archive_region: archiveByWeaponId[k.id]?.region || '',
    generation_policy: archiveByWeaponId[k.id]?.generation_policy || k.generation_policy || '',
    generation_guard_id: archiveByWeaponId[k.id]?.guard_id || '',
    anachronism_risk: archiveByWeaponId[k.id]?.anachronism_risk || k.anachronism_risk || ''
  };
});

// --- items/weapon_source_crosswalk.csv (every MASTER military row and costume armour row -> wp | out_of_scope | denylist)
const mapM = {}, mapC = {};
for (const k of kinds) { k.master.forEach(i => (mapM[i] = mapM[i] || []).push(k.id)); k.costume.forEach(i => (mapC[i] = mapC[i] || []).push(k.id)); }
const denyM = {}; for (const d of deny.entries) for (const s of d.source_refs) { const m = s.match(/^master:mc:(.+)$/); if (m) denyM[m[1]] = d.id; }
const milFortM = {}; for (const s of mil.security) for (const r of s.source_refs) { const m = r.match(/^master:mc:(FOR\d+)$/); if (m) (milFortM[m[1]] = milFortM[m[1]] || []).push(s.id); }
const oos = kindsDoc.out_of_scope;
const cw = [];
for (const r of master) {
  const pending = archiveManifest.records.some(x => x.derivation === r.item_id && x.decision === 'needs_check');
  const target = mapM[r.item_id] ? { t: 'wp', v: mapM[r.item_id] } : milFortM[r.item_id] ? { t: 'military_security', v: milFortM[r.item_id] } : denyM[r.item_id] ? { t: 'denylist', v: [denyM[r.item_id]] } : oos.master[r.item_id] ? { t: 'out_of_scope', v: [oos.master[r.item_id]] } : pending ? { t: 'needs_check', v: [] } : { t: 'UNMAPPED', v: [] };
  cw.push({ source_kind: 'master_material_culture', source_id: r.item_id, source_name_ru: r.name_ru, source_category: r.category + '/' + r.subcategory, source_confidence: r.historical_confidence, period: r.period_from + '–' + r.period_to, mapping: target.t, target: target.v });
}
for (const r of costume.filter(r => r.category === 'armor_and_weapons' || ['AC010', 'HW015'].includes(r.item_id))) {
  const pending = archiveManifest.records.some(x => x.derivation === r.item_id && x.decision === 'needs_check');
  const target = mapC[r.item_id] ? { t: 'wp', v: mapC[r.item_id] } : oos.costume[r.item_id] ? { t: 'out_of_scope', v: [oos.costume[r.item_id]] } : pending ? { t: 'needs_check', v: [] } : { t: 'UNMAPPED', v: [] };
  cw.push({ source_kind: 'costume_catalog', source_id: r.item_id, source_name_ru: r.name_ru, source_category: r.category + '/' + r.subcategory, source_confidence: r.historical_confidence, period: '', mapping: target.t, target: target.v });
}
const needsCheckGaps = [];
if (needsCheckById.HNT0024) {
  const row = needsCheckById.HNT0024;
  needsCheckGaps.push({ queue_id: 'crafts-tools-processes/authoring/needs_check.csv#HNT0024', reason: row.note || row.block_pattern_ru, row_id: 'HNT0024' });
}
const admittedCrosswalk = cw.filter(row => !(row.source_id === 'HNT0024' && needsCheckById.HNT0024));
fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });

// --- items/weapon_denylist.csv
const denyRows = deny.entries.map(d => ({ deny_id: d.id, term_ru: d.term_ru, match_terms: d.match, kind: d.kind, reason: d.reason, source_refs: d.source_refs, confidence: d.confidence, status: 'candidate' }));

// --- items/archive_inclusion_ledger.csv (D39 existence candidates; never weapon kinds)
const normName = value => value.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
const exactWeaponNames = new Map();
for (const k of kinds) for (const name of [k.name_ru, k.name_en, ...(k.aliases || [])]) exactWeaponNames.set(normName(name), k.id);
const seenArchiveNames = new Map();
const archiveInclusionRows = archiveManifest.records.map(r => {
  const guard = r.guard_id ? deny.entries.find(d => d.id === r.guard_id) : null;
  const ownerMismatch = r.decision === 'rejected' && !guard && /^Owner mismatch:/i.test(r.reason || '');
  if (r.decision === 'rejected' && !guard && !ownerMismatch) throw new Error(`archive inclusion ${r.derivation}: rejection lacks denylist guard or owner-mismatch reason`);
  if (r.decision === 'candidate' && r.guard_id) throw new Error(`archive inclusion ${r.derivation}: candidate has guard ${r.guard_id}`);
  if (r.decision === 'variant' && (!r.game_base_ref || r.match_type !== 'variant')) throw new Error(`archive inclusion ${r.derivation}: variant must resolve through game_base_ref`);
  const normalizedName = normName(r.archive_name);
  const duplicateKind = exactWeaponNames.get(normalizedName);
  const duplicateArchive = seenArchiveNames.get(normalizedName);
  if (r.decision === 'candidate') {
    seenArchiveNames.set(normalizedName, r.derivation);
  }
  const targetId = r.game_base_ref.match(/#([^#]+)$/)?.[1] || '';
  const dedupResult = r.decision === 'needs_check' ? 'needs_check' : r.decision === 'variant' ? `variant:${targetId}` : r.decision === 'entity' ? `entity:${targetId}` : r.decision === 'routed' ? `routed:${r.target_group}` : duplicateKind ? `duplicate:${duplicateKind}` : duplicateArchive ? `duplicate:archive:${duplicateArchive}` : 'unique';
  return {
    archive_ref: r.archive_ref, archive_name: r.archive_name, selected_action: archiveManifest.selected_action,
    match_type: r.match_type, game_base_ref: r.game_base_ref,
    target_group: r.target_group || '', target_ref: r.target_ref || '',
    basis: r.basis, basis_note: r.basis_note || '', derivation: r.derivation, confidence: r.confidence, period: r.period, region: r.region,
    generation_policy: r.generation_policy || '', generation_guard_id: r.guard_id || '', anachronism_risk: r.anachronism_risk || '',
    guard_result: r.decision === 'needs_check' ? 'needs_check' : guard ? `${r.decision === 'entity' ? 'restricted' : 'rejected'}:denylist:${guard.id}` : ownerMismatch ? 'rejected:owner_mismatch' : 'passed', dedup_result: dedupResult,
    reason: guard && r.decision !== 'entity' ? `${guard.term_ru}: ${guard.reason}` : r.reason, decision: r.decision
  };
});

// --- items/weapon_equipment_profiles.csv
const eqRows = [];
for (const p of eqDoc.profiles) p.entries.forEach((e, i) => {
  const [wp, slot, req, basis, w] = e; const k = kindById[wp];
  eqRows.push({ profile_id: p.id, profile_name_ru: p.name_ru, region_id: REGION, role_id: p.role_id || '', occupation_id: p.occupation_id || '', context: p.context, base_role_ids: p.base_role_ids || [],
    entry_id: p.id + '__' + String(i + 1).padStart(2, '0'), wp_id: wp, category_id: k ? k.category_id : '', slot_key: slot, required: req, weight: req ? 8 : w, weight_basis: basis,
    source_refs: p.source_refs, confidence: p.confidence, status: 'candidate' });
});

// --- military/security.csv
const secRows = mil.security.map(s => ({ ms_id: s.id, unit_or_post_kind: s.kind, name_ru: s.name_ru, summary_ru: s.summary, region_id: REGION, pf_ids: s.pf_ids, roles: s.roles, occupations: s.occupations,
  equipment_profile_ref: s.equipment_profile_refs, duty_schedule_ref: s.duty_schedule_refs.map(d => 'tsv:occ:' + d), event_refs: s.event_refs, source_refs: s.source_refs, confidence: s.confidence, priority: s.priority, status: 'candidate', note: s.note || '' }));

// --- military/military_events.csv
const tl = readJson(P.timeline).timeline;
const tlBg = Object.fromEntries(tl.filter(e => e.phase === 'background').map(e => [e.event_id, e]));
const evRows = mil.events.map(e => { const t = e.event_ref ? tlBg[e.event_ref] : null;
  return { ms_event_id: e.id, year: e.year, kind: e.kind, name_ru: e.name_ru, event_ref: e.event_ref || '', timeline_title: t ? t.event_title : '', timeline_status: t ? t.status + '/' + t.confidence : '', chronicle_raw: t ? t.source_date.raw : '',
    units: e.units, consequences: e.consequences, source_refs: e.source_refs, confidence: e.confidence, status: 'candidate', note: e.note || '' }; });

// --- military/combat_likelihood_by_role.csv
const ovr = Object.fromEntries(mil.combat_overrides.map(o => [o.role_id, o]));
const clRows = roles.map(r => {
  const os = occs.filter(o => o.allowed_social_role_ids.split(';').map(s => s.trim()).includes(r.role_id));
  let cl = '', basis = '', refs = [], conf = '';
  if (os.length) {
    const best = os.reduce((a, o) => COMBAT_ORDER.indexOf(o.combat_likelihood) > COMBAT_ORDER.indexOf(a.combat_likelihood) ? o : a);
    cl = best.combat_likelihood; basis = 'максимум combat_likelihood занятий, допускающих роль: ' + best.occupation_id; refs = os.map(o => 'tsv:occ:' + o.occupation_id + '#combat_likelihood'); conf = 'B';
  } else if (ovr[r.role_id]) { const o = ovr[r.role_id]; cl = o.combat_likelihood; basis = 'авторская оценка: ' + o.note; refs = o.source_refs; conf = o.confidence; }
  else { cl = 'unknown'; basis = 'нет занятия и источника — пробел'; conf = ''; }
  return { role_id: r.role_id, role_title: r.role_title, social_rank: r.social_rank, combat_likelihood: cl, weight: COMBAT_W[cl] || '', weight_rule: 'very_low/low/medium/medium_high -> 1/2/4/8 (шкала 8/4/2/1 каталога)',
    occupations: os.map(o => o.occupation_id), violence_risk_of_occupations: [...new Set(os.map(o => o.violence_risk))], attitude_to_violence: r.attitude_to_violence, weapon_rights_class: roleClass[r.role_id],
    basis, source_refs: refs, confidence: conf, status: 'candidate' };
});

// --- write
const W = (rel, cols, rows) => { counts[rel] = writeCsv(path.join(ROOT, rel), cols, rows); };
W('items/weapons_armour.csv', Object.keys(wpRows[0]), wpRows);
W('items/weapon_status_access.csv', Object.keys(accRows[0]), accRows);
W('items/weapon_equipment_profiles.csv', Object.keys(eqRows[0]), eqRows);
W('items/weapon_source_crosswalk.csv', Object.keys(cw[0]), admittedCrosswalk);
W('reports/needs_check_gaps.csv', ['queue_id', 'reason', 'row_id'], needsCheckGaps);
W('items/weapon_denylist.csv', Object.keys(denyRows[0]), denyRows);
W('items/archive_inclusion_ledger.csv', Object.keys(archiveInclusionRows[0]), archiveInclusionRows);
W('military/security.csv', Object.keys(secRows[0]), secRows);
W('military/military_events.csv', Object.keys(evRows[0]), evRows);
W('military/combat_likelihood_by_role.csv', Object.keys(clRows[0]), clRows);
const tally = (rows, f) => rows.reduce((a, r) => (a[r[f]] = (a[r[f]] || 0) + 1, a), {});
const summary = { files: counts,
  weapons_armour: { by_kind: tally(wpRows, 'kind'), by_tier: tally(wpRows, 'effective_tier'), by_confidence: tally(wpRows, 'confidence'), by_priority: tally(wpRows, 'priority'), by_category_status: tally(wpRows, 'category_status') },
  archive_inclusion: { total: archiveInclusionRows.length, by_decision: tally(archiveInclusionRows, 'decision'), by_match_type: tally(archiveInclusionRows, 'match_type') },
  crosswalk: tally(admittedCrosswalk, 'mapping'), access_levels: tally(accRows, 'access_level'),
  security: { by_kind: tally(secRows, 'unit_or_post_kind'), by_confidence: tally(secRows, 'confidence') }, events: { by_kind: tally(evRows, 'kind'), by_confidence: tally(evRows, 'confidence') },
  combat_likelihood: tally(clRows, 'combat_likelihood') };
fs.writeFileSync(path.join(ROOT, 'counts.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 1));
require('node:child_process').execFileSync(process.execPath, [path.join(__dirname, '../../scripts/check-needs-check.mjs'), '--check'], { stdio: 'inherit' });
