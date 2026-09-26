// Acceptance checks for all places-binding domains. Writes reports/validation.json;
// exits 1 if any check on this group's own data fails. Checks on other groups' inputs are reported
// as "external" and do not fail the run.
import fs from 'node:fs';
import path from 'node:path';
import { REPO, PR98, GROUP, readJson, readCsv, readTsv, writeJson, split, SEASONS } from './lib.mjs';
import { loadTemplateRegistry, WK_PLACE_FIRST, V6_G4, SEEDS } from './build-place-families.mjs';
import { parseHouseholds } from './build-generation-limits.mjs';

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
  const pr98Present = fs.existsSync(path.join(PR98, 'data/world-catalogs/novgorod/m2c-natural/candidate.json'));
  const cw = readJson(P('scripts/crosswalk-rules.json'));
  for (const r of nb.filter((x) => x.binding_status !== 'gap')) {
    const files = [...r.binding_basis.matchAll(/(pr98:)?(data\/[\w\-./]+\.json)/g)];
    for (const m of files) {
      const abs = m[1] ? path.join(PR98, m[2]) : path.join(REPO, m[2]);
      if ((m[1] ? pr98Present : true) && !fs.existsSync(abs)) basisFail.push(`${r.node_ref}: missing file ${m[0]}`);
    }
    const pid = r.binding_basis.match(/profile_id=([\w]+)/)?.[1];
    if (r.node_level === 'G4' && !natIds.has(pid)) basisFail.push(`${r.node_ref}: profile ${pid} not in extract`);
    const fn = r.binding_basis.match(/g4_function_to_pf\.map\.(\w+)/)?.[1];
    if (r.node_level === 'G4' && !(fn in cw.node_binding.g4_function_to_pf.map)) basisFail.push(`${r.node_ref}: rule key ${fn} missing`);
  }
  check('node_binding', 'binding_basis_files_and_ids_exist', basisFail, { pr98_worktree_checked: pr98Present });
}

// ---- presence_rules
{
  const rule = readJson(P('presence/frequency_rule.json'));
  const pr = readCsv(P('presence/presence_rules.csv'));
  const cats = new Set(readCsv(P('categories/category_registry.csv')).map((r) => r.category_id));
  const nb = readCsv(P('places/node_binding.csv'));
  const nodes = new Set(nb.map((r) => r.node_ref.replace(/@\d+$/, '')));
  const f = [];
  const seen = new Set();
  for (const r of pr) {
    const c = rule.classes[r.frequency_class];
    if (!c) f.push(`${r.pr_id}: class ${r.frequency_class}`);
    else if (+r.probability_ppm !== Math.round((1000000 * c.weight) / 8) || +r.probability_ppm !== c.probability_ppm) f.push(`${r.pr_id}: ppm ${r.probability_ppm} != rule`);
    if (!cats.has(r.category_ref)) f.push(`${r.pr_id}: category ${r.category_ref}`);
    const ok = { place_family: pfSet.has(r.scope_ref), g4: nodes.has(r.scope_ref), g5: nodes.has(r.scope_ref), region: r.scope_ref === ex.region_id,
      landscape_template: reg.get(r.scope_ref)?.kind === 'landscape', place_template: reg.get(r.scope_ref)?.kind === 'place', scene_template: ex.scene_templates.some((s) => s.id === r.scope_ref), container_template: /^container_tpl_/.test(r.scope_ref) }[r.scope_kind];
    if (!ok) f.push(`${r.pr_id}: scope ${r.scope_kind}:${r.scope_ref}`);
    if (!(Number.isInteger(+r.count_limit) && +r.count_limit >= 1)) f.push(`${r.pr_id}: count_limit`);
    const s = split(r.allowed_seasons);
    if (!s.length || s.some((x) => x !== 'all' && !SEASONS.includes(x))) f.push(`${r.pr_id}: seasons ${r.allowed_seasons}`);
    if (!rule.refresh_rule.values.includes(r.refresh_class)) f.push(`${r.pr_id}: refresh ${r.refresh_class}`);
    const k = [r.scope_kind, r.scope_ref, r.region_id, r.category_ref].join('|');
    if (seen.has(k)) f.push(`${r.pr_id}: duplicate ${k}`); seen.add(k);
  }
  check('presence_rules', 'rows_resolve_and_follow_rule', f, { rows: pr.length });
  const rr = readJson(P('reports/presence-rules-report.json'));
  check('presence_rules', 'input_pool_rows_rejected (external)', Array(rr.rejected_rows).fill('x'), { reasons: rr.reject_reasons, by_file: rr.rejected_by_file }, true);
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
