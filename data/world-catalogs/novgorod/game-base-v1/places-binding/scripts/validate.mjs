// Acceptance checks for all places-binding domains. Writes reports/validation.json;
// exits 1 if any check on this group's own data fails. Checks on other groups' inputs are reported
// as "external" and do not fail the run.
import fs from 'node:fs';
import path from 'node:path';
import { REPO, GROUP, readJson, readCsv, readTsv, writeJson, split, SEASONS } from './lib.mjs';
import { loadTemplateRegistry, WK_PLACE_FIRST, V6_G4, SEEDS } from './build-place-families.mjs';
import { parseHouseholds } from './build-generation-limits.mjs';
import { build as buildPresenceRules } from './build-presence-rules.mjs';

const checks = [];
const check = (domain, name, failures, extra = {}, external = false) => checks.push({ domain, name, pass: failures.length === 0, failures: failures.length, sample: failures.slice(0, 15), external, ...extra });
const P = (...p) => path.join(GROUP, ...p);

const wk = readJson(WK_PLACE_FIRST);
const fam = readCsv(P('places/place_families.csv'));
const reg = loadTemplateRegistry();
const routes = new Set(readJson(SEEDS.route).map((r) => r.id));
const pfSet = new Set(fam.map((f) => f.pf_id));
const ex = readJson(P('inputs/pr98-extract.json'));

// ---- place_families
{
  const ids = fam.map((f) => f.pf_id.slice(3));
  const want = wk.environment_families.map((f) => f.id);
  check('place_families', 'wk_44_families_exactly_once', [
    ...want.filter((w) => ids.filter((x) => x === w).length !== 1).map((w) => `missing_or_duplicate ${w}`),
    ...ids.filter((x) => !want.includes(x)).map((x) => `unknown ${x}`),
  ], { wk_families: want.length, rows: fam.length });
  check('place_families', 'landscape_or_place_ref_or_explicit_not_applicable', fam.filter((f) => !f.landscape_template_refs && !f.place_template_refs && !f.templates_not_applicable).map((f) => f.pf_id));
  const bad = [];
  for (const f of fam) {
    for (const [col, kind] of [['landscape_template_refs', 'landscape'], ['land_use_template_refs', 'land_use'], ['place_template_refs', 'place'], ['water_body_template_refs', 'water_body']])
      for (const r of split(f[col])) if (reg.get(r)?.kind !== kind) bad.push(`${f.pf_id}.${col}: ${r}`);
    for (const r of split(f.route_template_refs)) if (!routes.has(r)) bad.push(`${f.pf_id}.route: ${r}`);
    for (const c of split(f.composes_with)) if (!pfSet.has(c)) bad.push(`${f.pf_id}.composes_with: ${c}`);
  }
  check('place_families', 'template_refs_resolve_in_seed_or_candidate', bad);
  const slotGaps = fam.flatMap((f) => ['facet_ground', 'facet_use_people', 'facet_senses_traces', 'facet_risks_upkeep'].filter((s) => !f[s]).map((s) => `${f.pf_id}.${s}`));
  check('place_families', 'facet_slots_filled (info)', [], { empty_slots: slotGaps });
  const layers = readJson(P('scripts/pf-authoring.json')).layer_vocabulary.layers;
  check('place_families', 'layers_in_m2c_vocabulary', fam.flatMap((f) => split(f.layers_applicable).filter((l) => !layers.includes(l)).map((l) => `${f.pf_id}: ${l}`)));

  const g4types = new Set(readTsv(V6_G4).map((r) => r.g4_location_type));
  const g4c = readCsv(P('places/crosswalk_v6_g4_location_types.csv'));
  check('place_families', 'v6_198_g4_location_types_covered', [
    ...[...g4types].filter((t) => !g4c.some((r) => r.g4_location_type === t)).map((t) => `missing ${t}`),
    ...g4c.filter((r) => r.mapping_status === 'unmapped' || (r.mapping_status === 'mapped' && !r.pf_ids)).map((r) => `unmapped ${r.g4_location_type}`),
    ...g4c.flatMap((r) => split(r.pf_ids).filter((p) => !pfSet.has(p)).map((p) => `${r.g4_location_type}: bad pf ${p}`)),
  ], { v6_types: g4types.size, mapped: g4c.filter((r) => r.mapping_status === 'mapped').length, not_applicable: g4c.filter((r) => r.mapping_status === 'not_applicable').length });
  const sc = readCsv(P('places/crosswalk_scene_templates.csv'));
  check('place_families', 'spatial_v3_17_scene_templates_covered', [
    ...ex.scene_templates.filter((s) => !sc.some((r) => r.scene_template_ref === `${s.id}@${s.version}` && (r.pf_ids || r.mapping_status === 'not_applicable'))).map((s) => s.id),
    ...sc.flatMap((r) => split(r.pf_ids).filter((p) => !pfSet.has(p)).map((p) => `${r.scene_template_ref}: bad pf ${p}`)),
  ], { scene_templates: ex.scene_templates.length });
  const mc = readCsv(P('places/crosswalk_master_location_archetypes.csv'));
  check('place_families', 'master_location_archetypes_covered', mc.filter((r) => r.mapping_status === 'unmapped').map((r) => r.location_archetype).concat(mc.flatMap((r) => split(r.pf_ids).filter((p) => !pfSet.has(p)))), { archetypes: mc.length });
}

// ---- node_binding
{
  const nb = readCsv(P('places/node_binding.csv'));
  const count = (id) => nb.filter((r) => r.node_ref.replace(/@\d+$/, '') === id).length;
  const want = [...ex.g4nodes.map((n) => n.id), ...ex.g5.map((n) => n.g5_id)];
  check('node_binding', 'one_row_per_v17_g4_g5', want.filter((id) => count(id) !== 1).concat(nb.filter((r) => !want.includes(r.node_ref.replace(/@\d+$/, ''))).map((r) => 'extra ' + r.node_ref)), { g4: ex.g4nodes.length, g5: ex.g5.length, rows: nb.length });
  check('node_binding', 'pf_exists_or_typed_gap', nb.filter((r) => (r.pf_id && !pfSet.has(r.pf_id)) || (!r.pf_id && r.binding_status !== 'gap')).map((r) => r.node_ref), { gaps: nb.filter((r) => r.binding_status === 'gap').map((r) => r.node_ref) });
  const bad = [];
  for (const r of nb) {
    if (r.landscape_template_id && reg.get(r.landscape_template_id)?.kind !== 'landscape') bad.push(`${r.node_ref} landscape ${r.landscape_template_id}`);
    if (r.water_body_template_id && reg.get(r.water_body_template_id)?.kind !== 'water_body') bad.push(`${r.node_ref} water ${r.water_body_template_id}`);
    for (const p of split(r.pf_secondary)) if (!pfSet.has(p)) bad.push(`${r.node_ref} secondary ${p}`);
  }
  check('node_binding', 'template_refs_resolve', bad);
  // binding_basis files and ids exist.
  const basisFail = [];
  const natIds = new Set(ex.g4.map((g) => g.profile_id));
  const cw = readJson(P('scripts/crosswalk-rules.json'));
  for (const r of nb.filter((x) => x.binding_status !== 'gap')) {
    const files = [...r.binding_basis.matchAll(/(pr98:)?(data\/[\w\-./]+\.json)/g)];
    for (const m of files) {
      if (!m[1] && !fs.existsSync(path.join(REPO, m[2]))) basisFail.push(`${r.node_ref}: missing file ${m[0]}`);
    }
    const pid = r.binding_basis.match(/profile_id=([\w]+)/)?.[1];
    if (r.node_level === 'G4' && !natIds.has(pid)) basisFail.push(`${r.node_ref}: profile ${pid} not in extract`);
    const fn = r.binding_basis.match(/g4_function_to_pf\.map\.(\w+)/)?.[1];
    if (r.node_level === 'G4' && !(fn in cw.node_binding.g4_function_to_pf.map)) basisFail.push(`${r.node_ref}: rule key ${fn} missing`);
  }
  check('node_binding', 'binding_basis_files_and_ids_exist', basisFail);
}

// ---- presence_rules
{
  const rule = readJson(P('presence/frequency_rule.json'));
  const pr = readCsv(P('presence/presence_rules.csv'));
  const rebuilt = buildPresenceRules({ write: false }).rows;
  const columns = Object.keys(pr[0]);
  const values = (row) => columns.map((column) => Array.isArray(row[column]) ? row[column].join(';') : String(row[column] ?? ''));
  check('presence_rules', 'matches_current_input_pools', [
    ...(pr.length === rebuilt.length ? [] : [`rows ${pr.length} != rebuilt ${rebuilt.length}`]),
    ...pr.flatMap((row, i) => rebuilt[i] && JSON.stringify(values(row)) !== JSON.stringify(values(rebuilt[i])) ? [`row ${i + 2}: ${row.pr_id}`] : []),
  ], { rows: pr.length, rebuilt_rows: rebuilt.length });
  const cats = new Set(readCsv(P('categories/category_registry.csv')).map((r) => r.category_id));
  const nb = readCsv(P('places/node_binding.csv'));
  const nodes = new Set(nb.map((r) => r.node_ref.replace(/@\d+$/, '')));
  const occupations = new Set(readTsv(path.join(REPO, 'data/novgorod-region/novgorod_occupations_v1.tsv')).map((r) => r.occupation_id));
  const roles = new Set(readTsv(path.join(REPO, 'data/novgorod-region/novgorod_social_roles_v1.tsv')).map((r) => r.role_id));
  const itemSources = readCsv(P('../items-household-personal/items/item_place_frequency.csv'));
  const peopleSources = readCsv(P('presence/people_presence_authoring.csv'));
  const itemConditions = ['entry_visible_if', 'search_only_if', 'entry_exposed_weight', 'search_concealed_weight', 'placement_basis_ref', 'placement_owner_ref', 'wild_arrival_cause_required'];
  const f = [];
  const seen = new Set();
  for (const r of pr) {
    const c = rule.classes[r.frequency_class];
    if (!c) f.push(`${r.pr_id}: class ${r.frequency_class}`);
    else if (+r.probability_ppm !== Math.round((1000000 * c.weight) / 8) || +r.probability_ppm !== c.probability_ppm) f.push(`${r.pr_id}: ppm ${r.probability_ppm} != rule`);
    if (r.subject_kind === 'category') { if (!cats.has(r.category_ref) || r.subject_ref !== r.category_ref) f.push(`${r.pr_id}: category ${r.category_ref}`); }
    else if (!({ occupation: occupations, social_role: roles })[r.subject_kind]?.has(r.subject_ref) || r.category_ref) f.push(`${r.pr_id}: subject ${r.subject_kind}:${r.subject_ref}`);
    const ok = { place_family: pfSet.has(r.scope_ref), g4: nodes.has(r.scope_ref), g5: nodes.has(r.scope_ref), region: r.scope_ref === ex.region_id,
      landscape_template: reg.get(r.scope_ref)?.kind === 'landscape', place_template: reg.get(r.scope_ref)?.kind === 'place', scene_template: ex.scene_templates.some((s) => s.id === r.scope_ref), container_template: /^container_tpl_/.test(r.scope_ref) }[r.scope_kind];
    if (!ok) f.push(`${r.pr_id}: scope ${r.scope_kind}:${r.scope_ref}`);
    if (!(Number.isInteger(+r.count_limit) && +r.count_limit >= 1)) f.push(`${r.pr_id}: count_limit`);
    if (!['pool_row', 'pool_count_limit_rule', 'default_minimum_1', 'people_authoring'].includes(r.count_limit_basis)) f.push(`${r.pr_id}: count_limit_basis`);
    const s = split(r.allowed_seasons);
    if (!s.length || s.some((x) => x !== 'all' && !SEASONS.includes(x))) f.push(`${r.pr_id}: seasons ${r.allowed_seasons}`);
    if (!['all', 'morning', 'day', 'evening', 'night'].includes(r.allowed_times)) f.push(`${r.pr_id}: time ${r.allowed_times}`);
    if (r.subject_kind !== 'category' && (!r.guards || r.status !== 'candidate' || !r.source_refs)) f.push(`${r.pr_id}: people provenance/guards/status`);
    if (r.subject_kind !== 'category') {
      const source = peopleSources[Number(r.source_pool.match(/people_presence_authoring\.csv#row(\d+)$/)?.[1]) - 2];
      if (!source || r.subject_kind !== source.subject_kind || r.subject_ref !== source.subject_ref || r.guards !== source.guards || !split(source.allowed_seasons).includes(r.allowed_seasons) || !split(source.allowed_times).includes(r.allowed_times)) f.push(`${r.pr_id}: people subject/season/time/guards differ from authoring`);
    }
    for (const col of itemConditions) if (!Object.hasOwn(r, col)) f.push(`${r.pr_id}: missing ${col} column`);
    const sources = split(r.source_pool);
    const itemRows = sources.filter((s) => s.includes('/items-household-personal/items/item_place_frequency.csv#row'));
    if (itemRows.length) {
      if (itemRows.length !== sources.length || r.subject_kind !== 'category') f.push(`${r.pr_id}: mixed item/category sources`);
      for (const source of itemRows) {
        const row = itemSources[Number(source.match(/#row(\d+)$/)?.[1]) - 2];
        if (!row) { f.push(`${r.pr_id}: unresolved item source ${source}`); continue; }
        for (const col of itemConditions) if (r[col] !== row[col]) f.push(`${r.pr_id}: ${col} differs from ${source}`);
        if (!row.entry_visible_if || !row.search_only_if) f.push(`${r.pr_id}: item discovery conditions empty`);
        if (row.pf_class === 'wild' && r.wild_arrival_cause_required !== 'prior_visitor_loss_or_discard') f.push(`${r.pr_id}: wild item arrival cause missing`);
      }
    } else if (itemConditions.some((col) => r[col])) f.push(`${r.pr_id}: non-item discovery conditions`);
    if (!rule.refresh_rule.values.includes(r.refresh_class)) f.push(`${r.pr_id}: refresh ${r.refresh_class}`);
    const k = [r.scope_kind, r.scope_ref, r.region_id, r.subject_kind, r.subject_ref, r.allowed_seasons, r.allowed_times, ...itemConditions.map((col) => r[col])].join('|');
    if (seen.has(k)) f.push(`${r.pr_id}: duplicate ${k}`); seen.add(k);
  }
  check('presence_rules', 'rows_resolve_and_follow_rule', f, { rows: pr.length });
  const people = pr.filter((r) => r.subject_kind !== 'category');
  const expectedPf = new Set(nb.map((r) => r.pf_id).filter(Boolean));
  check('presence_rules', 'people_cover_16_bound_pf', [
    ...[...expectedPf].filter((id) => !people.some((r) => r.scope_ref === id)).map((id) => `missing ${id}`),
    ...(expectedPf.size === 16 ? [] : [`expected 16 PF, got ${expectedPf.size}`]),
    ...(nb.filter((r) => r.node_level === 'G4').length === 32 && nb.filter((r) => r.node_level === 'G5').length === 195 ? [] : ['expected 32 G4 / 195 G5']),
    ...(people.length === 69 ? [] : [`people rules ${people.length} != 69`]),
  ], { people_rules: people.length, place_families: expectedPf.size, g4: nb.filter((r) => r.node_level === 'G4').length, g5: nb.filter((r) => r.node_level === 'G5').length });
  const crosswalks = [
    ['livestock', '../fauna-fish-invertebrates-livestock/fauna/rpgr_pf_crosswalk.csv', ['rule_ref', 'pf_id'], (r) => Boolean(r.no_source)],
    ['buildings', '../buildings-interiors-containers/buildings/sf_pf_crosswalk.csv', ['sf_id', 'pf_id'], (r) => Boolean(r.no_source)],
    ['food', '../food-drink/food/household_type_pf_crosswalk.csv', ['household_type', 'pf_id'], (r) => r.basis === 'no_source'],
    ['tools', '../crafts-tools-processes/craft_tools_gear/occupation_pf_crosswalk.csv', ['occupation_id', 'pf_id'], (r) => r.basis === 'no_source'],
    ['weapons', '../items-weapons-armour/items/role_tier_pf_crosswalk.csv', ['role_id', 'tier', 'pf_id'], (r) => r.basis === 'no_source'],
  ];
  const crosswalkFailures = [];
  const crosswalkCounts = {};
  for (const [name, file, keys, isGap] of crosswalks) {
    const rows = readCsv(P(file));
    const linkedRows = rows.filter((r) => !isGap(r));
    const gapRows = rows.filter(isGap);
    const linkedPf = new Set(linkedRows.map((r) => r.pf_id).filter(Boolean));
    const gapPf = new Set(gapRows.map((r) => r.pf_id).filter(Boolean));
    const accountedPf = new Set([...linkedPf, ...gapPf]);
    const rowKeys = rows.map((r) => keys.map((key) => r[key]).join('|'));
    for (const row of linkedRows) {
      for (const key of keys) if (!row[key]) crosswalkFailures.push(`${name}: linked row missing ${key}`);
    }
    crosswalkCounts[name] = { rows: rows.length, linked_rows: linkedRows.length, no_source_rows: gapRows.length, linked_place_families: linkedPf.size, no_source_place_families: gapPf.size };
    for (const id of expectedPf) if (!accountedPf.has(id)) crosswalkFailures.push(`${name}: unaccounted ${id}`);
    for (const id of accountedPf) if (!pfSet.has(id)) crosswalkFailures.push(`${name}: unknown ${id}`);
    for (const id of linkedPf) if (gapPf.has(id)) crosswalkFailures.push(`${name}: ${id} is both linked and no_source`);
    if (new Set(rowKeys).size !== rowKeys.length) crosswalkFailures.push(`${name}: duplicate key`);
    if (rows.some((r) => r.status !== 'candidate')) crosswalkFailures.push(`${name}: non-candidate status`);
  }
  check('presence_rules', 'c002_crosswalks_account_for_16_bound_pf', crosswalkFailures,
    { place_families: expectedPf.size, rows: crosswalkCounts });
  const rr = readJson(P('reports/presence-rules-report.json'));
  check('presence_rules', 'input_pool_rows_rejected (external)', Array(rr.rejected_rows).fill('x'), { reasons: rr.reject_reasons, by_file: rr.rejected_by_file }, true);
}

// ---- materialization_slot_rules
{
  const slots = readCsv(P('slots/materialization_slot_rules.csv'));
  const candidates = readCsv(P('slots/slot_candidates.csv'));
  const policy = readJson(P('slots/materialization_rules.json'));
  const gaps = readCsv(P('slots/no_required_slots.csv'));
  const boundPf = new Set(readCsv(P('places/node_binding.csv')).map((r) => r.pf_id).filter(Boolean));
  const cats = new Set(readCsv(P('categories/category_registry.csv')).map((r) => r.category_id));
  const buildings = new Map(readCsv(P('../buildings-interiors-containers/buildings/building_types.csv')).map((r) => [r.bt_id, r]));
  const transport = new Set(readCsv(P('../transport-health-recreation/transport_travel/transport_entities.csv')).map((r) => r.tr_id));
  const presence = readCsv(P('presence/presence_rules.csv'));
  const f = [];
  const ids = new Set();
  const covered = new Set();
  const rules = new Map(policy.rules.map((r) => [r.id, r]));
  if (policy.application_scope !== 'once_per_g4_complex' || policy.g5_policy !== 'code_selects_applicable_g5_within_g4' || policy.pf_secondary_policy !== 'no_automatic_required_slot_from_secondary_pf') f.push('application scope/G5/secondary PF policy');
  if (rules.size !== policy.rules.length) f.push('duplicate rule id');
  for (const rule of policy.rules) if (!/^MSR-C003-/.test(rule.id) || !rule.text || !rule.basis || !['A', 'B', 'C'].includes(rule.confidence)) f.push(`invalid rule ${rule.id}`);
  for (const r of slots) {
    if (ids.has(r.slot_id) || !r.slot_id) f.push(`duplicate/empty slot_id ${r.slot_id}`);
    ids.add(r.slot_id);
    if (!boundPf.has(r.pf_id)) f.push(`${r.slot_id}: unbound PF ${r.pf_id}`);
    covered.add(r.pf_id);
    if (!['anchor', 'item', 'container', 'building', 'npc'].includes(r.slot_kind) || !['true', 'false'].includes(r.required)) f.push(`${r.slot_id}: kind/required`);
    if (!/^\d+$/.test(r.count_min) || !/^\d+$/.test(r.count_max) || +r.count_min > +r.count_max || (r.required === 'true' && +r.count_min < 1) || (r.required === 'false' && +r.count_min !== 0)) f.push(`${r.slot_id}: count/required`);
    if (!['all', 'winter'].includes(r.applicability) || (r.pf_id === 'pf_winter_ice_crossing') !== (r.applicability === 'winter')) f.push(`${r.slot_id}: applicability`);
    if (r.status !== 'candidate' || !['A', 'B', 'C'].includes(r.confidence) || !r.source_refs || !rules.has(r.rule_ref)) f.push(`${r.slot_id}: provenance/status/rule`);
    for (const c of split(r.candidate_category_refs)) if (!cats.has(c)) f.push(`${r.slot_id}: unknown category ${c}`);
    if (r.slot_kind === 'building' && fam.find((x) => x.pf_id === r.pf_id)?.pf_kind?.startsWith('natural')) f.push(`${r.slot_id}: natural building forbidden`);
    if (r.presence_relation !== 'identity_requirement_not_frequency' || split(r.candidate_category_refs).some((c) => presence.some((p) => p.scope_ref === r.pf_id && p.category_ref === c))) f.push(`${r.slot_id}: presence relation`);
  }
  const candidateKeys = new Set();
  for (const c of candidates) {
    const slot = slots.find((r) => r.slot_id === c.slot_id);
    const [kind, ref] = c.candidate_record_ref.split(':');
    const key = `${c.slot_id}|${c.candidate_record_ref}`;
    if (candidateKeys.has(key)) f.push(`duplicate candidate ${key}`);
    candidateKeys.add(key);
    if (!slot || !Number.isSafeInteger(+c.weight) || +c.weight < 1 || !c.source_refs || c.status !== 'candidate' || !['A', 'B', 'C'].includes(c.confidence)) f.push(`candidate provenance/weight/slot ${key}`);
    if (!(kind === 'building' && buildings.has(ref) || kind === 'transport' && transport.has(ref) || kind === 'route' && routes.has(ref))) f.push(`unresolved candidate ${key}`);
    if (slot && (slot.slot_kind === 'building' && kind !== 'building' || slot.slot_kind === 'anchor' && !['route', 'transport'].includes(kind))) f.push(`candidate kind ${key}`);
    if (kind === 'building' && slot && (!buildings.get(ref)?.pf_ids.split('|').includes(slot.pf_id.slice(3)) || !buildings.get(ref)?.source_refs)) f.push(`building owner/source ${key}`);
    if (slot?.slot_id === 'msr_ferry_crossing' && c.candidate_record_ref !== 'transport:trv_011') f.push(`unsupported ferry candidate ${key}`);
  }
  for (const r of slots) if (!candidates.some((c) => c.slot_id === r.slot_id)) f.push(`${r.slot_id}: no candidates`);
  for (const rule of rules.keys()) if (!slots.some((r) => r.rule_ref === rule)) f.push(`unused rule ${rule}`);
  for (const r of gaps) {
    if (!boundPf.has(r.pf_id) || covered.has(r.pf_id) || !r.reason || !r.source_refs || r.status !== 'candidate' || !['A', 'B', 'C'].includes(r.confidence)) f.push(`${r.pf_id}: invalid no-required-slot record`);
    covered.add(r.pf_id);
  }
  for (const pf of boundPf) if (!covered.has(pf)) f.push(`uncovered ${pf}`);
  if (boundPf.size !== 16 || slots.length !== 5 || gaps.length !== 12 || covered.size !== 16) f.push(`coverage: ${boundPf.size} PF, ${slots.length} slots, ${gaps.length} gaps, ${covered.size} covered`);
  check('materialization_slot_rules', 'c003_required_slots_and_explicit_gaps', f, { slots: slots.length, candidates: candidates.length, gaps: gaps.length, place_families: covered.size });
}

// ---- category_registry
{
  const r = readJson(P('reports/category-registry-report.json'));
  const own = readCsv(P('categories/place_family_categories.csv'));
  const ownIds = new Set(own.map((x) => x.category_id));
  const ownFail = [];
  const codes = new Set();
  for (const x of own) { if (codes.has(x.stable_code)) ownFail.push('dup ' + x.stable_code); codes.add(x.stable_code); if (x.parent_category_id && !ownIds.has(x.parent_category_id)) ownFail.push('parent ' + x.category_id); }
  const ownProblems = r.problems.filter((p) => (p.category_id && ownIds.has(p.category_id)) || (p.category_ids && p.category_ids.some((c) => ownIds.has(c))));
  check('category_registry', 'own_place_family_categories_valid', ownFail.concat(ownProblems.map((p) => p.kind + ' ' + (p.category_id ?? p.stable_code))), { rows: own.length });
  const ext = r.problems.filter((p) => !ownProblems.includes(p));
  check('category_registry', 'collected_registry_unique_parents_no_cycles (external)', ext.map((p) => p.kind), { problems_by_kind: r.problems_by_kind, registry_rows: r.registry_rows }, true);
  check('category_registry', 'pool_category_references_resolve (external)', Array(r.unresolved_references).fill('x'), { unresolved_by_file: r.unresolved_by_file }, true);
}

// ---- place_generation_limits
{
  const L = readCsv(P('limits/place_generation_limits.csv'));
  const g4 = new Set(ex.g4nodes.map((n) => n.id));
  const f = [];
  for (const r of L) {
    for (const [a, b] of [['households_min', 'households_max'], ['residents_min', 'residents_max'], ['npc_present_min', 'npc_present_max'], ['g4_zones_min', 'g4_zones_max']])
      if (r[a] !== '' && r[b] !== '' && +r[a] > +r[b]) f.push(`${r.pgl_id}: ${a} > ${b}`);
    const ok = { place_template: reg.get(r.scope_ref)?.kind === 'place', place_family: pfSet.has(r.scope_ref), g4: g4.has(r.scope_ref) }[r.scope_kind];
    if (!ok) f.push(`${r.pgl_id}: scope ${r.scope_ref}`);
    if (r.scope_kind === 'place_template') {
      const h = parseHouseholds(r.household_estimate_text);
      if ((h?.min ?? '') + '' !== r.households_min || (h?.max ?? '') + '' !== r.households_max) f.push(`${r.pgl_id}: households not reproducible by rule`);
    }
  }
  check('place_generation_limits', 'min_le_max_scope_exists_rule_reproducible', f, { rows: L.length });
}

// ---- category_parameters
{
  const cp = readCsv(P('parameters/category_parameters.csv'));
  const defs = new Set(readCsv(P('parameters/parameter_definitions.csv')).map((r) => r.parameter_key));
  const cats = new Set(readCsv(P('categories/category_registry.csv')).map((r) => r.category_id));
  const f = [];
  for (const r of cp) {
    if (!cats.has(r.category_id)) f.push(`${r.cp_id}: category`);
    if (!defs.has(r.parameter_key)) f.push(`${r.cp_id}: parameter`);
    if (!r.assignment_rule || !r.rule_basis) f.push(`${r.cp_id}: rule/basis`);
    if (r.value_is_sourced !== 'true' && /^\d+(\.\d+)?$/.test(r.allowed_values_or_range)) f.push(`${r.cp_id}: number without source`);
  }
  const byCat = cp.reduce((a, r) => ((a[r.category_id] ??= new Set()).add(r.parameter_key), a), {});
  for (const [c, ks] of Object.entries(byCat)) for (const k of ['mass_g', 'primary_material', 'value_band']) if (!ks.has(k)) f.push(`${c}: missing ${k}`);
  check('category_parameters', 'leaf_required_params_rules_refs', f, { rows: cp.length, categories: Object.keys(byCat).length });
}

const own = checks.filter((c) => !c.external);
const out = { generated_by: 'scripts/validate.mjs', own_checks_passed: own.filter((c) => c.pass).length, own_checks_total: own.length, checks };
writeJson(P('reports/validation.json'), out);
for (const c of checks) console.log(`${c.pass ? 'PASS' : c.external ? 'INFO' : 'FAIL'} ${c.domain} / ${c.name}${c.failures ? ` (${c.failures})` : ''}`);
if (own.some((c) => !c.pass)) process.exit(1);
